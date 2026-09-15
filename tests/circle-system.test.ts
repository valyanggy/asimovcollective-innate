import assert from "node:assert/strict";
import test from "node:test";
import { CIRCLE_GRID, createBackgroundArc, createQuarterPattern, quarterOpacity } from "../src/lib/circle-system";

// Quarter endpoints lie on an integer lattice when each circle has radius 1
// and neighboring centers are 2 apart. Matching endpoints prove connectivity.
const cardinal = [[1, 0], [0, 1], [-1, 0], [0, -1]];
function endpoints(id: number) {
  const cell = Math.floor(id / 4), q = id % 4;
  const x = cell % CIRCLE_GRID * 2, y = Math.floor(cell / CIRCLE_GRID) * 2;
  return [q, (q + 1) % 4].map(index => `${x + cardinal[index][0]},${y + cardinal[index][1]}`);
}

test("every generated motif is one connected set of canonical quarter arcs", () => {
  for (const seed of [8, 73, 901]) for (const density of [.6, 1, 1.8]) {
    const pattern = createQuarterPattern(seed, density);
    const ids = Array.from(pattern.arcs.keys()).filter(id => pattern.arcs[id]);
    const expected = 64 * density;
    assert.ok(ids.length >= Math.floor(expected * .68) && ids.length <= Math.ceil(expected * 1.32));
    const edges = new Map<string, number[]>();
    for (const id of ids) for (const point of endpoints(id)) edges.set(point, [...edges.get(point) || [], id]);
    const visited = new Set<number>(), pending = [ids[0]];
    while (pending.length) {
      const id = pending.pop()!;
      if (visited.has(id)) continue;
      visited.add(id);
      for (const point of endpoints(id)) pending.push(...edges.get(point)! .filter(next => !visited.has(next)));
    }
    assert.equal(visited.size, ids.length);
    assert.ok(pattern.groups.every(group => group.length >= 1 && group.length <= 3));
    assert.equal(pattern.groups.reduce((sum, group) => sum + group.length, 0), pattern.count);
  }
});

test("the system deliberately mixes quarter, half, and three-quarter marks", () => {
  const lengths = new Set<number>();
  const counts = [0, 0, 0, 0];
  const patternSizes = new Set<number>();
  for (let panel = 0; panel < 64; panel++) for (let revision = 0; revision < 3; revision++) {
    const pattern = createQuarterPattern(8 * 7919 + panel * 313, 1, revision);
    pattern.groups.forEach(group => { lengths.add(group.length); counts[group.length]++; });
    patternSizes.add(pattern.count);
  }
  assert.deepEqual([...lengths].sort(), [1, 2, 3]);
  const groupTotal = counts[1] + counts[2] + counts[3];
  assert.ok(counts[1] / groupTotal > .55, "Quarter circles should strongly dominate the result");
  assert.ok(counts[2] / groupTotal > .2, "Half circles should remain common");
  assert.ok(counts[3] / groupTotal < .15, "Three-quarter circles should be occasional accents");
  assert.ok(patternSizes.size > 20, "Pattern size should vary rather than use a fixed quota");
});

test("the background field replaces some full circles with partial circles", () => {
  const counts = [0, 0, 0, 0, 0];
  const starts = new Set<number>();
  for (let panel = 0; panel < 8; panel++) for (let cell = 0; cell < CIRCLE_GRID ** 2; cell++) {
    const arc = createBackgroundArc(8, panel, cell);
    counts[arc.length]++;
    starts.add(arc.start);
  }
  const total = counts[2] + counts[3] + counts[4];
  assert.ok(counts[4] / total > .62, "Full circles should remain the quiet field structure");
  assert.ok(counts[2] / total > .07, "Half circles should appear throughout the field");
  assert.ok(counts[3] / total > .12, "Three-quarter circles should appear throughout the field");
  assert.deepEqual([...starts].sort(), [0, 1, 2, 3]);
});

test("quarter fades land exactly on the next configuration without a loop jump", () => {
  const from = createQuarterPattern(8, 1, 0), to = createQuarterPattern(8, 1, 1);
  const next = createQuarterPattern(8, 1, 2);
  for (let id = 0; id < from.arcs.length; id++) {
    assert.equal(quarterOpacity(from, to, id, 0), from.arcs[id]);
    assert.equal(quarterOpacity(from, to, id, 1), quarterOpacity(to, next, id, 0));
    for (const t of [.15, .5, .85]) {
      const alpha = quarterOpacity(from, to, id, t);
      assert.ok(Number.isFinite(alpha) && alpha >= 0 && alpha <= 1);
    }
  }
});
