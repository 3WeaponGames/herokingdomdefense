'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const Settings=require('../../assets/_script/HeroSkillSettings'),Core=require('../../assets/_script/HeroStyleSkills'),Catalog=require('../../assets/_script/HeroSkillVFXCatalog');
function fixture(style,modern=false){
 class Node{constructor(name){this.name=name;this.children=[];this.x=this.y=0;this.zIndex=0;this.active=true;}setParent(parent){this.parent=parent;parent.children.push(this);}getPosition(){return{x:this.x,y:this.y};}setPosition(p){this.x=p.x;this.y=p.y;}convertToWorldSpaceAR(p){return{x:p.x+this.x,y:p.y+this.y};}convertToNodeSpaceAR(p){return{x:p.x-this.x,y:p.y-this.y};}addComponent(Type){const value=new Type();value.node=this;this.component=value;return value;}destroy(){this.destroyed=true;if(this.parent)this.parent.children=this.parent.children.filter(n=>n!==this);}}
 const loads=[],assets=[],cc={Node,Sprite:class{},SpriteFrame:class{},isValid:n=>!!n&&!n.destroyed,v2:(x,y)=>({x,y}),size:(width,height)=>({width,height}),rect:(x,y,width,height)=>({x,y,width,height}),color:value=>value,resources:{load(resource,_type,done){loads.push({resource,done});}},assetManager:{}};
 const sp={SkeletonData:class{},Skeleton:class{setAnimation(_track,name,loop){return this.track={name,loop,trackTime:0};}update(){}}};
 const exported={};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../../assets/_script/HeroSkillPresentation.js'),'utf8'),{exports:exported,cc,sp,require:name=>name.startsWith('./')?require(path.join(__dirname,'../../assets/_script',name)):name==='BattleSounds'?{}:{}});
 const main=new Node('world'),hero={node:new Node('hero'),hp:500,hpMax:1000,getAttWpos:()=>({x:0,y:70})};hero.node.setParent(main);hero.node.zIndex=10;hero.node._combatGeneration=1;
 const rt={hero,heroGeneration:1,state:Core.createState(style),settings:Settings.defaults(style),projectiles:[],effects:[],game:{ndMain:main,_combatEpoch:1,gameData:{}},available:()=>true},hud={visual:{node:new Node('HUD')}};
 if(!modern){const v=rt.settings.visual;v.castResource='';v.castSecondaryResource='';v.channelHitResource='';v.presenceResource='';v.defenseResource='';v.physicalShieldResource='';
  if(style==='mystic')Settings.applyClip(v,'beamResource',Catalog.clips.find(c=>c.id==='mystic-beam-body-loop'));
  if(style==='guardian'){Settings.applyClip(v,'buffResource',Catalog.clips.find(c=>c.id==='guardian-runic-shield'));Settings.applyClip(v,'tauntResource',Catalog.clips.find(c=>c.id==='guardian-taunt-test'));Settings.applyClip(v,'shieldResource',Catalog.clips.find(c=>c.id==='guardian-body-shield-loop'));}
 }
 function finish(){for(const load of loads.splice(0)){const clip=Catalog.clips.find(c=>c.resource===load.resource);assert(clip);const asset={skeletonJson:clip.kind==='spine'?JSON.parse(fs.readFileSync(path.join(__dirname,'../../assets/resources',clip.resource+'.json'))):undefined,refs:0,clones:[],getRect:()=>({x:0,y:0,width:clip.columns*clip.cell,height:Math.ceil(clip.frames/clip.columns)*clip.cell}),addRef(){this.refs++;return this;},decRef(){this.refs--;},clone(){const frame={setRect(rect){this.rect=rect;},setOriginalSize(){},setOffset(){},destroy(){this.destroyed=true;}};this.clones.push(frame);return frame;}};assets.push(asset);load.done(null,asset);}}
 function target(x=150){const node=new Node('enemy');node.x=x;node._combatGeneration=1;return{node,hp:1000};}
 return{P:exported,rt,hud,hero,main,loads,assets,finish,target,paint(){exported.attachments(hud,rt);}};
}
test('stack-driven aura shares one resource and immutable frames, renders behind the horse, and releases owned assets',()=>{
 const f=fixture('fighter');f.rt.state.stacks=5;f.rt.state.stackRemaining=10;f.paint();assert.equal(f.loads.length,1);f.finish();f.paint();const art=[...f.rt._presentation.styleArts.values()][0];assert.equal(art.nodes.size,1);for(const r of art.nodes.values()){assert.equal(r.node.parent,f.main);assert.equal(r.node.zIndex,9);assert.equal(r.node.anchorX,Catalog.clips.find(c=>c.id==='fighter-windup').anchorX);}
 for(let i=0;i<200;i++){f.rt.state.time=i/60;f.paint();}assert.equal(f.loads.length,0);assert(art.frames.size<=128);const asset=f.assets[0];assert.equal(asset.refs,1);f.P.suspend(f.rt);for(const r of art.nodes.values())assert.equal(r.node.active,false);f.paint();for(const r of art.nodes.values())assert.equal(r.node.active,true);f.P.clear(f.rt);assert.equal(asset.refs,0);assert(asset.clones.every(c=>c.destroyed));assert.equal(f.main.children.length,1);
});
test('late resources cannot attach to retired state and disabled slots remove the world aura',()=>{
 const f=fixture('bruiser');f.paint();assert.equal(f.loads.length,1);f.P.clear(f.rt);f.finish();assert.equal(f.assets[0].refs,0);assert.equal(f.main.children.length,1);f.paint();f.finish();f.paint();assert.equal(f.main.children.length,2);f.rt.settings.visual.passiveResource='';f.paint();assert.equal(f.main.children.length,1);assert.equal(f.assets.at(-1).refs,0);
});
test('Mystic paints a proportional three-part beam, one mark, bounded release tails and no stale target after recycling',()=>{
 const f=fixture('mystic'),target=f.target();f.rt.state.target=target;f.rt.state.marked=true;f.rt.channelTarget=f.rt.beamTarget=target;f.rt.beamHoldSource=.2;f.rt.beamSourceTime=.2;f.rt.beamGeneration=f.rt.beamVisibleGeneration=f.rt.markGeneration=1;f.paint();assert.equal(f.loads.length,4);f.finish();f.paint();const arts=f.rt._presentation.styleArts,body=[...arts.values()].find(a=>a.resourceKey.includes('mystic-beam-body-loop')),record=[...body.nodes.values()][0];assert(record.node.scaleX>record.node.scaleY);assert.equal(record.node.parent,f.hud.visual.node);
 f.rt.state.time=.6;f.paint();f.finish();f.paint();assert.equal(f.loads.length,0);target.hp=0;f.rt.state.time=.7;f.paint();assert.equal(f.rt._presentation.vfxFrame.active.mark,false);assert(f.rt._presentation.vfxFrame.entities.some(e=>e.phase==='end'));f.finish();f.rt.state.time=1;f.paint();assert.equal(f.rt._presentation.vfxFrame.entities.length,0);assert([...arts.values()].every(a=>!a.nodes.size));
 target.hp=10;target.node._combatGeneration=2;f.rt.state.time=1.1;f.paint();assert.equal(f.rt._presentation.vfxFrame.entities.length,0);f.P.clear(f.rt);assert(f.assets.every(a=>a.refs===0));
});
test('Guardian aura follows the actual shield rather than the short cast ring',()=>{
 const f=fixture('guardian');f.rt.state.shield=200;f.rt.state.shieldRemaining=5;f.paint();f.finish();f.rt.state.time=2;f.paint();assert.equal(f.main.children.length,2);f.rt.state.shield=0;f.rt.state.shieldRemaining=3;f.paint();assert.equal(f.main.children.length,1);f.P.clear(f.rt);
});
test('Guardian protected-ally artwork uses the same authored inclusive radius as damage reduction',()=>{
 const f=fixture('guardian',true),edge=f.target(75),outside=f.target(75.01);f.rt.game.gameData.getSoldierList=()=>[edge,outside];f.rt.state.tuning.allyRadius=75;f.rt.settings.visual.scale=10;
 let frame=f.P.advanceVFX(f.rt),targets=f.rt._presentation.vfxContext.presenceTargets;assert.equal(targets.length,1);assert.equal(targets[0].id,edge);assert.equal(frame.entities.filter(e=>e.slot==='presence').length,1);
 f.rt.state.tuning.allyRadius=100;frame=f.P.advanceVFX(f.rt);assert.equal(frame.entities.filter(e=>e.slot==='presence').length,2);
 f.rt.state.tuning.allyReduction=0;frame=f.P.advanceVFX(f.rt);assert.equal(frame.entities.filter(e=>e.slot==='presence').length,0);f.P.clear(f.rt);
});
test('Mystic phase textures preload once before combat without creating visuals and late loading remains owned',()=>{
 const f=fixture('mystic');f.P.preload(f.rt);assert.equal(f.loads.length,11);assert.equal(f.main.children.length,1);assert.equal(f.hud.visual.node.children.length,0);f.P.preload(f.rt);assert.equal(f.loads.length,11);f.finish();assert.equal(f.assets.length,11);f.P.preload(f.rt);assert.equal(f.loads.length,0);f.P.clear(f.rt);assert(f.assets.every(a=>a.refs===0));
});

