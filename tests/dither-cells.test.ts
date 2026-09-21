import assert from "node:assert/strict";
import test from "node:test";
import { BAYER_8, ditherHit, figureInkDensity, imageFillsSquare, loadStampFile, occupancyAt } from "../src/lib/dither-cells";

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

test("image merge splits letters into islands so adhesion can fill the gap", async () => {
  const { densityAt, imageLetterIslands, imageMergeLayersFromInk } = await import("../src/lib/dither-cells");
  const field = new Float32Array(20 * 6);
  for (let y = 1; y <= 4; y++) for (let x = 1; x <= 3; x++) field[y * 20 + x] = 1;
  for (let y = 1; y <= 4; y++) for (let x = 16; x <= 18; x++) field[y * 20 + x] = 1;
  const ink = { field, width: 20, height: 6, originX: 0, originY: 0, scale: 4 };
  assert.equal(imageLetterIslands(ink).length, 2);
  const layers = imageMergeLayersFromInk(ink, { reach: 2.4, spacing: 8 });
  assert.ok(layers.length >= 3);
  const mid = { x: 40, y: 12 };
  assert.ok(densityAt(layers, mid.x, mid.y, 4.4) > densityAt(layers, mid.x, mid.y, 0) + .05);
});

test("image dither treats paper as empty and dark ink as occupancy", async () => {
  const { imageInkDensity } = await import("../src/lib/dither-cells");
  assert.equal(imageInkDensity(255, 255, 255, 255), 0);
  assert.equal(imageInkDensity(0, 0, 0, 0), 0);
  assert.ok(imageInkDensity(0, 0, 0, 255) > .9);
  assert.ok(imageInkDensity(40, 40, 40, 255) > imageInkDensity(180, 180, 180, 255));
});

test("LED radius follows the circle-size percent of the grid pitch", async () => {
  const { ledRadius, FIGURE_LED_DEFAULTS } = await import("../src/lib/dither-cells");
  assert.equal(FIGURE_LED_DEFAULTS.ledSize, 16);
  assert.ok(Math.abs(ledRadius(20, 72) - 7.2) < 1e-10);
  assert.equal(ledRadius(20, 100), 10);
  assert.equal(ledRadius(20, 0), 0.8);
});

test("overlay punch clears page gray and keeps the white card", async () => {
  const { isOverlayPaper, punchOverlayBackdrop } = await import("../src/lib/dither-cells");
  assert.equal(isOverlayPaper(255, 255, 255), true);
  assert.equal(isOverlayPaper(230, 230, 230), false);
  const width = 5, height = 5;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let index = 0; index < data.length; index += 4) {
    data[index] = data[index + 1] = data[index + 2] = 230;
    data[index + 3] = 255;
  }
  for (let y = 1; y <= 3; y++) for (let x = 1; x <= 3; x++) {
    const index = (y * width + x) * 4;
    data[index] = data[index + 1] = data[index + 2] = 255;
  }
  punchOverlayBackdrop(data, width, height);
  assert.equal(data[3], 0);
  assert.equal(data[(2 * width + 2) * 4 + 3], 255);
  assert.equal(data[(2 * width + 2) * 4], 255);
});

test("overlay image stays centered and inside the field", async () => {
  const { overlayLayout } = await import("../src/lib/dither-cells");
  const box = overlayLayout(886, 874, 1200, 800);
  assert.ok(Math.abs(box.x + box.width / 2 - 600) < .01);
  assert.ok(Math.abs(box.y + box.height / 2 - 400) < .01);
  assert.ok(box.width <= 1200 * .308 + .01);
  assert.ok(box.height <= 800 * .476 + .01);
});

