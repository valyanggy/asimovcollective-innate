"use client";
import { DITHER_FIELD_DEFAULTS, FIGURE_LED_DEFAULTS, type DitherFieldSettings } from '@/lib/dither-cells';
import styles from './dither-controls.module.css';

type DitherSliderKey = Exclude<keyof DitherFieldSettings, "showGrid" | "letterBlock" | "ledSize" | "neckEnd" | "neckWaist">;
type DitherGroup = { id: string; title: string; description: string; appearance?: boolean; controls: { key: DitherSliderKey; label: string; min: number; max: number; step: number; unit?: string }[] };
const groups: DitherGroup[] = [
  { id: 'rim', title: 'Rim layer', description: 'Controls how uploaded blocks scatter above and around the connected field.', controls: [
    {key:'rimCount',label:'Number',min:0,max:80,step:1},
    {key:'rimOffset',label:'Outward offset',min:0,max:48,step:1,unit:'px'},
    {key:'rimOffsetNoise',label:'Offset noise',min:0,max:48,step:1,unit:'px'},
    {key:'rimNoiseX',label:'X noise',min:0,max:48,step:1,unit:'px'},
    {key:'rimNoiseY',label:'Y noise',min:0,max:48,step:1,unit:'px'},
    {key:'rimSize',label:'Size',min:4,max:64,step:1,unit:'px'},
  ]},
  { id: 'join', title: 'Join shape', description: 'Join lobes rounds the joints between neighboring tiles, so a stair run reads as one wave. Straight walls stay where they are.', controls: [
    {key:'joinLobes',label:'Join lobes',min:0,max:100,step:1,unit:'%'},
  ]},
  { id: 'domain', title: 'Domain connection', description: 'Increase adhesion and reach to bring nearby domains together.', controls: [
    {key:'adhesion',label:'Adhesion · 粘连',min:0,max:6,step:.05},
    {key:'reach',label:'Influence reach',min:.6,max:6,step:.05},
  ]},
  { id: 'tone', title: 'Tone', appearance: true, description: 'Shape the dark area and how softly it fades into cells.', controls: [
    {key:'shadow',label:'Shadow area',min:.6,max:20,step:.05},
    {key:'contrast',label:'Contrast',min:.5,max:3,step:.05},
    {key:'softness',label:'Edge softness',min:.04,max:1.65,step:.01},
  ]},
  { id: 'shading', title: 'Shading', appearance: true, description: 'Light reveals the slopes and depths of the shared density field.', controls: [
    {key:'relief',label:'Surface relief',min:0,max:2,step:.05},
    {key:'lightAngle',label:'Light direction',min:0,max:360,step:5,unit:'°'},
  ]},
  { id: 'cells', title: 'Cells', appearance: true, description: 'Size changes each mark; spacing changes the distance between marks. Corner radius fillets free outer corners.', controls: [
    {key:'blockSize',label:'Block size',min:4,max:40,step:1,unit:'px'},
    {key:'spacing',label:'Cell spacing',min:6,max:36,step:1,unit:'px'},
    {key:'rounding',label:'Corner radius',min:0,max:50,step:1,unit:'%'},
  ]},
];

function withShadowMin(items: DitherGroup[], min: number): DitherGroup[] {
  return items.map(group => group.id !== "tone" ? group : {
    ...group,
    controls: group.controls.map(control => control.key === "shadow" ? { ...control, min } : control),
  });
}

function sliderGroups(
  items: DitherGroup[],
  value: DitherFieldSettings,
  onChange: (settings: DitherFieldSettings) => void,
  prefix: string,
  labelPrefix = "",
) {
  return items.map(group => <fieldset key={`${prefix}${group.id}`} className={styles.group}>
    <legend>{group.title}</legend><p>{group.description}</p>
    {group.controls.map(control => {
      const id = `dither-${prefix}${control.key}`;
      return <label key={control.key} className={styles.slider}>
        <span>{control.label}</span>
        <output htmlFor={id}>{value[control.key]}{control.unit ? ` ${control.unit}` : control.key === 'softness' || control.key === 'rimCount' ? '' : '×'}</output>
        <input id={id} type="range" min={control.min} max={control.max} step={control.step} value={value[control.key]}
          aria-label={`${labelPrefix}${control.label}`}
          onChange={e=>onChange({...value,[control.key]:Number(e.target.value)})}/>
      </label>;
    })}
  </fieldset>);
}

