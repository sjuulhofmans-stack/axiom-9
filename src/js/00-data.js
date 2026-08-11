// Tegeldata wordt door build.py uit src/data/tiles.json geinjecteerd.
const DATA = {{TILES}};

const TILE_ROWS = 4, TILE_COLS = 5, TILE_H = 8, TILE_W = 8;
const patternSet = new Set(DATA.pattern.map(([r,c]) => r+'_'+c));
const tileLookup = {}; // tileId -> Map("dr_dc" -> value)
for (const [id, cells] of Object.entries(DATA.tiles)){
  const m = new Map();
  for (const [dr,dc,v] of cells) m.set(dr+'_'+dc, v);
  tileLookup[id] = m;
}

const defaultLayout = Array.from({length:20}, (_,i)=>i+1); // slot index 0..19 -> tile id
let layout = defaultLayout.slice();
let selectedSlot = null;
let highlightTile = null;
