import * as THREE from 'three';
import { distanceToHand, type Segment, type SurfaceSample } from './hand-model';
import { projectToGrid } from './grid-projection';
import { fringeSymbols, type PatternCell } from './fringe-pattern';
import { DecisionTags } from './decision-tags';

export const FRINGE = { spacing: .055, range: .8, maxSteps: 14.4 };
type FringePixel = PatternCell;

/** Screen-space silhouette extrusion, driven by actual 3D surface-to-claw distance. */
export function proximityFringe(surface: SurfaceSample[], segments: Segment[], camera: THREE.OrthographicCamera, overlapObject=false): FringePixel[] {
  if (!surface.length || !segments.length) return [];
  const cells=projectToGrid(surface,camera,new Set(),{spacing:FRINGE.spacing});
  const rows=new Map<number,{min:number;max:number}>();
  cells.forEach(cell=>{
    const [x,y]=cell.key.split(':').map(Number),row=rows.get(y);
    if(row){row.min=Math.min(row.min,x);row.max=Math.max(row.max,x);}else rows.set(y,{min:x,max:x});
  });
  // Fill the projected interior so tiny gaps between white pixels do not become false edges.
  const inside=(x:number,y:number)=>{const row=rows.get(y);return !!row&&x>=row.min&&x<=row.max;};
  const marks=new Map<string,FringePixel>();
  const directions=[[1,0],[-1,0],[0,1],[0,-1]];
  const place=(x:number,y:number,z:number,echo:boolean,overlay=false)=>{
    if(inside(x,y)&&!overlay)return;
    const key=`${x}:${y}:${echo}:${overlay}`;
    const position=new THREE.Vector3(x*FRINGE.spacing,y*FRINGE.spacing,z).applyMatrix4(camera.matrixWorld);
    marks.set(key,{position,echo,overlay,column:x,row:y});
  };
  for(const cell of cells){
    const [x,y]=cell.key.split(':').map(Number);
    const strength=THREE.MathUtils.clamp(1-Math.max(0,distanceToHand(cell.item.position,segments))/FRINGE.range,0,1);
    if(strength<=0)continue;
    // Fixed row bands create coherent stair steps, rather than flickering random noise.
    const band=Math.abs(Math.imul(Math.floor(y/2)+31,73)+x*17)%7;
    if(strength<.1+band*.035)continue;
    const length=Math.max(1,Math.round(strength*FRINGE.maxSteps));
    for(const [dx,dy] of directions){
      if(inside(x+dx,y+dy))continue;
      if(overlapObject&&strength>.3&&band%3===0){
        const inward=Math.max(1,Math.round(strength*5));
        for(let step=0;step<inward;step++){
          if(inside(x-dx*step,y-dy*step))place(x-dx*step,y-dy*step,cell.depth+.13,false,true);
        }
      }
      for(let step=1;step<=length;step++){
        const px=x+dx*step,py=y+dy*step;
        place(px,py,cell.depth-.025,false);
        // A paired, broken offset trace evokes stereo disparity without claiming camera reconstruction.
        if(step===length && (Math.abs(y)%3!==1)) {
          const disparity=1+Math.round(strength*2);
          place(px+disparity,py+1,cell.depth-.05,true);
        }
      }
    }
  }
  return [...marks.values()];
}

export class ProximityFringe {
  readonly group=new THREE.Group();
  private readonly layers: THREE.InstancedMesh[];
  private readonly overlapObject:boolean;
  private readonly overlay:THREE.InstancedMesh;
  private readonly symbols: THREE.InstancedMesh[];
  private readonly decisionTags:DecisionTags|null;
  constructor(withDecisionTags=false){
    this.overlapObject=withDecisionTags;
    this.decisionTags=withDecisionTags?new DecisionTags(FRINGE.spacing):null;
    if(this.decisionTags)this.group.add(this.decisionTags.group);
    const geometry=new THREE.PlaneGeometry(FRINGE.spacing*1.015,FRINGE.spacing*1.015);
    this.overlay=new THREE.InstancedMesh(geometry,new THREE.MeshBasicMaterial({color:0x000000,transparent:true,depthWrite:false,toneMapped:false}),16000);
    this.overlay.count=0;this.overlay.frustumCulled=false;this.overlay.renderOrder=3.2;
    this.overlay.instanceMatrix.setUsage(THREE.DynamicDrawUsage);this.group.add(this.overlay);
    this.layers=[1,.36].map(opacity=>{
      const mesh=new THREE.InstancedMesh(geometry,new THREE.MeshBasicMaterial({color:0x000000,toneMapped:false,transparent:opacity<1,opacity,depthWrite:false}),16000);
      mesh.count=0;mesh.frustumCulled=false;mesh.renderOrder=1;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);this.group.add(mesh);return mesh;
    });
    const symbolGeometries=[
      new THREE.CircleGeometry(FRINGE.spacing*.4,24),
      new THREE.PlaneGeometry(FRINGE.spacing*.72,FRINGE.spacing*.72),
      new THREE.CircleGeometry(FRINGE.spacing*.12,12),
      new THREE.RingGeometry(FRINGE.spacing*.3,FRINGE.spacing*.4,24),
    ];
    this.symbols=symbolGeometries.map(geometry=>{
      const mesh=new THREE.InstancedMesh(geometry,new THREE.MeshBasicMaterial({color:0xffffff,toneMapped:false,transparent:true,depthWrite:false}),16000);
      mesh.count=0;mesh.frustumCulled=false;mesh.renderOrder=1.5;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);this.group.add(mesh);return mesh;
    });
  }
  disposeTextures(){this.decisionTags?.disposeTextures();}
  update(surface:SurfaceSample[],segments:Segment[],camera:THREE.OrthographicCamera){
    const marks=proximityFringe(surface,segments,camera,this.overlapObject),counts=[0,0];
    this.decisionTags?.update(marks,camera);
    const matrix=new THREE.Matrix4(),scale=new THREE.Vector3(1,1,1);
    let overlayCount=0;
    for(const mark of marks){
      if(mark.overlay){matrix.compose(mark.position,camera.quaternion,scale);this.overlay.setMatrixAt(overlayCount++,matrix);continue;}
      const layer=mark.echo?1:0;
      if(counts[layer]>=16000)throw new Error('Proximity fringe exceeds capacity.');
      matrix.compose(mark.position,camera.quaternion,scale);
      this.layers[layer].setMatrixAt(counts[layer]++,matrix);
    }
    this.overlay.count=overlayCount;this.overlay.instanceMatrix.needsUpdate=true;
    this.layers.forEach((mesh,i)=>{mesh.count=counts[i];mesh.instanceMatrix.needsUpdate=true;});
    const symbolCounts=[0,0,0,0];
    const towardCamera=new THREE.Vector3(0,0,.002).applyQuaternion(camera.quaternion);
    const color=new THREE.Color();
    for(const symbol of fringeSymbols(marks)){
      const mesh=this.symbols[symbol.shape],index=symbolCounts[symbol.shape]++;
      if(index>=16000)throw new Error('Fringe symbol capacity exceeded.');
      scale.set(symbol.span,symbol.span,1);
      matrix.compose(symbol.position.clone().add(towardCamera),camera.quaternion,scale);
      mesh.setMatrixAt(index,matrix);mesh.setColorAt(index,color.setScalar(symbol.shade));
    }
    this.symbols.forEach((mesh,i)=>{mesh.count=symbolCounts[i];mesh.instanceMatrix.needsUpdate=true;if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;});
  }
}
