export type DitherFieldSettings = {
  adhesion: number; reach: number; shadow: number; contrast: number;
  softness: number; blockSize: number; spacing: number; relief: number; lightAngle: number; rounding: number;
  joinLobes: number; rimCount: number; rimOffset: number;
  rimOffsetNoise: number; rimNoiseX: number; rimNoiseY: number; rimSize: number;
  showGrid: boolean; letterBlock: string; ledSize: number;
  neckEnd: number; neckWaist: number;
};
export const DITHER_FIELD_DEFAULTS: DitherFieldSettings = {
  adhesion: 6, reach: 2.15, shadow: 2, contrast: .5,
  softness: .32, blockSize: 24, spacing: 24, relief: 2, lightAngle: 360, rounding: 50,
  joinLobes: 0, rimCount: 0, rimOffset: 0,
  rimOffsetNoise: 0, rimNoiseX: 0, rimNoiseY: 0, rimSize: 24,
  showGrid: false, letterBlock: "#0300cc", ledSize: 72,
  neckEnd: 90, neckWaist: 6,
};

export type BuiltinCell = "solid" | "dashed" | "dashed-invert";

export type DitherStamp = {
  id: string;
  kind?: BuiltinCell;
  image?: CanvasImageSource;
  ramp?: ToneCell[];
  rim?: ToneCell[];
};

export type ToneCell = { id: string; label: string; level: number; image: CanvasImageSource; joins?: boolean };
export type ToneLibrary = {
  id: string;
  folder: string;
  title: string;
  cells: { id: string; label: string; level: number; joins?: boolean; ext?: string }[];
};
export const TONAL_LIBRARY: ToneLibrary = {
  id: "tonal", folder: "tonal", title: "Tonal building blocks",
  cells: [
    { id: "highlight", label: "Highlight", level: 0 },
    { id: "light", label: "Light", level: .18 },
    { id: "midtone", label: "Midtone", level: .36 },
    { id: "shadow", label: "Shadow", level: .46, joins: true },
    { id: "deep", label: "Deep", level: 1, joins: true },
  ],
};
export const PUSH_LIBRARY: ToneLibrary = {
  id: "push", folder: "push", title: "Push building blocks",
  cells: [
    { id: "air", label: "Air", level: 0 },
    { id: "cap", label: "Cap", level: .2 },
    { id: "rim", label: "Rim", level: .38 },
    { id: "handle", label: "Handle", level: .58, joins: true },
    { id: "press", label: "Press", level: 1, joins: true },
  ],
};
export const STEP_LIBRARY: ToneLibrary = {
  id: "step", folder: "step", title: "Step building blocks",
  cells: [
    { id: "highlight", label: "Highlight", level: 0 },
    { id: "light", label: "Light", level: .18 },
    { id: "midtone", label: "Midtone", level: .36 },
    { id: "shadow", label: "Shadow", level: .46, joins: true },
    { id: "deep", label: "Deep", level: 1, joins: true },
  ],
};
export const NECK_LIBRARY: ToneLibrary = {
  id: "neck", folder: "neck", title: "Connecting blocks",
  cells: [
    { id: "ring", label: "Ring", level: 0, ext: "png" },
    { id: "fill", label: "Fill", level: 1, ext: "png" },
  ],
};
export const MORPH_LIBRARY: ToneLibrary = {
  id: "morph", folder: "morph", title: "Morph building blocks",
  cells: [
    { id: "pale", label: "Pale", level: .28, joins: true, ext: "png" },
    { id: "deep", label: "Deep", level: 1, joins: true, ext: "png" },
  ],
};
export const MORPH_0918_LIBRARY: ToneLibrary = {
  id: "morph-0918", folder: "morph", title: "0918 building blocks",
  cells: [
    { id: "25", label: "25", level: .005, ext: "png" },
    { id: "26", label: "26", level: .006, ext: "png" },
    { id: "23", label: "23", level: .13 },
    { id: "24", label: "24", level: .16 },
    { id: "17", label: "17", level: .181 },
    { id: "20", label: "20", level: .34, ext: "png" },
    { id: "06", label: "06", level: .37, ext: "png" },
    { id: "07", label: "07", level: .51, ext: "png" },
    { id: "01", label: "01", level: .7, ext: "png" },
    { id: "deep", label: "Deep", level: 1, joins: true, ext: "png" },
  ],
};
export const DEFAULT_TONE_CELLS = TONAL_LIBRARY.cells;
export function loadToneLibrary(library: ToneLibrary): Promise<ToneCell[]> {
  return Promise.all(library.cells.map(cell => new Promise<ToneCell>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({ ...cell, image });
    image.onerror = () => reject(new Error(`Could not load the ${cell.label.toLowerCase()} cell.`));
    image.src = `/cells/${library.folder}/${cell.id}.${cell.ext ?? "svg"}`;
  })));
}
export function loadDefaultToneCells(): Promise<ToneCell[]> {
  return loadToneLibrary(TONAL_LIBRARY);
}

// Ordered dithering selects adjacent tonal cells, rather than repeating one
// stamp at a fixed opacity. Joining fills skip the dither so they stay in
// connected bands instead of isolated corner tiles.
export function toneCellIndex(tone: number, column: number, row: number, levels: number[], joins?: boolean[]): number {
  if (!levels.length) return -1;
  if (tone <= levels[0]) return 0;
  for (let i = 0; i < levels.length - 1; i++) {
    if (tone > levels[i + 1]) continue;
    const mix = (tone - levels[i]) / Math.max(.0001, levels[i + 1] - levels[i]);
    if (joins?.[i] || joins?.[i + 1]) return i + Number(mix >= .5);
    return i + Number(ditherHit(mix, column, row));
  }
  return levels.length - 1;
}

/** Fill one-cell notches so a lighter joining fill welds into the darker mass. */
export function weldJoiningIndices(indices: Int16Array, joins: boolean[], columns: number, rows: number) {
  const lightest = joins.findIndex(Boolean);
  if (lightest < 0) return indices;
  const at = (column: number, row: number) => {
    if (column < 0 || row < 0 || column >= columns || row >= rows) return -1;
    return indices[row * columns + column];
  };
  const next = new Int16Array(indices);
  for (let row = 0; row < rows; row++) for (let column = 0; column < columns; column++) {
    const index = at(column, row);
    if (index >= 0 && joins[index]) continue;
    const neighbors = [at(column - 1, row), at(column + 1, row), at(column, row - 1), at(column, row + 1)]
      .filter(item => item >= 0 && joins[item]);
    if (neighbors.length < 2) continue;
    const votes = new Map<number, number>();
    for (const item of neighbors) votes.set(item, (votes.get(item) ?? 0) + 1);
    next[row * columns + column] = [...votes.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0];
  }
  indices.set(next);
  return indices;
}

/** The lightest joining fill becomes a continuous rim so it can share the blob outline. */
export function coatJoiningRim(indices: Int16Array, joins: boolean[], columns: number, rows: number) {
  const lightest = joins.findIndex(Boolean);
  if (lightest < 0 || !joins.some((join, index) => join && index !== lightest)) return indices;
  const at = (column: number, row: number) => {
    if (column < 0 || row < 0 || column >= columns || row >= rows) return -1;
    return indices[row * columns + column];
  };
  const joining = (column: number, row: number) => {
    const index = at(column, row);
    return index >= 0 && joins[index];
  };
  const next = new Int16Array(indices);
  for (let row = 0; row < rows; row++) for (let column = 0; column < columns; column++) {
    if (!joining(column, row)) continue;
    if (joining(column - 1, row) && joining(column + 1, row) && joining(column, row - 1) && joining(column, row + 1)) continue;
    next[row * columns + column] = lightest;
  }
  indices.set(next);
  return indices;
}

const INK = "#111111";
const PAPER = "#ffffff";

/** Bayer 8×8 thresholds in 0..1. Interior coverage stamps every cell; the fringe dithers. */
export const BAYER_8 = [
  [0, 32, 8, 40, 2, 34, 10, 42],
  [48, 16, 56, 24, 50, 18, 58, 26],
  [12, 44, 4, 36, 14, 46, 6, 38],
  [60, 28, 52, 20, 62, 30, 54, 22],
  [3, 35, 11, 43, 1, 33, 9, 41],
  [51, 19, 59, 27, 49, 17, 57, 25],
  [15, 47, 7, 39, 13, 45, 5, 37],
  [63, 31, 55, 23, 61, 29, 53, 21],
].map(row => row.map(value => (value + .5) / 64));

