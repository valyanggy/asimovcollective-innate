import * as THREE from 'three';
import { projectToGrid } from './grid-projection';
import samples from './data/elegant-knight.json';
import positions from './data/elegant-knight-mesh.json';
import type { ObjectModel } from './objects';

/** White square pixels sampled from the imported 3D surface. */
export function createKnightPixels(occludeRear = false): ObjectModel {
  const group = new THREE.Group();
  const spacing = .04;
  const geometry = new THREE.PlaneGeometry(spacing * .94, spacing * .94);
  const material = new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false });
  const mesh = new THREE.InstancedMesh(geometry,material,6500);
  mesh.count=0;mesh.frustumCulled=false;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  group.add(mesh);
  let depthMesh: THREE.Mesh | undefined;
  if(occludeRear){
    const depthGeometry=new THREE.BufferGeometry();
    depthGeometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
    depthMesh=new THREE.Mesh(depthGeometry,new THREE.MeshBasicMaterial({colorWrite:false,depthWrite:true}));
    depthMesh.renderOrder=-10;group.add(depthMesh);
  }
  const z = new THREE.Vector3(0,0,1);
  const surface=samples.map(row=>({position:new THREE.Vector3(row[0],row[1],row[2]),
    rotation:new THREE.Quaternion().setFromUnitVectors(z,new THREE.Vector3(row[3],row[4],row[5]).normalize())}));
  const field: THREE.Vector3[]=[];
  samples.forEach((row,i)=>{if(i%5===0)for(const offset of [.14,.3])field.push(new THREE.Vector3(row[0],row[1],row[2]).addScaledVector(new THREE.Vector3(row[3],row[4],row[5]),offset));});
  return {group,surface,field,
    updateView(camera) {
      const cells=projectToGrid(surface,camera,new Set(),{spacing});
      const matrix=new THREE.Matrix4(),scale=new THREE.Vector3(1,1,1);
      cells.forEach(({position},i)=>{matrix.compose(position,camera.quaternion,scale);mesh.setMatrixAt(i,matrix);});
      mesh.count=cells.length;mesh.instanceMatrix.needsUpdate=true;
    },
    distance:p=>{let d=Infinity;for(const sample of surface)d=Math.min(d,p.distanceTo(sample.position));return d;},
    dispose(){if(depthMesh){depthMesh.geometry.dispose();(depthMesh.material as THREE.Material).dispose();}mesh.dispose();geometry.dispose();material.dispose();group.clear();},
  };
}
