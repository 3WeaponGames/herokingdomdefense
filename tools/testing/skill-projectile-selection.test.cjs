'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict'),test=require('node:test');
const {SkillService,FILES}=require('../../packages/hkd-skills/service'),Settings=require('../../assets/_script/HeroSkillSettings'),Catalog=require('../../packages/hkd-skills/catalog');
const root=path.resolve(__dirname,'../..'),uuid='33333333-3333-4333-8333-333333333333';
const arrow={id:'part:test-arrow',uuid,name:'Test arrow',category:'Imported arrows',kind:'sprite',bundle:'resources',path:'projectiles/test-arrow',rotation:90,file:'assets/resources/projectiles/test-arrow.png',url:'file:///test-arrow.png'};
const book={...arrow,id:'toon:test-flight',uuid:'44444444-4444-4444-8444-444444444444',rotation:0,flipbook:{frames:4,columns:2,cell:16,fps:12,loop:true}};
function fixture(t,skills={},mirror=skills){
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'hkd-projectile-choice-'));
 t.after(()=>{assert.equal(path.dirname(path.resolve(directory)),path.resolve(os.tmpdir()));assert(path.basename(directory).startsWith('hkd-projectile-choice-'));fs.rmSync(directory,{recursive:true,force:true});});
 for(const [i,file]of FILES.entries()){const target=path.join(directory,file);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,JSON.stringify({EquipCfg:[],GameTools:{timingDefaults:{keep:true}},extension:{mirror:i},HeroSkills:i?mirror:skills},null,2)+'\n');}
 const service=new SkillService(directory,{catalogs:{audio:[],vfx:[],projectiles:[{...arrow},{...book}]},describe:()=>({layers:[]})});
 const request=value=>({version:service.version,revision:service.revision,...value}),change=id=>service.change(request({style:'skirmisher',path:'visual.projectile',value:id}));
 return{directory,service,request,change,bytes:()=>FILES.map(file=>fs.readFileSync(path.join(directory,file),'utf8'))};
}

test('Skirmisher exposes the shared flight library without staging defaults or affecting other skills',t=>{
 const f=fixture(t),before=f.bytes(),snapshot=f.service.load();
 assert(snapshot.fields.skirmisher.visual.some(field=>field.path==='visual.projectile'&&field.type==='projectile'));
 for(const style of Settings.styles.filter(s=>s.id!=='skirmisher'))assert(!snapshot.fields[style.id].visual.some(field=>field.type==='projectile'));
 assert.equal(snapshot.effective.skirmisher.visual.projectile,'');assert.equal(snapshot.dirty,false);assert.equal(f.service.save(f.request()).result.saved,false);assert.deepEqual(f.bytes(),before);
 const assets=Catalog.projectiles(root),published=JSON.parse(fs.readFileSync(path.join(root,'assets/resources/projectiles/catalog.json'),'utf8'));
 assert.deepEqual(assets.map(a=>a.id).sort(),published.assets.filter(a=>a.role==='flight').map(a=>a.id).sort());
 const skin=assets.find(a=>a.id==='hero-skin:lv3');assert.equal(Catalog.spine(root,skin).layers[0].skin,'lv3');
 assert(assets.some(a=>a.flipbook));assert(assets.some(a=>a.id==='tiny-kingdom:ballista-bolt'));
});

test('projectile selection previews immediately and saves only its owned identity in both copies',t=>{
 const legacy={resource:'22222222-2222-4222-8222-222222222222',resourcePath:'vfx/old',extension:{keep:true}},f=fixture(t,{skirmisher:{visual:legacy}},{skirmisher:{visual:{...legacy,extension:{mirror:true}}}}),before=f.bytes();
 f.change(arrow.id);const selected=f.service.snapshot().effective.skirmisher.visual,visual=Settings.projectileVisual(selected);
 assert.equal(visual.resource,uuid);assert.equal(visual.resourcePath,arrow.path);assert.equal(visual.resourceRotation,90);assert.equal(visual.showBuiltin,false);assert.equal(selected.resource,legacy.resource,'Choosing flight art overwrote the fallback VFX');assert.deepEqual(f.bytes(),before);
 const description=f.service.describe({style:'skirmisher',castResource:'',projectile:arrow.id});assert.equal(description.effects[0].id,uuid);assert.equal(description.projectileAsset.id,arrow.id);
 const saved=f.service.save(f.request());assert.equal(saved.result.saved,true);
 for(const [i,text]of f.bytes().entries()){const actual=JSON.parse(text),old=JSON.parse(before[i]);assert.equal(actual.HeroSkills.skirmisher.visual.projectile,arrow.id);assert.equal(actual.HeroSkills.skirmisher.visual.projectileAsset.uuid,uuid);delete actual.HeroSkills.skirmisher.visual.projectile;delete actual.HeroSkills.skirmisher.visual.projectileAsset;assert.deepEqual(actual,old);}
 const unchanged=f.bytes();assert.equal(f.service.save(f.request()).result.saved,false);assert.deepEqual(f.bytes(),unchanged);
});

