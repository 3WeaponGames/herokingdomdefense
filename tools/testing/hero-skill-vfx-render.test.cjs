'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const Settings=require('../../assets/_script/HeroSkillSettings'),Core=require('../../assets/_script/HeroStyleSkills'),Catalog=require('../../assets/_script/HeroSkillVFXCatalog');
const VanguardSpear=require('../../assets/_script/VanguardSpearVFX');
function fixture(style,modern=false){
 class Node{constructor(name){this.name=name;this.children=[];this.x=this.y=0;this.zIndex=0;this.active=true;}setParent(parent){this.parent=parent;parent.children.push(this);}getPosition(){return{x:this.x,y:this.y};}setPosition(p,y){this.x=typeof p==='number'?p:p.x;this.y=typeof p==='number'?y:p.y;}setContentSize(width,height){this.width=width;this.height=height;}convertToWorldSpaceAR(p){return{x:p.x+this.x,y:p.y+this.y};}convertToNodeSpaceAR(p){return{x:p.x-this.x,y:p.y-this.y};}addComponent(Type){const value=new Type();value.node=this;this.component=value;return value;}destroy(){this.destroyed=true;if(this.parent)this.parent.children=this.parent.children.filter(n=>n!==this);}}
 class SpriteFrame{constructor(texture,rect){this.texture=texture;this.rect=rect;}destroy(){this.destroyed=true;}}
 const loads=[],assets=[],cc={Node,Sprite:class{static SizeMode={CUSTOM:0};},SpriteFrame,isValid:n=>!!n&&!n.destroyed,v2:(x,y)=>({x,y}),size:(width,height)=>({width,height}),rect:(x,y,width,height)=>({x,y,width,height}),color:value=>value,resources:{load(resource,_type,done){loads.push({resource,done});}},assetManager:{}};
 const sp={SkeletonData:class{},Skeleton:class{setAnimation(_track,name,loop){return this.track={name,loop,trackTime:0};}update(){}}};
 const exported={};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../../assets/_script/HeroSkillPresentation.js'),'utf8'),{exports:exported,cc,sp,require:name=>name.startsWith('./')?require(path.join(__dirname,'../../assets/_script',name)):name==='BattleSounds'?{}:{}});
 const main=new Node('world'),hero={node:new Node('hero'),hp:500,hpMax:1000,getAttWpos:()=>({x:0,y:70})};hero.node.setParent(main);hero.node.zIndex=10;hero.node._combatGeneration=1;
 const rt={hero,heroGeneration:1,state:Core.createState(style),settings:Settings.defaults(style),projectiles:[],effects:[],game:{ndMain:main,_combatEpoch:1,gameData:{}},available:()=>true},hud={visual:{node:new Node('HUD')}};
 if(!modern){const v=rt.settings.visual;v.castResource='';v.castSecondaryResource='';v.channelHitResource='';v.presenceResource='';v.defenseResource='';v.physicalShieldResource='';
  if(style==='mystic')Settings.applyClip(v,'beamResource',Catalog.clips.find(c=>c.id==='mystic-beam-body-loop'));
  if(style==='guardian'){Settings.applyClip(v,'buffResource',Catalog.clips.find(c=>c.id==='guardian-runic-shield'));Settings.applyClip(v,'tauntResource',Catalog.clips.find(c=>c.id==='guardian-taunt-test'));Settings.applyClip(v,'shieldResource',Catalog.clips.find(c=>c.id==='guardian-body-shield-loop'));}
 }
 function finish(){for(const load of loads.splice(0)){const clip=Catalog.clips.find(c=>c.resource===load.resource);assert(clip||load.resource===VanguardSpear.accentsResource);const asset={skeletonJson:clip?.kind==='spine'?JSON.parse(fs.readFileSync(path.join(__dirname,'../../assets/resources',clip.resource+'.json'))):undefined,refs:0,clones:[],getRect:()=>({x:0,y:0,width:clip.columns*clip.cell,height:Math.ceil(clip.frames/clip.columns)*clip.cell}),addRef(){this.refs++;return this;},decRef(){this.refs--;},clone(){const frame={setRect(rect){this.rect=rect;},setOriginalSize(){},setOffset(){},destroy(){this.destroyed=true;}};this.clones.push(frame);return frame;}};assets.push(asset);load.done(null,asset);}}
 function target(x=150){const node=new Node('enemy');node.x=x;node._combatGeneration=1;return{node,hp:1000};}
 return{P:exported,rt,hud,hero,main,loads,assets,finish,target,paint(){exported.attachments(hud,rt);}};
}

