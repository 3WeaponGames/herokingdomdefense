'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'../..'),config=require('../../assets/configs/GameJsonCfg.json');
process.env.NODE_PATH=path.join(root,'assets/_script');require('node:module').Module._initPaths();
const engine=path.join(process.env.COCOS_ENGINE_ROOT||'C:/ProgramData/cocos/editors/Creator/2.4.13/resources/engine','extensions/spine/lib/spine.js');
const spine=fs.existsSync(engine)?require(engine):null;
const native={skip:!spine?'Creator Spine runtime is required for actual crop poses':false};
class Node {
 constructor(name){this.name=name;this.active=true;this.x=this.y=0;this._combatGeneration=0;}
 setParent(parent){this.parent=parent;}
 setPosition(p,y){this.x=typeof p==='number'?p:p.x;this.y=typeof p==='number'?y:p.y;}
 setContentSize(w,h){this.width=w;this.height=h;}
 setAnchorPoint(x,y){this.anchorX=x;this.anchorY=y;}
 addComponent(Type){return new Type();}
 getPosition(){return {x:this.x,y:this.y};}
 convertToWorldSpaceAR(p){return {x:p.x+this.x,y:p.y+this.y};}
 convertToNodeSpaceAR(p){return {x:p.x-this.x,y:p.y-this.y};}
 destroy(){this.destroyed=true;}
 get activeInHierarchy(){return this.active&&!this.destroyed;}
}
function setup(index){
 class Sprite{}Sprite.SizeMode={CUSTOM:1};
 const listeners=new Set();global.cc={Node,Sprite,color:(r,g,b)=>({r,g,b}),v2:(x=0,y=0)=>({x,y}),isValid:n=>!!n&&!n.destroyed,Director:{EVENT_BEFORE_DRAW:'draw'},director:{on:(e,f)=>listeners.add(f),off:(e,f)=>listeners.delete(f)}};
 const dir=path.join(root,'assets/KinghtFallIconMap/com/Ani/td'),atlas=new spine.TextureAtlas(fs.readFileSync(dir+'/td.atlas','utf8'),name=>{const b=fs.readFileSync(dir+'/'+name);return {setFilters(){},setWraps(){},getImage:()=>({width:b.readUInt32BE(16),height:b.readUInt32BE(20)})};});
 const data=new spine.SkeletonJson(new spine.AtlasAttachmentLoader(atlas)).readSkeletonData(JSON.parse(fs.readFileSync(dir+'/td.json'))),skeleton=new spine.Skeleton(data),cfg=config.BuildEnum[5].levelList.find(r=>r.index===index);
 skeleton.setSkinByName(cfg.Skin);skeleton.setToSetupPose();skeleton.updateWorldTransform();
 const owner={node:new Node('mill'),loadSpriteFrame:(bundle,name,done)=>done({name}),buildInfo:{cfg},buildCfg:{enumValue:5},getLevel:()=>cfg.level,getIsWork:()=>!owner.dead,ndAniDown:{node:new Node('plots'),_skeleton:skeleton}};
 const enemies=[],shots=[],game={ndMain:new Node('main'),ndUI:new Node('ui'),_combatEpoch:1,gameData:{getEnemyList:()=>enemies},onShotBuild:(f,t)=>shots.push({f,t,damage:f.getAttack()})};
 const source=fs.readFileSync(path.join(root,'assets/_script/MillFieldDefense.js'),'utf8'),module={exports:{}};vm.runInNewContext(source,{module,exports:module.exports,cc:global.cc,require:n=>require(path.join(root,'assets/_script',n+'.js'))});
 const runtime=new module.exports.Runtime(owner,game);runtime.apply();return {runtime,owner,game,enemies,shots,skeleton,listeners};
}
function enemy(env,x,y,hp=500){const node=new Node('enemy');node.setPosition({x,y});const actor={node,hp,onAttacked(n){this.hp-=n;},isDead(){return this.hp<=0;}};env.enemies.push(actor);return actor;}
test('one mill-wide choice branches once and both paths retain 2/2/3/4 plots and economy',()=>{
 const rows=config.BuildEnum[5].levelList;assert.deepEqual(rows[0].BranchBuild,[2,5]);
 for(const indices of [[1,2,3,4],[1,5,6,7]])for(let i=0;i<4;i++){
  const row=rows.find(r=>r.index===indices[i]);assert.equal(row.MillDefense.fields,[2,2,3,4][i]);assert.equal(row.level,i+1);assert.deepEqual(row.Data,rows[i].Data);assert.equal(row.Hp,rows[i].Hp);
  if(i>0&&i<3)assert.deepEqual(row.BranchBuild,[indices[i+1]]);
  if(i===3)assert.equal(row.BranchBuild,undefined);
 }
});
test('bomb art uses exact RTS tier2/4/7 pixels and a separate small image from the crop',native,()=>{
 const contract=require('./mill-field-defense.fixture.json').art,C=require('./painted-building-contract.cjs'),{decode}=require('../../packages/hkd-characters/lib/png-atlas'),dir=path.join(root,'assets/KinghtFallIconMap/com/Ani/td');
 const png=fs.readFileSync(dir+'/td-defenses.png'),image=decode(png),meta=JSON.parse(fs.readFileSync(dir+'/td-defenses.png.meta'));
 assert.equal(C.sha(png),contract.pageSha);assert.equal(C.hash(meta),contract.metadata);assert(image.width<=512&&image.height<=128);
 const atlas=new spine.TextureAtlas(fs.readFileSync(dir+'/td.atlas','utf8'),()=>({setFilters(){},setWraps(){},getImage:()=>({width:512,height:128})}));
 for(const source of contract.bombs){const region=atlas.findRegion(source.name);assert(region);assert.deepEqual([region.width,region.height],[source.width,source.height]);const pixels=Buffer.alloc(source.width*source.height*4);for(let y=0;y<source.height;y++)Buffer.from(image.rgba).copy(pixels,y*source.width*4,((region.y+y)*image.width+region.x)*4,((region.y+y)*image.width+region.x+source.width)*4);assert.equal(C.sha(pixels),source.rgbaSha,'exact native RTS artwork');}
 const td=JSON.parse(fs.readFileSync(dir+'/td.json'));
 for(const [index,rank]of [[5,1],[6,2],[7,3]]){const row=config.BuildEnum[5].levelList.find(r=>r.index===index),skin=td.skins.find(s=>s.name===row.Skin);assert.equal(row.MillDefense.artRank,rank);for(const [name,map]of Object.entries(skin.attachments))if(name.startsWith('mill_addon_'))assert.equal(map.defense.path,'mill-bomb-'+rank);}
 assert.equal(atlas.findRegion('mill-scarecrow').page.name,'td-defenses.png');assert.equal(atlas.findRegion('painted-farm').page.name,'td-painted.png');
});
test('every actual Spine crop becomes its own finite attack polygon, including unarmed level1',native,()=>{
 for(const row of config.BuildEnum[5].levelList){const env=setup(row.index),r=env.runtime;r.fighting=true;assert.equal(r.fields.length,row.MillDefense.fields);for(const f of r.fields){assert.equal(f.getWposPhyCol2()[0].tagNode,f.node);assert(f.getWposPhyCol()[0].every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)));}r.destroy();assert.equal(env.listeners.size,0);}
});
test('scarecrows fire projectiles only in battle, within range and at the configured cadence',native,()=>{
 const e=setup(2),r=e.runtime,f=r.fields[0],p=f.getAttPos();enemy(e,p.x,p.y);r.update(10);assert.equal(e.shots.length,0);r.fighting=true;r.update(2);assert.equal(e.shots.length,2);r.update(.01);assert.equal(e.shots.length,2);r.update(1.5);assert.equal(e.shots.length,4);e.enemies.forEach(a=>a.node.x+=10000);r.update(10);assert.equal(e.shots.length,4);r.destroy();
});
test('bomb fields never fire and explode once only on their own lethal damage, with bounded splash',native,()=>{
 const e=setup(5),r=e.runtime,f=r.fields[0],p=f.getAttPos(),near=enemy(e,p.x,p.y),far=enemy(e,p.x+111,p.y);r.fighting=true;r.update(20);assert.equal(e.shots.length,0);assert.equal(f.onAttacked(1),1);assert.equal(near.hp,500);assert.equal(f.onAttacked(Infinity),0);f.onAttacked(999);assert.equal(near.hp,500-r.cfg.damage);assert.equal(far.hp,500);assert.equal(r.fields[1].hp,r.cfg.fieldHp);f.onAttacked(999);assert.equal(near.hp,500-r.cfg.damage);r.tick(.2);assert.equal(f.slot.getAttachment(),null);assert(f.debris.node.active);assert.equal(f.debris.sprite.spriteFrame.name,'buildings/shared/debris');assert.equal(f.addon.color.a,0);r.destroy();
});
test('repair, upgrading, selling and round teardown disarm bombs without splash or stale target identities',native,()=>{
 const e=setup(7),r=e.runtime,f=r.fields[0],p=f.getAttPos(),a=enemy(e,p.x,p.y);r.fighting=true;r.apply();assert(f.node.destroyed);assert(f.node._combatGeneration>0);assert.equal(a.hp,500);r.stop();assert.equal(a.hp,500);assert.equal(r.fields.length,0);assert.equal(r.fighting,false);r.apply();assert(r.fields.every(f=>f.hp===f.hpMax));r.destroy();assert.equal(a.hp,500);assert.equal(e.listeners.size,0);
});
test('destroyed crops retain their ruin sprite after an authored animation restores the live attachment',native,()=>{
 const e=setup(3),r=e.runtime;r.fighting=true;const f=r.fields[0];f.onAttacked(999);r.tick(.2);e.skeleton.setToSetupPose();for(const fn of e.listeners)fn();assert.equal(f.slot.getAttachment(),null);assert(f.debris.node.active);assert.equal(f.debris.sprite.spriteFrame.name,'buildings/shared/debris');assert.equal(f.addon.color.a,0);assert(r.fields[1].slot.getAttachment());r.destroy();
});
test('existing enemy attack-reduction spells support scarecrows without changing mill income',native,()=>{
 const e=setup(2),r=e.runtime,f=r.fields[0],income=e.owner.buildInfo.cfg.Data[0];f.addBuff(2,{subNum:.5,time:1});assert.equal(f.getAttack(),r.cfg.damage*.5);r.update(2);assert.equal(f.getAttack(),r.cfg.damage);assert.equal(e.owner.buildInfo.cfg.Data[0],income);r.destroy();
});
test('field targets supplement only enemy targeting, keeping building saves and navigation roster separate',()=>{
 const source=fs.readFileSync(path.join(root,'assets/_script/KinghtFallGameCtrlData.js'),'utf8'),match=source.match(/_ctor.prototype.getAttackableBuildList = (function \(\) \{[\s\S]*?\n  \});/);assert(match);const fn=vm.runInNewContext('('+match[1]+')'),field={},mill={getFieldTargets:()=>[field]},castle={},list=[mill,castle],result=fn.call({getBulidList:()=>list});assert.deepEqual([...result],[mill,castle,field]);assert.equal(list.length,2);
 for(const name of ['Base','Long','Item07','Item08','Item10'])assert(fs.readFileSync(path.join(root,'assets/_script/KinghtFallEnemy'+name+'.js'),'utf8').includes('getAttackableBuildList'));
});
test('mill save hooks retain stable branch IDs and bounded per-field health without a new upgrade menu',()=>{
 const source=fs.readFileSync(path.join(root,'assets/_script/KinghtFallBuildMill.js'),'utf8');
 const base={getSave(){return {point:9,level:this.index};},setSave(save){this.index=save.level;this.applyFields();}};
 function method(name){const match=source.match(new RegExp('_ctor.prototype.'+name+' = (function \\([^)]*\\) \\{[\\s\\S]*?\\n  \\});'));assert(match,name);return vm.runInNewContext('('+match[1]+')',{t:{prototype:base}});}
 const mill={index:7,applyFields(){this._millFields={fighting:false,fields:[{slot:{data:{name:'td__10'}},hp:220,hpMax:220},{slot:{data:{name:'td__12'}},hp:220,hpMax:220}],sync(){}};}};
 mill.restoreFieldHealth=method('restoreFieldHealth');
 method('setSave').call(mill,{level:7,millFields:[{slot:'td__10',hp:0},{slot:'td__12',hp:1e9}]});assert.equal(mill.index,7);assert.deepEqual(mill._millFields.fields.map(f=>f.hp),[0,220]);
 mill._millFields.fighting=true;const saved=method('getSave').call(mill);assert.equal(saved.level,7);assert.equal(saved.millFields[0].hp,0);assert.equal(saved.millFields.length,2);
 method('setSave').call(mill,{level:2});assert.equal(mill.index,2);assert(mill._millFields.fields.every(f=>f.hp===220),'legacy saves keep their old branch and initialize intact fields');
});
test('scarecrow projectiles use the real game bullet pipeline, follow a moving enemy and hit once',()=>{
 const {setup,Node:GameNode,Vec2}=require('./backend-gameplay-harness.cjs'),h=setup();h.g.ndUI=new GameNode('effects');h.ui.ctrEffect={showDamageNum(){},onMonsterAttack(){}};
 Vec2.prototype.rotateSelf=function(a){const x=this.x,y=this.y;this.x=x*Math.cos(a)-y*Math.sin(a);this.y=x*Math.sin(a)+y*Math.cos(a);return this;};
 const Bullet=h.load('KinghtFallBulletBuild').default,bullet=new Bullet();bullet.node=new GameNode('shot',h.g.ndUI);bullet.uuid='mill-shot';bullet.node.setSiblingIndex=()=>{};bullet.bullet=new GameNode('arrow',bullet.node);bullet.speed=550;bullet.node.getComponent=Type=>bullet instanceof Type?bullet:null;h.g.ndBuildArr1.push(bullet.node);
 const target={node:new GameNode('target',h.g.ndMain,100,0),hp:100,isDead(){return this.hp<=0;},onAttacked(n){this.hp-=n;}};target.node._combatActor=target;target.node._combatGeneration=1;
 const field={node:new GameNode('field',h.g.ndMain),buildInfo:{cfg:{ID:5,index:2}},buildCfg:{enumValue:5},getAttack:()=>12,getAttPos:()=>new Vec2(0,40),getTowerSettings:()=>({attackType:'arrow',fieldProjectile:true,projectileSpeed:450})};
 h.g.onShotBuild(field,target);assert.equal(bullet.node.y,40,'shot starts from scarecrow height');target.node.y=30;
 for(let i=0;i<180&&bullet.state===0;i++)bullet.onUpdate(1/60);
 assert.equal(target.hp,88);bullet.onUpdate(1);assert.equal(target.hp,88);
});
test('approved bomb centers and grounded scarecrow positions remain identical in every equipped skin',()=>{
 const td=JSON.parse(fs.readFileSync(path.join(root,'assets/KinghtFallIconMap/com/Ani/td/td.json')));
 for(const skin of td.skins)for(const [name,map]of Object.entries(skin.attachments)){
  if(!name.startsWith('mill_addon_'))continue;
  const crop=Object.values(skin.attachments[name.slice(11)])[0],addon=map.defense;
  assert.equal(addon.x,crop.x);assert(Math.abs(addon.y-(crop.y+(addon.path==='mill-scarecrow'?-34:-15)))<1e-6);
 }
});
test('scarecrow head position is both the muzzle and the center of its range, across all tiers',native,()=>{
 for(const index of [2,3,4]){
  const e=setup(index),r=e.runtime,f=r.fields[0],a=f.addon.getAttachment(),b=f.slot.bone,p=f.getAttPos(),y=a.y+a.height*.36;
  assert(Math.abs(p.x-(b.worldX+b.a*a.x+b.b*y))<1e-6);assert(Math.abs(p.y-(b.worldY+b.c*a.x+b.d*y))<1e-6);
  r.fields.slice(1).forEach(field=>field.hp=0);r.fighting=true;
  const inside=enemy(e,p.x,p.y+r.cfg.range-.01);r.update(2);assert.equal(e.shots[0].t,inside,'inside head range can be outside ground range');
  e.enemies.length=0;enemy(e,p.x,p.y-r.cfg.range-.01);r.update(2);assert.equal(e.shots.length,1,'outside head range cannot fire even when inside ground range');r.destroy();
 }
});
test('each crop contributes exactly one silver while alive; partial damage does not reduce its income',native,()=>{
 for(const row of config.BuildEnum[5].levelList){const e=setup(row.index),r=e.runtime;r.fighting=true;const count=r.fields.length;assert.equal(r.income(),count);r.fields[0].onAttacked(1);assert.equal(r.income(),count);r.fields[0].onAttacked(9999);assert.equal(r.income(),count-1);r.fields.slice(1).forEach(f=>f.onAttacked(9999));assert.equal(r.income(),0);e.owner.dead=true;assert.equal(r.income(),0);r.destroy();}
});
test('all crops die with their mill and every remaining bomb detonates once; cleanup cannot detonate again',native,()=>{
 const e=setup(7),r=e.runtime;r.fighting=true;let explosions=0;const explode=r.explode.bind(r);r.explode=function(f){explosions++;explode(f);};
 r.fields[0].onAttacked(999);assert.equal(explosions,1);e.owner.dead=true;r.destroyAll();assert(r.fields.every(f=>f.hp===0));assert.equal(r.income(),0);assert.equal(explosions,4);r.destroyAll();assert.equal(explosions,4);r.tick(.2);assert(r.fields.every(f=>f.slot.getAttachment()===null&&f.debris.node.active));r.stop();r.destroy();assert.equal(explosions,4);
});
test('crops own separate standard HP controls and clean them up on repair and teardown',native,()=>{
 const e=setup(4),r=e.runtime,clones=[];
 class Health{constructor(node){this.node=node;}setType(type){this.type=type;}setHp(hp,max){this.hp=hp;this.max=max;this.node.active=hp>0&&hp<max;}}
 const template=new Node('existing mill HP');template.scaleX=template.scaleY=1;e.owner.ctrHp=new Health(template);
 global.cc.instantiate=()=>{const node=new Node('HP');node.setScale=(x,y)=>{node.scaleX=x;node.scaleY=y;};const control=new Health(node);node.getComponent=Type=>Type===Health?control:null;clones.push(control);return node;};
 r.fighting=true;r.sync();assert.equal(clones.length,4);assert.equal(new Set(r.fields.map(f=>f.health)).size,4);assert(clones.every(h=>h.type===1&&!h.node.active));
 r.fields[0].onAttacked(20);assert.equal(clones[0].hp,r.cfg.fieldHp-20);assert(clones[0].node.active);assert(clones.slice(1).every(h=>!h.node.active));
 r.fields[0].onAttacked(999);assert(!clones[0].node.active);r.stop();assert(clones.every(h=>h.node.destroyed));r.destroy();
});
test('native crop destruction keys finish before the matching small ruin sprite persists',native,()=>{
 const e=setup(4),r=e.runtime,f=r.fields[0];r.fighting=true;f.onAttacked(999);assert.equal(f.slot.getAttachment().path,'painted-farm');assert(Math.abs(f.slot.color.r-167/255)<1e-6);r.tick(.1);assert.equal(f.slot.getAttachment().path,'painted-farm');r.tick(.07);assert.equal(f.slot.getAttachment(),null);assert(f.debris.node.active);assert.equal(f.debris.sprite.spriteFrame.name,'buildings/shared/debris');assert.equal(f.slot.color.a,1);
 const C=require('./painted-building-contract.cjs'),ref=require('./mill-field-defense.fixture.json').art.sharedDebris;assert.equal(C.sha(fs.readFileSync(path.join(root,ref.file))),ref.sha256);assert.equal(C.hash(JSON.parse(fs.readFileSync(path.join(root,ref.file+'.meta')))),ref.metadata);assert(Math.abs(f.debris.node.height/f.debris.node.width-66/115)<1e-8);const old=f.debris.node;r.apply();assert(old.destroyed);assert(r.fields.every(f=>!f.debris));r.destroy();
});
function dataMethods(context){
 const source=fs.readFileSync(path.join(root,'assets/_script/KinghtFallGameCtrlData.js'),'utf8');
 return name=>{const match=source.match(new RegExp('_ctor.prototype.'+name+' = (function \\([^)]*\\) \\{[\\s\\S]*?\\n  \\});'));assert(match,name);return vm.runInNewContext('('+match[1]+')',context);};
}
test('wave-clear income snapshot survives perk upgrades and is paid before crop repairs, without mill bonus silver',native,()=>{
 const e=setup(4),r=e.runtime;r.fighting=true;r.fields.slice(1).forEach(f=>f.onAttacked(999));let repairs=0;
 const mill={buildCfg:{enumValue:5},buildInfo:e.owner.buildInfo,getIsWork:()=>!e.owner.dead,getGetCoin:()=>r.income(),endRoundGame(){repairs++;e.owner.dead=false;r.stop();r.apply();}};
 const data={round:1,coin:0,baseBuild:{},bulidPointMap:{9:mill},soldierList:[],treasureAdd:{77:[1]},loadMonster(){this.round++;},initCom(){}};
 const methods=dataMethods({$z1KinghtFallEnum:{KinghtFallEnumBuildEnum:{Mill:5,PrivateHouse:4},KinghtFallEnumTreasureEnum:{MillOfAbundance:77},KinghtFallEnumAchiEnum:{GetSliver:1}},BattleSounds:{},$z1KinghtFallPlayerMgr:{KinghtFallPlayerMgr:{getInstance:()=>({getMissionData:()=>({addAchNum(){}})})}}});
 data.captureMillIncome=methods('captureMillIncome');data.captureMillIncome();assert.equal(data._millIncomeSnapshot.income[9],1);
 // A wave-end perk repairs/upgrades the mill before the reward callback.
 r.apply();assert.equal(r.income(),4);methods('endRoundGame').call(data);assert.equal(data.coin,1);assert.equal(repairs,1);assert.equal(r.income(),4);assert.equal(data._millIncomeSnapshot,undefined);
 e.owner.dead=true;data.captureMillIncome();assert.equal(data._millIncomeSnapshot.income[9],0);e.owner.dead=false;methods('endRoundGame').call(data);assert.equal(data.coin,1,'a repaired mill cannot turn a zero-income cleared wave into a reward');r.destroy();
});
test('repair invalidates old enemy targets so a stale callback cannot destroy a replacement field or detonate a bomb',native,()=>{
 const e=setup(5),r=e.runtime;r.fighting=true;const old=r.fields[0];let blasts=0;r.explode=()=>blasts++;r.apply();assert(!old.getIsWork());assert.equal(old.onAttacked(999),0);assert.equal(blasts,0);assert(r.fields.every(f=>f.hp===f.hpMax));r.destroy();
});

