// ---------- stap voor stap: één speler, zichtbaar over het bord ----------
// Speelt EEN potje met EEN speler op de huidige indeling en toont elke stap. Hergebruikt de
// engine uit 95-simulate.js (buildSimGraph + resolveMove), zodat de regels hier per definitie
// dezelfde zijn als in de batch-simulatie: 2xD6 = exact aantal stappen, geen U-turn, en je
// stopt zodra je je eigen opdrachtvakje raakt (rest van de worp vervalt). Er is maar één
// speler, dus de "bezette vakjes"-set is altijd leeg.

// tempo-standen voor de schuifregelaar: ms per gezette stap
const WALK_SPEEDS = [
  { label: 'heel langzaam', stepMs: 620, rollMs: 900 },
  { label: 'langzaam',      stepMs: 320, rollMs: 700 },
  { label: 'normaal',       stepMs: 170, rollMs: 520 },
  { label: 'snel',          stepMs:  70, rollMs: 300 },
  { label: 'razendsnel',    stepMs:  18, rollMs: 120 },
];

const walkBoardEl = document.getElementById('walkBoard');
const walkStartSel = document.getElementById('walkStart');
const walkSpeedEl = document.getElementById('walkSpeed');
const walkSpeedLabelEl = document.getElementById('walkSpeedLabel');
const walkDiceEl = document.getElementById('walkDice');
const walkMetaEl = document.getElementById('walkMeta');
const walkStatusEl = document.getElementById('walkStatus');
const walkLogEl = document.getElementById('walkLog');
const btnWalkStart = document.getElementById('btnWalkStart');
const btnWalkStop = document.getElementById('btnWalkStop');

let walkCellEls = null;   // [R][C] -> div, pas opgebouwd bij het eerste gebruik
let walkRunId = 0;        // elke nieuwe run verhoogt dit; een lopende run stopt zodra hij afwijkt
let walkRunning = false;

function walkSpeed(){ return WALK_SPEEDS[parseInt(walkSpeedEl.value, 10)] || WALK_SPEEDS[2]; }
function walkSleep(ms){ return new Promise(res => setTimeout(res, ms)); }

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

