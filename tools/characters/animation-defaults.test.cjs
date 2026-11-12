'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{test}=require('node:test');
const Defaults=require('../../packages/hkd-characters/lib/animation-defaults'),Library=require('../../packages/hkd-characters/lib/unit-library'),Units=require('../../packages/game-data-editor/lib/unit-assets');
const root=path.resolve(__dirname,'../..');
test('package defaults are prepared before preview parsing without changing source data or applying twice',()=>{
 assert.equal(Defaults.rate('fantasy-bosses'),.25);assert.equal(Defaults.rate('fantasy-monsters'),.35);assert.equal(Defaults.rate('monster3'),1);
 const json={_fantasy:{pack:'fantasy-bosses',future:{keep:7}},animations:{attack:{bones:{root:{rotate:[{time:0,angle:3},{time:.65,angle:9,curve:[.2,.4,.7,.8]}]}},events:[{time:.325,name:'hit',float:8}],deform:{default:{body:{mesh:[{time:.65,vertices:[1,2]}]}}},drawOrder:[{time:.65,offsets:[]}]},__fx_ambient:{slots:{glow:{color:[{time:.65,color:'ffffffff'}]}}}}};
 const input={future:'keep',layers:[{uuid:'boss',json},{uuid:'monster',json:{...structuredClone(json),_fantasy:{pack:'fantasy-monsters'}}},{uuid:'other',json:{...structuredClone(json),_fantasy:{pack:'monster3'}}}]},before=structuredClone(input),prepared=Defaults.prepare(input);
 assert.deepEqual(input,before);assert.equal(prepared.future,'keep');assert.equal(prepared.layers[0].json.animations.attack.bones.root.rotate[1].time,.65/.25);assert.equal(prepared.layers[0].json.animations.attack.events[0].time,.325/.25);assert.equal(prepared.layers[0].json.animations.attack.events[0].float,8);assert.equal(prepared.layers[0].json.animations.__fx_ambient.slots.glow.color[0].time,.65/.25);assert.deepEqual(prepared.layers[0].json.animations.attack.bones.root.rotate[1].curve,[.2,.4,.7,.8]);assert.equal(prepared.layers[0].json.animations.attack.deform.default.body.mesh[0].time,.65/.25);assert.equal(prepared.layers[0].json.animations.attack.drawOrder[0].time,.65/.25);
 assert.equal(prepared.layers[1].json.animations.attack.events[0].time,.325/.35);assert.equal(prepared.layers[2],input.layers[2]);assert.deepEqual(Defaults.prepare(prepared),prepared);assert.deepEqual(prepared.layers[0].json._fantasy,before.layers[0].json._fantasy);
});
test('every Fantasy source clip retains its pose at the slower package baseline, including independent ambient effects',()=>{
 const spine=require(Units.enginePath());let checked=0;
 for(const source of Library.load(root).sources.filter(source=>/^fantasy-/.test(source.pack))){
  const description=Library.describe(root,source.id,true),original=description.layers[0],prepared=Defaults.prepare(description).layers[0],rate=Defaults.rate(source.pack);
  const atlas=new spine.TextureAtlas(original.atlas,name=>{const bytes=fs.readFileSync(require('node:url').fileURLToPath(original.pages[name]));return new spine.FakeTexture({width:bytes.readUInt32BE(16),height:bytes.readUInt32BE(20)});});
  const reader=new spine.SkeletonJson(new spine.AtlasAttachmentLoader(atlas)),a=reader.readSkeletonData(original.json),b=reader.readSkeletonData(prepared.json);
  for(const clip of a.animations){
   const slowed=b.findAnimation(clip.name);assert(Math.abs(slowed.duration-clip.duration/rate)<2e-5,source.id+'/'+clip.name+' duration');
   const x=new spine.Skeleton(a),y=new spine.Skeleton(b),phase=clip.duration*.37;clip.apply(x,0,phase,true,null,1,spine.MixBlend.replace,spine.MixDirection.mixIn);slowed.apply(y,0,phase/rate,true,null,1,spine.MixBlend.replace,spine.MixDirection.mixIn);x.updateWorldTransform();y.updateWorldTransform();
   for(let i=0;i<x.bones.length;i++)for(const key of ['worldX','worldY','a','b','c','d'])assert(Math.abs(x.bones[i][key]-y.bones[i][key])<.02,source.id+'/'+clip.name+'/'+x.bones[i].data.name+'/'+key);
   checked++;
  }
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root,source.skeleton))),original.json,'source stays authored');
 }
 assert(checked>600);
});
test('100% playback uses the prepared duration, custom speed is relative, frame steps reach the end and each unit recalls its own speed',async t=>{
 const {fixture}=require('./client-harness.cjs'),spine=require(Units.enginePath()),units=[{type:'enemy',id:'94001',key:'enemy:94001:default',name:'Boss',group:'Enemies',sourcePack:'fantasy-bosses',enemyClass:'normal'},{type:'enemy',id:'94002',key:'enemy:94002:default',name:'Monster',group:'Enemies',sourcePack:'fantasy-monsters',enemyClass:'normal'}];
 const initial={version:1,profiles:{boss:{name:'Boss',base:{type:'enemy',id:'94001'},parts:[]},monster:{name:'Monster',base:{type:'enemy',id:'94002'},parts:[]}},assignments:{'enemy:94001:default':'boss','enemy:94002:default':'monster'}};
 const describe=base=>({layers:[{
  uuid:'test',name:'Test',x:0,y:0,scaleX:1,scaleY:1,skin:'default',skins:['default'],animations:['idle','attack'],
  json:{
   skeleton:{spine:'3.8.99'},bones:[{name:'root'}],slots:[],skins:[{name:'default',attachments:{}}],
   _fantasy:{pack:base.id==='94001'?'fantasy-bosses':'fantasy-monsters',family:'Test',preset:'test',presets:[],slots:{},expressions:[]},
   animations:{
    idle:{bones:{root:{rotate:[{time:0},{time:1.3,angle:10}]}}},
    attack:{bones:{root:{rotate:[{time:0},{time:.65,angle:20}]}}}
   }
  }
 }]});
 const f=fixture({units,initial,describe,renderer:{async createLayers(_runtime,descriptions){return descriptions.map(description=>{const data=new spine.SkeletonJson(new spine.AtlasAttachmentLoader(new spine.TextureAtlas('',()=>null))).readSkeletonData(description.json);return{description,data,skeleton:new spine.Skeleton(data)};});}}});
 t.after(()=>f.close());await f.settle();assert(f.client.getState().loaded);assert.equal(Number(f.byLabel('Animation speed').value),100);assert(Math.abs(Number(f.byLabel('Animation position').max)-1.3/.25)<1e-6);
 f.tick(1000);f.tick(1500);assert.equal(f.calls.seeks.at(-1).time,.5);const speed=f.byLabel('Animation speed');speed.value=50;speed.oninput();speed.onchange();f.tick(2000);assert.equal(f.calls.seeks.at(-1).time,.75);
 const action=f.byLabel('Preview animation');action.value='attack';action.onchange();assert(Math.abs(Number(f.byLabel('Animation position').max)-.65/.25)<1e-6);const scrub=f.byLabel('Animation position');scrub.value=.65/.25-1/60;scrub.oninput();await f.button('Frame ▶').click();assert(Math.abs(f.calls.seeks.at(-1).time-.65/.25)<1e-6);
 const monster=f.host.querySelector('.look-list').querySelectorAll('button').find(button=>button.textContent.includes('Monster'));assert(monster);await monster.click();await f.settle();assert.equal(Number(speed.value),100);assert.equal(Number(f.byLabel('Animation speed percentage').value),100);assert(Math.abs(Number(scrub.max)-1.3/.35)<1e-6);assert.deepEqual(f.snapshot().data,{...initial,unitAnimationSpeeds:{'enemy:94001:default':.5}});assert(f.calls.changes.length>0);assert.equal(f.calls.saves,0);
});