test('a failed optional Spine smoke effect cannot abort crop death, income updates or subsequent combat ticks',native,()=>{
 const e=setup(5),r=e.runtime,f=r.fields[0];r.fighting=true;let income=0;e.owner.onFieldHealthChanged=()=>income++;
 e.owner.ndAniMain={node:new Node('mill smoke'),skeletonData:{},_skeleton:{findSlot:()=>({})}};
 global.sp={Skeleton:class BrokenSmoke{constructor(){throw Error('effect not ready');}}};
 try{assert.equal(f.onAttacked(999),f.hpMax);assert.equal(f.hp,0);assert.equal(income,1);assert.equal(r.income(),r.fields.length-1);assert.equal(r.effects.length,0);for(let i=0;i<60;i++)r.tick(1/60);assert(f.debris.node.active);assert.equal(f.onAttacked(999),0);}finally{delete global.sp;r.destroy();}
});
test('the final cleared wave also pays surviving crop silver exactly once without advancing to a nonexistent wave',()=>{
 let awarded=0;const methods=dataMethods({$z1KinghtFallEnum:{KinghtFallEnumAchiEnum:{GetSliver:1}},$z1KinghtFallPlayerMgr:{KinghtFallPlayerMgr:{getInstance:()=>({getMissionData:()=>({addAchNum:(_,n)=>awarded+=n})})}}});
 const data={round:9,coin:10,bulidPointMap:{2:{buildInfo:{cfg:{MillDefense:{}}},getGetCoin:()=>3},3:{buildInfo:{cfg:{MillDefense:{}}},getGetCoin:()=>0}}};data.captureMillIncome=methods('captureMillIncome');
 assert.equal(methods('settleFinalMillIncome').call(data),3);assert.equal(data.coin,13);assert.equal(awarded,3);assert.equal(data.round,9);assert.equal(methods('settleFinalMillIncome').call(data),0);assert.equal(data.coin,13);assert.equal(awarded,3);
});