test('Vanguard jabs follow the equipped atlas and restore the held weapon layers after the effect',()=>{
 const f=fixture('vanguard',true),slot={getAttachment:()=>({getPath:()=>'item_spear'})};
 function rig(tier){
  const page=`item-4-tier-${tier}-vanguard_wqyl_lead_gong`;
  const texture={refs:0,addRef(){this.refs++;},decRef(){this.refs--;}};
  const atlasText=fs.readFileSync(path.join(__dirname,'../../assets/resources/hero-items/baked',page+'.atlas'),'utf8');
  return {atlasText,textures:[texture],textureNames:[page+'.png']};
 }
 const blue=rig('lv_blue'),gold=rig('lv4');
 const main={enabled:true,findSlot:name=>name===VanguardSpear.slotName?slot:null,skeletonData:blue};
 const offhand={enabled:true},hands={enabled:true};
 f.hero.ctrPlayAni={spAniBow:main,spAniArrow:offhand,spAniHand:hands};
 const clip=Catalog.clips.find(VanguardSpear.selected);
 f.rt.skillCast={key:1,at:0,origin:{x:30,y:80},direction:{x:1,y:0},radius:155};
 f.P.preload(f.rt);
 assert.equal(f.loads.filter(load=>load.resource===VanguardSpear.accentsResource).length,1);
 f.finish();
 const art=()=>[...f.rt._presentation.styleArts.values()].find(value=>value.ownerKey.startsWith(clip.uuid+'|'));
 const record=()=>[...art().nodes.values()][0];
 const render=frame=>{f.rt.state.time=(frame+.01)/clip.fps;f.paint();};

 render(34);
 assert(main.enabled&&offhand.enabled);
 render(35);
 assert(!main.enabled&&!offhand.enabled&&hands.enabled);
 assert.equal(record().sprite.enabled,false);
 assert.equal(record().spearJabs.source.texture,blue.textures[0]);

 render(80);
 const accents=f.rt._presentation.spearAccents.asset;
 const active=()=>record().spearJabs.sprites.filter(sprite=>sprite.node.active);
 const wind=()=>active().filter(sprite=>sprite.spriteFrame.texture===accents);
 const spears=()=>active().filter(sprite=>sprite.spriteFrame.texture===blue.textures[0]);
 assert.equal(wind().length,3);
 assert.deepEqual(spears().map(sprite=>sprite.node.width),[48,48,48]);
 const oldHeight=spears()[0].node.height,oldOpacity=spears().map(sprite=>sprite.node.opacity);
 const near=(actual,expected)=>assert(Math.abs(actual-expected)<1e-9,`${actual} != ${expected}`);
 const tip=({node})=>[node.x+node.width*Math.cos(node.angle*Math.PI/180),node.y+node.width*Math.sin(node.angle*Math.PI/180)];
 Object.assign(f.rt.settings.visual,{castAreaScale:.5,castSpearScale:.35});
 f.paint();
 assert.deepEqual(spears().map(sprite=>sprite.node.opacity),oldOpacity);
 spears().forEach((spear,i)=>{
  near(spear.node.width,48*.35);near(spear.node.height,oldHeight*.35);
  near(wind()[i].node.width,48*Math.sqrt(.5));
  tip(spear).forEach((axis,k)=>near(axis,tip(wind()[i])[k]));
 });
 const windGeometry=()=>wind().map(({node})=>[node.x,node.y,node.angle,node.width,node.height,node.opacity]);
 const originalWind=windGeometry();
 f.rt.settings.visual.castSpearLengthScale=1.5;
 f.paint();
 assert.deepEqual(windGeometry(),originalWind);
 assert.deepEqual(spears().map(sprite=>sprite.node.opacity),oldOpacity);
 spears().forEach((spear,i)=>{
  near(spear.node.width,48*.35*1.5);near(spear.node.height,oldHeight*.35);
  tip(spear).forEach((axis,k)=>near(axis,tip(wind()[i])[k]));
 });
 f.rt.settings.visual.castAreaScale=1;
 f.paint();
 near(wind()[0].node.width,48);
 near(spears()[0].node.width,48*.35*1.5);
 const oldFrames=[...record().spearJabs.frames.values()];
 main.skeletonData=gold;
 render(81);
 assert.equal(record().spearJabs.source.texture,gold.textures[0]);
 assert.equal(blue.textures[0].refs,0);
 assert(oldFrames.every(frame=>frame.destroyed));

 render(124);
 assert(!main.enabled&&!offhand.enabled);
 render(125);
 assert(main.enabled&&offhand.enabled);
 render(80);
 f.P.suspend(f.rt);
 assert(main.enabled&&offhand.enabled);
 f.paint();
 assert(!main.enabled&&!offhand.enabled);
 f.rt.skillCast=null;
 f.paint();
 assert(main.enabled&&offhand.enabled);
 assert.equal(gold.textures[0].refs,0);
 f.P.clear(f.rt);
 assert(f.assets.every(asset=>asset.refs===0));
});
test('Fighter draws the sprite activation once and releases its frame owner after teardown',()=>{
 const f=fixture('fighter'),state=f.rt.state;
 for(let i=0;i<9;i++)Core.onHit(state,{}, {strikeId:i});
 f.paint();assert.equal(f.loads.length,0);
 Core.onHit(state,{}, {strikeId:9});f.paint();assert.equal(f.loads.length,1);
 f.finish();f.paint();const art=[...f.rt._presentation.styleArts.values()][0],record=[...art.nodes.values()][0];
 assert.equal(record.node.parent,f.hud.visual.node);assert.equal(record.entity.clip.id,'fighter-stack-activation');assert.equal(record.entity.loop,false);
 Core.step(state,.5,{});Core.onHit(state,{}, {strikeId:10});f.paint();
 assert.equal([...art.nodes.values()][0],record);assert.equal(record.entity.age,.5);
 Core.step(state,2,{});f.paint();assert.equal(art.nodes.size,0);assert.equal(state.stackRemaining,3);
 Core.onHit(state,{}, {strikeId:11});f.paint();assert.equal(art.nodes.size,0);
 const asset=f.assets[0];f.P.clear(f.rt);assert.equal(asset.refs,0);assert(asset.clones.every(c=>c.destroyed));
});
test('late resources cannot attach to retired state and disabled slots remove the world aura',()=>{
 const f=fixture('bruiser');f.paint();assert.equal(f.loads.length,1);f.P.clear(f.rt);f.finish();assert.equal(f.assets[0].refs,0);assert.equal(f.main.children.length,1);f.paint();f.finish();f.paint();assert.equal(f.main.children.length,1);assert.equal(f.hero.node.children.length,1);f.rt.settings.visual.passiveResource='';f.paint();assert.equal(f.hero.node.children.length,0);assert.equal(f.assets.at(-1).refs,0);
});
test('Mystic keeps its mark while the old beam is replaced by bounded trail state and rejects recycled targets',()=>{
 const f=fixture('mystic'),target=f.target();f.rt.state.target=target;f.rt.state.marked=true;f.rt.channelTarget=f.rt.beamTarget=target;f.rt.beamHoldSource=.2;f.rt.beamSourceTime=.2;f.rt.beamGeneration=f.rt.beamVisibleGeneration=f.rt.markGeneration=1;f.paint();assert.equal(f.loads.length,1);f.finish();f.paint();const arts=f.rt._presentation.styleArts;assert(![...arts.values()].some(a=>a.resourceKey.includes('mystic-beam')));
 f.rt.state.time=.6;f.paint();f.finish();f.paint();assert.equal(f.loads.length,0);assert(f.rt._presentation.mysticTrail.legs.length);target.hp=0;f.rt.state.time=.7;f.paint();assert.equal(f.rt._presentation.vfxFrame.active.mark,false);f.finish();f.rt.state.time=1;f.paint();assert.equal(f.rt._presentation.mysticTrail.legs.length,0);assert([...arts.values()].every(a=>!a.nodes.size));
 target.hp=10;target.node._combatGeneration=2;f.rt.state.time=1.1;f.paint();assert.equal(f.rt._presentation.vfxFrame.entities.length,0);f.P.clear(f.rt);assert(f.assets.every(a=>a.refs===0));
});
test('Guardian aura follows the actual shield rather than the short cast ring',()=>{
 const f=fixture('guardian');f.rt.state.shield=200;f.rt.state.shieldRemaining=5;f.paint();f.finish();f.rt.state.time=2;f.paint();assert.equal(f.main.children.length,2);f.rt.state.shield=0;f.rt.state.shieldRemaining=3;f.paint();assert.equal(f.main.children.length,1);f.P.clear(f.rt);
});
test('Guardian rents one ground ring at taunt impact and releases it after the sheet finishes',()=>{
 const f=fixture('guardian',true),ground=new f.main.constructor('ground');
 ground.x=8;ground.y=-4;f.rt.game.ndDown=ground;
 f.rt.skillCast={key:1,at:0,origin:{x:28,y:12},radius:170,direction:{x:-1,y:0}};
 f.rt.state.time=.2;f.paint();assert(!f.loads.some(row=>row.resource.endsWith('guardian-taunt-ring')));
 f.rt.skillCast.impactAt=.25;f.rt.state.time=.26;f.paint();f.finish();f.paint();
 const art=[...f.rt._presentation.styleArts.values()].find(a=>a.resourceKey.includes('guardian-taunt-ring'));
 assert.equal(art.nodes.size,1);const {node,entity}=art.nodes.values().next().value;
 assert.equal(node.parent,ground);
 assert.equal(node.x,20);assert.equal(node.y,16);
 assert.equal(node.scaleX*entity.clip.cell,340);assert.equal(node.scaleY*entity.clip.cell,340);
 assert.equal(node.angle,0);assert.equal(entity.loop,false);
 f.rt.state.time=.86;f.paint();assert.equal(art.nodes.size,0);
 f.P.clear(f.rt);assert(f.assets.every(asset=>asset.refs===0));
});
test('Guardian protected-ally artwork uses the same authored inclusive radius as damage reduction',()=>{
 const f=fixture('guardian',true),edge=f.target(75),outside=f.target(75.01);f.rt.game.gameData.getSoldierList=()=>[edge,outside];f.rt.state.tuning.allyRadius=75;f.rt.settings.visual.scale=10;
 let frame=f.P.advanceVFX(f.rt),targets=f.rt._presentation.vfxContext.presenceTargets;assert.equal(targets.length,1);assert.equal(targets[0].id,edge);assert.equal(frame.entities.filter(e=>e.slot==='presence').length,1);
 f.rt.state.tuning.allyRadius=100;frame=f.P.advanceVFX(f.rt);assert.equal(frame.entities.filter(e=>e.slot==='presence').length,2);
 f.rt.state.tuning.allyReduction=0;frame=f.P.advanceVFX(f.rt);assert.equal(frame.entities.filter(e=>e.slot==='presence').length,0);f.P.clear(f.rt);
});
test('Mystic retains only its mark phase artwork and preloads it once without creating visuals',()=>{
 const f=fixture('mystic');f.P.preload(f.rt);assert.equal(f.loads.length,2);assert.equal(f.main.children.length,1);assert.equal(f.hud.visual.node.children.length,0);f.P.preload(f.rt);assert.equal(f.loads.length,2);f.finish();assert.equal(f.assets.length,2);f.P.preload(f.rt);assert.equal(f.loads.length,0);f.P.clear(f.rt);assert(f.assets.every(a=>a.refs===0));
});

