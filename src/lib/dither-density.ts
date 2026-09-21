import type { OccupancyLayer } from './dither-cells';
import type { Box } from './component-linkage';

type FieldDot = { x:number; y:number; radius:number; cycleSpeed:number; cyclePhase:number; territory?:number };
type LocalBox = Box & { left:number; top:number; right:number; bottom:number };
const clamp = (x:number)=>Math.max(0,Math.min(1,x));
const smooth=(a:number,b:number,x:number)=>{const t=clamp((x-a)/(b-a));return t*t*(3-2*t);};
const caches=new WeakMap<HTMLCanvasElement,Map<number,{key:string;base:Float32Array;field:Float32Array;width:number;height:number;left:number;top:number;scale:number}>>();

function boxPivot(box: Box) {
  return {
    x: box.pivotX ?? (box.left + box.right) / 2,
    y: box.pivotY ?? (box.top + box.bottom) / 2,
  };
}

function rotateAround(x: number, y: number, pivotX: number, pivotY: number, angle: number) {
  const dx = x - pivotX, dy = y - pivotY;
  const cos = Math.cos(angle), sin = Math.sin(angle);
  return { x: pivotX + dx * cos - dy * sin, y: pivotY + dx * sin + dy * cos };
}

function roundedBoxDistance(px: number, py: number, box: Box) {
  const pivot = boxPivot(box);
  const angle = box.angle ?? 0;
  const local = angle ? rotateAround(px, py, pivot.x, pivot.y, -angle) : { x: px, y: py };
  const center = angle
    ? rotateAround((box.left + box.right) / 2, (box.top + box.bottom) / 2, pivot.x, pivot.y, -angle)
    : { x: (box.left + box.right) / 2, y: (box.top + box.bottom) / 2 };
  const halfW = (box.right - box.left) / 2, halfH = (box.bottom - box.top) / 2;
  const radius = Math.min(4, (box.right - box.left) * .2);
  const qx = Math.abs(local.x - center.x) - halfW + radius;
  const qy = Math.abs(local.y - center.y) - halfH + radius;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - radius;
}

function rotatedBoxBounds(box: Box) {
  if (!box.angle) return { left: box.left, top: box.top, right: box.right, bottom: box.bottom };
  const pivot = boxPivot(box);
  const corners = [
    rotateAround(box.left, box.top, pivot.x, pivot.y, box.angle),
    rotateAround(box.right, box.top, pivot.x, pivot.y, box.angle),
    rotateAround(box.left, box.bottom, pivot.x, pivot.y, box.angle),
    rotateAround(box.right, box.bottom, pivot.x, pivot.y, box.angle),
  ];
  return {
    left: Math.min(...corners.map(corner => corner.x)),
    top: Math.min(...corners.map(corner => corner.y)),
    right: Math.max(...corners.map(corner => corner.x)),
    bottom: Math.max(...corners.map(corner => corner.y)),
  };
}

/** Stamp the same angle on every box, spinning the whole island around its center. */
export function withBoxRotation(boxes: Box[], degrees: number): Box[] {
  if (!degrees) return boxes;
  const angle = degrees * Math.PI / 180;
  const pivotX = (Math.min(...boxes.map(box => box.left)) + Math.max(...boxes.map(box => box.right))) / 2;
  const pivotY = (Math.min(...boxes.map(box => box.top)) + Math.max(...boxes.map(box => box.bottom))) / 2;
  return boxes.map(box => ({ ...box, angle, pivotX, pivotY }));
}

/** Only the stamp lattice samples this field. A coarse, bounded density buffer
 * avoids allocating millions of invisible pixels when influence reach is 6×. */
export function ditherDensity(canvas:HTMLCanvasElement,slot:number,boxes:Box[],anchor:{x:number;y:number},dots:FieldDot[],time:number,mergeScale:number,spacing:number):OccupancyLayer {
 const local:LocalBox[]=boxes.map(b=>({
  ...b,
  left:b.left-anchor.x,
  right:b.right-anchor.x,
  top:b.top-anchor.y,
  bottom:b.bottom-anchor.y,
  pivotX:b.pivotX===undefined?undefined:b.pivotX-anchor.x,
  pivotY:b.pivotY===undefined?undefined:b.pivotY-anchor.y,
 }));
 const softness=6.5*mergeScale;
 const pad=softness*5.5+20;
 const extents=local.map(rotatedBoxBounds);
 const left=Math.floor(Math.min(...extents.map(b=>b.left))-pad),top=Math.floor(Math.min(...extents.map(b=>b.top))-pad);
 const extentX=Math.max(...extents.map(b=>b.right))+pad-left,extentY=Math.max(...extents.map(b=>b.bottom))+pad-top;
 const scale=Math.max(3,Math.min(8,spacing/3),extentX/320,extentY/320);
 const width=Math.ceil(extentX/scale)+1,height=Math.ceil(extentY/scale)+1;
 const key=JSON.stringify([local,mergeScale,scale,width,height]);
 let cache=caches.get(canvas);if(!cache){cache=new Map();caches.set(canvas,cache);}
 let state=cache.get(slot);
 if(!state||state.key!==key){
  const base=new Float32Array(width*height);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
   const px=left+x*scale,py=top+y*scale;let distance=Infinity;
   for(const b of local) distance=Math.min(distance,roundedBoxDistance(px,py,b));
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
