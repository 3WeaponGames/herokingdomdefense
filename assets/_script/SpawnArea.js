"use strict";
// Missing/zero radius preserves the original point spawn and RNG sequence.
function sample(center,radius,random,walkable) {
  if(!center||typeof center.x!=="number"||typeof center.y!=="number"||!isFinite(center.x)||!isFinite(center.y)||typeof radius!=="number"||!isFinite(radius)||radius<0)return null;
  if(!(radius>0))return {x:center.x,y:center.y};
  random=random||Math.random;walkable=walkable||function(){return true;};
  for(var i=0;i<64;i++){var angle=random()*Math.PI*2,r=Math.sqrt(random())*radius,p={x:center.x+Math.cos(angle)*r,y:center.y+Math.sin(angle)*r};if(isFinite(p.x)&&isFinite(p.y)&&walkable(p))return p;}
  for(var j=0;j<256;j++){var a=j*2.399963229728653,d=radius*Math.sqrt((j+.5)/256),q={x:center.x+Math.cos(a)*d,y:center.y+Math.sin(a)*d};if(isFinite(q.x)&&isFinite(q.y)&&walkable(q))return q;}
  return walkable(center)?{x:center.x,y:center.y}:null;
}
function spread(points,start,center,width,random,walkable,clear) {
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
    for(var step=0;step<12;step++){var factor=Math.pow(.65,step),candidate={x:p.x-dy/l*offset*factor,y:p.y+dx/l*offset*factor};if((!walkable||walkable(candidate))&&(!clear||clear(p,candidate)))return candidate;}
    return {x:p.x,y:p.y};
  });
}
function spawnRadius(game,spawnId) {
  var holder=game.ndPath.getChildByName('Authored routes'),paths=holder&&holder.getComponent('AuthoredStagePaths'),spec=paths&&paths.spawnSpec(spawnId);
  if(spec&&spec.radius!==undefined)return spec.radius;
  var node=game.ndPath.getChildByName('ndEnemy'+spawnId),area=node&&node.getComponent&&node.getComponent('SpawnPointArea');return area?area.radius:0;
}
function prepare(unit,game,spawnId,collides) {
  var radius=spawnRadius(game,spawnId);if(!(radius>0))return;
  var Navigation=require('KinghtFallNavigation'),center=Navigation.positionOf(game.ndPath.getChildByName('ndEnemy'+spawnId),game);
  // Terrain forbids entry, not exit. A spawn inside a blocker is a valid actor;
  // shared navigation moves it out just like knockback or skill displacement.
  var start=sample(center,radius,Math.random);
  return start?{center:center,start:start}:null;
}
function apply(unit,game,spawnId,prepared) {
  var radius=spawnRadius(game,spawnId),route=unit.bornInfo&&unit.bornInfo.pathList,override=route&&route.routeSpread;
  if(!(radius>0)&&!(override>0))return true;
  var Navigation=require('KinghtFallNavigation'),node=game.ndPath.getChildByName('ndEnemy'+spawnId),center=prepared?prepared.center:Navigation.positionOf(node,game),collides=!unit.rigidBody||unit.rigidBody.active!==false,navigation,body=0;
  if(collides){navigation=Navigation.get(game);navigation.refresh();body=navigation.radius(unit);}
  var walkable=function(p){return !collides||navigation.grid.isWalkable(p,body);},start=prepared?prepared.start:sample(center,radius,Math.random);
  if(!start)return false;
  unit.node.setPosition(start.x,start.y);
  var width=override===undefined?radius:override;
  if(route&&route.length&&width>0){
    var points=route.map(function(n){return Navigation.positionOf(n,game);}),shifted=spread(points,start,center,width,Math.random,walkable,function(a,b){return !collides||navigation.grid.segmentClear(a,b,body);});
    unit.bornInfo.pathList=shifted.map(function(p){return {position:p,_authoredSpread:true,convertToWorldSpaceAR:function(offset){return game.ndMain.convertToWorldSpaceAR(cc.v2(p.x+(offset&&offset.x||0),p.y+(offset&&offset.y||0)));}};});
  }
  Navigation.reset(unit);if(collides)Navigation.prepareTerrainExit(unit,game);return true;
}
exports.prepare=prepare;exports.sample=sample;exports.spread=spread;exports.apply=apply;exports.radius=spawnRadius;