test('animated projectile metadata, undo and reset keep fallback artwork and unknown fields intact',t=>{
 const f=fixture(t,{skirmisher:{visual:{color:'#ff0000',extension:{keep:true}}}});f.change(book.id);
 const visual=Settings.projectileVisual(f.service.snapshot().effective.skirmisher.visual);assert.equal(visual.resourceFrames,4);assert.equal(visual.resourceFps,12);assert.equal(visual.color,'#ff0000');
 f.service.undo(f.request());assert.equal(f.service.snapshot().effective.skirmisher.visual.projectile,'');f.service.redo(f.request());assert.equal(f.service.snapshot().effective.skirmisher.visual.projectile,book.id);
 f.service.reset(f.request({style:'skirmisher',path:'visual.projectile'}));assert.deepEqual(f.service.data,{skirmisher:{visual:{color:'#ff0000',extension:{keep:true}}}});assert.equal(f.service.dirty(),false);
});

test('choosing a tier arrow carries its trail into the skill draft, preview and explicit Save',t=>{
 const f=fixture(t),before=f.bytes(),trail=JSON.parse(fs.readFileSync(path.join(root,'assets/resources/projectiles/catalog.json'))).trails.find(trail=>trail.id==='trail:hero-arrow-lv4');
 f.service.catalogs.projectiles[0].trail=trail;f.change(arrow.id);
 assert.deepEqual(Settings.projectileVisual(f.service.snapshot().effective.skirmisher.visual).resourceTrail,trail);
 assert.deepEqual(f.service.describe({style:'skirmisher',castResource:'',projectile:arrow.id}).projectileAsset.trail,trail);assert.deepEqual(f.bytes(),before);
 assert.equal(f.service.save(f.request()).result.saved,true);for(const text of f.bytes())assert.deepEqual(JSON.parse(text).HeroSkills.skirmisher.visual.projectileAsset.trail,trail);
});

test('missing or moved projectiles reject selection and Save while retaining drafts and external revisions',t=>{
 const f=fixture(t),before=f.bytes(),version=f.service.version;assert.throws(()=>f.change('impact:not-a-flight'),/flight asset/);assert.equal(f.service.version,version);assert.deepEqual(f.bytes(),before);
 f.change(arrow.id);f.service.catalogs.projectiles[0].path='projectiles/moved';assert.throws(()=>f.service.save(f.request()),/changed after selection/);assert.deepEqual(f.bytes(),before);
 f.change(arrow.id);assert.equal(Settings.projectileVisual(f.service.snapshot().effective.skirmisher.visual).resourcePath,'projectiles/moved');
 fs.appendFileSync(path.join(f.directory,FILES[1]),' ');const external=f.bytes();assert.throws(()=>f.service.save(f.request()),/outside this draft/);assert.deepEqual(f.bytes(),external);assert(f.service.dirty());
});

test('reset removes asymmetric projectile metadata from mirrors without replacing their other visual settings',t=>{
 const asset={id:arrow.id,uuid,kind:'sprite',bundle:'resources',path:arrow.path,rotation:90};
 const f=fixture(t,{skirmisher:{visual:{projectile:arrow.id,projectileAsset:asset,color:'#ff0000'}}},{skirmisher:{visual:{projectile:book.id,projectileAsset:{future:'old'},color:'#00ff00',extension:{keep:true}}}});
 f.service.reset(f.request({style:'skirmisher',path:'visual.projectile'}));assert.equal(f.service.save(f.request()).result.saved,true);
 const configs=f.bytes().map(text=>JSON.parse(text));assert.deepEqual(configs[0].HeroSkills.skirmisher.visual,{color:'#ff0000'});assert.deepEqual(configs[1].HeroSkills.skirmisher.visual,{color:'#00ff00',extension:{keep:true}});
});

