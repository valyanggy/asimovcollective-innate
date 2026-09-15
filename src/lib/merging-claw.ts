import * as THREE from 'three';
import { circleSpacing, circleRadius } from './claw-circle-style';
import type { Segment } from './hand-model';
import { sampleGranularClaw } from './granular-claw';
import { projectToGrid } from './grid-projection';
import { createOutlinedMetaballMaterial } from './knight-metaballs';

import { partitionMetaballs } from "./metaball-tiles";
export { partitionMetaballs } from "./metaball-tiles";

export class MergingClaw {
  readonly group = new THREE.Group();
  private meshes: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>[] = [];
  private grain = 115;
  private diffusion = .65;
  setTreatment(grain: number, diffusion: number) {
    this.grain = THREE.MathUtils.clamp(grain,35,220);
    this.diffusion = THREE.MathUtils.clamp(diffusion,0,1);
  }
  update(segments: Segment[], camera: THREE.OrthographicCamera) {
    const spacing = circleSpacing(this.grain);
    const cells = projectToGrid(sampleGranularClaw(segments,this.diffusion),camera,new Set(),{spacing});
    const balls = cells.map(({item,position}) => {
      position.lerp(item.position,item.bleed*.4).applyMatrix4(camera.matrixWorldInverse);
      // Dense grains join; the smaller peripheral grains remain individually outlined.
      const radius = circleRadius(spacing,item.scale,item.bleed);
      return new THREE.Vector4(position.x,position.y,position.z,radius);
    });
    const tiles = partitionMetaballs(balls);
    tiles.forEach((tile,i) => {
      let mesh = this.meshes[i];
      if (!mesh) {
        mesh = new THREE.Mesh(new THREE.PlaneGeometry(1,1),createOutlinedMetaballMaterial());
        mesh.material.uniforms.showPluses.value=1;
        mesh.frustumCulled=false;mesh.renderOrder=3;
        this.meshes.push(mesh);this.group.add(mesh);
      }
      mesh.visible=true;
      const u=mesh.material.uniforms;
      u.count.value=tile.balls.length;
      tile.balls.forEach((ball,k)=>u.balls.value[k].copy(ball));
      const [l,b,r,t]=tile.bounds;
      u.bounds.value.set(l,b,r,t);
      u.projectionZ.value.set(camera.projectionMatrix.elements[10],camera.projectionMatrix.elements[14]);
      mesh.position.set((l+r)/2,(b+t)/2,-8).applyMatrix4(camera.matrixWorld);
      mesh.quaternion.copy(camera.quaternion);mesh.scale.set(r-l,t-b,1);
    });
    this.meshes.slice(tiles.length).forEach(mesh=>{mesh.visible=false;});
  }
}
