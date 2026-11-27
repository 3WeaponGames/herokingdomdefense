"use strict";
function validSample(center,radius) {
  return center&&typeof center.x==="number"&&typeof center.y==="number"&&isFinite(center.x)&&isFinite(center.y)&&typeof radius==="number"&&isFinite(radius)&&radius>=0;
}
// Missing/zero radius preserves the original point spawn and RNG sequence.
function sample(center,radius,random,walkable) {
  if(!validSample(center,radius))return null;
  if(!(radius>0))return {x:center.x,y:center.y};
  random=random||Math.random;walkable=walkable||function(){return true;};
  for(var i=0;i<64;i++){var angle=random()*Math.PI*2,r=Math.sqrt(random())*radius,p={x:center.x+Math.cos(angle)*r,y:center.y+Math.sin(angle)*r};if(isFinite(p.x)&&isFinite(p.y)&&walkable(p))return p;}
  for(var j=0;j<256;j++){var a=j*2.399963229728653,d=radius*Math.sqrt((j+.5)/256),q={x:center.x+Math.cos(a)*d,y:center.y+Math.sin(a)*d};if(isFinite(q.x)&&isFinite(q.y)&&walkable(q))return q;}
  return walkable(center)?{x:center.x,y:center.y}:null;
}
function bodyBounds(bounds,body) {
  var x=(bounds.minX+bounds.maxX)/2,y=(bounds.minY+bounds.maxY)/2;
  return {minX:Math.min(bounds.minX+body,x),maxX:Math.max(bounds.maxX-body,x),minY:Math.min(bounds.minY+body,y),maxY:Math.max(bounds.maxY-body,y)};
}
function clamp(point,bounds) { return {x:Math.max(bounds.minX,Math.min(bounds.maxX,point.x)),y:Math.max(bounds.minY,Math.min(bounds.maxY,point.y))}; }
function mapBounds(size) { return size&&isFinite(size.width)&&size.width>0&&isFinite(size.height)&&size.height>0?{minX:-size.width/2,maxX:size.width/2,minY:-size.height/2,maxY:size.height/2}:null; }
function inside(point,bounds) { return !bounds||point.x>=bounds.minX&&point.x<=bounds.maxX&&point.y>=bounds.minY&&point.y<=bounds.maxY; }
function sampleInBounds(center,radius,random,bounds,body) {
  var limits=bodyBounds(bounds,body||0),start=sample(center,radius,random,function(p){return inside(p,limits);});
  if(start&&inside(start,limits))return start;
  if(!validSample(center,radius))return null;
  // A narrow circle/map intersection can miss every bounded sample. Its
  // nearest point is still in the disk; a wholly off-map circle uses the same
  // nearest in-map fallback so an authored wave never loses an enemy.
  return clamp(center,limits);
}
var clearSpawnFallbacks = new WeakMap();
function clearSpawnFallback(grid,center,radius,body,projectOutside) {
  var cached=clearSpawnFallbacks.get(grid);
  if(!cached)clearSpawnFallbacks.set(grid,cached=new Map());
  var key=center.x+":"+center.y+":"+radius+":"+body+":"+projectOutside;
  if(cached.has(key))return cached.get(key);
  var start=(radius>0&&grid.nearestSpawnPoint(center,body,radius))||(projectOutside?grid.nearestSpawnPoint(center,body):null);
  if(cached.size>=128)cached.delete(cached.keys().next().value);
  cached.set(key,start);
  return start;
}
function sampleClear(grid,center,radius,body,projectOutside) {
  if(!validSample(center,radius))return null;
  var limits=bodyBounds(grid.bounds,body),first;
  var start=sample(center,radius,Math.random,function(p){
    if(!inside(p,limits))return false;
    if(!first)first=p;
    return grid.isWalkable(p,body);
  });
  if(start&&inside(start,limits)&&(radius>0||grid.isWalkable(start,body)))return start;
  // A fully sealed map still gets its scheduled enemy and controlled egress
  // if geometry later opens. No extra RNG is needed for the fallback.
  return clearSpawnFallback(grid,center,radius,body,projectOutside)||first||clamp(center,limits);
}
function spread(points,start,center,width,random,walkable,clear,anchorWalkable) {
  if(typeof width!=="number"||!isFinite(width)||!(width>0)||!points.length||!start||!center||!isFinite(start.x)||!isFinite(start.y)||!isFinite(center.x)||!isFinite(center.y))return points.map(function(p){return {x:p.x,y:p.y};});
  var direction={x:points[0].x-center.x,y:points[0].y-center.y};
  if(Math.hypot(direction.x,direction.y)<.001&&points.length>1)direction={x:points[1].x-points[0].x,y:points[1].y-points[0].y};
  var length=Math.hypot(direction.x,direction.y)||1,nx=-direction.y/length,ny=direction.x/length;
  var offset=(start.x-center.x)*nx+(start.y-center.y)*ny;
  if(Math.hypot(start.x-center.x,start.y-center.y)<.001)offset=((random||Math.random)()*2-1)*width;
  offset=Math.max(-width,Math.min(width,offset));
  if(Math.abs(offset)<1e-8)return points.map(function(p){return {x:p.x,y:p.y};});
  return points.map(function(p,index){
    if(index===points.length-1)return {x:p.x,y:p.y};
    var previous=index?points[index-1]:center,next=points[index+1]||p,dx=next.x-previous.x,dy=next.y-previous.y,l=Math.hypot(dx,dy);
    if(!l)return {x:p.x,y:p.y};
    for(var step=0;step<12;step++){
      var factor=Math.pow(.65,step),candidate={x:p.x-dy/l*offset*factor,y:p.y+dx/l*offset*factor};
      if((!walkable||walkable(candidate))&&(!clear||clear(p,candidate)))return candidate;
      // Check the anchor only once a full offset fails. A blocked start
      // cannot have a clear segment to any of the smaller offsets.
      if(step===0&&anchorWalkable&&!anchorWalkable(p))break;
    }
    return {x:p.x,y:p.y};
  });
}
function authoredSpawn(game,spawnId) {
  var holder=game.ndPath.getChildByName('Authored routes'),paths=holder&&holder.getComponent('AuthoredStagePaths');
  return paths&&paths.spawnSpec(spawnId)||null;
}
function spawnRadius(game,spawnId,spec) {
  if(spec===undefined)spec=authoredSpawn(game,spawnId);
  if(spec&&spec.radius!==undefined)return spec.radius;
  var node=game.ndPath.getChildByName('ndEnemy'+spawnId),area=node&&node.getComponent&&node.getComponent('SpawnPointArea');return area?area.radius:0;
}
function prepare(unit,game,spawnId,collides,cfg) {
  var spec=authoredSpawn(game,spawnId),radius=spawnRadius(game,spawnId,spec)||0,bounds=mapBounds(game.mapSize);if(!(radius>0)&&!bounds)return;
  var Navigation=require('KinghtFallNavigation'),center=Navigation.positionOf(game.ndPath.getChildByName('ndEnemy'+spawnId),game);
  var navigation,start,flightUnit=cfg?{cfg:cfg,navigationTeam:unit.navigationTeam}:unit;
  var flight=Navigation.usesFlightGrid(flightUnit);
  if(!flight&&!(radius>0)&&inside(center,bounds))return;
  if(flight){
    navigation=Navigation.get(game);
    start=sampleClear(navigation.gridFor(flightUnit),center,radius,navigation.radius(unit,true),true);
  }else if(collides){
    navigation=Navigation.get(game);navigation.refresh();
    // Measure the pooled body before activation. Keep the enemy in its
    // authored area, with controlled egress available if the whole disk is blocked.
    var body=navigation.radius(unit,true);
    start=spec&&radius>0?sampleClear(navigation.mapGrid(),center,radius,body,false):
      sampleInBounds(center,radius,Math.random,navigation.grid.bounds,body);
  }else start=bounds?sampleInBounds(center,radius,Math.random,bounds,0):sample(center,radius,Math.random);
  return start?{center:center,start:start}:null;
}
function apply(unit,game,spawnId,prepared) {
  var spec=authoredSpawn(game,spawnId),radius=spawnRadius(game,spawnId,spec)||0,route=unit.bornInfo&&unit.bornInfo.pathList,override=route&&route.routeSpread,bounds=mapBounds(game.mapSize);
  if(!(radius>0)&&!(override>0)&&!prepared&&!bounds)return true;
  var Navigation=require('KinghtFallNavigation'),node=game.ndPath.getChildByName('ndEnemy'+spawnId),center=prepared?prepared.center:Navigation.positionOf(node,game),collides=!unit.rigidBody||unit.rigidBody.active!==false,navigation,grid,body=0;
  var flight=Navigation.usesFlightGrid(unit);
  if(!flight&&!(radius>0)&&!(override>0)&&!prepared&&inside(center,bounds))return true;
  if(flight||collides){
    navigation=Navigation.get(game);navigation.refresh();
    grid=flight?navigation.gridFor(unit):navigation.grid;
    body=navigation.radius(unit,flight);bounds=grid.bounds;
  }
  var walkable=grid?function(p){return grid.isWalkable(p,body);}:null;
  var start=prepared?prepared.start:flight?sampleClear(grid,center,radius,body,true):
    collides&&spec&&radius>0?sampleClear(navigation.mapGrid(),center,radius,body,false):
      bounds?sampleInBounds(center,radius,Math.random,bounds,body):sample(center,radius,Math.random);
  if(!start)return false;
  if(flight&&prepared&&!walkable(start))start=clearSpawnFallback(grid,center,radius,body,true)||start;
  if(bounds)start=clamp(start,bodyBounds(bounds,body));
  unit.node.setPosition(start.x,start.y);
  var width=override===undefined?radius:override;
  if(route&&route.length&&width>0){
    // The segment test also checks both endpoints and their body bounds.
    var inBounds=!grid&&bounds?function(p){return inside(p,bounds);}:null;
    var clear=grid?function(a,b){return grid.segmentClear(a,b,body);}:null;
    var points=route.map(function(n){return Navigation.positionOf(n,game);}),shifted=spread(points,start,center,width,Math.random,inBounds,clear,walkable);
    unit.bornInfo.pathList=shifted.map(function(p){return {position:p,_authoredSpread:true,convertToWorldSpaceAR:function(offset){return game.ndMain.convertToWorldSpaceAR(cc.v2(p.x+(offset&&offset.x||0),p.y+(offset&&offset.y||0)));}};});
  }
  Navigation.reset(unit);if(collides)Navigation.prepareTerrainExit(unit,game,false,body);return true;
}
exports.prepare=prepare;exports.sample=sample;exports.sampleInBounds=sampleInBounds;exports.spread=spread;exports.apply=apply;exports.radius=spawnRadius;exports.mapBounds=mapBounds;
