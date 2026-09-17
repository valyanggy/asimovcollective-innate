import type { Box } from "./component-linkage";
import type { OccupancyLayer } from "./dither-cells";

const clamp = (value: number) => Math.max(0, Math.min(1, value));
const ease = (value: number) => {
  const t = clamp(value);
  return t * t * (3 - 2 * t);
};

function boxCenter(box: Box) {
  return { x: (box.left + box.right) / 2, y: (box.top + box.bottom) / 2 };
}

/** Where a ray from the box center exits the rectangle. */
function rayBoxExit(box: Box, ux: number, uy: number) {
  const center = boxCenter(box);
  const halfX = (box.right - box.left) / 2;
  const halfY = (box.bottom - box.top) / 2;
  const hitX = Math.abs(ux) < 1e-6 ? Infinity : halfX / Math.abs(ux);
  const hitY = Math.abs(uy) < 1e-6 ? Infinity : halfY / Math.abs(uy);
  const travel = Math.min(hitX, hitY);
  return { x: center.x + ux * travel, y: center.y + uy * travel };
}

function move(point: { x: number; y: number }, ux: number, uy: number, distance: number) {
  return { x: point.x + ux * distance, y: point.y + uy * distance };
}

/** Large at the docks, smallest at the midpoint — the bead profile in the sketch. */
function beadRadius(travel: number, endRadius: number, waistRadius: number) {
  const pinch = Math.sin(clamp(travel) * Math.PI);
  return waistRadius + (endRadius - waistRadius) * Math.pow(1 - pinch, 1.85);
}

type Bead = { x: number; y: number; radius: number; travel: number };

function placeBeads(
  start: { x: number; y: number },
  ux: number,
  uy: number,
  span: number,
  endRadius: number,
  waistRadius: number,
): Bead[] {
  const beads: Bead[] = [];
  let travel = 0;
  while (travel <= 1.001) {
    const radius = beadRadius(Math.min(travel, 1), endRadius, waistRadius);
    beads.push({
      x: start.x + ux * span * Math.min(travel, 1),
      y: start.y + uy * span * Math.min(travel, 1),
      radius,
      travel: Math.min(travel, 1),
    });
    const next = beadRadius(Math.min(travel + 0.02, 1), endRadius, waistRadius);
    travel += Math.max(0.035, ((radius + next) * 0.72) / span);
    if (beads.length > 36) break;
  }
  const last = beads[beads.length - 1];
  if (!last || last.travel < 0.97) {
    beads.push({ x: start.x + ux * span, y: start.y + uy * span, radius: endRadius, travel: 1 });
  }
  return beads;
}

/**
 * Two large circles start at each island. Smaller beads then appear inward
 * until the chain meets in the middle — not an instant neck.
 */
export function connectIslands(
  from: Box,
  to: Box,
  progress: number,
  spacing: number,
  time = 0,
  profile?: { end?: number; waist?: number },
): OccupancyLayer | null {
  const grown = ease(progress);
  if (grown <= 0.01) return null;

  const start = boxCenter(from);
  const end = boxCenter(to);
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy) || 1;
  const ux = dx / length;
  const uy = dy / length;
  const fromEdge = rayBoxExit(from, ux, uy);
  const toEdge = rayBoxExit(to, -ux, -uy);
  const gap = Math.hypot(toEdge.x - fromEdge.x, toEdge.y - fromEdge.y);
  const endRadius = Math.min(Math.max(12, profile?.end ?? Math.max(40, spacing * 2.2)), Math.max(20, gap * 0.3));
  const waistRadius = Math.max(2, Math.min(profile?.waist ?? Math.max(6, spacing * 0.28), endRadius * 0.75));
  const inset = endRadius * 0.12;
  const origin = move(fromEdge, ux, uy, inset);
  const span = Math.max(24, gap - inset * 2);
  const pulse = 0.98 + 0.02 * Math.sin(time * 0.0013);
  const front = grown * 0.5;
  const visible = placeBeads(origin, ux, uy, span, endRadius, waistRadius).flatMap((bead) => {
    const fromEnd = Math.min(bead.travel, 1 - bead.travel);
    if (fromEnd > front + 0.001) return [];
    const appear = clamp((front - fromEnd) / 0.07);
    const size = bead.radius * pulse * (0.35 + 0.65 * appear);
    if (size < 1.2) return [];
    return [{ ...bead, radius: size }];
  });
  if (!visible.length) return null;

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const bead of visible) {
    minX = Math.min(minX, bead.x - bead.radius);
    minY = Math.min(minY, bead.y - bead.radius);
    maxX = Math.max(maxX, bead.x + bead.radius);
    maxY = Math.max(maxY, bead.y + bead.radius);
  }
  const pad = 14;
  minX -= pad; minY -= pad; maxX += pad; maxY += pad;
  const scale = Math.max(3, spacing / 3);
  const width = Math.ceil((maxX - minX) / scale) + 1;
  const height = Math.ceil((maxY - minY) / scale) + 1;
  const field = new Float32Array(width * height);

  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const x = minX + col * scale;
      const y = minY + row * scale;
      let nearest = Infinity;
      let softness = 4;
      for (const bead of visible) {
        const signed = Math.hypot(x - bead.x, y - bead.y) - bead.radius;
        if (signed < nearest) {
          nearest = signed;
          softness = Math.max(3, bead.radius * 0.08);
        }
      }
      field[row * width + col] = nearest <= 0
        ? 0.97
        : 0.97 * Math.exp(-(nearest * nearest) / (2 * softness * softness));
    }
  }

  return { field, width, height, originX: minX, originY: minY, scale, combine: "max" };
}

