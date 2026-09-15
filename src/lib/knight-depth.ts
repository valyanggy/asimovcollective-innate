import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import positions from './data/elegant-knight-mesh.json';
import samples from './data/elegant-knight.json';
import { createDepthMaterial } from './depth-space';
import type { ObjectModel } from './objects';

/** Imported solid geometry encoded by actual camera-space depth, without lighting. */
export function createKnightDepth(): ObjectModel {
  const group = new THREE.Group();
  const source = new THREE.BufferGeometry();
  source.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  const geometry = mergeVertices(source, .00001);
  source.dispose();
  geometry.computeVertexNormals();
  const material = createDepthMaterial(true);
  const mesh = new THREE.Mesh(geometry,material);
  group.add(mesh);
  const z = new THREE.Vector3(0,0,1);
  const surface=samples.map(row=>({position:new THREE.Vector3(row[0],row[1],row[2]),
    rotation:new THREE.Quaternion().setFromUnitVectors(z,new THREE.Vector3(row[3],row[4],row[5]).normalize())}));
  const field: THREE.Vector3[]=[];
  samples.forEach((row,i)=>{if(i%5===0)for(const offset of [.14,.3])field.push(new THREE.Vector3(row[0],row[1],row[2]).addScaledVector(new THREE.Vector3(row[3],row[4],row[5]),offset));});
  return {group,surface,field,
    updateView(camera){
      material.uniforms.viewBottom.value=camera.bottom/camera.zoom;
      material.uniforms.viewTop.value=camera.top/camera.zoom;
    },
    distance:p=>{let d=Infinity;for(const sample of surface)d=Math.min(d,p.distanceTo(sample.position));return d;},
    dispose(){geometry.dispose();material.dispose();group.clear();},
  };
}
