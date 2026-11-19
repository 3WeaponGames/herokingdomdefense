'use strict';
const Blocker=require('./blocker-data'),Units=require('../lib/unit-assets');
function describe(service,request){
 const config=service.previewConfig('A'),family=require('./scale-group').family(config,request),result=Blocker.describe(service,request),hero=Units.describe(service.root,{type:'hero',noShared:true,battleSpace:true,documents:{A:{data:config}}});
 const layers=hero.layers.map(layer=>({...layer,animation:'idle'}));
 const images=Object.assign({},result.images),Scale=require('../../../assets/_script/BuildingWorldScale'),tiers=family.branches.slice().sort((a,b)=>a.level-b.level||a.position-b.position).map(branch=>{
  const Parts=require('../../../assets/_script/BuildingPartScale'),tier={position:branch.position,index:branch.index,level:branch.level,worldScale:Scale.value(branch.record),parts:Parts.available(branch.record).map(p=>Object.assign({},p,{value:Parts.value(branch.record,p.key)}))};
  if(request.allTiers){const preview=branch.position===request.levelIndex?result:Blocker.describe(service,Object.assign({},request,{levelIndex:branch.position}));tier.record=preview.record;Object.assign(images,preview.images);}
  return tier;
 });
 return {record:result.record,worldScale:result.worldScale,images,runtimePath:result.runtimePath||Units.enginePath(),hero:layers,tiers,familyRoot:family.rootIndex};
}
module.exports={describe};
