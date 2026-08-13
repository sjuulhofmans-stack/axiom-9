// ---------- stap voor stap: zelf spelen (solo) ----------
// Geen bots, geen animatietempo — jij dobbelt zelf, kiest zelf elke stap een aangrenzend
// vakje, en zet zelf een energie-actie of handkaart in. Hergebruikt dezelfde spelregels als
// de batch/auto-modus (resolveMove-achtige geen-U-turn-logica, ENERGY_ACTIONS, ACTION_CARDS,
// buildActionDeck), maar zonder de bot-AI: er wordt niets automatisch beslist behalve de
// worpen zelf, die blijven random.
//
// Omdat je alleen speelt, is er niemand die je blokkeert — Kortsluiting, Blinde Vlek, Duwstoot
// en Prioriteitspas hebben allemaal een tegenstander nodig en staan daarom altijd uit als je
// ze trekt (net zoals Prioriteitspas ook in de bot-simulatie geen effect heeft).
const WALK_SOLO_NO_OPPONENT_CARDS = ['short', 'blind', 'shove', 'scan'];

const walkModeAutoBtn = document.getElementById('walkModeAuto');
const walkModeSoloBtn = document.getElementById('walkModeSolo');
const walkAutoControlsEl = document.getElementById('walkAutoControls');
const walkSoloControlsEl = document.getElementById('walkSoloControls');
const walkAutoHintEl = document.getElementById('walkAutoHint');
const walkSoloHintEl = document.getElementById('walkSoloHint');
const walkStartSoloSel = document.getElementById('walkStartSolo');
const btnWalkSoloStart = document.getElementById('btnWalkSoloStart');
const btnWalkSoloReset = document.getElementById('btnWalkSoloReset');
const walkSoloPanelEl = document.getElementById('walkSoloPanel');
const walkSoloActionsEl = document.getElementById('walkSoloActions');
const btnWalkSoloRoll = document.getElementById('btnWalkSoloRoll');
const btnWalkSoloSkip = document.getElementById('btnWalkSoloSkip');
const walkDirPadEl = document.getElementById('walkDirPad');
const walkStepDoneEl = document.getElementById('walkStepDone');
const walkStepLeftEl = document.getElementById('walkStepLeft');

let soloGraph = null;
let soloPlayer = null;
let soloDeck = null;
let soloRand = null;
let soloTurn = 0;
let soloTargetKey = null;
// 'idle' | 'choose-action' | 'rolling' | 'moving' | 'boots-direction' | 'jump-target' | 'game-over'
let soloPhase = 'idle';
let soloRunId = 0;
let soloMove = null;            // { d1, d2, d3, roll, stepsLeft, lastDir, path }
let soloEnergyRoll = 0;
let soloEnergyGain = { gained: 0, wasted: 0 };
let soloUsedEnergyId = null;    // id uit ENERGY_ACTIONS, voor de logregel
let soloUsedCardId = null;      // id uit ACTION_CARDS, voor de logregel
let soloPendingBoost = false;   // Stuwstoot/Stuwlading: deze beurt een 3e loopsteen
let soloUsedBoots = false;
let soloUsedJump = false;
let soloBootsOptions = [];
let soloCurrentLegalMoves = [];  // { key, dir }[] — de opties die het richtingskruis nu toont

function soloRefreshStartOptions(){
  if (!walkStartSoloSel) return;
  const prev = walkStartSoloSel.value;
  walkStartSoloSel.innerHTML = SIM_START_LABELS.map(l => `<option value="${l}">${l}</option>`).join('')
    + `<option value="?">willekeurig</option>`;
  walkStartSoloSel.value = SIM_START_LABELS.includes(prev) || prev === '?' ? prev : '?';
}

