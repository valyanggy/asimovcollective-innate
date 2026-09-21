import { MEDIA_PAIR_DEFAULTS, drawLedOccupancy, drawMergeShapes, emptyOccupancy, ledRadius, roundedGridUnionPath, type DitherFieldSettings, type DitherStamp, type OccupancyLayer } from "./dither-cells";

export const MEDIA_PAIR_WIPE_MIN = 0;
export const MEDIA_PAIR_WIPE_MAX = 1;
export const MEDIA_PAIR_WIPE_DEFAULT = 1;
export const MEDIA_RANDOM_MIN = 0;
export const MEDIA_RANDOM_MAX = 1;
export const MEDIA_RANDOM_DEFAULT = .76;
export const MEDIA_BLEED_MIN = 0;
export const MEDIA_BLEED_MAX = 3;
export const MEDIA_BLEED_DEFAULT = .54;

function clampUnit(value: number, fallback: number) {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(0, Math.min(1, value));
}

function clampBleed(value: number) {
  if (!Number.isFinite(value)) return MEDIA_BLEED_DEFAULT;
  return Math.max(MEDIA_BLEED_MIN, Math.min(MEDIA_BLEED_MAX, value));
}

export type MediaFrame = { x: number; y: number; width: number; height: number };

export function clampMediaWipe(value: number) {
  if (!Number.isFinite(value)) return MEDIA_PAIR_WIPE_DEFAULT;
  return Math.max(MEDIA_PAIR_WIPE_MIN, Math.min(MEDIA_PAIR_WIPE_MAX, Math.round(value * 100) / 100));
}

/** Two equal frames with a gutter, reading source → treated from left to right. */
export function mediaPairFrames(width: number, height: number): { left: MediaFrame; right: MediaFrame } {
  const padX = Math.max(28, width * .035);
  const padY = Math.max(36, height * .07);
  const gap = Math.max(18, width * .028);
  const frameWidth = Math.max(40, (width - padX * 2 - gap) / 2);
  const frameHeight = Math.max(40, height - padY * 2);
  return {
    left: { x: padX, y: padY, width: frameWidth, height: frameHeight },
    right: { x: padX + frameWidth + gap, y: padY, width: frameWidth, height: frameHeight },
  };
}

/** One treated frame, leaving room for the cell library on the right. */
export function mediaSubjectFrame(width: number, height: number): MediaFrame {
  const padX = Math.max(28, width * .04);
  const padY = Math.max(28, height * .06);
  const gutter = Math.min(260, width * .26);
  const usableWidth = width - gutter;
  const frameWidth = Math.max(40, Math.min(1040, usableWidth - padX * 2));
  return {
    x: (usableWidth - frameWidth) / 2,
    y: padY,
    width: frameWidth,
    height: Math.max(40, height - padY * 2),
  };
}

export function containImageBox(sourceWidth: number, sourceHeight: number, frame: MediaFrame): MediaFrame {
  const aspect = sourceWidth / Math.max(1, sourceHeight);
  let width = frame.width;
  let height = width / aspect;
  if (height > frame.height) {
    height = frame.height;
    width = height * aspect;
  }
  return {
    x: frame.x + (frame.width - width) / 2,
    y: frame.y + (frame.height - height) / 2,
    width,
    height,
  };
}

/** Place the fitted cutout so its center sits on a drag anchor. */
export function anchoredImageBox(sourceWidth: number, sourceHeight: number, frame: MediaFrame, anchor?: { x: number; y: number } | null): MediaFrame {
  const box = containImageBox(sourceWidth, sourceHeight, frame);
  if (!anchor) return box;
  return { ...box, x: anchor.x - box.width / 2, y: anchor.y - box.height / 2 };
}

function sourceSize(image: CanvasImageSource) {
  return {
    width: ("naturalWidth" in image && image.naturalWidth) || (image as { width: number }).width || 1,
    height: ("naturalHeight" in image && image.naturalHeight) || (image as { height: number }).height || 1,
  };
}

/** Occupied where the cutout is; transparent or flattened-black holes stay paper. */
export function subjectInkDensity(r: number, g: number, b: number, a: number) {
  if (a < 10) return 0;
  // JPEG edges carry nearly black compression pixels around the matte.
  if (r < 54 && g < 54 && b < 54) return 0;
  return a / 255;
}