/**
 * A continuous implicit neck for 10_push_2. Two soft fronts leave the islands,
 * meet at the midpoint, then widen into one shared density field. There are no
 * visible beads: the same threshold that shapes the domains shapes the bridge.
 */
export function morphIslands(
  from: Box,
  to: Box,
  progress: number,
  spacing: number,
  time = 0,
  profile?: { end?: number; waist?: number },
): OccupancyLayer | null {
  const grown = ease(progress);
  if (grown <= .005) return null;
  const startCenter = boxCenter(from), endCenter = boxCenter(to);
  const dx = endCenter.x - startCenter.x, dy = endCenter.y - startCenter.y;
  const distance = Math.hypot(dx, dy) || 1, ux = dx / distance, uy = dy / distance;
  const start = rayBoxExit(from, ux, uy), end = rayBoxExit(to, -ux, -uy);
  const spanX = end.x - start.x, spanY = end.y - start.y, span = Math.hypot(spanX, spanY) || 1;
  const endRadius = Math.min(Math.max(spacing * 2.7, profile?.end ?? spacing * 4.8), span * .34);
  const waist = Math.min(endRadius * .78, Math.max(spacing * .65, profile?.waist ?? spacing * 1.35));
  const pad = endRadius + spacing * 2;
  const minX = Math.min(start.x, end.x) - pad, minY = Math.min(start.y, end.y) - pad;
  const maxX = Math.max(start.x, end.x) + pad, maxY = Math.max(start.y, end.y) + pad;
  const scale = Math.max(3, spacing / 3);
  const width = Math.ceil((maxX - minX) / scale) + 1, height = Math.ceil((maxY - minY) / scale) + 1;
  const field = new Float32Array(width * height);
  const front = grown * .54;
  const joined = ease((grown - .64) / .36);
  const pulse = .985 + .015 * Math.sin(time * .0011);
  for (let row = 0; row < height; row++) for (let col = 0; col < width; col++) {
    const x = minX + col * scale, y = minY + row * scale;
    const projection = Math.max(0, Math.min(1, ((x - start.x) * spanX + (y - start.y) * spanY) / (span * span)));
    const nearestX = start.x + spanX * projection, nearestY = start.y + spanY * projection;
    const perpendicular = Math.hypot(x - nearestX, y - nearestY);
    const fromEnd = Math.min(projection, 1 - projection);
    const reveal = ease((front - fromEnd + .055) / .11);
    if (reveal <= .002) continue;
    const endBias = Math.pow(Math.abs(projection * 2 - 1), 1.65);
    const localWaist = waist * (.22 + .78 * joined);
    const radius = (localWaist + (endRadius - localWaist) * endBias) * pulse;
    const frontTaper = .18 + .82 * reveal;
    const signed = perpendicular - radius * frontTaper;
    const softness = Math.max(4, spacing * (.32 + .2 * (1 - joined)));
    const density = signed <= 0 ? 1.08 * reveal : 1.08 * reveal * Math.exp(-(signed * signed) / (2 * softness * softness));
    field[row * width + col] = density;
  }
  return { field, width, height, originX: minX, originY: minY, scale };
}
