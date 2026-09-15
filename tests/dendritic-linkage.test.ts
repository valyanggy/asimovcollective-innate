import test from 'node:test';
import assert from 'node:assert/strict';
import { buildNetwork, PROXIMITY, SpatialGrid, hermite, sampleStrand, forkRing, renderNetwork, CURVE } from '../src/lib/dendritic-linkage';
const graph = buildNetwork(41729, 300, PROXIMITY);

test('growth is deterministic, sparse, acyclic and exactly STEP long', () => {
  assert.deepEqual(graph, buildNetwork(41729, 300, PROXIMITY));
  assert.equal(graph.roots.length, 10);
  assert.ok(graph.nodes.length > 300);
  assert.equal(graph.limited, false);
  for (const [i, n] of graph.nodes.entries()) {
    if (n.parent < 0) continue;
    assert.ok(n.parent < i);
    const p = graph.nodes[n.parent];
    assert.ok(Math.abs(Math.hypot(n.x - p.x, n.y - p.y) - 14) < 1e-10);
    assert.ok(p.children.includes(i));
  }
});

test('changing DOTS preserves the existing attractors and seeds', () => {
  const fewer = buildNetwork(41729, 300, { ...PROXIMITY, dots: 4000 });
  assert.deepEqual(fewer.attractors, graph.attractors.slice(0, 4000));
  assert.deepEqual(fewer.roots.map(id => [fewer.nodes[id].x, fewer.nodes[id].y]), graph.roots.map(id => [graph.nodes[id].x, graph.nodes[id].y]));
});

test('spatial nearest search agrees with brute force, including negative cells and consume > pull', () => {
  const grid = new SpatialGrid(30, graph.nodes);
  graph.nodes.forEach((_, i) => grid.add(i));
  for (const p of graph.attractors.slice(0, 160)) {
    for (const radius of [15.5, 30, 70]) {
      const brute = graph.nodes.map((n, id) => ({ id, d: (n.x - p.x) ** 2 + (n.y - p.y) ** 2 }))
        .filter(n => n.d <= radius ** 2).sort((a, b) => a.d - b.d || a.id - b.id)[0];
      assert.equal(grid.nearest(p, radius).id, brute?.id ?? -1);
    }
  }
});

test('strands cover every tree edge exactly once and continue down the largest subtree', () => {
  const edges = new Set<string>();
  for (const s of graph.strands) {
    for (let i = 1; i < s.nodes.length; i++) {
      const key = `${s.nodes[i - 1]}:${s.nodes[i]}`;
      assert.ok(!edges.has(key)); edges.add(key);
      assert.equal(graph.nodes[s.nodes[i]].parent, s.nodes[i - 1]);
      if (i > 1) assert.equal(graph.nodes[s.nodes[i - 1]].children[0], s.nodes[i]);
    }
  }
  assert.equal(edges.size, graph.nodes.length - graph.roots.length);
  for (const n of graph.nodes) {
    assert.equal(n.descendants, n.children.reduce((sum, id) => sum + graph.nodes[id].descendants + 1, 0));
    for (let i = 1; i < n.children.length; i++) assert.ok(graph.nodes[n.children[i - 1]].descendants >= graph.nodes[n.children[i]].descendants);
  }
});

test('cardinal samples interpolate all original nodes; endpoint derivatives match the specified tangents', () => {
  const [a,b,c,d] = [{x:0,y:0},{x:14,y:6},{x:26,y:18},{x:39,y:13}];
  assert.deepEqual(hermite(a,b,c,d,.8,0),b);
  assert.deepEqual(hermite(a,b,c,d,.8,1),c);
  const epsilon = 1e-6, next = hermite(a,b,c,d,.8,epsilon);
  assert.ok(Math.abs((next.x-b.x)/epsilon - .8*(c.x-a.x)) < .001);
  assert.ok(Math.abs((next.y-b.y)/epsilon - .8*(c.y-a.y)) < .001);
  for (const strand of graph.strands) {
    const samples = sampleStrand(graph,strand,.8);
    for (const id of strand.nodes) assert.ok(samples.some(p => Math.hypot(p.x-graph.nodes[id].x,p.y-graph.nodes[id].y)<1e-9));
  }
});

test('forks are angularly sorted closed cycles with hubs at RING and inward controls', () => {
  let forks = 0;
  for (let id=0;id<graph.nodes.length;id++) {
    const ring = forkRing(graph,id,16,0);
    if (!ring) continue;
    forks++;
    assert.ok(ring.hubs.length>=3);
    for (let i=0;i<ring.hubs.length;i++) {
      const h=ring.hubs[i];
      assert.ok(Math.abs(Math.hypot(h.x-ring.fork.x,h.y-ring.fork.y)-16)<1e-9);
      assert.deepEqual(ring.arcs[i].control,{x:ring.fork.x,y:ring.fork.y});
      assert.deepEqual(ring.arcs[i].end,ring.hubs[(i+1)%ring.hubs.length]);
      if (i) assert.ok(h.angle>=ring.hubs[i-1].angle);
    }
  }
  assert.ok(forks>10);
});

test('renderer erases on transparent layer before bowed reconnection, with one uniform stroke style', () => {
  const events: string[]=[];
  const mock = new Proxy({} as CanvasRenderingContext2D, {
    set(target, key, value) { events.push(`${String(key)}=${value}`); return Reflect.set(target,key,value); },
    get(target, key) { return Reflect.get(target,key) ?? ((..._args: unknown[])=>{events.push(String(key));}); },
  });
  renderNetwork(mock,graph,CURVE);
  const erase=events.indexOf('globalCompositeOperation=destination-out');
  const reconnect=events.indexOf('globalCompositeOperation=source-over',erase);
  assert.ok(erase>0 && reconnect>erase);
  assert.ok(events.indexOf('quadraticCurveTo')>reconnect);
  assert.equal(events.filter(e=>e.startsWith('lineWidth=')).length,1);
  assert.ok(!events.includes('lineCap=round'));
});