/** Band of occupancy straddling the cut. The bitmap edge is a crop, not a hole. */
export function subjectEdgeField(field: Float32Array, width: number, height: number, radius: number, weight = 2.4, inward = 1) {
  const edge = new Float32Array(field.length);
  const outward = Math.max(1, Math.round(radius));
  const inwardReach = Math.max(0, Math.round(radius * inward));
  const on = (x: number, y: number) => x >= 0 && y >= 0 && x < width && y < height && field[y * width + x] > 0;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (!on(x, y)) continue;
    let hole = false;
    for (let ny = y - 1; ny <= y + 1 && !hole; ny++) for (let nx = x - 1; nx <= x + 1; nx++) {
      if (nx === x && ny === y) continue;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      if (!on(nx, ny)) hole = true;
    }
    if (!hole) continue;
    for (let dy = -outward; dy <= outward; dy++) for (let dx = -outward; dx <= outward; dx++) {
      const px = x + dx;
      const py = y + dy;
      if (px < 0 || py < 0 || px >= width || py >= height) continue;
      const intoSubject = on(px, py);
      const reach = intoSubject ? inwardReach : outward;
      if (dx * dx + dy * dy > reach * reach) continue;
      edge[py * width + px] = weight;
    }
  }
  return edge;
}

/** Black that touches the bitmap edge is the cutout hole. Enclosed dark pixels stay part of the subject. */
export function subjectHoleMask(field: Float32Array, width: number, height: number) {
  const hole = new Uint8Array(width * height);
  const stack: number[] = [];
  const open = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const index = y * width + x;
    if (hole[index] || field[index] > 0) return;
    hole[index] = 1;
    stack.push(index);
  };
  for (let x = 0; x < width; x++) { open(x, 0); open(x, height - 1); }
  for (let y = 0; y < height; y++) { open(0, y); open(width - 1, y); }
  while (stack.length) {
    const index = stack.pop()!;
    const x = index % width;
    const y = Math.floor(index / width);
    open(x + 1, y);
    open(x - 1, y);
    open(x, y + 1);
    open(x, y - 1);
  }
  return hole;
}

export function subjectMask(field: Float32Array, width: number, height: number) {
  const hole = subjectHoleMask(field, width, height);
  const mask = new Uint8Array(field.length);
  for (let index = 0; index < mask.length; index++) if (!hole[index]) mask[index] = 1;
  return mask;
}

function cellNoise(column: number, row: number, driftX = 0, driftY = 0) {
  const x = column / 2.4 + driftX;
  const y = row / 2.4 + driftY;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const hash = (ix: number, iy: number) => {
    let n = Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263);
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
  };
  const a = hash(x0, y0);
  const b = hash(x0 + 1, y0);
  const c = hash(x0, y0 + 1);
  const d = hash(x0 + 1, y0 + 1);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

/** Slow slide of the cut noise, so lobes migrate and bites open and close. */
export function edgeDrift(time: number) {
  if (!time) return { x: 0, y: 0 };
  return { x: time * 0.00009, y: time * 0.000055 };
}

/** A few pixels of wander, plus a fade, for scraps sitting loose of the cut. */
export function scrapDrift(column: number, row: number, time: number) {
  if (!time) return { x: 0, y: 0, alpha: 1 };
  const seed = cellNoise(column + 11, row - 4);
  const speed = 0.00032 + seed * 0.00022;
  return {
    x: Math.sin(time * speed + seed * Math.PI * 2) * 6,
    y: Math.cos(time * speed * .73 + seed * 4.1) * 5,
    alpha: .62 + .38 * (.5 + .5 * Math.sin(time * speed * 1.15 + seed * 2.4)),
  };
}

/** Purple eases after the photograph, then settles on it. */
export function easeMediaLag(current: number, lag: number, reduceMotion = false) {
  if (reduceMotion || !Number.isFinite(lag)) return current;
  const next = lag + (current - lag) * .28;
  return Math.abs(current - next) < .4 ? current : next;
}

export type MaskCell = { column: number; row: number };

