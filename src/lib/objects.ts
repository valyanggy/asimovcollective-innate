import * as THREE from "three";
import { FIELD, createFieldPositions, createSurfaceSamples, type Palette, type SurfaceSample } from "./hand-model";
import type { ObjectId } from "./object-catalog";

type Point2 = readonly [number, number];
export type ObjectModel = {
  group: THREE.Group;
  updateProximity?: (segments: import("./hand-model").Segment[]) => void;
  setGranularity?: (grain: number) => void;
  updateView?: (camera: THREE.OrthographicCamera) => void;
  distance: (p: THREE.Vector3) => number;
  surface: SurfaceSample[];
  field: THREE.Vector3[];
  dispose: () => void;
};

const KNIGHT: Point2[] = [[-.45,-.52],[-.42,-.14],[-.32,.12],[-.53,.36],[-.59,.59],[-.43,.73],[-.26,.79],[-.22,1],[-.09,.81],[.13,.75],[.49,.5],[.68,.25],[.61,.12],[.44,.11],[.2,.29],[.08,.38],[.05,.1],[.19,-.16],[.43,-.52]];
const SOCK: Point2[] = [[-.46,1],[.17,1],[.17,.82],[.15,.33],[.12,-.24],[.25,-.45],[.53,-.58],[.81,-.65],[.94,-.74],[.99,-.84],[.94,-.95],[.81,-1],[-.22,-1],[-.4,-.91],[-.52,-.75],[-.55,-.55],[-.49,-.23]];

function polygonDistance(x: number, y: number, polygon: Point2[]): number {
  let nearest = Infinity, inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [ax, ay] = polygon[j], [bx, by] = polygon[i];
    const dx = bx-ax, dy = by-ay;
    const t = Math.max(0, Math.min(1, ((x-ax)*dx+(y-ay)*dy)/(dx*dx+dy*dy)));
    nearest = Math.min(nearest, Math.hypot(x-ax-t*dx,y-ay-t*dy));
    if ((ay>y)!==(by>y) && x < (bx-ax)*(y-ay)/(by-ay)+ax) inside = !inside;
  }
  return inside ? -nearest : nearest;
}
function extrusionDistance(p: THREE.Vector3, polygon: Point2[], halfDepth: number): number {
  const a = polygonDistance(p.x,p.y,polygon), b = Math.abs(p.z)-halfDepth;
  return Math.hypot(Math.max(a,0),Math.max(b,0))+Math.min(Math.max(a,b),0);
}
function cylinderDistance(p: THREE.Vector3, radius: number, centerY: number, halfHeight: number) {
  const a = Math.hypot(p.x,p.z)-radius, b = Math.abs(p.y-centerY)-halfHeight;
  return Math.hypot(Math.max(a,0),Math.max(b,0))+Math.min(Math.max(a,b),0);
}
export function distanceToObject(id: ObjectId, p: THREE.Vector3): number {
  if (id === "football") return p.length()-1;
  if (id === "sock") return extrusionDistance(p,SOCK,.17);
  if (id === "knight") return Math.min(extrusionDistance(p,KNIGHT,.24), cylinderDistance(p,.66,-.9,.1), cylinderDistance(p,.56,-.755,.045), cylinderDistance(p,.40,-.615,.095));
  const x=Math.abs(p.x)-1,y=Math.abs(p.y)-1,z=Math.abs(p.z)-1;
  return Math.hypot(Math.max(x,0),Math.max(y,0),Math.max(z,0))+Math.min(Math.max(x,y,z),0);
}

function normalAt(p: THREE.Vector3, distance: ObjectModel["distance"]) {
  const e=.0001;
  return new THREE.Vector3(
    distance(p.clone().add(new THREE.Vector3(e,0,0)))-distance(p.clone().add(new THREE.Vector3(-e,0,0))),
    distance(p.clone().add(new THREE.Vector3(0,e,0)))-distance(p.clone().add(new THREE.Vector3(0,-e,0))),
    distance(p.clone().add(new THREE.Vector3(0,0,e)))-distance(p.clone().add(new THREE.Vector3(0,0,-e))),
  ).normalize();
}

