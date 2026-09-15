import {
  DynamicDrawUsage,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  OrthographicCamera,
  PlaneGeometry,
  Quaternion,
  ShaderMaterial,
  Vector3,
} from "three";
import { projectToGrid, type GridCell } from "./grid-projection";
import { FIELD, type Particle } from "./hand-model";

export const PRINT_GRID = { spacing: 0.46, minRadius: 0.42, maxRadius: 0.5, fieldFill: 0.8 } as const;

const CAPACITY = 2400;
const CORE_IN_QUAD = 0.7;
const STEPS = [{ x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }, { x: 0, y: -1 }] as const;
const Z_AXIS = new Vector3(0, 0, 1);
const scale = new Vector3();
const rotation = new Quaternion();
const tilt = new Quaternion();
const matrix = new Matrix4();
const viewAxis = new Vector3();

export type PrintCell = GridCell<Particle> & { span: number; keys: string[]; angle: number };

const vertexShader = /* glsl */`
attribute vec3 colorA;
attribute vec3 colorB;
attribute vec4 markStyle;
varying vec2 vUv;
varying vec3 vColorA;
varying vec3 vColorB;
varying vec4 vStyle;

void main() {
  vUv = uv;
  vColorA = colorA;
  vColorB = colorB;
  vStyle = markStyle;
  vec4 mvPosition = vec4(position, 1.0);
  #ifdef USE_INSTANCING
    mvPosition = instanceMatrix * mvPosition;
  #endif
  gl_Position = projectionMatrix * modelViewMatrix * mvPosition;
}
`;

const fragmentShader = /* glsl */`
varying vec2 vUv;
varying vec3 vColorA;
varying vec3 vColorB;
varying vec4 vStyle;

void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p);
  if (r > 1.0) discard;

  float softness = mix(0.05, 0.16, clamp(vStyle.x, 0.0, 1.0));
  float halo = clamp(vStyle.y, 0.0, 1.0);
  vec2 dir = vec2(cos(vStyle.z), sin(vStyle.z));
  float sharpness = mix(0.55, 1.25, clamp(vStyle.w, 0.0, 1.0));
  float linearT = smoothstep(-sharpness, sharpness, dot(p, dir));
  float localT = 1.0 - smoothstep(0.0, 1.15, length(p - dir * 0.45));
  float t = mix(linearT, localT, step(0.55, vStyle.w));
  vec3 albedo = mix(vColorA, vColorB, t);

  float core = ${CORE_IN_QUAD.toFixed(2)};
  float markA = 1.0 - smoothstep(core - softness, core, r);

  vec2 shadowP = p - vec2(0.1, -0.08);
  float shadowA = halo * 0.2 * (1.0 - smoothstep(core * 0.5, 1.0, length(shadowP)));
  vec3 shadowC = vec3(0.05, 0.055, 0.065);

  float bloomA = halo * 0.14 * (1.0 - smoothstep(core * 0.55, 1.0, r)) * (1.0 - markA);
  vec3 bloomC = mix(vColorA, vColorB, 0.5);

  vec4 color = vec4(shadowC * shadowA, shadowA);
  color = vec4(bloomC * bloomA, bloomA) + color * (1.0 - bloomA);
  color = vec4(albedo * markA, markA) + color * (1.0 - markA);
  if (color.a < 0.004) discard;
  vec4 straight = vec4(color.rgb / color.a, color.a);
  gl_FragColor = straight;
  #include <colorspace_fragment>
  gl_FragColor.rgb *= gl_FragColor.a;
}
`;

function cellKey(column: number, row: number): string {
  return `${column}:${row}`;
}

export function projectPrintMarks(items: Particle[], camera: OrthographicCamera): PrintCell[] {
  const candidates = projectToGrid(items, camera, new Set(), PRINT_GRID);
  const ranked = candidates.slice().sort((a, b) => {
    const span = (b.item.span ?? 1) - (a.item.span ?? 1);
    return span !== 0 ? span : b.depth - a.depth;
  });

  const occupied = new Set<string>();
  const placed: PrintCell[] = [];

  for (const cell of ranked) {
    if (occupied.has(cell.key)) continue;
    const [column, row] = cell.key.split(":").map(Number);
    const wanted = Math.max(1, Math.min(3, Math.round(cell.item.span ?? 1)));
    const prefs = preferredDirections(cell.item, camera);
    const tries = wanted === 3 ? [3, 2, 1] : wanted === 2 ? [2, 1] : [1];

    let span = 1;
    let keys = [cell.key];
    let angle = 0;
    let column0 = column, column1 = column, row0 = row, row1 = row;

    for (const size of tries) {
      if (size === 1) break;
      let found = false;
      for (const dir of prefs) {
        const step = STEPS[dir];
        const footprint = size === 2
          ? [{ c: column, r: row }, { c: column + step.x, r: row + step.y }]
          : [{ c: column - step.x, r: row - step.y }, { c: column, r: row }, { c: column + step.x, r: row + step.y }];
        if (footprint.some(({ c, r }) => occupied.has(cellKey(c, r)))) continue;
        span = size;
        keys = footprint.map(({ c, r }) => cellKey(c, r));
        angle = Math.atan2(step.y, step.x);
        column0 = Math.min(...footprint.map(p => p.c));
        column1 = Math.max(...footprint.map(p => p.c));
        row0 = Math.min(...footprint.map(p => p.r));
        row1 = Math.max(...footprint.map(p => p.r));
        found = true;
        break;
      }
      if (found) break;
    }

    keys.forEach(key => occupied.add(key));
    const local = cell.position.clone().applyMatrix4(camera.matrixWorldInverse);
    local.x = (column0 + column1) * 0.5 * PRINT_GRID.spacing;
    local.y = (row0 + row1) * 0.5 * PRINT_GRID.spacing;
    placed.push({
      item: cell.item,
      position: local.applyMatrix4(camera.matrixWorld),
      key: cell.key,
      depth: cell.depth,
      span,
      keys,
      angle,
    });
  }
  return placed;
}

