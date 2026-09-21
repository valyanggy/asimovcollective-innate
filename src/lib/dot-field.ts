import { ditherDensity } from "./dither-density";
import { drawDomainTrails, type TrailSettings } from "./domain-trails";
import { drawThinkingArcs } from "./thinking-arcs";
import { drawComponentLinkage, type LinkageSettings } from "./component-linkage";
import { fitTerritoryEllipse, type TerritoryEllipse, orderTerritory, territoryCoverage } from "./agent-territory";
import { drawCenteredOverlay, drawDitheredOccupancy, drawLedOccupancy, emptyOccupancy, imageDitherLayer, imageMergeLayers, overlayDensityBox, positionedOverlayPlacement, withDitherAppearance, DITHER_FIELD_DEFAULTS, type DitherFieldSettings, type DitherStamp, type OccupancyLayer } from "./dither-cells";
import { connectIslands, morphIslands } from "./bridge-density";
import { appearingStepLinks, chatAppear, drawAppearingOverlays, drawStepOverlays, sequenceAppear, sequenceOverlayState, stepCardBox, visibleStepLinks, stepSequenceElapsed, STEP_SCALE, type SequenceStudio, type StepOverlaySpec } from "./step-overlays";
import { mapTypeLineBoxes, nearestTypeBox, typeLineMergeScale, typeLinesOf } from "./type-area";
import { cellBounds, drawGridCells, placeGridCells } from "./grid-cells";

export type Dot = { territory?: number; x: number; y: number; radius: number; cyclePhase: number; cycleSpeed: number; blurAmount: number };
type BlurredDot = { x: number; y: number; core: number; spread: number; opacity: number };
type NetworkPoint = { x: number; y: number };
type LocalEdge = { first: number; second: number; distance: number };
type LocalNetwork = { nodes: NetworkPoint[]; edges: LocalEdge[] };
type ObstacleLabel = {
  lines: string[];
  x: number;
  y: number;
  size: number;
  lineHeight: number;
  font: "Algebra" | "MDIO";
  offsets: number[];
};
export type Bounds = { left: number; top: number; right: number; bottom: number };
export type DotFieldLayout = { headlineBounds: Bounds; headlineAnchor: Point; objects?: { bounds: Bounds; anchor: Point }[] };

type Point = { x: number; y: number };
type Mass = Point & { radius: number; weight: number };

// 09_3 appearance controls; retain the network renderer for later use.
const multiAgentAppearance = { showConnections: false, mergeScale: 2.2 };

function random(seed: number) {
  let value = (seed + 0x6d2b79f5) | 0;
  value = Math.imul(value ^ (value >>> 15), value | 1);
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
  return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
}

const smoothstep = (start: number, end: number, value: number) => {
  const t = Math.max(0, Math.min(1, (value - start) / (end - start)));
  return t * t * (3 - 2 * t);
};

export function gridMetrics(width: number, height: number, scale = 1) {
  const targetStep = (width < 620 ? 13 : width < 1050 ? 16 : 19) * scale;
  const minAxis = Math.max(8, Math.round(24 / scale));
  const columns = Math.max(minAxis, Math.floor(width / targetStep));
  const rows = Math.max(minAxis, Math.floor(height / targetStep));
  return { columns, rows, stepX: width / columns, stepY: height / rows };
}

const segmentDistance = (point: Point, start: Point, end: Point) => {
  const dx = end.x - start.x, dy = end.y - start.y;
  const length = dx * dx + dy * dy;
  const t = length ? Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / length)) : 0;
  return Math.hypot(point.x - (start.x + dx * t), point.y - (start.y + dy * t));
};

function createBlurredDots(seed: number, width: number, height: number): BlurredDot[] {
  const count = Math.max(14, Math.round((width * height) / 52000));
  return Array.from({ length: count }, (_, index) => ({
    x: random(seed + index * 277 + 907) * width,
    y: random(seed + index * 293 + 1009) * height,
    core: 3 + random(seed + index * 307 + 1103) * 9,
    spread: 11 + random(seed + index * 331 + 1201) * 22,
    opacity: .055 + random(seed + index * 347 + 1301) * .105,
  }));
}

const localNetworkCache = new Map<string, LocalNetwork>();

const orientation = (a: NetworkPoint, b: NetworkPoint, c: NetworkPoint) =>
  (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);

function crosses(first: LocalEdge, second: LocalEdge, nodes: NetworkPoint[]) {
  if (first.first === second.first || first.first === second.second || first.second === second.first || first.second === second.second) return false;
  const a = nodes[first.first], b = nodes[first.second], c = nodes[second.first], d = nodes[second.second];
  return orientation(a, b, c) * orientation(a, b, d) < 0 && orientation(c, d, a) * orientation(c, d, b) < 0;
}

function createLocalNetwork(seed: number, dots: Dot[], width: number, height: number): LocalNetwork | null {
  if (dots.length < 8) return null;
  const key = `${seed}:${Math.round(width)}:${Math.round(height)}:${dots.length}`;
  const cached = localNetworkCache.get(key);
  if (cached) return cached;
  if (localNetworkCache.size > 3) localNetworkCache.clear();
  const { stepX, stepY } = gridMetrics(width, height), unit = Math.min(stepX, stepY);
  const selectionRate = Math.min(.46, 72 / dots.length);
  const nodes = dots.filter((_, index) => random(seed + index * 431 + 1901) < selectionRate)
    .map(dot => ({ x: dot.x, y: dot.y }));
  if (nodes.length < 4) return null;
  const maximumDistance = unit * 4.2;
  const proposals: LocalEdge[] = [];
  for (let first = 0; first < nodes.length; first++) for (let second = first + 1; second < nodes.length; second++) {
    const distance = Math.hypot(nodes[first].x - nodes[second].x, nodes[first].y - nodes[second].y);
    if (distance <= maximumDistance) proposals.push({ first, second, distance });
  }
  proposals.sort((a, b) => a.distance - b.distance);
  const capacities = nodes.map((_, index) => {
    const choice = random(seed + index * 449 + 2003);
    return choice < .18 ? 1 : choice < .8 ? 2 : 3;
  });
  const degrees = nodes.map(() => 0), edges: LocalEdge[] = [];
  const edgeLimit = Math.floor(nodes.length * 1.04);
  for (let index = 0; index < proposals.length && edges.length < edgeLimit; index++) {
    const edge = proposals[index];
    if (degrees[edge.first] >= capacities[edge.first] || degrees[edge.second] >= capacities[edge.second]) continue;
    const proximity = 1 - edge.distance / maximumDistance;
    if (random(seed + index * 463 + 2111) >= .5 + proximity * .43) continue;
    if (edges.some(existing => crosses(edge, existing, nodes)) && random(seed + index * 479 + 2203) > .08) continue;
    edges.push(edge); degrees[edge.first]++; degrees[edge.second]++;
  }
  for (let node = 0; node < nodes.length; node++) {
    if (degrees[node] || capacities[node] < 1) continue;
    const nearest = proposals.find(edge => (edge.first === node || edge.second === node)
      && degrees[edge.first] < capacities[edge.first] && degrees[edge.second] < capacities[edge.second]
      && !edges.some(existing => crosses(edge, existing, nodes)));
    if (nearest) { edges.push(nearest); degrees[nearest.first]++; degrees[nearest.second]++; }
  }
  const result = { nodes, edges };
  localNetworkCache.set(key, result);
  return result;
}

function drawPathNetwork(context: CanvasRenderingContext2D, seed: number, time: number, dots: Dot[], width: number, height: number) {
  const network = createLocalNetwork(seed, dots, width, height);
  if (!network) return;
  context.lineCap = "round"; context.lineJoin = "round";
  context.strokeStyle = "rgba(17, 17, 17, .38)"; context.lineWidth = .9;
  context.beginPath();
  for (let edgeIndex = 0; edgeIndex < network.edges.length; edgeIndex++) {
    const edge = network.edges[edgeIndex];
    const first = network.nodes[edge.first], second = network.nodes[edge.second];
    const dx = second.x - first.x, dy = second.y - first.y;
    const distance = Math.max(1, Math.hypot(dx, dy));
    const wobble = Math.sin(time * (.00075 + random(seed + edgeIndex * 17 + 2321) * .00055)
      + random(seed + edgeIndex * 29 + 2333) * Math.PI * 2)
      * (.45 + random(seed + edgeIndex * 41 + 2347) * 1.05);
    const middleX = (first.x + second.x) / 2 - dy / distance * wobble;
    const middleY = (first.y + second.y) / 2 + dx / distance * wobble;
    context.moveTo(first.x, first.y);
    context.quadraticCurveTo(middleX, middleY, second.x, second.y);
  }
  context.stroke();
}

