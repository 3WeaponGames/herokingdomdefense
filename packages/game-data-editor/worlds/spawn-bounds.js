'use strict';
const Area=require('../../../assets/_script/SpawnArea');
function bounds(map){return Area.mapBounds(map&&map.size);}
function maxRadius(spawn,map){const b=bounds(map);return b?Math.max(0,Math.min(1500,spawn.x-b.minX,b.maxX-spawn.x,spawn.y-b.minY,b.maxY-spawn.y)):1500;}
function constrain(spawn,map,resize){
 const b=bounds(map);if(!b||!spawn||!Number.isFinite(spawn.x)||!Number.isFinite(spawn.y))return spawn;
 let radius=spawn.radius===undefined?0:spawn.radius;if(!Number.isFinite(radius)||radius<0)return spawn;
 radius=Math.min(1500,radius,(b.maxX-b.minX)/2,(b.maxY-b.minY)/2);
 if(resize){spawn.x=Math.max(b.minX,Math.min(b.maxX,spawn.x));spawn.y=Math.max(b.minY,Math.min(b.maxY,spawn.y));radius=Math.min(radius,maxRadius(spawn,map));}
 else{spawn.x=Math.max(b.minX+radius,Math.min(b.maxX-radius,spawn.x));spawn.y=Math.max(b.minY+radius,Math.min(b.maxY-radius,spawn.y));}
 if(spawn.radius!==undefined||radius>0)spawn.radius=radius;
 return spawn;
}
function edited(stage,before,map){
 const old=new Map((before.spawns||[]).map(s=>[s.id,s]));
 for(const spawn of stage.spawns||[]){const previous=old.get(spawn.id),moved=!previous||spawn.x!==previous.x||spawn.y!==previous.y;if(moved||spawn.radius!==previous.radius)constrain(spawn,map,!moved);}
 return stage;
}
module.exports={bounds,maxRadius,constrain,edited};
