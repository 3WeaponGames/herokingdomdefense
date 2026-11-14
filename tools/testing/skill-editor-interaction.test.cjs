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
 await f.view.set({style:'skirmisher',settings:{projectileWidth:42,visual:{}},description:f.description});assert(f.labels.some(([text])=>text==='Width 84 (±42)'));assert.equal(f.changes.length,0);
}));
test('Vanguard releases the final pose instead of replaying an ordinary recovery after the seventh hit',()=>withPreview(async f=>{
 await f.view.set({style:'vanguard',settings:{duration:2.5,strikes:7,visual:{}},description:f.description});f.view.seek(2.5);assert.equal(f.view.getState().hits,7);assert.equal(f.seeks.filter(s=>s.id==='hero').at(-1).name,'attack_vanguard');f.view.seek(2.51);assert.equal(f.seeks.filter(s=>s.id==='hero').at(-1).name,'idle');
}));
test('selecting or moving an enemy during a cast keeps visual weapon aim on the committed hit arc',()=>withPreview(async f=>{
 const pose=require('../../assets/_script/HeroSkillPose'),original=pose.applyAim,aims=[];pose.applyAim=(_s,direction)=>aims.push({...direction});
 try{await f.view.set({style:'vanguard',settings:{duration:2.5,strikes:7,visual:{}},description:f.description});f.view.seek(.1);const region=f.view.getState().enemyRegions[1],event={button:0,pointerId:3,clientX:(region.left+region.right)/2,clientY:(region.top+region.bottom)/2,preventDefault(){}};f.events().get('pointerdown')(event);f.events().get('pointermove')({...event,clientY:event.clientY-100});f.events().get('pointerup')(event);assert.equal(f.view.getState().selectedTarget,1);assert.deepEqual(aims.at(-1),{x:1,y:0});}
 finally{pose.applyAim=original;}
}));
test('Mystic cannot consume an active cooldown or seed demo charges on a dead selected target',()=>{
 const m=new Model('mystic',{}, {mode:'basic',targetDistance:100});m.targets[0].hp=0;m.selectTarget(0);assert.equal(m.cast(),false);assert.equal(m.state.cooldown,0);assert.equal(m.state.marked,false);
});
test('an obsolete rejected rig cannot report failure after another style has loaded successfully',()=>withPreview(async f=>{
 const create=f.renderer.createLayers;let reject;f.renderer.createLayers=(runtime,layers)=>layers.some(l=>l.uuid==='obsolete')?new Promise((_resolve,r)=>reject=r):create(runtime,layers);
 const old=f.view.set({style:'fighter',settings:{visual:{}},description:{...f.description,layers:[{...f.description.layers[0],uuid:'obsolete'}]}});await Promise.resolve();assert(reject);await f.view.set({style:'guardian',settings:{visual:{}},description:f.description});reject(Error('Obsolete rig unavailable'));await assert.doesNotReject(old);assert.equal(f.view.getState().loaded,true);
}));
test('the arrow Origin handle uses the same locked cast direction after selecting another enemy',()=>withPreview(async f=>{
 const pose=require('../../assets/_script/HeroSkillPose'),original={tip:pose.arrowTip,angle:pose.arrowAimAngle,aim:pose.applyAim},directions=[];
 pose.arrowTip=(_s,d)=>{directions.push({...d});return{x:20,y:20};};pose.arrowAimAngle=()=>0;pose.applyAim=()=>{};
 const create=f.renderer.createLayers;f.renderer.createLayers=async(...args)=>{const layers=await create(...args);for(const layer of layers)layer.skeleton.findBone=()=>({worldX:20,worldY:20});return layers;};
 try{const description={...f.description,layers:[{...f.description.layers[0],json:{...f.description.layers[0].json,_heroMaker:{role:3}}}]};await f.view.set({style:'skirmisher',settings:{windup:.35,visual:{}},description});f.view.seek(.1);const region=f.view.getState().enemyRegions[1],event={button:0,pointerId:8,clientX:(region.left+region.right)/2,clientY:(region.top+region.bottom)/2,preventDefault(){}};f.events().get('pointerdown')(event);f.events().get('pointermove')({...event,clientY:event.clientY-80});f.events().get('pointerup')(event);assert.equal(f.view.getState().selectedTarget,1);assert.deepEqual(directions.at(-1),{x:1,y:0});}
 finally{pose.arrowTip=original.tip;pose.arrowAimAngle=original.angle;pose.applyAim=original.aim;}
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
