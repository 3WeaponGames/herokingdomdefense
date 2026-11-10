'use strict';
const path=require('path'),M=require('./model'),L=require('./legacy'),Maps=require('../lib/map-assets'),GateSource=require('./gate-facing');

function colliderIndex(building,hall,config){
 const definition=config&&config.BuildEnum&&config.BuildEnum[building.kind],rows=definition&&definition.levelList||[];
 let row=rows[0];
 if(building.kind===1){
  row=rows.find(row=>row.level===hall);
 }else if(definition&&Array.isArray(definition.InitialChoices)){
  row=definition.InitialChoices.map(index=>rows.find(row=>row.index===index&&row.level===1)).find(Boolean);
 }
 const index=row?row.index:building.kind===1?hall:1,override=row&&row.ColliderIndex;
 // Navigation previews assume eligible buildings are built, using the first
 // offered branch. The serialized prefab may have every level disabled (or
 // enabled); runtime setLevel selects the matching collider tag explicitly.
 return building.kind!==6&&Number.isInteger(override)&&override>0?override:index;
}
function buildingPolygons(service,stage,building,hall,gate,config,sourceModels){
 const source=GateSource.project(stage.templates&&stage.templates[building.template.prefab]||service.source(building.template.prefab),building),ids=new Set();
 let info=sourceModels.get(source);if(!info){info=Maps.model(source);sourceModels.set(source,info);}
 building.template.roots.forEach(root=>L.descendants(source,root,ids));
 const owner=info.byId[building.template.node];if(!owner)throw Error('A building source was removed. Refresh its template.');
 const component=owner.components.find(c=>c.value.ndAniMain&&Number.isInteger(c.value.ID)),controlled=new Set([owner.id]);
 for(const reference of component&&component.value.ndAniOther||[]){
  const part=source[reference.__id__],node=part&&part.__type__==='cc.Node'?reference.__id__:part&&part.node&&part.node.__id__;
  if(node!==undefined)controlled.add(node);
 }
 const tag=colliderIndex(building,hall,config),origin=owner.position;
 return info.colliders.filter(c=>{
  if(!ids.has(c.node)||c.sensor)return false;
  // Opening the leaf does not remove the fixed wings beside its passage.
  if(building.kind===6&&gate==='open'&&c.node===owner.id&&c.type==='cc.PhysicsPolygonCollider')return false;
  // BuildBase changes polygon fixtures only; boxes/circles keep their static
  // enabled state even when attached directly to a level-controlled node.
  return controlled.has(c.node)&&c.type==='cc.PhysicsPolygonCollider'?Number(c.source.tag)===tag:c.active;
 }).map(c=>c.points.map(p=>M.toWorld(building,{x:p.x-origin.x,y:p.y-origin.y})));
}
function preview(service,request){
 const stage=service.doc(request.key).data,map=service.loadMap(stage.mapId).data,spawn=stage.spawns.find(s=>s.id===request.spawnId&&s.enabled!==false);
 if(!spawn)throw Error('Select an enabled spawn');
 for(const graph of stage.graphs.filter(graph=>graph.spawnIds.includes(spawn.id))){const issues=M.graphIdentifierIssues(graph);if(issues.length)throw Error(issues.join('\n'));}
 if(request.graphId){const selected=stage.graphs.find(graph=>graph.id===request.graphId);if(!selected||!selected.spawnIds.includes(spawn.id))throw Error('Choose a path assigned to the selected spawn.');}
 const hall=request.hall===undefined?3:request.hall,radius=request.radius===undefined?18:request.radius,gate=request.gate||'closed';
 if(!Number.isInteger(hall)||hall<1||hall>3)throw Error('Choose main hall level 1, 2 or 3.');
 if(!Number.isFinite(radius)||radius<0)throw Error('Unit radius must be finite and non-negative.');
 if(!['closed','open'].includes(gate))throw Error('Choose an open or closed gate.');
 const Grid=require(path.join(service.root,'assets/_script/NavigationGrid')).NavigationGrid,polygons=M.blockerPolygons(map).map(p=>p.points);
 if(!M.hasGlobalBlockers(map))for(const layer of map.layers)if(!layer.hidden)for(const object of layer.objects)for(const shape of object.polygons||[])polygons.push(shape.map(p=>M.toWorld(layer.transform,M.toWorld(object,{x:object.flipX?-p.x:p.x,y:p.y}))));
 const documents=typeof service.index==='function'?service.index().documents:null,variant=documents&&documents[stage.variant||'A'],config=variant&&variant.BuildEnum?variant:documents&&documents.A,buildings=stage.buildings.filter(b=>b.enabled!==false&&(b.kind===1||(b.unlock||1)<=hall));
 const sourceModels=new Map();
 for(const building of buildings)polygons.push(...buildingPolygons(service,stage,building,hall,gate,config,sourceModels));
 const route=require(path.join(service.root,'assets/_script/AuthoredSpawnPlan')).route(stage.graphs,spawn.id,buildings.map(b=>b.id),request.graphId||null,()=>.25);
 if(!route.length)throw Error('No valid approach is available. Check its graph and conditions.');
 const bounds={minX:-map.size.width/2,minY:-map.size.height/2,maxX:map.size.width/2,maxY:map.size.height/2},grid=new Grid(polygons,bounds,20),points=[{x:spawn.x,y:spawn.y}];
 let start=spawn,frontier=false;
 for(const goal of route){
  const result=grid.findPath(start,goal,radius,true),segment=!result?[]:Array.isArray(result)?result:result.points||result.path||[];
  for(const point of segment){const previous=points[points.length-1];if(!previous||previous.x!==point.x||previous.y!==point.y)points.push(point);}
  if(!segment.length||result.partial){frontier=true;break;}
  // The runtime permits a safe projection when an authored node lies on a
  // collider. Continue from that reached point, never from inside the obstacle.
  start=segment[segment.length-1];
 }
 const fallback=!!(request.graphId&&route[0]&&route[0].graphId!==request.graphId),message=(fallback?'The selected conditional path is unavailable; showing its fallback. ':'')+(frontier?'Approach reaches an obstacle frontier. Closed gates may be attacked here.':'Approach reaches the authored goal.');
 return {points,message,frontier,polygons:polygons.length,fallback};
}
module.exports={preview,buildingPolygons,colliderIndex};
