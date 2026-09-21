import test from 'node:test';
import assert from 'node:assert/strict';
import { bridgeDistanceThreshold, morphIslands } from '../src/lib/bridge-density';

const from={left:100,top:180,right:240,bottom:320};
const to={left:760,top:210,right:880,bottom:330};

function sample(layer:NonNullable<ReturnType<typeof morphIslands>>,x:number,y:number){
  const column=Math.round((x-layer.originX)/(layer.scale??1));
  const row=Math.round((y-layer.originY)/(layer.scale??1));
  return layer.field[row*layer.width+column]??0;
}

test('morph bridge begins at its islands and joins through the midpoint',()=>{
  assert.equal(morphIslands(from,to,0,24),null);
  const early=morphIslands(from,to,.25,24,0,{end:132,waist:34});
  const joined=morphIslands(from,to,1,24,0,{end:132,waist:34});
  assert.ok(early&&joined);
  assert.ok(sample(early,240,250)>.5);
  assert.ok(sample(early,500,265)<.1);
  assert.ok(sample(joined,500,265)>.85);
});

test('completed morph bridge keeps a broad continuous cross-section',()=>{
  const layer=morphIslands(from,to,1,24,0,{end:132,waist:34});
  assert.ok(layer);
  assert.ok(sample(layer,500,265+24)>.8);
  assert.ok(sample(layer,500,265+58)<.3);
});

test('end and middle sizes define a hard maximum bridge distance',()=>{
  const narrowReach=bridgeDistanceThreshold(132,2,24);
  const broadReach=bridgeDistanceThreshold(132,34,24);
  assert.ok(narrowReach<broadReach);
  const distant={left:900,top:180,right:1040,bottom:320};
  assert.equal(morphIslands(from,distant,1,24,0,{end:132,waist:34}),null);
  assert.ok(morphIslands(from,distant,1,24,0,{end:300,waist:48}));
});

test('a two-pixel middle remains a genuinely thin bridge',()=>{
  const nearby={left:500,top:180,right:640,bottom:320};
  const thin=morphIslands(from,nearby,1,24,0,{end:132,waist:2});
  const broad=morphIslands(from,nearby,1,24,0,{end:132,waist:34});
  assert.ok(thin&&broad);
  assert.ok(sample(thin,370,270)<.3);
  assert.ok(sample(broad,370,270)>.8);
});