test('one Mystic attachment pass samples its live VFX anchors once and refreshes them on the next pass',()=>{
 const f=fixture('mystic'),target=f.target();let samples=0;f.hero.getAttWpos=()=>{samples++;return{x:f.hero.node.x,y:70};};
 f.rt.state.target=target;f.rt.state.marked=true;f.rt.channelTarget=f.rt.beamTarget=target;f.rt.beamGeneration=f.rt.beamVisibleGeneration=f.rt.markGeneration=1;
 f.paint();assert.equal(samples,1);f.hero.node.x=37;f.paint();assert.equal(samples,2);assert.equal(f.rt._presentation.vfxContext.origin.x,37);f.P.clear(f.rt);
});

test('Skirmisher skill presentation skips the cast atlas and leaves flight visuals to the native arrow',()=>{
 const f=fixture('skirmisher',true);let samples=0;f.hero.getAttWpos=()=>{samples++;return{x:13,y:77};};
 f.rt.skillCast={key:1,at:0,impactAt:.2,origin:{x:30,y:80},direction:{x:1,y:0},radius:250};f.rt.state.time=.3;
 f.rt.projectiles.push({bullet:{},x:4,y:7,direction:{x:1,y:0}});
 f.P.preload(f.rt);f.paint();assert.equal(samples,0);assert.equal(f.loads.length,0);
 f.rt.settings.visual.beamResource='custom';f.P.advanceVFX(f.rt);assert.equal(samples,1,'An authored cross-style beam must retain its live weapon anchor');f.P.clear(f.rt);
});

