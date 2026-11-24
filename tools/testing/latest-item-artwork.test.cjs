'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {method,read,node}=require('./global-ad-fixture.cjs'),config=require('../../assets/KinghtFallConfig/GameJsonCfg.json');
const singleton=value=>({getInstance:()=>value}),noop=()=>{};
function data(name){const exports={};vm.runInNewContext(read(name),{exports,require:()=>({OrderLayer:{}})});return exports;}
function fixture(){const pending=[],cc={Sprite:'sprite',Label:'label',Button:'button',isValid:v=>!!v&&!v.destroyed,Vec2:{ZERO:{}},v2:()=>({x:0,y:0})};
 const scope={cc,$z1KinghtFallConfig:data('KinghtFallConfig'),$z1KinghtFallEnum:data('KinghtFallEnum'),$z1KinghtFallDataMgr:{KinghtFallDataMgr:singleton({getGoodsCfgById:id=>config.GoodsCfg[id]})},$z1KinghtFallModle:{default:singleton({numberFomat:String})},$z1ResourceMgr:{ResourceMgr:singleton({loadSpriteframe(bundle,res,call,retain,life,options){pending.push({res,call,options});}})},$z1Utils:{Utils:{StringFormat:(s,...args)=>String(s)+args.join(',')}},$z1KinghtFallTextConfig:{KinghtFallTextConfig:{}},$z1KinghtFallPlayerMgr:{KinghtFallPlayerMgr:singleton({getMissionData:()=>({getAchReward:()=>0})})},$z1KinghtFallItemGood:{default:function(){}}};
 scope.$z1ArgsParseUtils=require('../../assets/_script/ArgsParseUtils');cc.Node={EventType:{TOUCH_END:'touch'}};
 const item={_resourceGeneration:7,isDestroy:false,sprBg:{node:node('background')},sprIcon:{node:node('icon')},labNum:{},addRes:noop};
 for(const key of ['resourceOptions','loadSpriteFrame'])item[key]=method('BaseCtrl',key,scope);
 item.initView=method('KinghtFallItemGood','initView',scope);return{pending,cc,scope,item};
}
test('an active Passport row keeps the latest authored icon and quantity for both delivery orders',()=>{
 for(const order of [[0,1,2,3],[2,3,0,1]]){const f=fixture(),row=node('row');row.getChildByName('ndLeft').getChildByName('ndItem').ItemGood=f.item;row.getChildByName('ndRight').getChildByName('ndItem').ItemGood={initView:noop};const ui={cfgList:config.BpCfg,bpLevel:0,T:x=>x},render=method('KinghtFallUIPassport','initItemView',f.scope);render.call(ui,row,1);render.call(ui,row,2);assert.equal(f.pending.length,4);for(const i of order)f.pending[i].call({path:f.pending[i].res});assert.equal(f.item.labNum.string,'30');assert.equal(f.item.sprIcon.spriteFrame.path,config.GoodsCfg[config.BpCfg[1].Reward1[0]].icon);assert.equal(f.item._resourceGeneration,7);}
});
test('equipment level10 to11 keeps its current tier background, tint, icon and stat when older textures finish last',()=>{
 const f=fixture(),equipment=config.EquipCfg[0],row={type:equipment.id,cfg:equipment,ndItem:node('equipment'),ndInfo:node('details'),labNum:{}};let level=10;
 const user={getGoldNum:()=>100000,getMaxStage:()=>100,getMaxOrder:()=>100,getPersonLevel:()=>level,getHeroWeapon:()=>({id:'fighter'})};
 Object.assign(f.cc,{color:x=>x,Sprite:{State:{GRAY:1,NORMAL:0}}});
 f.scope.$z1KinghtFallPlayerMgr={KinghtFallPlayerMgr:singleton({getUserData:()=>user})};f.scope.$z1BaseButton={BaseButton:'baseButton'};
 f.scope.require=name=>name==='EquipmentIconFit'?{apply(sprite,frame){sprite.spriteFrame=frame;sprite.setState=noop;}}:name==='EquipmentTiers'?require('../../assets/_script/EquipmentTiers'):name==='HeroWeapons'?require('../../assets/_script/HeroWeapons'):assert.fail(name);
 const ui={node:node('page'),nodeInfo:[row],levelLimit:50,subNum:1,T:x=>x,renderWeaponUpgrade:noop,refreshCombatPower:noop,ctrPlayAni:{initView:noop},_resourceGeneration:1,isDestroy:false,addRes:noop};
 for(const key of ['resourceOptions','loadSpriteFrame'])ui[key]=method('BaseCtrl',key,f.scope);
 const render=method('KinghtFallHomePersonCtrl','initView',f.scope);render.call(ui);level=11;render.call(ui);assert.equal(f.pending.length,6);[3,4,5,0,1,2].forEach(i=>f.pending[i].call({path:f.pending[i].res}));
 const current=equipment.levelInfo[10];assert.equal(row.ndItem.getComponent(f.cc.Sprite).spriteFrame.path,current.EquipBottom);assert.equal(row.ndItem.getChildByName('sprIcon').getComponent(f.cc.Sprite).spriteFrame.path,current.Image);assert.equal(row.ndItem.color,require('../../assets/_script/EquipmentTiers').tint(current));assert.equal(row.labNum.string,String(current.Parameters));
});
