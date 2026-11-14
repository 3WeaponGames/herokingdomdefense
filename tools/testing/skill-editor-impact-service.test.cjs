'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {SkillService,FILES}=require('../../packages/hkd-skills/service');
const main='11111111-1111-4111-8111-111111111111',hit='22222222-2222-4222-8222-222222222222';
function fixture(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'hkd-impact-service-'));t.after(()=>{assert.equal(path.dirname(path.resolve(root)),path.resolve(os.tmpdir()));assert(path.basename(root).startsWith('hkd-impact-service-'));fs.rmSync(root,{recursive:true,force:true});});
 for(const file of FILES){fs.mkdirSync(path.dirname(path.join(root,file)),{recursive:true});fs.writeFileSync(path.join(root,file),JSON.stringify({untouched:true,HeroSkills:{fighter:{visual:{resource:main,resourcePath:'main',resourceKind:'sprite',resourceBundle:'resources',impactResourceFrames:9,impactExtension:'keep'}}}}));}
 const catalogs={audio:[],vfx:[{id:main,kind:'sprite',path:'main',bundle:'resources',url:'main.png'},{id:hit,kind:'sprite',path:'hit',bundle:'resources',url:'hit.png',flipbook:{frames:8,columns:4,cell:32,fps:20,loop:false}}]},service=new SkillService(root,{catalogs:{...catalogs,vfx:catalogs.vfx.concat(require('../../assets/_script/HeroSkillVFXCatalog').clips.map(c=>({id:c.uuid,kind:'sprite',path:c.resource,bundle:c.bundle,url:c.id+'.png'})))},describe:()=>({layers:[]})});
 const req=extra=>({version:service.version,revision:service.revision,...extra});return{service,catalogs,req,read:()=>FILES.map(file=>JSON.parse(fs.readFileSync(path.join(root,file))))};
}
test('on-hit asset selection owns its metadata independently of the main effect and resets only that group',t=>{
 const f=fixture(t);f.service.change(f.req({style:'fighter',path:'visual.impactResource',value:hit}));f.service.change(f.req({style:'fighter',path:'visual.impactDelay',value:.25}));f.service.save(f.req());
 for(const config of f.read()){const v=config.HeroSkills.fighter.visual;assert.equal(v.resource,main);assert.equal(v.resourcePath,'main');assert.equal(v.impactResource,hit);assert.equal(v.impactResourcePath,'hit');assert.equal(v.impactResourceFrames,8);assert.equal(v.impactResourceFps,20);assert.equal(v.impactDelay,.25);assert.equal(v.impactExtension,'keep');assert.equal(config.untouched,true);}
 f.service.reset(f.req({style:'fighter',path:'visual.impactResource'}));f.service.save(f.req());for(const config of f.read()){const v=config.HeroSkills.fighter.visual;assert.equal(v.resource,main);assert.equal(v.impactDelay,.25);assert.equal(v.impactExtension,'keep');assert.equal(v.impactResource,undefined);assert.equal(v.impactResourceFrames,undefined);}
});
test('optimistic on-hit preview resolves separately without editing a draft or disk',t=>{
 const f=fixture(t),before=f.read();const d=f.service.describe({style:'fighter',resource:main,impactResource:hit});assert.equal(d.effects[0].id,main);assert.equal(d.impactEffects[0].id,hit);assert.equal(f.service.dirty(),false);assert.deepEqual(f.read(),before);
});
test('on-hit sheet changes reject save and preserve the draft without rewriting either copy',t=>{
 const f=fixture(t),before=f.read();f.service.change(f.req({style:'fighter',path:'visual.impactResource',value:hit}));f.catalogs.vfx[1].flipbook.fps=30;assert.throws(()=>f.service.save(f.req()),/layout changed/);assert.equal(f.service.dirty(),true);assert.deepEqual(f.read(),before);
});