const clamp = (minimum: number, value: number, maximum: number) =>
  Math.max(minimum, Math.min(maximum, value));

function createObstacleLabels(seed: number, width: number, height: number, headlinePosition?: Point | null): ObstacleLabel[] {
  const largeSize = clamp(48, width * .068, 104);
  const smallSize = clamp(17, width * .018, 28);
  const headlineLeft = random(seed + 2633) < .5;
  const largeX = headlineLeft
    ? width * (.07 + random(seed + 2647) * .12)
    : width * (.52 + random(seed + 2647) * .12);
  const smallX = headlineLeft
    ? width * (.67 + random(seed + 2659) * .13)
    : width * (.08 + random(seed + 2659) * .13);
  return [
    {
      lines: ["innate", "robotics"],
      x: headlinePosition?.x ?? largeX,
      y: headlinePosition?.y ?? height * (.38 + random(seed + 2671) * .3),
      size: largeSize,
      lineHeight: .76,
      font: "Algebra",
      offsets: [0, largeSize * (.55 + random(seed + 2683) * .75)],
    },
    {
      lines: ["2026", "Summer", "Hackathon"],
      x: smallX,
      y: height * (.18 + random(seed + 2699) * .25),
      size: smallSize,
      lineHeight: 1.02,
      font: "MDIO",
      offsets: [0, 0, smallSize * (.45 + random(seed + 2711) * .9)],
    },
  ];
}

function createMultipleLabels(context: CanvasRenderingContext2D, seed: number, width: number, height: number,
  positions: (Point | null)[]): ObstacleLabel[] {
  const labels = createObstacleLabels(seed, width, height);
  const size = clamp(17, width * .024, 28);
  labels.push(
    { lines: ["<skill_walk>"], x: 0, y: 0, size, lineHeight: 1.02, font: "MDIO", offsets: [0] },
    { lines: ["<push>"], x: 0, y: 0, size, lineHeight: 1.02, font: "MDIO", offsets: [0] },
  );
  const narrow = width < 650;
  const slots = narrow ? [[.12, .22], [.18, .48], [.12, .68], [.54, .85]]
    : [[.08, .40], [.68, .26], [.16, .76], [.73, .69]];
  return labels.map((label, index) => {
    label.x = width * (slots[index][0] + (random(seed + index * 97 + 3907) - .5) * .06);
    label.y = height * (slots[index][1] + (random(seed + index * 103 + 3911) - .5) * .06);
    let bounds = measureLabelBounds(context, label);
    const available = width * (narrow ? .86 : index === 0 ? .5 : .3);
    if (bounds.right - bounds.left > available) {
      const scale = available / (bounds.right - bounds.left);
      label.size *= scale;
      label.offsets = label.offsets.map(offset => offset * scale);
      bounds = measureLabelBounds(context, label);
    }
    const position = positions[index];
    const leftOffset = bounds.left - label.x, rightOffset = bounds.right - label.x;
    const topOffset = bounds.top - label.y, bottomOffset = bounds.bottom - label.y;
    label.x = clamp(8 - leftOffset, position?.x ?? label.x, width - 8 - rightOffset);
    label.y = clamp(8 - topOffset, position?.y ?? label.y, height - 8 - bottomOffset);
    return label;
  });
}

const labelTracking = (label: ObstacleLabel) =>
  label.font === "Algebra" ? -label.size * .055 : -label.size * .035;

function measureGlyphBoxes(context: CanvasRenderingContext2D, label: ObstacleLabel): Bounds[] {
  const sideInset = label.size * .055;
  const verticalInset = Math.max(1, label.size * .018);
  const tracking = labelTracking(label);
  const boxes: Bounds[] = [];
  context.font = `${label.size}px "${label.font}"`;
  for (let lineIndex = 0; lineIndex < label.lines.length; lineIndex++) {
    const line = label.lines[lineIndex];
    const x = label.x + label.offsets[lineIndex];
    const baseline = label.y + lineIndex * label.size * label.lineHeight;
    const metrics = Array.from(line).map(character => context.measureText(character));
    let advance = 0;
    for (let index = 0; index < metrics.length; index++) {
      const metric = metrics[index];
      const leftInset = index === 0 ? sideInset : 0;
      const rightInset = index === metrics.length - 1 ? sideInset : .6;
      const cellWidth = metric.width + (index === metrics.length - 1 ? 0 : tracking);
      const ascent = metric.actualBoundingBoxAscent || label.size * .74;
      const descent = metric.actualBoundingBoxDescent || label.size * .04;
      boxes.push({
        left: x + advance - leftInset,
        top: baseline - ascent - verticalInset,
        right: x + advance + cellWidth + rightInset,
        bottom: baseline + descent + verticalInset,
      });
      advance += metric.width + tracking;
    }
  }
  return boxes;
}

function measureLabelBounds(context: CanvasRenderingContext2D, label: ObstacleLabel): Bounds {
  const boxes = measureGlyphBoxes(context, label);
  const bounds: Bounds = { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity };
  for (const box of boxes) {
    bounds.left = Math.min(bounds.left, box.left);
    bounds.right = Math.max(bounds.right, box.right);
    bounds.top = Math.min(bounds.top, box.top);
    bounds.bottom = Math.max(bounds.bottom, box.bottom);
  }
  return bounds;
}

// One implicit surface: the rounded letter silhouette and circular dot kernels
// contribute density to the same buffer. The density=1 contour is the liquid
// boundary; no pair selection, connectors, or hand-drawn bridge geometry.
const liquidLayers = new WeakMap<HTMLCanvasElement, Map<number, {
  key: string; canvas: HTMLCanvasElement; context: CanvasRenderingContext2D;
  base: Float32Array; influence: Float32Array; field: Float32Array; image: ImageData; backdropMask: ImageData;
  width: number; height: number; left: number; top: number;
}>>();

