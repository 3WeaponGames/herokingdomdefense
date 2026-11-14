'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {Model}=require('../../packages/hkd-skills/preview-model'),Preview=require('../../packages/hkd-skills/preview');
function fixture(){
 const seeks=[],labels=[],draws=[],changes=[],ctx=new Proxy({getTransform:()=>({a:1,b:0,c:0,d:1,e:0,f:0}),fillText:(...args)=>labels.push(args)}, {get:(o,k)=>k in o?o[k]:()=>{}});
 class Element{constructor(doc){this.ownerDocument=doc;this.children=[];this.style={};this.width=640;this.height=500;this.listeners=new Map();}appendChild(n){n.parentNode=this;this.children.push(n);return n;}remove(){if(this.parentNode)this.parentNode.children=this.parentNode.children.filter(n=>n!==this);}setAttribute(){}focus(){}getContext(){return ctx;}getBoundingClientRect(){return{left:0,top:0,width:640,height:500};}addEventListener(type,fn){this.listeners.set(type,fn);}removeEventListener(type){this.listeners.delete(type);}setPointerCapture(){}hasPointerCapture(){return false;}releasePointerCapture(){}}
 const doc={createElement:()=>new Element(doc)},host=new Element(doc),renderer={
  createLayers:async(_runtime,descriptions)=>descriptions.map(description=>({description,data:{animations:[{name:'idle'},{name:'hit'}]},skeleton:{findBone:()=>null},restBones:{}})),
  seek:(_s,layers,name,time,loop)=>seeks.push({id:layers[0]?.description.uuid,name,time,loop}),bounds:(_s,layers)=>{const xs=layers.map(l=>l.description.x||0),ys=layers.map(l=>l.description.y||0);return{minX:Math.min(...xs)-25,maxX:Math.max(...xs)+25,minY:Math.min(...ys),maxY:Math.max(...ys)+80};},drawCanvas:(...args)=>draws.push(args),drawWorld(){},destroyCanvas(){},transformPoint:(_d,x,y)=>({x,y})};
 const animations={idle:{},hit:{bones:{root:{rotate:[{time:.4}]}}},attack_fighter:{events:[{name:'attack',time:.2}],bones:{root:{rotate:[{time:.8}]}}},attack_vanguard:{events:[{name:'attack',time:.2}],bones:{root:{rotate:[{time:.8}]}}}};
 const description={runtimePath:'fixture',layers:[{uuid:'hero',json:{animations},x:0,y:0,scaleX:1,scaleY:1}],target:{layers:[{uuid:'enemy',json:{animations},x:0,y:0,scaleX:1,scaleY:1}]}};
 const view=Preview.create(host,{renderer,runtime:()=>({}),onChange:(...args)=>changes.push(args)});
 return{view,host,renderer,seeks,labels,draws,changes,description,events:()=>host.children[0].children[1].listeners};
}
async function withPreview(run){const before=global.requestAnimationFrame,cancel=global.cancelAnimationFrame;global.requestAnimationFrame=()=>1;global.cancelAnimationFrame=()=>{};const f=fixture();try{await run(f);}finally{f.view.destroy();global.requestAnimationFrame=before;global.cancelAnimationFrame=cancel;}}
test('explicit enemy targeting controls basic attacks and remains selected when positions are moved or sought',()=>{
 const m=new Model('fighter',{}, {mode:'basic',attackRate:2,targetDistance:50});m.selectTarget(1);m.moveTarget(1,{x:70,y:10});m.advance(1);assert.equal(m.targets[0].hp,100000);assert(m.targets[1].hp<100000);m.seek(1);assert.equal(m.scenario.selectedTarget,1);assert.equal(m.scenario.targetPositions[1].x,70);assert(m.targets[1].hp<100000);
 m.moveTarget(1,{x:1000,y:0});const before=m.hits;m.advance(1);assert.equal(m.hits,before,'an explicitly selected out-of-range target does not silently attack another enemy');
});
test('enemy click selects, drag moves in world space and survives seek without creating a draft',()=>withPreview(async f=>{
 await f.view.set({style:'fighter',settings:{visual:{}},description:f.description});f.view.seek(0);const box=f.view.getState().enemyRegions[1],base={button:0,pointerId:9,clientX:(box.left+box.right)/2,clientY:(box.top+box.bottom)/2,preventDefault(){}};
 f.events().get('pointerdown')(base);assert.equal(f.view.getState().selectedTarget,1);const before=f.view.getState().targets[1];f.events().get('pointermove')({...base,clientX:base.clientX+45,clientY:base.clientY-20});f.events().get('pointerup')(base);const after=f.view.getState().targets[1];assert(after.x>before.x);assert(after.y>before.y);assert.equal(f.changes.length,0);f.view.seek(0);assert.deepEqual(f.view.getState().targets[1],after);assert(f.labels.some(([text])=>text==='Target'));
 f.view.setScenario({targetDistance:80});assert.equal(f.view.getState().targets[1].x,165);
}));
test('on-hit reaction waits for feedback delay while hit damage is immediate and seeking is deterministic',()=>withPreview(async f=>{
 await f.view.set({style:'fighter',settings:{visual:{impactDelay:.3}},description:f.description});f.view.seek(.2);assert(f.view.getState().hits>0);assert.equal(f.seeks.filter(s=>s.id==='enemy').at(-1).name,'idle');f.view.seek(.5);const hit=f.seeks.filter(s=>s.id==='enemy'&&s.name==='hit').at(-1);assert(hit);assert(Math.abs(hit.time)<1e-6);assert.equal(hit.loop,false);f.view.seek(.8);assert.equal(f.seeks.filter(s=>s.id==='enemy').at(-1).name,'idle');f.view.seek(.5);assert.equal(f.seeks.filter(s=>s.id==='enemy'&&s.name==='hit').at(-1).time,hit.time);assert.equal(f.changes.length,0);
}));
test('projectile width guide shows the actual full width and per-side collision distance',()=>withPreview(async f=>{
 await f.view.set({style:'skirmisher',settings:{projectileWidth:42,visual:{}},description:f.description});assert(f.labels.some(([text])=>text==='Projectile radius 42'));assert.equal(f.changes.length,0);
}));

