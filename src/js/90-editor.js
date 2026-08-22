// ---------- tegel-editor ----------
const editorOverlay = document.getElementById('editorOverlay');
const editorGrid = document.getElementById('editorGrid');
const editorTitle = document.getElementById('editorTitle');
const labelField = document.getElementById('labelField');
const labelSelect = document.getElementById('labelSelect');
const editorClose = document.getElementById('editorClose');
const editorChecklist = document.getElementById('editorChecklist');
const toolQuest = document.getElementById('toolQuest');
let editorTile = null;      // tegel-id dat open staat
let editorTool = 'walk';
let editorSnapshot = null;  // kopie om te kunnen terugdraaien
let editorDirty = false;    // is er iets gewijzigd sinds het openen van deze tegel

const DOOR_KEYS = new Set();
for (const cells of Object.values(EDGE_CELLS)) for (const [dr,dc] of cells) DOOR_KEYS.add(dr+'_'+dc);

// per deurvakje het vakje er direct achter (naar binnen toe) — hoort bij de regel dat een
// doorgang niet meteen op een muur mag uitkomen
const DOOR_INWARD = new Map();
for (const [dir, cells] of Object.entries(EDGE_CELLS)){
  for (const [dr,dc] of cells){
    let idr = dr, idc = dc;
    if (dir === 'N') idr = dr+1;
    else if (dir === 'S') idr = dr-1;
    else if (dir === 'W') idc = dc+1;
    else idc = dc-1;
    DOOR_INWARD.set(dr+'_'+dc, idr+'_'+idc);
  }
}
const DOOR_INWARD_VALUES = new Set(DOOR_INWARD.values());
// per zijde: de 4 vakjes die samen een geldige doorgang vormen (2 deurvakjes + de 2 vakjes
// erachter). Loopbaar tekenen op één van deze 4 vult automatisch de andere 3 aan, zodat een
// doorgang nooit half getekend kan raken.
const DOOR_GROUP_CELLS = {};
for (const cells of Object.values(EDGE_CELLS)){
  const group = [];
  for (const [dr,dc] of cells){
    group.push(dr+'_'+dc);
    group.push(DOOR_INWARD.get(dr+'_'+dc));
  }
  for (const key of group) DOOR_GROUP_CELLS[key] = group;
}
// per deurvakje het andere deurvakje van dezelfde zijde — wissen van 1 wist automatisch ook
// het andere, anders blijft er een half open doorgang staan
const DOOR_SIBLING = new Map();
for (const cells of Object.values(EDGE_CELLS)){
  const [a, b] = cells.map(([dr,dc]) => dr+'_'+dc);
  DOOR_SIBLING.set(a, b);
  DOOR_SIBLING.set(b, a);
}
const EDGE_DIR_NAMES = {N:'noord', S:'zuid', W:'west', E:'oost'};

