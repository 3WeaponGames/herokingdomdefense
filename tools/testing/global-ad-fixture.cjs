'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {harness,config}=require('./persistence-harness.cjs');
const root=path.resolve(__dirname,'../..'),sdk=process.env.COCOS_ENGINE_ROOT||'C:/ProgramData/cocos/editors/Creator/2.4.13/resources/engine';
const sdkAvailable=fs.existsSync(path.join(sdk,'cocos2d/core/platform/CCObject.js'));
const read=name=>fs.readFileSync(path.join(root,'assets/_script',name+'.js'),'utf8').replace(/\r\n/g,'\n');
function method(file,name,scope){const s=read(file),start=s.indexOf('  _ctor.prototype.'+name+' = function ');assert(start>=0,file+'.'+name);return vm.runInNewContext('('+s.slice(s.indexOf('function ',start),s.indexOf('\n  };',start)+4)+')',scope,{filename:file+'.'+name});}
const singleton=value=>({getInstance:()=>value}),noop=()=>{};
const nodeProto={on(type,fn,owner){this.events??={};this.events[type]=()=>fn.call(owner);},off:noop,getChildByName(name){return this.children[name]??=node(name);},getComponent(type){return this.components[type]??={node:this};},convertToWorldSpaceAR(point){return{x:point.x,y:point.y};}};
function node(name){return Object.assign(Object.create(nodeProto),{name,active:true,activeInHierarchy:true,position:{x:0,y:0},children:{},components:{}});}
const configExports={};vm.runInNewContext(read('KinghtFallConfig'),{exports:configExports,require:()=>({OrderLayer:{}})});
function destructor(){
 if (!sdkAvailable) return null;
 const source=fs.readFileSync(path.join(sdk,'cocos2d/core/platform/CCObject.js'),'utf8'),start=source.indexOf('function compileDestruct '),end=source.indexOf('\n}\n',start)+2;
 return vm.runInNewContext('('+source.slice(start,end)+')',{cc:{_BaseNode:function(){},Component:function(){},Class:{_isCCClass:()=>false}},CC_SUPPORT_JIT:false});
}
function fixture(kind,options={}){
 const h=harness(),pending=[],tracking=[],timers=new Map(),closed=[],paint=[],events=[];let timerId=0;
 const cc={Node:{EventType:{TOUCH_END:'touch'}},Label:'label',Button:'button',Vec2:{ZERO:{x:0,y:0}},isValid:value=>!!value&&!value.destroyed};
 const earned={};vm.runInNewContext(read('GlobalAdReward'),{exports:earned,cc,console,setInterval(fn){const id=++timerId;timers.set(id,fn);return id;},clearInterval:id=>timers.delete(id)});
 const originalEmit=h.modules.EventMgr.EventMgr.getInstance().emit;h.modules.EventMgr.EventMgr.getInstance().emit=(...args)=>{events.push(args);originalEmit(...args);};
 const manager={getGoodsCfgById:id=>config.GoodsCfg[id],getParamsCfgById:id=>config.ParameterCfg[id].Value,getLevelCfgById2:id=>config.LevelCfg[Math.max(0,id-1)],getTreasureCfgById:id=>config.TreasureCfg.find(x=>x.ID===id)};
 const scope={cc,EarnedAds:earned,$z1EventMgr:h.modules.EventMgr,$z1KinghtFallConfig:configExports,$z1KinghtFallEnum:h.load('KinghtFallEnum'),$z1KinghtFallPlayerMgr:{KinghtFallPlayerMgr:singleton(h.player)},$z1KinghtFallDataMgr:{KinghtFallDataMgr:singleton(manager)},$z1SdkMgr:{SdkMgr:singleton({playVideo(type,success,cancel,placement){pending.push({success,cancel,placement});}}),AdType:{AdFreeTime:1}},$z1PlayerMgr:{PlayerMgr:singleton({getTrackData:()=>({youmengTrack:(...args)=>tracking.push(args)})})},$z1GameTrackDataEvent:{TrackId:{}},$z1Utils:{Utils:{StringFormat:(text,...args)=>String(text)+args.join(',')}},$z1AudioMgr:{AudioMgr:singleton({playEffect:noop,playEffectFree:noop})},$z1KinghtFallModle:{default:singleton({numberFomat:String,twBreatheRedPoint:noop})},$z1KinghtFallTextConfig:{KinghtFallTextConfig:{}},$z1KinghtFallMissionData:h.load('KinghtFallMissionData'),TestMode:singleton({shouldBypassAdLimits:()=>false})};
 const proto={T:x=>x,closeUI(){closed.push(true);this.isclose=true;this._resourceGeneration++;},sendEvent:(...args)=>events.push(args),initView:()=>paint.push('view'),upView:()=>paint.push('progress'),initEnergyInfo:noop,initEnergyItems:noop};
 const ui=Object.assign(Object.create(proto),{isclose:false,_resourceGeneration:1,node:node('panel'),labTitle1:{},labNum:{},btnClose:node('close'),btnReward:node('reward'),ndLeft:node('left'),ndRight:node('right'),btnVideo:node('video'),btnOne:node('one'),btnTen:node('ten'),btnSign:node('sign'),btnVide:node('extra'),btnDouble:node('double'),sprIcon:{node:node('icon')},sprFrames:[{},{}]});
 let trigger,expected,amount;const extraNodes=[];
 if(kind==='currency'){
  ui.goodId=options.goodId||2002;proto.completeAdReward=method('KinghtFallUIAddCurrency','completeAdReward',scope);method('KinghtFallUIAddCurrency','start',scope).call(ui);trigger=()=>ui.btnReward.events.touch();expected=ui.goldNum;amount=()=>ui.goodId===2001?h.player.udata.getGoldNum():h.player.udata.getDiamondNum();
 }else if(kind==='energy'){
  proto.onBtnBuy=method('KinghtFallUIAddStrength','onBtnBuy',scope);method('KinghtFallUIAddStrength','start',scope).call(ui);trigger=()=>ui.ndRight.getChildByName('ndBtn').events.touch();expected=15;amount=()=>h.player.udata.getPowerNum();
 }else if(kind==='talent'){
  ui.cfg={...config.TalentLevelCfg.find(x=>x.vedioCount)};proto.onVideoBtnClick=method('KinghtFallUITalentInfo','onVideoBtnClick',scope);trigger=()=>ui.onVideoBtnClick();expected=1;const id=ui.cfg.ID;amount=()=>Number(!!h.player.udata.getTalentLevel(id)?.isLock);
 }else if(kind==='sign'){
  ui.cfgList=config.SignCfg;ui.ndDayList=config.SignCfg.map((_,i)=>node('day'+i));proto.canClaim=method('KinghtFallUISignIn','canClaim',scope);method('KinghtFallUISignIn','initBtnListener',scope).call(ui);trigger=()=>ui.btnDouble.events.touch();const claim=config.SignCfg[h.player.dailyData.getSignDay()];expected=claim.Item[1]*2;amount=()=>claim.Item[0]===2001?h.player.udata.getGoldNum():h.player.udata.getDiamondNum();
 }else if(kind==='treasure'||kind==='treasure-result'){
  const file=kind==='treasure'?'KinghtFallHomeTreasureCtrl':'KinghtFallUITreasureReward';ui.cfgBox={...Object.values(config.ShopCfg)[0]};ui.labTime={};proto.getReward=method(file,'getReward',scope);proto.showDrawResult=method(file,'showDrawResult',scope);proto.upView=method(file,'upView',scope);scope.$z1UIMgr={UIMgr:singleton({openUI:()=>paint.push('rewards')})};scope.$z1Config={UIID:{UINONE:0}};proto.closeRelicDetails=noop;ui.ndCtr={init:noop,node:{destroyAllChildren:noop,removeAllChildren:noop}};ui.scheduleOnce=noop;ui._rewardGeneration=0;method(file,'initBtnListener',scope).call(ui);trigger=()=>ui.btnVideo.events.touch();expected=1;amount=()=>h.player.udata.data.treasureInfo.length;
 }else if(kind==='pass'){
  ui.cfgList=config.BpCfg;ui.bpLevel=1;const row=node('row');row.getChildByName('ndLeft').getChildByName('ndItem').ItemGood={initView:noop};row.getChildByName('ndRight').getChildByName('ndItem').ItemGood={initView:noop};method('KinghtFallUIPassport','initItemView',scope).call(ui,row,1);extraNodes.push(row.getChildByName('ndRight').getChildByName('ndItem'));trigger=()=>row.getChildByName('ndRight').events.touch();expected=config.BpCfg[0].Reward2[1];amount=()=>h.player.udata.getGoldNum();
 }else assert.fail(kind);
 const compiler=destructor();function destroy(){assert(compiler,'Install Creator2.4.13 for actual SDK destruction integration');for(const value of [...extraNodes,ui]){value.isclose=true;value.destroyed=true;value._resourceGeneration=(value._resourceGeneration||0)+1;compiler(value,value.constructor)(value);}}
 return{...h,ui,scope,pending,tracking,timers,closed,paint,events,trigger,expected,amount,destroy,tick(){Array.from(timers.values()).forEach(fn=>fn());},get helper(){return earned;}};
}
module.exports={fixture,method,node,sdk,sdkAvailable,read};
