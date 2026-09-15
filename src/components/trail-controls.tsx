"use client";
import {useEffect,useRef,useState} from 'react';
import {loadStampFile} from '@/lib/dither-cells';
import {TRAIL_BLOCKS,type TrailBlock,type TrailSettings} from '@/lib/domain-trails';
import styles from './cell-library.module.css';
import controls from './dither-controls.module.css';
export function TrailControls({value,onChange}:{value:TrailSettings;onChange:(v:TrailSettings)=>void}){
 const [blocks,setBlocks]=useState(value.blocks?.length?value.blocks:TRAIL_BLOCKS),[error,setError]=useState('');const urls=useRef(new Map<string,string>());
 useEffect(()=>{const allocated=urls.current;return()=>allocated.forEach(url=>URL.revokeObjectURL(url));},[]);
 async function add(files:FileList|null){if(!files)return;setError('');try{const added:TrailBlock[]=[];for(const file of Array.from(files)){const {image,url}=await loadStampFile(file),id=crypto.randomUUID();urls.current.set(id,url);added.push({id,label:file.name.replace(/\.[^.]+$/,''),image});}if(added.length){const next=[...blocks,...added];setBlocks(next);onChange({...value,blocks:next});}}catch(e){setError(e instanceof Error?e.message:'Could not add block.');}}
 const makePrimary=(block:TrailBlock)=>{const next=[block,...blocks.filter(item=>item.id!==block.id)];setBlocks(next);onChange({...value,block,blocks:next});};
 const removePrimary=()=>{if(blocks.length<=1)return;const removed=blocks[0],url=urls.current.get(removed.id);if(url)URL.revokeObjectURL(url);urls.current.delete(removed.id);const next=blocks.slice(1);setBlocks(next);onChange({...value,block:next[0],blocks:next});};
 const restore=()=>{urls.current.forEach(url=>URL.revokeObjectURL(url));urls.current.clear();setBlocks(TRAIL_BLOCKS);onChange({...value,block:TRAIL_BLOCKS[0],blocks:TRAIL_BLOCKS});};
 return <fieldset className={controls.group} style={{marginTop:20}}><legend>Drag trails</legend>
 <p>Footprints sit above the tonal field and directly beneath each label. The first block is primary; the others appear occasionally.</p>
 <label style={{display:'flex',gap:6,marginBottom:12}}><input type="checkbox" checked={value.enabled} onChange={e=>onChange({...value,enabled:e.target.checked})}/>Show drag trails</label>
 <div className={styles.cells} role="group" aria-label="Trail building blocks">{blocks.map(block=><button type="button" className={styles.cell} key={block.id} aria-pressed={block.id===blocks[0]?.id} onClick={()=>makePrimary(block)}>
 {block.image?<span aria-hidden="true">▧</span>:<span aria-hidden="true" style={{color:block.color,fontSize:25}}>{block.kind==='circle'?'●':'■'}</span>}<span>{block.label}</span></button>)}</div>
 <label className={styles.upload}><input type="file" aria-label="Add trail blocks" accept=".svg,.png,image/svg+xml,image/png" multiple onChange={e=>{void add(e.target.files);e.target.value='';}}/>Add trail blocks · SVG / PNG</label>
 <button type="button" className={styles.restore} disabled={blocks.length<=1} onClick={removePrimary}>Delete primary trail block</button>
 <button type="button" className={styles.restore} onClick={restore}>Restore trail blocks</button>
 {([{key:'size',label:'Trail block size',min:8,max:48,step:1,unit:'px'},{key:'lifetime',label:'Hold duration',min:1,max:12,step:.5,unit:'s'}] as const).map(c=><label className={controls.slider} key={c.key} style={{marginTop:12}}><span>{c.label}</span><output>{value[c.key]} {c.unit}</output><input id={`trail-${c.key}`} type="range" min={c.min} max={c.max} step={c.step} value={value[c.key]} onChange={e=>onChange({...value,[c.key]:Number(e.target.value)})}/></label>)}
 <button type="button" className={controls.reset} onClick={()=>onChange({...value,clear:value.clear+1})}>Clear trails</button>{error&&<p role="alert">{error}</p>}
 </fieldset>;
}
