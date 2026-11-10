'use strict';
const Kit=require('../../../assets/_script/WallKit'),Facing=require('../../../assets/_script/GateFacing'),Renderer=require('./building-renderer');
const clone=v=>JSON.parse(JSON.stringify(v)),K=Math.tan(Math.PI/6);
function arrays(layout){return {left:(layout.leftPoints||Kit.chain(layout.leftEnd,layout.left,layout.leftCount)).map(p=>p.x),right:(layout.rightPoints||Kit.chain(layout.right,layout.rightEnd,layout.rightCount)).map(p=>p.x)};}
function resetPositions(run){const result=clone(run),old=result.handles;delete result.handles;if(old)result.handles=Object.assign({},old,arrays(Kit.layout(result)));return result;}
function move(run,layout,handle,along,depth){
 const base=clone(run);base.handles=Object.assign({},base.handles,arrays(layout));
 function candidate(factor){
  const result=clone(base);
  if(handle.kind==='socket'){
   result.sockets=Object.assign({left:0,right:0,depth:0},result.sockets);
   result.sockets[handle.side]=Math.max(-20,Math.min(20,result.sockets[handle.side]+along*factor));
   result.sockets.depth=Math.max(-20,Math.min(20,result.sockets.depth+depth*factor));
  }else{
   const a=result.handles[handle.side],indices=handle.kind==='section'?[handle.index,handle.index+1]:[handle.index];
   indices.forEach(i=>a[i]+=along*factor);
   if(!run.gate){if(handle.side==='left'&&indices.includes(a.length-1))result.handles.right[0]=a[a.length-1];if(handle.side==='right'&&indices.includes(0))result.handles.left[result.handles.left.length-1]=a[0];}
  }
  return result;
 }
 let result=candidate(1);if(Kit.validRun(result))return result;
 let lo=0,hi=1;for(let i=0;i<35;i++){const mid=(lo+hi)/2;if(Kit.validRun(candidate(mid)))lo=mid;else hi=mid;}return candidate(lo);
}
function handles(layout,level){
 const result=[],a=arrays(layout),intercept=layout.left.y+K*layout.left.x;
 for(const side of ['left','right']){
  a[side].forEach((x,index)=>result.push({kind:'post',side,index,x,y:intercept-K*x,label:side+' post '+(index+1)}));
  for(let i=0;i<a[side].length-1;i++){const x=(a[side][i]+a[side][i+1])/2;result.push({kind:'section',side,index:i,x,y:intercept-K*x+14,label:side+' wall section '+(i+1)});}
 }
 if(layout.gate){const h=Kit.hinges(layout,Kit.connectors[level-1]);for(const side of ['left','right'])result.push({kind:'socket',side,x:h[side].x,y:h[side].y+27,label:side+' gate connection'});}
 return result;
}
function mount(host,options){
 const main=options.record.skeletons.find(s=>s.json.wallKit);if(!main)throw Error('Refresh the wall asset before editing its layout.');
 let run=clone(options.run||{left:main.json.wallKit.layout.leftCount,right:main.json.wallKit.layout.rightCount,gate:true,start:'post',end:'post',spacing:1});
 if(!options.run)run.handles=arrays(main.json.wallKit.layout);
 const initial=JSON.stringify(run),origin=options.record.origin||{x:0,y:0},matrix=main.matrix;
 let level=1,open=false,closed=false,frame=null,drag=null,record,scale=1,cx=0,cy=0,zoom=1;
 const make=(tag,text)=>{const e=document.createElement(tag);if(text)e.textContent=text;return e;},tools=make('div'),canvas=make('canvas'),status=make('p'),caption=make('p');
 tools.className='world-actions';canvas.className='world-wall-layout-canvas';canvas.width=820;canvas.height=430;canvas.style.cssText='width:100%;height:430px;touch-action:none;background:#899c59;border:1px solid #222';status.className=caption.className='world-note';
 host.classList.add('world-wall-layout-dialog');host.style.width='880px';host.style.maxWidth='96%';host.appendChild(tools);host.appendChild(canvas);host.appendChild(caption);host.appendChild(status);
 caption.textContent='Drag blue circles to position posts, diamonds to move wall sections, and gold squares to fit gate connections. The closed gate stays on one straight diagonal. Wheel to zoom.';
 const renderer=Renderer.create({onLoad:draw,onError:error=>{status.textContent=error.message;}}),g=canvas.getContext('2d'),building={x:0,y:0,scale:1,angle:0};
 const local=p=>({x:matrix[0]*p.x+matrix[2]*p.y+matrix[4]-origin.x,y:matrix[1]*p.x+matrix[3]*p.y+matrix[5]-origin.y});
 function rootPoint(e){const b=canvas.getBoundingClientRect(),x=((e.clientX-b.left)*canvas.width/b.width-canvas.width/2)/(scale*zoom)+cx,y=-((e.clientY-b.top)*canvas.height/b.height-canvas.height/2)/(scale*zoom)+cy,px=x+origin.x-matrix[4],py=y+origin.y-matrix[5],det=matrix[0]*matrix[3]-matrix[1]*matrix[2];return {x:(matrix[3]*px-matrix[2]*py)/det,y:(matrix[0]*py-matrix[1]*px)/det};}
 function fit(){const r=Kit.layout(run),points=Kit.posts(r).flatMap(p=>[local({x:p.x-30,y:p.y-12}),local({x:p.x+30,y:p.y+90})]),xs=points.map(p=>p.x),ys=points.map(p=>p.y),left=Math.min(...xs),right=Math.max(...xs),bottom=Math.min(...ys),top=Math.max(...ys);cx=(left+right)/2;cy=(bottom+top)/2;scale=Math.min((canvas.width-60)/(right-left),(canvas.height-70)/(top-bottom));zoom=1;draw();}
 function rebuild(){
  if(closed)return;const layout=Kit.layout(run);let json=Kit.install(main.json,layout);if(Facing.reverse(options.face))json=Facing.mirrorJson(json);
  record=Object.assign({},options.record,{sprites:[],skeletons:[Object.assign({},main,{json,skin:Kit.skins[level-1],animation:open?'open':'idle',poseTime:open?'end':0,revision:main.revision+':layout:'+JSON.stringify([run,level,open])})]});
  renderer.prepare([record],options.runtime);status.textContent='Blue: posts · Diamond: sections · Gold: gate connections · '+(JSON.stringify(run)===initial?'No changes':'Unsaved layout edits');draw();
 }
 function draw(){if(closed||frame!==null)return;frame=requestAnimationFrame(()=>{frame=null;if(closed)return;g.setTransform(1,0,0,1,0,0);g.clearRect(0,0,canvas.width,canvas.height);g.setTransform(scale*zoom,0,0,-scale*zoom,canvas.width/2-cx*scale*zoom,canvas.height/2+cy*scale*zoom);if(record)for(const p of renderer.parts(building,record))renderer.draw(g,p,{},options.runtime);
   const r=Kit.layout(run),a=local(r.leftEnd),b=local(r.rightEnd);g.strokeStyle='#c3e9ff99';g.lineWidth=1/(scale*zoom);g.setLineDash([4/(scale*zoom),4/(scale*zoom)]);g.beginPath();g.moveTo(a.x,a.y);g.lineTo(b.x,b.y);g.stroke();g.setLineDash([]);
   for(const h of handles(r,level)){const p=local(h),radius=(h.kind==='post'?6:5)/(scale*zoom);g.fillStyle=h.kind==='socket'?'#ffd16b':h.kind==='section'?'#b3e8ff':'#60bcff';g.strokeStyle='#173245';g.lineWidth=1.5/(scale*zoom);g.beginPath();if(h.kind==='post')g.arc(p.x,p.y,radius,0,Math.PI*2);else if(h.kind==='socket')g.rect(p.x-radius,p.y-radius,radius*2,radius*2);else{g.moveTo(p.x,p.y+radius);g.lineTo(p.x+radius,p.y);g.lineTo(p.x,p.y-radius);g.lineTo(p.x-radius,p.y);g.closePath();}g.fill();g.stroke();}
  });}
 function control(label,value,change,choices){const l=make('label'),name=make('span',label),input=make(choices?'select':'input');l.appendChild(name);if(choices)for(const v of choices){const o=make('option',String(v));o.value=String(v);input.appendChild(o);}else input.type=typeof value==='boolean'?'checkbox':'number';if(input.type==='checkbox')input.checked=value;else input.value=String(value);input.onchange=()=>{try{change(input.type==='checkbox'?input.checked:Number(input.value));rebuild();}catch(error){status.textContent=error.message;if(input.type==='checkbox')input.checked=!input.checked;}};l.appendChild(input);tools.appendChild(l);return input;}
 control('Tier',1,v=>level=v,[1,2,3]);control('Open gate',false,v=>open=v);
 for(const side of ['left','right']){const input=control(side==='left'?'Left sections':'Right sections',run[side],v=>{const next=Object.assign({},run,{[side]:v});const updated=resetPositions(next);if(!Kit.validRun(updated))throw Error('Choose 0–32 sections, with at most 48 total.');run=updated;fit();});input.min='0';input.max='32';input.step='1';}
 const fitButton=make('button','Fit preview');fitButton.onclick=fit;tools.appendChild(fitButton);const reset=make('button','Reset handle positions');reset.onclick=()=>{run=resetPositions(run);if(run.sockets)run.sockets=Object.assign({},run.sockets,{left:0,right:0,depth:0});fit();rebuild();};tools.appendChild(reset);
 function hit(e){const p=rootPoint(e),q=local(p),list=handles(Kit.layout(run),level);return list.reverse().find(h=>{const a=local(h);return Math.hypot(a.x-q.x,a.y-q.y)*scale*zoom<11;});}
 canvas.onpointerdown=e=>{if(e.button!==0)return;const h=hit(e);if(!h)return;canvas.setPointerCapture(e.pointerId);drag={handle:h,point:rootPoint(e),run:clone(run),layout:Kit.layout(run)};e.preventDefault();};
 canvas.onpointermove=e=>{if(!drag){const h=hit(e);canvas.style.cursor=h?'grab':'default';canvas.title=h?h.label:'';return;}const p=rootPoint(e),dx=p.x-drag.point.x,dy=p.y-drag.point.y;run=move(drag.run,drag.layout,drag.handle,(dx-dy/K)/2,(dx+dy/K)/2);rebuild();};
 canvas.onpointerup=e=>{drag=null;if(canvas.hasPointerCapture&&canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);};canvas.onpointercancel=()=>{if(drag){run=drag.run;drag=null;rebuild();}};
 canvas.onwheel=e=>{e.preventDefault();zoom=Math.max(.3,Math.min(5,zoom*Math.exp(-e.deltaY*.001)));draw();};
 fit();rebuild();
 return {value(){if(!Kit.validRun(run))throw Error('Correct the wall layout before applying.');return JSON.stringify(run)===initial?null:clone(run);},destroy(){if(closed)return;closed=true;if(frame!==null)cancelAnimationFrame(frame);renderer.destroy();canvas.onpointerdown=canvas.onpointermove=canvas.onpointerup=canvas.onpointercancel=canvas.onwheel=null;canvas.width=canvas.height=1;},stats:renderer.stats};
}
module.exports={mount,handles,move,arrays,resetPositions};