// ---------- modus wisselen ----------
function setWalkMode(mode){
  stopWalkSimulation();
  stopSoloGame();
  const isAuto = mode === 'auto';
  if (walkModeAutoBtn){ walkModeAutoBtn.classList.toggle('active', isAuto); walkModeAutoBtn.setAttribute('aria-selected', String(isAuto)); }
  if (walkModeSoloBtn){ walkModeSoloBtn.classList.toggle('active', !isAuto); walkModeSoloBtn.setAttribute('aria-selected', String(!isAuto)); }
  if (walkAutoControlsEl) walkAutoControlsEl.hidden = !isAuto;
  if (walkSoloControlsEl) walkSoloControlsEl.hidden = isAuto;
  if (walkAutoHintEl) walkAutoHintEl.hidden = !isAuto;
  if (walkSoloHintEl) walkSoloHintEl.hidden = isAuto;
  if (walkSoloPanelEl) walkSoloPanelEl.hidden = true;
  renderWalkBoard();
  if (walkDiceEl) walkDiceEl.innerHTML = '';
  if (walkMetaEl) walkMetaEl.innerHTML = '';
  if (walkScoreEl) walkScoreEl.innerHTML = '';
  if (walkStatusEl) walkStatusEl.innerHTML = '';
  if (walkLogEl) walkLogEl.innerHTML = '';
}

// ---------- bord: welke vakjes zijn nu aanklikbaar ----------
function soloClearClickable(){
  if (!walkBoardEl) return;
  for (const el of walkBoardEl.querySelectorAll('.walk-clickable')){
    el.classList.remove('walk-clickable');
    delete el.dataset.key;
  }
}
function soloMarkClickable(graph, keys){
  soloClearClickable();
  for (const k of keys){
    const el = walkCellDiv(graph, k);
    el.classList.add('walk-clickable');
    el.dataset.key = k;
  }
}

if (walkBoardEl){
  walkBoardEl.addEventListener('click', (e) => {
    const el = e.target.closest('.walk-clickable');
    if (!el) return;
    const key = parseInt(el.dataset.key, 10);
    if (soloPhase === 'moving') soloHandleMoveClick(key);
    else if (soloPhase === 'jump-target') soloHandleJumpClick(key);
  });
}

// welke vervolgstappen mag je zetten vanaf `pos`, gegeven de richting van je vorige stap
// (-1 = eerste stap van de beurt, geen beperking) — zelfde geen-U-turn-regel als resolveMove()
function soloLegalNextCells(graph, pos, lastDir){
  const neigh = graph.adjKey[pos], dirs = graph.adjDir[pos];
  const out = [];
  for (let j = 0; j < neigh.length; j++){
    const d = dirs[j];
    if (lastDir !== -1 && d === (lastDir + 2) % 4) continue;
    out.push({ key: neigh[j], dir: d });
  }
  return out;
}

// ---------- score/meta ----------
// eigen (simpele) variant van renderWalkScore(): geen strategie-badge, want in solo kies je
// zelf wat je speelt in plaats van vast te zitten aan één bot-strategie
function renderSoloScore(){
  if (!walkScoreEl || !soloPlayer) return;
  const p = soloPlayer;
  const targetLabel = p.deck[p.nextIdx];
  const goal = p.completed >= SIM_QUESTS_TO_WIN
    ? '<span class="hit">alle opdrachten voltooid</span>'
    : `${targetLabel} — ${QUEST_NAMES[targetLabel] || ''}`;
  walkScoreEl.innerHTML = `<div class="walk-player active" style="--pc:${p.color}">` +
    `<span class="walk-player-dot"></span>` +
    `<span class="walk-player-name">${p.name}<span class="sub"> · ${p.startLabel}</span></span>` +
    walkCardBadges(p) +
    `<span class="walk-player-goal">${goal}</span>` +
    `<span class="walk-player-energy${p.energy >= ENERGY_MAX ? ' full' : ''}" title="energie (max ${ENERGY_MAX})">⚡${p.energy}</span>` +
    `<span class="walk-player-score">${p.completed}/${SIM_QUESTS_TO_WIN}</span>` +
  `</div>`;
}
// renderWalkMeta() + een regel met je eigen (zichtbare) opdrachtstapel, zodat je Herkalibratie/
// Herprioritering weloverwogen kunt inzetten — je stapel is nooit geheim in een solo-potje
function renderSoloMeta(stepsLeft){
  renderWalkMeta({ player: soloPlayer, turn: soloTurn, stepsLeft });
  if (!walkMetaEl || !soloPlayer || soloPlayer.completed >= SIM_QUESTS_TO_WIN) return;
  const upcoming = soloPlayer.deck.slice(soloPlayer.nextIdx, soloPlayer.nextIdx + 3)
    .map((l, i) => i === 0 ? `<b>${l}</b>` : l).join(' → ');
  walkMetaEl.insertAdjacentHTML('beforeend', `<span>Volgende: ${upcoming} …</span>`);
}
function soloRefreshTarget(){
  const label = soloPlayer.deck[soloPlayer.nextIdx];
  soloTargetKey = soloGraph.questCells[label];
  walkClearClass('walk-target');
  const el = walkCellDiv(soloGraph, soloTargetKey);
  el.style.setProperty('--pc', soloPlayer.color);
  el.classList.add('walk-target');
}

