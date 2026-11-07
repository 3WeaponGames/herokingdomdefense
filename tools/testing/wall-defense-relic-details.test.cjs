'use strict';
const assert=require('node:assert/strict'),test=require('node:test');
const {fixture}=require('./backend-ui-harness.cjs');
const config=require('../../assets/KinghtFallConfig/GameJsonCfg.json');
const single=value=>({getInstance:()=>value}),noop=()=>{};

function setup(){
  const h=fixture(),relic=config.TreasureCfg.find(item=>item.Quality===4),owned={id:relic.ID,level:1,frame:2};let purchases=0;
  Object.assign(h.modules,{
    KinghtFallConfig:{KinghtFallUIID:{UITreasureInfo:'details'},KinghtFallBundelName:{IconGood:'goods'},KinghtFallAudioId:{}},
    KinghtFallDataMgr:{KinghtFallDataMgr:single({getGoodsCfgById:id=>config.GoodsCfg[id],getTreasureCfg:()=>config.TreasureCfg})},
    KinghtFallPlayerMgr:{KinghtFallPlayerMgr:single({getUserData:()=>({getTreasureLevel:()=>owned}),purchase(){purchases++;throw Error('Description cannot purchase');}})},
    KinghtFallTextConfig:{KinghtFallTextConfig:{HomeTrea02:'Lv.{0}'}},KinghtFallMissionData:{},KinghtFallEnum:{},
    KinghtFallModle:{default:single({numberFomat:String})},AudioMgr:{},GAD_Configs:{},GAD_App:{},GAD_PlayerMgr:{default:single({})},KinghtFallItemGood:{},
    Utils:{Utils:{StringFormat:(text,...values)=>text.replace(/\{(\d+)\}/g,(_match,index)=>values[index])}}
  });
  const language={t:key=>key,token:key=>key,format:(text,values)=>text.replace('{0}',values[0]),bindLabel:(label,_key,values)=>{label.string=values.join(' ');}};
  h.modules.LanguageMgr.LanguageMgr.getInstance=()=>language;
  h.ui.setConf({details:{bundleName:'ui',prefab:'details',name:'details',zIndex:10},results:{bundleName:'ui',prefab:'results',name:'results',zIndex:1000}});
  function part(name,parent){const n=new h.cc.Node(name);n.ui={onDestroy:noop};if(parent)n.parent=parent;return n;}
  function detail(){
    const C=h.load('KinghtFallUITreasureInfo').default,panel=new C();panel.node=part('details');panel.node.ui=panel;
    part('bg',panel.node);panel.labName={};panel.labInfo={};panel.btnClose=part('close');panel.btnGold=part('upgrade');panel.ndLock=part('locked');
    panel.ndItem=part('item');for(const name of ['sprBg','sprIcon','labNum'])part(name,panel.ndItem);
    panel.ndPro=part('progress');for(const name of ['labPro','sprPro'])part(name,panel.ndPro);
    const layout=part('Layout',panel.btnGold);part('labNum',layout);
    panel.loadSpriteFrame=(_bundle,_path,done)=>done({});return panel;
  }
  const Result=h.load('GAD_UIResult').default,result=new Result();result.uid='results';result.node=part('results');result.node.ui=result;result.node.zIndex=1001;
  h.ui.uistatck.set('results',result);h.cc.instantiate=()=>detail().node;
  return{...h,relic,owned,result,detail,purchases:()=>purchases,asset:{addRef:noop}};
}

