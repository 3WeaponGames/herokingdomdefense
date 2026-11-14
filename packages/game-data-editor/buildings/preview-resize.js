"use strict";
function mount(canvas,state){
 const handle=document.createElement("div");handle.className="bld-preview-resize";handle.tabIndex=0;handle.setAttribute("role","separator");handle.setAttribute("aria-orientation","horizontal");handle.setAttribute("aria-label","Preview height");handle.title="Drag to resize preview; arrow keys adjust height";handle.textContent="⋯";canvas.parentNode.insertBefore(handle,canvas.nextSibling);
 let drag=null;function height(value){value=Math.max(200,Math.min(1800,Math.round(value)));canvas.style.height=value+"px";state.previewHeight=value;handle.setAttribute("aria-valuenow",String(value));}
 handle.onpointerdown=e=>{if(e.button!==0)return;e.preventDefault();drag={id:e.pointerId,y:e.clientY,height:canvas.clientHeight};handle.setPointerCapture(e.pointerId);};
 handle.onpointermove=e=>{if(!drag||drag.id!==e.pointerId)return;e.preventDefault();height(drag.height+e.clientY-drag.y);};
 function release(e){if(!drag||e&&e.pointerId!==drag.id)return;const id=drag.id;drag=null;if(handle.hasPointerCapture(id))handle.releasePointerCapture(id);}
 handle.onpointerup=release;handle.onpointercancel=handle.onlostpointercapture=release;
 handle.onkeydown=e=>{if(e.key!=="ArrowUp"&&e.key!=="ArrowDown")return;e.preventDefault();height(canvas.clientHeight+(e.key==="ArrowUp"?-1:1)*(e.shiftKey?100:20));};
 if(state.previewHeight)height(state.previewHeight);return{setVisible(value){if(!value)release();handle.hidden=!value;handle.style.display=value?'':'none';},destroy(){release();handle.remove();}};
}
module.exports={mount};
