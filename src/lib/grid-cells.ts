export type FieldGrid = { columns: number; rows: number; stepX: number; stepY: number };
export type GridCell = { x: number; y: number; col: number; row: number; mark: string; radius: number };

export const GRID_MARKS = ["A", "7", "K", "3", "M", "2", "Q", "8", "5", "N", "4", "9"];
export const CELL_STROKE = 2.2;
export const CELL_STROKE_COLOR = "#b4b4b4";
export const CELL_ACTIVE_COLOR = "#5b5cff";
export const CELL_FILL = "#ffffff";
const MERGE_STEPS = 3.05;

export function cellRadius(grid: FieldGrid) {
  return Math.min(grid.stepX, grid.stepY) * 1.5;
}

export function mergeLimit(radius: number) {
  return radius * 2.55;
}

export function ledCenter(col: number, row: number, grid: FieldGrid) {
  return { x: (col + .5) * grid.stepX, y: (row + .5) * grid.stepY };
}

export function snapToLed(x: number, y: number, grid: FieldGrid, taken = new Set<string>()) {
  let col = Math.max(1, Math.min(grid.columns - 2, Math.round(x / grid.stepX - .5)));
  let row = Math.max(1, Math.min(grid.rows - 2, Math.round(y / grid.stepY - .5)));
  if (taken.has(`${col},${row}`)) {
    search: for (let ring = 1; ring < 16; ring++) {
      for (let dc = -ring; dc <= ring; dc++) {
        for (let dr = -ring; dr <= ring; dr++) {
          if (Math.max(Math.abs(dc), Math.abs(dr)) !== ring) continue;
          const nextCol = col + dc, nextRow = row + dr;
          if (nextCol < 1 || nextRow < 1 || nextCol > grid.columns - 2 || nextRow > grid.rows - 2) continue;
          if (taken.has(`${nextCol},${nextRow}`)) continue;
          col = nextCol;
          row = nextRow;
          break search;
        }
      }
    }
  }
  taken.add(`${col},${row}`);
  return { col, row, ...ledCenter(col, row, grid) };
}

function slotCell(col: number, row: number, mark: string, radius: number, grid: FieldGrid, taken: Set<string>): GridCell {
  const snapped = snapToLed(ledCenter(col, row, grid).x, ledCenter(col, row, grid).y, grid, taken);
  return { ...snapped, mark, radius };
}

export function placeGridCells(width: number, height: number, positions: ({ x: number; y: number } | null)[] = [], grid: FieldGrid, liveIndex = -1): GridCell[] {
  const radius = cellRadius(grid);
  const taken = new Set<string>();
  const originCol = Math.round(grid.columns * .20);
  const originRow = Math.round(grid.rows * .20);
  const east = Math.round(grid.columns * .72);
  const midCol = Math.round(grid.columns * .50);
  const midRow = Math.round(grid.rows * .38);
  const westRow = Math.round(grid.rows * .54);
  const plusCol = Math.round(grid.columns * .50);
  const plusRow = Math.round(grid.rows * .70);
  const reach = 3;
  const slots = [
    [originCol, originRow],
    [originCol + reach, originRow],
    [east, Math.round(grid.rows * .18)],
    [east + reach, Math.round(grid.rows * .18)],
    [midCol, midRow],
    [Math.round(grid.columns * .17), westRow],
    [Math.round(grid.columns * .17) + reach, westRow],
    [plusCol + reach, plusRow],
    [plusCol, plusRow],
    [plusCol, plusRow - reach],
    [plusCol - reach, plusRow],
    [plusCol, plusRow + reach],
  ];
  return GRID_MARKS.map((mark, index) => {
    const placed = positions[index];
    if (placed && index === liveIndex) {
      const pad = radius + 8;
      return {
        x: Math.max(pad, Math.min(width - pad, placed.x)),
        y: Math.max(pad, Math.min(height - pad, placed.y)),
        col: Math.round(placed.x / grid.stepX - .5),
        row: Math.round(placed.y / grid.stepY - .5),
        mark,
        radius,
      };
    }
    if (placed) {
      const snapped = snapToLed(placed.x, placed.y, grid, taken);
      return { ...snapped, mark, radius };
    }
    const slot = slots[index] ?? [midCol, midRow];
    return slotCell(slot[0], slot[1], mark, radius, grid, taken);
  });
}

