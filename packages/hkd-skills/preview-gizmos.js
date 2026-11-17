'use strict';
// Geometry and pointer math only. The preview owns drawing, selection, drafts,
// transactions and playback; none of those objects are changed by this module.
const EPS=1e-8,DEG=180/Math.PI;
const finite=(value,fallback=0)=>typeof value==='number'&&Number.isFinite(value)?value:fallback;
const point=value=>({x:finite(value&&value.x),y:finite(value&&value.y)});
const add=(a,b)=>({x:a.x+b.x,y:a.y+b.y}),sub=(a,b)=>({x:a.x-b.x,y:a.y-b.y}),mul=(a,k)=>({x:a.x*k,y:a.y*k});
const length=value=>Math.hypot(value.x,value.y);
function unit(value,fallback={x:1,y:0}){value=point(value);const size=length(value);if(size>EPS)return mul(value,1/size);fallback=point(fallback);const other=length(fallback);return other>EPS?mul(fallback,1/other):{x:1,y:0};}
const dot=(a,b)=>a.x*b.x+a.y*b.y;
const midpoint=(a,b)=>mul(add(a,b),.5);
function read(values,path,fallback=0){if(!path)return fallback;if(values&&Object.prototype.hasOwnProperty.call(values,path))return finite(values[path],fallback);let value=values;for(const part of String(path).split('.'))value=value&&value[part];return finite(value,fallback);}
function pathsFor(value){return Array.isArray(value)?value.filter(path=>typeof path==='string'&&path):typeof value==='string'&&value?[value]:[];}
function axes(spec){const angle=finite(spec.angle)*Math.PI/180,outline=spec.outline||[],fallbackX={x:Math.cos(angle),y:Math.sin(angle)},fallbackY={x:-Math.sin(angle),y:Math.cos(angle)};return{x:unit(spec.axes&&spec.axes.x||outline.length>=4&&sub(outline[1],outline[0])||fallbackX,fallbackX),y:unit(spec.axes&&spec.axes.y||outline.length>=4&&sub(outline[3],outline[0])||fallbackY,fallbackY)};}
function outlineFor(spec){if(spec.outline&&spec.outline.length>=3)return spec.outline.map(point);const origin=point(spec.origin),a=axes(spec),w=Math.max(EPS,Math.abs(finite(spec.width,64)))/2,h=Math.max(EPS,Math.abs(finite(spec.height,64)))/2;return[[-1,-1],[1,-1],[1,1],[-1,1]].map(([x,y])=>add(origin,add(mul(a.x,x*w),mul(a.y,y*h))));}
function projectPoint(project,p){const value=project(p);return point(value);}
function offsetPixels(project,at,direction,pixels){const a=projectPoint(project,at),b=projectPoint(project,add(at,unit(direction))),ppu=length(sub(b,a));return ppu>EPS?add(at,mul(unit(direction),pixels/ppu)):point(at);}
function reachableHandle(project,at,origin,fallback,pixels){const distance=length(sub(projectPoint(project,at),projectPoint(project,origin)));return distance>=pixels?at:offsetPixels(project,origin,unit(sub(at,origin),fallback),pixels);}
function node(id,kind,at,project,extra){return Object.assign({id,kind,world:point(at)},projectPoint(project,at),extra);}
function annotate(result){const paths=result.spec.paths||{};for(const handle of result.handles){const kind=handle.kind;handle.paths=kind==='move'?[paths.x,paths.y].filter(Boolean):kind==='move-x'?pathsFor(paths.x):kind==='move-y'?pathsFor(paths.y):kind==='scale'?pathsFor(paths.scale):kind==='scale-x'?pathsFor(paths.scaleX):kind==='scale-y'?pathsFor(paths.scaleY):kind==='rotate'?pathsFor(paths.rotation):kind==='arc'?pathsFor(paths.arc):kind==='width'?pathsFor(paths.width):pathsFor(paths.radius||paths.range);if(handle.paths.length===1)handle.path=handle.paths[0];}return result;}
function model(spec,project,outline){const origin=point(spec.origin);return{id:spec.id,label:spec.label||spec.id,kind:spec.type==='behavior'?'behavior':'vfx',spec,origin,screenOrigin:projectPoint(project,origin),worldOutline:outline.map(point),outline:outline.map(p=>projectPoint(project,p)),handles:[],hitInterior:spec.hitInterior!==false};}
function build(spec,project){
  spec=spec||{};project=typeof project==='function'?project:p=>p;const outline=outlineFor(spec),result=model(spec,project,outline),origin=point(spec.origin),paths=spec.paths||{},a=axes(spec),corners=outline.length===4?outline:outlineFor(Object.assign({},spec,{outline:null}));
  if(paths.x||paths.y)result.handles.push(node('move','move',origin,project,{label:'Move',shape:'circle'}));
  if(spec.axisMove&&paths.x)result.handles.push(node('move-x','move-x',offsetPixels(project,origin,{x:1,y:0},36),project,{label:'Move X',shape:'arrow'}));
  if(spec.axisMove&&paths.y)result.handles.push(node('move-y','move-y',offsetPixels(project,origin,{x:0,y:1},36),project,{label:'Move Y',shape:'arrow'}));
  const minimum=Math.max(0,finite(spec.minHandleDistance,22));
  if(pathsFor(paths.scale).length)for(let i=0;i<4;i++){const signs=[[-1,-1],[1,-1],[1,1],[-1,1]][i],fallback=add(mul(a.x,signs[0]),mul(a.y,signs[1])),at=reachableHandle(project,corners[i],origin,fallback,minimum);result.handles.push(node('scale-'+i,'scale',at,project,{label:'Uniform scale',shape:'square',corner:i,anchor:projectPoint(project,corners[i])}));}
  if(paths.scaleX){const original=midpoint(corners[1],corners[2]);result.handles.push(node('scale-x','scale-x',reachableHandle(project,original,origin,a.x,minimum),project,{label:'Width',shape:'square',axis:a.x,anchor:projectPoint(project,original)}));}
  if(paths.scaleY){const original=midpoint(corners[2],corners[3]);result.handles.push(node('scale-y','scale-y',reachableHandle(project,original,origin,a.y,minimum),project,{label:'Height',shape:'square',axis:a.y,anchor:projectPoint(project,original)}));}
  if(paths.rotation){const top=midpoint(corners[2],corners[3]),center=mul(corners.reduce(add,{x:0,y:0}),.25),direction=unit(sub(top,center),a.y),at=offsetPixels(project,top,direction,finite(spec.rotationPadding,30));result.handles.push(node('rotate','rotate',at,project,{label:'Rotate',shape:'circle',stem:projectPoint(project,top)}));}
  return annotate(result);
}
function direction(spec){const angle=finite(spec.angle)*Math.PI/180;return unit(spec.direction||{x:Math.cos(angle),y:Math.sin(angle)});}
function buildBehavior(spec,project){
  spec=Object.assign({},spec,{type:'behavior'});project=typeof project==='function'?project:p=>p;const origin=point(spec.origin),u=direction(spec),v={x:-u.y,y:u.x},angle=Math.atan2(u.y,u.x),radius=Math.max(0,finite(spec.radius,finite(spec.range,100))),width=Math.max(0,finite(spec.width,20)),half=Math.min(Math.PI,Math.max(0,finite(spec.halfAngle,finite(spec.arcDegrees,120)/2/DEG))),paths=spec.paths||{};
  const polar=(a,r=radius)=>add(origin,{x:Math.cos(a)*r,y:Math.sin(a)*r});let outline;
  if(spec.kind==='corridor'){const end=add(origin,mul(u,radius));outline=[add(origin,mul(v,width)),add(end,mul(v,width)),add(end,mul(v,-width)),add(origin,mul(v,-width))];}
  else if(spec.kind==='arc'){const back=Math.max(0,Math.min(radius,finite(spec.startWidth)/2));outline=back&&half<Math.PI/2?[add(origin,mul(v,back))]:[origin];for(let i=0;i<=48;i++)outline.push(polar(angle+half-2*half*i/48));if(back&&half<Math.PI/2)outline.push(add(origin,mul(v,-back)));}
  else {outline=[];for(let i=0;i<64;i++)outline.push(polar(i*Math.PI*2/64));}
  const result=model(spec,project,outline);result.hitInterior=spec.hitInterior===true;result.closed=true;
  const rangeAt=offsetPixels(project,origin,u,Math.max(Math.max(0,finite(spec.minHandleDistance,22)),length(sub(projectPoint(project,polar(angle)),projectPoint(project,origin)))));
  if(paths.radius||paths.range)result.handles.push(node(spec.kind==='circle'?'radius':'range','radius',rangeAt,project,{label:spec.radiusLabel||(spec.kind==='circle'?'Radius':'Range'),shape:'diamond',anchor:projectPoint(project,polar(angle))}));
  if(spec.kind==='arc'&&paths.arc){result.handles.push(node('arc-start','arc',polar(angle-half),project,{label:'Arc angle',shape:'diamond',side:-1}),node('arc-end','arc',polar(angle+half),project,{label:'Arc angle',shape:'diamond',side:1}));}
  if(spec.kind==='arc'&&paths.width)result.handles.push(node('width','width',reachableHandle(project,add(origin,mul(v,Math.max(0,finite(spec.startWidth))/2)),origin,v,Math.max(0,finite(spec.minHandleDistance,22))),project,{label:'Start width',shape:'diamond',axis:v}));
  if(spec.kind==='corridor'&&paths.width)result.handles.push(node('width','width',add(add(origin,mul(u,radius*.5)),mul(v,width)),project,{label:spec.widthLabel||'Projectile radius',shape:'diamond',axis:v}));
  if(paths.rotation)result.handles.push(node('rotate','rotate',offsetPixels(project,rangeAt,u,finite(spec.rotationPadding,30)),project,{label:'Direction',shape:'circle',stem:projectPoint(project,rangeAt)}));
  return annotate(result);
}
function distanceToSegment(p,a,b){const ab=sub(b,a),d=dot(ab,ab),t=d>EPS?Math.max(0,Math.min(1,dot(sub(p,a),ab)/d)):0;return length(sub(p,add(a,mul(ab,t))));}
function inside(p,polygon){let result=false;for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){const a=polygon[i],b=polygon[j];if((a.y>p.y)!==(b.y>p.y)&&p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x)result=!result;}return result;}
function hitTest(groups,p,options){
  options=options||{};p=point(p);const tolerance=Math.max(1,finite(options.tolerance,12)),hits=[];
  (groups||[]).forEach((group,index)=>{for(const handle of group.handles||[]){const distance=length(sub(p,handle));if(handle.disabled||distance>tolerance)continue;hits.push({type:'handle',group,handle,distance,index,selected:group.id===options.selectedId});}});
  hits.sort((a,b)=>a.distance-b.distance||(b.selected?1:0)-(a.selected?1:0)||b.index-a.index);if(hits.length)return hits[0];
  const regions=[];(groups||[]).forEach((group,index)=>{if(group.spec&&group.spec.selectable===false||!group.outline||!group.outline.length)return;let edge=Infinity;for(let i=0;i<group.outline.length;i++)edge=Math.min(edge,distanceToSegment(p,group.outline[i],group.outline[(i+1)%group.outline.length]));if(edge<=tolerance||group.hitInterior&&inside(p,group.outline))regions.push({type:'effect',group,index,edge,priority:finite(group.spec&&group.spec.hitPriority,group.kind==='behavior'?0:1)});});
  regions.sort((a,b)=>b.priority-a.priority||b.index-a.index);return regions[0]||null;
}
function snapshotSpec(spec){const result=Object.assign({},spec,{origin:point(spec.origin),paths:Object.assign({},spec.paths),values:{},limits:{}});if(spec.outline)result.outline=spec.outline.map(point);if(spec.axes)result.axes={x:point(spec.axes.x),y:point(spec.axes.y)};for(const value of Object.values(result.paths))for(const path of pathsFor(value)){result.values[path]=read(spec.values,path,/scale/i.test(path)?1:0);result.limits[path]=Object.assign({},spec.limits&&spec.limits[path]);}return result;}
function begin(spec,handleId,pointer){
  spec=snapshotSpec(spec||{});pointer=point(pointer);const origin=spec.origin,a=axes(spec),vector=sub(pointer,origin),distance=length(vector),u=direction(spec),kind=handleId==='rotate'?'rotate':/^arc-/.test(handleId)?'arc':handleId==='range'||handleId==='radius'?'radius':handleId==='width'?'width':/^scale-[0-3]$/.test(handleId)?'scale':handleId;
  const span=spec.outline&&spec.outline.length>=4?{x:length(sub(spec.outline[1],spec.outline[0]))/2,y:length(sub(spec.outline[3],spec.outline[0]))/2}:{x:Math.max(1,Math.abs(finite(spec.width,64))/2),y:Math.max(1,Math.abs(finite(spec.height,64))/2)};
  const denominator=(axis,fallback)=>{const value=dot(vector,axis);return Math.abs(value)>EPS?value:Math.max(1,fallback);};
  return{spec,handleId,kind,pointer,origin,axisX:a.x,axisY:a.y,widthAxis:{x:-u.y,y:u.x},radialAxis:unit(vector,a.x),radialDenominator:Math.max(distance,1),xDenominator:denominator(a.x,span.x),yDenominator:denominator(a.y,span.y),lastAngle:Math.atan2(vector.y,vector.x),angleDelta:0,raw:Object.assign({},spec.values),applied:Object.assign({},spec.values),patches:{}};
}
function decimals(step){const value=String(step||.01);if(/e-/.test(value))return Number(value.split('e-')[1]);return(value.split('.')[1]||'').length;}
function constrain(value,path,drag,modifiers){
  // A click, redundant pointer event or round trip must not quantize an
  // authored/default value merely because it has more precision than the UI.
  const original=read(drag.spec.values,path);if(Math.abs(value-original)<=Number.EPSILON*32*Math.max(1,Math.abs(value),Math.abs(original)))return{raw:original,value:original};
  const limits=drag.spec.limits[path]||{},kind=drag.kind,isScale=/^scale/.test(kind),min=finite(limits.min,isScale?.01:kind==='rotate'?-360:kind==='arc'?1:kind==='radius'||kind==='width'?0:-4096),max=finite(limits.max,isScale?10:kind==='rotate'?360:kind==='arc'?360:4096);value=Math.max(min,Math.min(max,finite(value,read(drag.raw,path))));
  let rounded=value;const snap=finite(modifiers.snap,modifiers.snap===true?(kind==='rotate'||kind==='arc'?15:1):0);if(snap>0)rounded=Math.round(rounded/snap)*snap;
  if(limits.integer)rounded=Math.round(rounded);else rounded=Number(rounded.toFixed(Math.min(6,Math.max(2,decimals(limits.step)+(modifiers.fine?1:0)))));
  return{raw:value,value:Math.max(min,Math.min(max,rounded))};
}
function update(drag,pointer,modifiers){
  modifiers=modifiers||{};pointer=point(pointer);const next=Object.assign({},drag,{pointer,raw:Object.assign({},drag.raw),applied:Object.assign({},drag.applied),patches:{}}),delta=sub(pointer,drag.pointer),paths=drag.spec.paths||{},factor=modifiers.fine?.1:modifiers.coarse?10:1;
  function change(path,amount){if(!path)return;const result=constrain(read(drag.raw,path)+amount,path,drag,modifiers);next.raw[path]=result.raw;if(!Object.is(result.value,drag.applied[path]))next.patches[path]=result.value;next.applied[path]=result.value;}
  if(drag.kind==='move'||drag.kind==='move-x'||drag.kind==='move-y'){if(drag.kind!=='move-y')change(paths.x,delta.x*factor);if(drag.kind!=='move-x')change(paths.y,delta.y*factor);}
  else if(drag.kind==='scale')for(const path of pathsFor(paths.scale))change(path,read(drag.spec.values,path,1)*dot(delta,drag.radialAxis)/drag.radialDenominator*factor);
  else if(drag.kind==='scale-x')change(paths.scaleX,read(drag.spec.values,paths.scaleX,1)*dot(delta,drag.axisX)/drag.xDenominator*factor);
  else if(drag.kind==='scale-y')change(paths.scaleY,read(drag.spec.values,paths.scaleY,1)*dot(delta,drag.axisY)/drag.yDenominator*factor);
  else if(drag.kind==='radius'){const gain=finite(drag.spec.radiusGain,1);if(Math.abs(gain)>EPS)change(paths.radius||paths.range,(length(sub(pointer,drag.origin))-length(sub(drag.pointer,drag.origin)))/gain*factor);}
  else if(drag.kind==='width'){const gain=finite(drag.spec.widthGain,1);if(Math.abs(gain)>EPS)change(paths.width,dot(delta,drag.widthAxis)/gain*factor);}
  else if(drag.kind==='rotate'||drag.kind==='arc'){
    const vector=sub(pointer,drag.origin);if(length(vector)>EPS){const angle=Math.atan2(vector.y,vector.x);let amount=angle-drag.lastAngle;while(amount>Math.PI)amount-=Math.PI*2;while(amount< -Math.PI)amount+=Math.PI*2;next.lastAngle=angle;next.angleDelta=drag.angleDelta+amount*DEG*factor;if(drag.kind==='rotate')change(paths.rotation,amount*DEG*factor*finite(drag.spec.rotationFactor,1));else change(paths.arc,amount*DEG*factor*(drag.handleId==='arc-start'?-2:2));}
  }
  return next;
}
module.exports={build,buildBehavior,hitTest,begin,update,inside,distanceToSegment};