test('passive and buff may share one atlas without inheriting the other slot tint, opacity or scale',()=>{
 const f=fixture('fighter'),clip=Catalog.clips.find(c=>c.id==='mystic-beam-body-loop');
 Settings.applyClip(f.rt.settings.visual,'passiveResource',clip);Settings.applyClip(f.rt.settings.visual,'buffResource',clip);
 Object.assign(f.rt.settings.visual,{passiveOpacity:.2,passiveColor:'#111111',buffOpacity:.8,buffColor:'#eeeeee',buffScale:2});
 Object.assign(f.rt.state,{stacks:10,stackRemaining:5,stackBuffAt:0,buffRemaining:10});
 f.paint();f.finish();f.paint();const art=[...f.rt._presentation.styleArts.values()].find(a=>a.resourceKey.includes(clip.uuid)),mark=[...art.nodes.values()].find(r=>r.entity.slot==='buff'),body=[...art.nodes.values()].find(r=>r.entity.slot==='passive');
 assert(mark&&body);assert.equal(mark.node.opacity,204);assert.equal(mark.node.color,'#eeeeee');assert.equal(mark.node.scaleX,2);assert.equal(body.node.opacity,51);assert.equal(body.node.color,'#111111');
 assert.equal(f.assets.filter(a=>a===art.asset).length,1,'Shared atlas should retain a single owner');f.P.clear(f.rt);assert(f.assets.every(a=>a.refs===0));
});

test('a preloaded atlas with different authored playback metadata keeps independent frame caches',()=>{
 const f=fixture('fighter'),clip=Catalog.clips.find(c=>c.id==='mystic-beam-body-loop');
 Settings.applyClip(f.rt.settings.visual,'passiveResource',clip);Settings.applyClip(f.rt.settings.visual,'buffResource',clip);
 // Non-catalog custom atlases can use the same UUID with different playback.
 f.rt.settings.visual.buffResourceAnimation='alternate';
 Object.assign(f.rt.state,{stacks:10,stackRemaining:5,stackBuffAt:0,buffRemaining:10});
 f.P.preload(f.rt);f.finish();f.paint();f.finish();f.paint();
 const uses=[...f.rt._presentation.styleArts.values()].filter(a=>a.resourceKey.includes(clip.uuid));assert.equal(uses.length,2);assert.notEqual(uses[0].frames,uses[1].frames);assert(uses.every(a=>a.asset.refs===1));
 f.P.clear(f.rt);assert(f.assets.every(a=>a.refs===0));
});

