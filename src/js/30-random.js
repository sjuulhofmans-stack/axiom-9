// ---------- seeded RNG (mulberry32) ----------
function hashSeed(str){
  let h = 1779033703 ^ str.length;
  for (let i=0;i<str.length;i++){
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return function(){
    h = Math.imul(h ^ (h>>>16), 2246822507);
    h = Math.imul(h ^ (h>>>13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }
}
function mulberry32(a){
  return function(){
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
}
function seededShuffle(arr, seedStr){
  const seedFn = hashSeed(seedStr);
  const seedInt = Math.floor(seedFn() * 4294967296);
  const rand = mulberry32(seedInt);
  const a = arr.slice();
  for (let i = a.length-1; i>0; i--){
    const j = Math.floor(rand() * (i+1));
    [a[i],a[j]] = [a[j],a[i]];
  }
  return a;
}
