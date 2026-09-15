import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Box3, Mesh, MeshBasicMaterial, Vector3 } from 'three';
import { createKnightToon } from '../src/lib/knight-toon';
test('white knight uses the full normalized mesh, unlit fill, and original contact samples',()=>{
 const model=createKnightToon();
 const mesh=model.group.children.find(o=>o instanceof Mesh) as Mesh;
 assert.ok(mesh.material instanceof MeshBasicMaterial);
 const material=mesh.material as MeshBasicMaterial;
 assert.equal(material.color.getHexString(),"ffffff");
 assert.equal(material.toneMapped,false);
 const size=new Box3().setFromObject(mesh).getSize(new Vector3());
 assert.ok(Math.abs(size.y-2)<.001);
 assert.ok(mesh.geometry.getAttribute('position').count>10000);
 assert.equal(model.surface.length,6500);
 assert.equal(model.updateView,undefined);
 model.dispose();
});
