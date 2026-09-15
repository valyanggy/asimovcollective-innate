"use client";

import { useEffect, useRef } from "react";

// Edit these to change the amount and tempo of the interference.
const CLUSTERS = 48;
const UPDATE_MS = 400;
const COLORS = ["#002bff", "#00efff", "#faff00", "#ff20d9", "#ff350d", "#65ff00", "#ffffff"];
const random = (seed: number) => { const n = Math.sin(seed * 127.1 + 311.7) * 43758.5453; return n - Math.floor(n); };
type Cluster = { x: number; y: number; seed: number; revision: number; next: number };

export function SignalStatic({ moving }: { moving: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const motion = useRef(moving);
  useEffect(() => { motion.current = moving; }, [moving]);
  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    const context = element.getContext("2d");
    if (!context) return;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let width = 0, height = 0, tick = 0;
    const clusters: Cluster[] = Array.from({ length: CLUSTERS }, (_, i) => ({
      // A few broken signal columns, with sparse fragments between them.
      x: i % 4 === 0 ? random(i + 61) : [0.025, 0.23, 0.77, 0.965][i % 4],
      y: random(i + 17), seed: i * 71 + 5, revision: 0, next: 1 + i % 9,
    }));
    function draw() {
      if (!context) return;
      context.clearRect(0, 0, width, height);
      const pixel = 2;
      for (const cluster of clusters) {
        const seed = cluster.seed + cluster.revision * 113;
        if (random(seed + 1) < .24) continue;
        const startX = Math.round((cluster.x * width + (random(seed + 2) - .5) * 24) / pixel) * pixel;
        const startY = Math.round((cluster.y * height + (random(seed + 3) - .5) * 18) / pixel) * pixel;
        const columns = 4 + Math.floor(random(seed + 4) * 15);
        const rows = 3 + Math.floor(random(seed + 5) * 12);
        const primary = Math.floor(random(seed + 6) * COLORS.length);
        const solid = random(seed + 7) > .8;
        for (let y = 0; y < rows; y++) {
          const band = Math.floor(y / 4);
          for (let x = 0; x < columns; x++) {
            const edge = x > columns * .72;
            // Transparent checker gaps let the existing artwork show through.
            if (!solid && (x + y) % 2 !== 0) continue;
            if (edge && random(seed + x * 3 + y * 17) < .5) continue;
            context.fillStyle = COLORS[(primary + band + (x % 5 === 0 ? 1 : 0)) % COLORS.length];
            context.globalAlpha = .8 + random(seed + band) * .2;
            context.fillRect(startX + x * pixel, startY + y * pixel, pixel, pixel);
          }
        }
        if (random(seed + 8) > .6) {
          context.globalAlpha = .7;
          context.fillStyle = COLORS[primary];
          for (let j = 0; j < 7; j++) {
            if (random(seed + j + 40) > .5) context.fillRect(startX + columns * pixel + j * 4, startY + 4, 2, 2);
          }
        }
      }
      context.globalAlpha = 1;
    }
    const observer = new ResizeObserver(() => {
      const rect = element.getBoundingClientRect();
      width = rect.width; height = rect.height;
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      element.width = Math.round(width * ratio); element.height = Math.round(height * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.imageSmoothingEnabled = false;
      draw();
    });
    observer.observe(element);
    const timer = window.setInterval(() => {
      if (!motion.current || reducedMotion.matches || document.hidden) return;
      tick++;
      for (const cluster of clusters) {
        if (tick < cluster.next) continue;
        cluster.revision++;
        cluster.next = tick + 2 + Math.floor(random(cluster.seed + tick) * 8);
        if (random(cluster.seed + tick + 22) > .8) cluster.y = (cluster.y + .04) % 1;
      }
      draw();
    }, UPDATE_MS);
    return () => { observer.disconnect(); window.clearInterval(timer); };
  }, []);
  return <canvas ref={canvas} className="signal-static" aria-hidden="true" />;
}
