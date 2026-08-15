// ---------- stap voor stap: zelf spelen (1 t/m 4 spelers, mix van mens/bot) ----------
// Jij dobbelt zelf, kiest zelf elke stap een aangrenzend vakje, en zet zelf een energie-actie
// of handkaart in. Hergebruikt dezelfde spelregels als de batch/auto-modus (resolveMove,
// ENERGY_ACTIONS, ACTION_CARDS, buildActionDeck, resolveRoundFinishers), maar zonder bot-AI
// voor JOUW beurten — de bot-beurten (als je die toevoegt) worden wél automatisch en meteen
// afgehandeld (`soloResolveBotTurn`, een niet-geanimeerde kopie van de bot-logica uit
// 96-walk.js), zodat jij niet op ze hoeft te wachten.
//
// Met 1 speler (geen bots) is er niemand die je blokkeert, en hebben Kortsluiting, Blinde Vlek,
// Duwstoot en Prioriteitspas allemaal een tegenstander nodig — die staan dan uit, net als
// Prioriteitspas ook in de bot-simulatie geen effect heeft. Zodra er wél andere spelers zijn
// (mens of bot) blokkeren jullie elkaars vakjes net als in "Automatisch", en werken die vier
// kaarten ook — met een doelwit dat JIJ zelf kiest via een klein keuzepaneel.
const WALK_SOLO_NO_OPPONENT_CARDS = ['short', 'blind', 'shove', 'scan'];

const walkModeAutoBtn = document.getElementById('walkModeAuto');
const walkModeSoloBtn = document.getElementById('walkModeSolo');
const walkAutoControlsEl = document.getElementById('walkAutoControls');
const walkSoloControlsEl = document.getElementById('walkSoloControls');
const walkAutoHintEl = document.getElementById('walkAutoHint');
const walkSoloHintEl = document.getElementById('walkSoloHint');
const walkSoloPlayersSel = document.getElementById('walkSoloPlayers');
const walkSoloBotsSel = document.getElementById('walkSoloBots');
const walkSoloSetupEl = document.getElementById('walkSoloSetupPlayers');
const walkSoloStartRowEl = document.getElementById('walkSoloStartRow');
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
let soloDeck = null;         // gedeelde actiekaart-stapel voor dit potje
let soloRand = null;
let soloTurn = 0;            // totaal aantal beurten in dit potje, over alle spelers samen

// ---------- opzet: aantal spelers/bots kiezen, per mens een startpositie + voorproefje ----------
let soloSetupRand = null;
let soloSetupPlayers = [];   // { idx, isHuman, name, color, deck, startLabel, strategy, ... }

function soloSetupHumans(){ return soloSetupPlayers.filter(p => p.isHuman); }

function soloSyncBotOptions(){
  if (!walkSoloPlayersSel || !walkSoloBotsSel) return;
  const total = Math.max(1, Math.min(WALK_MAX_PLAYERS, parseInt(walkSoloPlayersSel.value, 10) || 1));
  const maxBots = Math.max(0, total - 1);
  const prev = parseInt(walkSoloBotsSel.value, 10);
  const opts = [];
  for (let b = 0; b <= maxBots; b++){
    opts.push(`<option value="${b}">${b === 0 ? 'geen bots' : b + (b === 1 ? ' bot' : ' bots')}</option>`);
  }
  walkSoloBotsSel.innerHTML = opts.join('');
  // standaard: alle overige plekken zijn bots (dus "speel tegen bots") — lager zetten geeft
  // plek aan medespelers op hetzelfde scherm ("1 tegen 1 tegen een vriend" = 2 spelers, 0 bots)
  walkSoloBotsSel.value = Number.isFinite(prev) && prev <= maxBots ? String(prev) : String(maxBots);
}

function soloRebuildSetup(){
  stopSoloGame();
  const total = Math.max(1, Math.min(WALK_MAX_PLAYERS, parseInt(walkSoloPlayersSel ? walkSoloPlayersSel.value : '1', 10) || 1));
  const bots = Math.max(0, Math.min(total - 1, parseInt(walkSoloBotsSel ? walkSoloBotsSel.value : '0', 10) || 0));
  const humanCount = total - bots;

  soloSetupRand = mulberry32(Math.floor(Math.random() * 4294967296));
  soloSetupPlayers = [];
  for (let i = 0; i < total; i++){
    const isHuman = i < humanCount;   // eerste plekken zijn mens, de rest bot
    soloSetupPlayers.push({
      idx: i,
      isHuman,
      name: `Speler ${i + 1}`,
      color: WALK_PLAYER_COLORS[i],
      deck: simShuffle(SIM_QUEST_LABELS, soloSetupRand),
      nextIdx: 0, completed: 0, energy: 0, cards: [], rank: 0, doneCells: [],
      strategy: isHuman ? null : ENERGY_STRATEGIES[i % ENERGY_STRATEGIES.length],
      startLabel: isHuman ? SIM_START_LABELS[i] : null,   // mens: alvast een unieke standaardplek
      pos: null,
      skipEnergyRoll: false, actionUses: 0,
    });
  }
  soloRenderSetupUI();
}

function soloRenderSetupUI(){
  if (!walkSoloSetupEl) return;
  const humans = soloSetupHumans();
  if (!humans.length){
    walkSoloSetupEl.innerHTML = '';
    if (walkSoloStartRowEl) walkSoloStartRowEl.hidden = true;
    return;
  }
  walkSoloSetupEl.innerHTML = humans.map(p => {
    const opts = SIM_START_LABELS.map(l => `<option value="${l}"${l === p.startLabel ? ' selected' : ''}>${l}</option>`).join('');
    const firstQuest = p.deck[0];
    return `<div class="walk-solo-setup-player" style="--pc:${p.color}">` +
      `<span class="walk-solo-setup-name">${p.name}</span>` +
      `<select data-seat="${p.idx}">${opts}</select>` +
      `<span class="walk-solo-setup-preview">eerste opdracht: <b>${firstQuest} — ${QUEST_NAMES[firstQuest] || ''}</b></span>` +
    `</div>`;
  }).join('');
  if (walkSoloStartRowEl) walkSoloStartRowEl.hidden = false;
}
if (walkSoloSetupEl){
  walkSoloSetupEl.addEventListener('change', (e) => {
    const sel = e.target.closest('select[data-seat]');
    if (!sel) return;
    const seat = parseInt(sel.dataset.seat, 10);
    const p = soloSetupPlayers[seat];
    if (!p) return;
    const value = sel.value;
    // twee mensen mogen niet dezelfde startpositie kiezen — wissel de conflicterende speler
    // gewoon om naar de plek die deze speler net had, in plaats van iets ingewikkelders
    const clash = soloSetupHumans().find(h => h.idx !== seat && h.startLabel === value);
    if (clash) clash.startLabel = p.startLabel;
    p.startLabel = value;
    soloRenderSetupUI();
  });
}
if (walkSoloPlayersSel) walkSoloPlayersSel.addEventListener('change', () => { soloSyncBotOptions(); soloRebuildSetup(); });
if (walkSoloBotsSel) walkSoloBotsSel.addEventListener('change', soloRebuildSetup);

