import * as THREE from "three";
import { CameraView, Palette, Particle, Segment, FIELD, createHandSegments, sampleHandParticles, createFieldPositions, createSurfaceSamples, distanceToHand } from "./hand-model";

import { createObjectModel, type ObjectModel } from "./objects";
import type { ObjectId } from "./object-catalog";

import { DISPLAY_GRID, projectToGrid } from "./grid-projection";
import { DEFAULT_LAYERS } from "./layered-marks";
import { createKnightDepth } from "./knight-depth";
import { DepthBackdrop } from "./depth-space";
import { createKnightPixels } from "./knight-pixels";
import { MergingClaw } from "./merging-claw";
import { createRearGrasp } from "./rear-grasp";
import { ProximityFringe } from "./proximity-fringe";


export type SceneOptions = {
  curl: number;
  view: CameraView;
  objectId?: ObjectId;
  layered?: boolean;
  rearGrasp?: boolean;
  onContactChange: (hasContact: boolean) => void;
  onError: (message: string) => void;
};

/** Owns WebGL resources. React owns the controls; the model owns the geometry. */
export class ColorFieldScene {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera(-4, 4, 3, -3, 0.1, 30);
  private readonly target = new THREE.Vector3(-0.55, 0.04, 0);
  private objectModel: ObjectModel | null = null;
  private objectId: ObjectId;
  private readonly dots: THREE.InstancedMesh;
  private readonly layered: MergingClaw | null;
  private segments: Segment[] = [];
  private granularity = 115;
  private readonly depthBackdrop: DepthBackdrop | null;
  private readonly proximityFringe: ProximityFringe | null;
  private layerSettings = { ...DEFAULT_LAYERS };
  private readonly fields: THREE.InstancedMesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>[];
  private readonly patches: THREE.InstancedMesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private readonly contactPoints: THREE.InstancedMesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
  private fieldPositions = createFieldPositions();
  private surfaceSamples = createSurfaceSamples();
  private readonly resizeObserver: ResizeObserver;
  private readonly themeQuery = window.matchMedia("(prefers-color-scheme: dark)");
  private readonly matrix = new THREE.Matrix4();
  private readonly identityRotation = new THREE.Quaternion();
  private readonly unitScale = new THREE.Vector3(1, 1, 1);
  private readonly particleScale = new THREE.Vector3(1, 1, 1);
  private palette!: Palette;
  private particles: Particle[] = [];
  private activeField: { position: THREE.Vector3; band: number }[] = [];
  private curl: number;
  private view: CameraView;
  private disposed = false;
  private hasContact: boolean | null = null;