function drawLiquidSurface(context: CanvasRenderingContext2D, time: number, dots: Dot[], label: ObstacleLabel, slot = 0, mergeScale = 1, outerRings = false, backdrop?: HTMLCanvasElement, blit = true): OccupancyLayer | undefined {
  const boxes = measureGlyphBoxes(context, { ...label, x: 0, y: 0 });
  const softness = Math.max(5, Math.min(8, label.size * .09)) * mergeScale;
  const padding = Math.ceil(softness * 6 + 16);
  const left = Math.floor(Math.min(...boxes.map(box => box.left))) - padding;
  const top = Math.floor(Math.min(...boxes.map(box => box.top))) - padding;
  const width = Math.ceil(Math.max(...boxes.map(box => box.right)) - left) + padding;
  const height = Math.ceil(Math.max(...boxes.map(box => box.bottom)) - top) + padding;
  // Cache the text's local density: dragging only translates it, so the costly
  // signed-distance calculation is not repeated on every pointer move.
  const key = JSON.stringify([boxes, softness, width, height]);
  let layers = liquidLayers.get(context.canvas);
  if (!layers) { layers = new Map(); liquidLayers.set(context.canvas, layers); }
  let layer = layers.get(slot);
  if (!layer || layer.key !== key) {
    const canvas = document.createElement("canvas");
    canvas.width = width; canvas.height = height;
    const bufferContext = canvas.getContext("2d");
    if (!bufferContext) return;
    const base = new Float32Array(width * height);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      let distance = Infinity;
      for (const box of boxes) {
        const radius = Math.min(4, (box.right - box.left) * .2);
        const qx = Math.abs(x + left + .5 - (box.left + box.right) / 2) - (box.right - box.left) / 2 + radius;
        const qy = Math.abs(y + top + .5 - (box.top + box.bottom) / 2) - (box.bottom - box.top) / 2 + radius;
        distance = Math.min(distance, Math.hypot(Math.max(qx, 0), Math.max(qy, 0))
          + Math.min(Math.max(qx, qy), 0) - radius);
      }
      // A small outward offset keeps the white letter edges inside the ink.
      base[y * width + x] = Math.exp(-Math.max(-softness * 2, distance - 2) / softness);
    }
    const influence = base.map(density => smoothstep(.003, .06, density));
    layer = { key, canvas, context: bufferContext, base, influence, field: new Float32Array(base.length),
      image: bufferContext.createImageData(width, height), backdropMask: bufferContext.createImageData(width, height), width, height, left, top };
    layers.set(slot, layer);
  }
  layer.field.set(layer.base);
  const originX = label.x + left, originY = label.y + top;
  for (const dot of dots) {
    const visibility = smoothstep(-.42, .78, Math.sin(time * dot.cycleSpeed + dot.cyclePhase)) * (dot.territory ?? 1);
    if (visibility < .01) continue;
    const sigma = softness * .85;
    let proximity = 0;
    if (mergeScale > 1) {
      let distance = Infinity;
      for (const box of boxes) {
        distance = Math.min(distance, Math.hypot(
          Math.max(box.left - (dot.x - label.x), dot.x - label.x - box.right, 0),
          Math.max(box.top - (dot.y - label.y), dot.y - label.y - box.bottom, 0),
        ));
      }
      proximity = 1 - smoothstep(softness * .5, softness * 3, distance);
    }
    // Swell the participating dots near contact, leaving distant dots alone.
    const radius = dot.radius * (1 + (mergeScale - 1) * proximity);
    const support = radius + sigma * 4;
    const cx = dot.x - originX, cy = dot.y - originY;
    if (cx + support < 0 || cy + support < 0 || cx - support >= width || cy - support >= height) continue;
    const x0 = Math.max(0, Math.floor(cx - support)), x1 = Math.min(width - 1, Math.ceil(cx + support));
    const y0 = Math.max(0, Math.floor(cy - support)), y1 = Math.min(height - 1, Math.ceil(cy + support));
    const amplitude = visibility * visibility * Math.exp(radius * radius / (2 * sigma * sigma));
    const horizontal = new Float32Array(x1 - x0 + 1);
    for (let x = x0; x <= x1; x++) horizontal[x - x0] = Math.exp(-((x + .5 - cx) ** 2) / (2 * sigma * sigma));
    for (let y = y0; y <= y1; y++) {
      const rowDensity = amplitude * Math.exp(-((y + .5 - cy) ** 2) / (2 * sigma * sigma));
      for (let x = x0; x <= x1; x++) {
        const index = y * width + x;
        // Fade influence outside the headline neighborhood to preserve the
        // rest of the terrain and avoid an artificial rectangular cutoff.
        layer.field[index] += layer.influence[index] * rowDensity * horizontal[x - x0];
      }
    }
  }
  // Three lower-density contours share the animated metaball field, so they
  // follow every swell, join and separation. Their gaps remain transparent.
  // Convert outward distances to density thresholds once per frame.
  // Wider overall reach, with diminishing outward gaps: 18px, 13px, 9px.
  const rings = outerRings ? [{ offset: 18, opacity: .34 }, { offset: 31, opacity: .22 }, { offset: 40, opacity: .12 }].map(ring => ({
    opacity: ring.opacity,
    outer: Math.exp(-(ring.offset + 2) / softness),
    outerSolid: Math.exp(-(ring.offset + .6) / softness),
    innerSolid: Math.exp(-(ring.offset - .6) / softness),
    inner: Math.exp(-(ring.offset - 2) / softness),
  })) : [];
  if (blit) {
    const pixels = layer.image.data;
    const maskPixels = layer.backdropMask.data;
    const haloOutside = Math.exp(-46 / softness), haloInside = Math.exp(-37 / softness);
    for (let index = 0; index < layer.field.length; index++) {
      const density = layer.field[index];
      // Narrow smooth threshold gives an antialiased, solid black contour.
      let alpha = smoothstep(.92, 1.08, density);
      if (outerRings && density < .92) for (const ring of rings) {
        if (density <= ring.outer || density >= ring.inner) continue;
        const band = smoothstep(ring.outer, ring.outerSolid, density)
          * (1 - smoothstep(ring.innerSolid, ring.inner, density));
        alpha = Math.max(alpha, ring.opacity * band);
      }
      pixels[index * 4 + 3] = Math.round(255 * alpha);
      if (backdrop) {
        // A feathered annulus follows the same density as all three rings.
        // Keep the solid black body and the typography out of the blur mask.
        const halo = smoothstep(haloOutside, haloInside, density) * (1 - smoothstep(.78, 1.02, density));
        maskPixels[index * 4 + 3] = Math.round(255 * halo);
      }
    }
    if (backdrop) {
      layer.context.putImageData(layer.backdropMask, 0, 0);
      layer.context.globalCompositeOperation = 'source-in';
      layer.context.drawImage(backdrop, -originX, -originY);
      layer.context.globalCompositeOperation = 'source-over';
      context.drawImage(layer.canvas, originX, originY);
    }
    layer.context.putImageData(layer.image, 0, 0);
    context.drawImage(layer.canvas, originX, originY);
  }
  return { field: layer.field, width, height, originX, originY };
}

function drawObstacleLabels(context: CanvasRenderingContext2D, labels: ObstacleLabel[], rectangular = false, liquidAll = false, letterFill = "#ffffff", blockFill?: string) {
  context.textAlign = "left";
  context.textBaseline = "alphabetic";
  for (const [labelIndex, label] of labels.entries()) {
    context.font = `${label.size}px "${label.font}"`;
    for (let lineIndex = 0; lineIndex < label.lines.length; lineIndex++) {
      const line = label.lines[lineIndex];
      const x = label.x + label.offsets[lineIndex];
      const baseline = label.y + lineIndex * label.size * label.lineHeight;
      const sideInset = label.size * .055;
      const verticalInset = Math.max(1, label.size * .018);
      const tracking = labelTracking(label);
      const glyphs = Array.from(line).map(character => ({
        character,
        metrics: context.measureText(character),
        x: 0,
      }));
      let advance = 0;
      for (const glyph of glyphs) {
        glyph.x = advance;
        advance += glyph.metrics.width + tracking;
      }
      if (blockFill) {
        context.fillStyle = blockFill;
        for (const glyph of glyphs) {
          if (/\s/.test(glyph.character)) continue;
          const ascent = glyph.metrics.actualBoundingBoxAscent;
          const descent = glyph.metrics.actualBoundingBoxDescent;
          if (!(ascent + descent)) continue;
          const left = glyph.metrics.actualBoundingBoxLeft ?? 0;
          const right = glyph.metrics.actualBoundingBoxRight ?? glyph.metrics.width;
          context.fillRect(x + glyph.x + left, baseline - ascent, Math.max(1, right - left), ascent + descent);
        }
      } else {
        context.fillStyle = "#000000";
        for (let characterIndex = 0; !rectangular && !liquidAll && labelIndex !== 0 && characterIndex < glyphs.length; characterIndex++) {
          const glyph = glyphs[characterIndex];
          const ascent = glyph.metrics.actualBoundingBoxAscent || label.size * .74;
          const descent = glyph.metrics.actualBoundingBoxDescent || label.size * .04;
          const leftInset = characterIndex === 0 ? sideInset : 0;
          const rightInset = characterIndex === glyphs.length - 1 ? sideInset : .6;
          const cellWidth = characterIndex === glyphs.length - 1
            ? glyph.metrics.width
            : glyphs[characterIndex + 1].x - glyph.x;
          context.fillRect(
            x + glyph.x - leftInset,
            baseline - ascent - verticalInset,
            cellWidth + leftInset + rightInset,
            ascent + descent + verticalInset * 2,
          );
        }
      }
      context.fillStyle = letterFill;
      for (const glyph of glyphs) context.fillText(glyph.character, x + glyph.x, baseline);
    }
  }
}

// A spatial color field: neighbors share a hue, with small cell-level variation.
// The palette stays in world coordinates when the headline is dragged.
const rectanglePalette = [
  [255, 137, 163], [255, 189, 113], [211, 242, 66], [106, 249, 70],
  [43, 234, 140], [45, 223, 232], [44, 155, 239], [67, 70, 240],
  [137, 76, 240], [221, 81, 200],
];

function pigmentNoise(seed: number, x: number, y: number): number {
  const ix = Math.floor(x), iy = Math.floor(y);
  const u = smoothstep(0, 1, x - ix), v = smoothstep(0, 1, y - iy);
  const sample = (dx: number, dy: number) => random(seed + (ix + dx) * 374761 + (iy + dy) * 668265);
  const top = sample(0, 0) * (1 - u) + sample(1, 0) * u;
  const bottom = sample(0, 1) * (1 - u) + sample(1, 1) * u;
  return top * (1 - v) + bottom * v;
}

const pigmentSites = new Map<number, { x: number; y: number; color: number[] }[]>();