export function ditherHit(coverage: number, column: number, row: number): boolean {
  if (coverage <= 0) return false;
  if (coverage >= 1) return true;
  return coverage > BAYER_8[row & 7][column & 7];
}

export function drawBuiltinCell(
  context: CanvasRenderingContext2D,
  kind: BuiltinCell,
  x: number,
  y: number,
  radius: number,
) {
  const line = Math.max(1, radius * .12);
  const dash = Math.max(2, radius * .45);
  const gap = Math.max(1.5, radius * .32);
  context.save();
  context.lineWidth = line;
  context.setLineDash([]);
  context.beginPath();
  context.arc(x, y, radius, 0, Math.PI * 2);
  if (kind === "solid") {
    context.fillStyle = INK;
    context.strokeStyle = INK;
    context.fill();
    context.stroke();
  } else if (kind === "dashed") {
    context.fillStyle = PAPER;
    context.strokeStyle = INK;
    context.fill();
    context.stroke();
    context.setLineDash([dash, gap]);
    context.beginPath();
    context.arc(x, y, radius * .55, 0, Math.PI * 2);
    context.stroke();
  } else {
    context.fillStyle = INK;
    context.strokeStyle = INK;
    context.fill();
    context.stroke();
    context.strokeStyle = PAPER;
    context.setLineDash([dash, gap]);
    context.beginPath();
    context.arc(x, y, radius * .42, 0, Math.PI * 2);
    context.stroke();
  }
  context.restore();
}

export function drawStamp(
  context: CanvasRenderingContext2D,
  stamp: DitherStamp,
  x: number,
  y: number,
  radius: number,
) {
  if (stamp.image) {
    context.drawImage(stamp.image, x - radius, y - radius, radius * 2, radius * 2);
    return;
  }
  drawBuiltinCell(context, stamp.kind ?? "solid", x, y, radius);
}

export type OccupancyLayer = {
  field: Float32Array;
  width: number;
  height: number;
  originX: number;
  originY: number;
  scale?: number;
  colors?: Uint8ClampedArray;
  combine?: "add" | "max";
};

export type FigureSample = { r: number; g: number; b: number; a: number };

export function figureSampleAt(layer: OccupancyLayer, x: number, y: number): FigureSample {
  if (!layer.colors) return { r: 0, g: 0, b: 0, a: 0 };
  const column = Math.round((x - layer.originX) / (layer.scale ?? 1));
  const row = Math.round((y - layer.originY) / (layer.scale ?? 1));
  if (column < 0 || row < 0 || column >= layer.width || row >= layer.height) return { r: 0, g: 0, b: 0, a: 0 };
  const index = (row * layer.width + column) * 4;
  return { r: layer.colors[index], g: layer.colors[index + 1], b: layer.colors[index + 2], a: layer.colors[index + 3] };
}

/** A grid LED lights when the figure covers that cell; Bayer dithers the fringe. */
export function ledHit(sample: FigureSample, column: number, row: number): boolean {
  return ditherHit(sample.a / 255, column, row);
}

export const FIGURE_LED_DEFAULTS: DitherFieldSettings = { ...DITHER_FIELD_DEFAULTS, showGrid: true, ledSize: 16 };
export const PUSH_MORPH_DEFAULTS: DitherFieldSettings = {
  ...FIGURE_LED_DEFAULTS,
  adhesion: 3.8,
  reach: 2.8,
  shadow: 1.65,
  contrast: .72,
  neckEnd: 132,
  neckWaist: 34,
  joinLobes: 70,
  rimCount: 12,
  rimOffset: 10,
  rimOffsetNoise: 8,
  rimNoiseX: 5,
  rimNoiseY: 5,
  rimSize: 24,
};
export const PUSH_MORPH_IMAGE_DEFAULTS: DitherFieldSettings = {
  ...PUSH_MORPH_DEFAULTS,
  adhesion: 6,
  reach: 2.2,
  shadow: .65,
  contrast: 1.15,
  softness: .65,
  blockSize: 15,
  spacing: 15,
  relief: .7,
  ledSize: 16,
  neckEnd: 95,
  neckWaist: 12,
};
export const IMAGE_DITHER_DEFAULTS: DitherFieldSettings = {
  ...PUSH_MORPH_IMAGE_DEFAULTS,
  adhesion: 0,
  reach: 1,
  shadow: 1.15,
  contrast: 1.05,
  softness: .35,
  relief: .45,
};
export const IMAGE_MERGE_DEFAULTS: DitherFieldSettings = {
  ...IMAGE_DITHER_DEFAULTS,
  adhesion: 4.4,
  reach: 2.6,
  shadow: 1.45,
  contrast: .92,
  softness: .55,
  joinLobes: 82,
  relief: .6,
};

/** Diameter of a grid LED as a fraction of the cell pitch. */
export function ledRadius(pitch: number, size = FIGURE_LED_DEFAULTS.ledSize): number {
  return pitch * Math.max(.08, Math.min(1, size / 100)) / 2;
}

/** Light the default field grid like an LED matrix, using the figure’s own colors. */
export function drawLedOccupancy(
  context: CanvasRenderingContext2D,
  layer: OccupancyLayer,
  columns: number,
  rows: number,
  stepX: number,
  stepY: number,
  settings: DitherFieldSettings,
) {
  const pitch = Math.min(stepX, stepY);
  const radius = ledRadius(pitch, settings.ledSize);
  if (settings.showGrid !== false) {
    context.fillStyle = "#d2d3d0";
    context.beginPath();
    for (let row = 0; row < rows; row++) for (let column = 0; column < columns; column++) {
      const x = (column + .5) * stepX, y = (row + .5) * stepY;
      context.moveTo(x + radius, y);
      context.arc(x, y, radius, 0, Math.PI * 2);
    }
    context.fill();
  }
  const lit = new Map<string, { x: number; y: number }[]>();
  for (let row = 0; row < rows; row++) for (let column = 0; column < columns; column++) {
    const x = (column + .5) * stepX, y = (row + .5) * stepY;
    const sample = figureSampleAt(layer, x, y);
    if (!ledHit(sample, column, row)) continue;
    const key = `${sample.r},${sample.g},${sample.b}`;
    const cells = lit.get(key);
    if (cells) cells.push({ x, y });
    else lit.set(key, [{ x, y }]);
  }
  for (const [key, cells] of lit) {
    context.fillStyle = `rgb(${key})`;
    context.beginPath();
    for (const { x, y } of cells) {
      context.moveTo(x + radius, y);
      context.arc(x, y, radius, 0, Math.PI * 2);
    }
    context.fill();
  }
}

export function occupancyAt(layers: OccupancyLayer[], x: number, y: number, settings?: DitherFieldSettings): number {
  let coverage = 0, total = 0, strongest = 0, overlay = 0;
  for (const layer of layers) {
    const column = Math.round((x - layer.originX) / (layer.scale ?? 1));
    const row = Math.round((y - layer.originY) / (layer.scale ?? 1));
    if (column < 0 || row < 0 || column >= layer.width || row >= layer.height) continue;
    const density = layer.field[row * layer.width + column];
    if (layer.combine === "max") overlay = Math.max(overlay, density);
    else {
      total += density;
      strongest = Math.max(strongest, density);
    }
    const t = Math.max(0, Math.min(1, (density - .92) / .16));
    coverage = Math.max(coverage, t * t * (3 - 2 * t));
  }
  if (!settings) return coverage;
  // Combine RAW density before thresholding. Nearby domains now contribute
  // to the same neck; taking the maximum of separate masks cannot do this.
  const density = Math.max(strongest + (total - strongest) * settings.adhesion, overlay);
  const threshold = 1 / settings.shadow;
  const halfWidth = Math.min(settings.softness, threshold * .95);
  const t = Math.max(0, Math.min(1, (density - threshold + halfWidth) / (2 * halfWidth)));
  const tone = t * t * (3 - 2 * t);
  // Preserve genuinely empty/full cells at every contrast setting.
  if (tone <= 0 || tone >= 1) return tone;
  return Math.max(0, Math.min(1, .5 + (tone - .5) * settings.contrast));
}

