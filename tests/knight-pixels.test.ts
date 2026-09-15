import { test } from 'node:test';
import assert from 'node:assert/strict';
import { InstancedMesh, MeshBasicMaterial, OrthographicCamera, Matrix4 } from 'three';
import { createKnightPixels } from '../src/lib/knight-pixels';
test('white knight pixels align to the view grid and retain depth in both views',()=>{
 const model=createKnightPixels();
 const camera=new OrthographicCamera(-4,4,3,-3,.1,30);
 for(const pos of [[0,0,9],[-5,5,5]]){
  camera.position.set(pos[0],pos[1],pos[2]);camera.lookAt(0,0,0);camera.updateMatrixWorld();model.updateView!(camera);
  const mesh=model.group.children[0] as InstancedMesh;
  assert.ok(mesh.count>500&&mesh.count<=6500);
  assert.equal((mesh.material as MeshBasicMaterial).color.getHexString(),'ffffff');
  const matrix=new Matrix4();mesh.getMatrixAt(0,matrix);matrix.premultiply(camera.matrixWorldInverse);
  assert.ok(Math.abs(matrix.elements[12]/.04-Math.round(matrix.elements[12]/.04))<.0001);
  assert.ok(matrix.elements[14]<0);
 }
 model.dispose();
});
