// ---------- plaatsingsregels ----------
const START_TILE = 8;
const EDGE_CELLS = {
  N: [[0,3],[0,4]],
  S: [[7,3],[7,4]],
  W: [[3,0],[4,0]],
  E: [[3,7],[4,7]],
};
const OPPOSITE = {N:'S', S:'N', E:'W', W:'E'};

// ---------- rotatie ----------
// tileRotation houdt per tegel 0/90/180/270 bij. De generator werkt altijd met de ONGEDRAAIDE
// brondata (OPEN_EDGES_RAW) en zet alle rotaties op 0; handmatig draaien doe je daarna zelf.
const tileRotation = {};
for (let tid=1; tid<=20; tid++) tileRotation[tid] = 0;
function resetRotations(){ for (let tid=1; tid<=20; tid++) tileRotation[tid] = 0; }
function rotateCW(r, c){ return [c, 7-r]; } // 90° rechtsom binnen het 8x8 raster
function getDisplayValue(tid, dr, dc){
  const steps = ((tileRotation[tid] || 0) / 90) % 4;
  let r = dr, c = dc;
  for (let i=0; i<(4-steps)%4; i++){ const [nr,nc] = rotateCW(r,c); r = nr; c = nc; }
  return tileLookup[tid].get(r+'_'+c);
}
// open zijde volgens de HUIDIGE stand (inclusief rotatie)
function effectiveOpenEdge(tid, dir){
  return EDGE_CELLS[dir].every(([dr,dc]) => getDisplayValue(tid, dr, dc) !== undefined);
}
// open zijde volgens de ongedraaide brondata — hierop baseert de generator zich
let OPEN_EDGES_RAW = {};
let OPEN_EDGES_STATIC = OPEN_EDGES_RAW;
function recomputeOpenEdges(){
  OPEN_EDGES_RAW = {};
  for (let tid=1; tid<=20; tid++){
    const info = {};
    for (const dir of Object.keys(EDGE_CELLS)){
      info[dir] = EDGE_CELLS[dir].every(([dr,dc]) => tileLookup[tid].get(dr+'_'+dc) !== undefined);
    }
    OPEN_EDGES_RAW[tid] = info;
  }
  OPEN_EDGES_STATIC = OPEN_EDGES_RAW;
}
recomputeOpenEdges();
function openDegree(tid){ return Object.values(OPEN_EDGES_RAW[tid]).filter(Boolean).length; }
// gangkruisingen met 4 aansluitingen horen binnenin het bord (G,H,I,L,M,N)
let DEG4_TILES = [];

const CORNER_SLOTS = [0, TILE_COLS-1, (TILE_ROWS-1)*TILE_COLS, TILE_ROWS*TILE_COLS-1]; // A, E, P, T
const INNER_SLOTS = [];
for (let r=1; r<TILE_ROWS-1; r++) for (let c=1; c<TILE_COLS-1; c++) INNER_SLOTS.push(r*TILE_COLS+c); // G,H,I,L,M,N
const OTHER_SLOTS = Array.from({length:20},(_,i)=>i).filter(i => !CORNER_SLOTS.includes(i) && !INNER_SLOTS.includes(i));

// welke windrichtingen wijzen vanaf een positie het bord af
function offBoardDirs(slotIdx){
  const row = Math.floor(slotIdx/TILE_COLS), col = slotIdx % TILE_COLS;
  const dirs = [];
  if (row === 0) dirs.push('N');
  if (row === TILE_ROWS-1) dirs.push('S');
  if (col === 0) dirs.push('W');
  if (col === TILE_COLS-1) dirs.push('E');
  return dirs;
}
// de vaste combinatie van open zijden die een hoek nodig heeft (het complement van offBoardDirs)
function cornerRequiredOpen(slotIdx){
  const off = new Set(offBoardDirs(slotIdx));
  return ['N','S','E','W'].filter(d => !off.has(d));
}
// een tegel past via rotatie op ELKE hoek zodra hij precies 2 open zijden heeft die NAAST
// elkaar liggen (een L-vorm, bv. Z+O). Twee TEGENOVER elkaar liggende zijden (N+Z of W+O) vormen
// een rechte doorgang en passen nooit op een hoek, hoe je ze ook draait.
function isCornerCapable(tid){
  const o = OPEN_EDGES_RAW[tid];
  if (openDegree(tid) !== 2) return false;
  return !((o.N && o.S) || (o.E && o.W));
}
// welke rotatie (0/90/180/270) een hoek-geschikte tegel nodig heeft om op DEZE hoek te passen —
// rekent het via de bestaande effectiveOpenEdge/rotatie-logica uit i.p.v. de richtingscyclus met
// de hand af te leiden, zodat dit altijd matcht met hoe de tegel daadwerkelijk getekend wordt.
function requiredCornerRotation(tid, slotIdx){
  const target = new Set(cornerRequiredOpen(slotIdx));
  const saved = tileRotation[tid];
  for (const rot of [0, 90, 180, 270]){
    tileRotation[tid] = rot;
    const matches = ['N','S','E','W'].every(d => effectiveOpenEdge(tid, d) === target.has(d));
    if (matches){ tileRotation[tid] = saved; return rot; }
  }
  tileRotation[tid] = saved;
  return 0; // zou nooit moeten gebeuren voor een isCornerCapable-tegel
}
// zet de rotatie van de (tot 4) hoektegels in deze SPECIFIEKE indeling correct, en al het andere
// terug op 0 — puur functioneel op basis van `lay`, dus veilig om vlak vóór elke rotatie-
// afhankelijke meting opnieuw aan te roepen (zie `scored()` in 70-generator.js).
function applyCornerRotations(lay){
  resetRotations();
  for (const s of CORNER_SLOTS){
    const tid = lay[s];
    tileRotation[tid] = requiredCornerRotation(tid, s);
  }
}
// hoe een tegel/hoek-slot zich gedraagt in een bepaalde richting, VOOR DE GENERATOR-ZOEKTOCHT —
// puur op basis van tegel-ID en slotpositie, dus rotatie-onafhankelijk (geen last van welke
// globale tileRotation er toevallig op dat moment staat). Voor een hoekslot maakt het niet uit
// welke hoek-geschikte tegel er komt te liggen: elke geldige kandidaat wordt zo gedraaid dat hij
// exact cornerRequiredOpen(slotIdx) laat zien, dus dat gebruiken we hier direct.
function slotOpenDir(slotIdx, tid, dir){
  if (CORNER_SLOTS.includes(slotIdx)) return cornerRequiredOpen(slotIdx).includes(dir);
  return OPEN_EDGES_STATIC[tid][dir];
}

