import * as THREE from 'three';
import type { Segment } from './hand-model';

const CAPACITY = 192;
export type ThermalSphere = { center: THREE.Vector3; radius: number };
const random = (n: number) => { const v = Math.sin(n * 127.1 + 311.7) * 43758.5453; return v - Math.floor(v); };

/** Sample the articulated 3D capsules; detached beads keep the same seed through a grasp. */
export function thermalSpheres(segments: Segment[]): ThermalSphere[] {
  const spheres: ThermalSphere[] = [];
  segments.forEach((segment, s) => {
    const axis = segment.b.clone().sub(segment.a).normalize();
    const side = new THREE.Vector3().crossVectors(axis, new THREE.Vector3(0, 0, 1)).normalize();
    if (side.lengthSq() < .01) side.set(1, 0, 0);
    const steps = Math.max(1, Math.ceil(segment.a.distanceTo(segment.b) / .29));
    for (let i = 0; i <= steps; i++) {
      const seed = s * 91 + i * 7;
      const center = segment.a.clone().lerp(segment.b, i / steps);
      const radius = segment.radius * (.87 + random(seed) * .32);
      center.addScaledVector(side, (random(seed + 1) - .5) * .09);
      spheres.push({ center, radius });
      if (i % 2 === 0) for (const sign of [-1, 1]) {
        const satellite = center.clone().addScaledVector(side, sign * (radius + .09 + random(seed + 2) * .12));
        satellite.addScaledVector(axis, (random(seed + 3) - .5) * .22);
        satellite.z += (random(seed + 4) - .5) * .18;
        spheres.push({ center: satellite, radius: .025 + random(seed + (sign > 0 ? 5 : 6)) * .055 });
      }
    }
  });
  if (spheres.length > CAPACITY) throw new Error('Thermal claw exceeds sphere capacity.');
  return spheres;
}

export class ThermalClaw {
  readonly group = new THREE.Group();
  private readonly material: THREE.ShaderMaterial;
  private readonly mesh: THREE.Mesh;
  constructor() {
    this.material = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, toneMapped: false,
      uniforms: {
        balls: { value: Array.from({ length: CAPACITY }, () => new THREE.Vector4()) },
        count: { value: 0 }, bounds: { value: new THREE.Vector4() },
        projectionZ: { value: new THREE.Vector2() },
        cream: { value: new THREE.Color('#e4eed0') }, blue: { value: new THREE.Color('#247bb5') },
        pink: { value: new THREE.Color('#ef9bc4') }, orange: { value: new THREE.Color('#ef8522') },
      },
      vertexShader: `varying vec2 vUv;
        void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `
        varying vec2 vUv;
        uniform vec4 balls[${CAPACITY}];
        uniform int count;
        uniform vec4 bounds;
        uniform vec2 projectionZ;
        uniform vec3 cream, blue, pink, orange;
        float smin(float a, float b, float k) {
          float h = max(k - abs(a - b), 0.0) / k;
          return min(a, b) - h * h * k * .25;
        }
        void main() {
          vec2 p = mix(bounds.xy, bounds.zw, vUv);
          float d = 100.0, nearest = 100.0, z = -20.0;
          for (int i = 0; i < ${CAPACITY}; i++) {
            if (i >= count) break;
            vec4 b = balls[i];
            float radial = length(p - b.xy);
            float sd = radial - b.w;
            d = smin(d, sd, .075);
            if (sd < nearest) {
              nearest = sd;
              z = b.z + sqrt(max(0.0, b.w*b.w - radial*radial));
            }
          }
          float aa = max(fwidth(d), .0015);
          float alpha = 1.0 - smoothstep(.045, .074 + aa, d);
          if (alpha < .005) discard;
          // Contours follow the merged silhouette, never individual overlapping discs.
          vec3 c = cream;
          c = mix(c, blue, smoothstep(-.18, -.075, d));
          c = mix(c, pink, smoothstep(-.06, -.012, d));
          c = mix(c, orange, smoothstep(.008, .04, d));
          float grain = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898,78.233))) * 43758.5453) - .5;
          c += grain * .065;
          gl_FragColor = vec4(max(c, vec3(0.0)), alpha);
          gl_FragDepth = clamp((projectionZ.x * z + projectionZ.y) * .5 + .5, 0.0, 1.0);
          #include <colorspace_fragment>
        }`,
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 10;
    this.group.add(this.mesh);
  }
  update(segments: Segment[], camera: THREE.OrthographicCamera) {
    const spheres = thermalSpheres(segments);
    const values = this.material.uniforms.balls.value as THREE.Vector4[];
    let left = Infinity, right = -Infinity, bottom = Infinity, top = -Infinity;
    spheres.forEach(({ center, radius }, i) => {
      const p = center.clone().applyMatrix4(camera.matrixWorldInverse);
      values[i].set(p.x, p.y, p.z, radius);
      const pad = radius + .16;
      left = Math.min(left, p.x - pad); right = Math.max(right, p.x + pad);
      bottom = Math.min(bottom, p.y - pad); top = Math.max(top, p.y + pad);
    });
    this.material.uniforms.count.value = spheres.length;
    this.material.uniforms.bounds.value.set(left, bottom, right, top);
    this.material.uniforms.projectionZ.value.set(camera.projectionMatrix.elements[10], camera.projectionMatrix.elements[14]);
    this.mesh.position.set((left + right) / 2, (bottom + top) / 2, -8).applyMatrix4(camera.matrixWorld);
    this.mesh.quaternion.copy(camera.quaternion);
    this.mesh.scale.set(right - left, top - bottom, 1);
  }
}
