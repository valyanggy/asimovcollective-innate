export const FACE_WORDS = [
  "SLAM", "VISION", "LIDAR", "ACTUATOR", "SERVO", "KINEMATICS", "PATH PLANNING",
  "GRIPPER", "SENSOR FUSION", "TELEOP", "AUTONOMY", "NAVIGATION", "DEPTH",
  "MOTOR CONTROL", "ROS", "IMU", "MAPPING", "EMBODIED AI", "PERCEPTION",
  "LOCOMOTION", "WORLD MODEL", "INFERENCE", "TACTILE", "ODOMETRY", "POLICY",
  "MANIPULATION", "REASONING", "JOINT", "TORQUE", "FEEDBACK", "SIM TO REAL",
  "TRAJECTORY", "END EFFECTOR", "STEREO", "CONTROL LOOP", "ROBOTICS", "IK", "AI",
];
export type FaceMask = { width: number; height: number; pixels: Uint8Array };
export type FacePill = { x: number; y: number; w: number; h: number; tone: number; text: string; fontSize: number };
const random = (seed: number) => { const value = Math.sin(seed * 127.1 + 311.7) * 43758.5453; return value - Math.floor(value); };

// Isolate head and neck from shoulders. Silhouette and lens openings come
// from the supplied image pixels, not a replacement drawing.
export const PORTRAIT_CROP = { x: 350, y: 185, width: 560, height: 480 };
const EYES = [[502, 459], [761, 460]];
export function imageToFaceMask(data: Uint8ClampedArray, width: number, height: number): FaceMask {
  const pixels = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const sx = PORTRAIT_CROP.x + (x + .5) / width * PORTRAIT_CROP.width;
    const sy = PORTRAIT_CROP.y + (y + .5) / height * PORTRAIT_CROP.height;
    if (sy > 597 && (sx < 560 || sx > 703)) continue;
    const i = (y * width + x) * 4;
    if (data[i + 3] < 128 || Math.min(data[i], data[i + 1], data[i + 2]) > 245) continue;
    const eye = EYES.some(([ex, ey]) => Math.hypot(sx - ex, sy - ey) < 41);
    // Localize dark-pixel classification so the right-side shadow stays blue.
    const luminance = .2126 * data[i] + .7152 * data[i + 1] + .0722 * data[i + 2];
    pixels[y * width + x] = eye && luminance < 95 ? 2 : 1;
  }
  return { width, height, pixels };
}
export async function loadFaceMask(): Promise<FaceMask> {
  const image = new Image(); image.src = "/images/innate-robot.png";
  await image.decode();
  const canvas = document.createElement("canvas"); canvas.width = 560; canvas.height = 480;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Canvas is unavailable.");
  const { x, y, width, height } = PORTRAIT_CROP;
  context.drawImage(image, x, y, width, height, 0, 0, canvas.width, canvas.height);
  return imageToFaceMask(context.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height);
}
export function portraitFrame(width: number, height: number) {
  const scale = Math.min(width * .84 / PORTRAIT_CROP.width, height * .9 / PORTRAIT_CROP.height);
  const w = PORTRAIT_CROP.width * scale, h = PORTRAIT_CROP.height * scale;
  return { x: (width - w) / 2, y: (height - h) / 2, w, h };
}

/** Large background pills span several rows of a shared fine lattice.
 * Material edges and camera openings stay fine; occupied cells never overlap. */