function sampleSurface(meshes: THREE.Mesh[], distance: ObjectModel["distance"]): SurfaceSample[] {
  const samples: SurfaceSample[] = [], seen = new Set<string>();
  const axis = new THREE.Vector3(0,0,1);
  for (const mesh of meshes) {
    mesh.updateWorldMatrix(true,false);
    const geometry=mesh.geometry, position=geometry.getAttribute("position"), index=geometry.getIndex();
    const count=index ? index.count : position.count;
    const vertex=(i:number)=>new THREE.Vector3().fromBufferAttribute(position,index ? index.getX(i) : i).applyMatrix4(mesh.matrixWorld);
    for(let t=0;t<count;t+=3) {
      const a=vertex(t),b=vertex(t+1),c=vertex(t+2);
      const steps=Math.max(1,Math.ceil(Math.max(a.distanceTo(b),b.distanceTo(c),c.distanceTo(a))/.12));
      for(let i=0;i<=steps;i++) for(let j=0;j<=steps-i;j++) {
        const p=a.clone().multiplyScalar(1-(i+j)/steps).addScaledVector(b,i/steps).addScaledVector(c,j/steps);
        const d=distance(p);
        // Discard internal seams where the component solids overlap.
        if(Math.abs(d)>.012) continue;
        const normal=normalAt(p,distance);
        if(normal.lengthSq()<.5) continue;
        p.addScaledVector(normal,-d+.003);
        const key=`${Math.round(p.x*70)}:${Math.round(p.y*70)}:${Math.round(p.z*70)}`;
        if(seen.has(key)) continue;
        seen.add(key);
        samples.push({position:p,rotation:new THREE.Quaternion().setFromUnitVectors(axis,normal)});
      }
    }
  }
  return samples;
}

