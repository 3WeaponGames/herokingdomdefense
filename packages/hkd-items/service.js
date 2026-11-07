'use strict';
const fs=require('fs'),path=require('path'),{Service}=require('../hkd-characters/lib/service'),Units=require('../game-data-editor/lib/unit-assets');
const ROLES={1:'Cape',2:'Helmet',3:'Arrow',4:'Bow',5:'Gloves',6:'Mount'},LAYERS={1:'wqyl_lead_doupeng',2:'wqyl_lead_tou',3:'wqyl_lead_jian',4:'wqyl_lead_gong',5:'wqyl_lead_shou',6:'wqyl_lead_ma'};
class ItemsService extends Service{
  constructor(root){super(root,{file:'assets/resources/hero-items/catalog.json'});}
  equipment(){return JSON.parse(fs.readFileSync(path.join(this.root,'assets/KinghtFallConfig/GameJsonCfg.json'),'utf8')).EquipCfg;}
  units(){
    const entries=JSON.parse(fs.readFileSync(path.join(this.root,'assets/resources/localization/catalog.json'),'utf8')).entries;
    const label=v=>String(v||'').replace(/\[\[loc:([^\]]+)\]\]/g,(m,key)=>entries[key]&&entries[key].en||m);
    return this.equipment().reduce((all,gear)=>all.concat(gear.levelInfo.map(level=>({type:'item',id:gear.id+':'+level.Level,key:gear.id+':'+level.Level,group:ROLES[gear.id],name:label(level.EquipName)+' · Lv '+level.Level,slot:gear.id,level:level.Level,skin:level.EquipSkin,value:level.Parameters,cost:level.GoldCost}))),[]);
  }
  describe(base,noRuntime){
    const item=this.units().find(u=>u.id===String(base.id)&&base.type==='item');if(!item)throw Error('Choose an existing hero equipment tier.');
    const result=Units.describe(this.root,{type:'hero',id:'hero',heroLevels:{[item.slot]:item.level},noRuntime:!!noRuntime});
    result.defaultLayer=result.layers.find(l=>l.name===LAYERS[item.slot]).uuid;result.item=item;return result;
  }
  validate(data){super.validate(data);for(const p of Object.values(data.profiles))if(p.scale!==undefined&&p.scale!==1)throw Error('Adjust individual item parts; hero item looks do not resize the whole hero.');return true;}
}
module.exports={ItemsService,ROLES,LAYERS};
