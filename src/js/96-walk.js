// ---------- stap voor stap: 1 t/m 4 spelers, zichtbaar over het bord ----------
// Speelt EEN potje op de huidige indeling en toont elke stap. Hergebruikt de engine uit
// 95-simulate.js (buildSimGraph + resolveMove), zodat de regels hier per definitie dezelfde
// zijn als in de batch-simulatie: 2xD6 = exact aantal stappen, geen U-turn, bezette vakjes
// blokkeren, en je stopt zodra je je eigen opdrachtvakje raakt (rest van de worp vervalt).
// Met meerdere spelers is de "bezette vakjes"-set precies de posities van de andere pionnen
// die nog meespelen, net als in simulateOneGame(); met één speler is die set leeg.
//
// Er wordt doorgespeeld na de winnaar: wie binnen is verlaat het bord en het potje loopt
// door tot simFinishTarget() spelers binnen zijn (bij 4 spelers de nummer 3, want dan is de
// vierde plaats al beslist).

// tempo-standen voor de schuifregelaar: ms per gezette stap
const WALK_SPEEDS = [
  { label: 'heel langzaam', stepMs: 620, rollMs: 900 },
  { label: 'langzaam',      stepMs: 320, rollMs: 700 },
  { label: 'normaal',       stepMs: 170, rollMs: 520 },
  { label: 'snel',          stepMs:  70, rollMs: 300 },
  { label: 'razendsnel',    stepMs:  18, rollMs: 120 },
];

// Kleur per speler. Bewust weg van de bordkleuren die er tegelijk op liggen: blauw (opdracht),
// groen (start) en amber (naadmarkering) zijn daarom niet gebruikt.
const WALK_PLAYER_COLORS = ['#ff4fd8', '#ffd23d', '#7c5cff', '#ff7a45'];
const WALK_MAX_PLAYERS = SIM_START_LABELS.length;

const walkBoardEl = document.getElementById('walkBoard');
const walkStartSel = document.getElementById('walkStart');
const walkPlayersSel = document.getElementById('walkPlayers');
const walkStartHintEl = document.getElementById('walkStartHint');
const walkEnergyModeEl = document.getElementById('walkEnergyMode');
const walkSpeedEl = document.getElementById('walkSpeed');
const walkSpeedLabelEl = document.getElementById('walkSpeedLabel');
const walkDiceEl = document.getElementById('walkDice');
const walkMetaEl = document.getElementById('walkMeta');
const walkScoreEl = document.getElementById('walkScore');
const walkScoreActiveEl = document.getElementById('walkScoreActive');
const walkStatusEl = document.getElementById('walkStatus');
const walkLogEl = document.getElementById('walkLog');
const walkPanelEl = document.getElementById('tabWalk');
const walkPausedFlagEl = document.getElementById('walkPausedFlag');
const btnWalkStart = document.getElementById('btnWalkStart');
const btnWalkPause = document.getElementById('btnWalkPause');
const btnWalkStop = document.getElementById('btnWalkStop');

let walkCellEls = null;      // [R][C] -> div, pas opgebouwd bij het eerste gebruik
let walkRunId = 0;           // elke nieuwe run verhoogt dit; een lopende run stopt zodra hij afwijkt
let walkRunning = false;
let walkPaused = false;
let walkPauseWaiters = [];   // resolvers van de stappen die nu op "hervat" staan te wachten
let walkPaintedPawns = [];   // cellen waar nu een pion op staat, zodat we ze gericht kunnen wissen

function walkSpeed(){ return WALK_SPEEDS[parseInt(walkSpeedEl.value, 10)] || WALK_SPEEDS[2]; }
function walkSleep(ms){ return new Promise(res => setTimeout(res, ms)); }

// De lus wacht op precies twee dingen: de tempo-vertraging en (als er gepauzeerd is) de
// pauze-poort. Alles wat wacht loopt via walkTick(), zodat er geen plek in de lus overblijft
// die tijdens een pauze tóch doorloopt.
function walkPauseGate(){
  if (!walkPaused) return Promise.resolve();
  return new Promise(res => walkPauseWaiters.push(res));
}
async function walkTick(ms){
  await walkSleep(ms);
  await walkPauseGate();
}
function setWalkPaused(on){
  walkPaused = on && walkRunning;
  if (!walkPaused){
    // iedereen die vasthing loslaten; wie inmiddels tot een gestopte run behoort,
    // valt daarna vanzelf op zijn eigen runId-controle af
    const waiters = walkPauseWaiters;
    walkPauseWaiters = [];
    for (const res of waiters) res();
  }
  if (btnWalkPause) btnWalkPause.textContent = walkPaused ? '▶ Hervatten' : '⏸ Pauze';
  if (walkPausedFlagEl) walkPausedFlagEl.hidden = !walkPaused;
  // CSS-animaties (rollende dobbelsteen, kloppend doelvakje) horen ook stil te staan
  if (walkPanelEl) walkPanelEl.classList.toggle('walk-is-paused', walkPaused);
}