/** Shrink the subject so the photograph sits inside the mask. Radius is in mask pixels. */
export function insetSubjectMask(mask: Uint8Array, width: number, height: number, radius: number) {
  if (radius <= 0) return mask;
  const next = new Uint8Array(mask.length);
  const reach = Math.ceil(radius);
  const reach2 = radius * radius;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (!mask[y * width + x]) continue;
    let exposed = false;
    for (let dy = -reach; dy <= reach && !exposed; dy++) for (let dx = -reach; dx <= reach; dx++) {
      if (dx * dx + dy * dy > reach2) continue;
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height || !mask[ny * width + nx]) exposed = true;
    }
    if (!exposed) next[y * width + x] = 1;
  }
  return next;
}

/** The merge shape is the cutout, plus a little random bleed into the hole. */
export function bleedBesideMask(
  mask: Uint8Array,
  maskWidth: number,
  maskHeight: number,
  columns: number,
  rows: number,
  originX: number,
  originY: number,
  scale: number,
  step: number,
  photoInset = 0,
  randomness = MEDIA_RANDOM_DEFAULT,
  overBleed = MEDIA_BLEED_DEFAULT,
  driftX = 0,
  driftY = 0,
) {
  const random = clampUnit(randomness, MEDIA_RANDOM_DEFAULT);
  const bleedAmount = clampBleed(overBleed);
  const purpleCut = 1 - random * .5;
  const biteCut = random * .45;
  const photoMask = insetSubjectMask(mask, maskWidth, maskHeight, photoInset);
  const sample = (column: number, row: number) => {
    const x = Math.round(((column + .5) * step - originX) / scale);
    const y = Math.round(((row + .5) * step - originY) / scale);
    if (x < 0 || y < 0 || x >= maskWidth || y >= maskHeight) return "outside" as const;
    return mask[y * maskWidth + x] ? "subject" as const : "hole" as const;
  };
  const at = new Array<ReturnType<typeof sample>>(columns * rows);
  for (let row = 0; row < rows; row++) for (let column = 0; column < columns; column++) {
    at[row * columns + column] = sample(column, row);
  }
  const touchesHole = (column: number, row: number) => {
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = column + dx;
      const ny = row + dy;
      if (nx < 0 || ny < 0 || nx >= columns || ny >= rows) continue;
      if (at[ny * columns + nx] === "hole") return true;
    }
    return false;
  };
  const touchesSubject = (column: number, row: number) => {
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) === 0) continue;
      const nx = column + dx;
      const ny = row + dy;
      if (nx < 0 || ny < 0 || nx >= columns || ny >= rows) continue;
      if (at[ny * columns + nx] === "subject" && Math.max(Math.abs(dx), Math.abs(dy)) <= 2) return Math.max(Math.abs(dx), Math.abs(dy));
    }
    return 0;
  };
  // Chebyshev distance from every cell to the cutout, so spill can leave the photo rectangle.
  const distanceToSubject = () => {
    const distance = new Int16Array(columns * rows);
    distance.fill(-1);
    const queue: number[] = [];
    for (let index = 0; index < at.length; index++) if (at[index] === "subject") {
      distance[index] = 0;
      queue.push(index);
    }
    for (let head = 0; head < queue.length; head++) {
      const index = queue[head];
      const column = index % columns;
      const row = (index - column) / columns;
      const next = distance[index] + 1;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = column + dx;
        const ny = row + dy;
        if (nx < 0 || ny < 0 || nx >= columns || ny >= rows) continue;
        const neighbor = ny * columns + nx;
        if (distance[neighbor] !== -1) continue;
        distance[neighbor] = next;
        queue.push(neighbor);
      }
    }
    return distance;
  };
  const subjectDistance = bleedAmount > 1 ? distanceToSubject() : null;
  const photo: MaskCell[] = [];
  const light: MaskCell[] = [];
  const purple: MaskCell[] = [];
  const spillLight: MaskCell[] = [];
  const spillPurple: MaskCell[] = [];
  const overlay: MaskCell[] = [];
  const paint = (column: number, row: number, noise: number) => {
    (noise > purpleCut ? purple : light).push({ column, row });
  };
  for (let row = 0; row < rows; row++) for (let column = 0; column < columns; column++) {
    const kind = at[row * columns + column];
    const noise = cellNoise(column, row, driftX, driftY);
    if (kind === "subject") {
      paint(column, row, noise);
      const x = Math.round(((column + .5) * step - originX) / scale);
      const y = Math.round(((row + .5) * step - originY) / scale);
      const inside = x >= 0 && y >= 0 && x < maskWidth && y < maskHeight && photoMask[y * maskWidth + x] > 0;
      const onPhoto = inside && !(touchesHole(column, row) && noise < biteCut);
      if (onPhoto) photo.push({ column, row });
      if (onPhoto && !touchesHole(column, row) && cellNoise(column + 80, row - 13) > 1 - random * .14) overlay.push({ column, row });
      continue;
    }
    if (bleedAmount <= 0 || (kind !== "hole" && kind !== "outside")) continue;
    // The cutout keeps a short skirt. Growing the slider past 100% does not inflate that outline.
    const skirt = Math.min(bleedAmount, 1);
    if (kind === "hole") {
      const distance = touchesSubject(column, row);
      if (distance === 1 && noise > 1 - skirt) paint(column, row, noise);
      else if (distance === 2 && skirt > .2 && noise > 1 - skirt * .33) light.push({ column, row });
    }
    if (bleedAmount <= 1 || !subjectDistance) continue;
    const distance = subjectDistance[row * columns + column];
    if (distance < 3) continue;
    const horizon = 4 + (bleedAmount - 1) * 22;
    if (distance > horizon) continue;
    // Peaks of the noise only, so the extra bleed is separate islands instead of one containing shape.
    const threshold = 0.8 - (bleedAmount - 1) * 0.05 + 0.1 * (distance / horizon);
    if (noise <= threshold) continue;
    const island = cellNoise(column + 5, row + 9, driftX, driftY) > 0.55 ? spillPurple : spillLight;
    island.push({ column, row });
  }
  overlay.sort((a, b) => cellNoise(b.column + 3, b.row) - cellNoise(a.column + 3, a.row));
  return { photo, light, purple, spillLight, spillPurple, overlay: overlay.slice(0, Math.round(4 + random * 8)) };
}

