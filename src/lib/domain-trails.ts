import { roundedGridUnionPath } from './dither-cells';
export type TrailBlock={id:string;label:string;kind?:'square'|'circle';color?:string;image?:CanvasImageSource};
export type TrailSettings={enabled:boolean;size:number;lifetime:number;opacity:number;clear:number;block:TrailBlock;blocks:TrailBlock[]};
export const TRAIL_BLOCKS:TrailBlock[]=[{id:'square',label:'Solid square',kind:'square',color:'#ff5a00'},{id:'pale-square',label:'Pale square',kind:'square',color:'#9c83c8'},{id:'circle',label:'Circle',kind:'circle',color:'#ff5a00'}];
export const TRAIL_DEFAULTS:TrailSettings={enabled:true,size:24,lifetime:4,opacity:1,clear:0,block:TRAIL_BLOCKS[0],blocks:TRAIL_BLOCKS};
type Point={x:number;y:number};
type Box={left:number;top:number;right:number;bottom:number};
type TrailCell=Point&{born:number};
const histories=new WeakMap<HTMLCanvasElement,{key:string;anchors:Point[];cells:Map<string,TrailCell>}>();
function drawRoundedUnion(ctx:CanvasRenderingContext2D,cells:Point[],step:number,color:string,rounding:number,opacity:number){
 if(!cells.length)return;
 const grid=cells.map(cell=>({column:Math.round(cell.x/step-.5),row:Math.round(cell.y/step-.5)}));
 ctx.save();ctx.globalAlpha=opacity;ctx.fillStyle=color;
 ctx.fill(roundedGridUnionPath(grid,step,step,step*Math.min(.5,rounding/100)),'nonzero');ctx.restore();
}
const inside=(boxes:Box[],x:number,y:number,padding:number)=>boxes.some(box=>x>=box.left-padding&&x<=box.right+padding&&y>=box.top-padding&&y<=box.bottom+padding);
const hash=(column:number,row:number)=>{
 let value=Math.imul(column+0x6d2b79f5,row+0x1b873593);value=Math.imul(value^(value>>>15),value|1);
 return ((value^(value>>>14))>>>0)/4294967296;
};
function paletteFor(settings:TrailSettings){
 const available=settings.blocks?.length?settings.blocks:[settings.block];
 return [settings.block,...available.filter(block=>block.id!==settings.block.id)];
}
function blockAt(settings:TrailSettings,x:number,y:number,step:number){
 const palette=paletteFor(settings);if(palette.length===1)return palette[0];
 const column=Math.round(x/step),row=Math.round(y/step),choice=hash(column,row);
 if(choice<.82)return palette[0];
 return palette[1+Math.floor(hash(row+97,column+193)*(palette.length-1))];
}
export function drawDomainTrails(canvas:HTMLCanvasElement,ctx:CanvasRenderingContext2D,boxGroups:Box[][],anchors:Point[],settings:TrailSettings,rounding=32){
 const now=performance.now(),bounds=canvas.getBoundingClientRect(),step=settings.size;
 const key=`${canvas.width}:${canvas.height}:${step}:${settings.clear}:${settings.enabled}`;
 let history=histories.get(canvas);
 if(!history||history.key!==key){history={key,anchors:anchors.map(p=>({...p})),cells:new Map()};histories.set(canvas,history);}
 if(!settings.enabled){canvas.dataset.trailCells='0';canvas.dataset.trailLiveCells='0';canvas.dataset.trailPaletteCounts='[]';return;}
 for(let i=0;i<anchors.length;i++){
  const old=history.anchors[i],current=anchors[i],boxes=boxGroups[i];if(!old||!boxes?.length)continue;
  const dx=current.x-old.x,dy=current.y-old.y,distance=Math.hypot(dx,dy);
  if(distance<step*.15)continue;
  const samples=Math.min(16,Math.max(1,Math.ceil(distance/(step*.7))));
  for(let sample=0;sample<samples;sample++){
   const offsetX=dx*(1-sample/samples),offsetY=dy*(1-sample/samples);
   const padding=step*.24;
   const x0=Math.max(0,Math.floor((Math.min(...boxes.map(box=>box.left))-padding-offsetX)/step)),x1=Math.min(Math.ceil(bounds.width/step),Math.ceil((Math.max(...boxes.map(box=>box.right))+padding-offsetX)/step));
   const y0=Math.max(0,Math.floor((Math.min(...boxes.map(box=>box.top))-padding-offsetY)/step)),y1=Math.min(Math.ceil(bounds.height/step),Math.ceil((Math.max(...boxes.map(box=>box.bottom))+padding-offsetY)/step));
   for(let row=y0;row<y1;row++)for(let col=x0;col<x1;col++){
    const x=(col+.5)*step,y=(row+.5)*step;
    if(!inside(boxes,x+offsetX,y+offsetY,padding))continue;
    history.cells.set(`${col}:${row}`,{x,y,born:now-(1-sample/samples)*70});
   }
  }
  history.anchors[i]={...current};
 }
 // Bounded by viewport cells; no frame-image accumulation or permanent paint.
 // Historical cells fade first. The live domain footprint is then painted at
 // full trail opacity so it becomes a clean plate directly beneath the type.
 ctx.save();const life=settings.lifetime*1000;
 const drawBlock=(x:number,y:number,block:TrailBlock)=>{
  ctx.globalAlpha=1;const r=step/2;
  if(block.image)ctx.drawImage(block.image,x-r,y-r,step,step);
  else {ctx.fillStyle=block.color??'#ff5a00';if(block.kind==='circle'){ctx.beginPath();ctx.arc(x,y,r*.85,0,Math.PI*2);ctx.fill();}else ctx.fillRect(x-r,y-r,step,step);}
 };
 for(const [id,cell] of history.cells){
  const age=(now-cell.born)/life;if(age>=1){history.cells.delete(id);continue;}
  drawBlock(cell.x,cell.y,blockAt(settings,cell.x,cell.y,step));
 }
 const columns=Math.ceil(bounds.width/step),rows=Math.ceil(bounds.height/step),live:Point[]=[];
 for(let row=0;row<rows;row++)for(let col=0;col<columns;col++){
  const x=(col+.5)*step,y=(row+.5)*step;
  if(!boxGroups.some(boxes=>inside(boxes,x,y,step*.24)))continue;
  live.push({x,y});
 }
 ctx.restore();
 const palette=paletteFor(settings),primary=palette[0],paletteCounts=palette.map(()=>0);
 for(const cell of live){const block=blockAt(settings,cell.x,cell.y,step);paletteCounts[Math.max(0,palette.findIndex(item=>item.id===block.id))]++;}
 if(!primary.image&&primary.kind!=='circle'){
  drawRoundedUnion(ctx,live,step,primary.color??'#ff5a00',rounding,1);
  ctx.save();for(const cell of live){const block=blockAt(settings,cell.x,cell.y,step);if(block.id!==primary.id)drawBlock(cell.x,cell.y,block);}ctx.restore();
 }else {ctx.save();for(const cell of live)drawBlock(cell.x,cell.y,blockAt(settings,cell.x,cell.y,step));ctx.restore();}
 canvas.dataset.trailCells=String(history.cells.size);canvas.dataset.trailLiveCells=String(live.length);canvas.dataset.trailPaletteCounts=JSON.stringify(paletteCounts);
}
