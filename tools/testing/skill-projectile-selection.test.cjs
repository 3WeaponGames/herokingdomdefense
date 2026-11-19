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

test('Skirmisher exposes only its fan controls while the ordinary shared flight catalog stays available read-only',t=>{
 const f=fixture(t),before=f.bytes(),snapshot=f.service.load();
 assert(!snapshot.fields.skirmisher.visual.some(field=>field.path==='visual.projectile'||field.type==='projectile'));assert(snapshot.fields.skirmisher.tuning.some(field=>field.path==='volleyRange'));assert(snapshot.fields.skirmisher.tuning.some(field=>field.path==='windup'));
 for(const style of Settings.styles.filter(s=>s.id!=='skirmisher'))assert(!snapshot.fields[style.id].visual.some(field=>field.type==='projectile'));
 assert.equal(snapshot.effective.skirmisher.visual.projectile,undefined);assert.equal(snapshot.dirty,false);assert.equal(f.service.save(f.request()).result.saved,false);assert.deepEqual(f.bytes(),before);
 const assets=Catalog.projectiles(root),published=JSON.parse(fs.readFileSync(path.join(root,'assets/resources/projectiles/catalog.json'),'utf8'));
 assert.deepEqual(assets.map(a=>a.id).sort(),published.assets.filter(a=>a.role==='flight').map(a=>a.id).sort());
 const skin=assets.find(a=>a.id==='hero-skin:lv3');assert.equal(Catalog.spine(root,skin).layers[0].skin,'lv3');
 assert(assets.some(a=>a.flipbook));assert(assets.some(a=>a.id==='tiny-kingdom:ballista-bolt'));
});

test('removed active projectile selection rejects atomically while unrelated hit edits preserve legacy identities in both mirrors',t=>{
 const asset={...arrow},legacy={projectile:asset.id,projectileAsset:asset,resource:'22222222-2222-4222-8222-222222222222',resourcePath:'vfx/old',extension:{keep:true}},f=fixture(t,{skirmisher:{visual:legacy}},{skirmisher:{visual:{...legacy,extension:{mirror:true}}}}),before=f.bytes(),initial=f.service.snapshot();assert.throws(()=>f.change(book.id),/field|editable|supported/i);assert.equal(f.service.version,initial.version);assert.deepEqual(f.bytes(),before);f.service.change(f.request({style:'skirmisher',path:'volleyRange',value:350}));assert.deepEqual(f.bytes(),before);assert.equal(f.service.save(f.request()).result.saved,true);for(const [i,text]of f.bytes().entries()){const actual=JSON.parse(text);assert.equal(actual.HeroSkills.skirmisher.volleyRange,350);assert.deepEqual(actual.HeroSkills.skirmisher.visual,JSON.parse(before[i]).HeroSkills.skirmisher.visual);}const unchanged=f.bytes();assert.equal(f.service.save(f.request()).result.saved,false);assert.deepEqual(f.bytes(),unchanged);
});

test('volley windup undo, redo and reset retain inert animated projectile metadata and unknown visual fields',t=>{
 const visual={projectile:book.id,projectileAsset:{...book},color:'#ff0000',extension:{keep:true}},f=fixture(t,{skirmisher:{visual}}),before=structuredClone(f.service.data);f.service.change(f.request({style:'skirmisher',path:'windup',value:.45}));assert.equal(f.service.snapshot().effective.skirmisher.windup,.45);f.service.undo(f.request());assert.deepEqual(f.service.data,before);f.service.redo(f.request());assert.equal(f.service.snapshot().effective.skirmisher.windup,.45);f.service.reset(f.request({style:'skirmisher',path:'windup'}));assert.deepEqual(f.service.data,before);assert.equal(f.service.dirty(),false);
});

test('legacy tier trail identity survives an spread edit save without becoming active projectile tuning',t=>{
 const trail=JSON.parse(fs.readFileSync(path.join(root,'assets/resources/projectiles/catalog.json'))).trails.find(trail=>trail.id==='trail:hero-arrow-lv4'),visual={projectile:arrow.id,projectileAsset:{...arrow,trail}},f=fixture(t,{skirmisher:{visual}}),before=f.bytes();f.service.change(f.request({style:'skirmisher',path:'visual.arcDegrees',value:24}));assert.deepEqual(f.bytes(),before);assert.equal(f.service.save(f.request()).result.saved,true);for(const text of f.bytes()){const saved=JSON.parse(text).HeroSkills.skirmisher.visual;assert.deepEqual(saved.projectileAsset.trail,trail);assert.equal(saved.arcDegrees,24);}assert(!f.service.snapshot().fields.skirmisher.visual.some(field=>field.type==='projectile'));
});

test('removed projectile selectors reject all asset IDs and saved arc edits still honor external revision checks',t=>{
 const f=fixture(t),before=f.bytes(),version=f.service.version;for(const id of ['impact:not-a-flight',arrow.id,book.id])assert.throws(()=>f.change(id),/field|editable|supported/i);assert.equal(f.service.version,version);assert.deepEqual(f.bytes(),before);f.service.change(f.request({style:'skirmisher',path:'volleyRange',value:320}));fs.appendFileSync(path.join(f.directory,FILES[1]),' ');const external=f.bytes();assert.throws(()=>f.service.save(f.request()),/outside this draft/);assert.deepEqual(f.bytes(),external);assert(f.service.dirty());
});

test('resetting one supported fan field preserves asymmetric obsolete projectile metadata in each mirror',t=>{
 const a={projectile:arrow.id,projectileAsset:{...arrow},color:'#ff0000'},b={projectile:book.id,projectileAsset:{future:'old'},color:'#00ff00',extension:{keep:true}},f=fixture(t,{skirmisher:{volleyRange:450,visual:a}},{skirmisher:{volleyRange:500,visual:b}});f.service.reset(f.request({style:'skirmisher',path:'volleyRange'}));assert.equal(f.service.save(f.request()).result.saved,true);const configs=f.bytes().map(text=>JSON.parse(text));assert.deepEqual(configs[0].HeroSkills.skirmisher.visual,a);assert.deepEqual(configs[1].HeroSkills.skirmisher.visual,b);for(const config of configs)assert.equal(config.HeroSkills.skirmisher.volleyRange,undefined);
});