const mediaLayerCache = new WeakMap<CanvasImageSource, { key: string; layer: OccupancyLayer }>();
const punchedCache = new WeakMap<CanvasImageSource, { key: string; canvas: HTMLCanvasElement }>();
const extendedCache = new WeakMap<CanvasImageSource, { key: string; canvas: HTMLCanvasElement }>();

/** Sample the cutout into a placed box so dither cells rebuild the subject. */
export function mediaPairLayer(image: CanvasImageSource, box: MediaFrame): OccupancyLayer {
  const scale = Math.max(1.4, Math.min(3.2, Math.min(box.width, box.height) / 180));
  const width = Math.max(2, Math.ceil(box.width / scale));
  const height = Math.max(2, Math.ceil(box.height / scale));
  const key = `${Math.round(box.x)}:${Math.round(box.y)}:${Math.round(box.width)}:${Math.round(box.height)}:${width}:${height}:subject`;
  const cached = mediaLayerCache.get(image);
  if (cached?.key === key) return cached.layer;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  const field = new Float32Array(width * height);
  const colors = new Uint8ClampedArray(width * height * 4);
  if (context) {
    context.drawImage(image, 0, 0, width, height);
    const pixels = context.getImageData(0, 0, width, height).data;
    colors.set(pixels);
    for (let index = 0; index < field.length; index++) {
      field[index] = subjectInkDensity(pixels[index * 4], pixels[index * 4 + 1], pixels[index * 4 + 2], pixels[index * 4 + 3]);
    }
  }
  const layer = { field, width, height, originX: box.x, originY: box.y, scale, colors };
  mediaLayerCache.set(image, { key, layer });
  return layer;
}

export function mediaLayerCoverage(layer: OccupancyLayer) {
  let filled = 0;
  for (const value of layer.field) if (value > 0) filled++;
  return filled / Math.max(1, layer.field.length);
}