test('beam and mark may share one atlas without inheriting the other slot tint, opacity or scale',()=>{
 const f=fixture('mystic'),clip=Catalog.clips.find(c=>c.id==='mystic-beam-body-loop'),target=f.target();
 Settings.applyClip(f.rt.settings.visual,'beamResource',clip);Settings.applyClip(f.rt.settings.visual,'markResource',clip);
 Object.assign(f.rt.settings.visual,{beamOpacity:.2,beamColor:'#111111',markOpacity:.8,markColor:'#eeeeee',markScale:2});
 f.rt.state.target=target;f.rt.state.marked=true;f.rt.channelTarget=f.rt.beamTarget=target;f.rt.beamGeneration=f.rt.beamVisibleGeneration=f.rt.markGeneration=1;
 f.paint();f.finish();f.paint();const art=[...f.rt._presentation.styleArts.values()].find(a=>a.resourceKey.includes(clip.uuid)),mark=[...art.nodes.values()].find(r=>r.entity.slot==='mark'),body=[...art.nodes.values()].find(r=>r.entity.slot==='beam');
 assert(mark&&body);assert.equal(mark.node.opacity,204);assert.equal(mark.node.color,'#eeeeee');assert.equal(mark.node.scaleX,2);assert.equal(body.node.opacity,51);assert.equal(body.node.color,'#111111');
 assert.equal(f.assets.filter(a=>a===art.asset).length,1,'Shared atlas should retain a single owner');f.P.clear(f.rt);assert(f.assets.every(a=>a.refs===0));
});

