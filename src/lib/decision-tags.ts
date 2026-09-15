import * as THREE from 'three';
import { DECISION_LABELS,layoutDecisionTags } from './decision-tag-layout';
import type { PatternCell } from './fringe-pattern';

const COLORS=['#b8f572','#c0a4ef','#f4b8da','#95ddd6','#e7dc82','#eaa489','#a8c6f5','#ccd4b1'];
/** Fictional decision labels, rendered as crisp, cached tag textures rather than live telemetry. */
export class DecisionTags{
 readonly group=new THREE.Group();
 private meshes:THREE.InstancedMesh[]=[];
 private textures:THREE.Texture[]=[];
 constructor(private spacing:number){
  for(let variant=0;variant<DECISION_LABELS.length*2;variant++){
   const canvas=document.createElement('canvas');canvas.width=320;canvas.height=80;
   const ctx=canvas.getContext('2d')!;
   ctx.fillStyle=COLORS[(variant*5+Math.floor(variant/DECISION_LABELS.length))%COLORS.length];
   ctx.beginPath();ctx.roundRect(3,5,314,70,variant%3===0?32:7);ctx.fill();
   ctx.fillStyle='#192020';ctx.font='600 43px Arial, sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';
   ctx.fillText(DECISION_LABELS[variant%DECISION_LABELS.length],160,42,288);
   const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.minFilter=THREE.LinearFilter;texture.generateMipmaps=false;
   this.textures.push(texture);
   const material=new THREE.MeshBasicMaterial({map:texture,transparent:true,depthWrite:false,toneMapped:false});
   const mesh=new THREE.InstancedMesh(new THREE.PlaneGeometry(1,1),material,2000);
   mesh.count=0;mesh.frustumCulled=false;mesh.renderOrder=1.8;mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
   this.meshes.push(mesh);this.group.add(mesh);
  }
 }
 update(marks:PatternCell[],camera:THREE.OrthographicCamera){
  const counts=Array(this.meshes.length).fill(0),matrix=new THREE.Matrix4(),scale=new THREE.Vector3();
  const offset=new THREE.Vector3(0,0,.005).applyQuaternion(camera.quaternion);
  for(const tag of layoutDecisionTags(marks,new THREE.Vector3(1,0,0).applyQuaternion(camera.quaternion),this.spacing)){
   const mesh=this.meshes[tag.variant],i=counts[tag.variant]++;
   if(i>=2000)throw new Error('Decision tag capacity exceeded.');
   scale.set(tag.width*this.spacing*.96,this.spacing*.91,1);
   matrix.compose(tag.position.clone().add(offset),camera.quaternion,scale);mesh.setMatrixAt(i,matrix);
  }
  this.meshes.forEach((mesh,i)=>{mesh.count=counts[i];mesh.instanceMatrix.needsUpdate=true;});
 }
 disposeTextures(){this.textures.forEach(texture=>texture.dispose());}
}
