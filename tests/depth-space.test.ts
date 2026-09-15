import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Mesh, ShaderMaterial, OrthographicCamera } from 'three';
import { depthBrightness,DEPTH_SPACE,DepthBackdrop } from '../src/lib/depth-space';
import { createKnightDepth } from '../src/lib/knight-depth';
test('depth grayscale is monotonic and shared by knight and receding backdrop',()=>{
 assert.equal(depthBrightness(DEPTH_SPACE.near),1);assert.equal(depthBrightness(DEPTH_SPACE.far),0);
 assert.ok(depthBrightness(8)>depthBrightness(10));
 const model=createKnightDepth(),mesh=model.group.children[0] as Mesh;
 assert.ok(mesh.material instanceof ShaderMaterial);
 assert.equal(model.updateProximity,undefined);
 const backdrop=new DepthBackdrop(),camera=new OrthographicCamera(-3,3,2,-2,.1,30);
 camera.position.set(-5,5,5);camera.lookAt(0,0,0);camera.updateMatrixWorld();backdrop.update(camera);
 assert.deepEqual(backdrop.mesh.quaternion.toArray(),camera.quaternion.toArray());
 const p=backdrop.mesh.geometry.getAttribute('position');assert.ok(p.getZ(0)>p.getZ(2));
 assert.equal((backdrop.mesh.material as ShaderMaterial).uniforms.farDepth.value,(mesh.material as ShaderMaterial).uniforms.farDepth.value);
 model.dispose();backdrop.mesh.geometry.dispose();(backdrop.mesh.material as ShaderMaterial).dispose();
});
