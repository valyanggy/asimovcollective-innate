export const TYPE_AREA_DEFAULT = "Hey Cosmo, me and Val are\ngonna play Catan after work,\ncan u set it up for us?";
export const TYPE_AREA_ACT2 = "Intelligence\ncompounds.";
export const TYPE_AREA_FACES = ["MDIO", "Algebra"] as const;
export type TypeFace = (typeof TYPE_AREA_FACES)[number];
export const TYPE_AREA_FACE: TypeFace = "MDIO";
export const TYPE_AREA_FONT = 17;
export const TYPE_AREA_ACT2_FONT = 54;
export const TYPE_AREA_FONT_MIN = 9;
export const TYPE_AREA_FONT_MAX = 96;
export const TYPE_AREA_LINE = 1.43;
export const TYPE_AREA_TRACK = -.05;
export const TYPE_AREA_TRACK_MIN = -.15;
export const TYPE_AREA_TRACK_MAX = .2;
export const TYPE_AREA_COLOR = "#ffffff";
export const TYPE_AREA_FIELD = .36;
export const TYPE_AREA_FIELD_MIN = .14;
export const TYPE_AREA_FIELD_MAX = .78;
export const TYPE_AREA_WIDTH = 880;
export const TYPE_AREA_PAD = 64;
export const TYPE_AREA_BAR_WIDTH = 1.33;
export const TYPE_AREA_BAR_HEIGHT = 5.07;
export const TYPE_AREA_ACT2_BAR_WIDTH = 1.12;
export const TYPE_AREA_ACT2_BAR_HEIGHT = 1;
export const TYPE_AREA_ANCHOR = { x: .494, y: .355 };
export const TYPE_AREA_BAR_MIN = .55;
export const TYPE_AREA_BAR_MAX = 2.4;
export const TYPE_AREA_BAR_HEIGHT_MAX = 10;

/** Break paragraphs to a measured line width, keeping author line breaks. */
export function wrapTypeLines(text: string, measure: (line: string) => number, maxWidth: number): string[] {
  const paragraphs = text.replace(/\r/g, "").split("\n");
  const lines: string[] = [];
  for (const paragraph of paragraphs) {
    if (!paragraph.trim()) {
      lines.push("");
      continue;
    }
    let current = "";
    for (const word of paragraph.trim().split(/\s+/)) {
      const next = current ? `${current} ${word}` : word;
      if (current && measure(next) > maxWidth) {
        lines.push(current);
        current = word;
      } else current = next;
    }
    if (current) lines.push(current);
  }
  return lines.length ? lines : [""];
}

function prepareTypeContext(
  context: CanvasRenderingContext2D,
  fontSize: number,
  face: TypeFace = TYPE_AREA_FACE,
  track = TYPE_AREA_TRACK,
  color = TYPE_AREA_COLOR,
) {
  context.font = `${fontSize}px ${face}, Arial, sans-serif`;
  context.fillStyle = color;
  context.textAlign = "center";
  context.textBaseline = "top";
  context.letterSpacing = `${fontSize * track}px`;
}

export function typeFieldPad(fontSize: number) {
  return Math.max(8, Math.round(fontSize * .25));
}

export function clampTypeFont(value: number) {
  return Math.max(TYPE_AREA_FONT_MIN, Math.min(TYPE_AREA_FONT_MAX, Math.round(value)));
}

export function clampTypeField(value: number) {
  return Math.max(TYPE_AREA_FIELD_MIN, Math.min(TYPE_AREA_FIELD_MAX, value));
}

export function clampTypeBar(value: number, max = TYPE_AREA_BAR_MAX) {
  return Math.max(TYPE_AREA_BAR_MIN, Math.min(max, Math.round(value * 100) / 100));
}

export function clampTypeFace(value: unknown): TypeFace {
  return TYPE_AREA_FACES.includes(value as TypeFace) ? value as TypeFace : TYPE_AREA_FACE;
}

export function clampTypeTrack(value: number) {
  return Math.max(TYPE_AREA_TRACK_MIN, Math.min(TYPE_AREA_TRACK_MAX, Math.round(value * 1000) / 1000));
}

export function clampTypeColor(value: unknown) {
  if (typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value.trim())) return value.trim();
  return TYPE_AREA_COLOR;
}

