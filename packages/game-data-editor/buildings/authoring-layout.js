'use strict';
// View preferences only. Changing this split never enters the game-data draft.
const DEFAULT_WIDTH=340,MIN_WIDTH=240,DIVIDER=10,PREVIEW_MIN=220,STORAGE='hkd.buildings.authoring.inspector-width';
function mount(host,state){
 const make=(tag,cls,parent)=>{const e=document.createElement(tag);e.className=cls;parent.appendChild(e);return e;},row=make('div','bld-authoring-layout',host),preview=make('div','bld-authoring-preview',row),divider=make('div','bld-authoring-divider',row),inspector=make('aside','bld-authoring-inspector',row),controls=make('div','bld-authoring-controls',inspector);
 inspector.setAttribute('aria-label','Building tool controls');divider.tabIndex=0;divider.textContent='⋮';divider.setAttribute('role','separator');divider.setAttribute('aria-orientation','vertical');divider.setAttribute('aria-label','Tool panel width');divider.title='Drag to resize controls; arrow keys adjust width; double-click resets';
 let storage;try{storage=window.localStorage;}catch(_){}
 let preferred=state.inspectorWidth;if(!Number.isFinite(preferred))try{preferred=Number(storage&&storage.getItem(STORAGE));}catch(_){}if(!Number.isFinite(preferred)||preferred<MIN_WIDTH)preferred=DEFAULT_WIDTH;
 let closed=false,drag=null,layer=null,restoring=false,restoreFrame=null,actual=preferred,max=preferred;state.inspectorScroll=state.inspectorScroll||{};
 function size(){if(closed)return;const width=row.clientWidth;if(!width)return;const stacked=width<MIN_WIDTH+PREVIEW_MIN+DIVIDER;row.toggleAttribute('data-stacked',stacked);max=Math.max(MIN_WIDTH,width-PREVIEW_MIN-DIVIDER);actual=Math.max(MIN_WIDTH,Math.min(max,preferred));row.style.setProperty('--bld-inspector-width',actual+'px');const height=preview.getBoundingClientRect().height;if(height>0)row.style.setProperty('--bld-inspector-height',Math.round(height)+'px');divider.setAttribute('aria-valuemin',String(MIN_WIDTH));divider.setAttribute('aria-valuemax',String(max));divider.setAttribute('aria-valuenow',String(Math.round(actual)));}
 function remember(width){preferred=Math.max(MIN_WIDTH,Math.min(max,Math.round(width)));state.inspectorWidth=preferred;try{if(storage)storage.setItem(STORAGE,String(preferred));}catch(_){}size();}
 function release(cancel){const old=drag;drag=null;if(!old)return;if(cancel)remember(old.width);if(divider.hasPointerCapture&&divider.hasPointerCapture(old.id))divider.releasePointerCapture(old.id);}
 divider.onpointerdown=e=>{if(e.button!==0)return;e.preventDefault();divider.focus({preventScroll:true});drag={id:e.pointerId,x:e.clientX,width:actual};if(divider.setPointerCapture)divider.setPointerCapture(e.pointerId);};
 divider.onpointermove=e=>{if(!drag||drag.id!==e.pointerId)return;e.preventDefault();remember(drag.width-(e.clientX-drag.x));};
 divider.onpointerup=e=>{if(drag&&drag.id===e.pointerId)release(false);};divider.onpointercancel=divider.onlostpointercapture=()=>release(true);
 divider.ondblclick=e=>{e.preventDefault();remember(DEFAULT_WIDTH);};divider.onkeydown=e=>{if(e.key==='Escape'&&drag){e.preventDefault();release(true);return;}if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();remember(e.key==='Home'?MIN_WIDTH:e.key==='End'?max:actual+(e.key==='ArrowLeft'?1:-1)*(e.shiftKey?50:20));};
 function saveScroll(){if(layer&&!restoring)state.inspectorScroll[layer]=inspector.scrollTop;}
 // Async scale/light controls can briefly be shorter while loading. Keep the
 // requested scroll until their final layout exists, rather than saving a clamp.
 function restoreScroll(loaded=true){if(closed||!layer)return;restoring=true;const wanted=state.inspectorScroll[layer]||0;if(restoreFrame!==null)cancelAnimationFrame(restoreFrame);restoreFrame=requestAnimationFrame(()=>{if(closed)return;size();inspector.scrollTop=wanted;restoreFrame=requestAnimationFrame(()=>{restoreFrame=null;if(closed)return;size();inspector.scrollTop=wanted;if(loaded)restoring=false;});});}
 inspector.onscroll=saveScroll;
 const observer=typeof ResizeObserver!=='undefined'?new ResizeObserver(size):null;if(observer){observer.observe(row);observer.observe(preview);}size();
 return{preview,controls,restoreScroll,setLayer(next){if(next===layer)return;saveScroll();layer=next;restoreScroll(false);},destroy(){saveScroll();closed=true;release(false);if(observer)observer.disconnect();if(restoreFrame!==null)cancelAnimationFrame(restoreFrame);inspector.onscroll=null;for(const name of ['onpointerdown','onpointermove','onpointerup','onpointercancel','onlostpointercapture','onkeydown','ondblclick'])divider[name]=null;row.remove();}};
}
module.exports={mount};
