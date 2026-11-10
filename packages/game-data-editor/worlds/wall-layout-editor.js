'use strict';
const Kit=require('../../../assets/_script/WallKit'),Renderer=require('./building-renderer'),Run=require('./wall-run'),Facing=require('../../../assets/_script/GateFacing');
const clone=value=>JSON.parse(JSON.stringify(value)),MAX_SIDE=256,MAX_TOTAL=512;
function arrays(layout){return {left:(layout.leftPoints||Kit.chain(layout.leftEnd,layout.left,layout.leftCount)).map(p=>p.x),right:(layout.rightPoints||Kit.chain(layout.right,layout.rightEnd,layout.rightCount)).map(p=>p.x)};}
// Conversion happens only on an actual edit; opening and no-op drags retain legacy data.
function resetPositions(run){return Kit.nativeRun(run);}
function route(run,side){const saved=run.routes&&run.routes[side];if(saved)return clone(saved);const result=[{u:0,v:0}];if(run[side])result.push({u:(side==='left'?-1:1)*run[side],v:0});return result;}
function routeLength(points){let length=0;for(let i=1;i<points.length;i++)length+=Math.abs(points[i].u-points[i-1].u)+Math.abs(points[i].v-points[i-1].v);return length;}
function bent(run,side){const points=run.routes&&run.routes[side];return !!(points&&routeLength(points)>0&&(points.length>2||points.length===2&&(points[1].v!==0||Math.sign(points[1].u)!==(side==='left'?-1:1))));}
function lastDirection(run,side){const points=route(run,side),a=points[points.length-2],b=points[points.length-1];return a&&(a.u!==b.u||a.v!==b.v)?{u:Math.sign(b.u-a.u),v:Math.sign(b.v-a.v)}:{u:side==='left'?-1:1,v:0};}
function changedRoute(run,side,points){const result=Kit.nativeRun(run);result.routes=Object.assign({},result.routes,{[side]:points});result[side]=routeLength(points);result[side==='left'?'start':'end']='post';return result;}
function checked(result){if(!result.gate&&!result.left&&!result.right)throw Error('A wall without a gate needs at least one piece.');if(!Kit.validRun(result))throw Error('That route crosses another wall, turns back over itself, or exceeds the piece limit. Choose a clear direction.');return result;}
function extend(run,side,direction,count){
 if(!['left','right'].includes(side)||!direction||!Number.isInteger(direction.u)||!Number.isInteger(direction.v)||Math.abs(direction.u)+Math.abs(direction.v)!==1)throw Error('Choose a wall side and a native diagonal direction.');
 if(!Number.isInteger(count)||count<1||count>MAX_SIDE)throw Error('Choose 1–256 pieces to add.');
 const native=Kit.nativeRun(run),points=route(native,side),last=points[points.length-1],d=lastDirection(native,side),next={u:last.u+direction.u*count,v:last.v+direction.v*count};
 if(points.length>1&&(!routeLength(points)||d.u===direction.u&&d.v===direction.v))points[points.length-1]=Object.assign({},last,next);else points.push(next);
 return checked(changedRoute(native,side,points));
}
function removeLast(run,side){
 const native=Kit.nativeRun(run),points=route(native,side);if(!routeLength(points))return clone(run);points.pop();return checked(changedRoute(native,side,points));
}
function capEnd(run,side){const key=side==='left'?'start':'end';if(run[key]==='post')return clone(run);const result=Kit.nativeRun(run);result[key]='post';return checked(result);}
function resizeLast(run,side,delta){
 if(!Number.isInteger(delta)||!delta)return clone(run);
 const native=Kit.nativeRun(run),points=route(native,side),d=lastDirection(native,side),last=points[points.length-1],previous=points[points.length-2]||last,current=points.length>1?Math.abs(last.u-previous.u)+Math.abs(last.v-previous.v):0,other=side==='left'?'right':'left';
 let count=Math.max(0,Math.min(current+delta,MAX_SIDE-native[side]+current,MAX_TOTAL-native.left-native.right+current));if(!native.gate&&!native[other]&&native[side]===current&&count===0)count=1;
 if(count===current)return clone(run);if(count===0)points.pop();else if(points.length===1)points.push({u:previous.u+d.u*count,v:previous.v+d.v*count});else points[points.length-1]=Object.assign({},last,{u:previous.u+d.u*count,v:previous.v+d.v*count});
 const result=changedRoute(native,side,points);return Kit.validRun(result)?result:clone(run);
}
function count(run,side,value){
 if(!Number.isInteger(value)||value<0||value>MAX_SIDE)throw Error('Choose 0–256 complete pieces on each side.');if(value===Kit.layout(run)[side+'Count'])return clone(run);if(bent(run,side))throw Error('Use Extend / turn or drag the end to change this bent route.');
 const next=Kit.nativeRun(run);next[side]=value;if(next.routes&&next.routes[side]){const points=route(next,side),end=Object.assign({},points[points.length-1],{u:(side==='left'?-1:1)*value,v:0});next.routes[side]=value?[points[0],end]:[points[0]];}return checked(next);
}
function move(run,layout,handle,along){
 if(!handle||handle.kind!=='end'||!['left','right'].includes(handle.side)||!Number.isFinite(along))return clone(run);
 const steps=Math.sign(along)*Math.floor(Math.abs(along)/Kit.unit+.5);if(!steps)return clone(run);const d=lastDirection(Kit.nativeRun(run),handle.side);return resizeLast(run,handle.side,steps*Math.sign(d.u+d.v));
}
function handles(layout){
 const result=[];
 if(layout.gate)for(const side of ['left','right'])result.push({kind:'join',side,x:layout[side].x,y:layout[side].y,draggable:false,label:side+' gate join · fixed'});
 for(const side of ['left','right']){const points=layout[side+'Points'],a=points&&points[side==='left'?0:points.length-1],b=points&&points[side==='left'?1:points.length-2],axis=a&&b?{x:a.x-b.x,y:a.y-b.y}:{x:side==='left'?-45:45,y:side==='left'?30:-30};result.push({kind:'end',side,x:layout[side+'End'].x,y:layout[side+'End'].y,axis,draggable:true,label:side+' wall end · drag to resize the last stretch'});}
 return result;
}
function directions(matrix){
 const candidates=[{u:1,v:0},{u:0,v:1},{u:-1,v:0},{u:0,v:-1}],names=['NE','NW','SE','SW'],targets=[[1,1],[-1,1],[1,-1],[-1,-1]];let best=null,score=-Infinity;
 function visit(order,available){if(!available.length){let value=0;order.forEach((at,i)=>{const d=candidates[at],x=45*(d.u+d.v),y=30*(-d.u+d.v),px=matrix[0]*x+matrix[2]*y,py=matrix[1]*x+matrix[3]*y;value+=(px*targets[i][0]+py*targets[i][1])/Math.hypot(px,py);});if(value>score){score=value;best=order.slice();}return;}for(const at of available)visit(order.concat(at),available.filter(v=>v!==at));}visit([],candidates.map((_,i)=>i));return Object.fromEntries(names.map((name,i)=>[name,clone(candidates[best[i]])]));
}
function supportsOpening(record){
 const sources=(record&&record.skeletons||[]).flatMap(part=>[part.json,part._wallSourceJson]).filter(Boolean);
 return !sources.some(json=>json.wallDoor&&json.wallDoor.closedOnly===true)&&sources.some(json=>json.wallDoor&&json.wallDoor.version===2||json.animations&&json.animations.open_inward);
}
function mount(host,options){
 const main=options.record.skeletons.find(s=>s.json.wallKit);if(!main)throw Error('Refresh the wall asset before editing its layout.');
 const authored=main.json.wallKit.layout,defaults={nativeVersion:2,left:authored.leftCount,right:authored.rightCount,gate:authored.gate!==false,start:authored.start||'post',end:authored.end||'post',spacing:1};for(const key of ['nativeOrigin','nativeGateSpan','routes'])if(authored[key]!==undefined)defaults[key]=clone(authored[key]);
 let run=clone(options.run||defaults);
 const initialRun=clone(run),initial=JSON.stringify(run),origin=options.record.origin||{x:0,y:0},matrix=main.matrix,compass=directions(matrix);
 let opening=(options.opening||options.record.wallOpening)==='inward'?'inward':'outward';
 let level=1,open=false,closed=false,frame=null,drag=null,record,scale=1,cx=0,cy=0,zoom=1,side='right',direction='NE',amount=1;const inputs={},invalid=new Set();
 const make=(tag,text)=>{const e=document.createElement(tag);if(text)e.textContent=text;return e;},tools=make('div'),canvas=make('canvas'),status=make('p'),caption=make('p');
 tools.className='world-actions';canvas.className='world-wall-layout-canvas';canvas.width=820;canvas.height=430;canvas.style.cssText='width:100%;height:430px;touch-action:none;background:#899c59;border:1px solid #222';status.className=caption.className='world-note';
 host.classList.add('world-wall-layout-dialog');host.style.width='880px';host.style.maxWidth='96%';host.appendChild(tools);host.appendChild(canvas);host.appendChild(caption);host.appendChild(status);
 caption.textContent='Choose an end and a diagonal to extend or turn the wall. Drag blue ends to resize the last stretch. Joins and corner pieces connect automatically. Gold gate joins stay fixed. Wheel to zoom.';
 const renderer=Renderer.create({onLoad:draw,onError:error=>{status.textContent=error.message;}}),g=canvas.getContext('2d'),building={x:0,y:0,scale:1,angle:0};
 const local=p=>({x:matrix[0]*p.x+matrix[2]*p.y+matrix[4]-origin.x,y:matrix[1]*p.x+matrix[3]*p.y+matrix[5]-origin.y});
 function rootPoint(e){const b=canvas.getBoundingClientRect(),x=((e.clientX-b.left)*canvas.width/b.width-canvas.width/2)/(scale*zoom)+cx,y=-((e.clientY-b.top)*canvas.height/b.height-canvas.height/2)/(scale*zoom)+cy,px=x+origin.x-matrix[4],py=y+origin.y-matrix[5],det=matrix[0]*matrix[3]-matrix[1]*matrix[2];return {x:(matrix[3]*px-matrix[2]*py)/det,y:(matrix[0]*py-matrix[1]*px)/det};}
 function fit(){
  const points=[];for(const part of record&&record.skeletons||[]){const b=part.json.skeleton||{},m=part.matrix;if(!m||![b.x,b.y,b.width,b.height].every(Number.isFinite)||b.width<=0||b.height<=0)continue;for(const x of [b.x,b.x+b.width])for(const y of [b.y,b.y+b.height])points.push({x:m[0]*x+m[2]*y+m[4]-origin.x,y:m[1]*x+m[3]*y+m[5]-origin.y});}
  if(!points.length){const r=Kit.layout(run);for(const p of (r.leftPoints||[r.leftEnd,r.left]).concat(r.rightPoints||[r.right,r.rightEnd]))points.push(local({x:p.x-35,y:p.y-20}),local({x:p.x+35,y:p.y+180}));}
  const xs=points.map(p=>p.x),ys=points.map(p=>p.y),left=Math.min(...xs),right=Math.max(...xs),bottom=Math.min(...ys),top=Math.max(...ys);cx=(left+right)/2;cy=(bottom+top)/2;scale=Math.min((canvas.width-60)/Math.max(1,right-left),(canvas.height-70)/Math.max(1,top-bottom));zoom=1;draw();
 }
 function refreshControls(){const layout=Kit.layout(run);for(const side of ['left','right'])if(inputs[side]){if(!invalid.has(inputs[side]))inputs[side].value=String(layout[side+'Count']);inputs[side].disabled=bent(run,side);inputs[side].title=inputs[side].disabled?'Use Extend / turn or drag the end to change a bent route.':'';}if(inputs.open){inputs.open.disabled=!layout.gate;inputs.open.checked=open&&layout.gate;}if(inputs.gate)inputs.gate.checked=layout.gate;}
 function rebuild(refit){
  if(closed)return;record=Object.assign({},options.record,{sprites:[],skeletons:options.record.skeletons.map(part=>Object.assign({},part,{json:part._wallSourceJson||part.json}))});Run.fitRecord(record,{wallRun:JSON.stringify(run),wallOpening:opening},options.face);
  for(const part of record.skeletons){if(!part.json.wallKit&&!part.json.wallGate)continue;part.skin=Kit.skins[level-1];part.animation=open&&run.gate?Facing.animation(part.json,'open',opening):'idle';part.poseTime=open&&run.gate?'end':0;part.revision=String(part.revision||'')+':layout:'+JSON.stringify([run,level,open,opening]);}
  renderer.prepare([record],options.runtime);refreshControls();const r=Kit.layout(run);status.textContent=r.leftCount+r.rightCount+' complete wall pieces · '+(invalid.size?'Correct the section counts before applying':JSON.stringify(run)===initial?'No changes':'Unsaved layout edits');if(refit)fit();else draw();
 }
 function draw(){if(closed||frame!==null)return;frame=requestAnimationFrame(()=>{frame=null;if(closed)return;g.setTransform(1,0,0,1,0,0);g.clearRect(0,0,canvas.width,canvas.height);g.setTransform(scale*zoom,0,0,-scale*zoom,canvas.width/2-cx*scale*zoom,canvas.height/2+cy*scale*zoom);if(record)for(const p of renderer.parts(building,record))renderer.draw(g,p,{},options.runtime);
   const r=Kit.layout(run);g.strokeStyle='#c3e9ff99';g.lineWidth=1/(scale*zoom);g.setLineDash([4/(scale*zoom),4/(scale*zoom)]);g.beginPath();for(const points of [r.leftPoints,r.rightPoints])for(let i=0;i<points.length;i++){const p=local(points[i]);if(i)g.lineTo(p.x,p.y);else g.moveTo(p.x,p.y);}g.stroke();g.setLineDash([]);
   for(const h of handles(r)){const p=local(h),radius=6/(scale*zoom);g.fillStyle=h.draggable?'#60bcff':'#ffd16b';g.strokeStyle='#173245';g.lineWidth=1.5/(scale*zoom);g.beginPath();if(h.draggable)g.arc(p.x,p.y,radius,0,Math.PI*2);else g.rect(p.x-radius,p.y-radius,radius*2,radius*2);g.fill();g.stroke();}
  });}
 function control(label,value,change,choices,transient){const l=make('label'),name=make('span',label),input=make(choices?'select':'input');l.appendChild(name);if(choices)for(const v of choices){const o=make('option',String(v));o.value=String(v);input.appendChild(o);}else input.type=typeof value==='boolean'?'checkbox':'number';if(input.type==='checkbox')input.checked=value;else input.value=String(value);input.onchange=()=>{try{if(input.type==='number'&&(!input.value.trim()||!Number.isFinite(Number(input.value))))throw Error('Enter a piece count.');change(input.type==='checkbox'?input.checked:typeof value==='number'?Number(input.value):input.value);invalid.delete(input);rebuild(true);}catch(error){if(!transient)invalid.add(input);status.textContent=error.message;if(input.type==='checkbox'){input.checked=!input.checked;invalid.delete(input);}}};l.appendChild(input);tools.appendChild(l);return input;}
 function action(label,change){const button=make('button',label);button.onclick=()=>{try{run=change();invalid.clear();rebuild(true);}catch(error){status.textContent=error.message;}};tools.appendChild(button);return button;}
 control('Tier',1,v=>level=v,[1,2,3]);inputs.open=control('Open gate',false,v=>open=v);
 if(supportsOpening(options.record))control('Opening preview',opening==='inward'?'Inward':'Outward',v=>opening=v.toLowerCase(),['Outward','Inward'],true);
 inputs.gate=control('Include gate',run.gate,v=>{if(v===Kit.layout(run).gate)return;const next=Kit.nativeRun(run);next.gate=v;if(!Kit.validRun(next))throw Error('A wall without a gate needs at least one piece, and its routes must not overlap.');run=next;if(!v)open=false;});
 for(const side of ['left','right']){const input=control(side==='left'?'Left sections':'Right sections',Kit.layout(run)[side+'Count'],v=>run=count(run,side,v));input.min='0';input.max=String(MAX_SIDE);input.step='1';inputs[side]=input;}
 control('Wall side','Right',v=>side=v.toLowerCase(),['Left','Right'],true);control('Direction','NE',v=>direction=v,['NE','NW','SE','SW'],true);inputs.amount=control('Add pieces',1,v=>{if(!Number.isInteger(v)||v<1||v>MAX_SIDE)throw Error('Choose 1–256 pieces to add.');amount=v;},null,true);inputs.amount.min='1';inputs.amount.max=String(MAX_SIDE);inputs.amount.step='1';
 action('Extend / turn',()=>{if(!inputs.amount.value.trim()||Number(inputs.amount.value)!==amount)throw Error('Choose 1–256 pieces to add.');return extend(run,side,compass[direction],amount);});action('Remove last stretch',()=>removeLast(run,side));action('Cap end',()=>capEnd(run,side));
 const fitButton=make('button','Fit preview');fitButton.onclick=fit;tools.appendChild(fitButton);action('Reset layout changes',()=>{open=false;return clone(initialRun);});
 function hit(e){const p=rootPoint(e),q=local(p),list=handles(Kit.layout(run));return list.reverse().find(h=>{const a=local(h);return Math.hypot(a.x-q.x,a.y-q.y)*scale*zoom<11;});}
 canvas.onpointerdown=e=>{if(e.button!==0)return;const h=hit(e);if(!h||!h.draggable)return;canvas.setPointerCapture(e.pointerId);drag={handle:h,point:rootPoint(e),run:clone(run),layout:Kit.layout(run)};e.preventDefault();};
 canvas.onpointermove=e=>{if(!drag){const h=hit(e);canvas.style.cursor=h&&h.draggable?'grab':'default';canvas.title=h?h.label:'';return;}const p=rootPoint(e),dx=p.x-drag.point.x,dy=p.y-drag.point.y,k=drag.handle.axis.y/drag.handle.axis.x,next=move(drag.run,drag.layout,drag.handle,(dx+k*dy)/(1+k*k));if(JSON.stringify(next)===JSON.stringify(run))return;run=next;invalid.clear();rebuild(false);};
 canvas.onpointerup=e=>{if(!drag)return;drag=null;if(canvas.hasPointerCapture&&canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);fit();};canvas.onpointercancel=()=>{if(drag){run=drag.run;drag=null;invalid.clear();rebuild(false);}};
 canvas.onwheel=e=>{e.preventDefault();zoom=Math.max(.3,Math.min(5,zoom*Math.exp(-e.deltaY*.001)));draw();};rebuild(true);
 return {value(){if(JSON.stringify(run)===initial&&!invalid.size)return null;if(invalid.size||!Kit.validRun(run))throw Error('Correct the wall layout before applying.');return clone(run);},destroy(){if(closed)return;closed=true;if(frame!==null)cancelAnimationFrame(frame);renderer.destroy();canvas.onpointerdown=canvas.onpointermove=canvas.onpointerup=canvas.onpointercancel=canvas.onwheel=null;canvas.width=canvas.height=1;},stats:renderer.stats};
}
module.exports={mount,handles,move,arrays,resetPositions,extend,removeLast,resizeLast,capEnd,count,bent,directions,supportsOpening};
