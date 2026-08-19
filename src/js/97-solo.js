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
const WALK_SOLO_NO_OPPONENT_CARDS = ['short', 'blind', 'shove', 'scan',
  'lockdown', 'outage', 'barrier', 'recoil', 'jam'];

const walkModeAutoBtn = document.getElementById('walkModeAuto');
const walkModeSoloBtn = document.getElementById('walkModeSolo');
const walkAutoControlsEl = document.getElementById('walkAutoControls');
const walkSoloControlsEl = document.getElementById('walkSoloControls');
const walkSoloHintEl = document.getElementById('walkSoloHint');
const walkAutoHintEl = document.getElementById('walkAutoHint');
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
const walkCardVaultEl = document.getElementById('walkCardVault');
const walkCardVaultThumbsEl = document.getElementById('walkCardVaultThumbs');
const walkCardVaultCountEl = document.getElementById('walkCardVaultCount');
const walkCardVaultHintEl = document.getElementById('walkCardVaultHint');
const cardOverlayEl = document.getElementById('cardOverlay');
const cardGridEl = document.getElementById('cardGrid');
const cardPanelHintEl = document.getElementById('cardPanelHint');
const cardPanelClose = document.getElementById('cardPanelClose');
const btnCardPlay = document.getElementById('btnCardPlay');
const btnCardDiscard = document.getElementById('btnCardDiscard');
const btnCardCancel = document.getElementById('btnCardCancel');
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
      nextIdx: 0, completed: 0, energy: 0, cards: [], rank: 0, doneCells: [], condenserPending: false,
      lockedNextTurn: false, rollPenalty: 0, barrierCell: null, reorderBlocked: false, lastDir: -1,
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
// 'idle' | 'choose-action' | 'target-pick' | 'blind-offer' |
// 'rolling' | 'moving' | 'boots-direction' | 'jump-target' | 'game-over'
// Beurtvolgorde: 'choose-action' = energie-actie kiezen (of overslaan) — vóór het dobbelen, direct
// ingezet. Dan 'rolling' = dobbelen. Dan 'moving' = stappen zetten; kaarten spelen/afleggen kan op
// elk moment tijdens 'moving' (via de kaartkluis, zie soloRefreshCardVault), vóór of tussen de stappen door, hooguit
// 1 kaart per beurt — er is dus geen aparte fase vóór de worp om een kaart te spelen.
let soloPhase = 'idle';
let soloRunId = 0;
let soloMove = null;            // { d1, d2, d3, roll, stepsLeft, lastDir, path }
let soloEnergyRoll = 0;
let soloEnergyGain = { gained: 0, wasted: 0 };
let soloUsedEnergyId = null;    // id uit ENERGY_ACTIONS, voor de logregel
let soloUsedCardId = null;      // id uit ACTION_CARDS (GESPEELD), voor de logregel
let soloDiscardedCardId = null; // id uit ACTION_CARDS (AFGELEGD i.p.v. gespeeld), voor de logregel
let soloTargetSwapped = false;  // Herkalibratie (kaart) en Herprioritering (energie) doen dezelfde
                                 // doelwissel — zodra de een 'm deze beurt al deed, blokkeert dit de ander
let soloPendingBoost = false;   // Stuwstoot/Stuwlading: deze beurt een 3e loopsteen
let soloUsedBoots = false;
let soloAllowUturn = false;   // Snelroute: geen-U-turn-regel geldt deze beurt niet voor jou
let soloLockedThisTurn = false; // Vergrendeling: deze beurt geen energie- en kaartactie
let soloUsedJump = false;
let soloBootsOptions = [];
let soloCurrentLegalMoves = [];  // { key, dir }[] — de opties die het richtingskruis nu toont
let soloBlindOfferAvailable = false; // deze stap geblokkeerd door een tegenstander + Blinde Vlek in de hand

function solo(){ return soloPlayers[soloActiveIdx]; }
// Energie-actie en kaartactie zijn TWEE LOSSE sloten per beurt (max 1 van elk) — een kaart
// AFLEGGEN gebruikt hetzelfde kaart-slot als een kaart SPELEN, dus telt ook mee.
function soloEnergyActionUsed(){ return !!soloUsedEnergyId; }
function soloCardActionUsed(){ return !!(soloUsedCardId || soloDiscardedCardId); }
// alle andere spelers die nog meespelen — voor blokkeren en doelwit-keuzes
function soloOthers(){ return soloPlayers.filter(p => p.idx !== soloActiveIdx && !p.rank); }
function soloOccupied(){
  const occ = new Set(soloOthers().map(p => p.pos));
  // Noodbarrière die tegen JOU is ingezet: telt deze beurt als een bezet vakje
  const me = solo();
  if (me && me.barrierCell !== null) occ.add(me.barrierCell);
  return occ;
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
  if (walkSoloSetupEl) walkSoloSetupEl.hidden = isAuto;
  if (walkSoloStartRowEl) walkSoloStartRowEl.hidden = true;
  // De navigator is alleen relevant in "Zelf spelen" — maar BINNEN die modus blijft hij nu de
  // hele partij zichtbaar (zie soloHideDirPad hierboven), dus dit is de enige plek die 'm nog
  // echt uit de layout haalt.
  if (walkDirPadEl) walkDirPadEl.hidden = isAuto;
  if (walkAutoHintEl) walkAutoHintEl.hidden = !isAuto;
  if (walkSoloHintEl) walkSoloHintEl.hidden = isAuto;
  if (walkSoloPanelEl) walkSoloPanelEl.hidden = true;
  if (btnWalkSoloRoll) btnWalkSoloRoll.hidden = true;
  if (btnWalkSoloSkip) btnWalkSoloSkip.hidden = true;
  renderWalkBoard();
  if (walkDiceEl) walkDiceEl.innerHTML = '';
  if (walkMetaEl) walkMetaEl.innerHTML = '';
  if (walkScoreEl) walkScoreEl.innerHTML = '';
  if (walkScoreActiveEl) walkScoreActiveEl.innerHTML = '';
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
    if (!soloAllowUturn && lastDir !== -1 && d === (lastDir + 2) % 4) continue;
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
  markWalkTarget(soloGraph, label, soloTargetKey, p.color);
}

