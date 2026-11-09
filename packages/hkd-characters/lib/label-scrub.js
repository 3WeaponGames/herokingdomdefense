'use strict';
function install(label,input,options){
  let drag=null;
  label.classList.add('scrub-label');label.tabIndex=0;label.title='Drag left/right to adjust · Shift: fine · Escape: cancel';
  function update(value){value=Math.max(options.min,Math.min(options.max,value));if(options.integer)value=Math.round(value);if(options.scale&&Math.abs(value)<.01)value=value<0?-.01:.01;value=Number(value.toFixed(5));input.value=String(value);options.preview(value);}
  function finish(cancel){if(!drag)return;const current=drag;drag=null;label.classList.remove('scrubbing');if(label.hasPointerCapture&&label.hasPointerCapture(current.id))label.releasePointerCapture(current.id);if(cancel){update(current.value);if(options.cancel)options.cancel(current.snapshot);}else if(current.moved)options.commit();}
  label.onpointerdown=event=>{if(event.button!==0||input.disabled)return;event.preventDefault();label.focus();drag={id:event.pointerId,x:event.clientX,value:Number(input.value),moved:false,snapshot:options.begin&&options.begin()};label.setPointerCapture(event.pointerId);};
  label.onpointermove=event=>{if(!drag||event.pointerId!==drag.id)return;const dx=event.clientX-drag.x;if(!drag.moved&&Math.abs(dx)<2)return;drag.moved=true;label.classList.add('scrubbing');update(drag.value+dx*options.step*(event.shiftKey ? .1 : 1));};
  label.onpointerup=()=>finish(false);label.onpointercancel=()=>finish(true);label.onlostpointercapture=()=>finish(true);
  label.onkeydown=event=>{if(event.key==='Escape'&&drag){event.preventDefault();finish(true);}else if(event.key==='ArrowLeft'||event.key==='ArrowRight'){event.preventDefault();update(Number(input.value)+(event.key==='ArrowRight'?1:-1)*options.step*(event.shiftKey ? .1 : 1));options.commit();}};
  const cancel=()=>finish(true);
  cancel.commit=()=>finish(false);
  return cancel;
}
module.exports={install};
