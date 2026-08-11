// ---------- naad-connectiviteit tussen tegels ----------
function edgeGlobalCells(slotIdx, dir){
  const row = Math.floor(slotIdx / TILE_COLS), col = slotIdx % TILE_COLS;
  return EDGE_CELLS[dir].map(([dr,dc]) => [row*TILE_H + dr, col*TILE_W + dc]);
}

// Union-Find voor verbonden-componenten check
// ---------- bereikbaarheid op VAKJESNIVEAU ----------
// Loopt over het hele bord (40x32 vakjes) en controleert of elk loopbaar vakje daadwerkelijk
// te bereiken is vanaf de startposities, met de echte bewegingsregel: alleen horizontaal/verticaal.
function analyseCellReachability(){
  const H = TILE_ROWS*TILE_H, W = TILE_COLS*TILE_W;
  const walkable = [];   // [R][C] -> true als er een loopbaar/opdracht/start vakje ligt
  for (let R=0; R<H; R++){
    walkable.push([]);
    for (let C=0; C<W; C++){
      const dr = R % TILE_H, dc = C % TILE_W;
      const slotIdx = Math.floor(R/TILE_H)*TILE_COLS + Math.floor(C/TILE_W);
      const val = getDisplayValue(layout[slotIdx], dr, dc);
      walkable[R].push(val !== undefined);
    }
  }
  // startvakjes zoeken (3.x); zonder die vallen we terug op het eerste loopbare vakje
  const seeds = [];
  for (let R=0; R<H; R++) for (let C=0; C<W; C++){
    if (!walkable[R][C]) continue;
    const dr = R % TILE_H, dc = C % TILE_W;
    const slotIdx = Math.floor(R/TILE_H)*TILE_COLS + Math.floor(C/TILE_W);
    const val = getDisplayValue(layout[slotIdx], dr, dc);
    if (typeof val === 'string' && val.startsWith('3.')) seeds.push([R,C]);
  }
  if (!seeds.length){
    outer: for (let R=0; R<H; R++) for (let C=0; C<W; C++) if (walkable[R][C]){ seeds.push([R,C]); break outer; }
  }
  // flood fill
  const seen = walkable.map(row => row.map(()=>false));
  const stack = [];
  for (const [R,C] of seeds){ if (!seen[R][C]){ seen[R][C]=true; stack.push([R,C]); } }
  while (stack.length){
    const [R,C] = stack.pop();
    for (const [dR,dC] of [[-1,0],[1,0],[0,-1],[0,1]]){
      const nR=R+dR, nC=C+dC;
      if (nR<0||nR>=H||nC<0||nC>=W) continue;
      if (!walkable[nR][nC] || seen[nR][nC]) continue;
      seen[nR][nC]=true; stack.push([nR,nC]);
    }
  }
  // onbereikbare vakjes verzamelen, en welke opdracht-/startvakjes daarbij zitten
  const unreachable = [];
  const unreachableSpecial = [];
  let total = 0;
  for (let R=0; R<H; R++) for (let C=0; C<W; C++){
    if (!walkable[R][C]) continue;
    total++;
    if (seen[R][C]) continue;
    unreachable.push([R,C]);
    const dr = R % TILE_H, dc = C % TILE_W;
    const slotIdx = Math.floor(R/TILE_H)*TILE_COLS + Math.floor(C/TILE_W);
    const val = getDisplayValue(layout[slotIdx], dr, dc);
    if (typeof val === 'string') unreachableSpecial.push(val);
  }
  // welke tegelposities bevatten onbereikbare vakjes
  const affectedSlots = new Set(unreachable.map(([R,C]) =>
    Math.floor(R/TILE_H)*TILE_COLS + Math.floor(C/TILE_W)));
  return { total, reachable: total - unreachable.length, unreachable, unreachableSpecial, affectedSlots };
}

function computeConnectivity(){
  const parent = Array.from({length:20}, (_,i)=>i);
  function find(x){ while(parent[x]!==x){ parent[x]=parent[parent[x]]; x=parent[x]; } return x; }
  function union(a,b){ const ra=find(a), rb=find(b); if(ra!==rb) parent[ra]=rb; }

  const seams = []; // {slotIdx, dir, neighborIdx, openA, openB}
  let openCount = 0, brokenCount = 0;

  for (let idx=0; idx<20; idx++){
    const row = Math.floor(idx/TILE_COLS), col = idx%TILE_COLS;
    const checks = [];
    if (col < TILE_COLS-1) checks.push(['E', idx+1]);
    if (row < TILE_ROWS-1) checks.push(['S', idx+TILE_COLS]);
    for (const [dir, nIdx] of checks){
      const tileA = layout[idx], tileB = layout[nIdx];
      const openA = effectiveOpenEdge(tileA, dir);
      const openB = effectiveOpenEdge(tileB, OPPOSITE[dir]);
      const connected = openA && openB;
      if (connected){ union(idx, nIdx); openCount++; }
      else if (openA || openB){ brokenCount++; }
      seams.push({idx, dir, nIdx, openA, openB, connected});
    }
  }

  const groups = {};
  for (let idx=0; idx<20; idx++){
    const r = find(idx);
    (groups[r] = groups[r] || []).push(layout[idx]);
  }
  return { seams, openCount, brokenCount, groups: Object.values(groups) };
}