function rectangleColor(seed: number, x: number, y: number, index: number): string {
  let sites = pigmentSites.get(seed);
  if (!sites) {
    // Independent pigment choices, not positions along an ordered spectrum.
    // Cooler pools dominate with occasional lime, pink, and apricot accents.
    const choices = [4, 5, 6, 7, 8, 3, 5, 6, 7, 0, 1, 2, 9];
    sites = Array.from({ length: 30 }, (_, i) => ({
      x: (i % 6 + .1 + random(seed + i * 181 + 3601) * .8) / 6,
      y: (Math.floor(i / 6) + .1 + random(seed + i * 193 + 3613) * .8) / 5,
      color: rectanglePalette[choices[Math.floor(random(seed + i * 211 + 3623) * choices.length)]],
    }));
    if (pigmentSites.size >= 4) pigmentSites.clear();
    pigmentSites.set(seed, sites);
  }
  // Distort coordinates at two scales so patch boundaries meander rather
  // than following the site lattice. The distortion is stable during dragging.
  const wx = x + (pigmentNoise(seed + 3659, x * 5, y * 5) - .5) * .23
    + (pigmentNoise(seed + 3671, x * 13, y * 13) - .5) * .055;
  const wy = y + (pigmentNoise(seed + 3691, x * 5, y * 5) - .5) * .23
    + (pigmentNoise(seed + 3701, x * 13, y * 13) - .5) * .055;
  const nearest = sites.map(site => ({ site, distance: (wx - site.x) ** 2 + (wy - site.y) ** 2 }))
    .sort((a, b) => a.distance - b.distance).slice(0, 3);
  const channels = [0, 0, 0];
  let total = 0;
  for (const { site, distance } of nearest) {
    const weight = Math.exp(-(distance - nearest[0].distance) * 230);
    total += weight;
    for (let channel = 0; channel < 3; channel++) channels[channel] += site.color[channel] * weight;
  }
  const grain = (random(seed + index * 179) - .5) * 12;
  return channels.map(value => Math.round(clamp(0, value / total + grain, 255))).join(", ");
}

/** Sample a shared density on a fixed rectangular lattice. Chebyshev distance
 * gives the sources square shoulders; whole occupied cells make the contour
 * orthogonal. Both text agents contribute to the same field as the terrain. */
function drawRectangleSurface(context: CanvasRenderingContext2D, seed: number, time: number,
  dots: Dot[], labels: ObstacleLabel[], width: number, height: number) {
  const { columns, stepX, stepY } = gridMetrics(width, height);
  const cellWidth = stepX, cellHeight = stepY * .75;
  const cellRows = Math.ceil(height / cellHeight);
  const density = new Float32Array(columns * cellRows);
  const boxes = labels.flatMap(label => measureGlyphBoxes(context, label));
  const softness = Math.min(stepX, stepY) * 1.3;
  for (let row = 0; row < cellRows; row++) for (let column = 0; column < columns; column++) {
    const x = (column + .5) * cellWidth, y = (row + .5) * cellHeight;
    let distance = Infinity;
    for (const box of boxes) {
      const dx = Math.max(box.left - x, x - box.right, 0);
      const dy = Math.max(box.top - y, y - box.bottom, 0);
      distance = Math.min(distance, Math.max(dx, dy));
    }
    density[row * columns + column] = 1.65 * Math.exp(-distance / softness);
  }
  for (const dot of dots) {
    // Slow modulation keeps the cellular edge alive without switching the
    // entire terrain on/off with every individual dot's pulse.
    const amplitude = .32 + .46 * (.5 + .5 * Math.sin(time * dot.cycleSpeed * .35 + dot.cyclePhase));
    const rx = cellWidth * 1.4, ry = cellHeight * 1.6;
    const minColumn = Math.max(0, Math.floor((dot.x - rx * 2.5) / cellWidth));
    const maxColumn = Math.min(columns - 1, Math.ceil((dot.x + rx * 2.5) / cellWidth));
    const minRow = Math.max(0, Math.floor((dot.y - ry * 2.5) / cellHeight));
    const maxRow = Math.min(cellRows - 1, Math.ceil((dot.y + ry * 2.5) / cellHeight));
    for (let row = minRow; row <= maxRow; row++) for (let column = minColumn; column <= maxColumn; column++) {
      const distance = Math.max(Math.abs((column + .5) * cellWidth - dot.x) / rx,
        Math.abs((row + .5) * cellHeight - dot.y) / ry);
      density[row * columns + column] += amplitude * Math.exp(-distance * distance * 1.8);
    }
  }
  for (let row = 0; row < cellRows; row++) for (let column = 0; column < columns; column++) {
    const index = row * columns + column;
    const value = density[index];
    const threshold = .98 + random(seed + index * 157) * .2;
    const opacity = smoothstep(threshold - .04, threshold + .04, value);
    const x = column * cellWidth, y = row * cellHeight;
    const color = rectangleColor(seed, (x + cellWidth / 2) / width, (y + cellHeight / 2) / height, index);
    if (opacity > .01) {
      context.fillStyle = `rgba(${color}, ${opacity})`;
      context.fillRect(x, y, cellWidth + .25, cellHeight + .25);
    } else {
      // Smaller pastel cells trail the same density, leaving the empty areas white.
      const halo = smoothstep(.025, .85, value);
      if (halo > .015) {
        const size = .24 + .22 * halo;
        context.fillStyle = `rgba(${color}, ${.12 + halo * .47})`;
        context.fillRect(x + cellWidth * (1 - size) / 2, y + cellHeight * (1 - size) / 2,
          cellWidth * size, cellHeight * size);
      } else {
        context.fillStyle = "rgba(30, 30, 30, .12)";
        context.beginPath();
        context.arc(x + cellWidth / 2, y + cellHeight / 2, 1, 0, Math.PI * 2);
        context.fill();
      }
    }
  }
  drawObstacleLabels(context, labels, true);
}

/** Produces a connected, irregular density field while keeping every visible
 * mark centered on a strict grid. The seed changes only on a fresh page load. */
export function createDotField(seed: number, width: number, height: number): Dot[] {
  const { columns, rows, stepX, stepY } = gridMetrics(width, height);
  const unit = Math.min(stepX, stepY);

  const center = { x: .34 + random(seed + 1) * .32, y: .34 + random(seed + 2) * .3 };
  const angle = random(seed + 3) * Math.PI * 2;
  const masses: Mass[] = [];
  const massCount = 4 + Math.floor(random(seed + 4) * 3);
  for (let i = 0; i < massCount; i++) {
    const along = i / Math.max(1, massCount - 1) - .5;
    const bend = Math.sin(along * Math.PI) * (.08 + random(seed + 10 + i) * .09);
    const spread = .36 + random(seed + 30 + i) * .2;
    masses.push({
      x: center.x + Math.cos(angle) * along * spread - Math.sin(angle) * bend,
      y: center.y + Math.sin(angle) * along * spread + Math.cos(angle) * bend,
      radius: .085 + random(seed + 50 + i) * .075,
      weight: .82 + random(seed + 70 + i) * .38,
    });
  }

  const satellites: Mass[] = Array.from({ length: 3 }, (_, i) => ({
    x: .08 + random(seed + 100 + i * 4) * .84,
    y: .08 + random(seed + 101 + i * 4) * .84,
    radius: .035 + random(seed + 102 + i * 4) * .05,
    weight: .5 + random(seed + 103 + i * 4) * .35,
  }));
  const holes: Mass[] = Array.from({ length: 2 }, (_, i) => ({
    x: center.x + (random(seed + 140 + i * 3) - .5) * .32,
    y: center.y + (random(seed + 141 + i * 3) - .5) * .3,
    radius: .04 + random(seed + 142 + i * 3) * .05,
    weight: .72,
  }));

  const dots: Dot[] = [];
  for (let row = 0; row < rows; row++) for (let column = 0; column < columns; column++) {
    const cell = row * columns + column;
    const point = { x: (column + .5) / columns, y: (row + .5) / rows };
    let field = 0;
    for (const mass of masses) {
      const distance = Math.hypot(point.x - mass.x, point.y - mass.y) / mass.radius;
      field = Math.max(field, Math.exp(-distance * distance * .72) * mass.weight);
    }
    for (let i = 1; i < masses.length; i++) {
      const distance = segmentDistance(point, masses[i - 1], masses[i]);
      field = Math.max(field, Math.exp(-(distance * distance) / .0024) * .7);
    }
    for (const satellite of satellites) {
      const distance = Math.hypot(point.x - satellite.x, point.y - satellite.y) / satellite.radius;
      field = Math.max(field, Math.exp(-distance * distance * .8) * satellite.weight);
    }
    for (const hole of holes) {
      const distance = Math.hypot(point.x - hole.x, point.y - hole.y) / hole.radius;
      field -= Math.exp(-distance * distance * .9) * hole.weight;
    }

    const texture = .78 + random(seed + cell * 47 + 211) * .44;
    const core = smoothstep(.2, .76, field * texture);
    const halo = smoothstep(.035, .32, field) * .11;
    const isolated = random(seed + cell * 89 + 307) < .007 ? .3 : 0;
    if (random(seed + cell * 131 + 401) > Math.min(.98, core + halo + isolated)) continue;
    const radiusScale = .16 + smoothstep(.08, .74, field) * .3;
    const radius = unit * Math.min(.47, radiusScale * (.88 + random(seed + cell * 173 + 503) * .2));
    dots.push({
      x: (column + .5) * stepX,
      y: (row + .5) * stepY,
      radius,
      cyclePhase: random(seed + cell * 197 + 607) * Math.PI * 2,
      cycleSpeed: .00052 + random(seed + cell * 211 + 701) * .00072,
      blurAmount: 5 + random(seed + cell * 223 + 809) * 5,
    });
  }
  return dots;
}

