import { Vector3 } from 'three';
import type { Palette, Segment } from './hand-model';

/** Two rigid jaws approach from negative Z and close around the knight's lower sides. */
export function createRearGrasp(closure:number,palette:Palette):Segment[]{
 const segments:Segment[]=[];
 const opening=(1-Math.max(0,Math.min(1,closure)))*.58;
 for(const side of [-1,1]){
  const pivot=new Vector3(side*.36,-.55,-1.65);
  const profile=[pivot,new Vector3(side*.69,-.55,-1.13),new Vector3(side*.69,-.55,.2)];
  const points=profile.map(p=>p.clone().sub(pivot).applyAxisAngle(new Vector3(0,1,0),side*opening).add(pivot));
  for(let i=0;i<2;i++)segments.push({a:points[i],b:points[i+1],radius:.15,color:palette.blue});
 }
 segments.push({a:new Vector3(-.36,-.55,-1.65),b:new Vector3(.36,-.55,-1.65),radius:.17,color:palette.teal});
 segments.push({a:new Vector3(0,-.55,-2.55),b:new Vector3(0,-.55,-1.65),radius:.19,color:palette.teal});
 return segments;
}
