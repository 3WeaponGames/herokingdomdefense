'use strict';
const assert=require('assert');
const fs=require('fs');
const path=require('path');
const vm=require('vm');
const {run,source}=require('../testing/runtime-commands');
const root=path.resolve(__dirname,'../../..');
const configFile=path.join(root,'assets/KinghtFallConfig/GameJsonCfg.json');
function fixture(){
    const data=JSON.parse(fs.readFileSync(configFile,'utf8')),saved=[],events=[],modules={};
    function BaseData(){}
    BaseData.prototype.saveData=function(){saved.push({key:this.gameKey,data:JSON.parse(JSON.stringify(this.data))});};
    modules.BaseData={BaseData};modules.Config={GameConfig:{AppCacheName:'test-'}};
    modules.KinghtFallConfig={KinghtFallParameter:{AppCacheName:'hkd',FollowMode:1},KinghtFallEventName:new Proxy({},{get:(_,key)=>key})};
    modules.EventMgr={EventMgr:{getInstance:()=>({emit:(...args)=>events.push(args)})}};
    modules.KinghtFallDataMgr={KinghtFallDataMgr:{getInstance:()=>({data,getGoodsCfgById:id=>data.GoodsCfg[id]})}};
    const real=['KinghtFallUserData','KinghtFallPlayerMgr','KinghtFallMissionData','KinghtFallEnum'];
    function req(name){
        if(modules[name])return modules[name];
        if(!real.includes(name))return {};
        const exports={};modules[name]=exports;
        vm.runInNewContext(fs.readFileSync(path.join(root,'assets/_script/'+name+'.js'),'utf8'),{exports,require:req,__extends(d,b){Object.setPrototypeOf(d,b);d.prototype=Object.create(b.prototype);d.prototype.constructor=d;},console});
        return exports;
    }
    const player=req('KinghtFallPlayerMgr').KinghtFallPlayerMgr.getInstance();
    player.udata=new (req('KinghtFallUserData').KinghtFallUserData)();player.udata.createData();player.udata.data.powerNum=30;
    player.missionData=new (req('KinghtFallMissionData').KinghtFallMissionData)();player.missionData.createData();player.guideData={};
    const mode={enabled:false,isAvailable:()=>true,isEnabled(){return this.enabled;},setEnabled(value){this.enabled=value;return value;}};
    modules.TestMode={TestMode:{getInstance:()=>mode}};
    modules.ServerDataMgr={ServerdataMgr:{getNeedSaveServer:()=>false}};
    modules.KinghtFallUIGame={default:{instance:null}};
    const storage={original:'save'},localStorage={get length(){return Object.keys(storage).length;},key:i=>Object.keys(storage)[i],getItem:key=>storage[key]};
    const host={__quick_compile_project__:{require:req},localStorage,cc:{director:{getScene:()=>({name:'Main'})},isValid:()=>true,game:{pause(){events.push(['pause']);},resume(){events.push(['resume']);}}}};
    return {host,player,data,saved,events,mode,modules,act:r=>run(r,host)};
}
let count=0;
function test(name,fn){fn();console.log('PASS '+name);count++;}
test('status reads actual saved APIs without grants or enabling mode',()=>{const f=fixture(),r=f.act({action:'status'});assert(r.ready);assert.equal(r.state.currencies.gold,0);assert.equal(r.state.currencies.stamina,30);assert.equal(f.saved.length,0);assert(!f.mode.enabled);});
test('start enables the TestMode singleton',()=>{const f=fixture();f.act({action:'start'});assert(f.mode.enabled);assert.equal(f.saved.length,0);});
test('currency grants call existing economy and mission persistence',()=>{const f=fixture();for(const itemId of[2001,2002,2004,2005])f.act({action:'grant',itemId,amount:99999});const s=f.act({action:'status'}).state;assert.equal(s.currencies.gold,99999);assert.equal(s.currencies.gems,99999);assert.equal(s.currencies.stamina,100029);assert.equal(s.currencies.passPoints,99999);assert.equal(f.player.missionData.data.achievementInfo.length,2);assert(f.saved.length>=6);assert(f.events.some(e=>e[0]==='RefreshGold'));});
test('all 32 goods use their actual IDs; absent battle silver is reported',()=>{const f=fixture(),r=f.act({action:'grant-all',amount:99999});assert.equal(r.results.length,31);assert.equal(r.skipped[0].id,2003);assert.equal(r.state.relics.length,27);assert(r.state.relics.every(t=>t.level===1&&t.frame===99998));assert.equal(r.state.currencies.gold,99999);});
test('first relic copy unlocks; later copies preserve original missing-cap behavior',()=>{const f=fixture();f.act({action:'grant',itemId:2006,amount:1});assert.equal(f.player.udata.getTreasureLevel(120001).frame,0);f.act({action:'grant',itemId:2006,amount:99999});assert.equal(f.player.udata.getTreasureLevel(120001).frame,99999);assert.equal(f.player.udata.getGoldNum(),0);});
test('finite authored duplicate cap uses the existing currency conversion API',()=>{const f=fixture();f.data.TreasureCfg[0].levelInfo[2].PieceCost=0;const r=f.act({action:'grant',itemId:2006,amount:10});assert.equal(r.state.relics[0].frame,5);assert.equal(r.state.currencies.gold,10000);assert.equal(r.results[0].convertedCopies,4);});
test('battle-only silver rejects at home without changing economy',()=>{const f=fixture();assert.throws(()=>f.act({action:'grant',itemId:2003,amount:99999}),/active battle/);assert.equal(f.saved.length,0);});
test('silver updates and saves only the current managed battle',()=>{const f=fixture();let saves=0;f.modules.KinghtFallUIGame.default.instance={node:{activeInHierarchy:true},ctrGame:{gameData:{coin:10,levelCfg:{Level:1},round:2},saveGame(){saves++;}}};const r=f.act({action:'grant',itemId:2003,amount:99999});assert.equal(r.state.currencies.silver,100009);assert.equal(saves,1);assert.equal(r.state.currencies.gold,0);});
test('invalid amount/item/type is rejected before player writes',()=>{const f=fixture();for(const amount of[-1,0,1.5,NaN,'99999',1e9])assert.throws(()=>f.act({action:'grant',itemId:2001,amount}));assert.throws(()=>f.act({action:'grant',itemId:9999,amount:1}));f.data.GoodsCfg[9999]={type:1};assert.throws(()=>f.act({action:'grant-all',amount:1}),/Unsupported currency/);assert.equal(f.saved.length,0);});
test('all six equipment categories persist within authored level bounds',()=>{const f=fixture(),r=f.act({action:'equipment-all',level:'max'});assert.deepEqual(r.state.equipment.map(e=>e.level),[50,50,50,20,20,20]);const count=f.saved.length;assert.throws(()=>f.act({action:'equipment',id:4,level:21}));assert.equal(f.saved.length,count);});
test('talents require prior level and allow every legally unlockable branch',()=>{const f=fixture();const second=f.data.TalentLevelCfg.find(t=>t.Level===2);assert.throws(()=>f.act({action:'talent',id:second.ID,enabled:true}),/previous/);f.act({action:'talent',id:1,enabled:true});const result=f.act({action:'talents-all',enabled:true});const records=result.state.talents.filter(t=>t.isLock);assert.equal(records.length,f.data.TalentLevelCfg.length);assert(records.every(t=>t.isLock));const before=f.saved.length;f.act({action:'talent',id:second.ID,enabled:true});assert.equal(f.saved.length,before);});
test('unlock advances saved stage/wave without granting challenge rewards',()=>{const f=fixture();const r=f.act({action:'unlock',stage:7,wave:4});assert.equal(r.state.progression.maxStage,7);assert.equal(r.state.progression.maxWave,4);assert.equal(r.state.progression.currentStage,7);assert(f.player.udata.data.stageInfo.every(value=>value===0));assert.equal(f.player.udata.data.rewardInfo.length,0);assert.throws(()=>f.act({action:'unlock',stage:2,wave:0}),/remove progress/);});
test('remote-save connections block every managed command before writes',()=>{const f=fixture();f.modules.ServerDataMgr.ServerdataMgr.curServer={};assert.throws(()=>f.act({action:'grant',itemId:2001,amount:1}),/remote save/);assert.equal(f.saved.length,0);});
test('snapshot preserves storage; reset preparation pauses writers without clearing',()=>{const f=fixture();const snap=f.act({action:'snapshot'});assert.equal(snap.storage.original,'save');f.act({action:'prepare-reset'});assert(f.events.some(e=>e[0]==='CLEARDATA'&&e[1]));assert(f.events.some(e=>e[0]==='pause'));assert.equal(f.modules.ServerDataMgr.ServerdataMgr.isPause,true);assert.equal(f.host.localStorage.getItem('original'),'save');f.act({action:'cancel-reset'});assert(f.events.some(e=>e[0]==='CLEARDATA'&&e[1]===false));assert(f.events.some(e=>e[0]==='resume'));assert.equal(f.modules.ServerDataMgr.ServerdataMgr.isPause,false);});
test('serialized runtime is self-contained and loading status is harmless',()=>{const f=fixture();const r=vm.runInNewContext(source({action:'status'}),{window:f.host});assert(r.ready);assert.equal(run({action:'status'},{ }).ready,false);assert.throws(()=>f.act({action:'arbitrary-code'}),/Unknown/);});
console.log(count+' testing runtime checks passed.');