const neuronShapes = new WeakMap<HTMLCanvasElement, {
  key: string; time: number; vertices: Point[]; ellipse: TerritoryEllipse | null;
}>();

function neuronShape(canvas: HTMLCanvasElement, time: number, key: string, vertices: Point[]) {
  let state = neuronShapes.get(canvas);
  if (!state || state.key !== key) {
    state = { key, time, vertices: vertices.map(point => ({ ...point })), ellipse: null };
    neuronShapes.set(canvas, state);
  }
  const response = time === 0 ? 1 : 1 - Math.exp(-Math.max(0, Math.min(100, time - state.time)) / 700);
  state.time = time;
  let moving = !state.ellipse;
  state.vertices.forEach((point, index) => {
    const dx = vertices[index].x - point.x, dy = vertices[index].y - point.y;
    if (Math.hypot(dx, dy) > .2) moving = true;
    point.x += dx * response; point.y += dy * response;
  });
  const polygon = orderTerritory(state.vertices);
  if (moving) state.ellipse = fitTerritoryEllipse(polygon);
  // Leave room for the curved rim and the existing dot field.
  const ellipse = state.ellipse ? { ...state.ellipse, rx: state.ellipse.rx * .76, ry: state.ellipse.ry * .76 } : null;
  return { polygon, ellipse };
}

function ellipseDistance(point: Point, ellipse: TerritoryEllipse): number {
  const dx = point.x - ellipse.x, dy = point.y - ellipse.y;
  const cos = Math.cos(ellipse.angle), sin = Math.sin(ellipse.angle);
  return (Math.hypot((dx * cos + dy * sin) / ellipse.rx, (-dx * sin + dy * cos) / ellipse.ry) - 1)
    * Math.min(ellipse.rx, ellipse.ry);
}

function drawNeuronRim(context: CanvasRenderingContext2D, polygon: Point[], ellipse: TerritoryEllipse | null) {
  if (!ellipse || Math.min(ellipse.rx, ellipse.ry) < 8) return;
  context.strokeStyle = "rgba(0, 0, 0, .58)";
  context.lineWidth = 1.15;
  context.beginPath();
  context.ellipse(ellipse.x, ellipse.y, ellipse.rx, ellipse.ry, ellipse.angle, 0, Math.PI * 2);
  context.stroke();
  context.strokeStyle = "rgba(0, 0, 0, .38)";
  context.beginPath();
  for (let index = 0; index < polygon.length; index++) {
    const a = polygon[index], b = polygon[(index + 1) % polygon.length];
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    const dx = mx - ellipse.x, dy = my - ellipse.y;
    const cos = Math.cos(ellipse.angle), sin = Math.sin(ellipse.angle);
    const length = Math.hypot((dx * cos + dy * sin) / ellipse.rx, (-dx * sin + dy * cos) / ellipse.ry);
    if (length < .01) continue;
    const tx = ellipse.x + dx / length * 1.12, ty = ellipse.y + dy / length * 1.12;
    context.moveTo(a.x, a.y);
    context.quadraticCurveTo(2 * tx - mx, 2 * ty - my, b.x, b.y);
  }
  context.stroke();
}

/** Four peer-to-peer paths follow the rim of the opening. Each has a
 * restrained secondary filament; no central hub or hierarchy of trunks. */
function drawAgentNeurons(context: CanvasRenderingContext2D, vertices: Point[], ellipse: TerritoryEllipse | null) {
  const polygon = orderTerritory(vertices);
  if (polygon.length < 2) return;
  const center = ellipse ?? polygon.reduce((sum, point) => ({ x: sum.x + point.x / polygon.length,
    y: sum.y + point.y / polygon.length }), { x: 0, y: 0 });
  context.lineCap = "round";
  context.lineJoin = "round";
  const count = polygon.length === 2 ? 1 : polygon.length;
  for (let index = 0; index < count; index++) {
    const a = polygon[index], b = polygon[(index + 1) % polygon.length];
    const dx = b.x - a.x, dy = b.y - a.y, span = Math.hypot(dx, dy);
    if (span < 8) continue;
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    let tx = mx + (center.x - mx) * .3, ty = my + (center.y - my) * .3;
    if (ellipse) {
      const ex = mx - ellipse.x, ey = my - ellipse.y;
      const cos = Math.cos(ellipse.angle), sin = Math.sin(ellipse.angle);
      const length = Math.hypot((ex * cos + ey * sin) / ellipse.rx, (-ex * sin + ey * cos) / ellipse.ry);
      if (length > .01) { tx = ellipse.x + ex / length * 1.14; ty = ellipse.y + ey / length * 1.14; }
    }
    const qx = 2 * tx - mx, qy = 2 * ty - my;
    for (let filament = 0; filament < 2; filament++) {
      const offset = filament * Math.min(9, span * .035);
      // Shift the handles toward the first endpoint to give the bow a
      // steeper departure and a longer, relaxed arrival.
      const c1 = { x: a.x + (qx - a.x) * 2 / 3 - dx * .08 - dy / span * offset,
        y: a.y + (qy - a.y) * 2 / 3 - dy * .08 + dx / span * offset };
      const c2 = { x: b.x + (qx - b.x) * 2 / 3 - dx * .08 + dy / span * offset,
        y: b.y + (qy - b.y) * 2 / 3 - dy * .08 - dx / span * offset };
      context.strokeStyle = filament ? "rgba(0, 0, 0, .20)" : "rgba(0, 0, 0, .72)";
      context.lineWidth = filament ? .65 : 1.2;
      context.beginPath();
      context.moveTo(a.x, a.y);
      context.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, b.x, b.y);
      context.stroke();
    }
  }
}

const territoryTransitions = new WeakMap<HTMLCanvasElement, {
  key: string; time: number; coverage: Float32Array; radii: Float32Array;
}>();

function createTerritoryDots(canvas: HTMLCanvasElement, time: number, seed: number, width: number, height: number, vertices: Point[], opening: TerritoryEllipse | null, componentBoxes: Bounds[]): Dot[] {
  const polygon = orderTerritory(vertices);
  const { columns, rows, stepX, stepY } = gridMetrics(width, height);
  const unit = Math.min(stepX, stepY);
  const key = `${seed}:${width}:${height}`;
  let transition = territoryTransitions.get(canvas);
  const initialize = !transition || transition.key !== key;
  if (initialize) {
    transition = { key, time, coverage: new Float32Array(columns * rows), radii: new Float32Array(columns * rows) };
    territoryTransitions.set(canvas, transition);
  }
  const state = transition!;
  const elapsed = Math.max(0, Math.min(100, time - state.time));
  state.time = time;
  // Ease each cell's presence, rather than delaying the draggable text.
  // time=0 is the existing reduced-motion/static rendering path.
  const instant = initialize || time === 0;
  const dots: Dot[] = [];
  for (let row = 0; row < rows; row++) for (let column = 0; column < columns; column++) {
    const cell = row * columns + column;
    const x = (column + .5) * stepX, y = (row + .5) * stepY;
    const openingMask = opening ? smoothstep(-unit * .2, unit * .8, ellipseDistance({ x, y }, opening)) : 1;
    const target = territoryCoverage({ x, y }, polygon, unit * 1.65) * openingMask;
    const previous = state.coverage[cell];
    const response = target > previous ? 700 : 900;
    const coverage = instant ? target : previous + (target - previous) * (1 - Math.exp(-elapsed / response));
    state.coverage[cell] = coverage;
    if (coverage < .015) continue;
    const texture = pigmentNoise(seed + 4201, column * .18, row * .18);
    if (random(seed + cell * 131 + 401) > .62 + texture * .3) continue;
    // Measure from the actual letter blocks so long words attract dots along
    // their whole silhouette, rather than only around the word's center.
    let nearest = Infinity;
    for (const box of componentBoxes) {
      nearest = Math.min(nearest, Math.hypot(Math.max(box.left - x, x - box.right, 0),
        Math.max(box.top - y, y - box.bottom, 0)));
    }
    const desiredRadius = unit * (.10 + .42 * Math.exp(-nearest / (unit * 5)));
    const previousRadius = state.radii[cell];
    const radius = instant || !previousRadius ? desiredRadius
      : previousRadius + (desiredRadius - previousRadius) * (1 - Math.exp(-elapsed / 450));
    state.radii[cell] = radius;
    dots.push({ x, y, territory: coverage,
      radius: radius * Math.sqrt(coverage),
      cyclePhase: random(seed + cell * 197 + 607) * Math.PI * 2,
      cycleSpeed: .00052 + random(seed + cell * 211 + 701) * .00072,
      blurAmount: 5 + random(seed + cell * 223 + 809) * 5,
    });
  }
  return dots;
}

