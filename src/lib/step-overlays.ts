export type StepOverlaySpec = {
  image: CanvasImageSource;
  cx: number;
  cy: number;
  size: number;
};

export type StepOverlay = {
  src: string;
  cx: number;
  cy: number;
  size: number;
};

/** Positions match the A / B / C spots. Cards stay readable; their tonal fields are 40% scale. */
export const STEP_SCALE = .29;
export const STEP_OVERLAYS: StepOverlay[] = [
  { src: "/figures/steps/search-memory.png", cx: .165, cy: .27, size: .14 },
  { src: "/figures/steps/navigate.png", cx: .2, cy: .78, size: .15 },
  { src: "/figures/steps/pickup.png", cx: .93, cy: .53, size: .16 },
];

export const CHAT_DELAY = 3000;
export const CHAT_FADE = 70;
export const STEP_DELAY = 2000;
export const STEP_STAGGER = 2100;
export const STEP_FADE = 70;
export const STEP_BRIDGE = 2200;

export function chatAppear(elapsed: number, delay = CHAT_DELAY, duration = CHAT_FADE): number {
  return Math.max(0, Math.min(1, (elapsed - delay) / duration));
}

export function stepAppear(elapsed: number, index: number, stagger = STEP_STAGGER, duration = STEP_FADE, delay = CHAT_DELAY + STEP_DELAY): number {
  return Math.max(0, Math.min(1, (elapsed - delay - index * stagger) / duration));
}

export function stepBridge(elapsed: number, index: number, stagger = STEP_STAGGER, duration = STEP_BRIDGE, delay = CHAT_DELAY + STEP_DELAY): number {
  return Math.max(0, Math.min(1, (elapsed - delay - index * stagger) / duration));
}

const sequenceStarts = new WeakMap<object, number>();

export function replayStepSequence(target: object) {
  sequenceStarts.delete(target);
}

export function stepSequenceElapsed(target: object, time: number): number {
  if (time <= 0) return 1e9;
  if (!sequenceStarts.has(target)) sequenceStarts.set(target, time);
  return time - (sequenceStarts.get(target) ?? time);
}

function sourceSize(image: CanvasImageSource) {
  return {
    width: ("naturalWidth" in image && image.naturalWidth) || (image as { width: number }).width || 1,
    height: ("naturalHeight" in image && image.naturalHeight) || (image as { height: number }).height || 1,
  };
}

export function placedOverlayLayout(
  sourceWidth: number,
  sourceHeight: number,
  width: number,
  height: number,
  cx: number,
  cy: number,
  size: number,
) {
  const drawWidth = width * size;
  const drawHeight = drawWidth * sourceHeight / Math.max(1, sourceWidth);
  return { x: width * cx - drawWidth / 2, y: height * cy - drawHeight / 2, width: drawWidth, height: drawHeight };
}

export function stepCardBox(image: CanvasImageSource, width: number, height: number, cx: number, cy: number, size: number) {
  const source = sourceSize(image);
  return placedOverlayLayout(source.width, source.height, width, height, cx, cy, size);
}

export function stepDensityBox(image: CanvasImageSource, width: number, height: number, cx: number, cy: number, size: number) {
  const box = stepCardBox(image, width, height, cx, cy, size);
  const padX = box.width * .12, padY = box.height * .12;
  return { left: box.x - padX, top: box.y - padY, right: box.x + box.width + padX, bottom: box.y + box.height + padY };
}

export function visibleStepLinks(
  steps: StepOverlaySpec[],
  width: number,
  height: number,
  elapsed: number,
  reducedMotion = false,
) {
  return steps.flatMap((step, index) => {
    const appear = reducedMotion ? 1 : stepAppear(elapsed, index);
    if (appear <= 0) return [];
    return [{
      box: stepDensityBox(step.image, width, height, step.cx, step.cy, step.size),
      progress: reducedMotion ? 1 : stepBridge(elapsed, index),
    }];
  });
}

export function visibleStepBoxes(
  steps: StepOverlaySpec[],
  width: number,
  height: number,
  elapsed: number,
  reducedMotion = false,
) {
  return visibleStepLinks(steps, width, height, elapsed, reducedMotion).map((link) => link.box);
}

export function drawStepOverlays(
  context: CanvasRenderingContext2D,
  steps: StepOverlaySpec[],
  width: number,
  height: number,
  elapsed: number,
  reducedMotion = false,
) {
  for (let index = 0; index < steps.length; index++) {
    const appear = reducedMotion ? 1 : stepAppear(elapsed, index);
    if (appear <= 0) continue;
    const step = steps[index];
    const ease = appear * appear * (3 - 2 * appear);
    const box = stepCardBox(step.image, width, height, step.cx, step.cy, step.size);
    const scale = .94 + .06 * ease;
    const lift = (1 - ease) * 10;
    const radius = Math.min(box.width, box.height) * .12;
    context.save();
    context.globalAlpha = ease;
    context.translate(box.x + box.width / 2, box.y + box.height / 2 + lift);
    context.scale(scale, scale);
    context.beginPath();
    context.roundRect(-box.width / 2, -box.height / 2, box.width, box.height, radius);
    context.fillStyle = "#ffffff";
    context.fill();
    context.clip();
    context.drawImage(step.image, -box.width / 2, -box.height / 2, box.width, box.height);
    context.restore();
  }
}
