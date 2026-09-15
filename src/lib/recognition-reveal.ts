import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import positions from './data/elegant-knight-mesh.json';
import { distanceToHand, type Segment } from './hand-model';

export function recognitionStrength(position:THREE.Vector3,segments:Segment[]):number{
 const distance=Math.max(0,distanceToHand(position,segments));
 return 1-THREE.MathUtils.smoothstep(distance,.04,.85);
}
/** A lit surface emerges in fixed spatial patches as 3D proximity increases. */
export class RecognitionReveal {
 readonly group=new THREE.Group();
 private geometry:THREE.BufferGeometry;
 private material:THREE.MeshStandardMaterial;
 constructor(){
  const source=new THREE.BufferGeometry();source.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  this.geometry=mergeVertices(source,.00001);source.dispose();this.geometry.computeVertexNormals();
  this.geometry.setAttribute('recognition',new THREE.Float32BufferAttribute(new Float32Array(this.geometry.getAttribute('position').count),1));
  this.material=new THREE.MeshStandardMaterial({color:'#cbd2d8',metalness:.28,roughness:.32,transparent:true,depthWrite:false});
  this.material.onBeforeCompile=shader=>{
   shader.vertexShader='attribute float recognition; varying float vRecognition; varying vec3 vRecognizedPosition;\n'+shader.vertexShader;
   shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvRecognition=recognition;vRecognizedPosition=position;');
   // Lift the revealed surface just ahead of the abstract sampled shell, retaining depth testing.
   shader.vertexShader=shader.vertexShader.replace('#include <project_vertex>','#include <project_vertex>\ngl_Position.z -= .006 * gl_Position.w;');
   shader.fragmentShader='varying float vRecognition; varying vec3 vRecognizedPosition;\n'+shader.fragmentShader;
   shader.fragmentShader=shader.fragmentShader.replace('#include <alphatest_fragment>',`
     vec3 tile=floor(vRecognizedPosition*vec3(19.0,25.0,17.0));
     float threshold=fract(sin(dot(tile,vec3(12.9898,78.233,37.719)))*43758.5453);
     float reveal=smoothstep(threshold-.12,threshold+.12,vRecognition*.72);
     diffuseColor.a*=reveal*smoothstep(.01,.25,vRecognition)*.92;
     if(diffuseColor.a<.015)discard;
     #include <alphatest_fragment>
   `);
  };
  this.material.customProgramCacheKey=()=> 'proximity-recognition-v1';
  const mesh=new THREE.Mesh(this.geometry,this.material);mesh.renderOrder=2.5;this.group.add(mesh);
  const fill=new THREE.HemisphereLight('#e4efff','#4c515c',1.1);
  const key=new THREE.DirectionalLight('#fff4df',2.5);key.position.set(-3,4,5);
  const rim=new THREE.DirectionalLight('#a8ceff',1.3);rim.position.set(3,1,-2);
  this.group.add(fill,key,key.target,rim,rim.target);
 }
 update(segments:Segment[]){
  const vertices=this.geometry.getAttribute('position'),attribute=this.geometry.getAttribute('recognition') as THREE.BufferAttribute;
  const p=new THREE.Vector3();let maximum=0;
  for(let i=0;i<vertices.count;i++){p.fromBufferAttribute(vertices,i);const strength=recognitionStrength(p,segments);attribute.setX(i,strength);maximum=Math.max(maximum,strength);}
  for(let i=0;i<vertices.count;i++)attribute.setX(i,Math.min(1,attribute.getX(i)*.8+maximum*.2));
  attribute.needsUpdate=true;this.group.userData.recognition=maximum;
 }
 dispose(){this.geometry.dispose();this.material.dispose();this.group.clear();}
}
