// ---------- contour: rechthoek rondom het volledige 8x8 tegelvlak ----------
// Elke cel op de rand van het 8x8 blok krijgt de bijbehorende zijde(n) van het kader.
const SQUARE_SIDES = new Map(); // "dr_dc" -> ['top','right','bottom','left']
for (let dr=0; dr<TILE_H; dr++){
  for (let dc=0; dc<TILE_W; dc++){
    const sides = [];
    if (dr === 0) sides.push('top');
    if (dr === TILE_H-1) sides.push('bottom');
    if (dc === 0) sides.push('left');
    if (dc === TILE_W-1) sides.push('right');
    if (sides.length) SQUARE_SIDES.set(dr+'_'+dc, sides);
  }
}
function contourShadow(sides, color, glow){
  const w = '2px';
  const parts = sides.map(s => {
    if (s === 'top')    return `inset 0 ${w} 0 0 ${color}`;
    if (s === 'bottom') return `inset 0 -${w} 0 0 ${color}`;
    if (s === 'left')   return `inset ${w} 0 0 0 ${color}`;
    return `inset -${w} 0 0 0 ${color}`;
  });
  if (glow) parts.push(glow);
  return parts.join(', ');
}
// tekent het kader van één tegelpositie in een gegeven kleur
function outlineSlot(slotIdx, color, glow){
  const slotI = Math.floor(slotIdx/TILE_COLS), slotJ = slotIdx % TILE_COLS;
  for (const [key, sides] of SQUARE_SIDES){
    const [dr, dc] = key.split('_').map(Number);
    const div = cellEls[slotI*TILE_H + dr][slotJ*TILE_W + dc];
    div.classList.add('slot-selected');
    div.style.setProperty('box-shadow', contourShadow(sides, color, glow), 'important');
  }
}

// ---------- board rendering ----------
const roomLabelEls = [];
function buildBoardSkeleton(){
  boardEl.innerHTML = '';
  roomLabelEls.length = 0;
  const cellEls = [];
  for (let R=0; R<TILE_ROWS*TILE_H; R++){
    cellEls.push([]);
    for (let C=0; C<TILE_COLS*TILE_W; C++){
      const dr = R % TILE_H, dc = C % TILE_W;
      const slotI = Math.floor(R/TILE_H), slotJ = Math.floor(C/TILE_W);
      const slotIdx = slotI*TILE_COLS + slotJ;
      const div = document.createElement('div');
      div.className = 'cell slot-hit';
      div.dataset.slot = slotIdx;
      div.dataset.dr = dr; div.dataset.dc = dc;
      div.addEventListener('pointerdown', onCellPointerDown);
      if (dc === TILE_W-1) div.classList.add('tile-edge-r');
      if (dr === TILE_H-1) div.classList.add('tile-edge-b');
      // linker-/bovenrand komt normaal van de buurtegel (diens rechter-/onderrand op dezelfde
      // pixel); alleen de buitenste rand van het hele bord heeft geen buur die dat overneemt
      if (dc === 0 && slotJ === 0) div.classList.add('tile-edge-l');
      if (dr === 0 && slotI === 0) div.classList.add('tile-edge-t');
      // letterbadge + kamernaam-overlay op de echte linkerbovenhoek van de tegel (lokaal 0,0) —
      // geen patroon-cel, dus nooit overlap met een loopbaar/opdracht/start-vakje. De overlay
      // hangt aan diezelfde cel (net als de badge) zodat hij exact over de 8x8 tegel valt en
      // meeverhuist bij een wissel, zonder losse grid-plaatsing die per browser kan afwijken.
      if (dr === 0 && dc === 0){
        const badge = document.createElement('span');
        badge.className = 'letter-badge';
        if (slotCategory(slotIdx) === 'corner') badge.classList.add('corner');
        if (slotCategory(slotIdx) === 'inner') badge.classList.add('inner');
        badge.textContent = letterForSlot(slotIdx);
        div.classList.add('has-badge');
        div.appendChild(badge);

        const roomLabel = document.createElement('span');
        roomLabel.className = 'room-label';
        div.appendChild(roomLabel);
        roomLabelEls[slotIdx] = roomLabel;
      }
      boardEl.appendChild(div);
      cellEls[R].push(div);
    }
  }
  return cellEls;
}
let cellEls = buildBoardSkeleton();