export function densityAt(layers: OccupancyLayer[], x: number, y: number, adhesion: number): number {
  let total = 0, strongest = 0, overlay = 0;
  for (const layer of layers) {
    const col = Math.round((x - layer.originX) / (layer.scale ?? 1)), row = Math.round((y - layer.originY) / (layer.scale ?? 1));
    if (col < 0 || row < 0 || col >= layer.width || row >= layer.height) continue;
    const density = layer.field[row * layer.width + col];
    if (layer.combine === "max") overlay = Math.max(overlay, density);
    else { total += density; strongest = Math.max(strongest, density); }
  }
  return Math.max(strongest + (total - strongest) * adhesion, overlay);
}

export function shadedToneAt(layers: OccupancyLayer[], x: number, y: number, settings: DitherFieldSettings): number {
  const d = densityAt(layers, x, y, settings.adhesion);
  if (d <= 0) return 0;
  const threshold = 1 / settings.shadow, halfWidth = Math.min(settings.softness, threshold * .95);
  const t = Math.max(0, Math.min(1, (d - threshold + halfWidth) / (2 * halfWidth)));
  const coverage = t * t * (3 - 2 * t);
  if (!coverage) return 0;
  const sample = settings.spacing * .65;
  const height = (sx: number, sy: number) => Math.log1p(densityAt(layers, sx, sy, settings.adhesion));
  const dx = height(x + sample, y) - height(x - sample, y);
  const dy = height(x, y + sample) - height(x, y - sample);
  const nx = -dx * settings.relief, ny = -dy * settings.relief, nz = .75;
  const length = Math.hypot(nx, ny, nz), angle = settings.lightAngle * Math.PI / 180;
  const diffuse = Math.max(0, (nx * Math.cos(angle) * .7 + ny * Math.sin(angle) * .7 + nz * .714) / length);
  // Density supplies depth; its gradient supplies directional surface shading.
  // This prevents the interior from collapsing to one uniform darkest tile.
  const depth = 1 - Math.exp(-d * .3);
  const ink = .2 + .65 * depth + .35 * (1 - diffuse);
  return coverage * Math.max(0, Math.min(1, .5 + (ink - .5) * settings.contrast));
}

/** Blur radius used to melt stair joints, in pixels. Half a cell is the strongest it may go:
 *  wider than that and one-cell arms wash out of the mask. */
export function joinLobeRadius(size: number, joinLobes = 0) {
  if (joinLobes <= 0) return 0;
  return size * (.12 + .43 * Math.min(1, joinLobes / 100));
}

/**
 * Trace the tile perimeter and relax only one-cell stair runs. Vertices touching
 * a long horizontal or vertical segment are anchors, so straight walls cannot bow.
 */
export function smoothTileRings(
  cells: { column: number; row: number }[],
  stepX: number,
  stepY: number,
  joinRadius: number,
): { x: number; y: number }[][] {
  if (!cells.length || joinRadius <= 0) return [];
  type Edge = { from: [number, number]; to: [number, number]; used: boolean };
  const occupied = new Set(cells.map(cell => `${cell.column}:${cell.row}`));
  const has = (column: number, row: number) => occupied.has(`${column}:${row}`);
  const edges: Edge[] = [];
  for (const cell of cells) {
    const { column, row } = cell;
    if (!has(column, row - 1)) edges.push({ from: [column, row], to: [column + 1, row], used: false });
    if (!has(column + 1, row)) edges.push({ from: [column + 1, row], to: [column + 1, row + 1], used: false });
    if (!has(column, row + 1)) edges.push({ from: [column + 1, row + 1], to: [column, row + 1], used: false });
    if (!has(column - 1, row)) edges.push({ from: [column, row + 1], to: [column, row], used: false });
  }
  const starts = new Map<string, Edge[]>();
  for (const edge of edges) {
    const key = `${edge.from[0]}:${edge.from[1]}`;
    starts.set(key, [...(starts.get(key) ?? []), edge]);
  }
  const direction = (edge: Edge) => edge.to[0] > edge.from[0] ? 0
    : edge.to[1] > edge.from[1] ? 1 : edge.to[0] < edge.from[0] ? 2 : 3;
  const rings: { x: number; y: number }[][] = [];
  const pitch = Math.min(stepX, stepY);
  for (const first of edges) {
    if (first.used) continue;
    const points: [number, number][] = [first.from];
    let edge = first, guard = 0;
    while (!edge.used && guard++ < edges.length + 1) {
      edge.used = true;
      points.push(edge.to);
      if (edge.to[0] === first.from[0] && edge.to[1] === first.from[1]) break;
      const candidates = (starts.get(`${edge.to[0]}:${edge.to[1]}`) ?? []).filter(candidate => !candidate.used);
      if (!candidates.length) break;
      const incoming = direction(edge), priority = [1, 0, 3, 2];
      candidates.sort((a, b) =>
        priority.indexOf((direction(a) - incoming + 4) % 4)
        - priority.indexOf((direction(b) - incoming + 4) % 4));
      edge = candidates[0];
    }
    if (points.length < 4) continue;
    points.pop();
    const ring = removeStraightPoints(points.map(([x, y]) => ({ x: x * stepX, y: y * stepY })));
    rings.push(relaxStairRun(ring, pitch, joinRadius));
  }
  return rings;
}

function removeStraightPoints(points: { x: number; y: number }[]) {
  return points.filter((point, index) => {
    const before = points[(index + points.length - 1) % points.length];
    const after = points[(index + 1) % points.length];
    return (point.x - before.x) * (after.y - point.y)
      !== (point.y - before.y) * (after.x - point.x);
  });
}

function relaxStairRun(points: { x: number; y: number }[], pitch: number, limit: number) {
  const origin = points.map(point => ({ ...point }));
  let ring = points.map(point => ({ ...point }));
  const short = (a: { x: number; y: number }, b: { x: number; y: number }) =>
    Math.hypot(a.x - b.x, a.y - b.y) <= pitch * 1.05;
  const movable = points.map((point, index) =>
    short(points[(index + points.length - 1) % points.length], point)
    && short(point, points[(index + 1) % points.length]));
  const passes = Math.max(1, Math.min(16, Math.round(limit / pitch * 24)));
  for (let pass = 0; pass < passes; pass++) {
    ring = ring.map((point, index) => {
      if (!movable[index]) return point;
      const before = ring[(index + ring.length - 1) % ring.length];
      const after = ring[(index + 1) % ring.length];
      let x = point.x + ((before.x + after.x) / 2 - point.x) * .45;
      let y = point.y + ((before.y + after.y) / 2 - point.y) * .45;
      const dx = x - origin[index].x, dy = y - origin[index].y, drift = Math.hypot(dx, dy);
      if (drift > limit) {
        x = origin[index].x + dx / drift * limit;
        y = origin[index].y + dy / drift * limit;
      }
      return { x, y };
    });
  }
  return ring;
}

/** Cells only shift on a redraw, so a settled field reuses its contour instead of retracing it. */
function tileKey(cells: { column: number; row: number }[], stepX: number, stepY: number, joinRadius: number) {
  let hash = cells.length;
  for (const cell of cells) hash = (Math.imul(hash, 31) + cell.column * 7919 + cell.row) | 0;
  return `${hash}:${cells.length}:${Math.round(stepX)}:${Math.round(stepY)}:${Math.round(joinRadius)}`;
}
const smoothPaths = new Map<string, Path2D>();

/** The smoothed tile outline as a clip path. */
export function smoothTilePath(
  cells: { column: number; row: number }[],
  stepX: number,
  stepY: number,
  joinRadius: number,
): Path2D {
  const key = tileKey(cells, stepX, stepY, joinRadius);
  const cached = smoothPaths.get(key);
  if (cached) return cached;
  if (smoothPaths.size >= 8) smoothPaths.clear();
  const path = new Path2D();
  for (const ring of smoothTileRings(cells, stepX, stepY, joinRadius)) {
    if (ring.length < 3) continue;
    const corners = ring.map((point, index) => {
      const before = ring[(index + ring.length - 1) % ring.length];
      const after = ring[(index + 1) % ring.length];
      const beforeLength = Math.hypot(before.x - point.x, before.y - point.y);
      const afterLength = Math.hypot(after.x - point.x, after.y - point.y);
      const radius = Math.min(joinRadius * .45, beforeLength * .3, afterLength * .3);
      return {
        point,
        before: { x: point.x + (before.x - point.x) / beforeLength * radius, y: point.y + (before.y - point.y) / beforeLength * radius },
        after: { x: point.x + (after.x - point.x) / afterLength * radius, y: point.y + (after.y - point.y) / afterLength * radius },
      };
    });
    path.moveTo(corners[0].after.x, corners[0].after.y);
    for (let index = 1; index < corners.length; index++) {
      const corner = corners[index];
      path.lineTo(corner.before.x, corner.before.y);
      path.quadraticCurveTo(corner.point.x, corner.point.y, corner.after.x, corner.after.y);
    }
    path.lineTo(corners[0].before.x, corners[0].before.y);
    path.quadraticCurveTo(corners[0].point.x, corners[0].point.y, corners[0].after.x, corners[0].after.y);
    path.closePath();
  }
  smoothPaths.set(key, path);
  return path;
}