test('every taunted enemy owns one overhead sprite; movement, expiry, death and recycled lifetimes are fenced',()=>{
 const f=fixture('guardian'),a=f.target(100),b=f.target(200);function record(enemy,index){const taunt={started:f.rt.state.time,visualKey:'cast:'+f.rt.state.time+':'+index,enemyGeneration:enemy.node._combatGeneration,data:f.rt.game.gameData,epoch:1,remaining:4};enemy._heroTaunt=taunt;return{enemy,taunt};}f.rt.taunted=[record(a,0),record(b,1)];f.paint();f.finish();f.paint();const art=[...f.rt._presentation.styleArts.values()].find(a=>a.resourceKey.includes('guardian-taunt-test'));assert.equal(art.nodes.size,2);const node=[...art.nodes.values()][0].node,position=node.x;a.node.x+=30;f.rt.state.time=.5;f.paint();assert.equal(node.x,position+30);assert.equal(art.nodes.size,2);assert.equal(f.loads.length,0);b.node._combatGeneration++;f.paint();assert.equal(art.nodes.size,1);a.hp=0;f.paint();assert.equal(art.nodes.size,0);a.hp=100;f.rt.state.time=2;f.paint();assert.equal(art.nodes.size,0,'a taunt remaining active does not restart the one-shot');f.rt.taunted=[record(a,2)];f.paint();assert.equal(art.nodes.size,1);f.P.clear(f.rt);assert(f.assets.every(a=>a.refs===0));assert.equal(f.hud.visual.node.children.length,0);
});
test('Guardian body shield draws in front of the hero and preloads its complete fixed phase set',()=>{
 const f=fixture('guardian');f.P.preload(f.rt);assert.equal(f.loads.length,5);f.finish();f.rt.state.shield=200;f.rt.state.shieldRemaining=5;f.paint();let art=[...f.rt._presentation.styleArts.values()].find(a=>a.resourceKey.includes('guardian-body-shield-start'));assert.equal(art.nodes.size,1);assert.equal([...art.nodes.values()][0].node.parent,f.hud.visual.node);f.rt.state.time=1;f.paint();assert.equal(art.nodes.size,0);art=[...f.rt._presentation.styleArts.values()].find(a=>a.resourceKey.includes('guardian-body-shield-loop'));assert.equal(art.nodes.size,1);f.rt.state.shield=0;f.paint();assert.equal(art.nodes.size,0);const end=[...f.rt._presentation.styleArts.values()].find(a=>a.resourceKey.includes('guardian-body-shield-end'));assert.equal(end.nodes.size,1);f.rt.state.time=2;f.paint();assert.equal(end.nodes.size,0);f.P.clear(f.rt);assert(f.assets.every(a=>a.refs===0));
});

test('Guardian body shield follows the actual scaled actor body anchor instead of a fixed world height',()=>{
 const f=fixture('guardian'),bar=new f.hero.node.constructor('HP');bar.y=150;f.hero.ctrHp={node:bar};f.rt.state.shield=100;f.rt.state.shieldRemaining=5;f.rt.settings.visual.targetY=500;f.paint();f.finish();f.paint();const art=[...f.rt._presentation.styleArts.values()].find(a=>a.resourceKey.includes('guardian-body-shield-start')),node=[...art.nodes.values()][0].node;assert.equal(node.y,82.5);bar.y=50;f.paint();assert.equal(node.y,27.5);f.rt.settings.visual.shieldOffsetY=8;f.paint();assert.equal(node.y,35.5);f.P.clear(f.rt);
});

test('a fresh beam onset restarts the three-part VFX even for the same target and generation',()=>{
 const f=fixture('mystic'),target=f.target();f.rt.channelTarget=f.rt.beamTarget=target;f.rt.beamGeneration=f.rt.beamVisibleGeneration=1;f.rt.beamVisibleSince=0;f.paint();f.finish();f.paint();
 f.rt.state.time=.4;f.paint();assert.equal(f.rt._presentation.vfxFrame.entities.find(e=>e.slot==='beam'&&e.phase==='loop').age,.4);
 f.rt.beamVisibleSince=.4;f.paint();assert.equal(f.rt._presentation.vfxFrame.entities.find(e=>e.slot==='beam'&&e.phase==='loop').age,0);
 f.rt.state.time=.45;f.paint();assert(Math.abs(f.rt._presentation.vfxFrame.entities.find(e=>e.slot==='beam'&&e.phase==='loop').age-.05)<1e-9);f.P.clear(f.rt);assert(f.assets.every(a=>a.refs===0));
});

test('a shared Guardian atlas retains one owner while its aura stays behind and body shield stays in front',()=>{
 const f=fixture('guardian'),clip=Catalog.clips.find(c=>c.slot==='buff');Settings.applyClip(f.rt.settings.visual,'buffResource',clip);Settings.applyClip(f.rt.settings.visual,'shieldResource',clip);f.rt.state.shield=200;f.rt.state.shieldRemaining=5;f.paint();f.finish();f.paint();
 const art=[...f.rt._presentation.styleArts.values()].find(a=>a.resourceKey.includes(clip.uuid)),aura=[...art.nodes.values()].find(r=>r.entity.slot==='buff'),shield=[...art.nodes.values()].find(r=>r.entity.slot==='shield');
 assert(aura&&shield);assert.equal(aura.node.parent,f.main);assert.equal(shield.node.parent,f.hud.visual.node);assert.equal(art.asset.refs,1);f.P.clear(f.rt);assert(f.assets.every(a=>a.refs===0));
});

