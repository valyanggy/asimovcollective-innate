import { Vector3 } from 'three';
import type { PatternCell } from './fringe-pattern';
export const DECISION_LABELS=['TRACK','ALIGN','DEPTH OK','REPLAN','GRIP?','HOLD','CHECK','AVOID','REACH','CENTER','EDGE','STABLE','0.92','Δ 0.03','12 mm','0.4 N','94%','x −0.2','42 ms','0.08 m','P 0.86','θ 12°','v 0.04','ID 017'];
export type DecisionTag={position:Vector3;variant:number;width:number;cells:string[]};
function hash(x:number,y:number){let n=Math.imul(x+641,73856093)^Math.imul(y+237,19349663);n=Math.imul(n^(n>>>16),0x45d9f3b);return (n^(n>>>16))>>>0;}
/** Fixed slots keep label/color identities steady while the black proximity mask changes. */
export function layoutDecisionTags(marks:PatternCell[],right=new Vector3(1,0,0),spacing=.055):DecisionTag[]{
 const lookup=new Map(marks.filter(m=>!m.echo).map(m=>[`${m.column}:${m.row}`,m]));
 const tags:DecisionTag[]=[],used=new Set<string>();
 for(const cell of [...lookup.values()].sort((a,b)=>a.row-b.row||a.column-b.column)){
  const offset=((cell.row%2)+2)%2*3;
  if(((cell.column-offset)%7+7)%7!==0)continue;
  const seed=hash(cell.column,cell.row);
  if(seed%100>78)continue;
  const variant=seed%(DECISION_LABELS.length*2),label=DECISION_LABELS[variant%DECISION_LABELS.length];
  const width=Math.max(3,Math.ceil(label.length*.54+1));
  const leftBleed=seed%4===0?2:0;
  const cells=Array.from({length:width},(_,i)=>`${cell.column+i-leftBleed}:${cell.row}`);
  const supported=cells.filter(k=>lookup.has(k)).length;
  if(supported<Math.max(2,width-2)||cells.some(k=>used.has(k)))continue;
  cells.forEach(k=>used.add(k));
  const position=cell.position.clone().addScaledVector(right,((width-1)/2-leftBleed)*spacing);
  tags.push({position,variant,width,cells});
 }
 return tags;
}
