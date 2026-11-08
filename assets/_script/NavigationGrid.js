"use strict";

// Engine-independent navigation for circular units and immutable polygon geometry.
// Cells have numeric identities; every traversed/smoothed edge is checked against
// the original polygons, not just occupancy samples.
var EPS = 1e-7;
var MAX_CELLS = 65536;
var DIRECTIONS = [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1]];
var OPPOSITE = [1,0,3,2,7,6,5,4];
function finite(value) { return typeof value === "number" && isFinite(value); }
function point(value) {
  if (!value || !finite(value.x) || !finite(value.y)) throw new TypeError("Navigation points must have finite x/y coordinates.");
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
function Heap() { this.items=[]; }
Heap.prototype.push=function(item) {
  var items=this.items,index=items.length;items.push(item);
  while(index>0) { var parent=(index-1)>>1;if(items[parent].f<=item.f)break;items[index]=items[parent];index=parent; }
  items[index]=item;
};
Heap.prototype.pop=function() {
  var items=this.items,first=items[0],last=items.pop();if(!items.length)return first;
  var index=0;
  while(true) { var left=index*2+1,right=left+1;if(left>=items.length)break;var child=right<items.length&&items[right].f<items[left].f?right:left;if(items[child].f>=last.f)break;items[index]=items[child];index=child; }
  items[index]=last;return first;
};

function NavigationGrid(polygons,bounds,cellSize,passages) {
  if(!bounds||![bounds.minX,bounds.minY,bounds.maxX,bounds.maxY].every(finite)||bounds.minX>=bounds.maxX||bounds.minY>=bounds.maxY) throw new RangeError("Navigation bounds must be a finite nonempty rectangle.");
  this.bounds={minX:bounds.minX,minY:bounds.minY,maxX:bounds.maxX,maxY:bounds.maxY};
  this.cellSize=cellSize===undefined?20:cellSize;
  if(!finite(this.cellSize)||this.cellSize<=0)throw new RangeError("Navigation cell size must be positive.");
  this.columns=Math.ceil((bounds.maxX-bounds.minX)/this.cellSize);
  this.rows=Math.ceil((bounds.maxY-bounds.minY)/this.cellSize);
  this.count=this.columns*this.rows;
  if(this.count>MAX_CELLS)throw new RangeError("Navigation grid exceeds 65536 cells; use tighter bounds or a larger cell size.");
  this.polygons=[];this._index=new Map();this._indexSize=Math.max(80,this.cellSize*6);this._caches=new Map();
  this.lastSearch=null;this._centers=[];this._projections=new Map();
  this._passages=passages||[];
  var self=this;
  (polygons||[]).forEach(function(vertices) {
    if(!Array.isArray(vertices)||vertices.length<3)throw new TypeError("Navigation polygons need at least three vertices.");
    var copy=vertices.map(point),box={minX:Infinity,minY:Infinity,maxX:-Infinity,maxY:-Infinity};
    copy.forEach(function(p){box.minX=Math.min(box.minX,p.x);box.maxX=Math.max(box.maxX,p.x);box.minY=Math.min(box.minY,p.y);box.maxY=Math.max(box.maxY,p.y);});
    var id=self.polygons.length;self.polygons.push({vertices:copy,box:box});
    for(var y=Math.floor(Math.max(box.minY,bounds.minY)/self._indexSize);y<=Math.floor(Math.min(box.maxY,bounds.maxY)/self._indexSize);y++)for(var x=Math.floor(Math.max(box.minX,bounds.minX)/self._indexSize);x<=Math.floor(Math.min(box.maxX,bounds.maxX)/self._indexSize);x++) {
      var key=x+","+y,list=self._index.get(key);if(!list){list=[];self._index.set(key,list);}list.push(id);
    }
  });
}

NavigationGrid.prototype._query=function(minX,minY,maxX,maxY) {
  var found=new Set(),result=[];
  // Off-map escape checks are rare. Avoid indexing unbounded authored polygons
  // while still testing their original, unclipped geometry for those queries.
  if(minX<this.bounds.minX||minY<this.bounds.minY||maxX>this.bounds.maxX||maxY>this.bounds.maxY) {
    for(var p=0;p<this.polygons.length;p++){var box=this.polygons[p].box;if(box.maxX>=minX&&box.minX<=maxX&&box.maxY>=minY&&box.minY<=maxY)result.push(p);}return result;
  }
  for(var y=Math.floor(minY/this._indexSize);y<=Math.floor(maxY/this._indexSize);y++)for(var x=Math.floor(minX/this._indexSize);x<=Math.floor(maxX/this._indexSize);x++) {
    var list=this._index.get(x+","+y)||[];
    for(var j=0;j<list.length;j++)if(!found.has(list[j])){found.add(list[j]);result.push(list[j]);}
  }
  return result;
};
NavigationGrid.prototype._inBounds=function(p,radius) {
  var b=this.bounds;
  return p.x>=b.minX+radius-EPS&&p.x<=b.maxX-radius+EPS&&p.y>=b.minY+radius-EPS&&p.y<=b.maxY-radius+EPS;
};
NavigationGrid.prototype.isWalkable=function(value,radius) {
  var p=point(value),r=radiusValue(radius);
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
  var a=point(start),b=point(end),r=radiusValue(radius);
  if(!this._inBounds(a,r)||!this._inBounds(b,r))return false;
  var ids=this._query(Math.min(a.x,b.x)-r,Math.min(a.y,b.y)-r,Math.max(a.x,b.x)+r,Math.max(a.y,b.y)+r);
  for(var i=0;i<ids.length;i++)if(this._hitsPolygon(a,b,r,this.polygons[ids[i]].vertices))return false;
  return true;
};
NavigationGrid.prototype._center=function(id) {
  if(this._centers[id])return this._centers[id];
  var x=id%this.columns,y=Math.floor(id/this.columns),b=this.bounds,s=this.cellSize;
  return this._centers[id]={x:(b.minX+x*s+Math.min(b.minX+(x+1)*s,b.maxX))/2,y:(b.minY+y*s+Math.min(b.minY+(y+1)*s,b.maxY))/2};
};
NavigationGrid.prototype._cache=function(radius) {
  var key=String(radius),cache=this._caches.get(key);
  if(cache){this._caches.delete(key);this._caches.set(key,cache);return cache;}
  cache={radius:radius,walk:new Uint8Array(this.count),walkKnown:new Uint8Array(this.count),checked:new Uint8Array(this.count),edges:new Uint8Array(this.count),seen:new Uint32Array(this.count),closed:new Uint32Array(this.count),g:new Float64Array(this.count),parent:new Int32Array(this.count),serial:0};
  if(this._caches.size>=8)this._caches.delete(this._caches.keys().next().value);
  this._caches.set(key,cache);return cache;
};
NavigationGrid.prototype._passageBridges=function(cache) {
  if(cache.bridges)return cache.bridges;
  var bridges=cache.bridges=new Map(),self=this,r=cache.radius;
  cache.parentBridges=new Map();
  this._passages.forEach(function(vertices){
    var center={x:0,y:0},box={minX:Infinity,minY:Infinity,maxX:-Infinity,maxY:-Infinity},edge={length:0};
    vertices.forEach(function(p,i){center.x+=p.x/vertices.length;center.y+=p.y/vertices.length;box.minX=Math.min(box.minX,p.x);box.maxX=Math.max(box.maxX,p.x);box.minY=Math.min(box.minY,p.y);box.maxY=Math.max(box.maxY,p.y);var q=vertices[(i+1)%vertices.length],dx=q.x-p.x,dy=q.y-p.y,length=Math.hypot(dx,dy);if(length>edge.length)edge={length:length,dx:dx,dy:dy};});
    if(!edge.length)return;
    var normal={x:-edge.dy/edge.length,y:edge.dx/edge.length},half=0;
    vertices.forEach(function(p){half=Math.max(half,Math.abs((p.x-center.x)*normal.x+(p.y-center.y)*normal.y));});
    var margin=r*2+self.cellSize*4,b=self.bounds;
    var localBounds={minX:Math.max(b.minX,box.minX-margin),minY:Math.max(b.minY,box.minY-margin),maxX:Math.min(b.maxX,box.maxX+margin),maxY:Math.min(b.maxY,box.maxY+margin)};
    if(localBounds.minX>=localBounds.maxX||localBounds.minY>=localBounds.maxY)return;
    var fineCell=4;
    while(Math.ceil((localBounds.maxX-localBounds.minX)/fineCell)*Math.ceil((localBounds.maxY-localBounds.minY)/fineCell)>MAX_CELLS)fineCell++;
    var fine=new NavigationGrid(self.polygons.map(function(p){return p.vertices;}),localBounds,fineCell);
    var reach=half+r+self.cellSize*2;
    function anchors(sign){var p={x:center.x+normal.x*reach*sign,y:center.y+normal.y*reach*sign};return self._nearby(p,cache,self.cellSize*3).filter(function(a){return ((a.point.x-center.x)*normal.x+(a.point.y-center.y)*normal.y)*sign>half+r&&fine._inBounds(a.point,r);}).slice(0,2);}
    function add(a,b,points){var list=bridges.get(a.id)||[],cost=0;for(var i=1;i<points.length;i++)cost+=distance(points[i-1],points[i]);list.push({id:b.id,points:points,cost:cost});bridges.set(a.id,list);}
    var entrances=anchors(-1),exits=anchors(1);
    // A gate portal may lie in a small sampled pocket beside a tower. Join its
    // nearby clear cells using the same continuous body-clearance checks as
    // start/goal anchors, rather than requiring a corner-cutting lattice edge.
    entrances.concat(exits).forEach(function(a){self._anchors(a.point,cache).forEach(function(b){
      if(a.id!==b.id){add(a,b,[a.point,b.point]);add(b,a,[b.point,a.point]);}
    });});
    entrances.forEach(function(a){exits.forEach(function(b){
      var plan=fine.findPath(a.point,b.point,r);
      if(!plan||!plan.reached||plan.escape)return;
      if(!plan.points.every(function(p,i){return !i||self.segmentClear(plan.points[i-1],p,r);}))return;
      add(a,b,plan.points);add(b,a,plan.points.slice().reverse());
    });});
  });
  return bridges;
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
NavigationGrid.prototype._nearby=function(p,cache,limit) {
  var result=[],s=this.cellSize,b=this.bounds;
  var x0=Math.max(0,Math.floor((p.x-limit-b.minX)/s)),x1=Math.min(this.columns-1,Math.floor((p.x+limit-b.minX)/s));
  var y0=Math.max(0,Math.floor((p.y-limit-b.minY)/s)),y1=Math.min(this.rows-1,Math.floor((p.y+limit-b.minY)/s));
  for(var y=y0;y<=y1;y++)for(var x=x0;x<=x1;x++){var id=y*this.columns+x,p2=this._center(id),d2=distance2(p,p2);if(d2<=limit*limit+EPS&&this._walkableCell(cache,id))result.push({id:id,point:p2,d2:d2});}
  result.sort(function(a,b){return a.d2-b.d2||a.id-b.id;});return result;
};
NavigationGrid.prototype._anchors=function(p,cache) {
  var self=this;
  return this._nearby(p,cache,this.cellSize*2.5).filter(function(candidate){return self.segmentClear(p,candidate.point,cache.radius);}).slice(0,12);
};

// Only an already-overlapping start may use this exception. Every initially
// clear polygon is checked exactly, and overlapping polygons must have a single
// outward exit with nondecreasing signed clearance. The escape is never a teleport.
NavigationGrid.prototype._escapeClear=function(start,end,radius,goalProjection) {
  if(!this.isWalkable(end,radius))return false;
  var length=distance(start,end),ids=this._query(Math.min(start.x,end.x)-radius,Math.min(start.y,end.y)-radius,Math.max(start.x,end.x)+radius,Math.max(start.y,end.y)+radius);
  for(var n=0;n<ids.length;n++) {
    var vertices=this.polygons[ids[n]].vertices,initial=clearance(start,vertices);
    if(initial>radius+EPS){if(this._hitsPolygon(start,end,radius,vertices))return false;continue;}
    var times=[0,1],dx=end.x-start.x,dy=end.y-start.y;
    for(var e=0;e<vertices.length;e++) {
      var a=vertices[e],b=vertices[(e+1)%vertices.length],ex=b.x-a.x,ey=b.y-a.y,den=dx*ey-dy*ex;
      if(Math.abs(den)<=EPS)continue;
      var ax=a.x-start.x,ay=a.y-start.y,t=(ax*ey-ay*ex)/den,u=(ax*dy-ay*dx)/den;
      if(t>EPS&&t<1-EPS&&u>=-EPS&&u<=1+EPS)times.push(t);
    }
    times.sort(function(a,b){return a-b;});
    var exited=!inside(start,vertices);
    for(var ti=1;ti<times.length;ti++) {
      if(times[ti]-times[ti-1]<EPS)continue;
      var middle=(times[ti]+times[ti-1])/2,contained=inside({x:start.x+dx*middle,y:start.y+dy*middle},vertices);
      if(contained&&exited)return false;
      if(!contained)exited=true;
    }
    if(goalProjection)continue;
    var steps=Math.max(1,Math.ceil(length/Math.min(2,this.cellSize/10))),previous=initial;
    for(var step=1;step<=steps;step++) {
      var f=step/steps,current=clearance({x:start.x+dx*f,y:start.y+dy*f},vertices);
      if(current+1e-5<previous)return false;
      previous=current;
    }
  }
  return true;
};
NavigationGrid.prototype._escape=function(start,cache,goal) {
  var candidates=this._nearby(start,cache,this.cellSize*3+cache.radius*2).slice(0,128);
  // A crowd can push a body into the clearance margin beside a corner. The
  // nearest exit may point backward into the following unit, pinning both
  // bodies while their routes request opposite movement. Prefer an outward
  // exit on the way to the goal, still using the same bounded candidates and
  // monotonic-clearance checks (never crossing a previously clear obstacle).
  candidates.forEach(function(candidate){candidate.cost=Math.sqrt(candidate.d2)+distance(candidate.point,goal);});
  candidates.sort(function(a,b){return a.cost-b.cost||a.d2-b.d2||a.id-b.id;});
  for(var i=0;i<candidates.length&&i<128;i++)if(this._escapeClear(start,candidates[i].point,cache.radius))return candidates[i].point;
  return null;
};
NavigationGrid.prototype._smooth=function(points,radius) {
  if(points.length<3)return points;
  var result=[points[0]],index=0;
  while(index<points.length-1) {
    var far=index+1;
    for(var next=index+2;next<points.length;next++){if(!this.segmentClear(points[index],points[next],radius))break;far=next;}
    result.push(points[far]);index=far;
  }
  return result;
};
NavigationGrid.prototype._projectGoal=function(goal,cache,start) {
  var key=cache.radius+":"+goal.x+","+goal.y,ties=this._projections.get(key),self=this;
  if(!ties){
    ties=[];
    var b=this.bounds,maximum=Math.sqrt(Math.max(distance2(goal,{x:b.minX,y:b.minY}),distance2(goal,{x:b.maxX,y:b.minY}),distance2(goal,{x:b.minX,y:b.maxY}),distance2(goal,{x:b.maxX,y:b.maxY})))+this.cellSize;
    var limit=Math.min(maximum,this.cellSize*3+cache.radius*2);
    while(true){
      var nearby=this._nearby(goal,cache,limit),best=Infinity;
      for(var i=0;i<nearby.length;i++){
        var candidate=nearby[i];if(candidate.d2>best+EPS)break;
        if(this._escapeClear(goal,candidate.point,cache.radius,true)){best=candidate.d2;ties.push(candidate.id);}
      }
      if(ties.length||limit>=maximum)break;
      limit=Math.min(maximum,limit*2);
    }
    if(this._projections.size>=128)this._projections.delete(this._projections.keys().next().value);
    this._projections.set(key,ties);
  }
  var selected=-1,bestStart=Infinity;
  ties.forEach(function(id){var d=distance2(self._center(id),start);if(d<bestStart-EPS){bestStart=d;selected=id;}});
  return selected;
};
NavigationGrid.prototype.findPath=function(startValue,goalValue,radius,allowPartial) {
  var start=point(startValue),requestedGoal=point(goalValue),r=radiusValue(radius),self=this;
  this.lastSearch={expanded:0,cells:this.count,direct:false};
  var startFree=this.isWalkable(start,r),goalFree=this.isWalkable(requestedGoal,r),escape=null;
  if(startFree&&goalFree&&this.segmentClear(start,requestedGoal,r)){this.lastSearch.direct=true;return {points:distance2(start,requestedGoal)<EPS?[start]:[start,requestedGoal],goal:requestedGoal,reached:true,escape:null};}
  // Nearby enemies approaching the same sealed objective can share a safe
  // frontier route instead of each flooding the same unreachable component.
  // The grid is immutable; changing colliders creates a fresh grid/cache.
  var sharedKey=allowPartial&&startFree?r+":"+requestedGoal.x+":"+requestedGoal.y:null;
  var shared=sharedKey&&this._partialRoutes&&this._partialRoutes.get(sharedKey);
  if(shared&&distance2(start,shared.start)<=this.cellSize*this.cellSize*9){
    for(var join=shared.points.length-1;join>=0;join--)if(this.segmentClear(start,shared.points[join],r)){
      this.lastSearch.shared=true;
      return {points:[start].concat(shared.points.slice(join)),goal:shared.goal,reached:false,partial:true,escape:null};
    }
  }
  var cache=this._cache(r);
  var bridges=this._passageBridges(cache);
  if(!startFree) {
    var escaped=this._escape(start,cache,requestedGoal);if(!escaped)return null;
    escape={from:start,to:escaped,distance:distance(start,escaped)};start=escaped;
    if(goalFree&&this.segmentClear(start,requestedGoal,r)){this.lastSearch.direct=true;return {points:distance2(start,requestedGoal)<EPS?[start]:[start,requestedGoal],goal:requestedGoal,reached:true,escape:escape};}
  }
  var starts=this._anchors(start,cache);if(!starts.length)return null;
  var goalAnchors=goalFree?this._anchors(requestedGoal,cache):[],goalIds=new Set(),target=requestedGoal;
  if(goalFree&&!goalAnchors.length&&!allowPartial)return null;
  goalAnchors.forEach(function(candidate){goalIds.add(candidate.id);});
  var projectedId=goalFree?-1:this._projectGoal(requestedGoal,cache,start);
  if(!goalFree){if(projectedId<0&&!allowPartial)return null;if(projectedId>=0){target=this._center(projectedId);goalIds.add(projectedId);}}
  var serial=++cache.serial;if(serial>=4294967295){cache.seen.fill(0);cache.closed.fill(0);cache.serial=serial=1;}
  var heap=new Heap(),found=-1,bestCost=Infinity,bestReachable=-1,bestDistance=Infinity,frontier=-1,frontierDistance=Infinity;
  starts.forEach(function(candidate){var g=Math.sqrt(candidate.d2);cache.seen[candidate.id]=serial;cache.g[candidate.id]=g;cache.parent[candidate.id]=-1;cache.parentBridges.delete(candidate.id);heap.push({id:candidate.id,g:g,f:g+distance(candidate.point,target)});});
  while(heap.items.length) {
    var item=heap.pop(),currentId=item.id;
    if(item.f>=bestCost-EPS)break;
    if(cache.closed[currentId]===serial||cache.seen[currentId]!==serial||item.g!==cache.g[currentId])continue;
    cache.closed[currentId]=serial;this.lastSearch.expanded++;
    var current=this._center(currentId),goalDistance=distance2(current,requestedGoal);
    if(goalDistance<frontierDistance-EPS){frontierDistance=goalDistance;frontier=currentId;}
    if(goalDistance<bestDistance-EPS&&(goalFree||this._escapeClear(requestedGoal,current,r,true))){bestDistance=goalDistance;bestReachable=currentId;}
    if(goalIds.has(currentId)) {
      var completeCost=item.g+(goalFree?Math.sqrt(goalDistance):0);
      if(completeCost<bestCost){bestCost=completeCost;found=currentId;}
      continue;
    }
    for(var direction=0;direction<8;direction++)if(this._edge(cache,currentId,direction)) {
      var delta=DIRECTIONS[direction],nextId=currentId+delta[1]*this.columns+delta[0];
      if(cache.closed[nextId]===serial)continue;
      var next=this._center(nextId),nextG=item.g+distance(current,next);
      if(cache.seen[nextId]!==serial||nextG<cache.g[nextId]-EPS){cache.seen[nextId]=serial;cache.g[nextId]=nextG;cache.parent[nextId]=currentId;cache.parentBridges.delete(nextId);heap.push({id:nextId,g:nextG,f:nextG+distance(next,target)});}
    }
    (bridges.get(currentId)||[]).forEach(function(bridge){
      var nextId=bridge.id;if(cache.closed[nextId]===serial)return;
      var nextG=item.g+bridge.cost;
      if(cache.seen[nextId]!==serial||nextG<cache.g[nextId]-EPS){cache.seen[nextId]=serial;cache.g[nextId]=nextG;cache.parent[nextId]=currentId;cache.parentBridges.set(nextId,{serial:serial,points:bridge.points});heap.push({id:nextId,g:nextG,f:nextG+distance(self._center(nextId),target)});}
    });
  }
  // For a blocked target, select its closest cell in the start's reachable
  // component if the globally closest boundary cell lies across another wall.
  if(found<0&&!goalFree)found=bestReachable;
  var partial=found<0&&!!allowPartial;
  if(partial)found=frontier;
  if(found<0)return null;
  var reversed=[],cursor=found,guard=0;
  while(cursor>=0&&guard++<=this.count){reversed.push(this._center(cursor));var bridge=cache.parentBridges.get(cursor);if(bridge&&bridge.serial===serial)for(var p=bridge.points.length-2;p>0;p--)reversed.push(bridge.points[p]);cursor=cache.parent[cursor];}
  if(guard>this.count)return null;
  reversed.reverse();var points=[start];
  reversed.forEach(function(p){if(distance2(points[points.length-1],p)>EPS)points.push(p);});
  var goal=goalFree&&!partial?requestedGoal:this._center(found);
  if(distance2(points[points.length-1],goal)>EPS)points.push(goal);
  var result={points:this._smooth(points,r),goal:goal,reached:goalFree&&!partial,partial:partial,escape:escape};
  if(partial&&sharedKey&&!escape){
    if(!this._partialRoutes)this._partialRoutes=new Map();
    if(this._partialRoutes.size>=32)this._partialRoutes.delete(this._partialRoutes.keys().next().value);
    this._partialRoutes.set(sharedKey,{start:start,points:result.points,goal:goal});
  }
  return result;
};

exports.NavigationGrid=NavigationGrid;