// ---------- actiepaneel (begin van de beurt) ----------
function renderEnergySoloButton(id, disabled, reason){
  const act = ENERGY_ACTIONS[id];
  const title = reason ? `${act.name} — ${reason}` : `${act.name} — ${act.hint}`;
  return `<button type="button" class="action-card action-card--lg action-card--plain${disabled ? ' is-disabled' : ''}" data-energy="${id}"${disabled ? ' disabled' : ''} title="${title}">
    <span class="action-card-cost">${act.cost}</span>
    <span class="action-card-name" style="margin-top:22px;">${act.name}</span>
    <span class="action-card-hint">${act.hint}</span>
  </button>`;
}
function soloRenderActionPanel(){
  if (!walkSoloActionsEl) return;
  const p = soloPlayer;
  const energyBtns = ['boost', 'reorder', 'jump'].map(id =>
    renderEnergySoloButton(id, p.energy < ENERGY_ACTIONS[id].cost)
  ).join('');

  const cardBtns = p.cards.map(id => {
    let disabled = false, reason = null;
    if (WALK_SOLO_NO_OPPONENT_CARDS.includes(id)){ disabled = true; reason = 'geen tegenstanders in de solo-modus'; }
    else if (id === 'ration' && p.energy >= ENERGY_MAX){ disabled = true; reason = 'je energie zit al vol'; }
    else if (id === 'valve' && soloEnergyGain.wasted === 0){ disabled = true; reason = 'er ging deze beurt geen energie verloren'; }
    const titleOverride = reason ? `${ACTION_CARDS[id].name} — ${reason}` : null;
    return renderActionCardFace(id, { size: 'lg', interactive: true, disabled, titleOverride });
  }).join('');

  walkSoloActionsEl.innerHTML =
    `<div class="action-card-row">${energyBtns}</div>` +
    (cardBtns ? `<div class="action-card-row">${cardBtns}</div>` : '');
}
if (walkSoloActionsEl){
  walkSoloActionsEl.addEventListener('click', (e) => {
    if (soloPhase !== 'choose-action') return;
    const btn = e.target.closest('button.action-card');
    if (!btn || btn.disabled || btn.classList.contains('is-disabled')) return;
    if (btn.dataset.card) soloPlayCard(btn.dataset.card);
    else if (btn.dataset.energy) soloUseEnergyAction(btn.dataset.energy);
  });
}

function soloUnconditionalSwap(){
  const cur = soloPlayer.deck[soloPlayer.nextIdx];
  const alt = soloPlayer.deck[soloPlayer.nextIdx + 1];
  soloPlayer.deck[soloPlayer.nextIdx] = alt;
  soloPlayer.deck[soloPlayer.nextIdx + 1] = cur;
}

