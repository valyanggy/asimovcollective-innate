export const CIRCLE_GRID = 16;
export const PATTERN_COUNT = 8;
const MORPH_SECONDS = 5;
export const QUARTER_TURN = Math.PI / 2;
export type ArcGroup = { cell: number; start: number; length: 1 | 2 | 3; direction: 1 | -1; order: number };
export type QuarterPattern = {
  arcs: Uint8Array;
  order: Int16Array;
  count: number;
  groups: ArcGroup[];
};
export type CircleSystemOptions = { seed: number; speed: number; density: number; playing: boolean };
export type BackgroundArc = { start: number; length: 2 | 3 | 4 };
type ArcStep = { col: number; row: number; quarter: number; direction: number };
const DELTAS = [[1, 0], [0, 1], [-1, 0], [0, -1]];

function random(seed: number) {
  let value = (seed + 0x6d2b79f5) | 0;
  value = Math.imul(value ^ (value >>> 15), value | 1);
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
  return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
}
const arcId = (step: ArcStep) => (step.row * CIRCLE_GRID + step.col) * 4 + step.quarter;

/** Most background cells stay complete. A seeded minority lose one or two
 * quarters so the field quietly shares the foreground system's vocabulary. */
export function createBackgroundArc(seed: number, panel: number, cell: number): BackgroundArc {
  const localSeed = seed * 1201 + panel * 409 + cell * 37;
  const choice = random(localSeed);
  return {
    start: Math.floor(random(localSeed + 19) * 4),
    length: choice < .7 ? 4 : choice < .88 ? 3 : 2,
  };
}

/** Continue from a cardinal endpoint, either on this circle or its tangent
 * neighbor. Crossing circles reverses direction, preserving a smooth join. */
function continuations(step: ArcStep): ArcStep[] {
  const end = (step.quarter + (step.direction > 0 ? 1 : 0)) % 4;
  const same = { ...step, quarter: (end + (step.direction > 0 ? 0 : 3)) % 4 };
  const [dx, dy] = DELTAS[end];
  const col = step.col + dx, row = step.row + dy;
  if (col < 0 || col >= CIRCLE_GRID || row < 0 || row >= CIRCLE_GRID) return [same];
  const entry = (end + 2) % 4, direction = -step.direction;
  return [same, { col, row, quarter: (entry + (direction > 0 ? 0 : 3)) % 4, direction }];
}

function openContinuations(history: ArcStep[], arcs: Uint8Array, seed: number): ArcStep | null {
  for (let attempt = 0; attempt < history.length * 3; attempt++) {
    const branch = history[Math.floor(random(seed + attempt * 71) * history.length)];
    const reversed = { ...branch, direction: -branch.direction };
    const options = [...continuations(branch), ...continuations(reversed)].filter(candidate => {
      const base = (candidate.row * CIRCLE_GRID + candidate.col) * 4;
      const used = arcs[base] + arcs[base + 1] + arcs[base + 2] + arcs[base + 3];
      return !arcs[arcId(candidate)] && used < 3;
    });
    if (options.length) return options[Math.floor(random(seed + attempt * 97 + 19) * options.length)];
  }
  return null;
}

/** Quarter arcs remain the underlying grid units. Each walk step deliberately
 * groups one, two, or three consecutive quarters on one circle, producing a
 * seeded mix of ¼-, ½-, and ¾-circle marks before crossing to a tangent circle. */