// 10 tegels zijn kamers, de rest zijn gangen
const ROOM_NAMES = {
  2: 'Cafetaria',
  3: 'Wapens',
  4: 'Motor 1',
  5: 'Beveiliging',
  7: 'Serverruimte',
  8: 'Hibernatie',
  14: 'Ziekenboeg',
  17: 'Kernreactor',
  18: 'Navigatie',
  20: 'Motor 2',
};

// naam per opdrachtvakje (2.1-2.9) — puur thematisch, geen invloed op de regels;
// hernoemen doe je hier net als bij ROOM_NAMES
// Nederlandse decimaalweergave. De tool is verder volledig Nederlandstalig, maar alle cijfers
// kwamen rechtstreeks uit toFixed() en dus met een punt ("24.6%", "98.6 beurten"). Gebruik deze
// helper overal waar een getal in beeld komt — NIET voor CSS-waarden (style.width e.d.), want
// daar moet de punt juist blijven staan.
function nl(x, digits = 1){
  return Number(x).toFixed(digits).replace('.', ',');
}

const QUEST_NAMES = {
  '2.1': 'Stroomstoring',
  '2.2': 'Vrachtinspectie',
  '2.3': 'Noodsignaal',
  '2.4': 'Filterwissel',
  '2.5': 'Beveiligingsronde',
  '2.6': 'Medische voorraad',
  '2.7': 'Reactorcontrole',
  '2.8': 'Navigatiekaarten',
  '2.9': 'Motorkalibratie',
};
// vindt de tegel-id waar een 2.x/3.x-label momenteel op staat (onafhankelijk van rotatie)
function findLabelTile(label){
  for (let tid = 1; tid <= 20; tid++){
    for (const v of tileLookup[tid].values()) if (v === label) return tid;
  }
  return null;
}

function letterForSlot(idx){ return String.fromCharCode(65+idx); }
function slotCategory(idx){
  if (CORNER_SLOTS.includes(idx)) return 'corner';
  if (INNER_SLOTS.includes(idx)) return 'inner';
  return 'other';
}
function canTileGoInSlot(tid, slotIdx){
  const cat = slotCategory(slotIdx);
  // op een hoek past elke hoek-geschikte (L-vormige, 2 open zijden) tegel — via rotatie kan zo'n
  // tegel op ELKE hoek terecht, dus dit hangt niet af van de tegel z'n ONGEDRAAIDE oriëntatie
  if (cat === 'corner') return isCornerCapable(tid);
  // starttegel hoort binnenin
  if (tid === START_TILE) return cat === 'inner';
  return true;
}
let ALLOWED_TILES = [];
let FORCED_TILES = new Set();
// alle afgeleide regels opnieuw berekenen (nodig nadat de tegel-editor iets heeft gewijzigd)
function recomputeTileMeta(){
  recomputeOpenEdges();
  DEG4_TILES = Array.from({length:20},(_,i)=>i+1).filter(t => openDegree(t) === 4);
  ALLOWED_TILES = [];
  for (let s=0; s<20; s++){
    ALLOWED_TILES[s] = Array.from({length:20},(_,i)=>i+1).filter(t => canTileGoInSlot(t, s));
  }
  // welke tegels ALLEEN op een hoek kunnen liggen (voor het 🔒-badge in het register) — sinds
  // hoek-geschikte tegels via rotatie op elke hoek passen, is dit niet meer "op precies 1 hoek
  // geforceerd" maar "hoek-geschikt", vandaar isCornerCapable i.p.v. ALLOWED_TILES.length===1.
  FORCED_TILES = new Set();
  for (let tid=1; tid<=20; tid++) if (isCornerCapable(tid)) FORCED_TILES.add(tid);
}
recomputeTileMeta();
function isCornerTile(tid){ return FORCED_TILES.has(tid); }

// zelfde regels, maar getoetst aan de HUIDIGE stand van de tegel (dus inclusief handmatige rotatie)
function canTileGoInSlotNow(tid, slotIdx){
  const cat = slotCategory(slotIdx);
  if (cat === 'corner'){
    for (const dir of offBoardDirs(slotIdx)) if (effectiveOpenEdge(tid, dir)) return false;
  }
  if (tid === START_TILE) return cat === 'inner';
  return true;
}

const boardEl = document.getElementById('board');
const paletteRoomsEl = document.getElementById('paletteRooms');
const paletteCorrEl  = document.getElementById('paletteCorridors');
const seedInput = document.getElementById('seedInput');
const layoutCodeEl = document.getElementById('layoutCode');
const statSeed = document.getElementById('statSeed');
const swapHint = document.getElementById('swapHint');

function cellType(v){
  if (v === 1) return 'walk';
  if (typeof v === 'string' && v.startsWith('2.')) return 'quest';
  if (typeof v === 'string' && v.startsWith('3.')) return 'start';
  return '';
}


