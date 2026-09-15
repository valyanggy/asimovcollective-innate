import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Color, Matrix4, MeshBasicMaterial, OrthographicCamera, Vector3 } from 'three';
import { DEFAULT_LAYERS, LayeredMarks } from '../src/lib/layered-marks';

test('depth layers retain world depth and respond to registration and ink controls', () => {
  const renderer = new LayeredMarks();
  const camera = new OrthographicCamera(-4, 4, 3, -3, .1, 30);
  camera.position.set(0, 0, 9); camera.lookAt(0, 0, 0); camera.updateMatrixWorld();
  const particles = [-.2, 0, .2].map(z => ({ position: new Vector3(0, 0, z), scale: 1, color: new Color('#3399ff') }));
  renderer.update(particles, camera, { ...DEFAULT_LAYERS, spread: 0 });
  const matrix = new Matrix4();
  renderer.group.children.forEach((child, i) => {
    const mesh = child as import('three').InstancedMesh;
    assert.equal(mesh.count, 1);
    mesh.getMatrixAt(0, matrix);
    assert.ok(Math.abs(matrix.elements[14] - particles[i].position.z) < .0001);
    assert.equal(matrix.elements[12], 0);
  });
  renderer.update(particles, camera, { ...DEFAULT_LAYERS, spread: .5, opacity: 0 });
  const back = renderer.group.children[0] as import('three').InstancedMesh;
  back.getMatrixAt(0, matrix);
  assert.ok(matrix.elements[12] < 0);
  assert.equal((back.material as MeshBasicMaterial).opacity, 0);
  const front = renderer.group.children[2] as import('three').InstancedMesh;
  assert.equal((front.material as MeshBasicMaterial).opacity, .92);
});
