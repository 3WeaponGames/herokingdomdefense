"use strict";

// Engine-independent navigation for circular units and immutable polygon geometry.
// Cells have numeric identities; every traversed/smoothed edge is checked against
// the original polygons, not just occupancy samples.
var EPS = 1e-7;
var MAX_CELLS = 65536;
var DIRECTIONS = [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1]];
var OPPOSITE = [1,0,3,2,7,6,5,4];
function finite(value) { return typeof value === "number" && isFinite(value); }
function readPoint(value) {
  if (!value || !finite(value.x) || !finite(value.y)) throw new TypeError("Navigation points must have finite x/y coordinates.");
  return value;
}
function point(value) {
  value=readPoint(value);
  return { x:value.x, y:value.y };
}
function radiusValue(radius) {
  if (radius === undefined) return 0;
  if (!finite(radius) || radius < 0) throw new RangeError("Navigation radius must be finite and non-negative.");
  return radius;
}
function distance2(a,b) { var x=a.x-b.x,y=a.y-b.y; return x*x+y*y; }
function distance(a,b) { return Math.sqrt(distance2(a,b)); }
function cross(a,b,c) { return (b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x); }
function pointSegmentDistance2(p,a,b) {
  var x=b.x-a.x,y=b.y-a.y,length=x*x+y*y;
  var t=length ? Math.max(0,Math.min(1,((p.x-a.x)*x+(p.y-a.y)*y)/length)) : 0;
  var dx=p.x-a.x-t*x,dy=p.y-a.y-t*y;
  return dx*dx+dy*dy;
}
function onSegment(p,a,b) {
  return Math.abs(cross(a,b,p))<=EPS && p.x>=Math.min(a.x,b.x)-EPS && p.x<=Math.max(a.x,b.x)+EPS && p.y>=Math.min(a.y,b.y)-EPS && p.y<=Math.max(a.y,b.y)+EPS;
}
function intersects(a,b,c,d) {
  var abC=cross(a,b,c),abD=cross(a,b,d),cdA=cross(c,d,a),cdB=cross(c,d,b);
  if (((abC>EPS&&abD<-EPS)||(abC<-EPS&&abD>EPS)) && ((cdA>EPS&&cdB<-EPS)||(cdA<-EPS&&cdB>EPS))) return true;
  return (Math.abs(abC)<=EPS&&onSegment(c,a,b)) || (Math.abs(abD)<=EPS&&onSegment(d,a,b)) || (Math.abs(cdA)<=EPS&&onSegment(a,c,d)) || (Math.abs(cdB)<=EPS&&onSegment(b,c,d));
}
function segmentDistance2(a,b,c,d) {
  if (intersects(a,b,c,d)) return 0;
  return Math.min(pointSegmentDistance2(a,c,d),pointSegmentDistance2(b,c,d),pointSegmentDistance2(c,a,b),pointSegmentDistance2(d,a,b));
}
function inside(p,vertices) {
  var result=false;
  for(var i=0,j=vertices.length-1;i<vertices.length;j=i++) {
    var a=vertices[j],b=vertices[i];
    if(onSegment(p,a,b)) return true;
    if((a.y>p.y)!==(b.y>p.y) && p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x) result=!result;
  }
  return result;
}
function clearance(p,vertices) {
  var minimum=Infinity;
  for(var i=0;i<vertices.length;i++) minimum=Math.min(minimum,pointSegmentDistance2(p,vertices[i],vertices[(i+1)%vertices.length]));
  return (inside(p,vertices)?-1:1)*Math.sqrt(minimum);
}
function byScore(a,b) { return a.f<b.f; }
function byDistance(a,b) { return a.f<b.f||a.f===b.f&&a.id<b.id; }
function Heap(before) { this.items=[];this.before=before||byScore; }
Heap.prototype.push=function(item) {
  var items=this.items,index=items.length;items.push(item);
  while(index>0) { var parent=(index-1)>>1;if(!this.before(item,items[parent]))break;items[index]=items[parent];index=parent; }
  items[index]=item;
};
Heap.prototype.pop=function() {
  var items=this.items,first=items[0],last=items.pop();if(!items.length)return first;
  var index=0;
  while(true) { var left=index*2+1,right=left+1;if(left>=items.length)break;var child=right<items.length&&this.before(items[right],items[left])?right:left;if(!this.before(items[child],last))break;items[index]=items[child];index=child; }
  items[index]=last;return first;
};

function NavigationGrid(polygons,bounds,cellSize,passages) {
  if(!bounds||![bounds.minX,bounds.minY,bounds.maxX,bounds.maxY].every(finite)||bounds.minX>=bounds.maxX||bounds.minY>=bounds.maxY) throw new RangeError("Navigation bounds must be a finite nonempty rectangle.");
  this.bounds={minX:bounds.minX,minY:bounds.minY,maxX:bounds.maxX,maxY:bounds.maxY};
  this.cellSize=cellSize===undefined?20:cellSize;
  if(!finite(this.cellSize)||this.cellSize<=0)throw new RangeError("Navigation cell size must be positive.");
  this.columns=Math.max(1,Math.ceil((bounds.maxX-bounds.minX)/this.cellSize));
  this.rows=Math.max(1,Math.ceil((bounds.maxY-bounds.minY)/this.cellSize));
  this.count=this.columns*this.rows;
  if(this.count>MAX_CELLS)throw new RangeError("Navigation grid exceeds 65536 cells; use tighter bounds or a larger cell size.");
  this.polygons=[];this._index=new Map();this._indexSize=Math.max(80,this.cellSize*6);this._caches=new Map();
  this.lastSearch=null;this._centers=[];this._projections=new Map();
  if(passages!==undefined&&passages!==null&&!Array.isArray(passages))throw new TypeError("Navigation passages must be an array of polygons.");
  this._passages=(passages||[]).map(function(vertices){if(!Array.isArray(vertices)||vertices.length<3)throw new TypeError("Navigation passages need at least three vertices.");return vertices.map(point);});
  var self=this;
  (polygons||[]).forEach(function(vertices) {
    if(!Array.isArray(vertices)||vertices.length<3)throw new TypeError("Navigation polygons need at least three vertices.");
    var copy=vertices.map(point),box={minX:Infinity,minY:Infinity,maxX:-Infinity,maxY:-Infinity};
    copy.forEach(function(p){box.minX=Math.min(box.minX,p.x);box.maxX=Math.max(box.maxX,p.x);box.minY=Math.min(box.minY,p.y);box.maxY=Math.max(box.maxY,p.y);});
    var id=self.polygons.length;self.polygons.push({vertices:copy,box:box});
    // Relative bucket coordinates stay bounded by the map extent, even when
    // the whole map is translated beyond precise integer world coordinates.
    for(var y=Math.floor((Math.max(box.minY,bounds.minY)-bounds.minY)/self._indexSize);y<=Math.floor((Math.min(box.maxY,bounds.maxY)-bounds.minY)/self._indexSize);y++)for(var x=Math.floor((Math.max(box.minX,bounds.minX)-bounds.minX)/self._indexSize);x<=Math.floor((Math.min(box.maxX,bounds.maxX)-bounds.minX)/self._indexSize);x++) {
      var key=x+","+y,list=self._index.get(key);if(!list){list=[];self._index.set(key,list);}list.push(id);
    }
  });
  this._queryMarks=new Uint32Array(this.polygons.length);this._querySerial=0;
}

