'use strict';
const assert=require('node:assert/strict'),test=require('node:test'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'../..'),Config=require('../../assets/KinghtFallConfig/GameJsonCfg.json'),Enums=require('../../assets/_script/KinghtFallEnum'),Hero=require('../../assets/_script/HeroLoadout');
const read=name=>fs.readFileSync(path.join(root,'assets/_script',name+'.js'),'utf8');
function manager(){const context={exports:{},require:()=>({})};vm.runInNewContext(read('KinghtFallDataMgr'),context);const value=new context.exports.KinghtFallDataMgr();value.data=Config;return value;}
function method(name,key,scope){const text=read(name),start=text.indexOf('  _ctor.prototype.'+key+' = function'),end=text.indexOf('\n  };',start)+5;assert(start>=0);return vm.runInNewContext('('+text.slice(start,end).split(' = ').slice(1).join(' = ').replace(/;$/,'')+')',scope);}
function fixture(){
 const config=manager(),data={personLevel:[1,1,1,1,1,1],heroWeapon:{selected:'fighter'},talentInfo:[10003,10009,10015,999999].map(id=>({id,isLock:true,future:'keep'}))},user={data,getTalent:()=>data.talentInfo,getTreasureLevel:()=>null,getMaxStage:()=>1,getMaxOrder:()=>0,getPersonLevel:()=>1};
 const mission={getTaskInfo:()=>({id:1,stage:0}),getTaskNum:()=>0},player={getUserData:()=>user,getMissionData:()=>mission},singleton=value=>({getInstance:()=>value});
 const scope={$z1KinghtFallDataMgr:{KinghtFallDataMgr:singleton(config)},$z1KinghtFallPlayerMgr:{KinghtFallPlayerMgr:singleton(player)},$z1KinghtFallEnum:Enums,$z1KinghtFallUIGame:{default:{instance:{ctrGame:{gameData:{buffList:[]}}}}},require:name=>{if(name==='KinghtFallPlayerMgr')return{KinghtFallPlayerMgr:singleton(player)};if(name==='RelicEligibility')return require('../../assets/_script/RelicEligibility');assert.equal(name,'GameToolsOverrides');return{perkEnabled:()=>true};}};
 return{config,data,user,mission,scope};
}

test('the actual config getter resolves every authored talent by stable ID, including sparse Vanguard IDs, without array-index fallback',()=>{
 const value=manager(),before=JSON.stringify(Config);for(const row of Config.TalentLevelCfg)assert.equal(value.getTalentLevelCfgById(row.ID),row);
 for(const id of [10003,10009,10015])assert.equal(value.getTalentLevelCfgById(String(id)).HeroStyle,'vanguard');
 assert.equal(value.getTalentLevelCfgById(1),Config.TalentLevelCfg[0]);assert.equal(value.getTalentLevelCfgById(141),undefined,'an array position must not become a different talent ID');assert.equal(value.getTalentLevelCfgById(999999),undefined);assert.equal(JSON.stringify(Config),before);
});

test('battle data initializes owned sparse talents and skips unknown ownership IDs without repairing progress or granting a different hero style',()=>{
 const f=fixture(),before=JSON.stringify(f.data),scope={...f.scope,$z1KinghtFallModle:{default:{getInstance:()=>({randomArray:(rows,count)=>rows.slice(0,count)})}},$z1KinghtFallConfig:{KinghtFallParameter:{InitGold:0}},i:{MonsterGenerate:'monster'}};
 const init=method('KinghtFallGameCtrlData','initData',scope),owner={levelCfg:{Level:1,HomeLevel1Unlock:[],HomeLevel2Unlock:[],HomeLevel3Unlock:[]},talentAdd:{},treasureAdd:{},treasureAddTime:{},loadMonster(){this.loaded=true;}};
 init.call(owner);assert(owner.loaded);for(const kind of [101003,101009,101015])assert.equal(owner.talentAdd[kind][0][0],.05);assert.equal(owner.talentAdd.undefined,undefined);assert.equal(JSON.stringify(f.data),before);
 const account=Hero.calculate(Config,f.data);assert.equal(account.damage,20.2);assert.equal(account.health,101);assert.equal(account.attackRate,1.01);assert.equal(Hero.snapshot(Config,f.data).damage,20);f.data.heroWeapon.selected='vanguard';assert.equal(Hero.calculate(Config,f.data).cp,account.cp);const selected=Hero.snapshot(Config,f.data);assert.equal(selected.damage,21);assert.equal(selected.health,105);assert.equal(selected.attackRate,1.05);
});

test('perk-pool and mission queries ignore sparse hero talents and unknown records while preserving real legacy perk unlocks',()=>{
 const f=fixture(),before=JSON.stringify(f.data),pool=method('KinghtFallUIBuff','initData',f.scope),quest=method('KinghtFallMissionData','questContext',f.scope),critical=Config.BuffCfg.find(row=>row.Unlock===100014);
 assert(critical);const owner={canOutBuff:[]};pool.call(owner);assert(!owner.canOutBuff.some(row=>row.id===critical.ID));assert.equal(quest.call({data:{listTime:{}}}).unlockedBuffs,0);assert.equal(JSON.stringify(f.data),before);
 f.data.talentInfo.push({id:Config.TalentLevelCfg.find(row=>row.kindID===100014).ID,isLock:true});const poolWithLegacy={canOutBuff:[]};pool.call(poolWithLegacy);assert(poolWithLegacy.canOutBuff.some(row=>row.id===critical.ID));assert.equal(quest.call({data:{listTime:{}}}).unlockedBuffs,Config.BuffCfg.filter(row=>row.Unlock===100014).length);assert(f.data.talentInfo.some(row=>row.id===999999));
});

test('the legacy lobby mission display skips unknown/sparse non-perk IDs instead of failing a cached Battle-tab refresh',()=>{
 const f=fixture(),task={id:1,stage:0},taskDefinition={MissionType:Enums.KinghtFallEnumTaskEnum.UnlockBuffTalent,Argument:[1],Award:[2001,1],MissionDescribe:'Unlock a perk'};
 f.mission.getTaskInfo=()=>task;f.config.getTaskCfgById=()=>taskDefinition;
 const node=()=>{const children=new Map(),component={};return{active:true,getChildByName(name){if(!children.has(name))children.set(name,node());return children.get(name);},getComponent(){return component;}};};
 const scope={...f.scope,cc:{Label:'label',Sprite:'sprite'},$z1KinghtFallConfig:{KinghtFallBundelName:{}},$z1KinghtFallModle:{default:{getInstance:()=>({numberFomat:String})}},$z1Utils:{Utils:{StringFormat:value=>value}},cc__spreadArrays:(...arrays)=>[].concat(...arrays)};
 const update=method('KinghtFallHomeBattleCtrl','onUpdateTask',scope),owner={ndTaskInfo:node(),cfgList:[{}],loadSpriteFrame(){},T:value=>value,refreshMissionDrawerBadge(){}};
 update.call(owner);assert.equal(task.stage,0);f.data.talentInfo.push({id:Config.TalentLevelCfg.find(row=>row.kindID===100014).ID,isLock:true});update.call(owner);assert.equal(task.stage,1);assert(f.data.talentInfo.some(row=>row.id===999999));
});
