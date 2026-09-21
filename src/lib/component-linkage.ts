import { hermite, type Point } from './dendritic-linkage';

export type Box = { left: number; top: number; right: number; bottom: number; angle?: number; pivotX?: number; pivotY?: number };
export type LinkageSettings = { step: number; tension: number; ring: number; bow: number; arch: number; width: number; opacity: number; nodes: boolean; arcField: boolean; ringBlur: boolean };
export const LINKAGE_DEFAULTS: LinkageSettings = { step: 6, tension: 1.6, ring: 14.5, bow: 0, arch: 0, width: 4, opacity: 1, nodes: true, arcField: true, ringBlur: true };
type Strand = { points: Point[]; from: number; to: number };
export type ComponentNetwork = { ports: Point[]; forks: Point[]; strands: Strand[]; order: number[] };
const lerp = (a: Point, b: Point, t: number): Point => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

/** Dock on the real letter blocks, not on an unrelated point in the field. */
function dock(boxes: Box[], target: Point): Point {
  let result = target, nearest = Infinity;
  for (const box of boxes) {
    const point = { x: Math.max(box.left, Math.min(box.right, target.x)), y: Math.max(box.top, Math.min(box.bottom, target.y)) };
    const d = distance(point, target);
    if (d < nearest) { nearest = d; result = point; }
  }
  return result;
}

/** Place structural nodes directly at approximately STEP spacing on an arch.
 * No dense point cloud, corner cutting, or post-fit smoothing is involved. */
function structuralArch(a: Point, b: Point, control: Point, step: number): Point[] {
  const at = (t: number) => lerp(lerp(a, control, t), lerp(control, b, t), t);
  const points = [a];
  let t = 0;
  while (t < 1 && points.length < 2000) {
    const previous = points[points.length - 1];
    if (distance(previous, b) <= step) { if (distance(previous, b) > 1e-6) points.push(b); break; }
    let lo = t, hi = 1;
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2;
      if (distance(previous, at(mid)) < step) lo = mid; else hi = mid;
    }
    t = (lo + hi) / 2;
    points.push(at(t));
  }
  return points;
}

export function buildComponentNetwork(components: Box[][], settings: LinkageSettings): ComponentNetwork {
  const centers = components.map(boxes => ({
    x: (Math.min(...boxes.map(b => b.left)) + Math.max(...boxes.map(b => b.right))) / 2,
    y: (Math.min(...boxes.map(b => b.top)) + Math.max(...boxes.map(b => b.bottom))) / 2,
  }));
  const center = centers.reduce((c, p) => ({ x: c.x + p.x / centers.length, y: c.y + p.y / centers.length }), { x: 0, y: 0 });
  // Stable angular ordering keeps all four peers connected when they trade places.
  const order = centers.map((_, i) => i).sort((a, b) => Math.atan2(centers[a].y - center.y, centers[a].x - center.x)
    - Math.atan2(centers[b].y - center.y, centers[b].x - center.x));
  const ports = components.map(boxes => dock(boxes, center));
  const forks = ports.map(port => lerp(port, center, Math.min(.34, 60 / Math.max(1, distance(port, center)))));
  const strands: Strand[] = [];
  // Every component gets a stem into a degree-three fork; all widths remain equal.
  for (let i = 0; i < ports.length; i++) {
    strands.push({ from: i, to: i + ports.length, points: structuralArch(ports[i], forks[i], lerp(ports[i], forks[i], .5), settings.step) });
  }
  for (let i = 0; i < order.length; i++) {
    const a = order[i], b = order[(i + 1) % order.length];
    const mid = lerp(forks[a], forks[b], .5);
    const control = lerp(mid, center, settings.arch);
    strands.push({ from: a + ports.length, to: b + ports.length, points: structuralArch(forks[a], forks[b], control, settings.step) });
  }
  return { ports, forks, strands, order };
}

