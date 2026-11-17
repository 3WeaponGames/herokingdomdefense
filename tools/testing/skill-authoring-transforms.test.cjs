'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const Authoring=require('../../assets/_script/HeroSkillAuthoring'),Settings=require('../../assets/_script/HeroSkillSettings');
test('every selectable hero effect exposes only numeric transform paths supplied by its saved runtime schema',()=>{
 for(const style of Settings.styles){const visual=Settings.defaults(style.id).visual,before=JSON.stringify(visual),originalImpact=visual.impactResource;visual.impactResource='fixture-impact';
  for(const entry of Authoring.entries(style.id))for(const [handle,label]of Authoring.handles(style.id,entry.id,visual)){
   const transform=Authoring.transform(style.id,entry.id,handle,visual);assert(transform,style.id+' '+handle);assert.equal(transform.id,handle);assert.equal(transform.label,label);assert.equal(typeof transform.x,'string');assert.equal(typeof transform.y,'string');
   const descriptors=Settings.descriptors(style.id);for(const key of ['x','y','scale','scaleX','scaleY','rotation'])if(transform[key]){const field=descriptors.find(field=>field.path===transform[key]);assert(field,style.id+' '+handle+' '+key);assert.equal(field.type,'number');}
  }
  visual.impactResource=originalImpact;assert.equal(JSON.stringify(visual),before);
 }
});
test('cast and on-hit gizmos map their independent saved transforms without inventing unsupported impact axes',()=>{
 const visual=Settings.defaults('skirmisher').visual;visual.impactResource='fixture-impact';
 assert.deepEqual(Authoring.transform('skirmisher','active','cast',visual),{id:'cast',label:'Cast effect',x:'visual.castOffsetX',y:'visual.castOffsetY',scale:'visual.castScale',scaleX:'visual.castScaleX',scaleY:'visual.castScaleY',rotation:'visual.castRotation'});
 assert.deepEqual(Authoring.transform('skirmisher','active','impact',visual),{id:'impact',label:'On-hit effect',x:'visual.impactOffsetX',y:'visual.impactOffsetY',scale:'visual.impactScale',rotation:'visual.impactRotation'});
 assert.equal(Authoring.transform('guardian','active','impact',{impactResource:'fixture-impact'}),null);
});
test('endpoint handles remain position-only and circular behavior has no unused rotation handle',()=>{
 const mystic=Settings.defaults('mystic').visual;assert.deepEqual(Authoring.transform('mystic','passive','origin',mystic),{id:'origin',label:'Scepter origin',x:'visual.originX',y:'visual.originY'});assert.deepEqual(Authoring.transform('mystic','passive','target',mystic),{id:'target',label:'Channel endpoint',x:'visual.targetX',y:'visual.targetY'});
 for(const style of ['bruiser','guardian']){const visual=Settings.defaults(style).visual,plain=Authoring.transform(style,'active','effect',visual);assert.equal(plain.rotation,undefined);assert.equal(plain.scale,'visual.scale');visual.resource='custom-art';assert.equal(Authoring.transform(style,'active','effect',visual).rotation,'visual.rotation');}
});
test('absent artwork and unknown legacy slots cannot create selectable dead transform handles',()=>{
 const visual=Settings.defaults('fighter').visual;visual.castResource='';visual.castSecondaryResource='legacy-unknown';assert.equal(Authoring.transform('fighter','active','cast',visual),null);assert.equal(Authoring.transform('fighter','active','castSecondary',visual),null);assert(!Authoring.handles('fighter','active',visual).some(row=>row[0]==='castSecondary'));assert.equal(Authoring.transform('missing','active','cast',visual),null);
});
