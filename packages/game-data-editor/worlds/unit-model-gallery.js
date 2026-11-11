'use strict';
// One render-only Spine canvas supplies model images for the visible cards.
// It never instantiates gameplay actors or loads audio. Offscreen images and
// the bounded cache are released when the chooser closes.
const Renderer=require('../preview/spine-renderer');
function create(scroller,ipc,priorityId){
 const canvas=document.createElement('canvas'),thumbnail=document.createElement('canvas');canvas.width=canvas.height=thumbnail.width=thumbnail.height=384;const context=canvas.getContext('2d'),output=thumbnail.getContext('2d');
 const records=new Map(),cache=new Map(),queue=[];let closed=false,running=false;
 function publish(record,source){if(closed||!record.visible||!record.card.isConnected)return;const id=record.id;record.image.onload=()=>{if(closed||!record.visible||record.id!==id||record.image.getAttribute('src')!==source)return;record.image.hidden=false;record.card.dataset.modelState='ready';record.status.hidden=true;};record.image.src=source;}
 function enqueue(record){if(closed||!record.visible||record.queued||record.card.hidden)return;if(cache.has(record.id)){const source=cache.get(record.id);cache.delete(record.id);cache.set(record.id,source);publish(record,source);return;}record.queued=true;if(record.id===priorityId)queue.unshift(record);else queue.push(record);pump();}
 async function pump(){
  if(running||closed)return;running=true;
  try{while(queue.length&&!closed){const record=queue.shift();record.queued=false;if(!record.visible||record.card.hidden)continue;
   const id=record.id;try{const data=await ipc('world-unit-preview',{id});if(closed)return;if(record.id!==id)continue;const spine=require(data.runtimePath),layers=await Renderer.createLayers(spine,data.layers);if(closed)return;if(record.id!==id)continue;
    const visual=data.visual||{};for(const layer of layers){const source=layer.description;layer.description=Object.assign({},source,{x:(source.x||0)+(visual.x||0),y:(source.y||0)+(visual.y||0),scaleX:(source.scaleX===undefined?1:source.scaleX)*(visual.scaleX===undefined?1:visual.scaleX),scaleY:(source.scaleY===undefined?1:source.scaleY)*(visual.scaleY===undefined?1:visual.scaleY),rotation:visual.rotation||0});if(/^#[0-9a-f]{6}$/i.test(visual.tint||'')&&layer.skeleton.color&&layer.skeleton.color.set)layer.skeleton.color.set(parseInt(visual.tint.slice(1,3),16)/255,parseInt(visual.tint.slice(3,5),16)/255,parseInt(visual.tint.slice(5,7),16)/255,1);}
    // Canvas 2D avoids retaining a WebGL texture for every model ever scrolled
    // past. The full rig is released once its bounded thumbnail is generated.
    Renderer.seek(spine,layers,'idle',0,false);context.clearRect(0,0,canvas.width,canvas.height);Renderer.draw(spine,context,layers,{width:canvas.width,height:canvas.height,bounds:Renderer.bounds(spine,layers),facing:visual.mirrorX?-1:1});
    // Imported rigs can have large transparent sprite padding. Fit the visible
    // model, rather than that padding, so every pack remains easy to inspect.
    const pixels=context.getImageData(0,0,384,384).data;let left=384,top=384,right=-1,bottom=-1;for(let y=0;y<384;y++)for(let x=0;x<384;x++)if(pixels[(y*384+x)*4+3]>8){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}
    output.clearRect(0,0,384,384);if(right>=left){const width=right-left+1,height=bottom-top+1,scale=Math.min(360/width,360/height);output.drawImage(canvas,left,top,width,height,(384-width*scale)/2,372-height*scale,width*scale,height*scale);}const source=thumbnail.toDataURL('image/png');cache.set(id,source);while(cache.size>64)cache.delete(cache.keys().next().value);publish(record,source);
   }catch(error){if(!closed&&record.id===id){record.card.dataset.modelState='error';record.status.hidden=false;record.status.textContent='Model unavailable';record.status.title=error.message;}}
  }}finally{running=false;}
 }
 const observer=typeof IntersectionObserver==='function'?new IntersectionObserver(entries=>{for(const entry of entries){const record=records.get(entry.target);if(!record)continue;record.visible=entry.isIntersecting;if(record.visible)enqueue(record);else{record.image.hidden=true;record.image.removeAttribute('src');record.status.hidden=false;if(record.card.dataset.modelState!=='error')record.card.dataset.modelState='waiting';}}},{root:scroller,rootMargin:'120px'}):null;
 return{watch(card,image,status,id){image.hidden=true;const record={card,image,status,id,visible:!observer,queued:false};records.set(card,record);if(observer)observer.observe(card);else enqueue(record);},setUnit(card,id){const record=records.get(card);if(!record||record.id===id)return;record.id=id;record.image.onload=null;record.image.hidden=true;record.image.removeAttribute('src');record.status.hidden=false;record.status.textContent='Loading model…';record.status.title='';record.card.dataset.modelState='waiting';enqueue(record);},destroy(){closed=true;if(observer)observer.disconnect();queue.length=0;for(const record of records.values()){record.image.onload=null;record.image.removeAttribute('src');}records.clear();cache.clear();Renderer.destroyCanvas(canvas);canvas.width=canvas.height=thumbnail.width=thumbnail.height=0;}};
}
module.exports={create};
