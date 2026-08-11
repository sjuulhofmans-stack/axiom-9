// ---------- strakke, naadloze indeling (backtracking) ----------
// Doel: geen doodlopende doorgangen (elke open naad heeft een open naad ernaast) én alle 20 tegels bereikbaar.
const SLOT_NEIGHBORS = [];
for (let idx=0; idx<20; idx++){
  const row = Math.floor(idx/TILE_COLS), col = idx%TILE_COLS;
  const nb = [];
  if (row>0) nb.push(['N', idx-TILE_COLS]);
  if (row<TILE_ROWS-1) nb.push(['S', idx+TILE_COLS]);
  if (col>0) nb.push(['W', idx-1]);
  if (col<TILE_COLS-1) nb.push(['E', idx+1]);
  SLOT_NEIGHBORS.push(nb);
}
// meest-beperkte posities eerst: dat snoeit de zoekboom het snelst.
// Als functie, want de tegel-editor kan de regels veranderen.
function solveOrder(){
  return Array.from({length:20},(_,i)=>i)
    .sort((a,b) => ALLOWED_TILES[a].length - ALLOWED_TILES[b].length);
}

function layoutIsConnected(lay){
  const parent = Array.from({length:20},(_,i)=>i);
  function find(x){ while(parent[x]!==x){ parent[x]=parent[parent[x]]; x=parent[x]; } return x; }
  for (let s=0; s<20; s++){
    for (const [dir,n] of SLOT_NEIGHBORS[s]){
      if (n>s && OPEN_EDGES_STATIC[lay[s]][dir] && OPEN_EDGES_STATIC[lay[n]][OPPOSITE[dir]]){
        const ra=find(s), rb=find(n); if (ra!==rb) parent[ra]=rb;
      }
    }
  }
  const root = find(0);
  for (let i=1;i<20;i++) if (find(i)!==root) return false;
  return true;
}

