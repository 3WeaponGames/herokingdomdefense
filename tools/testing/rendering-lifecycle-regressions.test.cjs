'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),{test}=require('node:test');
const root=path.resolve(__dirname,'../..');
function load(name,stubs={},extra={}){
 function Base(){} const exports={},cc={Component:Base,Node:Base,Sprite:Base,Size:Base,Enum:x=>x,isValid:x=>!!x&&!x.destroyed,
  _decorator:{ccclass:x=>x,property:()=>()=>{},disallowMultiple:()=>x=>x,menu:()=>x=>x,requireComponent:()=>x=>x}};
 cc.Component.EventHandler={emitEvents(){}};Object.assign(cc,extra);
 vm.runInNewContext(fs.readFileSync(path.join(root,'assets/_script',name+'.js'),'utf8'),{exports,cc,sp:{Skeleton:Base},
  __extends:(C,B)=>{C.prototype=Object.create(B.prototype);C.prototype.constructor=C;},__decorate:(_d,T,k)=>k===undefined?T:undefined,
  require:n=>stubs[n]||{default:Base}},{filename:name+'.js'});return exports;
}
function renderer(){return{node:{active:true},setAnimation(){return{};},addAnimation(){},setTrackCompleteListener(_entry,fn){this.complete=fn;},setCompleteListener(fn){this.complete=fn;}};}
function controller(ui){
 const mod=load('KinghtFallPlayGameAniCtrl',{HeroMakerRider:{clearCombatState(){}},KinghtFallModle:{KinghtFallPlayAniEnum:{Rise:'rise',Idle:'idle',Move:'move',Die:'die',DieKeep:'dieKeep',LevelUp:'levelUp'}},
  AudioMgr:{AudioMgr:{getInstance:()=>({playEffect(){}})}},KinghtFallConfig:{KinghtFallAudioId:{get_idea:'idea'}},KinghtFallUIGame:{default:{instance:ui}}});
 const c=Object.create(mod.default.prototype);c.node={parent:{_combatGeneration:1}};c.isMove=false;c.isDie=true;c.ndReviveTail={active:true};
 for(const key of ['Ma','Body','Drap','Head','Bow','Arrow','Hand','Smoke','SoulFire','Revive','LevelUp'])c['spAni'+key]=renderer();return c;
}
for(const retire of ['restart','disable','destroy','ancestor generation','renderer replacement'])test('retired revive completion preserves current state: '+retire,()=>{
 const c=controller();let calls=0;c.setRevive(()=>calls++);const old=c.spAniRevive.complete;
 if(retire==='restart')c.onRestart();else if(retire==='disable')c.onDisable();else if(retire==='destroy')c.onDestroy();else if(retire==='ancestor generation')c.node.parent._combatGeneration++;else c.spAniRevive=renderer();
 c.isDie=true;c.spAniRevive.node.active=true;c.ndReviveTail.active=true;old();
 assert.equal(c.isDie,true);assert.equal(c.spAniRevive.node.active,true);assert.equal(c.ndReviveTail.active,true);assert.equal(calls,0);
});
test('new death supersedes revive; new revive supersedes death; current completion runs once',()=>{
 const c=controller();let old=0,revived=0,dead=0;c.setRevive(()=>old++);const revive=c.spAniRevive.complete;c.setDie(()=>dead++);const die=c.spAniSoulFire.complete;
 revive();assert.equal(c.isDie,true);assert.equal(old,0);c.setRevive(()=>revived++);die();assert.equal(dead,0);
 const current=c.spAniRevive.complete;current();current();assert.equal(revived,1);assert.equal(c.isDie,false);assert.equal(c.spAniRevive.node.active,false);assert.equal(c.ndReviveTail.active,false);
});
test('superseded level-up cannot hide current effect, and reentrant callback retains the new listener',()=>{
 const c=controller();let a=0,b=0,next=0;c.setLevelUp(()=>a++);const old=c.spAniLevelUp.complete;c.setLevelUp(()=>{b++;c.setLevelUp(()=>next++);});
 old();assert.equal(a,0);assert.equal(c.spAniLevelUp.node.active,true);const current=c.spAniLevelUp.complete;current();assert.equal(b,1);assert.equal(c.spAniLevelUp.node.active,true);
 c.spAniLevelUp.complete();assert.equal(next,1);assert.equal(c.spAniLevelUp.node.active,false);
});
for(const retire of ['epoch','data','UI generation'])test('hero presentation rejects retired combat context: '+retire,()=>{
 const ui={ctrGame:{gameData:{},_combatEpoch:1},_resourceGeneration:1},c=controller(ui);let calls=0;c.setLevelUp(()=>calls++);const old=c.spAniLevelUp.complete;
 if(retire==='epoch')ui.ctrGame._combatEpoch++;else if(retire==='data')ui.ctrGame.gameData={};else ui._resourceGeneration++;
 old();assert.equal(calls,0);assert.equal(c.spAniLevelUp.node.active,true);
});
function wallFixture(hit=()=>{}){
 function Base(){}
 Base.prototype._applyBuildingDamage=function(damage){this.buildInfo.hp-=damage;};
 const ui={node:{},_resourceGeneration:1,ctrGame:{gameData:{round:1},_combatEpoch:1}},module=load('KinghtFallBuildWall',{BattleSounds:{hit},KinghtFallUIGame:{default:{instance:ui}},KinghtFallBuildBase:{default:Base,KinghtFallBuildAniName:{destroy:'destroy'}}});
 const wall=Object.create(module.default.prototype);Object.assign(wall,{node:{_combatGeneration:1},buildInfo:{hp:10,hpMax:10},isDestroyed:false,ndAniEffect:renderer(),ctrHp:{calls:0,setHp(){this.calls++;}}});wall.onDead=function(){this.isDestroyed=true;};return{wall,ui};
}
test('wall damage preserves current destruction/HP behavior and current effect completion',()=>{
 const {wall}=wallFixture();assert.equal(wall.onAttacked(4),4);assert.equal(wall.buildInfo.hp,6);assert.equal(wall.ctrHp.calls,1);
 assert.equal(wall.onAttacked(6),6);assert.equal(wall.isDestroyed,true);assert.equal(wall.ndAniEffect.node.active,true);wall.ndAniEffect.complete();assert.equal(wall.ndAniEffect.node.active,false);assert.equal(wall.ctrHp.calls,2);
});
for(const retire of ['death callback','sound callback','epoch','replacement','repair'])test('wall callbacks reject retired destruction presentation: '+retire,()=>{
 let target;const {wall,ui}=wallFixture(()=>{if(retire==='sound callback'){target.node._combatGeneration++;target.ndAniEffect=null;}});target=wall;
 if(retire==='death callback')wall.onDead=function(){this.node.destroyed=true;this.ndAniEffect=null;};
 assert.equal(wall.onAttacked(10),10);
 if(retire==='death callback'||retire==='sound callback'){assert.equal(wall.ctrHp.calls,0);return;}
 const old=wall.ndAniEffect.complete;if(retire==='epoch')ui.ctrGame._combatEpoch++;else if(retire==='replacement')wall.ndAniEffect=renderer();else{wall.isDestroyed=false;wall.buildInfo.hp=10;}
 wall.ndAniEffect.node.active=true;old();assert.equal(wall.ndAniEffect.node.active,true);
});
test('obsolete wall destruction cannot hide a later destruction on the same repaired owner',()=>{
 const {wall}=wallFixture();wall.onAttacked(10);const old=wall.ndAniEffect.complete;wall.isDestroyed=false;wall.buildInfo.hp=10;wall.onAttacked(10);old();assert.equal(wall.ndAniEffect.node.active,true);wall.ndAniEffect.complete();assert.equal(wall.ndAniEffect.node.active,false);
});
for(const retire of ['none','base death','buff recipient'])test('wall death uses only its captured battle after callbacks: '+retire,()=>{
 let tips=0,buffs=0;const game={_combatEpoch:1},data=game.gameData={round:1,getGameBuff:()=>({Pamer:[.2]}),getEnemyList:()=>enemies},ui={ctrGame:game,_resourceGeneration:1};
 const enemies=[{addBuff(){buffs++;if(retire==='buff recipient')game._combatEpoch++;}},{addBuff(){buffs++;}}];
 function Base(){}Base.prototype.onDead=function(){this.isDestroyed=true;if(retire==='base death')game.gameData={};};
 const mod=load('KinghtFallBuildWall',{KinghtFallBuildBase:{default:Base},KinghtFallUIGame:{default:{instance:ui}},
  KinghtFallEnum:{KinghtFallEnumBuffCfg:{Buff06:'buff'}},KinghtFallInterface:{KinghtFallEnemyBuffType:{DamageCut:2}},UIMgr:{UIMgr:{getInstance:()=>({openUI(){tips++;}})}},
  Config:{UIID:{}},KinghtFallConfig:{KinghtFallUIID:{}},KinghtFallTextConfig:{KinghtFallTextConfig:{}},Utils:{Utils:{StringFormat:()=>''}}});
 const wall=Object.create(mod.default.prototype);Object.assign(wall,{node:{_combatGeneration:1},buildInfo:{},buildCfg:{name:'wall'},T:x=>x});wall.onDead();
 assert.equal(buffs,retire==='none'?2:retire==='buff recipient'?1:0);assert.equal(tips,retire==='none'?1:0);
});
for(const native of [false,true])for(const rate of [0,.35,1.8])test('baked rig retains locomotion source clock and track rate: '+native+'/'+rate,()=>{
 const asset={_uuid:'baked'},original={_uuid:'original'},api=load('HeroBakedLooks',{}, {resources:{load(_p,_t,done){done(null,asset);}}});
 function track(time,speed){return native?{getAnimation:()=>({getName:()=> 'move'}),getLoop:()=>true,getTrackTime:()=>time,getTimeScale:()=>speed,setTrackTime(n){this.time=n;},setTimeScale(n){this.speed=n;}}:{animation:{name:'move'},loop:true,trackTime:time,timeScale:speed};}
 const r={skeletonData:original,defaultSkin:'default',track:track(.47,rate),getCurrent(){return this.track;},setSkin(skin){this.skin=skin;},setAnimation(){return this.track=track(0,1);}};
 api.apply([r],{bakedLayers:{original:{resource:'baked/test'}}});assert.equal(r.skeletonData,asset);assert.equal(native?r.track.time:r.track.trackTime,.47);assert.equal(native?r.track.speed:r.track.timeScale,rate);assert.equal(r.skin,'default');
});
test('baked replacement waits for a nonlooping authored attack and does not replay its callback',()=>{
 const original={_uuid:'original'},api=load('HeroBakedLooks',{}, {resources:{load(_p,_t,done){done(null,{});}}}),r={skeletonData:original,getCurrent:()=>({animation:{name:'attack_mystic'},loop:false,trackTime:.2,timeScale:.35}),setAnimation(){throw Error('Attack must retain its track');}};
 api.apply([r],{bakedLayers:{original:{resource:'baked/test'}}});assert.equal(r.skeletonData,original);
});
test('reused list shrinks, clears and regrows without surplus nodes or allocations',()=>{
 let allocated=0;const shown=[],mod=load('KinghtFallUtilLayout',{}, {instantiate(){allocated++;return{setParent(){},setPosition(){}};}}),layout=Object.create(mod.KinghtFallUtilLayout.prototype);
 layout.nodeList=Array.from({length:3},()=>({active:true,setPosition(){}}));layout.node={};layout.selectedEvent=null;
 for(const size of [1,0,3,2]){layout.layLen=size;layout.itemPosArr=Array.from({length:size},(_,x)=>({x,y:0}));layout.initLayout();shown.push(layout.nodeList.filter(n=>n.active).length);assert.equal(layout.getItem(size),null);}
 assert.deepEqual(shown,[1,0,3,2]);assert.equal(allocated,0);
});
test('layout emits only current items and allocates only missing rows when regrowing',()=>{
 const events=[];let allocated=0;function Component(){}Component.EventHandler={emitEvents(_e,_n,i){events.push(i);}};
 const mod=load('KinghtFallUtilLayout',{}, {Component,instantiate(){allocated++;return{setParent(){},setPosition(){}};}}),layout=Object.create(mod.KinghtFallUtilLayout.prototype);
 Object.assign(layout,{nodeList:Array.from({length:2},()=>({active:true,setPosition(){}})),node:{},selectedEvent:{}});
 for(const count of [1,4]){layout.layLen=count;layout.itemPosArr=Array.from({length:count},(_,x)=>({x,y:0}));layout.initLayout();}
 assert.deepEqual(events,[0,0,1,2,3]);assert.equal(allocated,2);assert.equal(layout.nodeList.length,4);
});
for(const axis of [1,2])for(const alignment of [1,2,3])test('rectangular layout keeps all alignments within its measured padded area: '+axis+'/'+alignment,()=>{
 const directions={VerticalDirection:{TOP_TO_BOTTOM:1,BOTTOM_TO_TOP:2},HorizontalDirection:{LEFT_TO_RIGHT:1,RIGHT_TO_LEFT:2}};
 const mod=load('KinghtFallUtilLayout',{}, {Layout:directions,v2:(x,y)=>({x,y})});
 for(const count of [0,1,3,5,7])for(const capacity of [0,2,9])for(const direction of [1,2]){
  const layout=Object.create(mod.KinghtFallUtilLayout.prototype);
  Object.assign(layout,{horizontalDirection:axis,alignRowType:alignment,alignColType:alignment,templateType:2,ndSize:{width:110,height:50},maxCol:capacity,
   ctrLayout:{paddingLeft:3,paddingRight:5,paddingTop:7,paddingBottom:11,spacingX:7,spacingY:9,horizontalDirection:direction,verticalDirection:direction},
   node:{anchorX:.25,anchorY:.75,setContentSize(width,height){this.width=width;this.height=height;}}});
  layout.init(count);assert.equal(layout.itemPosArr.length,count);
  if(!count){assert.equal(layout.node.width,8);assert.equal(layout.node.height,18);continue;}
  const left=-layout.node.width*.25+3,right=layout.node.width*.75-5,bottom=-layout.node.height*.75+11,top=layout.node.height*.25-7;
  for(const point of layout.itemPosArr){assert(point.x-55>=left-1e-8);assert(point.x+55<=right+1e-8);assert(point.y-25>=bottom-1e-8);assert(point.y+25<=top+1e-8);}
 }
});
