import test from 'node:test';
import assert from 'node:assert/strict';
import { buildComponentNetwork, LINKAGE_DEFAULTS, type Box } from '../src/lib/component-linkage';
const boxes: Box[][] = [
 [{left:70,top:220,right:310,bottom:320}], [{left:710,top:110,right:880,bottom:200}],
 [{left:180,top:550,right:350,bottom:590}], [{left:810,top:490,right:920,bottom:540}],
];
test('all four letter-bound ports belong to one connected loop with degree-three forks',()=>{
 const graph=buildComponentNetwork(boxes,LINKAGE_DEFAULTS);
 assert.equal(graph.ports.length,4);
 const adjacent=Array.from({length:8},()=>new Set<number>());
 for(const s of graph.strands){adjacent[s.from].add(s.to);adjacent[s.to].add(s.from);}
 const visited=new Set<number>([0]), queue=[0];
 while(queue.length)for(const i of adjacent[queue.shift()!])if(!visited.has(i)){visited.add(i);queue.push(i);}
 assert.equal(visited.size,8);
 for(let i=0;i<4;i++){
  assert.equal(adjacent[i].size,1);assert.equal(adjacent[i+4].size,3);
  const p=graph.ports[i],b=boxes[i][0];
  assert.ok(p.x>=b.left&&p.x<=b.right&&p.y>=b.top&&p.y<=b.bottom);
  assert.ok(p.x===b.left||p.x===b.right||p.y===b.top||p.y===b.bottom);
 }
 for(const s of graph.strands)for(let i=1;i<s.points.length-1;i++)assert.ok(Math.abs(Math.hypot(s.points[i].x-s.points[i-1].x,s.points[i].y-s.points[i-1].y)-6)<.001);
});
test('dragging a component moves its docking point and reshapes attached paths',()=>{
 const original=buildComponentNetwork(boxes,LINKAGE_DEFAULTS);
 const moved=boxes.map((list,i)=>list.map(b=>i===0?{left:b.left+100,right:b.right+100,top:b.top-90,bottom:b.bottom-90}:b));
 const updated=buildComponentNetwork(moved,LINKAGE_DEFAULTS);
 assert.notDeepEqual(original.ports[0],updated.ports[0]);
 assert.notDeepEqual(original.strands,updated.strands);
 assert.equal(updated.strands.length,8);
});
test('overlapping and coincident components remain finite',()=>{
 for(const setup of [boxes.map(()=>boxes[0]),boxes.map((b,i)=>i<2?boxes[0]:b)]){
  const graph=buildComponentNetwork(setup,LINKAGE_DEFAULTS);
  for(const s of graph.strands)for(const p of s.points)assert.ok(Number.isFinite(p.x)&&Number.isFinite(p.y));
 }
});