// ---------- actiepaneel (begin van de beurt) ----------
function renderEnergySoloButton(id, disabled, reason){
  const act = ENERGY_ACTIONS[id];
  const title = reason ? `${act.name} — ${reason}` : `${act.name} (${act.cost} energie) — ${act.note || act.hint}`;
  // Bewust GEEN .action-card hier: dat kaartje is 108px breed en met z'n drieën passen ze niet
  // in de 300px-zijkolom — de derde viel op een tweede rij, en dwong je ze smaller te maken,
  // brak "HERPRIORITERING" middenin het woord af. Als volle-breedte-rij is er ruimte zat voor
  // de naam én de uitleg op één regel.
  return `<button type="button" class="energy-pick${disabled ? ' is-disabled' : ''}" data-energy="${id}"${disabled ? ' disabled' : ''} title="${title}">
    <span class="energy-pick-cost">${act.cost}</span>
    <span class="energy-pick-text">
      <b>${act.name}</b>
      <span>${reason || act.hint}</span>
    </span>
  </button>`;
}
// De 'choose-action'-fase toont ALLEEN de energie-acties — die moet je immers vóór het dobbelen
// inzetten. Kaarten spelen/afleggen (inclusief Zwaartekracht-laarzen en Stuwlading) kan pas ná
// het dobbelen, vóór of tijdens het stappen zetten (via het kaartvenster, zie hieronder).
function soloRenderActionPanel(){
  if (!walkSoloActionsEl) return;
  const p = solo();
  const energyBtns = ['boost', 'reorder', 'jump'].map(id =>
    renderEnergySoloButton(id, p.energy < ENERGY_ACTIONS[id].cost)
  ).join('');
  // Kun je er geen enkele betalen, zeg dat dan met zoveel woorden — drie uitgegrijsde rijen
  // zien er anders uit alsof het paneel stuk is.
  const allLocked = ['boost', 'reorder', 'jump'].every(id => p.energy < ENERGY_ACTIONS[id].cost);
  const note = allLocked
    ? `<p class="hint energy-pick-none">Je hebt <b>${p.energy}</b> energie — te weinig voor een actie. Gooi gewoon; je energiesteen vult je voorraad weer aan.</p>`
    : '';
  walkSoloActionsEl.innerHTML = `<div class="energy-pick-list">${energyBtns}</div>${note}`;
}
if (walkSoloActionsEl){
  walkSoloActionsEl.addEventListener('click', (e) => {
    if (soloPhase !== 'choose-action') return;
    const btn = e.target.closest('button.energy-pick');
    if (!btn || btn.disabled || btn.classList.contains('is-disabled')) return;
    if (btn.dataset.energy) soloUseEnergyAction(btn.dataset.energy);
  });
}


function soloUnconditionalSwap(){
  const p = solo();
  const cur = p.deck[p.nextIdx];
  const alt = p.deck[p.nextIdx + 1];
  p.deck[p.nextIdx] = alt;
  p.deck[p.nextIdx + 1] = cur;
}

// Beurtvolgorde: energie (vóór het dobbelen, direct ingezet) → dobbelen → kaart spelen/afleggen
// (vóór of tijdens het stappen zetten), hooguit 1 kaart per beurt. Er is dus geen apart moment
// vóór de worp om een kaart te spelen — ook Zwaartekracht-laarzen en Stuwlading niet, die komen
// hieronder gewoon voor in het kaartvenster tijdens het lopen (soloRefreshCardVault).
// Routeert een gespeelde/afgelegde kaart naar de vervolgstap: er is op dit punt altijd al
// gedobbeld (kaarten spelen kan pas ná de worp), dus de bewegingsfase wordt herberekend — bv. na
// Duwstoot verschuift een blokkade, na Herkalibratie verandert het doel, na Stuwlading is er
// extra stepsLeft.
function soloAfterCardAction(){
  soloAdvanceMovePhase();
}
function soloDiscardCard(id){
  if (soloCardActionUsed()) return;
  const p = solo();
  useActionCard(p, id, soloDeck);
  soloDiscardedCardId = id;
  walkLog(`Je legt <b>${ACTION_CARDS[id].name}</b> af.`, null, p);
  soloAfterCardAction();
}
// ---------- tijdens het lopen: altijd-zichtbare kaartenrij (spelen óf afleggen) ----------
// Alleen Blinde Vlek blijft puur reactief (zie soloOfferBlindSpot): die bied je pas aan op het
// moment dat je route daadwerkelijk geblokkeerd raakt. Al het andere staat gewoon in deze rij —
// de juiste beurtvolgorde is energie (vóór het dobbelen) → dobbelen → kaart spelen/afleggen
// (vóór of tijdens het stappen zetten), dus ook Boots/Stuwlading/Condensator horen pas ná de
// worp aan de beurt. Voor Condensator is dat zelfs de bedoeling: je ziet je energiesteen al
// liggen en beslist dán pas of verdubbelen de moeite waard is.
// Waarom kan deze kaart nu niet gespeeld worden? Geeft de reden terug, of null als hij wel mag.
// Eén bron voor zowel de kluis (hoeveel is er speelbaar) als het venster (waarom niet).
function soloCardBlockReason(id){
  const p = solo();
  if (!p) return 'geen actieve speler';
  if (soloPhase !== 'moving') return 'kan pas nadat je hebt gedobbeld';
  if (soloCardActionUsed()) return 'je hebt deze beurt al een kaart gebruikt';
  // Blinde Vlek is puur reactief: die krijg je vanzelf aangeboden op het moment dat je zet
  // daadwerkelijk op een tegenstander stukloopt (zie soloOfferBlindSpot)
  if (id === 'blind') return 'wordt vanzelf aangeboden zodra je route geblokkeerd raakt';
  if (soloPlayers.length === 1 && WALK_SOLO_NO_OPPONENT_CARDS.includes(id)) return 'geen tegenstanders in dit potje';
  if (id === 'shove' && !soloShoveTargets().length) return 'geen tegenstander naast je om weg te duwen';
  if ((id === 'scan' || id === 'short') && !soloOthers().length) return 'geen tegenstanders meer over';
  if (id === 'ration' && p.energy >= ENERGY_MAX) return 'je energie zit al vol';
  if (id === 'recal' && soloTargetSwapped) return 'je doel is deze beurt al gewisseld';
  // Stuwlading (kaart) en Stuwstoot (energie) zijn allebei een gratis 3e loopsteen — samen
  // zouden ze een 4e opleveren, dus sluiten ze elkaar uit ook al zitten ze op losse sloten
  // (zelfde regel als in 95-simulate.js/96-walk.js)
  if (id === 'boostcell' && soloUsedEnergyId === 'boost') return 'je hebt deze beurt al Stuwstoot ingezet';
  if (id === 'condenser' && p.condenserPending) return 'er staat al een Condensator klaar';
  // "Gooi je worp opnieuw" kan alleen zolang je nog geen stap hebt gezet
  if (id === 'reroll' && soloMove && soloMove.stepsLeft !== soloMove.roll) return 'je bent al begonnen met lopen';
  // de nieuwe hinder-kaarten hebben allemaal een geldig doelwit nodig
  if (SOLO_TARGET_PICKER_LABELS[id] && !soloTargetPickerTargets(id).length){
    if (id === 'recoil') return 'geen tegenstander naast je die net gelopen heeft';
    if (id === 'barrier') return 'geen vrij vakje naast een tegenstander';
    return 'geen tegenstander om dit op te spelen';
  }
  if (id === 'lockdown' && soloOthers().every(q => q.lockedNextTurn)) return 'iedereen is al vergrendeld';
  if (id === 'outage' && soloOthers().every(q => q.rollPenalty > 0)) return 'iedereen is al onderbroken';
  if (id === 'jam' && soloOthers().every(q => q.reorderBlocked)) return 'iedereen is al gestoord';
  if (id === 'trade' && !soloDeck.discard.length) return 'de aflegstapel is leeg';
  if (id === 'peek' && !soloDeck.draw.length) return 'de trekstapel is leeg';
  // Snelroute grijpt op je eigen worp in, dus alleen zolang je nog niet gelopen hebt
  if (id === 'fastlane' && soloMove && soloMove.stepsLeft !== soloMove.roll) return 'je bent al begonnen met lopen';
  return null;
}
// afleggen mag met ELKE kaart in de hand (het kaart-slot is het enige dat telt, niet of de
// kaart nu nuttig is) — maar wel pas ná de worp, net als spelen
function soloCanDiscardNow(){ return soloPhase === 'moving' && !soloCardActionUsed(); }

