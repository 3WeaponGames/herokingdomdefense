'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict'),{test}=require('node:test');
const Bake=require('../../packages/hkd-characters/lib/native-bake'),PNG=require('../../packages/hkd-characters/lib/png-atlas'),Units=require('../../packages/game-data-editor/lib/unit-assets'),Tx=require('../../packages/hkd-characters/lib/asset-transaction');
function fixture(t,originalBase=false){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'hkd-ally-level-bake-'));t.after(()=>{Units.invalidate();fs.rmSync(root,{recursive:true,force:true});});
  const write=(name,value)=>{const file=path.join(root,name);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,Buffer.isBuffer(value)||typeof value==='string'?value:JSON.stringify(value,null,2)+'\n');};
  const skeleton={skeleton:{width:50,height:100},bones:[{name:'__game_fit'},{name:'root',parent:'__game_fit'}],slots:[{name:'body',bone:'root',attachment:'body'},{name:'gear',bone:'root'}],skins:[{name:'default',attachments:{body:{body:{width:2,height:2}},gear:{}}}],animations:{idle:{bones:{root:{translate:[{time:0},{time:1}]}}},attack:{bones:{root:{rotate:[{time:0},{time:2}]}}},move:{bones:{root:{translate:[{time:0},{time:1.4}]}}},run:{bones:{root:{translate:[{time:0},{time:.4}]}}}}};
  const atlas='\nbody.png\nsize: 2,2\nformat: RGBA8888\nfilter: Linear,Linear\nrepeat: none\nbody\n  rotate: false\n  xy: 0,0\n  size: 2,2\n  orig: 2,2\n  offset: 0,0\n  index: -1\n',image=PNG.encode({width:2,height:2,rgba:Buffer.alloc(16,255)});
  for(const folder of ['assets/imported','assets/original']){write(folder+'/body.json',skeleton);write(folder+'/body.atlas',atlas);write(folder+'/body.png',image);}
  write('assets/original/body.json.meta',{uuid:'original-skeleton'});
  write('assets/resources/unit-library/character-maker/catalog.json',{units:[{id:'character-maker/test',name:'Test',uuid:'imported-layer',skeleton:'assets/imported/body.json'}],parts:[]});
  const prefab='assets/KinghtFallEnemy/PlayTest.prefab';write(prefab,[{__type__:'sp.Skeleton',_N$skeletonData:{__uuid__:'original-skeleton'},defaultSkin:'default',node:{__id__:1}},{_name:'spAni',_trs:{array:[7,9,0,0,0,0,1,.5,.5,1]},future:{keep:true}}]);
  const contract={prefab,component:0,defaultUuid:'original-skeleton',height:100,events:{attack:{string:'attack'}},animations:{idle:{duration:1,events:[]},attack:{duration:.8,events:[{time:.31,name:'attack'}]},move:{duration:1.4,events:[]}}};
  write('assets/resources/unit-library/runtime/contracts.json',{enabled:true,units:{'ally:90001:default':contract}});
  const base={name:'Default ally',base:{type:'ally',id:'90001',source:'character-maker/test'},scale:1,parts:[],baked:{uuid:'original-skeleton',source:'character-maker/test'},unknown:{keep:7}};
  const data={version:1,profiles:{base},assignments:{'ally:90001:default':'base'},future:{preserve:true}},original=structuredClone(data),level=structuredClone(base);level.name='Level 2';level.base.level=2;if(originalBase)delete level.base.source;delete level.baked;
  level.parts=[{id:'helmet',sprite:'helmet',layer:originalBase?'original-skeleton':'imported-layer',slot:'gear',bone:'root',x:1,y:2,rotation:3,scaleX:1,scaleY:1,opacity:1,order:0,hideSlots:[]}];
  data.profiles.level2=level;data.assignments['ally:90001:level:2']='level2';write('assets/parts/helmet.png',image);
  const assets=[{id:'helmet',image:'assets/parts/helmet.png',width:2,height:2}];
  return{root,write,data,original,assets,prefab,plan:()=>Bake.plan(root,data,assets,original)};
}
test('ally level Save bakes its imported equipment resource without changing the shared prefab or default look',t=>{
  const f=fixture(t),before=JSON.stringify(f.data),prefab=fs.readFileSync(path.join(f.root,f.prefab)),result=f.plan(),profile=result.data.profiles.level2;
  assert.equal(profile.baked.resource,'unit-library/runtime/level2');assert(profile.baked.uuid);assert.equal(profile.baked.source,'character-maker/test');assert.equal(result.files.size,6);
  assert(![...result.files.keys()].some(file=>file.endsWith('.prefab')));assert.deepEqual(fs.readFileSync(path.join(f.root,f.prefab)),prefab);assert.deepEqual(result.data.profiles.base,f.original.profiles.base);assert.equal(JSON.stringify(f.data),before);assert(result.data.future.preserve);assert.equal(profile.unknown.keep,7);
  const rig=JSON.parse(result.files.get('assets/resources/'+profile.baked.resource+'.json'));
  assert.equal(rig._unitLook,'level2');assert.deepEqual(rig.animations.attack.events,[{time:.31,name:'attack'}]);assert.equal(Bake.duration(rig.animations.attack),.8);assert.equal(Bake.duration(rig.animations.move),.4);
  assert.equal(rig.skins[0].attachments.gear.part_helmet.x,1);assert.equal(new Set(rig.bones.map(bone=>bone.name)).size,rig.bones.length);
  for(const file of ['assets/resources/unit-library/runtime/contracts.json','assets/imported/body.json','assets/imported/body.atlas','assets/imported/body.png','assets/parts/helmet.png'])assert(result.reads.has(path.join(f.root,file)),file);
});
test('equipment-only original-base ally levels bake safely even when the current prefab model already has a fit bone',t=>{
  const f=fixture(t,true),result=f.plan(),profile=result.data.profiles.level2,rig=JSON.parse(result.files.get('assets/resources/'+profile.baked.resource+'.json'));
  assert.equal(profile.baked.source,null);assert.equal(rig.bones[0].name,'__game_fit_2');assert.equal(rig.bones[0].scaleX,1);assert.equal(rig.bones[0].scaleY,1);assert.equal(rig.bones[0].x,0);assert.equal(rig.bones[0].y,0);
  assert.equal(rig.bones[1].parent,'__game_fit_2');assert.equal(rig.skins[0].attachments.gear.part_helmet.y,2);assert(![...result.files.keys()].some(file=>file.endsWith('.prefab')));
  for(const file of [f.prefab,'assets/original/body.json.meta','assets/original/body.json','assets/original/body.atlas','assets/original/body.png'])assert(result.reads.has(path.join(f.root,file)),file);
});
test('saved unchanged level resources do no writes and rebaking retains Creator UUIDs, settings and unknown metadata',t=>{
  const f=fixture(t),first=f.plan();for(const [file,value]of first.files)f.write(file,value);
  const saved=first.data,unchanged=Bake.plan(f.root,saved,f.assets,structuredClone(saved));assert.equal(unchanged.files.size,0);assert.deepEqual(unchanged.data,saved);
  const base='assets/resources/unit-library/runtime/level2',metadata=JSON.parse(fs.readFileSync(path.join(f.root,base+'.png.meta')));metadata.uuid='authored-texture';metadata.filterMode='nearest';metadata.future={keep:9};f.write(base+'.png.meta',metadata);
  const skeleton=JSON.parse(fs.readFileSync(path.join(f.root,base+'.json.meta')));skeleton.uuid='authored-skeleton';skeleton.future=true;f.write(base+'.json.meta',skeleton);
  const next=structuredClone(saved);next.profiles.level2.parts[0].x=4;const result=Bake.plan(f.root,next,f.assets,saved),texture=JSON.parse(result.files.get(base+'.png.meta')),model=JSON.parse(result.files.get(base+'.json.meta'));
  assert.equal(result.data.profiles.level2.baked.uuid,'authored-skeleton');assert.equal(texture.uuid,'authored-texture');assert.equal(texture.filterMode,'nearest');assert.equal(texture.future.keep,9);assert(model.future);assert.deepEqual(model.textures,['authored-texture']);assert(result.reads.has(path.join(f.root,base+'.json.meta')));
});
test('concurrent original model edits abort publication before any level asset is written',t=>{
  const f=fixture(t,true),result=f.plan(),source=path.join(f.root,'assets/original/body.json');fs.appendFileSync(source,' ');
  const homedir=os.homedir;os.homedir=()=>f.root;t.after(()=>{os.homedir=homedir;});
  assert.throws(()=>Tx.commit(f.root,result.files,result.reads,'assets/resources/characters/catalog.json'),/Another editor changed/);
  for(const file of result.files.keys())assert.equal(fs.existsSync(path.join(f.root,file)),false,file);
});
test('unknown ally level contracts fail explicitly rather than publishing a mismatched combat rig',t=>{
  const f=fixture(t);f.data.assignments['ally:90002:level:2']='level2';assert.throws(()=>f.plan(),/no original gameplay animation contract/);
});
