import { Color, Quaternion, Vector3 } from "three";

export type CameraView = "front" | "angle";
export type Palette = {
  background: Color;
  foreground: Color;
  blue: Color;
  purple: Color;
  teal: Color;
  orange: Color;
};
export type Segment = { a: Vector3; b: Vector3; radius: number; color: Color };
export type ParticleStyle = "flat" | "print";
export type Particle = {
  position: Vector3;
  color: Color;
  scale: number;
  colorB?: Color;
  aspect?: number;
  axis?: Vector3;
  softness?: number;
  halo?: number;
  gradientKind?: number;
  gradientAngle?: number;
  span?: number;
};
export type SurfaceSample = { position: Vector3; rotation: Quaternion };

/** World units. The cube is centered at the origin and has side length 2. */
export const FIELD = {
  objectHalfSize: 1,
  jawRadius: 0.22,
  particleRadius: 0.10,
  particleSpacing: 0.19,
  particleMinScale: 0.6,
  particleMaxScale: 1.75,
  voxelSize: 0.205,
  voxelSpacing: 0.235,
  proximityRange: 0.43,
  contactTolerance: 0.013,
  surfaceSpacing: 0.115,
  surfacePatchSize: 0.107,
} as const;

const point = (x: number, y: number, z: number) => new Vector3(x, y, z);
/** Two rigid hooked jaws pivot symmetrically about a stationary wrist. */
export function createHandSegments(closure: number, palette: Palette): Segment[] {
  const c = Math.max(0, Math.min(1, closure));
  const opening = (1 - c) * Math.PI * 0.22;
  const segments: Segment[] = [];

  for (const side of [1, -1]) {
    const pivot = point(-1.95, side * 0.55, 0);
    const angle = side * opening;
    const rotateJaw = (p: Vector3) => {
      const x = p.x - pivot.x, y = p.y - pivot.y;
      return point(pivot.x + x * Math.cos(angle) - y * Math.sin(angle),
        pivot.y + x * Math.sin(angle) + y * Math.cos(angle), p.z);
    };
    const profile = [pivot, point(-1.60, side * 1.22, 0),
      point(-0.60, side * 1.22, 0), point(0.55, side * 1.22, 0)];
    for (let i = 0; i < profile.length - 1; i++) {
      segments.push({ a: rotateJaw(profile[i]), b: rotateJaw(profile[i + 1]),
        radius: FIELD.jawRadius, color: palette.blue.clone().lerp(palette.purple, i / 2) });
    }
  }

  // Fixed crossbar, wrist, and the two hinge barrels connect the jaws into one claw.
  segments.push({ a: point(-1.95, -0.55, 0), b: point(-1.95, 0.55, 0), radius: 0.24, color: palette.teal });
  segments.push({ a: point(-2.90, 0, 0), b: point(-1.95, 0, 0), radius: 0.28, color: palette.teal });
  for (const side of [1, -1]) {
    segments.push({ a: point(-1.95, side * 0.55, -0.18), b: point(-1.95, side * 0.55, 0.18),
      radius: 0.24, color: palette.blue });
  }
  return segments;
}

// Deterministic per-particle variation: pose and camera changes never reshuffle colors or sizes.
function particleRandom(seed: number): number {
  let value = (seed + 0x6d2b79f5) | 0;
  value = Math.imul(value ^ (value >>> 15), value | 1);
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
  return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
}

export function sampleHandParticles(segments: Segment[], palette: Palette, style: ParticleStyle = "flat"): Particle[] {
  const particles: Particle[] = [];
  const shades = [palette.teal, palette.blue, palette.purple];
  for (const [segmentIndex, { a, b, radius }] of segments.entries()) {
    const direction = b.clone().sub(a).normalize();
    let u = new Vector3().crossVectors(direction, point(0, 0, 1));
    if (u.length() < 0.01) u = new Vector3().crossVectors(direction, point(0, 1, 0));
    u.normalize();
    const w = new Vector3().crossVectors(direction, u).normalize();
    const steps = Math.max(1, Math.ceil(a.distanceTo(b) / FIELD.particleSpacing - 1e-8));
    for (let i = 0; i <= steps; i++) {
      const center = a.clone().lerp(b, i / steps);
      for (let j = 0; j < 6; j++) {
        const seed = segmentIndex * 10000 + i * 100 + j;
        const scale = FIELD.particleMinScale + particleRandom(seed + 3571) * (FIELD.particleMaxScale - FIELD.particleMinScale);
        const angle = j * Math.PI * 2 / 6 + (i % 2) * 0.35 + (particleRandom(seed + 4591) - 0.5) * 0.4;
        // Keep larger particles within the claw's physical contact envelope.
        const offset = Math.max(0, radius - FIELD.particleRadius * scale);
        const position = center.clone()
          .addScaledVector(u, Math.cos(angle) * offset)
          .addScaledVector(w, Math.sin(angle) * offset);
        const shade = Math.floor(particleRandom(seed) * shades.length);
        const color = shades[shade].clone().lerp(shades[(shade + 1) % shades.length], particleRandom(seed + 731) * 0.5);
        color.multiplyScalar(0.82 + particleRandom(seed + 1931) * 0.18);
        if (style === "print") particles.push(printMark(position, scale, direction, u, seed, palette));
        else particles.push({ position, color, scale });
      }
    }
  }
  return particles;
}