test('same-generation replacement target nodes retire old beams and marks rather than transplanting their artwork',()=>{
 const f=fixture('mystic'),target=f.target(),original=target.node;f.rt.state.target=target;f.rt.state.marked=true;f.rt.channelTarget=f.rt.beamTarget=target;f.rt.beamGeneration=f.rt.beamVisibleGeneration=f.rt.markGeneration=1;f.rt.beamNode=f.rt.beamVisibleNode=f.rt.markNode=original;f.paint();f.finish();f.paint();
 target.node=f.target(300).node;f.rt.state.time=.1;f.paint();assert.equal(f.rt._presentation.vfxFrame.active.mark,false);assert.equal(f.rt._presentation.vfxFrame.active.beam,false);
 f.rt.markNode=target.node;f.paint();assert.equal(f.rt._presentation.vfxFrame.entities.find(e=>e.slot==='mark').age,0);f.P.clear(f.rt);assert(f.assets.every(a=>a.refs===0));
});


test('ground-only passive auras follow live hero positions without sampling unused weapon or body anchors',()=>{
 for(const style of ['fighter','bruiser']){
  const f=fixture(style);Object.assign(f.rt.state,{stacks:10,stackRemaining:5,stackBuffAt:0,charge:.6});
  f.hero.getAttWpos=()=>{throw Error(style+' sampled an unused weapon origin');};
  f.hero.ctrHp={node:{convertToWorldSpaceAR(){throw Error(style+' sampled an unused body anchor');}}};
  f.paint();f.finish();f.paint();const art=[...f.rt._presentation.styleArts.values()][0],node=[...art.nodes.values()][0].node,world=()=>node.parent.convertToWorldSpaceAR(node.getPosition()),previous=world();
  f.hero.node.x+=37;f.hero.node.y-=21;f.rt.state.time=.1;f.paint();assert.equal(world().x,previous.x+37);assert.equal(world().y,previous.y-21);assert.equal(f.rt._presentation.vfxContext.heroBody,null);f.P.clear(f.rt);
 }
});

test('An authored Battle Cry aura follows the live ground pivot in battle and preview',()=>{
 const f=fixture('fighter',true),custom=Catalog.clips.find(clip=>clip.id==='guardian-runic-shield');
 Settings.applyClip(f.rt.settings.visual,'buffResource',custom);f.main.x=11;f.main.y=13;f.hero.node.x=37;f.hero.node.y=-19;let bodyReads=0;
 f.hero.ctrHp={node:{convertToWorldSpaceAR(){bodyReads++;throw Error('ground-only Fighter sampled its unused HP body anchor');}}};
 f.hero.getAttWpos=()=>{throw Error('ground-only Fighter sampled its unused weapon');};Object.assign(f.rt.settings.visual,{targetX:150,targetY:300,buffOffsetX:7,buffOffsetY:-3});f.rt.state.buffRemaining=10;
 const frame=f.P.advanceVFX(f.rt),context=f.rt._presentation.vfxContext,Layout=require('../../assets/_script/HeroSkillVFXLayout'),{Model}=require('../../packages/hkd-skills/preview-model'),preview=new Model('fighter',f.rt.settings,{mode:'basic'});
 preview.hero.x=f.hero.node.x;preview.hero.y=f.hero.node.y;preview.state.buffRemaining=10;preview.updateVFX();
 const at=Layout.entities(frame,f.rt.settings.visual,context).find(e=>e.slot==='buff'),expected=Layout.entities(preview.vfxFrame,preview.settings.visual,preview.vfxContext).find(e=>e.slot==='buff');
 assert.equal(bodyReads,0);assert.equal(context.origin,null);assert.equal(context.heroBody,null);assert(Math.abs(at.x-expected.x)<1e-9);assert(Math.abs(at.y-expected.y)<1e-9);assert.equal(at.x,f.hero.node.x+7);assert.equal(at.y,f.hero.node.y-3);
 f.paint();f.finish();f.paint();const art=[...f.rt._presentation.styleArts.values()].find(a=>a.resourceKey.includes(custom.uuid)),node=[...art.nodes.values()][0].node,displayed=f.main.convertToWorldSpaceAR(at);assert.equal(node.parent,f.hud.visual.node);assert.equal(node.x,displayed.x);assert.equal(node.y,displayed.y);
 f.hero.node.y+=21;f.rt.state.time=.1;f.paint();assert(Math.abs(node.y-displayed.y-21)<1e-9,'The custom aura follows the live ground transform');
 f.rt.state.buffRemaining=0;const reads=bodyReads;f.P.advanceVFX(f.rt);assert.equal(bodyReads,reads,'Expiry keeps the ground-only placement path');assert.equal(f.rt._presentation.vfxContext.heroBody,null);f.P.clear(f.rt);
});

