// ---------- controls ----------
function applyGeneratedLayout(seed){
  clearSimResults();
  resetRotations(); // de generator rekent met ongedraaide tegels
  layout = constrainedShuffle(seed);
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
  const qualityNote = ` Hoogstens <b>${isolation}</b> gang(en) tussen twee kamers, opdrachten minstens <b>${spacing.minDist}</b> vakjes uit elkaar, eerlijkheid startposities ±<b>${balance.toFixed(1)}</b> vakjes, verste vakje <b>${coverage.maxDist}</b> stappen van een opdracht.` + deadNote;
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
  statSeed.textContent = '—';
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
}
tabButtons.forEach(btn => btn.addEventListener('click', () => switchTab(btn.dataset.tab)));
