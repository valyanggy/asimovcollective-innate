import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Vector4 } from 'three';
import { partitionMetaballs } from '../src/lib/merging-claw';
test('fine metaball tiles retain all boundary neighbors within shader capacity', () => {
  const balls=Array.from({length:1200},(_,i)=>new Vector4((i%40)*.025,Math.floor(i/40)*.025,-9,.018));
  const tiles=partitionMetaballs(balls);
  assert.ok(tiles.length>1);
  for(const tile of tiles) {
    assert.ok(tile.balls.length<=192);
    const [l,b,r,t]=tile.bounds;
    const required=balls.filter(p=>p.x+p.w+.04>=l&&p.x-p.w-.04<=r&&p.y+p.w+.04>=b&&p.y-p.w-.04<=t);
    assert.deepEqual(tile.balls,required);
  }
  assert.ok(balls.every(p=>tiles.some(({bounds:[l,b,r,t]})=>p.x>=l&&p.x<=r&&p.y>=b&&p.y<=t)));
});
