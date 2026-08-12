// ---------- spelsimulatie ----------
// Duizenden potjes doorrekenen op de HUIDIGE indeling (layout + tileRotation) om
// speelduur en eerlijkheid per startpositie te meten. Regels: 2xD6 = exact aantal
// stappen, geen U-turn, bezette vakjes blokkeren; uitzondering: land je exact op je
// eigen opdrachtvakje met minder dan de volledige worp, dan stop je daar (rest vervalt).
// Elke speler heeft een eigen geschud stapeltje opdrachten 1-9 (labels 2.1..2.9);
// wie als eerste 6 opdrachten voltooit wint.
//
// Er wordt DOORGESPEELD na de winnaar, om ook plaats 2 en 3 uit te spelen. Wie binnen
// is stopt met spelen en verdwijnt van het bord (blokkeert dus ook niemand meer). Zodra
// de nummer 3 binnen is stopt het potje: de laatste speler is dan automatisch vierde en
// er valt niets meer te beslissen.
//
// Cellen worden als vlakke index (R*W+C) gebruikt en de buren-adjacency wordt één
// keer per run vooraf berekend (niet per stap opnieuw) — dat is waar bij duizenden
// potjes de tijd in gaat zitten, dus dat blijft hier bewust plat en allocatie-arm.
const SIM_MAX_TURNS = 900;
const SIM_QUESTS_TO_WIN = 6;
const SIM_START_LABELS = ['3.1', '3.2', '3.3', '3.4'];
// zoveel spelers moeten binnen zijn voordat het potje klaar is; de rest ligt daarmee vast.
// Bij 4 spelers dus 3. Ook bruikbaar voor de kleinere bezettingen van "stap voor stap":
// met 2 spelers is de nummer 2 al bekend zodra de winnaar binnen is.
function simFinishTarget(playerCount){ return Math.max(1, playerCount - 1); }
const SIM_QUEST_LABELS = ['2.1','2.2','2.3','2.4','2.5','2.6','2.7','2.8','2.9'];
const SIM_HISTOGRAM_BINS = 12;

// ---------- energie ----------
// Naast de twee loopstenen rolt elke beurt een derde, zeszijdige steen mee: één kant niks,
// twee kanten 1, twee kanten 2 en één kant 3 — gemiddeld 1,5 energie per beurt. Wat je hebt
// stapelt tot ENERGY_MAX; alles daarboven gaat verloren.
//
// Energie wordt uitgegeven aan één van drie acties, maximaal één per beurt. Een speler mag
// energie die hij deze beurt rolt meteen inzetten (op 7 staan, 3 rollen, direct 10 uitgeven).
//
// De drie acties zitten bewust op drie verschillende assen — hoe ver je komt, waar je heen
// moet, en waar je staat — zodat de keuze van de situatie afhangt en niet van een rekensom:
//
//   3  Stuwstoot        gooi met 3 loopstenen in plaats van 2      (+3,5 stappen)
//   6  Herprioritering  wissel je opdracht met de volgende in je   (scheelt gemeten 7,6
//                       stapel, alleen als die dichterbij ligt      stappen lopen)
//  10  Noodtransport    verplaats na je zet nog tot 10 vakjes vrij  (10 stappen, gegarandeerd)
//
// Een eerder ontwerp gaf de 6-actie "negeer de geen-U-turn-regel". Dat is gemeten en levert
// niets op: met die regel bereik je op elk aantal stappen exact dezelfde vakjes als zonder
// (verhouding 1,000 over 180 startposities), want het bord heeft genoeg lussen om stappen te
// verspillen zonder om te keren. Niet opnieuw voorstellen dus.
const ENERGY_DIE_FACES = [0, 1, 1, 2, 2, 3];
const ENERGY_MAX = 10;
// Afstemknop: het bereik van het Noodtransport. Bewust `let`, zodat je 'm vanuit de console
// kunt doorrekenen zonder te herbouwen. 13 is niet gegokt maar gemeten — winst% van
// (Stuwstoot / Herprioritering / Noodtransport) over 5000 potjes per stand, zelfde
// toevalsstroom per bereik:
//   10 → 32,4 / 33,9 / 27,1   het transport is duidelijk te zwak
//   12 → 32,1 / 31,1 / 30,5
//   13 → 32,4 / 29,3 / 33,2   de duurste actie wipt er net overheen
//   14 → 30,1 / 29,6 / 34,1
//   16 → 29,0 / 29,1 / 36,6   het transport begint te overheersen
// Op 10 stappen is de actie 1,0 stap per energie waard tegen 1,17 voor de Stuwstoot; pas
// rond 13 haalt hij de andere twee in. Verzet je dit getal, draai de sweep opnieuw.
let ENERGY_JUMP_RANGE = 13;

const ENERGY_ACTIONS = {
  boost:   { cost: 3,  name: 'Stuwstoot',       hint: 'gooi met 3 loopstenen' },
  reorder: { cost: 6,  name: 'Herprioritering', hint: 'wissel om met de volgende opdracht' },
  jump:    { cost: 10, name: 'Noodtransport',   hint: `verplaats tot ${ENERGY_JUMP_RANGE} vakjes vrij` },
  none:    { cost: 0,  name: 'Geen energie',    hint: 'spaart maar geeft nooit uit' },
};
// Elke speler krijgt er per potje één; ze worden geloot over de startposities zodat de
// strategie nooit samenvalt met een bepaalde startpositie. Zo is één batch een toernooi.
const ENERGY_STRATEGIES = ['boost', 'reorder', 'jump', 'none'];

// Vrije verplaatsing van maximaal `range` vakjes: geen dobbelsteen, geen geen-U-turn-regel,
// bezette vakjes tellen niet mee. Gaat recht op het doel af als dat binnen bereik ligt en
// kiest anders het bereikbare vakje dat het dichtst bij het doel ligt.
function resolveEnergyJump(graph, fromKey, range, targetKey){
  // 1. alles binnen bereik verzamelen. Dit moet compleet zijn vóór de tweede BFS, want die
  //    overschrijft de gedeelde afstandsbuffer.
  const stampFrom = simBfsDistances(graph, fromKey);
  const near = new Map();
  for (let k = 0; k < graph.N; k++){
    const d = simDistLookup(stampFrom, k);
    if (d >= 0 && d <= range) near.set(k, d);
  }
  // 2. doel binnen bereik? dan er meteen heen — anders zo dicht mogelijk erbij
  let dest = null;
  if (near.has(targetKey)){
    dest = targetKey;
  } else {
    const stampTarget = simBfsDistances(graph, targetKey);
    let best = Infinity;
    for (const k of near.keys()){
      const d = simDistLookup(stampTarget, k);
      if (d >= 0 && d < best){ best = d; dest = k; }
    }
  }
  if (dest === null || dest === fromKey) return null;
  // 3. pad terugzoeken via de afstanden uit stap 1 (voor de drukte-heatmap en de animatie)
  const path = [dest];
  let cur = dest;
  while (cur !== fromKey){
    const d = near.get(cur);
    const neigh = graph.adjKey[cur];
    let prev = -1;
    for (let j = 0; j < neigh.length; j++) if (near.get(neigh[j]) === d - 1){ prev = neigh[j]; break; }
    if (prev === -1) break;
    path.push(prev);
    cur = prev;
  }
  path.reverse();
  return { key: dest, path, banked: dest === targetKey };
}

// Herprioritering loont alleen als de volgende opdracht in je stapel dichterbij ligt dan de
// huidige; anders houd je de energie in je zak. Geeft het nieuwe doellabel terug, of null.
function energyReorderTarget(graph, player, fromKey){
  const curLabel = player.order[player.nextIdx];
  const altLabel = player.order[player.nextIdx + 1];
  if (altLabel === undefined) return null;
  const stamp = simBfsDistances(graph, fromKey);
  const dCur = simDistLookup(stamp, graph.questCells[curLabel]);
  const dAlt = simDistLookup(stamp, graph.questCells[altLabel]);
  if (dCur < 0 || dAlt < 0 || dAlt >= dCur) return null;
  player.order[player.nextIdx] = altLabel;
  player.order[player.nextIdx + 1] = curLabel;
  return altLabel;
}