function drawStrand(ctx: CanvasRenderingContext2D, points: Point[], tension: number) {
  if (points.length < 2) return;
  ctx.beginPath(); ctx.moveTo(points[0].x, points[0].y);
  for (let i = 0; i < points.length - 1; i++) {
    const b = points[i], c = points[i + 1], a = points[i - 1] ?? lerp(c, b, 2), d = points[i + 2] ?? lerp(b, c, 2);
    for (let j = 1; j <= 12; j++) {
      const p = hermite(a, b, c, d, tension, j / 12);
      ctx.lineTo(p.x, p.y);
    }
  }
  ctx.stroke();
}

const cached = new WeakMap<HTMLCanvasElement, { key: string; layer: HTMLCanvasElement }>();
export function drawComponentLinkage(canvas: HTMLCanvasElement, context: CanvasRenderingContext2D, components: Box[][], settings: LinkageSettings) {
  const key = JSON.stringify([canvas.width, canvas.height, components, settings]);
  let entry = cached.get(canvas);
  if (!entry || entry.key !== key) {
    const layer = entry?.layer ?? document.createElement('canvas');
    layer.width = canvas.width; layer.height = canvas.height;
    const ctx = layer.getContext('2d');
    if (!ctx) return;
    const ratio = canvas.width / canvas.getBoundingClientRect().width;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    const graph = buildComponentNetwork(components, settings);
    ctx.strokeStyle = '#111'; ctx.lineWidth = settings.width;
    ctx.lineCap = 'butt'; ctx.lineJoin = 'miter';
    for (const strand of graph.strands) drawStrand(ctx, strand.points, settings.tension);
    const rings = graph.forks.map((fork, i) => {
      const id = i + graph.ports.length;
      const neighbors = graph.strands.flatMap(s => s.from === id ? [s.points[1]] : s.to === id ? [s.points[s.points.length - 2]] : []).filter(Boolean);
      // Shrink only for overlapping/near-touching text, so a ring cannot eat its entire stem.
      const radius = Math.min(settings.ring, distance(fork, graph.ports[i]) * .45,
        ...graph.forks.filter((_, index) => index !== i).map(p => distance(fork, p) * .24));
      const hubs = neighbors.map(p => {
        const angle = Math.atan2(p.y - fork.y, p.x - fork.x);
        return { x: fork.x + radius * Math.cos(angle), y: fork.y + radius * Math.sin(angle), angle };
      }).sort((a, b) => a.angle - b.angle);
      return { fork, radius, hubs };
    });
    ctx.globalCompositeOperation = 'destination-out';
    for (const { fork, radius } of rings) { ctx.beginPath(); ctx.arc(fork.x, fork.y, radius, 0, Math.PI * 2); ctx.fill(); }
    ctx.globalCompositeOperation = 'source-over';
    for (const { fork, radius, hubs } of rings) {
      if (radius < .01 || hubs.length < 3) continue;
      ctx.beginPath(); ctx.moveTo(hubs[0].x, hubs[0].y);
      for (let i = 0; i < hubs.length; i++) {
        const a = hubs[i], b = hubs[(i + 1) % hubs.length];
        const control = lerp(fork, lerp(a, b, .5), settings.bow);
        ctx.quadraticCurveTo(control.x, control.y, b.x, b.y);
      }
      ctx.closePath(); ctx.stroke();
    }
    if (settings.nodes) {
      ctx.fillStyle = '#111';
      for (const strand of graph.strands) for (const p of strand.points) {
        if (rings.some(r => distance(p, r.fork) < r.radius)) continue;
        ctx.beginPath(); ctx.arc(p.x, p.y, 1.5, 0, Math.PI * 2); ctx.fill();
      }
    }
    entry = { key, layer }; cached.set(canvas, entry);
    canvas.dataset.linkagePorts = String(graph.ports.length);
    canvas.dataset.linkageAnchors = JSON.stringify(graph.ports);
  }
  context.save(); context.setTransform(1, 0, 0, 1, 0, 0);
  context.globalAlpha = settings.opacity; context.drawImage(entry.layer, 0, 0); context.restore();
}