test("replaying the step sequence restarts elapsed time", async () => {
  const { stepSequenceElapsed, replayStepSequence } = await import("../src/lib/step-overlays");
  const token = {};
  assert.equal(stepSequenceElapsed(token, 100), 0);
  assert.equal(stepSequenceElapsed(token, 2100), 2000);
  replayStepSequence(token);
  assert.equal(stepSequenceElapsed(token, 2200), 0);
  assert.equal(stepSequenceElapsed(token, 0), 1e9);
});

test("step overlays appear in order and sit on their frame anchors", async () => {
  const { chatAppear, stepAppear, placedOverlayLayout, STEP_OVERLAYS } = await import("../src/lib/step-overlays");
  assert.equal(chatAppear(0), 0);
  assert.equal(chatAppear(2999), 0);
  assert.equal(chatAppear(3070), 1);
  assert.equal(stepAppear(0, 0), 0);
  assert.equal(stepAppear(4999, 0), 0);
  assert.equal(stepAppear(5070, 0), 1);
  assert.equal(stepAppear(7100, 1), 0);
  assert.equal(stepAppear(7170, 1), 1);
  assert.ok(stepAppear(9100, 2) < 1);
  assert.equal(STEP_OVERLAYS.length, 3);
  const a = placedOverlayLayout(400, 200, 1000, 800, .165, .27, .18);
  assert.ok(Math.abs(a.x + a.width / 2 - 165) < .01);
  const c = placedOverlayLayout(400, 200, 1000, 800, .73, .53, .18);
  assert.ok(c.x > 500);
  assert.ok(c.x + c.width < 920);
});

test("sequence delay, appear, and gap stagger the center then surrounding images", async () => {
  const { sequenceAppear } = await import("../src/lib/step-overlays");
  const timing = { delay: 1, appear: .4, gap: 1.2, fade: 1.6 };
  assert.equal(sequenceAppear(999, 0, timing), 0);
  assert.equal(sequenceAppear(1400, 0, timing), 1);
  assert.equal(sequenceAppear(2199, 1, timing), 0);
  assert.equal(sequenceAppear(2600, 1, timing), 1);
  assert.ok(sequenceAppear(2800, 2, timing) === 0);
});

test("a second act fades scene 1 out in reverse, faster than appear, then waits delay", async () => {
  const { sequenceSceneClock, sequenceOverlayState, SEQUENCE_DEFAULTS } = await import("../src/lib/step-overlays");
  assert.ok(SEQUENCE_DEFAULTS.fade < SEQUENCE_DEFAULTS.appear);
  const timing = { delay: 1, appear: .4, gap: 1.2, fade: .2 };
  const clock = sequenceSceneClock(timing, 3);
  assert.equal(clock.scene1End, 5);
  assert.equal(clock.transitionStart, 6.2);
  assert.ok(Math.abs(clock.scene2Start - 6.7) < 1e-9);
  const midFirst = sequenceOverlayState(2600, timing, 3, 2, true);
  assert.equal(midFirst.centerFrom, 1);
  assert.equal(midFirst.centerTo, 0);
  assert.equal(midFirst.first[0].appear, 1);
  assert.equal(midFirst.second[0].appear, 0);
  const fading = sequenceOverlayState(6300, timing, 3, 2, true);
  assert.equal(fading.centerFrom, 1);
  assert.equal(fading.first[0].appear, 1);
  assert.ok(fading.first[2].appear > 0 && fading.first[2].appear < 1);
  const later = sequenceOverlayState(6450, timing, 3, 2, true);
  assert.equal(later.centerFrom, 1);
  assert.ok(later.first[1].appear > 0 && later.first[1].appear < 1);
  assert.equal(later.first[2].appear, 0);
  const held = sequenceOverlayState(6800, timing, 3, 2, true);
  assert.equal(held.centerFrom, 0);
  assert.equal(held.centerTo, 0);
  assert.ok(held.first.every(step => step.appear === 0));
  assert.equal(held.second[0].appear, 0);
  const secondIn = sequenceOverlayState(8200, timing, 3, 2, true);
  assert.equal(secondIn.centerTo, 1);
  assert.equal(secondIn.second[0].appear, 1);
  assert.equal(secondIn.second[1].appear, 0);
  const keepCenter = sequenceOverlayState(6300, timing, 3, 2, false);
  assert.equal(keepCenter.centerFrom, 1);
  assert.equal(keepCenter.centerTo, 0);
  const longFade = sequenceSceneClock({ ...timing, fade: 1.6 }, 3);
  assert.ok(Math.abs(longFade.scene2Start - 6.7) < 1e-9);
});

