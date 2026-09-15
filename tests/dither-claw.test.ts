import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Color, Mesh, CapsuleGeometry, Vector3 } from 'three';
import { DitherClaw } from '../src/lib/dither-claw';
import { createHandSegments } from '../src/lib/hand-model';
const palette = { background: new Color('white'), foreground: new Color('black'), blue: new Color('blue'), purple: new Color('purple'), teal: new Color('cyan'), orange: new Color('orange') };
test('solid claw preserves its rest geometry and maps capsule endpoints to articulated segments', () => {
  const claw = new DitherClaw();
  claw.update(createHandSegments(0, palette));
  const meshes = claw.group.children.filter(c => c instanceof Mesh) as Mesh<CapsuleGeometry>[];
  const geometries = meshes.map(m => m.geometry);
  for (const curl of [.25, .5, 1]) {
    const segments = createHandSegments(curl, palette);
    claw.update(segments);
    claw.group.updateMatrixWorld(true);
    assert.equal(meshes.length, segments.length);
    meshes.forEach((mesh, i) => {
      assert.equal(mesh.geometry, geometries[i]);
      assert.equal(mesh.castShadow, true);
      assert.equal(mesh.receiveShadow, true);
      const half = segments[i].a.distanceTo(segments[i].b) / 2;
      assert.ok(new Vector3(0, -half, 0).applyMatrix4(mesh.matrixWorld).distanceTo(segments[i].a) < 1e-6);
      assert.ok(new Vector3(0, half, 0).applyMatrix4(mesh.matrixWorld).distanceTo(segments[i].b) < 1e-6);
    });
  }
});
