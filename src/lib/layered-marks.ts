import * as THREE from "three";
import type { Particle } from "./hand-model";
import { projectToGrid } from "./grid-projection";

export type LayerSettings = { grid: number; spread: number; opacity: number };
export const DEFAULT_LAYERS: LayerSettings = { grid: 0.42, spread: 0.28, opacity: 0.55 };

function roundedTile() {
  const s = new THREE.Shape(), r = 0.12;
  s.moveTo(-.5 + r, -.5); s.lineTo(.5 - r, -.5);
  s.quadraticCurveTo(.5, -.5, .5, -.5 + r); s.lineTo(.5, .5 - r);
  s.quadraticCurveTo(.5, .5, .5 - r, .5); s.lineTo(-.5 + r, .5);
  s.quadraticCurveTo(-.5, .5, -.5, .5 - r); s.lineTo(-.5, -.5 + r);
  s.quadraticCurveTo(-.5, -.5, -.5 + r, -.5);
  return new THREE.ShapeGeometry(s, 5);
}

/** Three real depth slices, projected onto the same lattice with adjustable registration offsets. */
export class LayeredMarks {
  readonly group = new THREE.Group();
  private readonly layers: THREE.InstancedMesh[];
  constructor() {
    const geometry = roundedTile();
    this.layers = [0, 1, 2].map(layer => {
      const mesh = new THREE.InstancedMesh(geometry, new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false }), 2400);
      mesh.count = 0;
      mesh.frustumCulled = false;
      mesh.renderOrder = 10 + layer;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.group.add(mesh);
      return mesh;
    });
  }
  update(particles: Particle[], camera: THREE.OrthographicCamera, settings: LayerSettings) {
    const depths = particles.map(item => item.position.clone().applyMatrix4(camera.matrixWorldInverse).z);
    const lo = Math.min(...depths), range = Math.max(0.001, Math.max(...depths) - lo);
    const slices: Particle[][] = [[], [], []];
    particles.forEach((item, i) => slices[Math.min(2, Math.floor((depths[i] - lo) / range * 3))].push(item));
    const occupied = new Set<string>();
    const matrix = new THREE.Matrix4(), scale = new THREE.Vector3();
    slices.forEach((slice, layer) => {
      const cells = projectToGrid(slice, camera, new Set(), { spacing: settings.grid });
      const mesh = this.layers[layer];
      (mesh.material as THREE.MeshBasicMaterial).opacity = layer === 2 ? .92 : settings.opacity * (layer === 0 ? .55 : .85);
      mesh.count = cells.length;
      cells.forEach(({ item, key, position }, i) => {
        occupied.add(key);
        const local = position.clone().applyMatrix4(camera.matrixWorldInverse);
        const offset = (layer - 1) * settings.spread * settings.grid;
        local.x += offset; local.y -= offset * .65;
        position.copy(local.applyMatrix4(camera.matrixWorld));
        const variation = THREE.MathUtils.clamp((item.scale - .6) / 1.15, 0, 1);
        const width = settings.grid * (.68 + variation * .2);
        const height = settings.grid * (layer === 1 ? .42 + variation * .25 : .64 + variation * .22);
        scale.set(width, height, 1);
        matrix.compose(position, camera.quaternion, scale);
        mesh.setMatrixAt(i, matrix);
        const color = item.color.clone();
        if (layer === 0) color.lerp(new THREE.Color('#b6b1fa'), .35);
        if (layer === 1) color.lerp(new THREE.Color('#0edac2'), .25);
        mesh.setColorAt(i, color);
      });
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    });
    return occupied;
  }
}