export function createQuarterPattern(seed: number, density = 1, revision = 0): QuarterPattern {
  const arcs = new Uint8Array(CIRCLE_GRID * CIRCLE_GRID * 4);
  const order = new Int16Array(arcs.length).fill(-1);
  const groups: ArcGroup[] = [];
  const variantSeed = seed + revision * 1013;
  // Density controls the expected size, while every panel and revision gets
  // an independent ±32% variation instead of aiming for a fixed arc count.
  const expected = 64 * Math.max(.6, Math.min(1.8, density));
  const budget = Math.round(expected * (.68 + random(variantSeed + 17) * .64));
  const history: ArcStep[] = [];
  let step: ArcStep = { col: 2 + Math.floor(random(seed + 1) * 12), row: 2 + Math.floor(random(seed + 2) * 12),
    quarter: Math.floor(random(seed + 3) * 4), direction: random(seed + 4) < .5 ? -1 : 1 };
  let count = 0;
  for (let attempt = 0; count < budget && attempt < budget * 30; attempt++) {
    const choice = random(variantSeed + attempt * 53);
    // Each mark rolls independently: 65% quarter, 28% half, 7% three-quarter.
    // Collisions can shorten a mark, which adds more organic local variation.
    const wanted = choice < .65 ? 1 : choice < .93 ? 2 : 3;
    const run: ArcStep[] = [];
    let cursor = step;
    for (let length = 0; length < wanted && count + run.length < budget; length++) {
      const base = (cursor.row * CIRCLE_GRID + cursor.col) * 4;
      const used = arcs[base] + arcs[base + 1] + arcs[base + 2] + arcs[base + 3]
        + run.filter(item => item.col === cursor.col && item.row === cursor.row).length;
      if (arcs[arcId(cursor)] || run.some(item => arcId(item) === arcId(cursor)) || used >= 3) break;
      run.push(cursor);
      cursor = continuations(cursor)[0];
    }
    if (run.length) {
      const groupOrder = groups.length;
      for (const item of run) {
        const id = arcId(item);
        arcs[id] = 1;
        order[id] = groupOrder;
        history.push(item);
      }
      const first = run[0];
      groups.push({
        cell: first.row * CIRCLE_GRID + first.col,
        start: (first.quarter + (first.direction > 0 ? 0 : 1)) % 4,
        length: run.length as 1 | 2 | 3,
        direction: first.direction > 0 ? 1 : -1,
        order: groupOrder,
      });
      count += run.length;
      const crossing = continuations(run[run.length - 1])[1];
      if (crossing && !arcs[arcId(crossing)]) { step = crossing; continue; }
    }
    const next = openContinuations(history, arcs, variantSeed + attempt * 131);
    if (next) step = next;
  }
  return { arcs, order, count, groups };
}

export function quarterOpacity(from: QuarterPattern, to: QuarterPattern, id: number, progress: number) {
  if (from.arcs[id] === to.arcs[id]) return from.arcs[id];
  const rank = to.arcs[id] ? to.order[id] / Math.max(1, to.count - 1)
    : 1 - from.order[id] / Math.max(1, from.count - 1);
  const delay = rank * .55;
  const t = Math.max(0, Math.min(1, (progress - delay) / .35));
  const fade = t * t * (3 - 2 * t);
  return to.arcs[id] ? fade : 1 - fade;
}

const groupKey = ({ cell, start, length, direction }: ArcGroup) => `${cell}:${start}:${length}:${direction}`;
function groupOpacity(group: ArcGroup, adding: boolean, groupCount: number, progress: number) {
  const rank = adding ? group.order / Math.max(1, groupCount - 1)
    : 1 - group.order / Math.max(1, groupCount - 1);
  const delay = rank * .55;
  const t = Math.max(0, Math.min(1, (progress - delay) / .35));
  const fade = t * t * (3 - 2 * t);
  return adding ? fade : 1 - fade;
}

type Panel = { canvas: HTMLCanvasElement; context: CanvasRenderingContext2D; base: HTMLCanvasElement; size: number; ratio: number };

/** Owns only 2D drawing and motion; React owns the controls and navigation. */
export class CircleSystemRenderer {
  private readonly panels: Panel[];
  private readonly resizeObserver: ResizeObserver;
  private readonly reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  private animation = 0;
  private elapsed = 0;
  private lastTime = 0;
  private lastDraw = 0;
  private disposed = false;
  private options: CircleSystemOptions;
  private readonly patternCache = new Map<string, QuarterPattern>();

  constructor(canvases: HTMLCanvasElement[], options: CircleSystemOptions) {
    this.options = options;
    this.panels = canvases.map(canvas => {
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Canvas is unavailable.");
      return { canvas, context, base: document.createElement("canvas"), size: 0, ratio: 1 };
    });
    this.resizeObserver = new ResizeObserver(this.resize);
    canvases.forEach(canvas => this.resizeObserver.observe(canvas));
    document.addEventListener("visibilitychange", this.syncPlayback);
    this.reducedMotion.addEventListener("change", this.syncPlayback);
    this.resize();
    this.syncPlayback();
  }

  setOptions(options: CircleSystemOptions) {
    const seedChanged = this.options.seed !== options.seed;
    if (seedChanged) this.elapsed = 0;
    if (seedChanged || this.options.density !== options.density) this.patternCache.clear();
    this.options = options;
    if (seedChanged) this.resize(); else this.draw();
    this.syncPlayback();
  }

