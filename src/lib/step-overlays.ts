export type StepOverlaySpec = {
  image: CanvasImageSource;
  label?: string;
  cx: number;
  cy: number;
  size: number;
};

export type StepOverlay = {
  src: string;
  label: string;
  cx: number;
  cy: number;
  size: number;
};

/** Positions match the A / B / C spots. Cards stay readable; their tonal fields are 40% scale. */
export const STEP_SCALE = .29;
export const STEP_OVERLAYS: StepOverlay[] = [
  { src: "/figures/steps/search-memory.png", label: "Search memory", cx: .165, cy: .27, size: .14 },
  { src: "/figures/steps/navigate.png", label: "Navigate", cx: .2, cy: .78, size: .15 },
  { src: "/figures/steps/pickup.png", label: "Pickup", cx: .93, cy: .53, size: .16 },
];
export const MORPH_IMAGE_OVERLAYS: StepOverlay[] = [
  { src: "/figures/morph/Group%201321325732.png", label: "Group 1321325732.png", cx: .369, cy: .193, size: .113 },
  { src: "/figures/morph/Group%201321325733.png", label: "Group 1321325733.png", cx: .674, cy: .773, size: .119 },
  { src: "/figures/morph/Group%201321325734.png", label: "Group 1321325734.png", cx: .339, cy: .613, size: .079 },
];

export const CHAT_DELAY = 3000;
export const CHAT_FADE = 70;
export const STEP_DELAY = 2000;
export const STEP_STAGGER = 2100;
export const STEP_FADE = 70;
export const STEP_BRIDGE = 2200;

export type SequenceTiming = {
  delay: number;
  appear: number;
  gap: number;
  fade: number;
};

export type SequenceStudio = SequenceTiming & {
  playing?: boolean;
  preview?: 1 | 2;
  nextFigure?: CanvasImageSource;
  nextFigureSize?: number;
  nextSteps?: StepOverlaySpec[];
};

export const SEQUENCE_DEFAULTS: SequenceTiming = { delay: 1, appear: .4, gap: 1.2, fade: .2 };

function sceneFade(timing: SequenceTiming) {
  const requested = timing.fade > 0 ? timing.fade : timing.appear;
  return timing.appear > 0 ? Math.min(requested, timing.appear * .5) : requested;
}

