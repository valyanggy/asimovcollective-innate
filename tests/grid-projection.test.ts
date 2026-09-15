import assert from "node:assert/strict";
import test from "node:test";
import { Color, OrthographicCamera, Vector3 } from "three";
import { DISPLAY_GRID, projectToGrid } from "../src/lib/grid-projection";
import { createHandSegments, sampleHandParticles } from "../src/lib/hand-model";

function camera(angled = false) {
  const c = new OrthographicCamera(-4, 4, 3, -3, 0.1, 30);
  const target = new Vector3(-0.55, 0.04, 0);
  c.position.copy(target).add(angled ? new Vector3(-5, 3.3, 7) : new Vector3(0, 0, 9));
  c.lookAt(target);
  c.updateMatrixWorld();
  return c;
}
const palette = { background: new Color("white"), foreground: new Color("black"), teal: new Color("cyan"), blue: new Color("blue"), purple: new Color("purple"), orange: new Color("orange") };

test("samples sharing a display cell collapse to the nearest depth", () => {
  const near = { position: new Vector3(0, 0, 1), name: "near" };
  const far = { position: new Vector3(0, 0, -1), name: "far" };
  for (const samples of [[near, far], [far, near]]) {
    const cells = projectToGrid(samples, camera());
    assert.equal(cells.length, 1);
    assert.equal(cells[0].item.name, "near");
    assert.ok(Math.abs(cells[0].position.z - 1) < 1e-9);
  }
});

test("claw marks align and cannot overlap in either camera throughout the grasp", () => {
  for (const angled of [false, true]) for (const closure of [0, 0.25, 0.5, 0.75, 1]) {
    const c = camera(angled);
    const particles = sampleHandParticles(createHandSegments(closure, palette), palette);
    const cells = projectToGrid(particles, c);
    assert.ok(cells.length > 0 && cells.length < particles.length);
    assert.equal(new Set(cells.map(cell => cell.key)).size, cells.length);
    const local = cells.map(cell => cell.position.clone().applyMatrix4(c.matrixWorldInverse));
    for (const p of local) {
      assert.ok(Math.abs(p.x / DISPLAY_GRID.spacing - Math.round(p.x / DISPLAY_GRID.spacing)) < 1e-8);
      assert.ok(Math.abs(p.y / DISPLAY_GRID.spacing - Math.round(p.y / DISPLAY_GRID.spacing)) < 1e-8);
    }
    for (let i = 0; i < local.length; i++) for (let j = i + 1; j < local.length; j++) {
      const screenDistance = Math.hypot(local[i].x - local[j].x, local[i].y - local[j].y);
      assert.ok(screenDistance > 2 * DISPLAY_GRID.spacing * DISPLAY_GRID.maxRadius);
    }
  }
});

test("proximity cannot occupy claw cells, and tile size leaves a gap", () => {
  const c = camera();
  const samples = [{ position: new Vector3(0, 0, 0) }, { position: new Vector3(1, 0, 0) }];
  const claw = projectToGrid(samples.slice(0, 1), c);
  const field = projectToGrid(samples, c, new Set(claw.map(cell => cell.key)));
  assert.equal(field.length, 1);
  assert.notEqual(field[0].key, claw[0].key);
  assert.ok(DISPLAY_GRID.fieldFill < 1);
  assert.ok(DISPLAY_GRID.maxRadius + DISPLAY_GRID.fieldFill / 2 < 1);
});