test("surround images take turns blinking and stepping one at a time", async () => {
  const { surroundIdle, SURROUND_BOB_PX, SURROUND_IDLE_TURN } = await import("../src/lib/step-overlays");
  assert.deepEqual(surroundIdle(0, 0, 2), { x: 0, y: 0, blink: false });
  assert.equal(surroundIdle(40, 0, 2).blink, true);
  assert.equal(surroundIdle(40, 1, 2).blink, false);
  const up = surroundIdle(1230, 0, 2);
  assert.equal(up.y, -SURROUND_BOB_PX);
  assert.equal(up.x, 0);
  assert.deepEqual(surroundIdle(1230, 1, 2), { x: 0, y: 0, blink: false });
  const left = surroundIdle(2610, 0, 2);
  assert.equal(left.x, -SURROUND_BOB_PX);
  assert.equal(surroundIdle(SURROUND_IDLE_TURN + 40, 1, 2).blink, true);
  assert.equal(surroundIdle(SURROUND_IDLE_TURN + 40, 0, 2).blink, false);
});

test("connecting beads grow inward from each island and meet in the middle", async () => {
  const { stepBridge, STEP_BRIDGE, CHAT_DELAY, STEP_DELAY } = await import("../src/lib/step-overlays");
  const { connectIslands } = await import("../src/lib/bridge-density");
  const { densityAt } = await import("../src/lib/dither-cells");
  const start = CHAT_DELAY + STEP_DELAY;
  assert.equal(stepBridge(start - 1, 0), 0);
  assert.ok(stepBridge(start + STEP_BRIDGE / 2, 0) > .4);
  assert.equal(stepBridge(start + STEP_BRIDGE, 0), 1);
  const from = { left: 0, top: 40, right: 40, bottom: 80 };
  const to = { left: 280, top: 40, right: 320, bottom: 80 };
  assert.equal(connectIslands(from, to, 0, 12), null);
  const peak = (layer: { field: Float32Array; width: number; height: number; originX: number; originY: number; scale?: number }, x0: number, y0: number, x1: number, y1: number) => {
    let best = 0;
    for (let y = y0; y <= y1; y += 4) for (let x = x0; x <= x1; x += 4) best = Math.max(best, densityAt([layer], x, y, 1));
    return best;
  };
  const early = connectIslands(from, to, .18, 12, 0, { end: 22, waist: 8 })!;
  assert.ok(peak(early, 20, 48, 70, 80) > .3);
  assert.ok(peak(early, 250, 48, 300, 80) > .3);
  assert.ok(peak(early, 20, 48, 70, 80) > peak(early, 140, 52, 180, 68));
  const done = connectIslands(from, to, 1, 12, 0, { end: 36, waist: 6 })!;
  assert.ok(peak(done, 130, 48, 190, 72) > .2);
  assert.ok(densityAt([done], 56, 82, 1) > densityAt([done], 160, 82, 1));
});

