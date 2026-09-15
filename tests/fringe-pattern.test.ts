import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { fringeSymbols } from '../src/lib/fringe-pattern';
test('symbols stay in black cells, preserve holes, and remain stable as input order changes',()=>{
 const marks=Array.from({length:400},(_,i)=>{const column=i%20,row=Math.floor(i/20);return {position:new Vector3(column*.055,row*.055,0),column,row,echo:i%11===0};});
 const symbols=fringeSymbols(marks),black=new Set(marks.filter(m=>!m.echo).map(m=>`${m.column}:${m.row}`));
 assert.equal(new Set(symbols.map(s=>s.shape)).size,4);
 assert.ok(symbols.some(s=>s.span===2));
 const used=symbols.flatMap(s=>s.cells);
 assert.ok(used.every(key=>black.has(key)));
 assert.equal(new Set(used).size,used.length);
 assert.deepEqual(symbols,fringeSymbols([...marks].reverse()));
 assert.deepEqual(fringeSymbols(marks.filter(m=>m.echo)),[]);
});