  constructor(private readonly container: HTMLElement, private readonly options: SceneOptions) {
    this.curl = options.curl;
    this.depthBackdrop=options.rearGrasp?new DepthBackdrop():null;
    if(this.depthBackdrop)this.scene.add(this.depthBackdrop.mesh);
    if(options.rearGrasp) this.target.set(0,0,0);
    this.view = options.view;
    this.objectId = options.objectId ?? "cube";
    this.layered = options.layered ? new MergingClaw() : null;
    this.proximityFringe = options.layered ? new ProximityFringe(!!options.rearGrasp) : null;
    if (this.proximityFringe) this.scene.add(this.proximityFringe.group);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0xffffff, this.layered ? 1 : 0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = false;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.setAttribute("aria-hidden", "true");
    container.appendChild(this.renderer.domElement);
    this.renderer.domElement.addEventListener("webglcontextlost", this.onContextLost);

    this.dots = new THREE.InstancedMesh(new THREE.CircleGeometry(FIELD.particleRadius, 24), new THREE.MeshBasicMaterial(), 2400);
    this.dots.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.dots.frustumCulled = false;
    this.dots.visible = !this.layered;
    this.scene.add(this.dots);
    if (this.layered) this.scene.add(this.layered.group);
    const grid = this.layered ? { spacing: DEFAULT_LAYERS.grid, fieldFill: .78 } : DISPLAY_GRID;
    const voxelGeometry = new THREE.PlaneGeometry(grid.spacing * grid.fieldFill, grid.spacing * grid.fieldFill);
    this.fields = [0.035, 0.08, 0.15].map((opacity) => {
      const mesh = new THREE.InstancedMesh(voxelGeometry, new THREE.MeshBasicMaterial({ transparent: true, opacity, depthWrite: false }), 8192);
      mesh.frustumCulled = false;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.scene.add(mesh);
      return mesh;
    });
    this.patches = new THREE.InstancedMesh(new THREE.PlaneGeometry(FIELD.surfacePatchSize, FIELD.surfacePatchSize), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }), 32768);
    this.patches.frustumCulled = false;
    this.patches.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.scene.add(this.patches);
    // Surface markers remain visible when the front camera sees a contact face edge-on.
    this.contactPoints = new THREE.InstancedMesh(new THREE.SphereGeometry(0.035, 8, 6), new THREE.MeshBasicMaterial(), 32768);
    this.contactPoints.frustumCulled = false;
    this.contactPoints.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.scene.add(this.contactPoints);

    this.updateCamera();
    this.updateTheme();
    this.resizeObserver = new ResizeObserver(this.resize);
    this.resizeObserver.observe(container);
    this.themeQuery.addEventListener("change", this.updateTheme);
    this.resize();
  }

  private readColor(token: string): THREE.Color {
    const probe = document.createElement("span");
    probe.style.color = `var(${token})`;
    this.container.appendChild(probe);
    // Canvas resolves modern CSS colors into sRGB for Three.js.
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1;
    const context = canvas.getContext("2d", { willReadFrequently: true })!;
    context.fillStyle = getComputedStyle(probe).color;
    context.fillRect(0, 0, 1, 1);
    const data = context.getImageData(0, 0, 1, 1).data;
    probe.remove();
    return new THREE.Color(data[0] / 255, data[1] / 255, data[2] / 255).convertSRGBToLinear();
  }

  private updateTheme = () => {
    if (this.disposed) return;
    this.palette = {
      background: this.readColor("--background"), foreground: this.readColor("--foreground"),
      blue: this.readColor("--hand-blue"), purple: this.readColor("--hand-purple"),
      teal: this.readColor("--hand-teal"), orange: this.readColor("--contact"),
    };
    this.replaceObject();
    this.fields.forEach((field) => field.material.color.copy(this.palette.orange));
    this.patches.material.color.copy(this.palette.orange);
    this.contactPoints.material.color.copy(this.palette.orange);
    this.rebuild();
  };

  private replaceObject() {
    if (this.objectModel) {
      this.scene.remove(this.objectModel.group);
      this.objectModel.dispose();
    }
    this.objectModel = this.options.rearGrasp ? createKnightDepth() : this.layered ? createKnightPixels() : createObjectModel(this.objectId, this.palette);
    this.objectModel.setGranularity?.(this.granularity);
    this.fieldPositions = this.objectModel.field;
    this.surfaceSamples = this.objectModel.surface;
    if (this.fieldPositions.length > 8192 || this.surfaceSamples.length > 32768) throw new Error("Object exceeds display sample capacity.");
    this.objectModel.group.traverse(object => {
      if (object instanceof THREE.Mesh) object.castShadow = !!this.layered;
    });
    this.scene.add(this.objectModel.group);
  }

  setObject(objectId: ObjectId) {
    if (objectId === this.objectId) return;
    this.objectId = objectId;
    this.replaceObject();
    this.rebuild();
  }

  private rebuild() {
    if (this.disposed) return;
    const segments = this.options.rearGrasp ? createRearGrasp(this.curl,this.palette) : createHandSegments(this.curl, this.palette);
    this.segments = segments;
    this.objectModel?.updateProximity?.(segments);
    this.particles = sampleHandParticles(segments, this.palette);
    this.activeField = [];
    for (const position of this.fieldPositions) {
      const distance = distanceToHand(position, segments);
      if (distance > FIELD.proximityRange) continue;
      this.activeField.push({ position, band: distance < 0.09 ? 2 : distance < 0.23 ? 1 : 0 });
    }
    this.updateGrid();

    let contactCount = 0;
    for (const { position, rotation } of this.surfaceSamples) {
      if (distanceToHand(position, segments) > FIELD.contactTolerance) continue;
      this.matrix.compose(position, rotation, this.unitScale);
      this.patches.setMatrixAt(contactCount, this.matrix);
      this.contactPoints.setMatrixAt(contactCount++, this.matrix);
    }
    this.patches.count = contactCount;
    this.patches.instanceMatrix.needsUpdate = true;
    this.contactPoints.count = contactCount;
    this.contactPoints.instanceMatrix.needsUpdate = true;
    const hasContact = contactCount > 0;
    if (hasContact !== this.hasContact) {
      this.hasContact = hasContact;
      this.options.onContactChange(hasContact);
    }
    this.render();
  }

  private updateGrid() {
    this.depthBackdrop?.update(this.camera);
    this.objectModel?.updateView?.(this.camera);
    this.proximityFringe?.update(this.surfaceSamples,this.segments,this.camera);
    if (this.layered) {
      this.layered.update(this.segments, this.camera);
      const occupied = new Set(projectToGrid(this.particles, this.camera, new Set(), { spacing: this.layerSettings.grid }).map(cell => cell.key));
      this.writeField(projectToGrid(this.activeField, this.camera, occupied, { spacing: this.layerSettings.grid }));
    } else {
      const clawCells = projectToGrid(this.particles, this.camera);
      if (clawCells.length > this.dots.instanceMatrix.count) throw new Error("Increase particle capacity for the edited claw model.");
      this.dots.count = clawCells.length;
      clawCells.forEach(({ item, position }, i) => {
        const variation = Math.max(0, Math.min(1, (item.scale - FIELD.particleMinScale) / (FIELD.particleMaxScale - FIELD.particleMinScale)));
        const radius = DISPLAY_GRID.spacing * THREE.MathUtils.lerp(DISPLAY_GRID.minRadius, DISPLAY_GRID.maxRadius, variation);
        this.particleScale.setScalar(radius / FIELD.particleRadius);
        this.matrix.compose(position, this.camera.quaternion, this.particleScale);
        this.dots.setMatrixAt(i, this.matrix);
        this.dots.setColorAt(i, item.color);
      });
      this.dots.instanceMatrix.needsUpdate = true;
      if (this.dots.instanceColor) this.dots.instanceColor.needsUpdate = true;
      this.writeField(projectToGrid(this.activeField, this.camera, new Set(clawCells.map(cell => cell.key))));
    }
  }

  private writeField(fieldCells: { item: { band: number }; position: THREE.Vector3 }[]) {
    const counts = [0, 0, 0];
    for (const { item, position } of fieldCells) {
      this.matrix.compose(position, this.camera.quaternion, this.unitScale);
      this.fields[item.band].setMatrixAt(counts[item.band]++, this.matrix);
    }
    this.fields.forEach((field, index) => {
      field.count = counts[index];
      field.instanceMatrix.needsUpdate = true;
    });
  }

  setDither(grain: number, noise: number) {
    this.granularity=grain;
    this.objectModel?.setGranularity?.(grain);
    this.layered?.setTreatment(grain, noise);
    this.updateGrid();
    this.render();
  }

  setCurl(curl: number) {
    this.curl = Math.max(0, Math.min(1, curl));
    this.rebuild();
  }

  setView(view: CameraView) {
    this.view = view;
    this.updateCamera();
    this.updateGrid();
    this.render();
  }

  private updateCamera() {
    this.camera.position.copy(this.target).add(this.view === "front" ? new THREE.Vector3(0, 0, 9) : new THREE.Vector3(-1, 1, 1).normalize().multiplyScalar(9));
    this.camera.lookAt(this.target);
    this.camera.updateMatrixWorld();
  }

  private resize = () => {
    if (this.disposed) return;
    const width = this.container.clientWidth, height = this.container.clientHeight;
    if (!width || !height) return;
    const aspect = width / height;
    const halfHeight = this.options.rearGrasp ? Math.max(1.85, 2.2 / aspect) / 1.4 : this.layered ? Math.max(2.45, 2.9 / aspect) : Math.max(3.05, 2.9 / aspect);
    this.camera.left = -halfHeight * aspect;
    this.camera.right = halfHeight * aspect;
    this.camera.top = halfHeight;
    this.camera.bottom = -halfHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
    this.updateGrid();
    this.render();
  };

  private render() {
    if (!this.disposed) this.renderer.render(this.scene, this.camera);
  }

  private onContextLost = (event: Event) => {
    event.preventDefault();
    this.options.onError("The 3D view lost its graphics connection. Reload the page to reconnect.");
  };

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.resizeObserver.disconnect();
    this.themeQuery.removeEventListener("change", this.updateTheme);
    this.renderer.domElement.removeEventListener("webglcontextlost", this.onContextLost);
    if (this.objectModel) {
      this.scene.remove(this.objectModel.group);
      this.objectModel.dispose();
      this.objectModel = null;
    }
    this.scene.traverse(object => {
      if (object instanceof THREE.DirectionalLight) object.shadow.dispose();
    });
    this.proximityFringe?.disposeTextures();
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    this.scene.traverse((object) => {
      if (object instanceof THREE.Mesh || object instanceof THREE.LineSegments) {
        geometries.add(object.geometry);
        const entries = Array.isArray(object.material) ? object.material : [object.material];
        entries.forEach((material: THREE.Material) => materials.add(material));
      }
      if (object instanceof THREE.InstancedMesh) object.dispose();
    });
    geometries.forEach((geometry) => geometry.dispose());
    materials.forEach((material) => material.dispose());
    this.scene.clear();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }
}