function punchedSubject(image: CanvasImageSource, box: MediaFrame) {
  const width = Math.max(2, Math.round(box.width));
  const height = Math.max(2, Math.round(box.height));
  const key = `${width}:${height}:hole`;
  const cached = punchedCache.get(image);
  if (cached?.key === key) return cached.canvas;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (context) {
    context.drawImage(image, 0, 0, width, height);
    const pixels = context.getImageData(0, 0, width, height);
    const data = pixels.data;
    const ink = new Float32Array(width * height);
    for (let index = 0; index < ink.length; index++) {
      ink[index] = subjectInkDensity(data[index * 4], data[index * 4 + 1], data[index * 4 + 2], data[index * 4 + 3]);
    }
    const hole = subjectHoleMask(ink, width, height);
    for (let index = 0; index < ink.length; index++) if (hole[index]) data[index * 4 + 3] = 0;
    context.putImageData(pixels, 0, 0);
  }
  punchedCache.set(image, { key, canvas });
  return canvas;
}

/** Carry the nearest real photo color into the matte so grid corners can replace the smooth cutout. */
function extendedSubject(image: CanvasImageSource, photo: HTMLCanvasElement) {
  const key = `${photo.width}:${photo.height}`;
  const cached = extendedCache.get(image);
  if (cached?.key === key) return cached.canvas;
  const canvas = document.createElement("canvas");
  canvas.width = photo.width;
  canvas.height = photo.height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (context) {
    context.drawImage(photo, 0, 0);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
    const data = pixels.data;
    const width = canvas.width, height = canvas.height, length = width * height;
    const nearest = new Int32Array(length).fill(-1);
    const queue = new Int32Array(length);
    let head = 0, tail = 0;
    const opaque = (index: number) => data[index * 4 + 3] > 0;
    for (let index = 0; index < length; index++) {
      if (data[index * 4 + 3] === 0) continue;
      const x = index % width, y = Math.floor(index / width);
      if (x < 5 || y < 5 || x + 5 >= width || y + 5 >= height
        || !opaque(index - 5) || !opaque(index + 5)
        || !opaque(index - width * 5) || !opaque(index + width * 5)) continue;
      nearest[index] = index;
      queue[tail++] = index;
    }
    if (!tail) for (let index = 0; index < length; index++) {
      if (!opaque(index)) continue;
      nearest[index] = index;
      queue[tail++] = index;
    }
    while (head < tail) {
      const index = queue[head++];
      const x = index % width, y = Math.floor(index / width);
      for (const neighbor of [x > 0 ? index - 1 : -1, x + 1 < width ? index + 1 : -1,
        y > 0 ? index - width : -1, y + 1 < height ? index + width : -1]) {
        if (neighbor < 0 || nearest[neighbor] >= 0) continue;
        nearest[neighbor] = nearest[index];
        queue[tail++] = neighbor;
      }
    }
    for (let index = 0; index < length; index++) {
      if (nearest[index] < 0) continue;
      const source = nearest[index] * 4, target = index * 4;
      const darkMatteFringe = nearest[index] !== index
        && Math.max(data[target], data[target + 1], data[target + 2]) < 100;
      if (data[target + 3] !== 0 && !darkMatteFringe) continue;
      data[target] = data[source];
      data[target + 1] = data[source + 1];
      data[target + 2] = data[source + 2];
      data[target + 3] = 255;
    }
    context.putImageData(pixels, 0, 0);
  }
  extendedCache.set(image, { key, canvas });
  return canvas;
}

const tintCache = new WeakMap<CanvasImageSource, { purple: HTMLCanvasElement; light: HTMLCanvasElement }>();

function tintCell(image: CanvasImageSource, color: string) {
  const size = sourceSize(image).width;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = Math.max(2, size);
  const context = canvas.getContext("2d");
  if (!context) return canvas;
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  context.globalCompositeOperation = "source-in";
  context.fillStyle = color;
  context.fillRect(0, 0, canvas.width, canvas.height);
  return canvas;
}

function mergeColors(image: CanvasImageSource) {
  const cached = tintCache.get(image);
  if (cached) return cached;
  const colors = { purple: tintCell(image, "#5550fa"), light: tintCell(image, "#bab8ff") };
  tintCache.set(image, colors);
  return colors;
}