test('reward Relics open the existing description above results with no upgrade action',()=>{
  const h=setup();let stopped=0;
  h.result.openRelicDetails(h.relic,{stopPropagation(){stopped++;}});h.result.openRelicDetails(h.relic);
  assert.equal(stopped,1);assert.equal(h.requests.length,1);
  h.requests[0].done(null,h.asset);const panel=h.ui.uistatck.get('details');panel.start();
  assert.equal(panel.cfg.ID,h.relic.ID);assert.equal(panel.readOnly,true);assert.equal(panel.node.zIndex,1002);
  assert.equal(panel.btnGold.active,false);assert.equal(panel.btnGold.handlers.end,undefined);assert.equal(panel.ndPro.active,true);
  panel.onGoldBtnClick();assert.equal(h.purchases(),0);assert.equal(h.owned.level,1);assert.equal(h.owned.frame,2);
  h.result.openRelicDetails(config.TreasureCfg[0]);assert.equal(h.requests.length,1);
  h.ui.closeUI(panel.node);h.result.openRelicDetails(config.TreasureCfg[0]);assert.equal(h.requests.length,2);
  h.requests[1].done(null,h.asset);assert.equal(h.ui.uistatck.get('details').cfg.ID,config.TreasureCfg[0].ID);
  h.ui.closeUI(h.result.node);assert.equal(h.ui.uistatck.has('details'),false);
});

test('closing the result during a description load cancels its late panel and releases input',()=>{
  const h=setup();h.result.openRelicDetails(h.relic);h.result.node.destroy();h.requests[0].done(null,h.asset);
  assert.equal(h.ui.uistatck.has('details'),false);assert.equal(h.ui._openingInputCount,0);assert.equal(h.blocked(),false);
});

test('cancelled description recovery remains retryable by tapping and cannot revive a closed result',()=>{
  const h=setup();h.result.openRelicDetails(h.relic);h.requests[0].done(Error('controlled missing prefab'));
  assert.equal(h.paused(),true);h.resources.resolveRuntimeRecovery(false);assert.equal(h.paused(),false);
  h.result.openRelicDetails(h.relic);assert.equal(h.requests.length,2);h.result.node.destroy();h.requests[1].done(null,h.asset);
  assert.equal(h.ui.uistatck.has('details'),false);assert.equal(h.ui._openingInputCount,0);
});

test('normal collection descriptions retain their Upgrade button and reset inspection mode',()=>{
  const h=setup(),panel=h.detail();panel.init(h.relic,true);panel.start();assert.equal(panel.btnGold.active,false);
  panel.init(h.relic);panel.initView();panel.initBtnListener();
  assert.equal(panel.readOnly,false);assert.equal(panel.btnGold.active,true);assert.equal(panel.btnGold.handlers.end,panel.onGoldBtnClick);
});

test('reward-grid taps inspect their own Relic while currency icons do not open descriptions',()=>{
  const h=setup(),second=config.TreasureCfg.find(item=>item.Quality===3),prefab={};
  h.modules.GAD_PlayerMgr.default.getInstance().getResult=()=>({activeMilliseconds:60000,clearedWaves:10,saved:true,
    awarded:[{id:2001,num:500},{id:h.relic.goodID,num:1},{id:second.goodID,num:1}],unlockedGoods:[]});
  h.result.lblStats={};h.result.lblSaved={};h.result._rewardPrefab=prefab;h.result.ndRewards=new h.cc.Node('rewards');
  h.result.ndRewards.destroyAllChildren=function(){this.children.slice().forEach(child=>child.destroy());};
  const instantiate=h.cc.instantiate;h.cc.instantiate=asset=>{
    if(asset!==prefab)return instantiate(asset);const node=new h.cc.Node('reward');node.ui={initView:noop,onDestroy:noop};return node;
  };
  h.result.refreshResult();const icons=h.result.ndRewards.children;assert.equal(icons.length,3);assert.equal(icons[0].handlers.end,undefined);
  icons[1].handlers.end({stopPropagation:noop});h.requests[0].done(null,h.asset);
  assert.equal(h.ui.uistatck.get('details').cfg.ID,h.relic.ID);h.ui.closeById('details');
  icons[2].handlers.end({stopPropagation:noop});h.requests[1].done(null,h.asset);
  assert.equal(h.ui.uistatck.get('details').cfg.ID,second.ID);
});
