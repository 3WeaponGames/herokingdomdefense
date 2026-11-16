'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),S=require('../../assets/_script/HeroSkillSettings');
const uuid='a9ed4a1a-a37a-44ab-af0c-7be941a3de18';
test('every exposed skill setting explains its effect and all six styles expose compatible on-hit defaults',()=>{
 for(const style of S.styles){const fields=S.descriptors(style.id);for(const field of fields)assert(typeof field.help==='string'&&field.help.length>20,style.id+' '+field.path);for(const path of ['visual.impactResource','visual.impactDelay','visual.impactDuration','visual.impactScale','visual.impactOffsetX','visual.impactOffsetY'])assert(fields.some(f=>f.path===path));const v=S.defaults(style.id).visual;assert.equal(v.impactResource,'');assert.equal(v.impactDelay,0);assert.equal(v.impactDuration,.35);assert.equal(v.impactScale,1);assert.equal(S.impactVisual(v).resource,'');}
 const f=S.fields('mystic').visual;for(const key of ['originX','originY','targetX','targetY','offsetX','offsetY'])assert(/visual|artwork|displayed/i.test(f.find(row=>row.key===key).help));assert(/real hit|actual damage/.test(f.find(row=>row.key==='impactDelay').help));
});
test('on-hit authored values and imported layout survive normalization without mutating defaults or unknown fields',()=>{
 const visual={impactResource:uuid,impactResourceBundle:'resources',impactResourcePath:'vfx/hit',impactResourceKind:'sprite',impactResourceFrames:8,impactResourceColumns:4,impactResourceCell:16,impactResourceFps:24,impactResourceLoop:false,impactResourceAnimation:'spark',impactDelay:.25,impactDuration:.8,impactScale:.6,impactOffsetX:11,impactOffsetY:20,impactRotation:45,impactOpacity:.4,impactColor:'#112233',unknown:{keep:true}},config={HeroSkills:{fighter:{visual}}},before=JSON.stringify(config),v=S.effective('fighter',config).visual,hit=S.impactVisual(v);assert.equal(hit.resource,uuid);assert.equal(hit.resourcePath,'vfx/hit');assert.equal(hit.resourceFrames,8);assert.equal(hit.effectDuration,.8);assert.equal(hit.delay,.25);assert.equal(hit.offsetX,11);assert.equal(hit.scale,.6);assert.equal(hit.opacity,.4);assert.equal(hit.resourceAnimation,'spark');assert.equal(JSON.stringify(config),before);assert.equal(S.defaults('fighter').visual.impactDelay,0);assert.equal(S.impactVisual({impactResource:uuid}).scale,1);
});
test('invalid or unsafe on-hit fields fall back without accepting poisoned timers or asset paths',()=>{
 const v=S.effective('fighter',{HeroSkills:{fighter:{visual:{impactDelay:-1,impactDuration:Infinity,impactScale:0,impactResource:'bad',impactOpacity:2,impactResourcePath:'../secret',impactResourceKind:'script'}}}}).visual;assert.equal(v.impactDelay,0);assert.equal(v.impactDuration,.35);assert.equal(v.impactScale,1);assert.equal(v.impactResource,'');assert.equal(v.impactOpacity,1);assert.equal(v.impactResourcePath,undefined);assert.equal(v.impactResourceKind,undefined);for(const impactDelay of [-1,NaN,Infinity,31])assert.throws(()=>S.validateStyle('fighter',{visual:{impactDelay}}));assert(S.validateStyle('fighter',{visual:{impactDelay:0,impactOpacity:0}}));
});


test('impact presentation reads only its authored fields while preserving merge defaults and ownership',()=>{
 const defaults=S.impactVisual();assert.deepEqual(S.impactVisual(null),defaults);assert.deepEqual(S.impactVisual({}),defaults);
 const source=Object.create({impactScale:9,impactColor:'#ffffff'});let reads=0;
 Object.defineProperty(source,'impactResource',{enumerable:true,get(){reads++;return uuid;}});
 Object.defineProperty(source,'impactDuration',{enumerable:false,value:99});
 Object.assign(source,{impactScale:0,impactOpacity:undefined,impactResourceLoop:false,impactOffsetX:0,extension:{keep:true}});
 Object.defineProperty(source,'unrelatedVisual',{enumerable:true,get(){throw Error('impact projection traversed unrelated visual data');}});
 const extension=source.extension,result=S.impactVisual(source);
 assert.equal(result.resource,uuid);assert.equal(reads,1);assert.equal(result.scale,0);assert.equal(result.opacity,undefined);assert.equal(result.resourceLoop,false);assert.equal(result.offsetX,0);
 assert.equal(result.effectDuration,defaults.effectDuration);assert.equal(result.color,defaults.color);assert.equal(source.extension,extension);assert.equal(source.impactScale,0);assert(!Object.hasOwn(result,'extension'));
 const frozen=Object.freeze({impactDelay:.4,impactScale:.8,impactColor:'#123456'}),before={...frozen};
 assert.equal(S.impactVisual(frozen).delay,.4);assert.deepEqual(frozen,before);
});