function soloPlayCard(id){
  if (id === 'boots'){ soloEnterBootsDirection(); return; }
  if (id === 'ration'){
    simGainEnergy(soloPlayer, 3);
    useActionCard(soloPlayer, 'ration', soloDeck);
    soloUsedCardId = 'ration';
    walkLog(`Je speelt <b>Noodrantsoen</b>: +3 energie → ${soloPlayer.energy}.`, null, soloPlayer);
    soloProceedToRoll();
  } else if (id === 'recal'){
    soloUnconditionalSwap();
    useActionCard(soloPlayer, 'recal', soloDeck);
    soloUsedCardId = 'recal';
    soloRefreshTarget();
    walkLog(`Je speelt <b>Herkalibratie</b>: nieuw doel ${soloPlayer.deck[soloPlayer.nextIdx]}.`, null, soloPlayer);
    soloProceedToRoll();
  } else if (id === 'boostcell'){
    soloPendingBoost = true;
    useActionCard(soloPlayer, 'boostcell', soloDeck);
    soloUsedCardId = 'boostcell';
    walkLog(`Je speelt <b>Stuwlading</b>: deze beurt met 3 loopstenen.`, null, soloPlayer);
    soloProceedToRoll();
  } else if (id === 'valve'){
    const saved = Math.min(3, soloEnergyGain.wasted);
    soloPlayer.energy += saved;
    soloEnergyGain.wasted -= saved;
    useActionCard(soloPlayer, 'valve', soloDeck);
    soloUsedCardId = 'valve';
    walkLog(`Je speelt <b>Overdrukklep</b>: +${saved} energie gered → ${soloPlayer.energy}.`, null, soloPlayer);
    soloProceedToRoll();
  } else if (id === 'resupply'){
    useActionCard(soloPlayer, 'resupply', soloDeck);
    const drawn = drawActionCard(soloDeck, soloRand);
    if (drawn) soloPlayer.cards.push(drawn);
    soloUsedCardId = 'resupply';
    walkLog(`Je speelt <b>Herbevoorrading</b> en trekt meteen <b>${drawn ? ACTION_CARDS[drawn].name : 'niets — stapel leeg'}</b>.`, null, soloPlayer);
    soloProceedToRoll();
  }
}
function soloUseEnergyAction(id){
  const act = ENERGY_ACTIONS[id];
  if (soloPlayer.energy < act.cost) return;
  soloPlayer.energy -= act.cost;
  soloUsedEnergyId = id;
  if (id === 'boost'){
    soloPendingBoost = true;
    walkLog(`Je zet <b>Stuwstoot</b> in (−3): deze beurt met 3 loopstenen.`, null, soloPlayer);
    soloProceedToRoll();
  } else if (id === 'reorder'){
    soloUnconditionalSwap();
    soloRefreshTarget();
    walkLog(`Je zet <b>Herprioritering</b> in (−6): nieuw doel ${soloPlayer.deck[soloPlayer.nextIdx]}.`, null, soloPlayer);
    soloProceedToRoll();
  } else if (id === 'jump'){
    soloEnterJumpTarget();
  }
}

