import assert from "node:assert/strict";
import test from "node:test";
import { cellComponents, cellsMerge, GRID_MARKS, ledCenter, metaballField, METABALL_THRESHOLD, placeGridCells, snapToLed } from "../src/lib/grid-cells";
import { gridMetrics } from "../src/lib/dot-field";

test("grid cells sit on LED centers and merge across two grid steps", () => {
  const grid = gridMetrics(1200, 800, 1.5);
  const compact = gridMetrics(1200, 800);
  assert.ok(grid.stepX > compact.stepX * 1.4);
  const cells = placeGridCells(1200, 800, [], grid);
  assert.equal(cells.length, GRID_MARKS.length);
  assert.equal(cells[0].mark, "A");
  for (const cell of cells) {
    const led = ledCenter(cell.col, cell.row, grid);
    assert.ok(Math.abs(cell.x - led.x) < 1e-6);
    assert.ok(Math.abs(cell.y - led.y) < 1e-6);
  }
  const keys = new Set(cells.map(cell => `${cell.col},${cell.row}`));
  assert.equal(keys.size, cells.length);
  assert.ok(cellsMerge(cells[0], cells[1]));
  const far = snapToLed(40, 40, grid);
  const other = snapToLed(200, 40, grid, new Set([`${far.col},${far.row}`]));
  assert.equal(cellsMerge({ ...far, mark: "A", radius: 24 }, { ...other, mark: "7", radius: 24 }), false);
  const together = cellComponents([
    { ...ledCenter(10, 10, grid), col: 10, row: 10, mark: "A", radius: 24 },
    { ...ledCenter(13, 10, grid), col: 13, row: 10, mark: "7", radius: 24 },
  ]);
  assert.equal(together.length, 1);
});

test("nearby cells pinch like a metaball instead of forming a stadium", () => {
  const radius = 40;
  const pair = [
    { x: 0, y: 0, col: 0, row: 0, mark: "M", radius },
    { x: radius * 2, y: 0, col: 3, row: 0, mark: "N", radius },
  ];
  assert.ok(metaballField(pair, radius, 0) > METABALL_THRESHOLD);
  assert.ok(metaballField(pair, radius, radius * .85) < METABALL_THRESHOLD);
  assert.ok(metaballField(pair, -radius * 2, 0) < METABALL_THRESHOLD);
});

test("the metaball neck fattens as two cells get closer", () => {
  const radius = 40;
  const pair = (span: number) => [
    { x: 0, y: 0, col: 0, row: 0, mark: "M", radius },
    { x: span, y: 0, col: 1, row: 0, mark: "N", radius },
  ];
  const close = pair(radius * 1.6);
  const far = pair(radius * 2.2);
  assert.ok(metaballField(close, radius * .8, 0) > metaballField(far, radius * 1.1, 0));
  assert.ok(metaballField(close, radius * .8, radius * .7) > METABALL_THRESHOLD);
  assert.ok(metaballField(far, radius * 1.1, radius * .7) < METABALL_THRESHOLD);
});
