"use client";
import type { LinkageSettings } from '@/lib/component-linkage';
import styles from './dendritic-layer.module.css';

export function DendriticControls({ settings, onChange }: { settings: LinkageSettings; onChange: (value: LinkageSettings) => void }) {
  const controls = [['step',6,30,1],['arch',0,1.5,.05],['tension',0,1.6,.05],['ring',0,30,.5],['bow',0,1,.05],['width',.25,4,.25],['opacity',.1,1,.05]] as const;
  return <details className={styles.controls}>
    <summary>Connection settings</summary>
    <p>Four components · one connected network</p>
    {controls.map(([key,min,max,step]) => <label key={key} className={styles.slider}>
      <span>{key.toUpperCase()}</span><output htmlFor={`linkage-${key}`}>{settings[key]}</output>
      <input id={`linkage-${key}`} type="range" min={min} max={max} step={step} value={settings[key]}
        onChange={e=>onChange({...settings,[key]:Number(e.target.value)})}/>
    </label>)}
    <label className={styles.toggle}><input type="checkbox" checked={settings.ringBlur} onChange={e=>onChange({...settings,ringBlur:e.target.checked})}/>Ring background blur</label>
    <label className={styles.toggle}><input type="checkbox" checked={settings.arcField} onChange={e=>onChange({...settings,arcField:e.target.checked})}/>08 arc field</label>
    <label className={styles.toggle}><input type="checkbox" checked={settings.nodes} onChange={e=>onChange({...settings,nodes:e.target.checked})}/>Show structural nodes</label>
  </details>;
}