function sceneFadeStagger(timing: SequenceTiming) {
  return Math.min(sceneFade(timing), timing.gap) * .5;
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function sequenceFade(elapsed: number, startMs: number, durationSec: number) {
  return clamp01((elapsed - startMs) / Math.max(16, durationSec * 1000));
}

export function sequenceAppear(elapsed: number, index: number, timing: SequenceTiming): number {
  const start = (timing.delay + index * timing.gap) * 1000;
  return sequenceFade(elapsed, start, timing.appear);
}

export function sequenceBridge(elapsed: number, index: number, timing: SequenceTiming): number {
  const start = (timing.delay + index * timing.gap) * 1000;
  return sequenceFade(elapsed, start, timing.appear + timing.gap);
}

export const SURROUND_BOB_PX = 3;
const SURROUND_IDLE_POSES = [
  { dur: 90, x: 0, y: 0, blink: true },
  { dur: 900, x: 0, y: 0 },
  { dur: 480, x: 0, y: -SURROUND_BOB_PX },
  { dur: 900, x: 0, y: 0 },
  { dur: 480, x: -SURROUND_BOB_PX, y: 0 },
  { dur: 900, x: 0, y: 0 },
  { dur: 480, x: 0, y: SURROUND_BOB_PX },
  { dur: 900, x: 0, y: 0 },
  { dur: 480, x: SURROUND_BOB_PX, y: 0 },
  { dur: 1100, x: 0, y: 0 },
] as const;
export const SURROUND_IDLE_TURN = SURROUND_IDLE_POSES.reduce((sum, pose) => sum + pose.dur, 0);

export function surroundIdle(time: number, index: number, count = 1) {
  if (time <= 0 || count <= 0) return { x: 0, y: 0, blink: false };
  const actor = Math.floor(time / SURROUND_IDLE_TURN) % count;
  if (actor !== index) return { x: 0, y: 0, blink: false };
  let local = time % SURROUND_IDLE_TURN;
  for (const pose of SURROUND_IDLE_POSES) {
    if (local < pose.dur) return { x: pose.x, y: pose.y, blink: Boolean("blink" in pose && pose.blink) };
    local -= pose.dur;
  }
  return { x: 0, y: 0, blink: false };
}

export function surroundBob(time: number, index: number, count = 1) {
  return surroundIdle(time, index, count).y;
}

export function surroundBlink(time: number, index: number, count = 1) {
  return surroundIdle(time, index, count).blink;
}

export function surroundBlinkPulse(time: number, index: number, count = 1) {
  return surroundIdle(time, index, count).blink ? .96 : 1;
}

function sequenceFadeOut(elapsed: number, index: number, timing: SequenceTiming, transitionStart: number) {
  return sequenceFade(elapsed, (transitionStart + index * sceneFadeStagger(timing)) * 1000, sceneFade(timing));
}

export function sequenceSceneClock(timing: SequenceTiming, firstSurrounds: number) {
  const last = Math.max(0, firstSurrounds);
  const scene1End = timing.delay + last * timing.gap + timing.appear;
  const transitionStart = scene1End + timing.gap;
  const scene2Start = transitionStart + last * sceneFadeStagger(timing) + sceneFade(timing);
  return { scene1End, transitionStart, scene2Start };
}

export function sequenceOverlayState(
  elapsed: number,
  timing: SequenceTiming,
  firstSurrounds: number,
  secondSurrounds: number,
  hasNextCenter: boolean,
) {
  const clock = sequenceSceneClock(timing, firstSurrounds);
  const intro = sequenceAppear(elapsed, 0, timing);
  const centerFade = sequenceFadeOut(elapsed, firstSurrounds, timing, clock.transitionStart);
  const center2Start = (clock.scene2Start + timing.delay) * 1000;
  return {
    ...clock,
    transition: centerFade,
    centerFrom: hasNextCenter ? intro * (1 - centerFade) : intro,
    centerTo: hasNextCenter ? sequenceFade(elapsed, center2Start, timing.appear) : 0,
    first: Array.from({ length: firstSurrounds }, (_, index) => {
      const fadeOut = sequenceFadeOut(elapsed, firstSurrounds - 1 - index, timing, clock.transitionStart);
      return {
        appear: sequenceAppear(elapsed, index + 1, timing) * (1 - fadeOut),
        bridge: sequenceBridge(elapsed, index + 1, timing) * (1 - fadeOut),
      };
    }),
    second: Array.from({ length: secondSurrounds }, (_, index) => {
      const start = (clock.scene2Start + timing.delay + index * timing.gap) * 1000;
      return {
        appear: sequenceFade(elapsed, start, timing.appear),
        bridge: sequenceFade(elapsed, start, timing.appear + timing.gap),
      };
    }),
  };
}

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

function shiftedDensityBox(
  box: { left: number; top: number; right: number; bottom: number },
  time: number,
  index: number,
  count: number,
  appear: number,
) {
  const idle = surroundIdle(time, index, count);
  return {
    left: box.left + idle.x * appear,
    right: box.right + idle.x * appear,
    top: box.top + idle.y * appear,
    bottom: box.bottom + idle.y * appear,
  };
}

export function appearingStepLinks(
  steps: StepOverlaySpec[],
  width: number,
  height: number,
  states: { appear: number; bridge: number }[],
  motionTime = 0,
  bobIndexOffset = 0,
  idleCount = steps.length + bobIndexOffset,
) {
  const count = Math.max(1, idleCount);
  return steps.flatMap((step, index) => {
    const appear = states[index]?.appear ?? 0;
    if (appear <= 0) return [];
    const box = stepDensityBox(step.image, width, height, step.cx, step.cy, step.size);
    return [{
      box: shiftedDensityBox(box, motionTime, index + bobIndexOffset, count, appear),
      progress: states[index]?.bridge ?? appear,
    }];
  });
}

export function visibleStepLinks(
  steps: StepOverlaySpec[],
  width: number,
  height: number,
  elapsed: number,
  reducedMotion = false,
  timing?: SequenceTiming,
  motionTime = 0,
) {
  return steps.flatMap((step, index) => {
    const appear = reducedMotion ? 1 : timing ? sequenceAppear(elapsed, index + 1, timing) : stepAppear(elapsed, index);
    if (appear <= 0) return [];
    const box = stepDensityBox(step.image, width, height, step.cx, step.cy, step.size);
    return [{
      box: shiftedDensityBox(box, motionTime, index, steps.length, appear),
      progress: reducedMotion ? 1 : timing ? sequenceBridge(elapsed, index + 1, timing) : stepBridge(elapsed, index),
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
  preserveImageBackground = false,
  timing?: SequenceTiming,
  motionTime = 0,
) {
  for (let index = 0; index < steps.length; index++) {
    const appear = reducedMotion ? 1 : timing ? sequenceAppear(elapsed, index + 1, timing) : stepAppear(elapsed, index);
    if (appear <= 0) continue;
    const step = steps[index];
    const ease = appear * appear * (3 - 2 * appear);
    const box = stepCardBox(step.image, width, height, step.cx, step.cy, step.size);
    const scale = .94 + .06 * ease;
    const idle = surroundIdle(motionTime, index, steps.length);
    const pulse = idle.blink ? .96 : 1;
    const lift = (1 - ease) * 10 + idle.y * ease;
    const radius = Math.min(box.width, box.height) * .12;
    context.save();
    context.globalAlpha = ease;
    context.translate(box.x + box.width / 2 + idle.x * ease, box.y + box.height / 2 + lift);
    context.scale(scale, scale * (ease * pulse + (1 - ease)));
    if (!preserveImageBackground) {
      context.beginPath();
      context.roundRect(-box.width / 2, -box.height / 2, box.width, box.height, radius);
      context.fillStyle = "#ffffff";
      context.fill();
      context.clip();
    }
    context.drawImage(step.image, -box.width / 2, -box.height / 2, box.width, box.height);
    context.restore();
  }
}

export function drawAppearingOverlays(
  context: CanvasRenderingContext2D,
  steps: StepOverlaySpec[],
  width: number,
  height: number,
  alphas: number[],
  preserveImageBackground = false,
  motionTime = 0,
  bobIndexOffset = 0,
  idleCount = steps.length + bobIndexOffset,
) {
  const count = Math.max(1, idleCount);
  for (let index = 0; index < steps.length; index++) {
    const appear = alphas[index] ?? 0;
    if (appear <= 0) continue;
    const step = steps[index];
    const ease = appear * appear * (3 - 2 * appear);
    const box = stepCardBox(step.image, width, height, step.cx, step.cy, step.size);
    const scale = .94 + .06 * ease;
    const idle = surroundIdle(motionTime, index + bobIndexOffset, count);
    const pulse = idle.blink ? .96 : 1;
    const lift = (1 - ease) * 10 + idle.y * ease;
    const radius = Math.min(box.width, box.height) * .12;
    context.save();
    context.globalAlpha = ease;
    context.translate(box.x + box.width / 2 + idle.x * ease, box.y + box.height / 2 + lift);
    context.scale(scale, scale * (ease * pulse + (1 - ease)));
    if (!preserveImageBackground) {
      context.beginPath();
      context.roundRect(-box.width / 2, -box.height / 2, box.width, box.height, radius);
      context.fillStyle = "#ffffff";
      context.fill();
      context.clip();
    }
    context.drawImage(step.image, -box.width / 2, -box.height / 2, box.width, box.height);
    context.restore();
  }
}