// ---------- Zwaartekracht-laarzen: richting kiezen ----------
function soloEnterBootsDirection(){
  const options = gravityBootsOptions(soloGraph, soloPlayer.pos, 10, new Set(), soloTargetKey);
  if (!options.length){
    walkLog(`<b>Zwaartekracht-laarzen</b>: in geen enkele richting is een stap mogelijk vanaf hier — de kaart blijft in je hand.`, null, soloPlayer);
    return;
  }
  soloBootsOptions = options;
  soloPhase = 'boots-direction';
  soloHideDirPad();
  btnWalkSoloSkip.hidden = true;
  const names = ['Noord', 'Oost', 'Zuid', 'West'];
  walkSoloActionsEl.innerHTML = `<div class="action-card-row">` + options.map(o =>
    `<button type="button" class="action-card action-card--lg action-card--plain" data-boots-dir="${o.dir}" title="${names[o.dir]} — ${o.path.length - 1} stappen tot muur/rand">
      <span class="action-card-name" style="margin-top:22px;">${names[o.dir]}</span>
      <span class="action-card-hint">${o.path.length - 1} vakjes tot muur/rand${o.bankedAt !== -1 ? ' — raakt je doel!' : ''}</span>
    </button>`
  ).join('') + `</div>`;
}
if (walkSoloActionsEl){
  walkSoloActionsEl.addEventListener('click', (e) => {
    if (soloPhase !== 'boots-direction') return;
    const btn = e.target.closest('button[data-boots-dir]');
    if (!btn) return;
    soloResolveBoots(parseInt(btn.dataset.bootsDir, 10));
  });
}
function soloResolveBoots(dir){
  const opt = soloBootsOptions.find(o => o.dir === dir);
  if (!opt) return;
  useActionCard(soloPlayer, 'boots', soloDeck);
  soloUsedCardId = 'boots';
  soloUsedBoots = true;
  const banked = opt.bankedAt !== -1;
  const path = banked ? opt.path.slice(0, opt.bankedAt + 1) : opt.path;

  walkLog(`Je speelt <b>Zwaartekracht-laarzen</b>: ${path.length - 1} stappen rechtdoor.`, null, soloPlayer);
  for (let i = 1; i < path.length; i++){
    const leaving = walkCellDiv(soloGraph, soloPlayer.pos);
    leaving.style.setProperty('--pc', soloPlayer.color);
    leaving.classList.add('walk-trail', 'walk-jump');
    soloPlayer.pos = path[i];
  }
  paintWalkPawns(soloGraph, [soloPlayer], 0);
  soloMove = { d1: 0, d2: 0, d3: null, roll: path.length - 1, stepsLeft: 0, lastDir: -1, path };
  soloFinishTurn(banked);
}

// ---------- Noodtransport: doel kiezen ----------
function soloEnterJumpTarget(){
  soloPhase = 'jump-target';
  walkSoloActionsEl.innerHTML = '';
  soloHideDirPad();
  btnWalkSoloSkip.hidden = true;
  btnWalkSoloRoll.hidden = true;
  const stamp = simBfsDistances(soloGraph, soloPlayer.pos);
  const keys = [];
  for (let k = 0; k < soloGraph.N; k++){
    if (k === soloPlayer.pos) continue;
    const d = simDistLookup(stamp, k);
    if (d >= 0 && d <= ENERGY_JUMP_RANGE) keys.push(k);
  }
  soloMarkClickable(soloGraph, keys);
  walkLog(`<b>Noodtransport</b> ingezet — klik een groen omrand vakje binnen bereik (tot ${ENERGY_JUMP_RANGE} vakjes vrij) om erheen te springen.`, null, soloPlayer);
}
function soloHandleJumpClick(key){
  soloClearClickable();
  soloUsedJump = true;
  const fromEl = walkCellDiv(soloGraph, soloPlayer.pos);
  fromEl.style.setProperty('--pc', soloPlayer.color);
  fromEl.classList.add('walk-trail', 'walk-jump');
  soloPlayer.pos = key;
  const toEl = walkCellDiv(soloGraph, key);
  toEl.style.setProperty('--pc', soloPlayer.color);
  toEl.classList.add('walk-trail', 'walk-jump');
  paintWalkPawns(soloGraph, [soloPlayer], 0);

  if (key === soloTargetKey){
    soloMove = { d1: 0, d2: 0, d3: null, roll: 0, stepsLeft: 0, lastDir: -1, path: [key] };
    soloFinishTurn(true);
  } else {
    walkLog(`Je springt met <b>Noodtransport</b> naar een nieuwe plek — niet op je doel, dus je gooit gewoon door vanaf hier.`, null, soloPlayer);
    soloProceedToRoll();
  }
}

