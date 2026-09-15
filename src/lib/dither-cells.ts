export type DitherFieldSettings = {
  adhesion: number; reach: number; shadow: number; contrast: number;
  softness: number; blockSize: number; spacing: number; relief: number; lightAngle: number; rounding: number;
  showGrid: boolean; letterBlock: string; ledSize: number;
};
export const DITHER_FIELD_DEFAULTS: DitherFieldSettings = {
  adhesion: 6, reach: 2.15, shadow: 2, contrast: .5,
  softness: .32, blockSize: 24, spacing: 24, relief: 2, lightAngle: 360, rounding: 50,
  showGrid: false, letterBlock: "#0300cc", ledSize: 72,
};

export type BuiltinCell = "solid" | "dashed" | "dashed-invert";

export type DitherStamp = {
  id: string;
  kind?: BuiltinCell;
  image?: CanvasImageSource;
  ramp?: ToneCell[];
};

export type ToneCell = { id: string; label: string; level: number; image: CanvasImageSource; joins?: boolean };
export type ToneLibrary = {
  id: string;
  folder: string;
  title: string;
  cells: { id: string; label: string; level: number; joins?: boolean }[];
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
export const DEFAULT_TONE_CELLS = TONAL_LIBRARY.cells;
export function loadToneLibrary(library: ToneLibrary): Promise<ToneCell[]> {
  return Promise.all(library.cells.map(cell => new Promise<ToneCell>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({ ...cell, image });
    image.onerror = () => reject(new Error(`Could not load the ${cell.label.toLowerCase()} cell.`));
    image.src = `/cells/${library.folder}/${cell.id}.svg`;
  })));
}
export function loadDefaultToneCells(): Promise<ToneCell[]> {
  return loadToneLibrary(TONAL_LIBRARY);
}

// Ordered dithering selects adjacent tonal cells, rather than repeating one
// stamp at a fixed opacity. The original SVG colors and hatch marks stay intact.
export function toneCellIndex(tone: number, column: number, row: number, levels: number[]): number {
  if (!levels.length) return -1;
  if (tone <= levels[0]) return 0;
  for (let i = 0; i < levels.length - 1; i++) {
    if (tone > levels[i + 1]) continue;
    const mix = (tone - levels[i]) / Math.max(.0001, levels[i + 1] - levels[i]);
    return i + Number(ditherHit(mix, column, row));
  }
  return levels.length - 1;
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

export const FIGURE_LED_DEFAULTS: DitherFieldSettings = { ...DITHER_FIELD_DEFAULTS, showGrid: true };

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
  let coverage = 0, total = 0, strongest = 0;
  for (const layer of layers) {
    const column = Math.round((x - layer.originX) / (layer.scale ?? 1));
    const row = Math.round((y - layer.originY) / (layer.scale ?? 1));
    if (column < 0 || row < 0 || column >= layer.width || row >= layer.height) continue;
    const density = layer.field[row * layer.width + column];
    total += density;
    strongest = Math.max(strongest, density);
    const t = Math.max(0, Math.min(1, (density - .92) / .16));
    coverage = Math.max(coverage, t * t * (3 - 2 * t));
  }
  if (!settings) return coverage;
  // Combine RAW density before thresholding. Nearby domains now contribute
  // to the same neck; taking the maximum of separate masks cannot do this.
  const density = strongest + (total - strongest) * settings.adhesion;
  const threshold = 1 / settings.shadow;
  const halfWidth = Math.min(settings.softness, threshold * .95);
  const t = Math.max(0, Math.min(1, (density - threshold + halfWidth) / (2 * halfWidth)));
  const tone = t * t * (3 - 2 * t);
  // Preserve genuinely empty/full cells at every contrast setting.
  if (tone <= 0 || tone >= 1) return tone;
  return Math.max(0, Math.min(1, .5 + (tone - .5) * settings.contrast));
}