function walkPlayerCount(){
  const n = parseInt(walkPlayersSel ? walkPlayersSel.value : '1', 10);
  return Number.isFinite(n) ? Math.max(1, Math.min(WALK_MAX_PLAYERS, n)) : 1;
}

// ---------- bord ----------
function buildWalkBoard(){
  walkBoardEl.innerHTML = '';
  const els = [];
  for (let R = 0; R < TILE_ROWS*TILE_H; R++){
    els.push([]);
    for (let C = 0; C < TILE_COLS*TILE_W; C++){
      const div = document.createElement('div');
      div.className = 'cell';
      walkBoardEl.appendChild(div);
      els[R].push(div);
    }
  }
  return els;
}

// tekent de huidige indeling; wist alle loop-markeringen (klassen én de per-speler
// kleurvariabelen die we inline op de cellen zetten)
function renderWalkBoard(){
  if (!walkBoardEl) return;
  if (!walkCellEls) walkCellEls = buildWalkBoard();
  walkPaintedPawns = [];
  for (let R = 0; R < TILE_ROWS*TILE_H; R++){
    for (let C = 0; C < TILE_COLS*TILE_W; C++){
      const dr = R % TILE_H, dc = C % TILE_W;
      const slotIdx = Math.floor(R/TILE_H)*TILE_COLS + Math.floor(C/TILE_W);
      const tileId = layout[slotIdx];
      const val = getDisplayValue(tileId, dr, dc);
      const div = walkCellEls[R][C];
      div.className = 'cell';
      div.style.cssText = '';
      const type = cellType(val);
      if (type){
        div.classList.add(type);
        if (type === 'walk' && ROOM_NAMES[tileId]) div.classList.add('room-tile');
      } else if (patternSet.has(dr+'_'+dc)){
        div.classList.add('empty-slot');
      }
    }
  }
}

function walkCellDiv(graph, key){
  return walkCellEls[Math.floor(key / graph.W)][key % graph.W];
}
function walkClearClass(cls){
  for (const el of walkBoardEl.querySelectorAll('.' + cls)) el.classList.remove(cls);
}

// alle pionnen opnieuw zetten. Gericht wissen via de vorige posities i.p.v. een
// querySelectorAll over 1280 cellen, want dit draait bij het hoogste tempo elke 18 ms.
function paintWalkPawns(graph, players, activeIdx){
  for (const el of walkPaintedPawns) el.classList.remove('walk-pawn', 'walk-pawn-active');
  walkPaintedPawns = [];
  for (const p of players){
    if (walkIsIn(p)) continue;   // binnen: pion is van het bord
    const el = walkCellDiv(graph, p.pos);
    el.style.setProperty('--pawn', p.color);
    el.classList.add('walk-pawn');
    if (p.idx === activeIdx) el.classList.add('walk-pawn-active');
    walkPaintedPawns.push(el);
  }
}

// ---------- HUD ----------
// twee loopstenen plus de energiesteen; `e` is de energiekant (0 = niks). `boost` is de
// derde loopsteen van de Stuwstoot, of null als die actie niet is ingezet.
function renderWalkDice(a, b, e, rolling, boost){
  const cls = 'walk-die' + (rolling ? ' rolling' : '');
  const third = boost ? `<span class="${cls} boost" title="Stuwstoot">${boost}</span>` : '';
  const sum = rolling ? '' : `<span class="walk-die-sum">= ${a + b + (boost || 0)} stappen</span>`;
  const energy = rolling ? '' : `<span class="walk-die-sum energy">+${e} energie</span>`;
  walkDiceEl.innerHTML =
    `<span class="${cls}">${a}</span><span class="${cls}">${b}</span>${third}${sum}` +
    `<span class="${cls} energy">${e === 0 && !rolling ? '–' : e}</span>${energy}`;
}

function renderWalkMeta({ player, turn, stepsLeft }){
  if (!player){ walkMetaEl.innerHTML = ''; return; }
  const targetLabel = player.deck[player.nextIdx];
  const goal = player.rank
    ? walkIsIn(player)
      ? `<span class="hit">binnen als ${walkRankLabel(player.rank)}</span>`
      : `<span class="lost">verloren — ${walkRankLabel(player.rank)}</span>`
    : targetLabel
      ? `<span class="goal">${targetLabel} — ${QUEST_NAMES[targetLabel] || ''}</span>`
      : '—';
  walkMetaEl.innerHTML =
    `<span>Beurt <b>${turn}</b> · aan zet: <b class="walk-active-name" style="--pc:${player.color}">${player.name}</b> (start ${player.startLabel})</span>` +
    `<span>Doel: ${goal}</span>` +
    `<span>Voltooid: <b>${player.completed}</b> / ${SIM_QUESTS_TO_WIN}${stepsLeft !== undefined ? ` · nog <b>${stepsLeft}</b> stap(pen)` : ''}</span>`;
}

