"use client";

import Link from "next/link";
import { SignalStatic } from "./signal-static";
import { OBJECT_CHOICES, OBJECT_LABELS, type ObjectId } from "@/lib/object-catalog";
import { useCallback, useEffect, useRef, useState } from "react";
import type { CameraView } from "@/lib/hand-model";
import type { ColorFieldScene } from "@/lib/color-field-scene";

export function ColorField({ variant = "05" }: { variant?: "05" | "05_2" | "05_3" | "06" }) {
  const hasLayeredVisuals = variant === "05_3" || variant === "06";
  const [staticMoving, setStaticMoving] = useState(true);
  const [grain, setGrain] = useState(115);
  const [noise, setNoise] = useState(.65);
  const initialObject: ObjectId = variant === "05_2" ? "knight" : "cube";
  const currentObject = useRef<ObjectId>(initialObject);
  const [objectId, setObjectId] = useState<ObjectId>(initialObject);
  const container = useRef<HTMLDivElement>(null);
  const scene = useRef<ColorFieldScene | null>(null);
  const animation = useRef<number | null>(null);
  const currentCurl = useRef(1);
  const currentView = useRef<CameraView>("front");
  const [curl, setCurl] = useState(1);
  const [view, setView] = useState<CameraView>("front");
  const [playing, setPlaying] = useState(false);
  const [ready, setReady] = useState(false);
  const [hasContact, setHasContact] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stop = useCallback(() => {
    if (animation.current !== null) cancelAnimationFrame(animation.current);
    animation.current = null;
    setPlaying(false);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let ownedScene: ColorFieldScene | null = null;
    // Import Three.js only in the browser; keep the initial Next.js shell server-rendered.
    import("@/lib/color-field-scene").then(({ ColorFieldScene: Scene }) => {
      if (cancelled || !container.current) return;
      try {
        ownedScene = new Scene(container.current, {
          curl: currentCurl.current,
          view: currentView.current,
          objectId: currentObject.current,
          layered: hasLayeredVisuals,
          rearGrasp: variant === "06",
          onContactChange: setHasContact,
          onError: (message) => { stop(); setError(message); },
        });
        scene.current = ownedScene;
        setReady(true);
      } catch {
        setError("The 3D view couldn’t start. Check that hardware acceleration is enabled in your browser.");
      }
    }).catch(() => {
      if (!cancelled) setError("The 3D view couldn’t load. Reload the page to try again.");
    });
    return () => {
      cancelled = true;
      if (animation.current !== null) cancelAnimationFrame(animation.current);
      ownedScene?.dispose();
      if (scene.current === ownedScene) scene.current = null;
    };
  }, [stop, variant, hasLayeredVisuals]);

  const updateCurl = useCallback((next: number) => {
    currentCurl.current = next;
    scene.current?.setCurl(next);
    setCurl(next);
  }, []);

  function selectView(next: CameraView) {
    currentView.current = next;
    scene.current?.setView(next);
    setView(next);
  }

  function selectObject(next: ObjectId) {
    stop();
    currentObject.current = next;
    scene.current?.setObject(next);
    setObjectId(next);
  }

  function playGrasp() {
    if (playing) { stop(); return; }
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { updateCurl(1); return; }
    setPlaying(true);
    const started = performance.now();
    function frame(now: number) {
      const progress = Math.min(1, (now - started) / 3600);
      updateCurl(progress * progress * (3 - 2 * progress));
      if (progress < 1) animation.current = requestAnimationFrame(frame);
      else stop();
    }
    animation.current = requestAnimationFrame(frame);
  }

  return (
    <main className={`workspace${hasLayeredVisuals ? " workspace-layered" : ""}${variant === "06" ? " workspace-06" : ""}`}>
      {/* <header className="workspace-header">
        <h1><span className="chapter">{variant} /</span> Color field</h1>
       
      </header> */}

      <div className="study-toolbar">
        <nav className="study-nav" aria-label="Studies">
          <Link href="/" aria-current={variant === "05" ? "page" : undefined}>05</Link>
          <Link href="/05_2" aria-current={variant === "05_2" ? "page" : undefined}>05_2</Link>
          <Link href="/05_3" aria-current={variant === "05_3" ? "page" : undefined}>05_3</Link>
          <Link href="/06" aria-current={variant === "06" ? "page" : undefined}>06</Link>
          <Link href="/07">07</Link>
          <Link href="/08_system">08_system</Link>
          <Link href="/09_system">09_system</Link>
          <Link href="/09_2">09_2</Link>
          <Link href="/09_3">09_3</Link>
          <Link href="/09_4">09_4</Link>
          <Link href="/10_1">10_1</Link>
          <Link href="/10_push/button">10_push</Link>
        </nav>
        {variant === "05_2" && <div className="object-picker" role="group" aria-label="Object">
          {OBJECT_CHOICES.map(object => <button key={object.id} type="button" aria-pressed={objectId === object.id}
            onClick={() => selectObject(object.id)}><span aria-hidden="true">{object.number}</span>{object.label}</button>)}
        </div>}
        <div className="view-switch" role="group" aria-label="Camera view">
          <button type="button" aria-pressed={view === "front"} onClick={() => selectView("front")}>Front</button>
          <button type="button" aria-pressed={view === "angle"} onClick={() => selectView("angle")}>Isometric</button>
        </div>
      </div>

      {variant === "06" && <div className="signal-toolbar"><p className="decision-caption">Decision tags · simulated</p><button type="button" aria-pressed={staticMoving} onClick={() => setStaticMoving(value => !value)}>{staticMoving ? "Pause static" : "Animate static"}</button></div>}
      {hasLayeredVisuals && <div className="dither-controls">
        <label htmlFor="dither-grain">Granularity <output>{grain}</output>
          <input id="dither-grain" type="range" min="35" max="220" value={grain} disabled={!ready || !!error}
            onChange={event => { const value = Number(event.target.value); setGrain(value); scene.current?.setDither(value, noise); }} />
        </label>
        <label htmlFor="dither-noise">Edge diffusion <output>{Math.round(noise * 100)}%</output>
          <input id="dither-noise" type="range" min="0" max="100" value={Math.round(noise * 100)} disabled={!ready || !!error}
            onChange={event => { const value = Number(event.target.value) / 100; setNoise(value); scene.current?.setDither(grain, value); }} />
        </label>
      </div>}
      <section className="visualization" aria-label="Claw and object interaction">
        <div className="viewport" ref={container} role="img" aria-label={`${view === "front" ? "Front" : "Isometric"} view of a two-jaw three-dimensional claw around a ${hasLayeredVisuals ? "chess knight" : OBJECT_LABELS[objectId]}. Claw closure ${Math.round(curl * 100)} percent.`} />
        {variant === "06" && ready && !error && <SignalStatic moving={staticMoving} />}
        {(!ready || error) && (
          <div className="scene-message" role={error ? "alert" : "status"}>
            <p>{error || "Loading the 3D view…"}</p>
          </div>
        )}
      </section>

      <section className="gesture-controls" aria-label="Gesture controls">
        <div className="gesture-main">
          <button className="play-button" type="button" disabled={!ready || !!error} onClick={playGrasp}>
            <span aria-hidden="true">{playing ? "Ⅱ" : "▷"}</span>{playing ? "Pause" : "Play grasp"}
          </button>
          <div className="curl-control">
            <div className="range-heading"><label htmlFor="curl">Claw closure</label><output htmlFor="curl">{Math.round(curl * 100)}%</output></div>
            <input id="curl" type="range" min="0" max="100" step="1" value={Math.round(curl * 100)} disabled={!ready || !!error}
              aria-valuetext={`${Math.round(curl * 100)} percent closed`}
              onChange={(event) => { stop(); updateCurl(Number(event.target.value) / 100); }} />
            <div className="range-endpoints" aria-hidden="true"><span>Open</span><span>Grasp</span></div>
          </div>
        </div>
        {/* <div className="scene-status" role="status">
          <span>{view === "front" ? "Front projection" : "Isometric view"}{variant === "05_2" ? ` · ${OBJECT_LABELS[objectId]}` : ""}</span>
          <span className="status-separator" aria-hidden="true">/</span>
          <span>{ready ? (hasContact ? "Surface contact" : "Near-field motion") : "Initializing"}</span>
        </div> */}
      </section>
    </main>
  );
}