function printInks(palette: Palette): Color[] {
  const ink = (hex: string) => new Color(hex);
  const dark = palette.background.r * 0.2126 + palette.background.g * 0.7152 + palette.background.b * 0.0722 < 0.2;
  return [
    dark ? ink("#f3efe6") : ink("#14161c"),
    ink("#e23b2b"),
    ink("#ff4d8d"),
    ink("#ffd166"),
    ink("#2ee59a"),
    ink("#3d8bff"),
    ink("#7a4dff"),
    dark ? ink("#8b919b") : ink("#c8ccd4"),
    palette.background.clone(),
  ];
}

function printMark(position: Vector3, scale: number, direction: Vector3, u: Vector3, seed: number, palette: Palette): Particle {
  const inks = printInks(palette);
  const a = Math.floor(particleRandom(seed) * inks.length);
  const b = (a + 1 + Math.floor(particleRandom(seed + 731) * (inks.length - 1))) % inks.length;
  const color = inks[a].clone();
  const colorB = inks[b].clone();
  if (particleRandom(seed + 2201) < 0.2) color.lerp(palette.background, 0.3);
  if (particleRandom(seed + 2299) < 0.2) colorB.lerp(palette.background, 0.38);

  const roll = particleRandom(seed + 7801);
  const span = roll > 0.91 ? 3 : roll > 0.72 ? 2 : 1;
  const aspect = span === 1 && particleRandom(seed + 3401) > 0.6 ? 1.1 + particleRandom(seed + 3511) * 0.2 : 1;
  const axis = direction.clone();
  if (particleRandom(seed + 4109) > 0.45) axis.applyAxisAngle(u, (particleRandom(seed + 4201) - 0.5) * Math.PI);

  return {
    position, color, scale, colorB, aspect, axis, span,
    softness: 0.18 + particleRandom(seed + 5103) * 0.62,
    halo: 0.4 + particleRandom(seed + 5203) * 0.55,
    gradientKind: 0.2 + particleRandom(seed + 6101) * 0.8,
    gradientAngle: particleRandom(seed + 6203) > 0.3 ? 0 : Math.PI / 2,
  };
}

/** Signed distance to the union of 3D hand capsules; negative means inside. */
export function distanceToHand(p: Vector3, segments: Segment[]): number {
  let nearest = Infinity;
  for (const { a, b, radius } of segments) {
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
    const lengthSquared = dx * dx + dy * dy + dz * dz;
    const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1,
      ((p.x - a.x) * dx + (p.y - a.y) * dy + (p.z - a.z) * dz) / lengthSquared));
    nearest = Math.min(nearest, Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy, p.z - a.z - t * dz) - radius);
  }
  return nearest;
}

export function createFieldPositions(): Vector3[] {
  const positions: Vector3[] = [];
  for (let x = -6; x <= 6; x++) for (let y = -6; y <= 6; y++) for (let z = -6; z <= 6; z++) {
    const p = point(x * FIELD.voxelSpacing, y * FIELD.voxelSpacing, z * FIELD.voxelSpacing);
    const extent = Math.max(Math.abs(p.x), Math.abs(p.y), Math.abs(p.z));
    if (extent > FIELD.objectHalfSize && extent < 1.43) positions.push(p);
  }
  return positions;
}

export function createSurfaceSamples(): SurfaceSample[] {
  const samples: SurfaceSample[] = [];
  for (let axis = 0; axis < 3; axis++) for (const sign of [-1, 1]) {
    for (let i = -8; i <= 8; i++) for (let j = -8; j <= 8; j++) {
      const position = point(0, 0, 0), normal = point(0, 0, 0);
      position.setComponent(axis, sign * (FIELD.objectHalfSize + 0.003));
      normal.setComponent(axis, sign);
      position.setComponent((axis + 1) % 3, i * FIELD.surfaceSpacing);
      position.setComponent((axis + 2) % 3, j * FIELD.surfaceSpacing);
      samples.push({ position, rotation: new Quaternion().setFromUnitVectors(point(0, 0, 1), normal) });
    }
  }
  return samples;
}
