import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Color, OrthographicCamera, Quaternion, Vector3 } from 'three';
import { proximityFringe } from '../src/lib/proximity-fringe';
const surface=Array.from({length:21},(_,i)=>({position:new Vector3(0,(i-10)*.055,0),rotation:new Quaternion()}));
const camera=new OrthographicCamera(-4,4,3,-3,.1,30);camera.position.z=9;camera.updateMatrixWorld();
const segment=(x:number,z=0)=>[{a:new Vector3(x,-1,z),b:new Vector3(x,1,z),radius:.1,color:new Color('white')}];
test('proximity stripes grow with approach and disappear at a real 3D distance',()=>{
 const far=proximityFringe(surface,segment(2),camera);
 const middle=proximityFringe(surface,segment(.6),camera);
 const close=proximityFringe(surface,segment(.12),camera);
 assert.equal(far.length,0);
 assert.ok(middle.length>0);
 assert.ok(close.length>middle.length);
 assert.ok(close.some(p=>p.echo));
 assert.equal(proximityFringe(surface,segment(.12,2),camera).length,0);
 assert.ok(close.every(p=>p.position.toArray().every(Number.isFinite)));
 assert.deepEqual(close,proximityFringe(surface,segment(.12),camera));
});