// ---------- de kaartkluis onder de dobbelstenen ----------
function soloRefreshCardVault(){
  // de kaarten wonen nu in het venster; deze strook is voor energie-acties en keuzepanelen
  if (walkSoloActionsEl && (soloPhase === 'moving' || soloPhase === 'rolling')) walkSoloActionsEl.innerHTML = '';
  if (!walkCardVaultEl) return;
  const p = solo();
  const cards = p && !p.rank ? p.cards : [];
  if (!cards.length || soloPhase === 'idle' || soloPhase === 'game-over'){
    walkCardVaultEl.hidden = true;
    if (cardOverlayEl && !cardOverlayEl.hidden) soloCloseCardPanel();
    return;
  }
  walkCardVaultEl.hidden = false;
  walkCardVaultThumbsEl.innerHTML = cards.map(id => ACTION_CARD_IMAGES[id]
    ? `<img src="${ACTION_CARD_IMAGES[id]}" alt="${ACTION_CARDS[id].name}">`
    : `<span class="walk-card-vault-blank action-card--${ACTION_CARD_TINTS[id]}" title="${ACTION_CARDS[id].name}"></span>`).join('');
  walkCardVaultCountEl.textContent = cards.length === 1 ? '1 actiekaart' : `${cards.length} actiekaarten`;
  const playable = cards.filter(id => !soloCardBlockReason(id)).length;
  walkCardVaultHintEl.textContent = playable
    ? `${playable} speelbaar — klik om te bekijken →`
    : 'geen speelbaar op dit moment — klik om te bekijken →';
  if (cardOverlayEl && !cardOverlayEl.hidden) soloRenderCardGrid();
}

// ---------- het kaartvenster ----------
let soloSelectedCard = null;

function soloOpenCardPanel(){
  const p = solo();
  if (!p || !p.cards.length || !cardOverlayEl) return;
  soloSelectedCard = null;
  cardOverlayEl.hidden = false;
  soloRenderCardGrid();
}
function soloCloseCardPanel(){
  if (!cardOverlayEl) return;
  cardOverlayEl.hidden = true;
  soloSelectedCard = null;
}
function soloRenderCardGrid(){
  const p = solo();
  if (!p || !p.cards.length){ soloCloseCardPanel(); return; }
  if (soloSelectedCard && !p.cards.includes(soloSelectedCard)) soloSelectedCard = null;

  cardGridEl.innerHTML = p.cards.map(id => {
    const reason = soloCardBlockReason(id);
    const cls = `card-pick action-card--${ACTION_CARD_TINTS[id]}`
      + (soloSelectedCard === id ? ' is-selected' : '')
      + (reason ? ' is-locked' : '');
    return `<button type="button" class="${cls}" data-pick="${id}" title="${ACTION_CARDS[id].name} — ${ACTION_CARDS[id].hint}">
      ${renderPrintedCardFace(id)}
      ${reason ? `<span class="card-pick-reason">${reason}</span>` : ''}
    </button>`;
  }).join('');

  const blocked = soloSelectedCard ? soloCardBlockReason(soloSelectedCard) : 'niets geselecteerd';
  btnCardPlay.disabled = !!blocked;
  btnCardDiscard.disabled = !soloSelectedCard || !soloCanDiscardNow();
  cardPanelHintEl.textContent =
    soloPhase !== 'moving' ? 'Je kunt pas een kaart spelen of afleggen nadat je hebt gedobbeld.'
    : soloCardActionUsed() ? 'Je hebt deze beurt al een kaart gebruikt.'
    : 'Kies één kaart. Per beurt mag je er hooguit één spelen of afleggen.';
}
if (cardGridEl){
  cardGridEl.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-pick]');
    if (!btn) return;
    // ook een niet-speelbare kaart mag je selecteren — afleggen kan namelijk altijd
    soloSelectedCard = soloSelectedCard === btn.dataset.pick ? null : btn.dataset.pick;
    soloRenderCardGrid();
  });
}
if (btnCardPlay) btnCardPlay.addEventListener('click', () => {
  const id = soloSelectedCard;
  if (!id || soloCardBlockReason(id)) return;
  soloCloseCardPanel();          // eerst sluiten: sommige kaarten openen zelf een keuzepaneel
  soloPlayCard(id);
});
if (btnCardDiscard) btnCardDiscard.addEventListener('click', () => {
  const id = soloSelectedCard;
  if (!id || !soloCanDiscardNow()) return;
  soloCloseCardPanel();
  soloDiscardCard(id);
});
if (btnCardCancel) btnCardCancel.addEventListener('click', soloCloseCardPanel);
if (cardPanelClose) cardPanelClose.addEventListener('click', soloCloseCardPanel);
if (walkCardVaultEl) walkCardVaultEl.addEventListener('click', soloOpenCardPanel);
if (cardOverlayEl) cardOverlayEl.addEventListener('click', (e) => {
  if (e.target === cardOverlayEl) soloCloseCardPanel();   // klik naast het venster sluit het
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && cardOverlayEl && !cardOverlayEl.hidden) soloCloseCardPanel();
});

// ---------- doelwit kiezen: alle kaarten die een tegenstander aanwijzen ----------
const SOLO_TARGET_PICKER_LABELS = {
  short: 'Kortsluiting', shove: 'Duwstoot', scan: 'Prioriteitspas',
  lockdown: 'Vergrendeling', outage: 'Stroomonderbreking', barrier: 'Noodbarrière',
  recoil: 'Terugtrekbevel', jam: 'Signaalstoring',
};
function soloBarrierTargets(){
  const occNow = soloOccupied();
  return soloOthers().filter(p => soloGraph.adjKey[p.pos].some(k => !occNow.has(k) && k !== solo().pos));
}
function soloRecoilTargets(){
  return soloShoveTargets().filter(p => p.lastDir !== -1);
}
function soloTargetPickerTargets(cardId){
  if (cardId === 'shove') return soloShoveTargets();
  if (cardId === 'recoil') return soloRecoilTargets();
  if (cardId === 'barrier') return soloBarrierTargets();
  return soloOthers();
}