// A separate pale, soft layer occupies the whole four-agent interior,
// including the opening intentionally left empty by the small terrain dots.
const interiorHaze = new WeakMap<HTMLCanvasElement, { key: string; time: number; opacity: Float32Array }>();
function drawInteriorHaze(canvas: HTMLCanvasElement, context: CanvasRenderingContext2D, seed: number,
  time: number, width: number, height: number, vertices: Point[]) {
  const polygon = orderTerritory(vertices);
  if (polygon.length < 3) return;
  const unit = Math.min(gridMetrics(width, height).stepX, gridMetrics(width, height).stepY);
  const spacing = unit * 4.8, columns = Math.ceil(width / spacing), rows = Math.ceil(height / spacing);
  const key = `${seed}:${width}:${height}`;
  let state = interiorHaze.get(canvas);
  const fresh = !state || state.key !== key;
  if (fresh) {
    state = { key, time, opacity: new Float32Array(columns * rows) };
    interiorHaze.set(canvas, state);
  }
  const current = state!;
  const elapsed = Math.max(0, Math.min(100, time - current.time));
  current.time = time;
  let visible = 0;
  for (let row = 0; row < rows; row++) for (let col = 0; col < columns; col++) {
    const id = row * columns + col, local = seed + id * 2593;
    const x = (col + .5 + (random(local + 11) - .5) * .65) * spacing;
    const y = (row + .5 + (random(local + 29) - .5) * .65) * spacing;
    const target = territoryCoverage({ x, y }, polygon, unit * 1.2);
    const response = fresh || time === 0 ? 1 : 1 - Math.exp(-elapsed / (target > current.opacity[id] ? 750 : 1000));
    current.opacity[id] += (target - current.opacity[id]) * response;
    if (current.opacity[id] < .015) continue;
    visible++;
    const pulse = .78 + .22 * Math.sin(time * (.00028 + random(local + 43) * .00025) + random(local + 61) * Math.PI * 2);
    const radius = unit * (3.2 + random(local + 73) * 2.4) * (.94 + .06 * pulse);
    const opacity = (.05 + random(local + 97) * .045) * pulse * current.opacity[id];
    const gradient = context.createRadialGradient(x, y, 0, x, y, radius);
    gradient.addColorStop(0, `rgba(17, 17, 17, ${opacity})`);
    gradient.addColorStop(.28, `rgba(17, 17, 17, ${opacity * .85})`);
    gradient.addColorStop(.62, `rgba(17, 17, 17, ${opacity * .3})`);
    gradient.addColorStop(1, 'rgba(17, 17, 17, 0)');
    context.fillStyle = gradient;
    context.beginPath(); context.arc(x, y, radius, 0, Math.PI * 2); context.fill();
  }
  canvas.dataset.interiorHaze = String(visible);
}

const ringBackdrops = new WeakMap<HTMLCanvasElement, HTMLCanvasElement>();
function blurRingBackdrop(canvas: HTMLCanvasElement, width: number, height: number, time: number): HTMLCanvasElement | undefined {
  let backdrop = ringBackdrops.get(canvas);
  if (!backdrop) { backdrop = document.createElement('canvas'); ringBackdrops.set(canvas, backdrop); }
  const w = Math.ceil(width), h = Math.ceil(height);
  if (backdrop.width !== w) backdrop.width = w;
  if (backdrop.height !== h) backdrop.height = h;
  const context = backdrop.getContext('2d');
  if (!context) return;
  context.clearRect(0, 0, w, h);
  context.save();
  // One shared background snapshot: overlapping halos never blur each other.
  // Gentle breathing changes the refraction-like softness without moving text.
  context.filter = `blur(${9 + 2 * Math.sin(time * .00045)}px)`;
  context.drawImage(canvas, 0, 0, canvas.width, canvas.height, 0, 0, width, height);
  context.restore();
  return backdrop;
}