// ---------- dobbelen + lopen ----------
// alleen de energiesteen is al bekend aan het begin van de beurt; de loopstenen tonen we
// als "?" i.p.v. ze door renderWalkDice() te laten optellen (die verwacht getallen, geen
// placeholder-tekens — "–"+"–" zou tekst-aan-elkaar-plakken worden, geen 0)
function renderSoloDicePending(){
  const e = soloEnergyRoll;
  walkDiceEl.innerHTML =
    `<span class="walk-die">?</span><span class="walk-die">?</span>` +
    `<span class="walk-die energy">${e === 0 ? '–' : e}</span><span class="walk-die-sum energy">+${e} energie</span>`;
}
// het richtingskruis boven het bord: dezelfde stap als een klik op het vakje, alleen een
// stuk groter te raken op een telefoon. Beide manieren blijven naast elkaar werken — een
// klik op een knop roept dezelfde soloHandleMoveClick() aan als een klik op de cel zelf.
function soloRenderDirPad(legal){
  if (!walkDirPadEl) return;
  soloCurrentLegalMoves = legal;
  walkDirPadEl.hidden = false;
  const legalDirs = new Set(legal.map(l => l.dir));
  for (const btn of walkDirPadEl.querySelectorAll('button[data-dir]')){
    btn.disabled = !legalDirs.has(parseInt(btn.dataset.dir, 10));
  }
  // stappenteller naast de knoppen, zodat je niet terug hoeft te scrollen naar de worp
  // bovenaan om te zien wat je nog hebt staan
  if (walkStepDoneEl) walkStepDoneEl.textContent = soloMove.path.length - 1;
  if (walkStepLeftEl) walkStepLeftEl.textContent = soloMove.stepsLeft;
}
function soloHideDirPad(){
  if (walkDirPadEl) walkDirPadEl.hidden = true;
  soloCurrentLegalMoves = [];
}
if (walkDirPadEl){
  walkDirPadEl.addEventListener('click', (e) => {
    if (soloPhase !== 'moving') return;
    const btn = e.target.closest('button[data-dir]');
    if (!btn || btn.disabled) return;
    const dir = parseInt(btn.dataset.dir, 10);
    const match = soloCurrentLegalMoves.find(l => l.dir === dir);
    if (match) soloHandleMoveClick(match.key);
  });
}

function soloProceedToRoll(){
  walkSoloActionsEl.innerHTML = '';
  soloHideDirPad();
  btnWalkSoloSkip.hidden = true;
  btnWalkSoloRoll.hidden = false;
  btnWalkSoloRoll.textContent = soloPendingBoost ? '🎲 Gooi 3 dobbelstenen' : '🎲 Gooi de dobbelstenen';
  soloPhase = 'rolling';
  renderSoloScore();
  renderSoloMeta();
}
function soloRollDice(){
  if (soloPhase !== 'rolling') return;
  const d1 = simRollD6(soloRand), d2 = simRollD6(soloRand);
  const d3 = soloPendingBoost ? simRollD6(soloRand) : null;
  renderWalkDice(d1, d2, soloEnergyRoll, false, d3);
  const roll = d1 + d2 + (d3 || 0);
  soloMove = { d1, d2, d3, roll, stepsLeft: roll, lastDir: -1, path: [soloPlayer.pos] };
  btnWalkSoloRoll.hidden = true;
  soloAdvanceMovePhase();
}
if (btnWalkSoloRoll) btnWalkSoloRoll.addEventListener('click', soloRollDice);
if (btnWalkSoloSkip) btnWalkSoloSkip.addEventListener('click', () => {
  if (soloPhase !== 'choose-action') return;
  soloProceedToRoll();
});

function soloAdvanceMovePhase(){
  const legal = soloLegalNextCells(soloGraph, soloPlayer.pos, soloMove.lastDir);
  if (!legal.length){
    soloHideDirPad();
    walkLog(`Doodlopend — geen vervolgstap meer mogelijk.`, null, soloPlayer);
    soloFinishTurn(false);
    return;
  }
  soloPhase = 'moving';
  soloMarkClickable(soloGraph, legal.map(l => l.key));
  soloRenderDirPad(legal);
  renderSoloMeta(soloMove.stepsLeft);
}
function soloHandleMoveClick(key){
  const legal = soloLegalNextCells(soloGraph, soloPlayer.pos, soloMove.lastDir);
  const match = legal.find(l => l.key === key);
  if (!match) return;
  const leaving = walkCellDiv(soloGraph, soloPlayer.pos);
  leaving.style.setProperty('--pc', soloPlayer.color);
  leaving.classList.add('walk-trail');
  soloPlayer.pos = key;
  soloMove.lastDir = match.dir;
  soloMove.stepsLeft--;
  soloMove.path.push(key);
  paintWalkPawns(soloGraph, [soloPlayer], 0);

  if (key === soloTargetKey){
    soloClearClickable();
    soloFinishTurn(true);
  } else if (soloMove.stepsLeft <= 0){
    soloClearClickable();
    soloFinishTurn(false);
  } else {
    soloAdvanceMovePhase();
  }
}

