// ---------- controls ----------
// pool van 60 kandidaten (zie constrainedShuffleAsync in 70-generator.js) duurt ~2s i.p.v. de
// vroegere ~0,7s bij pool 20 — loopt daarom in brokken met een voortgangsbalk (zelfde patroon
// als runSimulationBatch in 95-simulate.js), anders bevriest de pagina zichtbaar tijdens het
// genereren. genRunning/btnShuffle.disabled voorkomt dat een dubbele klik twee generaties
// tegelijk start; hideGenProgress() (aangeroepen vanuit clearSimResults() bij ELKE bordwijziging)
// zorgt dat de balk en knoppen direct resetten zodra het bord op een ANDERE manier verandert
// terwijl er nog gegenereerd wordt (bv. een tegel slepen) — de simRunId-check in
// applyGeneratedLayout zorgt dat zo'n verouderde run zijn resultaat dan ook niet meer toepast.
const genProgressEl = document.getElementById('genProgress');
const genProgressFillEl = document.getElementById('genProgressFill');
const genProgressTextEl = document.getElementById('genProgressText');
let genRunning = false;

function hideGenProgress(){
  if (genProgressEl) genProgressEl.hidden = true;
  genRunning = false;
  const btnShuffleEl = document.getElementById('btnShuffle'), btnDiceEl = document.getElementById('btnDice');
  if (btnShuffleEl) btnShuffleEl.disabled = false;
  if (btnDiceEl) btnDiceEl.disabled = false;
}
function updateGenProgress(found, target, elapsedMs){
  if (!genProgressEl) return;
  const pct = target ? Math.min(100, (found / target) * 100) : 0;
  genProgressFillEl.style.width = `${pct.toFixed(1)}%`; // CSS: hier moet de punt blijven staan
  const perCandidate = found ? elapsedMs / found : 0;
  const etaMs = perCandidate * (target - found);
  genProgressTextEl.innerHTML =
    `<span><b>${found}</b> / ${target} kandidaten (${nl(pct, 0)}%)</span>` +
    `<span>verstreken ${formatSimSeconds(elapsedMs)} · nog ongeveer ${found > 0 ? formatSimSeconds(etaMs) : '…'}</span>`;
}

async function applyGeneratedLayout(seed){
  if (genRunning) return; // een dubbele klik mag geen tweede generatie tegelijk starten
  clearSimResults();
  const runId = simRunId; // clearSimResults() heeft 'm net verhoogd; deze aanroep "claimt" dat nummer
  genRunning = true;
  const btnShuffleEl = document.getElementById('btnShuffle'), btnDiceEl = document.getElementById('btnDice');
  if (btnShuffleEl) btnShuffleEl.disabled = true;
  if (btnDiceEl) btnDiceEl.disabled = true;
  if (genProgressEl){ genProgressEl.hidden = false; updateGenProgress(0, 60, 0); }

  const t0 = performance.now();
  const generated = await constrainedShuffleAsync(seed, (found, target) => {
    if (runId !== simRunId) return; // bord intussen op een andere manier gewijzigd
    updateGenProgress(found, target, performance.now() - t0);
  });
  if (runId !== simRunId){ return; } // verouderd: bord is inmiddels iets anders geworden

  layout = generated;
  hideGenProgress();
  selectedSlot = null; highlightTile = null;
  statSeed.textContent = seed;
  const conn = computeConnectivity();
  const balance = startBalanceScore(layout);
  const coverage = questCoverageScore(layout);
  const dead = deadTileCount(layout);
  const isolation = roomIsolationScore(layout);
  const spacing = questSpacingScore(layout);
  const deadNote = dead === 0
    ? ` Geen dode tegels — elke tegel ligt op een route tussen opdrachten.`
    : ` <span style="color:var(--danger)">${dead} dode tegel(s)</span> — daar komt vrijwel nooit een speler.`;
  const qualityNote = ` Hoogstens <b>${isolation}</b> gang(en) tussen twee kamers, opdrachten minstens <b>${spacing.minDist}</b> vakjes uit elkaar, eerlijkheid startposities ±<b>${nl(balance, 1)}</b> vakjes, verste vakje <b>${coverage.maxDist}</b> stappen van een opdracht.` + deadNote;
  if (conn.groups.length === 1 && conn.brokenCount === 0){
    swapHint.innerHTML = `Indeling gegenereerd met seed <b>${seed}</b> — strak aaneengesloten, geen doodlopende doorgangen, alle 20 tegels bereikbaar.` + qualityNote;
  } else {
    swapHint.innerHTML = `Indeling gegenereerd met seed <b>${seed}</b> — beste poging: ${conn.brokenCount} doodlopende naad/naden, ${conn.groups.length} sectie(s). Probeer een andere seed voor een strakkere indeling.`;
  }
  renderBoard();
}

document.getElementById('btnShuffle').addEventListener('click', ()=>{
  const seed = seedInput.value.trim() || 'axiom-9';
  applyGeneratedLayout(seed);
});

document.getElementById('btnReset').addEventListener('click', ()=>{
  clearSimResults();
  layout = defaultLayout.slice();
  resetRotations();
  selectedSlot = null; highlightTile = null;
  statSeed.textContent = 'origineel';
  swapHint.textContent = 'Sleep een tegel over een andere om ze te verwisselen.';
  renderBoard();
});

document.getElementById('btnRotL').addEventListener('click', ()=>{
  if (selectedSlot === null) return;
  clearSimResults();
  const tid = layout[selectedSlot];
  tileRotation[tid] = ((tileRotation[tid] || 0) + 270) % 360;
  renderBoard();
});
document.getElementById('btnRotR').addEventListener('click', ()=>{
  if (selectedSlot === null) return;
  clearSimResults();
  const tid = layout[selectedSlot];
  tileRotation[tid] = ((tileRotation[tid] || 0) + 90) % 360;
  renderBoard();
});

document.getElementById('btnDice').addEventListener('click', ()=>{
  const adjectives = ['zwart','stil','koud','verweerd','duister','verloren','laatst','ijl'];
  const nouns = ['nova','komeet','ruim','koers','sector','baan','romp','sein'];
  const rand = () => Math.floor(Math.random()*1000);
  const seed = `${adjectives[rand()%adjectives.length]}-${nouns[rand()%nouns.length]}-${rand()%100}`;
  seedInput.value = seed;
  // direct genereren, geen extra klik op "Genereer indeling" nodig
  applyGeneratedLayout(seed);
});

// ---------- tabbladen ----------
const tabButtons = document.querySelectorAll('.tab-btn');
const tabPanels = {
  map: document.getElementById('tabMap'),
  simulate: document.getElementById('tabSimulate'),
  walk: document.getElementById('tabWalk'),
  cards: document.getElementById('tabCards'),
};
function switchTab(name){
  for (const btn of tabButtons){
    const active = btn.dataset.tab === name;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-selected', active ? 'true' : 'false');
  }
  for (const key of Object.keys(tabPanels)) tabPanels[key].hidden = key !== name;
  // het stap-voor-stap-bord staat verborgen zolang zijn tab dicht is en wordt daarom pas
  // getekend zodra je hem opent (en opnieuw, want de indeling kan intussen gewijzigd zijn)
  if (name === 'walk' && !walkRunning) renderWalkBoard();
  // de kamernaam op een opdrachtkaart hangt aan de tegel, dus bij elk openen opnieuw opbouwen
  if (name === 'cards') renderCardsTab();
}
tabButtons.forEach(btn => btn.addEventListener('click', () => switchTab(btn.dataset.tab)));
