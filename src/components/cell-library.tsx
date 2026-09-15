"use client";
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { loadToneLibrary, loadStampFile, TONAL_LIBRARY, type DitherStamp, type ToneCell, type ToneLibrary } from '@/lib/dither-cells';
import styles from './cell-library.module.css';

function CellPreview({ cell }: { cell: ToneCell }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    element.width = element.height = 44 * ratio;
    const ctx = element.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(ratio,0,0,ratio,0,0);
    ctx.clearRect(0,0,44,44); ctx.drawImage(cell.image,0,0,44,44);
  },[cell]);
  return <canvas className={styles.preview} ref={canvas} aria-hidden="true"/>;
}

export function CellLibrary({ value, onChange, children, library = TONAL_LIBRARY }: { value:DitherStamp; onChange:(stamp:DitherStamp)=>void; children?:ReactNode; library?: ToneLibrary }) {
  const [selected,setSelected] = useState(library.cells[0]?.id ?? '');
  const [error,setError] = useState('');
  const [loading,setLoading] = useState(true);
  const defaults = useRef<ToneCell[]>([]);
  const urls = useRef(new Map<string,string>());
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    let cancelled = false;
    setLoading(true); setSelected(library.cells[0]?.id ?? '');
    loadToneLibrary(library).then(cells => {
      if (cancelled) return;
      defaults.current = cells;
      onChange({id:library.id,ramp:cells}); setLoading(false);
    }).catch(e=>{if(!cancelled){setError(e.message);setLoading(false);}});
    const allocated = urls.current;
    return () => {cancelled=true;allocated.forEach(url=>URL.revokeObjectURL(url));allocated.clear();};
  },[library,onChange]);
  const cells = value.ramp ?? [];
  const current = useRef(cells);
  current.current = cells;
  const chosen = cells.find(cell=>cell.id===selected);
  const add = async (files?: FileList | null) => {
    if (!files || !cells.length) return;
    setError('');
    const additions: ToneCell[] = [];
    for (const file of Array.from(files)) {
      try {
        const {image,url} = await loadStampFile(file);
        const probe = document.createElement('canvas'); probe.width=probe.height=32;
        const ctx=probe.getContext('2d')!;
        ctx.fillStyle='#fff';ctx.fillRect(0,0,32,32);ctx.drawImage(image,0,0,32,32);
        const pixels=ctx.getImageData(0,0,32,32).data;let luminance=0;
        for(let i=0;i<pixels.length;i+=4)luminance+=.2126*pixels[i]+.7152*pixels[i+1]+.0722*pixels[i+2];
        let level=Math.max(.005,Math.min(.995,(.895-luminance/(32*32*255))/.409));
        while([...current.current,...additions].some(c=>Math.abs(c.level-level)<.0001))level=level>.99?level-.0002:level+.0002;
        const id=crypto.randomUUID(); urls.current.set(id,url);
        additions.push({id,label:file.name.replace(/\.[^.]+$/,''),level,image,joins:false});
      } catch(e) {setError(e instanceof Error?e.message:'Could not add this cell.');}
    }
    if(additions.length){onChange({id:library.id,ramp:[...current.current,...additions].sort((a,b)=>a.level-b.level)});setSelected(additions[additions.length-1].id);}
    if(input.current)input.current.value='';
  };
  const update = (patch: Partial<ToneCell>) => {
    onChange({id:library.id,ramp:cells.map(c=>c.id===selected?{...c,...patch}:c).sort((a,b)=>a.level-b.level)});
  };
  const remove = () => {
    const url=urls.current.get(selected);if(url)URL.revokeObjectURL(url);urls.current.delete(selected);
    const remaining=cells.filter(c=>c.id!==selected);
    onChange({id:library.id,ramp:remaining});setSelected(remaining[0]?.id??'');
  };
  const reset = () => {
    urls.current.forEach(url=>URL.revokeObjectURL(url));urls.current.clear();setSelected(library.cells[0]?.id??'');
    onChange({id:library.id,ramp:[...defaults.current]});
  };
  return <details className={styles.library} open aria-label="Cell library">
    <summary className={styles.summary}>Cell &amp; field settings</summary>
    <p className={styles.heading}>{library.title}</p>
    <p className={styles.note}>Blocks work together from light to dark. Add new SVGs or PNGs; the original set stays in the library.</p>
    {loading && <p role="status">Loading your five cells…</p>}
    <div className={styles.cells} role="group" aria-label="Tonal ramp">
      {cells.map((cell)=><button key={cell.id} type="button" className={styles.cell} aria-label={cell.label} aria-pressed={selected===cell.id} onClick={()=>setSelected(cell.id)}>
        <CellPreview cell={cell}/><span>{cell.label}</span>
      </button>)}
    </div>
    <label className={styles.upload}>
      <input ref={input} disabled={!cells.length} type="file" aria-label="Add domain blocks" multiple accept=".svg,.png,image/svg+xml,image/png" onChange={e=>add(e.target.files)}/>
      Add domain blocks · SVG / PNG
    </label>
    {chosen && <div style={{marginTop:12}}>
      <label style={{display:'grid',gap:6}}>Tone position · {Math.round(chosen.level*100)}%
        <input aria-label="Selected block tone position" type="range" min={0} max={100} step={1} value={chosen.level*100} onChange={e=>update({level:Number(e.target.value)/100})}/>
      </label>
      <label style={{display:'flex',gap:6,marginTop:8}}><input type="checkbox" checked={Boolean(chosen.joins)} onChange={e=>update({joins:e.target.checked})}/>Join neighboring tile edges</label>
      <button type="button" className={styles.restore} disabled={cells.length<=1} onClick={remove}>Delete block</button>
    </div>}
    <button className={styles.restore} type="button" onClick={reset}>Restore default cells</button>
    {error && <p className={styles.error} role="alert">{error}</p>}
    {children}
  </details>;
}