// ---------- beurt afronden ----------
function soloFinishTurn(banked){
  soloClearClickable();
  soloHideDirPad();
  const { d1, d2, d3, roll } = soloMove;
  const stepsUsed = soloMove.path.length - 1;
  const rollText = soloUsedBoots
    ? `🥾 ${stepsUsed} van 10 stappen rechtdoor`
    : soloUsedJump
      ? `⚡ Noodtransport`
      : walkRollText(d1, d2, d3, roll);
  const turnNote = soloUsedEnergyId ? walkActionNote(soloUsedEnergyId) : walkCardNote(soloUsedCardId);
  const targetLabel = soloPlayer.deck[soloPlayer.nextIdx];

  if (banked){
    soloPlayer.completed++;
    soloPlayer.doneCells.push(soloTargetKey);
    walkClearClass('walk-target');
    walkCellDiv(soloGraph, soloTargetKey).classList.add('walk-done');
    const extra = (!soloUsedBoots && !soloUsedJump && stepsUsed < roll) ? ` (na ${stepsUsed} van ${roll} stappen — de rest vervalt)` : '';
    walkLog(`Beurt ${soloTurn}: <b>${rollText}</b>${walkEnergyNote(soloEnergyRoll, soloEnergyGain, soloPlayer)}${turnNote} → <span class="hit">${targetLabel} ${QUEST_NAMES[targetLabel] || ''} voltooid${extra}</span> · ${soloPlayer.completed}/${SIM_QUESTS_TO_WIN}`, 'hit', soloPlayer);
    soloPlayer.nextIdx++;

    if (soloPlayer.cards.length < ACTION_CARD_HAND_MAX){
      const drawn = drawActionCard(soloDeck, soloRand);
      if (drawn){
        soloPlayer.cards.push(drawn);
        walkLog(`Je trekt een beloningskaart: <b>${ACTION_CARDS[drawn].name}</b> — ${ACTION_CARDS[drawn].hint}.`, null, soloPlayer);
      }
    } else {
      walkLog(`Je zou een kaart trekken, maar je hand is al vol.`, null, soloPlayer);
    }

    if (soloPlayer.completed >= SIM_QUESTS_TO_WIN){
      soloEndGame();
      return;
    }
  } else {
    const extra = (!soloUsedBoots && !soloUsedJump && stepsUsed < roll) ? ` — kon maar ${stepsUsed} stappen zetten (doodlopend)` : '';
    walkLog(`Beurt ${soloTurn}: <b>${rollText}</b>${walkEnergyNote(soloEnergyRoll, soloEnergyGain, soloPlayer)}${turnNote} → onderweg naar ${targetLabel}${extra}`, null, soloPlayer);
  }
  renderSoloScore();
  beginSoloTurn();
}
function soloEndGame(){
  soloPhase = 'game-over';
  walkClearClass('walk-target');
  walkSoloActionsEl.innerHTML = '';
  btnWalkSoloRoll.hidden = true;
  btnWalkSoloSkip.hidden = true;
  renderSoloScore();
  if (walkMetaEl) walkMetaEl.innerHTML = '';
  walkStatusEl.innerHTML = `<span class="ok">✓ Alle ${SIM_QUESTS_TO_WIN} opdrachten voltooid in ${soloTurn} beurten!</span>`;
  btnWalkSoloStart.disabled = false;
  walkStartSoloSel.disabled = false;
}