export function createObjectModel(id: ObjectId, palette: Palette): ObjectModel {
  const group=new THREE.Group(), bodies: THREE.Mesh[]=[];
  const distance=(p:THREE.Vector3)=>distanceToObject(id,p);
  const bodyColor=palette.background.clone().lerp(palette.foreground,.10);
  const bodyMaterial=new THREE.MeshBasicMaterial({color:bodyColor});
  const detailMaterial=new THREE.MeshBasicMaterial({color:palette.foreground.clone().lerp(palette.background,.25)});
  const outlineMaterial=new THREE.LineBasicMaterial({color:palette.foreground,transparent:true,opacity:.42});
  const body=(geometry:THREE.BufferGeometry, y=0, outline=true, material=bodyMaterial)=>{
    const mesh=new THREE.Mesh(geometry,material);
    mesh.position.y=y; group.add(mesh); bodies.push(mesh);
    if(outline) {
      const lines=new THREE.LineSegments(new THREE.EdgesGeometry(geometry,35),outlineMaterial);
      lines.position.copy(mesh.position); group.add(lines);
    }
    return mesh;
  };
  const extrude=(polygon:Point2[],halfDepth:number)=>{
    const shape=new THREE.Shape(polygon.map(([x,y])=>new THREE.Vector2(x,y)));
    const geometry=new THREE.ExtrudeGeometry(shape,{depth:halfDepth*2,bevelEnabled:false,steps:1});
    geometry.translate(0,0,-halfDepth);
    return body(geometry);
  };
  const line=(points:THREE.Vector3[])=>group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points),outlineMaterial));

  if(id==="cube") body(new THREE.BoxGeometry(2,2,2),0,true,new THREE.MeshBasicMaterial({color:palette.background}));
  if(id==="knight") {
    body(new THREE.CylinderGeometry(.66,.66,.20,48),-.9);
    body(new THREE.CylinderGeometry(.56,.56,.09,48),-.755);
    body(new THREE.CylinderGeometry(.40,.40,.19,48),-.615);
    extrude(KNIGHT,.24);
    for(const side of [-1,1]) {
      const eye=new THREE.Mesh(new THREE.CircleGeometry(.032,18),detailMaterial);
      eye.position.set(.15,.54,side*.244); if(side<0) eye.rotation.y=Math.PI;
      group.add(eye);
      line([new THREE.Vector3(-.40,.62,side*.245),new THREE.Vector3(-.37,.33,side*.245),new THREE.Vector3(-.18,.11,side*.245),new THREE.Vector3(-.21,-.32,side*.245)]);
    }
  }
  if(id==="sock") {
    extrude(SOCK,.17);
    for(const side of [-1,1]) {
      const z=side*.174;
      const cuff=new THREE.Mesh(new THREE.PlaneGeometry(.61,.17),new THREE.MeshBasicMaterial({color:palette.background.clone().lerp(palette.foreground,.22),side:THREE.DoubleSide}));
      cuff.position.set(-.145,.89,z); group.add(cuff);
      for(let x=-.39;x<.13;x+=.09) line([new THREE.Vector3(x,.82,z+side*.002),new THREE.Vector3(x,.97,z+side*.002)]);
      line([new THREE.Vector3(.65,-.66,z),new THREE.Vector3(.57,-.82,z),new THREE.Vector3(.57,-.99,z)]);
      line([new THREE.Vector3(-.47,-.38,z),new THREE.Vector3(-.25,-.48,z),new THREE.Vector3(-.13,-.68,z),new THREE.Vector3(-.39,-.9,z)]);
    }
  }
  if(id==="football") {
    body(new THREE.SphereGeometry(1,48,32),0,false,new THREE.MeshBasicMaterial({color:0xf0f0ee}));
    const ico=new THREE.IcosahedronGeometry(1,0), attr=ico.getAttribute("position");
    const normals:THREE.Vector3[]=[],seen=new Set<string>();
    for(let i=0;i<attr.count;i++) {
      const n=new THREE.Vector3().fromBufferAttribute(attr,i).normalize();
      const key=n.toArray().map(v=>v.toFixed(4)).join(":");
      if(!seen.has(key)){seen.add(key);normals.push(n);}
    }
    ico.dispose();
    const panelMaterial=new THREE.MeshBasicMaterial({color:0x30343a,side:THREE.DoubleSide});
    for(const n of normals) {
      const neighbor=normals.filter(m=>m!==n).sort((a,b)=>b.dot(n)-a.dot(n))[0];
      const u=neighbor.clone().addScaledVector(n,-neighbor.dot(n)).normalize();
      const w=new THREE.Vector3().crossVectors(n,u);
      const corners=Array.from({length:5},(_,i)=>n.clone().multiplyScalar(Math.cos(.35))
        .addScaledVector(u,Math.cos(i*Math.PI*2/5)*Math.sin(.35)).addScaledVector(w,Math.sin(i*Math.PI*2/5)*Math.sin(.35)).normalize());
      const boundary:THREE.Vector3[]=[];
      for(let edge=0;edge<5;edge++) for(let step=0;step<6;step++) boundary.push(corners[edge].clone().lerp(corners[(edge+1)%5],step/6).normalize());
      const vertices:number[]=[];
      const patchPoint=(ring:number,k:number)=>n.clone().lerp(boundary[(k+boundary.length)%boundary.length],ring/5).normalize().multiplyScalar(1.004);
      for(let ring=0;ring<5;ring++) for(let k=0;k<boundary.length;k++) {
        const a=patchPoint(ring,k),b=patchPoint(ring+1,k),c=patchPoint(ring+1,k+1),d=patchPoint(ring,k+1);
        vertices.push(...a.toArray(),...b.toArray(),...c.toArray());
        if(ring>0) vertices.push(...a.toArray(),...c.toArray(),...d.toArray());
      }
      const geometry=new THREE.BufferGeometry();geometry.setAttribute("position",new THREE.Float32BufferAttribute(vertices,3));
      group.add(new THREE.Mesh(geometry,panelMaterial));
    }
  }
  group.updateMatrixWorld(true);
  const surface=id==="cube" ? createSurfaceSamples() : sampleSurface(bodies,distance);
  const field=id==="cube" ? createFieldPositions() : [];
  if(id!=="cube") for(let x=-7;x<=7;x++) for(let y=-7;y<=7;y++) for(let z=-7;z<=7;z++) {
    const p=new THREE.Vector3(x*.2,y*.2,z*.2),d=distance(p);
    if(d>=0 && d<FIELD.proximityRange) field.push(p);
  }
  // Shared materials and geometry are disposed only once on object switches.
  const dispose=()=>{
    const geometries=new Set<THREE.BufferGeometry>();
    const materials=new Set<THREE.Material>([bodyMaterial,detailMaterial,outlineMaterial]);
    group.traverse(object=>{
      if(object instanceof THREE.Mesh || object instanceof THREE.Line) {
        geometries.add(object.geometry);
        (Array.isArray(object.material)?object.material:[object.material]).forEach(m=>materials.add(m));
      }
    });
    geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());group.clear();
  };
  return {group,distance,surface,field,dispose};
}