// wie er nu naast je staat (voor Duwstoot — die kan alleen een AANGRENZENDE tegenstander duwen;
// de richting waarin hij vliegt wordt daarna geloot, zie shoveDestination)
// alleen tegenstanders die naast je staan én die daadwerkelijk ruimte hebben om weg te
// schuiven — iemand die meteen klem zit aanbieden zou je de kaart voor niets laten verspelen
function soloShoveTargets(){
  const me = solo();
  const neigh = new Set(soloGraph.adjKey[me.pos]);
  return soloOthers().filter(p => neigh.has(p.pos) && shoveDestination(soloGraph, soloPlayers, p, soloRand));
}
function soloEnterTargetPicker(cardId){
  const targets = soloTargetPickerTargets(cardId);
  if (!targets.length) return;
  soloPhase = 'target-pick';
  soloHideDirPad();
  // deze picker kan nu ook MIDDENIN het lopen geopend worden (kaarten spelen kan tijdens je
  // stappen) — dan staan er nog groen-omrande aanklikbare vakjes op het bord van vóór deze klik;
  // die moeten weg zolang de doelwit-kiezer open staat, anders blijft de oude highlight zichtbaar
  // naast de nieuwe knoppenrij
  soloClearClickable();
  btnWalkSoloSkip.hidden = true;
  btnWalkSoloRoll.hidden = true;
  const label = SOLO_TARGET_PICKER_LABELS[cardId];
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
    soloAfterCardAction();
  } else if (cardId === 'scan'){
    const label = victim.deck[victim.nextIdx];
    useActionCard(p, 'scan', soloDeck);
    soloUsedCardId = 'scan';
    walkLog(`Je speelt <b>Prioriteitspas</b>: ${victim.name}'s volgende opdracht is <b>${label} — ${QUEST_NAMES[label] || ''}</b>.`, null, p);
    soloAfterCardAction();
  } else if (cardId === 'shove'){
    // richting wordt geloot, niet gekozen — zelfde berekening als de bot-AI
    const dest = shoveDestination(soloGraph, soloPlayers, victim, soloRand);
    useActionCard(p, 'shove', soloDeck);
    soloUsedCardId = 'shove';
    if (dest){
      victim.pos = dest.key;
      const kompas = ['noord', 'oost', 'zuid', 'west'][dest.dir];
      walkLog(`Je speelt <b>Duwstoot</b> op ${victim.name}: die vliegt ${dest.steps} vakje${dest.steps === 1 ? '' : 's'} naar het ${kompas}.`, null, p);
    } else {
      walkLog(`Je speelt <b>Duwstoot</b> op ${victim.name}, maar die zit helemaal klem — er is geen kant op te duwen.`, null, p);
    }
    paintWalkPawns(soloGraph, soloPlayers, p.idx);
    soloAfterCardAction();
  } else if (cardId === 'lockdown'){
    victim.lockedNextTurn = true;
    useActionCard(p, 'lockdown', soloDeck);
    soloUsedCardId = 'lockdown';
    walkLog(`Je speelt <b>Vergrendeling</b> op ${victim.name}: die mist zijn volgende energie- én kaartactie.`, null, p);
    soloAfterCardAction();
  } else if (cardId === 'outage'){
    victim.rollPenalty = 2;
    useActionCard(p, 'outage', soloDeck);
    soloUsedCardId = 'outage';
    walkLog(`Je speelt <b>Stroomonderbreking</b> op ${victim.name}: die gooit 2 stappen minder.`, null, p);
    soloAfterCardAction();
  } else if (cardId === 'barrier'){
    const occNow = soloOccupied(); occNow.add(p.pos);
    const spot = soloGraph.adjKey[victim.pos].find(k => !occNow.has(k));
    useActionCard(p, 'barrier', soloDeck);
    soloUsedCardId = 'barrier';
    if (spot !== undefined){
      victim.barrierCell = spot;
      walkLog(`Je speelt <b>Noodbarrière</b> naast ${victim.name}.`, null, p);
    } else {
      walkLog(`Je speelt <b>Noodbarrière</b>, maar er was geen lege plek naast ${victim.name}.`, null, p);
    }
    soloAfterCardAction();
  } else if (cardId === 'recoil'){
    const revDir = (victim.lastDir + 2) % 4;
    const occNow = soloOccupied(); occNow.add(p.pos);
    let cur = victim.pos, steps = 0;
    for (let s = 0; s < 2; s++){
      const dirs = soloGraph.adjDir[cur], keys = soloGraph.adjKey[cur];
      let nextKey = -1;
      for (let j = 0; j < dirs.length; j++) if (dirs[j] === revDir){ nextKey = keys[j]; break; }
      if (nextKey === -1 || occNow.has(nextKey)) break;
      cur = nextKey; steps++;
    }
    useActionCard(p, 'recoil', soloDeck);
    soloUsedCardId = 'recoil';
    if (steps > 0){
      victim.pos = cur;
      walkLog(`Je speelt <b>Terugtrekbevel</b> op ${victim.name} en duwt die ${steps} vakje(s) terug.`, null, p);
    } else {
      walkLog(`Je speelt <b>Terugtrekbevel</b> op ${victim.name}, maar er was geen ruimte om terug te duwen.`, null, p);
    }
    paintWalkPawns(soloGraph, soloPlayers, p.idx);
    soloAfterCardAction();
  } else if (cardId === 'jam'){
    victim.reorderBlocked = true;
    useActionCard(p, 'jam', soloDeck);
    soloUsedCardId = 'jam';
    walkLog(`Je speelt <b>Signaalstoring</b> op ${victim.name}: diens eerstvolgende doelwissel mislukt.`, null, p);
    soloAfterCardAction();
  }
}