// stand van alle spelers naast elkaar — met meerdere pionnen op het bord is dit de plek
// waar je ziet wie waar naartoe wil en wie voorstaat
function walkRankLabel(rank){ return rank ? `${rank}e` : '—'; }

// wat de energiesteen deze beurt opleverde; meldt ook wanneer het plafond energie opslokt,
// want dat is precies het cijfer waar de kosten van een toekomstige actie op afgestemd worden
function walkRollText(d1, d2, d3, roll){
  return d3 ? `${d1}+${d2}+${d3}=${roll}` : `${d1}+${d2}=${roll}`;
}
// welke energie-actie deze beurt is ingezet
function walkActionNote(id){
  if (!id) return '';
  const act = ENERGY_ACTIONS[id];
  return ` <span class="action">▸ ${act.name} (−${act.cost})</span>`;
}
// welke beloningskaart deze beurt is gespeeld
function walkCardNote(id){
  if (!id) return '';
  return ` <span class="action">🃏 ${ACTION_CARDS[id].name}</span>`;
}
// de handkaarten van een speler als kleine kaart-badges (renderActionCardFace uit
// 95-simulate.js, gedeeld met de solo-modus)
function walkCardBadges(player){
  if (!player.cards.length) return '';
  return `<span class="walk-player-cards">` +
    player.cards.map(id => renderActionCardFace(id, { size: 'sm' })).join('') +
  `</span>`;
}

function walkEnergyNote(roll, gain, player){
  if (roll === 0) return ` <span class="energy">⚡0</span>`;
  if (gain.gained === 0) return ` <span class="energy">⚡vol — ${roll} verloren</span>`;
  const lost = gain.wasted ? `, ${gain.wasted} verloren` : '';
  return ` <span class="energy">⚡+${gain.gained} → ${player.energy}${lost}</span>`;
}
// Alleen wie zijn 6 opdrachten rond heeft is écht binnen en verlaat het bord. De laatste
// speler krijgt zijn plaats toebedeeld omdat het potje stopt, niet omdat hij binnenkwam.
function walkIsIn(p){ return p.completed >= SIM_QUESTS_TO_WIN; }

// boven het bord staan de ANDERE spelers (#walkScore), in het paneel rechts staat ALLEEN wie
// aan zet is (#walkScoreActive, gebruikersverzoek) — beide krijgen dezelfde volledige lijst,
// gefilterd via CSS op de `.active`-klasse (`#walkScore .walk-player.active{display:none}` en
// omgekeerd voor `#walkScoreActive`), zodat er maar één render-pad nodig is
function renderWalkScore(players, activeIdx){
  if (!walkScoreEl && !walkScoreActiveEl) return;
  const html = players.map(p => {
    const targetLabel = p.deck[p.nextIdx];
    const goal = p.rank
      ? walkIsIn(p)
        ? `<span class="hit">binnen — ${walkRankLabel(p.rank)}</span>`
        : `<span class="lost">verloren — ${walkRankLabel(p.rank)}</span>`
      : `${targetLabel} — ${QUEST_NAMES[targetLabel] || ''}`;
    const cls = 'walk-player' + (p.idx === activeIdx ? ' active' : '') + (p.rank ? ' done' : '');
    // p.strategy is leeg voor een mens in de solo-modus (die kiest zelf elke beurt, geen
    // vaste bot-strategie) — de ENERGY_ACTIONS-opzoeking overslaan voorkomt een crash daar
    const stratBadge = p.strategy
      ? `<span class="walk-player-strat" title="${ENERGY_ACTIONS[p.strategy].hint}">${ENERGY_ACTIONS[p.strategy].name}</span>`
      : (p.isHuman ? `<span class="walk-player-strat" title="jij kiest zelf een energie-actie of kaart">jij kiest</span>` : '');
    return `<div class="${cls}" style="--pc:${p.color}">` +
      `<span class="walk-player-dot"></span>` +
      `<span class="walk-player-name">${p.name}<span class="sub"> · ${p.startLabel}</span></span>` +
      stratBadge +
      walkCardBadges(p) +
      `<span class="walk-player-goal">${goal}</span>` +
      `<span class="walk-player-energy${p.energy >= ENERGY_MAX ? ' full' : ''}" title="energie (max ${ENERGY_MAX})">⚡${p.energy}</span>` +
      `<span class="walk-player-score">${p.completed}/${SIM_QUESTS_TO_WIN}</span>` +
    `</div>`;
  }).join('');
  if (walkScoreEl) walkScoreEl.innerHTML = html;
  if (walkScoreActiveEl) walkScoreActiveEl.innerHTML = html;
}

function walkLog(html, cls, player){
  const div = document.createElement('div');
  if (cls) div.className = cls;
  const dot = player ? `<i class="walk-log-dot" style="--pc:${player.color}"></i>` : '';
  div.innerHTML = dot + html;
  walkLogEl.appendChild(div);
  walkLogEl.scrollTop = walkLogEl.scrollHeight;
}

