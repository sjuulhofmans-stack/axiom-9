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
// Plaatsen worden pas toegekend nadat de HELE ronde is afgemaakt (iedereen die nog mag
// spelen krijgt zijn beurt), niet zodra iemand toevallig als eerste in de beurtvolgorde
// zijn 6e opdracht haalt — zie resolveRoundFinishers() hieronder. Wie in dezelfde ronde
// finisht deelt een plaats bij gelijke stand (zelfde energie ÉN evenveel actiekaarten in
// de hand); anders beslist de meeste energie, dan de meeste actiekaarten.
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

// ---------- gelijke stand: de ronde wordt afgemaakt vóórdat een plaats vaststaat ----------
// Vroeger kreeg de eerste speler die zijn 6e opdracht voltooide meteen rank 1, en werd het
// potje meteen beëindigd zodra genoeg spelers binnen waren — puur op basis van wie toevallig
// EERDER in de beurtvolgorde zat. Gemeten: de speler die als eerste aan zet is wint daardoor
// systematisch vaker (29,6% tegen 20,5% voor de laatste, over 8000 potjes) — geen speleigenschap,
// een artefact van de beurtvolgorde. Nu wordt éérst de HELE ronde afgemaakt (iedereen die nog
// mag spelen krijgt zijn beurt), en pas daarna worden de plekken van iedereen die deze ronde
// finishte in één keer verdeeld: bij gelijke stand (zelfde energie ÉN evenveel actiekaarten in de
// hand) delen ze de plaats, in plaats van dat beurtvolgorde de doorslag geeft.
//
// `alreadyFinished` = hoeveel spelers vóór deze ronde al een rank hadden. Kent aan elke speler in
// `finishers` een `rank` (skip-stijl bij een tie: 1,1,3 bij een 2-weg tie op de 1e plek) en
// `rankShare` (grootte van de tie-groep, voor eerlijke credit in de statistieken) toe.
// Geeft de tie-groepen terug (voor logging in 96-walk.js), gesorteerd van beste naar slechtste.
function resolveRoundFinishers(finishers, alreadyFinished){
  const sorted = finishers.slice().sort((a, b) => (b.energy - a.energy) || (b.cards.length - a.cards.length));
  const groups = [];
  for (const p of sorted){
    const last = groups[groups.length - 1];
    if (last && last[0].energy === p.energy && last[0].cards.length === p.cards.length) last.push(p);
    else groups.push([p]);
  }
  let rank = alreadyFinished + 1;
  for (const group of groups){
    for (const p of group){ p.rank = rank; p.rankShare = group.length; }
    rank += group.length;
  }
  return groups;
}
// welk deel van een tie-groep (grootte `groupSize`, begint op `startRank`) binnen rank <= threshold
// valt — bv. een 2-weg tie op de 1e/2e plek telt voor precies de helft mee als "gewonnen" (T=1)
// maar volledig als "top 2" (T=2). Voor een niet-gedeelde plek (groupSize 1) reduceert dit gewoon
// tot de vertrouwde 0-of-1 boolean-achtige uitkomst.
function rankOverlapFraction(startRank, groupSize, threshold){
  const endRank = startRank + groupSize - 1;
  const overlap = Math.max(0, Math.min(endRank, threshold) - startRank + 1);
  return overlap / groupSize;
}
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
// gedeelde lege verzameling voor "niets blokkeert de route" (Blinde Vlek) — scheelt een
// nieuwe Set per beurt in een lus die miljoenen keren draait
const SIM_EMPTY_SET = new Set();
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

// Herprioritering was 6 energie voor een AANTOONBAAR betere wissel (zie energyReorderTarget
// hieronder) — maar dat vereist dat je de volgende opdrachtkaart al kent vóór je beslist, en
// die ligt fysiek dichtgeslagen in je eigen stapeltje. Een speler aan tafel kan dus nooit doen
// wat energyReorderTarget doet; hij kan hooguit gokken op basis van wat wél zichtbaar is, de
// afstand tot zijn HUIDIGE opdracht (dat vakje ligt open op het bord). blindReorderTarget()
// hieronder modelleert precies dat: wissel (blind, kan tegenvallen) zodra je al verder dan
// REORDER_BLIND_THRESHOLD van je huidige opdracht af staat.
// Doorgerekend met een volledige potjes-simulatie (6000 potjes, zelfde opzet als de
// Stuwstoot/Noodtransport-sweep hierboven): bij 6 energie en de optimale drempel wint blind
// gespeelde Herprioritering maar 24,1% (tegen 32,1% voor de alwetende versie) — een blinde gok
// is dus geen gegarandeerde verbetering meer, dus moet hij ook minder kosten. Kosten-sweep bij
// die drempel (T=31):
//   6 energie → 24,1%   5 → 26,3%   4 → 27,2%   3 → 28,1%   2 → 30,0%   1 → 33,1%
// Bij 2 energie clusteren Stuwstoot/Herprioritering/Noodtransport rond 30-32,5%, in lijn met
// de alwetende referentie (31,0/32,1/31,0) — dat is de nieuwe prijs.
const REORDER_BLIND_THRESHOLD = 31;

