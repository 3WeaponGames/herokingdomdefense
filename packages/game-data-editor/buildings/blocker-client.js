'use strict';
const Guides=require('./connection-guides');
const Renderer=require('../worlds/building-renderer'),Paint=require('../worlds/paint'),Maps=require('../lib/map-assets'),Clip=require('../worlds/blockers'),Shadow=require('../../../assets/_script/BuildingShadow');
const Handles=require('./polygon-handles'),clone=value=>JSON.parse(JSON.stringify(value));
function mount(host,api){
 const state=api.state||{},make=(tag,text)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;return e;};
 host=host.appendChild(make('div'));host.className='bld-blocker';
 const tools=make('div'),canvas=make('canvas'),status=make('p'),help=make('p');tools.className='bld-blocker-tools';canvas.className='bld-blocker-canvas';canvas.width=900;canvas.height=430;canvas.tabIndex=0;if(state.previewHeight)canvas.style.height=state.previewHeight+'px';
 help.className=status.className='bld-blocker-help';
 host.appendChild(tools);const guideNote=make('p');guideNote.className='bld-blocker-help';guideNote.hidden=true;host.appendChild(guideNote);host.appendChild(canvas);host.appendChild(help);host.appendChild(status);
 let layer=['shadow','scale'].includes(state.layer)?state.layer:'blocker';
 const mode=make('select');mode.setAttribute('aria-label','Edit layer');for(const [id,label]of [['blocker','Blocker'],['shadow','Shadow'],['scale','Scale']]){const o=make('option',label);o.value=id;mode.appendChild(o);}mode.value=layer;tools.appendChild(mode);
 if(!canvas.getContext)return {destroy(){}};
 let closed=false,data,images={},value,values,layerParts=[],points=state.points||[],pointer=null,busy=false,frame=null,opacityDraft=null,scaleClient=null,drag=null,pan=null,dropPreview=null;
 let scale=1,zoom=state.zoom||1,cx=0,cy=0,tool=state.tool||'paint',partKey=state.part||'body',instance=state.instance||0;
 const resizer=require('./preview-resize').mount(canvas,state);
 const g=canvas.getContext('2d'),renderer=Renderer.create({onLoad:draw,onError:error=>message(error.message,true)}),building={x:0,y:0,scale:1,angle:0};
 function message(text,error){status.textContent=text;status.className='bld-blocker-help'+(error?' error':'');}
 function action(label,run){const b=make('button',label);b.type='button';b.onclick=run;tools.appendChild(b);return b;}
 const add=action('Polygon blocker',()=>choose('paint')),erase=action('Polygon erase',()=>choose('erase'));
 const clear=action('Clear blocker',()=>{if(!value||busy)return;releaseDrag();const next=clone(value);for(const p of layerParts)next[p.key]=Object.assign({},next[p.key],layer==='shadow'?{mask:[]}:{mask:[],polygons:[]});points=[];pointer=null;commit(next);});
 action('Cancel polygon',()=>{releaseDrag();points=[];pointer=null;draw();});
 action('Fit preview',()=>{zoom=1;fit();});
 action('Duplicate to all tiers',async()=>{if(busy||!value)return;endPan(false);releaseDrag();busy=true;try{await api.onDuplicate(layer);if(!closed)message('Copied to the other tiers in this family. Save changes to apply.');}catch(error){if(!closed)message(error.message,true);}finally{busy=false;}});
 const opacityLabel=make('label','Shadow opacity'),opacity=make('input'),opacityText=make('output');opacityLabel.className='bld-shadow-opacity';opacity.type='range';opacity.min='0';opacity.max='100';opacity.step='.1';opacity.setAttribute('aria-label','Shadow opacity');opacityLabel.appendChild(opacity);opacityLabel.appendChild(opacityText);tools.appendChild(opacityLabel);
 opacity.oninput=()=>{if(!value||busy)return;opacityDraft=Math.max(0,Math.min(1,Number(opacity.value)/100));opacityText.textContent=(opacityDraft*100).toFixed(1)+'%';draw();};
 opacity.onchange=()=>{if(!value||busy)return;const amount=opacityDraft===null?Number(opacity.value)/100:opacityDraft;opacityDraft=null;if(Math.abs(amount*100-Number((value.opacity*100).toFixed(1)))<.0001){draw();return;}const next=clone(value);next.opacity=amount;commit(next);};
 const parts=make('select');parts.setAttribute('aria-label','Shape part');parts.onchange=()=>{endPan(false);releaseDrag();partKey=parts.value;instance=0;points=[];pointer=null;refreshCopies();draw();};tools.appendChild(parts);
 const copies=make('select');copies.setAttribute('aria-label','Edit connection point');copies.onchange=()=>{endPan(false);releaseDrag();instance=Number(copies.value);points=[];pointer=null;draw();};tools.appendChild(copies);
 const scaleHost=make('div');host.appendChild(scaleHost);
 const shadowTool=make('select');shadowTool.setAttribute('aria-label','Shadow source');for(const [id,label]of [['texture','Texture shadow'],['polygon','Manual polygon mask']]){const option=make('option',label);option.value=id;shadowTool.appendChild(option);}shadowTool.value=state.shadowTool||'texture';tools.appendChild(shadowTool);
 const styleHost=make('div');host.insertBefore(styleHost,canvas);const dropClient=require('./drop-shadow-client').mount(styleHost,{onChange:action=>api.onShadowStyle(action),onPreview:(params,mode)=>{dropPreview=mode==='none'?null:Object.assign({},params);draw();}});
 shadowTool.onchange=async()=>{releaseDrag();points=[];state.shadowTool=shadowTool.value;syncMode();draw();try{const next=await api.onShadowStyle({kind:'source',source:shadowTool.value});if(!closed)dropClient.setData(next);}catch(error){if(!closed)message(error.message,true);}};
 function textureMode(){return layer==='shadow'&&shadowTool.value==='texture';}
 function part(){return layerParts.find(p=>p.key===partKey);}
 function matrix(){const p=part();return p&&p.instances[instance];}
 function refreshCopies(){copies.textContent='';const p=part();instance=Math.min(instance,Math.max(0,(p&&p.instances.length||0)-1));const labels=Guides.entries(p,layerParts);(labels.length?labels:(p&&p.instances||[]).map((_m,index)=>({index,label:'Copy '+(index+1)}))).forEach(item=>{const o=make('option',item.label);o.value=String(item.index);copies.appendChild(o);});copies.value=String(instance);copies.hidden=!p||p.instances.length<2;}
 function guideView(){return{width:canvas.width,height:canvas.height,scale:scale*zoom,cx,cy};}
 function pickConnection(event){if(event.button!==0||textureMode()||busy||points.length||layer==='scale'||layerParts.length<2)return false;const b=canvas.getBoundingClientRect(),point={x:(event.clientX-b.left-canvas.clientLeft)*canvas.width/canvas.clientWidth,y:(event.clientY-b.top-canvas.clientTop)*canvas.height/canvas.clientHeight},index=Guides.hit(part(),layerParts,guideView(),point);if(index===null)return false;event.preventDefault();copies.value=String(index);copies.onchange();canvas.focus();return true;}
 function syncMode(){
  const scaling=layer==='scale';guideNote.hidden=scaling||layerParts.length<2;canvas.hidden=help.hidden=status.hidden=scaling;for(const child of tools.children)if(child!==mode)child.hidden=scaling;
  scaleHost.hidden=!scaling;
  styleHost.hidden=!textureMode();shadowTool.hidden=layer!=='shadow';
  for(const button of tools.querySelectorAll('button'))if(button.textContent!=='Fit preview')button.hidden=scaling||textureMode();
  if(scaling&&!scaleClient){state.scaleView=state.scaleView||{};scaleClient=require('./scale-client').mount(scaleHost,{ipc:api.ipc,request:api.request,state:state.scaleView,onChange:next=>api.onChange(next,'scale')});}
  if(!scaling&&scaleClient){scaleClient.destroy();scaleClient=null;}
  canvas.setAttribute('aria-label',layer==='shadow'?'Building shadow preview':'Building blocker preview');
  add.textContent=layer==='shadow'?'Polygon shadow':'Polygon blocker';clear.textContent=layer==='shadow'?'Clear shadow':'Clear blocker';
  opacityLabel.hidden=layer!=='shadow'||textureMode();if(value&&layer==='shadow'){opacity.value=String(value.opacity*100);opacityText.textContent=(value.opacity*100).toFixed(1)+'%';}
  help.textContent='Click polygon points, then double-click or click the first point to finish. Drag round corner handles or square edge handles to reshape a completed polygon. Enter completes; Escape cancels. '+(layer==='shadow'?'Shadows use a translucent black texture mask; blockers are hidden.':'Yellow is blocked; shadows are hidden.')+' Cyan marks the selected copy. Matching numbered markers identify each piece. Wheel to zoom; hold middle mouse to pan.';
  parts.textContent='';for(const p of layerParts){const o=make('option',Guides.title(p));o.value=p.key;parts.appendChild(o);}if(layerParts.length&&!part())partKey=layerParts[0].key;parts.value=partKey;parts.hidden=scaling||layerParts.length<2;refreshCopies();if(scaling)copies.hidden=true;
  if(textureMode()){parts.hidden=copies.hidden=guideNote.hidden=true;help.textContent='The shadow follows the visible building artwork. Wheel to zoom; hold middle mouse to pan. Changes stay in the draft until Save.';}
 }
 mode.onchange=()=>{if(busy||!values){mode.value=layer;return;}endPan(false);releaseDrag();layer=mode.value;state.layer=layer;value=values[layer==='scale'?'blocker':layer];layerParts=layer==='shadow'?data.shadowParts:data.parts;points=[];pointer=null;opacityDraft=null;instance=0;syncMode();draw();message('Editing '+layer+'. Changes stay in the shared draft until Save.');};
 function choose(next,reset=true){releaseDrag();tool=next;if(reset){points=[];pointer=null;}add.className=next==='paint'?'active':'';erase.className=next==='erase'?'active':'';draw();}
 function local(event){const b=canvas.getBoundingClientRect(),world={x:((event.clientX-b.left-canvas.clientLeft)*canvas.width/canvas.clientWidth-canvas.width/2)/(scale*zoom)+cx,y:-((event.clientY-b.top-canvas.clientTop)*canvas.height/canvas.clientHeight-canvas.height/2)/(scale*zoom)+cy};return Maps.point(Maps.inverse(matrix()),world);}
 function screenDistance(a,b){const m=matrix(),p=Maps.point(m,a),q=Maps.point(m,b);return Math.hypot(p.x-q.x,p.y-q.y)*scale*zoom;}
 async function commit(next){
  if(JSON.stringify(next)===JSON.stringify(value)){draw();return;}
  const before=value;value=values[layer]=next;busy=true;draw();message('Updating shared '+layer+' draft…');
  try{await api.onChange(next,layer);if(!closed)message('Draft updated. Save changes to apply it to gameplay.');}
  catch(error){if(!closed){value=values[layer]=before;syncMode();message(error.message,true);draw();}}
  finally{busy=false;}
 }
 function finish(){if(busy||!value)return;try{const shape=Clip.polygonBrush(points),next=clone(value),mask=Clip.combineMask(value[partKey].mask,shape,tool);next[partKey]=Object.assign({},next[partKey],layer==='shadow'?{mask}:{mask,polygons:Clip.collisionPolygons(mask)});points=[];pointer=null;commit(next);}catch(error){message(error.message,true);draw();}}
 function releaseDrag(){const old=drag;drag=null;if(old&&canvas.hasPointerCapture&&canvas.hasPointerCapture(old.id))canvas.releasePointerCapture(old.id);return old;}
 function endPan(cancel){const old=pan;pan=null;if(!old)return;if(cancel){cx=old.cx;cy=old.cy;}if(canvas.hasPointerCapture&&canvas.hasPointerCapture(old.id))canvas.releasePointerCapture(old.id);canvas.style.cursor='crosshair';draw();}
 function editHandles(){return !textureMode()&&!points.length&&value&&value[partKey]?Handles.handles(value[partKey].mask):[];}
 function hitHandle(p){return editHandles().map(h=>({h,d:screenDistance(h,p)})).filter(h=>h.d<=9).sort((a,b)=>a.d-b.d||Number(a.h.edge)-Number(b.h.edge))[0];}
 canvas.onpointerdown=event=>{
  if(pickConnection(event))return;
  if(event.button===1&&data&&!drag&&!pan){event.preventDefault();canvas.focus();pan={id:event.pointerId,x:event.clientX,y:event.clientY,cx,cy};canvas.style.cursor='grabbing';if(canvas.setPointerCapture)canvas.setPointerCapture(event.pointerId);return;}
  if(event.button!==0||textureMode()||busy||drag||pan||!matrix())return;canvas.focus();event.preventDefault();
  const p=local(event);
  const hit=hitHandle(p);if(hit){drag={id:event.pointerId,handle:hit.h,start:p,mask:clone(value[partKey].mask),next:null};if(canvas.setPointerCapture)canvas.setPointerCapture(event.pointerId);pointer=null;draw();return;}
  if(points.length>=3&&screenDistance(points[0],p)<10){finish();return;}
  // The second click of a double-click is consumed by ondblclick below.
  if(event.detail>1)return;
  if(!points.length||screenDistance(points[points.length-1],p)>2)points.push(p);
  pointer=p;draw();
 };
 canvas.onpointermove=event=>{if(pan){if(pan.id!==event.pointerId)return;event.preventDefault();cx=pan.cx-(event.clientX-pan.x)*canvas.width/canvas.clientWidth/(scale*zoom);cy=pan.cy+(event.clientY-pan.y)*canvas.height/canvas.clientHeight/(scale*zoom);pointer=null;draw();return;}if(!matrix()||busy)return;const p=local(event);if(drag){if(drag.id!==event.pointerId)return;drag.next=Handles.move(drag.mask,drag.handle,p.x-drag.start.x,p.y-drag.start.y);draw();return;}pointer=p;canvas.style.cursor=hitHandle(p)?'grab':'crosshair';draw();};
 canvas.onpointerup=event=>{if(pan&&pan.id===event.pointerId){endPan(false);return;}if(!drag||drag.id!==event.pointerId)return;const old=releaseDrag();if(!old.next){draw();return;}try{const mask=Handles.finish(old.next),next=clone(value);next[partKey]=Object.assign({},next[partKey],layer==='shadow'?{mask}:{mask,polygons:Clip.collisionPolygons(mask)});commit(next);}catch(error){message(error.message,true);draw();}};
 canvas.onpointercancel=canvas.onlostpointercapture=()=>{endPan(true);if(drag){releaseDrag();draw();}};
 canvas.onauxclick=event=>{if(event.button===1)event.preventDefault();};
 canvas.onpointerleave=()=>{pointer=null;draw();};canvas.ondblclick=event=>{if(pickConnection(event))return;event.preventDefault();if(points.length)finish();};
 canvas.onkeydown=event=>{if(event.key==='Escape'){endPan(true);releaseDrag();points=[];pointer=null;draw();event.preventDefault();}else if(event.key==='Enter'){finish();event.preventDefault();}else if(event.key==='Backspace'&&points.length){points.pop();draw();event.preventDefault();}};
 canvas.onwheel=event=>{event.preventDefault();zoom=Math.max(.3,Math.min(8,zoom*Math.exp(-event.deltaY*.001)));draw();};
 function fit(){
  if(!data)return;const p=[],o=data.record.origin;
  for(const s of data.record.sprites||[]){const a=s.anchor||{x:.5,y:0};for(const x of [-a.x*s.width,(1-a.x)*s.width])for(const y of [-a.y*s.height,(1-a.y)*s.height]){const q=Maps.point(s.matrix,{x,y});p.push({x:q.x-o.x,y:q.y-o.y});}}
  for(const s of data.record.skeletons||[]){const b=s.json.skeleton;for(const x of [b.x,b.x+b.width])for(const y of [b.y,b.y+b.height]){const q=Maps.point(s.matrix,{x,y});p.push({x:q.x-o.x,y:q.y-o.y});}}
  for(const part of layerParts)for(const m of part.instances)for(const region of value[part.key].mask)for(const ring of region)for(const point of ring)p.push(Maps.point(m,{x:point[0],y:point[1]}));
  const finite=p.filter(p=>Number.isFinite(p.x)&&Number.isFinite(p.y));if(!finite.length)return;
  const minX=Math.min(...finite.map(p=>p.x)),maxX=Math.max(...finite.map(p=>p.x)),minY=Math.min(...finite.map(p=>p.y)),maxY=Math.max(...finite.map(p=>p.y));cx=(minX+maxX)/2;cy=(minY+maxY)/2;scale=Math.min((canvas.width-70)/Math.max(1,maxX-minX),(canvas.height-60)/Math.max(1,maxY-minY));draw();
 }
 function resize(){if(closed)return;const w=canvas.clientWidth,h=canvas.clientHeight;if(w>0&&h>0&&(canvas.width!==w||canvas.height!==h)){canvas.width=w;canvas.height=h;state.previewHeight=h;draw();}}
 function maskPath(mask){g.beginPath();for(const region of mask)for(const ring of region){ring.forEach((p,i)=>i?g.lineTo(p[0],p[1]):g.moveTo(p[0],p[1]));g.closePath();}}
 function draw(){if(closed||frame!==null)return;frame=requestAnimationFrame(()=>{
  frame=null;if(closed||layer==='scale')return;g.setTransform(1,0,0,1,0,0);g.fillStyle='#899c59';g.fillRect(0,0,canvas.width,canvas.height);if(!data)return;
  guideNote.textContent=Guides.explain(part(),layerParts,instance,layer);
  g.setTransform(scale*zoom,0,0,-scale*zoom,canvas.width/2-cx*scale*zoom,canvas.height/2+cy*scale*zoom);
  let preview=drag&&drag.next||value[partKey]&&value[partKey].mask;
  if(points.length>=2&&pointer)try{preview=Clip.combineMask(preview,Clip.polygonBrush(points.concat([pointer])),tool);}catch(_){}
  const record=Object.assign({},data.record,{shadow:undefined,dropShadow:undefined});
  if(textureMode())record.dropShadow=dropPreview;
  if(layer==='shadow'&&!textureMode()){
   const regions=[];for(const p of layerParts)for(const m of p.instances)regions.push(...Shadow.transform(p.key===partKey?preview:value[p.key].mask,m));
   record.shadow={regions,opacity:opacityDraft===null?value.opacity:opacityDraft,matrix:[1,0,0,1,record.origin.x,record.origin.y]};
  }
  const all=renderer.parts(building,record);for(const p of all.filter(p=>p.ground).concat(all.filter(p=>!p.ground)))renderer.draw(g,p,images,data.runtimePath);
  if(!textureMode())for(const p of layerParts)for(let i=0;i<p.instances.length;i++){
   const m=p.instances[i];g.save();Paint.apply(g,m);maskPath(p.key===partKey?preview:value[p.key].mask);if(layer==='blocker'){g.fillStyle='#ffe25a60';g.fill('evenodd');}g.strokeStyle=p.key===partKey&&i===instance?'#74edff':layer==='shadow'?'#b3c0cf88':'#ffe25a';g.lineWidth=1.5/(scale*zoom*Math.max(.01,Math.hypot(m[0],m[1])));g.stroke();g.restore();
  }
  if(matrix()&&points.length){g.save();Paint.apply(g,matrix());g.strokeStyle=tool==='erase'?'#ff8b80':'#fff6ab';g.lineWidth=2/(scale*zoom);g.beginPath();points.forEach((p,i)=>i?g.lineTo(p.x,p.y):g.moveTo(p.x,p.y));if(pointer)g.lineTo(pointer.x,pointer.y);g.stroke();for(const p of points){g.beginPath();g.arc(p.x,p.y,4/(scale*zoom),0,Math.PI*2);g.fillStyle='#fff6ab';g.fill();}g.restore();}
  if(!textureMode()&&matrix()&&!points.length){const m=matrix();g.save();g.setTransform(1,0,0,1,0,0);for(const h of Handles.handles(preview||[])){const p=Maps.point(m,h),x=canvas.width/2+(p.x-cx)*scale*zoom,y=canvas.height/2-(p.y-cy)*scale*zoom;g.beginPath();if(h.edge)g.rect(x-4,y-4,8,8);else g.arc(x,y,5,0,Math.PI*2);g.fillStyle=h.edge?'#effcff':'#74edff';g.fill();g.strokeStyle='#203746';g.lineWidth=1.5;g.stroke();}g.restore();}
  if(!textureMode()&&layerParts.length>1)Guides.draw(g,part(),layerParts,instance,guideView());
 });}
 syncMode();
 // CSS fixes the height while the panel width changes. Match the drawing
 // buffer to the content box so world X and Y keep the same screen scale.
 const observer=typeof ResizeObserver!=='undefined'?new ResizeObserver(resize):null;if(observer)observer.observe(canvas);resize();
 const ready=api.ipc('building-blocker-preview',api.request).then(async result=>{
  if(closed)return;data=result;if(result.dropStyle){shadowTool.value=result.dropStyle.source;dropClient.setData(result.dropStyle);}values={blocker:clone(result.value),shadow:clone(result.shadow)};value=values[layer==='scale'?'blocker':layer];layerParts=layer==='shadow'?data.shadowParts:data.parts;syncMode();choose(tool,false);
  const frames=new Set(result.record.sprites.map(s=>s.frame)),spec={images:Object.fromEntries(Object.entries(result.images).filter(([key])=>frames.has(key)))};
  renderer.prepare([result.record],result.runtimePath);resize();if(state.view&&state.view.width===canvas.width&&state.view.height===canvas.height){({scale,cx,cy}=state.view);draw();}else fit();images=await Paint.loadImages(spec);if(closed)return;draw();message(data.parts.length>1?'Gate, pillars and connecting walls. Edits repeat at every matching connection point.':'Draw or erase a '+layer+'. Changes stay in the shared draft until Save.');
 }).catch(error=>{if(!closed)message(error.message,true);});
 return {get ready(){return scaleClient?scaleClient.ready:ready;},stats:()=>scaleClient?scaleClient.stats():Object.assign(renderer.stats(),{view:{scale:scale*zoom,cx,cy,width:canvas.width,height:canvas.height},handles:matrix()?editHandles().map(h=>Object.assign({},h,Maps.point(matrix(),h))):[]}),destroy(){if(closed)return;endPan(false);releaseDrag();closed=true;resizer.destroy();Object.assign(state,{layer,tool,part:partKey,instance,zoom,points:clone(points)});if(data)state.view={scale,cx,cy,width:canvas.width,height:canvas.height};if(observer)observer.disconnect();if(scaleClient)scaleClient.destroy();dropClient.destroy();renderer.destroy();if(frame!==null)cancelAnimationFrame(frame);canvas.onpointerdown=canvas.onpointermove=canvas.onpointerup=canvas.onpointercancel=canvas.onlostpointercapture=canvas.onauxclick=canvas.onpointerleave=canvas.ondblclick=canvas.onkeydown=canvas.onwheel=null;shadowTool.onchange=mode.onchange=opacity.oninput=opacity.onchange=null;canvas.width=canvas.height=1;}};
}
module.exports={mount};