NavigationGrid.prototype._query=function(minX,minY,maxX,maxY) {
  var result=[];
  // Off-map escape checks are rare. Avoid indexing unbounded authored polygons
  // while still testing their original, unclipped geometry for those queries.
  if(minX<this.bounds.minX||minY<this.bounds.minY||maxX>this.bounds.maxX||maxY>this.bounds.maxY) {
    for(var p=0;p<this.polygons.length;p++){var box=this.polygons[p].box;if(box.maxX>=minX&&box.minX<=maxX&&box.maxY>=minY&&box.minY<=maxY)result.push(p);}return result;
  }
  var serial=++this._querySerial,marks=this._queryMarks,b=this.bounds;
  if(serial>=4294967295){marks.fill(0);this._querySerial=serial=1;}
  for(var y=Math.floor((minY-b.minY)/this._indexSize);y<=Math.floor((maxY-b.minY)/this._indexSize);y++)for(var x=Math.floor((minX-b.minX)/this._indexSize);x<=Math.floor((maxX-b.minX)/this._indexSize);x++) {
    var list=this._index.get(x+","+y);if(!list)continue;
    for(var j=0;j<list.length;j++)if(marks[list[j]]!==serial){marks[list[j]]=serial;result.push(list[j]);}
  }
  return result;
};
NavigationGrid.prototype._inBounds=function(p,radius) {
  var b=this.bounds;
  return p.x>=b.minX+radius-EPS&&p.x<=b.maxX-radius+EPS&&p.y>=b.minY+radius-EPS&&p.y<=b.maxY-radius+EPS;
};
NavigationGrid.prototype.isWalkable=function(value,radius) {
  var p=readPoint(value),r=radiusValue(radius);
  if(!this._inBounds(p,r))return false;
  var candidates=this._query(p.x-r,p.y-r,p.x+r,p.y+r),threshold=(r+EPS)*(r+EPS);
  for(var j=0;j<candidates.length;j++) {
    var vertices=this.polygons[candidates[j]].vertices;
    if(inside(p,vertices))return false;
    for(var i=0;i<vertices.length;i++)if(pointSegmentDistance2(p,vertices[i],vertices[(i+1)%vertices.length])<=threshold)return false;
  }
  return true;
};
NavigationGrid.prototype._hitsPolygon=function(a,b,r,vertices) {
  if(inside(a,vertices)||inside(b,vertices))return true;
  var threshold=(r+EPS)*(r+EPS);
  for(var i=0;i<vertices.length;i++)if(segmentDistance2(a,b,vertices[i],vertices[(i+1)%vertices.length])<=threshold)return true;
  return false;
};
NavigationGrid.prototype.segmentClear=function(start,end,radius) {
  var a=readPoint(start),b=readPoint(end),r=radiusValue(radius);
  if(!this._inBounds(a,r)||!this._inBounds(b,r))return false;
  var ids=this._query(Math.min(a.x,b.x)-r,Math.min(a.y,b.y)-r,Math.max(a.x,b.x)+r,Math.max(a.y,b.y)+r);
  for(var i=0;i<ids.length;i++)if(this._hitsPolygon(a,b,r,this.polygons[ids[i]].vertices))return false;
  return true;
};
// One-way terrain: an existing overlap may continue until it exits. Every new
// obstacle and every re-entry is still forbidden, including the unit's radius.
function exitPolygonClear(start,end,radius,vertices) {
  var dx=end.x-start.x,dy=end.y-start.y,rr=radius+EPS,intervals=[],times=[0,1],length2=dx*dx+dy*dy;
  function add(lo,hi){lo=Math.max(0,lo);hi=Math.min(1,hi);if(lo<=hi)intervals.push([lo,hi]);}
  function circle(center){var x=start.x-center.x,y=start.y-center.y,c=x*x+y*y-rr*rr;if(!length2){if(c<=0)add(0,1);return;}var b=x*dx+y*dy,disc=b*b-length2*c;if(disc<0)return;var root=Math.sqrt(disc);add((-b-root)/length2,(-b+root)/length2);}
  function clip(range,p,d,lo,hi){if(Math.abs(d)<EPS)return p>=lo&&p<=hi;var a=(lo-p)/d,b=(hi-p)/d;range[0]=Math.max(range[0],Math.min(a,b));range[1]=Math.min(range[1],Math.max(a,b));return range[0]<=range[1];}
  for(var i=0;i<vertices.length;i++){
    var a=vertices[i],b=vertices[(i+1)%vertices.length],ex=b.x-a.x,ey=b.y-a.y,len=Math.hypot(ex,ey),den=dx*ey-dy*ex;
    if(Math.abs(den)>EPS){var ax=a.x-start.x,ay=a.y-start.y,t=(ax*ey-ay*ex)/den,u=(ax*dy-ay*dx)/den;if(t>0&&t<1&&u>=0&&u<=1)times.push(t);}
    circle(a);if(!len)continue;
    var x=start.x-a.x,y=start.y-a.y,range=[0,1];
    if(clip(range,(x*ex+y*ey)/len,(dx*ex+dy*ey)/len,0,len)&&clip(range,(x*-ey+y*ex)/len,(dx*-ey+dy*ex)/len,-rr,rr))add(range[0],range[1]);
  }
  times.sort(function(a,b){return a-b;});
  for(var j=1;j<times.length;j++){var lo=times[j-1],hi=times[j],middle=(lo+hi)/2;if(inside({x:start.x+dx*middle,y:start.y+dy*middle},vertices))add(lo,hi);}
  if(!intervals.length)return true;
  intervals.sort(function(a,b){return a[0]-b[0];});
  if(intervals[0][0]>EPS)return false;
  var endOfOverlap=intervals[0][1];
  for(var k=1;k<intervals.length;k++){if(intervals[k][0]>endOfOverlap+EPS)return false;endOfOverlap=Math.max(endOfOverlap,intervals[k][1]);}
  return true;
}
NavigationGrid.prototype.canExitBlocked=function(start,end,radius) {
  var a=readPoint(start),b=readPoint(end),r=radiusValue(radius),bounds=this.bounds;
  function inward(from,to,min,max){return from<min-EPS?to>=from-EPS&&to<=max+EPS:from>max+EPS?to<=from+EPS&&to>=min-EPS:to>=min-EPS&&to<=max+EPS;}
  if(!inward(a.x,b.x,bounds.minX+r,bounds.maxX-r)||!inward(a.y,b.y,bounds.minY+r,bounds.maxY-r))return false;
  var ids=this._query(Math.min(a.x,b.x)-r,Math.min(a.y,b.y)-r,Math.max(a.x,b.x)+r,Math.max(a.y,b.y)+r);
  for(var i=0;i<ids.length;i++)if(!exitPolygonClear(a,b,r,this.polygons[ids[i]].vertices))return false;
  return true;
};
NavigationGrid.prototype._center=function(id) {
  if(this._centers[id])return this._centers[id];
  var x=id%this.columns,y=Math.floor(id/this.columns),b=this.bounds,s=this.cellSize;
  var left=b.minX+x*s,bottom=b.minY+y*s;
  return this._centers[id]={x:left+Math.min(s,b.maxX-left)/2,y:bottom+Math.min(s,b.maxY-bottom)/2};
};
NavigationGrid.prototype._cache=function(radius) {
  var key=String(radius),cache=this._caches.get(key);
  if(cache){this._caches.delete(key);this._caches.set(key,cache);return cache;}
  cache={radius:radius,walk:new Uint8Array(this.count),walkKnown:new Uint8Array(this.count),checked:new Uint8Array(this.count),edges:new Uint8Array(this.count)};
  if(this._caches.size>=8)this._caches.delete(this._caches.keys().next().value);
  this._caches.set(key,cache);return cache;
};
NavigationGrid.prototype._walkableCell=function(cache,id) {
  if(!cache.walkKnown[id]){cache.walk[id]=this.isWalkable(this._center(id),cache.radius)?1:0;cache.walkKnown[id]=1;}
  return !!cache.walk[id];
};
NavigationGrid.prototype._edge=function(cache,id,direction) {
  var mask=1<<direction;
  if(cache.checked[id]&mask)return !!(cache.edges[id]&mask);
  cache.checked[id]|=mask;
  var x=id%this.columns,y=Math.floor(id/this.columns),delta=DIRECTIONS[direction],nx=x+delta[0],ny=y+delta[1];
  if(nx<0||nx>=this.columns||ny<0||ny>=this.rows)return false;
  var next=ny*this.columns+nx,allowed=this._walkableCell(cache,id)&&this._walkableCell(cache,next);
  if(allowed&&delta[0]&&delta[1])allowed=this._walkableCell(cache,y*this.columns+nx)&&this._walkableCell(cache,ny*this.columns+x);
  if(allowed)allowed=this.segmentClear(this._center(id),this._center(next),cache.radius);
  cache.checked[next]|=1<<OPPOSITE[direction];
  if(allowed){cache.edges[id]|=mask;cache.edges[next]|=1<<OPPOSITE[direction];}
  return allowed;
};
// Only an already-overlapping start may use this exception. Every initially
// clear polygon is checked exactly, and overlapping polygons must have a single
// outward exit with nondecreasing signed clearance. The escape is never a teleport.
NavigationGrid.prototype._escapeClear=function(start,end,radius,goalProjection) { return complete(clearanceTask(this,start,end,radius,goalProjection)); };