export function densityAt(layers: OccupancyLayer[], x: number, y: number, adhesion: number): number {
  let total = 0, strongest = 0;
  for (const layer of layers) {
    const col = Math.round((x - layer.originX) / (layer.scale ?? 1)), row = Math.round((y - layer.originY) / (layer.scale ?? 1));
    if (col < 0 || row < 0 || col >= layer.width || row >= layer.height) continue;
    const density = layer.field[row * layer.width + col];
    total += density; strongest = Math.max(strongest, density);
  }
  return strongest + (total - strongest) * adhesion;
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

type JoinedTile = { column: number; row: number; x: number; y: number; image: CanvasImageSource };
type GridEdge = { from: [number,number]; to: [number,number]; used: boolean };

/** Trace the exact grid perimeter and round its corners with vector curves. */
export function roundedGridUnionPath(cells:{column:number;row:number}[],stepX:number,stepY:number,radius:number):Path2D{
  const occupied=new Set(cells.map(cell=>`${cell.column}:${cell.row}`)),edges:GridEdge[]=[];
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
    const scaled=points.map(([x,y])=>({x:x*stepX,y:y*stepY}));
    const rounded=scaled.map((point,index)=>{
      const previous=scaled[(index+scaled.length-1)%scaled.length],next=scaled[(index+1)%scaled.length];
      const beforeLength=Math.hypot(previous.x-point.x,previous.y-point.y),afterLength=Math.hypot(next.x-point.x,next.y-point.y);
      const r=Math.min(radius,beforeLength*.49,afterLength*.49);
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
) {
  if (!tiles.length) return;
  const half = size / 2;
  context.save();
  if(Math.abs(size-stepX)<.5&&Math.abs(size-stepY)<.5){
    context.clip(roundedGridUnionPath(tiles,stepX,stepY,size*Math.min(.5,rounding/100)),'nonzero');
    for(const tile of tiles)context.drawImage(tile.image,tile.x-half,tile.y-half,size,size);
  }else{
    const ratio=Math.max(1,Math.abs(context.getTransform().a));
    for(const tile of tiles){const image=roundedTile(tile.image,size,rounding,15,ratio);context.drawImage(image,tile.x-half,tile.y-half,size,size);}
  }
  context.restore();
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
) {
  const radius = settings ? settings.blockSize / 2 : Math.min(stepX, stepY) * .42;
  const levels = stamp.ramp?.map(cell => cell.level);
  const counts = stamp.ramp ? stamp.ramp.map(() => 0) : null;
  const indices = stamp.ramp?.length && settings && levels ? new Int16Array(columns * rows).fill(-1) : null;
  if (indices && settings && levels) {
    for (let row = 0; row < rows; row++) for (let col = 0; col < columns; col++) {
      const x = (col + .5) * stepX, y = (row + .5) * stepY;
      const density = densityAt(layers, x, y, settings.adhesion) * settings.shadow;
      // Highlights belong to the fringe of a domain, never to empty canvas.
      const fringe = Math.max(0, Math.min(1, (density - .055) / .20));
      if (!ditherHit(fringe * fringe * (3 - 2 * fringe), col, row)) continue;
      indices[row * columns + col] = toneCellIndex(shadedToneAt(layers, x, y, settings), col, row, levels);
    }
  }
  const ratio = Math.max(1, Math.abs(context.getTransform().a));
  const joined: JoinedTile[] = [];
  if (indices && stamp.ramp && settings) {
    for (let row=0;row<rows;row++) for (let column=0;column<columns;column++) {
      const index=indices[row*columns+column];
      if (index<0 || !stamp.ramp[index].joins) continue;
      joined.push({column,row,x:(column+.5)*stepX,y:(row+.5)*stepY,image:stamp.ramp[index].image});
      counts![index]++;
    }
    drawJoinedTiles(context,joined,stepX,stepY,radius*2,settings.rounding);
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
  if (counts) context.canvas.dataset.toneCounts = JSON.stringify(counts);
}

/** Darker, more opaque ink becomes a heavier occupancy so tonal cells can split the figure. */
export function figureInkDensity(r: number, g: number, b: number, a: number): number {
  if (a < 10) return 0;
  const luminance = (.2126 * r + .7152 * g + .0722 * b) / 255;
  return (a / 255) * (.35 + 2.6 * (1 - luminance));
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
