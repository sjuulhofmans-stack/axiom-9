// ---------- stap voor stap: 1 t/m 4 spelers, zichtbaar over het bord ----------
// Speelt EEN potje op de huidige indeling en toont elke stap. Hergebruikt de engine uit
// 95-simulate.js (buildSimGraph + resolveMove), zodat de regels hier per definitie dezelfde
// zijn als in de batch-simulatie: 2xD6 = exact aantal stappen, geen U-turn, bezette vakjes
// blokkeren, en je stopt zodra je je eigen opdrachtvakje raakt (rest van de worp vervalt).
// Met meerdere spelers is de "bezette vakjes"-set precies de posities van de andere pionnen,
// net als in simulateOneGame(); met één speler is die set leeg.

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
const walkSpeedEl = document.getElementById('walkSpeed');
const walkSpeedLabelEl = document.getElementById('walkSpeedLabel');
const walkDiceEl = document.getElementById('walkDice');
const walkMetaEl = document.getElementById('walkMeta');
const walkScoreEl = document.getElementById('walkScore');
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
    const el = walkCellDiv(graph, p.pos);
    el.style.setProperty('--pawn', p.color);
    el.classList.add('walk-pawn');
    if (p.idx === activeIdx) el.classList.add('walk-pawn-active');
    walkPaintedPawns.push(el);
  }
}

// ---------- HUD ----------
function renderWalkDice(a, b, rolling){
  const cls = 'walk-die' + (rolling ? ' rolling' : '');
  const sum = rolling ? '' : `<span class="walk-die-sum">= ${a + b} stappen</span>`;
  walkDiceEl.innerHTML = `<span class="${cls}">${a}</span><span class="${cls}">${b}</span>${sum}`;
}

function renderWalkMeta({ player, turn, stepsLeft }){
  if (!player){ walkMetaEl.innerHTML = ''; return; }
  const targetLabel = player.deck[player.nextIdx];
  const goal = targetLabel
    ? `<span class="goal">${targetLabel} — ${QUEST_NAMES[targetLabel] || ''}</span>`
    : '—';
  walkMetaEl.innerHTML =
    `<span>Beurt <b>${turn}</b> · aan zet: <b class="walk-active-name" style="--pc:${player.color}">${player.name}</b> (start ${player.startLabel})</span>` +
    `<span>Doel: ${goal}</span>` +
    `<span>Voltooid: <b>${player.completed}</b> / ${SIM_QUESTS_TO_WIN}${stepsLeft !== undefined ? ` · nog <b>${stepsLeft}</b> stap(pen)` : ''}</span>`;
}