// Explicit cursor tasks keep Creator 2.4 mobile compatibility without generator
// runtimes. A work unit is one cell, edge, candidate, portal step or waypoint.
function Task(advance,release) { this.done=false;this.cancelled=false;this.result=null;this.lastWork=0;this.work=0;this._advance=advance;this._release=release; }
Task.prototype._finish=function(value){this.result=value;this.done=true;this._advance=null;var release=this._release;this._release=null;if(release)release();};
Task.prototype.cancel=function(){if(!this.done)this._finish(null);this.cancelled=true;this.result=null;};
Task.prototype.step=function(workBudget,timeBudgetMs){
  if(workBudget===undefined)workBudget=256;
  if(workBudget!==Infinity&&(!finite(workBudget)||workBudget<0||Math.floor(workBudget)!==workBudget))throw new RangeError("Navigation work budget must be a non-negative whole number.");
  if(timeBudgetMs!==undefined&&timeBudgetMs!==Infinity&&(!finite(timeBudgetMs)||timeBudgetMs<0))throw new RangeError("Navigation time budget must be non-negative.");
  this.lastWork=0;if(this.done)return this.result;
  if(!workBudget||timeBudgetMs===0)return null;
  var deadline=timeBudgetMs===undefined||timeBudgetMs===Infinity?Infinity:Date.now()+timeBudgetMs;
  try{while(!this.done&&this.lastWork<workBudget&&(this.lastWork===0||deadline===Infinity||Date.now()<deadline)){this.lastWork++;this.work++;this._advance(this);}}
  catch(error){this.cancel();throw error;}
  finally{if(this.stats)this.stats.work=this.work;}
  return this.done?this.result:null;
};
function complete(task){while(!task.done)task.step(Infinity);return task.result;}
// Sharing is optional. Bound both entry count and retained waypoint references
// so a set of pathological maze routes cannot become a mobile-memory cache.
function rememberPath(grid,name,key,value){
  if(value.points.length>4096)return;
  var cache=grid[name];if(!cache)cache=grid[name]=new Map();cache.delete(key);var points=value.points.length;cache.forEach(function(entry){points+=entry.points.length;});
  while(cache.size&&(cache.size>=32||points>4096)){var oldest=cache.keys().next().value;points-=cache.get(oldest).points.length;cache.delete(oldest);}cache.set(key,value);
}
function clearanceTask(grid,start,end,radius,goalProjection){
  var phase='end',length=0,ids=null,polygon=0,vertices=null,initial=0,times=null,edge=0,dx=end.x-start.x,dy=end.y-start.y,exited=false,interval=1,steps=0,sample=1,previous=0;
  return new Task(function(job){
    if(phase==='end'){if(!grid.isWalkable(end,radius)){job._finish(false);return;}length=distance(start,end);if(!finite(length)){job._finish(false);return;}phase='query';return;}
    if(phase==='query'){ids=grid._query(Math.min(start.x,end.x)-radius,Math.min(start.y,end.y)-radius,Math.max(start.x,end.x)+radius,Math.max(start.y,end.y)+radius);phase='polygon';return;}
    if(phase==='polygon'){if(polygon>=ids.length){job._finish(true);return;}vertices=grid.polygons[ids[polygon++]].vertices;initial=clearance(start,vertices);if(initial>radius+EPS){if(grid._hitsPolygon(start,end,radius,vertices))job._finish(false);return;}times=[0,1];edge=0;phase='intersections';return;}
    if(phase==='intersections'){if(edge>=vertices.length){times.sort(function(a,b){return a-b;});exited=!inside(start,vertices);interval=1;phase='intervals';return;}var a=vertices[edge],b=vertices[(edge+1)%vertices.length],ex=b.x-a.x,ey=b.y-a.y,den=dx*ey-dy*ex;edge++;if(Math.abs(den)<=EPS)return;var ax=a.x-start.x,ay=a.y-start.y,t=(ax*ey-ay*ex)/den,u=(ax*dy-ay*dx)/den;if(t>EPS&&t<1-EPS&&u>=-EPS&&u<=1+EPS)times.push(t);return;}
    if(phase==='intervals'){if(interval>=times.length){if(goalProjection){phase='polygon';return;}steps=Math.max(1,Math.ceil(length/Math.min(2,grid.cellSize/10)));if(!finite(steps)){job._finish(false);return;}previous=initial;sample=1;phase='samples';return;}var hi=times[interval],lo=times[interval-1];interval++;if(hi-lo<EPS)return;var middle=(hi+lo)/2,contained=inside({x:start.x+dx*middle,y:start.y+dy*middle},vertices);if(contained&&exited){job._finish(false);return;}if(!contained)exited=true;return;}
    if(sample>steps){phase='polygon';return;}var f=sample++/steps,current=clearance({x:start.x+dx*f,y:start.y+dy*f},vertices);if(current+1e-5<previous){job._finish(false);return;}previous=current;
  },function(){ids=null;vertices=null;times=null;});
}
function nearestTask(grid,p,cache,limit){
  var s=grid.cellSize,b=grid.bounds,x0=Math.max(0,Math.floor((p.x-limit-b.minX)/s)),x1=Math.min(grid.columns-1,Math.floor((p.x+limit-b.minX)/s));
  var y=Math.max(0,Math.floor((p.y-limit-b.minY)/s)),y1=Math.min(grid.rows-1,Math.floor((p.y+limit-b.minY)/s)),x=x0,heap=new Heap(byDistance);
  return new Task(function(job){if(x0>x1||y>y1){job._finish(heap);return;}var id=y*grid.columns+x,p2=grid._center(id),d2=distance2(p,p2);if(d2<=limit*limit+EPS&&grid._walkableCell(cache,id))heap.push({id:id,point:p2,d2:d2,f:d2});if(++x>x1){x=x0;y++;}});
}
function anchorTask(grid,p,cache){
  var child=nearestTask(grid,p,cache,grid.cellSize*2.5),heap=null,result=[];
  return new Task(function(job){if(!heap){child.step(1);if(child.done){heap=child.result;child=null;}return;}if(!heap.items.length||result.length===12){job._finish(result);return;}var candidate=heap.pop();if(grid.segmentClear(p,candidate.point,cache.radius))result.push(candidate);},function(){if(child)child.cancel();heap=null;result=null;});
}
function egressTask(grid,start,cache,goal){
  // Directed edges permit travel inside an existing blocker. Unlike ordinary
  // occupancy search they never allow clear ground to enter a blocked cell.
  var heap=new Heap(),seen=new Uint8Array(grid.count),closed=new Uint8Array(grid.count),cost=new Float64Array(grid.count),parent=new Int32Array(grid.count),phase='seed',seed=0,current=null,direction=0,cursor=-1,route=[],cx=Math.max(0,Math.min(grid.columns-1,Math.floor((start.x-grid.bounds.minX)/grid.cellSize))),cy=Math.max(0,Math.min(grid.rows-1,Math.floor((start.y-grid.bounds.minY)/grid.cellSize)));
  function offer(id,from,g){if(id<0||id>=grid.count||closed[id]||seen[id]&&cost[id]<=g)return;seen[id]=1;cost[id]=g;parent[id]=from;heap.push({id:id,g:g,f:g+distance(grid._center(id),goal)});}
  return new Task(function(job){
    if(phase==='seed'){if(seed>=9){phase='pop';return;}var x=cx+seed%3-1,y=cy+Math.floor(seed/3)-1;seed++;if(x<0||x>=grid.columns||y<0||y>=grid.rows)return;var id=y*grid.columns+x,p=grid._center(id);if(grid._inBounds(p,cache.radius)&&grid.canExitBlocked(start,p,cache.radius))offer(id,-1,distance(start,p));return;}
    if(phase==='pop'){if(!heap.items.length){job._finish(null);return;}current=heap.pop();if(closed[current.id]||current.g!==cost[current.id])return;closed[current.id]=1;if(grid._walkableCell(cache,current.id)){cursor=current.id;phase='route';return;}direction=0;phase='edges';return;}
    if(phase==='edges'){if(direction>=DIRECTIONS.length){phase='pop';return;}var delta=DIRECTIONS[direction++],x=current.id%grid.columns+delta[0],y=Math.floor(current.id/grid.columns)+delta[1];if(x<0||x>=grid.columns||y<0||y>=grid.rows)return;var id=y*grid.columns+x,a=grid._center(current.id),b=grid._center(id);if(!closed[id]&&grid._inBounds(b,cache.radius)&&grid.canExitBlocked(a,b,cache.radius))offer(id,current.id,current.g+distance(a,b));return;}
    if(cursor>=0){route.push(point(grid._center(cursor)));cursor=parent[cursor];return;}
    route.reverse();route.unshift(point(start));var exit=point(route[route.length-1]);exit.exitPoints=route;job._finish(exit);
  },function(){heap=null;seen=null;closed=null;cost=null;parent=null;route=null;});
}
function escapeTask(grid,start,cache,goal){
  var child=nearestTask(grid,start,cache,grid.cellSize*3+cache.radius*2),near=null,chosen=new Heap(function(a,b){return a.f<b.f||a.f===b.f&&(a.d2<b.d2||a.d2===b.d2&&a.id<b.id);}),count=0,phase=0,candidate=null;
  return new Task(function(job){if(phase===3){child.step(1);if(child.done)job._finish(child.result);return;}if(phase===0){child.step(1);if(child.done){near=child.result;child=null;phase=1;}return;}if(phase===1){if(!near.items.length||count===128){near=null;phase=2;return;}var item=near.pop();item.f=Math.sqrt(item.d2)+distance(item.point,goal);chosen.push(item);count++;return;}if(!child){if(!chosen.items.length){if(grid.isWalkable(goal,cache.radius)&&grid.canExitBlocked(start,goal,cache.radius)){job._finish(point(goal));return;}child=egressTask(grid,start,cache,goal);phase=3;return;}candidate=chosen.pop();child=clearanceTask(grid,start,candidate.point,cache.radius);}child.step(1);if(child.done){var clear=child.result;child=null;if(clear)job._finish(candidate.point);}},function(){if(child)child.cancel();near=null;chosen=null;candidate=null;});
}
function projectionTask(grid,goal,cache,start){
  var key=cache.radius+":"+goal.x+","+goal.y,ties=grid._projections.get(key),b=grid.bounds;
  var maximum=Math.sqrt(Math.max(distance2(goal,{x:b.minX,y:b.minY}),distance2(goal,{x:b.maxX,y:b.minY}),distance2(goal,{x:b.minX,y:b.maxY}),distance2(goal,{x:b.maxX,y:b.maxY})))+grid.cellSize;
  var limit=Math.min(maximum,grid.cellSize*3+cache.radius*2),child=null,heap=null,best=Infinity,selected=-1,bestStart=Infinity,index=0,phase=ties?2:0,pending=null;
  if(!ties)ties=[];
  function publish(){if(grid._projections.size>=128)grid._projections.delete(grid._projections.keys().next().value);grid._projections.set(key,ties);phase=2;}
  return new Task(function(job){
    if(phase===0){if(!child)child=nearestTask(grid,goal,cache,limit);child.step(1);if(child.done){heap=child.result;child=null;phase=1;}return;}
    if(phase===1){if(!heap.items.length){heap=null;if(ties.length||limit>=maximum){publish();return;}limit=Math.min(maximum,limit*2);phase=0;return;}pending=heap.pop();if(pending.d2>best+EPS){publish();return;}child=clearanceTask(grid,goal,pending.point,cache.radius,true);phase=3;return;}
    if(phase===3){child.step(1);if(child.done){if(child.result){best=pending.d2;ties.push(pending.id);}child=null;pending=null;phase=1;}return;}
    if(index>=ties.length){job._finish(selected);return;}var id=ties[index++],d=distance2(grid._center(id),start);if(d<bestStart-EPS){bestStart=d;selected=id;}
  },function(){if(child)child.cancel();heap=null;ties=null;pending=null;});
}
function smoothTask(grid,points,radius){
  var result=[points[0]],index=0,far=1,next=2;
  return new Task(function(job){if(points.length<3){job._finish(points);return;}if(index>=points.length-1){job._finish(result);return;}if(next<points.length&&grid.segmentClear(points[index],points[next],radius)){far=next++;return;}result.push(points[far]);index=far;far=index+1;next=index+2;},function(){points=null;result=null;});
}
function detachTask(plan){
  var result={points:[],goal:point(plan.goal),reached:plan.reached,escape:plan.escape?{from:point(plan.escape.from),to:point(plan.escape.to),distance:plan.escape.distance}:null},index=0;
  if(plan.escape&&plan.escape.points){result.escape.points=plan.escape.points.map(point);result.points=plan.escape.points.slice(1,-1).map(point);}
  if(plan.partial!==undefined)result.partial=plan.partial;
  return new Task(function(job){if(index<plan.points.length)result.points.push(point(plan.points[index++]));else job._finish(result);},function(){plan=null;result=null;});
}
function bridgeTask(grid,cache){
  var result=new Map(),passage=0,phase='next',vertices=null,vi=0,center,box,edge,normal,half,margin,localBounds,fine,reach,sign=-1,child=null,heap=null,entrances=[],exits=[],links=null,linkIndex=0,linkCandidates=null,linkAt=0,pair=0,plan=null,check=0,cost=0,reverse=null;
  function add(a,b,points,length){var list=result.get(a.id);if(!list){list=[];result.set(a.id,list);}list.push({id:b.id,points:points,cost:length});}
  function next(){passage++;phase='next';fine=null;vertices=null;entrances=[];exits=[];links=null;linkCandidates=null;plan=null;reverse=null;}
  return new Task(function(job){
    // Another synchronous caller may finish the same immutable portal cache
    // between our slices. Never publish an incomplete cache to either caller.
    if(cache.bridges){job._finish(cache.bridges);return;}
    if(phase==='next'){if(passage>=grid._passages.length){cache.bridges=result;job._finish(result);return;}vertices=grid._passages[passage];center={x:0,y:0};box={minX:Infinity,minY:Infinity,maxX:-Infinity,maxY:-Infinity};edge={length:0};vi=0;phase='vertices';return;}
    if(phase==='vertices'){if(vi>=vertices.length){if(!edge.length){next();return;}normal={x:-edge.dy/edge.length,y:edge.dx/edge.length};half=0;vi=0;phase='width';return;}var p=vertices[vi],q=vertices[(vi+1)%vertices.length],dx=q.x-p.x,dy=q.y-p.y,length=Math.hypot(dx,dy);center.x+=p.x/vertices.length;center.y+=p.y/vertices.length;box.minX=Math.min(box.minX,p.x);box.maxX=Math.max(box.maxX,p.x);box.minY=Math.min(box.minY,p.y);box.maxY=Math.max(box.maxY,p.y);if(length>edge.length)edge={length:length,dx:dx,dy:dy};vi++;return;}
    if(phase==='width'){if(vi<vertices.length){var v=vertices[vi++];half=Math.max(half,Math.abs((v.x-center.x)*normal.x+(v.y-center.y)*normal.y));return;}margin=cache.radius*2+grid.cellSize*4;var b=grid.bounds;localBounds={minX:Math.max(b.minX,box.minX-margin),minY:Math.max(b.minY,box.minY-margin),maxX:Math.min(b.maxX,box.maxX+margin),maxY:Math.min(b.maxY,box.maxY+margin)};if(localBounds.minX>=localBounds.maxX||localBounds.minY>=localBounds.maxY){next();return;}
      var w=localBounds.maxX-localBounds.minX,h=localBounds.maxY-localBounds.minY,cell=Math.max(4,Math.ceil(w/MAX_CELLS),Math.ceil(h/MAX_CELLS),Math.ceil(Math.sqrt(w)*Math.sqrt(h/MAX_CELLS)));while(Math.ceil(w/cell)*Math.ceil(h/cell)>MAX_CELLS)cell=Math.max(cell+1,cell*1.01);
      fine=new NavigationGrid([],localBounds,cell);fine.polygons=grid.polygons;fine._query=function(a,b,c,d){return grid._query(a,b,c,d);};reach=half+cache.radius+grid.cellSize*2;sign=-1;phase='anchors';return;}
    if(phase==='anchors'){if(!child){var a={x:center.x+normal.x*reach*sign,y:center.y+normal.y*reach*sign};child=nearestTask(grid,a,cache,grid.cellSize*3);}child.step(1);if(child.done){heap=child.result;child=null;phase='take';}return;}
    if(phase==='take'){var selected=sign<0?entrances:exits;if(heap.items.length&&selected.length<2){var candidate=heap.pop();if(((candidate.point.x-center.x)*normal.x+(candidate.point.y-center.y)*normal.y)*sign>half+cache.radius&&fine._inBounds(candidate.point,cache.radius))selected.push(candidate);return;}heap=null;if(sign<0){sign=1;phase='anchors';return;}links=entrances.concat(exits);linkIndex=0;phase='links';return;}
    if(phase==='links'){if(linkIndex>=links.length){pair=0;phase='pairs';return;}if(!child)child=anchorTask(grid,links[linkIndex].point,cache);child.step(1);if(child.done){linkCandidates=child.result;child=null;linkAt=0;phase='link-points';}return;}
    if(phase==='link-points'){if(linkAt>=linkCandidates.length){linkIndex++;phase='links';return;}var from=links[linkIndex],to=linkCandidates[linkAt++];if(from.id!==to.id){var d=distance(from.point,to.point);add(from,to,[from.point,to.point],d);add(to,from,[to.point,from.point],d);}return;}
    if(phase==='pairs'){if(pair>=entrances.length*exits.length){next();return;}if(!child)child=fine.createSearch(entrances[Math.floor(pair/exits.length)].point,exits[pair%exits.length].point,cache.radius);child.step(1);if(child.done){plan=child.result;child=null;if(!plan||!plan.reached||plan.escape){pair++;return;}check=0;cost=0;reverse=[];phase='verify';}return;}
    if(check<plan.points.length){var p2=plan.points[check];reverse[plan.points.length-check-1]=p2;if(check){if(!grid.segmentClear(plan.points[check-1],p2,cache.radius)){pair++;phase='pairs';plan=null;return;}cost+=distance(plan.points[check-1],p2);}check++;return;}
    var a2=entrances[Math.floor(pair/exits.length)],b2=exits[pair%exits.length];add(a2,b2,plan.points,cost);add(b2,a2,reverse,cost);plan=null;reverse=null;pair++;phase='pairs';
  },function(){if(child)child.cancel();result=null;fine=null;vertices=null;heap=null;links=null;linkCandidates=null;entrances=null;exits=null;plan=null;reverse=null;});
}

