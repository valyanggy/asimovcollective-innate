"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { StudyNav } from "./study-nav";
import { drawDotField } from "@/lib/dot-field";
import type { DotFieldLayout } from "@/lib/dot-field";
import { DITHER_FIELD_DEFAULTS, FIGURE_LED_DEFAULTS, PUSH_MORPH_DEFAULTS, MORPH_LIBRARY, NECK_LIBRARY, STEP_LIBRARY, TONAL_LIBRARY, type DitherStamp } from "@/lib/dither-cells";
import { replayStepSequence, STEP_OVERLAYS, type StepOverlaySpec } from "@/lib/step-overlays";
import styles from "./dot-system.module.css";
import { CellLibrary, RimBlockSet, ToneRamp } from "./cell-library";
import { TrailControls } from "./trail-controls";
import { TRAIL_DEFAULTS } from "@/lib/domain-trails";
import { DitherControls } from "./dither-controls";
import { DendriticControls } from "./dendritic-layer";
import { LINKAGE_DEFAULTS } from "@/lib/component-linkage";

export function DotSystem({ rectangular = false, multiple = false, neurons = false, dither = false, figure, pushMorph = false, gridOnly = false }: { rectangular?: boolean; multiple?: boolean; neurons?: boolean; dither?: boolean; figure?: string; pushMorph?: boolean; gridOnly?: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const seed = useRef<number | null>(null);
  const layout = useRef<DotFieldLayout | null>(null);
  const headlinePosition = useRef<{ x: number; y: number } | null>(null);
  const objectPositions = useRef<({ x: number; y: number } | null)[]>([]);
  const activeObject = useRef(0);
  const dragOffset = useRef<{ x: number; y: number } | null>(null);
  const dragPointer = useRef<number | null>(null);
  const [error, setError] = useState(false);
  const [linkage, setLinkage] = useState(LINKAGE_DEFAULTS);
  const [dragging, setDragging] = useState(false);
  const [trails, setTrails] = useState(TRAIL_DEFAULTS);
  const trailsRef = useRef(trails);
  trailsRef.current = trails;
  const [ditherSettings, setDitherSettings] = useState(pushMorph ? PUSH_MORPH_DEFAULTS : figure || gridOnly ? FIGURE_LED_DEFAULTS : DITHER_FIELD_DEFAULTS);
  const ditherSettingsRef = useRef(ditherSettings);
  ditherSettingsRef.current = ditherSettings;
  const [stamp, setStamp] = useState<DitherStamp>({ id: pushMorph ? "morph" : "tonal" });
  const stampRef = useRef(stamp);
  stampRef.current = stamp;
  const [stepStamp, setStepStamp] = useState<DitherStamp>({ id: "step" });
  const stepStampRef = useRef(stepStamp);
  stepStampRef.current = stepStamp;
  const [neckStamp, setNeckStamp] = useState<DitherStamp>({ id: "neck" });
  const neckStampRef = useRef(neckStamp);
  neckStampRef.current = neckStamp;
  const [figureImage, setFigureImage] = useState<HTMLImageElement | null>(null);
  const figureRef = useRef(figureImage);
  figureRef.current = figureImage;
  const [stepImages, setStepImages] = useState<StepOverlaySpec[]>([]);
  const stepsRef = useRef(stepImages);
  stepsRef.current = stepImages;

  useEffect(() => {
    if (!figure) { setFigureImage(null); return; }
    let cancelled = false;
    const image = new Image();
    image.onload = () => { if (!cancelled) setFigureImage(image); };
    image.onerror = () => { if (!cancelled) setError(true); };
    image.src = figure;
    return () => { cancelled = true; };
  }, [figure]);

  useEffect(() => {
    if (!figure) { setStepImages([]); return; }
    let cancelled = false;
    Promise.all(STEP_OVERLAYS.map(step => new Promise<StepOverlaySpec>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve({ ...step, image });
      image.onerror = () => reject(new Error(`Could not load ${step.src}`));
      image.src = step.src;
    }))).then(steps => { if (!cancelled) setStepImages(steps); }).catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, [figure]);

  useEffect(() => {
    if (!canvas.current) return;
    seed.current ??= crypto.getRandomValues(new Uint32Array(1))[0];
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    let animation = 0, lastDraw = 0;
    const draw = (time = 0) => {
      try { layout.current = drawDotField(canvas.current!, seed.current!, time, headlinePosition.current, rectangular, (multiple || gridOnly) && !figure ? objectPositions.current : undefined, neurons ? linkage : undefined, dither ? stampRef.current : undefined, ditherSettingsRef.current, dither && !figure ? trailsRef.current : undefined, figureRef.current ?? undefined, figure ? stepsRef.current : undefined, figure ? stepStampRef.current : undefined, figure ? neckStampRef.current : undefined, pushMorph, gridOnly) ?? null; }
      catch { setError(true); }
    };
    const tick = (time: number) => {
      if (time - lastDraw >= 1000 / 30) { draw(media.matches ? 0 : time); lastDraw = time; }
      animation = requestAnimationFrame(tick);
    };
    const syncMotion = () => {
      cancelAnimationFrame(animation);
      if ((!media.matches || dither || gridOnly) && !document.hidden) animation = requestAnimationFrame(tick);
      else draw(0);
    };
    const observer = new ResizeObserver(() => draw(media.matches ? 0 : performance.now()));
    observer.observe(canvas.current);
    draw();
    document.addEventListener("visibilitychange", syncMotion);
    media.addEventListener("change", syncMotion);
    syncMotion();
    return () => {
      cancelAnimationFrame(animation);
      observer.disconnect();
      document.removeEventListener("visibilitychange", syncMotion);
      media.removeEventListener("change", syncMotion);
    };
  }, [rectangular, multiple, neurons, dither, linkage, figure, figureImage, stepImages, pushMorph, gridOnly]);

  useEffect(() => {
    if ((!dither && !gridOnly) || !window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const frame = requestAnimationFrame(() => {
      if (!canvas.current || seed.current === null) return;
      try { layout.current = drawDotField(canvas.current, seed.current, 0, headlinePosition.current, rectangular,
        (multiple || gridOnly) && !figure ? objectPositions.current : undefined, neurons ? linkage : undefined, stamp, ditherSettingsRef.current, dither && !figure ? trailsRef.current : undefined, figureRef.current ?? undefined, figure ? stepsRef.current : undefined, figure ? stepStamp : undefined, figure ? neckStamp : undefined, pushMorph, gridOnly) ?? null; }
      catch { setError(true); }
    });
    return () => cancelAnimationFrame(frame);
  }, [ditherSettings, trails, dither, rectangular, multiple, neurons, linkage, stamp, stepStamp, neckStamp, figure, figureImage, pushMorph, gridOnly]);

  const canvasPoint = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
  };

  const beginDrag = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (figure || !layout.current) return;
    const point = canvasPoint(event);
    const objects = layout.current.objects ?? [{ bounds: layout.current.headlineBounds, anchor: layout.current.headlineAnchor }];
    const hit = objects.findLastIndex(({ bounds }) => point.x >= bounds.left && point.x <= bounds.right
      && point.y >= bounds.top && point.y <= bounds.bottom);
    if (hit < 0) return;
    activeObject.current = hit;
    if (gridOnly) {
      event.currentTarget.dataset.activeCell = String(hit);
      event.currentTarget.dataset.draggingCell = "1";
    }
    dragOffset.current = { x: point.x - objects[hit].anchor.x, y: point.y - objects[hit].anchor.y };
    dragPointer.current = event.pointerId;
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
    event.preventDefault();
  };

  const moveDrag = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (dragPointer.current !== event.pointerId || !dragOffset.current || !layout.current) return;
    const point = canvasPoint(event);
    const canvasBounds = event.currentTarget.getBoundingClientRect();
    const selected = layout.current.objects?.[activeObject.current];
    const headlineBounds = selected?.bounds ?? layout.current.headlineBounds;
    const headlineAnchor = selected?.anchor ?? layout.current.headlineAnchor;
    const leftOffset = headlineBounds.left - headlineAnchor.x;
    const rightOffset = headlineBounds.right - headlineAnchor.x;
    const topOffset = headlineBounds.top - headlineAnchor.y;
    const bottomOffset = headlineBounds.bottom - headlineAnchor.y;
    const position = {
      x: Math.max(4 - leftOffset, Math.min(canvasBounds.width - 4 - rightOffset, point.x - dragOffset.current.x)),
      y: Math.max(4 - topOffset, Math.min(canvasBounds.height - 4 - bottomOffset, point.y - dragOffset.current.y)),
    };
    if (multiple || gridOnly) objectPositions.current[activeObject.current] = position;
    else headlinePosition.current = position;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches && seed.current !== null) {
      layout.current = drawDotField(event.currentTarget, seed.current, 0, headlinePosition.current, rectangular, (multiple || gridOnly) && !figure ? objectPositions.current : undefined, neurons ? linkage : undefined, dither ? stampRef.current : undefined, ditherSettingsRef.current, dither && !figure ? trailsRef.current : undefined, figureRef.current ?? undefined, undefined, undefined, undefined, false, gridOnly) ?? null;
    }
    event.preventDefault();
  };

  const endDrag = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (dragPointer.current !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (gridOnly) delete event.currentTarget.dataset.draggingCell;
    dragPointer.current = null;
    dragOffset.current = null;
    setDragging(false);
  };

  return <main className={styles.workspace}>
    <header className={styles.header}>
      <StudyNav className={styles.navigation} />
      <h1 className={styles.title}>{gridOnly ? "Grid cells" : pushMorph ? "Innate OS · Morph" : figure ? "Innate OS" : dither ? "Cell system" : neurons ? "Connected agents" : multiple ? "Four agents" : rectangular ? "Rectangle field" : "Circle field"}</h1>
    </header>
    <section className={`${styles.stage} ${neurons ? styles.neuralStage : ""}`} aria-label={gridOnly ? "Draggable grid cells" : dither ? "Dithered cell field" : rectangular ? "Interactive rectangular density field" : "One generative circle-grid pattern"}>
      <canvas ref={canvas} className={`${styles.canvas} ${dragging ? styles.dragging : ""}`} role="img"
        onPointerDown={beginDrag} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag}
        aria-label={gridOnly ? "Draggable lettered cells on the LED grid. Nearby cells merge into outlined pills. Use the toggle to hide or show the grid." : figure ? "Innate OS chat on the LED grid, with three MARS steps appearing in sequence around the field." : dither ? "Four draggable text agents. Metaball connections are dithered with a circular cell that can be swapped from the library." : neurons ? "Four draggable text agents joined by curved neuron-like paths around a slowly changing dot field." : multiple ? "Four draggable text objects: innate robotics, 2026 Summer Hackathon, skill_walk, and push. Each merges with nearby dots." : rectangular ? "Drag innate robotics to merge and separate stepped rectangular territories on the grid." : "A draggable innate robotics text agent forms liquid connections with nearby thinking-area dots on a stationary outlined grid."} />
      {gridOnly && <DitherControls led gridOnly value={ditherSettings} onChange={setDitherSettings} />}
      {dither && !gridOnly && <CellLibrary library={pushMorph ? MORPH_LIBRARY : TONAL_LIBRARY} value={stamp} onChange={setStamp}>
        {pushMorph && <RimBlockSet value={stamp.rim ?? []} onChange={rim => setStamp(current => ({ ...current, rim }))} />}
        {figure && !pushMorph && <ToneRamp library={STEP_LIBRARY} value={stepStamp} onChange={setStepStamp} />}
        {figure && !pushMorph && <ToneRamp library={NECK_LIBRARY} value={neckStamp} onChange={setNeckStamp} />}
        <DitherControls led={Boolean(figure)} field value={ditherSettings} onChange={setDitherSettings}
          defaults={pushMorph ? PUSH_MORPH_DEFAULTS : undefined}
          rimBlocks={pushMorph}
          onReplay={figure ? () => { if (canvas.current) replayStepSequence(canvas.current); } : undefined} />
        {!figure && <TrailControls value={trails} onChange={setTrails} />}
      </CellLibrary>}
      {neurons && <DendriticControls settings={linkage} onChange={setLinkage} />}
      {error && <p className={styles.error} role="alert">The pattern couldn’t render. Reload in a browser with Canvas support.</p>}
    </section>
    <noscript><p>Enable JavaScript to view the generative pattern.</p></noscript>
  </main>;
}
