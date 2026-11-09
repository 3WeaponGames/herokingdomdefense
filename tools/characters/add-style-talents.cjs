'use strict';
const fs=require('node:fs'),path=require('node:path'),Weapons=require('../../assets/_script/HeroWeapons'),Document=require('../../packages/game-data-editor/lib/json-document'),Tx=require('../../packages/hkd-characters/lib/asset-transaction');
function plan(root){
 const relative='assets/KinghtFallConfig/GameJsonCfg.json',file=path.join(root,relative),before=fs.readFileSync(file),original=JSON.parse(before),next=JSON.parse(before),levels=[3,4,6,7,8,9,11,12,13],stats=['damage','speed','health'],names={damage:'Damage',speed:'Attack speed',health:'Health'},icons={damage:'soldier-damage',speed:'soldier-attack-speed',health:'soldier-health'};
 levels.forEach((level,index)=>{
  const pair=index%3,stat=stats[Math.floor(index/3)],center=next.TalentLevelCfg.find(row=>row.Level===level&&!row.OptionalBranch);
  for(let side=0;side<2;side++){
   const style=Weapons.styles[pair*2+side],id=10001+index*2+side,kindID=101001+index*2+side;
   if(next.TalentLevelCfg.some(row=>row.ID===id&&!row.OptionalBranch))throw Error('Talent ID already exists: '+id);
   next.TalentCfg[kindID]={...(next.TalentCfg[kindID]||{}),enumValue:kindID,enumKey:'Hero_'+style.id+'_'+stat,Name:style.name+' · '+names[stat],Describe:style.name+' '+names[stat].toLowerCase()+' +{0}. Applies only while '+style.name+' is equipped.',Image:'@icon/Stats Icons/hero-'+style.id+'-'+stat};
   const row={ID:id,Level:level,kindID,GoldCost:center.GoldCost,EffectNumber:[.05],vaulePercentage:[1],OptionalBranch:true,HeroStyle:style.id,HeroStat:stat,BranchColumn:side===0?-1:1};
   const at=next.TalentLevelCfg.findIndex(row=>row.ID===id);if(at<0)next.TalentLevelCfg.push(row);else next.TalentLevelCfg[at]={...next.TalentLevelCfg[at],...row};
  }
 });
 return {files:new Map([[relative,Document.patch(before.toString('utf8'),original,next)]]),reads:new Map([[file,before]])};
}
function generate(root){const result=plan(root);return Tx.commit(root,result.files,result.reads,'assets/KinghtFallConfig/GameJsonCfg.json');}
module.exports={plan,generate};if(require.main===module)console.log(generate(path.resolve(__dirname,'../..')));
