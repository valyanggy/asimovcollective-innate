import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Color, Vector3, OrthographicCamera, Quaternion } from 'three';
import { recognitionStrength, RecognitionReveal } from '../src/lib/recognition-reveal';
import { proximityFringe } from '../src/lib/proximity-fringe';
const segment=(x:number,z=0)=>[{a:new Vector3(x,-1,z),b:new Vector3(x,1,z),radius:.1,color:new Color('white')}];
test('recognition is local to 3D proximity and recedes again',()=>{
 const p=new Vector3();
 assert.equal(recognitionStrength(p,segment(2)),0);
 assert.ok(recognitionStrength(p,segment(.2))>recognitionStrength(p,segment(.7)));
 assert.equal(recognitionStrength(p,segment(.1,2)),0);
 const reveal=new RecognitionReveal();reveal.update(segment(.4));assert.ok(reveal.group.userData.recognition>0);
 reveal.update(segment(4));assert.equal(reveal.group.userData.recognition,0);reveal.dispose();
});
test('surface-crossing bars are opt-in and respond to proximity',()=>{
 const camera=new OrthographicCamera(-4,4,3,-3,.1,30);camera.position.z=9;camera.updateMatrixWorld();
 const surface=Array.from({length:63},(_,i)=>({position:new Vector3((i%3)*.055,Math.floor(i/3)*.055,0),rotation:new Quaternion()}));
 assert.ok(proximityFringe(surface,segment(.1),camera,true).some(p=>p.overlay));
 assert.ok(!proximityFringe(surface,segment(.1),camera).some(p=>p.overlay));
 assert.equal(proximityFringe(surface,segment(4),camera,true).length,0);
});
