'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'../..'),config=require('../../assets/KinghtFallConfig/GameJsonCfg.json');
function method(file,name,globals){const text=fs.readFileSync(path.join(root,'assets/_script',file+'.js'),'utf8').replace(/\r\n/g,'\n'),start=text.indexOf('_ctor.prototype.'+name+' = function ');return vm.runInNewContext('('+text.slice(text.indexOf('function ',start),text.indexOf('\n  };',start)+4)+')',globals);}
function skinNames(data){
 const json=data&&data.skeletonJson,skins=json&&json.skins;
 if(Array.isArray(skins))return skins.map(s=>s.name).filter(Boolean);
 if(skins&&typeof skins==='object')return Object.keys(skins).filter(Boolean);
 if(data&&data.getSkinsEnum){const values=data.getSkinsEnum();return Object.keys(values||{}).filter(key=>typeof values[key]==='number'&&key!==''&&isNaN(Number(key)));}
 return [];
}
function previewFixture(settings=config){
 const jobs=[],skinCalls=[],swaps=[];
 class Renderer{
  constructor(){this.defaultSkin='previous-stage';this.defaultAnimation='idle';}
  get skeletonData(){return this._data;}
  // Creator 2.4's public setter resets these fields at runtime before building
  // the next skeleton. A plain object here misses the native empty-name crash.
  set skeletonData(value){this._data=value;this.defaultSkin='';this.defaultAnimation='';this.skin=undefined;swaps.push(value);}
  setSkin(value){assert.equal(typeof value,'string');assert(value.length>0,'native name.length() > 0');assert(skinNames(this.skeletonData).includes(value),'native foundSkin != NULL: '+value);this.skin=value;skinCalls.push(value);}
  setAnimation(_track,name){this.animation=name;}
 }
 const renderer=new Renderer(),node={x:88,y:-31,active:true,getComponent:()=>renderer};
 const data={data:settings,getSoldierCfgById:id=>settings.SoldierCfg[id]};
 const modules={BaseCtrl:{default:function(){}},KinghtFallDataMgr:{KinghtFallDataMgr:{getInstance:()=>data}},KinghtFallConfig:{KinghtFallBundelName:{Enemy:'monsters'}}};
 const cc={_decorator:{ccclass:t=>t,property:()=>()=>{}},Node:function(){},isValid:value=>!!value&&!value.destroyed&&!value.isDestroy,color:x=>x,Color:{WHITE:'white'}};
 const context={exports:{},cc,sp:{Skeleton:Renderer},console,require:name=>modules[name]||{default:function(){}},
  __extends(C,B){C.prototype=Object.create(B.prototype);C.prototype.constructor=C;},__decorate:(_d,t,key)=>key===undefined?t:undefined,__spreadArrays:(...xs)=>[].concat(...xs)};
 vm.runInNewContext(fs.readFileSync(path.join(root,'assets/_script/KinghtFallHomeBattleCtrl.js'),'utf8'),context,{filename:'KinghtFallHomeBattleCtrl.js'});
 const home=Object.create(context.exports.default.prototype);Object.assign(home,{ndLevelInfo:{getChildByName:()=>node},loadPrefab:(bundle,name,done)=>jobs.push({bundle,name,done})});
 const source=(id,skins=[{name:'default'}],preferred='default')=>({data:{getComponentInChildren:()=>({defaultSkin:preferred,skeletonData:{id,skeletonJson:{skeleton:{height:180},skins}}})}});
 return{jobs,renderer,node,home,source,skinCalls,swaps,load:stage=>home.loadStageMonster(stage)};
}

test('stage previews read current monster prefab assets, and stale stage loads cannot replace the selected monster',()=>{
 const f=previewFixture(),{jobs,renderer,node,source}=f;
 f.load({EnemyAni:'wqyl_bb'});f.load({EnemyAni:'wqyl_zbb'});
 assert.equal(node.active,false);assert.deepEqual(jobs.map(j=>j.name),['ItemEnemy01','ItemEnemy02']);
 jobs[0].done(source('wolf'));assert.equal(renderer.skeletonData,undefined);
 jobs[1].done(source('bear'));assert.equal(renderer.skeletonData.id,'bear');assert.equal(renderer.skin,'default');assert.equal(renderer.defaultSkin,'default');assert.equal(renderer.animation,'idle');assert.equal(node.active,true);assert.equal(node.scaleY,.5);
 for(const stage of config.LevelCfg)assert(['wqyl_bb','wqyl_zbb','wqyl_gb','wqyl_qb'].includes(stage.EnemyAni));
});