test('Vanguard plays buff-up in front and both loops under the hero and HP bar at the horse pivot',()=>{
 const f=fixture('vanguard'),s=f.rt.state,target=f.target();
 const Node=f.hero.node.constructor,rider=new Node('ndPlay'),horse=new Node('wqyl_lead_ma'),bar=new Node('ndHp');
 rider.setParent(f.hero.node);horse.setParent(rider);bar.setParent(f.hero.node);
 rider.x=19;rider.y=11;horse.x=-7;horse.y=-9;
 horse.convertToWorldSpaceAR=p=>f.hero.node.convertToWorldSpaceAR({x:p.x+rider.x+horse.x,y:p.y+rider.y+horse.y});
 f.hero.ctrPlayAni={node:rider,spAniMa:{node:horse}};
 f.hero.getAttWpos=()=>{throw Error('Momentum sampled a weapon anchor');};
 bar.convertToWorldSpaceAR=()=>{throw Error('Momentum sampled the HP bar');};f.hero.ctrHp={node:bar};
 f.hero.node.x=32;f.hero.node.y=-15;
 f.P.preload(f.rt);
 assert.deepEqual(f.loads.map(row=>path.basename(row.resource)).sort(),['vanguard-buff-up','vanguard-full-buff','vanguard-incomplete-buff']);
 f.finish();
 const records=()=>[...f.rt._presentation.styleArts.values()].flatMap(art=>[...art.nodes.values()]);
 function checkLayer(record,behind){
  const parent=behind?f.hero.node:f.hud.visual.node;
  assert.equal(record.node.parent,parent);
  if(behind)assert(record.node.zIndex<rider.zIndex&&record.node.zIndex<bar.zIndex);
  assert.deepEqual(parent.convertToWorldSpaceAR(record.node.getPosition()),horse.convertToWorldSpaceAR({x:0,y:0}));
 }
 for(const [seconds,variant] of [[2,'incomplete'],[5,'full']]){
  Core.step(s,seconds,{moving:true});f.paint();assert.equal(records().length,0);
  Core.onHit(s,target);f.paint();assert.deepEqual(records().map(r=>r.entity.clip.id),['vanguard-buff-up']);checkLayer(records()[0],false);
  Core.step(s,.65,{});f.paint();
  const intro=records().find(record=>record.entity.clip.id==='vanguard-buff-up');
  const loop=records().find(record=>record.entity.clip.id==='vanguard-'+variant+'-buff');
  assert.equal(records().length,2);assert(intro&&loop);
  checkLayer(intro,false);checkLayer(loop,true);
  for(const record of [intro,loop])assert(record.node.opacity>0&&record.node.opacity<255);
  Core.step(s,.35,{});f.paint();assert.deepEqual(records(),[loop]);assert.equal(loop.node.opacity,255);
  f.hero.node.x+=45;f.hero.node.y-=32;horse.x+=22;horse.y-=8;f.paint();assert.equal(records()[0],loop);checkLayer(loop,true);
  assert.equal(loop.sprite.spriteFrame.rect.width,loop.entity.clip.cell);assert.equal(f.loads.length,0);
  Core.step(s,9,{});f.paint();assert.equal(records().length,0);
 }
 f.P.clear(f.rt);assert(f.assets.every(a=>a.refs===0));
});

test('Battle Cry draws no default aura during its active buff',()=>{
 const f=fixture('fighter',true);Core.beginActive(f.rt.state,{});
 f.hero.getAttWpos=()=>{throw Error('unused weapon');};
 f.hero.ctrHp={node:{convertToWorldSpaceAR(){throw Error('unused body');}}};
 const frame=f.P.advanceVFX(f.rt);
 assert.equal(frame.active.buff,true);assert.equal(frame.entities.some(e=>e.slot==='buff'),false);
 assert.equal(f.rt._presentation.vfxContext.heroBody,null);assert.equal(f.rt._presentation.vfxContext.origin,null);
 f.paint();assert.equal(f.loads.length,0);
 f.P.clear(f.rt);
});

test('Mystic keeps fresh weapon and body anchors during the beam end phase after both targets clear',()=>{
 const f=fixture('mystic'),target=f.target(),bar=new f.hero.node.constructor('HP');bar.y=150;f.hero.ctrHp={node:bar};let weaponReads=0,tip={x:5,y:70};
 f.hero.getAttWpos=()=>{weaponReads++;return{...tip};};f.rt.channelTarget=f.rt.beamTarget=target;f.rt.beamGeneration=f.rt.beamVisibleGeneration=1;
 f.P.advanceVFX(f.rt);assert.equal(weaponReads,1);f.rt.channelTarget=f.rt.beamTarget=null;tip={x:41,y:96};bar.y=180;f.rt.state.time=.1;
 const frame=f.P.advanceVFX(f.rt),context=f.rt._presentation.vfxContext;assert.equal(weaponReads,2);assert(frame.entities.some(e=>e.slot==='beam'&&e.phase==='end'));assert.equal(context.origin.x,41);assert.equal(context.origin.y,96);assert(Math.abs(context.heroBody.y-99)<1e-9);f.P.clear(f.rt);
});

test('custom cross-style beam resources retain the full live anchor path',()=>{
 const f=fixture('fighter'),clip=Catalog.clips.find(c=>c.id==='mystic-beam-body-loop');Settings.applyClip(f.rt.settings.visual,'beamResource',clip);let reads=0;f.hero.getAttWpos=()=>{reads++;return{x:10,y:80};};f.P.advanceVFX(f.rt);assert.equal(reads,1);assert.equal(f.rt._presentation.vfxContext.origin.y,80);assert(f.rt._presentation.vfxContext.heroBody);f.P.clear(f.rt);
});

