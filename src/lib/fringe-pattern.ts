import * as THREE from 'three';
export type PatternCell = { position: THREE.Vector3; echo: boolean; overlay?: boolean; column: number; row: number };
export type FringeSymbol = { position: THREE.Vector3; shape: number; span: number; cells: string[]; shade: number };
function hash(x:number,y:number){let n=Math.imul(x+317,73856093)^Math.imul(y+911,19349663);n=Math.imul(n^(n>>>16),0x45d9f3b);return (n^(n>>>16))>>>0;}

/** Pack marks only into occupied black cells; never extend them into the knight or the grey echo. */
export function fringeSymbols(marks:PatternCell[]):FringeSymbol[]{
 const lookup=new Map(marks.filter(m=>!m.echo).map(m=>[`${m.column}:${m.row}`,m]));
 const used=new Set<string>(),symbols:FringeSymbol[]=[];
 const ordered=[...lookup.values()].sort((a,b)=>a.row-b.row||a.column-b.column);
 for(const cell of ordered){
  const key=`${cell.column}:${cell.row}`,seed=hash(cell.column,cell.row);
  if(used.has(key)||seed%100>61)continue;
  const footprint=[key,`${cell.column+1}:${cell.row}`,`${cell.column}:${cell.row+1}`,`${cell.column+1}:${cell.row+1}`];
  const large=seed%7===0&&footprint.every(k=>lookup.has(k)&&!used.has(k));
  const keys=large?footprint:[key];keys.forEach(k=>used.add(k));
  const position=new THREE.Vector3();keys.forEach(k=>position.add(lookup.get(k)!.position));position.multiplyScalar(1/keys.length);
  symbols.push({position,shape:(seed>>>8)%4,span:large?2:1,cells:keys,shade:seed%9===0?.26:1});
 }
 return symbols;
}
