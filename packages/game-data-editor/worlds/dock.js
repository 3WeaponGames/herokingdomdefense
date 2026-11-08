'use strict';
// Editor preferences only. No game/authoring data is written by resizing a pane.
function attach(options){
 const {main,left,dock,inspector,layers,onResize}=options,key=options.key||'hkd-world-dock-v3';let saved={},active=null;
 try{saved=JSON.parse(window.localStorage.getItem(key)||'{}');}catch(_){}
 const size={left:Number(saved.left)||235,right:Number(saved.right)||300,top:Number(saved.top)||.5},handles=[];
 const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
 function apply(){const width=main.clientWidth||1100,height=dock.clientHeight||main.clientHeight||600;size.left=clamp(size.left,190,Math.max(190,width-size.right-210));size.right=clamp(size.right,230,Math.max(230,width-size.left-210));size.top=clamp(size.top,.15,.85);left.style.width=size.left+'px';left.style.flexBasis=size.left+'px';dock.style.width=size.right+'px';dock.style.flexBasis=size.right+'px';inspector.style.flexBasis=clamp(height*size.top,85,Math.max(85,height-196))+'px';for(const h of handles)h.setAttribute('aria-valuenow',String(Math.round(h.dataset.axis==='y'?height*size.top:size[h.dataset.side])));if(onResize)onResize();}
 function persist(){try{window.localStorage.setItem(key,JSON.stringify(size));}catch(_){}}
 function removeListeners(){window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',finish);window.removeEventListener('pointercancel',cancel);window.removeEventListener('blur',cancel);window.removeEventListener('keydown',escape);}
 function move(e){if(!active)return;const delta=active.axis==='y'?e.clientY-active.y:e.clientX-active.x;if(active.axis==='y')size.top=(active.before.top*active.height+delta)/active.height;else size[active.side]=active.before[active.side]+delta*(active.side==='right'?-1:1);apply();}
 function finish(){if(!active)return;active=null;removeListeners();persist();}
 function cancel(){if(!active)return;Object.assign(size,active.before);active=null;removeListeners();apply();}
 function escape(e){if(e.key==='Escape'){e.preventDefault();cancel();}}
 function handle(axis,side,label){const n=document.createElement('div');n.className='world-splitter world-splitter-'+axis;n.dataset.axis=axis;n.dataset.side=side;n.tabIndex=0;n.setAttribute('role','separator');n.setAttribute('aria-label',label);n.setAttribute('aria-orientation',axis==='x'?'vertical':'horizontal');n.title=label+' · Drag or use arrow keys · Double-click to reset';
 n.onpointerdown=e=>{if(e.button!==0)return;e.preventDefault();cancel();active={axis,side,x:e.clientX,y:e.clientY,height:dock.clientHeight||600,before:Object.assign({},size)};try{n.setPointerCapture(e.pointerId);}catch(_){}window.addEventListener('pointermove',move);window.addEventListener('pointerup',finish);window.addEventListener('pointercancel',cancel);window.addEventListener('blur',cancel);window.addEventListener('keydown',escape);};
 n.onlostpointercapture=finish;n.ondblclick=()=>{if(axis==='y')size.top=.5;else size[side]=side==='left'?235:300;apply();persist();};
 n.onkeydown=e=>{const delta=e.key==='ArrowLeft'||e.key==='ArrowUp'?-1:e.key==='ArrowRight'||e.key==='ArrowDown'?1:0;if(!delta)return;e.preventDefault();if(axis==='y')size.top+=(delta*(e.shiftKey?1:10))/(dock.clientHeight||600);else size[side]+=delta*(e.shiftKey?1:10)*(side==='right'?-1:1);apply();persist();};
 handles.push(n);return n;}
 const leftHandle=handle('x','left','Resize asset library'),rightHandle=handle('x','right','Resize right dock'),verticalHandle=handle('y','top','Resize inspector and layers');
 main.insertBefore(leftHandle,left.nextSibling);main.insertBefore(rightHandle,dock);dock.insertBefore(verticalHandle,layers);
 const observer=typeof ResizeObserver==='function'?new ResizeObserver(apply):null;if(observer)observer.observe(main);apply();
 return {apply,size,handles,destroy(){cancel();if(observer)observer.disconnect();for(const h of handles)h.remove();}};
}
module.exports={attach};