test('the new Fighter and Bruiser slashes each begin at impact and render once at the hit origin',()=>{
 for(const [style,id] of [['fighter','fighter-crescent-slash'],['bruiser','bruiser-ring-slash']]){
  const f=fixture(style,true),state=f.rt.state,clip=Catalog.clips.find(row=>row.id===id);
  f.rt.skillCast={key:1,at:.1,origin:{x:12,y:25},direction:{x:0,y:1},radius:180};
  f.rt.skillArea=()=>({origin:{x:12,y:25},direction:{x:0,y:1},radius:180});
  state.time=.3;f.paint();f.finish();f.paint();
  const casts=()=>[...f.rt._presentation.styleArts.values()].flatMap(art=>[...art.nodes.values()]).filter(record=>record.entity.slot.startsWith('cast'));
  assert.equal(casts().length,0);
  state.time=.4;f.rt.skillCast.impactAt=.4;f.paint();f.finish();f.paint();
  assert.equal(casts().length,1);const record=casts()[0];assert.equal(record.entity.clip.id,id);assert.equal(record.entity.loop,false);
  assert.equal(record.node.x,12);assert.equal(record.node.y,25);
  state.time+=clip.frames/clip.fps+.01;f.paint();assert.equal(casts().length,0);
  f.P.clear(f.rt);assert(f.assets.every(asset=>asset.refs===0));
 }
});

test('disabling one modern aura releases its atlas while other cast assets stay selected',()=>{
 const f=fixture('fighter',true);Object.assign(f.rt.state,{stacks:10,stackRemaining:5,stackBuffAt:0});f.paint();f.finish();f.paint();const asset=f.assets[0];assert.equal(asset.refs,1);assert(f.rt.settings.visual.castResource);f.rt.settings.visual.passiveResource='';f.paint();assert.equal(asset.refs,0);assert.equal(f.main.children.length,1);f.P.clear(f.rt);
});

test('Blood Rage stays below the mounted hero and HP bar at every opacity',()=>{
 const f=fixture('bruiser',true),rider=new f.hero.node.constructor('rider'),hp=new f.hero.node.constructor('HP');
 rider.setParent(f.hero.node);hp.setParent(f.hero.node);
 f.hero.hp=900;f.paint();f.finish();f.paint();
 const record=[...f.rt._presentation.styleArts.values()].flatMap(art=>[...art.nodes.values()]).find(row=>row.entity.slot==='passive');
 assert.equal(record.entity.clip.id,'bruiser-flame-aura');assert.equal(record.entity.behind,true);
 assert.equal(record.node.parent,f.hero.node);assert(record.node.zIndex<rider.zIndex&&record.node.zIndex<hp.zIndex);
 assert.equal(record.node.opacity,26);const scale=[record.node.scaleX,record.node.scaleY];
 f.hero.hp=50;f.hero.node.x+=31;f.hero.node.y-=17;f.rt.state.time=.2;f.paint();
 assert.equal(record.node.x,0);assert.equal(record.node.y,0);assert.equal(record.node.opacity,255);
 assert.deepEqual([record.node.scaleX,record.node.scaleY],scale);f.P.clear(f.rt);assert(f.assets.every(asset=>asset.refs===0));
});

test('Cocos paints both cleaves using the saved source pivot, flips and separate scales',()=>{
 const f=fixture('bruiser',true);
 Settings.applyClip(f.rt.settings.visual,'castResource',Catalog.clips.find(clip=>clip.id==='bruiser-energy-cleave'));
 Settings.applyClip(f.rt.settings.visual,'castSecondaryResource',Catalog.clips.find(clip=>clip.id==='mystic-charged-burst'));
 Object.assign(f.rt.settings.visual,{castPivotX:31,castPivotY:-19,castScaleX:1.4,castScaleY:.7,castSecondaryPivotX:-27,castSecondaryPivotY:14,castSecondaryFlipY:true,castSecondaryScale:.8});
 for(const degrees of [-135,-45,45,135]){const a=degrees*Math.PI/180;f.rt.skillCast={key:degrees,at:0,impactAt:.2,origin:{x:12,y:80},direction:{x:Math.cos(a),y:Math.sin(a)},radius:175};f.rt.state.time=.3;f.paint();f.finish();f.paint();const records=[...f.rt._presentation.styleArts.values()].flatMap(art=>[...art.nodes.values()]).filter(row=>row.entity.slot==='cast'||row.entity.slot==='castSecondary');assert.equal(records.length,2);for(const r of records){const slot=r.entity.slot,clip=r.entity.clip,p={x:(clip.sourceCenterX||0)+f.rt.settings.visual[slot+'PivotX'],y:(clip.sourceCenterY||0)+f.rt.settings.visual[slot+'PivotY']},angle=r.node.angle*Math.PI/180,x=p.x*r.node.scaleX,y=p.y*r.node.scaleY,displayed={x:r.node.x+x*Math.cos(angle)-y*Math.sin(angle),y:r.node.y+x*Math.sin(angle)+y*Math.cos(angle)};assert(Math.abs(displayed.x-12)<1e-7);assert(Math.abs(displayed.y-80)<1e-7);assert.equal(r.node.parent,f.hud.visual.node);}}
 f.P.clear(f.rt);assert(f.assets.every(asset=>asset.refs===0));
});