test('the projectile has no independent position handles and its sprite stays centered on the swept collider',()=>withPreview(async f=>{
 const pose=require('../../assets/_script/HeroSkillPose'),previous={tip:pose.arrowTipAt,angle:pose.arrowAimAngle,aim:pose.applyAim};pose.arrowTipAt=()=>({x:30,y:100});pose.arrowAimAngle=()=>0;pose.applyAim=()=>{};f.renderer.transformPoint=(d,x,y)=>({x:d.x+x*d.scaleX,y:d.y+y*d.scaleY});
 try{const description={...f.description,layers:[{...f.description.layers[0],json:{...f.description.layers[0].json,_heroMaker:{role:3}}}]},settings={windup:.2,visual:{originX:999,offsetY:800,rotation:90}};await f.view.set({style:'skirmisher',settings,description});f.view.seek(.2);let state=f.view.getState();assert.equal(state.handles.length,0);const p=state.projectilePaths[0];assert(Math.abs(p.visual.x-30)<1e-6);assert(Math.abs(p.visual.y-100)<1e-6);assert.deepEqual(p.visual,p.damage);f.view.seek(.3);state=f.view.getState();assert.deepEqual(state.projectilePaths[0].visual,state.projectilePaths[0].damage);assert.equal(f.changes.length,0);}finally{pose.arrowTipAt=previous.tip;pose.arrowAimAngle=previous.angle;pose.applyAim=previous.aim;}
}));

test('restart resets and plays the current preview mode without drafts or audio',()=>withPreview(async f=>{
 await f.view.set({style:'fighter',settings:{visual:{}},description:f.description});f.view.setScenario({mode:'basic',moving:true,targetDistance:900});f.view.seek(1);assert(f.view.getState().hero.x>0);f.view.restart();const state=f.view.getState();assert.equal(state.time,0);assert.equal(state.mode,'basic');assert.equal(state.playing,true);assert.equal(state.silent,true);assert.equal(state.approaching,true);assert.equal(state.hero.x,0);assert.equal(f.changes.length,0);
}));

