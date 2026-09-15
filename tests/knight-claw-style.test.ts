import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Mesh, ShaderMaterial, OrthographicCamera } from 'three';
import { createKnightMetaballs } from '../src/lib/knight-metaballs';
test('06 knight shares the claw contours and plus marks while retaining rear occlusion',()=>{
 const model=createKnightMetaballs(true);
 const camera=new OrthographicCamera(-3,3,2, -2,.1,30);camera.position.z=9;camera.updateMatrixWorld();model.updateView!(camera);
 const meshes=model.group.children.filter(child=>child instanceof Mesh) as Mesh[];
 assert.ok(meshes.some(mesh=>!(mesh.material instanceof ShaderMaterial)&&!Array.isArray(mesh.material)&&!mesh.material.colorWrite));
 const marks=meshes.filter(mesh=>mesh.material instanceof ShaderMaterial);
 assert.ok(marks.length>0);
 for(const mesh of marks){const u=(mesh.material as ShaderMaterial).uniforms;assert.equal(u.showPluses.value,1);assert.equal(u.mergeWidth.value,.024);assert.ok(u.count.value<=192);}
 assert.ok(model.group.userData.coreCircleCount>100);
 assert.ok(model.group.userData.bleedCircleCount>0);
 assert.equal(model.surface.length,6500);model.dispose();
});
