'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict'),{test}=require('node:test');
const {Service}=require('../../packages/hkd-characters/lib/service'),PNG=require('../../packages/hkd-characters/lib/png-atlas'),Units=require('../../packages/game-data-editor/lib/unit-assets'),Catalog=require('../../packages/hkd-characters/lib/character-catalog');
function fixture(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'hkd-current-character-'));t.after(()=>{Units.invalidate();fs.rmSync(root,{recursive:true,force:true});});
 const write=(relative,value)=>{const file=path.join(root,relative);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,Buffer.isBuffer(value)||typeof value==='string'?value:JSON.stringify(value));return file;};
 const image=PNG.encode({width:2,height:2,rgba:Buffer.from([255,0,0,255,255,0,0,255,255,0,0,255,255,0,0,255])});
 const rig={skeleton:{spine:'3.8.99',width:2,height:2},bones:[{name:'root'}],slots:[{name:'body',bone:'root',attachment:'body'},{name:'gear',bone:'root'}],skins:[{name:'default',attachments:{body:{body:{path:'body',width:2,height:2}}}}],events:{attack:{}},animations:{
  idle:{bones:{root:{translate:[{time:0},{time:1}]}}},move:{bones:{root:{translate:[{time:0},{time:.7}]}}},attack:{events:[{time:.4,name:'attack'}]},die:{bones:{root:{translate:[{time:.2}]}}}
 }};
 write('assets/model/body.json',rig);write('assets/model/body.json.meta',{uuid:'source-model',importer:'spine',textures:['source-page']});write('assets/model/body.atlas','\nbody.png\nsize: 2,2\nformat: RGBA8888\nfilter: Linear,Linear\nrepeat: none\nbody\n  rotate: false\n  xy: 0, 0\n  size: 2, 2\n  orig: 2, 2\n  offset: 0, 0\n  index: -1\n');write('assets/model/body.png',image);write('assets/model/body.png.meta',{ver:'2.3.7',uuid:'source-page',importer:'texture',filterMode:'nearest',future:{keep:7},subMetas:{}});
 const prefab=[{__type__:'cc.Node',_name:'Monster',_trs:{array:[3,4,0,0,0,0,1,1.2,1.2,1]}},{__type__:'sp.Skeleton',node:{__id__:0},_N$skeletonData:{__uuid__:'source-model'},defaultSkin:'default'}];
 write('assets/KinghtFallEnemy/Monster.prefab',prefab);write('assets/KinghtFallEnemy/Campaign.prefab',prefab);
 const cfg={AllyCfg:{},SoldierCfg:{91001:{ID:91001,Name:'Mushroom Walker',prefab:'Monster',MonsterSource:'monster1/Mushroom',Health:40,AttackInterval:1},92001:{ID:92001,Name:'Mushroom Walker',prefab:'Campaign',AppearanceSourceUnit:91001,Health:90,AttackInterval:.6}},GameTools:{timingDefaults:{approved:{attack:.4}},timings:{custom:{attack:.3}}}};
 write('assets/KinghtFallConfig/GameJsonCfg.json',cfg);write('assets/resources/localization/catalog.json',{entries:{}});write('assets/resources/characters/catalog.json',{version:1,profiles:{},assignments:{},future:{retain:true}});write('assets/resources/unit-library/runtime/contracts.json',{enabled:true,units:{},future:{retain:true}});
 write('assets/gear/helmet.png',image);write('assets/resources/character-parts/catalog.json',{version:1,parts:[{id:'helmet',name:'Helmet',category:'Helmet',width:2,height:2,image:'assets/gear/helmet.png'}]});
 Units.invalidate();return{root,write,rig,cfg,store:new Service(root)};
}
function save(f){const home=os.homedir;os.homedir=()=>path.join(f.root,'backups');try{return f.store.save({version:f.store.version});}finally{os.homedir=home;}}
function edit(f,change){const data=f.store.snapshot().data;change(data);return f.store.change({version:f.store.version,data});}
test('duplicate roster/campaign names form one editable appearance while combat identities remain separate',t=>{
 const f=fixture(t),units=f.store.units(),listed=Catalog.listed(f.store.data,units);assert.equal(units.filter(unit=>unit.type==='enemy').length,2);assert.equal(listed.filter(unit=>unit.type==='enemy').length,1);assert.equal(listed.find(unit=>unit.type==='enemy').members.length,2);
 assert.equal(save(f).result.saved,false);assert.equal(fs.existsSync(path.join(f.root,'assets/resources/unit-library/models')),false);
});
test('Save captures finished models and shared names while preserving the original per-unit appearance and events',t=>{
 const f=fixture(t),config=fs.readFileSync(path.join(f.root,'assets/KinghtFallConfig/GameJsonCfg.json'));
 edit(f,data=>{data.profiles.mushroom={name:'Mushroom Walker',base:{type:'enemy',id:'91001',currentModel:true},parts:[]};data.assignments['enemy:91001:default']='mushroom';});
 assert.equal(fs.existsSync(path.join(f.root,'assets/resources/unit-library/models')),false);const saved=save(f);assert(saved.result.saved);
 const data=f.store.snapshot().data,main=data.profiles.mushroom,linked=data.profiles[data.assignments['enemy:92001:default']];assert(main.base.model);assert(linked.base.model);assert.equal(linked.base.id,'92001');assert.deepEqual(linked.parts,[]);
 assert.deepEqual(JSON.parse(fs.readFileSync(path.join(f.root,main.base.model.layers[0].file))),f.rig);
 const output=()=>JSON.parse(fs.readFileSync(path.join(f.root,'assets/resources',f.store.data.profiles.mushroom.baked.resource+'.json')));
 assert.deepEqual(output().animations.attack.events,f.rig.animations.attack.events);assert.equal(output().slots.find(slot=>slot.name==='gear').attachment,undefined);assert.equal(output().bones[0].scaleX,1);
 assert.deepEqual(fs.readFileSync(path.join(f.root,'assets/KinghtFallConfig/GameJsonCfg.json')),config);assert.deepEqual(JSON.parse(fs.readFileSync(path.join(f.root,'assets/model/body.json'))),f.rig);
 const contract=JSON.parse(fs.readFileSync(path.join(f.root,'assets/resources/unit-library/runtime/contracts.json')));assert.equal(contract.future.retain,true);assert.deepEqual(contract.units['enemy:92001:default'].animations.attack.events,f.rig.animations.attack.events);
 const snapshot=JSON.stringify(main.base.model),stamp=fs.statSync(f.store.file).mtimeMs;assert.equal(save(f).result.saved,false);assert.equal(fs.statSync(f.store.file).mtimeMs,stamp);
 edit(f,data=>{data.profiles.mushroom.name='Renamed mushroom';});save(f);assert.equal(JSON.stringify(f.store.data.profiles.mushroom.base.model),snapshot);assert.equal(output().slots.find(slot=>slot.name==='gear').attachment,undefined);assert.deepEqual(output().skins[0].attachments.body,f.rig.skins[0].attachments.body);assert.deepEqual(f.store.data.profiles[f.store.data.assignments['enemy:92001:default']].parts,[]);
 assert.deepEqual(fs.readFileSync(path.join(f.root,'assets/KinghtFallConfig/GameJsonCfg.json')),config);
});
test('created characters and their levels survive pruning; unused look copies do not',()=>{
 const data={profiles:{active:{future:1},copy:{},knight:{},knight2:{}},assignments:{unit:'active'},characters:{knight:{levels:{2:'knight2'},future:{keep:true}}},future:{keep:7}};
 assert.deepEqual(Catalog.prune(data),['copy']);assert.deepEqual(Object.keys(data.profiles),['active','knight','knight2']);assert.equal(data.characters.knight.future.keep,true);assert.equal(data.future.keep,7);
});
test('a newly created finished monster saves independently without assigning or changing its source units',t=>{
 const f=fixture(t);edit(f,data=>{data.profiles.custom={name:'New mushroom',base:{type:'enemy',id:'91001',currentModel:true},parts:[]};data.characters={custom:{levels:{}}};});
 assert(save(f).result.saved);const saved=f.store.snapshot().data;assert(saved.profiles.custom.base.model);assert.deepEqual(saved.assignments,{});assert.deepEqual(saved.characters,{custom:{levels:{}}});assert.equal(Catalog.created(saved,f.store.units())[0].name,'New mushroom');assert.equal(save(f).result.saved,false);
});
test('finished model paths cannot leave the model library and created levels cannot steal another character',t=>{
 const f=fixture(t),data=f.store.snapshot().data;data.profiles.bad={name:'Bad',base:{type:'enemy',id:'91001',currentModel:true,model:{layers:[{file:'../outside.json'}]}},parts:[]};assert.throws(()=>f.store.validate(data),/Invalid finished character model/);
 delete data.profiles.bad;data.profiles.a={name:'A',base:{type:'enemy',id:'91001',currentModel:true},parts:[]};data.profiles.b={name:'B',base:{type:'enemy',id:'92001',currentModel:true},parts:[]};data.characters={a:{levels:{1:'b'}}};assert.throws(()=>f.store.validate(data),/level must belong/);
});