export function cellsMerge(a: GridCell, b: GridCell) {
  return Math.hypot(a.x - b.x, a.y - b.y) <= (a.radius + b.radius) * 1.28
    || Math.hypot(a.col - b.col, a.row - b.row) <= MERGE_STEPS;
}

/** Inverse-cube metaball: isolated contour stays a circle; the neck fattens as cells get closer. */
export function metaballField(cells: { x: number; y: number; radius: number }[], x: number, y: number) {
  let sum = 0;
  for (const cell of cells) {
    const distance = Math.hypot(x - cell.x, y - cell.y);
    sum += (cell.radius ** 3) / Math.max(distance ** 3, 1e-8);
  }
  return sum;
}

export const METABALL_THRESHOLD = 1;

type Point = { x: number; y: number };

function fieldContour(cells: { x: number; y: number; radius: number }[], threshold = METABALL_THRESHOLD, step = 2): Point[][] {
  if (!cells.length) return [];
  const radius = Math.max(...cells.map(cell => cell.radius));
  const pad = radius * 1.5 + 12;
  const minX = Math.min(...cells.map(cell => cell.x)) - pad;
  const minY = Math.min(...cells.map(cell => cell.y)) - pad;
  const maxX = Math.max(...cells.map(cell => cell.x)) + pad;
  const maxY = Math.max(...cells.map(cell => cell.y)) + pad;
  const cols = Math.ceil((maxX - minX) / step) + 1;
  const rows = Math.ceil((maxY - minY) / step) + 1;
  const sample = new Float32Array(cols * rows);
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      sample[row * cols + col] = metaballField(cells, minX + col * step, minY + row * step);
    }
  }
  return gridContour(sample, cols, rows, minX, minY, step, threshold);
}

/** Marching squares over a sampled grid, stitched into closed rings. */
export function gridContour(
  sample: Float32Array,
  cols: number,
  rows: number,
  originX: number,
  originY: number,
  step: number,
  threshold: number,
): Point[][] {
  const at = (col: number, row: number) => ({ x: originX + col * step, y: originY + row * step, value: sample[row * cols + col] });
  const segments: [Point, Point][] = [];
  const cross = (a: ReturnType<typeof at>, b: ReturnType<typeof at>) => {
    const t = (threshold - a.value) / ((b.value - a.value) || 1);
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
  };
  for (let row = 0; row < rows - 1; row++) {
    for (let col = 0; col < cols - 1; col++) {
      const sw = at(col, row), se = at(col + 1, row), ne = at(col + 1, row + 1), nw = at(col, row + 1);
      const hits: Point[] = [];
      if ((sw.value >= threshold) !== (se.value >= threshold)) hits.push(cross(sw, se));
      if ((se.value >= threshold) !== (ne.value >= threshold)) hits.push(cross(se, ne));
      if ((ne.value >= threshold) !== (nw.value >= threshold)) hits.push(cross(ne, nw));
      if ((nw.value >= threshold) !== (sw.value >= threshold)) hits.push(cross(nw, sw));
      if (hits.length === 2) segments.push([hits[0], hits[1]]);
      else if (hits.length === 4) {
        segments.push([hits[0], hits[1]], [hits[2], hits[3]]);
      }
    }
  }
  return stitchRings(segments);
}