// Eén backtracking-poging: elke naad tussen twee tegels moet kloppen (open tegen open, dicht tegen dicht),
// plus de plaatsingsregels uit ALLOWED_TILES (hoeken, starttegel altijd binnenin).
function attemptSeamlessLayout(rand, stepBudget){
  const SOLVE_ORDER = solveOrder();
  const lay = new Array(20).fill(null);
  const usedTiles = new Set();
  let steps = 0;
  function consistent(slotIdx, tid){
    for (const [dir,n] of SLOT_NEIGHBORS[slotIdx]){
      if (lay[n] !== null){
        if (OPEN_EDGES_STATIC[tid][dir] !== OPEN_EDGES_STATIC[lay[n]][OPPOSITE[dir]]) return false;
      }
    }
    return true;
  }
  function shuffled(arr){
    const a = arr.slice();
    for (let i=a.length-1; i>0; i--){ const j=Math.floor(rand()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; }
    return a;
  }
  function backtrack(i){
    steps++;
    if (steps > stepBudget) return false;
    if (i === SOLVE_ORDER.length) return true;
    const slotIdx = SOLVE_ORDER[i];
    const candidates = ALLOWED_TILES[slotIdx].filter(t => !usedTiles.has(t));
    for (const tid of shuffled(candidates)){
      if (consistent(slotIdx, tid)){
        lay[slotIdx] = tid; usedTiles.add(tid);
        if (backtrack(i+1)) return true;
        lay[slotIdx] = null; usedTiles.delete(tid);
      }
    }
    return false;
  }
  return backtrack(0) ? lay : null;
}

// ---------- wurgpunten: kamers die maar via 1 tegel-overgang met de rest verbonden zijn ----------
// Elke naad kan lokaal kloppen (open tegen open) en alles kan bereikbaar zijn, en toch kan een
// hele kamer(cluster) via precies één tegel-overgang aan de rest hangen — een brug in de
// tegel-graaf. Dan moet je, om ergens anders te komen, exact hetzelfde stuk twee keer lopen.
// Standaard brug-detectie (Tarjan) op de tegel-graaf (20 knopen, kleine graaf, dus goedkoop).
//
// Let op: tegel 5 (Beveiliging) heeft in de brondata maar 1 deur (openDegree===1), dus die
// tegel IS altijd een doodlopend eindpunt, in élke geldige indeling — dat is dus geen bug in
// deze score, maar een eigenschap van die tegelvorm. roomsBehindBridges() is met de huidige
// tegelset dus nooit 0, hooguit 1 (alleen tegel 5). De generator kiest wel de kandidaat die
// het dichtst bij die ondergrens komt, in plaats van willekeurig 2 of 3 kamers te laten vastlopen.
// welke tegelposities zijn onderling verbonden via een open naad (rotatie-bewust, dus ook
// bruikbaar nadat applyRandomBoardFlip alles 180° gedraaid heeft)
function tileAdjacency(lay){
  const adj = Array.from({length:20}, () => []);
  for (let idx=0; idx<20; idx++){
    const row = Math.floor(idx/TILE_COLS), col = idx%TILE_COLS;
    const checks = [];
    if (col < TILE_COLS-1) checks.push(['E', idx+1]);
    if (row < TILE_ROWS-1) checks.push(['S', idx+TILE_COLS]);
    for (const [dir, nIdx] of checks){
      if (effectiveOpenEdge(lay[idx], dir) && effectiveOpenEdge(lay[nIdx], OPPOSITE[dir])){
        adj[idx].push(nIdx); adj[nIdx].push(idx);
      }
    }
  }
  return adj;
}

function findTileBridges(lay){
  const adj = tileAdjacency(lay);
  const disc = new Array(20).fill(-1), low = new Array(20).fill(-1);
  const bridges = [];
  let timer = 0;
  function dfs(u, parent){
    disc[u] = low[u] = timer++;
    for (const v of adj[u]){
      if (v === parent) continue; // simpele graaf: hoogstens 1 verbinding tussen twee tegels
      if (disc[v] === -1){
        dfs(v, u);
        low[u] = Math.min(low[u], low[v]);
        if (low[v] > disc[u]) bridges.push([u, v]);
      } else {
        low[u] = Math.min(low[u], disc[v]);
      }
    }
  }
  dfs(0, -1);
  return { adj, bridges };
}

// hoeveel UNIEKE kamers zitten er achter minstens 1 brug (dus alleen bereikbaar via terugtrekken)
function roomsBehindBridges(lay){
  const { adj, bridges } = findTileBridges(lay);
  if (!bridges.length) return 0;
  const trapped = new Set();
  for (const [u, v] of bridges){
    // component aan de v-kant zonder de brug u-v
    const seen = new Set([v]);
    const stack = [v];
    while (stack.length){
      const x = stack.pop();
      for (const y of adj[x]){
        if ((x === v && y === u) || (x === u && y === v)) continue;
        if (!seen.has(y)){ seen.add(y); stack.push(y); }
      }
    }
    const smaller = seen.size * 2 <= 20 ? seen : new Set(Array.from({length:20},(_,i)=>i).filter(i => !seen.has(i)));
    for (const s of smaller) if (ROOM_NAMES[lay[s]]) trapped.add(s);
  }
  return trapped.size;
}

// ---------- kwaliteit van een indeling: spreiding van kamers + eerlijkheid vanaf elke start ----------
// Werkt op de ONGEDRAAIDE brondata (net als de rest van de generator); een puntspiegeling
// achteraf verandert onderlinge afstanden niet, dus scoren vóór applyRandomBoardFlip is prima.
//
// Let op over minDist: tegel 1 staat altijd op een "even" hoek (A) en tegel 16 altijd op een
// "oneven" hoek (P) (schaakbordkleur van de slotpositie, (rij+kolom)%2). Twee gangtegels op
// verschillende kleuren betekent dat de 10 kamers NOOIT allebei op één kleur kunnen zitten —
// en dus staat er altijd minstens één kamerpaar naast elkaar. Met de huidige tegelset is
// minDist dus wiskundig altijd 1; hij blijft toch als eerste criterium staan omdat dat verandert
// zodra iemand via de tegel-editor de deuren van tegel 1/16 anders tekent.
function slotRC(idx){ return [Math.floor(idx/TILE_COLS), idx % TILE_COLS]; }

// hoe verder kamertegels onderling uit elkaar liggen (in tegel-stappen), hoe minder ze klonteren
function roomSpreadScore(lay){
  const rooms = [];
  for (let s=0; s<20; s++) if (ROOM_NAMES[lay[s]]) rooms.push(s);
  let minDist = Infinity, sumDist = 0, pairs = 0;
  for (let i=0; i<rooms.length; i++){
    const [r1,c1] = slotRC(rooms[i]);
    for (let j=i+1; j<rooms.length; j++){
      const [r2,c2] = slotRC(rooms[j]);
      const d = Math.abs(r1-r2) + Math.abs(c1-c2);
      if (d < minDist) minDist = d;
      sumDist += d; pairs++;
    }
  }
  return { minDist, avgDist: pairs ? sumDist/pairs : 0 };
}

// standaarddeviatie van "gemiddelde loopafstand tot elke kamer" over de 4 startvakjes (3.1-3.4):
// laag = elke startpositie heeft ongeveer evenveel te lopen naar de kamers, dus eerlijker.
//
// Let op: gebruikt getDisplayValue() (respecteert tileRotation), niet de ruwe tileLookup-data
// direct. Nodig omdat applyRandomBoardFlip() bij een muntworp ALLE tegels 180° draait — zonder
// getDisplayValue zou deze score, aangeroepen ná die worp (zoals de kwaliteitsmelding in
// 80-controls.js doet), een spookbord meten dat niet is wat er echt op het scherm staat. Tijdens
// het kandidaten-vergelijken in compareLayoutQuality staat tileRotation nog overal op 0, dus
// daar verandert dit niets aan het gedrag — alleen de score ná de flip klopt nu ook.
function startBalanceScore(lay){
  const H = TILE_ROWS*TILE_H, W = TILE_COLS*TILE_W;
  function cellValue(R, C){
    const slotIdx = Math.floor(R/TILE_H)*TILE_COLS + Math.floor(C/TILE_W);
    return getDisplayValue(lay[slotIdx], R%TILE_H, C%TILE_W);
  }
  const starts = [];
  const roomSlots = [];
  for (let s=0; s<20; s++) if (ROOM_NAMES[lay[s]]) roomSlots.push(s);
  for (let R=0; R<H; R++) for (let C=0; C<W; C++){
    const v = cellValue(R,C);
    if (typeof v === 'string' && v.startsWith('3.')) starts.push([R,C]);
  }
  if (starts.length !== 4 || !roomSlots.length) return 0; // niets te meten, geen straf

  const roomCells = roomSlots.map(slotIdx => {
    const [row,col] = slotRC(slotIdx);
    const cells = [];
    for (let dr=0; dr<TILE_H; dr++) for (let dc=0; dc<TILE_W; dc++){
      if (getDisplayValue(lay[slotIdx], dr, dc) !== undefined) cells.push([row*TILE_H+dr, col*TILE_W+dc]);
    }
    return cells;
  });

  function bfsDist(sr, sc){
    const dist = new Int32Array(H*W).fill(-1);
    dist[sr*W+sc] = 0;
    const queue = [[sr,sc]];
    for (let qi=0; qi<queue.length; qi++){
      const [R,C] = queue[qi];
      const d = dist[R*W+C];
      for (const [dR,dC] of [[-1,0],[1,0],[0,-1],[0,1]]){
        const nR=R+dR, nC=C+dC;
        if (nR<0||nR>=H||nC<0||nC>=W) continue;
        if (dist[nR*W+nC] !== -1) continue;
        if (cellValue(nR,nC) === undefined) continue;
        dist[nR*W+nC] = d+1;
        queue.push([nR,nC]);
      }
    }
    return dist;
  }

  const avgPerStart = starts.map(([sr,sc]) => {
    const dist = bfsDist(sr,sc);
    let total = 0, counted = 0;
    for (const cells of roomCells){
      let best = Infinity;
      for (const [R,C] of cells){ const d = dist[R*W+C]; if (d>=0 && d<best) best = d; }
      if (best !== Infinity){ total += best; counted++; }
    }
    return counted ? total/counted : 0;
  });
  const mean = avgPerStart.reduce((a,b)=>a+b,0) / avgPerStart.length;
  const variance = avgPerStart.reduce((a,b)=>a+(b-mean)**2,0) / avgPerStart.length;
  return Math.sqrt(variance);
}

// hoe ver het verste loopbare vakje van de dichtstbijzijnde OPDRACHT ligt (multi-bron BFS
// vanaf alle 2.x-vakjes tegelijk). Kamers spreiden (roomSpreadScore) is niet hetzelfde: tegel 8
// (Hibernatie) heeft bewust geen opdracht, dus goed gespreide kamers garanderen geen goed
// gespreide opdrachten. Een hoge maxDist is precies de "lus zonder opdracht waar nooit iemand
// komt" die de simulatie-heatmap laat zien — en dit blijft kloppen ongeacht welke/hoeveel
// tegels op dat moment een opdrachtvakje dragen.
// (zelfde getDisplayValue-kanttekening als bij startBalanceScore hierboven — anders klopt de
// score niet meer zodra applyRandomBoardFlip() de tegels 180° gedraaid heeft.)
function questCoverageScore(lay){
  const H = TILE_ROWS*TILE_H, W = TILE_COLS*TILE_W;
  function cellValue(R, C){
    const slotIdx = Math.floor(R/TILE_H)*TILE_COLS + Math.floor(C/TILE_W);
    return getDisplayValue(lay[slotIdx], R%TILE_H, C%TILE_W);
  }
  const dist = new Int32Array(H*W).fill(-1);
  const queue = [];
  for (let R=0; R<H; R++) for (let C=0; C<W; C++){
    const v = cellValue(R,C);
    if (typeof v === 'string' && v.startsWith('2.')){ dist[R*W+C] = 0; queue.push([R,C]); }
  }
  if (!queue.length) return { maxDist: 0, avgDist: 0 };
  for (let qi=0; qi<queue.length; qi++){
    const [R,C] = queue[qi];
    const d = dist[R*W+C];
    for (const [dR,dC] of [[-1,0],[1,0],[0,-1],[0,1]]){
      const nR=R+dR, nC=C+dC;
      if (nR<0||nR>=H||nC<0||nC>=W) continue;
      if (dist[nR*W+nC] !== -1) continue;
      if (cellValue(nR,nC) === undefined) continue;
      dist[nR*W+nC] = d+1;
      queue.push([nR,nC]);
    }
  }
  let maxDist = 0, sum = 0, counted = 0;
  for (let R=0; R<H; R++) for (let C=0; C<W; C++){
    const d = dist[R*W+C];
    if (d < 0) continue;
    if (d > maxDist) maxDist = d;
    sum += d; counted++;
  }
  return { maxDist, avgDist: counted ? sum/counted : 0 };
}

// ---------- dode tegels: waar komt letterlijk niemand ----------
// questCoverageScore (afstand tot de dichtstbijzijnde opdracht) blijkt hiervoor NIET te volstaan:
// een tegel kan 5 stappen van een opdracht liggen en toch nooit betreden worden, omdat spelers
// alleen van opdracht naar opdracht reizen en die tegel op geen enkele route ligt. Dat is precies
// de buitenrand-"lus" waar in de simulatie 0 bezoeken vielen.
//
// Wat wel werkt: markeer elk vakje dat op een KORTSTE pad tussen twee interessante vakjes
// (opdrachten 2.x + startposities 3.x) ligt — d(i,cel) + d(cel,j) === d(i,j). Een tegel zonder
// enig zo'n vakje wordt door een speler die naar zijn doel loopt nooit aangedaan. Gevalideerd
// tegen de simulatie: deze test wees exact de 5 tegels aan die 0-17 bezoeken kregen terwijl de
// rest er 4000+ had.
//
// Kosten: ~13 bronnen x BFS(530 vakjes) + 78 paren x 1280 vakjes ~ 100k bewerkingen per
// kandidaat; met 6 kandidaten niet merkbaar op de knop.
function deadTileCount(lay){
  const H = TILE_ROWS*TILE_H, W = TILE_COLS*TILE_W;
  function cellValue(R, C){
    const slotIdx = Math.floor(R/TILE_H)*TILE_COLS + Math.floor(C/TILE_W);
    return getDisplayValue(lay[slotIdx], R%TILE_H, C%TILE_W);
  }
  const sources = [];
  for (let R=0; R<H; R++) for (let C=0; C<W; C++){
    if (typeof cellValue(R,C) === 'string') sources.push(R*W+C);
  }
  if (sources.length < 2) return 0;

  const dists = sources.map(src => {
    const d = new Int32Array(H*W).fill(-1);
    d[src] = 0;
    const queue = [src];
    for (let qi=0; qi<queue.length; qi++){
      const k = queue[qi], R = Math.floor(k/W), C = k%W;
      for (const [dR,dC] of [[-1,0],[1,0],[0,-1],[0,1]]){
        const nR=R+dR, nC=C+dC;
        if (nR<0||nR>=H||nC<0||nC>=W) continue;
        const nk = nR*W+nC;
        if (d[nk] !== -1 || cellValue(nR,nC) === undefined) continue;
        d[nk] = d[k]+1;
        queue.push(nk);
      }
    }
    return d;
  });

  const onPath = new Uint8Array(H*W);
  for (let i=0; i<sources.length; i++){
    for (let j=i+1; j<sources.length; j++){
      const dij = dists[i][sources[j]];
      if (dij < 0) continue;
      const di = dists[i], dj = dists[j];
      for (let k=0; k<H*W; k++){
        if (onPath[k] || di[k] < 0 || dj[k] < 0) continue;
        if (di[k] + dj[k] === dij) onPath[k] = 1;
      }
    }
  }

  const cellsPerSlot = new Array(20).fill(0), onPathPerSlot = new Array(20).fill(0);
  for (let R=0; R<H; R++) for (let C=0; C<W; C++){
    if (cellValue(R,C) === undefined) continue;
    const slotIdx = Math.floor(R/TILE_H)*TILE_COLS + Math.floor(C/TILE_W);
    cellsPerSlot[slotIdx]++;
    if (onPath[R*W+C]) onPathPerSlot[slotIdx]++;
  }
  let dead = 0;
  for (let s=0; s<20; s++) if (cellsPerSlot[s] > 0 && onPathPerSlot[s] === 0) dead++;
  return dead;
}

// ---------- kamers onderling verbonden ----------
// "moet ik 4 gangen door voordat ik bij de volgende kamer ben?" — per kamertegel het aantal
// GANGEN dat tussen hem en de dichtstbijzijnde andere kamer ligt. Het slechtste geval telt:
// 0 = kamers grenzen direct aan elkaar, 2 = er zitten 2 gangen tussen.
function roomIsolationScore(lay){
  const adj = tileAdjacency(lay);
  const roomSlots = [];
  for (let s=0; s<20; s++) if (ROOM_NAMES[lay[s]]) roomSlots.push(s);
  if (roomSlots.length < 2) return 0;
  let worst = 0;
  for (const src of roomSlots){
    const dist = new Array(20).fill(-1);
    dist[src] = 0;
    const queue = [src];
    let found = -1;
    outer: for (let qi=0; qi<queue.length; qi++){
      for (const nb of adj[queue[qi]]){
        if (dist[nb] !== -1) continue;
        dist[nb] = dist[queue[qi]] + 1;
        if (ROOM_NAMES[lay[nb]]){ found = dist[nb]; break outer; }
        queue.push(nb);
      }
    }
    if (found < 0) found = 99; // geen andere kamer bereikbaar: maximaal straffen
    if (found - 1 > worst) worst = found - 1;
  }
  return worst;
}

// ---------- opdrachten niet tegen elkaar aan ----------
// kortste ECHTE loopafstand (in vakjes, niet in tegels) tussen twee opdrachtvakjes. Twee
// kamers mogen best naast elkaar liggen — zolang hun opdrachtvakjes maar niet op een paar
// stappen van elkaar zitten, want dan zijn ze in de praktijk één bestemming.
function questSpacingScore(lay){
  const H = TILE_ROWS*TILE_H, W = TILE_COLS*TILE_W;
  function cellValue(R, C){
    const slotIdx = Math.floor(R/TILE_H)*TILE_COLS + Math.floor(C/TILE_W);
    return getDisplayValue(lay[slotIdx], R%TILE_H, C%TILE_W);
  }
  const questCells = [];
  for (let R=0; R<H; R++) for (let C=0; C<W; C++){
    const v = cellValue(R,C);
    if (typeof v === 'string' && v.startsWith('2.')) questCells.push(R*W+C);
  }
  if (questCells.length < 2) return { minDist: 0, avgDist: 0 };
  let minDist = Infinity, sum = 0, pairs = 0;
  for (let i=0; i<questCells.length; i++){
    const dist = new Int32Array(H*W).fill(-1);
    dist[questCells[i]] = 0;
    const queue = [questCells[i]];
    for (let qi=0; qi<queue.length; qi++){
      const k = queue[qi], R = Math.floor(k/W), C = k%W;
      for (const [dR,dC] of [[-1,0],[1,0],[0,-1],[0,1]]){
        const nR=R+dR, nC=C+dC;
        if (nR<0||nR>=H||nC<0||nC>=W) continue;
        const nk = nR*W+nC;
        if (dist[nk] !== -1 || cellValue(nR,nC) === undefined) continue;
        dist[nk] = dist[k]+1;
        queue.push(nk);
      }
    }
    for (let j=i+1; j<questCells.length; j++){
      const d = dist[questCells[j]];
      if (d < 0) continue;
      if (d < minDist) minDist = d;
      sum += d; pairs++;
    }
  }
  return { minDist: minDist === Infinity ? 0 : minDist, avgDist: pairs ? sum/pairs : 0 };
}

// Rangorde, strengste eerst:
//  1. DODE tegels — het ergste wat een indeling kan hebben: een stuk bord waar letterlijk nooit
//     een speler komt.
//  2. Kamers achter een wurgpunt — vervelend om te lopen, maar wordt wél gebruikt.
//  3. roomIsolationScore — geen kamer die achter een rij gangen weggestopt zit ("4 gangen door").
//  4. questSpacingScore.minDist — opdrachten niet tegen elkaar aan (grootste minimum wint).
//     Staat NA de kamerkoppeling omdat kamers naast elkaar prima is: hun opdrachtvakjes liggen
//     dan nog steeds ~8-12 vakjes uit elkaar binnen de 8x8 tegels.
//  5-7. afstand tot een opdracht voor het verste vakje, eerlijkheid startposities, en de
//     gemiddelden als fijnproever.
function compareLayoutQuality(a, b){
  const da = deadTileCount(a), db = deadTileCount(b);
  if (da !== db) return da - db;
  const ta = roomsBehindBridges(a), tb = roomsBehindBridges(b);
  if (ta !== tb) return ta - tb;
  const ia = roomIsolationScore(a), ib = roomIsolationScore(b);
  if (ia !== ib) return ia - ib;
  const pa = questSpacingScore(a), pb = questSpacingScore(b);
  if (pa.minDist !== pb.minDist) return pb.minDist - pa.minDist;
  const qa = questCoverageScore(a), qb = questCoverageScore(b);
  if (qa.maxDist !== qb.maxDist) return qa.maxDist - qb.maxDist;
  const ba = startBalanceScore(a), bb = startBalanceScore(b);
  if (Math.abs(ba - bb) > 1e-9) return ba - bb;
  if (Math.abs(pa.avgDist - pb.avgDist) > 1e-9) return pb.avgDist - pa.avgDist;
  return roomSpreadScore(b).avgDist - roomSpreadScore(a).avgDist;
}

// Tegel 1 en 16 passen door hun vorm uitsluitend op A resp. P (zie canTileGoInSlot):
// zonder ingreep staan die hoeken dus bij elke seed op dezelfde tegel. Het bord is 4x5,
// dus geen vierkant, maar een puntspiegeling (180°) behoudt wel de vorm: A<->T en E<->P
// wisselen dan van tegel, en elke tegel draait mee 180° om alle naden geldig te houden.
function applyRandomBoardFlip(lay, flip){
  if (!flip){
    for (let tid=1; tid<=20; tid++) tileRotation[tid] = 0;
    return lay;
  }
  const flipped = new Array(20);
  for (let i=0; i<20; i++) flipped[19-i] = lay[i];
  for (let tid=1; tid<=20; tid++) tileRotation[tid] = 180;
  return flipped;
}

function constrainedShuffle(seedStr){
  const seedFn = hashSeed(seedStr);
  const seedInt = Math.floor(seedFn() * 4294967296);
  const masterRand = mulberry32(seedInt);

  // niet zomaar de EERSTE geldige indeling nemen: verzamel een stuk of wat geldige kandidaten
  // en kies daaruit de beste. Pool van 20: gemeten haalt maar ~17% van de geldige kandidaten
  // deadTileCount === 0, dus een kleine pool loopt alsnog tegen een dode buitenrand-lus aan.
  // Bij 20 zitten er gemiddeld 3-4 dode-vrije kandidaten in, zodat de vervolgcriteria
  // (kamerkoppeling, opdracht-spreiding) ook echt iets te kiezen hebben. Kosten: ~28 ms zoeken
  // per geldige kandidaat + ~7 ms scoren, dus rond de 0,7 s per klik.
  const MAX_ATTEMPTS = 80, STEP_BUDGET = 15000, CANDIDATE_POOL = 20;
  const candidates = [];
  let best = null;
  for (let attempt=0; attempt<MAX_ATTEMPTS && candidates.length<CANDIDATE_POOL; attempt++){
    const attemptSeed = Math.floor(masterRand() * 4294967296) ^ (attempt * 0x9E3779B1);
    const rand = mulberry32(attemptSeed);
    const lay = attemptSeamlessLayout(rand, STEP_BUDGET);
    if (lay){
      if (layoutIsConnected(lay)) candidates.push(lay);
      else if (!best) best = lay;
    }
  }
  let result = candidates.length
    ? candidates.reduce((a,b) => compareLayoutQuality(b,a) < 0 ? b : a)
    : best;

  if (!result){
    // fallback: regelgetrouwe verdeling zonder naadgarantie (zelden tot nooit nodig)
    function shuffleWith(arr, rand){
      const a = arr.slice();
      for (let i=a.length-1; i>0; i--){ const j=Math.floor(rand()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; }
      return a;
    }
    const fallbackRand = mulberry32(seedInt ^ 0x1234567);
    const lay = new Array(20).fill(null);
    const used = new Set();
    for (const slotIdx of solveOrder()){
      const cands = ALLOWED_TILES[slotIdx].filter(t => !used.has(t));
      const pick = shuffleWith(cands, fallbackRand)[0];
      if (pick !== undefined){ lay[slotIdx] = pick; used.add(pick); }
    }
    const leftoverTiles = Array.from({length:20},(_,i)=>i+1).filter(t => !used.has(t));
    let li = 0;
    for (let s=0; s<20; s++) if (lay[s] === null) lay[s] = leftoverTiles[li++];
    result = lay;
  }

  return applyRandomBoardFlip(result, masterRand() < 0.5);
}