test('a preloaded atlas with different authored playback metadata keeps independent frame caches',()=>{
 const f=fixture('mystic'),clip=Catalog.clips.find(c=>c.id==='mystic-beam-body-loop'),target=f.target();
 Settings.applyClip(f.rt.settings.visual,'beamResource',clip);Settings.applyClip(f.rt.settings.visual,'markResource',clip);
 // Non-catalog custom atlases can use the same UUID with different playback.
 f.rt.settings.visual.markResourceAnimation='alternate';
 f.rt.state.target=target;f.rt.state.marked=true;f.rt.channelTarget=f.rt.beamTarget=target;f.rt.beamGeneration=f.rt.beamVisibleGeneration=f.rt.markGeneration=1;
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
 for(const style of ['fighter','vanguard','bruiser']){
  const f=fixture(style);f.rt.state.stacks=3;f.rt.state.stackRemaining=10;f.rt.state.charge=.6;
  f.hero.getAttWpos=()=>{throw Error(style+' sampled an unused weapon origin');};
  f.hero.ctrHp={node:{convertToWorldSpaceAR(){throw Error(style+' sampled an unused body anchor');}}};
  f.paint();f.finish();f.paint();const art=[...f.rt._presentation.styleArts.values()][0],node=[...art.nodes.values()][0].node,previous={x:node.x,y:node.y};
  f.hero.node.x+=37;f.hero.node.y-=21;f.rt.state.time=.1;f.paint();assert.equal(node.x,previous.x+37);assert.equal(node.y,previous.y-21);assert.equal(f.rt._presentation.vfxContext.heroBody,null);f.P.clear(f.rt);
 }
});