// ---------- het lopende potje ----------
let soloPlayers = [];
let soloTurnOrder = [];
let soloRoundPos = 0;         // positie binnen soloTurnOrder van de HUIDIGE ronde
let soloRoundFinishers = [];  // spelers die deze ronde hun 6e opdracht voltooien
let soloFinished = 0;
let soloFinishTarget = 1;
let soloActiveIdx = -1;       // wie van soloPlayers nu interactief aan zet is (mens)
let soloTargetKey = null;
// 'idle' | 'choose-action' | 'target-pick' | 'blind-offer' | 'rolling' | 'moving' |
// 'boots-direction' | 'jump-target' | 'game-over'
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
let soloBlindOfferAvailable = false; // deze stap geblokkeerd door een tegenstander + Blinde Vlek in de hand

function solo(){ return soloPlayers[soloActiveIdx]; }
function soloActionUsed(){ return !!(soloUsedEnergyId || soloUsedCardId); }
// alle andere spelers die nog meespelen — voor blokkeren en doelwit-keuzes
function soloOthers(){ return soloPlayers.filter(p => p.idx !== soloActiveIdx && !p.rank); }
function soloOccupied(){ return new Set(soloOthers().map(p => p.pos)); }

// ---------- modus wisselen ----------
function setWalkMode(mode){
  stopWalkSimulation();
  stopSoloGame();
  const isAuto = mode === 'auto';
  if (walkModeAutoBtn){ walkModeAutoBtn.classList.toggle('active', isAuto); walkModeAutoBtn.setAttribute('aria-selected', String(isAuto)); }
  if (walkModeSoloBtn){ walkModeSoloBtn.classList.toggle('active', !isAuto); walkModeSoloBtn.setAttribute('aria-selected', String(!isAuto)); }
  if (walkAutoControlsEl) walkAutoControlsEl.hidden = !isAuto;
  if (walkSoloControlsEl) walkSoloControlsEl.hidden = isAuto;
  if (walkSoloSetupEl) walkSoloSetupEl.hidden = isAuto;
  if (walkSoloStartRowEl) walkSoloStartRowEl.hidden = true;
  if (walkAutoHintEl) walkAutoHintEl.hidden = !isAuto;
  if (walkSoloHintEl) walkSoloHintEl.hidden = isAuto;
  if (walkSoloPanelEl) walkSoloPanelEl.hidden = true;
  renderWalkBoard();
  if (walkDiceEl) walkDiceEl.innerHTML = '';
  if (walkMetaEl) walkMetaEl.innerHTML = '';
  if (walkScoreEl) walkScoreEl.innerHTML = '';
  if (walkStatusEl) walkStatusEl.innerHTML = '';
  if (walkLogEl) walkLogEl.innerHTML = '';
  if (!isAuto) soloRebuildSetup();
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
// (-1 = eerste stap van de beurt, geen beperking) — zelfde geen-U-turn-regel als resolveMove().
// `occupied` sluit vakjes uit waar een andere nog-meespelende speler op staat (blokkeren).
function soloLegalNextCells(graph, pos, lastDir, occupied){
  const neigh = graph.adjKey[pos], dirs = graph.adjDir[pos];
  const out = [];
  for (let j = 0; j < neigh.length; j++){
    const d = dirs[j];
    if (lastDir !== -1 && d === (lastDir + 2) % 4) continue;
    if (occupied && occupied.has(neigh[j])) continue;
    out.push({ key: neigh[j], dir: d });
  }
  return out;
}

// ---------- score/meta ----------
function renderSoloMeta(stepsLeft){
  renderWalkMeta({ player: solo(), turn: soloTurn, stepsLeft });
  if (!walkMetaEl || !solo() || solo().completed >= SIM_QUESTS_TO_WIN) return;
  const p = solo();
  const upcoming = p.deck.slice(p.nextIdx, p.nextIdx + 3)
    .map((l, i) => i === 0 ? `<b>${l}</b>` : l).join(' → ');
  walkMetaEl.insertAdjacentHTML('beforeend', `<span>Volgende: ${upcoming} …</span>`);
}
function soloRefreshTarget(){
  const p = solo();
  const label = p.deck[p.nextIdx];
  soloTargetKey = soloGraph.questCells[label];
  walkClearClass('walk-target');
  const el = walkCellDiv(soloGraph, soloTargetKey);
  el.style.setProperty('--pc', p.color);
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
  const p = solo();
  const energyBtns = ['boost', 'reorder', 'jump'].map(id =>
    renderEnergySoloButton(id, p.energy < ENERGY_ACTIONS[id].cost)
  ).join('');

  const noOpponents = soloPlayers.length === 1;
  const cardBtns = p.cards.map(id => {
    let disabled = false, reason = null;
    // Blinde Vlek is puur reactief (zie soloOfferBlindSpot) — die kun je nooit vanuit dit
    // paneel spelen, alleen op het moment dat je route daadwerkelijk geblokkeerd wordt
    if (id === 'blind'){ disabled = true; reason = 'wordt vanzelf aangeboden zodra je route geblokkeerd wordt'; }
    // Overdrukklep is nu óók puur reactief: je weet pas of er energie verloren dreigt te gaan
    // zodra je 'm gegooid hebt (zie soloOfferValveSave), en dat gebeurt nu pas bij het dobbelen
    // in plaats van automatisch bij het begin van de beurt.
    else if (id === 'valve'){ disabled = true; reason = 'wordt vanzelf aangeboden na het gooien, als er energie anders verloren zou gaan'; }
    else if (noOpponents && WALK_SOLO_NO_OPPONENT_CARDS.includes(id)){ disabled = true; reason = 'geen tegenstanders in dit potje'; }
    else if (id === 'shove' && !soloShoveTargets().length){ disabled = true; reason = 'geen tegenstander naast je'; }
    else if (id === 'scan' && !soloOthers().length){ disabled = true; reason = 'geen tegenstanders meer over'; }
    else if (id === 'short' && !soloOthers().length){ disabled = true; reason = 'geen tegenstanders meer over'; }
    else if (id === 'ration' && p.energy >= ENERGY_MAX){ disabled = true; reason = 'je energie zit al vol'; }
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
  const p = solo();
  const cur = p.deck[p.nextIdx];
  const alt = p.deck[p.nextIdx + 1];
  p.deck[p.nextIdx] = alt;
  p.deck[p.nextIdx + 1] = cur;
}

// ---------- doelwit kiezen: Kortsluiting, Duwstoot, Prioriteitspas ----------
// wie er nu naast je staat (voor Duwstoot — die kan alleen een AANGRENZENDE tegenstander duwen)
function soloShoveTargets(){
  const neigh = new Set(soloGraph.adjKey[solo().pos]);
  return soloOthers().filter(p => neigh.has(p.pos));
}
function soloEnterTargetPicker(cardId){
  const targets = cardId === 'shove' ? soloShoveTargets() : soloOthers();
  if (!targets.length) return;
  soloPhase = 'target-pick';
  soloHideDirPad();
  btnWalkSoloSkip.hidden = true;
  btnWalkSoloRoll.hidden = true;
  const label = { short: 'Kortsluiting', shove: 'Duwstoot', scan: 'Prioriteitspas' }[cardId];
  walkSoloActionsEl.innerHTML =
    `<div class="walk-target-picker-hint">Kies een doelwit voor <b>${label}</b>:</div>` +
    `<div class="action-card-row">` + targets.map(t =>
      `<button type="button" class="action-card action-card--lg action-card--plain" data-target="${t.idx}" style="--card-tint:${t.color}" title="${t.name}">
        <span class="action-card-name" style="margin-top:22px;">${t.name}</span>
        <span class="action-card-hint">${t.startLabel} · ${t.completed}/${SIM_QUESTS_TO_WIN}</span>
      </button>`
    ).join('') + `</div>`;
  walkSoloActionsEl.dataset.pendingCard = cardId;
}
if (walkSoloActionsEl){
  walkSoloActionsEl.addEventListener('click', (e) => {
    if (soloPhase !== 'target-pick') return;
    const btn = e.target.closest('button[data-target]');
    if (!btn) return;
    soloResolveTargetCard(walkSoloActionsEl.dataset.pendingCard, parseInt(btn.dataset.target, 10));
  });
}
function soloResolveTargetCard(cardId, targetIdx){
  const p = solo();
  const victim = soloPlayers[targetIdx];
  if (cardId === 'short'){
    victim.skipEnergyRoll = true;
    useActionCard(p, 'short', soloDeck);
    soloUsedCardId = 'short';
    walkLog(`Je speelt <b>Kortsluiting</b> op ${victim.name}: die mist zijn eerstvolgende energiesteen.`, null, p);
    soloProceedToRoll();
  } else if (cardId === 'scan'){
    const label = victim.deck[victim.nextIdx];
    useActionCard(p, 'scan', soloDeck);
    soloUsedCardId = 'scan';
    walkLog(`Je speelt <b>Prioriteitspas</b>: ${victim.name}'s volgende opdracht is <b>${label} — ${QUEST_NAMES[label] || ''}</b>.`, null, p);
    soloProceedToRoll();
  } else if (cardId === 'shove'){
    // zelfde "welke lege buur vergroot zijn afstand tot ZIJN doel het meest"-logica als de
    // bot-AI (pickShoveMove), maar dan alleen toegepast op het doelwit dat JIJ net koos
    const targetLabel = victim.deck[victim.nextIdx];
    const targetKeyForThem = soloGraph.questCells[targetLabel];
    const stamp = simBfsDistances(soloGraph, targetKeyForThem);
    const dBefore = simDistLookup(stamp, victim.pos);
    const occNow = soloOccupied(); occNow.add(p.pos);
    const theirNeigh = soloGraph.adjKey[victim.pos];
    let best = null, bestGain = -Infinity;
    for (const nk of theirNeigh){
      if (occNow.has(nk)) continue;
      const dAfter = simDistLookup(stamp, nk);
      if (dAfter < 0) continue;
      const gain = dAfter - dBefore;
      if (gain > bestGain){ bestGain = gain; best = nk; }
    }
    useActionCard(p, 'shove', soloDeck);
    soloUsedCardId = 'shove';
    if (best !== null){
      victim.pos = best;
      walkLog(`Je speelt <b>Duwstoot</b> op ${victim.name} en duwt die een vakje verderop.`, null, p);
    } else {
      walkLog(`Je speelt <b>Duwstoot</b> op ${victim.name}, maar er is geen lege plek om naartoe te duwen.`, null, p);
    }
    paintWalkPawns(soloGraph, soloPlayers, p.idx);
    soloProceedToRoll();
  }
}

function soloPlayCard(id){
  if (id === 'boots'){ soloEnterBootsDirection(); return; }
  if (id === 'short' || id === 'shove' || id === 'scan'){ soloEnterTargetPicker(id); return; }
  const p = solo();
  if (id === 'ration'){
    simGainEnergy(p, 3);
    useActionCard(p, 'ration', soloDeck);
    soloUsedCardId = 'ration';
    walkLog(`Je speelt <b>Noodrantsoen</b>: +3 energie → ${p.energy}.`, null, p);
    soloProceedToRoll();
  } else if (id === 'recal'){
    soloUnconditionalSwap();
    useActionCard(p, 'recal', soloDeck);
    soloUsedCardId = 'recal';
    soloRefreshTarget();
    walkLog(`Je speelt <b>Herkalibratie</b>: nieuw doel ${p.deck[p.nextIdx]}.`, null, p);
    soloProceedToRoll();
  } else if (id === 'boostcell'){
    soloPendingBoost = true;
    useActionCard(p, 'boostcell', soloDeck);
    soloUsedCardId = 'boostcell';
    walkLog(`Je speelt <b>Stuwlading</b>: deze beurt met 3 loopstenen.`, null, p);
    soloProceedToRoll();
  } else if (id === 'resupply'){
    useActionCard(p, 'resupply', soloDeck);
    const drawn = drawActionCard(soloDeck, soloRand);
    if (drawn) p.cards.push(drawn);
    soloUsedCardId = 'resupply';
    walkLog(`Je speelt <b>Herbevoorrading</b> en trekt meteen <b>${drawn ? ACTION_CARDS[drawn].name : 'niets — stapel leeg'}</b>.`, null, p);
    soloProceedToRoll();
  }
}
function soloUseEnergyAction(id){
  const p = solo();
  const act = ENERGY_ACTIONS[id];
  if (p.energy < act.cost) return;
  p.energy -= act.cost;
  soloUsedEnergyId = id;
  if (id === 'boost'){
    soloPendingBoost = true;
    walkLog(`Je zet <b>Stuwstoot</b> in (−3): deze beurt met 3 loopstenen.`, null, p);
    soloProceedToRoll();
  } else if (id === 'reorder'){
    soloUnconditionalSwap();
    soloRefreshTarget();
    walkLog(`Je zet <b>Herprioritering</b> in (−6): nieuw doel ${p.deck[p.nextIdx]}.`, null, p);
    soloProceedToRoll();
  } else if (id === 'jump'){
    soloEnterJumpTarget();
  }
}

// ---------- Zwaartekracht-laarzen: richting kiezen ----------
function soloEnterBootsDirection(){
  const options = gravityBootsOptions(soloGraph, solo().pos, 10, soloOccupied(), soloTargetKey);
  if (!options.length){
    walkLog(`<b>Zwaartekracht-laarzen</b>: in geen enkele richting is een stap mogelijk vanaf hier — de kaart blijft in je hand.`, null, solo());
    return;
  }
  soloBootsOptions = options;
  soloPhase = 'boots-direction';
  soloHideDirPad();
  btnWalkSoloSkip.hidden = true;
  const names = ['Noord', 'Oost', 'Zuid', 'West'];
  walkSoloActionsEl.innerHTML = `<div class="action-card-row">` + options.map(o =>
    `<button type="button" class="action-card action-card--lg action-card--plain" data-boots-dir="${o.dir}" title="${names[o.dir]} — ${o.path.length - 1} stappen tot muur/rand/tegenstander">
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
  const p = solo();
  useActionCard(p, 'boots', soloDeck);
  soloUsedCardId = 'boots';
  soloUsedBoots = true;
  const banked = opt.bankedAt !== -1;
  const path = banked ? opt.path.slice(0, opt.bankedAt + 1) : opt.path;

  walkLog(`Je speelt <b>Zwaartekracht-laarzen</b>: ${path.length - 1} stappen rechtdoor.`, null, p);
  for (let i = 1; i < path.length; i++){
    const leaving = walkCellDiv(soloGraph, p.pos);
    leaving.style.setProperty('--pc', p.color);
    leaving.classList.add('walk-trail', 'walk-jump');
    p.pos = path[i];
  }
  paintWalkPawns(soloGraph, soloPlayers, p.idx);
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
  const stamp = simBfsDistances(soloGraph, solo().pos);
  const occ = soloOccupied();
  const keys = [];
  for (let k = 0; k < soloGraph.N; k++){
    if (k === solo().pos || occ.has(k)) continue;
    const d = simDistLookup(stamp, k);
    if (d >= 0 && d <= ENERGY_JUMP_RANGE) keys.push(k);
  }
  soloMarkClickable(soloGraph, keys);
  walkLog(`<b>Noodtransport</b> ingezet — klik een groen omrand vakje binnen bereik (tot ${ENERGY_JUMP_RANGE} vakjes vrij) om erheen te springen.`, null, solo());
}
function soloHandleJumpClick(key){
  soloClearClickable();
  soloUsedJump = true;
  const p = solo();
  const fromEl = walkCellDiv(soloGraph, p.pos);
  fromEl.style.setProperty('--pc', p.color);
  fromEl.classList.add('walk-trail', 'walk-jump');
  p.pos = key;
  const toEl = walkCellDiv(soloGraph, key);
  toEl.style.setProperty('--pc', p.color);
  toEl.classList.add('walk-trail', 'walk-jump');
  paintWalkPawns(soloGraph, soloPlayers, p.idx);

  if (key === soloTargetKey){
    soloMove = { d1: 0, d2: 0, d3: null, roll: 0, stepsLeft: 0, lastDir: -1, path: [key] };
    soloFinishTurn(true);
  } else {
    walkLog(`Je springt met <b>Noodtransport</b> naar een nieuwe plek — niet op je doel, dus je gooit gewoon door vanaf hier.`, null, p);
    soloProceedToRoll();
  }
}

// ---------- dobbelen + lopen ----------
function renderSoloDicePending(){
  const e = soloEnergyRoll;
  const energyHtml = e === null
    ? `<span class="walk-die energy">?</span><span class="walk-die-sum energy">energie bij het gooien</span>`
    : `<span class="walk-die energy">${e === 0 ? '–' : e}</span><span class="walk-die-sum energy">+${e} energie</span>`;
  walkDiceEl.innerHTML = `<span class="walk-die">?</span><span class="walk-die">?</span>` + energyHtml;
}
function soloRenderDirPad(legal){
  if (!walkDirPadEl) return;
  soloCurrentLegalMoves = legal;
  walkDirPadEl.hidden = false;
  const legalDirs = new Set(legal.map(l => l.dir));
  for (const btn of walkDirPadEl.querySelectorAll('button[data-dir]')){
    btn.disabled = !legalDirs.has(parseInt(btn.dataset.dir, 10));
  }
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
  renderWalkScore(soloPlayers, soloActiveIdx);
  renderSoloMeta();
}
// Rolt en verwerkt de energiesteen voor deze beurt, als dat nog niet gebeurd is. Wordt aangeroepen
// zodra je daadwerkelijk beweegt — dobbelen (hier), of als vangnet in soloFinishTurn() voor de
// paden zonder dobbelklik (Zwaartekracht-laarzen, Noodtransport dat exact op je doel landt) — zodat
// elke beurt precies één keer energie oplevert, ook al zie je die pas ná je beweging verschijnen.
function soloRollEnergyForTurn(){
  if (soloEnergyRoll !== null) return;
  const p = solo();
  soloEnergyRoll = simRollEnergy(soloRand);
  soloEnergyGain = simGainEnergy(p, soloEnergyRoll);
}
function soloRollDice(){
  if (soloPhase !== 'rolling') return;
  const d1 = simRollD6(soloRand), d2 = simRollD6(soloRand);
  const d3 = soloPendingBoost ? simRollD6(soloRand) : null;
  soloRollEnergyForTurn();
  renderWalkDice(d1, d2, soloEnergyRoll, false, d3);
  const roll = d1 + d2 + (d3 || 0);
  soloMove = { d1, d2, d3, roll, stepsLeft: roll, lastDir: -1, path: [solo().pos] };
  btnWalkSoloRoll.hidden = true;
  renderWalkScore(soloPlayers, soloActiveIdx);
  if (soloEnergyGain.wasted > 0 && solo().cards.includes('valve') && !soloActionUsed()){
    soloOfferValveSave();
    return;
  }
  soloAdvanceMovePhase();
}
// Overdrukklep is nu óók puur reactief: je weet pas of er energie verloren dreigt te gaan zodra
// je 'm gegooid hebt, dus deze aanbieding komt — net als Blinde Vlek — vanzelf, meteen ná de worp.
function soloOfferValveSave(){
  soloPhase = 'valve-offer';
  const p = solo();
  walkLog(`Je gooide ${soloEnergyRoll} energie, maar ${soloEnergyGain.wasted} ging verloren boven het plafond van ${ENERGY_MAX}.`, null, p);
  walkSoloActionsEl.innerHTML =
    `<div class="walk-target-picker-hint">Speel <b>Overdrukklep</b> om tot 3 daarvan alsnog te redden?</div>` +
    `<div class="action-card-row">` +
      `<button type="button" class="action-card action-card--lg action-card--plain" data-valve="yes"><span class="action-card-name" style="margin-top:22px;">Ja, speel Overdrukklep</span></button>` +
      `<button type="button" class="action-card action-card--lg action-card--plain" data-valve="no"><span class="action-card-name" style="margin-top:22px;">Nee</span></button>` +
    `</div>`;
}
if (walkSoloActionsEl){
  walkSoloActionsEl.addEventListener('click', (e) => {
    if (soloPhase !== 'valve-offer') return;
    const btn = e.target.closest('button[data-valve]');
    if (!btn) return;
    const p = solo();
    if (btn.dataset.valve === 'yes'){
      const saved = Math.min(3, soloEnergyGain.wasted);
      p.energy += saved;
      soloEnergyGain.wasted -= saved;
      useActionCard(p, 'valve', soloDeck);
      soloUsedCardId = 'valve';
      walkLog(`Je speelt <b>Overdrukklep</b>: +${saved} energie gered → ${p.energy}.`, null, p);
      renderWalkScore(soloPlayers, soloActiveIdx);
    }
    walkSoloActionsEl.innerHTML = '';
    soloAdvanceMovePhase();
  });
}
if (btnWalkSoloRoll) btnWalkSoloRoll.addEventListener('click', soloRollDice);
if (btnWalkSoloSkip) btnWalkSoloSkip.addEventListener('click', () => {
  if (soloPhase !== 'choose-action') return;
  soloProceedToRoll();
});

function soloAdvanceMovePhase(){
  const occ = soloOccupied();
  const legal = soloLegalNextCells(soloGraph, solo().pos, soloMove.lastDir, occ);
  if (!legal.length){
    // geen vervolgstap: ofwel een muur (echt doodlopend), ofwel puur tegenstanders in de weg
    // — in dat laatste geval mag Blinde Vlek de blokkade negeren, als je 'm hebt en nog geen
    // andere actie deze beurt hebt gebruikt
    const legalIgnoringBlock = soloLegalNextCells(soloGraph, solo().pos, soloMove.lastDir, null);
    soloBlindOfferAvailable = legalIgnoringBlock.length > 0
      && solo().cards.includes('blind') && !soloActionUsed();
    if (soloBlindOfferAvailable){
      soloOfferBlindSpot();
      return;
    }
    soloHideDirPad();
    const reason = legalIgnoringBlock.length ? 'liep tegen een bezette route aan' : 'doodlopend';
    walkLog(`${reason === 'doodlopend' ? 'Doodlopend' : 'Geblokkeerd door een tegenstander'} — geen vervolgstap meer mogelijk.`, null, solo());
    soloFinishTurn(false);
    return;
  }
  soloPhase = 'moving';
  soloMarkClickable(soloGraph, legal.map(l => l.key));
  soloRenderDirPad(legal);
  renderSoloMeta(soloMove.stepsLeft);
}
// Blinde Vlek is puur reactief: alleen aan te bieden op het moment dat je zet daadwerkelijk
// door een tegenstander geblokkeerd wordt (net als bij de bots), dus dit is geen kaart in het
// gewone actiepaneel maar een kort ja/nee-keuzemoment middenin de zet.
function soloOfferBlindSpot(){
  soloPhase = 'blind-offer';
  soloHideDirPad();
  soloClearClickable();
  btnWalkSoloRoll.hidden = true;
  btnWalkSoloSkip.hidden = true;
  walkLog(`Je route wordt geblokkeerd door een tegenstander.`, null, solo());
  walkSoloActionsEl.innerHTML =
    `<div class="walk-target-picker-hint">Speel <b>Blinde Vlek</b> om bezette vakjes deze beurt te negeren?</div>` +
    `<div class="action-card-row">` +
      `<button type="button" class="action-card action-card--lg action-card--plain" data-blind="yes"><span class="action-card-name" style="margin-top:22px;">Ja, speel Blinde Vlek</span></button>` +
      `<button type="button" class="action-card action-card--lg action-card--plain" data-blind="no"><span class="action-card-name" style="margin-top:22px;">Nee</span></button>` +
    `</div>`;
}
if (walkSoloActionsEl){
  walkSoloActionsEl.addEventListener('click', (e) => {
    if (soloPhase !== 'blind-offer') return;
    const btn = e.target.closest('button[data-blind]');
    if (!btn) return;
    if (btn.dataset.blind === 'yes'){
      useActionCard(solo(), 'blind', soloDeck);
      soloUsedCardId = 'blind';
      walkLog(`Je speelt <b>Blinde Vlek</b>: bezette vakjes tellen deze beurt niet mee.`, null, solo());
      walkSoloActionsEl.innerHTML = '';
      soloPhase = 'moving';
      const legal = soloLegalNextCells(soloGraph, solo().pos, soloMove.lastDir, null);
      soloMarkClickable(soloGraph, legal.map(l => l.key));
      soloRenderDirPad(legal);
      renderSoloMeta(soloMove.stepsLeft);
    } else {
      walkSoloActionsEl.innerHTML = '';
      walkLog(`Doodlopend — geen vervolgstap meer mogelijk.`, null, solo());
      soloFinishTurn(false);
    }
  });
}
function soloHandleMoveClick(key){
  const occ = soloOccupied();
  const legal = soloLegalNextCells(soloGraph, solo().pos, soloMove.lastDir, soloPhase === 'moving' && soloUsedCardId === 'blind' ? null : occ);
  const match = legal.find(l => l.key === key);
  if (!match) return;
  const p = solo();
  const leaving = walkCellDiv(soloGraph, p.pos);
  leaving.style.setProperty('--pc', p.color);
  leaving.classList.add('walk-trail');
  p.pos = key;
  soloMove.lastDir = match.dir;
  soloMove.stepsLeft--;
  soloMove.path.push(key);
  paintWalkPawns(soloGraph, soloPlayers, p.idx);

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
  // vangnet voor Zwaartekracht-laarzen / een Noodtransport dat exact op je doel landt: die paden
  // roepen soloFinishTurn() aan zonder ooit langs soloRollDice() te komen, dus zonder dit zou die
  // beurt zijn energiesteen helemaal overslaan. Geen Overdrukklep-aanbieding hier nodig — je hebt
  // deze beurt al een kaart/actie gebruikt (dat is precies waarom je hier via boots/jump bent),
  // dus een tweede actie zou de "hooguit één actie per beurt"-regel breken.
  soloRollEnergyForTurn();
  const p = solo();
  const { d1, d2, d3, roll } = soloMove;
  const stepsUsed = soloMove.path.length - 1;
  const rollText = soloUsedBoots
    ? `🥾 ${stepsUsed} van 10 stappen rechtdoor`
    : soloUsedJump
      ? `⚡ Noodtransport`
      : walkRollText(d1, d2, d3, roll);
  const turnNote = soloUsedEnergyId ? walkActionNote(soloUsedEnergyId) : walkCardNote(soloUsedCardId);
  const targetLabel = p.deck[p.nextIdx];

  if (banked){
    p.completed++;
    p.doneCells.push(soloTargetKey);
    walkClearClass('walk-target');
    walkCellDiv(soloGraph, soloTargetKey).classList.add('walk-done');
    const extra = (!soloUsedBoots && !soloUsedJump && stepsUsed < roll) ? ` (na ${stepsUsed} van ${roll} stappen — de rest vervalt)` : '';
    walkLog(`Beurt ${soloTurn}: <b>${rollText}</b>${walkEnergyNote(soloEnergyRoll, soloEnergyGain, p)}${turnNote} → <span class="hit">${targetLabel} ${QUEST_NAMES[targetLabel] || ''} voltooid${extra}</span> · ${p.completed}/${SIM_QUESTS_TO_WIN}`, 'hit', p);
    p.nextIdx++;

    if (p.cards.length < ACTION_CARD_HAND_MAX){
      const drawn = drawActionCard(soloDeck, soloRand);
      if (drawn){
        p.cards.push(drawn);
        walkLog(`Je trekt een beloningskaart: <b>${ACTION_CARDS[drawn].name}</b> — ${ACTION_CARDS[drawn].hint}.`, null, p);
      }
    } else {
      walkLog(`Je zou een kaart trekken, maar je hand is al vol.`, null, p);
    }

    if (p.completed >= SIM_QUESTS_TO_WIN){
      p.finishTurn = soloTurn;
      soloRoundFinishers.push(p);
      walkLog(`Je hebt alle ${SIM_QUESTS_TO_WIN} opdrachten voltooid en verlaat het bord — wacht op de rest van deze ronde.`, 'hit', p);
      paintWalkPawns(soloGraph, soloPlayers, p.idx);
      renderWalkScore(soloPlayers, soloActiveIdx);
      soloContinueLoop();
      return;
    }
  } else {
    const extra = (!soloUsedBoots && !soloUsedJump && stepsUsed < roll) ? ` — kon maar ${stepsUsed} stappen zetten (doodlopend)` : '';
    walkLog(`Beurt ${soloTurn}: <b>${rollText}</b>${walkEnergyNote(soloEnergyRoll, soloEnergyGain, p)}${turnNote} → onderweg naar ${targetLabel}${extra}`, null, p);
  }
  renderWalkScore(soloPlayers, soloActiveIdx);
  soloContinueLoop();
}

// ---------- JOUW beurt starten (interactief) ----------
function soloBeginHumanTurn(pIdx){
  soloActiveIdx = pIdx;
  soloTurn++;
  soloUsedEnergyId = null;
  soloUsedCardId = null;
  soloPendingBoost = false;
  soloUsedBoots = false;
  soloUsedJump = false;
  soloMove = null;

  const p = solo();
  // Energie wordt nu pas gegooid zodra je zelf beweegt (dobbelen, Zwaartekracht-laarzen of
  // Noodtransport) -- niet meer automatisch bij het begin van de beurt (gebruikersverzoek: "de
  // energie komt er pas bij vanaf de eerste keer dat ze dobbelen"). `null` betekent "nog niet
  // gegooid deze beurt"; de actiekeuze hierna gebeurt dus met je BESTAANDE energie van vorige
  // beurten, niet met een bonus die je nog niet hebt gezien. `soloRollEnergyForTurn()` rolt 'm
  // alsnog vlak vóór de beurt eindigt, voor de gevallen die geen "gooi de dobbelstenen"-klik
  // hebben (Zwaartekracht-laarzen, of Noodtransport dat exact op je doel landt).
  soloEnergyRoll = null;
  soloEnergyGain = { gained: 0, wasted: 0 };

  soloRefreshTarget();
  renderSoloDicePending();
  renderWalkScore(soloPlayers, soloActiveIdx);
  renderSoloMeta();
  paintWalkPawns(soloGraph, soloPlayers, p.idx);

  btnWalkSoloRoll.hidden = true;
  btnWalkSoloSkip.hidden = false;
  soloPhase = 'choose-action';
  soloRenderActionPanel();
}

// ---------- bot-beurt: meteen afgehandeld, geen animatie ----------
// niet-geanimeerde kopie van de bot-logica uit 96-walk.js/simulateOneGame — zelfde regels,
// alleen zonder walkTick()/walkPath()-vertragingen, want de bots hoeven niet op jou te wachten
// en jij niet op hen.
function soloResolveBotTurn(player){
  soloTurn++;
  const pIdx = player.idx;
  let actionUsed = false;

  let energyRoll = 0, energyGain = { gained: 0, wasted: 0 };
  if (player.skipEnergyRoll){ player.skipEnergyRoll = false; }
  else { energyRoll = simRollEnergy(soloRand); energyGain = simGainEnergy(player, energyRoll); }

  if (!actionUsed && player.cards.includes('valve') && energyGain.wasted > 0){
    const saved = Math.min(3, energyGain.wasted);
    player.energy += saved;
    useActionCard(player, 'valve', soloDeck);
    actionUsed = true;
  }
  if (!actionUsed && player.cards.includes('short')){
    const victim = pickShortCircuitTarget(soloPlayers, pIdx);
    if (victim){
      victim.skipEnergyRoll = true;
      useActionCard(player, 'short', soloDeck);
      actionUsed = true;
      walkLog(`${player.name} gebruikt <b>Kortsluiting</b> op ${victim.name}.`, null, player);
    }
  }
  if (!actionUsed && player.cards.includes('ration') && player.energy < ENERGY_MAX){
    simGainEnergy(player, 3);
    useActionCard(player, 'ration', soloDeck);
    actionUsed = true;
  }

  let targetLabel = player.deck[player.nextIdx];
  // energyReorderTarget() leest/schrijft player.order — de batch-speler heet zijn stapel zo,
  // maar hier (net als in 96-walk.js) heet 'ie deck. Een shim die naar dezelfde array wijst
  // (geen kopie) laat de swap gewoon doorwerken op player.deck. Zie de kanttekening bij
  // pickShoveMove hierboven — dit is precies de val die daar staat beschreven.
  const shim = { order: player.deck, nextIdx: player.nextIdx };
  if (!actionUsed && player.cards.includes('recal')){
    const swapped = energyReorderTarget(soloGraph, shim, player.pos);
    if (swapped !== null){ targetLabel = swapped; useActionCard(player, 'recal', soloDeck); actionUsed = true; }
  }
  if (!actionUsed && player.cards.includes('shove')){
    const shove = pickShoveMove(soloGraph, soloPlayers, pIdx);
    if (shove){
      shove.player.pos = shove.toKey;
      useActionCard(player, 'shove', soloDeck);
      actionUsed = true;
      walkLog(`${player.name} gebruikt <b>Duwstoot</b> op ${shove.player.name}.`, null, player);
    }
  }
  if (!actionUsed && player.strategy === 'reorder' && player.energy >= ENERGY_ACTIONS.reorder.cost){
    const swapped = energyReorderTarget(soloGraph, shim, player.pos);
    if (swapped !== null){ targetLabel = swapped; player.energy -= ENERGY_ACTIONS.reorder.cost; player.actionUses++; actionUsed = true; }
  }
  const targetKey = soloGraph.questCells[targetLabel];

  const occupied = new Set();
  for (const other of soloPlayers) if (other.idx !== pIdx && !other.rank) occupied.add(other.pos);

  let move, roll = 0, usedBoots = false;
  if (!actionUsed && player.cards.includes('boots')){
    const bootsMove = resolveGravityBoots(soloGraph, player.pos, 10, occupied, targetKey);
    if (bootsMove){ move = bootsMove; usedBoots = true; useActionCard(player, 'boots', soloDeck); actionUsed = true; }
  }
  if (!usedBoots){
    roll = simRollD6(soloRand) + simRollD6(soloRand);
    if (!actionUsed && player.cards.includes('boostcell')){
      roll += simRollD6(soloRand); useActionCard(player, 'boostcell', soloDeck); actionUsed = true;
    } else if (!actionUsed && player.strategy === 'boost' && player.energy >= ENERGY_ACTIONS.boost.cost){
      roll += simRollD6(soloRand); player.energy -= ENERGY_ACTIONS.boost.cost; player.actionUses++; actionUsed = true;
    }
    move = resolveMove(soloGraph, player.pos, roll, occupied, targetKey, soloRand);
  }

  if (!move.bankedQuest && !actionUsed && player.cards.includes('blind') && move.wasBlocked){
    const retry = resolveMove(soloGraph, player.pos, roll, new Set(), targetKey, soloRand);
    if (retry.key !== move.key){ move = retry; useActionCard(player, 'blind', soloDeck); actionUsed = true; }
  }
  if (!move.bankedQuest && !actionUsed && player.strategy === 'jump' && player.energy >= ENERGY_ACTIONS.jump.cost){
    const jump = resolveEnergyJump(soloGraph, player.pos, ENERGY_JUMP_RANGE, targetKey);
    if (jump){
      player.energy -= ENERGY_ACTIONS.jump.cost; player.actionUses++; actionUsed = true;
      move = jump.banked
        ? { key: jump.key, path: [jump.key], stepsUsed: 0, bankedQuest: true, wasBlocked: false }
        : resolveMove(soloGraph, jump.key, roll, occupied, targetKey, soloRand);
    }
  }
  if (!actionUsed && player.cards.includes('resupply')){
    useActionCard(player, 'resupply', soloDeck);
    const drawn = drawActionCard(soloDeck, soloRand);
    if (drawn){ player.cards.push(drawn); walkLog(`${player.name} gebruikt <b>Herbevoorrading</b> en trekt meteen <b>${ACTION_CARDS[drawn].name}</b>.`, null, player); }
    actionUsed = true;
  }

  player.pos = move.key;
  paintWalkPawns(soloGraph, soloPlayers, pIdx);

  if (move.bankedQuest){
    player.completed++;
    player.doneCells.push(targetKey);
    player.nextIdx++;
    if (player.cards.length < ACTION_CARD_HAND_MAX){
      const drawn = drawActionCard(soloDeck, soloRand);
      if (drawn) player.cards.push(drawn);
    }
    walkLog(`Beurt ${soloTurn}: <b>${player.name}</b> voltooit <span class="hit">${targetLabel} ${QUEST_NAMES[targetLabel] || ''}</span> · ${player.completed}/${SIM_QUESTS_TO_WIN}`, 'hit', player);
    if (player.completed >= SIM_QUESTS_TO_WIN){
      player.finishTurn = soloTurn;
      soloRoundFinishers.push(player);
      walkLog(`<b>${player.name} heeft alle ${SIM_QUESTS_TO_WIN} opdrachten voltooid</b> en verlaat het bord — wacht op de rest van deze ronde.`, 'hit', player);
    }
  } else {
    walkLog(`Beurt ${soloTurn}: <b>${player.name}</b> onderweg naar ${targetLabel}${move.wasBlocked ? ' · liep tegen een bezette route aan' : ''}`, null, player);
  }
  renderWalkScore(soloPlayers, -1);
}

// ---------- de ronde-lus: bots meteen, mensen interactief ----------
function soloContinueLoop(){
  soloRoundPos++;
  soloAdvanceLoop();
}
function soloAdvanceLoop(){
  while (soloRoundPos < soloTurnOrder.length){
    const pIdx = soloTurnOrder[soloRoundPos];
    const player = soloPlayers[pIdx];
    if (player.rank){ soloRoundPos++; continue; }
    if (player.isHuman){
      soloBeginHumanTurn(pIdx);
      return;   // wacht op klik-interactie; soloContinueLoop() gaat verder zodra de beurt klaar is
    }
    soloResolveBotTurn(player);
    soloRoundPos++;
    if (soloTurn >= SIM_MAX_TURNS) break;
  }
  soloFinishRound();
}
function soloFinishRound(){
  if (soloRoundFinishers.length){
    const groups = resolveRoundFinishers(soloRoundFinishers, soloFinished);
    for (const group of groups){
      if (group.length === 1){
        walkLog(`<b>${group[0].name} is binnen als ${walkRankLabel(group[0].rank)}</b>.`, 'hit', group[0]);
      } else {
        const names = group.map(p => p.name).join(' en ');
        walkLog(`<b>${names} delen de ${walkRankLabel(group[0].rank)} plaats</b> — gelijke energie (${group[0].energy}) en evenveel actiekaarten in de hand (${group[0].cards.length}).`, 'hit', null);
      }
    }
    soloFinished += soloRoundFinishers.length;
    soloRoundFinishers = [];
    renderWalkScore(soloPlayers, -1);
    if (soloFinished >= soloFinishTarget){
      for (const p of soloPlayers) if (!p.rank) p.rank = soloFinished + 1;
      soloEndGame(false);
      return;
    }
  }
  if (soloTurn >= SIM_MAX_TURNS){ soloEndGame(true); return; }
  soloRoundPos = 0;
  soloAdvanceLoop();
}
function soloEndGame(stuck){
  soloPhase = 'game-over';
  walkClearClass('walk-target');
  walkSoloActionsEl.innerHTML = '';
  btnWalkSoloRoll.hidden = true;
  btnWalkSoloSkip.hidden = true;
  renderWalkScore(soloPlayers, -1);
  if (walkMetaEl) walkMetaEl.innerHTML = '';
  if (stuck){
    walkStatusEl.innerHTML = `<span class="bad">✕ Afgekapt na ${SIM_MAX_TURNS} beurten — niet iedereen was binnen.</span>` +
      (soloPlayers.length > 1 ? `<span class="walk-standings-row">${walkStandings(soloPlayers)}</span>` : '');
  } else if (soloPlayers.length === 1){
    walkStatusEl.innerHTML = `<span class="ok">✓ Alle ${SIM_QUESTS_TO_WIN} opdrachten voltooid in ${solo() ? solo().finishTurn : soloTurn} beurten!</span>`;
  } else {
    const winners = soloPlayers.filter(p => p.rank === 1);
    const winText = winners.length === 1
      ? (winners[0].isHuman ? `Jij wint vanaf ${winners[0].startLabel} in ${winners[0].finishTurn} beurten` : `${winners[0].name} wint vanaf ${winners[0].startLabel} in ${winners[0].finishTurn} beurten`)
      : `${winners.map(w => w.isHuman ? 'jij' : w.name).join(' en ')} delen de winst (gelijke energie en actiekaarten)`;
    walkStatusEl.innerHTML = `<span class="ok">✓ ${winText} — potje uitgespeeld in ${soloTurn} beurten.</span>` +
      `<span class="walk-standings-row">Eindklassering: ${walkStandings(soloPlayers)}</span>`;
  }
  btnWalkSoloStart.disabled = false;
  if (walkSoloPlayersSel) walkSoloPlayersSel.disabled = false;
  if (walkSoloBotsSel) walkSoloBotsSel.disabled = false;
  for (const sel of walkSoloSetupEl ? walkSoloSetupEl.querySelectorAll('select') : []) sel.disabled = false;
}

// ---------- potje starten/stoppen ----------
function stopSoloGame(){
  soloRunId++;
  soloPhase = 'idle';
  soloGraph = null; soloPlayers = []; soloMove = null; soloActiveIdx = -1;
  soloRoundFinishers = []; soloFinished = 0; soloRoundPos = 0;
  soloClearClickable();
  soloHideDirPad();
  if (walkSoloPanelEl) walkSoloPanelEl.hidden = true;
  if (walkSoloActionsEl) walkSoloActionsEl.innerHTML = '';
  if (btnWalkSoloRoll) btnWalkSoloRoll.hidden = true;
  if (btnWalkSoloSkip) btnWalkSoloSkip.hidden = true;
  if (btnWalkSoloStart) btnWalkSoloStart.disabled = false;
  if (btnWalkSoloReset) btnWalkSoloReset.disabled = true;
  if (walkSoloPlayersSel) walkSoloPlayersSel.disabled = false;
  if (walkSoloBotsSel) walkSoloBotsSel.disabled = false;
  for (const sel of walkSoloSetupEl ? walkSoloSetupEl.querySelectorAll('select') : []) sel.disabled = false;
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
  if (!soloSetupPlayers.length) soloRebuildSetup();

  soloGraph = graph;
  soloRand = soloSetupRand;
  soloPlayers = soloSetupPlayers;
  // startposities: mensen hebben net gekozen; bots krijgen de overgebleven posities willekeurig
  const taken = new Set(soloPlayers.filter(p => p.isHuman).map(p => p.startLabel));
  const free = simShuffle(SIM_START_LABELS.filter(l => !taken.has(l)), soloRand);
  let fi = 0;
  for (const p of soloPlayers){
    if (!p.isHuman) p.startLabel = free[fi++];
    p.pos = graph.startCells[p.startLabel];
  }

  soloTurnOrder = simShuffle(soloPlayers.map(p => p.idx), soloRand);
  soloFinishTarget = simFinishTarget(soloPlayers.length);
  soloFinished = 0;
  soloRoundFinishers = [];
  soloRoundPos = 0;
  soloTurn = 0;
  soloDeck = buildActionDeck(soloRand);

  for (const p of soloPlayers){
    const who = p.isHuman ? '(jij)' : '(bot)';
    const stratNote = p.isHuman ? '' : ` · energie: <b>${ENERGY_ACTIONS[p.strategy].name}</b>`;
    walkLog(`${p.name} ${who} start op <b>${p.startLabel}</b>${stratNote} · stapel: ${p.deck.slice(0, SIM_QUESTS_TO_WIN).join(' → ')} …`, null, p);
  }
  walkLog(`Elke voltooide opdracht levert een beloningskaart op van een gedeelde stapel — max 2 kaarten in de hand.`);
  if (soloPlayers.length > 1){
    walkLog(`Beurtvolgorde: ${soloTurnOrder.map(i => soloPlayers[i].name).join(' → ')}.`);
    walkLog(soloPlayers.length === 2
      ? `Er wordt gespeeld tot de winnaar binnen is — de ander is dan tweede.`
      : `Er wordt doorgespeeld tot de <b>${soloFinishTarget}e</b> binnen is; de laatste speler is dan automatisch ${soloPlayers.length}e.`);
  } else {
    walkLog(`Solo potje: niemand blokkeert je. Kortsluiting, Duwstoot, Blinde Vlek en Prioriteitspas hebben een tegenstander nodig en doen hier dus niets als je ze trekt.`);
  }

  if (walkSoloPlayersSel) walkSoloPlayersSel.disabled = true;
  if (walkSoloBotsSel) walkSoloBotsSel.disabled = true;
  for (const sel of walkSoloSetupEl ? walkSoloSetupEl.querySelectorAll('select') : []) sel.disabled = true;
  btnWalkSoloStart.disabled = true;
  btnWalkSoloReset.disabled = false;

  renderWalkScore(soloPlayers, soloTurnOrder[0]);
  paintWalkPawns(soloGraph, soloPlayers, soloTurnOrder[0]);
  // Laat de browser de ECHTE startopstelling (iedereen op zijn gekozen vakje, iedereen 0 energie)
  // daadwerkelijk tekenen vóórdat we bot-beurten die aan jou voorafgaan meteen doorspelen. Zonder
  // deze ene frame-yield gebeurt dat hele eerste stuk synchroon in dezelfde taak — dus het EERSTE
  // wat je ooit te zien krijgt is al een bord waar die bots al verplaatst zijn en al energie
  // hebben, nooit de echte startpositie. Dat las als "startposities staan op een vreemde plek"/
  // "iedereen start met energie" (gebruikersmelding), terwijl het gewoon al-gespeelde beurten
  // waren die je nooit als vertrekpunt had gezien. `soloRunId` bewaakt dat deze uitgestelde stap
  // zichzelf afbreekt als het potje ondertussen alweer gestopt/herstart is (`stopSoloGame()`).
  const runId = soloRunId;
  requestAnimationFrame(() => {
    if (runId !== soloRunId) return;
    soloAdvanceLoop();
  });
}

if (walkModeAutoBtn) walkModeAutoBtn.addEventListener('click', () => setWalkMode('auto'));
if (walkModeSoloBtn) walkModeSoloBtn.addEventListener('click', () => setWalkMode('solo'));
if (btnWalkSoloStart) btnWalkSoloStart.addEventListener('click', startSoloGame);
// "Nieuw potje" moet een SCHONE lei zijn (energie/opdrachten/posities terug naar 0, nieuwe
// shuffle) — niet startSoloGame() nogmaals, want die hergebruikt soloPlayers = soloSetupPlayers
// rechtstreeks (zelfde objecten, geen kopie) zonder ze te resetten. Zonder deze route bleef
// b.v. Speler 1's energie van het vorige potje gewoon staan en tellen bots' oude startLabel nog
// mee als "bezet" voor de volgende ronde — vandaar de gemelde bug ("energie blijft oplopen,
// startposities kloppen niet"). soloRebuildSetup() bouwt frisse spelerobjecten met energie 0,
// nieuw geschudde stapels en een nieuwe RNG, en toont het startpositie-scherm weer.
if (btnWalkSoloReset) btnWalkSoloReset.addEventListener('click', soloRebuildSetup);

soloSyncBotOptions();
soloRebuildSetup();
