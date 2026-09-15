import * as THREE from 'three';

export const DEPTH_SPACE={near:7.5,far:17};
export function depthBrightness(distance:number){return THREE.MathUtils.clamp((DEPTH_SPACE.far-distance)/(DEPTH_SPACE.far-DEPTH_SPACE.near),0,1);}
export const DEPTH_BACKDROP={bottom:10.8,top:18};
// World-space height over which the knight meets the plane.
export const KNIGHT_BASE_BLEND_HEIGHT=.26;
export function createDepthMaterial(blendBase=false){
 return new THREE.ShaderMaterial({
  toneMapped:false,
  uniforms:{nearDepth:{value:DEPTH_SPACE.near},farDepth:{value:DEPTH_SPACE.far},
    blendBase:{value:blendBase?1:0},baseY:{value:-1},blendHeight:{value:KNIGHT_BASE_BLEND_HEIGHT},
    viewBottom:{value:-2},viewTop:{value:2},
    groundNear:{value:DEPTH_BACKDROP.bottom},groundFar:{value:DEPTH_BACKDROP.top}},
  vertexShader:`varying float vDepth,vLocalY,vViewY;void main(){vec4 view=modelViewMatrix*vec4(position,1.0);vDepth=-view.z;vLocalY=position.y;vViewY=view.y;gl_Position=projectionMatrix*view;}`,
  fragmentShader:`varying float vDepth,vLocalY,vViewY;uniform float nearDepth,farDepth;
    uniform float blendBase,baseY,blendHeight,viewBottom,viewTop,groundNear,groundFar;
    void main(){
      float planeDepth=mix(groundNear,groundFar,clamp((vViewY-viewBottom)/(viewTop-viewBottom),0.0,1.0));
      float baseWeight=blendBase*(1.0-smoothstep(baseY,baseY+blendHeight,vLocalY));
      float depth=mix(vDepth,planeDepth,baseWeight);
      float value=clamp((farDepth-depth)/(farDepth-nearDepth),0.0,1.0);
      gl_FragColor=vec4(vec3(pow(value,2.2)),1.0);
      #include <colorspace_fragment>
    }`,
 });
}

/** A receding backdrop with real camera-space depth, sharing the knight's grayscale mapping. */
export class DepthBackdrop{
 readonly mesh:THREE.Mesh;
 constructor(){
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(new Float32Array(12),3));geometry.setIndex([0,1,2,0,2,3]);
  this.mesh=new THREE.Mesh(geometry,createDepthMaterial());this.mesh.frustumCulled=false;this.mesh.renderOrder=-20;
 }
 update(camera:THREE.OrthographicCamera){
  const a=this.mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
  a.setXYZ(0,camera.left,camera.bottom,-DEPTH_BACKDROP.bottom);a.setXYZ(1,camera.right,camera.bottom,-DEPTH_BACKDROP.bottom);
  a.setXYZ(2,camera.right,camera.top,-DEPTH_BACKDROP.top);a.setXYZ(3,camera.left,camera.top,-DEPTH_BACKDROP.top);a.needsUpdate=true;
  this.mesh.position.copy(camera.position);this.mesh.quaternion.copy(camera.quaternion);
 }
}