export function DitherControls({value,onChange,led,field,onReplay,defaults,gridOnly,rimBlocks,centerValue,onCenterChange}:{value:DitherFieldSettings;onChange:(settings:DitherFieldSettings)=>void;led?:boolean;field?:boolean;onReplay?:()=>void;defaults?:DitherFieldSettings;gridOnly?:boolean;rimBlocks?:boolean;centerValue?:DitherFieldSettings;onCenterChange?:(settings:DitherFieldSettings)=>void}) {
  const showField = gridOnly ? false : field ?? !led;
  const splitAppearance = Boolean(centerValue && onCenterChange);
  const shared = groups.filter(group => !group.appearance && (group.id !== 'rim' || rimBlocks));
  const appearance = groups.filter(group => group.appearance);
  return <section className={`${styles.panel} ${gridOnly ? styles.dock : ""}`} aria-label="Field adjustments">
    <label className={styles.toggle}>
      <input type="checkbox" checked={value.showGrid !== false}
        onChange={e=>onChange({...value,showGrid:e.target.checked})}/>
      {gridOnly ? "Dot grid" : led ? "Unlit LEDs" : "Default dot grid"}
    </label>
    {gridOnly ? null : <>
    {led && <label className={styles.slider}>
      <span>Circle size</span>
      <output htmlFor="dither-ledSize">{value.ledSize} %</output>
      <input id="dither-ledSize" type="range" min={12} max={100} step={1} value={value.ledSize}
        aria-label="Circle size" onChange={e=>onChange({...value,ledSize:Number(e.target.value)})}/>
    </label>}
    {led && <fieldset className={styles.group}>
      <legend>Connecting circles</legend>
      <p>End and Middle shape the neck and jointly set its maximum reach. Images beyond that distance do not connect.</p>
      <label className={styles.slider}>
        <span>Ends</span>
        <output htmlFor="dither-neckEnd">{value.neckEnd ?? 52} px</output>
        <input id="dither-neckEnd" type="range" min={12} max={300} step={1} value={value.neckEnd ?? 52}
          aria-label="Connecting circle size at the ends" onChange={e=>onChange({...value,neckEnd:Number(e.target.value)})}/>
      </label>
      <label className={styles.slider}>
        <span>Middle</span>
        <output htmlFor="dither-neckWaist">{value.neckWaist ?? 6} px</output>
        <input id="dither-neckWaist" type="range" min={2} max={48} step={1} value={value.neckWaist ?? 6}
          aria-label="Connecting circle size in the middle" onChange={e=>onChange({...value,neckWaist:Number(e.target.value)})}/>
      </label>
      <p>Current distance cutoff: {Math.round((value.neckEnd ?? 52) * 2.6 + (value.neckWaist ?? 6) * 4 + value.spacing * 2)} px</p>
    </fieldset>}
    {!led && <label className={styles.color}>
      <span>Letter blocks</span>
      <input type="color" value={/^#[0-9a-f]{6}$/i.test(value.letterBlock) ? value.letterBlock : "#111111"}
        aria-label="Letter block color" onChange={e=>onChange({...value,letterBlock:e.target.value})}/>
      <input type="text" spellCheck={false} value={value.letterBlock ?? "#111111"} aria-label="Letter block hex"
        onChange={e=>onChange({...value,letterBlock:e.target.value})}/>
    </label>}
    {showField && sliderGroups(shared, value, onChange, "")}
    {showField && splitAppearance && centerValue && onCenterChange && <>
      <div className={styles.appearanceBlock}>
        <p className={styles.appearanceLabel}>Center</p>
        <p className={styles.appearanceNote}>Tone, shading, and cells for the main image only.</p>
        {sliderGroups(withShadowMin(appearance, .1), centerValue, onCenterChange, "center-", "Center ")}
      </div>
      <div className={styles.appearanceBlock}>
        <p className={styles.appearanceLabel}>Surrounds</p>
        <p className={styles.appearanceNote}>Tone, shading, and cells for the orbiting images.</p>
        {sliderGroups(appearance, value, onChange, "surround-", "Surrounds ")}
      </div>
    </>}
    {showField && !splitAppearance && sliderGroups(appearance, value, onChange, "")}
    {onReplay && <button type="button" className={styles.replay} onClick={onReplay}>Replay sequence</button>}
    <button type="button" className={styles.reset} onClick={()=>{
      const next = {...(defaults ?? (led ? FIGURE_LED_DEFAULTS : DITHER_FIELD_DEFAULTS))};
      onChange(next);
      onCenterChange?.(next);
    }}>Reset field settings</button>
    </>}
  </section>;
}