test('gameplay draws the selected sprite or Spine skin at the active arrow collider and retires old artwork',()=>{
 const vm=require('node:vm'),loads=[],skins=[];
 class Node{constructor(){this.children=[];this.x=this.y=0;this.active=true;}setParent(parent){this.parent=parent;parent.children.push(this);}getPosition(){return{x:this.x,y:this.y};}setPosition(p){this.x=p.x;this.y=p.y;}convertToWorldSpaceAR(p){return{x:p.x+this.x,y:p.y+this.y};}convertToNodeSpaceAR(p){return{x:p.x-this.x,y:p.y-this.y};}addComponent(Type){const component=new Type();component.node=this;return component;}destroy(){this.destroyed=true;}}
 class Skeleton{setSkin(name){skins.push(name);}setAnimation(){return{};}}
 const cc={Node,Sprite:class{},SpriteFrame:class{},v2:(x,y)=>({x,y}),color:value=>value,isValid:value=>!!value&&!value.destroyed,resources:{load(resource,type,done){loads.push({resource,type,done});}},assetManager:{}},P={};
 vm.runInNewContext(fs.readFileSync(path.join(root,'assets/_script/HeroSkillPresentation.js'),'utf8'),{exports:P,cc,sp:{Skeleton,SkeletonData:class{}},require:name=>name.startsWith('./')?require(path.join(root,'assets/_script',name)):{} });
 const main=new Node(),hero={node:new Node()};hero.node._combatGeneration=1;hero.node.setParent(main);
 const settings=Settings.defaults('skirmisher'),asset={id:arrow.id,uuid,kind:'sprite',bundle:'resources',path:arrow.path,rotation:90,premultipliedAlpha:false};Object.assign(settings.visual,{projectile:arrow.id,projectileAsset:asset});
 const projectile={x:70,y:40,width:28,direction:{x:1,y:0},speed:100,travelled:0},rt={settings,hero,heroGeneration:1,state:{style:'skirmisher',time:0},projectiles:[projectile],effects:[],game:{ndMain:main,gameData:{},_combatEpoch:1},available:()=>true},hud={visual:{node:new Node()}};
 let retained=0;const texture={getRect:()=>({width:100,height:20}),addRef(){retained++;return this;},decRef(){retained--;}};
 P.attachments(hud,rt);assert.equal(loads[0].resource,arrow.path);loads.shift().done(null,texture);P.attachments(hud,rt);
 let record=rt._presentation.nodes.get(projectile);assert(record.sprite);assert.equal(record.node.x,70);assert.equal(record.node.y,40);assert.equal(record.node.angle,90);assert.equal(record.node.anchorX,.5);assert.equal(record.node.anchorY,.5);
 const old=record.node;Object.assign(asset,{kind:'spine',skin:'lv3',animation:'jian'});P.attachments(hud,rt);assert(old.destroyed);assert.equal(retained,0);
 const rig={skeletonJson:{skeleton:{x:0,y:0,width:40,height:12},skins:[{name:'lv1'},{name:'lv3'}],animations:{jian:{}}},addRef(){retained++;return this;},decRef(){retained--;}};
 loads.shift().done(null,rig);P.attachments(hud,rt);record=rt._presentation.nodes.get(projectile);assert(record.skeleton);assert.equal(record.skeleton.premultipliedAlpha,false);assert.deepEqual(skins,['lv3']);assert.equal(record.node.x,70);assert.equal(record.node.y,40);
 P.clear(rt);assert.equal(retained,0);assert(record.node.destroyed);
});