/** A few displaced pieces still show the original image rather than a flat accent color. */
function drawPhotoFragments(
  context: CanvasRenderingContext2D,
  photo: HTMLCanvasElement,
  cells: MaskCell[],
  mask: Uint8Array,
  maskWidth: number,
  maskHeight: number,
  box: MediaFrame,
  scale: number,
  spacing: number,
  time = 0,
  shiftX = 0,
  shiftY = 0,
) {
  const sampled = (column: number, row: number) => {
    const x = Math.round(((column + .5) * spacing - box.x) / scale);
    const y = Math.round(((row + .5) * spacing - box.y) / scale);
    return x >= 0 && y >= 0 && x < maskWidth && y < maskHeight && mask[y * maskWidth + x] > 0;
  };
  const chosen: MaskCell[] = [];
  for (const cell of cells) {
    if ((cell.row + .5) * spacing > box.y + box.height - spacing * 1.5) continue;
    let hash = Math.imul(cell.column + 19, 374761393) ^ Math.imul(cell.row + 37, 668265263);
    hash = Math.imul(hash ^ (hash >>> 13), 1274126177);
    const chance = ((hash ^ (hash >>> 16)) >>> 0) / 4294967295;
    if (chance > .4) continue;
    const direction = ([[0, -1], [-1, 0], [1, 0], [0, 1]] as const)
      .find(([dx, dy]) => !sampled(cell.column + dx, cell.row + dy));
    if (!direction) continue;
    const [dx, dy] = direction;
    const column = cell.column + dx * 2, row = cell.row + dy * 2;
    if (sampled(column, row)
      || chosen.some(other => Math.abs(other.column - column) <= 1 && Math.abs(other.row - row) <= 1)) continue;
    const size = spacing * (chance < .08 ? 1.35 : .9);
    const cropSize = Math.min(size, photo.width, photo.height);
    const x = (column + .5) * spacing - size / 2;
    const y = (row + .5) * spacing - size / 2;
    const sourceX = Math.max(0, Math.min(photo.width - cropSize, (cell.column + .5) * spacing - box.x - cropSize / 2));
    const sourceY = Math.max(0, Math.min(photo.height - cropSize, (cell.row + .5) * spacing - box.y - cropSize / 2));
    const drift = scrapDrift(column, row, time);
    context.save();
    context.globalAlpha = drift.alpha;
    context.translate(shiftX + drift.x, shiftY + drift.y);
    context.beginPath();
    context.roundRect(x, y, size, size, size * .36);
    context.clip();
    context.drawImage(photo, sourceX, sourceY, cropSize, cropSize, x, y, size, size);
    context.restore();
    chosen.push({ column, row });
    if (chosen.length >= 14) break;
  }
  context.canvas.dataset.mediaFragments = String(chosen.length);
}

let photoPlate: HTMLCanvasElement | null = null;
const mediaLags = new WeakMap<HTMLCanvasElement, { x: number; y: number }>();

function fieldGrid(width: number, height: number) {
  const targetStep = width < 620 ? 13 : width < 1050 ? 16 : 19;
  const columns = Math.max(8, Math.floor(width / targetStep));
  const rows = Math.max(8, Math.floor(height / targetStep));
  return { columns, rows, stepX: width / columns, stepY: height / rows };
}

function silhouettePoints(cells: MaskCell[], spacing: number, shiftX = 0, shiftY = 0) {
  const occupied = new Set(cells.map(cell => `${cell.column}:${cell.row}`));
  const points: { x: number; y: number }[] = [];
  for (const cell of cells) {
    const open = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => !occupied.has(`${cell.column + dx}:${cell.row + dy}`));
    if (!open) continue;
    points.push({ x: (cell.column + .5) * spacing + shiftX, y: (cell.row + .5) * spacing + shiftY });
  }
  return points;
}

