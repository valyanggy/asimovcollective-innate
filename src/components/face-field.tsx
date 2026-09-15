"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { drawFacePills, loadFaceMask, type FaceMask } from "@/lib/face-pills";
import styles from "./face-field.module.css";

export function FaceField() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState(12);
  const [backgroundScale, setBackgroundScale] = useState(4);
  const [mask, setMask] = useState<FaceMask | null>(null);
  const [seed, setSeed] = useState(7);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadFaceMask().then(value => { if (!cancelled) setMask(value); })
      .catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const element = canvas.current;
    if (!element || !mask) return;
    let frame = 0;
    const draw = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        try { drawFacePills(element, mask, size, backgroundScale, seed); }
        catch { setError(true); }
      });
    };
    const observer = new ResizeObserver(draw);
    observer.observe(element);
    draw();
    return () => { observer.disconnect(); cancelAnimationFrame(frame); };
  }, [mask, size, backgroundScale, seed]);

  return <main className={styles.workspace}>
    <header className={styles.header}>
      <nav className={`study-nav ${styles.navigation}`} aria-label="Studies">
        <Link href="/">05</Link><Link href="/05_2">05_2</Link><Link href="/05_3">05_3</Link>
        <Link href="/06">06</Link><Link href="/07" aria-current="page">07</Link>
        <Link href="/08_system">08_system</Link><Link href="/09_system">09_system</Link>
        <Link href="/09_2">09_2</Link><Link href="/09_3">09_3</Link>
        <Link href="/09_4">09_4</Link><Link href="/10_1">10_1</Link>
        <Link href="/10_push/button">10_push</Link>
      </nav>
      <h1 className={styles.title}>Face field</h1>
    </header>
    <figure className={styles.figure}>
      <canvas ref={canvas} className={styles.canvas} role="img"
        aria-label="The supplied Innate robot's rounded head, two dark camera eyes and short neck, formed from blue text pills. Fine cells preserve the eyes and outline; larger outlined cells fill the black background." />
      {!mask && !error && <p className={styles.error} role="status">Loading portrait…</p>}
      {error && <p className={styles.error} role="alert">The artwork couldn’t render. Reload in a browser with Canvas support.</p>}
      <noscript><p className={styles.error}>Enable JavaScript to view the robot portrait.</p></noscript>
      <figcaption className={styles.caption}><span>07 / Embodied intelligence</span><span>Perception · reasoning · action</span></figcaption>
    </figure>
    <footer className={styles.footer}>
      <label className={styles.density} htmlFor="pill-size">Face cells
        <input id="pill-size" type="range" min="8" max="18" step="1" value={size}
          aria-valuetext={`${size}, ${size < 12 ? "finer" : size > 12 ? "coarser" : "medium"} texture`}
          onChange={event => setSize(Number(event.target.value))} />
        <output htmlFor="pill-size">{size}</output>
      </label>
      <label className={styles.density} htmlFor="background-size">Background cells
        <input id="background-size" type="range" min="1" max="6" step="1" value={backgroundScale}
          aria-valuetext={`Up to ${backgroundScale} times the fine cell height`}
          onChange={event => setBackgroundScale(Number(event.target.value))} />
        <output htmlFor="background-size">{backgroundScale}×</output>
      </label>
      <button type="button" className={styles.shuffle} onClick={() => setSeed(value => value + 1)}>Shuffle words <span aria-hidden="true">↻</span></button>
    </footer>
  </main>;
}
