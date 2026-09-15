import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { layoutDecisionTags } from '../src/lib/decision-tag-layout';
test('decision tags bleed beyond the fringe with supported anchors and stable identities',()=>{
 const marks=Array.from({length:1000},(_,i)=>{const column=i%50,row=Math.floor(i/50);return {position:new Vector3(column*.055,row*.055,0),column,row,echo:false};});
 const tags=layoutDecisionTags(marks);
 assert.ok(tags.length>30);
 assert.ok(new Set(tags.map(t=>t.variant)).size>10);
 assert.deepEqual(tags,layoutDecisionTags([...marks].reverse()));
 const cells=tags.flatMap(t=>t.cells);assert.equal(new Set(cells).size,cells.length);
 const reduced=marks.filter(m=>m.column<20);
 const clipped=layoutDecisionTags(reduced),allowed=new Set(reduced.map(m=>`${m.column}:${m.row}`));
 assert.ok(clipped.every(t=>t.cells.filter(c=>allowed.has(c)).length>=Math.max(2,t.width-2)));
 assert.ok(clipped.some(t=>t.cells.some(c=>!allowed.has(c))));
 assert.ok(clipped.every(t=>tags.some(o=>o.cells[0]===t.cells[0]&&o.variant===t.variant)));
 assert.deepEqual(layoutDecisionTags(marks.map(m=>({...m,echo:true}))),[]);
});