// ---------- tegel-validatie ----------
// het hele patroon moet één aaneengesloten vlak zijn — dus ook een deurvakje mag nooit los
// van de rest van de kamer hangen, anders leidt de doorgang nergens naartoe
function tileIsConnected(tid){
  const m = tileLookup[tid];
  const keys = [...m.keys()];
  if (keys.length <= 1) return true;
  const seen = new Set([keys[0]]);
  const stack = [keys[0]];
  while (stack.length){
    const k = stack.pop();
    const [dr,dc] = k.split('_').map(Number);
    for (const [ddr,ddc] of [[-1,0],[1,0],[0,-1],[0,1]]){
      const nk = (dr+ddr)+'_'+(dc+ddc);
      if (m.has(nk) && !seen.has(nk)){ seen.add(nk); stack.push(nk); }
    }
  }
  return seen.size === keys.length;
}
// alle regels uit "Regels tegel editor.xlsx" voor 1 tegel; elk issue draagt de betrokken
// vakjes bij zodat we ze in de editor rood met een ! kunnen markeren
function tileValidationIssues(tid){
  const m = tileLookup[tid];
  const issues = [];

  for (const [dir, cells] of Object.entries(EDGE_CELLS)){
    const filled = cells.filter(([dr,dc]) => m.get(dr+'_'+dc) !== undefined).length;
    if (filled === 1){
      issues.push({ category: 'doors', cells: cells.map(([dr,dc])=>dr+'_'+dc), message: `${EDGE_DIR_NAMES[dir]}-zijde: maar 1 van de 2 deurvakjes getekend — moet allebei of geen van beide.` });
    }
  }
  for (const [doorKey, inwardKey] of DOOR_INWARD){
    if (m.has(doorKey) && !m.has(inwardKey)){
      issues.push({ category: 'doors', cells: [doorKey], message: `deurvakje moet aansluiten op het vakje erachter, anders eindigt de doorgang meteen op een muur.` });
    }
  }
  if (!tileIsConnected(tid)){
    issues.push({ category: 'connected', cells: [...m.keys()], message: `patroon is niet aaneengesloten — er hangen losse vakjes buiten de rest van de tegel.` });
  }
  if (openDegree(tid) < 2){
    issues.push({ category: 'exits', cells: [], message: `tegel moet minimaal 2 doorgangen (zijden) hebben — nu ${openDegree(tid)}.` });
  }
  const questCells = [...m.entries()].filter(([,v]) => typeof v === 'string' && v.startsWith('2.')).map(([k])=>k);
  if (ROOM_NAMES[tid]){
    // Hibernatie (start-tegel) is de uitzondering: die heeft geen opdrachtvakje, alleen de 4 startposities.
    if (questCells.length < 1 && tid !== START_TILE){
      issues.push({ category: 'quest', cells: [], message: `kamertegel moet minimaal 1 opdrachtvakje hebben.` });
    }
    if (questCells.length > 1){
      issues.push({ category: 'quest', cells: questCells, message: `maximaal 1 opdrachtvakje per tegel toegestaan (nu ${questCells.length}).` });
    }
  } else if (questCells.length > 0){
    issues.push({ category: 'quest', cells: questCells, message: `gangtegels mogen geen opdrachtvakje hebben.` });
  }
  for (const k of questCells){
    if (DOOR_KEYS.has(k) || DOOR_INWARD_VALUES.has(k)){
      issues.push({ category: 'quest', cells: [k], message: `opdrachtvakje mag niet op een deurvakje of het vakje direct erachter staan.` });
    }
  }
  return issues;
}
// vertaalt de losse issues naar 4 brede checklist-punten voor de tegel-editor
function tileChecklistItems(tid){
  const issues = tileValidationIssues(tid);
  const has = (cat) => issues.some(i => i.category === cat);
  const isRoom = !!ROOM_NAMES[tid];
  return [
    { label: 'Minimaal 2 doorgangen', ok: !has('exits') },
    { label: 'Doorgangen kloppen (geen halve deuren)', ok: !has('doors') },
    { label: 'Alle vakjes met elkaar verbonden', ok: !has('connected') },
    ...(isRoom ? [{ label: '1 opdrachtvakje', ok: !has('quest') }] : []),
  ];
}
// welke 2.x / 3.x labels zijn nog vrij (buiten deze tegel)
function labelsInUse(exceptTile){
  const used = new Set();
  for (let tid=1; tid<=20; tid++){
    if (tid === exceptTile) continue;
    for (const v of tileLookup[tid].values()) if (typeof v === 'string') used.add(v);
  }
  return used;
}
function refreshLabelOptions(){
  const wantQuest = editorTool === 'quest';
  labelField.hidden = !wantQuest;
  if (labelField.hidden) return;
  const used = labelsInUse(editorTile);
  const opts = [];
  for (let i=1; i<=9; i++) opts.push('2.'+i);
  labelSelect.innerHTML = opts.map(o =>
    `<option value="${o}"${used.has(o) ? ' data-used="1"' : ''}>${o}${used.has(o) ? ' (al in gebruik)' : ''}</option>`
  ).join('');
  const free = opts.find(o => !used.has(o));
  if (free) labelSelect.value = free;
}

