import assert from "node:assert/strict";
import test from "node:test";
import { BAYER_8, ditherHit, figureInkDensity, loadStampFile, occupancyAt } from "../src/lib/dither-cells";

test("full occupancy stamps every Bayer cell and empty occupancy stamps none", () => {
  for (let row = 0; row < 8; row++) for (let column = 0; column < 8; column++) {
    assert.equal(ditherHit(1, column, row), true);
    assert.equal(ditherHit(0, column, row), false);
  }
});

test("mid occupancy follows the Bayer matrix", () => {
  assert.equal(ditherHit(.5, 0, 0), true);
  assert.equal(ditherHit(.5, 1, 0), BAYER_8[0][1] < .5);
  assert.equal(ditherHit(BAYER_8[3][4], 4, 3), false);
  assert.equal(ditherHit(BAYER_8[3][4] + .001, 4, 3), true);
});

test("occupancy reads the strongest liquid layer at a point", () => {
  const field = new Float32Array(9);
  field[4] = 1.08;
  const coverage = occupancyAt([{ field, width: 3, height: 3, originX: 10, originY: 20 }], 11.4, 21.4);
  assert.ok(coverage > .99);
  assert.equal(occupancyAt([{ field, width: 3, height: 3, originX: 10, originY: 20 }], 0, 0), 0);
});

test("figure ink is empty for transparent pixels and heavier for dark ink than pale fill", () => {
  assert.equal(figureInkDensity(238, 233, 255, 0), 0);
  assert.ok(figureInkDensity(43, 0, 204, 255) > figureInkDensity(238, 233, 255, 255));
});

test("LED radius follows the circle-size percent of the grid pitch", async () => {
  const { ledRadius } = await import("../src/lib/dither-cells");
  assert.ok(Math.abs(ledRadius(20, 72) - 7.2) < 1e-10);
  assert.equal(ledRadius(20, 100), 10);
  assert.equal(ledRadius(20, 0), 0.8);
});

test("LED cells light from figure alpha and keep the sampled color", async () => {
  const { figureSampleAt, ledHit } = await import("../src/lib/dither-cells");
  const colors = new Uint8ClampedArray([238, 233, 255, 255, 43, 0, 204, 255, 0, 0, 0, 0, 43, 0, 204, 80]);
  const layer = { field: new Float32Array(4), width: 2, height: 2, originX: 0, originY: 0, colors };
  assert.deepEqual(figureSampleAt(layer, 0, 0), { r: 238, g: 233, b: 255, a: 255 });
  assert.deepEqual(figureSampleAt(layer, 1, 0), { r: 43, g: 0, b: 204, a: 255 });
  assert.equal(ledHit(figureSampleAt(layer, 0, 0), 0, 0), true);
  assert.equal(ledHit(figureSampleAt(layer, 0, 1), 0, 1), false);
  assert.equal(figureSampleAt({ field: new Float32Array(1), width: 1, height: 1, originX: 0, originY: 0 }, 0, 0).a, 0);
});

test("stamp uploads reject files that are not SVG or PNG", async () => {
  await assert.rejects(loadStampFile(new File(["nope"], "notes.txt", { type: "text/plain" })), /SVG or PNG/);
});

test("raw domain densities merge before dithering and adhesion controls the neck", async () => {
  const { DITHER_FIELD_DEFAULTS } = await import('../src/lib/dither-cells');
  const layer = { field: new Float32Array([.55]), width: 1, height: 1, originX: 0, originY: 0 };
  const separate = occupancyAt([layer, layer],0,0,{...DITHER_FIELD_DEFAULTS,adhesion:0});
  const merged = occupancyAt([layer, layer],0,0,DITHER_FIELD_DEFAULTS);
  assert.ok(separate<.1);
  assert.ok(merged>.99);
  assert.equal(occupancyAt([layer],0,0,{...DITHER_FIELD_DEFAULTS,adhesion:2}),occupancyAt([layer],0,0,{...DITHER_FIELD_DEFAULTS,adhesion:0}));
});

test("shadow area expands coverage without flooding empty space", async () => {
  const { DITHER_FIELD_DEFAULTS } = await import('../src/lib/dither-cells');
  const layer = { field:new Float32Array([.5,.75,1,1.25]), width:4,height:1,originX:0,originY:0 };
  for(let x=0;x<4;x++)assert.ok(occupancyAt([layer],x,0,{...DITHER_FIELD_DEFAULTS,shadow:1.6})>=occupancyAt([layer],x,0,{...DITHER_FIELD_DEFAULTS,shadow:.8}));
  for(const contrast of [.5,1,3])assert.equal(occupancyAt([],0,0,{...DITHER_FIELD_DEFAULTS,shadow:2,contrast}),0);
});

test('tonal dithering mixes neighboring blocks with the requested proportion', async()=>{
 const {toneCellIndex,DEFAULT_TONE_CELLS}=await import('../src/lib/dither-cells');
 const levels=DEFAULT_TONE_CELLS.map(cell=>cell.level);
 for(let i=0;i<levels.length;i++)for(let row=0;row<8;row++)for(let col=0;col<8;col++)assert.equal(toneCellIndex(levels[i],col,row,levels),i);
 let darker=0;
 for(let row=0;row<8;row++)for(let col=0;col<8;col++){
  const choice=toneCellIndex((levels[2]+levels[3])/2,col,row,levels);
  assert.ok(choice===2||choice===3);darker+=Number(choice===3);
 }
 assert.equal(darker,32);
});

test('density depth and light direction create shades inside occupied regions',async()=>{
 const {shadedToneAt,DITHER_FIELD_DEFAULTS}=await import('../src/lib/dither-cells');
 const field=new Float32Array(13*7);
 for(let y=0;y<7;y++)for(let x=0;x<13;x++)field[y*13+x]=.3+x*.35;
 const layers=[{field,width:13,height:7,originX:0,originY:0}];
 const settings={...DITHER_FIELD_DEFAULTS,spacing:2};
 const left=shadedToneAt(layers,6,3,{...settings,lightAngle:0});
 const right=shadedToneAt(layers,6,3,{...settings,lightAngle:180});
 assert.ok(Math.abs(left-right)>.05);
 assert.notEqual(shadedToneAt(layers,5,3,settings),shadedToneAt(layers,10,3,settings));
 assert.equal(shadedToneAt([],5,3,settings),0);
});

test('coarse density sampling uses world coordinates at high reach',async()=>{
 const {ditherDensity}=await import('../src/lib/dither-density');
 const {densityAt}=await import('../src/lib/dither-cells');
 const canvas={} as HTMLCanvasElement;
 const box={left:100,top:100,right:260,bottom:160};
 const layer=ditherDensity(canvas,0,[box],{x:100,y:100},[],0,2.2*6,24);
 assert.ok(layer.width<=322&&layer.height<=322);
 assert.ok(densityAt([layer],170,130,1)>1);
 assert.equal(densityAt([layer],-5000,-5000,1),0);
 const moved=ditherDensity(canvas,0,[{left:200,top:150,right:360,bottom:210}],{x:200,y:150},[],0,2.2*6,24);
 assert.equal(densityAt([layer],170,130,1),densityAt([moved],270,180,1));
 assert.ok(Array.from(layer.field).every(Number.isFinite));
});
