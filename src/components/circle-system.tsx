"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { CircleSystemRenderer, PATTERN_COUNT } from "@/lib/circle-system";
import styles from "./circle-system.module.css";

export function CircleSystem() {
  const canvases = useRef<(HTMLCanvasElement | null)[]>([]);
  const renderer = useRef<CircleSystemRenderer | null>(null);
  const [playing, setPlaying] = useState(true);
  const [seed, setSeed] = useState(8);
  const [speed, setSpeed] = useState(.7);
  const [density, setDensity] = useState(1);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updateMotion = () => { setReducedMotion(media.matches); if (media.matches) setPlaying(false); };
    updateMotion(); media.addEventListener("change", updateMotion);
    try {
      renderer.current = new CircleSystemRenderer(canvases.current.filter((canvas): canvas is HTMLCanvasElement => !!canvas),
        { seed: 8, speed: .7, density: 1, playing: !media.matches });
    } catch { setError(true); }
    return () => { media.removeEventListener("change", updateMotion); renderer.current?.dispose(); renderer.current = null; };
  }, []);

  useEffect(() => { renderer.current?.setOptions({ seed, speed, density, playing }); }, [seed, speed, density, playing]);

  return <main className={styles.workspace}>
    <header className={styles.header}>
      <nav className={`study-nav ${styles.navigation}`} aria-label="Studies">
        <Link href="/">05</Link><Link href="/05_2">05_2</Link><Link href="/05_3">05_3</Link>
        <Link href="/06">06</Link><Link href="/07">07</Link><Link href="/08_system" aria-current="page">08_system</Link>
        <Link href="/09_system">09_system</Link>
        <Link href="/09_2">09_2</Link><Link href="/09_3">09_3</Link>
        <Link href="/09_4">09_4</Link><Link href="/10_1">10_1</Link>
        <Link href="/10_push/button">10_push</Link>
      </nav>
      <h1 className={styles.title}>Quarter-circle system</h1>
    </header>
    <section className={styles.patterns} aria-label="Eight evolving circle patterns">
      {Array.from({ length: PATTERN_COUNT }, (_, i) => <canvas key={i}
        ref={element => { canvases.current[i] = element; }} className={styles.canvas}
        role="img" aria-label={`Pattern ${i + 1}: quarter-, half-, and three-quarter-circle outlines join into black paths on a light grey circle grid. Whole arc units fade between connected configurations.`} />)}
    </section>
    {error && <p role="alert">The patterns couldn’t render. Reload in a browser with Canvas support.</p>}
    <noscript><p>Enable JavaScript to view the generative patterns.</p></noscript>
    <footer className={styles.footer}>
      <div className={styles.actions}>
        <button type="button" onClick={() => setPlaying(value => !value)} disabled={reducedMotion || error}
          aria-pressed={playing}>{playing ? "Pause motion" : "Play motion"}</button>
        <button type="button" onClick={() => setSeed(value => value + 1)} disabled={error}>Regenerate <span aria-hidden="true">↻</span></button>
      </div>
      <div className={styles.controls}>
        <label htmlFor="system-speed">Speed
          <input id="system-speed" type="range" min=".2" max="2" step=".1" value={speed}
            onChange={event => setSpeed(Number(event.target.value))} />
          <output htmlFor="system-speed">{speed.toFixed(1)}×</output>
        </label>
        <label htmlFor="system-density">Density
          <input id="system-density" type="range" min=".6" max="1.8" step=".1" value={density}
            onChange={event => setDensity(Number(event.target.value))} />
          <output htmlFor="system-density">{Math.round(density * 100)}%</output>
        </label>
      </div>
    </footer>
    {reducedMotion && <p className={styles.motionNote}>Motion is paused for your reduced-motion preference. Regenerate explores another pattern.</p>}
  </main>;
}