// ---------- beloningskaarten ----------
// Wie een opdracht bereikt trekt een kaart van een gedeelde, gesloten stapel (2 exemplaren
// van elk van de 10 typen = 20 kaarten). Je mag maximaal 2 kaarten tegelijk vasthouden; sta je
// al op 2, dan trek je niet (de kaart blijft liggen). Gebruikte kaarten gaan op de aflegstapel;
// is de trekstapel leeg, dan wordt de aflegstapel geschud en dient weer als trekstapel. De
// opdrachtkaarten blijven gewoon staan — je moet nog steeds je 6 opdrachten voltooien, de
// kaarten zijn een bonus onderweg, geen vervanging.
//
// Een kaart spelen is JE ACTIE VOOR DIE BEURT: hooguit één ding per beurt, of dat nu een
// energie-actie is of een kaart. Kaarten zijn gratis, dus een bot geeft ze voorrang boven het
// uitgeven van energie — waarom betalen als hetzelfde gratis kan? Binnen die voorrang is de
// volgorde: eerst de energie-kaarten (ze horen bij de worp die net gevallen is), dan de
// doelkaarten, dan de bewegingskaarten, dan de reactieve kaart, en Herbevoorrading als sluitstuk
// voor beurten waarin verder niets speelde. Prioriteitspas heeft geen meetbaar effect in deze
// bot-simulatie (het is pure informatie voor een menselijke speler) en wordt daarom nooit actief
// gespeeld — hij kan dus een handslot permanent bezet houden; zie extra.cardDeadHand.
const ACTION_CARDS = {
  boots:     { name: 'Zwaartekracht-laarzen', hint: '10 stappen rechtdoor, geen bochten' },
  ration:    { name: 'Noodrantsoen',          hint: '+3 energie direct' },
  short:     { name: 'Kortsluiting',          hint: 'tegenstander mist zijn energiesteen' },
  blind:     { name: 'Blinde Vlek',           hint: 'bezette vakjes tellen deze beurt niet mee' },
  recal:     { name: 'Herkalibratie',         hint: 'gratis wissel met de volgende opdracht' },
  shove:     { name: 'Duwstoot',              hint: 'duw een naastgelegen tegenstander weg' },
  boostcell: { name: 'Stuwlading',            hint: 'gratis derde loopsteen' },
  valve:     { name: 'Overdrukklep',          hint: 'redt energie die anders over het plafond ging' },
  resupply:  { name: 'Herbevoorrading',       hint: 'trek meteen nog een kaart' },
  scan:      { name: 'Prioriteitspas',        hint: 'bekijk de volgende opdracht van een tegenstander' },
};
const ACTION_CARD_IDS = Object.keys(ACTION_CARDS);
const ACTION_CARD_HAND_MAX = 2;

function buildActionDeck(rand){
  const cards = [];
  for (const id of ACTION_CARD_IDS){ cards.push(id, id); }
  return { draw: simShuffle(cards, rand), discard: [] };
}
function drawActionCard(deck, rand){
  if (deck.draw.length === 0){
    if (deck.discard.length === 0) return null;
    deck.draw = simShuffle(deck.discard, rand);
    deck.discard = [];
  }
  return deck.draw.pop();
}
// verwijdert een kaart uit de hand van een speler en legt hem af. `extra` is optioneel —
// "stap voor stap" telt niets bij, alleen de batch-simulatie.
function useActionCard(player, id, deck, extra){
  const i = player.cards.indexOf(id);
  if (i === -1) return;
  player.cards.splice(i, 1);
  deck.discard.push(id);
  if (extra) extra.cardUses[id]++;
}

// Zwaartekracht-laarzen: loop tot `maxSteps` in een RECHTE lijn (geen bochten, dus strenger
// dan de geen-U-turn-regel) in elk van de 4 richtingen vanaf `fromKey`, stop bij een bezet
// vakje. Geeft, net als resolveMove, een move-vormig resultaat terug — of null als geen van de
// vier richtingen minstens zo veel oplevert als een gemiddelde worp (het doel raken telt
// altijd, ongeacht hoeveel stappen dat kostte).
function resolveGravityBoots(graph, fromKey, maxSteps, occupied, targetKey){
  const { adjKey, adjDir } = graph;
  const candidates = [];
  for (let d = 0; d < 4; d++){
    let cur = fromKey;
    const path = [cur];
    let wasBlocked = false;
    let bankedAt = -1;
    for (let s = 0; s < maxSteps; s++){
      const neigh = adjKey[cur], dirs = adjDir[cur];
      let next = -1;
      for (let j = 0; j < dirs.length; j++) if (dirs[j] === d){ next = neigh[j]; break; }
      if (next === -1) break;           // muur: deze richting stopt hier
      if (occupied.has(next)){ wasBlocked = true; break; }
      cur = next;
      path.push(cur);
      if (cur === targetKey){ bankedAt = path.length - 1; break; }
    }
    if (path.length > 1) candidates.push({ path, wasBlocked, bankedAt });
  }
  if (!candidates.length) return null;

  const banked = candidates.find(c => c.bankedAt !== -1);
  if (banked) return { key: targetKey, path: banked.path, stepsUsed: banked.bankedAt, bankedQuest: true, wasBlocked: banked.wasBlocked };

  // geen van de vier raakte het doel: kies de richting die het dichtst bij eindigt, en
  // gebruik de kaart alleen als dat minstens zo goed is als een gemiddelde worp (7 stappen
  // nettoverbetering) — anders houd je 'm liever achter de hand.
  const stamp = simBfsDistances(graph, targetKey);
  const dBefore = simDistLookup(stamp, fromKey);
  let best = null, bestImprovement = -Infinity;
  for (const c of candidates){
    const end = c.path[c.path.length - 1];
    const dAfter = simDistLookup(stamp, end);
    if (dAfter < 0) continue;
    const improvement = dBefore - dAfter;
    if (improvement > bestImprovement){ bestImprovement = improvement; best = c; }
  }
  if (!best || bestImprovement < 7) return null;
  return { key: best.path[best.path.length - 1], path: best.path, stepsUsed: best.path.length - 1, bankedQuest: false, wasBlocked: best.wasBlocked };
}

// Kortsluiting: raakt de speler die op dit moment de meeste opdrachten heeft (bij gelijke
// stand de eerste in spelervolgorde), voor zover die nog meespeelt en niet al geraakt is.
function pickShortCircuitTarget(players, selfIdx){
  let best = null;
  for (const p of players){
    if (p.idx === selfIdx || p.rank || p.skipEnergyRoll) continue;
    if (!best || p.completed > best.completed) best = p;
  }
  return best;
}

// Duwstoot: onder de tegenstanders die nu aan mij grenzen, kies de zet die hun afstand tot
// hún eigen doel het meest vergroot — en alleen toepassen als dat ook echt iets oplevert.
function pickShoveMove(graph, players, selfIdx){
  const self = players[selfIdx];
  const neigh = graph.adjKey[self.pos];
  const occupiedNow = new Set(players.filter(p => !p.rank).map(p => p.pos));
  let best = null, bestGain = 0;
  for (const nk of neigh){
    const target = players.find(p => !p.rank && p.idx !== selfIdx && p.pos === nk);
    if (!target) continue;
    // batch-spelers noemen hun opdrachtstapel `order`, het tabblad "stap voor stap" noemt
    // 'm `deck` — deze functie wordt door allebei gebruikt, dus moet met beide overweg kunnen
    const targetLabel = (target.order || target.deck)[target.nextIdx];
    const targetKeyForThem = graph.questCells[targetLabel];
    const stamp = simBfsDistances(graph, targetKeyForThem);
    const dBefore = simDistLookup(stamp, target.pos);
    const theirNeigh = graph.adjKey[target.pos];
    for (const nk2 of theirNeigh){
      if (occupiedNow.has(nk2)) continue;         // moet naar een leeg vakje
      const dAfter = simDistLookup(stamp, nk2);
      if (dAfter < 0) continue;
      const gain = dAfter - dBefore;
      if (gain > bestGain){ bestGain = gain; best = { player: target, toKey: nk2 }; }
    }
  }
  return best;
}