NavigationGrid.prototype._passageBridges=function(cache){return complete(bridgeTask(this,cache));};
NavigationGrid.prototype._nearby=function(p,cache,limit){var heap=complete(nearestTask(this,p,cache,limit)),result=[];while(heap.items.length)result.push(heap.pop());return result;};
NavigationGrid.prototype._anchors=function(p,cache){return complete(anchorTask(this,p,cache));};
NavigationGrid.prototype._escape=function(start,cache,goal){return complete(escapeTask(this,start,cache,goal));};
NavigationGrid.prototype._smooth=function(points,radius){return complete(smoothTask(this,points,radius));};
NavigationGrid.prototype._projectGoal=function(goal,cache,start){return complete(projectionTask(this,goal,cache,start));};

NavigationGrid.prototype.createSearch=function(startValue,goalValue,radius,allowPartial,escapeOnly){
  var grid=this,start=point(startValue),requestedGoal=point(goalValue),r=radiusValue(radius),phase='start',startFree=false,goalFree=false,escape=null,sharedKey=null,shared=null,join=0,cache=null,bridges=null,child=null,starts=null,goalAnchors=null,goalIds=null,target=requestedGoal;
  var seen=null,closed=null,g=null,parent=null,parentBridges=null,heap=null,seed=0,item=null,currentId=-1,current=null,goalDistance=0,direction=0,bridgeIndex=0,extraBridges=null,found=-1,bestCost=Infinity,bestReachable=-1,bestDistance=Infinity,frontier=-1,frontierDistance=Infinity,partial=false;
  var reversed=null,cursor=-1,guard=0,parentCursor=-1,reconstructBridge=null,bridgePoint=0,points=null,reverseAt=0,goal=null,plan=null;
  var cachedRoutes=null,routeIndex=0,cachedRoute=null,tailIndex=0,joinIndex=0;
  var stats={expanded:0,cells:grid.count,direct:false,work:0};
  function finish(job,value){stats.work=job.work;grid.lastSearch=stats;job._finish(value);}
  function detach(value){plan=value;child=detachTask(value);phase='detach';}
  function routeEnd(){if(found<0&&!goalFree)found=bestReachable;partial=found<0&&!!allowPartial;if(partial)found=frontier;if(found<0)return false;reversed=[];cursor=found;guard=0;phase='reconstruct';return true;}
  var job=new Task(function(job){
    job.phase=phase;
    if(phase==='start'){if(r>(grid.bounds.maxX-grid.bounds.minX)/2+EPS||r>(grid.bounds.maxY-grid.bounds.minY)/2+EPS){finish(job,null);return;}startFree=grid.isWalkable(start,r);phase='goal';return;}
    if(phase==='goal'){goalFree=grid.isWalkable(requestedGoal,r);phase='direct';return;}
    if(phase==='direct'){if(escapeOnly&&startFree){detach({points:[start],goal:start,reached:true,escape:null});return;}if(!escapeOnly&&!startFree&&!goalFree&&distance2(start,requestedGoal)>EPS*EPS&&grid.canExitBlocked(start,requestedGoal,r)){detach({points:[start,requestedGoal],goal:requestedGoal,reached:true,escape:{from:start,to:requestedGoal,distance:distance(start,requestedGoal)}});return;}if(startFree&&goalFree&&grid.segmentClear(start,requestedGoal,r)){stats.direct=true;detach({points:start.x===requestedGoal.x&&start.y===requestedGoal.y?[start]:[start,requestedGoal],goal:requestedGoal,reached:true,escape:null});return;}cachedRoutes=startFree&&goalFree&&grid._routes?Array.from(grid._routes.values()).reverse():[];routeIndex=0;phase='route-cache';return;}
    if(phase==='route-cache'){if(routeIndex>=cachedRoutes.length){cachedRoutes=null;sharedKey=allowPartial&&startFree?r+":"+requestedGoal.x+":"+requestedGoal.y:null;shared=sharedKey&&grid._partialRoutes&&grid._partialRoutes.get(sharedKey);join=shared?shared.points.length-1:-1;phase='shared';return;}cachedRoute=cachedRoutes[routeIndex++];var nearStart=Math.max(grid.cellSize*3,r*2+grid.cellSize*2),nearGoal=Math.max(grid.cellSize*6,r*4+grid.cellSize*2);if(cachedRoute.radius!==r||distance2(start,cachedRoute.start)>nearStart*nearStart||distance2(requestedGoal,cachedRoute.goal)>nearGoal*nearGoal)return;tailIndex=0;phase='route-tail';return;}
    if(phase==='route-tail'){if(tailIndex>=cachedRoute.points.length){phase='route-cache';return;}if(grid.segmentClear(cachedRoute.points[tailIndex],requestedGoal,r)){joinIndex=tailIndex;phase='route-join';}else tailIndex++;return;}
    if(phase==='route-join'){if(joinIndex<0){phase='route-cache';return;}if(!grid.segmentClear(start,cachedRoute.points[joinIndex],r)){joinIndex--;return;}var reused=[start].concat(cachedRoute.points.slice(joinIndex,tailIndex+1));if(reused[reused.length-1].x!==requestedGoal.x||reused[reused.length-1].y!==requestedGoal.y)reused.push(requestedGoal);stats.reused=true;detach({points:reused,goal:requestedGoal,reached:true,partial:false,escape:null});return;}
    if(phase==='shared'){if(shared&&distance2(start,shared.start)<=grid.cellSize*grid.cellSize*9&&join>=0){if(grid.segmentClear(start,shared.points[join],r)){stats.shared=true;detach({points:[start].concat(shared.points.slice(join)),goal:shared.goal,reached:false,partial:true,escape:null});return;}join--;return;}phase='cache';return;}
    if(phase==='cache'){cache=grid._cache(r);child=bridgeTask(grid,cache);phase='bridges';return;}
    if(phase==='bridges'){child.step(1);if(child.done){bridges=child.result;child=null;phase=startFree?'starts':'escape';}return;}
    if(phase==='escape'){if(!child)child=escapeTask(grid,start,cache,requestedGoal);child.step(1);if(child.done){var escaped=child.result;child=null;if(!escaped){finish(job,null);return;}escape={from:start,to:point(escaped),distance:distance(start,escaped)};if(escaped.exitPoints)escape.points=escaped.exitPoints;start=point(escaped);
      // Safety recovery must reach free ground. Physics may nudge the unit a
      // fraction away from its captured, still-blocked origin; returning there
      // is valid ordinary movement, but cannot count as escaping the obstacle.
      if(escapeOnly){detach({points:[start],goal:start,reached:true,escape:escape});return;}
      phase='escaped-direct';}return;}
    if(phase==='escaped-direct'){if(goalFree&&grid.segmentClear(start,requestedGoal,r)){stats.direct=true;detach({points:start.x===requestedGoal.x&&start.y===requestedGoal.y?[start]:[start,requestedGoal],goal:requestedGoal,reached:true,escape:escape});return;}phase='starts';return;}
    if(phase==='starts'){if(!child)child=anchorTask(grid,start,cache);child.step(1);if(child.done){starts=child.result;child=null;if(!starts.length){finish(job,null);return;}phase=goalFree?'goals':'projection';goalIds=new Set();}return;}
    if(phase==='goals'){if(!child)child=anchorTask(grid,requestedGoal,cache);child.step(1);if(child.done){goalAnchors=child.result;child=null;if(!goalAnchors.length&&!allowPartial){finish(job,null);return;}for(var a=0;a<goalAnchors.length;a++)goalIds.add(goalAnchors[a].id);phase='workspace';}return;}
    if(phase==='projection'){if(!child)child=projectionTask(grid,requestedGoal,cache,start);child.step(1);if(child.done){var id=child.result;child=null;if(id<0&&!allowPartial){finish(job,null);return;}if(id>=0){target=grid._center(id);goalIds.add(id);}phase='workspace';}return;}
    if(phase==='workspace'){seen=new Uint8Array(grid.count);closed=new Uint8Array(grid.count);g=new Float64Array(grid.count);parent=new Int32Array(grid.count);parentBridges=new Map();heap=new Heap();seed=0;phase='seed';return;}
    if(phase==='seed'){if(seed>=starts.length){starts=null;phase='pop';return;}var candidate=starts[seed++],cost=Math.sqrt(candidate.d2);seen[candidate.id]=1;g[candidate.id]=cost;parent[candidate.id]=-1;heap.push({id:candidate.id,g:cost,f:cost+distance(candidate.point,target)});return;}
    if(phase==='pop'){if(!heap.items.length){if(!routeEnd())finish(job,null);return;}item=heap.pop();currentId=item.id;if(item.f>=bestCost-EPS){if(!routeEnd())finish(job,null);return;}if(closed[currentId]||!seen[currentId]||item.g!==g[currentId])return;closed[currentId]=1;stats.expanded++;current=grid._center(currentId);goalDistance=distance2(current,requestedGoal);if(goalDistance<frontierDistance-EPS){frontierDistance=goalDistance;frontier=currentId;}phase='evaluate';return;}
    if(phase==='evaluate'){if(goalDistance<bestDistance-EPS){if(goalFree){bestDistance=goalDistance;bestReachable=currentId;}else{if(!child)child=clearanceTask(grid,requestedGoal,current,r,true);child.step(1);if(!child.done)return;if(child.result){bestDistance=goalDistance;bestReachable=currentId;}child=null;}}phase='evaluated';return;}
    if(phase==='evaluated'){if(goalIds.has(currentId)){var completeCost=item.g+(goalFree?Math.sqrt(goalDistance):0);if(completeCost<bestCost){bestCost=completeCost;found=currentId;}phase='pop';return;}direction=0;phase='edges';return;}
    if(phase==='edges'){if(direction>=8){extraBridges=bridges.get(currentId);bridgeIndex=0;phase='portal-edges';return;}var d=direction++;if(!grid._edge(cache,currentId,d))return;var delta=DIRECTIONS[d],nextId=currentId+delta[1]*grid.columns+delta[0];if(closed[nextId])return;var next=grid._center(nextId),nextG=item.g+distance(current,next);if(!seen[nextId]||nextG<g[nextId]-EPS){seen[nextId]=1;g[nextId]=nextG;parent[nextId]=currentId;parentBridges.delete(nextId);heap.push({id:nextId,g:nextG,f:nextG+distance(next,target)});}return;}
    if(phase==='portal-edges'){if(!extraBridges||bridgeIndex>=extraBridges.length){phase='pop';return;}var bridge=extraBridges[bridgeIndex++],next2=bridge.id;if(closed[next2])return;var nextG2=item.g+bridge.cost;if(!seen[next2]||nextG2<g[next2]-EPS){seen[next2]=1;g[next2]=nextG2;parent[next2]=currentId;parentBridges.set(next2,bridge.points);heap.push({id:next2,g:nextG2,f:nextG2+distance(grid._center(next2),target)});}return;}
    if(phase==='reconstruct'){if(cursor<0){points=[start];reverseAt=reversed.length-1;phase='reverse';return;}if(++guard>grid.count){finish(job,null);return;}reversed.push(grid._center(cursor));reconstructBridge=parentBridges.get(cursor);parentCursor=parent[cursor];if(reconstructBridge){bridgePoint=reconstructBridge.length-2;phase='reconstruct-bridge';}else cursor=parentCursor;return;}
    if(phase==='reconstruct-bridge'){if(bridgePoint>0){reversed.push(reconstructBridge[bridgePoint--]);return;}cursor=parentCursor;reconstructBridge=null;phase='reconstruct';return;}
    if(phase==='reverse'){if(reverseAt>=0){var p=reversed[reverseAt--];if(distance2(points[points.length-1],p)>EPS)points.push(p);return;}reversed=null;goal=goalFree&&!partial?requestedGoal:grid._center(found);if(points[points.length-1].x!==goal.x||points[points.length-1].y!==goal.y)points.push(goal);child=smoothTask(grid,points,r);phase='smooth';return;}
    if(phase==='smooth'){child.step(1);if(child.done){plan={points:child.result,goal:goal,reached:goalFree&&!partial,partial:partial,escape:escape};child=null;if(plan.reached&&!escape){var routeKey=r+":"+start.x+","+start.y+":"+goal.x+","+goal.y;rememberPath(grid,'_routes',routeKey,{radius:r,start:start,goal:goal,points:plan.points});}if(partial&&sharedKey&&!escape)rememberPath(grid,'_partialRoutes',sharedKey,{start:start,points:plan.points,goal:goal});detach(plan);}return;}
    if(phase==='detach'){child.step(1);if(child.done){var result=child.result;child=null;finish(job,result);}return;}
  },function(){if(child)child.cancel();seen=null;closed=null;g=null;parent=null;parentBridges=null;heap=null;cache=null;bridges=null;starts=null;goalAnchors=null;goalIds=null;extraBridges=null;reversed=null;reconstructBridge=null;points=null;plan=null;shared=null;cachedRoutes=null;cachedRoute=null;});
  job.stats=stats;return job;
};
NavigationGrid.prototype.findPath=function(start,goal,radius,allowPartial,escapeOnly){return complete(this.createSearch(start,goal,radius,allowPartial,escapeOnly));};

exports.NavigationGrid=NavigationGrid;