// stand van alle spelers naast elkaar — met meerdere pionnen op het bord is dit de plek
// waar je ziet wie waar naartoe wil en wie voorstaat
function renderWalkScore(players, activeIdx){
  if (!walkScoreEl) return;
  walkScoreEl.innerHTML = players.map(p => {
    const targetLabel = p.deck[p.nextIdx];
    const goal = p.completed >= SIM_QUESTS_TO_WIN
      ? '<span class="hit">gewonnen</span>'
      : `${targetLabel} — ${QUEST_NAMES[targetLabel] || ''}`;
    return `<div class="walk-player${p.idx === activeIdx ? ' active' : ''}" style="--pc:${p.color}">` +
      `<span class="walk-player-dot"></span>` +
      `<span class="walk-player-name">${p.name}<span class="sub"> · ${p.startLabel}</span></span>` +
      `<span class="walk-player-goal">${goal}</span>` +
      `<span class="walk-player-score">${p.completed}/${SIM_QUESTS_TO_WIN}</span>` +
    `</div>`;
  }).join('');
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

// eindstand, gesorteerd op voltooide opdrachten
function walkStandings(players){
  return players.slice().sort((a, b) => b.completed - a.completed)
    .map(p => `<span class="walk-standing" style="--pc:${p.color}"><i class="walk-log-dot" style="--pc:${p.color}"></i>${p.name} ${p.completed}/${SIM_QUESTS_TO_WIN}</span>`)
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
    doneCells: [],          // opdrachtvakjes die DEZE speler al gehad heeft
  }));
  // beurtvolgorde geloot, net als in simulateOneGame()
  const turnOrder = simShuffle(players.map(p => p.idx), rand);

  for (const p of players){
    walkLog(`${p.name} start op <b>${p.startLabel}</b> · stapel: ${p.deck.slice(0, SIM_QUESTS_TO_WIN).join(' → ')} …`, null, p);
  }
  if (playerCount > 1){
    walkLog(`Beurtvolgorde: ${turnOrder.map(i => players[i].name).join(' → ')}.`);
  }

  renderWalkScore(players, turnOrder[0]);
  renderWalkMeta({ player: players[turnOrder[0]], turn: 0 });
  paintWalkPawns(graph, players, turnOrder[0]);

  let turn = 0;
  let winner = null;

  while (turn < SIM_MAX_TURNS && !winner){
    for (const pIdx of turnOrder){
      if (winner || turn >= SIM_MAX_TURNS) break;
      if (aborted()) return;
      turn++;

      const player = players[pIdx];
      const targetLabel = player.deck[player.nextIdx];
      const targetKey = graph.questCells[targetLabel];

      // bord klaarzetten voor deze beurt: eigen voortgang, eigen doel, alle pionnen
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
        renderWalkDice(1 + Math.floor(Math.random()*6), 1 + Math.floor(Math.random()*6), true);
        await walkTick(90);
      }
      const d1 = simRollD6(rand), d2 = simRollD6(rand);
      renderWalkDice(d1, d2, false);
      const roll = d1 + d2;
      if (aborted()) return;
      await walkTick(Math.min(500, walkSpeed().rollMs));
      if (aborted()) return;

      // andere pionnen blokkeren, precies zoals in de batch-simulatie
      const occupied = new Set();
      for (const other of players) if (other.idx !== pIdx) occupied.add(other.pos);

      const move = resolveMove(graph, player.pos, roll, occupied, targetKey, rand);

      // pad stap voor stap aflopen (path[0] is het vakje waar de pion al staat)
      for (let i = 1; i < move.path.length; i++){
        if (aborted()) return;
        const leaving = walkCellDiv(graph, player.pos);
        leaving.style.setProperty('--pc', player.color);
        leaving.classList.add('walk-trail');
        player.pos = move.path[i];
        paintWalkPawns(graph, players, pIdx);
        renderWalkMeta({ player, turn, stepsLeft: move.path.length - 1 - i });
        await walkTick(walkSpeed().stepMs);
      }

      if (move.bankedQuest){
        player.completed++;
        player.nextIdx++;
        player.doneCells.push(targetKey);
        targetDiv.classList.remove('walk-target');
        targetDiv.classList.add('walk-done');
        const extra = move.stepsUsed < roll ? ` (na ${move.stepsUsed} van ${roll} stappen — de rest vervalt)` : '';
        walkLog(`Beurt ${turn}: <b>${d1}+${d2}=${roll}</b> → <span class="hit">${targetLabel} ${QUEST_NAMES[targetLabel] || ''} voltooid${extra}</span> · ${player.completed}/${SIM_QUESTS_TO_WIN}`, 'hit', player);
        if (player.completed >= SIM_QUESTS_TO_WIN) winner = player;
      } else {
        const blocked = move.wasBlocked ? ' · liep onderweg tegen een bezette route aan' : '';
        const extra = move.stepsUsed < roll ? ` — kon maar ${move.stepsUsed} stappen zetten (doodlopend)` : '';
        walkLog(`Beurt ${turn}: <b>${d1}+${d2}=${roll}</b> → onderweg naar ${targetLabel}${extra}${blocked}`, null, player);
      }
      renderWalkScore(players, pIdx);
      renderWalkMeta({ player, turn });
    }
  }

  if (aborted()) return;
  walkClearClass('walk-target');
  if (winner){
    const standings = playerCount > 1 ? ` Eindstand: ${walkStandings(players)}` : '';
    walkStatusEl.innerHTML = `<span class="ok">✓ ${winner.name} wint vanaf ${winner.startLabel} in ${turn} beurten — ${SIM_QUESTS_TO_WIN} opdrachten voltooid.</span>${standings}`;
  } else {
    walkStatusEl.innerHTML = `<span class="bad">✕ Afgekapt na ${SIM_MAX_TURNS} beurten zonder winst.</span> ${walkStandings(players)}`;
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