function renderBoard(){
  // reset alles, ook de niet-patroon cellen (die dragen nu het 8x8 selectiekader)
  for (let R=0; R<TILE_ROWS*TILE_H; R++){
    for (let C=0; C<TILE_COLS*TILE_W; C++){
      const div = cellEls[R][C];
      div.classList.remove('slot-selected','unreachable');
      div.style.removeProperty('box-shadow');
    }
  }
  for (let R=0; R<TILE_ROWS*TILE_H; R++){
    for (let C=0; C<TILE_COLS*TILE_W; C++){
      const dr = R % TILE_H, dc = C % TILE_W;
      const slotI = Math.floor(R/TILE_H), slotJ = Math.floor(C/TILE_W);
      const slotIdx = slotI*TILE_COLS + slotJ;
      const tileId = layout[slotIdx];
      const val = getDisplayValue(tileId, dr, dc);
      const div = cellEls[R][C];
      div.classList.remove('walk','quest','start','empty-slot','slot-hover','seam-open','seam-broken','room-tile');
      const type = cellType(val);
      if (type){
        div.classList.add(type);
        if (type === 'walk' && ROOM_NAMES[tileId]) div.classList.add('room-tile');
      }
      else if (patternSet.has(dr+'_'+dc)){ div.classList.add('empty-slot'); }
      if (highlightTile !== null && tileId === highlightTile) div.classList.add('slot-hover');
    }
  }

  // kamernaam-overlay: alleen tekst voor slots met een kamertegel erop
  for (let slotIdx=0; slotIdx<20; slotIdx++){
    const roomName = ROOM_NAMES[layout[slotIdx]];
    roomLabelEls[slotIdx].textContent = roomName || '';
  }

  // kaders: selectie (amber), sleepbron (amber, gedimd) en sleepdoel (groen = mag, rood = mag niet)
  if (selectedSlot !== null && dragState.from === null){
    outlineSlot(selectedSlot, '#ffb545', '0 0 7px rgba(255,181,69,.55)');
  }
  if (dragState.from !== null){
    outlineSlot(dragState.from, '#ffb545', '0 0 7px rgba(255,181,69,.45)');
    if (dragState.over !== null && dragState.over !== dragState.from){
      const okDrop = swapAllowed(dragState.from, dragState.over);
      outlineSlot(dragState.over,
        okDrop ? '#55d68a' : '#ff5d5d',
        okDrop ? '0 0 9px rgba(85,214,138,.6)' : '0 0 9px rgba(255,93,93,.6)');
    }
  }
  layoutCodeEl.textContent = layout.join(',');

  updateQualityHud();

  // naad-markeringen
  const conn = computeConnectivity();
  for (const seam of conn.seams){
    if (seam.connected){
      for (const [R,C] of edgeGlobalCells(seam.idx, seam.dir)) cellEls[R][C].classList.add('seam-open');
      for (const [R,C] of edgeGlobalCells(seam.nIdx, OPPOSITE[seam.dir])) cellEls[R][C].classList.add('seam-open');
    } else {
      if (seam.openA) for (const [R,C] of edgeGlobalCells(seam.idx, seam.dir)) cellEls[R][C].classList.add('seam-broken');
      if (seam.openB) for (const [R,C] of edgeGlobalCells(seam.nIdx, OPPOSITE[seam.dir])) cellEls[R][C].classList.add('seam-broken');
    }
  }

  const connStatusEl = document.getElementById('connStatus');
  const totalSeams = conn.seams.length;
  let html = '';
  if (conn.groups.length === 1){
    html += `<p class="hint" style="color:var(--start)"><b>✓ Eén aaneengesloten schip.</b> Alle 20 tegels sluiten via minstens één naad op elkaar aan.</p>`;
  } else {
    html += `<p class="hint" style="color:var(--danger)"><b>✕ Opgesplitst in ${conn.groups.length} losse secties</b> — deze groepen tegels zijn onderling niet bereikbaar:</p>`;
    html += `<div class="btn-row" style="margin:8px 0;">` + conn.groups.map((g,i)=>
      `<span class="code-box" style="padding:5px 9px;">Sectie ${i+1}: ${g.slice().sort((a,b)=>a-b).join(', ')}</span>`
    ).join('') + `</div>`;
  }
  html += `<p class="hint">Open naden: <b style="color:var(--amber)">${conn.openCount}</b> / ${totalSeams} &nbsp;·&nbsp; Doodlopende naden (deur tegen een muur): <b style="color:var(--danger)">${conn.brokenCount}</b></p>`;
  connStatusEl.innerHTML = html;

  // ---- bereikbaarheid op vakjesniveau ----
  const reach = analyseCellReachability();
  for (const [R,C] of reach.unreachable) cellEls[R][C].classList.add('unreachable');
  const reachEl = document.getElementById('reachStatus');
  if (reachEl){
    if (reach.unreachable.length === 0){
      reachEl.innerHTML = `<span class="ok">✓ Alle ${reach.total} vakjes bereikbaar</span>`;
    } else {
      const slots = [...reach.affectedSlots].sort((a,b)=>a-b).map(letterForSlot).join(', ');
      const special = reach.unreachableSpecial.length
        ? ` waaronder <b>${[...new Set(reach.unreachableSpecial)].sort().join(', ')}</b>` : '';
      reachEl.innerHTML = `<span class="bad">✕ ${reach.unreachable.length} van ${reach.total} vakjes onbereikbaar${special}</span>` +
        `<span class="sub">Afgesloten gebied op tegel ${slots} — roze omrand op het bord</span>`;
    }
  }

  renderSelectedBox();
  renderPalette();
  renderQuestRegister();
}

