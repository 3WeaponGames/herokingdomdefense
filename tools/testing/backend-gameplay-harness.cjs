'use strict';
// Execute shipped gameplay methods with controlled scene and asynchronous resource boundaries.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..'),dir=path.join(root,'assets/_script');
const {environment,Node,Vec2}=require(path.join(root,'tools/navigation/runtime-harness.cjs'));
const authored=require(path.join(root,'assets/KinghtFallConfig/GameJsonCfg.json'));
Vec2.prototype.normalizeSelf=function(){const n=this.len()||1;this.x/=n;this.y/=n;return this;};
Vec2.prototype.signAngle=function(v){return Math.atan2(this.x*v.y-this.y*v.x,this.x*v.x+this.y*v.y);};
Vec2.prototype.multiplyScalar=function(n){this.x*=n;this.y*=n;return this;};
Vec2.normalize=(o,v)=>{o.x=v.x;o.y=v.y;return o.normalizeSelf();};
Vec2.multiplyScalar=(o,v,n)=>{o.x=v.x*n;o.y=v.y*n;return o;}; Vec2.RIGHT=new Vec2(1,0);
function setup(overrides={}){
 const e=environment(),mods={},events=[],pending=[]; const ui=e.stubs.KinghtFallUIGame.default.instance;e.cc.Component=e.stubs.BaseCtrl.default;
 const singleton=v=>({getInstance:()=>v}), noop=()=>{};
 const data=e.stubs.KinghtFallDataMgr.KinghtFallDataMgr.getInstance();
 data.getBuffCfgById=id=>authored.BuffCfg.find(x=>x.enumKey===id||x.ID===id);
 const cfg=e.stubs.KinghtFallConfig; cfg.KinghtFallEventName=new Proxy({},{get:(_,k)=>k});cfg.KinghtFallParameter.InitGold=0;cfg.KinghtFallAudioId={};
 e.stubs.KinghtFallGameCtrlData=undefined;
 e.stubs.EventMgr={EventMgr:singleton({emit:(...a)=>events.push(a)})};
 e.stubs.PlayerMgr={PlayerMgr:singleton({getTrackData:()=>({youmengTrack:noop})})};
 e.stubs.KinghtFallPlayerMgr={KinghtFallPlayerMgr:singleton({getUserData:()=>({passOrder:noop}),getMissionData:()=>({addAchNum:noop})})};
 e.stubs.GameTrackDataEvent={TrackId:{}};
 e.stubs.PoolMgr={PoolMgr:singleton({getNode:()=>null,getNodeFromPrefab:(_key,prefab)=>e.cc.instantiate(prefab),freeNode:noop})};
 e.stubs.AudioMgr={AudioMgr:singleton({getAudioSource:()=>({}),getMusicVolume:()=>.5,setChannelGain(){},stopOwnedEffects(){}})};
 e.stubs.TestMode={TestMode:singleton({shouldBypassAdLimits:()=>false})};
 Object.assign(e.stubs,overrides);
 function load(name){name=name.replace(/^\.\//,'');if(e.stubs[name])return e.stubs[name];if(mods[name])return mods[name].exports;
  const allowed=/^(SpawnArea|HeroWeapons|HeroStyleTalents|HeroLoadout|HeroUpgradeEffects|CombatPower|HeroWeaponCombat|RelicEligibility|RelicRuntime|RelicCombat|RelicBattle|GameToolsOverrides|KinghtFall(GameCtrlData|GameCtrl|GamePlayCtrl|BuildBarracks|Bullet.*|PlayGameAniCtrl))$/;
  if(!allowed.test(name))return e.load(name);
  const module={exports:{}};mods[name]=module;
  vm.runInNewContext(fs.readFileSync(path.join(dir,name+'.js'),'utf8'),{exports:module.exports,module,require:load,cc:e.cc,sp:{Skeleton:function(){}},console,
   __extends:(C,B)=>{Object.setPrototypeOf(C,B);C.prototype=Object.create(B.prototype);C.prototype.constructor=C;},
   __decorate:(ds,t,k)=>k===undefined?t:undefined,__spreadArrays:(...xs)=>[].concat(...xs)}, {filename:name+'.js'});return module.exports;
 }
 const DM=load('KinghtFallGameCtrlData');e.stubs.KinghtFallGameCtrlData=DM;const D=DM.default,d=Object.create(D.prototype);
 Object.assign(d,{buffList:[],addTime:{},talentAdd:{},treasureAdd:{},treasureAddTime:{},businessAdd:{},businessPoints:[],weaponBusinessPoints:{node:{}},horseBusinessPoints:{node:{}},coin:20,time:{MonsterGenerate:0},enemyQueue:{},enemyList:[],soldierList:[],bulidPointMap:{},levelCfg:{Level:1,WaveCfg:[{},{}]},round:1});
 const G=load('KinghtFallGameCtrl').default,g=new G();Object.assign(g,{node:new Node(),ndMain:e.game.ndMain,ndAggFlag:new Node(),gameData:d,ctrPlay:e.game.ctrPlay,ndPath:new Node('ndPath')});
 // Queue/prefab tests accept arbitrary valid lane IDs. Give their inert marker
 // nodes real transforms, while dedicated scene tests cover missing markers.
 g.ndPath.getChildByName=function(name){return Node.prototype.getChildByName.call(this,name)||(/^ndEnemy[1-9]\d*$/.test(name)?new Node(name,this):undefined);};
 new Node('ndStar',g.ndPath);d.ctrPar=g;ui.ctrGame=g;ui.initView=noop;
 g.ctrPlay.onRestart=noop;g.loadPrefab=(bundle,prefab,cb)=>pending.push(cb);g.clearArmyOrder=noop;
 e.cc.instantiate=p=>p();
 return {e,load,d,g,ui,events,pending,noop};
}
function hero(h){const H=h.load('KinghtFallGamePlayCtrl').default,p=new H();Object.assign(p,{node:new Node(),attackRange:200,baseHp:100,hpMax:100,hp:50,hpRecoverSpeed:10,time:{Attack:-1,RecoverCd:0,hpRecover:0},ctrHp:{setHp(){}},ndRange:{width:400},ndAgg:{},ndEffect:{removeAllChildren(){}},ctrPlayAni:{setAttack(){},onRestart(){},setBus(){}},rigidBody:{},getAttSpeed:()=>1});h.g.ctrPlay=p;return p;}
module.exports={setup,hero,Node,Vec2,authored};
