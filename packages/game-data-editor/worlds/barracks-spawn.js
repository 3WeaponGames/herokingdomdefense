'use strict';
// Read-only stage marker geometry. Stage overrides use the unscaled building
// frame so a chosen stage exit stays fixed when its barracks tier changes.
const Maps=require('../lib/map-assets'),Positions=require('../../../assets/_script/BuildingSpawnPositions'),Scale=require('../../../assets/_script/BuildingWorldScale'),Offset=require('../../../assets/_script/BuildingModelOffset');
const own=(value,key)=>Object.prototype.hasOwnProperty.call(value,key),clone=value=>JSON.parse(JSON.stringify(value));
function placement(building){const angle=(building.angle||0)*Math.PI/180,scale=building.scale===undefined?1:building.scale,c=Math.cos(angle)*scale,s=Math.sin(angle)*scale;return[c,s,-s,c,building.x||0,building.y||0];}
function checked(value){if(!Positions.point(value))throw Error('Squad spawn position needs finite X/Y offsets between -10,000 and 10,000.');return clone(value);}
function project(building,record){
 if(!building||building.kind!==3||!record)return null;
 const inherited=!own(building,'spawnPosition'),local=checked(inherited?record.local:building.spawnPosition),matrix=Maps.multiply(placement(building),record.matrix);
 return{position:Maps.point(matrix,local),local,matrix,inherited};
}
function toLocal(descriptor,world){
 if(!descriptor||!world||!Number.isFinite(world.x)||!Number.isFinite(world.y))throw Error('Choose a finite squad spawn position.');
 return checked(Maps.point(Maps.inverse(descriptor.matrix),world));
}
function describe(building,source,config,hall,model){
 if(!building||building.kind!==3||!source)return null;
 const info=model||Maps.model(source),owner=info.byId[building.template.node];if(!owner)return null;
 const component=owner.components.find(c=>c.value.ndBotnNodeList),category=config&&config.BuildEnum&&config.BuildEnum[3],rows=category&&category.levelList||[];
 const row=Number.isInteger(building.previewBranch)?rows.find(row=>row.index===building.previewBranch):category&&Array.isArray(category.InitialChoices)?category.InitialChoices.map(index=>rows.find(row=>row.index===index&&row.level===1)).find(Boolean):rows[0];
 const factor=Scale.value(row),offset=Offset.value(row),matrix=[owner.world[0],owner.world[1],owner.world[2],owner.world[3],0,0];
 let local=Positions.anchor(row);
 if(local)local=Object.assign({},local,{x:factor*(local.x+offset.x),y:factor*(local.y+offset.y)});
 else{
  const ref=component&&component.value.ndBotnNodeList,node=ref&&info.byId[ref.__id__];if(!node)return null;
  let child=false;for(let parent=node;parent;parent=info.byId[parent.parent])if(parent.id===owner.id){child=true;break;}
  // Legacy sibling markers stay where their authored family puts them; child
  // markers follow the resized building. A first override must match either.
  local=child?Maps.point(Maps.inverse(owner.world),node.position):Maps.point(Maps.inverse(matrix),{x:node.position.x-owner.position.x,y:node.position.y-owner.position.y});
  if(child)local={x:factor*(local.x+offset.x),y:factor*(local.y+offset.y)};
 }
 const record={local:checked(local),matrix};
 return project(building,record);
}
module.exports={describe,project,toLocal};