test('switching every authored A/B/D stage forward and backward never submits empty or missing native skins',()=>{
 const Units=require('../../packages/game-data-editor/lib/unit-assets'),prefabs=new Map();
 for(const id of [90001,90002,90003,90004]){const layer=Units.describe(root,{type:'enemy',id:String(id),noRuntime:true}).layers[0];prefabs.set(config.SoldierCfg[id].prefab,{data:{getComponentInChildren:()=>({defaultSkin:layer.skin,skeletonData:{id,skeletonJson:layer.json}})}});}
 const before=JSON.stringify(config),seen=new Map();let total=0;
 for(const variant of ['','B','D']){
  const settings=Object.assign({},config,JSON.parse(fs.readFileSync(path.join(root,'assets/KinghtFallConfig'+variant+'/GameJsonCfg.json'),'utf8'))),f=previewFixture(settings);
  for(const stages of [settings.LevelCfg,settings.LevelCfg.slice().reverse()])for(const stage of stages){f.load(stage);const request=f.jobs.shift();assert.doesNotThrow(()=>request.done(prefabs.get(request.name)));assert(f.node.active);assert.equal(f.renderer.animation,'idle');assert(f.skinCalls.at(-1));
   const pos=JSON.stringify([f.node.x,f.node.y,f.node.scaleX,f.node.scaleY,f.node.angle,f.node.color]),key=variant+':'+request.name;
   if(seen.has(key))assert.equal(pos,seen.get(key),'stage preview transforms accumulate');else seen.set(key,pos);total++;
  }
  assert.equal(f.skinCalls.length,settings.LevelCfg.length*2);
 }
 assert(total>=120);assert.equal(JSON.stringify(config),before);
});

for(const [label,skins,preferred,expected]of [
 ['authored non-default skin',[{name:'blue'},{name:'amber'}],'blue','blue'],
 ['one skin with no default name',[{name:'amber'}],'','amber'],
 ['invalid preferred skin with default available',[{name:'default'},{name:'blue'}],'missing','default'],
 ['invalid preferred skin without default',[{name:'amber'}],'missing','amber'],
 ['legacy object skins',{amber:{},blue:{}},'blue','blue'],
 ['skinless data',[],'missing',undefined]
])test('stage skin transition handles '+label,()=>{
 const f=previewFixture();f.load({EnemyAni:'wqyl_bb'});const asset=f.source(label,skins,preferred);
 assert.doesNotThrow(()=>f.jobs.shift().done(asset));assert.equal(f.renderer.skin,expected);assert.equal(f.skinCalls.length,expected?1:0);assert.equal(f.renderer.defaultSkin,expected||'');assert(f.node.active);assert.equal(f.renderer.animation,'idle');
});

test('stage previews support skin enums when a binary asset has no JSON skin metadata',()=>{
 const f=previewFixture();f.load({EnemyAni:'wqyl_bb'});const asset={data:{getComponentInChildren:()=>({defaultSkin:'blue',skeletonData:{id:'binary',getSkinsEnum:()=>({amber:0,blue:1,0:'amber',1:'blue'})}})}};
 assert.doesNotThrow(()=>f.jobs.shift().done(asset));assert.equal(f.renderer.skin,'blue');assert(f.node.active);
});

test('a destroyed controller or preview node ignores pending stage data without touching native Spine',()=>{
 for(const target of ['home','node']){const f=previewFixture();f.load({EnemyAni:'wqyl_bb'});f[target].destroyed=true;assert.doesNotThrow(()=>f.jobs.shift().done(f.source('late')));assert.equal(f.swaps.length,0);assert.equal(f.skinCalls.length,0);}
});

test('the currency prefab has no energy countdown node or text renderer',()=>{
 const data=JSON.parse(fs.readFileSync(path.join(root,'assets/KinghtFallPrefabs/home/KinghtFallUITop.prefab'),'utf8'));
 assert(!data.some(n=>n._name==='labTime'));assert(!data.some(n=>n.__type__==='cc.Label'&&/^\d\d:\d\d$/.test(n._string||n['_N$string']||'')));
 const timer={active:true,removeFromParent(){this.removed=true;},destroy(){this.destroyed=true;}};const number={};
 const refresh=method('KinghtFallUITop','onRefreshPower',{cc:{Label:function(){}},$z1KinghtFallModle:{default:{getInstance:()=>({numberFomat:String})}}});
 refresh.call({userData:{getPowerNum:()=>15,maxPower:30,getPowerUpdateTime:()=>Date.now(),powerRecoveryTime:300000},ndPower:{getChildByName:name=>name==='labTime'?timer:{getComponent:()=>number}}});
 assert(timer.removed&&timer.destroyed);assert.equal(timer.active,false);assert.equal(number.string,'15/30');
});