type ConnectedLayer = { canvas: HTMLCanvasElement; x: number; y: number; width: number; height: number };
const connectedLayers = new WeakMap<CanvasImageSource, Map<string, ConnectedLayer>>();
const solidJoinTiles = new Map<string, HTMLCanvasElement>();

function solidJoinTile(color: string): HTMLCanvasElement {
  const cached = solidJoinTiles.get(color);
  if (cached) return cached;
  const tile = document.createElement("canvas");
  tile.width = tile.height = 1;
  const context = tile.getContext("2d");
  if (context) {
    context.fillStyle = color;
    context.fillRect(0, 0, 1, 1);
  }
  solidJoinTiles.set(color, tile);
  return tile;
}

/** Ported from the Toggle Dither Connect mode: grow circles modestly, blur, then threshold. */
export function connectGeometry(size: number, amount: number) {
  const mix = Math.max(0, Math.min(1, amount / 100));
  return {
    radius: size * (.5 + (.78 - .5) * mix),
    blur: 1 + size * .4 * mix,
  };
}

function connectedTileLayer(
  tiles: JoinedTile[],
  image: CanvasImageSource,
  size: number,
  amount: number,
): ConnectedLayer | null {
  if (typeof document === "undefined" || !tiles.length) return null;
  let cache = connectedLayers.get(image);
  if (!cache) { cache = new Map(); connectedLayers.set(image, cache); }
  const scale = Math.min(2, window.devicePixelRatio || 1);
  const key = `${tileKey(tiles, size, size, amount)}:${scale}`;
  const cached = cache.get(key);
  if (cached) return cached;
  if (cache.size >= 8) cache.clear();

  const geometry = connectGeometry(size, amount);
  const pad = Math.ceil(geometry.radius + geometry.blur * 3 + 2);
  const x = Math.floor(Math.min(...tiles.map(tile => tile.x)) - pad);
  const y = Math.floor(Math.min(...tiles.map(tile => tile.y)) - pad);
  const right = Math.ceil(Math.max(...tiles.map(tile => tile.x)) + pad);
  const bottom = Math.ceil(Math.max(...tiles.map(tile => tile.y)) + pad);
  const width = right - x, height = bottom - y;
  const raw = document.createElement("canvas");
  raw.width = Math.max(1, Math.ceil(width * scale));
  raw.height = Math.max(1, Math.ceil(height * scale));
  const rawContext = raw.getContext("2d");
  if (!rawContext) return null;
  rawContext.setTransform(scale, 0, 0, scale, 0, 0);
  rawContext.fillStyle = "#000";
  for (const tile of tiles) {
    rawContext.beginPath();
    rawContext.arc(tile.x - x, tile.y - y, geometry.radius, 0, Math.PI * 2);
    rawContext.fill();
  }

  const canvas = document.createElement("canvas");
  canvas.width = raw.width;
  canvas.height = raw.height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return null;
  context.filter = `blur(${Math.max(.5, geometry.blur * scale)}px)`;
  context.drawImage(raw, 0, 0);
  context.filter = "none";
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
  for (let index = 3; index < pixels.data.length; index += 4) {
    pixels.data[index] = pixels.data[index] >= 128 ? 255 : 0;
  }
  context.putImageData(pixels, 0, 0);
  context.globalCompositeOperation = "source-in";
  const pattern = context.createPattern(image, "repeat");
  context.fillStyle = pattern ?? "#000";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.globalCompositeOperation = "source-over";

  const layer = { canvas, x, y, width, height };
  cache.set(key, layer);
  return layer;
}

/** Bits are TL, TR, BR, BL. Connected faces stay square to prevent seams. */
export function exposedTileCorners(left: boolean, top: boolean, right: boolean, bottom: boolean): number {
  return Number(!left && !top) | (Number(!top && !right) << 1)
    | (Number(!right && !bottom) << 2) | (Number(!bottom && !left) << 3);
}
const roundedTiles = new WeakMap<CanvasImageSource, Map<string, HTMLCanvasElement>>();
function roundedTile(image: CanvasImageSource, size: number, rounding: number, mask: number, ratio: number): CanvasImageSource {
  if (!mask || !rounding) return image;
  let cache = roundedTiles.get(image);
  if (!cache) { cache = new Map(); roundedTiles.set(image, cache); }
  const key = `${size}:${rounding}:${mask}:${ratio}`;
  let tile = cache.get(key);
  if (tile) return tile;
  if (cache.size >= 48) cache.clear();
  tile = document.createElement('canvas');
  tile.width = tile.height = Math.ceil(size * ratio);
  const ctx = tile.getContext('2d');
  if (!ctx) return image;
  const r = tile.width * Math.min(.5, rounding / 100);
  ctx.beginPath();
  ctx.roundRect(0, 0, tile.width, tile.height, [0,1,2,3].map(bit => mask & (1 << bit) ? r : 0));
  ctx.clip();
  ctx.drawImage(image, 0, 0, tile.width, tile.height);
  cache.set(key, tile);
  return tile;
}

type JoinedTile = { column: number; row: number; x: number; y: number; image: CanvasImageSource; tone: string; level: number };
type GridEdge = { from: [number,number]; to: [number,number]; used: boolean };

/** Round outer convex corners, and same-tone notches. Meetings between two joining fills stay square. */
export function outerCornerRadius(column: number, row: number, solid: Set<string>, radius: number, mine?: Set<string>) {
  const keys = [`${column - 1}:${row - 1}`, `${column}:${row - 1}`, `${column - 1}:${row}`, `${column}:${row}`];
  const filled = keys.filter(key => solid.has(key));
  if (filled.length === 1) return radius;
  if (filled.length === 3 && (!mine || filled.every(key => mine.has(key)))) return radius;
  return 0;
}

/** Trace the exact grid perimeter and round its corners with vector curves. */
export function roundedGridUnionPath(
  cells: { column: number; row: number }[],
  stepX: number,
  stepY: number,
  radius: number,
  solidCells?: { column: number; row: number }[],
): Path2D {
  const occupied=new Set(cells.map(cell=>`${cell.column}:${cell.row}`)),edges:GridEdge[]=[];
  const solid=new Set((solidCells??cells).map(cell=>`${cell.column}:${cell.row}`));
  const has=(column:number,row:number)=>occupied.has(`${column}:${row}`);
  for(const {column,row} of cells){
    if(!has(column,row-1))edges.push({from:[column,row],to:[column+1,row],used:false});
    if(!has(column+1,row))edges.push({from:[column+1,row],to:[column+1,row+1],used:false});
    if(!has(column,row+1))edges.push({from:[column+1,row+1],to:[column,row+1],used:false});
    if(!has(column-1,row))edges.push({from:[column,row+1],to:[column,row],used:false});
  }
  const starts=new Map<string,GridEdge[]>();
  for(const edge of edges){const key=`${edge.from[0]}:${edge.from[1]}`;starts.set(key,[...(starts.get(key)??[]),edge]);}
  const direction=(edge:GridEdge)=>edge.to[0]>edge.from[0]?0:edge.to[1]>edge.from[1]?1:edge.to[0]<edge.from[0]?2:3;
  const path=new Path2D();
  for(const first of edges){
    if(first.used)continue;
    const points:[number,number][]=[first.from];let edge=first,guard=0;
    while(!edge.used&&guard++<edges.length+1){
      edge.used=true;points.push(edge.to);
      if(edge.to[0]===first.from[0]&&edge.to[1]===first.from[1])break;
      const candidates=(starts.get(`${edge.to[0]}:${edge.to[1]}`)??[]).filter(candidate=>!candidate.used);
      if(!candidates.length)break;
      const incoming=direction(edge),priority=[1,0,3,2];
      candidates.sort((a,b)=>priority.indexOf((direction(a)-incoming+4)%4)-priority.indexOf((direction(b)-incoming+4)%4));
      edge=candidates[0];
    }
    if(points.length<4)continue;
    points.pop();
    const scaled=points.map(([x,y])=>({x:x*stepX,y:y*stepY,column:x,row:y}));
    const rounded=scaled.map((point,index)=>{
      const previous=scaled[(index+scaled.length-1)%scaled.length],next=scaled[(index+1)%scaled.length];
      const beforeLength=Math.hypot(previous.x-point.x,previous.y-point.y),afterLength=Math.hypot(next.x-point.x,next.y-point.y);
      const r=Math.min(outerCornerRadius(point.column,point.row,solid,radius,occupied),beforeLength*.49,afterLength*.49);
      return {
        point,
        before:{x:point.x+(previous.x-point.x)/beforeLength*r,y:point.y+(previous.y-point.y)/beforeLength*r},
        after:{x:point.x+(next.x-point.x)/afterLength*r,y:point.y+(next.y-point.y)/afterLength*r},
      };
    });
    path.moveTo(rounded[0].after.x,rounded[0].after.y);
    for(let index=1;index<rounded.length;index++){
      const corner=rounded[index];path.lineTo(corner.before.x,corner.before.y);path.quadraticCurveTo(corner.point.x,corner.point.y,corner.after.x,corner.after.y);
    }
    path.lineTo(rounded[0].before.x,rounded[0].before.y);path.quadraticCurveTo(rounded[0].point.x,rounded[0].point.y,rounded[0].after.x,rounded[0].after.y);path.closePath();
  }
  return path;
}

