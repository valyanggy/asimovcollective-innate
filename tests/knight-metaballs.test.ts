import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Box3, Mesh, OrthographicCamera, ShaderMaterial, Vector3 } from 'three';
import { createKnightMetaballs } from '../src/lib/knight-metaballs';
test('imported knight supplies normalized surface and finite, bounded circle projections', () => {
  const model=createKnightMetaballs();
  assert.equal(model.surface.length,6500);
  const bounds=new Box3().setFromPoints(model.surface.map(s=>s.position));
  assert.ok(bounds.getSize(new Vector3()).y>1.95);
  assert.ok(bounds.getSize(new Vector3()).y<=2.001);
  assert.ok(model.field.length<8192);
  for(const position of [new Vector3(0,0,9),new Vector3(-1,1,1).normalize().multiplyScalar(9)]) {
    const camera=new OrthographicCamera(-4,4,3,-3,.1,30);camera.position.copy(position);camera.lookAt(0,0,0);camera.updateMatrixWorld();
    model.updateView!(camera);
    assert.ok(model.group.userData.circleCount > 500);
    assert.ok(model.group.children.length > 1);
    const mesh=model.group.children[0] as Mesh;
    const uniforms=(mesh.material as ShaderMaterial).uniforms;
    assert.ok(uniforms.count.value>30 && uniforms.count.value<=192);
    assert.ok(mesh.scale.toArray().every(Number.isFinite));
    assert.ok(uniforms.balls.value.slice(0,uniforms.count.value).every((b: {toArray():number[]})=>b.toArray().every(Number.isFinite)));
  }
  model.dispose();
});