// Wordt alleen aangeroepen tijdens het lopen (ná de worp), vanuit het kaartvenster.
function soloPlayCard(id){
  if (id === 'boots'){ soloEnterBootsDirection(); return; }
  if (SOLO_TARGET_PICKER_LABELS[id]){ soloEnterTargetPicker(id); return; }
  const p = solo();
  if (id === 'ration'){
    simGainEnergy(p, 3);
    useActionCard(p, 'ration', soloDeck);
    soloUsedCardId = 'ration';
    walkLog(`Je speelt <b>Noodrantsoen</b>: +3 energie → ${p.energy}.`, null, p);
    soloAfterCardAction();
  } else if (id === 'recal'){
    // Herkalibratie en Herprioritering doen dezelfde doelwissel — is die deze beurt al gebeurd
    // (via de ander), dan blijft deze kaart in de hand
    if (soloTargetSwapped) return;
    soloUnconditionalSwap();
    useActionCard(p, 'recal', soloDeck);
    soloUsedCardId = 'recal';
    soloTargetSwapped = true;
    soloRefreshTarget();
    walkLog(`Je speelt <b>Herkalibratie</b>: nieuw doel ${p.deck[p.nextIdx]}.`, null, p);
    soloAfterCardAction();
  } else if (id === 'boostcell'){
    // Je hebt al gedobbeld (deze kaart kan pas ná de worp gespeeld worden) — dus geen 3e
    // loopsteen vóóraf zoals bij de energie-actie Stuwstoot, maar een extra worp erbovenop.
    const d3 = simRollD6(soloRand);
    soloMove.d3 = (soloMove.d3 || 0) + d3;
    soloMove.roll += d3;
    soloMove.stepsLeft += d3;
    useActionCard(p, 'boostcell', soloDeck);
    soloUsedCardId = 'boostcell';
    renderWalkDice(soloMove.d1, soloMove.d2, soloEnergyRoll, false, soloMove.d3);
    walkLog(`Je speelt <b>Stuwlading</b>: gratis derde loopsteen (${d3}) → ${soloMove.stepsLeft} stappen te gaan.`, null, p);
    soloAfterCardAction();
  } else if (id === 'fastlane'){
    soloAllowUturn = true;
    useActionCard(p, 'fastlane', soloDeck);
    soloUsedCardId = 'fastlane';
    walkLog(`Je speelt <b>Snelroute</b>: de geen-U-turn-regel geldt deze beurt niet voor jou.`, null, p);
    soloAfterCardAction();
  } else if (id === 'trade'){
    // ruil de kaart die je NIET speelde tegen de bovenste aflegkaart
    const other = p.cards.find(c => c !== 'trade');
    useActionCard(p, 'trade', soloDeck);
    soloUsedCardId = 'trade';
    if (other && soloDeck.discard.length){
      const gekregen = soloDeck.discard[soloDeck.discard.length - 1];
      performCardTrade(p, other, soloDeck);
      walkLog(`Je speelt <b>Kaartenruil</b>: ${ACTION_CARDS[other].name} eruit, <b>${ACTION_CARDS[gekregen].name}</b> erin.`, null, p);
    } else {
      walkLog(`Je speelt <b>Kaartenruil</b>, maar er is niets om te ruilen.`, null, p);
    }
    soloAfterCardAction();
  } else if (id === 'peek'){
    performPeekReorder(soloDeck);
    useActionCard(p, 'peek', soloDeck);
    soloUsedCardId = 'peek';
    walkLog(`Je speelt <b>Herinnering</b>: de bovenste kaarten van de trekstapel zijn herschikt.`, null, p);
    soloAfterCardAction();
  } else if (id === 'condenser'){
    // een investering voor je VOLGENDE beurt: die energiesteen telt dan dubbel. Je weet dus
    // nog niet wat je gooit — anders dan bij de andere kaarten is dit een gok vooruit.
    p.condenserPending = true;
    useActionCard(p, 'condenser', soloDeck);
    soloUsedCardId = 'condenser';
    walkLog(`Je speelt <b>Condensator</b>: je energiesteen telt in je volgende beurt dubbel.`, null, p);
    renderWalkScore(soloPlayers, soloActiveIdx);
    soloAfterCardAction();
  } else if (id === 'reroll'){
    const d1 = simRollD6(soloRand), d2 = simRollD6(soloRand);
    const d3 = soloMove.d3 !== null && soloMove.d3 !== undefined ? simRollD6(soloRand) : null;
    const roll = d1 + d2 + (d3 || 0);
    useActionCard(p, 'reroll', soloDeck);
    soloUsedCardId = 'reroll';
    // volledig nieuwe zet: het pad begint opnieuw vanaf waar je nu staat
    soloMove = { d1, d2, d3, roll, stepsLeft: roll, lastDir: -1, path: [p.pos] };
    renderWalkDice(d1, d2, soloEnergyRoll, false, d3);
    walkLog(`Je speelt <b>Koerscorrectie</b> en gooit opnieuw: <b>${roll}</b> stappen.`, null, p);
    soloAfterCardAction();
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
    soloTargetSwapped = true;
    soloRefreshTarget();
    // kosten uit ENERGY_ACTIONS halen i.p.v. hier een getal te herhalen — dat liep bij de
    // prijswijziging 6 → 2 juist uit de pas met de werkelijk afgeschreven energie
    walkLog(`Je zet <b>Herprioritering</b> in (−${act.cost}): nieuw doel ${p.deck[p.nextIdx]}.`, null, p);
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
    ? energyDieHtml(null, false) + `<span class="walk-die-sum energy">energie bij het gooien</span>`
    : energyDieHtml(e, false) + `<span class="walk-die-sum energy">+${e} energie</span>`;
  walkDiceEl.innerHTML = `<span class="walk-die">?</span><span class="walk-die">?</span>` + energyHtml;
}
function soloRenderDirPad(legal){
  if (!walkDirPadEl) return;
  soloCurrentLegalMoves = legal;
  const legalDirs = new Set(legal.map(l => l.dir));
  for (const btn of walkDirPadEl.querySelectorAll('button[data-dir]')){
    btn.disabled = !legalDirs.has(parseInt(btn.dataset.dir, 10));
  }
  if (walkStepDoneEl) walkStepDoneEl.textContent = soloMove.path.length - 1;
  if (walkStepLeftEl) walkStepLeftEl.textContent = soloMove.stepsLeft;
}
// De navigator zelf blijft nu de HELE partij zichtbaar (zie setWalkMode: alleen de modus,
// niet de beurtfase, bepaalt of hij getoond wordt) — "verbergen" buiten je eigen zet betekent
// nu alleen nog de knoppen uitschakelen en de teller op een placeholder zetten, niet meer het
// hele blok uit de layout halen. Zonder dit sprong het infopaneel eronder elke beurt een stukje
// omhoog/omlaag zodra het navigatorblok verscheen/verdween (gebruikersmelding: "het menu rechts
// schiet continu heen en weer").
function soloHideDirPad(){
  soloCurrentLegalMoves = [];
  if (!walkDirPadEl) return;
  for (const btn of walkDirPadEl.querySelectorAll('button[data-dir]')) btn.disabled = true;
  if (walkStepDoneEl) walkStepDoneEl.textContent = '–';
  if (walkStepLeftEl) walkStepLeftEl.textContent = '–';
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
// Op een pc mogen de pijltjestoetsen dezelfde stap zetten als een klik op het richtingskruis
// (gebruikersverzoek). Alleen actief tijdens het lopen (soloPhase === 'moving') en niet terwijl
// je ergens anders op de pagina aan het typen bent (bv. de seed-invoer op tabblad "Kaart maken"),
// anders zouden de pijltjes daar niet meer gewoon door de tekst kunnen bewegen.
const SOLO_ARROW_DIR = { ArrowUp: 0, ArrowRight: 1, ArrowDown: 2, ArrowLeft: 3 };
document.addEventListener('keydown', (e) => {
  const dir = SOLO_ARROW_DIR[e.key];
  // Blokkeer scrollen tijdens de HELE actieve beurt (elke fase behalve 'idle'/'game-over'), niet
  // alleen tijdens 'moving' zelf — anders scrolt de pagina alsnog zodra je klaar bent met lopen
  // en een pijltje indrukt terwijl de fase net is doorgeschoven naar bv. 'choose-action' voor de
  // volgende beurt (gebruikersmelding: "als je klaar bent met je zetten scrollt de pagina").
  if (dir === undefined || soloPhase === 'idle' || soloPhase === 'game-over') return;
  const tag = document.activeElement && document.activeElement.tagName;
  if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
  e.preventDefault();
  if (soloPhase !== 'moving') return;
  const match = soloCurrentLegalMoves.find(l => l.dir === dir);
  if (!match) return;
  soloHandleMoveClick(match.key);
});

function soloProceedToRoll(){
  walkSoloActionsEl.innerHTML = '';
  soloHideDirPad();
  btnWalkSoloSkip.hidden = true;
  btnWalkSoloRoll.hidden = false;
  btnWalkSoloRoll.textContent = soloPendingBoost ? '🎲 Gooi 3 dobbelstenen' : '🎲 Gooi de dobbelstenen';
  soloPhase = 'rolling';
  soloRefreshCardVault();
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
  // Condensator die je vorige beurt speelde: deze steen telt dubbel. Gooi je 0, dan valt er
  // niets te verdubbelen en blijft hij staan tot een beurt waarin je wél iets gooit.
  if (p.condenserPending && soloEnergyRoll > 0){
    p.condenserPending = false;
    const bonus = simGainEnergy(p, soloEnergyRoll);
    soloEnergyGain.gained += bonus.gained;
    soloEnergyGain.wasted += bonus.wasted;
    walkLog(`Je <b>Condensator</b> gaat af: energiesteen ${soloEnergyRoll} telt dubbel → +${soloEnergyGain.gained} energie.`, null, p);
  }
}
function soloRollDice(){
  if (soloPhase !== 'rolling') return;
  const d1 = simRollD6(soloRand), d2 = simRollD6(soloRand);
  const d3 = soloPendingBoost ? simRollD6(soloRand) : null;
  soloRollEnergyForTurn();
  renderWalkDice(d1, d2, soloEnergyRoll, false, d3);
  let roll = d1 + d2 + (d3 || 0);
  const p = solo();
  if (p.rollPenalty){
    const nieuw = Math.max(1, roll - p.rollPenalty);
    walkLog(`<b>Stroomonderbreking</b> kost je ${roll - nieuw} stappen: ${roll} → ${nieuw}.`, null, p);
    roll = nieuw;
    p.rollPenalty = 0;
  }
  soloMove = { d1, d2, d3, roll, stepsLeft: roll, lastDir: -1, path: [p.pos] };
  btnWalkSoloRoll.hidden = true;
  renderWalkScore(soloPlayers, soloActiveIdx);
  soloAdvanceMovePhase();
}
if (btnWalkSoloRoll) btnWalkSoloRoll.addEventListener('click', soloRollDice);
if (btnWalkSoloSkip) btnWalkSoloSkip.addEventListener('click', () => {
  // 'choose-action' (energie overslaan) gaat direct door naar het dobbelen.
  if (soloPhase === 'choose-action') soloProceedToRoll();
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
      && solo().cards.includes('blind') && !soloCardActionUsed();
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
  // altijd-zichtbare kaartenrij (spelen/afleggen) opnieuw tekenen — dekt alle aanroepers van
  // deze functie in één keer (dobbelen, elke losse stap, ná een doelwit-kiezer/Condensator/enz.)
  soloRefreshCardVault();
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
      soloPhase = 'moving';
      const legal = soloLegalNextCells(soloGraph, solo().pos, soloMove.lastDir, null);
      soloMarkClickable(soloGraph, legal.map(l => l.key));
      soloRenderDirPad(legal);
      renderSoloMeta(soloMove.stepsLeft);
      soloRefreshCardVault();   // cardActionUsed is nu true (blind gespeeld), dus niets meer speelbaar
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
  solo().lastDir = match.dir;   // Terugtrekbevel duwt je langs deze richting terug
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

// welke kaart deze beurt is AFGELEGD i.p.v. gespeeld — zelfde badge-stijl als walkActionNote/
// walkCardNote in 96-walk.js, maar lokaal want dit is een puur-mens-mechaniek (bots leggen nooit af)
function soloDiscardNote(id){
  if (!id) return '';
  return ` <span class="action">🗑 ${ACTION_CARDS[id].name} afgelegd</span>`;
}

// ---------- beurt afronden ----------
function soloFinishTurn(banked){
  soloClearClickable();
  soloHideDirPad();
  // Noodbarrière gold precies voor deze ene beurt en verdwijnt nu, of je er nu tegenaan liep of niet
  if (solo()) solo().barrierCell = null;
  // vangnet voor Zwaartekracht-laarzen / een Noodtransport dat exact op je doel landt: die paden
  // roepen soloFinishTurn() aan zonder ooit langs soloRollDice() te komen, dus zonder dit zou die
  // beurt zijn energiesteen helemaal overslaan. Let op: wie langs dit vangnet binnenkomt heeft
  // zijn energiesteen dus pas ná zijn zet gezien en kan er geen Condensator meer op spelen —
  // dat is inherent aan die twee paden, niet aan het kaart-slot.
  soloRollEnergyForTurn();
  const p = solo();
  const { d1, d2, d3, roll } = soloMove;
  const stepsUsed = soloMove.path.length - 1;
  const rollText = soloUsedBoots
    ? `🥾 ${stepsUsed} van 10 stappen rechtdoor`
    : soloUsedJump
      ? `⚡ Noodtransport`
      : walkRollText(d1, d2, d3, roll);
  // energie-actie en kaartactie zijn losse sloten en kunnen dus allebei tegelijk waar zijn deze
  // beurt — samenvoegen i.p.v. kiezen, anders verdween er stilletjes een van de twee uit de log
  // (zelfde bug als eerder gevonden en gefixt in 96-walk.js)
  const turnNote = walkActionNote(soloUsedEnergyId) + walkCardNote(soloUsedCardId) + soloDiscardNote(soloDiscardedCardId);
  const targetLabel = p.deck[p.nextIdx];

  if (banked){
    p.completed++;
    p.doneCells.push(soloTargetKey);
    clearWalkTarget();
    walkCellDiv(soloGraph, soloTargetKey).classList.add('walk-done');
    const extra = (!soloUsedBoots && !soloUsedJump && stepsUsed < roll) ? ` (na ${stepsUsed} van ${roll} stappen — de rest vervalt)` : '';
    walkLog(`Beurt ${soloTurn}: <b>${rollText}</b>${walkEnergyNote(soloEnergyRoll, soloEnergyGain, p)}${turnNote} → <span class="hit">${targetLabel} ${QUEST_NAMES[targetLabel] || ''} voltooid${extra}</span> · ${p.completed}/${SIM_QUESTS_TO_WIN}`, 'hit', p);
    p.nextIdx++;

    if (p.cards.length < ACTION_CARD_HAND_MAX){
      const drawn = drawActionCard(soloDeck, soloRand);
      if (drawn){
        p.cards.push(drawn);
        walkLog(`Je trekt een beloningskaart: <b>${ACTION_CARDS[drawn].name}</b> — ${ACTION_CARDS[drawn].hint}.`, null, p);
        soloRefreshCardVault();   // nieuwe kaart meteen in de kluis tonen
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
  soloDiscardedCardId = null;
  soloTargetSwapped = false;
  soloPendingBoost = false;
  soloUsedBoots = false;
  soloUsedJump = false;
  soloAllowUturn = false;
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

  // Vergrendeling: als je vorige beurt geraakt bent, mis je nu zowel je energie- als je
  // kaartactie. soloUsedEnergyId/soloUsedCardId alvast vullen zet beide sloten dicht, dus het
  // actiepaneel en het kaartvenster melden dat vanzelf.
  soloLockedThisTurn = false;
  if (p.lockedNextTurn){
    p.lockedNextTurn = false;
    soloLockedThisTurn = true;
    soloUsedEnergyId = 'locked';
    soloUsedCardId = 'locked';
    walkLog(`Je bent <b>vergrendeld</b>: deze beurt geen energie-actie en geen actiekaart.`, null, p);
  }

  soloRefreshTarget();
  renderSoloDicePending();
  renderWalkScore(soloPlayers, soloActiveIdx);
  renderSoloMeta();
  paintWalkPawns(soloGraph, soloPlayers, p.idx);

  btnWalkSoloRoll.hidden = true;
  btnWalkSoloSkip.hidden = false;
  btnWalkSoloSkip.textContent = 'Geen actie, gewoon dobbelen';
  soloPhase = 'choose-action';
  soloRenderActionPanel();
  soloRefreshCardVault();
}

// ---------- bot-beurt: meteen afgehandeld, geen animatie ----------
// niet-geanimeerde kopie van de bot-logica uit 96-walk.js/simulateOneGame — zelfde regels,
// alleen zonder walkTick()/walkPath()-vertragingen, want de bots hoeven niet op jou te wachten
// en jij niet op hen.
function soloResolveBotTurn(player){
  soloTurn++;
  const pIdx = player.idx;
  // Energie-acties en kaarten hebben ELK hun eigen actie-slot per beurt (max 1 van elk) —
  // zelfde opzet als simulateOneGame() in 95-simulate.js, zie de uitgebreide toelichting daar
  // voor de drie paren (Stuwlading/Stuwstoot, Herkalibratie/Herprioritering, Blinde Vlek/
  // Noodtransport) die elkaar nog wél uitsluiten binnen hún ene bewegingsmoment.
  let energyActionUsed = false;
  let cardActionUsed = false;
  if (player.lockedNextTurn){
    player.lockedNextTurn = false;
    energyActionUsed = true;
    cardActionUsed = true;
    walkLog(`${player.name} is <b>vergrendeld</b> en slaat zijn energie- en kaartactie over.`, null, player);
  }

  let energyRoll = 0, energyGain = { gained: 0, wasted: 0 };
  if (player.skipEnergyRoll){ player.skipEnergyRoll = false; }
  else {
    energyRoll = simRollEnergy(soloRand);
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

  // de Condensator wordt klaargezet voor de VOLGENDE beurt
  if (!cardActionUsed && player.cards.includes('condenser') && !player.condenserPending && player.energy < ENERGY_MAX){
    player.condenserPending = true;
    useActionCard(player, 'condenser', soloDeck);
    cardActionUsed = true;
  }
  if (!cardActionUsed && player.cards.includes('short')){
    const victim = pickShortCircuitTarget(soloPlayers, pIdx, soloRand);
    if (victim){
      victim.skipEnergyRoll = true;
      useActionCard(player, 'short', soloDeck);
      cardActionUsed = true;
      walkLog(`${player.name} gebruikt <b>Kortsluiting</b> op ${victim.name}.`, null, player);
    }
  }
  if (!cardActionUsed && player.cards.includes('ration') && player.energy < ENERGY_MAX){
    simGainEnergy(player, 3);
    useActionCard(player, 'ration', soloDeck);
    cardActionUsed = true;
  }
  if (!cardActionUsed && player.cards.includes('lockdown')){
    const victim = pickLeaderTarget(soloPlayers, pIdx, q => q.lockedNextTurn, soloRand);
    if (victim){
      victim.lockedNextTurn = true;
      useActionCard(player, 'lockdown', soloDeck); cardActionUsed = true;
      walkLog(`${player.name} gebruikt <b>Vergrendeling</b> op ${victim.name}.`, null, player);
    }
  }
  if (!cardActionUsed && player.cards.includes('outage')){
    const victim = pickLeaderTarget(soloPlayers, pIdx, q => q.rollPenalty > 0, soloRand);
    if (victim){
      victim.rollPenalty = 2;
      useActionCard(player, 'outage', soloDeck); cardActionUsed = true;
      walkLog(`${player.name} gebruikt <b>Stroomonderbreking</b> op ${victim.name}.`, null, player);
    }
  }
  if (!cardActionUsed && player.cards.includes('barrier')){
    const occNow = new Set(soloPlayers.filter(q => !q.rank).map(q => q.pos));
    const target = pickBarrierTarget(soloGraph, soloPlayers, occNow, pIdx, soloRand);
    if (target){
      target.player.barrierCell = target.cell;
      useActionCard(player, 'barrier', soloDeck); cardActionUsed = true;
      walkLog(`${player.name} gebruikt <b>Noodbarrière</b> naast ${target.player.name}.`, null, player);
    }
  }
  if (!cardActionUsed && player.cards.includes('jam')){
    const victim = pickLeaderTarget(soloPlayers, pIdx, q => q.reorderBlocked, soloRand);
    if (victim){
      victim.reorderBlocked = true;
      useActionCard(player, 'jam', soloDeck); cardActionUsed = true;
      walkLog(`${player.name} gebruikt <b>Signaalstoring</b> op ${victim.name}.`, null, player);
    }
  }
  if (!cardActionUsed && player.cards.includes('trade') && player.cards.includes('scan') && soloDeck.discard.length){
    performCardTrade(player, 'scan', soloDeck);
    useActionCard(player, 'trade', soloDeck); cardActionUsed = true;
  }
  if (!cardActionUsed && player.cards.includes('peek') && soloDeck.draw.length){
    performPeekReorder(soloDeck);
    useActionCard(player, 'peek', soloDeck); cardActionUsed = true;
  }

  let targetLabel = player.deck[player.nextIdx];
  let targetSwapped = false;
  // energyReorderTarget() leest/schrijft player.order — de batch-speler heet zijn stapel zo,
  // maar hier (net als in 96-walk.js) heet 'ie deck. Een shim die naar dezelfde array wijst
  // (geen kopie) laat de swap gewoon doorwerken op player.deck. Zie de kanttekening bij
  // pickShoveMove hierboven — dit is precies de val die daar staat beschreven.
  const shim = { order: player.deck, nextIdx: player.nextIdx };
  if (!cardActionUsed && player.cards.includes('recal')){
    const swapped = energyReorderTarget(soloGraph, shim, player.pos);
    if (swapped !== null){ targetLabel = swapped; useActionCard(player, 'recal', soloDeck); cardActionUsed = true; targetSwapped = true; }
  }
  if (!cardActionUsed && player.cards.includes('shove')){
    const shove = pickShoveMove(soloGraph, soloPlayers, pIdx, soloRand);
    if (shove){
      shove.player.pos = shove.toKey;
      useActionCard(player, 'shove', soloDeck);
      cardActionUsed = true;
      walkLog(`${player.name} gebruikt <b>Duwstoot</b> op ${shove.player.name}.`, null, player);
    }
  }
  if (!cardActionUsed && player.cards.includes('recoil')){
    const occNow = new Set(soloPlayers.filter(q => !q.rank).map(q => q.pos));
    const push = pickRecoilMove(soloGraph, soloPlayers, occNow, pIdx);
    if (push){
      push.player.pos = push.toKey;
      useActionCard(player, 'recoil', soloDeck); cardActionUsed = true;
      walkLog(`${player.name} gebruikt <b>Terugtrekbevel</b> op ${push.player.name}.`, null, player);
    }
  }
  if (!targetSwapped && !energyActionUsed && player.strategy === 'reorder' && player.energy >= ENERGY_ACTIONS.reorder.cost){
    const swapped = blindReorderTarget(soloGraph, shim, player.pos, REORDER_BLIND_THRESHOLD);
    if (swapped !== null){
      player.energy -= ENERGY_ACTIONS.reorder.cost; player.actionUses++; energyActionUsed = true;
      if (player.reorderBlocked){ player.reorderBlocked = false; applyReorderSwap(shim);
        walkLog(`${player.name}'s Herprioritering wordt gesaboteerd door <b>Signaalstoring</b>.`, null, player); }
      else targetLabel = swapped;
    }
  }
  const targetKey = soloGraph.questCells[targetLabel];

  const occupied = new Set();
  for (const other of soloPlayers) if (other.idx !== pIdx && !other.rank) occupied.add(other.pos);
  if (player.barrierCell !== null){ occupied.add(player.barrierCell); player.barrierCell = null; }

  let move, roll = 0, usedBoots = false, allowUturn = false;
  if (!cardActionUsed && player.cards.includes('boots')){
    const bootsMove = resolveGravityBoots(soloGraph, player.pos, 10, occupied, targetKey);
    if (bootsMove){ move = bootsMove; usedBoots = true; useActionCard(player, 'boots', soloDeck); cardActionUsed = true; }
  }
  if (!usedBoots){
    let dice = 2;
    roll = simRollD6(soloRand) + simRollD6(soloRand);
    if (!cardActionUsed && player.cards.includes('boostcell')){
      roll += simRollD6(soloRand); dice = 3; useActionCard(player, 'boostcell', soloDeck); cardActionUsed = true;
    } else if (!energyActionUsed && player.strategy === 'boost' && player.energy >= ENERGY_ACTIONS.boost.cost){
      roll += simRollD6(soloRand); dice = 3; player.energy -= ENERGY_ACTIONS.boost.cost; player.actionUses++; energyActionUsed = true;
    }
    if (player.rollPenalty){ roll = Math.max(1, roll - player.rollPenalty); player.rollPenalty = 0; }
    if (!cardActionUsed && player.cards.includes('fastlane')){
      allowUturn = true;
      useActionCard(player, 'fastlane', soloDeck); cardActionUsed = true;
    }
    move = resolveMove(soloGraph, player.pos, roll, occupied, targetKey, soloRand, undefined, allowUturn);
    // Koerscorrectie: tegenvallende worp overdoen (zie simulateOneGame voor de drempel)
    if (!move.bankedQuest && !cardActionUsed && player.cards.includes('reroll') && roll < dice * 3.5){
      roll = 0;
      for (let d = 0; d < dice; d++) roll += simRollD6(soloRand);
      useActionCard(player, 'reroll', soloDeck);
      cardActionUsed = true;
      walkLog(`${player.name} gebruikt <b>Koerscorrectie</b> en gooit opnieuw: ${roll}.`, null, player);
      move = resolveMove(soloGraph, player.pos, roll, occupied, targetKey, soloRand, undefined, allowUturn);
    }
  }

  let blindResolvedBlock = false;
  if (!move.bankedQuest && !cardActionUsed && player.cards.includes('blind') && move.wasBlocked){
    const retry = resolveMove(soloGraph, player.pos, roll, SIM_EMPTY_SET, targetKey, soloRand, occupied, allowUturn);
    if (retry && retry.key !== move.key){ move = retry; useActionCard(player, 'blind', soloDeck); cardActionUsed = true; blindResolvedBlock = true; }
  }
  if (!blindResolvedBlock && !move.bankedQuest && !energyActionUsed && player.strategy === 'jump' && player.energy >= ENERGY_ACTIONS.jump.cost){
    const jump = resolveEnergyJump(soloGraph, player.pos, ENERGY_JUMP_RANGE, targetKey);
    if (jump){
      player.energy -= ENERGY_ACTIONS.jump.cost; player.actionUses++; energyActionUsed = true;
      move = jump.banked
        ? { key: jump.key, path: [jump.key], stepsUsed: 0, bankedQuest: true, wasBlocked: false }
        : resolveMove(soloGraph, jump.key, roll, occupied, targetKey, soloRand, undefined, allowUturn);
    }
  }
  const stepDir = lastStepDirection(soloGraph, move.path);
  if (stepDir !== -1) player.lastDir = stepDir;

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
  soloRefreshCardVault();
  clearWalkTarget();
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
  soloRefreshCardVault();
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
  // De per-mens startpositie-kiezers hebben hun werk gedaan zodra het potje loopt — laten staan
  // (uitgeschakeld) kostte alleen maar ruimte boven het speelveld en liet het bord bij de eerste
  // volgende klik met een sprong omhoog schieten toen die rijen alsnog ergens verdwenen.
  // `.walk-solo-setup:empty{display:none;}` verbergt 'm meteen; soloRenderSetupUI() vult 'm
  // straks gewoon weer als je op "Nieuw potje" klikt.
  if (walkSoloSetupEl) walkSoloSetupEl.innerHTML = '';
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

// "Automatisch" is de standaard-actieve tab (zie de HTML), maar zonder deze aanroep bleef de
// solo-opzet-UI (spelerskeuze + "Potje starten"/"Nieuw potje") gewoon zichtbaar bij het laden
// van de pagina — soloRebuildSetup() vult en toont 'm namelijk onvoorwaardelijk, ongeacht welke
// tab actief is. setWalkMode('auto') zet alle mode-afhankelijke zichtbaarheid meteen goed (en
// bouwt de solo-spelerobjecten pas op zodra je écht naar "Zelf spelen" wisselt).
soloSyncBotOptions();
setWalkMode('auto');
