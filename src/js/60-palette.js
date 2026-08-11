// ---------- palette ----------
function renderPalette(){
  const roomsEl = document.getElementById('paletteRooms');
  const corrEl  = document.getElementById('paletteCorridors');
  roomsEl.innerHTML = ''; corrEl.innerHTML = '';
  const roomTiles = [], corridorTiles = [];
  for (let t=1; t<=20; t++) (ROOM_NAMES[t] ? roomTiles : corridorTiles).push(t);
  document.getElementById('countRooms').textContent = '(' + roomTiles.length + ')';
  document.getElementById('countCorridors').textContent = '(' + corridorTiles.length + ')';
  for (const tid of [...roomTiles, ...corridorTiles]){
    const slotIdx = layout.indexOf(tid);
    const card = document.createElement('div');
    card.className = 'tile-thumb' + (selectedSlot===slotIdx || highlightTile===tid ? ' active' : '');
    const badge = isCornerTile(tid) ? ' 🔒' : (tid===START_TILE ? ' ★' : '');
    const roomName = ROOM_NAMES[tid];
    card.innerHTML = `<div class="id"><span>#${tid}${badge}</span><b>${letterForSlot(slotIdx)}</b></div>` +
      `<div class="room-tag ${roomName ? 'room' : 'corridor'}">${roomName || ('Gang ' + tid)}</div>`;
    const editBtn = document.createElement('button');
    editBtn.className = 'edit-btn';
    editBtn.type = 'button';
    if (tid === START_TILE){
      editBtn.disabled = true;
      editBtn.title = 'Hibernatie bevat de 4 vaste startposities en kan niet bewerkt worden';
    } else {
      editBtn.title = 'Tegel bewerken';
      editBtn.addEventListener('click', (e)=>{ e.stopPropagation(); openTileEditor(tid); });
      editBtn.addEventListener('pointerdown', (e)=> e.stopPropagation());
    }
    editBtn.textContent = '✎';
    card.appendChild(editBtn);
    const g = document.createElement('div');
    g.className = 'thumb-grid';
    for (let dr=0; dr<TILE_H; dr++){
      for (let dc=0; dc<TILE_W; dc++){
        const cell = document.createElement('div');
        const val = getDisplayValue(tid, dr, dc);
        const type = cellType(val);
        if (type) cell.className = 'thumb-cell ' + type + (type === 'walk' && roomName ? ' room-tile' : '');
        else if (patternSet.has(dr+'_'+dc)) cell.className = 'thumb-cell empty-slot';
        else cell.className = 'thumb-cell';
        g.appendChild(cell);
      }
    }
    card.appendChild(g);
    card.addEventListener('click', ()=>{
      selectedSlot = (selectedSlot === slotIdx) ? null : slotIdx;
      highlightTile = null;
      renderBoard();
    });
    card.addEventListener('dblclick', (e)=>{ e.preventDefault(); openTileEditor(tid); });
    (ROOM_NAMES[tid] ? roomsEl : corrEl).appendChild(card);
  }
}

// ---------- opdrachtenregister ----------
// puur informatief: naam per opdracht + waar hij nu ligt, verandert mee met de indeling
function renderQuestRegister(){
  const el = document.getElementById('questRegister');
  if (!el) return;
  const countEl = document.getElementById('countQuests');
  if (countEl) countEl.textContent = '(' + Object.keys(QUEST_NAMES).length + ')';
  const rows = Object.keys(QUEST_NAMES).map(label => {
    const tid = findLabelTile(label);
    const slotIdx = tid !== null ? layout.indexOf(tid) : -1;
    const where = tid !== null && slotIdx !== -1
      ? `${ROOM_NAMES[tid] || ('Gang ' + tid)} · positie ${letterForSlot(slotIdx)}`
      : `<span class="bad">ontbreekt op het bord</span>`;
    return `<tr><td>${label}</td><td>${QUEST_NAMES[label]}</td><td>${where}</td></tr>`;
  }).join('');
  el.innerHTML = `<table class="sim-table quest-table"><thead><tr><th>Opdracht</th><th>Naam</th><th>Ligt in</th></tr></thead><tbody>${rows}</tbody></table>`;
}
