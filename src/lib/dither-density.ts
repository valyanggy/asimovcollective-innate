import type { OccupancyLayer } from './dither-cells';
import type { Box } from './component-linkage';

type FieldDot = { x:number; y:number; radius:number; cycleSpeed:number; cyclePhase:number; territory?:number };
const clamp = (x:number)=>Math.max(0,Math.min(1,x));
const smooth=(a:number,b:number,x:number)=>{const t=clamp((x-a)/(b-a));return t*t*(3-2*t);};
const caches=new WeakMap<HTMLCanvasElement,Map<number,{key:string;base:Float32Array;field:Float32Array;width:number;height:number;left:number;top:number;scale:number}>>();
/** Only the stamp lattice samples this field. A coarse, bounded density buffer
 * avoids allocating millions of invisible pixels when influence reach is 6×. */
export function ditherDensity(canvas:HTMLCanvasElement,slot:number,boxes:Box[],anchor:{x:number;y:number},dots:FieldDot[],time:number,mergeScale:number,spacing:number):OccupancyLayer {
 const local=boxes.map(b=>({left:b.left-anchor.x,right:b.right-anchor.x,top:b.top-anchor.y,bottom:b.bottom-anchor.y}));
 const softness=6.5*mergeScale;
 const pad=softness*5.5+20;
 const left=Math.floor(Math.min(...local.map(b=>b.left))-pad),top=Math.floor(Math.min(...local.map(b=>b.top))-pad);
 const extentX=Math.max(...local.map(b=>b.right))+pad-left,extentY=Math.max(...local.map(b=>b.bottom))+pad-top;
 const scale=Math.max(3,Math.min(8,spacing/3),extentX/320,extentY/320);
 const width=Math.ceil(extentX/scale)+1,height=Math.ceil(extentY/scale)+1;
 const key=JSON.stringify([local,mergeScale,scale,width,height]);
 let cache=caches.get(canvas);if(!cache){cache=new Map();caches.set(canvas,cache);}
 let state=cache.get(slot);
 if(!state||state.key!==key){
  const base=new Float32Array(width*height);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
   const px=left+x*scale,py=top+y*scale;let distance=Infinity;
   for(const b of local){
    const r=Math.min(4,(b.right-b.left)*.2),qx=Math.abs(px-(b.left+b.right)/2)-(b.right-b.left)/2+r,qy=Math.abs(py-(b.top+b.bottom)/2)-(b.bottom-b.top)/2+r;
    distance=Math.min(distance,Math.hypot(Math.max(qx,0),Math.max(qy,0))+Math.min(Math.max(qx,qy),0)-r);
   }
   base[y*width+x]=Math.exp(-Math.max(-softness*2,distance-2)/softness);
  }
  state={key,base,field:new Float32Array(base.length),width,height,left,top,scale};cache.set(slot,state);
 }
 state.field.set(state.base);
 const originX=anchor.x+left,originY=anchor.y+top,sigma=softness*.85;
 for(const dot of dots){
  const visibility=smooth(-.42,.78,Math.sin(time*dot.cycleSpeed+dot.cyclePhase))*(dot.territory??1);
  if(visibility<.03)continue;
  let near=Infinity;for(const b of boxes)near=Math.min(near,Math.hypot(Math.max(b.left-dot.x,dot.x-b.right,0),Math.max(b.top-dot.y,dot.y-b.bottom,0)));
  if(near>softness*5)continue;
  const proximity=1-smooth(softness*.5,softness*3,near);
  const radius=dot.radius*(1+(mergeScale-1)*proximity),support=radius+sigma*3;
  const cx=dot.x-originX,cy=dot.y-originY;
  const x0=Math.max(0,Math.floor((cx-support)/scale)),x1=Math.min(width-1,Math.ceil((cx+support)/scale));
  const y0=Math.max(0,Math.floor((cy-support)/scale)),y1=Math.min(height-1,Math.ceil((cy+support)/scale));
  if(x1<x0||y1<y0)continue;
  const amplitude=visibility*visibility*Math.exp(Math.min(8,radius*radius/(2*sigma*sigma)));
  const horizontal=new Float32Array(x1-x0+1);
  for(let x=x0;x<=x1;x++)horizontal[x-x0]=Math.exp(-((x*scale-cx)**2)/(2*sigma*sigma));
  for(let y=y0;y<=y1;y++){
   const rowDensity=amplitude*Math.exp(-((y*scale-cy)**2)/(2*sigma*sigma));
   for(let x=x0;x<=x1;x++){const i=y*width+x;state.field[i]+=smooth(.003,.06,state.base[i])*rowDensity*horizontal[x-x0];}
  }
 }
 return {field:state.field,width,height,originX,originY,scale};
}