function updateCloseButtonLabel(){
  editorClose.textContent = editorDirty ? 'Opslaan en sluiten' : 'Sluiten ✕';
}

// tegel Hibernatie (#8) bevat de 4 vaste startposities en mag niet bewerkt worden
function openTileEditor(tid){
  if (tid === START_TILE) return;
  editorTile = tid;
  editorSnapshot = new Map(tileLookup[tid]);
  editorDirty = false;
  const name = ROOM_NAMES[tid] ? ROOM_NAMES[tid] : 'Gang';
  editorTitle.textContent = `Tegel #${tid} — ${name}`;
  // gangen mogen geen opdrachtvakjes hebben: dat gereedschap is daar niet beschikbaar
  const isRoom = !!ROOM_NAMES[tid];
  toolQuest.hidden = !isRoom;
  if (!isRoom && editorTool === 'quest'){
    document.querySelectorAll('#toolList .tool').forEach(b => b.classList.remove('active'));
    document.querySelector('#toolList .tool[data-tool="walk"]').classList.add('active');
    editorTool = 'walk';
  }
  editorOverlay.hidden = false;
  updateCloseButtonLabel();
  refreshLabelOptions();
  drawEditorGrid();
}
// sluit alleen als de tegel geldig is — anders blijft hij open met de rode vakjes zichtbaar,
// zodat je nooit per ongeluk een kapotte tegel achterlaat
function attemptCloseTileEditor(){
  if (editorTile === null) return;
  const issues = tileValidationIssues(editorTile);
  if (issues.length){
    drawEditorGrid();
    const lines = issues.map(i => '• ' + i.message);
    swapHint.innerHTML = `<span style="color:var(--danger)">Tegel #${editorTile} kan nog niet gesloten worden (hover over een rood vakje voor uitleg), of gebruik "Wijzigingen terugdraaien":<br>${lines.join('<br>')}</span>`;
    return;
  }
  editorOverlay.hidden = true;
  editorTile = null;
}

function drawEditorGrid(){
  const m = tileLookup[editorTile];
  const issues = tileValidationIssues(editorTile);
  const errCells = new Map(); // vakje-sleutel -> samengevoegde foutmelding(en)
  for (const issue of issues) for (const k of issue.cells){
    errCells.set(k, errCells.has(k) ? errCells.get(k) + ' / ' + issue.message : issue.message);
  }
  editorGrid.innerHTML = '';
  for (let dr=0; dr<TILE_H; dr++){
    for (let dc=0; dc<TILE_W; dc++){
      const key = dr+'_'+dc;
      const val = m.get(key);
      const cell = document.createElement('div');
      let cls = 'ed-cell';
      const type = cellType(val);
      if (type) cls += ' ' + type;
      if (DOOR_KEYS.has(key)) cls += ' door';
      if (!patternSet.has(key)) cls += ' outside-pattern';
      if (errCells.has(key)) cls += ' err';
      cell.className = cls;
      cell.dataset.key = key;
      if (typeof val === 'string'){
        const lab = document.createElement('span');
        lab.className = 'lab';
        lab.textContent = val;
        cell.appendChild(lab);
      }
      if (errCells.has(key)){
        cell.title = errCells.get(key);
        const mark = document.createElement('span');
        mark.className = 'err-mark';
        mark.textContent = '!';
        cell.appendChild(mark);
      }
      cell.addEventListener('click', (e)=>{ e.preventDefault(); paintCell(key); });
      editorGrid.appendChild(cell);
    }
  }
  editorChecklist.innerHTML = tileChecklistItems(editorTile).map(it =>
    `<li class="${it.ok ? 'ok' : 'bad'}"><span class="check">${it.ok ? '✓' : ''}</span>${it.label}</li>`
  ).join('');
}