export function generateFacePills(
  mask: FaceMask, width: number, height: number, detail = 12, backgroundScale = 4, seed = 7,
  measure: (text: string, fontSize: number) => number = (text, fontSize) => text.length * fontSize * .58,
): FacePill[] {
  const scale = Math.min(1.15, Math.max(.48, width / 1200));
  const rowH = detail * scale, cellW = rowH * .65;
  const cols = Math.ceil(width / cellW), rows = Math.ceil(height / rowH);
  const tones = new Uint8Array(cols * rows), distance = new Uint16Array(cols * rows);
  const occupied = new Uint8Array(cols * rows), frame = portraitFrame(width, height);
  for (let row = 0; row < rows; row++) for (let col = 0; col < cols; col++) {
    const x = Math.floor(((col + .5) * cellW - frame.x) / frame.w * mask.width);
    const y = Math.floor(((row + .5) * rowH - frame.y) / frame.h * mask.height);
    const i = row * cols + col;
    if (x >= 0 && x < mask.width && y >= 0 && y < mask.height) tones[i] = mask.pixels[y * mask.width + x];
    distance[i] = 1000;
  }
  // Manhattan distance to silhouette and eye boundaries.
  for (let row = 0; row < rows; row++) for (let col = 0; col < cols; col++) {
    const i = row * cols + col, tone = tones[i];
    if ((col && tones[i - 1] !== tone) || (col < cols - 1 && tones[i + 1] !== tone)
      || (row && tones[i - cols] !== tone) || (row < rows - 1 && tones[i + cols] !== tone)) distance[i] = 0;
    if (col) distance[i] = Math.min(distance[i], distance[i - 1] + 1);
    if (row) distance[i] = Math.min(distance[i], distance[i - cols] + 1);
  }
  for (let row = rows - 1; row >= 0; row--) for (let col = cols - 1; col >= 0; col--) {
    const i = row * cols + col;
    if (col < cols - 1) distance[i] = Math.min(distance[i], distance[i + 1] + 1);
    if (row < rows - 1) distance[i] = Math.min(distance[i], distance[i + cols] + 1);
  }
  const maxSpan = (i: number) => tones[i] === 2 || distance[i] < 2 ? 1
    : tones[i] === 1 ? 2 : Math.min(backgroundScale, Math.max(1, Math.floor(distance[i] / 2)));
  const fits = (row: number, col: number, h: number, w: number, tone: number) => {
    if (row + h > rows || col + w > cols) return false;
    for (let yy = row; yy < row + h; yy++) for (let xx = col; xx < col + w; xx++) {
      const i = yy * cols + xx;
      if (occupied[i] || tones[i] !== tone || maxSpan(i) < h) return false;
    }
    return true;
  };
  const pills: FacePill[] = [], cache = new Map<number, number[]>();
  for (let row = 0; row < rows; row++) for (let col = 0; col < cols; col++) {
    const i = row * cols + col;
    if (occupied[i]) continue;
    const tone = tones[i], hash = seed * 173 + row * 293 + col * 71;
    let span = Math.min(maxSpan(i), rows - row);
    while (span > 1 && !fits(row, col, span, 4, tone)) span--;
    const fontSize = Math.min(22, rowH * span * .57);
    if (!cache.has(span)) cache.set(span, FACE_WORDS.map(text => measure(text, fontSize)));
    const wordWidths = cache.get(span)!;
    const targetCols = Math.ceil(span * (4 + random(hash) * 9));
    let availableCols = 1;
    while (availableCols < targetCols && fits(row, col, span, availableCols + 1, tone)) availableCols++;
    const padding = Math.min(rowH * span * .7, 26);
    const room = Math.min(availableCols * cellW, width - col * cellW);
    const candidates = wordWidths.map((wordWidth, index) => ({ index, width: wordWidth + padding }))
      .filter(word => word.width <= room - 2);
    const word = candidates[Math.floor(random(hash + 15) * candidates.length)];
    let columns = word ? Math.min(availableCols, Math.ceil((word.width + 2) / cellW)) : availableCols;
    if (availableCols - columns < 3) columns = availableCols;
    for (let yy = row; yy < row + span; yy++) for (let xx = col; xx < col + columns; xx++) occupied[yy * cols + xx] = 1;
    const gap = Math.max(1, rowH * .1);
    const w = Math.min(columns * cellW, width - col * cellW) - gap;
    const h = Math.min(span * rowH, height - row * rowH) - gap;
    if (w > 0 && h > 0) pills.push({ x: col * cellW + gap / 2, y: row * rowH + gap / 2,
      w, h, tone, text: word ? FACE_WORDS[word.index] : "", fontSize });
  }
  return pills;
}
export function drawFacePills(canvas: HTMLCanvasElement, mask: FaceMask, detail: number, backgroundScale: number, seed: number) {
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas is unavailable.");
  const { width, height } = canvas.getBoundingClientRect();
  if (!width || !height) return;
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio);
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.fillStyle = "#080a0d"; context.fillRect(0, 0, width, height);
  const pills = generateFacePills(mask, width, height, detail, backgroundScale, seed, (text, fontSize) => {
    context.font = `400 ${fontSize}px Arial, Helvetica, sans-serif`;
    return context.measureText(text).width;
  });
  context.textAlign = "center"; context.textBaseline = "middle";
  for (const { x, y, w, h, tone, text, fontSize } of pills) {
    context.beginPath(); context.roundRect(x, y, w, h, Math.min(h, w) / 2);
    if (tone === 1) { context.fillStyle = "#557bf2"; context.fill(); }
    else { context.strokeStyle = tone === 2 ? "#303a52" : "#282d35"; context.lineWidth = .85; context.stroke(); }
    if (text) {
      context.font = `400 ${fontSize}px Arial, Helvetica, sans-serif`;
      context.fillStyle = tone === 1 ? "#edf2ff" : tone === 2 ? "#64718f" : "#4b525e";
      context.fillText(text, x + w / 2, y + h / 2 + fontSize * .035);
    }
  }
}
