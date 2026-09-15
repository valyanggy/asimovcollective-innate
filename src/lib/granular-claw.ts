import * as THREE from 'three';
import type { Segment } from './hand-model';
import { projectToGrid } from './grid-projection';

export type Grain = { position: THREE.Vector3; color: THREE.Color; scale: number; fade: number; bleed: number };
function random(seed: number) {
  let n = seed | 0;
  n = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
  n = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}
// Smooth, spatially correlated noise creates patches and tendrils rather than uniform fuzz.
export function edgeNoise(x: number, y: number, z: number): number {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  const smooth = (v: number) => v * v * (3 - 2 * v);
  const fx = smooth(x - ix), fy = smooth(y - iy), fz = smooth(z - iz);
  const sample = (a: number, b: number, c: number) => random(Math.imul(a, 73856093) ^ Math.imul(b, 19349663) ^ Math.imul(c, 83492791));
  const mix = THREE.MathUtils.lerp;
  return mix(mix(mix(sample(ix,iy,iz), sample(ix+1,iy,iz), fx), mix(sample(ix,iy+1,iz), sample(ix+1,iy+1,iz), fx), fy),
    mix(mix(sample(ix,iy,iz+1), sample(ix+1,iy,iz+1), fx), mix(sample(ix,iy+1,iz+1), sample(ix+1,iy+1,iz+1), fx), fy), fz);
}
const inks = ['#dbe7d2', '#379dce', '#7765be', '#e5a1b6', '#e49b62'].map(c => new THREE.Color(c));

/** A stable volume cloud attached to each rigid segment, with density fading beyond its core. */
export function sampleGranularClaw(segments: Segment[], diffusion: number): Grain[] {
  const grains: Grain[] = [];
  segments.forEach((segment, index) => {
    const length = segment.a.distanceTo(segment.b);
    const axis = segment.b.clone().sub(segment.a).normalize();
    const u = new THREE.Vector3().crossVectors(axis, new THREE.Vector3(0, 0, 1));
    if (u.lengthSq() < .01) u.crossVectors(axis, new THREE.Vector3(0, 1, 0));
    u.normalize();
    const v = new THREE.Vector3().crossVectors(axis, u).normalize();
    const extent = segment.radius * (1.65 + diffusion * 2.5);
    const count = Math.ceil((length + segment.radius * 2) * 3400 - 1e-7);
    for (let i = 0; i < count; i++) {
      const seed = index * 100000 + i * 13 + 17;
      const along = random(seed) * (length + extent * 2) - extent;
      const r = Math.sqrt(random(seed + 1)) * extent;
      const angle = random(seed + 2) * Math.PI * 2;
      const end = Math.max(0, -along, along - length);
      const distance = Math.hypot(r, end);
      const px = Math.cos(angle) * r, py = Math.sin(angle) * r;
      const broad = edgeNoise(along * 3.2 + index * 17, px * 4, py * 4);
      const fine = edgeNoise(along * 10 + index * 17, px * 11, py * 11);
      const warp = 1 + diffusion * ((broad - .4) * 1.7 + (fine - .5) * .35);
      const normalized = distance / (segment.radius * (0.8 + diffusion * .55) * warp);
      // No hard capsule boundary: the volume gets progressively more porous toward the edge.
      if (random(seed + 3) > Math.exp(-normalized * normalized * 1.15) * .92) continue;
      const p = segment.a.clone().addScaledVector(axis, along)
        .addScaledVector(u, Math.cos(angle) * r).addScaledVector(v, Math.sin(angle) * r);
      const tone = THREE.MathUtils.clamp(normalized * 2 + (random(seed + 4) - .5) * .8, 0, 3.999);
      const band = Math.floor(tone);
      const bleed = THREE.MathUtils.smoothstep(normalized, .65, 2.1);
      grains.push({ position: p, fade: THREE.MathUtils.lerp(.9, .07, bleed), bleed, color: inks[band].clone().lerp(inks[band + 1], tone - band),
        scale: (.35 + random(seed + 5) * .65) * Math.max(.4, 1 - normalized * .22) });
    }
  });
  return grains;
}

export class GranularClaw {
  readonly group = new THREE.Group();
  private readonly mesh = new THREE.InstancedMesh(new THREE.CircleGeometry(1, 10),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: .85, depthWrite: false }), 30000);
  private grain = 115;
  private diffusion = .65;
  constructor() {
    const fade = new THREE.InstancedBufferAttribute(new Float32Array(30000), 1);
    fade.setUsage(THREE.DynamicDrawUsage);
    this.mesh.geometry.setAttribute('grainFade', fade);
    this.mesh.material.onBeforeCompile = shader => {
      shader.vertexShader = 'attribute float grainFade; varying float vGrainFade; varying vec2 vGrainUv;\n' + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvGrainFade = grainFade; vGrainUv = uv;');
      shader.fragmentShader = 'varying float vGrainFade; varying vec2 vGrainUv;\n' + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', `
        float radius = length(vGrainUv * 2.0 - 1.0);
        diffuseColor.a *= vGrainFade;
        #include <opaque_fragment>
      `);
    };
    this.mesh.material.customProgramCacheKey = () => 'granular-bleed-v1';
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.group.add(this.mesh);
  }
  setTreatment(grain: number, diffusion: number) {
    this.grain = THREE.MathUtils.clamp(grain, 35, 220);
    this.diffusion = THREE.MathUtils.clamp(diffusion, 0, 1);
  }
  update(segments: Segment[], camera: THREE.OrthographicCamera) {
    const spacing = THREE.MathUtils.lerp(.082, .025, (this.grain - 35) / 185);
    const cells = projectToGrid(sampleGranularClaw(segments, this.diffusion), camera, new Set(), { spacing });
    if (cells.length > this.mesh.instanceMatrix.count) throw new Error('Granular claw capacity exceeded.');
    const matrix = new THREE.Matrix4(), scale = new THREE.Vector3();
    this.mesh.count = cells.length;
    const fades = this.mesh.geometry.getAttribute('grainFade') as THREE.InstancedBufferAttribute;
    cells.forEach(({ item, position }, i) => {
      // The center retains the lattice; peripheral grains drift back toward their 3D sample.
      position.lerp(item.position, item.bleed * .65);
      const radius = spacing * (.38 + .25 * item.scale + item.bleed * .2);
      fades.setX(i, item.fade);
      scale.set(radius, radius, 1);
      matrix.compose(position, camera.quaternion, scale);
      this.mesh.setMatrixAt(i, matrix);
      this.mesh.setColorAt(i, item.color);
    });
    fades.needsUpdate = true;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}
