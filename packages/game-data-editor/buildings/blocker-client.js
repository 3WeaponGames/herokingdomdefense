'use strict';
const Renderer=require('../worlds/building-renderer'),Paint=require('../worlds/paint'),Maps=require('../lib/map-assets'),Clip=require('../worlds/blockers');
const clone=value=>JSON.parse(JSON.stringify(value));
function mount(host,api){
 const state=api.state||{},make=(tag,text)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;return e;};
 host=host.appendChild(make('div'));host.className='bld-blocker';
 const tools=make('div'),canvas=make('canvas'),status=make('p'),help=make('p');tools.className='bld-blocker-tools';canvas.className='bld-blocker-canvas';canvas.width=900;canvas.height=430;canvas.tabIndex=0;canvas.setAttribute('aria-label','Building blocker preview');
 help.textContent='Click polygon points, then double-click or click the first point to finish. Enter completes; Escape cancels. Yellow is blocked; cyan marks the editable copy. Wheel to zoom.';help.className=status.className='bld-blocker-help';
 host.appendChild(tools);host.appendChild(canvas);host.appendChild(help);host.appendChild(status);
 if(!canvas.getContext)return {destroy(){}};
 let closed=false,data,images={},value,points=state.points||[],pointer=null,busy=false,frame=null;
 let scale=1,zoom=state.zoom||1,cx=0,cy=0,tool=state.tool||'paint',partKey=state.part||'body',instance=state.instance||0;
 const g=canvas.getContext('2d'),renderer=Renderer.create({onLoad:draw,onError:error=>message(error.message,true)}),building={x:0,y:0,scale:1,angle:0};
 function message(text,error){status.textContent=text;status.className='bld-blocker-help'+(error?' error':'');}
 function action(label,run){const b=make('button',label);b.type='button';b.onclick=run;tools.appendChild(b);return b;}
 const add=action('Polygon blocker',()=>choose('paint')),erase=action('Polygon erase',()=>choose('erase'));
  action('Clear blocker',()=>{if(!value||busy)return;const next=clone(value);for(const p of data.parts)next[p.key]=Object.assign({},next[p.key],{mask:[],polygons:[]});points=[];commit(next);});
 action('Cancel polygon',()=>{points=[];pointer=null;draw();});
 action('Fit preview',()=>{zoom=1;fit();});
 const parts=make('select');parts.setAttribute('aria-label','Blocker part');parts.onchange=()=>{partKey=parts.value;instance=0;points=[];pointer=null;refreshCopies();draw();};tools.appendChild(parts);
 const copies=make('select');copies.setAttribute('aria-label','Edit connection point');copies.onchange=()=>{instance=Number(copies.value);points=[];pointer=null;draw();};tools.appendChild(copies);
 function part(){return data&&data.parts.find(p=>p.key===partKey);}
 function matrix(){const p=part();return p&&p.instances[instance];}
 function refreshCopies(){copies.textContent='';const p=part();instance=Math.min(instance,Math.max(0,(p&&p.instances.length||0)-1));(p&&p.instances||[]).forEach((_m,i)=>{const o=make('option','Connection '+(i+1));o.value=String(i);copies.appendChild(o);});copies.value=String(instance);copies.hidden=!p||p.instances.length<2;}
 function choose(next,reset=true){tool=next;if(reset){points=[];pointer=null;}add.className=next==='paint'?'active':'';erase.className=next==='erase'?'active':'';draw();}
 function local(event){const b=canvas.getBoundingClientRect(),world={x:((event.clientX-b.left)*canvas.width/b.width-canvas.width/2)/(scale*zoom)+cx,y:-((event.clientY-b.top)*canvas.height/b.height-canvas.height/2)/(scale*zoom)+cy};return Maps.point(Maps.inverse(matrix()),world);}
 function screenDistance(a,b){const m=matrix(),p=Maps.point(m,a),q=Maps.point(m,b);return Math.hypot(p.x-q.x,p.y-q.y)*scale*zoom;}
 async function commit(next){
  if(JSON.stringify(next)===JSON.stringify(value)){draw();return;}
  const before=value;value=next;busy=true;draw();message('Updating shared blocker draft…');
  try{await api.onChange(next);if(!closed)message('Blocker draft updated. Save changes to apply it to gameplay.');}
  catch(error){if(!closed){value=before;message(error.message,true);draw();}}
  finally{busy=false;}
 }
 function finish(){if(busy||!value)return;try{const shape=Clip.polygonBrush(points),next=clone(value),mask=Clip.combineMask(value[partKey].mask,shape,tool);next[partKey]=Object.assign({},next[partKey],{mask,polygons:Clip.collisionPolygons(mask)});points=[];pointer=null;commit(next);}catch(error){message(error.message,true);draw();}}
 canvas.onpointerdown=event=>{
  if(event.button!==0||busy||!matrix())return;canvas.focus();event.preventDefault();
  const p=local(event);
  if(points.length>=3&&screenDistance(points[0],p)<10){finish();return;}
  // The second click of a double-click is consumed by ondblclick below.
  if(event.detail>1)return;
  if(!points.length||screenDistance(points[points.length-1],p)>2)points.push(p);
  pointer=p;draw();
 };
 canvas.onpointermove=event=>{if(!matrix()||busy)return;pointer=local(event);draw();};
 canvas.onpointerleave=()=>{pointer=null;draw();};canvas.ondblclick=event=>{event.preventDefault();finish();};
 canvas.onkeydown=event=>{if(event.key==='Escape'){points=[];pointer=null;draw();event.preventDefault();}else if(event.key==='Enter'){finish();event.preventDefault();}else if(event.key==='Backspace'&&points.length){points.pop();draw();event.preventDefault();}};
 canvas.onwheel=event=>{event.preventDefault();zoom=Math.max(.3,Math.min(8,zoom*Math.exp(-event.deltaY*.001)));draw();};
 function fit(){
  if(!data)return;const p=[],o=data.record.origin;
  for(const s of data.record.sprites||[]){const a=s.anchor||{x:.5,y:0};for(const x of [-a.x*s.width,(1-a.x)*s.width])for(const y of [-a.y*s.height,(1-a.y)*s.height]){const q=Maps.point(s.matrix,{x,y});p.push({x:q.x-o.x,y:q.y-o.y});}}
  for(const s of data.record.skeletons||[]){const b=s.json.skeleton;for(const x of [b.x,b.x+b.width])for(const y of [b.y,b.y+b.height]){const q=Maps.point(s.matrix,{x,y});p.push({x:q.x-o.x,y:q.y-o.y});}}
  for(const part of data.parts)for(const m of part.instances)for(const region of value[part.key].mask)for(const ring of region)for(const point of ring)p.push(Maps.point(m,{x:point[0],y:point[1]}));
  const finite=p.filter(p=>Number.isFinite(p.x)&&Number.isFinite(p.y));if(!finite.length)return;
  const minX=Math.min(...finite.map(p=>p.x)),maxX=Math.max(...finite.map(p=>p.x)),minY=Math.min(...finite.map(p=>p.y)),maxY=Math.max(...finite.map(p=>p.y));cx=(minX+maxX)/2;cy=(minY+maxY)/2;scale=Math.min((canvas.width-70)/Math.max(1,maxX-minX),(canvas.height-60)/Math.max(1,maxY-minY));draw();
 }
 function maskPath(mask){g.beginPath();for(const region of mask)for(const ring of region){ring.forEach((p,i)=>i?g.lineTo(p[0],p[1]):g.moveTo(p[0],p[1]));g.closePath();}}
 function draw(){if(closed||frame!==null)return;frame=requestAnimationFrame(()=>{
  frame=null;if(closed)return;g.setTransform(1,0,0,1,0,0);g.fillStyle='#899c59';g.fillRect(0,0,canvas.width,canvas.height);if(!data)return;
  g.setTransform(scale*zoom,0,0,-scale*zoom,canvas.width/2-cx*scale*zoom,canvas.height/2+cy*scale*zoom);
  for(const p of renderer.parts(building,data.record))renderer.draw(g,p,images,data.runtimePath);
  let preview=value[partKey]&&value[partKey].mask;
  if(points.length>=2&&pointer)try{preview=Clip.combineMask(preview,Clip.polygonBrush(points.concat([pointer])),tool);}catch(_){}
  for(const p of data.parts)for(let i=0;i<p.instances.length;i++){
   const m=p.instances[i];g.save();Paint.apply(g,m);maskPath(p.key===partKey?preview:value[p.key].mask);g.fillStyle='#ffe25a60';g.fill('evenodd');g.strokeStyle=p.key===partKey&&i===instance?'#74edff':'#ffe25a';g.lineWidth=1.5/(scale*zoom*Math.max(.01,Math.hypot(m[0],m[1])));g.stroke();g.restore();
  }
  if(matrix()&&points.length){g.save();Paint.apply(g,matrix());g.strokeStyle=tool==='erase'?'#ff8b80':'#fff6ab';g.lineWidth=2/(scale*zoom);g.beginPath();points.forEach((p,i)=>i?g.lineTo(p.x,p.y):g.moveTo(p.x,p.y));if(pointer)g.lineTo(pointer.x,pointer.y);g.stroke();for(const p of points){g.beginPath();g.arc(p.x,p.y,4/(scale*zoom),0,Math.PI*2);g.fillStyle='#fff6ab';g.fill();}g.restore();}
 });}
 const ready=api.ipc('building-blocker-preview',api.request).then(async result=>{
  if(closed)return;data=result;value=clone(result.value);if(!data.parts.some(p=>p.key===partKey))partKey=data.parts[0].key;
  for(const p of data.parts){const o=make('option',p.label);o.value=p.key;parts.appendChild(o);}parts.value=partKey;parts.hidden=data.parts.length<2;refreshCopies();choose(tool,false);
  const frames=new Set(result.record.sprites.map(s=>s.frame)),spec={images:Object.fromEntries(Object.entries(result.images).filter(([key])=>frames.has(key)))};
  renderer.prepare([result.record],result.runtimePath);if(state.view){({scale,cx,cy}=state.view);draw();}else fit();images=await Paint.loadImages(spec);if(closed)return;draw();message(data.parts.length>1?'Gate, pillars and connecting walls. Edits repeat at every matching connection point.':'Draw or erase a blocker. Changes stay in the shared draft until Save.');
 }).catch(error=>{if(!closed)message(error.message,true);});
 return {ready,stats:renderer.stats,destroy(){if(closed)return;closed=true;Object.assign(state,{tool,part:partKey,instance,zoom,points:clone(points)});if(data)state.view={scale,cx,cy};renderer.destroy();if(frame!==null)cancelAnimationFrame(frame);canvas.onpointerdown=canvas.onpointermove=canvas.onpointerleave=canvas.ondblclick=canvas.onkeydown=canvas.onwheel=null;canvas.width=canvas.height=1;}};
}
module.exports={mount};