function drawJoinedTiles(
  context: CanvasRenderingContext2D,
  tiles: JoinedTile[],
  stepX: number,
  stepY: number,
  size: number,
  rounding: number,
  joinLobes = 0,
) {
  if (!tiles.length) return;
  const groups = new Map<string, JoinedTile[]>();
  for (const tile of tiles) {
    const group = groups.get(tile.tone);
    if (group) group.push(tile);
    else groups.set(tile.tone, [tile]);
  }
  const ordered = [...groups.values()].sort((a, b) => a[0].level - b[0].level);
  if (ordered.length > 1) {
    const pale = ordered[0][0].image;
    drawJoinedTone(context, tiles.map(tile => ({ ...tile, image: pale })), tiles, stepX, stepY, size, rounding, joinLobes);
    for (const group of ordered.slice(1)) drawJoinedTone(context, group, group, stepX, stepY, size, rounding, joinLobes);
    return;
  }
  for (const group of ordered) drawJoinedTone(context, group, tiles, stepX, stepY, size, rounding, joinLobes);
}

function drawJoinedTone(
  context: CanvasRenderingContext2D,
  tiles: JoinedTile[],
  solid: JoinedTile[],
  stepX: number,
  stepY: number,
  size: number,
  rounding: number,
  joinLobes = 0,
) {
  const half = size / 2;
  const radius = size * Math.min(.5, rounding / 100);
  const joinRadius = joinLobeRadius(size, joinLobes);
  const onGrid = Math.abs(size - stepX) < .5 && Math.abs(size - stepY) < .5;
  context.save();
  if (onGrid && joinLobes > 0) {
    const layer = connectedTileLayer(tiles, tiles[0].image, size, joinLobes);
    if (layer) {
      context.drawImage(layer.canvas, layer.x, layer.y, layer.width, layer.height);
      context.restore();
      return;
    }
  }
  if (onGrid && joinRadius > 0) {
    context.clip(smoothTilePath(tiles, stepX, stepY, joinRadius), "nonzero");
  } else if (onGrid) context.clip(roundedGridUnionPath(tiles, stepX, stepY, radius, solid), "nonzero");
  if (onGrid) {
    for (const tile of tiles) context.drawImage(tile.image, tile.x - half, tile.y - half, size, size);
  } else {
    const ratio = Math.max(1, Math.abs(context.getTransform().a));
    for (const tile of tiles) {
      const image = roundedTile(tile.image, size, rounding, 15, ratio);
      context.drawImage(image, tile.x - half, tile.y - half, size, size);
    }
  }
  context.restore();
}

export type RimCell = { column: number; row: number };

/** Occupied cells that touch empty space form the visible rim of the domain. */
export function rimCandidateCells(indices: Int16Array, columns: number, rows: number): RimCell[] {
  const occupied = (column: number, row: number) =>
    column >= 0 && row >= 0 && column < columns && row < rows && indices[row * columns + column] >= 0;
  const candidates: RimCell[] = [];
  for (let row = 0; row < rows; row++) for (let column = 0; column < columns; column++) {
    if (!occupied(column, row)) continue;
    if (!occupied(column - 1, row) || !occupied(column + 1, row)
      || !occupied(column, row - 1) || !occupied(column, row + 1)) {
      candidates.push({ column, row });
    }
  }
  return candidates;
}

function rimHash(cell: RimCell, salt = 0) {
  let value = Math.imul(cell.column + 0x6d2b79f5 + salt, cell.row + 0x1b873593 - salt);
  value = Math.imul(value ^ (value >>> 15), value | 1);
  return (value ^ (value >>> 14)) >>> 0;
}

/** Stable signed random value for one rim cell; amount is its maximum displacement. */
export function rimJitter(cell: RimCell, amount: number, salt: number) {
  return (rimHash(cell, salt) / 4294967295 * 2 - 1) * Math.max(0, amount);
}

/** Deterministic randomness avoids flicker; spacing passes prevent accidental clumps. */
export function selectRimCells(candidates: RimCell[], count: number): RimCell[] {
  const target = Math.max(0, Math.min(Math.round(count), candidates.length));
  if (!target) return [];
  const ordered = [...candidates].sort((a, b) => rimHash(a) - rimHash(b));
  const selected: RimCell[] = [];
  const used = new Set<string>();
  for (const spacing of [4, 3, 2, 1, 0]) {
    for (const cell of ordered) {
      if (selected.length >= target) return selected;
      const key = `${cell.column}:${cell.row}`;
      if (used.has(key)) continue;
      if (spacing && selected.some(chosen =>
        Math.hypot(chosen.column - cell.column, chosen.row - cell.row) < spacing)) continue;
      selected.push(cell);
      used.add(key);
    }
  }
  return selected;
}

/** Unit vector from an occupied rim cell toward its neighboring empty space. */
export function rimOutwardVector(indices: Int16Array, columns: number, rows: number, cell: RimCell) {
  const occupied = (column: number, row: number) =>
    column >= 0 && row >= 0 && column < columns && row < rows && indices[row * columns + column] >= 0;
  const directions = [
    { column: -1, row: 0 }, { column: 1, row: 0 },
    { column: 0, row: -1 }, { column: 0, row: 1 },
  ];
  let x = 0, y = 0;
  for (const direction of directions) {
    if (occupied(cell.column + direction.column, cell.row + direction.row)) continue;
    x += direction.column;
    y += direction.row;
  }
  const length = Math.hypot(x, y);
  if (length) return { x: x / length, y: y / length };
  return { x: 0, y: 0 };
}

function drawRimBlocks(
  context: CanvasRenderingContext2D,
  indices: Int16Array,
  columns: number,
  rows: number,
  stepX: number,
  stepY: number,
  size: number,
  blocks: ToneCell[],
  count: number,
  offset: number,
  offsetNoise: number,
  noiseX: number,
  noiseY: number,
  blockSize: number,
) {
  if (!blocks.length || count <= 0) {
    context.canvas.dataset.rimBlocks = "0";
    return;
  }
  const selected = selectRimCells(rimCandidateCells(indices, columns, rows), count);
  const drawSize = Math.max(1, blockSize || size);
  const half = drawSize / 2;
  for (const cell of selected) {
    const image = blocks[rimHash(cell) % blocks.length].image;
    const outward = rimOutwardVector(indices, columns, rows, cell);
    const distance = offset + rimJitter(cell, offsetNoise, 17);
    const x = (cell.column + .5) * stepX + outward.x * distance + rimJitter(cell, noiseX, 31);
    const y = (cell.row + .5) * stepY + outward.y * distance + rimJitter(cell, noiseY, 47);
    context.drawImage(image, x - half, y - half, drawSize, drawSize);
  }
  context.canvas.dataset.rimBlocks = String(selected.length);
}

