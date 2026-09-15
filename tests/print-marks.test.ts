import assert from "node:assert/strict";
import test from "node:test";
import { Color, OrthographicCamera, Vector3 } from "three";
import { createHandSegments, sampleHandParticles } from "../src/lib/hand-model";
import { PRINT_GRID, projectPrintMarks } from "../src/lib/print-marks";

function camera(angled = false) {
  const c = new OrthographicCamera(-4, 4, 3, -3, 0.1, 30);
  const target = new Vector3(-0.55, 0.04, 0);
  c.position.copy(target).add(angled ? new Vector3(-5, 3.3, 7) : new Vector3(0, 0, 9));
  c.lookAt(target);
  c.updateMatrixWorld();
  return c;
}

const palette = {
  background: new Color("white"), foreground: new Color("black"),
  teal: new Color("cyan"), blue: new Color("blue"), purple: new Color("purple"), orange: new Color("orange"),
};

test("print marks can occupy two or three cells without sharing footprints", () => {
  for (const angled of [false, true]) for (const closure of [0, 0.5, 1]) {
    const cells = projectPrintMarks(sampleHandParticles(createHandSegments(closure, palette), palette, "print"), camera(angled));
    assert.ok(cells.some(cell => cell.span >= 2));
    assert.ok(cells.some(cell => cell.span === 3));
    const keys = cells.flatMap(cell => cell.keys);
    assert.equal(new Set(keys).size, keys.length);
    for (const cell of cells) {
      assert.equal(cell.keys.length, cell.span);
      const coords = cell.keys.map(key => key.split(":").map(Number));
      const columns = new Set(coords.map(([c]) => c));
      const rows = new Set(coords.map(([, r]) => r));
      assert.ok(columns.size === 1 || rows.size === 1);
      assert.ok(Math.max(columns.size, rows.size) === cell.span);
    }
  }
});

test("print lattice is coarser than the original display grid", () => {
  assert.ok(PRINT_GRID.spacing > 0.4);
});
