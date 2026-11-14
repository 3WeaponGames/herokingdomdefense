"use strict";
// Four corners of the bright aperture in the unchanged 70px native image.
// Coordinates are sprite-local, with Y up. The cage carries the entire fade
// with the aperture. Its non-affine bend eases outside the small bright source
// so moving one corner cannot send the distant glow towards a horizon.
var SIZE=70,CORE=[{x:-29,y:23},{x:-9,y:34},{x:-9,y:22},{x:-29,y:11}],STEPS=16,MAX_NODES=24,compiled=new Map();
function controls(warp){return (warp||CORE).map(function(p){return{x:p.x,y:p.y};});}
function basis(p){var x=p.x-CORE[0].x,y=p.y-CORE[0].y;return{a:x/20,b:(.55*x-y)/12};}
function baseMap(p,warp){
 if(!warp)return{x:p.x,y:p.y};var q=basis(p),a=q.a-.5,b=q.b-.5;
 function ease(t){var n=Math.abs(t);return n<=.5?t:(t<0?-1:1)*(1-.5*Math.exp(-2*(n-.5)));}
 var bend=ease(a)*ease(b),out={};["x","y"].forEach(function(k){var p=warp.map(function(v){return v[k];}),center=(p[0]+p[1]+p[2]+p[3])/4,u=(p[1]+p[2]-p[0]-p[3])/2,v=(p[2]+p[3]-p[0]-p[1])/2,cross=p[0]-p[1]+p[2]-p[3];out[k]=center+a*u+b*v+cross*bend;});return out;
}
function source(edge,t){var a=CORE[edge],b=CORE[(edge+1)%4];return{x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t};}
function kernel(a,b){var r=Math.hypot(a.x-b.x,a.y-b.y)/(SIZE*.4);return r>=1?0:Math.pow(1-r,4)*(4*r+1);}
function compile(warp,nodes){
 if(!nodes||!nodes.length)return null;var key=JSON.stringify([warp||null,nodes]),saved=compiled.get(key);if(saved)return saved;
 var targets=controls(warp).concat(nodes),sources=controls().concat(nodes.map(function(n){return source(n.edge,n.t);})),n=sources.length,rows=sources.map(function(p,i){var base=baseMap(p,warp),row=sources.map(function(q){return kernel(p,q);});row.push(targets[i].x-base.x,targets[i].y-base.y);return row;});
 // Compact radial interpolation pins every existing corner/point exactly and
 // carries a local bend through the neighbouring glow without distant flares.
 for(var col=0;col<n;col++){var pivot=col;for(var r=col+1;r<n;r++)if(Math.abs(rows[r][col])>Math.abs(rows[pivot][col]))pivot=r;if(Math.abs(rows[pivot][col])<1e-10)throw Error('Light points are too close together.');var tmp=rows[col];rows[col]=rows[pivot];rows[pivot]=tmp;var divisor=rows[col][col];for(var k=col;k<n+2;k++)rows[col][k]/=divisor;for(var r=0;r<n;r++){if(r===col)continue;var amount=rows[r][col];for(var k=col;k<n+2;k++)rows[r][k]-=amount*rows[col][k];}}
 saved={sources:sources,x:rows.map(function(row){return row[n];}),y:rows.map(function(row){return row[n+1];})};compiled.set(key,saved);while(compiled.size>32)compiled.delete(compiled.keys().next().value);return saved;
}
function apply(p,warp,data){var v=baseMap(p,warp);if(data)for(var i=0;i<data.sources.length;i++){var weight=kernel(p,data.sources[i]);v.x+=weight*data.x[i];v.y+=weight*data.y[i];}return v;}
function map(p,warp,nodes){return apply(p,warp,compile(warp,nodes));}
function nodesValid(nodes){
 if(nodes===undefined)return true;if(!Array.isArray(nodes)||nodes.length>MAX_NODES)return false;var sources=controls();
 for(var i=0;i<nodes.length;i++){var n=nodes[i];if(!n||!Number.isInteger(n.edge)||n.edge<0||n.edge>3||typeof n.t!=="number"||!isFinite(n.t)||n.t<=0||n.t>=1||![n.x,n.y].every(function(v){return typeof v==="number"&&isFinite(v)&&Math.abs(v)<=SIZE*4;}))return false;var p=source(n.edge,n.t);if(sources.some(function(q){return Math.hypot(q.x-p.x,q.y-p.y)<.75;}))return false;sources.push(p);}return true;
}
function valid(warp,nodes){
 warp=warp||CORE;
 if(!Array.isArray(warp)||warp.length!==4||warp.some(function(p){return!p||typeof p.x!=="number"||typeof p.y!=="number"||!isFinite(p.x+p.y)||Math.abs(p.x)>SIZE*4||Math.abs(p.y)>SIZE*4;}))return false;
 if(!nodesValid(nodes))return false;var data;try{data=mesh(warp,nodes);}catch(_){return false;}if(data.points.some(function(p){return!isFinite(p.x+p.y)||Math.abs(p.x)>SIZE*8||Math.abs(p.y)>SIZE*8;}))return false;
 for(var i=0;i<data.triangles.length;i+=3){var a=data.points[data.triangles[i]],b=data.points[data.triangles[i+1]],c=data.points[data.triangles[i+2]],aa=data.sourcePoints[data.triangles[i]],bb=data.sourcePoints[data.triangles[i+1]],cc=data.sourcePoints[data.triangles[i+2]],minimum=((bb.x-aa.x)*(cc.y-aa.y)-(bb.y-aa.y)*(cc.x-aa.x))*.025;if((b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x)<minimum)return false;}
 return true;
}
function mesh(warp,nodes){
 var sourcePoints=[],uvs=[],triangles=[],minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
 for(var y=0;y<=STEPS;y++)for(var x=0;x<=STEPS;x++){var u=x/STEPS,v=y/STEPS;sourcePoints.push({x:(u-.5)*SIZE,y:(.5-v)*SIZE});uvs.push({u:u,v:v});if(x<STEPS&&y<STEPS){var i=y*(STEPS+1)+x;triangles.push(i,i+STEPS+1,i+1,i+1,i+STEPS+1,i+STEPS+2);}}
 // Include each cage point as a real mesh vertex, so fine arches do not drift
 // between a coarse grid's vertices. Splitting both adjacent triangles avoids
 // cracks when a new point lies exactly on their shared edge.
 if(nodes&&nodes.length)controls().concat(nodes.map(function(n){return source(n.edge,n.t);})).forEach(function(p){
  if(sourcePoints.some(function(q){return Math.hypot(q.x-p.x,q.y-p.y)<1e-6;}))return;var index=sourcePoints.length,next=[];
  function area(a,b,c){return(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);}
  for(var i=0;i<triangles.length;i+=3){var a=triangles[i],b=triangles[i+1],c=triangles[i+2],aa=sourcePoints[a],bb=sourcePoints[b],cc=sourcePoints[c];if(area(aa,bb,p)>=-1e-8&&area(bb,cc,p)>=-1e-8&&area(cc,aa,p)>=-1e-8){[[a,b],[b,c],[c,a]].forEach(function(edge){if(area(sourcePoints[edge[0]],sourcePoints[edge[1]],p)>1e-8)next.push(edge[0],edge[1],index);});}else next.push(a,b,c);}sourcePoints.push(p);uvs.push({u:p.x/SIZE+.5,v:.5-p.y/SIZE});triangles=next;
 });
 var data=compile(warp,nodes),points=sourcePoints.map(function(p){var v=apply(p,warp,data);minX=Math.min(minX,v.x);minY=Math.min(minY,v.y);maxX=Math.max(maxX,v.x);maxY=Math.max(maxY,v.y);return v;});
 return{points:points,sourcePoints:sourcePoints,uvs:uvs,triangles:triangles,bounds:{minX:minX,minY:minY,maxX:maxX,maxY:maxY}};
}
function vertices(warp,uv,width,height,nodes){
 var data=mesh(warp,nodes),result={x:[],y:[],u:[],v:[],nu:[],nv:[],triangles:data.triangles};
 data.points.forEach(function(p,i){var t=data.uvs[i],u=uv[4]+t.u*(uv[6]-uv[4])+t.v*(uv[0]-uv[4]),v=uv[5]+t.u*(uv[7]-uv[5])+t.v*(uv[1]-uv[5]);result.x.push(p.x+SIZE/2);result.y.push(SIZE/2-p.y);result.u.push(u*width);result.v.push(v*height);result.nu.push(u);result.nv.push(v);});return result;
}
function addNode(warp,nodes,edge,t){
 var list=(nodes||[]).map(function(n){return Object.assign({},n);});if(list.length>=MAX_NODES)throw Error('A light can have up to 24 added edge points.');if(!Number.isInteger(edge)||edge<0||edge>3||!isFinite(t)||t<=0||t>=1)throw Error('Choose a yellow edge.');var p=source(edge,t),target=map(p,warp,nodes);list.push({edge:edge,t:t,x:target.x,y:target.y});if(!nodesValid(list))throw Error('Choose a position farther from an existing point.');return list;
}
function boundary(warp,nodes){var result=[],data=compile(warp,nodes);for(var edge=0;edge<4;edge++){var times=[0,1];(nodes||[]).forEach(function(n){if(n.edge===edge)times.push(n.t);});times.sort(function(a,b){return a-b;});for(var k=0;k<times.length-1;k++)for(var step=0;step<=8;step++){var t=times[k]+(times[k+1]-times[k])*step/8,p=apply(source(edge,t),warp,data);result.push({x:p.x,y:p.y,edge:edge,t:t});}}return result;}
function inverse(p,warp,nodes){
 if(!warp&&(!nodes||!nodes.length))return Math.abs(p.x)<=35&&Math.abs(p.y)<=35?{x:p.x,y:p.y}:null;
 var data=mesh(warp,nodes);for(var i=0;i<data.triangles.length;i+=3){var ids=data.triangles.slice(i,i+3),a=data.points[ids[0]],b=data.points[ids[1]],c=data.points[ids[2]],det=(b.y-c.y)*(a.x-c.x)+(c.x-b.x)*(a.y-c.y);if(Math.abs(det)<1e-10)continue;var u=((b.y-c.y)*(p.x-c.x)+(c.x-b.x)*(p.y-c.y))/det,v=((c.y-a.y)*(p.x-c.x)+(a.x-c.x)*(p.y-c.y))/det,w=1-u-v;if(u>=-1e-7&&v>=-1e-7&&w>=-1e-7){var s=ids.map(function(id){return data.sourcePoints[id];});return{x:s[0].x*u+s[1].x*v+s[2].x*w,y:s[0].y*u+s[1].y*v+s[2].y*w};}}
 return null;
}
exports.size=SIZE;exports.controls=controls;exports.map=map;exports.valid=valid;exports.mesh=mesh;exports.vertices=vertices;exports.source=source;exports.addNode=addNode;exports.boundary=boundary;exports.maxNodes=MAX_NODES;exports.inverse=inverse;
