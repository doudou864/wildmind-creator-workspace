// 视频号微前端把可见控件放在 empty.html 的文档中；语义点击在当前页面会误判为不可见。
// 使用实际控件的布局位置点击，不调用平台接口，也不执行平台内部函数。
export const channelsActionsScript = String.raw`
async function channelsClick(selector,text,index){
 const point=await p.evaluate(({selector,text,index})=>{
  const docs=[document,...Array.from(document.querySelectorAll('iframe')).flatMap(f=>{try{return f.contentDocument?[f.contentDocument]:[];}catch{return [];}})];
  const matches=[...new Set(docs.flatMap(d=>Array.from(d.querySelectorAll(selector))))].filter(e=>e.getBoundingClientRect().width>0&&(text===null||e.textContent.trim()===text));
  if(index===null&&matches.length!==1)throw Error('视频号控件无法唯一识别：'+selector+' '+text);
  const e=matches[index??0];if(!e)throw Error('视频号控件不存在：'+selector);
  if(e.disabled||e.getAttribute('aria-disabled')==='true'||e.classList.contains('weui-desktop-btn_disabled'))throw Error('视频号控件尚未可用：'+text);
  e.scrollIntoView({block:'center',behavior:'instant'});
  const r=e.getBoundingClientRect(),f=e.ownerDocument.defaultView?.frameElement?.getBoundingClientRect();
  return {x:r.x+r.width/2+(f?.width?f.x:0),y:r.y+r.height/2+(f?.height?f.y:0)};
 },{selector,text:text??null,index:index??null});
 await p.mouse.click(point.x,point.y);
}
async function channelsWaitDialog(title,present){
 await p.waitForFunction(({title,present})=>{
  const docs=[document,...Array.from(document.querySelectorAll('iframe')).flatMap(f=>{try{return f.contentDocument?[f.contentDocument]:[];}catch{return [];}})];
  const found=docs.some(d=>Array.from(d.querySelectorAll('h3,h2,h4')).some(e=>e.getBoundingClientRect().width>0&&e.textContent.trim()===title));
  return found===present;
 },{title,present},{timeout:15000});
}
`;
