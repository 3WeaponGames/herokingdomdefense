'use strict';
const fs=require('fs'),path=require('path'),{Service}=require('../hkd-characters/lib/service'),Units=require('../game-data-editor/lib/unit-assets');
const Weapons=require('../../assets/_script/HeroWeapons');
const Tiers=require('../../assets/_script/EquipmentTiers'),Appearance=require('./appearance');
const ROLES={1:'Chest',2:'Helmet',3:'Weapon power',4:'Weapons',5:'Cape',6:'Mount'},LAYERS={1:'wqyl_lead_doupeng',2:'wqyl_lead_tou',3:'wqyl_lead_jian',4:'wqyl_lead_gong',5:'wqyl_lead_shou',6:'wqyl_lead_ma'};
const Document=require('../game-data-editor/lib/json-document');
class ItemsService extends Service{
  constructor(root){super(root,{file:'assets/resources/hero-items/catalog.json'});}
  equipment(){return JSON.parse(fs.readFileSync(path.join(this.root,'assets/KinghtFallConfig/GameJsonCfg.json'),'utf8')).EquipCfg;}
  assets(){const library=super.assets();return {...library,parts:library.parts.concat(Appearance.mounts())};}
  units(){
    const equipment=this.equipment(),ordered=[1,2,5,6,4,3].map(id=>equipment.find(gear=>gear.id===id)).filter(Boolean);
    return ordered.flatMap(gear=>(gear.id===3||gear.id===4?Weapons.styles:[null]).flatMap(style=>Tiers.tiers(gear).map(tier=>{
      const level=gear.levelInfo.find(level=>level.Level===tier.levels[0]),key=Tiers.key(gear.id,tier.skin,style&&style.id);
      return {type:'item',id:key,key,group:style?style.name+' · '+Weapons.gear(style.id,gear.id,'upgrade').name:ROLES[gear.id],name:'Tier '+tier.number,slot:gear.id,level:level.Level,skin:tier.skin,tier:tier.number,value:level.Parameters,cost:level.GoldCost,legacyKeys:tier.levels.map(level=>Weapons.itemKey(gear.id,level,style&&style.id)),...(style?{style:style.id}:{})};
    })));
  }
  validationUnits(){return this.units().flatMap(unit=>[unit,...(unit.legacyKeys||[]).map(key=>({...unit,id:key,key}))]);}
  describe(base,noRuntime){
    const target=Tiers.target(this.equipment(),base.id),unit=this.units().find(u=>u.slot===target?.slot&&u.skin===target.skin&&u.style===target.style),item=unit&&{...unit,level:target.level};if(!item||base.type!=='item')throw Error('Choose an existing hero equipment tier.');
    const result=Units.describe(this.root,{type:'hero',id:'hero',heroLevels:{[item.slot]:item.level},heroStyle:item.style,noRuntime:!!noRuntime,noAppearance:true});
    result.defaultLayer=result.layers.find(l=>l.name===LAYERS[item.slot]).uuid;result.item=item;
    result.currentItem=Appearance.current(this.root,result,item,this.assets().parts);
    if(!result.currentItem.parts.length){const asset=Appearance.icon(this.root,this.equipment(),item.slot,item.level,item.style,this.assets().parts);result.itemModel={layer:result.defaultLayer,asset:asset&&asset.id,preview:asset,skin:result.layers.find(layer=>layer.uuid===result.defaultLayer).skin};}
    return result;
  }
  validate(data){super.validate(data);for(const p of Object.values(data.profiles))if(p.scale!==undefined&&p.scale!==1)throw Error('Adjust individual item parts; hero item looks do not resize the whole hero.');return true;}
  change(request){
    this.check(request);const data=JSON.parse(JSON.stringify(request.data));
    // Browsing and a no-change Save stay read-only. A real item edit selects
    // that design for its tier in the draft; Save publishes the assignment.
    for(const [id,profile]of Object.entries(data.profiles||{}))if(!Document.equal(this.data.profiles[id],profile)){
      for(const key of Object.keys(data.assignments||{}))if(data.assignments[key]===id&&key!==profile.base.id)delete data.assignments[key];
      data.assignments[profile.base.id]=id;
    }
    return super.change(Object.assign({},request,{data}));
  }
}
module.exports={ItemsService,ROLES,LAYERS};
