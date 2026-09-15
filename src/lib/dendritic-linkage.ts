/** Growth nodes are structural. Hermite samples belong only to the renderer. */
export type Point = { x: number; y: number };
export type Proximity = { step: number; pull: number; consume: number; dots: number; seeds: number };
export type Curve = { tension: number; ring: number; bow: number; width: number };
export const PROXIMITY: Proximity = { step: 14, pull: 30, consume: 15.5, dots: 5000, seeds: 10 };
export const CURVE: Curve = { tension: .8, ring: 16, bow: 0, width: 1 };
export type Node = Point & { parent: number; children: number[]; descendants: number };
export type Strand = { nodes: number[]; before: number };
export type Network = { nodes: Node[]; attractors: Point[]; live: number[]; roots: number[]; strands: Strand[]; iterations: number; limited: boolean };

export function mulberry32(seed: number) {
  return () => {
    let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

export class SpatialGrid {
  private cells = new Map<string, number[]>();
  constructor(readonly cell: number, readonly points: Point[]) {}
  add(index: number) {
    const p = this.points[index], key = `${Math.floor(p.x / this.cell)},${Math.floor(p.y / this.cell)}`;
    const bucket = this.cells.get(key);
    if (bucket) bucket.push(index); else this.cells.set(key, [index]);
  }
  nearest(p: Point, radius: number) {
    const cx = Math.floor(p.x / this.cell), cy = Math.floor(p.y / this.cell), range = Math.ceil(radius / this.cell);
    let best = -1, distance2 = radius * radius;
    for (let y = cy - range; y <= cy + range; y++) for (let x = cx - range; x <= cx + range; x++) {
      for (const id of this.cells.get(`${x},${y}`) ?? []) {
        const n = this.points[id], d = (p.x - n.x) ** 2 + (p.y - n.y) ** 2;
        if (d < distance2 || (d === distance2 && (best < 0 || id < best))) { best = id; distance2 = d; }
      }
    }
    return { id: best, distance2 };
  }
}

export function buildNetwork(seed: number, radius: number, p: Proximity): Network {
  const rnd = mulberry32(seed);
  const attractors = Array.from({ length: p.dots }, () => {
    const angle = rnd() * Math.PI * 2, r = radius * rnd() ** .6;
    return { x: Math.cos(angle) * r, y: Math.sin(angle) * r };
  });
  // Independent stream: changing DOTS never moves the seed nodes.
  const seedRnd = mulberry32(seed ^ 0x9e3779b9), phase = seedRnd() * Math.PI * 2;
  const nodes: Node[] = [], roots: number[] = [];
  for (let i = 0; i < p.seeds; i++) {
    const angle = phase + i * Math.PI * (3 - Math.sqrt(5));
    const r = radius * .58 * Math.sqrt((i + .5) / p.seeds);
    roots.push(nodes.length);
    nodes.push({ x: Math.cos(angle) * r, y: Math.sin(angle) * r, parent: -1, children: [], descendants: 0 });
  }
  const grid = new SpatialGrid(p.pull, nodes);
  roots.forEach(id => grid.add(id));
  let live = attractors.map((_, i) => i), iterations = 0, nearEmpty = 0;
  // Safety ceilings are reported, never silently treated as convergence.
  const maxIterations = 600, maxNodes = 24000;
  while (live.length && iterations < maxIterations && nodes.length < maxNodes) {
    iterations++;
    const pulls = new Map<number, Point>(), remaining: number[] = [];
    for (const id of live) {
      const a = attractors[id], nearest = grid.nearest(a, Math.max(p.pull, p.consume));
      if (nearest.id >= 0 && nearest.distance2 <= p.consume ** 2) continue;
      remaining.push(id);
      if (nearest.id < 0 || nearest.distance2 > p.pull ** 2) continue;
      const n = nodes[nearest.id], distance = Math.sqrt(nearest.distance2);
      const pull = pulls.get(nearest.id) ?? { x: 0, y: 0 };
      pull.x += (a.x - n.x) / distance;
      pull.y += (a.y - n.y) / distance;
      pulls.set(nearest.id, pull);
    }
    live = remaining;
    if (!pulls.size) break;
    let added = 0;
    // All pulls are evaluated before adding children: one synchronous generation.
    for (const [parent, pull] of pulls) {
      const length = Math.hypot(pull.x, pull.y);
      if (length < 1e-10 || nodes.length >= maxNodes) continue;
      const n = nodes[parent], id = nodes.length;
      const child = { x: n.x + p.step * pull.x / length, y: n.y + p.step * pull.y / length };
      // A balanced residual pull can propose the exact same child repeatedly.
      // It is not a new structural node; do not stack duplicate edges there.
      if (grid.nearest(child, 1e-6).id >= 0) continue;
      nodes.push({ ...child, parent, children: [], descendants: 0 });
      n.children.push(id);
      grid.add(id);
      added++;
    }
    nearEmpty = added <= 2 ? nearEmpty + 1 : 0;
    if (!added || nearEmpty >= 6) break;
  }
  // Parents always precede children, so reverse order computes exact subtree sizes.
  for (let i = nodes.length - 1; i >= 0; i--) {
    const n = nodes[i];
    n.children.sort((a, b) => nodes[b].descendants - nodes[a].descendants || a - b);
    if (n.parent >= 0) nodes[n.parent].descendants += n.descendants + 1;
  }
  const strands: Strand[] = [];
  const pending = roots.map(root => ({ nodes: [root], before: -1 }));
  while (pending.length) {
    const strand = pending.pop()!;
    let id = strand.nodes[strand.nodes.length - 1];
    while (nodes[id].children.length) {
      const [continuation, ...sides] = nodes[id].children;
      for (const side of sides) pending.push({ nodes: [id, side], before: nodes[id].parent });
      strand.nodes.push(continuation);
      id = continuation;
    }
    if (strand.nodes.length > 1) strands.push(strand);
  }
  return { nodes, attractors, live, roots, strands, iterations,
    limited: iterations >= maxIterations || nodes.length >= maxNodes };
}

export function hermite(a: Point, b: Point, c: Point, d: Point, tension: number, t: number): Point {
  const t2 = t * t, t3 = t2 * t;
  const h00 = 2 * t3 - 3 * t2 + 1, h10 = t3 - 2 * t2 + t;
  const h01 = -2 * t3 + 3 * t2, h11 = t3 - t2;
  return {
    x: h00 * b.x + h10 * tension * (c.x - a.x) + h01 * c.x + h11 * tension * (d.x - b.x),
    y: h00 * b.y + h10 * tension * (c.y - a.y) + h01 * c.y + h11 * tension * (d.y - b.y),
  };
}
const reflect = (center: Point, p: Point): Point => ({ x: 2 * center.x - p.x, y: 2 * center.y - p.y });
export function sampleStrand(network: Network, strand: Strand, tension: number): Point[] {
  const points = strand.nodes.map(i => network.nodes[i]);
  const result: Point[] = [points[0]];
  for (let i = 0; i < points.length - 1; i++) {
    const b = points[i], c = points[i + 1];
    const a = points[i - 1] ?? (strand.before >= 0 ? network.nodes[strand.before] : reflect(b, c));
    const d = points[i + 2] ?? reflect(c, b);
    // Rasterization samples, NOT new growth nodes or a smoothing pass.
    const samples = Math.max(12, Math.ceil(Math.hypot(c.x - b.x, c.y - b.y) / 1.5));
    for (let j = 1; j <= samples; j++) result.push(hermite(a, b, c, d, tension, j / samples));
  }
  return result;
}

export function forkRing(network: Network, id: number, ring: number, bow: number) {
  const fork = network.nodes[id];
  const incident = [...(fork.parent >= 0 ? [fork.parent] : []), ...fork.children];
  if (incident.length < 3) return null;
  const hubs = incident.map(i => {
    const n = network.nodes[i], angle = Math.atan2(n.y - fork.y, n.x - fork.x);
    return { x: fork.x + ring * Math.cos(angle), y: fork.y + ring * Math.sin(angle), angle };
  }).sort((a, b) => a.angle - b.angle);
  const arcs = hubs.map((start, i) => {
    const end = hubs[(i + 1) % hubs.length];
    return { start, end, control: {
      x: fork.x + ((start.x + end.x) / 2 - fork.x) * bow,
      y: fork.y + ((start.y + end.y) / 2 - fork.y) * bow,
    } };
  });
  return { fork, hubs, arcs };
}

/** Opaque, even strokes first. Opacity is applied once when compositing this layer. */
export function renderNetwork(ctx: CanvasRenderingContext2D, network: Network, curve: Curve) {
  ctx.save();
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
  ctx.strokeStyle = "#111";
  ctx.lineWidth = curve.width;
  ctx.lineCap = "butt";
  ctx.lineJoin = "miter";
  for (const strand of network.strands) {
    const points = sampleStrand(network, strand, curve.tension);
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
    ctx.stroke();
  }
  const rings = network.nodes.map((_, id) => forkRing(network, id, curve.ring, curve.bow)).filter(r => r !== null);
  if (curve.ring > 0) {
    // Erase every disc before reconnecting, so a later fork cannot erase an earlier ring.
    ctx.globalCompositeOperation = "destination-out";
    ctx.fillStyle = "#000";
    for (const { fork } of rings) {
      ctx.beginPath(); ctx.arc(fork.x, fork.y, curve.ring, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalCompositeOperation = "source-over";
    for (const { arcs } of rings) {
      ctx.beginPath(); ctx.moveTo(arcs[0].start.x, arcs[0].start.y);
      for (const { control, end } of arcs) ctx.quadraticCurveTo(control.x, control.y, end.x, end.y);
      ctx.closePath(); ctx.stroke();
    }
  }
  ctx.restore();
}
