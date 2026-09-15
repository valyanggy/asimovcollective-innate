"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { drawDotField } from "@/lib/dot-field";
import type { DotFieldLayout } from "@/lib/dot-field";
import { DITHER_FIELD_DEFAULTS, FIGURE_LED_DEFAULTS, TONAL_LIBRARY, type DitherStamp } from "@/lib/dither-cells";
import styles from "./dot-system.module.css";
import libraryStyles from "./cell-library.module.css";
import { CellLibrary } from "./cell-library";
import { TrailControls } from "./trail-controls";
import { TRAIL_DEFAULTS } from "@/lib/domain-trails";
import { DitherControls } from "./dither-controls";
import { DendriticControls } from "./dendritic-layer";
import { LINKAGE_DEFAULTS } from "@/lib/component-linkage";

export function DotSystem({ rectangular = false, multiple = false, neurons = false, dither = false, figure }: { rectangular?: boolean; multiple?: boolean; neurons?: boolean; dither?: boolean; figure?: string }) {
  const path = usePathname();
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
  const [ditherSettings, setDitherSettings] = useState(figure ? FIGURE_LED_DEFAULTS : DITHER_FIELD_DEFAULTS);
  const ditherSettingsRef = useRef(ditherSettings);
  ditherSettingsRef.current = ditherSettings;
  const [stamp, setStamp] = useState<DitherStamp>({ id: "tonal" });
  const stampRef = useRef(stamp);
  stampRef.current = stamp;
  const [figureImage, setFigureImage] = useState<HTMLImageElement | null>(null);
  const figureRef = useRef(figureImage);
  figureRef.current = figureImage;

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
    if (!canvas.current) return;
    seed.current ??= crypto.getRandomValues(new Uint32Array(1))[0];
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    let animation = 0, lastDraw = 0;
    const draw = (time = 0) => {
      try { layout.current = drawDotField(canvas.current!, seed.current!, time, headlinePosition.current, rectangular, multiple && !figure ? objectPositions.current : undefined, neurons ? linkage : undefined, dither ? stampRef.current : undefined, ditherSettingsRef.current, dither && !figure ? trailsRef.current : undefined, figureRef.current ?? undefined) ?? null; }
      catch { setError(true); }
    };
    const tick = (time: number) => {
      if (time - lastDraw >= 1000 / 30) { draw(media.matches ? 0 : time); lastDraw = time; }
      animation = requestAnimationFrame(tick);
    };
    const syncMotion = () => {
      cancelAnimationFrame(animation);
      if ((!media.matches || dither) && !document.hidden) animation = requestAnimationFrame(tick);
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
  }, [rectangular, multiple, neurons, dither, linkage, figure, figureImage]);

  useEffect(() => {
    if (!dither || !window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const frame = requestAnimationFrame(() => {
      if (!canvas.current || seed.current === null) return;
      try { layout.current = drawDotField(canvas.current, seed.current, 0, headlinePosition.current, rectangular,
        multiple && !figure ? objectPositions.current : undefined, neurons ? linkage : undefined, stamp, ditherSettingsRef.current, dither && !figure ? trailsRef.current : undefined, figureRef.current ?? undefined) ?? null; }
      catch { setError(true); }
    });
    return () => cancelAnimationFrame(frame);
  }, [ditherSettings, trails, dither, rectangular, multiple, neurons, linkage, stamp, figure, figureImage]);

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
    if (multiple) objectPositions.current[activeObject.current] = position;
    else headlinePosition.current = position;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches && seed.current !== null) {
      layout.current = drawDotField(event.currentTarget, seed.current, 0, headlinePosition.current, rectangular, multiple && !figure ? objectPositions.current : undefined, neurons ? linkage : undefined, dither ? stampRef.current : undefined, ditherSettingsRef.current, dither && !figure ? trailsRef.current : undefined, figureRef.current ?? undefined) ?? null;
    }
    event.preventDefault();
  };

  const endDrag = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (dragPointer.current !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    dragPointer.current = null;
    dragOffset.current = null;
    setDragging(false);
  };

  return <main className={styles.workspace}>
    <header className={styles.header}>
      <nav className={`study-nav ${styles.navigation}`} aria-label="Studies">
        <Link href="/">05</Link><Link href="/05_2">05_2</Link><Link href="/05_3">05_3</Link>
        <Link href="/06">06</Link><Link href="/07">07</Link><Link href="/08_system">08_system</Link>
        <Link href="/09_system" aria-current={!rectangular && !multiple && !dither ? "page" : undefined}>09_system</Link>
        <Link href="/09_2" aria-current={rectangular ? "page" : undefined}>09_2</Link>
        <Link href="/09_3" aria-current={multiple && !neurons && !dither ? "page" : undefined}>09_3</Link>
        <Link href="/09_4" aria-current={neurons && !dither ? "page" : undefined}>09_4</Link>
        <Link href="/10_1" aria-current={path === "/10_1" ? "page" : undefined}>10_1</Link>
        <Link href="/10_push/button" aria-current={path === "/10_push/button" ? "page" : undefined}>10_push</Link>
      </nav>
      <h1 className={styles.title}>{figure ? "Push button" : dither ? "Cell system" : neurons ? "Connected agents" : multiple ? "Four agents" : rectangular ? "Rectangle field" : "Circle field"}</h1>
    </header>
    <section className={`${styles.stage} ${neurons ? styles.neuralStage : ""}`} aria-label={dither ? "Dithered cell field" : rectangular ? "Interactive rectangular density field" : "One generative circle-grid pattern"}>
      <canvas ref={canvas} className={`${styles.canvas} ${dragging ? styles.dragging : ""}`} role="img"
        onPointerDown={beginDrag} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag}
        aria-label={figure ? "A push-button figure dithered on the default grid like an LED screen." : dither ? "Four draggable text agents. Metaball connections are dithered with a circular cell that can be swapped from the library." : neurons ? "Four draggable text agents joined by curved neuron-like paths around a slowly changing dot field." : multiple ? "Four draggable text objects: innate robotics, 2026 Summer Hackathon, skill_walk, and push. Each merges with nearby dots." : rectangular ? "Drag innate robotics to merge and separate stepped rectangular territories on the grid." : "A draggable innate robotics text agent forms liquid connections with nearby thinking-area dots on a stationary outlined grid."} />
      {dither && figure && <details className={libraryStyles.library} open aria-label="LED field settings">
        <summary className={libraryStyles.summary}>LED field settings</summary>
        <p className={libraryStyles.heading}>Default grid</p>
        <p className={libraryStyles.note}>Each field cell is an LED. The figure lights the cells it covers, in its own colors.</p>
        <DitherControls led value={ditherSettings} onChange={setDitherSettings} />
      </details>}
      {dither && !figure && <CellLibrary library={TONAL_LIBRARY} value={stamp} onChange={setStamp}><DitherControls value={ditherSettings} onChange={setDitherSettings} /><TrailControls value={trails} onChange={setTrails} /></CellLibrary>}
      {neurons && <DendriticControls settings={linkage} onChange={setLinkage} />}
      {error && <p className={styles.error} role="alert">The pattern couldn’t render. Reload in a browser with Canvas support.</p>}
    </section>
    <noscript><p>Enable JavaScript to view the generative pattern.</p></noscript>
  </main>;
}