/** Darken and enlarge unlit LEDs that sit near the cut. */
function drawLocalWake(
  context: CanvasRenderingContext2D,
  points: { x: number; y: number }[],
  columns: number,
  rows: number,
  stepX: number,
  stepY: number,
  ledSize: number,
) {
  if (!points.length) return;
  const pitch = Math.min(stepX, stepY);
  const base = ledRadius(pitch, ledSize);
  const reach = pitch * 2.4;
  const bins = new Map<string, { x: number; y: number }[]>();
  for (const point of points) {
    const key = `${Math.floor(point.x / reach)}:${Math.floor(point.y / reach)}`;
    const list = bins.get(key);
    if (list) list.push(point);
    else bins.set(key, [point]);
  }
  const bands: { x: number; y: number }[][] = [[], [], [], []];
  for (let row = 0; row < rows; row++) for (let column = 0; column < columns; column++) {
    const x = (column + .5) * stepX;
    const y = (row + .5) * stepY;
    const bx = Math.floor(x / reach);
    const by = Math.floor(y / reach);
    let nearest = reach;
    for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
      const list = bins.get(`${bx + ox}:${by + oy}`);
      if (!list) continue;
      for (const point of list) {
        const distance = Math.hypot(point.x - x, point.y - y);
        if (distance < nearest) nearest = distance;
      }
    }
    if (nearest >= reach) continue;
    const falloff = 1 - nearest / reach;
    bands[falloff > .72 ? 3 : falloff > .45 ? 2 : falloff > .2 ? 1 : 0].push({ x, y });
  }
  const styles = [
    { radius: base * 1.2, color: "#b7b8b4" },
    { radius: base * 1.5, color: "#969793" },
    { radius: base * 1.85, color: "#747572" },
    { radius: base * 2.2, color: "#555653" },
  ];
  for (let band = 0; band < styles.length; band++) {
    const dots = bands[band];
    if (!dots.length) continue;
    const style = styles[band];
    context.fillStyle = style.color;
    context.beginPath();
    for (const dot of dots) {
      context.moveTo(dot.x + style.radius, dot.y);
      context.arc(dot.x, dot.y, style.radius, 0, Math.PI * 2);
    }
    context.fill();
  }
}

function frameObject(frame: MediaFrame) {
  return {
    bounds: { left: frame.x, top: frame.y, right: frame.x + frame.width, bottom: frame.y + frame.height },
    anchor: { x: frame.x + frame.width / 2, y: frame.y + frame.height / 2 },
  };
}

