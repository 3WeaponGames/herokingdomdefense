'use strict';
const Renderer=require('../worlds/building-renderer'),Paint=require('../worlds/paint'),Spine=require('../preview/spine-renderer'),Scale=require('../../../assets/_script/BuildingWorldScale'),Group=require('./scale-group');
function mount(host,api){
 const state=api.state||{},make=(tag,text,parent)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(parent)parent.appendChild(e);return e;};
 const root=make('div',undefined,host);root.className='bld-scale';
 const controls=make('div',undefined,root);controls.className='bld-scale-controls';
 const modeLabel=make('label',undefined,controls),allInput=make('input',undefined,modeLabel);allInput.type='checkbox';allInput.setAttribute('aria-label','All tiers');make('span','All tiers',modeLabel);
 const label=make('label',undefined,controls),title=make('span','World size',label),number=make('input',undefined,label);number.type='number';number.step='.1';make('span','%',label);
 const slider=make('input',undefined,controls);slider.type='range';slider.step='any';
 const fitButton=make('button','Fit preview',controls);fitButton.type='button';
 const tierControls=make('div',undefined,root);tierControls.className='bld-scale-tiers';
 const partControls=make('div',undefined,root);partControls.className='bld-part-scales';
 const canvas=make('canvas',undefined,root);canvas.className='bld-blocker-canvas bld-scale-canvas';canvas.width=900;canvas.height=430;canvas.tabIndex=0;canvas.setAttribute('aria-label','Building scale preview with hero');
 const help=make('p','Drag the corner handle or adjust World size. The hero stays at gameplay size. Hold middle mouse to pan; wheel zooms the view; Fit preview fits all visible models.',root),status=make('p','Loading building and hero…',root);help.className=status.className='bld-blocker-help';
 if(!canvas.getContext)return{ready:Promise.resolve(),destroy(){},stats:()=>({poses:0,ready:0})};
 const g=canvas.getContext('2d');let closed=false,frame=null,data,entries=[],images={},heroImage,heroBounds,value=1,original=1,drag=null,pan=null,busy=false,loading=false,serial=0,pending,fitted=!!state.fitted,unit=state.unit||1,zoom=state.zoom||1,cx=state.cx||0,cy=state.cy||0;
 let allTiers=!!state.allTiers,selected=new Set(state.selection||[]),selectionInitialized=Array.isArray(state.selection);const tierInputs=new Map();allInput.checked=allTiers;
 const renderer=Renderer.create({onLoad:loaded,onError:e=>message(e.message,true)});
 function message(text,error){status.textContent=text;status.className='bld-blocker-help'+(error?' error':'');}
 function chosen(entry){return !allTiers||selected.has(entry.index);}
 function factor(entry){return allTiers?(chosen(entry)?value:1):value;}
 function stats(){const s=renderer.stats();return Object.assign({},s,{poses:s.poses+1,ready:s.ready+(heroImage?1:0),worldScale:value,viewScale:unit*zoom,view:{scale:unit*zoom,cx,cy,width:canvas.width,height:canvas.height},heroHeight:heroBounds?heroBounds.height:0,allTiers,selected:Array.from(selected),tiers:entries.map(t=>({index:t.index,position:t.position,worldScale:allTiers?t.worldScale*factor(t):value}))});}
 function enabled(){return !loading&&data&&heroImage&&stats().ready===stats().poses;}
 function range(){return allTiers&&data?Group.limits(data.tiers,selected):{min:.05,max:10};}
 function sync(){
  const limits=range();title.textContent=allTiers?'Resize selected':'World size';number.setAttribute('aria-label',allTiers?'Resize selected tiers percent':'Building world size percent');slider.setAttribute('aria-label',allTiers?'Resize selected tiers':'Building world size');
  number.value=String(Math.round(value*10000)/100);slider.min=number.min=String((limits?limits.min:.05)*100);slider.max=number.max=String((limits?limits.max:10)*100);slider.value=String(value*100);number.disabled=slider.disabled=!enabled()||busy||!limits;allInput.disabled=loading||busy;
  for(const [index,control]of tierInputs){control.input.checked=selected.has(index);control.input.disabled=loading||busy;const tier=data.tiers.find(t=>t.index===index);control.text.textContent=control.label+' · '+Math.round(tier.worldScale*(selected.has(index)?value:1)*1000)/10+'%';}
  tierControls.hidden=!allTiers;help.textContent=allTiers?'All selected tiers resize by the same percentage, keeping their relative sizes. Uncheck any tier to leave its size unchanged. Drag the corner handle or use Resize selected.':'Drag the corner handle or adjust World size. The hero stays at gameplay size. Hold middle mouse to pan; wheel zooms the view; Fit preview fits both models.';
  for(const input of partControls.querySelectorAll('input,button'))input.disabled=busy||loading;
 }
 function layout(){
  if(!data)return [];let cursor=0;return entries.map(entry=>{const record=Scale.record(entry.base,factor(entry)),box=renderer.measure(record,data.runtimePath);if(!box)return null;const x=allTiers?cursor-box.minX:0;cursor=x+box.maxX+60;return{entry,record,building:{x,y:0,scale:1,angle:0},box:{minX:box.minX+x,maxX:box.maxX+x,minY:box.minY,maxY:box.maxY}};}).filter(Boolean);
 }
 function union(items){if(!items.length)return null;return{minX:Math.min(...items.map(p=>p.box.minX)),maxX:Math.max(...items.map(p=>p.box.maxX)),minY:Math.min(...items.map(p=>p.box.minY)),maxY:Math.max(...items.map(p=>p.box.maxY))};}
 function heroPosition(b){return{x:Math.max(0,b.maxX)+35-heroBounds.minX,y:0};}
 function fit(){const b=union(layout());if(!b||!heroBounds)return;const p=heroPosition(b),minX=Math.min(b.minX,p.x+heroBounds.minX),maxX=Math.max(b.maxX,p.x+heroBounds.maxX),minY=Math.min(b.minY,heroBounds.minY)-25,maxY=Math.max(b.maxY,heroBounds.maxY);cx=(minX+maxX)/2;cy=(minY+maxY)/2;unit=Math.min((canvas.width-100)/Math.max(1,maxX-minX),(canvas.height-80)/Math.max(1,maxY-minY));fitted=true;draw();}
 function resize(){if(closed)return;const w=canvas.clientWidth,h=canvas.clientHeight;if(w>0&&h>0&&(canvas.width!==w||canvas.height!==h)){canvas.width=w;canvas.height=h;if(data||state.width!==w||state.height!==h)fitted=false;if(enabled()&&!fitted)fit();else draw();}}
 function loaded(){if(closed)return;sync();if(enabled()&&!fitted)fit();draw();}
 function update(amount){const limits=range();if(!limits||!Number.isFinite(amount)||amount<limits.min-.000001||amount>limits.max+.000001)return;value=Math.max(limits.min,Math.min(limits.max,amount));sync();draw();}
 function commit(){
  if(busy||!enabled()||Math.abs(value-original)<.000001||!range())return;let payload=value;
  try{if(allTiers)payload={tiers:Group.changes(data.tiers,selected,value)};}catch(error){message(error.message,true);return;}
  busy=true;sync();const next=value;Promise.resolve(api.onChange(payload)).then(()=>{if(!closed){original=next;message('World size draft updated. Save changes to apply it to gameplay.');}}).catch(error=>{if(!closed){value=original;sync();draw();message(error.message,true);}}).finally(()=>{busy=false;if(!closed)sync();});
 }
 number.oninput=()=>{if(!busy&&enabled()&&number.value.trim())update(Number(number.value)/100);};number.onchange=()=>{const amount=Number(number.value)/100,limits=range();if(!limits||!Number.isFinite(amount)||amount<limits.min||amount>limits.max){update(original);message('Choose a size that keeps each selected tier between 5% and 1,000%.',true);return;}update(amount);commit();};
 slider.oninput=()=>{if(!busy&&enabled())update(Number(slider.value)/100);};slider.onchange=commit;fitButton.onclick=()=>{zoom=1;fit();};
 allInput.onchange=()=>{if(busy||loading)return;allTiers=allInput.checked;state.allTiers=allTiers;drag=null;fitted=false;value=original=1;pending=load();};
 function selectionControls(){
  tierControls.textContent='';tierInputs.clear();if(!allTiers)return;
  const info=make('span','Tiers to resize:',tierControls);info.className='bld-scale-selection-label';
  for(const tier of data.tiers){const label=make('label',undefined,tierControls),input=make('input',undefined,label);input.type='checkbox';const duplicate=data.tiers.filter(t=>t.level===tier.level).length>1,name='Tier '+tier.level+(duplicate?' · Variant '+(data.tiers.filter(t=>t.level===tier.level).indexOf(tier)+1):''),text=make('span',name,label);input.setAttribute('aria-label','Resize '+name);tierInputs.set(tier.index,{input,text,label:name});input.onchange=()=>{if(busy||loading)return;value=original=1;drag=null;if(input.checked)selected.add(tier.index);else selected.delete(tier.index);partsControls();sync();draw();};}
  for(const [name,all]of [['Select all',true],['Select none',false]]){const button=make('button',name,tierControls);button.type='button';button.onclick=()=>{if(busy||loading)return;value=original=1;selected=new Set(all?data.tiers.map(t=>t.index):[]);partsControls();sync();draw();};}
 }
 function partsControls(){
  partControls.textContent='';const tiers=allTiers?data.tiers.filter(t=>selected.has(t.index)):data.tiers.filter(t=>t.position===api.request.levelIndex),parts=new Map();
  for(const t of tiers)for(const p of t.parts||[])parts.set(p.key,p.label);
  partControls.hidden=!parts.size;if(!parts.size)return;
  make('strong','Separate object sizes',partControls);make('small',allTiers?'Resize these objects in selected tiers by the same percentage. 100% leaves their saved sizes unchanged.':'Resize these objects independently of the building. 100% is their original size. Changes remain drafts until Save.',partControls);
  for(const [key,label]of parts){
   const targets=tiers.filter(t=>(t.parts||[]).some(p=>p.key===key)).map(t=>({position:t.position,index:t.index,part:t.parts.find(p=>p.key===key)})),current=allTiers?1:targets[0].part.value,min=allTiers?Math.max(...targets.map(t=>.05/t.part.value)):.05,max=allTiers?Math.min(...targets.map(t=>10/t.part.value)):10;
   const wrap=make('label',undefined,partControls);wrap.className='bld-part-scale';make('span',label,wrap);const input=make('input',undefined,wrap);input.type='number';input.min=String(min*100);input.max=String(max*100);input.step='any';input.value=String(Math.round(current*10000)/100);input.setAttribute('aria-label',label+' size percent');make('span','%',wrap);
   const slider=make('input',undefined,wrap);slider.type='range';slider.min=input.min;slider.max=input.max;slider.step='any';slider.value=input.value;slider.setAttribute('aria-label',label+' size');
   const reset=make('button',allTiers?'Reset selected to original':'Reset to original',wrap);reset.type='button';
   async function change(amount,resetting){
    if(busy||loading)return;if(!Number.isFinite(amount)||amount<min-.000001||amount>max+.000001){input.value=slider.value=String(current*100);message('Keep each object between 5% and 1,000% of its original size.',true);return;}
    const changes=targets.map(t=>({position:t.position,index:t.index,key,from:t.part.value,value:resetting?1:allTiers?t.part.value*amount:amount})).filter(t=>Math.abs(t.value-t.from)>.000001);
    if(!changes.length)return;busy=true;sync();try{await api.onChange({parts:changes});if(!closed){busy=false;pending=load();await pending;}}catch(error){if(!closed){input.value=slider.value=String(current*100);message(error.message,true);}}finally{busy=false;if(!closed)sync();}
   }
   slider.oninput=()=>{input.value=slider.value;};slider.onchange=()=>change(Number(slider.value)/100,false);input.onchange=()=>change(input.value.trim()?Number(input.value)/100:NaN,false);reset.onclick=()=>change(current,true);
  }
 }
 function local(e){const b=canvas.getBoundingClientRect();return{x:((e.clientX-b.left-canvas.clientLeft)*canvas.width/canvas.clientWidth-canvas.width/2)/(unit*zoom)+cx,y:-((e.clientY-b.top-canvas.clientTop)*canvas.height/canvas.clientHeight-canvas.height/2)/(unit*zoom)+cy};}
 function endPan(cancel){const old=pan;pan=null;if(!old)return;if(cancel){cx=old.cx;cy=old.cy;}if(canvas.hasPointerCapture(old.id))canvas.releasePointerCapture(old.id);canvas.style.cursor='nwse-resize';draw();}
 canvas.onpointerdown=e=>{if(e.button===1&&data&&!drag&&!pan){e.preventDefault();canvas.focus();pan={id:e.pointerId,x:e.clientX,y:e.clientY,cx,cy};canvas.style.cursor='grabbing';canvas.setPointerCapture(e.pointerId);return;}if(e.button!==0||pan||busy||!enabled())return;const items=layout().filter(item=>chosen(item.entry)),b=union(items),p=local(e);if(!b||Math.hypot(p.x-b.maxX,p.y-b.maxY)*unit*zoom>15)return;e.preventDefault();canvas.focus();const width=items.reduce((sum,item)=>sum+item.box.maxX-item.box.minX,0);drag={before:value,anchorX:allTiers?b.minX:0,fixedX:allTiers?b.maxX-b.minX-width:0,x:allTiers?width:b.maxX,y:b.maxY,pointer:e.pointerId};canvas.setPointerCapture(e.pointerId);};
 canvas.onpointermove=e=>{if(pan){if(e.pointerId!==pan.id)return;e.preventDefault();cx=pan.cx-(e.clientX-pan.x)*canvas.width/canvas.clientWidth/(unit*zoom);cy=pan.cy+(e.clientY-pan.y)*canvas.height/canvas.clientHeight/(unit*zoom);draw();return;}if(!drag)return;const p=local(e),den=drag.x*drag.x+drag.y*drag.y,ratio=den?((p.x-drag.anchorX-drag.fixedX)*drag.x+p.y*drag.y)/den:1,limits=range();if(limits)update(Math.max(limits.min,Math.min(limits.max,drag.before*ratio)));};
 canvas.onpointerup=e=>{if(pan&&pan.id===e.pointerId){endPan(false);return;}if(!drag)return;drag=null;if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);commit();};
 function cancel(){endPan(true);if(drag){const old=drag;drag=null;update(old.before);if(canvas.hasPointerCapture(old.pointer))canvas.releasePointerCapture(old.pointer);}}
 canvas.onpointercancel=canvas.onlostpointercapture=cancel;canvas.onauxclick=e=>{if(e.button===1)e.preventDefault();};canvas.onkeydown=e=>{if(e.key==='Escape'){cancel();e.preventDefault();}};canvas.onwheel=e=>{e.preventDefault();zoom=Math.max(.2,Math.min(8,zoom*Math.exp(-e.deltaY*.001)));draw();};
 function draw(){if(closed||frame!==null)return;frame=requestAnimationFrame(()=>{
  frame=null;if(closed)return;g.setTransform(1,0,0,1,0,0);g.fillStyle='#899c59';g.fillRect(0,0,canvas.width,canvas.height);if(!enabled())return;
  const items=layout(),b=union(items);if(!b)return;const z=unit*zoom,p=heroPosition(b);g.setTransform(z,0,0,-z,canvas.width/2-cx*z,canvas.height/2+cy*z);
  g.strokeStyle='#ffffff16';g.lineWidth=1/z;for(let x=Math.floor((cx-canvas.width/z/2)/100)*100;x<cx+canvas.width/z/2;x+=100){g.beginPath();g.moveTo(x,cy-canvas.height/z/2);g.lineTo(x,cy+canvas.height/z/2);g.stroke();}for(let y=Math.floor((cy-canvas.height/z/2)/100)*100;y<cy+canvas.height/z/2;y+=100){g.beginPath();g.moveTo(cx-canvas.width/z/2,y);g.lineTo(cx+canvas.width/z/2,y);g.stroke();}
  for(const item of items){const parts=renderer.parts(item.building,item.record);for(const part of parts.filter(p=>p.ground).concat(parts.filter(p=>!p.ground)))renderer.draw(g,part,images,data.runtimePath);if(allTiers){g.strokeStyle=chosen(item.entry)?'#90e8ff99':'#b4c0cc77';g.lineWidth=1/z;g.strokeRect(item.box.minX,item.box.minY,item.box.maxX-item.box.minX,item.box.maxY-item.box.minY);}}
  g.save();g.translate(p.x+heroBounds.minX,heroBounds.maxY);g.scale(heroBounds.width/heroImage.width,-heroBounds.height/heroImage.height);g.drawImage(heroImage,0,0);g.restore();
  const box=union(items.filter(item=>chosen(item.entry)));if(box){g.strokeStyle='#90e8ff';g.lineWidth=1.5/z;g.setLineDash([5/z,4/z]);g.strokeRect(box.minX,box.minY,box.maxX-box.minX,box.maxY-box.minY);g.setLineDash([]);g.fillStyle='#90e8ff';g.fillRect(box.maxX-5/z,box.maxY-5/z,10/z,10/z);}
  g.save();g.scale(1,-1);g.font=(12/z)+'px Segoe UI';g.fillStyle='#eef8ff';g.textAlign='center';g.fillText('Hero · gameplay size',p.x+(heroBounds.minX+heroBounds.maxX)/2,-heroBounds.minY+18/z);if(allTiers)for(const item of items)g.fillText('Tier '+item.entry.level,(item.box.minX+item.box.maxX)/2,-b.minY+18/z);g.textAlign='left';g.fillText('Grid: 100 world units',cx-canvas.width/z/2+12/z,-cy+canvas.height/z/2-12/z);g.restore();
 });}
 async function load(){
  loading=true;const current=++serial;sync();message('Loading building tiers and hero…');
  try{
   const result=await api.ipc('building-scale-preview',Object.assign({},api.request,{allTiers}));if(closed||current!==serial)return;data=result;
   const ids=new Set(data.tiers.map(t=>t.index));if(!selectionInitialized){selected=new Set(ids);selectionInitialized=true;}else selected=new Set(Array.from(selected).filter(id=>ids.has(id)));
   if(allTiers){value=original=1;entries=data.tiers.map(t=>Object.assign({},t,{base:t.record}));}else{value=original=result.worldScale;const t=data.tiers.find(t=>t.position===api.request.levelIndex);entries=[Object.assign({},t,{base:Scale.record(result.record,1/original)})];}
   selectionControls();partsControls();renderer.prepare(entries.map(e=>e.base),data.runtimePath);const frames=new Set(entries.flatMap(e=>e.base.sprites.map(s=>s.frame))),spec={images:Object.fromEntries(Object.entries(result.images).filter(([key])=>frames.has(key)))};
   const spine=require(result.runtimePath),layers=await Spine.createLayers(spine,result.hero);if(closed||current!==serial)return;Spine.seek(spine,layers,'idle',0,false);const b=Spine.bounds(spine,layers),pixelScale=Math.min(2,2040/b.width,2040/b.height),padding=2,c=Paint.canvas(Math.ceil(b.width*pixelScale)+padding*2,Math.ceil(b.height*pixelScale)+padding*2),ctx=c.getContext('2d');ctx.setTransform(pixelScale,0,0,-pixelScale,padding-b.minX*pixelScale,padding+b.maxY*pixelScale);Spine.drawWorld(spine,ctx,layers);if(heroImage)heroImage.width=heroImage.height=1;heroImage=c;heroBounds={minX:b.minX-padding/pixelScale,maxX:b.minX-padding/pixelScale+c.width/pixelScale,minY:b.maxY+padding/pixelScale-c.height/pixelScale,maxY:b.maxY+padding/pixelScale,width:c.width/pixelScale,height:c.height/pixelScale};
   const loadedImages=await Paint.loadImages(spec);if(closed||current!==serial)return;images=loadedImages;message(allTiers?'Selected tiers resize together. Save changes applies every selected size.':'The hero keeps its gameplay size. Changes stay in the draft until Save changes.');
  }catch(error){if(!closed&&current===serial)message(error.message,true);}finally{if(!closed&&current===serial){loading=false;loaded();}}
 }
 // Resize the buffer as well as the CSS box; stretching a fixed buffer would
 // distort both the building and its hero reference in wide or narrow panels.
 const observer=typeof ResizeObserver!=='undefined'?new ResizeObserver(resize):null;if(observer)observer.observe(canvas);resize();
 sync();pending=load();
 return{get ready(){return pending;},stats,destroy(){if(closed)return;endPan(false);cancel();closed=true;serial++;Object.assign(state,{unit,zoom,cx,cy,fitted,allTiers,selection:Array.from(selected),width:canvas.width,height:canvas.height});if(observer)observer.disconnect();renderer.destroy();if(heroImage)heroImage.width=heroImage.height=1;if(frame!==null)cancelAnimationFrame(frame);canvas.onpointerdown=canvas.onpointermove=canvas.onpointerup=canvas.onpointercancel=canvas.onlostpointercapture=canvas.onauxclick=canvas.onkeydown=canvas.onwheel=null;canvas.width=canvas.height=1;root.remove();}};
}
module.exports={mount};