export function drawDitheredOccupancy(
  context: CanvasRenderingContext2D,
  layers: OccupancyLayer[],
  columns: number,
  rows: number,
  stepX: number,
  stepY: number,
  stamp: DitherStamp,
  settings?: DitherFieldSettings,
  mergeUnderlayColor?: string,
  toneGain = 1,
) {
  const radius = settings ? settings.blockSize / 2 : Math.min(stepX, stepY) * .42;
  const levels = stamp.ramp?.map(cell => cell.level);
  const counts = stamp.ramp ? stamp.ramp.map(() => 0) : null;
  const indices = stamp.ramp?.length && settings && levels ? new Int16Array(columns * rows).fill(-1) : null;
  const mergeMask = mergeUnderlayColor && indices ? new Uint8Array(columns * rows) : null;
  if (indices && settings && levels) {
    for (let row = 0; row < rows; row++) for (let col = 0; col < columns; col++) {
      const x = (col + .5) * stepX, y = (row + .5) * stepY;
      const density = densityAt(layers, x, y, settings.adhesion) * settings.shadow;
      // Highlights belong to the fringe of a domain, never to empty canvas.
      const fringe = Math.max(0, Math.min(1, (density - .055) / .20));
      if (!ditherHit(fringe * fringe * (3 - 2 * fringe), col, row)) continue;
      const rawTone = shadedToneAt(layers, x, y, settings);
      const tone = Math.min(1, rawTone * toneGain);
      const cellIndex = row * columns + col;
      // Keep sparse highlight marks free; the denser letter cells share one liquid silhouette.
      if (mergeMask && rawTone >= .2) mergeMask[cellIndex] = 1;
      indices[cellIndex] = toneCellIndex(
        tone, col, row, levels, stamp.ramp!.map(cell => Boolean(cell.joins)),
      );
    }
    weldJoiningIndices(indices, stamp.ramp!.map(cell => Boolean(cell.joins)), columns, rows);
  }
  const ratio = Math.max(1, Math.abs(context.getTransform().a));
  const joined: JoinedTile[] = [];
  if (mergeMask && settings && Math.abs(radius * 2 - stepX) < .5 && Math.abs(radius * 2 - stepY) < .5) {
    const fill = solidJoinTile(mergeUnderlayColor!);
    const base: JoinedTile[] = [];
    for (let row = 0; row < rows; row++) for (let column = 0; column < columns; column++) {
      if (!mergeMask[row * columns + column]) continue;
      base.push({ column, row, x: (column + .5) * stepX, y: (row + .5) * stepY, image: fill, tone: "merge", level: 0 });
    }
    drawJoinedTone(context, base, base, stepX, stepY, radius * 2, settings.rounding, settings.joinLobes ?? 0);
  }
  if (indices && stamp.ramp && settings) {
    for (let row=0;row<rows;row++) for (let column=0;column<columns;column++) {
      const index=indices[row*columns+column];
      if (index<0 || !stamp.ramp[index].joins) continue;
      joined.push({column,row,x:(column+.5)*stepX,y:(row+.5)*stepY,image:stamp.ramp[index].image,tone:stamp.ramp[index].id,level:stamp.ramp[index].level});
      counts![index]++;
    }
    drawJoinedTiles(context,joined,stepX,stepY,radius*2,settings.rounding,settings.joinLobes ?? 0);
  }
  for (let row = 0; row < rows; row++) for (let column = 0; column < columns; column++) {
    const x = (column + .5) * stepX, y = (row + .5) * stepY;
    if (stamp.ramp?.length && levels && settings) {
      const index = indices![row * columns + column];
      if (index < 0) continue;
      const cell = stamp.ramp[index];
      if (cell.joins) continue;
      const tile = roundedTile(cell.image, radius * 2, settings.rounding, 15, ratio);
      context.drawImage(tile, x - radius, y - radius, radius * 2, radius * 2);
      counts![index]++;
      continue;
    }
    if (!ditherHit(occupancyAt(layers, x, y, settings), column, row)) continue;
    drawStamp(context, stamp, x, y, radius);
  }
  if (indices && settings) {
    drawRimBlocks(context, indices, columns, rows, stepX, stepY, radius * 2, stamp.rim ?? [],
      settings.rimCount ?? 0, settings.rimOffset ?? 0, settings.rimOffsetNoise ?? 0,
      settings.rimNoiseX ?? 0, settings.rimNoiseY ?? 0, settings.rimSize ?? radius * 2);
  }
  if (counts) context.canvas.dataset.toneCounts = JSON.stringify(counts);
}

/** Darker, more opaque ink becomes a heavier occupancy so tonal cells can split the figure. */
export function figureInkDensity(r: number, g: number, b: number, a: number): number {
  if (a < 10) return 0;
  const luminance = (.2126 * r + .7152 * g + .0722 * b) / 255;
  return (a / 255) * (.35 + 2.6 * (1 - luminance));
}

/** Paper stays empty so a wordmark dithers as letters, not a white rectangle. */
export function imageInkDensity(r: number, g: number, b: number, a: number): number {
  if (a < 10) return 0;
  const luminance = (.2126 * r + .7152 * g + .0722 * b) / 255;
  if (luminance >= .9) return 0;
  return (a / 255) * (1 - luminance);
}

function imageInkBounds(data: Uint8ClampedArray, width: number, height: number) {
  let left = width, top = height, right = -1, bottom = -1;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const index = (y * width + x) * 4;
    if (imageInkDensity(data[index], data[index + 1], data[index + 2], data[index + 3]) <= 0) continue;
    left = Math.min(left, x);
    top = Math.min(top, y);
    right = Math.max(right, x);
    bottom = Math.max(bottom, y);
  }
  if (right < left) return { x: 0, y: 0, width, height };
  const pad = Math.max(4, Math.round(Math.max(right - left, bottom - top) * .04));
  return {
    x: Math.max(0, left - pad),
    y: Math.max(0, top - pad),
    width: Math.min(width - Math.max(0, left - pad), right - left + 1 + pad * 2),
    height: Math.min(height - Math.max(0, top - pad), bottom - top + 1 + pad * 2),
  };
}

const figureCache = new WeakMap<CanvasImageSource, { key: string; layer: OccupancyLayer }>();

export function figureDensity(image: CanvasImageSource, width: number, height: number): OccupancyLayer {
  const sourceWidth = ("naturalWidth" in image && image.naturalWidth) || (image as { width: number }).width || 400;
  const sourceHeight = ("naturalHeight" in image && image.naturalHeight) || (image as { height: number }).height || 210;
  const maxWidth = width * .62, maxHeight = height * .5;
  const aspect = sourceWidth / Math.max(1, sourceHeight);
  let drawWidth = maxWidth, drawHeight = maxWidth / aspect;
  if (drawHeight > maxHeight) { drawHeight = maxHeight; drawWidth = maxHeight * aspect; }
  const originX = (width - drawWidth) / 2, originY = (height - drawHeight) / 2;
  const scale = Math.max(2, Math.min(4, Math.min(drawWidth, drawHeight) / 160));
  const fieldWidth = Math.max(2, Math.ceil(drawWidth / scale));
  const fieldHeight = Math.max(2, Math.ceil(drawHeight / scale));
  const key = `${Math.round(width)}:${Math.round(height)}:${fieldWidth}:${fieldHeight}:rgba`;
  const cached = figureCache.get(image);
  if (cached?.key === key) return cached.layer;
  const canvas = document.createElement("canvas");
  canvas.width = fieldWidth;
  canvas.height = fieldHeight;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  const field = new Float32Array(fieldWidth * fieldHeight);
  const colors = new Uint8ClampedArray(fieldWidth * fieldHeight * 4);
  if (context) {
    context.drawImage(image, 0, 0, fieldWidth, fieldHeight);
    const pixels = context.getImageData(0, 0, fieldWidth, fieldHeight).data;
    colors.set(pixels);
    for (let index = 0; index < field.length; index++) {
      field[index] = figureInkDensity(pixels[index * 4], pixels[index * 4 + 1], pixels[index * 4 + 2], pixels[index * 4 + 3]);
    }
  }
  const layer = { field, width: fieldWidth, height: fieldHeight, originX, originY, scale, colors };
  figureCache.set(image, { key, layer });
  return layer;
}

const imageDitherCache = new WeakMap<CanvasImageSource, { key: string; layer: OccupancyLayer }>();

