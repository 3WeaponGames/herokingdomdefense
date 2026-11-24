'use strict';
// Editor preferences only. No game/authoring data is written by resizing a pane.
function attach(options){
 const {main,left,dock,inspector,layers,onResize}=options,key=options.key||'hkd-world-dock-v3';let saved={},active=null,effectiveTop=0;
 try{saved=JSON.parse(window.localStorage.getItem(key)||'{}');}catch(_){}
 const size={left:Number(saved.left)||235,right:Number(saved.right)||300,top:Number(saved.top)||.5},handles=[];
 const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
 function apply(){if(options.isActive&&!options.isActive())return;const width=main.clientWidth||1100,height=dock.clientHeight||main.clientHeight||600;size.left=clamp(size.left,190,Math.max(190,width-size.right-210));size.right=clamp(size.right,230,Math.max(230,width-size.left-210));const topMin=Math.max(85,height*.15),topMax=Math.max(topMin,Math.min(height*.85,height-196)),topPixels=clamp(height*clamp(size.top,.15,.85),topMin,topMax);size.top=clamp(size.top,.15,.85);effectiveTop=topPixels;left.style.width=size.left+'px';left.style.flexBasis=size.left+'px';dock.style.width=size.right+'px';dock.style.flexBasis=size.right+'px';inspector.style.flexBasis=topPixels+'px';for(const h of handles){const vertical=h.dataset.axis==='y',value=vertical?topPixels:size[h.dataset.side],minimum=vertical?topMin:h.dataset.side==='left'?190:230,maximum=vertical?topMax:Math.max(minimum,width-(h.dataset.side==='left'?size.right:size.left)-210);h.setAttribute('aria-valuenow',String(Math.round(value)));h.setAttribute('aria-valuemin',String(Math.round(minimum)));h.setAttribute('aria-valuemax',String(Math.round(maximum)));h.setAttribute('aria-valuetext',Math.round(value)+' pixels');}if(onResize)onResize();}
 function persist(){try{window.localStorage.setItem(key,JSON.stringify(size));}catch(_){}}
 function removeListeners(){window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',finish);window.removeEventListener('pointercancel',cancel);window.removeEventListener('blur',cancel);window.removeEventListener('keydown',escape);}
 function move(e){if(!active)return;const delta=active.axis==='y'?e.clientY-active.y:e.clientX-active.x;if(active.axis==='y')size.top=(active.top+delta)/active.height;else size[active.side]=active.before[active.side]+delta*(active.side==='right'?-1:1);apply();}
 function release(drag){try{if(drag.handle&&typeof drag.handle.releasePointerCapture==='function'&&drag.pointerId!==undefined)drag.handle.releasePointerCapture(drag.pointerId);}catch(_){}}
 function finish(){if(!active)return;const drag=active;active=null;removeListeners();release(drag);persist();}
 function cancel(){if(!active)return;const drag=active;Object.assign(size,drag.before);active=null;removeListeners();release(drag);apply();}
 function escape(e){if(e.key==='Escape'){e.preventDefault();cancel();}}
 function handle(axis,side,label){const n=document.createElement('div');n.className='world-splitter world-splitter-'+axis;n.dataset.axis=axis;n.dataset.side=side;n.tabIndex=0;n.setAttribute('role','separator');n.setAttribute('aria-label',label);n.setAttribute('aria-orientation',axis==='x'?'vertical':'horizontal');n.title=label+' · Drag or use arrow keys · Double-click to reset';
 n.onpointerdown=e=>{if(e.button!==0)return;e.preventDefault();cancel();active={axis,side,x:e.clientX,y:e.clientY,height:dock.clientHeight||600,top:effectiveTop,before:Object.assign({},size),handle:n,pointerId:e.pointerId};try{n.setPointerCapture(e.pointerId);}catch(_){}window.addEventListener('pointermove',move);window.addEventListener('pointerup',finish);window.addEventListener('pointercancel',cancel);window.addEventListener('blur',cancel);window.addEventListener('keydown',escape);};
 n.onlostpointercapture=finish;n.ondblclick=()=>{if(axis==='y')size.top=.5;else size[side]=side==='left'?235:300;apply();persist();};
 n.onkeydown=e=>{const delta=e.key==='ArrowLeft'||e.key==='ArrowUp'?-1:e.key==='ArrowRight'||e.key==='ArrowDown'?1:0;if(!delta)return;e.preventDefault();if(axis==='y')size.top=(effectiveTop+delta*(e.shiftKey?1:10))/(dock.clientHeight||600);else size[side]+=delta*(e.shiftKey?1:10)*(side==='right'?-1:1);apply();persist();};
 handles.push(n);return n;}
 const leftHandle=handle('x','left','Resize asset library'),rightHandle=handle('x','right','Resize right dock'),verticalHandle=handle('y','top','Resize inspector and layers');
 main.insertBefore(leftHandle,left.nextSibling);main.insertBefore(rightHandle,dock);dock.insertBefore(verticalHandle,layers);
 const observer=typeof ResizeObserver==='function'?new ResizeObserver(apply):null;if(observer)observer.observe(main);apply();
 return {apply,size,handles,suspend:cancel,destroy(){cancel();if(observer)observer.disconnect();for(const h of handles)h.remove();}};
}
function attachWaveInspector({main,left,mapView,inspector,onResize,isActive,key='hkd-wave-inspector-width'}){
 const document=main.ownerDocument,view=document.defaultView,widthProperty='--world-wave-inspector-width';
 const divider=document.createElement('div');
 divider.className='world-splitter world-splitter-x world-wave-splitter';
 divider.hidden=true;divider.tabIndex=0;
 divider.setAttribute('role','separator');
 divider.setAttribute('aria-orientation','vertical');
 divider.setAttribute('aria-label','Resize Waves inspector');
 divider.title='Drag or use the arrow keys to resize. Double-click to reset.';
 main.insertBefore(divider,inspector);

 let preferred=0,minimum=0,maximum=0,width=0,drag=null;
 try{const saved=Number(view.localStorage.getItem(key));if(Number.isFinite(saved)&&saved>0)preferred=saved;}catch(_){}
 const clamp=value=>Math.max(minimum,Math.min(maximum,Math.round(value)));
 function paintWidth(){
  if(divider.hidden||!isActive()||!minimum)return;
  width=clamp(preferred||minimum);
  inspector.style.setProperty(widthProperty,width+'px');
  divider.setAttribute('aria-valuemin',String(minimum));
  divider.setAttribute('aria-valuemax',String(maximum));
  divider.setAttribute('aria-valuenow',String(width));
  divider.setAttribute('aria-valuetext',width+' pixels');
  onResize();
 }
 function apply(){
  if(divider.hidden||!isActive()||!main.clientWidth)return;
  inspector.style.removeProperty(widthProperty);
  minimum=Math.ceil(inspector.getBoundingClientRect().width);
  const mapMinimum=parseFloat(view.getComputedStyle(mapView).minWidth)||0;
  maximum=Math.max(minimum,Math.floor(main.clientWidth-left.getBoundingClientRect().width-divider.offsetWidth-mapMinimum));
  paintWidth();
 }
 function persist(){try{view.localStorage.setItem(key,String(preferred));}catch(_){}}
 function move(event){
  if(!drag||event.pointerId!==drag.id)return;
  if(event.pointerType==='mouse'&&event.buttons===0){finish(false);return;}
  preferred=clamp(drag.width+drag.x-event.clientX);
  paintWidth();
 }
 function finish(cancel){
  if(!drag)return;
  const previous=drag;drag=null;
  divider.classList.remove('dragging');
  for(const [name,listener] of listeners)view.removeEventListener(name,listener,true);
  if(cancel){preferred=previous.preferred;paintWidth();}
  else if(preferred!==previous.preferred)persist();
  if(divider.hasPointerCapture(previous.id))divider.releasePointerCapture(previous.id);
 }
 function end(event){if(drag&&event.pointerId===drag.id)finish(event.type==='pointercancel');}
 function suspend(){finish(true);}
 function escape(event){if(event.key==='Escape'){event.preventDefault();event.stopPropagation();suspend();}}
 const listeners=[['pointermove',move],['pointerup',end],['pointercancel',end],['blur',suspend],['keydown',escape]];
 divider.onpointerdown=event=>{
  if(event.button!==0||drag||divider.hidden||!isActive()||maximum===minimum)return;
  event.preventDefault();
  divider.focus({preventScroll:true});
  drag={id:event.pointerId,x:event.clientX,width,preferred};
  try{divider.setPointerCapture(event.pointerId);}catch(_){}
  divider.classList.add('dragging');
  for(const [name,listener] of listeners)view.addEventListener(name,listener,true);
 };
 divider.onlostpointercapture=end;
 divider.ondblclick=()=>{preferred=0;paintWidth();persist();};
 divider.onkeydown=event=>{
  if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
  event.preventDefault();event.stopPropagation();
  const step=(event.key==='ArrowLeft'?1:-1)*(event.shiftKey?60:20);
  preferred=event.key==='Home'?0:clamp(event.key==='End'?maximum:width+step);
  paintWidth();persist();
 };
 function show(visible){
  if(visible===!divider.hidden)return;
  if(!visible)suspend();
  divider.hidden=!visible;
  if(visible)apply();else inspector.style.removeProperty(widthProperty);
 }
 const observer=typeof view.ResizeObserver==='function'?new view.ResizeObserver(apply):null;
 if(observer)observer.observe(main);
 view.addEventListener('resize',apply);
 return {apply,show,suspend,destroy(){show(false);if(observer)observer.disconnect();view.removeEventListener('resize',apply);divider.remove();}};
}

module.exports={attach,attachWaveInspector};