function stitchRings(segments: [Point, Point][]) {
  const key = (point: Point) => `${point.x.toFixed(2)},${point.y.toFixed(2)}`;
  const nodes = new Map<string, Point>();
  const unused = new Map<string, string[]>();
  const add = (from: Point, to: Point) => {
    const a = key(from), b = key(to);
    nodes.set(a, from);
    nodes.set(b, to);
    unused.set(a, [...(unused.get(a) ?? []), b]);
  };
  const remove = (from: string, to: string) => {
    const list = unused.get(from);
    if (!list) return;
    const index = list.indexOf(to);
    if (index >= 0) list.splice(index, 1);
    if (!list.length) unused.delete(from);
  };
  for (const [a, b] of segments) { add(a, b); add(b, a); }
  const rings: Point[][] = [];
  while (unused.size) {
    const start = unused.keys().next().value;
    if (!start) break;
    const first = unused.get(start)![0];
    const ring = [nodes.get(start)!];
    let previous = start;
    let current = first;
    remove(start, first);
    remove(first, start);
    for (let guard = 0; guard < segments.length + 2; guard++) {
      if (current === start) break;
      ring.push(nodes.get(current)!);
      const nexts = unused.get(current);
      if (!nexts?.length) break;
      const next = nexts.find(point => point !== previous) ?? nexts[0];
      remove(current, next);
      remove(next, current);
      previous = current;
      current = next;
    }
    if (ring.length > 3 && current === start) rings.push(ring);
  }
  return rings;
}

export function metaballPath(cells: { x: number; y: number; radius: number }[], threshold = METABALL_THRESHOLD, step = 2): Path2D {
  const path = new Path2D();
  for (const ring of fieldContour(cells, threshold, step)) {
    if (ring.length < 3) continue;
    path.moveTo(ring[0].x, ring[0].y);
    for (let index = 1; index < ring.length; index++) path.lineTo(ring[index].x, ring[index].y);
    path.closePath();
  }
  return path;
}

export function cellComponents(cells: GridCell[]): number[][] {
  const parent = cells.map((_, index) => index);
  const find = (index: number): number => parent[index] === index ? index : (parent[index] = find(parent[index]));
  for (let i = 0; i < cells.length; i++) {
    for (let j = i + 1; j < cells.length; j++) {
      if (!cellsMerge(cells[i], cells[j])) continue;
      const a = find(i), b = find(j);
      if (a !== b) parent[a] = b;
    }
  }
  const groups = new Map<number, number[]>();
  cells.forEach((_, index) => {
    const root = find(index);
    const group = groups.get(root);
    if (group) group.push(index);
    else groups.set(root, [index]);
  });
  return [...groups.values()];
}

export function cellBounds(cell: GridCell) {
  const pad = 6;
  return {
    left: cell.x - cell.radius - pad,
    top: cell.y - cell.radius - pad,
    right: cell.x + cell.radius + pad,
    bottom: cell.y + cell.radius + pad,
  };
}

function drawComponent(context: CanvasRenderingContext2D, cells: GridCell[], stroke: string) {
  const rings = fieldContour(cells);
  if (!rings.length) return;
  context.beginPath();
  for (const ring of rings) {
    context.moveTo(ring[0].x, ring[0].y);
    for (let index = 1; index < ring.length; index++) context.lineTo(ring[index].x, ring[index].y);
    context.closePath();
  }
  context.fillStyle = CELL_FILL;
  context.fill();
  context.strokeStyle = stroke;
  context.lineWidth = CELL_STROKE;
  context.lineJoin = "round";
  context.lineCap = "round";
  context.stroke();
}

export function drawGridCells(context: CanvasRenderingContext2D, cells: GridCell[], active = -1) {
  const components = cellComponents(cells);
  const activeRoot = active >= 0 ? components.find(group => group.includes(active)) : undefined;
  for (const group of components) {
    if (group === activeRoot) continue;
    drawComponent(context, group.map(index => cells[index]), CELL_STROKE_COLOR);
  }
  if (activeRoot) drawComponent(context, activeRoot.map(index => cells[index]), CELL_ACTIVE_COLOR);
  context.textAlign = "center";
  context.textBaseline = "middle";
  for (let index = 0; index < cells.length; index++) {
    const cell = cells[index];
    const selected = activeRoot?.includes(index) ?? false;
    context.fillStyle = selected ? CELL_ACTIVE_COLOR : "#8d8d8d";
    context.font = `${Math.round(cell.radius * .92)}px Algebra, Arial, sans-serif`;
    context.fillText(cell.mark, cell.x, cell.y + 1);
  }
}
