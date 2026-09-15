import { CIRCLE_GRID, QUARTER_TURN, createQuarterPattern, type QuarterPattern, type ArcGroup } from './circle-system';
import type { Box } from './component-linkage';

type Grid = { columns: number; rows: number; stepX: number; stepY: number };
const smooth = (a: number, b: number, value: number) => {
  const t = Math.max(0, Math.min(1, (value - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const groupKey = (g: ArcGroup) => `${g.cell}:${g.start}:${g.length}:${g.direction}`;
const cache = new WeakMap<HTMLCanvasElement, {
  seed: number; epoch: number; patterns: Map<string, QuarterPattern>;
  geometry: string; solids: Float32Array; time: number;
}>();

/** 08's actual tangent-circle walks become the porous part of 09's territory.
 * The existing eased territory mask drives their appearance while dragging. */
export function drawThinkingArcs(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D, seed: number, time: number,
  grid: Grid, coverage: Float32Array, boxes: Box[]): Float32Array {
  const { columns, rows, stepX, stepY } = grid;
  const unit = Math.min(stepX, stepY), position = time / 6500;
  const epoch = Math.floor(position), progress = position - epoch;
  let state = cache.get(canvas);
  if (!state || state.seed !== seed) {
    state = { seed, epoch, patterns: new Map(), geometry: '', solids: new Float32Array(columns * rows), time };
    cache.set(canvas, state);
  }
  if (state.epoch !== epoch) {
    // Two generations per tile, bounded even during indefinite playback.
    for (const key of state.patterns.keys()) if (Number(key.split(':')[1]) < epoch) state.patterns.delete(key);
    state.epoch = epoch;
  }
  const geometry = JSON.stringify([grid, boxes]);
  const elapsed = Math.max(0, Math.min(100, time - state.time));
  state.time = time;
  const fresh = state.solids.length !== columns * rows || !state.geometry;
  if (fresh) state.solids = new Float32Array(columns * rows);
  // Continue easing even when the pointer has stopped.
  for (let row = 0; row < rows; row++) for (let col = 0; col < columns; col++) {
    const x = (col + .5) * stepX, y = (row + .5) * stepY, id = row * columns + col;
    let nearest = Infinity;
    for (const b of boxes) nearest = Math.min(nearest, Math.hypot(Math.max(b.left - x, x - b.right, 0), Math.max(b.top - y, y - b.bottom, 0)));
    const target = 1 - smooth(unit * 1.25, unit * 4.8, nearest);
    const response = fresh || time === 0 ? 1 : 1 - Math.exp(-elapsed / 650);
    state.solids[id] += (target - state.solids[id]) * response;
  }
  state.geometry = geometry;
  const pattern = (tile: number, revision: number) => {
    const key = `${tile}:${revision}`;
    let p = state!.patterns.get(key);
    if (!p) { p = createQuarterPattern(seed + tile * 7919, 1.65, revision); state!.patterns.set(key, p); }
    return p;
  };
  const fade = (g: ArcGroup, count: number, adding: boolean) => {
    const rank = g.order / Math.max(1, count - 1);
    const delay = (adding ? rank : 1 - rank) * .45;
    const amount = smooth(delay, delay + .45, progress);
    return adding ? amount : 1 - amount;
  };
  ctx.save();
  ctx.lineCap = 'butt';
  const tilesX = Math.ceil(columns / CIRCLE_GRID), tilesY = Math.ceil(rows / CIRCLE_GRID);
  let visible = 0;
  for (let ty = 0; ty < tilesY; ty++) for (let tx = 0; tx < tilesX; tx++) {
    const tile = ty * tilesX + tx, from = pattern(tile, epoch), to = pattern(tile, epoch + 1);
    const fromKeys = new Set(from.groups.map(groupKey)), toKeys = new Set(to.groups.map(groupKey));
    const groups = [
      ...from.groups.map(g => ({ g, fade: toKeys.has(groupKey(g)) ? 1 : fade(g, from.groups.length, false) })),
      ...to.groups.filter(g => !fromKeys.has(groupKey(g))).map(g => ({ g, fade: fade(g, to.groups.length, true) })),
    ];
    for (const { g, fade: f } of groups) {
      const col = tx * CIRCLE_GRID + g.cell % CIRCLE_GRID, row = ty * CIRCLE_GRID + Math.floor(g.cell / CIRCLE_GRID);
      if (col >= columns || row >= rows) continue;
      const id = row * columns + col;
      const openness = 1 - state.solids[id];
      const alpha = coverage[id] * openness * f;
      if (alpha < .025) continue;
      visible++;
      const x = (col + .5) * stepX, y = (row + .5) * stepY, angle = g.start * QUARTER_TURN;
      // Slightly elliptical only to respect the existing responsive grid:
      // adjacent cardinal endpoints meet exactly in either axis.
      ctx.strokeStyle = '#aaa'; ctx.globalAlpha = alpha * .20; ctx.lineWidth = .8;
      ctx.beginPath(); ctx.ellipse(x, y, stepX / 2, stepY / 2, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = '#111'; ctx.globalAlpha = alpha * .85; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.ellipse(x, y, stepX / 2, stepY / 2, 0, angle,
        angle + g.direction * g.length * QUARTER_TURN, g.direction < 0); ctx.stroke();
    }
  }
  ctx.restore();
  canvas.dataset.thinkingArcs = String(visible);
  return state.solids;
}