test('Fighter active Ki follows the live ground pivot and matches preview placement without sampling body or weapon',()=>{
 const f=fixture('fighter',true);f.main.x=11;f.main.y=13;f.hero.node.x=37;f.hero.node.y=-19;let bodyReads=0;
 f.hero.ctrHp={node:{convertToWorldSpaceAR(){bodyReads++;throw Error('ground-only Fighter sampled its unused HP body anchor');}}};
 f.hero.getAttWpos=()=>{throw Error('ground-only Fighter sampled its unused weapon');};Object.assign(f.rt.settings.visual,{targetX:150,targetY:300,buffOffsetX:7,buffOffsetY:-3});f.rt.state.buffRemaining=10;
 const frame=f.P.advanceVFX(f.rt),context=f.rt._presentation.vfxContext,Layout=require('../../assets/_script/HeroSkillVFXLayout'),{Model}=require('../../packages/hkd-skills/preview-model'),preview=new Model('fighter',f.rt.settings,{mode:'basic'});
 preview.hero.x=f.hero.node.x;preview.hero.y=f.hero.node.y;preview.state.buffRemaining=10;preview.updateVFX();
 const at=Layout.entities(frame,f.rt.settings.visual,context).find(e=>e.slot==='buff'),expected=Layout.entities(preview.vfxFrame,preview.settings.visual,preview.vfxContext).find(e=>e.slot==='buff');
 assert.equal(bodyReads,0);assert.equal(context.origin,null);assert.equal(context.heroBody,null);assert(Math.abs(at.x-expected.x)<1e-9);assert(Math.abs(at.y-expected.y)<1e-9);assert.equal(at.x,f.hero.node.x+7);assert.equal(at.y,f.hero.node.y-3);
 f.paint();f.finish();f.paint();const art=[...f.rt._presentation.styleArts.values()].find(a=>a.resourceKey.includes('fighter-meshy-center')),node=[...art.nodes.values()][0].node;assert.equal(node.parent,f.main);assert.equal(node.x,at.x);assert.equal(node.y,at.y);
 f.hero.node.y+=21;f.rt.state.time=.1;f.paint();assert(Math.abs(node.y-at.y-21)<1e-9,'Ki follows the live ground transform');
 f.rt.state.buffRemaining=0;const reads=bodyReads;f.P.advanceVFX(f.rt);assert.equal(bodyReads,reads,'expired Ki restores the no-body-anchor fast path');assert.equal(f.rt._presentation.vfxContext.heroBody,null);f.P.clear(f.rt);
});

test('grounded Vanguard buff and disabled Fighter Ki do not read body or weapon anchors',()=>{
 for(const style of ['fighter','vanguard']){const f=fixture(style,true);f.rt.state.buffRemaining=10;f.rt.state.buffStrength=.6;if(style==='fighter')f.rt.settings.visual.buffResource='';f.hero.getAttWpos=()=>{throw Error('unused weapon');};f.hero.ctrHp={node:{convertToWorldSpaceAR(){throw Error('unused body');}}};f.P.advanceVFX(f.rt);assert.equal(f.rt._presentation.vfxContext.heroBody,null);assert.equal(f.rt._presentation.vfxContext.origin,null);f.P.clear(f.rt);}
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

test('single native volley is drawn once and seeks its cropped source clock independently of the hit arc',()=>{
 const f=fixture('skirmisher',true),Timeline=require('../../assets/_script/HeroSkillTimeline');f.rt.skillCast={key:1,at:0,origin:{x:12,y:25},direction:{x:0,y:1},radius:0,duration:.56};f.rt.state.time=.3;f.paint();f.finish();f.paint();const art=[...f.rt._presentation.styleArts.values()].find(a=>a.resourceKey.includes('skirmisher-single-volley')),records=[...art.nodes.values()];assert.equal(records.length,1);const r=records[0];const clip=Catalog.clips.find(c=>c.id==='skirmisher-single-volley'),a=(90-62.345520429791684)*Math.PI/180;assert(Math.abs(r.node.x-(12-.16*(clip.originX*Math.cos(a)-clip.originY*Math.sin(a))))<1e-8);assert(Math.abs(r.node.y-(25-.16*(clip.originX*Math.sin(a)+clip.originY*Math.cos(a))))<1e-8);assert.equal(r.node.scaleX,.16);assert(Math.abs(r.node.angle-(90-62.345520429791684))<1e-8);assert.equal(r.track.trackTime,Timeline.skirmisherSourceTime(.3,f.rt.state.tuning,f.rt.settings.visual));assert.equal(r.track.name,'single_volley');assert.equal(r.skeleton.timeScale,0);f.P.clear(f.rt);assert(f.assets.every(a=>a.refs===0));
});

test('disabling one modern aura releases its atlas while other cast assets stay selected',()=>{
 const f=fixture('fighter',true);f.rt.state.stacks=5;f.rt.state.stackRemaining=10;f.paint();f.finish();f.paint();const asset=f.assets[0];assert.equal(asset.refs,1);assert(f.rt.settings.visual.castResource);f.rt.settings.visual.passiveResource='';f.paint();assert.equal(asset.refs,0);assert.equal(f.main.children.length,1);f.P.clear(f.rt);
});
