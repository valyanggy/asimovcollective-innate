import * as THREE from 'three';
import type { Segment } from './hand-model';

export const DITHER_DEFAULTS = { grain: 115, noise: .65 };
const Y = new THREE.Vector3(0, 1, 0);

const noiseShader = /* glsl */`
  varying vec3 vInkPosition;
  uniform float inkGrain;
  uniform float inkNoise;
  uniform vec3 inkDark, inkOrange, inkPink, inkBlue, inkLight;
  float inkHash(vec3 p) {
    p = fract(p * .1031);
    p += dot(p, p.yzx + 33.33);
    return fract((p.x + p.y) * p.z);
  }
  float inkField(vec3 p) {
    vec3 i = floor(p), f = fract(p);
    f = f*f*(3.0-2.0*f);
    return mix(mix(mix(inkHash(i), inkHash(i+vec3(1,0,0)), f.x),
                   mix(inkHash(i+vec3(0,1,0)), inkHash(i+vec3(1,1,0)), f.x), f.y),
               mix(mix(inkHash(i+vec3(0,0,1)), inkHash(i+vec3(1,0,1)), f.x),
                   mix(inkHash(i+vec3(0,1,1)), inkHash(i+vec3(1,1,1)), f.x), f.y), f.z);
  }
`;

/** Quantize the lit solid surface, with stochastic thresholds in the mesh's rest coordinates. */
export class DitherClaw {
  readonly group = new THREE.Group();
  private readonly meshes: THREE.Mesh<THREE.CapsuleGeometry, THREE.MeshStandardMaterial>[] = [];
  private readonly material: THREE.MeshStandardMaterial;
  private readonly uniforms = {
    inkGrain: { value: DITHER_DEFAULTS.grain }, inkNoise: { value: DITHER_DEFAULTS.noise },
    inkDark: { value: new THREE.Color('#29334d') }, inkOrange: { value: new THREE.Color('#e88739') },
    inkPink: { value: new THREE.Color('#e7a2bf') }, inkBlue: { value: new THREE.Color('#3586ac') },
    inkLight: { value: new THREE.Color('#e5edce') },
  };
  constructor() {
    this.material = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: .88, metalness: 0, toneMapped: false });
    this.material.onBeforeCompile = shader => {
      Object.assign(shader.uniforms, this.uniforms);
      shader.vertexShader = 'varying vec3 vInkPosition;\n' + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvInkPosition = position;');
      shader.fragmentShader = noiseShader + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', /* glsl */`
        float luminance = dot(outgoingLight, vec3(.2126, .7152, .0722));
        float broad = inkField(vInkPosition * 8.0) * .65 + inkField(vInkPosition * 23.0) * .35;
        float tone = clamp(luminance / (luminance + .36) + (broad - .5) * inkNoise * .34, 0.0, 1.0);
        float band = clamp(tone * 4.0, 0.0, 3.9999);
        float threshold = inkHash(floor(vInkPosition * inkGrain));
        // A footprint limit prevents extremely fine noise from turning into unstable aliasing.
        float footprint = max(length(dFdx(vInkPosition)), length(dFdy(vInkPosition))) * inkGrain;
        float coverage = fract(band);
        float pick = mix(step(threshold, coverage), coverage, smoothstep(.65, 1.5, footprint));
        vec3 lowInk = inkDark, highInk = inkOrange;
        if (band >= 1.0) { lowInk = inkOrange; highInk = inkPink; }
        if (band >= 2.0) { lowInk = inkPink; highInk = inkBlue; }
        if (band >= 3.0) { lowInk = inkBlue; highInk = inkLight; }
        outgoingLight = mix(lowInk, highInk, pick);
        #include <opaque_fragment>
      `);
    };
    this.material.customProgramCacheKey = () => 'surface-dither-v1';
    const fill = new THREE.HemisphereLight('#dae4ff', '#453748', .7);
    const key = new THREE.DirectionalLight('#fff5df', 2.5);
    key.position.set(-3, 5, 5);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    Object.assign(key.shadow.camera, { left: -5, right: 5, top: 5, bottom: -5, near: .1, far: 25 });
    key.shadow.bias = -.0004;
    key.shadow.normalBias = .015;
    const rim = new THREE.DirectionalLight('#a2c9ff', .7);
    rim.position.set(2, -2, -4);
    this.group.add(fill, key, key.target, rim);
  }
  setTreatment(grain: number, noise: number) {
    this.uniforms.inkGrain.value = THREE.MathUtils.clamp(grain, 35, 220);
    this.uniforms.inkNoise.value = THREE.MathUtils.clamp(noise, 0, 1);
  }
  update(segments: Segment[]) {
    segments.forEach((segment, i) => {
      const length = segment.a.distanceTo(segment.b);
      let mesh = this.meshes[i];
      if (!mesh) {
        mesh = new THREE.Mesh(new THREE.CapsuleGeometry(segment.radius, length, 12, 28), this.material);
        mesh.castShadow = true; mesh.receiveShadow = true;
        mesh.userData.radius = segment.radius; mesh.userData.length = length;
        this.meshes.push(mesh); this.group.add(mesh);
      } else if (Math.abs(mesh.userData.length - length) > .00001 || mesh.userData.radius !== segment.radius) {
        mesh.geometry.dispose();
        mesh.geometry = new THREE.CapsuleGeometry(segment.radius, length, 12, 28);
        mesh.userData.radius = segment.radius; mesh.userData.length = length;
      }
      mesh.visible = true;
      mesh.position.copy(segment.a).lerp(segment.b, .5);
      mesh.quaternion.setFromUnitVectors(Y, segment.b.clone().sub(segment.a).normalize());
    });
    this.meshes.slice(segments.length).forEach(mesh => { mesh.visible = false; });
  }
}