/** Sample a source image as occupancy so building-block cells can dither the ink. */
export function imageDitherLayer(image: CanvasImageSource, width: number, height: number): OccupancyLayer {
  const sourceWidth = ("naturalWidth" in image && image.naturalWidth) || (image as { width: number }).width || 400;
  const sourceHeight = ("naturalHeight" in image && image.naturalHeight) || (image as { height: number }).height || 210;
  const probe = document.createElement("canvas");
  probe.width = Math.max(2, Math.round(sourceWidth));
  probe.height = Math.max(2, Math.round(sourceHeight));
  const probeContext = probe.getContext("2d", { willReadFrequently: true });
  let crop = { x: 0, y: 0, width: sourceWidth, height: sourceHeight };
  if (probeContext) {
    probeContext.drawImage(image, 0, 0, probe.width, probe.height);
    crop = imageInkBounds(probeContext.getImageData(0, 0, probe.width, probe.height).data, probe.width, probe.height);
  }
  const gutter = Math.min(260, width * .26);
  const usable = Math.max(width * .55, width - gutter);
  const maxWidth = usable * .88, maxHeight = height * .34;
  const aspect = crop.width / Math.max(1, crop.height);
  let drawWidth = maxWidth, drawHeight = maxWidth / aspect;
  if (drawHeight > maxHeight) { drawHeight = maxHeight; drawWidth = maxHeight * aspect; }
  const originX = (usable - drawWidth) / 2, originY = (height - drawHeight) / 2;
  const scale = Math.max(1.5, Math.min(3, Math.min(drawWidth, drawHeight) / 180));
  const fieldWidth = Math.max(2, Math.ceil(drawWidth / scale));
  const fieldHeight = Math.max(2, Math.ceil(drawHeight / scale));
  const key = `${Math.round(width)}:${Math.round(height)}:${Math.round(originX)}:${fieldWidth}:${fieldHeight}:${crop.x}:${crop.y}:${crop.width}:${crop.height}`;
  const cached = imageDitherCache.get(image);
  if (cached?.key === key) return cached.layer;
  const canvas = document.createElement("canvas");
  canvas.width = fieldWidth;
  canvas.height = fieldHeight;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  const field = new Float32Array(fieldWidth * fieldHeight);
  const colors = new Uint8ClampedArray(fieldWidth * fieldHeight * 4);
  if (context) {
    context.drawImage(image, crop.x, crop.y, crop.width, crop.height, 0, 0, fieldWidth, fieldHeight);
    const pixels = context.getImageData(0, 0, fieldWidth, fieldHeight).data;
    colors.set(pixels);
    for (let index = 0; index < field.length; index++) {
      field[index] = imageInkDensity(pixels[index * 4], pixels[index * 4 + 1], pixels[index * 4 + 2], pixels[index * 4 + 3]);
    }
  }
  const layer = { field, width: fieldWidth, height: fieldHeight, originX, originY, scale, colors };
  imageDitherCache.set(image, { key, layer });
  return layer;
}

const imageMergeCache = new WeakMap<CanvasImageSource, { key: string; layers: OccupancyLayer[] }>();

export function imageLetterIslands(ink: OccupancyLayer, threshold = .12) {
  const columns = new Uint8Array(ink.width);
  for (let y = 0; y < ink.height; y++) for (let x = 0; x < ink.width; x++) {
    if (ink.field[y * ink.width + x] > threshold) columns[x] = 1;
  }
  const runs: [number, number][] = [];
  let start = -1;
  for (let x = 0; x <= ink.width; x++) {
    const on = x < ink.width && Boolean(columns[x] || (x > 0 && x < ink.width - 1 && columns[x - 1] && columns[x + 1]));
    if (on && start < 0) start = x;
    if (!on && start >= 0) {
      runs.push([start, x - 1]);
      start = -1;
    }
  }
  return runs.map(([left, right]) => {
    const cells: { x: number; y: number }[] = [];
    for (let y = 0; y < ink.height; y++) for (let x = left; x <= right; x++) {
      if (ink.field[y * ink.width + x] > threshold) cells.push({ x, y });
    }
    return cells;
  }).filter(cells => cells.length >= 8);
}

function chamferDistance(seed: Float32Array, width: number, height: number, scale: number) {
  const dist = new Float32Array(width * height);
  const diagonal = scale * Math.SQRT2;
  for (let index = 0; index < seed.length; index++) dist[index] = seed[index] > 0 ? 0 : 1e9;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const index = y * width + x;
    let value = dist[index];
    if (x) value = Math.min(value, dist[index - 1] + scale);
    if (y) value = Math.min(value, dist[index - width] + scale);
    if (x && y) value = Math.min(value, dist[index - width - 1] + diagonal);
    if (x + 1 < width && y) value = Math.min(value, dist[index - width + 1] + diagonal);
    dist[index] = value;
  }
  for (let y = height - 1; y >= 0; y--) for (let x = width - 1; x >= 0; x--) {
    const index = y * width + x;
    let value = dist[index];
    if (x + 1 < width) value = Math.min(value, dist[index + 1] + scale);
    if (y + 1 < height) value = Math.min(value, dist[index + width] + scale);
    if (x + 1 < width && y + 1 < height) value = Math.min(value, dist[index + width + 1] + diagonal);
    if (x && y + 1 < height) value = Math.min(value, dist[index + width - 1] + diagonal);
    dist[index] = value;
  }
  return dist;
}

export function imageMergeLayersFromInk(ink: OccupancyLayer, settings: Pick<DitherFieldSettings, "reach" | "spacing">) {
  const scale = ink.scale ?? 1;
  const softness = Math.max(settings.spacing, 8) * Math.max(.85, settings.reach);
  const pad = Math.max(2, Math.ceil((softness * 3.4) / scale));
  const islands = imageLetterIslands(ink);
  const layers: OccupancyLayer[] = [{ ...ink, combine: "max" }];
  for (const cells of islands) {
    let left = ink.width, top = ink.height, right = -1, bottom = -1;
    for (const cell of cells) {
      left = Math.min(left, cell.x);
      top = Math.min(top, cell.y);
      right = Math.max(right, cell.x);
      bottom = Math.max(bottom, cell.y);
    }
    left = Math.max(0, left - pad);
    top = Math.max(0, top - pad);
    right = Math.min(ink.width - 1, right + pad);
    bottom = Math.min(ink.height - 1, bottom + pad);
    const width = right - left + 1, height = bottom - top + 1;
    const seed = new Float32Array(width * height);
    for (const cell of cells) seed[(cell.y - top) * width + (cell.x - left)] = 1;
    const distance = chamferDistance(seed, width, height, scale);
    const field = new Float32Array(width * height);
    for (let index = 0; index < field.length; index++) field[index] = Math.exp(-distance[index] / softness);
    layers.push({
      field,
      width,
      height,
      originX: ink.originX + left * scale,
      originY: ink.originY + top * scale,
      scale,
    });
  }
  return layers;
}

export function imageMergeLayers(
  image: CanvasImageSource,
  width: number,
  height: number,
  settings: Pick<DitherFieldSettings, "reach" | "spacing">,
) {
  const ink = imageDitherLayer(image, width, height);
  const key = `${Math.round(ink.originX)}:${ink.width}:${ink.height}:${settings.reach}:${settings.spacing}`;
  const cached = imageMergeCache.get(image);
  if (cached?.key === key) return cached.layers;
  const layers = imageMergeLayersFromInk(ink, settings);
  imageMergeCache.set(image, { key, layers });
  return layers;
}

const EMPTY_OCCUPANCY: OccupancyLayer = { field: new Float32Array(0), width: 0, height: 0, originX: 0, originY: 0 };
export function emptyOccupancy(): OccupancyLayer {
  return EMPTY_OCCUPANCY;
}

export function overlayLayout(sourceWidth: number, sourceHeight: number, width: number, height: number) {
  const maxWidth = width * .158, maxHeight = height * .476;
  const aspect = sourceWidth / Math.max(1, sourceHeight);
  let drawWidth = maxWidth, drawHeight = maxWidth / aspect;
  if (drawHeight > maxHeight) { drawHeight = maxHeight; drawWidth = maxHeight * aspect; }
  return { x: (width - drawWidth) / 2, y: (height - drawHeight) / 2, width: drawWidth, height: drawHeight };
}

export function isOverlayPaper(r: number, g: number, b: number): boolean {
  return r >= 248 && g >= 248 && b >= 248;
}

export function isOverlayBackdrop(r: number, g: number, b: number, a: number): boolean {
  if (a < 8) return true;
  if (isOverlayPaper(r, g, b)) return false;
  const spread = Math.max(r, g, b) - Math.min(r, g, b);
  return spread <= 14 && Math.min(r, g, b) >= 170;
}

