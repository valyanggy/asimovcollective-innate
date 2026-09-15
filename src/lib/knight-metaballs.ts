import * as THREE from 'three';
import { circleSpacing, circleRadius, DEFAULT_GRANULARITY } from './claw-circle-style';
import samples from './data/elegant-knight.json';
import positions from './data/elegant-knight-mesh.json';
import type { ObjectModel } from './objects';
import { projectToGrid } from './grid-projection';
import { partitionMetaballs } from './metaball-tiles';
import { RecognitionReveal } from './recognition-reveal';
import { edgeNoise } from './granular-claw';

export function createKnightMetaballs(clawStyle = false): ObjectModel {
  const group = new THREE.Group();
  let granularity=DEFAULT_GRANULARITY;
  const recognition=clawStyle?new RecognitionReveal():null;
  if(recognition)group.add(recognition.group);
  let depthMesh: THREE.Mesh | undefined;
  if(clawStyle){
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
    const material=new THREE.MeshBasicMaterial({colorWrite:false,depthWrite:true});
    material.onBeforeCompile=shader=>{shader.vertexShader=shader.vertexShader.replace('#include <project_vertex>','#include <project_vertex>\ngl_Position.z += .005 * gl_Position.w;');};
    depthMesh=new THREE.Mesh(geometry,material);depthMesh.renderOrder=-10;group.add(depthMesh);
  }
  const zAxis = new THREE.Vector3(0, 0, 1);
  const surface = samples.map(row => ({ position: new THREE.Vector3(...row.slice(0, 3) as [number, number, number]),
    rotation: new THREE.Quaternion().setFromUnitVectors(zAxis, new THREE.Vector3(...row.slice(3) as [number, number, number]).normalize()) }));
  const field: THREE.Vector3[] = [];
  samples.forEach((row, i) => { if (i % 5 === 0) for (const offset of [.14, .3]) field.push(new THREE.Vector3(row[0], row[1], row[2]).addScaledVector(new THREE.Vector3(row[3], row[4], row[5]), offset)); });
  const meshes: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>[] = [];
  return {
    group, surface, field,
    updateProximity(segments){recognition?.update(segments);},
    setGranularity(value){granularity=value;},
    distance: p => { let d = Infinity; for (const sample of surface) d = Math.min(d, sample.position.distanceTo(p)); return d; },
    updateView(camera) {
      const spacing = clawStyle ? circleSpacing(granularity) : .142;
      const cells = projectToGrid(surface, camera, new Set(), { spacing });
      const balls = cells.map(cell => {
        const p = cell.position.clone().applyMatrix4(camera.matrixWorldInverse);
        let seed=0; for(const c of cell.key) seed=Math.imul(seed,31)+c.charCodeAt(0)|0;
        const variation=(Math.abs(seed)%101)/100;
        return new THREE.Vector4(p.x,p.y,p.z,clawStyle ? circleRadius(spacing,.35+variation*.65) : spacing*(.4+variation*.24));
      });
      group.userData.coreCircleCount = balls.length;
      if(clawStyle){
        const rows=new Map<number,{min:number;max:number}>();
        cells.forEach(cell=>{const [x,y]=cell.key.split(':').map(Number),row=rows.get(y);if(row){row.min=Math.min(row.min,x);row.max=Math.max(row.max,x);}else rows.set(y,{min:x,max:x});});
        const inside=(x:number,y:number)=>{const row=rows.get(y);return !!row&&x>=row.min&&x<=row.max;};
        cells.forEach((cell,i)=>{
          const [x,y]=cell.key.split(':').map(Number);
          const outward=new THREE.Vector2();
          for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]])if(!inside(x+dx,y+dy))outward.add(new THREE.Vector2(dx,dy));
          if(outward.lengthSq()===0)return;
          outward.normalize();
          const p=cell.item.position;
          const noise=edgeNoise(p.x*13+41,p.y*13,p.z*13);
          const ball=balls[i];
          ball.x+=outward.x*(noise-.35)*.018;ball.y+=outward.y*(noise-.35)*.018;
          ball.w*=.88+noise*.32;
          if(noise<.42)return;
          const tangent=new THREE.Vector2(-outward.y,outward.x);
          const reach=.017+noise*.046;
          balls.push(new THREE.Vector4(ball.x+outward.x*reach+tangent.x*(noise-.5)*.025,
            ball.y+outward.y*reach+tangent.y*(noise-.5)*.025,ball.z,ball.w*(.3+noise*.32)));
          if(noise>.67)balls.push(new THREE.Vector4(ball.x+outward.x*(reach+.03),ball.y+outward.y*(reach+.03),ball.z,ball.w*.24));
        });
      }
      group.userData.bleedCircleCount = balls.length-group.userData.coreCircleCount;
      group.userData.circleCount = balls.length;
      const tiles=partitionMetaballs(balls);
      tiles.forEach((tile,i)=>{
        let mesh=meshes[i];
        if(!mesh) {
          const material=createOutlinedMetaballMaterial();
          material.uniforms.mergeWidth.value=clawStyle?.024:.009;
          material.uniforms.showPluses.value=clawStyle?1:0;
          mesh=new THREE.Mesh(new THREE.PlaneGeometry(1,1),material);
          mesh.frustumCulled=false;mesh.renderOrder=2;
          meshes.push(mesh);group.add(mesh);
        }
        mesh.visible=true;
        const u=mesh.material.uniforms;
        tile.balls.forEach((ball,k)=>u.balls.value[k].copy(ball));
        const [left,bottom,right,top]=tile.bounds;
        u.count.value=tile.balls.length;
        u.bounds.value.set(left,bottom,right,top);
        u.projectionZ.value.set(camera.projectionMatrix.elements[10],camera.projectionMatrix.elements[14]);
        mesh.position.set((left+right)/2,(bottom+top)/2,-8).applyMatrix4(camera.matrixWorld);
        mesh.quaternion.copy(camera.quaternion);mesh.scale.set(right-left,top-bottom,1);
      });
      meshes.slice(tiles.length).forEach(mesh=>{mesh.visible=false;});
    },
    dispose() { recognition?.dispose(); if(depthMesh){depthMesh.geometry.dispose();(depthMesh.material as THREE.Material).dispose();} meshes.forEach(mesh=>{mesh.geometry.dispose();mesh.material.dispose();});group.clear(); },
  };
}