// `hint` staat OP het kaartje en moet daarom kort blijven — het kaartje is 108px breed en
// een langere zin duwde de titel er eerder letterlijk uit. De strategische toelichting hoort
// in `note`, die alleen in de tooltip terechtkomt (zie renderEnergySoloButton in 97-solo.js).
const ENERGY_ACTIONS = {
  boost:   { cost: 3,  name: 'Stuwstoot',       hint: 'gooi met 3 loopstenen',
             note: 'Een derde loopsteen erbij, dus gemiddeld 3,5 stappen extra deze beurt.' },
  reorder: { cost: 2,  name: 'Herprioritering', hint: 'ruil blind met je volgende opdracht',
             note: 'Je ziet niet wat je ervoor terugkrijgt — alleen de moeite waard als je nog ver van je huidige opdracht af staat.' },
  jump:    { cost: 10, name: 'Noodtransport',   hint: `spring vrij tot ${ENERGY_JUMP_RANGE} vakjes ver`,
             note: 'Geen worp en geen geen-U-turn-regel: je verplaatst je vrij over het bord. Kost je hele voorraad.' },
  none:    { cost: 0,  name: 'Geen energie',    hint: 'spaart, geeft nooit uit',
             note: 'Doet niets — staat in de simulatie als ijkpunt tegenover de drie strategieën.' },
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

// Wisselt alleen als de volgende opdracht in je stapel AANTOONBAAR dichterbij ligt dan de
// huidige — vereist dus kennis van de nog dichtgeslagen volgende kaart. Gebruikt voor
// Herkalibratie (gratis kaart): die is thematisch een vooruitziende blik, dus mag "weten".
// Voor de betaalde energie-actie Herprioritering NIET meer gebruiken — zie blindReorderTarget.
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

// Blinde variant voor de betaalde energie-actie Herprioritering: kent ALLEEN dCur (je huidige
// opdrachtvakje ligt open op het bord), niet dAlt (de volgende kaart ligt dichtgeslagen in je
// stapeltje). Wisselt daarom niet op basis van een vergelijking, maar op een drempel op wat je
// wél weet — precies de rationele grens voor een speler die moet gokken: alleen de moeite waard
// als je al verder dan het bord gemiddeld is (REORDER_BLIND_THRESHOLD) van je huidige doel af
// staat. Kan, anders dan energyReorderTarget, in het echt tegenvallen.
function blindReorderTarget(graph, player, fromKey, threshold){
  const curLabel = player.order[player.nextIdx];
  const altLabel = player.order[player.nextIdx + 1];
  if (altLabel === undefined) return null;
  const stamp = simBfsDistances(graph, fromKey);
  const dCur = simDistLookup(stamp, graph.questCells[curLabel]);
  if (dCur < 0 || dCur <= threshold) return null;
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
// Een kaart spelen en een energie-actie inzetten zijn TWEE LOSSE sloten per beurt (max 1 van
// elk) — vroeger deelden ze één gezamenlijk slot. Zie de uitgebreide toelichting bij
// `energyActionUsed`/`cardActionUsed` in simulateOneGame() voor de drie paren (Stuwlading/
// Stuwstoot, Herkalibratie/Herprioritering, Blinde Vlek/Noodtransport) die elkaar nog wél
// uitsluiten omdat ze hetzelfde mechanische effect hebben. Binnen het kaart-slot is de
// voorrangsvolgorde: eerst de energie-kaarten (ze horen bij de worp die net gevallen is), dan de
// doelkaarten, dan de bewegingskaarten, en als laatste de reactieve kaart (Blinde Vlek, die pas
// afgaat als je route daadwerkelijk geblokkeerd raakt). Prioriteitspas heeft geen meetbaar effect in
// deze bot-simulatie (het is pure informatie voor een menselijke speler) en wordt daarom nooit
// actief gespeeld door bots — een mens kan 'm wel altijd zelf spelen of afleggen.
const ACTION_CARDS = {
  boots:     { name: 'Zwaartekracht-laarzen', hint: '10 stappen rechtdoor, geen bochten' },
  ration:    { name: 'Noodrantsoen',          hint: '+3 energie direct' },
  short:     { name: 'Kortsluiting',          hint: 'tegenstander mist zijn energiesteen' },
  blind:     { name: 'Blinde Vlek',           hint: 'loop door tegenstanders heen — eindig er niet op' },
  recal:     { name: 'Herkalibratie',         hint: 'gratis wissel met de volgende opdracht' },
  shove:     { name: 'Duwstoot',              hint: 'duw een naastgelegen tegenstander weg' },
  boostcell: { name: 'Stuwlading',            hint: 'gratis derde loopsteen' },
  condenser: { name: 'Condensator',           hint: 'je energiesteen telt in je volgende beurt dubbel' },
  reroll:    { name: 'Koerscorrectie',        hint: 'gooi je worp opnieuw' },
  scan:      { name: 'Prioriteitspas',        hint: 'bekijk de volgende opdracht van een tegenstander' },
  lockdown:  { name: 'Vergrendeling',         hint: 'tegenstander mist energie- én kaartactie' },
  outage:    { name: 'Stroomonderbreking',    hint: 'tegenstander gooit 2 stappen minder' },
  barrier:   { name: 'Noodbarrière',          hint: 'blokkeert tijdelijk een vakje naast een tegenstander' },
  recoil:    { name: 'Terugtrekbevel',        hint: 'duwt een tegenstander tot 2 vakjes terug' },
  jam:       { name: 'Signaalstoring',        hint: 'saboteert de eerstvolgende doelwissel van een tegenstander' },
  trade:     { name: 'Kaartenruil',           hint: 'ruil een kaart met de aflegstapel' },
  fastlane:  { name: 'Snelroute',             hint: 'geen-U-turn-regel geldt deze beurt niet voor jou' },
  peek:      { name: 'Herinnering',           hint: 'bekijk en herschik de bovenste 3 kaarten van de trekstapel' },
};
const ACTION_CARD_IDS = Object.keys(ACTION_CARDS);
const ACTION_CARD_HAND_MAX = 2;

// ---------- kaart-illustraties ----------
// Geen losse plaatjes (dat blaast het éénbestands-HTML op) — elke kaart is een klein
// lijntekening-icoon in inline SVG, opgebouwd uit dezelfde stroke-taal als de rest van de
// HUD (currentColor, ronde lijnuiteinden). `tint` groepeert de kaarten thematisch in de
// bestaande kleurtaal: amber = beweging, groen = energie, blauw = nut/utility,
// rood = verstoring, gedimd = puur informatief (Prioriteitspas).
const ACTION_CARD_TINTS = {
  boots: 'amber', ration: 'start', short: 'danger', blind: 'quest', recal: 'quest',
  shove: 'danger', boostcell: 'amber', condenser: 'start', reroll: 'amber', scan: 'dim',
  lockdown: 'danger', outage: 'danger', barrier: 'danger', recoil: 'danger', jam: 'danger',
  trade: 'quest', fastlane: 'amber', peek: 'quest',
};
const ACTION_CARD_ICONS = {
  boots: `<path d="M14 34 L14 18 Q14 14 18 14 L22 14 L22 24 L30 24 Q34 24 34 28 L34 34 Z"/>
    <line x1="6" y1="16" x2="12" y2="16"/><line x1="4" y1="22" x2="11" y2="22"/><line x1="6" y1="28" x2="12" y2="28"/>`,
  ration: `<rect x="14" y="12" width="20" height="26" rx="3"/>
    <rect x="20" y="7" width="8" height="5" rx="1" fill="currentColor" stroke="none"/>
    <path d="M26 18 L20 27 L24 27 L22 34 L30 24 L25 24 Z" fill="currentColor" stroke="none"/>`,
  short: `<path d="M8 24 L20 24 L16 16 L28 16"/><path d="M28 16 L24 32 L40 22"/>
    <circle cx="24" cy="24" r="2.6" fill="currentColor" stroke="none"/>
    <line x1="30" y1="12" x2="34" y2="8"/><line x1="35" y1="18" x2="40" y2="16"/><line x1="32" y1="27" x2="37" y2="31"/>`,
  blind: `<path d="M5 24 Q24 9 43 24 Q24 39 5 24 Z"/><circle cx="24" cy="24" r="6"/>
    <circle cx="24" cy="24" r="2" fill="currentColor" stroke="none"/>
    <line x1="4" y1="20.5" x2="44" y2="20.5" stroke-dasharray="2.5 3"/>
    <line x1="4" y1="27.5" x2="44" y2="27.5" stroke-dasharray="2.5 3"/>`,
  recal: `<path d="M33 13 A15 15 0 1 0 35 33"/><path d="M33 13 L28 12.5 M33 13 L32.3 18"/>
    <path d="M35 33 L40 33.5 M35 33 L35.7 28"/>
    <circle cx="21" cy="24" r="3.2"/><line x1="21" y1="19" x2="21" y2="21.5"/><line x1="21" y1="26.5" x2="21" y2="29"/>
    <line x1="16" y1="24" x2="18.5" y2="24"/><line x1="23.5" y1="24" x2="26" y2="24"/>`,
  shove: `<circle cx="32" cy="24" r="7.5"/><line x1="5" y1="24" x2="20" y2="24"/><path d="M14 17.5 L20.5 24 L14 30.5"/>`,
  boostcell: `<rect x="5" y="30" width="10" height="10" rx="2"/><circle cx="10" cy="35" r="1.3" fill="currentColor" stroke="none"/>
    <rect x="19" y="19" width="10" height="10" rx="2"/>
    <circle cx="22" cy="22" r="1.1" fill="currentColor" stroke="none"/><circle cx="26" cy="26" r="1.1" fill="currentColor" stroke="none"/>
    <rect x="33" y="8" width="10" height="10" rx="2"/>
    <circle cx="36" cy="11" r="1" fill="currentColor" stroke="none"/><circle cx="40" cy="11" r="1" fill="currentColor" stroke="none"/><circle cx="36" cy="15" r="1" fill="currentColor" stroke="none"/>`,
  // condensator: twee platen met een aansluiting links/rechts en een vonk in de spleet
  condenser: `<line x1="18" y1="13" x2="18" y2="35"/><line x1="30" y1="13" x2="30" y2="35"/>
    <line x1="5" y1="24" x2="18" y2="24"/><line x1="30" y1="24" x2="43" y2="24"/>
    <path d="M26.5 16 L21 24.5 L25 24.5 L21.5 32" fill="none"/>`,
  // koerscorrectie: een loopsteen met twee cirkelpijlen eromheen (opnieuw gooien)
  reroll: `<rect x="17" y="17" width="16" height="16" rx="3"/>
    <circle cx="22" cy="22" r="1.5" fill="currentColor" stroke="none"/><circle cx="28" cy="28" r="1.5" fill="currentColor" stroke="none"/>
    <path d="M11 21 A15 15 0 0 1 34 10"/><path d="M34 10 L29 9.5 M34 10 L33 14.5"/>
    <path d="M37 27 A15 15 0 0 1 14 38"/><path d="M14 38 L19 38.5 M14 38 L15 33.5"/>`,
  scan: `<rect x="6" y="12" width="21" height="27" rx="2"/><line x1="10.5" y1="19" x2="22.5" y2="19"/><line x1="10.5" y1="24.5" x2="22.5" y2="24.5"/>
    <circle cx="31.5" cy="30.5" r="8"/><line x1="37.2" y1="36.2" x2="43" y2="42"/>`,
  lockdown: `<rect x="14" y="22" width="20" height="16" rx="2"/><path d="M18 22 L18 15 A6 6 0 0 1 30 15 L30 22"/>
    <circle cx="24" cy="29" r="2" fill="currentColor" stroke="none"/><line x1="24" y1="31" x2="24" y2="34"/>`,
  outage: `<path d="M26 6 L14 26 L22 26 L18 42 L34 20 L26 20 Z"/><line x1="8" y1="8" x2="40" y2="40"/>`,
  barrier: `<line x1="6" y1="15" x2="6" y2="38"/><line x1="42" y1="15" x2="42" y2="38"/>
    <rect x="6" y="19" width="36" height="7" rx="1.5" transform="rotate(-6 24 22.5)"/>
    <rect x="6" y="30" width="36" height="7" rx="1.5" transform="rotate(-6 24 33.5)"/>`,
  recoil: `<path d="M32 24 L14 24 M14 24 L21 17 M14 24 L21 31"/>
    <line x1="34" y1="14" x2="38" y2="14"/><line x1="34" y1="24" x2="40" y2="24"/><line x1="34" y1="34" x2="38" y2="34"/>`,
  jam: `<line x1="24" y1="10" x2="24" y2="40"/><line x1="16" y1="40" x2="32" y2="40"/>
    <path d="M14 18 A14 14 0 0 1 34 18"/><path d="M18 22 A8 8 0 0 1 30 22"/><line x1="6" y1="8" x2="42" y2="40"/>`,
  trade: `<path d="M8 18 L34 18 M28 12 L34 18 L28 24"/><path d="M40 30 L14 30 M20 24 L14 30 L20 36"/>`,
  fastlane: `<line x1="6" y1="24" x2="36" y2="24"/><path d="M30 17 L37 24 L30 31"/>
    <line x1="12" y1="12" x2="12" y2="36"/><line x1="20" y1="12" x2="20" y2="36"/>`,
  peek: `<rect x="8" y="26" width="14" height="18" rx="2"/><rect x="26" y="26" width="14" height="18" rx="2"/>
    <path d="M12 12 Q24 2 36 12 Q24 22 12 12 Z"/><circle cx="24" cy="12" r="3.4"/>`,
};

// Bouwt één kaart: `size` is 'sm' (badge in de standenbalk) of 'lg' (jouw hand / getrokken-
// kaart in de solo-modus). `interactive` voegt een button-rol toe voor de solo-modus.
function renderActionCardFace(id, { size = 'lg', disabled = false, interactive = false, titleOverride = null } = {}){
  const act = ACTION_CARDS[id];
  const tint = ACTION_CARD_TINTS[id];
  const tag = interactive ? 'button' : 'div';
  const attrs = interactive ? `type="button" data-card="${id}"${disabled ? ' disabled' : ''}` : '';
  const title = titleOverride || `${act.name} — ${act.hint}`;
  // beloningskaarten kosten nooit energie — vandaar altijd "gratis", niet af te lezen uit
  // een costveld (dat hebben ze niet, in tegenstelling tot ENERGY_ACTIONS)
  return `<${tag} class="action-card action-card--${size} action-card--${tint}${disabled ? ' is-disabled' : ''}" ${attrs} title="${title}">
    <span class="action-card-cost">gratis</span>
    <svg class="action-card-icon" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">${ACTION_CARD_ICONS[id]}</svg>
    <span class="action-card-name">${act.name}</span>
    ${size === 'lg' ? `<span class="action-card-hint">${act.hint}</span>` : ''}
  </${tag}>`;
}

// Eén kaart op ware kaartverhouding voor het kaartvenster. Bestaat er een fotokaart uit het
// Canva-ontwerp (src/assets/cards/<id>.webp), dan wordt die getoond; zo niet, dan tekent deze
// functie een kaart in dezelfde indeling na met het inline SVG-icoon. Zo blijft het venster
// werken voor kaarten waarvoor nog geen ontwerp gemaakt is.
function renderPrintedCardFace(id){
  const img = ACTION_CARD_IMAGES[id];
  if (img) return `<img src="${img}" alt="${ACTION_CARDS[id].name}">`;
  const act = ACTION_CARDS[id];
  const cat = { amber: 'BEWEGING', start: 'ENERGIE', danger: 'VERSTORING', quest: 'NUT', dim: 'INFORMATIE' };
  return `<span class="card-drawn">
    <span class="card-drawn-kicker">ACTIEKAART</span>
    <span class="card-drawn-title">${act.name}</span>
    <svg class="card-drawn-icon" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">${ACTION_CARD_ICONS[id]}</svg>
    <span class="card-drawn-rule"></span>
    <span class="card-drawn-text">${act.hint}</span>
    <span class="card-drawn-cat">${cat[ACTION_CARD_TINTS[id]] || ''}</span>
  </span>`;
}

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
// Loopt vanaf `fromKey` een vaste richting `dir` uit tot `maxSteps`, geen bochten. Stopt bij
// een muur of een bezet vakje; `bankedAt` is de padindex waarop het doel geraakt werd (-1 als
// niet). Gedeeld door de bot-AI (resolveGravityBoots) en de solo-modus (die de speler zelf een
// richting laat kiezen in plaats van 'm automatisch te laten bepalen).
function walkStraightLine(graph, fromKey, dir, maxSteps, occupied, targetKey){
  const { adjKey, adjDir } = graph;
  let cur = fromKey;
  const path = [cur];
  let wasBlocked = false;
  let bankedAt = -1;
  for (let s = 0; s < maxSteps; s++){
    const neigh = adjKey[cur], dirs = adjDir[cur];
    let next = -1;
    for (let j = 0; j < dirs.length; j++) if (dirs[j] === dir){ next = neigh[j]; break; }
    if (next === -1) break;           // muur: deze richting stopt hier
    if (occupied.has(next)){ wasBlocked = true; break; }
    cur = next;
    path.push(cur);
    if (targetKey !== undefined && cur === targetKey){ bankedAt = path.length - 1; break; }
  }
  return { path, wasBlocked, bankedAt };
}
// alle (tot 4) rechte richtingen vanaf `fromKey`, voor de solo-modus: de speler kiest zelf.
function gravityBootsOptions(graph, fromKey, maxSteps, occupied, targetKey){
  const options = [];
  for (let d = 0; d < 4; d++){
    const line = walkStraightLine(graph, fromKey, d, maxSteps, occupied, targetKey);
    if (line.path.length > 1) options.push({ dir: d, ...line });
  }
  return options;
}

function resolveGravityBoots(graph, fromKey, maxSteps, occupied, targetKey){
  const candidates = [];
  for (let d = 0; d < 4; d++){
    const line = walkStraightLine(graph, fromKey, d, maxSteps, occupied, targetKey);
    if (line.path.length > 1) candidates.push(line);
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

// Kiest de koploper onder de tegenstanders die nog niet door DEZE kaart geraakt zijn.
// Bij een gelijke stand wordt er eerlijk geloot (reservoir sampling) i.p.v. altijd de
// eerstgevondene te pakken — dat laatste benadeelde startpositie 3.1 stelselmatig.
function pickLeaderTarget(players, selfIdx, alreadyAffected, rand){
  let best = null, bestCount = -1, ties = 0;
  for (const p of players){
    if (p.idx === selfIdx || p.rank || alreadyAffected(p)) continue;
    if (p.completed > bestCount){ best = p; bestCount = p.completed; ties = 1; }
    else if (p.completed === bestCount){ ties++; if (rand() < 1 / ties) best = p; }
  }
  return best;
}

function pickBarrierTarget(graph, players, occupiedSet, selfIdx, rand){
  const victim = pickLeaderTarget(players, selfIdx, p => p.barrierCell !== null, rand);
  if (!victim) return null;
  const spot = graph.adjKey[victim.pos].find(k => !occupiedSet.has(k));
  return spot === undefined ? null : { player: victim, cell: spot };
}

// Terugtrekbevel: duwt een aangrenzende tegenstander tot 2 vakjes TERUG langs de richting
// waaruit hij net kwam. Wie nog nooit gelopen heeft (lastDir === -1) komt niet in aanmerking.
function pickRecoilMove(graph, players, occupiedSet, selfIdx){
  const self = players[selfIdx];
  const neigh = graph.adjKey[self.pos];
  let best = null, bestSteps = 0;
  for (const nk of neigh){
    const target = players.find(p => !p.rank && p.idx !== selfIdx && p.pos === nk);
    if (!target || target.lastDir === -1) continue;
    const revDir = (target.lastDir + 2) % 4;
    let cur = target.pos, steps = 0;
    for (let s = 0; s < 2; s++){
      const dirs = graph.adjDir[cur], keys = graph.adjKey[cur];
      let nextKey = -1;
      for (let j = 0; j < dirs.length; j++) if (dirs[j] === revDir){ nextKey = keys[j]; break; }
      if (nextKey === -1 || occupiedSet.has(nextKey)) break;
      cur = nextKey; steps++;
    }
    if (steps > bestSteps){ bestSteps = steps; best = { player: target, toKey: cur }; }
  }
  return best;
}

function performCardTrade(player, giveId, deck){
  const i = player.cards.indexOf(giveId);
  if (i === -1 || !deck.discard.length) return;
  const received = deck.discard.pop();
  deck.discard.push(giveId);
  player.cards[i] = received;
}

function performPeekReorder(deck){
  const n = Math.min(3, deck.draw.length);
  if (n === 0) return;
  const preferred = ['boots', 'boostcell'];
  const top = deck.draw.slice(deck.draw.length - n);
  top.sort((a, b) => Number(preferred.includes(a)) - Number(preferred.includes(b)));
  for (let i = 0; i < n; i++) deck.draw[deck.draw.length - n + i] = top[i];
}

function lastStepDirection(graph, path){
  if (!path || path.length < 2) return -1;
  const from = path[path.length - 2], to = path[path.length - 1];
  const neigh = graph.adjKey[from], dirs = graph.adjDir[from];
  for (let j = 0; j < neigh.length; j++) if (neigh[j] === to) return dirs[j];
  return -1;
}

// wisselt je huidige opdracht met de volgende in je stapel; nog een keer aanroepen draait
// de wissel weer terug (gebruikt door Signaalstoring)
function applyReorderSwap(player){
  const curLabel = player.order[player.nextIdx];
  const altLabel = player.order[player.nextIdx + 1];
  player.order[player.nextIdx] = altLabel;
  player.order[player.nextIdx + 1] = curLabel;
  return altLabel;
}

// Kortsluiting: raakt de speler die op dit moment de meeste opdrachten heeft (bij gelijke
// stand de eerste in spelervolgorde), voor zover die nog meespeelt en niet al geraakt is.
function pickShortCircuitTarget(players, selfIdx, rand){
  return pickLeaderTarget(players, selfIdx, p => p.skipEnergyRoll, rand);
}

// Duwstoot: onder de tegenstanders die nu aan mij grenzen, kies de zet die hun afstand tot
// hún eigen doel het meest vergroot — en alleen toepassen als dat ook echt iets oplevert.
// Duwstoot duwt een AANGRENZENDE tegenstander SHOVE_DISTANCE vakjes ver in een WILLEKEURIGE
// richting — eerder stoppend bij een muur of een andere speler. Je kiest dus alleen wie je
// duwt, niet waarheen: waar hij belandt is een gok.
const SHOVE_DISTANCE = 4;
// Waar komt `target` terecht? Geeft { key, steps, dir } terug, of null als hij in geen enkele
// richting ook maar één stap kan zetten (helemaal klem).
// Er wordt geloot onder de richtingen waarin hij DAADWERKELIJK kan bewegen: een richting
// uitloten die meteen tegen een muur loopt zou de kaart geregeld helemaal niets laten doen,
// en dat is zonde van een kaart die je met een voltooide opdracht hebt verdiend.
function shoveDestination(graph, players, target, rand){
  const blocked = new Set();
  for (const p of players) if (!p.rank && p !== target) blocked.add(p.pos);
  const options = [];
  for (let d = 0; d < 4; d++){
    const line = walkStraightLine(graph, target.pos, d, SHOVE_DISTANCE, blocked);
    const steps = line.path.length - 1;
    if (steps > 0) options.push({ key: line.path[steps], steps, dir: d });
  }
  if (!options.length) return null;
  return options[Math.floor(rand() * options.length)];
}
// Welke aangrenzende tegenstander duw je? De richting is toch willekeurig, dus er valt niets
// te optimaliseren aan de bestemming — een bot pakt daarom de koploper onder zijn buren
// (bij gelijke stand eerlijk geloot, zelfde aanpak als pickShortCircuitTarget).
function pickShoveMove(graph, players, selfIdx, rand){
  const self = players[selfIdx];
  let target = null, bestCount = -1, ties = 0;
  for (const nk of graph.adjKey[self.pos]){
    const p = players.find(q => !q.rank && q.idx !== selfIdx && q.pos === nk);
    if (!p) continue;
    if (p.completed > bestCount){ target = p; bestCount = p.completed; ties = 1; }
    else if (p.completed === bestCount){ ties++; if (rand() < 1 / ties) target = p; }
  }
  if (!target) return null;
  const dest = shoveDestination(graph, players, target, rand);
  return dest ? { player: target, toKey: dest.key, steps: dest.steps } : null;
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
function pickEnd(graph, layersKeys, layersParent, step, targetKey, occupiedSet, rand, stepsUsed, bankedQuest, endBlockedSet){
  const keys = layersKeys[step];
  const firstIndex = new Map();
  for (let i = 0; i < keys.length; i++) if (!firstIndex.has(keys[i])) firstIndex.set(keys[i], i);
  let uniqueKeys = Array.from(firstIndex.keys());
  // Blinde Vlek: je mag DOOR een bezet vakje lopen, maar er niet op eindigen. De bezette
  // vakjes zijn dan uit occupiedSet gehaald (zodat de route erlangs mag) en zitten hier in
  // endBlockedSet. Blijft er geen vrij eindvakje over, dan levert deze zet niets op —
  // null, waarna de aanroeper terugvalt op de gewone (wel-blokkerende) zet.
  if (endBlockedSet){
    const free = uniqueKeys.filter(k => !endBlockedSet.has(k));
    if (!free.length) return null;
    uniqueKeys = free;
  }

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
// `endBlockedSet` (optioneel) is de verzameling vakjes waar je wel DOORHEEN mag maar niet op
// mag EINDIGEN — alleen gebruikt door Blinde Vlek. Geeft null terug als er met die beperking
// geen zet mogelijk is. `allowUturn` (Snelroute) zet de geen-U-turn-regel deze zet uit.
// Zonder beide parameters gedraagt deze functie zich exact als voorheen.
function resolveMove(graph, startKey, steps, occupiedSet, targetKey, rand, endBlockedSet, allowUturn){
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
        if (!allowUturn && cd !== -1 && d === (cd + 2) % 4) continue; // geen U-turn (tenzij Snelroute)
        const nk = neigh[j];
        if (occupiedSet.has(nk)){ wasBlocked = true; continue; } // bezet vakje blokkeert
        // eigen doel exact geraakt: beurt eindigt meteen, rest van de worp vervalt —
        // geen noodzaak om de rest van deze (of latere) lagen nog uit te rekenen.
        // staat er met Blinde Vlek een tegenstander op je eigen opdrachtvakje, dan mag je er
        // wel overheen lopen maar hem niet pakken — dus doorzoeken i.p.v. hier afronden
        if (nk === targetKey && !(endBlockedSet && endBlockedSet.has(nk))){
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
      const move = pickEnd(graph, layersKeys, layersParent, step - 1, targetKey, occupiedSet, rand, step - 1, false, endBlockedSet);
      if (!move) return null;
      move.wasBlocked = wasBlocked;
      return move;
    }
    layersKeys.push(nextKeys); layersDirs.push(nextDirs); layersParent.push(nextParent);
  }
  const move = pickEnd(graph, layersKeys, layersParent, steps, targetKey, occupiedSet, rand, steps, false, endBlockedSet);
  if (!move) return null;
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
    condenserPending: false, // Condensator gespeeld: de VOLGENDE energiesteen telt dubbel
    lockedNextTurn: false, // getroffen door Vergrendeling: mist volgende beurt energie- én kaartslot
    rollPenalty: 0,        // getroffen door Stroomonderbreking: -N stappen op de eerstvolgende worp
    barrierCell: null,     // getroffen door Noodbarrière: dit vakje telt als bezet tijdens de eerstvolgende beurt
    reorderBlocked: false, // getroffen door Signaalstoring: eerstvolgende doelwissel-poging mislukt
    lastDir: -1,           // laatst gelopen richting (voor Terugtrekbevel), -1 = nog nooit gelopen
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
    const roundFinishers = [];   // spelers die deze ronde hun 6e opdracht voltooien
    let hitTurnCap = false;
    for (const pIdx of turnOrder){
      const player = players[pIdx];
      if (player.rank) continue;   // binnen: speelt niet meer mee en staat niemand in de weg
      turnCount++;
      // Energie-acties en kaarten hebben ELK hun eigen actie-slot per beurt (max 1 van elk) —
      // vroeger deelden ze één gezamenlijk slot ("hooguit 1 actie per beurt, kaart of energie").
      // Drie kaarten hebben echter een GRATIS variant van een energie-actie (Stuwlading↔Stuwstoot:
      // allebei een 3e loopsteen; Herkalibratie↔Herprioritering: allebei dezelfde
      // energyReorderTarget()-swap; Blinde Vlek↔Noodtransport: allebei een uitweg uit een
      // blokkade) — die drie blijven elkaar binnen hún ene bewegingsmoment uitsluiten (kaart gaat
      // voor, is gratis), ook al staan ze nu op verschillende sloten. Zonder die uitsluiting zou
      // je bv. gratis Herkalibratie én betaalde Herprioritering in dezelfde beurt kunnen stapelen
      // voor een dubbele/onzinnige swap.
      let energyActionUsed = false;   // hooguit 1 energie-actie per beurt
      let cardActionUsed = false;     // hooguit 1 kaart spelen per beurt
      // Vergrendeling: geraakt in een vorige beurt betekent dat je NU zowel je energie- als je
      // kaartslot mist. Beide sloten meteen op "gebruikt" zetten blokkeert vanzelf elke
      // `!energyActionUsed`/`!cardActionUsed`-check hieronder — geen aparte if-ketting nodig.
      if (player.lockedNextTurn){
        player.lockedNextTurn = false;
        energyActionUsed = true;
        cardActionUsed = true;
      }

      // 1. energiesteen rolt mee (tenzij Kortsluiting die deze beurt blokkeert). Het niveau
      //    wordt geteld NA het bijschrijven, want dat is wat deze speler deze beurt kan inzetten.
      let energyRoll = 0, energyGain = { gained: 0, wasted: 0 };
      if (player.skipEnergyRoll){
        player.skipEnergyRoll = false;
      } else {
        energyRoll = simRollEnergy(rand);
        energyGain = simGainEnergy(player, energyRoll);
        // Condensator die vorige beurt gespeeld is: deze steen telt dubbel, dus nog eens
        // dezelfde worp erbij (netjes tegen het plafond aan via simGainEnergy). Rolt de speler
        // deze beurt helemaal niet (Kortsluiting), dan blijft de Condensator staan voor de
        // eerstvolgende beurt waarin hij wél gooit — er valt nu immers niets te verdubbelen.
        if (player.condenserPending){
          player.condenserPending = false;
          const bonus = simGainEnergy(player, energyRoll);
          energyGain.gained += bonus.gained;
          energyGain.wasted += bonus.wasted;
          extra.energyRolled += energyRoll;
        }
      }
      extra.energyRolled += energyRoll;
      extra.energyWasted += energyGain.wasted;
      extra.energyLevels[player.energy]++;

      // 1b. kaarten die bij de energiefase horen: Kortsluiting raakt de leider, Noodrantsoen
      //     vult aan, en de Condensator wordt klaargezet voor je VOLGENDE beurt.
      // Die laatste is dus een investering: je weet nog niet wat je dan gooit. Een bot zet 'm
      // in zodra er ruimte is om te groeien en er nog geen andere klaarstaat.
      if (!cardActionUsed && player.cards.includes('condenser') && !player.condenserPending && player.energy < ENERGY_MAX){
        player.condenserPending = true;
        useActionCard(player, 'condenser', deck, extra);
        cardActionUsed = true;
      }
      if (!cardActionUsed && player.cards.includes('short')){
        const victim = pickShortCircuitTarget(players, pIdx, rand);
        if (victim){
          victim.skipEnergyRoll = true;
          useActionCard(player, 'short', deck, extra);
          cardActionUsed = true;
        }
      }
      if (!cardActionUsed && player.cards.includes('ration') && player.energy < ENERGY_MAX){
        simGainEnergy(player, 3);
        useActionCard(player, 'ration', deck, extra);
        cardActionUsed = true;
      }

      // 1c. hinder-kaarten die een tegenstander raken zonder dat de eigen worp of het eigen doel
      //     verandert: Vergrendeling/Stroomonderbreking/Noodbarrière/Signaalstoring pakken
      //     allemaal de koploper (zelfde eerlijke heuristiek als Kortsluiting). Terugtrekbevel
      //     staat verderop naast Duwstoot, want die twee vereisen een AANGRENZENDE tegenstander.
      if (!cardActionUsed && player.cards.includes('lockdown')){
        const victim = pickLeaderTarget(players, pIdx, p => p.lockedNextTurn, rand);
        if (victim){
          victim.lockedNextTurn = true;
          useActionCard(player, 'lockdown', deck, extra);
          cardActionUsed = true;
        }
      }
      if (!cardActionUsed && player.cards.includes('outage')){
        const victim = pickLeaderTarget(players, pIdx, p => p.rollPenalty > 0, rand);
        if (victim){
          victim.rollPenalty = 2;
          useActionCard(player, 'outage', deck, extra);
          cardActionUsed = true;
        }
      }
      if (!cardActionUsed && player.cards.includes('barrier')){
        const occNow = new Set(players.filter(p => !p.rank).map(p => p.pos));
        const target = pickBarrierTarget(graph, players, occNow, pIdx, rand);
        if (target){
          target.player.barrierCell = target.cell;
          useActionCard(player, 'barrier', deck, extra);
          cardActionUsed = true;
        }
      }
      if (!cardActionUsed && player.cards.includes('jam')){
        const victim = pickLeaderTarget(players, pIdx, p => p.reorderBlocked, rand);
        if (victim){
          victim.reorderBlocked = true;
          useActionCard(player, 'jam', deck, extra);
          cardActionUsed = true;
        }
      }
      // 1d. Kaartenruil: een bot gebruikt 'm alleen om een Prioriteitspas (die voor een bot toch
      //     geen mechanisch effect heeft) in te wisselen tegen de bovenste aflegkaart.
      //     Herinnering: schuift Zwaartekracht-laarzen/Stuwlading naar de top van de trekstapel
      //     als die in de bovenste 3 zitten; anders blijft de volgorde gelijk en speelt de bot 'm
      //     alsnog, puur om de kaart niet te laten liggen.
      if (!cardActionUsed && player.cards.includes('trade') && player.cards.includes('scan') && deck.discard.length){
        performCardTrade(player, 'scan', deck);
        useActionCard(player, 'trade', deck, extra);
        cardActionUsed = true;
      }
      if (!cardActionUsed && player.cards.includes('peek') && deck.draw.length){
        performPeekReorder(deck);
        useActionCard(player, 'peek', deck, extra);
        cardActionUsed = true;
      }

      // 2. doel bepalen: Herkalibratie (gratis, kaart) en Herprioritering (betaald, energie)
      //    doen hetzelfde (energyReorderTarget) en blijven daarom elkaar uitsluiten via
      //    `targetSwapped`, los van de brede kaart/energie-sloten hierboven.
      let targetLabel = player.order[player.nextIdx];
      let targetSwapped = false;
      if (!cardActionUsed && player.cards.includes('recal')){
        const swapped = energyReorderTarget(graph, player, player.pos);
        if (swapped !== null){
          useActionCard(player, 'recal', deck, extra);
          cardActionUsed = true;
          targetSwapped = true;
          // Signaalstoring: deze ene doelwissel mislukt alsnog. De wissel is al doorgevoerd,
          // dus terugdraaien — de kaart is wel verspeeld.
          if (player.reorderBlocked){ player.reorderBlocked = false; applyReorderSwap(player); }
          else targetLabel = swapped;
        }
      }
      if (!cardActionUsed && player.cards.includes('shove')){
        const shove = pickShoveMove(graph, players, pIdx, rand);
        if (shove){
          shove.player.pos = shove.toKey;
          useActionCard(player, 'shove', deck, extra);
          cardActionUsed = true;
        }
      }
      if (!cardActionUsed && player.cards.includes('recoil')){
        const occNow = new Set(players.filter(p => !p.rank).map(p => p.pos));
        const push = pickRecoilMove(graph, players, occNow, pIdx);
        if (push){
          push.player.pos = push.toKey;
          useActionCard(player, 'recoil', deck, extra);
          cardActionUsed = true;
        }
      }
      if (!targetSwapped && !energyActionUsed && player.strategy === 'reorder' && player.energy >= ENERGY_ACTIONS.reorder.cost){
        const swapped = blindReorderTarget(graph, player, player.pos, REORDER_BLIND_THRESHOLD);
        if (swapped !== null){
          player.energy -= ENERGY_ACTIONS.reorder.cost;
          player.actionUses++;
          energyActionUsed = true;
          if (player.reorderBlocked){ player.reorderBlocked = false; applyReorderSwap(player); }
          else targetLabel = swapped;
        }
      }
      const targetKey = graph.questCells[targetLabel];

      const occupied = new Set();
      for (let j = 0; j < 4; j++) if (j !== pIdx && !players[j].rank) occupied.add(players[j].pos);
      // Noodbarrière: geldt precies voor deze ene beurt en verdwijnt daarna vanzelf, ongeacht
      // of de speler er daadwerkelijk tegenaan liep.
      if (player.barrierCell !== null){
        occupied.add(player.barrierCell);
        player.barrierCell = null;
      }

      // 3. beweging: Zwaartekracht-laarzen vervangt de worp helemaal; anders de gewone
      //    loopstenen met Stuwlading (kaart) of Stuwstoot (energie) als derde steen — die twee
      //    doen hetzelfde (een 3e loopsteen) en blijven daarom via else-if elkaar uitsluiten.
      //    Stroomonderbreking trekt er ná alle stenen 2 stappen af (minimaal 1 blijft over).
      //    Snelroute schakelt de geen-U-turn-regel uit voor de REST van deze beurt — dus ook
      //    voor de Blinde-Vlek-herberekening en de vervolgstap na een Noodtransport verderop.
      //    Daarom wordt `allowUturn` los bijgehouden i.p.v. alleen aan één aanroep meegegeven.
      let move, roll = 0, usedBoots = false, allowUturn = false;
      if (!cardActionUsed && player.cards.includes('boots')){
        const bootsMove = resolveGravityBoots(graph, player.pos, 10, occupied, targetKey);
        if (bootsMove){
          move = bootsMove;
          usedBoots = true;
          useActionCard(player, 'boots', deck, extra);
          cardActionUsed = true;
        }
      }
      if (!usedBoots){
        let dice = 2;
        roll = simRollD6(rand) + simRollD6(rand);
        if (!cardActionUsed && player.cards.includes('boostcell')){
          roll += simRollD6(rand); dice = 3;
          useActionCard(player, 'boostcell', deck, extra);
          cardActionUsed = true;
        } else if (!energyActionUsed && player.strategy === 'boost' && player.energy >= ENERGY_ACTIONS.boost.cost){
          roll += simRollD6(rand); dice = 3;
          player.energy -= ENERGY_ACTIONS.boost.cost;
          player.actionUses++;
          energyActionUsed = true;
        }
        if (player.rollPenalty){
          roll = Math.max(1, roll - player.rollPenalty);
          player.rollPenalty = 0;
        }
        if (!cardActionUsed && player.cards.includes('fastlane')){
          allowUturn = true;
          useActionCard(player, 'fastlane', deck, extra);
          cardActionUsed = true;
        }
        move = resolveMove(graph, player.pos, roll, occupied, targetKey, rand, undefined, allowUturn);
        // Koerscorrectie: een tegenvallende worp overdoen. Alleen zinvol als deze worp de
        // opdracht niet al pakt, en alleen onder de verwachtingswaarde (3,5 per steen) — dan
        // is opnieuw gooien in verwachting winst. De nieuwe worp telt, ook als die slechter is.
        if (!move.bankedQuest && !cardActionUsed && player.cards.includes('reroll') && roll < dice * 3.5){
          roll = 0;
          for (let d = 0; d < dice; d++) roll += simRollD6(rand);
          useActionCard(player, 'reroll', deck, extra);
          cardActionUsed = true;
          move = resolveMove(graph, player.pos, roll, occupied, targetKey, rand, undefined, allowUturn);
        }
      }

      // 4. Blinde Vlek (kaart) lost een blokkade op door de zet te herberekenen vanaf de
      //    ORIGINELE positie; Noodtransport (energie) doet dat ook (springt eerst, herberekent
      //    dan de al-gerolde worp vanaf de sprongbestemming) — gebruikt Blinde Vlek de blokkade
      //    al op, dan zou Noodtransport dat resultaat gewoon overschrijven, dus blijven ook zij
      //    elkaar uitsluiten binnen dit ene bewegingsmoment (`blindResolvedBlock`).
      //    Noodtransport mag TUSSENTIJDS, dus ná een geslaagde deblokkering alsnog. Alleen ná de
      //    zet springen maakt Noodtransport veel zwakker — dat is gemeten (26,7% winst tegen
      //    32,4% voor de goedkoopste actie) en was een fout, geen ontwerpkeuze.
      let blindResolvedBlock = false;
      if (!move.bankedQuest && !cardActionUsed && player.cards.includes('blind') && move.wasBlocked){
        // door tegenstanders heen mogen lopen (lege blokkeerset), maar er niet op eindigen
        // (occupied als endBlockedSet) — levert dat geen enkel vrij eindvakje op, dan geeft
        // resolveMove null terug en blijft de gewone, geblokkeerde zet staan
        const retry = resolveMove(graph, player.pos, roll, SIM_EMPTY_SET, targetKey, rand, occupied, allowUturn);
        if (retry && retry.key !== move.key){
          move = retry;
          useActionCard(player, 'blind', deck, extra);
          cardActionUsed = true;
          blindResolvedBlock = true;
        }
      }
      if (!blindResolvedBlock && !move.bankedQuest && !energyActionUsed && player.strategy === 'jump' && player.energy >= ENERGY_ACTIONS.jump.cost){
        const jump = resolveEnergyJump(graph, player.pos, ENERGY_JUMP_RANGE, targetKey);
        if (jump){
          player.energy -= ENERGY_ACTIONS.jump.cost;
          player.actionUses++;
          energyActionUsed = true;
          for (let p = 0; p < jump.path.length; p++) heatmap[jump.path[p]]++;
          // de sprong kan de opdracht zelf al pakken; anders loop je vanaf daar verder
          move = jump.banked
            ? { key: jump.key, path: [jump.key], stepsUsed: 0, bankedQuest: true, wasBlocked: false }
            : resolveMove(graph, jump.key, roll, occupied, targetKey, rand, undefined, allowUturn);
        }
      }
      // laatst gelopen richting onthouden — Terugtrekbevel duwt je daar weer langs terug
      const stepDir = lastStepDirection(graph, move.path);
      if (stepDir !== -1) player.lastDir = stepDir;

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
        // rank wordt NIET meteen toegekend — pas ná deze hele ronde (zie resolveRoundFinishers
        // hierboven), zodat wie later in de beurtvolgorde zit deze ronde nog evenveel kans krijgt
        if (player.completed >= SIM_QUESTS_TO_WIN){
          player.finishTurn = turnCount;
          roundFinishers.push(player);
        }
      }
      if (turnCount >= SIM_MAX_TURNS){ hitTurnCap = true; break; }
    }

    if (roundFinishers.length){
      if (finished === 0){
        // spanning meten bij de EERSTE keer dat iemand deze potje binnenkomt, over de spelers
        // die deze ronde niet ook al finishten
        let runnerUp = 0;
        for (const p of players) if (!roundFinishers.includes(p)) runnerUp = Math.max(runnerUp, p.completed);
        const gap = SIM_QUESTS_TO_WIN - runnerUp;
        extra.winGapSum += gap;
        extra.winGapCount++;
        if (gap === 1) extra.nailBiters++;
      }
      resolveRoundFinishers(roundFinishers, finished);
      finished += roundFinishers.length;
      if (finished >= finishTarget){
        // de achterblijver(s) hebben verloren zonder dat ze nog iets kunnen doen
        for (const p of players) if (!p.rank) p.rank = finished + 1;
        return { stuck: false, turns: turnCount, players };
      }
    }
    if (hitTurnCap) return { stuck: true, turns: turnCount, players };
  }
  return { stuck: true, turns: turnCount, players };
}

// ---------- UI ----------
const simCountEl = document.getElementById('simCount');
const simStatusEl = document.getElementById('simStatus');
const simResultsEl = document.getElementById('simResults');
const btnSimulate = document.getElementById('btnSimulate');
const simProgressEl = document.getElementById('simProgress');
const simProgressFillEl = document.getElementById('simProgressFill');
const simProgressTextEl = document.getElementById('simProgressText');
let simRunning = false;   // voorkomt twee overlappende potjes-reeksen bij dubbelklikken
let simRunId = 0;         // verhoogd bij elke nieuwe run/bordwijziging; een verouderde
                           // in-brokken-lopende run herkent hieraan dat hij moet stoppen

// wordt aangeroepen door alles wat de indeling wijzigt (genereren, herstellen,
// slepen, draaien, tegel-editor) — de cijfers horen bij een specifieke indeling en
// worden ongeldig zodra die verandert. Tabwisselingen raken dit niet aan (die
// laten de tab-inhoud gewoon in de DOM staan).
function clearSimResults(){
  // een lopende stap-voor-stap-pion hoort niet op een bord dat onder hem vandaan verandert
  stopWalkSimulation();
  stopSoloGame();
  // de batch-simulatie rekent nu in brokken (zie runSimulationBatch), dus loopt niet meer
  // per se blokkerend af vóórdat de gebruiker iets anders kan aanklikken — een lopende reeks
  // potjes voor de OUDE indeling mag straks niet alsnog deze melding overschrijven
  simRunId++;
  if (simProgressEl) simProgressEl.hidden = true;
  simRunning = false;
  if (btnSimulate) btnSimulate.disabled = false;
  // zelfde verhaal voor een lopende bord-generatie (zie applyGeneratedLayout in 80-controls.js):
  // die rekent ook in brokken, dus een tegel slepen/draaien terwijl er nog gegenereerd wordt
  // moet de balk/knoppen direct resetten — de simRunId-check daar zorgt dat het resultaat van
  // die verouderde run straks ook niet meer wordt toegepast.
  if (typeof hideGenProgress === 'function') hideGenProgress();
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

// Elke sectie van de uitslag is een <details>. De conclusie bovenaan blijft altijd staan; het
// bewijsmateriaal eronder vouw je open als je het wilt nakijken. Zonder dit was de uitslag
// ~3900px aan tabellen achter elkaar, allemaal even zwaar opgemaakt.
let simSectionOpened = false;
function simSectionOpen(title){
  const close = simSectionOpened ? '</div></details>' : '';
  simSectionOpened = true;
  return `${close}<details class="sim-section"><summary class="sim-subhead">${title}</summary><div class="sim-section-body">`;
}
function simSectionCloseAll(){
  const close = simSectionOpened ? '</div></details>' : '';
  simSectionOpened = false;
  return close;
}

// de 5 tegels met het minste verkeer (genormaliseerd per vakje, zodat grote en kleine tegels
// eerlijk vergeleken worden) — dit zijn de "lussen waar geen enkele speler komt" uit de heatmap,
// nu met naam, positie en hoe ver ze van een opdracht liggen.
function coldZoneRows(graph, heatmap){
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
  return rows;
}

function renderColdZones(graph, heatmap){
  const rows = coldZoneRows(graph, heatmap);
  const tableRows = rows.slice(0, 5).map(r => {
    const name = ROOM_NAMES[r.tid] || ('Gang ' + r.tid);
    return `<tr><td>${letterForSlot(r.slotIdx)} — ${name}</td><td class="num">${nl(r.share, 1)}%</td><td class="num">${r.questDist}</td></tr>`;
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
    return `<tr><td>${lbl}</td><td class="num">${nl(pct, 1)}% ± ${nl(moe, 1)}</td><td class="num">${avgTurns !== null ? nl(avgTurns, 1) : '—'}</td></tr>`;
  }).join('');
  const seatRows = seatWins.map((w, i) => {
    const pct = played ? (w / played * 100) : 0;
    return `<tr><td>${i + 1}e aan zet</td><td class="num">${nl(pct, 1)}%</td></tr>`;
  }).join('');
  const questRows = SIM_QUEST_LABELS.map(lbl => {
    const qs = questStats[lbl];
    const avg = qs.count ? (qs.turns / qs.count) : null;
    return `<tr><td>${lbl} — ${QUEST_NAMES[lbl]}</td><td class="num">${avg !== null ? nl(avg, 1) : '—'}</td><td class="num">${qs.count}</td></tr>`;
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

  simSectionOpened = false;
  let html = `<p class="hint"><b>${n}</b> potjes gesimuleerd op indeling <b>${layout.join(',')}</b>`;
  if (stuckCount) html += ` — <span style="color:var(--danger)">${stuckCount} vastgelopen</span> (afgekapt na ${SIM_MAX_TURNS} beurten, niet meegeteld in de percentages)`;
  html += `.</p>`;

  // De twaalf secties hieronder zijn het bewijsmateriaal; deze vier vakjes beantwoorden de
  // vraag waar je de simulatie eigenlijk voor draait — is dit bord goed genoeg om te spelen?
  const coldest = coldZoneRows(graph, heatmap)[0];
  const verdictItem = (state, label, value, sub) =>
    `<div class="sim-verdict-item ${state}"><span class="lbl">${label}</span><span class="val">${value}</span><span class="sub">${sub}</span></div>`;
  html += `<div class="sim-verdict">` +
    verdictItem(played === 0 ? 'warn' : withinNoise ? 'ok' : 'bad',
      'Eerlijk?',
      played === 0 ? 'geen data' : withinNoise ? 'ja' : 'nee',
      played === 0 ? 'geen enkel potje uitgespeeld'
        : `startposities lopen ${nl(spread, 1)} procentpunt uiteen, foutmarge ±${nl(avgMoe, 1)}`) +
    verdictItem(stuckCount === 0 ? 'ok' : 'bad',
      'Vastgelopen',
      stuckCount === 0 ? 'geen' : `${stuckCount}×`,
      stuckCount === 0 ? `alle ${played} potjes speelden uit` : `afgekapt na ${SIM_MAX_TURNS} beurten`) +
    verdictItem(coldest && coldest.share > 0 ? 'ok' : 'bad',
      'Dode tegels',
      coldest && coldest.share > 0 ? 'geen' : 'ja',
      coldest
        ? `stilste tegel: ${letterForSlot(coldest.slotIdx)} — ${ROOM_NAMES[coldest.tid] || ('Gang ' + coldest.tid)} met ${nl(coldest.share, 1)}% van het verkeer`
        : '—') +
    verdictItem('ok', 'Speelduur', `${Math.round(avg)} beurten`,
      `mediaan ${median} · min ${min} · max ${max} (alle spelers samen)`) +
    `</div>`;

  html += `<div class="sim-expand-row"><button type="button" class="small ghost" id="btnSimExpand" aria-expanded="false">Alle details uitklappen</button></div>`;

  html += simSectionOpen('Eerlijkheid per startpositie');
  html += `<table class="sim-table"><thead><tr><th>Startpositie</th><th>Winst% (±95%-marge)</th><th>Gem. beurten tot winst</th></tr></thead><tbody>${rows}</tbody></table>`;
  html += `<p class="hint">Balans: ${verdict} (spreiding <b>${nl(spread, 1)}</b> procentpunt, gem. foutmarge ±<b>${nl(avgMoe, 1)}</b>).</p>`;

  // Nu er wordt doorgespeeld tot de nummer 3 binnen is, ligt van elk potje de hele
  // klassering vast. Alleen naar winst kijken verbergt een startpositie die zelden wint
  // maar wel structureel derde of vierde wordt.
  const rankRows = SIM_START_LABELS.map(lbl => {
    const counts = startRanks[lbl];
    const total = counts.reduce((a, b) => a + b, 0);
    const cells = counts.map(c => `<td class="num">${total ? nl((c / total * 100), 1) : '0,0'}%</td>`).join('');
    const avgRank = total ? counts.reduce((s, c, i) => s + c * (i + 1), 0) / total : 0;
    return `<tr><td>${lbl}</td>${cells}<td class="num">${nl(avgRank, 2)}</td></tr>`;
  }).join('');
  html += simSectionOpen('Eindklassering per startpositie');
  html += `<table class="sim-table"><thead><tr><th>Startpositie</th><th>1e</th><th>2e</th><th>3e</th><th>4e</th><th>Gem. plaats</th></tr></thead><tbody>${rankRows}</tbody></table>`;
  html += `<p class="hint">Er wordt doorgespeeld tot de <b>nummer 3</b> binnen is; de laatste speler is dan automatisch vierde. Bij een eerlijk bord ligt elke kolom rond de 25% en de gemiddelde plaats rond de 2,50.</p>`;

  html += simSectionOpen('Eerlijkheid per beurtvolgorde');
  html += `<table class="sim-table"><thead><tr><th>Beurtvolgorde</th><th>Winst%</th></tr></thead><tbody>${seatRows}</tbody></table>`;

  html += simSectionOpen('Eerlijkheid per opdrachtvakje');
  html += `<table class="sim-table"><thead><tr><th>Opdracht</th><th>Gem. beurten om te bereiken</th><th>Keer bereikt</th></tr></thead><tbody>${questRows}</tbody></table>`;
  html += `<p class="hint">Hoe hoger het gemiddelde, hoe afgelegener dat opdrachtvakje ligt vanaf waar spelers 'm meestal moeten benaderen.</p>`;

  html += simSectionOpen('Speelduur');
  html += `<p class="hint">Van de eerste worp tot de nummer 3 binnen is: gemiddeld <b>${nl(avg, 1)}</b> beurten, mediaan <b>${median}</b>, min <b>${min}</b>, max <b>${max}</b> (alle spelers samen, dus deel door 4 voor beurten per speler).</p>`;
  html += renderHistogram(gameLengths);

  html += simSectionOpen('Spanning en blokkeren');
  html += `<p class="hint">De nummer 2 stond bij winst gemiddeld <b>${nl(avgGap, 1)}</b> opdracht(en) achter — <b>${nl(nailBiterPct, 0)}%</b> van de potjes werd met precies 1 opdracht verschil beslist. In <b>${nl(blockedPct, 1)}%</b> van de beurten kwam een speler ergens in zijn zoektocht naar de beste route een bezet vakje tegen (niet per se de uiteindelijk gekozen route).</p>`;

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
    affordRows.unshift(`<tr><td>${lvl} energie</td><td class="num">${energyTurns ? nl((atLeast / energyTurns * 100), 1) : '0,0'}%</td></tr>`);
  }
  const maxLevel = Math.max(...extra.energyLevels);
  const energyBars = Array.from(extra.energyLevels, (c, lvl) => {
    const h = maxLevel ? Math.round((c / maxLevel) * 100) : 0;
    const tick = (lvl % 2 === 0) ? `<span class="sim-hist-tick">${lvl}</span>` : '';
    return `<div class="sim-hist-bar-wrap" title="${lvl} energie: ${energyTurns ? nl((c / energyTurns * 100), 1) : 0}% van de beurten"><div class="sim-hist-bar energy" style="height:${h}%"></div>${tick}</div>`;
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
      `<td class="num">${nl(winPct, 1)}% ± ${nl(moe, 1)}</td>` +
      `<td class="num">${nl(top2Pct, 1)}%</td>` +
      `<td class="num">${nl(avgRank, 2)}</td>` +
      `<td class="num">${nl(usesPerGame, 1)}</td></tr>`;
  }).join('');
  html += simSectionOpen('Welke energie-actie wint?');
  html += `<table class="sim-table"><thead><tr><th>Strategie</th><th>Winst% (±95%-marge)</th><th>Top 2</th><th>Gem. plaats</th><th>Keer ingezet</th></tr></thead><tbody>${stratRows}</tbody></table>`;
  html += `<p class="hint">Elk potje zit één speler per strategie, geloot over de startposities. Een speler zet zijn actie in zodra hij 'm kan betalen — Herprioritering wisselt <b>blind</b> zodra de huidige opdracht verder dan ${REORDER_BLIND_THRESHOLD} vakjes weg ligt (de volgende kaart ligt dichtgeslagen, dus kan tegenvallen), en Noodtransport alleen als de gewone zet de opdracht nog niet pakte. Bij vier gelijkwaardige strategieën staat iedereen op 25% winst en gemiddelde plaats 2,50; wie daar significant boven zit, is te sterk.</p>`;

  // ---------- beloningskaarten ----------
  const cardRows = ACTION_CARD_IDS.map(id => {
    const act = ACTION_CARDS[id];
    const uses = extra.cardUses[id];
    const perGame = played ? (uses / played) : 0;
    return `<tr><td>${act.name} <span class="sub">${act.hint}</span></td><td class="num">${nl(perGame, 2)}</td></tr>`;
  }).join('');
  const drawsPerGame = played ? (extra.cardDraws / played) : 0;
  const handFullPct = extra.cardDraws + extra.handFullOnBank
    ? (extra.handFullOnBank / (extra.cardDraws + extra.handFullOnBank) * 100) : 0;
  html += simSectionOpen('Beloningskaarten');
  html += `<p class="hint">Wie een opdracht bereikt trekt een kaart van een gedeelde stapel van 20 (2 van elk type), tenzij zijn hand al vol is (max 2). Gemiddeld <b>${nl(drawsPerGame, 1)}</b> kaarten getrokken per potje (alle 4 spelers samen); <b>${nl(handFullPct, 1)}%</b> van de trekkans ging verloren aan een volle hand.</p>`;
  html += `<table class="sim-table"><thead><tr><th>Kaart</th><th>Keer gebruikt per potje</th></tr></thead><tbody>${cardRows}</tbody></table>`;
  html += `<p class="hint">Prioriteitspas heeft in deze simulatie geen mechanisch effect (het is pure informatie voor een mens aan tafel) en wordt daarom nooit ingezet — 0,00 hierboven is dus verwacht, niet een bug. Een getrokken Prioriteitspas bezet wel een handslot tot het potje afloopt.</p>`;

  html += simSectionOpen('Energie');
  html += `<p class="hint">De energiesteen (<b>${ENERGY_DIE_FACES.map(f => f || '–').join(' ')}</b>) rolt elke beurt mee, gemiddeld <b>${nl(energyPerTurn, 2)}</b> per beurt, met een plafond van <b>${ENERGY_MAX}</b>. Onderstaande cijfers zijn over alle vier de strategieën samen — de spaarder die nooit uitgeeft trekt het gemiddelde en het plafondverlies omhoog.</p>`;
  html += `<p class="hint">Een speler heeft gemiddeld <b>${nl(energyAvg, 1)}</b> energie op zak, staat <b>${nl(energyAtCap, 1)}%</b> van zijn beurten op het plafond, en <b>${nl(energyWastePct, 1)}%</b> van alle gerolde energie gaat daardoor verloren.</p>`;
  html += `<p class="hint" style="margin-top:10px;">Verdeling van de energievoorraad over alle beurten (0 links, ${ENERGY_MAX} rechts):</p>`;
  html += `<div class="sim-hist">${energyBars}</div>`;
  html += `<table class="sim-table"><thead><tr><th>Kosten van een actie</th><th>Aandeel beurten waarin je 'm kunt betalen</th></tr></thead><tbody>${affordRows.join('')}</tbody></table>`;

  html += simSectionOpen('Drukte op het bord');
  html += `<p class="hint">Hoe vaak elk vakje betreden werd over alle ${played} meegetelde potjes — laat bottleneck-gangen en nauwelijks gebruikte hoekjes zien.</p>`;
  html += renderHeatmap(graph, heatmap);
  html += `<p class="hint" style="margin-top:12px;">Koudste tegels — de kandidaten voor een "lus zonder opdracht waar niemand komt":</p>`;
  html += renderColdZones(graph, heatmap);

  html += simSectionCloseAll();
  simResultsEl.innerHTML = html;

  const expandBtn = document.getElementById('btnSimExpand');
  expandBtn.addEventListener('click', () => {
    const sections = simResultsEl.querySelectorAll('details.sim-section');
    const open = expandBtn.getAttribute('aria-expanded') !== 'true';
    sections.forEach(d => { d.open = open; });
    expandBtn.setAttribute('aria-expanded', String(open));
    expandBtn.textContent = open ? 'Alle details inklappen' : 'Alle details uitklappen';
  });
  simStatusEl.innerHTML = `<span class="ok">✓ Klaar in ${formatSimSeconds(elapsedMs)}</span>`;
}

// richttijd per brok werk vóór we de klok checken (ononderbroken doorrekenen, dan pas
// performance.now() aanroepen) — zo blijft het klok-uitlezen zelf verwaarloosbaar
const SIM_PROGRESS_CHECK_EVERY = 64;
// hoe lang een brok werk maximaal ononderbroken doorrekent voordat we een frame teruggeven
// aan de browser — 30ms geeft de voortgangsbalk een vloeiende, ~30fps-achtige update zonder
// dat de duizenden setTimeout-overgangen zelf noemenswaardige tijd kosten
const SIM_CHUNK_BUDGET_MS = 30;

function formatSimSeconds(ms){
  const s = ms / 1000;
  return s < 10 ? `${nl(s, 1)} seconden` : `${Math.round(s)} seconden`;
}

function updateSimProgress(done, n, elapsedMs){
  if (!simProgressEl) return;
  const pct = n ? Math.min(100, (done / n) * 100) : 0;
  simProgressFillEl.style.width = `${pct.toFixed(1)}%`; // CSS: hier moet de punt blijven staan
  const perGame = done ? elapsedMs / done : 0;
  const etaMs = perGame * (n - done);
  simProgressTextEl.innerHTML =
    `<span><b>${done}</b> / ${n} potjes (${nl(pct, 0)}%)</span>` +
    `<span>verstreken ${formatSimSeconds(elapsedMs)} · nog ongeveer ${done > 0 ? formatSimSeconds(etaMs) : '…'}</span>`;
}

function runSimulationBatch(){
  if (simRunning) return;   // een dubbele klik mag geen tweede reeks potjes tegelijk starten

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

  simRunning = true;
  const runId = ++simRunId;   // deze run herkennen als "nog geldig" bij elke terugkeer naar de browser
  btnSimulate.disabled = true;
  simStatusEl.innerHTML = '';
  simResultsEl.innerHTML = '';
  if (simProgressEl){
    simProgressEl.hidden = false;
    updateSimProgress(0, n, 0);
  }

  // de voortgangsbalk moet minstens één frame zichtbaar zijn vóórdat het (blokkerende)
  // rekenwerk per brok begint, anders verschijnt hij nooit echt op 0% voor kleine n
  setTimeout(async () => {
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

      // in brokken doorrekenen i.p.v. één ononderbroken lus: na elk brok geven we de
      // controle terug aan de browser (await setTimeout) zodat die de voortgangsbalk kan
      // schilderen. Zonder dit zou de hele simulatie de pagina bevriezen tot ze klaar is.
      let i = 0;
      while (i < n){
        const chunkStart = performance.now();
        while (i < n){
          const result = simulateOneGame(graph, rand, heatmap, questStats, extra);
          i++;
          if (result.stuck){ stuckCount++; }
          else {
            // p.rankShare > 1 betekent dat deze speler een plaats DEELT met andere spelers
            // (gelijke energie én evenveel actiekaarten aan het eind van de ronde waarin ze
            // finishten) — dan krijgt iedereen in die tie-groep een eerlijk (fractioneel) deel
            // van de credit i.p.v. dat er willekeurig één "de" winnaar wordt aangewezen.
            // rankOverlapFraction reduceert bij een niet-gedeelde plek (rankShare 1) gewoon tot
            // de vertrouwde 0-of-1 uitkomst, dus dit is puur een uitbreiding, geen gedragswijziging
            // voor de (verreweg meeste) potjes zonder tie.
            for (const p of result.players){
              const k = p.rankShare || 1;
              for (let r = p.rank; r < p.rank + k; r++) startRanks[p.startLabel][r - 1] += 1 / k;
              const st = strategyStats[p.strategy];
              st.games++;
              st.rankSum += p.rank + (k - 1) / 2;
              st.uses += p.actionUses;
              st.wins += rankOverlapFraction(p.rank, k, 1);
              st.top2 += rankOverlapFraction(p.rank, k, 2);
              const winFrac = rankOverlapFraction(p.rank, k, 1);
              if (winFrac > 0){
                startWins[p.startLabel] += winFrac;
                startTurnsSum[p.startLabel] += p.finishTurn * winFrac;
                seatWins[p.seat] += winFrac;
              }
            }
            gameLengths.push(result.turns);
          }
          if (i % SIM_PROGRESS_CHECK_EVERY === 0 && performance.now() - chunkStart > SIM_CHUNK_BUDGET_MS) break;
        }
        // het bord kan gewijzigd zijn terwijl deze reeks nog bezig was (dat kon voorheen niet
        // — de pagina was dan bevroren — maar nu de simulatie in brokken loopt wel). Een
        // verouderde run mag de nieuwere "indeling gewijzigd"-melding niet overschrijven.
        if (runId !== simRunId) return;
        updateSimProgress(i, n, performance.now() - t0);
        if (i < n) await new Promise(res => setTimeout(res, 0));
      }
      if (runId !== simRunId) return;

      const elapsedMs = performance.now() - t0;
      if (simProgressEl) simProgressEl.hidden = true;
      renderSimResults({ n, stuckCount, startWins, startTurnsSum, startRanks, strategyStats, seatWins, gameLengths, questStats, extra, graph, heatmap, elapsedMs });
    } catch (err){
      if (runId === simRunId) simStatusEl.innerHTML = `<span class="bad">✕ Simulatie mislukt: ${err.message}</span>`;
      if (simProgressEl) simProgressEl.hidden = true;
    } finally {
      if (runId === simRunId){
        simRunning = false;
        btnSimulate.disabled = false;
      }
    }
  }, 20);
}

if (btnSimulate) btnSimulate.addEventListener('click', runSimulationBatch);