// ---------- beurt starten ----------
function beginSoloTurn(){
  soloTurn++;
  soloUsedEnergyId = null;
  soloUsedCardId = null;
  soloPendingBoost = false;
  soloUsedBoots = false;
  soloUsedJump = false;
  soloMove = null;

  soloEnergyRoll = simRollEnergy(soloRand);
  soloEnergyGain = simGainEnergy(soloPlayer, soloEnergyRoll);

  soloRefreshTarget();
  renderSoloDicePending();
  renderSoloScore();
  renderSoloMeta();

  btnWalkSoloRoll.hidden = true;
  btnWalkSoloSkip.hidden = false;
  soloPhase = 'choose-action';
  soloRenderActionPanel();
}

// ---------- potje starten/stoppen ----------
function stopSoloGame(){
  soloRunId++;
  soloPhase = 'idle';
  soloGraph = null; soloPlayer = null; soloMove = null;
  soloClearClickable();
  soloHideDirPad();
  if (walkSoloActionsEl) walkSoloActionsEl.innerHTML = '';
  if (btnWalkSoloRoll) btnWalkSoloRoll.hidden = true;
  if (btnWalkSoloSkip) btnWalkSoloSkip.hidden = true;
  if (btnWalkSoloStart) btnWalkSoloStart.disabled = false;
  if (btnWalkSoloReset) btnWalkSoloReset.disabled = true;
  if (walkStartSoloSel) walkStartSoloSel.disabled = false;
}
function startSoloGame(){
  stopSoloGame();
  walkLogEl.innerHTML = '';
  walkStatusEl.innerHTML = '';
  if (walkSoloPanelEl) walkSoloPanelEl.hidden = false;

  const reach = analyseCellReachability();
  if (reach.unreachable.length > 0){
    walkStatusEl.innerHTML = `<span class="bad">✕ Dit bord heeft ${reach.unreachable.length} onbereikbare vakjes — pas de indeling aan voordat je speelt.</span>`;
    return;
  }
  renderWalkBoard();
  const graph = buildSimGraph();
  const missing = [...SIM_QUEST_LABELS, ...SIM_START_LABELS].filter(l =>
    graph.questCells[l] === undefined && graph.startCells[l] === undefined);
  if (missing.length){
    walkStatusEl.innerHTML = `<span class="bad">✕ Deze vakjes ontbreken op het bord: ${missing.join(', ')}.</span>`;
    return;
  }

  soloGraph = graph;
  soloRand = mulberry32(Math.floor(Math.random() * 4294967296));
  const startLabel = walkStartSoloSel.value === '?'
    ? SIM_START_LABELS[Math.floor(soloRand() * SIM_START_LABELS.length)]
    : walkStartSoloSel.value;
  soloPlayer = {
    idx: 0, name: 'Jij', color: WALK_PLAYER_COLORS[0], startLabel,
    pos: graph.startCells[startLabel],
    deck: simShuffle(SIM_QUEST_LABELS, soloRand),
    nextIdx: 0, completed: 0, energy: 0, cards: [], rank: 0, doneCells: [],
  };
  soloDeck = buildActionDeck(soloRand);
  soloTurn = 0;

  btnWalkSoloStart.disabled = true;
  btnWalkSoloReset.disabled = false;
  walkStartSoloSel.disabled = true;

  walkLog(`Jij start op <b>${startLabel}</b> · stapel: ${soloPlayer.deck.slice(0, SIM_QUESTS_TO_WIN).join(' → ')} …`, null, soloPlayer);
  walkLog(`Solo potje: niemand blokkeert je. Kortsluiting, Duwstoot, Blinde Vlek en Prioriteitspas hebben een tegenstander nodig en doen hier dus niets als je ze trekt.`);

  paintWalkPawns(soloGraph, [soloPlayer], 0);
  beginSoloTurn();
}

if (walkModeAutoBtn) walkModeAutoBtn.addEventListener('click', () => setWalkMode('auto'));
if (walkModeSoloBtn) walkModeSoloBtn.addEventListener('click', () => setWalkMode('solo'));
if (btnWalkSoloStart) btnWalkSoloStart.addEventListener('click', startSoloGame);
if (btnWalkSoloReset) btnWalkSoloReset.addEventListener('click', startSoloGame);

soloRefreshStartOptions();