export type TypeStyle = { face?: TypeFace; track?: number; color?: string };

export type TypeBlockSpec = { copy: string; fontSize: number; fieldWidth: number; cx: number; cy: number; barWidth?: number; barHeight?: number; face?: TypeFace; track?: number; color?: string };

export type TypeSetupImage = {
  name?: string;
  xPercent?: number;
  yPercent?: number;
  sizePercent?: number;
  typeCopy?: string;
  typeFontSize?: number;
  typeBarWidth?: number;
  typeBarHeight?: number;
  typeFace?: TypeFace;
  typeTrack?: number;
  typeColor?: string;
  shadowWidth?: number;
  shadowHeight?: number;
};

export function typeBlockFromSetup(image: TypeSetupImage): TypeBlockSpec | null {
  if (typeof image.typeCopy !== "string") return null;
  return {
    copy: image.typeCopy,
    fontSize: typeof image.typeFontSize === "number" ? image.typeFontSize : 36,
    fieldWidth: typeof image.sizePercent === "number" ? image.sizePercent / 100 : .2,
    cx: typeof image.xPercent === "number" ? Math.max(0, Math.min(1, image.xPercent / 100)) : .5,
    cy: typeof image.yPercent === "number" ? Math.max(0, Math.min(1, image.yPercent / 100)) : .5,
    barWidth: image.typeBarWidth,
    barHeight: image.typeBarHeight,
    face: image.typeFace,
    track: image.typeTrack,
    color: image.typeColor,
  };
}

export const TYPE_SURROUND_DEFAULTS: TypeBlockSpec[] = [
  { copy: "SEARCH CABINETS", fontSize: 14, fieldWidth: .18, cx: .396, cy: .266, barWidth: 1.39, barHeight: 5.2 },
  { copy: "OPEN BOX", fontSize: 12, fieldWidth: .18, cx: .315, cy: .481, barWidth: 2.39, barHeight: 4.66 },
  { copy: "SET UP THE BOARD", fontSize: 14, fieldWidth: .18, cx: .626, cy: .585, barWidth: 2.21, barHeight: 5.05 },
];

export const TYPE_SURROUND_ACT2: TypeBlockSpec[] = [
  { copy: "Memory", fontSize: 36, fieldWidth: .2, cx: .68, cy: .24, barWidth: TYPE_AREA_ACT2_BAR_WIDTH, barHeight: TYPE_AREA_ACT2_BAR_HEIGHT },
  { copy: "Action", fontSize: 36, fieldWidth: .2, cx: .28, cy: .22, barWidth: TYPE_AREA_ACT2_BAR_WIDTH, barHeight: TYPE_AREA_ACT2_BAR_HEIGHT },
];

export function typeBlockLabel(copy: string) {
  const line = copy.replace(/\s+/g, " ").trim();
  return line.slice(0, 28) || "Type";
}

export function renderTypeBlock(copy: string, fontSize: number, fieldWidth: number, stageWidth: number, style: TypeStyle = {}) {
  return renderTypeArea(copy, {
    fontSize: clampTypeFont(fontSize),
    fieldWidth: Math.round(clampTypeField(fieldWidth) * Math.max(200, stageWidth)),
    face: style.face,
    track: style.track,
    color: style.color,
  });
}

export type TypeLineMetric = { left: number; top: number; width: number; height: number };
export type TypeBox = { left: number; top: number; right: number; bottom: number };

const TYPE_LINES = new WeakMap<CanvasImageSource, TypeLineMetric[]>();

export function typeLinesOf(image: CanvasImageSource) {
  const stored = TYPE_LINES.get(image);
  if (stored) return stored;
  if (typeof HTMLCanvasElement !== "undefined" && image instanceof HTMLCanvasElement && image.dataset.typeLines) {
    try { return JSON.parse(image.dataset.typeLines) as TypeLineMetric[]; }
    catch { return undefined; }
  }
  return undefined;
}

