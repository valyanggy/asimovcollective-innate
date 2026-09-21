import assert from "node:assert/strict";
import test from "node:test";
import { anchoredImageBox, bleedBesideMask, clampMediaWipe, containImageBox, easeMediaLag, edgeDrift, insetSubjectMask, mediaPairFrames, mediaSubjectFrame, scrapDrift, subjectEdgeField, subjectHoleMask, subjectInkDensity, subjectMask } from "../src/lib/media-pair";

test("media pair frames read left to right without overlapping", () => {
  const { left, right } = mediaPairFrames(1200, 700);
  assert.ok(left.x < right.x);
  assert.ok(left.x + left.width < right.x);
  assert.equal(Math.round(left.width), Math.round(right.width));
  assert.equal(Math.round(left.height), Math.round(right.height));
  assert.ok(right.x + right.width <= 1200);
});

test("treated subject frame leaves a right gutter", () => {
  const frame = mediaSubjectFrame(1200, 700);
  assert.ok(frame.x > 0);
  assert.ok(frame.x + frame.width < 1200);
  assert.ok(1200 - (frame.x + frame.width) >= 200);
});

test("contained image keeps aspect and stays inside its frame", () => {
  const frame = { x: 40, y: 40, width: 400, height: 300 };
  const box = containImageBox(512, 442, frame);
  assert.ok(box.width <= frame.width + 1e-6);
  assert.ok(box.height <= frame.height + 1e-6);
  assert.ok(Math.abs(box.width / box.height - 512 / 442) < 1e-6);
  assert.ok(box.x >= frame.x - 1e-6);
  assert.ok(box.y >= frame.y - 1e-6);
});

test("drag anchor moves the cutout without changing its size", () => {
  const frame = { x: 40, y: 40, width: 400, height: 300 };
  const resting = containImageBox(512, 442, frame);
  const moved = anchoredImageBox(512, 442, frame, { x: resting.x + resting.width / 2 + 80, y: resting.y + resting.height / 2 - 40 });
  assert.equal(moved.width, resting.width);
  assert.equal(moved.height, resting.height);
  assert.ok(Math.abs(moved.x - resting.x - 80) < 1e-6);
  assert.ok(Math.abs(moved.y - resting.y + 40) < 1e-6);
  assert.deepEqual(anchoredImageBox(512, 442, frame, null), resting);
});

test("wipe clamp stays between 0 and 1", () => {
  assert.equal(clampMediaWipe(-1), 0);
  assert.equal(clampMediaWipe(2), 1);
  assert.equal(clampMediaWipe(.333), .33);
});

test("subject edge follows the hole and leaves the crop and interior empty", () => {
  const width = 8;
  const height = 4;
  const field = new Float32Array(width * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < 5; x++) field[y * width + x] = 1;
  const edge = subjectEdgeField(field, width, height, 1, 1);
  assert.equal(edge[0], 0);
  assert.ok(edge[3] > 0);
  assert.ok(edge[4] > 0);
  assert.ok(edge[5] > 0);
  assert.equal(edge[7], 0);
});

test("border black is the hole and an enclosed dark pixel stays subject", () => {
  const width = 7;
  const height = 5;
  const field = new Float32Array(width * height).fill(1);
  for (let y = 0; y < height; y++) { field[y * width] = 0; field[y * width + width - 1] = 0; }
  for (let x = 0; x < width; x++) { field[x] = 0; field[(height - 1) * width + x] = 0; }
  field[2 * width + 3] = 0;
  const hole = subjectHoleMask(field, width, height);
  const mask = subjectMask(field, width, height);
  assert.equal(hole[0], 1);
  assert.equal(hole[2 * width + 3], 0);
  assert.equal(mask[2 * width + 3], 1);
  assert.equal(mask[0], 0);
});

test("dither bleed stays beside the cut and keeps the interior photograph", () => {
  const width = 12;
  const height = 8;
  const mask = new Uint8Array(width * height);
  for (let y = 2; y <= 5; y++) for (let x = 3; x <= 8; x++) mask[y * width + x] = 1;
  const bleed = bleedBesideMask(mask, width, height, width, height, 0, 0, 1, 1);
  const shape = [...bleed.light, ...bleed.purple];
  const shaped = (column: number, row: number) => shape.some(cell => cell.column === column && cell.row === row);
  assert.ok(bleed.photo.some(cell => cell.column === 5 && cell.row === 3));
  assert.ok(shaped(5, 3));
  assert.equal(shaped(0, 0), false);
  const holeCells = bleed.light.length + bleed.purple.length;
  let subjectCells = 0;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (mask[y * width + x]) subjectCells++;
  assert.ok(holeCells > subjectCells);
  assert.ok(holeCells < width * height);
});