// tekent de huidige indeling; wist alle loop-markeringen
function renderWalkBoard(){
  if (!walkBoardEl) return;
  if (!walkCellEls) walkCellEls = buildWalkBoard();
  for (let R = 0; R < TILE_ROWS*TILE_H; R++){
    for (let C = 0; C < TILE_COLS*TILE_W; C++){
      const dr = R % TILE_H, dc = C % TILE_W;
      const slotIdx = Math.floor(R/TILE_H)*TILE_COLS + Math.floor(C/TILE_W);
      const tileId = layout[slotIdx];
      const val = getDisplayValue(tileId, dr, dc);
      const div = walkCellEls[R][C];
      div.className = 'cell';
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

// ---------- HUD ----------
function renderWalkDice(a, b, rolling){
  const cls = 'walk-die' + (rolling ? ' rolling' : '');
  const sum = rolling ? '' : `<span class="walk-die-sum">= ${a + b} stappen</span>`;
  walkDiceEl.innerHTML = `<span class="${cls}">${a}</span><span class="${cls}">${b}</span>${sum}`;
}
function renderWalkMeta({ startLabel, targetLabel, completed, turn, stepsLeft }){
  const goal = targetLabel
    ? `<span class="goal">${targetLabel} — ${QUEST_NAMES[targetLabel] || ''}</span>`
    : '—';
  walkMetaEl.innerHTML =
    `<span>Start <b>${startLabel}</b> · beurt <b>${turn}</b></span>` +
    `<span>Doel: ${goal}</span>` +
    `<span>Voltooid: <b>${completed}</b> / ${SIM_QUESTS_TO_WIN}${stepsLeft !== undefined ? ` · nog <b>${stepsLeft}</b> stap(pen)` : ''}</span>`;
}
function walkLog(html, cls){
  const div = document.createElement('div');
  if (cls) div.className = cls;
  div.innerHTML = html;
  walkLogEl.appendChild(div);
  walkLogEl.scrollTop = walkLogEl.scrollHeight;
}

// ---------- besturing ----------
function setWalkRunning(on){
  walkRunning = on;
  if (!btnWalkStart) return;
  btnWalkStart.disabled = on;
  btnWalkStop.disabled = !on;
  walkStartSel.disabled = on;
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

async function runWalkSimulation(){
  const runId = ++walkRunId;
  setWalkRunning(true);
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
  const startLabel = walkStartSel.value === '?'
    ? SIM_START_LABELS[Math.floor(rand() * SIM_START_LABELS.length)]
    : walkStartSel.value;

  const deck = simShuffle(SIM_QUEST_LABELS, rand);
  let pos = graph.startCells[startLabel];
  let nextIdx = 0, completed = 0, turn = 0;
  const emptyOccupied = new Set(); // één speler: niemand staat in de weg

  walkLog(`Speler start op <b>${startLabel}</b>. Opdrachtstapel: ${deck.slice(0, SIM_QUESTS_TO_WIN).join(' → ')} …`);

  let pawnCell = walkCellDiv(graph, pos);
  pawnCell.classList.add('walk-pawn');
  renderWalkMeta({ startLabel, targetLabel: deck[0], completed, turn });

  while (completed < SIM_QUESTS_TO_WIN && turn < SIM_MAX_TURNS){
    if (runId !== walkRunId) return;
    turn++;

    const targetLabel = deck[nextIdx];
    const targetKey = graph.questCells[targetLabel];

    // doelvakje markeren
    walkClearClass('walk-target');
    walkCellDiv(graph, targetKey).classList.add('walk-target');
    renderWalkMeta({ startLabel, targetLabel, completed, turn });

    // dobbelen — even laten rollen zodat je het ziet gebeuren
    const speed = walkSpeed();
    if (speed.rollMs > 0){
      const shakeUntil = Date.now() + speed.rollMs;
      while (Date.now() < shakeUntil){
        if (runId !== walkRunId) return;
        renderWalkDice(1 + Math.floor(Math.random()*6), 1 + Math.floor(Math.random()*6), true);
        await walkSleep(90);
      }
    }
    const d1 = simRollD6(rand), d2 = simRollD6(rand);
    renderWalkDice(d1, d2, false);
    const roll = d1 + d2;
    if (runId !== walkRunId) return;
    await walkSleep(Math.min(500, walkSpeed().rollMs));
    if (runId !== walkRunId) return;

    const move = resolveMove(graph, pos, roll, emptyOccupied, targetKey, rand);

    // pad stap voor stap aflopen (path[0] is het vakje waar de pion al staat)
    walkClearClass('walk-trail');
    for (let i = 1; i < move.path.length; i++){
      if (runId !== walkRunId) return;
      pawnCell.classList.remove('walk-pawn');
      pawnCell.classList.add('walk-trail');
      pos = move.path[i];
      pawnCell = walkCellDiv(graph, pos);
      pawnCell.classList.add('walk-pawn');
      renderWalkMeta({ startLabel, targetLabel, completed, turn, stepsLeft: move.path.length - 1 - i });
      await walkSleep(walkSpeed().stepMs);
    }

    if (move.bankedQuest){
      completed++;
      nextIdx++;
      walkCellDiv(graph, targetKey).classList.remove('walk-target');
      walkCellDiv(graph, targetKey).classList.add('walk-done');
      const extra = move.stepsUsed < roll ? ` (na ${move.stepsUsed} van ${roll} stappen — de rest vervalt)` : '';
      walkLog(`Beurt ${turn}: <b>${d1}+${d2}=${roll}</b> → <span class="hit">${targetLabel} ${QUEST_NAMES[targetLabel] || ''} voltooid${extra}</span> · ${completed}/${SIM_QUESTS_TO_WIN}`, 'hit');
    } else {
      const extra = move.stepsUsed < roll ? ` — kon maar ${move.stepsUsed} stappen zetten (doodlopend)` : '';
      walkLog(`Beurt ${turn}: <b>${d1}+${d2}=${roll}</b> → onderweg naar ${targetLabel}${extra}`);
    }
    renderWalkMeta({ startLabel, targetLabel: deck[nextIdx], completed, turn });
  }

  if (runId !== walkRunId) return;
  walkClearClass('walk-target');
  if (completed >= SIM_QUESTS_TO_WIN){
    walkStatusEl.innerHTML = `<span class="ok">✓ Gewonnen vanaf ${startLabel} in ${turn} beurten — ${SIM_QUESTS_TO_WIN} opdrachten voltooid.</span>`;
  } else {
    walkStatusEl.innerHTML = `<span class="bad">✕ Afgekapt na ${SIM_MAX_TURNS} beurten zonder winst.</span>`;
  }
  setWalkRunning(false);
}

if (btnWalkStart) btnWalkStart.addEventListener('click', runWalkSimulation);
if (btnWalkStop) btnWalkStop.addEventListener('click', stopWalkSimulation);
if (walkSpeedEl){
  const syncLabel = () => { walkSpeedLabelEl.textContent = walkSpeed().label; };
  walkSpeedEl.addEventListener('input', syncLabel);
  syncLabel();
}
refreshWalkStartOptions();