// ---------- besturing ----------
function setWalkRunning(on){
  walkRunning = on;
  if (!on) setWalkPaused(false);   // een gestopte run mag niet gepauzeerd blijven hangen
  if (!btnWalkStart) return;
  btnWalkStart.disabled = on;
  btnWalkStop.disabled = !on;
  if (btnWalkPause) btnWalkPause.disabled = !on;
  if (walkPlayersSel) walkPlayersSel.disabled = on;
  if (walkEnergyModeEl) walkEnergyModeEl.disabled = on;
  syncWalkStartEnabled();
}

// De startpositie is alleen een keuze bij één speler; bij meerdere spelers krijgt iedere
// speler een eigen startvakje en is er dus niets te kiezen.
function syncWalkStartEnabled(){
  if (!walkStartSel) return;
  const multi = walkPlayerCount() > 1;
  walkStartSel.disabled = walkRunning || multi;
  if (walkStartHintEl){
    walkStartHintEl.textContent = multi
      ? `${walkPlayerCount()} spelers krijgen elk een eigen startvakje (willekeurig verdeeld).`
      : '';
  }
}

// wordt ook aangeroepen zodra de indeling wijzigt (via clearSimResults in 95-simulate.js),
// want een lopende pion hoort niet op een bord dat onder hem vandaan verandert
function stopWalkSimulation(){
  walkRunId++;
  setWalkRunning(false);
}

function refreshWalkStartOptions(){
  if (!walkStartSel) return;
  const prev = walkStartSel.value;
  walkStartSel.innerHTML = SIM_START_LABELS.map(l => `<option value="${l}">${l}</option>`).join('')
    + `<option value="?">willekeurig</option>`;
  walkStartSel.value = SIM_START_LABELS.includes(prev) || prev === '?' ? prev : '?';
}

// eindklassering: eerst wie binnen is op volgorde van binnenkomst, daarna de rest op
// aantal voltooide opdrachten
function walkStandings(players){
  return players.slice()
    .sort((a, b) => (a.rank || 99) - (b.rank || 99) || b.completed - a.completed)
    .map(p => {
      const place = p.rank ? `${walkRankLabel(p.rank)} ` : '';
      return `<span class="walk-standing" style="--pc:${p.color}"><i class="walk-log-dot" style="--pc:${p.color}"></i>${place}${p.name} ${p.completed}/${SIM_QUESTS_TO_WIN}</span>`;
    })
    .join('');
}

