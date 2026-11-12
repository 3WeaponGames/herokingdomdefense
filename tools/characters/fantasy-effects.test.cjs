'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),{test}=require('node:test');
const root=path.resolve(__dirname,'../..'),Library=require('../../packages/hkd-characters/lib/unit-library'),Units=require('../../packages/game-data-editor/lib/unit-assets'),Renderer=require('../../packages/game-data-editor/preview/spine-renderer'),Bake=require('../../packages/hkd-characters/lib/native-bake');
const sources=Library.load(root).sources.filter(source=>source.pack.startsWith('fantasy-'));

test('Fantasy previews hide empty hit placeholders and keep real hit animations available',()=>{
 for(const source of sources){const json=Library.describe(root,source.id,true).layers[0].json;assert(!Renderer.animationNames(json).includes('hit'),source.id);assert(Renderer.animationNames(json).includes('attack'));}
 const json={_fantasy:{},slots:[{name:'body'}],animations:{hit:{slots:{body:{color:[{time:0,color:'ff0000ff'},{time:.16,color:'ffffffff'}]}}}}};assert(Renderer.animationNames(json).includes('hit'),'A real hit flash is still selectable');
});
test('particle import preserves all 166 original body animations, bones and authored event contracts',()=>{
 const crypto=require('node:crypto'),contracts=require('./fixtures/fantasy-body-animation-contracts.json'),hash=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');assert.equal(Object.keys(contracts).length,166);
 for(const source of sources){const rig=Library.describe(root,source.id,true).layers[0].json,animations=structuredClone(rig.animations);delete animations.__fx_ambient;for(const clip of Object.values(animations))for(const key of ['bones','slots'])for(const name of Object.keys(clip[key]||{}))if(name.startsWith('__fx/'))delete clip[key][name];assert.equal(hash(animations),contracts[source.id].animations,source.id+' body animation');assert.equal(hash(rig.bones.filter(bone=>!bone.name.startsWith('__fx/'))),contracts[source.id].bones,source.id+' bones');assert.equal(hash(rig.events||{}),contracts[source.id].events,source.id+' authored events');}
});
function skeleton(source){const spine=require(Units.enginePath()),description=Library.describe(root,source.id,true).layers[0],atlas=new spine.TextureAtlas(description.atlas,name=>{const bytes=fs.readFileSync(require('node:url').fileURLToPath(description.pages[name]));return new spine.FakeTexture({width:bytes.readUInt32BE(16),height:bytes.readUInt32BE(20)});}),data=new spine.SkeletonJson(new spine.AtlasAttachmentLoader(atlas)).readSkeletonData(description.json);return{spine,layer:{description,data,skeleton:new spine.Skeleton(data)}};}
function visibleFx(layer,prefix){return layer.skeleton.slots.filter(slot=>slot.data.name.startsWith(prefix)&&slot.color.a>.01);}
test('every attacking Fantasy unit has bounded native particles without changing its authored events or clip duration',()=>{
 let attacks=0;for(const source of sources){const {spine,layer}=skeleton(source),rig=layer.description.json,fx=rig._fantasy.effects;assert.equal(fx.version,1);assert(Object.keys(rig._fantasy.slots).every(slot=>!slot.startsWith('__fx/')));
   if((source.animationAliases||[]).includes('attack')){assert.equal(fx.attacks.length,0);continue;}
   attacks++;for(const cue of fx.attacks){const clip=layer.data.findAnimation(cue.animation);assert(cue.at<clip.duration);assert(cue.count<=16);const authored=(rig.animations[cue.animation].events||[]).find(event=>event.name==='attack');if(authored)assert.equal(cue.at,authored.time);
    Renderer.seek(spine,[layer],cue.animation,0,false);assert.equal(visibleFx(layer,'__fx/attack-').length,0);
    Renderer.seek(spine,[layer],cue.animation,cue.at+Math.min(.025,(clip.duration-cue.at)*.25),false);assert(visibleFx(layer,'__fx/attack-').length>0,source.id);
    assert(Renderer.geometry(spine,layer).every(piece=>[...piece.vertices].every(Number.isFinite)));
    Renderer.seek(spine,[layer],cue.animation,clip.duration,false);assert.equal(visibleFx(layer,'__fx/attack-').length,0);
    Renderer.seek(spine,[layer],'idle',0,false);assert.equal(visibleFx(layer,'__fx/attack-').length,0);
   }
 }assert.equal(attacks,164);
});
test('the three source emitters keep their rate, lifetime, colors, population limit and seamless independent loop',()=>{
 const ambient=sources.filter(source=>{const rig=Library.describe(root,source.id,true).layers[0].json;return !!rig._fantasy.effects.ambientAnimation;});assert.equal(ambient.length,3);
 for(const source of ambient){const {spine,layer}=skeleton(source),meta=layer.description.json._fantasy.effects,clip=layer.data.findAnimation(meta.ambientAnimation);assert.equal(clip.duration,5);assert.equal(meta.sourceEmitter.rate,5);assert.deepEqual(meta.sourceEmitter.lifetime,[1,3]);assert.equal(meta.sourceEmitter.maxParticles,10);assert(!layer.description.animations.includes(meta.ambientAnimation));assert(Object.keys(layer.description.json.animations[meta.ambientAnimation].slots).every(name=>name.startsWith('__fx/ambient-')),'Ambient tracks must not mask attack particles');
  for(let frame=0;frame<=100;frame++){Renderer.seek(spine,[layer],'idle',frame/20,false);assert(visibleFx(layer,'__fx/ambient-').length<=10);}
  const pose=time=>{Renderer.seek(spine,[layer],'idle',time,true);return layer.skeleton.slots.filter(slot=>slot.data.name.startsWith('__fx/ambient-')).map(slot=>({alpha:slot.color.a,x:slot.bone.x,y:slot.bone.y}));};
  assert.deepEqual(pose(0),pose(5),'The ambient cycle closes exactly');assert(pose(1).some(slot=>slot.alpha>.01));Renderer.seek(spine,[layer],'die',.2,false);assert.equal(visibleFx(layer,'__fx/ambient-').length,0);
 }
});
test('fitted heads carry their mouth particles with offsets, scale and visibility',()=>{
 const rig=Library.describe(root,'fantasy-bosses/RedDragon',true).layers[0].json,original=rig.bones.find(bone=>bone.name==='__fx/emitter');const expected={x:original.x*1.5+10,y:original.y*.8-4};require('../../packages/hkd-characters/lib/boss-model').apply(rig,{slots:{'Body/Head':{x:10,y:-4,scaleX:1.5,scaleY:.8,visible:false}}});const emitter=rig.bones.find(bone=>bone.name==='__fx/emitter');assert(Math.abs(emitter.x-expected.x)<1e-5);assert(Math.abs(emitter.y-expected.y)<1e-5);assert(Object.entries(rig.animations.attack.slots).filter(([name])=>name.startsWith('__fx/attack-')).every(([,track])=>track.color.every(frame=>frame.color.endsWith('00'))));
});
test('ambient track ownership preserves the primary attack and hit track, resets on death/pooling and restarts on a model change',()=>{
 const Fx=require('../../assets/_script/FantasyEffects'),source=sources.find(source=>source.id==='fantasy-monsters/MossQueen'),json=Library.describe(root,source.id,true).layers[0].json,tracks={0:{animation:{name:'attack'}},1:{animation:{name:'hit'}}},slots=Object.fromEntries(json._fantasy.effects.ambientSlots.map(name=>[name,{color:{a:1}}]));let starts=0;
 const renderer={skeletonData:{skeletonJson:json},findAnimation:()=>true,getCurrent:i=>tracks[i],setAnimation(i,name){starts++;return tracks[i]={animation:{name}};},clearTrack(i){delete tracks[i];},findSlot:name=>slots[name]},actor={node:{activeInHierarchy:true,_combatGeneration:1},spAni:renderer,isDead:()=>false};
 const attack=tracks[0],hit=tracks[1];Fx.ambient(actor);Fx.ambient(actor);assert.equal(starts,1);assert.equal(tracks[2].timeScale,.35,'Ambient particles share the Monsters baseline');assert.equal(tracks[0],attack);assert.equal(tracks[1],hit);actor.isDead=()=>true;Fx.ambient(actor);assert.equal(tracks[2],undefined);assert(Object.values(slots).every(slot=>slot.color.a===0));actor.isDead=()=>false;actor.node._combatGeneration++;Fx.ambient(actor);assert.equal(starts,2);Fx.reset(actor);assert.equal(tracks[0],attack);assert.equal(tracks[1],hit);assert.equal(tracks[2],undefined);
 renderer.skeletonData={skeletonJson:{...json,_fantasy:{...json._fantasy,pack:'fantasy-bosses'}}};Fx.ambient(actor);assert.equal(tracks[2].timeScale,.25,'A reused renderer picks up the Boss baseline');assert.equal(tracks[0],attack);assert.equal(tracks[1],hit);Fx.reset(actor);
});
test('effect registration is a no-op on repeat publication and never changes existing projectile assignments',()=>{
 const plan=require('./register-fantasy-effects.cjs').plan(root);assert.equal(plan.files.size,0);const catalog=require('../../assets/resources/projectiles/catalog.json');assert.equal(catalog.assets.filter(asset=>asset.sourcePack==='fantasy-bosses').length,14);for(const source of sources.filter(source=>source.family==='Dragons')){const fx=Library.describe(root,source.id,true).layers[0].json._fantasy.effects;assert(catalog.assets.some(asset=>asset.id===fx.projectile.flight));assert(catalog.assets.some(asset=>asset.id===fx.projectile.impact));}
});
