'use strict';
const Renderer=require('../worlds/building-renderer'),Paint=require('../worlds/paint'),Spine=require('../preview/spine-renderer'),Scale=require('../../../assets/_script/BuildingWorldScale');
function mount(host,api){
 const state=api.state||{},make=(tag,text,parent)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(parent)parent.appendChild(e);return e;};
 const root=make('div',undefined,host);root.className='bld-scale';
 const controls=make('div',undefined,root);controls.className='bld-scale-controls';
 const label=make('label','World size',controls),number=make('input',undefined,label);number.type='number';number.min='5';number.max='1000';number.step='.1';number.setAttribute('aria-label','Building world size percent');make('span','%',label);
 const slider=make('input',undefined,controls);slider.type='range';slider.min='5';slider.max='1000';slider.step='1';slider.setAttribute('aria-label','Building world size');
 const fitButton=make('button','Fit preview',controls);fitButton.type='button';
 const canvas=make('canvas',undefined,root);canvas.className='bld-blocker-canvas bld-scale-canvas';canvas.width=900;canvas.height=430;canvas.tabIndex=0;canvas.setAttribute('aria-label','Building scale preview with hero');
 const help=make('p','Drag the corner handle or adjust World size. The hero stays at gameplay size. Wheel zooms the view; Fit preview fits both models.',root),status=make('p','Loading building and hero…',root);help.className=status.className='bld-blocker-help';
 if(!canvas.getContext)return{ready:Promise.resolve(),destroy(){},stats:()=>({poses:0,ready:0})};
 const g=canvas.getContext('2d');let closed=false,frame=null,data,base,images={},heroImage,heroBounds,value=1,original=1,drag=null,busy=false,fitted=!!state.fitted,unit=state.unit||1,zoom=state.zoom||1,cx=state.cx||0,cy=state.cy||0;
 const building={x:0,y:0,scale:1,angle:0},renderer=Renderer.create({onLoad:loaded,onError:e=>message(e.message,true)});
 function message(text,error){status.textContent=text;status.className='bld-blocker-help'+(error?' error':'');}
 function stats(){const s=renderer.stats();return Object.assign({},s,{poses:s.poses+1,ready:s.ready+(heroImage?1:0),worldScale:value,viewScale:unit*zoom,heroHeight:heroBounds?heroBounds.height:0});}
 function enabled(){return data&&heroImage&&stats().ready===stats().poses;}
 function sync(){number.value=String(Math.round(value*10000)/100);slider.value=String(value*100);number.disabled=slider.disabled=!enabled()||busy;}
 function current(){return base&&Scale.record(base,value);}
 function bounds(){return data&&renderer.measure(current(),data.runtimePath);}
 function heroPosition(b){return{x:Math.max(0,b.maxX)+35-heroBounds.minX,y:0};}
 function fit(){const b=bounds();if(!b||!heroBounds)return;const p=heroPosition(b),minX=Math.min(b.minX,p.x+heroBounds.minX),maxX=Math.max(b.maxX,p.x+heroBounds.maxX),minY=Math.min(b.minY,heroBounds.minY),maxY=Math.max(b.maxY,heroBounds.maxY);cx=(minX+maxX)/2;cy=(minY+maxY)/2;unit=Math.min((canvas.width-100)/Math.max(1,maxX-minX),(canvas.height-80)/Math.max(1,maxY-minY));fitted=true;draw();}
 function loaded(){if(closed)return;sync();if(enabled()&&!fitted)fit();draw();}
 function update(amount){if(!Scale.valid(amount))return;value=amount;sync();draw();}
 function commit(){if(busy||!enabled()||Math.abs(value-original)<.000001)return;busy=true;sync();const next=value;Promise.resolve(api.onChange(next)).then(()=>{if(!closed){original=next;message('World size draft updated. Save changes to apply it to gameplay.');}}).catch(error=>{if(!closed){value=original;sync();draw();message(error.message,true);}}).finally(()=>{busy=false;if(!closed)sync();});}
 number.oninput=()=>{if(!busy&&enabled()&&number.value.trim())update(Number(number.value)/100);};number.onchange=()=>{if(!Scale.valid(Number(number.value)/100)){update(original);message('Enter a size between 5% and 1,000%.',true);return;}update(Number(number.value)/100);commit();};
 slider.oninput=()=>{if(!busy&&enabled())update(Number(slider.value)/100);};slider.onchange=commit;fitButton.onclick=()=>{zoom=1;fit();};
 function local(e){const b=canvas.getBoundingClientRect();return{x:((e.clientX-b.left)*canvas.width/b.width-canvas.width/2)/(unit*zoom)+cx,y:-((e.clientY-b.top)*canvas.height/b.height-canvas.height/2)/(unit*zoom)+cy};}
 canvas.onpointerdown=e=>{if(e.button!==0||busy||!enabled())return;const b=bounds(),p=local(e);if(!b||Math.hypot(p.x-b.maxX,p.y-b.maxY)*unit*zoom>15)return;e.preventDefault();canvas.focus();drag={before:value,x:b.maxX,y:b.maxY,pointer:e.pointerId};canvas.setPointerCapture(e.pointerId);};
 canvas.onpointermove=e=>{if(!drag)return;const p=local(e),den=drag.x*drag.x+drag.y*drag.y,ratio=den?(p.x*drag.x+p.y*drag.y)/den:1;update(Math.max(.05,Math.min(10,drag.before*ratio)));};
 canvas.onpointerup=e=>{if(!drag)return;drag=null;if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);commit();};
 function cancel(){if(drag){update(drag.before);drag=null;}}
 canvas.onpointercancel=cancel;canvas.onkeydown=e=>{if(e.key==='Escape'){cancel();e.preventDefault();}};
 canvas.onwheel=e=>{e.preventDefault();zoom=Math.max(.2,Math.min(8,zoom*Math.exp(-e.deltaY*.001)));draw();};
 function draw(){if(closed||frame!==null)return;frame=requestAnimationFrame(()=>{
  frame=null;if(closed)return;g.setTransform(1,0,0,1,0,0);g.fillStyle='#899c59';g.fillRect(0,0,canvas.width,canvas.height);if(!enabled())return;
  const record=current(),b=bounds();if(!b)return;const z=unit*zoom,p=heroPosition(b);g.setTransform(z,0,0,-z,canvas.width/2-cx*z,canvas.height/2+cy*z);
  g.strokeStyle='#ffffff16';g.lineWidth=1/z;for(let x=Math.floor((cx-canvas.width/z/2)/100)*100;x<cx+canvas.width/z/2;x+=100){g.beginPath();g.moveTo(x,cy-canvas.height/z/2);g.lineTo(x,cy+canvas.height/z/2);g.stroke();}for(let y=Math.floor((cy-canvas.height/z/2)/100)*100;y<cy+canvas.height/z/2;y+=100){g.beginPath();g.moveTo(cx-canvas.width/z/2,y);g.lineTo(cx+canvas.width/z/2,y);g.stroke();}
  const all=renderer.parts(building,record);for(const part of all.filter(p=>p.ground).concat(all.filter(p=>!p.ground)))renderer.draw(g,part,images,data.runtimePath);
  g.save();g.translate(p.x+heroBounds.minX,heroBounds.maxY);g.scale(heroBounds.width/heroImage.width,-heroBounds.height/heroImage.height);g.drawImage(heroImage,0,0);g.restore();
  g.strokeStyle='#90e8ff';g.lineWidth=1.5/z;g.setLineDash([5/z,4/z]);g.strokeRect(b.minX,b.minY,b.maxX-b.minX,b.maxY-b.minY);g.setLineDash([]);g.fillStyle='#90e8ff';g.fillRect(b.maxX-5/z,b.maxY-5/z,10/z,10/z);
  g.save();g.scale(1,-1);g.font=(12/z)+'px Segoe UI';g.fillStyle='#eef8ff';g.textAlign='center';g.fillText('Hero · gameplay size',p.x+(heroBounds.minX+heroBounds.maxX)/2,-heroBounds.minY+18/z);g.textAlign='left';g.fillText('Grid: 100 world units',cx-canvas.width/z/2+12/z,-cy+canvas.height/z/2-12/z);g.restore();
 });}
 sync();
 const ready=api.ipc('building-scale-preview',api.request).then(async result=>{
  if(closed)return;data=result;value=original=result.worldScale;base=Scale.record(result.record,1/original);renderer.prepare([base],data.runtimePath);
  const frames=new Set(base.sprites.map(s=>s.frame)),spec={images:Object.fromEntries(Object.entries(result.images).filter(([key])=>frames.has(key)))};
  const spine=require(result.runtimePath),layers=await Spine.createLayers(spine,result.hero);if(closed)return;Spine.seek(spine,layers,'idle',0,false);const b=Spine.bounds(spine,layers),pixelScale=Math.min(2,2040/b.width,2040/b.height),padding=2,c=Paint.canvas(Math.ceil(b.width*pixelScale)+padding*2,Math.ceil(b.height*pixelScale)+padding*2),ctx=c.getContext('2d');ctx.setTransform(pixelScale,0,0,-pixelScale,padding-b.minX*pixelScale,padding+b.maxY*pixelScale);Spine.drawWorld(spine,ctx,layers);heroImage=c;heroBounds={minX:b.minX-padding/pixelScale,maxX:b.minX-padding/pixelScale+c.width/pixelScale,minY:b.maxY+padding/pixelScale-c.height/pixelScale,maxY:b.maxY+padding/pixelScale,width:c.width/pixelScale,height:c.height/pixelScale};
  images=await Paint.loadImages(spec);if(closed)return;if(state.fitted)fitted=true;loaded();message('The hero keeps its gameplay size. Changes stay in the draft until Save changes.');
 }).catch(error=>{if(!closed)message(error.message,true);});
 return{ready,stats,destroy(){if(closed)return;closed=true;Object.assign(state,{unit,zoom,cx,cy,fitted});renderer.destroy();if(heroImage)heroImage.width=heroImage.height=1;if(frame!==null)cancelAnimationFrame(frame);canvas.onpointerdown=canvas.onpointermove=canvas.onpointerup=canvas.onpointercancel=canvas.onkeydown=canvas.onwheel=null;canvas.width=canvas.height=1;root.remove();}};
}
module.exports={mount};
