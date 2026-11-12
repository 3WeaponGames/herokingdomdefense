'use strict';
const fs=require('fs'),path=require('path'),Blocker=require('./blocker-data'),Units=require('../lib/unit-assets'),Maps=require('../lib/map-assets');
function describe(service,request){
 const result=Blocker.describe(service,request),hero=Units.describe(service.root,{type:'hero',noShared:true,documents:{A:{data:service.previewConfig('A')}}});
 const source=JSON.parse(fs.readFileSync(path.join(service.root,'assets/KinghtFallEnemyAni/ndPlay.prefab'),'utf8')),model=Maps.model(source);
 const gameSource=JSON.parse(fs.readFileSync(path.join(service.root,'assets/KinghtFallPrefabs/game/KinghtFallUIGame.prefab'),'utf8')),game=Maps.model(gameSource),controller=gameSource.find(c=>c.ctrPlayAni&&c.ndAgg),ground=controller&&game.byId[controller.node.__id__];
 if(!ground)throw Error('The gameplay hero reference is missing.');
 const basis=Maps.transform(ground.source);basis[4]=basis[5]=0;const relativeToGround=Maps.multiply(basis,Maps.inverse(ground.world));
 const layers=hero.layers.map(layer=>{
  const node=model.nodes.find(n=>n.name===layer.name),native=game.nodes.find(n=>n.name===layer.name);if(!node||!native)throw Error('Missing gameplay hero layer '+layer.name);
  // UIGame applies an instance scale to ndPlay. Unit-preview fit transforms
  // cannot calibrate a world-size reference; use the actual gameplay instance.
  const m=Maps.multiply(Maps.multiply(relativeToGround,native.world),Maps.inverse(Maps.transform(node.source))),angle=(layer.rotation||0)*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle),local=[c*layer.scaleX,s*layer.scaleX,-s*layer.scaleY,c*layer.scaleY,layer.x,layer.y],pose=Maps.multiply(m,local),sx=Math.hypot(pose[0],pose[1]);
  return Object.assign({},layer,{x:pose[4],y:pose[5],scaleX:sx,scaleY:sx?(pose[0]*pose[3]-pose[1]*pose[2])/sx:0,rotation:Math.atan2(pose[1],pose[0])*180/Math.PI,animation:'idle'});
 });
 return {record:result.record,worldScale:result.worldScale,images:result.images,runtimePath:result.runtimePath||Units.enginePath(),hero:layers};
}
module.exports={describe};
