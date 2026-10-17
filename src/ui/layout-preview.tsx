'use client';
import type { CSSProperties } from 'react';
import { useRef,useState } from 'react';
import type { Asset } from '@/lib/image-model';
import type { LayoutConfig,LayoutPlatform,LayoutVariant,LayoutBlock } from '@/lib/layout-model';
import { AssetImage } from './asset-image';
import { Button,Empty } from './components';
function Inline({text}:{text:string}){return <>{text.split(/(\*\*[^*]+\*\*)/g).map((part,i)=>part.startsWith('**')&&part.endsWith('**')?<strong key={i}>{part.slice(2,-2)}</strong>:part)}</>;}
function Block({block,assets}:{block:LayoutBlock;assets:Asset[]}){
  if(block.type==='image'){const asset=assets.find(a=>a.id===block.assetId);return asset?<figure><AssetImage src={`/api/images/assets/${encodeURIComponent(asset.id)}/file`} alt={asset.title}/>{block.text&&<figcaption>{block.text}</figcaption>}</figure>:<Empty>配图暂不可用，请重新选择</Empty>;}
  const content=<Inline text={block.text}/>;
  if(block.type==='heading')return <h3>{content}</h3>;
  if(block.type==='quote')return <blockquote>{content}</blockquote>;
  if(block.type==='list')return <ul>{block.text.split('\n').filter(Boolean).map((line,i)=><li key={i}><Inline text={line}/></li>)}</ul>;
  return <p>{content}</p>;
}
export function LayoutPreview({variant,platform,assets,config}:{variant:LayoutVariant;platform:LayoutPlatform;assets:Asset[];config:LayoutConfig}){
  const [slide,setSlide]=useState(0);
  const pointerStart=useRef<number|null>(null);
  const images=variant.blocks.filter(b=>b.type==='image');
  const active=Math.min(slide,Math.max(0,images.length-1));
  const style={'--article-size':`${config.style.bodySize}px`,'--article-leading':config.style.lineHeight,'--article-gap':`${config.style.paragraphGap}px`,'--article-heading':`${config.style.headingSize}px`} as CSSProperties;
  return <div className={`layout-preview layout-preview-${platform}`} style={style} aria-label={`${config.platforms.find(p=>p.id===platform)?.name}预览`}>
    <div className="layout-preview-caption mono">{config.platforms.find(p=>p.id===platform)?.preview}</div>
    {platform==='douyin'&&<div className="layout-gallery">
      <div className="layout-slide" onPointerDown={e=>{pointerStart.current=e.clientX;}} onPointerUp={e=>{if(pointerStart.current!==null){const delta=e.clientX-pointerStart.current;if(Math.abs(delta)>50)setSlide(Math.max(0,Math.min(images.length-1,active+(delta<0?1:-1))));}pointerStart.current=null;}} onPointerCancel={()=>{pointerStart.current=null;}} style={{aspectRatio:config.douyinImageRatio.replace(':','/')}}>{images[active]?<Block block={images[active]} assets={assets}/>:<Empty>尚未选择图文配图</Empty>}</div>
      <div className="layout-slide-controls"><Button aria-label="上一张配图" disabled={active===0} onClick={()=>setSlide(active-1)}>←</Button><span className="mono">{images.length?`${active+1} / ${images.length}`:'-- / --'}</span><Button aria-label="下一张配图" disabled={active>=images.length-1} onClick={()=>setSlide(active+1)}>→</Button></div>
    </div>}
    <article><h2>{variant.title||'尚未填写标题'}</h2>{variant.blocks.length?variant.blocks.filter(b=>platform!=='douyin'||b.type!=='image').map(b=><Block key={b.id} block={b} assets={assets}/>):<Empty>尚未填写正文</Empty>}</article>
  </div>;
}