/** One slab per non-empty line: that line's measured width, glyph height, leading left empty. */
export function typeLineMetrics(
  lines: string[],
  fontSize: number,
  fieldWidth: number,
  pad: number,
  measure: (line: string) => number = line => line.length * fontSize * .52,
): TypeLineMetric[] {
  const lineHeight = fontSize * TYPE_AREA_LINE;
  const content = Math.max(fontSize, fieldWidth - pad * 2);
  return lines.flatMap((line, index) => {
    if (!line.trim()) return [];
    const width = Math.min(content, Math.max(fontSize * .4, measure(line)));
    return [{
      left: (fieldWidth - width) / 2,
      top: pad + index * lineHeight,
      width,
      height: fontSize,
    }];
  });
}

export function mapTypeLineBoxes(
  lines: TypeLineMetric[],
  sourceWidth: number,
  sourceHeight: number,
  box: { x: number; y: number; width: number; height: number },
  scale: { barWidth?: number; barHeight?: number } = {},
): TypeBox[] {
  const sx = box.width / Math.max(1, sourceWidth);
  const sy = box.height / Math.max(1, sourceHeight);
  const barWidth = scale.barWidth ?? TYPE_AREA_BAR_WIDTH;
  const barHeight = scale.barHeight ?? TYPE_AREA_BAR_HEIGHT;
  return lines.map(line => {
    const width = Math.max(line.height * .4, line.width * barWidth);
    const height = Math.max(line.height * .35, line.height * barHeight);
    const left = line.left + line.width / 2 - width / 2;
    const top = line.top + line.height / 2 - height / 2;
    return {
      left: box.x + left * sx,
      top: box.y + top * sy,
      right: box.x + (left + width) * sx,
      bottom: box.y + (top + height) * sy,
    };
  });
}

export function nearestTypeBox<T extends TypeBox>(boxes: T[], target: T): T {
  if (boxes.length <= 1) return boxes[0] ?? target;
  const tx = (target.left + target.right) / 2;
  const ty = (target.top + target.bottom) / 2;
  let best = boxes[0];
  let bestDist = Infinity;
  for (const box of boxes) {
    const dx = Math.max(box.left - tx, 0, tx - box.right);
    const dy = Math.max(box.top - ty, 0, ty - box.bottom);
    const dist = dx * dx + dy * dy;
    if (dist < bestDist) {
      best = box;
      bestDist = dist;
    }
  }
  return best;
}

/** Keep leading empty so stacked lines stay separate bars instead of one melted slab. */
export function typeLineMergeScale(boxes: TypeBox[], merge: number) {
  if (boxes.length < 2) return merge;
  const sorted = [...boxes].sort((a, b) => a.top - b.top);
  let gap = Infinity;
  for (let index = 1; index < sorted.length; index++) {
    gap = Math.min(gap, sorted[index].top - sorted[index - 1].bottom);
  }
  if (!Number.isFinite(gap) || gap <= 0) return merge;
  return Math.min(merge, Math.max(.35, gap / 18));
}

/** Paint a transparent type block. Field width controls wrapping; font size stays independent. */
export function renderTypeArea(text: string, options: { fontSize?: number; fieldWidth?: number; face?: TypeFace; track?: number; color?: string } = {}): HTMLCanvasElement {
  const fontSize = options.fontSize ?? TYPE_AREA_FONT;
  const face = clampTypeFace(options.face);
  const track = clampTypeTrack(options.track ?? TYPE_AREA_TRACK);
  const color = clampTypeColor(options.color);
  const pad = typeFieldPad(fontSize);
  const width = Math.max(Math.round(fontSize * 3), Math.round(options.fieldWidth ?? TYPE_AREA_WIDTH));
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) return canvas;
  prepareTypeContext(context, fontSize, face, track, color);
  const measure = (line: string) => context.measureText(line).width;
  const lines = wrapTypeLines(text, measure, Math.max(fontSize, width - pad * 2));
  const metrics = typeLineMetrics(lines, fontSize, width, pad, measure);
  const lineHeight = fontSize * TYPE_AREA_LINE;
  canvas.width = width;
  canvas.height = Math.ceil(pad * 2 + Math.max(1, lines.length) * lineHeight);
  canvas.dataset.typeField = "1";
  canvas.dataset.typeLines = JSON.stringify(metrics);
  TYPE_LINES.set(canvas, metrics);
  context.clearRect(0, 0, canvas.width, canvas.height);
  prepareTypeContext(context, fontSize, face, track, color);
  lines.forEach((line, index) => {
    context.fillText(line, width / 2, pad + index * lineHeight);
  });
  return canvas;
}