  private syncPlayback = () => {
    cancelAnimationFrame(this.animation);
    this.lastTime = 0;
    if (!this.disposed && this.options.playing && !this.reducedMotion.matches && !document.hidden)
      this.animation = requestAnimationFrame(this.tick);
  };

  private tick = (now: number) => {
    if (this.disposed) return;
    if (this.lastTime) this.elapsed += Math.min(.1, (now - this.lastTime) / 1000) * this.options.speed;
    this.lastTime = now;
    if (now - this.lastDraw >= 1000 / 30) { this.draw(); this.lastDraw = now; }
    this.animation = requestAnimationFrame(this.tick);
  };

  private resize = () => {
    if (this.disposed) return;
    for (const [panelIndex, panel] of this.panels.entries()) {
      const size = panel.canvas.getBoundingClientRect().width;
      if (!size) continue;
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      panel.size = size; panel.ratio = ratio;
      panel.canvas.width = panel.base.width = Math.round(size * ratio);
      panel.canvas.height = panel.base.height = Math.round(size * ratio);
      const context = panel.base.getContext("2d")!;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.fillStyle = "#fff"; context.fillRect(0, 0, size, size);
      const step = (size - 4) / CIRCLE_GRID, radius = step * .5;
      context.strokeStyle = "#d0d0ce"; context.lineWidth = Math.max(.8, size / 300 * 1.15);
      context.beginPath();
      for (let y = 0; y < CIRCLE_GRID; y++) for (let x = 0; x < CIRCLE_GRID; x++) {
        const cx = 2 + (x + .5) * step, cy = 2 + (y + .5) * step;
        const arc = createBackgroundArc(this.options.seed, panelIndex, y * CIRCLE_GRID + x);
        const angle = arc.start * QUARTER_TURN;
        context.moveTo(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius);
        context.arc(cx, cy, radius, angle, angle + arc.length * QUARTER_TURN);
      }
      context.stroke();
    }
    this.draw();
  };

  private state(panel: number, epoch: number) {
    const key = `${panel}:${epoch}`;
    if (!this.patternCache.has(key)) {
      // Keep only a bounded recent window during indefinite playback.
      if (this.patternCache.size > PATTERN_COUNT * 4) this.patternCache.clear();
      this.patternCache.set(key, createQuarterPattern(this.options.seed * 7919 + panel * 313, this.options.density, epoch));
    }
    return this.patternCache.get(key)!;
  }

  private draw() {
    if (this.disposed) return;
    const position = this.elapsed / MORPH_SECONDS;
    const epoch = Math.floor(position), progress = position - epoch;
    this.panels.forEach((panel, index) => {
      const { context, canvas, base, size, ratio } = panel;
      if (!size) return;
      const from = this.state(index, epoch), to = this.state(index, epoch + 1);
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.clearRect(0, 0, canvas.width, canvas.height); context.drawImage(base, 0, 0);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      const step = (size - 4) / CIRCLE_GRID, radius = step * .5;
      context.strokeStyle = "#171918"; context.lineWidth = Math.max(.9, size / 300 * 1.3);
      context.lineCap = "butt";
      const fromKeys = new Set(from.groups.map(groupKey));
      const toKeys = new Set(to.groups.map(groupKey));
      const drawGroup = (group: ArcGroup, opacity: number) => {
        if (opacity < .001) return;
        const cx = 2 + (group.cell % CIRCLE_GRID + .5) * step;
        const cy = 2 + (Math.floor(group.cell / CIRCLE_GRID) + .5) * step;
        const angle = group.start * QUARTER_TURN;
        context.globalAlpha = opacity;
        context.beginPath();
        context.arc(cx, cy, radius, angle, angle + group.direction * group.length * QUARTER_TURN, group.direction < 0);
        context.stroke();
      };
      // A generated mark is one literal canvas arc: 90, 180, or 270 degrees.
      // Matching marks persist; removed and added marks fade as complete units.
      for (const group of from.groups) drawGroup(group,
        toKeys.has(groupKey(group)) ? 1 : groupOpacity(group, false, from.groups.length, progress));
      for (const group of to.groups) if (!fromKeys.has(groupKey(group)))
        drawGroup(group, groupOpacity(group, true, to.groups.length, progress));
      context.globalAlpha = 1;
    });
  }

  dispose() {
    this.disposed = true; cancelAnimationFrame(this.animation);
    this.resizeObserver.disconnect(); this.patternCache.clear();
    document.removeEventListener("visibilitychange", this.syncPlayback);
    this.reducedMotion.removeEventListener("change", this.syncPlayback);
  }
}
