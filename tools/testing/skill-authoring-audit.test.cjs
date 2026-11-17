'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const Preview=require('../../packages/hkd-skills/preview'),{Model}=require('../../packages/hkd-skills/preview-model');
function fixture(){
 const statuses=[],ctx=new Proxy({}, {get:()=>()=>{}});
 class Element{constructor(doc){this.ownerDocument=doc;this.children=[];this.style={};this.width=640;this.height=500;}appendChild(n){n.parentNode=this;this.children.push(n);return n;}remove(){}setAttribute(){}getContext(){return ctx;}getBoundingClientRect(){return{left:0,top:0,width:640,height:500};}addEventListener(){}removeEventListener(){}}
 const doc={createElement:()=>new Element(doc)},host=new Element(doc);
 const renderer={createLayers:async(_s,rows)=>rows.map(description=>({description,data:{animations:[]},skeleton:{findBone:()=>null},restBones:{}})),seek(){},bounds:()=>({minX:0,maxX:320,minY:0,maxY:140}),drawCanvas(){},drawWorld(){},destroyCanvas(){},transformPoint:(_d,x,y)=>({x,y})};
 const description={layers:[{uuid:'hero',json:{animations:{idle:{},attack_bruiser:{events:[{name:'attack',time:.1667}]},attack_fighter:{events:[{name:'attack',time:.1667}]}}},x:0,y:0,scaleX:1,scaleY:1}]};
 return{host,renderer,description,statuses,create:()=>Preview.create(host,{renderer,runtime:()=>({}),onStatus:s=>statuses.push(s)})};
}
async function isolated(run){const raf=global.requestAnimationFrame,cancel=global.cancelAnimationFrame;global.requestAnimationFrame=()=>1;global.cancelAnimationFrame=()=>{};try{await run();}finally{global.requestAnimationFrame=raf;global.cancelAnimationFrame=cancel;}}

test('live edits share pending style VFX and failures remain visible and retryable',()=>isolated(async()=>{
 const f=fixture(),create=f.renderer.createLayers;let reject,calls=0;
 f.renderer.createLayers=(runtime,layers)=>{if(layers[0]?.uuid==='fx'&&++calls===1)return new Promise((_resolve,fail)=>{reject=fail;});return create(runtime,layers);};
 const view=f.create(),description={...f.description,styleEffects:[{id:'fx',kind:'spine',description:{layers:[{...f.description.layers[0],uuid:'fx'}]}}]};
 try{
  const first=view.set({style:'fighter',settings:{visual:{}},description});for(let i=0;i<20&&!reject;i++)await Promise.resolve();assert(reject);
  let completed=false;const next=view.set({style:'fighter',settings:{visual:{offsetX:1}},description}).then(()=>{completed=true;});for(let i=0;i<10;i++)await Promise.resolve();assert.equal(completed,false,'Latest edit skipped its shared load');
  reject(Error('Broken optional atlas'));await Promise.all([first,next]);assert.match(f.statuses.at(-1).error,/Broken optional atlas/);
  await view.set({style:'fighter',settings:{visual:{offsetX:2}},description});assert.equal(calls,2);assert.equal(view.getState().styleResourcesLoaded,1);assert.equal(f.statuses.at(-1).error,null);
 }finally{view.destroy();}
}));

test('preview lifesteal uses described charm values, preserves fractional healing and is absent without gear',()=>isolated(async()=>{
 const plain=new Model('bruiser',{}, {mode:'active',hp:50,targetDistance:100,targets:1});plain.advance(.1667);assert.equal(plain.hero.hp,250);
 const f=fixture(),view=f.create(),near=(a,b)=>assert(Math.abs(a-b)<1e-7,a+' != '+b);
 try{
  await view.set({style:'bruiser',settings:{visual:{}},description:{...f.description,skillSecondaryStats:{lifeSteal:.002}}});view.setScenario({hp:50,targetDistance:100,targets:1});view.seek(.1667);near(view.getState().hp,(250+120.3125*.002)/10);
  await view.set({style:'bruiser',settings:{visual:{}},description:{...f.description,skillSecondaryStats:{lifeSteal:.004}}});view.seek(.1667);near(view.getState().hp,(250+120.3125*.004)/10);
 }finally{view.destroy();}
}));

test('staff and spear mirror with the rider, keep authored arm poses and retain facing through idle',()=>isolated(async()=>{
 const f=fixture(),view=f.create(),pose=require('../../assets/_script/HeroSkillPose'),apply=pose.applyAim,scales=[];let aims=0;
 pose.applyAim=()=>{aims++;};f.renderer.drawCanvas=(_s,_canvas,layers)=>scales.push(layers.find(layer=>layer.description.uuid==='hero').description.scaleX);
 try{
  await view.set({style:'vanguard',settings:{visual:{}},description:f.description});view.setScenario({direction:180,manualAim:true,attackRate:0});view.seek(.1);assert.equal(scales.at(-1),-1);view.seek(3);assert.equal(scales.at(-1),-1);
  await view.set({style:'mystic',settings:{visual:{}},description:f.description});view.setScenario({mode:'basic',targetDistance:-100,targets:1});view.seek(.2);assert.equal(scales.at(-1),-1);view.setScenario({targetDistance:100});view.seek(.2);assert.equal(scales.at(-1),1);
  const model=new Model('mystic',{}, {mode:'basic',targetDistance:-100,targets:1});model.advance(.1);model.targets[0].hp=0;model.advance(.1);assert.equal(model.bodyFace,-1);assert.equal(aims,0);
 }finally{pose.applyAim=apply;view.destroy();}
}));