function simRollEnergy(rand){
  return ENERGY_DIE_FACES[Math.floor(rand() * ENERGY_DIE_FACES.length)];
}
// schrijft de winst bij tot het plafond en geeft terug wat er daadwerkelijk bijkwam en wat
// er door het plafond verloren ging
function simGainEnergy(player, roll){
  const before = player.energy;
  player.energy = Math.min(ENERGY_MAX, before + roll);
  const gained = player.energy - before;
  return { gained, wasted: roll - gained };
}

// Bordgrootte ligt vast (4x8 rijen, 5x8 kolommen); de dedup-buffer hieronder wordt
// EENMALIG aangemaakt en over duizenden potjes heen hergebruikt via een oplopend
// "stempel"-getal in plaats van steeds nieuwe typed arrays te alloceren — dat
// alloceren bleek in de praktijk de grootste tijdvreter bij een grote batch. Het
// pad per beurt (voor de drukte-heatmap) wordt WEL per aanroep vers opgebouwd
// (kleine, kortlevende arrays) omdat eenzelfde (cel,richting) binnen één beurt op
// meerdere staplagen kan voorkomen — een gedeelde buffer zou daar de verkeerde
// voorganger onthouden en het teruggereconstrueerde pad corrumperen.
const SIM_N = TILE_ROWS * TILE_H * TILE_COLS * TILE_W;
const simDpStamp = new Int32Array(SIM_N * 4);
let simDpStampCounter = 0;
const simBfsDist = new Int32Array(SIM_N);
const simBfsStampArr = new Int32Array(SIM_N);
let simBfsStampCounter = 0;

function buildSimGraph(){
  const H = TILE_ROWS * TILE_H, W = TILE_COLS * TILE_W, N = H * W;
  const DR = [-1, 0, 1, 0], DC = [0, 1, 0, -1]; // 0=N,1=O,2=Z,3=W; tegenoverstelde = (d+2)%4
  const labelAt = new Array(N);
  for (let R = 0; R < H; R++){
    for (let C = 0; C < W; C++){
      const dr = R % TILE_H, dc = C % TILE_W;
      const slotIdx = Math.floor(R / TILE_H) * TILE_COLS + Math.floor(C / TILE_W);
      labelAt[R * W + C] = getDisplayValue(layout[slotIdx], dr, dc);
    }
  }
  const adjKey = new Array(N), adjDir = new Array(N);
  for (let R = 0; R < H; R++){
    for (let C = 0; C < W; C++){
      const k = R * W + C;
      if (labelAt[k] === undefined) continue;
      const ks = [], ds = [];
      for (let d = 0; d < 4; d++){
        const nR = R + DR[d], nC = C + DC[d];
        if (nR < 0 || nR >= H || nC < 0 || nC >= W) continue;
        const nk = nR * W + nC;
        if (labelAt[nk] === undefined) continue;
        ks.push(nk); ds.push(d);
      }
      adjKey[k] = ks; adjDir[k] = ds;
    }
  }
  const questCells = {}, startCells = {};
  for (let k = 0; k < N; k++){
    const v = labelAt[k];
    if (typeof v !== 'string') continue;
    if (v.startsWith('2.')) questCells[v] = k;
    else if (v.startsWith('3.')) startCells[v] = k;
  }
  return { H, W, N, adjKey, adjDir, questCells, startCells };
}

// zuivere topologische afstand vanaf één cel (negeert bezetting/U-turn) — dient als
// heuristiek om onder de DP-bereikbare eindcellen de beste te kiezen. Schrijft in de
// gedeelde simBfsDist/simBfsStampArr-buffers; geeft het stempel terug waarmee de
// caller via simDistLookup() alleen de cellen leest die in DEZE aanroep bezocht zijn.
function simBfsDistances(graph, fromKey){
  simBfsStampCounter++;
  const stamp = simBfsStampCounter;
  const { adjKey } = graph;
  simBfsStampArr[fromKey] = stamp;
  simBfsDist[fromKey] = 0;
  const queue = [fromKey];
  let qi = 0;
  while (qi < queue.length){
    const ck = queue[qi++];
    const d = simBfsDist[ck];
    const neigh = adjKey[ck];
    for (let j = 0; j < neigh.length; j++){
      const nk = neigh[j];
      if (simBfsStampArr[nk] === stamp) continue;
      simBfsStampArr[nk] = stamp;
      simBfsDist[nk] = d + 1;
      queue.push(nk);
    }
  }
  return stamp;
}
function simDistLookup(stamp, cellKey){
  return simBfsStampArr[cellKey] === stamp ? simBfsDist[cellKey] : -1;
}

// hoeveel tegenstanders staan direct naast een cel — goedkope proxy voor "hindert een
// tegenstander" (die zou er anders zijn volgende beurt langs willen). Geen rule dat
// blokkeren moet, maar tie-break onder anders gelijkwaardige eindcellen.
function computeHinderScores(graph, candidateKeys, occupiedSet){
  const { adjKey } = graph;
  const scores = new Map();
  for (const ck of candidateKeys){
    let score = 0;
    const neigh = adjKey[ck];
    for (let j = 0; j < neigh.length; j++) if (occupiedSet.has(neigh[j])) score++;
    scores.set(ck, score);
  }
  return scores;
}

// loopt van laag `step`, index `idx` terug naar laag 0 en geeft het afgelegde pad
// (cel-indices, start eerst) — voor de drukte-heatmap.
function backtrackLayers(layersKeys, layersParent, step, idx){
  const path = [];
  let s = step, i = idx;
  while (true){
    path.push(layersKeys[s][i]);
    if (s === 0) break;
    i = layersParent[s][i];
    s--;
  }
  path.reverse();
  return path;
}

// kiest, tussen meerdere even geldige eindcellen (zelfde afstand tot eigen doel), de
// beste met de hinder-score als tie-break en tot slot willekeur.
function pickEnd(graph, layersKeys, layersParent, step, targetKey, occupiedSet, rand, stepsUsed, bankedQuest){
  const keys = layersKeys[step];
  const firstIndex = new Map();
  for (let i = 0; i < keys.length; i++) if (!firstIndex.has(keys[i])) firstIndex.set(keys[i], i);
  const uniqueKeys = Array.from(firstIndex.keys());

  let chosenKey;
  if (uniqueKeys.length === 1){
    chosenKey = uniqueKeys[0];
  } else {
    const stamp = simBfsDistances(graph, targetKey);
    let minD = Infinity;
    for (const k of uniqueKeys){ const d = simDistLookup(stamp, k); if (d !== -1 && d < minD) minD = d; }
    let closest = uniqueKeys.filter(k => simDistLookup(stamp, k) === minD);
    if (closest.length > 1){
      const hinderScores = computeHinderScores(graph, closest, occupiedSet);
      let maxH = -1;
      for (const k of closest) maxH = Math.max(maxH, hinderScores.get(k));
      closest = closest.filter(k => hinderScores.get(k) === maxH);
    }
    chosenKey = closest[Math.floor(rand() * closest.length)];
  }
  const path = backtrackLayers(layersKeys, layersParent, step, firstIndex.get(chosenKey));
  return { key: chosenKey, stepsUsed, bankedQuest, path };
}