// vaste, altijd-zichtbare kwaliteitscijfers van de huidige indeling — apart van swapHint zodat
// de hoogte van het besturingspaneel niet meer schokt bij elke nieuwe seed (zie CLAUDE.md)
function updateQualityHud(){
  const dead = deadTileCount(layout);
  const isolation = roomIsolationScore(layout);
  const spacing = questSpacingScore(layout);
  const coverage = questCoverageScore(layout);
  const balance = startBalanceScore(layout);

  const deadEl = document.getElementById('hudDead');
  deadEl.textContent = dead === 0 ? '0' : dead;
  deadEl.classList.toggle('ok', dead === 0);
  deadEl.classList.toggle('bad', dead > 0);

  document.getElementById('hudIsolation').textContent = `${isolation} gang(en)`;
  document.getElementById('hudSpacing').textContent = `${spacing.minDist} vakjes`;
  document.getElementById('hudBalance').textContent = `±${balance.toFixed(1)} vakjes`;
  document.getElementById('hudCoverage').textContent = `${coverage.maxDist} stappen`;
}

function renderSelectedBox(){
  const box = document.getElementById('selectedBox');
  if (selectedSlot === null){
    box.innerHTML = 'Geen selectie — klik een tegel op het bord of in het register';
    const bL = document.getElementById('btnRotL'), bR = document.getElementById('btnRotR');
    if (bL) bL.disabled = true;
    if (bR) bR.disabled = true;
    return;
  }
  const tid = layout[selectedSlot];
  const locked = isCornerTile(tid);
  const roomName = ROOM_NAMES[tid];
  let tags = '';
  if (locked) tags += `<span class="tag corner">hoektegel — vast</span>`;
  if (tid === START_TILE) tags += `<span class="tag startroom">startpositie-tegel</span>`;
  const rot = tileRotation[tid] || 0;
  box.innerHTML =
    `<span class="sel-main">` +
      `<b class="sel-name ${roomName ? 'room' : 'corridor'}">${roomName || ('Gang ' + tid)}</b>` +
      `<span class="sel-sub">Tegel #${tid} · positie ${letterForSlot(selectedSlot)}${rot ? ' · ' + rot + '°' : ''}</span>` +
    `</span><span>${tags}</span>`;
  const btnL = document.getElementById('btnRotL'), btnR = document.getElementById('btnRotR');
  if (btnL) btnL.disabled = false;
  if (btnR) btnR.disabled = false;
}

function swapAllowed(slotA, slotB){
  const tileA = layout[slotA], tileB = layout[slotB];
  return canTileGoInSlotNow(tileA, slotB) && canTileGoInSlotNow(tileB, slotA);
}

function trySwap(slotA, slotB){
  const tileA = layout[slotA], tileB = layout[slotB];
  if (!swapAllowed(slotA, slotB)){
    swapHint.innerHTML = `<span style="color:var(--danger)">Kan niet verwisselen — tegel #${tileA} of #${tileB} mag daar niet liggen. Op een hoek mag geen doorgang het bord af wijzen, en de starttegel (#${START_TILE}) hoort binnenin op G/H/I/L/M/N.</span>`;
    return false;
  }
  clearSimResults();
  [layout[slotA], layout[slotB]] = [layout[slotB], layout[slotA]];
  swapHint.textContent = `Tegels ${letterForSlot(slotA)} en ${letterForSlot(slotB)} verwisseld.`;
  return true;
}
