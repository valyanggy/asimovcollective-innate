import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import sharp from "sharp";
import {
  generateFacePills, imageToFaceMask, portraitFrame, PORTRAIT_CROP,
  type FaceMask, type FacePill,
} from "../src/lib/face-pills";

// Exercise the supplied portrait, including its nearly black right shadow.
const portrait = sharp(readFileSync(new URL("../public/images/innate-robot.png", import.meta.url)))
  .extract({ left: PORTRAIT_CROP.x, top: PORTRAIT_CROP.y, width: PORTRAIT_CROP.width, height: PORTRAIT_CROP.height })
  .ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  .then(({ data, info }) => imageToFaceMask(new Uint8ClampedArray(data), info.width, info.height));

function toneAtSource(mask: FaceMask, x: number, y: number) {
  const col = Math.floor((x - PORTRAIT_CROP.x) / PORTRAIT_CROP.width * mask.width);
  const row = Math.floor((y - PORTRAIT_CROP.y) / PORTRAIT_CROP.height * mask.height);
  assert.ok(col >= 0 && col < mask.width && row >= 0 && row < mask.height, "Landmark must remain in the portrait crop");
  return mask.pixels[row * mask.width + col];
}

test("the image mask separates both eyes while retaining the dark head shadow and neck", async () => {
  const mask = await portrait;
  for (const [x, y] of [[502, 459], [761, 460]]) {
    assert.equal(toneAtSource(mask, x, y), 2, `Missing eye at source ${x}, ${y}`);
  }
  for (const [x, y] of [[856, 320], [838, 510], [460, 350], [631, 630]]) {
    assert.equal(toneAtSource(mask, x, y), 1, `Head or neck removed at source ${x}, ${y}`);
  }
  for (const [x, y] of [[355, 200], [800, 640]]) {
    assert.equal(toneAtSource(mask, x, y), 0, `Background or shoulder retained at source ${x}, ${y}`);
  }
});

test("the supplied portrait produces two substantial lens regions without extra shadow holes", async () => {
  const mask = await portrait, visited = new Uint8Array(mask.pixels.length);
  const components: { area: number; centerX: number }[] = [];
  for (let i = 0; i < mask.pixels.length; i++) {
    if (mask.pixels[i] !== 2 || visited[i]) continue;
    const queue = [i]; visited[i] = 1;
    let area = 0, sumX = 0;
    while (queue.length) {
      const current = queue.pop()!, x = current % mask.width, y = Math.floor(current / mask.width);
      area++; sumX += x;
      const neighbors = [x > 0 ? current - 1 : -1, x + 1 < mask.width ? current + 1 : -1,
        y > 0 ? current - mask.width : -1, y + 1 < mask.height ? current + mask.width : -1];
      for (const next of neighbors) if (next >= 0 && mask.pixels[next] === 2 && !visited[next]) {
        visited[next] = 1; queue.push(next);
      }
    }
    components.push({ area, centerX: sumX / area });
  }
  const lenses = components.filter(component => component.area > 1000);
  assert.equal(lenses.length, 2, "Shadows must not become additional eyes");
  assert.ok(Math.abs(lenses[0].centerX - lenses[1].centerX) > mask.width * .35);
  // Small disconnected pixels on the photographed lens rims are expected.
  const rimArea = components.filter(component => component.area <= 1000).reduce((sum, component) => sum + component.area, 0);
  const lensArea = lenses.reduce((sum, component) => sum + component.area, 0);
  assert.ok(rimArea < lensArea * .03, "Stray dark regions must remain negligible beside the two lens interiors");
});

function assertPacking(pills: FacePill[], width: number, height: number) {
  const epsilon = 1e-7;
  const ordered = [...pills].sort((a, b) => a.y - b.y || a.x - b.x);
  let active: FacePill[] = [];
  for (const pill of ordered) {
    assert.ok([pill.x, pill.y, pill.w, pill.h, pill.fontSize].every(Number.isFinite));
    assert.ok(pill.w > 0 && pill.h > 0 && pill.x >= 0 && pill.y >= 0);
    assert.ok(pill.x + pill.w <= width + epsilon && pill.y + pill.h <= height + epsilon, "Pill extends beyond the canvas");
    active = active.filter(previous => previous.y + previous.h > pill.y + epsilon);
    for (const previous of active) {
      const overlapX = Math.min(previous.x + previous.w, pill.x + pill.w) - Math.max(previous.x, pill.x);
      assert.ok(overlapX <= epsilon, `Overlapping pills at ${pill.x}, ${pill.y} and ${previous.x}, ${previous.y}`);
    }
    active.push(pill);
  }
}

test("regional packing stays within the field and never overlaps across viewport and control extremes", async () => {
  const mask = await portrait;
  for (const [width, height, detail, background] of [
    [1440, 720, 12, 4], [390, 624, 8, 6], [320, 350, 18, 1], [844, 350, 18, 6],
  ]) {
    const frame = portraitFrame(width, height);
    assert.ok(frame.x >= 0 && frame.y >= 0 && frame.x + frame.w <= width && frame.y + frame.h <= height);
    const pills = generateFacePills(mask, width, height, detail, background);
    assertPacking(pills, width, height);
    assert.deepEqual([...new Set(pills.map(pill => pill.tone))].sort(), [0, 1, 2]);
    const eyes = pills.filter(pill => pill.tone === 2);
    assert.ok(eyes.some(pill => pill.x < width / 2) && eyes.some(pill => pill.x > width / 2), "Both eyes must survive coarse and mobile packing");
  }
});

test("large background cells preserve fine lens detail instead of enlarging the whole portrait", async () => {
  const mask = await portrait;
  const fine = generateFacePills(mask, 1200, 720, 12, 1);
  const large = generateFacePills(mask, 1200, 720, 12, 6);
  const maxHeight = (pills: FacePill[], tone: number) => Math.max(...pills.filter(pill => pill.tone === tone).map(pill => pill.h));
  assert.ok(maxHeight(large, 0) > maxHeight(fine, 0) * 3, "Background control must create materially larger cells");
  assert.equal(maxHeight(large, 2), maxHeight(fine, 2), "Lens detail must stay fine");
  assert.ok(maxHeight(large, 0) > maxHeight(large, 1) * 2, "Empty background should use larger cells than the head");
});