export function drawDotField(canvas: HTMLCanvasElement, seed: number, time = 0, headlinePosition?: Point | null, rectangular = false, objectPositions?: (Point | null)[], linkage?: LinkageSettings, dither?: DitherStamp, ditherSettings: DitherFieldSettings = DITHER_FIELD_DEFAULTS, trails?: TrailSettings, figure?: CanvasImageSource, steps?: StepOverlaySpec[], stepDither?: DitherStamp, neckDither?: DitherStamp, figureMorph = false, gridOnly = false, figurePosition?: Point | null, editableFigures = false, figureSize = .158, sequence?: (SequenceStudio & { playing?: boolean }) | null, ditherImage = false, imageMerge = false): DotFieldLayout | undefined {
  const bounds = canvas.getBoundingClientRect();
  if (!bounds.width || !bounds.height) return;
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  const pixelWidth = Math.round(bounds.width * ratio), pixelHeight = Math.round(bounds.height * ratio);
  if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
  if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas is unavailable.");
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, bounds.width, bounds.height);
  if (gridOnly) {
    const { columns, rows, stepX, stepY } = gridMetrics(bounds.width, bounds.height, 1.5);
    drawLedOccupancy(context, emptyOccupancy(), columns, rows, stepX, stepY, ditherSettings);
    const active = Number(canvas.dataset.activeCell ?? -1);
    const live = canvas.dataset.draggingCell === "1" && Number.isFinite(active) ? active : -1;
    const cells = placeGridCells(bounds.width, bounds.height, objectPositions ?? [], { columns, rows, stepX, stepY }, live);
    drawGridCells(context, cells, Number.isFinite(active) ? active : -1);
    const objects = cells.map(cell => ({ bounds: cellBounds(cell), anchor: { x: cell.x, y: cell.y } }));
    return { objects, headlineBounds: objects[0]?.bounds ?? { left: -1, top: -1, right: -1, bottom: -1 }, headlineAnchor: objects[0]?.anchor ?? { x: 0, y: 0 } };
  }
  if (dither && figure) {
    const { columns, rows, stepX, stepY } = gridMetrics(bounds.width, bounds.height);
    drawLedOccupancy(context, emptyOccupancy(), columns, rows, stepX, stepY, ditherSettings);
    if (ditherImage) {
      const layer = imageDitherLayer(figure, bounds.width, bounds.height, figurePosition, figureSize);
      const layers = imageMerge
        ? imageMergeLayers(figure, bounds.width, bounds.height, ditherSettings, figurePosition, figureSize)
        : [layer];
      const spacing = ditherSettings.spacing;
      if (dither.ramp?.length) {
        drawDitheredOccupancy(context, layers, Math.ceil(bounds.width / spacing), Math.ceil(bounds.height / spacing), spacing, spacing, dither, ditherSettings,
          // Match the opaque pale fill used by the 10_3 morph blocks.
          imageMerge ? "#b0afff" : undefined,
          // Image ink occupies a narrower shade range; expand it so 01 and Deep can render.
          imageMerge ? 2.02 : 1);
      }
      canvas.dataset.imageMerge = imageMerge ? String(layers.length) : "0";
      const box = {
        left: layer.originX,
        top: layer.originY,
        right: layer.originX + layer.width * (layer.scale ?? 1),
        bottom: layer.originY + layer.height * (layer.scale ?? 1),
      };
      canvas.dataset.figureImages = "1";
      return {
        objects: [{ bounds: box, anchor: { x: (box.left + box.right) / 2, y: (box.top + box.bottom) / 2 } }],
        headlineBounds: box,
        headlineAnchor: { x: (box.left + box.right) / 2, y: (box.top + box.bottom) / 2 },
      };
    }
    const timing = sequence?.playing ? sequence : undefined;
    const elapsed = timing ? stepSequenceElapsed(canvas, time || performance.now()) : stepSequenceElapsed(canvas, time);
    const nextFigure = sequence?.nextFigure;
    const nextSteps = sequence?.nextSteps ?? [];
    const nextSize = sequence?.nextFigureSize ?? figureSize;
    const hasSecondAct = Boolean(nextFigure || nextSteps.length);
    const previewSecond = !timing && sequence?.preview === 2;
    const overlayState = timing && hasSecondAct
      ? sequenceOverlayState(elapsed, timing, steps?.length ?? 0, nextSteps.length, Boolean(nextFigure))
      : previewSecond
        ? {
            centerFrom: nextFigure ? 0 : 1,
            centerTo: nextFigure ? 1 : 0,
            first: (steps ?? []).map(() => ({ appear: 0, bridge: 0 })),
            second: nextSteps.map(() => ({ appear: 1, bridge: 1 })),
          }
        : null;
    const fullyVisible = !timing && !previewSecond && (time === 0 || editableFigures);
    const centerFrom = overlayState ? overlayState.centerFrom : fullyVisible ? 1 : timing ? sequenceAppear(elapsed, 0, timing) : chatAppear(elapsed);
    const centerTo = overlayState?.centerTo ?? 0;
    const chat = Math.max(centerFrom, centerTo);
    const centerMix = centerFrom + centerTo === 0 ? 0 : centerTo / (centerFrom + centerTo);
    const activeFigure = centerMix >= .5 && nextFigure ? nextFigure : figure;
    const activeSize = nextFigure ? figureSize + (nextSize - figureSize) * centerMix : figureSize;
    const idleCount = (steps?.length ?? 0) + nextSteps.length;
    const firstLinks = overlayState
      ? appearingStepLinks(steps ?? [], bounds.width, bounds.height, overlayState.first, time, 0, idleCount)
      : visibleStepLinks(steps ?? [], bounds.width, bounds.height, elapsed, fullyVisible, timing, time);
    const secondLinks = overlayState
      ? appearingStepLinks(nextSteps, bounds.width, bounds.height, overlayState.second, time, steps?.length ?? 0, idleCount)
      : [];
    const stepLinks = [...firstLinks, ...secondLinks];
    if (dither.ramp?.length) {
      const centerBox = overlayDensityBox(activeFigure, bounds.width, bounds.height, figurePosition, editableFigures, activeSize);
      const typeLines = typeLinesOf(activeFigure);
      const typePlacement = typeLines?.length
        ? positionedOverlayPlacement(activeFigure, bounds.width, bounds.height, figurePosition, editableFigures, activeSize)
        : null;
      const sourceWidth = ("naturalWidth" in activeFigure && activeFigure.naturalWidth) || (activeFigure as { width: number }).width || 1;
      const sourceHeight = ("naturalHeight" in activeFigure && activeFigure.naturalHeight) || (activeFigure as { height: number }).height || 1;
      const centerBar = centerMix >= .5 && nextFigure
        ? { barWidth: sequence?.nextTypeBarWidth, barHeight: sequence?.nextTypeBarHeight }
        : { barWidth: sequence?.typeBarWidth, barHeight: sequence?.typeBarHeight };
      const centerBoxes = typeLines?.length && typePlacement
        ? mapTypeLineBoxes(typeLines, sourceWidth, sourceHeight, typePlacement, centerBar)
        : [centerBox];
      // Type bars should follow the glyphs. The thinking-field dots sit left/low on the stage and fatten that side.
      const dots = typeLines?.length ? [] : createDotField(seed, bounds.width, bounds.height);
      const merge = multiAgentAppearance.mergeScale * ditherSettings.reach;
      const spacing = ditherSettings.spacing;
      const stampColumns = Math.ceil(bounds.width / spacing);
      const stampRows = Math.ceil(bounds.height / spacing);
      const centerField = sequence?.centerField;
      const centerDrawSettings = centerField
        ? { ...withDitherAppearance(ditherSettings, centerField), rimCount: 0 }
        : ditherSettings;
      const centerSpacing = centerDrawSettings.spacing;
      const centerMerge = typeLineMergeScale(centerBoxes, merge);
      const centerOrigin = { x: Math.min(...centerBoxes.map(box => box.left)), y: Math.min(...centerBoxes.map(box => box.top)) };
      canvas.dataset.typeLines = String(centerBoxes.length);
      const centerLayer = chat > 0
        ? ditherDensity(canvas, 0, centerBoxes, centerOrigin, dots, time, centerMerge, centerSpacing)
        : null;
      const stepLayers = stepLinks.map((link, slot) => {
        const boxes = link.boxes ?? [link.box];
        return ditherDensity(canvas, slot + 1, boxes, { x: Math.min(...boxes.map(box => box.left)), y: Math.min(...boxes.map(box => box.top)) }, dots, time,
          typeLineMergeScale(boxes, merge * STEP_SCALE), spacing);
      });
      if (figureMorph) {
        const morphLayers = chat > 0 ? stepLinks.flatMap(link => {
          const dests = link.boxes ?? [link.box];
          const dock = nearestTypeBox(centerBoxes, link.box);
          const dest = nearestTypeBox(dests, dock);
          const bridge = morphIslands(dock, dest, link.progress, spacing, time,
            { end: ditherSettings.neckEnd, waist: ditherSettings.neckWaist });
          return bridge ? [bridge] : [];
        }) : [];
        if (centerField) {
          if (centerLayer) {
            const centerColumns = Math.ceil(bounds.width / centerSpacing);
            const centerRows = Math.ceil(bounds.height / centerSpacing);
            drawDitheredOccupancy(context, [centerLayer], centerColumns, centerRows, centerSpacing, centerSpacing, dither, centerDrawSettings);
          }
          const surroundLayers = [...stepLayers, ...morphLayers];
          if (surroundLayers.length) drawDitheredOccupancy(context, surroundLayers, stampColumns, stampRows, spacing, spacing, dither, ditherSettings);
        } else {
          const sharedLayers = [...(centerLayer ? [centerLayer] : []), ...stepLayers, ...morphLayers];
          if (sharedLayers.length) drawDitheredOccupancy(context, sharedLayers, stampColumns, stampRows, spacing, spacing, dither, ditherSettings);
        }
        canvas.dataset.morphLinks = String(morphLayers.length);
      } else {
        delete canvas.dataset.morphLinks;
        if (centerLayer) drawDitheredOccupancy(context, [centerLayer], stampColumns, stampRows, spacing, spacing, dither, ditherSettings);
        if (stepLayers.length && stepDither?.ramp?.length) {
          drawDitheredOccupancy(context, stepLayers, stampColumns, stampRows, spacing, spacing, stepDither, ditherSettings);
        }
        const neckLayers = chat > 0 ? stepLinks.flatMap((link) => {
          const dests = link.boxes ?? [link.box];
          const dock = nearestTypeBox(centerBoxes, link.box);
          const dest = nearestTypeBox(dests, dock);
          const bridge = connectIslands(dock, dest, link.progress, spacing, time,
            { end: ditherSettings.neckEnd, waist: ditherSettings.neckWaist });
          return bridge ? [bridge] : [];
        }) : [];
        if (neckLayers.length && neckDither?.ramp?.length) {
          drawDitheredOccupancy(context, neckLayers, stampColumns, stampRows, spacing, spacing, neckDither,
            { ...ditherSettings, adhesion: 0 });
        }
      }
    }
    if (overlayState) {
      if (centerFrom > 0) drawCenteredOverlay(context, figure, bounds.width, bounds.height, centerFrom, figurePosition, editableFigures, figureSize);
      if (centerTo > 0 && nextFigure) drawCenteredOverlay(context, nextFigure, bounds.width, bounds.height, centerTo, figurePosition, editableFigures, nextSize);
      drawAppearingOverlays(context, steps ?? [], bounds.width, bounds.height, overlayState.first.map(step => step.appear), editableFigures, time, 0, idleCount);
      drawAppearingOverlays(context, nextSteps, bounds.width, bounds.height, overlayState.second.map(step => step.appear), editableFigures, time, steps?.length ?? 0, idleCount);
    } else {
      drawCenteredOverlay(context, figure, bounds.width, bounds.height, chat, figurePosition, editableFigures, figureSize);
      if (steps?.length) drawStepOverlays(context, steps, bounds.width, bounds.height, elapsed, fullyVisible, editableFigures, timing, time);
    }
    const showSecondObjects = previewSecond || Boolean(overlayState && overlayState.first.every(step => step.appear <= 0)
      && (overlayState.centerTo >= 1 || overlayState.second.some(step => step.appear > 0)));
    canvas.dataset.editAct = showSecondObjects ? "2" : "1";
    const visibleCenter = showSecondObjects && nextFigure ? nextFigure : figure;
    const visibleCenterSize = showSecondObjects && nextFigure ? nextSize : figureSize;
    const editingSteps = showSecondObjects ? nextSteps : steps ?? [];
    const center = positionedOverlayPlacement(visibleCenter, bounds.width, bounds.height, figurePosition, editableFigures, visibleCenterSize);
    const figureObjects = [
      {
        bounds: { left: center.x, top: center.y, right: center.x + center.width, bottom: center.y + center.height },
        anchor: { x: center.x + center.width / 2, y: center.y + center.height / 2 },
      },
      ...editingSteps.map(step => {
        const box = stepCardBox(step.image, bounds.width, bounds.height, step.cx, step.cy, step.size);
        return {
          bounds: { left: box.x, top: box.y, right: box.x + box.width, bottom: box.y + box.height },
          anchor: { x: box.x + box.width / 2, y: box.y + box.height / 2 },
        };
      }),
    ];
    canvas.dataset.figureImages = String(figureObjects.length);
    return { objects: figureObjects, headlineBounds: figureObjects[0].bounds, headlineAnchor: figureObjects[0].anchor };
  }
  delete canvas.dataset.figureImages;
  if (rectangular) {
    const dots = createDotField(seed, bounds.width, bounds.height);
    const labels = createObstacleLabels(seed, bounds.width, bounds.height, headlinePosition);
    drawRectangleSurface(context, seed, time, dots, labels, bounds.width, bounds.height);
    return { headlineBounds: measureLabelBounds(context, labels[0]),
      headlineAnchor: { x: labels[0].x, y: labels[0].y } };
  }
  for (const dot of objectPositions ? [] : createBlurredDots(seed, bounds.width, bounds.height)) {
    const radius = dot.core + dot.spread;
    const gradient = context.createRadialGradient(dot.x, dot.y, dot.core * .2, dot.x, dot.y, radius);
    gradient.addColorStop(0, `rgba(17, 17, 17, ${dot.opacity})`);
    gradient.addColorStop(Math.min(.72, dot.core / radius + .16), `rgba(17, 17, 17, ${dot.opacity * .72})`);
    gradient.addColorStop(1, "rgba(17, 17, 17, 0)");
    context.fillStyle = gradient;
    context.beginPath();
    context.arc(dot.x, dot.y, radius, 0, Math.PI * 2);
    context.fill();
  }
  const obstacleLabels = objectPositions
    ? createMultipleLabels(context, seed, bounds.width, bounds.height, objectPositions)
    : createObstacleLabels(seed, bounds.width, bounds.height, headlinePosition);
  const objects = obstacleLabels.map(label => ({ bounds: measureLabelBounds(context, label), anchor: { x: label.x, y: label.y } }));
  const vertices = objects.map(({ bounds: box }) => ({ x: (box.left + box.right) / 2, y: (box.top + box.bottom) / 2 }));
  const shape = objectPositions ? neuronShape(canvas, time, `${seed}:${bounds.width}:${bounds.height}`, vertices) : null;
  if (linkage && objectPositions) drawInteriorHaze(canvas, context, seed, time, bounds.width, bounds.height, vertices);
  else delete canvas.dataset.interiorHaze;
  const { columns, rows, stepX, stepY } = gridMetrics(bounds.width, bounds.height);
  if (!dither || ditherSettings.showGrid) {
    const gridRadius = Math.min(2.5, Math.min(stepX, stepY) * .2);
    context.fillStyle = dither ? "#d2d3d0" : "#ffffff";
    context.strokeStyle = "#d2d3d0";
    context.lineWidth = 1;
    context.beginPath();
    for (let row = 0; row < rows; row++) for (let column = 0; column < columns; column++) {
      const x = (column + .5) * stepX, y = (row + .5) * stepY;
      context.moveTo(x + gridRadius, y);
      context.arc(x, y, gridRadius, 0, Math.PI * 2);
    }
    context.fill();
    if (!dither) context.stroke();
  }
  const glyphBoxGroups = obstacleLabels.map(label => measureGlyphBoxes(context, label));
  const glyphBoxes = glyphBoxGroups.flat();
  const dots = objectPositions ? createTerritoryDots(canvas, time, seed, bounds.width, bounds.height,
    vertices, shape?.ellipse ?? null, glyphBoxes) : createDotField(seed, bounds.width, bounds.height);
  const arcSolids = linkage?.arcField && objectPositions
    ? drawThinkingArcs(canvas, context, seed, time, { columns, rows, stepX, stepY },
      territoryTransitions.get(canvas)!.coverage, obstacleLabels.flatMap(label => measureGlyphBoxes(context, label))) : null;
  if (!arcSolids) delete canvas.dataset.thinkingArcs;
  if (shape && multiAgentAppearance.showConnections) drawNeuronRim(context, shape.polygon, shape.ellipse);
  if (!objectPositions || multiAgentAppearance.showConnections) {
    drawPathNetwork(context, seed, time, dots, bounds.width, bounds.height);
  }
  if (!dither) for (const dot of dots) {
    const wave = Math.sin(time * dot.cycleSpeed + dot.cyclePhase);
    const visibility = smoothstep(-.42, .78, wave) * (dot.territory ?? 1);
    if (visibility < .008) continue;
    const cell = Math.floor(dot.y / stepY) * columns + Math.floor(dot.x / stepX);
    const solidMix = arcSolids ? .16 + .84 * arcSolids[cell] : 1;
    const opacity = Math.pow(visibility, 1.12) * solidMix;
    const scale = linkage ? 3 : 1;
    const dotRadius = dot.radius * scale;
    const blur = (1 - visibility) * dot.blurAmount * scale;
    if (blur < .3) {
      context.fillStyle = `rgba(17, 17, 17, ${opacity})`;
    } else {
      const outerRadius = dotRadius + blur;
      const gradient = context.createRadialGradient(dot.x, dot.y, 0, dot.x, dot.y, outerRadius);
      const edge = Math.max(.08, Math.min(.9, dotRadius / outerRadius));
      gradient.addColorStop(0, `rgba(17, 17, 17, ${opacity})`);
      gradient.addColorStop(edge * .72, `rgba(17, 17, 17, ${opacity * .9})`);
      gradient.addColorStop(edge, `rgba(17, 17, 17, ${opacity * .64})`);
      gradient.addColorStop(1, "rgba(17, 17, 17, 0)");
      context.fillStyle = gradient;
    }
    const radius = dotRadius + blur;
    context.beginPath();
    context.arc(dot.x, dot.y, radius, 0, Math.PI * 2);
    context.fill();
  }
  if (linkage && objectPositions) drawComponentLinkage(canvas, context, obstacleLabels.map(label => measureGlyphBoxes(context, label)), linkage);
  const backdrop = linkage?.ringBlur ? blurRingBackdrop(canvas, bounds.width, bounds.height, time) : undefined;
  const liquids: OccupancyLayer[] = [];
  for (let index = 0; index < (objectPositions ? obstacleLabels.length : 1); index++) {
    const label = obstacleLabels[index];
    const layer = dither ? ditherDensity(canvas, index, measureGlyphBoxes(context, label), { x: label.x, y: label.y }, dots, time,
      multiAgentAppearance.mergeScale * ditherSettings.reach, ditherSettings.spacing)
      : drawLiquidSurface(context, time, dots, label, index, objectPositions ? multiAgentAppearance.mergeScale : 1, Boolean(linkage), backdrop);
    if (layer) liquids.push(layer);
  }
  if (dither) {
    const spacing = ditherSettings.spacing;
    drawDitheredOccupancy(context, liquids, Math.ceil(bounds.width / spacing), Math.ceil(bounds.height / spacing), spacing, spacing, dither, ditherSettings);
    if (trails) drawDomainTrails(canvas, context, glyphBoxGroups, objects.map(o => o.anchor), trails, ditherSettings.rounding);
    canvas.dataset.ditherSettings = JSON.stringify(ditherSettings);
    canvas.dataset.ditherAnchors = JSON.stringify(objects.map(object => object.anchor));
  }
  drawObstacleLabels(context, obstacleLabels, false, Boolean(objectPositions), "#ffffff", dither ? ditherSettings.letterBlock || "#111111" : undefined);
  return {
    objects: objectPositions ? objects : undefined,
    headlineBounds: measureLabelBounds(context, obstacleLabels[0]),
    headlineAnchor: { x: obstacleLabels[0].x, y: obstacleLabels[0].y },
  };
}
