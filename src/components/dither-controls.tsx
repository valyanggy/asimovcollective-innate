"use client";
import { DITHER_FIELD_DEFAULTS, FIGURE_LED_DEFAULTS, type DitherFieldSettings } from '@/lib/dither-cells';
import styles from './dither-controls.module.css';

type DitherSliderKey = Exclude<keyof DitherFieldSettings, "showGrid" | "letterBlock" | "ledSize">;
const groups: { title: string; description: string; controls: { key: DitherSliderKey; label: string; min: number; max: number; step: number; unit?: string }[] }[] = [
  { title: 'Domain connection', description: 'Increase adhesion and reach to bring nearby domains together.', controls: [
    {key:'adhesion',label:'Adhesion · 粘连',min:0,max:6,step:.05},
    {key:'reach',label:'Influence reach',min:.6,max:6,step:.05},
  ]},
  { title: 'Tone', description: 'Shape the dark area and how softly it fades into cells.', controls: [
    {key:'shadow',label:'Shadow area',min:.6,max:2,step:.05},
    {key:'contrast',label:'Contrast',min:.5,max:3,step:.05},
    {key:'softness',label:'Edge softness',min:.04,max:.65,step:.01},
  ]},
  { title: 'Shading', description: 'Light reveals the slopes and depths of the shared density field.', controls: [
    {key:'relief',label:'Surface relief',min:0,max:2,step:.05},
    {key:'lightAngle',label:'Light direction',min:0,max:360,step:5,unit:'°'},
  ]},
  { title: 'Cells', description: 'Size changes each mark; spacing changes the distance between marks.', controls: [
    {key:'blockSize',label:'Block size',min:4,max:40,step:1,unit:'px'},
    {key:'spacing',label:'Cell spacing',min:6,max:36,step:1,unit:'px'},
    {key:'rounding',label:'Corner radius',min:0,max:50,step:1,unit:'%'},
  ]},
];
export function DitherControls({value,onChange,led}:{value:DitherFieldSettings;onChange:(settings:DitherFieldSettings)=>void;led?:boolean}) {
  return <section className={styles.panel} aria-label="Field adjustments">
    <label className={styles.toggle}>
      <input type="checkbox" checked={value.showGrid !== false}
        onChange={e=>onChange({...value,showGrid:e.target.checked})}/>
      {led ? "Unlit LEDs" : "Default dot grid"}
    </label>
    {led && <label className={styles.slider}>
      <span>Circle size</span>
      <output htmlFor="dither-ledSize">{value.ledSize} %</output>
      <input id="dither-ledSize" type="range" min={12} max={100} step={1} value={value.ledSize}
        aria-label="Circle size" onChange={e=>onChange({...value,ledSize:Number(e.target.value)})}/>
    </label>}
    {!led && <label className={styles.color}>
      <span>Letter blocks</span>
      <input type="color" value={/^#[0-9a-f]{6}$/i.test(value.letterBlock) ? value.letterBlock : "#111111"}
        aria-label="Letter block color" onChange={e=>onChange({...value,letterBlock:e.target.value})}/>
      <input type="text" spellCheck={false} value={value.letterBlock ?? "#111111"} aria-label="Letter block hex"
        onChange={e=>onChange({...value,letterBlock:e.target.value})}/>
    </label>}
    {!led && groups.map(group=><fieldset key={group.title} className={styles.group}>
      <legend>{group.title}</legend><p>{group.description}</p>
      {group.controls.map(control=><label key={control.key} className={styles.slider}>
        <span>{control.label}</span><output htmlFor={`dither-${control.key}`}>{value[control.key]}{control.unit ? ` ${control.unit}` : control.key === 'softness' ? '' : '×'}</output>
        <input id={`dither-${control.key}`} type="range" min={control.min} max={control.max} step={control.step} value={value[control.key]}
          onChange={e=>onChange({...value,[control.key]:Number(e.target.value)})}/>
      </label>)}
    </fieldset>)}
    <button type="button" className={styles.reset} onClick={()=>onChange({...(led ? FIGURE_LED_DEFAULTS : DITHER_FIELD_DEFAULTS)})}>Reset field settings</button>
  </section>;
}
