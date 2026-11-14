'use strict';
// A scrub is a local preview gesture. Its owner publishes one value on release.
function attach(label,input,options){
 options=options||{};const doc=label.ownerDocument,view=doc&&doc.defaultView,target=view&&view.addEventListener?view:label;
 let drag=null,suppressClick=false,closed=false;
 const finite=(value,fallback)=>Number.isFinite(Number(value))?Number(value):fallback;
 const min=finite(options.min,-Infinity),max=finite(options.max,Infinity),step=Math.max(Number.MIN_VALUE,finite(options.step,.01)||.01);
 const quantize=value=>{const anchor=Number.isFinite(min)?min:0,units=(value-anchor)/step,n=Number.isFinite(units)?Math.round(units)*step+anchor:value;return Math.max(min,Math.min(max,Number(n.toPrecision(12))));};
 function finish(commit){if(!drag)return;const current=drag;drag=null;releaseFor(current);label.classList.remove('scrubbing');if(current.started){suppressClick=true;if(commit){if(options.commit)options.commit(current.value,current.before);}else{input.value=String(current.before);if(options.cancel)options.cancel(current.before);}}}
 function releaseFor(current){if(label.hasPointerCapture&&label.hasPointerCapture(current.id))label.releasePointerCapture(current.id);}
 function down(event){if(closed||drag||event.button!==0||event.isPrimary===false||input.disabled||input.readOnly)return;const before=Number(input.value);if(String(input.value).trim()===''||!Number.isFinite(before)||before<min||before>max)return;drag={id:event.pointerId,x:event.clientX,lastX:event.clientX,raw:before,value:before,before,started:false};if(label.setPointerCapture)label.setPointerCapture(event.pointerId);}
 function move(event){if(!drag||event.pointerId!==drag.id)return;const delta=event.clientX-drag.lastX;if(!drag.started&&Math.abs(event.clientX-drag.x)<3)return;
  if(!drag.started){drag.started=true;if(options.start)options.start();if(!drag)return;label.classList.add('scrubbing');}
  if(event.preventDefault)event.preventDefault();if(event.stopPropagation)event.stopPropagation();
  drag.lastX=event.clientX;const candidate=drag.raw+delta*step*(event.shiftKey ? .1 : event.altKey ? 10 : 1);if(!Number.isFinite(candidate))return;drag.raw=Math.max(min,Math.min(max,candidate));const next=quantize(drag.raw);
  if(next!==drag.value){drag.value=next;input.value=String(next);if(options.preview)options.preview(next);}
 }
 function up(event){if(drag&&event.pointerId===drag.id)finish(true);}
 function cancel(event){if(drag&&(!event||event.type==='blur'||event.pointerId===drag.id))finish(false);}
 function key(event){if(drag&&event.key==='Escape'){if(event.preventDefault)event.preventDefault();if(event.stopPropagation)event.stopPropagation();finish(false);}}
 function click(event){if(suppressClick){suppressClick=false;if(event.preventDefault)event.preventDefault();}}
 label.classList.add('numeric-scrub');label.addEventListener('pointerdown',down);label.addEventListener('click',click);label.addEventListener('lostpointercapture',cancel);
 target.addEventListener('pointermove',move);target.addEventListener('pointerup',up);target.addEventListener('pointercancel',cancel);target.addEventListener('keydown',key);if(target!==label)target.addEventListener('blur',cancel);
 return{finish,get active(){return !!drag&&drag.started;},destroy(){if(closed)return;finish(false);closed=true;label.removeEventListener('pointerdown',down);label.removeEventListener('click',click);label.removeEventListener('lostpointercapture',cancel);target.removeEventListener('pointermove',move);target.removeEventListener('pointerup',up);target.removeEventListener('pointercancel',cancel);target.removeEventListener('keydown',key);if(target!==label)target.removeEventListener('blur',cancel);}};
}
module.exports={attach};
