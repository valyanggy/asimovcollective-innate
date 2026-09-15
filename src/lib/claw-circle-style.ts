import { MathUtils } from 'three';
export const DEFAULT_GRANULARITY=115;
export const circleSpacing=(grain:number)=>MathUtils.lerp(.13,.05,(MathUtils.clamp(grain,35,220)-35)/185);
export const circleRadius=(spacing:number,scale:number,bleed=0)=>spacing*(.4+.42*scale)*(1-bleed*.25);