export function createOutlinedMetaballMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: true, toneMapped: false,
    uniforms: { balls: { value: Array.from({ length: 192 }, () => new THREE.Vector4()) }, count: { value: 0 }, bounds: { value: new THREE.Vector4() },
      showPluses: { value: 0 }, plusColor: { value: new THREE.Color("#8792a5") }, mergeWidth: { value: .024 }, projectionZ: { value: new THREE.Vector2() }, outline: { value: new THREE.Color('#c5c7c5') } },
    vertexShader: `varying vec2 vMarkUv;
      void main() { vMarkUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `
      varying vec2 vMarkUv;
      uniform float showPluses; uniform vec3 plusColor; uniform float mergeWidth; uniform vec4 balls[192]; uniform int count; uniform vec4 bounds; uniform vec2 projectionZ; uniform vec3 outline;
      float mergeDistance(float a, float b) { float h = max(mergeWidth - abs(a-b), 0.0)/mergeWidth; return min(a,b)-h*h*mergeWidth*.25; }
      void main() {
        vec2 p = mix(bounds.xy, bounds.zw, vMarkUv);
        float d = 100.0, closest = 100.0, depth = -10.0, crossDistance = 100.0;
        for (int i=0; i<192; i++) {
          if (i>=count) break;
          float sd = length(p-balls[i].xy)-balls[i].w;
          d = mergeDistance(d,sd);
          // Radius-based selection is consistent across tiles and stable during the grasp.
          float selected = fract(sin(floor(balls[i].w * 100000.0) * 12.9898) * 43758.5453);
          if(showPluses > .5 && selected < .38) {
            vec2 q=abs(p-balls[i].xy);
            float arm=balls[i].w*.30, stroke=balls[i].w*.045;
            float crossShape=min(max(q.x-arm,q.y-stroke),max(q.x-stroke,q.y-arm));
            crossDistance=min(crossDistance,crossShape);
          }
          if(sd<closest) { closest=sd; depth=balls[i].z; }
        }
        float pixel = max(fwidth(d), .001);
        float alpha = 1.0-smoothstep(-pixel*.5,pixel*.5,d);
        if(alpha<.01) discard;
        float edge = smoothstep(-pixel*1.6,-pixel*.6,d);
        vec3 fill=mix(vec3(1.0),outline,edge);
        float crossInk=1.0-smoothstep(-pixel*.5,pixel*.5,crossDistance);
        fill=mix(fill,plusColor,crossInk*showPluses);
        gl_FragColor=vec4(fill,alpha);
        gl_FragDepth=clamp((projectionZ.x*depth+projectionZ.y)*.5+.5,0.0,1.0);
        #include <colorspace_fragment>
      }`,
  });
}
