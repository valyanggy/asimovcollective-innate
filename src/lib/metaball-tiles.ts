import * as THREE from "three";

type Tile = { bounds: [number, number, number, number]; balls: THREE.Vector4[] };
/** Include neighboring circles outside each tile so merged contours cross tile boundaries seamlessly. */
export function partitionMetaballs(balls: THREE.Vector4[]): Tile[] {
  if (!balls.length) return [];
  const left = Math.min(...balls.map(b => b.x - b.w)) - .04;
  const right = Math.max(...balls.map(b => b.x + b.w)) + .04;
  const bottom = Math.min(...balls.map(b => b.y - b.w)) - .04;
  const top = Math.max(...balls.map(b => b.y + b.w)) + .04;
  const tiles: Tile[] = [];
  function split(bounds: Tile['bounds'], candidates: THREE.Vector4[]) {
    const [l,b,r,t] = bounds;
    const near = candidates.filter(p => p.x + p.w + .04 >= l && p.x - p.w - .04 <= r && p.y + p.w + .04 >= b && p.y - p.w - .04 <= t);
    if (!near.length) return;
    if (near.length <= 192) { tiles.push({ bounds, balls: near }); return; }
    if (r-l >= t-b) { const m=(l+r)/2;split([l,b,m,t],near);split([m,b,r,t],near); }
    else { const m=(b+t)/2;split([l,b,r,m],near);split([l,m,r,t],near); }
  }
  split([left,bottom,right,top],balls);
  return tiles;
}