// lost één beurt op: DP over (cel, binnenkomstrichting) per stap, t/m de geworpen som.
// Houdt alle lagen bij (klein: <=12 stappen, elk een paar honderd toestanden) zodat
// het uiteindelijk gekozen pad achteraf teruggelezen kan worden voor de heatmap.
function resolveMove(graph, startKey, steps, occupiedSet, targetKey, rand){
  const { adjKey, adjDir } = graph;
  const layersKeys = [[startKey]], layersDirs = [[-1]], layersParent = [[]];
  let wasBlocked = false;

  for (let step = 1; step <= steps; step++){
    simDpStampCounter++;
    const stamp = simDpStampCounter;
    const prevKeys = layersKeys[step - 1], prevDirs = layersDirs[step - 1];
    const nextKeys = [], nextDirs = [], nextParent = [];
    for (let i = 0; i < prevKeys.length; i++){
      const ck = prevKeys[i], cd = prevDirs[i];
      const neigh = adjKey[ck], dirs = adjDir[ck];
      for (let j = 0; j < neigh.length; j++){
        const d = dirs[j];
        if (cd !== -1 && d === (cd + 2) % 4) continue; // geen U-turn
        const nk = neigh[j];
        if (occupiedSet.has(nk)){ wasBlocked = true; continue; } // bezet vakje blokkeert
        // eigen doel exact geraakt: beurt eindigt meteen, rest van de worp vervalt —
        // geen noodzaak om de rest van deze (of latere) lagen nog uit te rekenen.
        if (nk === targetKey){
          const path = backtrackLayers(layersKeys, layersParent, step - 1, i);
          path.push(nk);
          return { key: targetKey, stepsUsed: step, bankedQuest: true, path, wasBlocked };
        }
        const stateIdx = nk * 4 + d;
        if (simDpStamp[stateIdx] === stamp) continue;
        simDpStamp[stateIdx] = stamp;
        nextKeys.push(nk); nextDirs.push(d); nextParent.push(i);
      }
    }
    if (nextKeys.length === 0){
      // doodlopend voordat de worp op is: stop op de laatst haalbare laag
      const move = pickEnd(graph, layersKeys, layersParent, step - 1, targetKey, occupiedSet, rand, step - 1, false);
      move.wasBlocked = wasBlocked;
      return move;
    }
    layersKeys.push(nextKeys); layersDirs.push(nextDirs); layersParent.push(nextParent);
  }
  const move = pickEnd(graph, layersKeys, layersParent, steps, targetKey, occupiedSet, rand, steps, false);
  move.wasBlocked = wasBlocked;
  return move;
}