test("step and connecting cells live in their own libraries", async () => {
  const { STEP_LIBRARY, NECK_LIBRARY, TONAL_LIBRARY, MORPH_LIBRARY } = await import("../src/lib/dither-cells");
  assert.equal(STEP_LIBRARY.id, "step");
  assert.equal(STEP_LIBRARY.cells.length, 5);
  assert.equal(NECK_LIBRARY.id, "neck");
  assert.equal(NECK_LIBRARY.cells.length, 2);
  assert.equal(NECK_LIBRARY.cells[0].id, "ring");
  assert.equal(NECK_LIBRARY.cells[1].id, "fill");
  assert.equal(MORPH_LIBRARY.folder, "morph");
  assert.ok(MORPH_LIBRARY.cells.every(cell => cell.joins));
  assert.notEqual(STEP_LIBRARY.folder, TONAL_LIBRARY.folder);
  assert.notEqual(NECK_LIBRARY.folder, STEP_LIBRARY.folder);
});

test("paper punch clears white page and keeps step chrome", async () => {
  const { punchOverlayPaper } = await import("../src/lib/dither-cells");
  const width = 5, height = 5;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let index = 0; index < data.length; index += 4) {
    data[index] = data[index + 1] = data[index + 2] = 255;
    data[index + 3] = 255;
  }
  const mid = (2 * width + 2) * 4;
  data[mid] = 40; data[mid + 1] = 40; data[mid + 2] = 40;
  punchOverlayPaper(data, width, height);
  assert.equal(data[3], 0);
  assert.equal(data[mid + 3], 255);
  assert.equal(data[mid], 40);
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

test("full-bleed color tiles join like Deep; circular stamps stay separate", () => {
  const paint = (width: number, height: number, r: number, g: number, b: number, a: number, shape: "square" | "circle") => {
    const data = new Uint8ClampedArray(width * height * 4);
    const cx = (width - 1) / 2, cy = (height - 1) / 2, radius = width / 2 - .5;
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      if (shape === "circle" && Math.hypot(x - cx, y - cy) > radius) continue;
      const i = (y * width + x) * 4;
      data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = a;
    }
    return data;
  };
  assert.equal(imageFillsSquare(paint(32, 32, 255, 90, 0, 255, "square"), 32, 32), true);
  assert.equal(imageFillsSquare(paint(32, 32, 255, 255, 255, 255, "square"), 32, 32), false);
  assert.equal(imageFillsSquare(paint(32, 32, 227, 219, 238, 255, "circle"), 32, 32), false);
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

test("join lobes melt stair joints into waves while walls and thin arms survive", async () => {
  const { joinLobeRadius, smoothTileRings, connectGeometry } = await import("../src/lib/dither-cells");
  assert.equal(joinLobeRadius(24, 0), 0);
  assert.ok(joinLobeRadius(24, 100) > joinLobeRadius(24, 40));
  assert.deepEqual(connectGeometry(24, 0), { radius: 12, blur: 1 });
  assert.equal(connectGeometry(24, 100).radius, 24 * .78);
  assert.ok(Math.abs(connectGeometry(24, 100).blur - 10.6) < 1e-9);

  const stair: { column: number; row: number }[] = [];
  for (let step = 0; step < 6; step++) for (let row = step; row < 7; row++) stair.push({ column: step, row });
  const reach = joinLobeRadius(24, 100);
  const rings = smoothTileRings(stair, 24, 24, reach);
  assert.equal(rings.length, 1);
  const movedOffGrid = rings[0].filter(point =>
    Math.abs(point.x / 24 - Math.round(point.x / 24)) > .05
    && Math.abs(point.y / 24 - Math.round(point.y / 24)) > .05);
  assert.ok(movedOffGrid.length > 2, "alternating stair corners relax away from the square grid");

  const wall = [] as { column: number; row: number }[];
  for (let column = 0; column < 10; column++) for (let row = 0; row < 4; row++) wall.push({ column, row });
  const wallRing = smoothTileRings(wall, 24, 24, reach)[0];
  const horizontalRuns = wallRing.map((point, index, ring) => {
    const next = ring[(index + 1) % ring.length];
    return Math.abs(next.y - point.y) < .001 ? Math.abs(next.x - point.x) : 0;
  });
  assert.ok(Math.max(...horizontalRuns) >= 240, "a straight wall remains one exact line segment");

  const arm = [{ column: 0, row: 0 }, { column: 1, row: 0 }, { column: 2, row: 0 }, { column: 3, row: 0 }, { column: 4, row: 0 }];
  const armRing = smoothTileRings(arm, 24, 24, reach)[0];
  assert.ok(armRing?.length, "a one-cell arm still draws");
  const height = Math.max(...armRing.map(point => point.y)) - Math.min(...armRing.map(point => point.y));
  assert.ok(height > 8, `a one-cell arm keeps its body, got ${height.toFixed(1)}px`);
});

test("rim blocks select stable, separated cells from the occupied boundary", async () => {
  const { rimCandidateCells, selectRimCells, rimOutwardVector, rimJitter } = await import("../src/lib/dither-cells");
  const indices = new Int16Array(7 * 7).fill(-1);
  for (let row = 1; row < 6; row++) for (let column = 1; column < 6; column++) {
    indices[row * 7 + column] = 0;
  }
  const candidates = rimCandidateCells(indices, 7, 7);
  assert.equal(candidates.length, 16);
  assert.ok(candidates.every(cell => cell.column === 1 || cell.column === 5 || cell.row === 1 || cell.row === 5));
  const selected = selectRimCells(candidates, 6);
  assert.equal(selected.length, 6);
  assert.deepEqual(selectRimCells(candidates, 6), selected, "selection is stable between animation frames");
  assert.equal(new Set(selected.map(cell => `${cell.column}:${cell.row}`)).size, selected.length);
  assert.deepEqual(rimOutwardVector(indices, 7, 7, { column: 3, row: 1 }), { x: 0, y: -1 });
  const corner = rimOutwardVector(indices, 7, 7, { column: 1, row: 1 });
  assert.ok(Math.abs(corner.x + Math.SQRT1_2) < 1e-9 && Math.abs(corner.y + Math.SQRT1_2) < 1e-9);
  const jitter = rimJitter({ column: 3, row: 1 }, 12, 17);
  assert.equal(rimJitter({ column: 3, row: 1 }, 12, 17), jitter, "noise is stable between frames");
  assert.ok(Math.abs(jitter) <= 12);
  assert.notEqual(rimJitter({ column: 3, row: 1 }, 12, 31), jitter, "X, Y, and offset use independent noise");
});

test('only outer corners of a two-tone mass get a radius', async()=>{
  const {outerCornerRadius}=await import('../src/lib/dither-cells');
  const solid=new Set(['0:1','1:0','1:1']);
  const pale=new Set(['1:0']);
  assert.equal(outerCornerRadius(2,0,solid,12,pale),12);
  assert.equal(outerCornerRadius(1,1,solid,12,pale),0);
  assert.equal(outerCornerRadius(1,1,solid,12,solid),12);
  assert.equal(outerCornerRadius(0,0,solid,12,pale),0);
});

test('joining fills stay in solid bands and weld into neighboring notches', async()=>{
 const {toneCellIndex,weldJoiningIndices}=await import('../src/lib/dither-cells');
 const levels=[0,.25,1];
 const joins=[false,true,true];
 for(let row=0;row<8;row++)for(let col=0;col<8;col++){
  assert.equal(toneCellIndex(.125,col,row,levels,joins),1);
  assert.equal(toneCellIndex(.7,col,row,levels,joins),2);
 }
 const indices=Int16Array.from([
  2,2,-1,
  2,-1,-1,
  2,1,1,
 ]);
 weldJoiningIndices(indices,joins,3,3);
 assert.equal(indices[4],2);
 const rim=Int16Array.from([
  2,2,2,
  2,2,2,
  2,2,1,
 ]);
 const {coatJoiningRim}=await import('../src/lib/dither-cells');
 coatJoiningRim(rim,joins,3,3);
 assert.equal(rim[0],1);
 assert.equal(rim[4],2);
 assert.equal(rim[8],1);
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