test('moving horses approach out-of-range targets before casting, including diagonal targets and deterministic seeking',()=>{
 for(const style of ['skirmisher','fighter','vanguard','mystic','bruiser','guardian']){
  const scenario={mode:'active',moving:true,targets:1,targetDistance:1200,attackRate:0,targetPositions:[{x:900,y:900}]},model=new Model(style,{windup:.2},scenario),arrival=model.approach.duration;
  assert(model.status().approaching);assert.equal(model.events.some(e=>e.kind==='cast'),false);model.advance(arrival/2);assert(model.hero.x>0&&model.hero.y>0);assert.equal(model.lastAttackKind,null);assert.equal(model.hits,0);model.advance(arrival/2+.001);assert.equal(model.status().approaching,false);assert.equal(model.isMoving(),false);const cast=model.events.find(e=>e.kind==='cast');assert(cast,style);assert(Math.abs(cast.time-arrival)<1e-8,style);assert.equal(model.lastAttackKind,'skill');
  const expected={x:model.hero.x,y:model.hero.y,time:model.time,events:model.events.map(e=>[e.kind,e.time])};model.seek(expected.time);assert(Math.abs(model.hero.x-expected.x)<1e-8);assert(Math.abs(model.hero.y-expected.y)<1e-8);assert.equal(model.events.filter(e=>e.kind==='cast').length,1);assert(Math.abs(model.events.find(e=>e.kind==='cast').time-arrival)<1e-8);
 }
 const basic=new Model('fighter',{}, {mode:'basic',moving:true,targets:1,targetDistance:900});basic.advance(basic.approach.duration+2);assert(basic.hits>0);assert.equal(basic.events.some(e=>e.kind==='cast'),false);
 const distant=new Model('skirmisher',{windup:.35},{mode:'active',moving:true,targets:1,targetDistance:1500,attackRate:0});distant.advance(distant.approach.duration+.4);assert.equal(distant.projectiles.length,1,'An approaching preview must not clip the arrow inside the old fixed box');distant.advance(.5);assert(distant.hits>0);
});
test('Vanguard releases the final pose instead of replaying an ordinary recovery after the seventh hit',()=>withPreview(async f=>{
 await f.view.set({style:'vanguard',settings:{duration:2.5,strikes:7,visual:{}},description:f.description});f.view.seek(2.5);assert.equal(f.view.getState().hits,7);assert.equal(f.seeks.filter(s=>s.id==='hero').at(-1).name,'attack_vanguard');f.view.seek(2.51);assert.equal(f.seeks.filter(s=>s.id==='hero').at(-1).name,'idle');
}));
test('selecting or moving an enemy during a spear cast preserves the authored weapon pose and committed hit arc',()=>withPreview(async f=>{
 const pose=require('../../assets/_script/HeroSkillPose'),original=pose.applyAim,aims=[];pose.applyAim=(_s,direction)=>aims.push({...direction});
 try{await f.view.set({style:'vanguard',settings:{duration:2.5,strikes:7,visual:{}},description:f.description});f.view.seek(.1);const region=f.view.getState().enemyRegions[1],event={button:0,pointerId:3,clientX:(region.left+region.right)/2,clientY:(region.top+region.bottom)/2,preventDefault(){}};f.events().get('pointerdown')(event);f.events().get('pointermove')({...event,clientY:event.clientY-100});f.events().get('pointerup')(event);assert.equal(f.view.getState().selectedTarget,1);assert.equal(aims.length,0,'Spear keeps its authored pose instead of rotating toward the target');const model=new Model('vanguard',{}, {mode:'active',direction:0});model.selectTarget(1);model.moveTarget(1,{x:0,y:100});assert.deepEqual(model.state.active.direction,{x:1,y:0});}
 finally{pose.applyAim=original;}
}));
test('Mystic cannot consume an active cooldown or seed demo charges on a dead selected target',()=>{
 const m=new Model('mystic',{}, {mode:'basic',targetDistance:100});m.targets[0].hp=0;m.selectTarget(0);assert.equal(m.cast(),false);assert.equal(m.state.cooldown,0);assert.equal(m.state.marked,false);
});
test('an obsolete rejected rig cannot report failure after another style has loaded successfully',()=>withPreview(async f=>{
 const create=f.renderer.createLayers;let reject;f.renderer.createLayers=(runtime,layers)=>layers.some(l=>l.uuid==='obsolete')?new Promise((_resolve,r)=>reject=r):create(runtime,layers);
 const old=f.view.set({style:'fighter',settings:{visual:{}},description:{...f.description,layers:[{...f.description.layers[0],uuid:'obsolete'}]}});await Promise.resolve();assert(reject);await f.view.set({style:'guardian',settings:{visual:{}},description:f.description});reject(Error('Obsolete rig unavailable'));await assert.doesNotReject(old);assert.equal(f.view.getState().loaded,true);
}));
test('moving a preview target after release never steers an existing arrow',()=>withPreview(async f=>{
 await f.view.set({style:'skirmisher',settings:{windup:.2,visual:{}},description:f.description});f.view.seek(.21);const direction=f.view.getState().projectilePaths[0].direction,region=f.view.getState().enemyRegions[1],event={button:0,pointerId:8,clientX:(region.left+region.right)/2,clientY:(region.top+region.bottom)/2,preventDefault(){}};f.events().get('pointerdown')(event);f.events().get('pointermove')({...event,clientY:event.clientY-80});f.events().get('pointerup')(event);assert.deepEqual(f.view.getState().projectilePaths[0].direction,direction);assert.equal(f.changes.length,0);
}));

test('imported aura, shield and overhead mark handles edit only their own presentation offsets',()=>withPreview(async f=>{
 const Settings=require('../../assets/_script/HeroSkillSettings');
 for(const [style,slot]of [['fighter','passive'],['guardian','buff'],['mystic','mark']]){
  await f.view.set({style,settings:Settings.defaults(style),description:f.description});f.view.selectHandle(slot);f.view.seek(0);f.changes.length=0;
  const point=f.view.getState().handles.find(h=>h.name===slot),before=f.view.getState(),event={button:0,pointerId:22,clientX:point.x,clientY:point.y,preventDefault(){}};
  f.events().get('pointerdown')(event);f.events().get('pointermove')({...event,clientX:point.x+25,clientY:point.y-15});f.events().get('pointerup')(event);
  assert.deepEqual(f.changes.map(c=>c[0]),[['visual',slot+'OffsetX'],['visual',slot+'OffsetY']]);assert.equal(f.view.getState().hits,before.hits);assert.equal(f.view.getState().time,before.time);
 }
}));