test("photo inset drops the rim and keeps the interior", () => {
  const width = 11;
  const height = 11;
  const mask = new Uint8Array(width * height);
  for (let y = 1; y <= 9; y++) for (let x = 1; x <= 9; x++) mask[y * width + x] = 1;
  const inset = insetSubjectMask(mask, width, height, 2);
  assert.equal(inset[2 * width + 2], 0);
  assert.equal(inset[5 * width + 5], 1);
  const open = bleedBesideMask(mask, width, height, width, height, 0, 0, 1, 1);
  const tight = bleedBesideMask(mask, width, height, width, height, 0, 0, 1, 1, 2);
  assert.ok(tight.photo.length < open.photo.length);
  assert.ok(tight.photo.some(cell => cell.column === 5 && cell.row === 5));
  assert.ok(tight.light.length + tight.purple.length > 0);
});

test("randomness and over-bleed change the cutout shape", () => {
  const width = 12;
  const height = 8;
  const mask = new Uint8Array(width * height);
  for (let y = 2; y <= 5; y++) for (let x = 3; x <= 8; x++) mask[y * width + x] = 1;
  const calm = bleedBesideMask(mask, width, height, width, height, 0, 0, 1, 1, 0, 0, 0);
  const wild = bleedBesideMask(mask, width, height, width, height, 0, 0, 1, 1, 0, 1, 1);
  const size = (field: { light: unknown[]; purple: unknown[] }) => field.light.length + field.purple.length;
  assert.equal(calm.purple.length, 0);
  assert.equal(calm.overlay.length, 0);
  assert.ok(size(wild) > size(calm));
});

test("over-bleed past 100% leaves the cutout as separate islands", () => {
  const width = 20;
  const height = 16;
  const mask = new Uint8Array(width * height);
  for (let y = 6; y <= 9; y++) for (let x = 8; x <= 11; x++) mask[y * width + x] = 1;
  const at = (amount: number) => bleedBesideMask(mask, width, height, width, height, 0, 0, 1, 1, 0, 0, amount);
  const oldMax = at(1);
  const loose = at(3);
  const islands = [...loose.spillLight, ...loose.spillPurple];
  assert.equal(oldMax.spillLight.length + oldMax.spillPurple.length, 0);
  assert.ok(islands.length > 0);
  assert.ok(islands.length < width * height * .4);
  assert.ok(islands.some(cell => Math.max(Math.abs(cell.column - 9), Math.abs(cell.row - 7)) > 4));
  const photo = new Uint8Array(8 * 8);
  for (let y = 3; y <= 4; y++) for (let x = 6; x <= 7; x++) photo[y * 8 + x] = 1;
  const escaped = bleedBesideMask(photo, 8, 8, 16, 8, 0, 0, 1, 1, 0, 0, 3);
  const held = bleedBesideMask(photo, 8, 8, 16, 8, 0, 0, 1, 1, 0, 0, 1);
  const outside = (field: { spillLight: { column: number }[]; spillPurple: { column: number }[] }) =>
    [...field.spillLight, ...field.spillPurple].some(cell => cell.column >= 8);
  assert.equal(outside(escaped), true);
  assert.equal(outside(held), false);
});

test("edge drift keeps the subject and moves which cells are purple", () => {
  const width = 12;
  const height = 8;
  const mask = new Uint8Array(width * height);
  for (let y = 2; y <= 5; y++) for (let x = 3; x <= 8; x++) mask[y * width + x] = 1;
  const args = [mask, width, height, width, height, 0, 0, 1, 1, 0, .76, .54] as const;
  const still = bleedBesideMask(...args);
  const moved = bleedBesideMask(...args, 2.4, 1.3);
  const key = (cells: { column: number; row: number }[]) => cells.map(cell => `${cell.column}:${cell.row}`).sort().join(",");
  assert.equal(edgeDrift(0).x, 0);
  assert.ok(edgeDrift(20000).x > 0);
  assert.notEqual(key(still.purple), key(moved.purple));
  assert.ok(still.photo.length > 0);
  assert.ok(moved.photo.length > 0);
});

test("scraps rest at time zero and wander afterward", () => {
  const rest = scrapDrift(4, 6, 0);
  const later = scrapDrift(4, 6, 4800);
  assert.equal(rest.x, 0);
  assert.equal(rest.alpha, 1);
  assert.ok(Math.hypot(later.x, later.y) > 1);
  assert.ok(later.alpha < 1);
});

test("purple lag eases toward the photograph and snaps when motion is reduced", () => {
  const eased = easeMediaLag(100, 40);
  assert.ok(eased > 40 && eased < 100);
  assert.equal(easeMediaLag(100, 40, true), 100);
  assert.equal(easeMediaLag(10, 10.2), 10);
});

test("subject occupancy keeps the figure and skips the cutout hole", () => {
  assert.equal(subjectInkDensity(0, 0, 0, 0), 0);
  assert.equal(subjectInkDensity(0, 0, 0, 255), 0);
  assert.equal(subjectInkDensity(8, 8, 8, 255), 0);
  assert.equal(subjectInkDensity(255, 255, 255, 255), 1);
  assert.equal(subjectInkDensity(40, 90, 200, 255), 1);
  assert.ok(subjectInkDensity(240, 200, 160, 128) > .4);
});