function simShuffle(arr, rand){
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--){
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function simRollD6(rand){ return 1 + Math.floor(rand() * 6); }

// speelt één potje; telt onderweg mee in `heatmap` (bezoeken per cel), `questStats`
// (hoe lang duurde het om elk opdrachtvakje te bereiken) en `extra` (blokkeren,
// voorsprong bij winst) — allemaal gedeeld over de hele batch, dus geen allocatie
// per potje nodig.
function simulateOneGame(graph, rand, heatmap, questStats, extra){
  const players = SIM_START_LABELS.map((label, idx) => ({
    idx,
    startLabel: label,
    pos: graph.startCells[label],
    order: simShuffle(SIM_QUEST_LABELS, rand),
    nextIdx: 0,
    completed: 0,
    turnsOnTarget: 0,
    energy: 0,
    strategy: 'none',
    actionUses: 0,
    cards: [],             // beloningskaarten in de hand (max ACTION_CARD_HAND_MAX)
    skipEnergyRoll: false, // getroffen door Kortsluiting: mist de eerstvolgende energiesteen
    rank: 0,       // 0 = nog aan het spelen; 1..4 = binnengekomen op die plaats
    finishTurn: 0, // beurtnummer waarop deze speler binnenkwam
  }));
  const turnOrder = simShuffle([0, 1, 2, 3], rand);
  for (let s = 0; s < turnOrder.length; s++) players[turnOrder[s]].seat = s;
  // strategieën loten, zodat "welke actie wint" niet vervuild wordt door de startpositie
  const strategies = simShuffle(ENERGY_STRATEGIES, rand);
  for (let i = 0; i < players.length; i++) players[i].strategy = strategies[i];
  const deck = buildActionDeck(rand);   // één gedeelde stapel voor het hele potje

  const finishTarget = simFinishTarget(players.length);
  let finished = 0;
  let turnCount = 0;

  while (turnCount < SIM_MAX_TURNS){
    for (const pIdx of turnOrder){
      const player = players[pIdx];
      if (player.rank) continue;   // binnen: speelt niet meer mee en staat niemand in de weg
      turnCount++;
      let actionUsed = false;   // hooguit 1 actie per beurt, of dat nu een kaart is of energie

      // 1. energiesteen rolt mee (tenzij Kortsluiting die deze beurt blokkeert). Het niveau
      //    wordt geteld NA het bijschrijven, want dat is wat deze speler deze beurt kan inzetten.
      let energyRoll = 0, energyGain = { gained: 0, wasted: 0 };
      if (player.skipEnergyRoll){
        player.skipEnergyRoll = false;
      } else {
        energyRoll = simRollEnergy(rand);
        energyGain = simGainEnergy(player, energyRoll);
      }
      extra.energyRolled += energyRoll;
      extra.energyWasted += energyGain.wasted;
      extra.energyLevels[player.energy]++;

      // 1b. energie-kaarten horen bij de worp die net gevallen is: Overdrukklep redt wat
      //     anders over het plafond ging, Kortsluiting raakt de leider, Noodrantsoen vult aan.
      if (!actionUsed && player.cards.includes('valve') && energyGain.wasted > 0){
        const saved = Math.min(3, energyGain.wasted);
        player.energy += saved;
        extra.energyWasted -= saved;
        useActionCard(player, 'valve', deck, extra);
        actionUsed = true;
      }
      if (!actionUsed && player.cards.includes('short')){
        const victim = pickShortCircuitTarget(players, pIdx);
        if (victim){
          victim.skipEnergyRoll = true;
          useActionCard(player, 'short', deck, extra);
          actionUsed = true;
        }
      }
      if (!actionUsed && player.cards.includes('ration') && player.energy < ENERGY_MAX){
        simGainEnergy(player, 3);
        useActionCard(player, 'ration', deck, extra);
        actionUsed = true;
      }

      // 2. doel bepalen: Herkalibratie (gratis, kaart) gaat vóór de betaalde Herprioritering
      let targetLabel = player.order[player.nextIdx];
      if (!actionUsed && player.cards.includes('recal')){
        const swapped = energyReorderTarget(graph, player, player.pos);
        if (swapped !== null){
          targetLabel = swapped;
          useActionCard(player, 'recal', deck, extra);
          actionUsed = true;
        }
      }
      if (!actionUsed && player.cards.includes('shove')){
        const shove = pickShoveMove(graph, players, pIdx);
        if (shove){
          shove.player.pos = shove.toKey;
          useActionCard(player, 'shove', deck, extra);
          actionUsed = true;
        }
      }
      if (!actionUsed && player.strategy === 'reorder' && player.energy >= ENERGY_ACTIONS.reorder.cost){
        const swapped = energyReorderTarget(graph, player, player.pos);
        if (swapped !== null){
          targetLabel = swapped;
          player.energy -= ENERGY_ACTIONS.reorder.cost;
          player.actionUses++;
          actionUsed = true;
        }
      }
      const targetKey = graph.questCells[targetLabel];

      const occupied = new Set();
      for (let j = 0; j < 4; j++) if (j !== pIdx && !players[j].rank) occupied.add(players[j].pos);

      // 3. beweging: Zwaartekracht-laarzen vervangt de worp helemaal; anders de gewone
      //    loopstenen met Stuwlading (kaart) of Stuwstoot (energie) als derde steen
      let move, roll = 0, usedBoots = false;
      if (!actionUsed && player.cards.includes('boots')){
        const bootsMove = resolveGravityBoots(graph, player.pos, 10, occupied, targetKey);
        if (bootsMove){
          move = bootsMove;
          usedBoots = true;
          useActionCard(player, 'boots', deck, extra);
          actionUsed = true;
        }
      }
      if (!usedBoots){
        roll = simRollD6(rand) + simRollD6(rand);
        if (!actionUsed && player.cards.includes('boostcell')){
          roll += simRollD6(rand);
          useActionCard(player, 'boostcell', deck, extra);
          actionUsed = true;
        } else if (!actionUsed && player.strategy === 'boost' && player.energy >= ENERGY_ACTIONS.boost.cost){
          roll += simRollD6(rand);
          player.energy -= ENERGY_ACTIONS.boost.cost;
          player.actionUses++;
          actionUsed = true;
        }
        move = resolveMove(graph, player.pos, roll, occupied, targetKey, rand);
      }

      // 4. Blinde Vlek reageert op een geblokkeerde poging; Noodtransport mag TUSSENTIJDS, dus
      //    ná een geslaagde deblokkering alsnog. Alleen ná de zet springen maakt Noodtransport
      //    veel zwakker — dat is gemeten (26,7% winst tegen 32,4% voor de goedkoopste actie)
      //    en was een fout, geen ontwerpkeuze.
      if (!move.bankedQuest && !actionUsed && player.cards.includes('blind') && move.wasBlocked){
        const retry = resolveMove(graph, player.pos, roll, new Set(), targetKey, rand);
        if (retry.key !== move.key){
          move = retry;
          useActionCard(player, 'blind', deck, extra);
          actionUsed = true;
        }
      }
      if (!move.bankedQuest && !actionUsed && player.strategy === 'jump' && player.energy >= ENERGY_ACTIONS.jump.cost){
        const jump = resolveEnergyJump(graph, player.pos, ENERGY_JUMP_RANGE, targetKey);
        if (jump){
          player.energy -= ENERGY_ACTIONS.jump.cost;
          player.actionUses++;
          actionUsed = true;
          for (let p = 0; p < jump.path.length; p++) heatmap[jump.path[p]]++;
          // de sprong kan de opdracht zelf al pakken; anders loop je vanaf daar verder
          move = jump.banked
            ? { key: jump.key, path: [jump.key], stepsUsed: 0, bankedQuest: true, wasBlocked: false }
            : resolveMove(graph, jump.key, roll, occupied, targetKey, rand);
        }
      }
      // 5. Herbevoorrading als sluitstuk: alleen als er verder niets te doen viel deze beurt
      if (!actionUsed && player.cards.includes('resupply')){
        useActionCard(player, 'resupply', deck, extra);
        const drawn = drawActionCard(deck, rand);
        if (drawn){ player.cards.push(drawn); extra.cardDraws++; }
        actionUsed = true;
      }

      player.pos = move.key;
      player.turnsOnTarget++;
      extra.totalTurns++;
      if (move.wasBlocked) extra.blockedTurns++;
      for (let p = 0; p < move.path.length; p++) heatmap[move.path[p]]++;

      if (move.bankedQuest){
        const qs = questStats[targetLabel];
        qs.turns += player.turnsOnTarget;
        qs.count++;
        player.completed++;
        player.nextIdx++;
        player.turnsOnTarget = 0;
        // beloning: een kaart trekken, als de hand niet al vol is
        if (player.cards.length < ACTION_CARD_HAND_MAX){
          const drawn = drawActionCard(deck, rand);
          if (drawn){ player.cards.push(drawn); extra.cardDraws++; }
        } else {
          extra.handFullOnBank++;
        }
        if (player.completed >= SIM_QUESTS_TO_WIN){
          finished++;
          player.rank = finished;
          player.finishTurn = turnCount;
          if (finished === 1){
            // spanning meten op het moment van de winst, niet aan het eind van het potje
            let runnerUp = 0;
            for (let j = 0; j < 4; j++) if (j !== pIdx) runnerUp = Math.max(runnerUp, players[j].completed);
            const gap = SIM_QUESTS_TO_WIN - runnerUp;
            extra.winGapSum += gap;
            extra.winGapCount++;
            if (gap === 1) extra.nailBiters++;
          }
          if (finished >= finishTarget){
            // de achterblijver(s) hebben verloren zonder dat ze nog iets kunnen doen
            for (const p of players) if (!p.rank) p.rank = finished + 1;
            return { stuck: false, turns: turnCount, players };
          }
        }
      }
      if (turnCount >= SIM_MAX_TURNS) return { stuck: true, turns: turnCount, players };
    }
  }
  return { stuck: true, turns: turnCount, players };
}

// ---------- UI ----------
const simCountEl = document.getElementById('simCount');
const simStatusEl = document.getElementById('simStatus');
const simResultsEl = document.getElementById('simResults');
const btnSimulate = document.getElementById('btnSimulate');

// wordt aangeroepen door alles wat de indeling wijzigt (genereren, herstellen,
// slepen, draaien, tegel-editor) — de cijfers horen bij een specifieke indeling en
// worden ongeldig zodra die verandert. Tabwisselingen raken dit niet aan (die
// laten de tab-inhoud gewoon in de DOM staan).
function clearSimResults(){
  // een lopende stap-voor-stap-pion hoort niet op een bord dat onder hem vandaan verandert
  stopWalkSimulation();
  if (!simResultsEl) return;
  simResultsEl.innerHTML = '';
  simStatusEl.innerHTML = `<span class="sub">Indeling gewijzigd — draai de simulatie opnieuw voor cijfers die bij dit bord horen.</span>`;
}

// 95%-foutmarge (in procentpunten) op een winpercentage uit `wins` van `n` potjes.
function simMarginOfError(wins, n){
  if (!n) return 0;
  const p = wins / n;
  return 1.96 * Math.sqrt(p * (1 - p) / n) * 100;
}

function renderHistogram(gameLengths){
  if (!gameLengths.length) return '';
  const min = Math.min(...gameLengths), max = Math.max(...gameLengths);
  const binCount = Math.min(SIM_HISTOGRAM_BINS, Math.max(1, max - min + 1));
  const binWidth = Math.max(1, (max - min + 1) / binCount);
  const counts = new Array(binCount).fill(0);
  for (const v of gameLengths){
    const bin = Math.min(binCount - 1, Math.floor((v - min) / binWidth));
    counts[bin]++;
  }
  const maxCount = Math.max(...counts);
  const bars = counts.map((c, i) => {
    const lo = Math.round(min + i * binWidth), hi = Math.round(min + (i + 1) * binWidth - 1);
    const h = maxCount ? Math.round((c / maxCount) * 100) : 0;
    const label = i === 0 || i === binCount - 1 || i === Math.floor(binCount / 2) ? `<span class="sim-hist-tick">${lo}</span>` : '';
    return `<div class="sim-hist-bar-wrap" title="${lo}–${hi} beurten: ${c} potjes"><div class="sim-hist-bar" style="height:${h}%"></div>${label}</div>`;
  }).join('');
  return `<div class="sim-hist">${bars}</div>`;
}

// sequentiële amber-verloopkleur (één kleur, licht->donker/fel naar bezoekfrequentie) —
// vlakken zonder bezoek blijven dicht bij het paneel, vlakken buiten het bord blijven
// het bestaande "onbenutte sjabloonplek"-donker.
function heatColor(t){
  const c0 = [26, 33, 42], c1 = [255, 181, 69];
  const r = Math.round(c0[0] + (c1[0] - c0[0]) * t);
  const g = Math.round(c0[1] + (c1[1] - c0[1]) * t);
  const b = Math.round(c0[2] + (c1[2] - c0[2]) * t);
  return `rgb(${r},${g},${b})`;
}

// afstand tot de dichtstbijzijnde opdracht per cel, op de HUIDIGE (mogelijk gedraaide) indeling
// — multi-bron BFS vanaf alle opdrachtvakjes tegelijk, zelfde idee als questCoverageScore in
// 70-generator.js maar dan op de getoonde graph i.p.v. de ongedraaide generator-kandidaat.
function computeQuestDistances(graph){
  const dist = new Int32Array(graph.N).fill(-1);
  const queue = [];
  for (const k of Object.values(graph.questCells)){ dist[k] = 0; queue.push(k); }
  let qi = 0;
  while (qi < queue.length){
    const ck = queue[qi++];
    const d = dist[ck];
    const neigh = graph.adjKey[ck];
    for (let j = 0; j < neigh.length; j++){
      const nk = neigh[j];
      if (dist[nk] !== -1) continue;
      dist[nk] = d + 1;
      queue.push(nk);
    }
  }
  return dist;
}

// de 5 tegels met het minste verkeer (genormaliseerd per vakje, zodat grote en kleine tegels
// eerlijk vergeleken worden) — dit zijn de "lussen waar geen enkele speler komt" uit de heatmap,
// nu met naam, positie en hoe ver ze van een opdracht liggen.
function renderColdZones(graph, heatmap){
  const { H, W } = graph;
  const questDist = computeQuestDistances(graph);
  const visitsPerSlot = new Array(20).fill(0);
  const cellsPerSlot = new Array(20).fill(0);
  const maxQuestDistPerSlot = new Array(20).fill(0);
  for (let R = 0; R < H; R++){
    for (let C = 0; C < W; C++){
      const k = R * W + C;
      if (graph.adjKey[k] === undefined) continue;
      const slotIdx = Math.floor(R / TILE_H) * TILE_COLS + Math.floor(C / TILE_W);
      visitsPerSlot[slotIdx] += heatmap[k];
      cellsPerSlot[slotIdx]++;
      if (questDist[k] > maxQuestDistPerSlot[slotIdx]) maxQuestDistPerSlot[slotIdx] = questDist[k];
    }
  }
  const totalVisits = visitsPerSlot.reduce((a, b) => a + b, 0);
  const rows = [];
  for (let slotIdx = 0; slotIdx < 20; slotIdx++){
    if (cellsPerSlot[slotIdx] === 0) continue;
    rows.push({
      slotIdx,
      tid: layout[slotIdx],
      share: totalVisits ? (visitsPerSlot[slotIdx] / totalVisits * 100) : 0,
      avgPerCell: visitsPerSlot[slotIdx] / cellsPerSlot[slotIdx],
      questDist: maxQuestDistPerSlot[slotIdx],
    });
  }
  rows.sort((a, b) => a.avgPerCell - b.avgPerCell);
  const tableRows = rows.slice(0, 5).map(r => {
    const name = ROOM_NAMES[r.tid] || ('Gang ' + r.tid);
    return `<tr><td>${letterForSlot(r.slotIdx)} — ${name}</td><td class="num">${r.share.toFixed(1)}%</td><td class="num">${r.questDist}</td></tr>`;
  }).join('');
  return `<table class="sim-table"><thead><tr><th>Tegel</th><th>Aandeel verkeer</th><th>Verste vakje tot opdracht</th></tr></thead><tbody>${tableRows}</tbody></table>`;
}

function renderHeatmap(graph, heatmap){
  const { H, W } = graph;
  let maxCount = 0;
  for (let k = 0; k < heatmap.length; k++) if (heatmap[k] > maxCount) maxCount = heatmap[k];
  const questAt = new Set(Object.values(graph.questCells));
  const startAt = new Set(Object.values(graph.startCells));

  const cells = new Array(H * W);
  for (let R = 0; R < H; R++){
    for (let C = 0; C < W; C++){
      const k = R * W + C;
      const neigh = graph.adjKey[k];
      if (neigh === undefined){ cells[k] = `<div class="sim-heat-cell off"></div>`; continue; }
      const count = heatmap[k];
      const t = maxCount ? Math.sqrt(count / maxCount) : 0;
      const cls = questAt.has(k) ? ' quest' : startAt.has(k) ? ' start' : '';
      cells[k] = `<div class="sim-heat-cell${cls}" style="background:${heatColor(t)}" title="${count} bezoeken"></div>`;
    }
  }
  return `
    <div class="sim-heat-outer">
      <div class="sim-heat-grid" style="grid-template-columns:repeat(${W}, var(--hcell)); grid-template-rows:repeat(${H}, var(--hcell));">${cells.join('')}</div>
    </div>
    <div class="sim-heat-legend">
      <span>weinig verkeer</span>
      <span class="sim-heat-scale"></span>
      <span>veel verkeer</span>
      <span class="sim-heat-key"><i class="sim-heat-swatch quest"></i>opdrachtvakje</span>
      <span class="sim-heat-key"><i class="sim-heat-swatch start"></i>startpositie</span>
    </div>`;
}

function renderSimResults({ n, stuckCount, startWins, startTurnsSum, startRanks, strategyStats, seatWins, gameLengths, questStats, extra, graph, heatmap, elapsedMs }){
  const played = n - stuckCount;

  const startPcts = SIM_START_LABELS.map(lbl => played ? (startWins[lbl] / played * 100) : 0);
  const spread = startPcts.length ? Math.max(...startPcts) - Math.min(...startPcts) : 0;
  const avgMoe = startPcts.length
    ? SIM_START_LABELS.reduce((s, lbl) => s + simMarginOfError(startWins[lbl], played), 0) / SIM_START_LABELS.length
    : 0;
  const withinNoise = spread <= 2 * avgMoe;
  const verdict = played === 0 ? '—'
    : withinNoise ? `<span class="ok">binnen foutmarge — geen aantoonbaar verschil</span>`
    : `<span class="bad">verschil groter dan de foutmarge — waarschijnlijk een echte scheefheid</span>`;

  const rows = SIM_START_LABELS.map(lbl => {
    const wins = startWins[lbl];
    const pct = played ? (wins / played * 100) : 0;
    const moe = simMarginOfError(wins, played);
    const avgTurns = wins ? (startTurnsSum[lbl] / wins) : null;
    return `<tr><td>${lbl}</td><td class="num">${pct.toFixed(1)}% ± ${moe.toFixed(1)}</td><td class="num">${avgTurns !== null ? avgTurns.toFixed(1) : '—'}</td></tr>`;
  }).join('');
  const seatRows = seatWins.map((w, i) => {
    const pct = played ? (w / played * 100) : 0;
    return `<tr><td>${i + 1}e aan zet</td><td class="num">${pct.toFixed(1)}%</td></tr>`;
  }).join('');
  const questRows = SIM_QUEST_LABELS.map(lbl => {
    const qs = questStats[lbl];
    const avg = qs.count ? (qs.turns / qs.count) : null;
    return `<tr><td>${lbl} — ${QUEST_NAMES[lbl]}</td><td class="num">${avg !== null ? avg.toFixed(1) : '—'}</td><td class="num">${qs.count}</td></tr>`;
  }).join('');

  const sorted = gameLengths.slice().sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  const avg = sorted.length ? sum / sorted.length : 0;
  const median = sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;
  const min = sorted.length ? sorted[0] : 0;
  const max = sorted.length ? sorted[sorted.length - 1] : 0;

  const blockedPct = extra.totalTurns ? (extra.blockedTurns / extra.totalTurns * 100) : 0;
  const avgGap = extra.winGapCount ? (extra.winGapSum / extra.winGapCount) : 0;
  const nailBiterPct = extra.winGapCount ? (extra.nailBiters / extra.winGapCount * 100) : 0;

  let html = `<p class="hint"><b>${n}</b> potjes gesimuleerd op indeling <b>${layout.join(',')}</b>`;
  if (stuckCount) html += ` — <span style="color:var(--danger)">${stuckCount} vastgelopen</span> (afgekapt na ${SIM_MAX_TURNS} beurten, niet meegeteld in de percentages)`;
  html += `.</p>`;

  html += `<h3 class="sim-subhead">Eerlijkheid per startpositie</h3>`;
  html += `<table class="sim-table"><thead><tr><th>Startpositie</th><th>Winst% (±95%-marge)</th><th>Gem. beurten tot winst</th></tr></thead><tbody>${rows}</tbody></table>`;
  html += `<p class="hint">Balans: ${verdict} (spreiding <b>${spread.toFixed(1)}</b> procentpunt, gem. foutmarge ±<b>${avgMoe.toFixed(1)}</b>).</p>`;

  // Nu er wordt doorgespeeld tot de nummer 3 binnen is, ligt van elk potje de hele
  // klassering vast. Alleen naar winst kijken verbergt een startpositie die zelden wint
  // maar wel structureel derde of vierde wordt.
  const rankRows = SIM_START_LABELS.map(lbl => {
    const counts = startRanks[lbl];
    const total = counts.reduce((a, b) => a + b, 0);
    const cells = counts.map(c => `<td class="num">${total ? (c / total * 100).toFixed(1) : '0.0'}%</td>`).join('');
    const avgRank = total ? counts.reduce((s, c, i) => s + c * (i + 1), 0) / total : 0;
    return `<tr><td>${lbl}</td>${cells}<td class="num">${avgRank.toFixed(2)}</td></tr>`;
  }).join('');
  html += `<h3 class="sim-subhead">Eindklassering per startpositie</h3>`;
  html += `<table class="sim-table"><thead><tr><th>Startpositie</th><th>1e</th><th>2e</th><th>3e</th><th>4e</th><th>Gem. plaats</th></tr></thead><tbody>${rankRows}</tbody></table>`;
  html += `<p class="hint">Er wordt doorgespeeld tot de <b>nummer 3</b> binnen is; de laatste speler is dan automatisch vierde. Bij een eerlijk bord ligt elke kolom rond de 25% en de gemiddelde plaats rond de 2,50.</p>`;

  html += `<h3 class="sim-subhead">Eerlijkheid per beurtvolgorde</h3>`;
  html += `<table class="sim-table"><thead><tr><th>Beurtvolgorde</th><th>Winst%</th></tr></thead><tbody>${seatRows}</tbody></table>`;

  html += `<h3 class="sim-subhead">Eerlijkheid per opdrachtvakje</h3>`;
  html += `<table class="sim-table"><thead><tr><th>Opdracht</th><th>Gem. beurten om te bereiken</th><th>Keer bereikt</th></tr></thead><tbody>${questRows}</tbody></table>`;
  html += `<p class="hint">Hoe hoger het gemiddelde, hoe afgelegener dat opdrachtvakje ligt vanaf waar spelers 'm meestal moeten benaderen.</p>`;

  html += `<h3 class="sim-subhead">Speelduur</h3>`;
  html += `<p class="hint">Van de eerste worp tot de nummer 3 binnen is: gemiddeld <b>${avg.toFixed(1)}</b> beurten, mediaan <b>${median}</b>, min <b>${min}</b>, max <b>${max}</b> (alle spelers samen, dus deel door 4 voor beurten per speler).</p>`;
  html += renderHistogram(gameLengths);

  html += `<h3 class="sim-subhead">Spanning en blokkeren</h3>`;
  html += `<p class="hint">De nummer 2 stond bij winst gemiddeld <b>${avgGap.toFixed(1)}</b> opdracht(en) achter — <b>${nailBiterPct.toFixed(0)}%</b> van de potjes werd met precies 1 opdracht verschil beslist. In <b>${blockedPct.toFixed(1)}%</b> van de beurten kwam een speler ergens in zijn zoektocht naar de beste route een bezet vakje tegen (niet per se de uiteindelijk gekozen route).</p>`;

  // ---------- energie ----------
  // Zolang er niets uitgegeven wordt, is dit een nulmeting: hoeveel komt er binnen, hoe snel
  // zit je aan het plafond en hoe vaak kun je een actie van N energie betalen. Precies de
  // cijfers die je nodig hebt om te bepalen wat zo'n actie mag kosten.
  const energyTurns = extra.energyLevels.reduce((a, b) => a + b, 0);
  const energyAvg = energyTurns
    ? extra.energyLevels.reduce((s, c, lvl) => s + c * lvl, 0) / energyTurns : 0;
  const energyAtCap = energyTurns ? (extra.energyLevels[ENERGY_MAX] / energyTurns * 100) : 0;
  const energyWastePct = extra.energyRolled ? (extra.energyWasted / extra.energyRolled * 100) : 0;
  const energyPerTurn = energyTurns ? (extra.energyRolled / energyTurns) : 0;

  // kans dat je aan het begin van een beurt minstens N energie hebt = kans dat je een actie
  // van N kunt betalen
  let atLeast = 0;
  const affordRows = [];
  for (let lvl = ENERGY_MAX; lvl >= 1; lvl--){
    atLeast += extra.energyLevels[lvl];
    affordRows.unshift(`<tr><td>${lvl} energie</td><td class="num">${energyTurns ? (atLeast / energyTurns * 100).toFixed(1) : '0.0'}%</td></tr>`);
  }
  const maxLevel = Math.max(...extra.energyLevels);
  const energyBars = Array.from(extra.energyLevels, (c, lvl) => {
    const h = maxLevel ? Math.round((c / maxLevel) * 100) : 0;
    const tick = (lvl % 2 === 0) ? `<span class="sim-hist-tick">${lvl}</span>` : '';
    return `<div class="sim-hist-bar-wrap" title="${lvl} energie: ${energyTurns ? (c / energyTurns * 100).toFixed(1) : 0}% van de beurten"><div class="sim-hist-bar energy" style="height:${h}%"></div>${tick}</div>`;
  }).join('');

  // Welke actie wint? Elk potje heeft precies één speler per strategie, willekeurig over de
  // startposities verdeeld, dus dit is een zuiver onderling toernooi.
  const stratRows = ENERGY_STRATEGIES.map(id => {
    const s = strategyStats[id];
    const act = ENERGY_ACTIONS[id];
    const winPct = s.games ? (s.wins / s.games * 100) : 0;
    const moe = simMarginOfError(s.wins, s.games);
    const top2Pct = s.games ? (s.top2 / s.games * 100) : 0;
    const avgRank = s.games ? (s.rankSum / s.games) : 0;
    const usesPerGame = s.games ? (s.uses / s.games) : 0;
    const cost = act.cost ? `${act.cost} energie` : '—';
    return `<tr><td>${act.name} <span class="sub">(${cost})</span></td>` +
      `<td class="num">${winPct.toFixed(1)}% ± ${moe.toFixed(1)}</td>` +
      `<td class="num">${top2Pct.toFixed(1)}%</td>` +
      `<td class="num">${avgRank.toFixed(2)}</td>` +
      `<td class="num">${usesPerGame.toFixed(1)}</td></tr>`;
  }).join('');
  html += `<h3 class="sim-subhead">Welke energie-actie wint?</h3>`;
  html += `<table class="sim-table"><thead><tr><th>Strategie</th><th>Winst% (±95%-marge)</th><th>Top 2</th><th>Gem. plaats</th><th>Keer ingezet</th></tr></thead><tbody>${stratRows}</tbody></table>`;
  html += `<p class="hint">Elk potje zit één speler per strategie, geloot over de startposities. Een speler zet zijn actie in zodra hij 'm kan betalen — Herprioritering alleen als de volgende opdracht daadwerkelijk dichterbij ligt, en Noodtransport alleen als de gewone zet de opdracht nog niet pakte. Bij vier gelijkwaardige strategieën staat iedereen op 25% winst en gemiddelde plaats 2,50; wie daar significant boven zit, is te sterk.</p>`;

  // ---------- beloningskaarten ----------
  const cardRows = ACTION_CARD_IDS.map(id => {
    const act = ACTION_CARDS[id];
    const uses = extra.cardUses[id];
    const perGame = played ? (uses / played) : 0;
    return `<tr><td>${act.name} <span class="sub">${act.hint}</span></td><td class="num">${perGame.toFixed(2)}</td></tr>`;
  }).join('');
  const drawsPerGame = played ? (extra.cardDraws / played) : 0;
  const handFullPct = extra.cardDraws + extra.handFullOnBank
    ? (extra.handFullOnBank / (extra.cardDraws + extra.handFullOnBank) * 100) : 0;
  html += `<h3 class="sim-subhead">Beloningskaarten</h3>`;
  html += `<p class="hint">Wie een opdracht bereikt trekt een kaart van een gedeelde stapel van 20 (2 van elk type), tenzij zijn hand al vol is (max 2). Gemiddeld <b>${drawsPerGame.toFixed(1)}</b> kaarten getrokken per potje (alle 4 spelers samen); <b>${handFullPct.toFixed(1)}%</b> van de trekkans ging verloren aan een volle hand.</p>`;
  html += `<table class="sim-table"><thead><tr><th>Kaart</th><th>Keer gebruikt per potje</th></tr></thead><tbody>${cardRows}</tbody></table>`;
  html += `<p class="hint">Prioriteitspas heeft in deze simulatie geen mechanisch effect (het is pure informatie voor een mens aan tafel) en wordt daarom nooit ingezet — 0,00 hierboven is dus verwacht, niet een bug. Een getrokken Prioriteitspas bezet wel een handslot tot het potje afloopt.</p>`;

  html += `<h3 class="sim-subhead">Energie</h3>`;
  html += `<p class="hint">De energiesteen (<b>${ENERGY_DIE_FACES.map(f => f || '–').join(' ')}</b>) rolt elke beurt mee, gemiddeld <b>${energyPerTurn.toFixed(2)}</b> per beurt, met een plafond van <b>${ENERGY_MAX}</b>. Onderstaande cijfers zijn over alle vier de strategieën samen — de spaarder die nooit uitgeeft trekt het gemiddelde en het plafondverlies omhoog.</p>`;
  html += `<p class="hint">Een speler heeft gemiddeld <b>${energyAvg.toFixed(1)}</b> energie op zak, staat <b>${energyAtCap.toFixed(1)}%</b> van zijn beurten op het plafond, en <b>${energyWastePct.toFixed(1)}%</b> van alle gerolde energie gaat daardoor verloren.</p>`;
  html += `<p class="hint" style="margin-top:10px;">Verdeling van de energievoorraad over alle beurten (0 links, ${ENERGY_MAX} rechts):</p>`;
  html += `<div class="sim-hist">${energyBars}</div>`;
  html += `<table class="sim-table"><thead><tr><th>Kosten van een actie</th><th>Aandeel beurten waarin je 'm kunt betalen</th></tr></thead><tbody>${affordRows.join('')}</tbody></table>`;

  html += `<h3 class="sim-subhead">Drukte op het bord</h3>`;
  html += `<p class="hint">Hoe vaak elk vakje betreden werd over alle ${played} meegetelde potjes — laat bottleneck-gangen en nauwelijks gebruikte hoekjes zien.</p>`;
  html += renderHeatmap(graph, heatmap);
  html += `<p class="hint" style="margin-top:12px;">Koudste tegels — de kandidaten voor een "lus zonder opdracht waar niemand komt":</p>`;
  html += renderColdZones(graph, heatmap);

  simResultsEl.innerHTML = html;
  simStatusEl.innerHTML = `<span class="ok">✓ Klaar in ${elapsedMs.toFixed(0)} ms</span>`;
}

function runSimulationBatch(){
  const reach = analyseCellReachability();
  if (reach.unreachable.length > 0){
    simStatusEl.innerHTML = `<span class="bad">✕ Dit bord heeft ${reach.unreachable.length} onbereikbare vakjes (roze omrand op de kaart) — pas de indeling aan voordat je simuleert.</span>`;
    simResultsEl.innerHTML = '';
    return;
  }

  // de tegel-editor staat toe dat een 2.x/3.x-label per ongeluk ontbreekt of dubbel
  // voorkomt; zonder deze check crasht de simulatie stil in de achtergrond en blijft
  // de knop voor altijd op "Simuleren…" hangen.
  const graphCheck = buildSimGraph();
  const missing = [...SIM_QUEST_LABELS, ...SIM_START_LABELS].filter(lbl =>
    graphCheck.questCells[lbl] === undefined && graphCheck.startCells[lbl] === undefined);
  if (missing.length){
    simStatusEl.innerHTML = `<span class="bad">✕ Deze vakjes ontbreken op het bord: ${missing.join(', ')} — zet ze terug via de tegel-editor voordat je simuleert.</span>`;
    simResultsEl.innerHTML = '';
    return;
  }

  let n = parseInt(simCountEl.value, 10);
  if (!Number.isFinite(n)) n = 2000;
  n = Math.max(100, Math.min(20000, n));
  simCountEl.value = n;

  simStatusEl.innerHTML = `<span class="sub">Simuleren…</span>`;
  simResultsEl.innerHTML = '';

  setTimeout(() => {
    try {
      const graph = buildSimGraph();
      const rand = mulberry32(Math.floor(Math.random() * 4294967296));
      const t0 = performance.now();

      const startWins = {}, startTurnsSum = {}, startRanks = {};
      for (const lbl of SIM_START_LABELS){
        startWins[lbl] = 0;
        startTurnsSum[lbl] = 0;
        startRanks[lbl] = [0, 0, 0, 0];   // hoe vaak deze startpositie 1e/2e/3e/4e werd
      }
      const questStats = {};
      for (const lbl of SIM_QUEST_LABELS) questStats[lbl] = { turns: 0, count: 0 };
      const strategyStats = {};
      for (const id of ENERGY_STRATEGIES) strategyStats[id] = { games: 0, wins: 0, top2: 0, rankSum: 0, uses: 0 };
      const seatWins = [0, 0, 0, 0];
      const gameLengths = [];
      const heatmap = new Int32Array(graph.N);
      const cardUses = {};
      for (const id of ACTION_CARD_IDS) cardUses[id] = 0;
      const extra = {
        totalTurns: 0, blockedTurns: 0, winGapSum: 0, winGapCount: 0, nailBiters: 0,
        energyRolled: 0, energyWasted: 0,
        energyLevels: new Int32Array(ENERGY_MAX + 1),   // hoe vaak stond een speler op N energie
        cardDraws: 0, handFullOnBank: 0, cardUses,
      };
      let stuckCount = 0;

      for (let i = 0; i < n; i++){
        const result = simulateOneGame(graph, rand, heatmap, questStats, extra);
        if (result.stuck){ stuckCount++; continue; }
        for (const p of result.players){
          startRanks[p.startLabel][p.rank - 1]++;
          const st = strategyStats[p.strategy];
          st.games++;
          st.rankSum += p.rank;
          st.uses += p.actionUses;
          if (p.rank === 1) st.wins++;
          if (p.rank <= 2) st.top2++;
        }
        const winner = result.players.find(p => p.rank === 1);
        startWins[winner.startLabel]++;
        startTurnsSum[winner.startLabel] += winner.finishTurn;
        seatWins[winner.seat]++;
        gameLengths.push(result.turns);
      }

      const elapsedMs = performance.now() - t0;
      renderSimResults({ n, stuckCount, startWins, startTurnsSum, startRanks, strategyStats, seatWins, gameLengths, questStats, extra, graph, heatmap, elapsedMs });
    } catch (err){
      simStatusEl.innerHTML = `<span class="bad">✕ Simulatie mislukt: ${err.message}</span>`;
    }
  }, 20);
}

if (btnSimulate) btnSimulate.addEventListener('click', runSimulationBatch);