export function drawMediaPair(
  context: CanvasRenderingContext2D,
  image: CanvasImageSource | undefined,
  width: number,
  height: number,
  stamp?: DitherStamp,
  settings?: DitherFieldSettings,
  anchor?: { x: number; y: number } | null,
  time = 0,
) {
  const frame = mediaSubjectFrame(width, height);
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  const grid = fieldGrid(width, height);
  if (settings?.showGrid !== false) {
    drawLedOccupancy(context, emptyOccupancy(), grid.columns, grid.rows, grid.stepX, grid.stepY, settings ?? MEDIA_PAIR_DEFAULTS);
  }
  if (!image) {
    return { objects: [frameObject(frame)], left: frame, right: frame };
  }
  const source = sourceSize(image);
  const box = anchoredImageBox(source.width, source.height, frame, anchor);
  const photo = punchedSubject(image, box);
  const deep = stamp?.ramp?.find(cell => cell.joins);
  if (!deep || !settings) {
    context.drawImage(photo, box.x, box.y, box.width, box.height);
    return { objects: [frameObject(box)], left: box, right: box };
  }
  const sampled = mediaPairLayer(image, box);
  const edgePhoto = extendedSubject(image, photo);
  const scale = sampled.scale ?? 1;
  const spacing = settings.spacing;
  const columns = Math.ceil(width / spacing);
  const rows = Math.ceil(height / spacing);
  const mask = subjectMask(sampled.field, sampled.width, sampled.height);
  const randomness = clampUnit(Number(context.canvas.dataset.mediaRandom), MEDIA_RANDOM_DEFAULT);
  const overBleed = clampBleed(Number(context.canvas.dataset.mediaBleed));
  const reduceMotion = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const drift = edgeDrift(reduceMotion ? 0 : time);
  let lag = mediaLags.get(context.canvas);
  if (!lag) {
    lag = { x: box.x, y: box.y };
    mediaLags.set(context.canvas, lag);
  }
  lag.x = easeMediaLag(box.x, lag.x, reduceMotion);
  lag.y = easeMediaLag(box.y, lag.y, reduceMotion);
  const shiftX = box.x - lag.x;
  const shiftY = box.y - lag.y;
  const bleed = bleedBesideMask(mask, sampled.width, sampled.height, columns, rows, lag.x, lag.y, scale, spacing, spacing * .45 / scale, randomness, overBleed, drift.x, drift.y);
  context.canvas.dataset.mediaCoverage = `${bleed.photo.length}:${bleed.light.length}:${bleed.purple.length}:${Math.round(box.x)}:${Math.round(box.y)}:${Math.round(box.width)}`;
  context.canvas.dataset.mediaLag = `${Math.round(shiftX)}:${Math.round(shiftY)}`;
  let edgeSignature = 0;
  for (const cell of bleed.purple) edgeSignature = (edgeSignature + cell.column * 13 + cell.row * 29) % 100000;
  context.canvas.dataset.mediaEdge = String(edgeSignature);
  const colors = mergeColors(deep.image);
  if (settings.showGrid !== false) {
    const edge = silhouettePoints([...bleed.light, ...bleed.purple, ...bleed.spillLight, ...bleed.spillPurple], spacing);
    const points = Math.hypot(shiftX, shiftY) > 1 ? edge.concat(silhouettePoints([...bleed.light, ...bleed.purple], spacing, shiftX, shiftY)) : edge;
    drawLocalWake(context, points, grid.columns, grid.rows, grid.stepX, grid.stepY, settings.ledSize);
  }
  drawMergeShapes(context, [
    { cells: bleed.light, image: colors.light, tone: "light", level: .4 },
    { cells: bleed.purple, image: colors.purple, tone: "purple", level: 1 },
  ], spacing, spacing, settings.blockSize, settings.rounding, settings.joinLobes);
  if (bleed.spillLight.length || bleed.spillPurple.length) {
    drawMergeShapes(context, [
      { cells: bleed.spillLight, image: colors.light, tone: "spill-light", level: .4 },
      { cells: bleed.spillPurple, image: colors.purple, tone: "spill-purple", level: 1 },
    ], spacing, spacing, settings.blockSize, settings.rounding, Math.min(settings.joinLobes, 48));
  }
  if (!photoPlate) photoPlate = document.createElement("canvas");
  if (photoPlate.width !== Math.ceil(width) || photoPlate.height !== Math.ceil(height)) {
    photoPlate.width = Math.ceil(width);
    photoPlate.height = Math.ceil(height);
  }
  const plate = photoPlate.getContext("2d");
  if (plate) {
    plate.setTransform(1, 0, 0, 1, 0, 0);
    plate.clearRect(0, 0, photoPlate.width, photoPlate.height);
    // Clip once to the union, rounding only the exposed corners of the block edge.
    // Applying destination-in per cell would intersect the cells and erase the photo.
    plate.save();
    plate.translate(shiftX, shiftY);
    plate.clip(roundedGridUnionPath(bleed.photo, spacing, spacing, spacing * settings.rounding / 100));
    plate.drawImage(edgePhoto, lag.x, lag.y, box.width, box.height);
    plate.restore();
    context.drawImage(photoPlate, 0, 0);
  }
  drawPhotoFragments(context, edgePhoto, bleed.photo, mask, sampled.width, sampled.height, { ...box, x: lag.x, y: lag.y }, scale, spacing, reduceMotion ? 0 : time, shiftX, shiftY);
  if (bleed.overlay.length) {
    const mark = Math.max(12, settings.blockSize * .42);
    for (const cell of bleed.overlay) {
      const driftMark = scrapDrift(cell.column, cell.row, reduceMotion ? 0 : time);
      context.save();
      context.globalAlpha = driftMark.alpha;
      context.translate(shiftX + driftMark.x, shiftY + driftMark.y);
      drawMergeShapes(context, [
        { cells: [cell], image: colors.purple, tone: "overlay", level: 1 },
      ], spacing, spacing, mark, settings.rounding, Math.min(settings.joinLobes, 36));
      context.restore();
    }
  }
  return {
    objects: [frameObject(box)],
    left: box,
    right: box,
  };
}