function preferredDirections(item: Particle, camera: OrthographicCamera): number[] {
  if (!item.axis) return [0, 1, 2, 3];
  viewAxis.copy(item.axis).transformDirection(camera.matrixWorldInverse);
  const horizontal = Math.abs(viewAxis.x) >= Math.abs(viewAxis.y);
  const sign = horizontal ? (viewAxis.x < 0 ? -1 : 1) : (viewAxis.y < 0 ? -1 : 1);
  const primary = horizontal ? (sign > 0 ? 0 : 2) : (sign > 0 ? 1 : 3);
  return [primary, (primary + 2) % 4, (primary + 1) % 4, (primary + 3) % 4];
}

export function createPrintMarks(): InstancedMesh {
  const geometry = new PlaneGeometry(1, 1);
  geometry.setAttribute("colorA", new InstancedBufferAttribute(new Float32Array(CAPACITY * 3), 3).setUsage(DynamicDrawUsage));
  geometry.setAttribute("colorB", new InstancedBufferAttribute(new Float32Array(CAPACITY * 3), 3).setUsage(DynamicDrawUsage));
  geometry.setAttribute("markStyle", new InstancedBufferAttribute(new Float32Array(CAPACITY * 4), 4).setUsage(DynamicDrawUsage));
  const material = new ShaderMaterial({
    vertexShader,
    fragmentShader,
    transparent: true,
    premultipliedAlpha: true,
    depthWrite: false,
    toneMapped: false,
  });
  const mesh = new InstancedMesh(geometry, material, CAPACITY);
  mesh.frustumCulled = false;
  mesh.instanceMatrix.setUsage(DynamicDrawUsage);
  return mesh;
}

export function writePrintMarks(mesh: InstancedMesh, cells: PrintCell[], camera: OrthographicCamera): void {
  if (cells.length > mesh.instanceMatrix.count) throw new Error("Increase particle capacity for the edited claw model.");
  const ordered = cells.slice().sort((a, b) => a.depth - b.depth);
  const colorA = mesh.geometry.getAttribute("colorA") as InstancedBufferAttribute;
  const colorB = mesh.geometry.getAttribute("colorB") as InstancedBufferAttribute;
  const style = mesh.geometry.getAttribute("markStyle") as InstancedBufferAttribute;
  const range = FIELD.particleMaxScale - FIELD.particleMinScale;

  ordered.forEach((cell, i) => {
    const variation = Math.max(0, Math.min(1, (cell.item.scale - FIELD.particleMinScale) / range));
    const along = PRINT_GRID.spacing * cell.span * 0.44;
    const across = PRINT_GRID.spacing * (cell.span === 1
      ? PRINT_GRID.minRadius + (PRINT_GRID.maxRadius - PRINT_GRID.minRadius) * variation
      : 0.47);
    const aspect = Math.min(cell.item.aspect ?? 1, 0.48 / 0.44);
    scale.set(along * aspect / (0.5 * CORE_IN_QUAD), across / (0.5 * CORE_IN_QUAD), 1);
    tilt.setFromAxisAngle(Z_AXIS, cell.angle);
    rotation.copy(camera.quaternion).multiply(tilt);
    matrix.compose(cell.position, rotation, scale);
    mesh.setMatrixAt(i, matrix);

    colorA.setXYZ(i, cell.item.color.r, cell.item.color.g, cell.item.color.b);
    const second = cell.item.colorB ?? cell.item.color;
    colorB.setXYZ(i, second.r, second.g, second.b);
    style.setXYZW(i, cell.item.softness ?? 0.4, cell.item.halo ?? 0.7, cell.item.gradientAngle ?? 0, cell.item.gradientKind ?? 0.5);
  });

  mesh.count = ordered.length;
  mesh.instanceMatrix.needsUpdate = true;
  colorA.needsUpdate = true;
  colorB.needsUpdate = true;
  style.needsUpdate = true;
}
