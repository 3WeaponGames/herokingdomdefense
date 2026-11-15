'use strict';
const Maps=require('../lib/map-assets');
const Warp=require('../../../assets/_script/WindowLightWarp'),T=require('../../../assets/_script/BuildingNightlight');
const directions=[[-1,1],[0,1],[1,1],[1,0],[1,-1],[0,-1],[-1,-1],[-1,0]];
const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
// Resize in the light's own rotated axes. Native sprite shear belongs to the
// source shape, so changing Width or Height still agrees with the saved values.
function frame(entry,value){
 const W=Warp.forType(entry.glow?.lightType);
 const pivot=entry.glow?{x:entry.glow.x,y:entry.glow.y}:entry.center,points=[];
 if(entry.glow){const g=entry.glow,x=Math.tan(g.shearX*Math.PI/180),y=Math.tan(g.shearY*Math.PI/180);for(const u of [-g.width/2,g.width/2])for(const v of [-g.height/2,g.height/2])points.push({x:u+x*v,y:v+y*u});}
 else for(let i=0;i<entry.vertices.length;i+=2)points.push({x:entry.vertices[i]-pivot.x,y:entry.vertices[i+1]-pivot.y});
 if(value.warp||value.warpNodes?.length){points.length=0;points.push(...W.mesh(value.warp,value.warpNodes).points);}
 const xs=points.map(p=>p.x),ys=points.map(p=>p.y),bounds={minX:Math.min(...xs),maxX:Math.max(...xs),minY:Math.min(...ys),maxY:Math.max(...ys)},angle=((entry.glow?.angle||0)+value.angle)*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle),sx=value.scaleX*(value.flipX?-1:1),sy=value.scaleY*(value.flipY?-1:1),local=[c*sx,s*sx,-s*sy,c*sy,pivot.x+value.x,pivot.y+value.y],matrix=Maps.multiply(entry.matrix,local);
 const at=(x,y)=>({x:x<0?bounds.minX:x>0?bounds.maxX:(bounds.minX+bounds.maxX)/2,y:y<0?bounds.minY:y>0?bounds.maxY:(bounds.minY+bounds.maxY)/2});
 const handles=bounds.maxX-bounds.minX>1e-8&&bounds.maxY-bounds.minY>1e-8?directions.map(([x,y],index)=>Object.assign({index,axisX:x,axisY:y,local:at(x,y),anchor:at(-x,-y)},Maps.point(matrix,at(x,y)))):[];
 const warpHandles=T.types.some(t=>t.sprite===entry.glow?.sprite)?W.controls(value.warp).map((p,index)=>({...Maps.point(matrix,p),index,kind:'warp'})).concat((value.warpNodes||[]).map((p,index)=>({...Maps.point(matrix,p),index,kind:'warp-node'}))):[],warpOutline=warpHandles.length?W.boundary(value.warp,value.warpNodes).map(p=>({...p,...Maps.point(matrix,p)})):[];
 return {pivot,bounds,local,matrix,c,s,handles,warpHandles,warpOutline,corners:handles.filter(h=>h.axisX&&h.axisY).map(h=>({x:h.x,y:h.y})),center:Maps.point(matrix,{x:0,y:0})};
}
function resize(entry,value,handle,target){
 const f=frame(entry,value),h=f.handles[handle.index];if(!h||![target.x,target.y].every(Number.isFinite))return null;
 const fixed=Maps.point(f.local,h.anchor),p=Maps.point(Maps.inverse(entry.matrix),target),dx=p.x-fixed.x,dy=p.y-fixed.y,x=f.c*dx+f.s*dy,y=-f.s*dx+f.c*dy;
 const scaleX=h.axisX?clamp(x/((h.local.x-h.anchor.x)*(value.flipX?-1:1)),.02,20):value.scaleX,scaleY=h.axisY?clamp(y/((h.local.y-h.anchor.y)*(value.flipY?-1:1)),.02,20):value.scaleY;
 const ax=h.anchor.x*scaleX*(value.flipX?-1:1),ay=h.anchor.y*scaleY*(value.flipY?-1:1);
 return {scaleX,scaleY,x:clamp(fixed.x-f.c*ax+f.s*ay-f.pivot.x,-10000,10000),y:clamp(fixed.y-f.s*ax-f.c*ay-f.pivot.y,-10000,10000)};
}
function cursor(handle,center){const angle=Math.atan2(center.y-handle.y,handle.x-center.x),direction=((Math.round(angle/(Math.PI/4))%4)+4)%4;return ['ew-resize','nwse-resize','ns-resize','nesw-resize'][direction];}
function distort(entry,value,handle,target){
 const W=Warp.forType(entry.glow?.lightType),key=handle.kind==='warp-node'?'warpNodes':'warp',read=()=>key==='warpNodes'?(value.warpNodes||[]).map(n=>({...n})):W.controls(value.warp),p=Maps.point(Maps.inverse(frame(entry,value).matrix),target),before=read(),next=read();if(!before[handle.index]||!Number.isFinite(p.x+p.y))return null;
 const valid=list=>W.valid(key==='warp'?list:value.warp,key==='warpNodes'?list:value.warpNodes);next[handle.index]={...next[handle.index],...p};if(valid(next))return{[key]:next};
 // Stop at the last valid shape rather than allowing a fold or a huge flare.
 let lo=0,hi=1,best=before;for(let i=0;i<18;i++){const t=(lo+hi)/2,test=read();test[handle.index]={...test[handle.index],x:before[handle.index].x+(p.x-before[handle.index].x)*t,y:before[handle.index].y+(p.y-before[handle.index].y)*t};if(valid(test)){lo=t;best=test;}else hi=t;}return{[key]:best};
}
function edgeHit(points,target,scale){let best=null;for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i];if(a.edge!==b.edge)continue;const dx=b.x-a.x,dy=b.y-a.y,length=dx*dx+dy*dy,q=length?clamp(((target.x-a.x)*dx+(target.y-a.y)*dy)/length,0,1):0,x=a.x+dx*q,y=a.y+dy*q,distance=Math.hypot(target.x-x,target.y-y)*scale;if(distance<=7&&(!best||distance<best.distance))best={edge:a.edge,t:a.t+(b.t-a.t)*q,x,y,distance};}return best;}
function rotationHandles(f,scale){return f.handles.filter(h=>h.axisX&&h.axisY).map(h=>{const dx=h.x-f.center.x,dy=h.y-f.center.y,length=Math.max(.000001,Math.hypot(dx,dy)),pad=22/scale;return{x:h.x+dx/length*pad,y:h.y+dy/length*pad,index:h.index,kind:'rotate'};});}
function rotate(entry,value,start,target,snap){const inverse=Maps.inverse(entry.matrix),a=Maps.point(inverse,start),b=Maps.point(inverse,target),pivot=entry.glow||entry.center,x=pivot.x+value.x,y=pivot.y+value.y;let angle=value.angle+(Math.atan2(b.y-y,b.x-x)-Math.atan2(a.y-y,a.x-x))*180/Math.PI;if(snap)angle=Math.round(angle/15)*15;return{angle:((angle+180)%360+360)%360-180};}
const rotationCursor='url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'24\' height=\'24\' viewBox=\'0 0 24 24\'%3E%3Cpath d=\'M18 8a7 7 0 1 0 1 8M18 3v6h-6\' fill=\'none\' stroke=\'white\' stroke-width=\'4\'/%3E%3Cpath d=\'M18 8a7 7 0 1 0 1 8M18 3v6h-6\' fill=\'none\' stroke=\'%231b3441\' stroke-width=\'2\'/%3E%3C/svg%3E") 12 12, crosshair';
module.exports={frame,resize,cursor,distort,edgeHit,rotationHandles,rotate,rotationCursor};
