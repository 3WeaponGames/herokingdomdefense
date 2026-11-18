'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const Settings=require('../../assets/_script/HeroSkillSettings'),Catalog=require('../../assets/_script/HeroSkillVFXCatalog');
function fixture(){
 let resolved=0;
 const settings=Object.assign({},Settings,{resourceVisual(...args){resolved++;return Settings.resourceVisual(...args);}}),exports={};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../../assets/_script/HeroSkillVFXLayout.js'),'utf8'),{exports,require:name=>name==='./HeroSkillSettings'?settings:name==='./HeroSkillVFXCatalog'?Catalog:require('../../assets/_script/HeroSkillProjectile')});
 return{layout:exports,resolutions:()=>resolved};
}
function presence(count){return Array.from({length:count},(_,i)=>({key:'presence:'+i,slot:'presence',phase:'loop',age:i*.01,scale:1,opacity:1,target:{x:i*3,y:i*7}}));}

test('multi-unit Guardian layouts resolve shared artwork once while keeping every ally position and clock independent',()=>{
 const f=fixture(),v=Settings.defaults('guardian').visual,frame={entities:presence(256)},before=JSON.stringify(v),output=f.layout.entities(frame,v,{style:'guardian',facing:1});
 assert.equal(output.length,256);assert.equal(f.resolutions(),1,'Shared slot metadata must not scale with the protected-unit count');
 output.forEach((item,i)=>{assert.equal(item.x,i*3+(v.presenceOffsetX||0));assert.equal(item.y,i*7+(v.presenceOffsetY||0));assert(item.age>=0);assert.equal(item.key,'presence:'+i+':guardian-gold-presence');});
 assert.notEqual(output[0],output[1]);assert.equal(JSON.stringify(v),before);output[0].x=999;assert.equal(output[1].x,3+(v.presenceOffsetX||0));
});

test('slot metadata stays independent when one resource supplies different artwork settings and refreshes next pass',()=>{
 const f=fixture(),v=Settings.defaults('guardian').visual;
 v.buffResource=v.presenceResource;v.buffColor='#112233';v.presenceColor='#ffeedd';v.buffScale=2;v.presenceScale=.5;
 const frame={entities:presence(2).concat({key:'buff',slot:'buff',phase:'loop',age:1,scale:1,opacity:1})},first=f.layout.entities(frame,v,{style:'guardian',hero:{x:10,y:20}});
 assert.equal(f.resolutions(),2);assert.equal(first[0].visual.color,'#ffeedd');assert.equal(first[2].visual.color,'#112233');assert.equal(first[0].visual.scale,.5);assert.equal(first[2].visual.scale,2);
 v.presenceColor='#abcdef';v.presenceScale=3;
 const next=f.layout.entities(frame,v,{style:'guardian',hero:{x:10,y:20}});
 assert.equal(f.resolutions(),4);assert.equal(first[0].visual.color,'#ffeedd');assert.equal(first[0].visual.scale,.5);assert.equal(next[0].visual.color,'#abcdef');assert.equal(next[0].visual.scale,3);
});

test('phase transitions retain each selected clip and custom resources keep their saved metadata',()=>{
 const f=fixture(),v=Settings.defaults('guardian').visual,clip=Catalog.clips.find(c=>c.id==='guardian-body-shield-loop');Settings.applyClip(v,'shieldResource',clip);
 const entities=['start','loop','end'].map(phase=>({key:'shield:'+phase,slot:'shield',phase,age:.1,progress:.5,opacity:1,scale:1})),output=f.layout.entities({entities},v,{style:'guardian'});
 assert.equal(output.length,3);assert.deepEqual(Array.from(output,item=>item.clip.phase),['start','loop','end']);assert.equal(f.resolutions(),3);
 v.presenceResource='custom';v.presenceResourceKind='sprite';v.presenceResourceFrames=5;v.presenceResourceColumns=5;v.presenceResourceCell=16;v.presenceResourceFps=10;
 const custom=f.layout.entities({entities:presence(3)},v,{style:'guardian'});assert.equal(custom.length,3);assert.equal(custom[0].clip,null);assert.equal(custom[0].visual.resource,'custom');assert.equal(custom[0].visual.resourceFrames,5);assert.equal(f.resolutions(),4);
});
