import { buildDitherPlacement, type DitherExportPass, type DitherSvgShape, serializeDitherToSvg } from "./dither-cells";
import { drawDotField, type DotFieldLayout } from "./dot-field";
import type { LinkageSettings } from "./component-linkage";
import type { TrailSettings } from "./domain-trails";
import type { DitherFieldSettings, DitherStamp } from "./dither-cells";
import type { SequenceStudio, StepOverlaySpec } from "./step-overlays";

export type { DitherExportPass };

export type FieldExportDraw = {
  seed: number;
  time?: number;
  dither: DitherStamp;
  ditherSettings: DitherFieldSettings;
  figure?: CanvasImageSource;
  steps?: StepOverlaySpec[];
  stepDither?: DitherStamp;
  neckDither?: DitherStamp;
  figureMorph?: boolean;
  figurePosition?: { x: number; y: number } | null;
  figureSize?: number;
  sequence?: (SequenceStudio & { playing?: boolean }) | null;
};

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function canvasBlob(canvas: HTMLCanvasElement, type: string) {
  return new Promise<Blob | null>(resolve => canvas.toBlob(blob => resolve(blob), type));
}

function stampName() {
  const stamp = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${stamp.getFullYear()}${pad(stamp.getMonth() + 1)}${pad(stamp.getDate())}-${pad(stamp.getHours())}${pad(stamp.getMinutes())}${pad(stamp.getSeconds())}`;
}

export function mergeDitherShapes(passes: DitherExportPass[]): DitherSvgShape[] {
  return passes.flatMap(pass => buildDitherPlacement(
    pass.layers,
    pass.columns,
    pass.rows,
    pass.stepX,
    pass.stepY,
    pass.stamp,
    pass.settings,
    pass.mergeUnderlayColor,
    pass.toneGain ?? 1,
  ));
}

export function renderFieldExportCanvas(width: number, height: number, draw: FieldExportDraw, exportPasses: DitherExportPass[] = []) {
  const canvas = document.createElement("canvas");
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  drawDotField(
    canvas,
    draw.seed,
    draw.time ?? 0,
    undefined,
    false,
    undefined,
    undefined,
    draw.dither,
    draw.ditherSettings,
    undefined,
    draw.figure,
    draw.steps,
    draw.stepDither,
    draw.neckDither,
    draw.figureMorph,
    false,
    draw.figurePosition,
    true,
    draw.figureSize,
    draw.sequence,
    false,
    false,
    { exportShape: true, width, height, exportPasses },
  );
  return canvas;
}

export async function exportFieldPng(width: number, height: number, draw: FieldExportDraw, filename = `text-area-${stampName()}.png`) {
  const canvas = renderFieldExportCanvas(width, height, draw);
  const blob = await canvasBlob(canvas, "image/png");
  if (!blob) throw new Error("Could not create PNG.");
  downloadBlob(blob, filename);
}

export function exportFieldSvg(width: number, height: number, draw: FieldExportDraw, filename = `text-area-${stampName()}.svg`) {
  const passes: DitherExportPass[] = [];
  renderFieldExportCanvas(width, height, draw, passes);
  const svg = serializeDitherToSvg(mergeDitherShapes(passes), width, height);
  downloadBlob(new Blob([svg], { type: "image/svg+xml" }), filename);
}

export function fieldExportLayout(width: number, height: number, draw: FieldExportDraw): DotFieldLayout | undefined {
  const canvas = document.createElement("canvas");
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  return drawDotField(
    canvas,
    draw.seed,
    draw.time ?? 0,
    undefined,
    false,
    undefined,
    undefined,
    draw.dither,
    draw.ditherSettings,
    undefined,
    draw.figure,
    draw.steps,
    draw.stepDither,
    draw.neckDither,
    draw.figureMorph,
    false,
    draw.figurePosition,
    true,
    draw.figureSize,
    draw.sequence,
    false,
    false,
    { exportShape: true, width, height },
  );
}