/** Clear the white page from the edges so floating step chrome stays intact. */
export function punchOverlayPaper(data: Uint8ClampedArray, width: number, height: number) {
  const seen = new Uint8Array(width * height);
  const stack: number[] = [];
  const push = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    stack.push(y * width + x);
  };
  for (let x = 0; x < width; x++) { push(x, 0); push(x, height - 1); }
  for (let y = 0; y < height; y++) { push(0, y); push(width - 1, y); }
  while (stack.length) {
    const id = stack.pop()!;
    if (seen[id]) continue;
    seen[id] = 1;
    const index = id * 4;
    if (data[index + 3] < 8 || !isOverlayPaper(data[index], data[index + 1], data[index + 2])) continue;
    data[index + 3] = 0;
    const x = id % width, y = (id - x) / width;
    push(x + 1, y); push(x - 1, y); push(x, y + 1); push(x, y - 1);
  }
}

/** Clear the page gray from the edges so the white chat card stays intact. */
export function punchOverlayBackdrop(data: Uint8ClampedArray, width: number, height: number) {
  const seen = new Uint8Array(width * height);
  const stack: number[] = [];
  const push = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    stack.push(y * width + x);
  };
  for (let x = 0; x < width; x++) { push(x, 0); push(x, height - 1); }
  for (let y = 0; y < height; y++) { push(0, y); push(width - 1, y); }
  while (stack.length) {
    const id = stack.pop()!;
    if (seen[id]) continue;
    seen[id] = 1;
    const index = id * 4;
    if (!isOverlayBackdrop(data[index], data[index + 1], data[index + 2], data[index + 3])) continue;
    data[index + 3] = 0;
    const x = id % width, y = (id - x) / width;
    push(x + 1, y); push(x - 1, y); push(x, y + 1); push(x, y - 1);
  }
}

function keepLargestOverlayBlobs(data: Uint8ClampedArray, width: number, height: number, keep = 2) {
  const seen = new Uint8Array(width * height);
  const blobs: number[][] = [];
  for (let id = 0; id < seen.length; id++) {
    if (seen[id] || data[id * 4 + 3] < 8) continue;
    const stack = [id], blob = [id];
    seen[id] = 1;
    while (stack.length) {
      const current = stack.pop()!;
      const x = current % width, y = (current - x) / width;
      for (const next of [current + 1, current - 1, current + width, current - width]) {
        if (next < 0 || next >= seen.length || seen[next] || data[next * 4 + 3] < 8) continue;
        const nx = next % width;
        if (Math.abs(nx - x) + Math.abs(((next - nx) / width) - y) !== 1) continue;
        seen[next] = 1;
        stack.push(next);
        blob.push(next);
      }
    }
    blobs.push(blob);
  }
  blobs.sort((a, b) => b.length - a.length);
  for (const blob of blobs.slice(keep)) for (const id of blob) data[id * 4 + 3] = 0;
}

function trimOverlayCanvas(source: HTMLCanvasElement): HTMLCanvasElement {
  const context = source.getContext("2d");
  if (!context) return source;
  const pixels = context.getImageData(0, 0, source.width, source.height);
  let left = source.width, top = source.height, right = 0, bottom = 0;
  for (let y = 0; y < source.height; y++) for (let x = 0; x < source.width; x++) {
    if (pixels.data[(y * source.width + x) * 4 + 3] < 8) continue;
    left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y);
  }
  if (right <= left || bottom <= top) return source;
  const pad = 2;
  left = Math.max(0, left - pad); top = Math.max(0, top - pad);
  right = Math.min(source.width - 1, right + pad); bottom = Math.min(source.height - 1, bottom + pad);
  const canvas = document.createElement("canvas");
  canvas.width = right - left + 1;
  canvas.height = bottom - top + 1;
  canvas.getContext("2d")?.drawImage(source, left, top, canvas.width, canvas.height, 0, 0, canvas.width, canvas.height);
  return canvas;
}

const overlayCache = new WeakMap<CanvasImageSource, HTMLCanvasElement>();
const paperOverlayCache = new WeakMap<CanvasImageSource, HTMLCanvasElement>();
function punchedOverlay(image: CanvasImageSource, paper = false): HTMLCanvasElement {
  const cache = paper ? paperOverlayCache : overlayCache;
  const cached = cache.get(image);
  if (cached) return cached;
  const width = ("naturalWidth" in image && image.naturalWidth) || (image as { width: number }).width || 1;
  const height = ("naturalHeight" in image && image.naturalHeight) || (image as { height: number }).height || 1;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (context) {
    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, width, height);
    if (paper) punchOverlayPaper(pixels.data, width, height);
    else {
      punchOverlayBackdrop(pixels.data, width, height);
      keepLargestOverlayBlobs(pixels.data, width, height);
    }
    context.putImageData(pixels, 0, 0);
  }
  const trimmed = trimOverlayCanvas(canvas);
  cache.set(image, trimmed);
  return trimmed;
}

export function paperOverlay(image: CanvasImageSource) {
  return punchedOverlay(image, true);
}

export function overlayPlacement(image: CanvasImageSource, width: number, height: number) {
  const punched = punchedOverlay(image);
  return { punched, ...overlayLayout(punched.width, punched.height, width, height) };
}

export function positionedOverlayPlacement(
  image: CanvasImageSource,
  width: number,
  height: number,
  center?: { x: number; y: number } | null,
  preserveImageBackground = false,
  size?: number,
) {
  const box = preserveImageBackground
    ? {
        punched: image,
        ...overlayLayout(
          ("naturalWidth" in image && image.naturalWidth) || (image as { width: number }).width || 1,
          ("naturalHeight" in image && image.naturalHeight) || (image as { height: number }).height || 1,
          width,
          height,
        ),
      }
    : overlayPlacement(image, width, height);
  const scale = size ? size / .158 : 1;
  const sized = scale === 1 ? box : { ...box, width: box.width * scale, height: box.height * scale };
  const target = center ?? { x: width / 2, y: height / 2 };
  return { ...sized, x: target.x - sized.width / 2, y: target.y - sized.height / 2 };
}

export function overlayDensityBox(
  image: CanvasImageSource,
  width: number,
  height: number,
  center?: { x: number; y: number } | null,
  preserveImageBackground = false,
  size?: number,
) {
  const box = positionedOverlayPlacement(image, width, height, center, preserveImageBackground, size);
  const padX = box.width * .12, padY = box.height * .12;
  return {
    left: box.x - padX,
    top: box.y - padY,
    right: box.x + box.width + padX,
    bottom: box.y + box.height + padY,
  };
}

export function drawCenteredOverlay(
  context: CanvasRenderingContext2D,
  image: CanvasImageSource,
  width: number,
  height: number,
  appear = 1,
  center?: { x: number; y: number } | null,
  preserveImageBackground = false,
  size?: number,
) {
  if (appear <= 0) return;
  const ease = appear * appear * (3 - 2 * appear);
  const box = positionedOverlayPlacement(image, width, height, center, preserveImageBackground, size);
  context.save();
  context.globalAlpha = ease;
  context.translate(box.x + box.width / 2, box.y + box.height / 2 + (1 - ease) * 10);
  context.scale(.94 + .06 * ease, .94 + .06 * ease);
  context.drawImage(box.punched, -box.width / 2, -box.height / 2, box.width, box.height);
  context.restore();
}

/** Full-bleed color tiles (Deep, Press) join into rounded squares. Circular stamps do not. */
export function imageFillsSquare(data: Uint8ClampedArray, width: number, height: number): boolean {
  const paper = (r: number, g: number, b: number, a: number) => a < 32 || (r >= 248 && g >= 248 && b >= 248);
  let covered = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (!paper(data[i], data[i + 1], data[i + 2], data[i + 3])) covered++;
  }
  return covered / Math.max(1, width * height) >= .88;
}

export function loadStampFile(file: File): Promise<{ image: HTMLImageElement; url: string }> {
  const allowed = file.type === "image/png" || file.type === "image/svg+xml"
    || /\.(png|svg)$/i.test(file.name);
  if (!allowed) return Promise.reject(new Error("Use an SVG or PNG."));
  const url = URL.createObjectURL(file);
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({ image, url });
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("That file could not be read as an image."));
    };
    image.src = url;
  });
}