function paintCell(key){
  // vakjes buiten de sjabloonvorm ("2") mogen nooit gevuld worden
  if (!patternSet.has(key)) return;
  const m = tileLookup[editorTile];
  if (editorTool === 'erase'){
    m.delete(key);
    // een deurvakje wissen wist ook het andere deurvakje van diezelfde zijde
    const sibling = DOOR_SIBLING.get(key);
    if (sibling) m.delete(sibling);
  } else if (editorTool === 'walk'){
    if (m.get(key) === 1){
      // al loopbaar: nogmaals klikken wist het weer, zonder van gereedschap te wisselen
      m.delete(key);
      const sibling = DOOR_SIBLING.get(key);
      if (sibling) m.delete(sibling);
    } else if (DOOR_KEYS.has(key)){
      // een deurvakje aanklikken vult meteen de hele doorgang aan (beide deurvakjes + de
      // 2 vakjes erachter) — maar andersom (op een aansluitvakje klikken) vult NIET de
      // deurvakjes aan, dat zou ongevraagd een doorgang openen
      for (const k of DOOR_GROUP_CELLS[key]) m.set(k, 1);
    } else {
      m.set(key, 1);
    }
  } else {
    // opdrachtvakjes alleen op gewone vakjes, nooit op een deurvakje of het vakje erachter
    if (DOOR_KEYS.has(key) || DOOR_INWARD_VALUES.has(key)) return;
    // het opdrachtlabel wordt over een AL LOOPBAAR vakje gelegd (of over een vakje dat al
    // opdracht is, om het label te wisselen) — nooit op een lege/onbenutte sjabloonplek.
    // Kon dat eerder wel: dan werd de tegelvorm ongemerkt uitgebreid met dat vakje, en zodra
    // je het label daarna verplaatste, viel de oude plek altijd terug op "loopbaar" (1) in
    // plaats van weer leeg — ook als hij dat origineel nooit was.
    const cur = m.get(key);
    if (cur !== 1 && !(typeof cur === 'string' && cur.startsWith('2.'))) return;
    const label = labelSelect.value;
    if (!label) return;
    // hetzelfde label mag maar één keer voorkomen op het HELE bord (niet alleen deze
    // tegel) — anders mist de simulatie straks een opdracht-/startvakje en loopt vast
    for (let tid = 1; tid <= 20; tid++){
      const mm = tileLookup[tid];
      for (const [k, v] of [...mm]) if (v === label && (tid !== editorTile || k !== key)) mm.set(k, 1);
    }
    m.set(key, label);
  }
  editorDirty = true;
  updateCloseButtonLabel();
  applyTileEdits();
  drawEditorGrid();
  refreshLabelOptions();
}

// wijzigingen doorvoeren in DATA, regels herberekenen en alles opnieuw tekenen
function applyTileEdits(){
  clearSimResults();
  DATA.tiles[String(editorTile)] = [...tileLookup[editorTile]].map(([k,v]) => {
    const [dr,dc] = k.split('_').map(Number);
    return [dr,dc,v];
  });
  recomputeTileMeta();
  renderBoard();
}

editorClose.addEventListener('click', attemptCloseTileEditor);
editorOverlay.addEventListener('pointerdown', (e)=>{ if (e.target === editorOverlay) attemptCloseTileEditor(); });
document.addEventListener('keydown', (e)=>{ if (e.key === 'Escape' && !editorOverlay.hidden) attemptCloseTileEditor(); });

document.querySelectorAll('#toolList .tool').forEach(btn => {
  btn.addEventListener('click', ()=>{
    document.querySelectorAll('#toolList .tool').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    editorTool = btn.dataset.tool;
    refreshLabelOptions();
  });
});

document.getElementById('editorRevert').addEventListener('click', ()=>{
  if (editorTile === null || !editorSnapshot) return;
  tileLookup[editorTile] = new Map(editorSnapshot);
  editorDirty = false;
  updateCloseButtonLabel();
  applyTileEdits();
  drawEditorGrid();
});

// ---------- klikbare legenda: markeringen aan/uit ----------
document.querySelectorAll('#legend .legend-row').forEach(row => {
  row.addEventListener('click', ()=>{
    const key = row.dataset.key;
    row.classList.toggle('off');
    boardEl.classList.toggle('hide-'+key);
  });
});

renderBoard();