test('tier trails render on active arrows at world positions, release on retirement and ignore late loads',()=>{
 const vm=require('node:vm'),loads=[],catalog=JSON.parse(fs.readFileSync(path.join(root,'assets/resources/projectiles/catalog.json'))),config=JSON.parse(fs.readFileSync(path.join(root,'assets/KinghtFallConfig/GameJsonCfg.json')));let retained=0;
 class Node{constructor(){this.children=[];this.components=[];this.x=this.y=0;this.active=true;}setParent(parent){this.parent=parent;parent.children.push(this);}getPosition(){return{x:this.x,y:this.y};}setPosition(p){this.x=p.x;this.y=p.y;}convertToWorldSpaceAR(p){return{x:p.x+this.x,y:p.y+this.y};}convertToNodeSpaceAR(p){return{x:p.x-this.x,y:p.y-this.y};}getComponent(Type){return this.components.find(component=>component instanceof Type);}addComponent(Type){const component=new Type();component.node=this;this.components.push(component);return component;}destroy(){this.destroyed=true;}}
 class Skeleton{setSkin(){}setAnimation(){return{};}}class MotionStreak{reset(){this.resets=(this.resets||0)+1;}}
 const load=(resource,type,done)=>loads.push({resource,type,done}),cc={Node,MotionStreak,Sprite:class{},SpriteFrame:class{},Texture2D:class{},v2:(x,y)=>({x,y}),color:value=>value,isValid:value=>!!value&&!value.destroyed,resources:{load},assetManager:{getBundle:()=>({load})}},sp={Skeleton,SkeletonData:class{}},Looks={},P={};
 vm.runInNewContext(fs.readFileSync(path.join(root,'assets/_script/ProjectileLooks.js'),'utf8'),{exports:Looks,cc,sp,require});Looks.prime(catalog);
 vm.runInNewContext(fs.readFileSync(path.join(root,'assets/_script/HeroSkillPresentation.js'),'utf8'),{exports:P,cc,sp,require:name=>name==='./ProjectileLooks'?Looks:name.startsWith('./')?require(path.join(root,'assets/_script',name)):{} });
 const main=new Node(),hero={node:new Node()};hero.node._combatGeneration=1;hero.node.setParent(main);
 const settings=Settings.defaults('skirmisher'),projectile={x:70,y:40,width:28,direction:{x:.8,y:.6},speed:100,travelled:10},before=structuredClone(projectile),rt={settings,hero,heroGeneration:1,state:{style:'skirmisher',time:.1},projectiles:[projectile],effects:[],game:{ndMain:main,gameData:{},_combatEpoch:1},available:()=>true},hud={visual:{node:new Node()}};
 const texture={addRef(){retained++;return this;},decRef(){retained--;}};let previous;
 for(const level of [1,6,11,16,21]){
   const asset=Looks.skillAsset(catalog,config,level);Object.assign(settings.visual,{projectile:asset.id,projectileAsset:asset});P.attachments(hud,rt);
   for(const request of loads.splice(0))request.done(null,request.type===cc.Texture2D?texture:{...texture,skeletonJson:{skeleton:{x:0,y:0,width:40,height:12},skins:[{name:asset.skin}],animations:{jian:{}}}});
   P.attachments(hud,rt);const record=rt._presentation.nodes.get(projectile),trail=record.trailNode,streak=trail.getComponent(MotionStreak);
   if(previous)assert(previous.destroyed);assert.equal(trail.parent,hud.visual.node);assert(Math.abs(trail.x-(70-64*.8))<1e-8);assert(Math.abs(trail.y-(40-64*.6))<1e-8);assert.equal(streak.color,asset.trail.color);assert.equal(streak.stroke,asset.trail.width);assert.equal(streak.fadeTime,asset.trail.lifetime);assert.equal(streak.resets,1);assert.equal(retained,2);
   projectile.x+=5;P.attachments(hud,rt);assert(Math.abs(trail.x-(75-64*.8))<1e-8);assert.equal(streak.resets,1,'Updating flight reset the existing streak');projectile.x-=5;previous=trail;
 }
 assert.deepEqual(projectile,before);rt.projectiles=[];P.attachments(hud,rt);assert(previous.destroyed);assert.equal(rt._presentation.nodes.size,0);P.clear(rt);assert.equal(retained,0);
 P.attachments(hud,rt);const late=loads.splice(0);assert(late.length>0);P.clear(rt);for(const request of late)request.done(null,texture);assert.equal(retained,0);assert.equal(rt._presentation,undefined);
});