async function runWalkSimulation(){
  const runId = ++walkRunId;
  const aborted = () => runId !== walkRunId;
  setWalkRunning(true);
  setWalkPaused(false);        // een nieuwe run begint nooit gepauzeerd
  walkLogEl.innerHTML = '';
  walkStatusEl.innerHTML = '';

  const reach = analyseCellReachability();
  if (reach.unreachable.length > 0){
    walkStatusEl.innerHTML = `<span class="bad">✕ Dit bord heeft ${reach.unreachable.length} onbereikbare vakjes — pas de indeling aan voordat je simuleert.</span>`;
    setWalkRunning(false);
    return;
  }

  renderWalkBoard();
  const graph = buildSimGraph();

  const missing = [...SIM_QUEST_LABELS, ...SIM_START_LABELS].filter(l =>
    graph.questCells[l] === undefined && graph.startCells[l] === undefined);
  if (missing.length){
    walkStatusEl.innerHTML = `<span class="bad">✕ Deze vakjes ontbreken op het bord: ${missing.join(', ')}.</span>`;
    setWalkRunning(false);
    return;
  }

  const rand = mulberry32(Math.floor(Math.random() * 4294967296));
  const playerCount = walkPlayerCount();
  const startLabels = playerCount === 1
    ? [walkStartSel.value === '?'
        ? SIM_START_LABELS[Math.floor(rand() * SIM_START_LABELS.length)]
        : walkStartSel.value]
    : simShuffle(SIM_START_LABELS, rand).slice(0, playerCount);

  const players = startLabels.map((label, i) => ({
    idx: i,
    name: playerCount === 1 ? 'Speler' : `Speler ${i + 1}`,
    color: WALK_PLAYER_COLORS[i],
    startLabel: label,
    pos: graph.startCells[label],
    deck: simShuffle(SIM_QUEST_LABELS, rand),
    nextIdx: 0,
    completed: 0,
    energy: 0,
    // "mix" geeft speler 1 t/m 4 elk een andere strategie, zodat je ze naast elkaar ziet
    strategy: walkEnergyModeEl && walkEnergyModeEl.value !== 'mix'
      ? walkEnergyModeEl.value
      : ENERGY_STRATEGIES[i % ENERGY_STRATEGIES.length],
    actionUses: 0,
    cards: [],               // beloningskaarten in de hand (max ACTION_CARD_HAND_MAX)
    skipEnergyRoll: false,   // getroffen door Kortsluiting: mist de eerstvolgende energiesteen
    condenserPending: false, // Condensator gespeeld: de VOLGENDE energiesteen telt dubbel
    rank: 0,                // 0 = nog aan het spelen; 1..4 = binnengekomen op die plaats
    doneCells: [],          // opdrachtvakjes die DEZE speler al gehad heeft
  }));
  // beurtvolgorde geloot, net als in simulateOneGame()
  const turnOrder = simShuffle(players.map(p => p.idx), rand);
  const finishTarget = simFinishTarget(playerCount);
  const deck = buildActionDeck(rand);   // één gedeelde stapel voor dit potje

  for (const p of players){
    walkLog(`${p.name} start op <b>${p.startLabel}</b> · energie: <b>${ENERGY_ACTIONS[p.strategy].name}</b> · stapel: ${p.deck.slice(0, SIM_QUESTS_TO_WIN).join(' → ')} …`, null, p);
  }
  walkLog(`Elke voltooide opdracht levert een beloningskaart op van een gedeelde stapel — max 2 kaarten in de hand.`);
  if (playerCount > 1){
    walkLog(`Beurtvolgorde: ${turnOrder.map(i => players[i].name).join(' → ')}.`);
    walkLog(playerCount === 2
      ? `Er wordt gespeeld tot de winnaar binnen is — de ander is dan tweede.`
      : `Er wordt doorgespeeld tot de <b>${finishTarget}e</b> binnen is; de laatste speler is dan automatisch ${playerCount}e.`);
  }

  renderWalkScore(players, turnOrder[0]);
  renderWalkMeta({ player: players[turnOrder[0]], turn: 0 });
  paintWalkPawns(graph, players, turnOrder[0]);

  let turn = 0;
  let finished = 0;
  let gameOver = false;

  while (turn < SIM_MAX_TURNS && !gameOver){
    const roundFinishers = [];   // spelers die deze ronde hun 6e opdracht voltooien
    let hitTurnCap = false;
    for (const pIdx of turnOrder){
      if (turn >= SIM_MAX_TURNS){ hitTurnCap = true; break; }
      if (aborted()) return;

      const player = players[pIdx];
      if (player.rank) continue;   // binnen: speelt niet meer mee
      turn++;
      // Energie-acties en kaarten hebben ELK hun eigen actie-slot per beurt (max 1 van elk) —
      // zelfde opzet als simulateOneGame() in 95-simulate.js, zie de uitgebreide toelichting
      // daar voor de drie paren (Stuwlading/Stuwstoot, Herkalibratie/Herprioritering, Blinde
      // Vlek/Noodtransport) die elkaar nog wél uitsluiten binnen hún ene bewegingsmoment.
      let energyActionUsed = false;   // hooguit 1 energie-actie per beurt
      let cardActionUsed = false;     // hooguit 1 kaart spelen per beurt
      let usedEnergyAction = null; // id uit ENERGY_ACTIONS, voor de logregel
      let usedCardId = null;       // id uit ACTION_CARDS, voor de logregel

      // energiesteen eerst (tenzij Kortsluiting die deze beurt blokkeert), zodat wat je deze
      // beurt rolt meteen inzetbaar is — zelfde volgorde als simulateOneGame()
      let energyRoll = 0, energyGain = { gained: 0, wasted: 0 };
      if (player.skipEnergyRoll){
        player.skipEnergyRoll = false;
      } else {
        energyRoll = simRollEnergy(rand);
        energyGain = simGainEnergy(player, energyRoll);
        // vorige beurt een Condensator gespeeld: deze steen telt dubbel (zie simulateOneGame)
        if (player.condenserPending){
          player.condenserPending = false;
          const bonus = simGainEnergy(player, energyRoll);
          energyGain.gained += bonus.gained;
          energyGain.wasted += bonus.wasted;
          walkLog(`${player.name} verzilvert de <b>Condensator</b>: energiesteen ${energyRoll} telt dubbel.`, null, player);
        }
      }

      // fase 1: kaarten rond de energiefase; de Condensator wordt klaargezet voor de VOLGENDE beurt
      if (!cardActionUsed && player.cards.includes('condenser') && !player.condenserPending && player.energy < ENERGY_MAX){
        player.condenserPending = true;
        useActionCard(player, 'condenser', deck);
        cardActionUsed = true; usedCardId = 'condenser';
      }
      if (!cardActionUsed && player.cards.includes('short')){
        const victim = pickShortCircuitTarget(players, pIdx);
        if (victim){
          victim.skipEnergyRoll = true;
          useActionCard(player, 'short', deck);
          cardActionUsed = true; usedCardId = 'short';
        }
      }
      if (!cardActionUsed && player.cards.includes('ration') && player.energy < ENERGY_MAX){
        simGainEnergy(player, 3);
        useActionCard(player, 'ration', deck);
        cardActionUsed = true; usedCardId = 'ration';
      }

      // fase 2: doel bepalen — Herkalibratie (kaart, gratis) en Herprioritering (energie, betaald)
      // doen hetzelfde (energyReorderTarget) en blijven daarom elkaar uitsluiten via
      // `targetSwapped`; Duwstoot verplaatst een tegenstander, niet jezelf, dus geen conflict
      let targetLabel = player.deck[player.nextIdx];
      let targetSwapped = false;
      const shim = { order: player.deck, nextIdx: player.nextIdx };  // energyReorderTarget() werkt op `order`
      if (!cardActionUsed && player.cards.includes('recal')){
        const swapped = energyReorderTarget(graph, shim, player.pos);
        if (swapped !== null){
          targetLabel = swapped;
          useActionCard(player, 'recal', deck);
          cardActionUsed = true; usedCardId = 'recal';
          targetSwapped = true;
        }
      }
      if (!cardActionUsed && player.cards.includes('shove')){
        const shove = pickShoveMove(graph, players, pIdx);
        if (shove){
          shove.player.pos = shove.toKey;
          useActionCard(player, 'shove', deck);
          cardActionUsed = true; usedCardId = 'shove';
          walkLog(`${player.name} gebruikt <b>Duwstoot</b> op ${shove.player.name}.`, null, player);
        }
      }
      if (!targetSwapped && !energyActionUsed && player.strategy === 'reorder' && player.energy >= ENERGY_ACTIONS.reorder.cost){
        const swapped = blindReorderTarget(graph, shim, player.pos, REORDER_BLIND_THRESHOLD);
        if (swapped !== null){
          targetLabel = swapped;
          player.energy -= ENERGY_ACTIONS.reorder.cost;
          player.actionUses++;
          energyActionUsed = true; usedEnergyAction = 'reorder';
        }
      }
      const targetKey = graph.questCells[targetLabel];

      // bord klaarzetten voor deze beurt: eigen voortgang, eigen doel, alle pionnen (ook een
      // net geduwde tegenstander staat hier al op zijn nieuwe plek)
      walkClearClass('walk-trail');
      walkClearClass('walk-done');
      for (const k of player.doneCells) walkCellDiv(graph, k).classList.add('walk-done');
      walkClearClass('walk-target');
      const targetDiv = walkCellDiv(graph, targetKey);
      targetDiv.style.setProperty('--pc', player.color);
      targetDiv.classList.add('walk-target');
      paintWalkPawns(graph, players, pIdx);
      renderWalkScore(players, pIdx);
      renderWalkMeta({ player, turn });

      // dobbelen — even laten rollen zodat je het ziet gebeuren. Geteld in stappen en niet
      // op de klok, anders is de worp na een pauze meteen "uitgerold".
      const shakeSteps = Math.round(walkSpeed().rollMs / 90);
      for (let i = 0; i < shakeSteps; i++){
        if (aborted()) return;
        renderWalkDice(1 + Math.floor(Math.random()*6), 1 + Math.floor(Math.random()*6),
                       ENERGY_DIE_FACES[Math.floor(Math.random()*ENERGY_DIE_FACES.length)], true);
        await walkTick(90);
      }

      // pion langs een pad laten lopen; `special` markeert een niet-gewone verplaatsing
      // (Noodtransport, Zwaartekracht-laarzen) met een ander spoor
      async function walkPath(path, special){
        for (let i = 1; i < path.length; i++){
          if (aborted()) return false;
          const leaving = walkCellDiv(graph, player.pos);
          leaving.style.setProperty('--pc', player.color);
          leaving.classList.add('walk-trail');
          if (special) leaving.classList.add('walk-jump');
          player.pos = path[i];
          paintWalkPawns(graph, players, pIdx);
          renderWalkMeta({ player, turn, stepsLeft: path.length - 1 - i });
          await walkTick(walkSpeed().stepMs);
        }
        return true;
      }

      const occupiedNow = () => {
        const occ = new Set();
        for (const other of players) if (other.idx !== pIdx && !walkIsIn(other)) occ.add(other.pos);
        return occ;
      };

      // fase 3: beweging — Zwaartekracht-laarzen vervangt de worp helemaal; anders de gewone
      // loopstenen met Stuwlading (kaart) of Stuwstoot (energie) als derde steen — die twee
      // doen hetzelfde en blijven daarom via else-if elkaar uitsluiten
      let move, d1 = 0, d2 = 0, d3 = null, roll = 0, usedBoots = false;
      if (!cardActionUsed && player.cards.includes('boots')){
        const bootsMove = resolveGravityBoots(graph, player.pos, 10, occupiedNow(), targetKey);
        if (bootsMove){
          move = bootsMove;
          usedBoots = true;
          useActionCard(player, 'boots', deck);
          cardActionUsed = true; usedCardId = 'boots';
        }
      }
      if (usedBoots){
        walkDiceEl.innerHTML =
          `<span class="walk-die boost" title="Zwaartekracht-laarzen">🥾</span>` +
          `<span class="walk-die-sum">${move.path.length - 1} stappen rechtdoor</span>` +
          `<span class="walk-die energy">${energyRoll === 0 ? '–' : energyRoll}</span>` +
          `<span class="walk-die-sum energy">+${energyRoll} energie</span>`;
      } else {
        d1 = simRollD6(rand); d2 = simRollD6(rand);
        if (!cardActionUsed && player.cards.includes('boostcell')){
          d3 = simRollD6(rand);
          useActionCard(player, 'boostcell', deck);
          cardActionUsed = true; usedCardId = 'boostcell';
        } else if (!energyActionUsed && player.strategy === 'boost' && player.energy >= ENERGY_ACTIONS.boost.cost){
          d3 = simRollD6(rand);
          player.energy -= ENERGY_ACTIONS.boost.cost;
          player.actionUses++;
          energyActionUsed = true; usedEnergyAction = 'boost';
        }
        renderWalkDice(d1, d2, energyRoll, false, d3);
        roll = d1 + d2 + (d3 || 0);
      }
      if (aborted()) return;
      await walkTick(Math.min(500, walkSpeed().rollMs));
      if (aborted()) return;

      if (!usedBoots){
        move = resolveMove(graph, player.pos, roll, occupiedNow(), targetKey, rand);
        // Koerscorrectie: tegenvallende worp overdoen (zie simulateOneGame voor de drempel)
        const dice = d3 ? 3 : 2;
        if (!move.bankedQuest && !cardActionUsed && player.cards.includes('reroll') && roll < dice * 3.5){
          d1 = simRollD6(rand); d2 = simRollD6(rand);
          if (d3) d3 = simRollD6(rand);
          roll = d1 + d2 + (d3 || 0);
          useActionCard(player, 'reroll', deck);
          cardActionUsed = true; usedCardId = 'reroll';
          renderWalkDice(d1, d2, energyRoll, false, d3);
          if (aborted()) return;
          await walkTick(Math.min(500, walkSpeed().rollMs));
          if (aborted()) return;
          move = resolveMove(graph, player.pos, roll, occupiedNow(), targetKey, rand);
        }
      }

      // fase 4: Blinde Vlek (kaart) en Noodtransport (energie) lossen allebei een blokkade op
      // — blijven elkaar uitsluiten binnen dit ene bewegingsmoment (`blindResolvedBlock`), zie
      // de toelichting in simulateOneGame(). Noodtransport mag TUSSENTIJDS.
      let blindResolvedBlock = false;
      if (!move.bankedQuest && !cardActionUsed && !usedBoots && player.cards.includes('blind') && move.wasBlocked){
        const retry = resolveMove(graph, player.pos, roll, SIM_EMPTY_SET, targetKey, rand, occupiedNow());
        if (retry && retry.key !== move.key){
          move = retry;
          useActionCard(player, 'blind', deck);
          cardActionUsed = true; usedCardId = 'blind';
          blindResolvedBlock = true;
        }
      }
      if (!blindResolvedBlock && !move.bankedQuest && !energyActionUsed && player.strategy === 'jump' && player.energy >= ENERGY_ACTIONS.jump.cost){
        const jump = resolveEnergyJump(graph, player.pos, ENERGY_JUMP_RANGE, targetKey);
        if (jump){
          player.energy -= ENERGY_ACTIONS.jump.cost;
          player.actionUses++;
          energyActionUsed = true; usedEnergyAction = 'jump';
          if (!await walkPath(jump.path, true)) return;
          move = jump.banked
            ? { key: jump.key, path: [jump.key], stepsUsed: 0, bankedQuest: true, wasBlocked: false }
            : resolveMove(graph, jump.key, roll, occupiedNow(), targetKey, rand);
        }
      }
      if (!await walkPath(move.path, usedBoots)) return;

      const rollText = usedBoots ? `🥾 ${move.stepsUsed} van 10 stappen rechtdoor` : walkRollText(d1, d2, d3, roll);
      // beide kunnen nu tegelijk waar zijn (energie-actie EN kaart zijn losse sloten per beurt),
      // dus samenvoegen i.p.v. kiezen — anders verdween een gespeelde kaart stilletjes uit de log
      // zodra er in dezelfde beurt ook een energie-actie was ingezet
      const turnNote = walkActionNote(usedEnergyAction) + walkCardNote(usedCardId);

      if (move.bankedQuest){
        player.completed++;
        player.nextIdx++;
        player.doneCells.push(targetKey);
        targetDiv.classList.remove('walk-target');
        targetDiv.classList.add('walk-done');
        const extra = (!usedBoots && move.stepsUsed < roll) ? ` (na ${move.stepsUsed} van ${roll} stappen — de rest vervalt)` : '';
        walkLog(`Beurt ${turn}: <b>${rollText}</b>${walkEnergyNote(energyRoll, energyGain, player)}${turnNote} → <span class="hit">${targetLabel} ${QUEST_NAMES[targetLabel] || ''} voltooid${extra}</span> · ${player.completed}/${SIM_QUESTS_TO_WIN}`, 'hit', player);

        if (player.cards.length < ACTION_CARD_HAND_MAX){
          const drawn = drawActionCard(deck, rand);
          if (drawn){
            player.cards.push(drawn);
            walkLog(`${player.name} trekt een beloningskaart: <b>${ACTION_CARDS[drawn].name}</b> — ${ACTION_CARDS[drawn].hint}.`, null, player);
          }
        } else {
          walkLog(`${player.name} zou een kaart trekken, maar de hand is al vol.`, null, player);
        }

        if (player.completed >= SIM_QUESTS_TO_WIN){
          // rank wordt NIET meteen toegekend — pas ná deze hele ronde (zie resolveRoundFinishers
          // in 95-simulate.js), zodat wie later in de beurtvolgorde zit deze ronde nog evenveel
          // kans krijgt om ook zijn 6e opdracht te halen, i.p.v. dat beurtvolgorde de plaats bepaalt
          player.finishTurn = turn;
          walkClearClass('walk-target');
          walkLog(`${player.name} heeft alle ${SIM_QUESTS_TO_WIN} opdrachten voltooid (beurt ${turn}) en verlaat het bord — wacht op de rest van deze ronde.`, 'hit', player);
          roundFinishers.push(player);
          paintWalkPawns(graph, players, pIdx);
        }
      } else {
        const blocked = move.wasBlocked ? ' · liep onderweg tegen een bezette route aan' : '';
        const extra = (!usedBoots && move.stepsUsed < roll) ? ` — kon maar ${move.stepsUsed} stappen zetten (doodlopend)` : '';
        walkLog(`Beurt ${turn}: <b>${rollText}</b>${walkEnergyNote(energyRoll, energyGain, player)}${turnNote} → onderweg naar ${targetLabel}${extra}${blocked}`, null, player);
      }
      renderWalkScore(players, pIdx);
      renderWalkMeta({ player, turn });
    }

    if (aborted()) return;
    if (roundFinishers.length){
      const groups = resolveRoundFinishers(roundFinishers, finished);
      for (const group of groups){
        if (group.length === 1){
          walkLog(`<b>${group[0].name} is binnen als ${walkRankLabel(group[0].rank)}</b>.`, 'hit', group[0]);
        } else {
          const names = group.map(p => p.name).join(' en ');
          walkLog(`<b>${names} delen de ${walkRankLabel(group[0].rank)} plaats</b> — gelijke energie (${group[0].energy}) en evenveel actiekaarten in de hand (${group[0].cards.length}).`, 'hit', null);
        }
      }
      finished += roundFinishers.length;
      renderWalkScore(players, turnOrder[0]);
      if (finished >= finishTarget){
        // de achterblijver(s) kunnen niets meer bereiken: plaats staat vast
        for (const p of players) if (!p.rank) p.rank = finished + 1;
        gameOver = true;
      }
    }
    if (hitTurnCap) break;
  }

  if (aborted()) return;
  walkClearClass('walk-target');
  walkClearClass('walk-trail');
  const winners = players.filter(p => p.rank === 1);
  if (gameOver && winners.length){
    const standings = playerCount > 1 ? `<span class="walk-standings-row">Eindklassering: ${walkStandings(players)}</span>` : '';
    const winText = winners.length === 1
      ? `${winners[0].name} wint vanaf ${winners[0].startLabel} in ${winners[0].finishTurn} beurten`
      : `${winners.map(w => w.name).join(' en ')} delen de winst (gelijke energie en actiekaarten)`;
    walkStatusEl.innerHTML = `<span class="ok">✓ ${winText} — potje uitgespeeld in ${turn} beurten.</span>${standings}`;
  } else {
    walkStatusEl.innerHTML = `<span class="bad">✕ Afgekapt na ${SIM_MAX_TURNS} beurten — niet iedereen was binnen.</span><span class="walk-standings-row">${walkStandings(players)}</span>`;
  }
  setWalkRunning(false);
}

if (btnWalkStart) btnWalkStart.addEventListener('click', runWalkSimulation);
if (btnWalkPause) btnWalkPause.addEventListener('click', () => setWalkPaused(!walkPaused));
if (btnWalkStop) btnWalkStop.addEventListener('click', stopWalkSimulation);
if (walkPlayersSel) walkPlayersSel.addEventListener('change', syncWalkStartEnabled);
if (walkSpeedEl){
  const syncLabel = () => { walkSpeedLabelEl.textContent = walkSpeed().label; };
  walkSpeedEl.addEventListener('input', syncLabel);
  syncLabel();
}
refreshWalkStartOptions();
syncWalkStartEnabled();
