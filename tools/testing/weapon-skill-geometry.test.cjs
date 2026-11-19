'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const Geometry=require('../../assets/_script/HeroSkillProjectile'),{Model}=require('../../packages/hkd-skills/preview-model'),Settings=require('../../assets/_script/HeroSkillSettings');
const near=(a,b)=>assert(Math.abs(a-b)<1e-6,`${a} != ${b}`);
test('the bow release point solves a ray through the target and is the sprite/collider center',()=>{
 const sample=d=>({x:35+d.x*25,y:80+d.y*25}),shot=Geometry.shot({x:0,y:0},{x:220,y:40},{x:1,y:0},sample),at=sample(shot.direction);near(shot.origin.x,at.x);near(shot.origin.y,at.y);near((220-shot.origin.x)*shot.direction.y-(40-shot.origin.y)*shot.direction.x,0);
 const p={x:shot.origin.x,y:shot.origin.y,visualOffset:{x:999,y:999},damageOffset:{x:-999,y:-999}};assert.deepEqual(Geometry.visualPoint(p,{offsetY:1000}),Geometry.damagePoint(p));assert.deepEqual(Geometry.visualPoint(p),shot.origin);
});
test('horizontal sword, spear, axe and hammer artwork uses the forward edge rather than its upper edge',()=>{
 const Pose=require('../../assets/_script/HeroSkillPose'),json={bones:[{name:'weapon',x:30,y:80}],animations:{attack:{}}},target={findSlot:()=>({getAttachment:()=>({offset:[-10,-2,-10,2,10,2,10,-2]})})};
 const tip=Pose.weaponTipAt(target,json,'attack',0,'weapon',{x:1,y:0},1,false);near(tip.x,40);near(tip.y,80);
});

test('PC weapon geometry preserves native lifetime guards for disposed rigs and optional HP bars',()=>{
 const load=name=>{const m={exports:{}};vm.runInNewContext(fs.readFileSync(path.resolve(__dirname,'../../assets/_script/'+name+'.js'),'utf8'),{module:m,exports:m.exports,cc:{isValid:value=>!!value&&!value.destroyed&&!value.pending}});return m.exports;};
 const pose=load('HeroSkillPose'),geometry=load('HeroSkillProjectile'),json={bones:[{name:'weapon',x:30,y:80}],animations:{attack:{}}};
 for(const retired of ['destroyed','pending']){
  const rig={[retired]:true,findBone(){throw Error('Disposed native bone');},findSlot(){throw Error('Disposed native slot');}};
  assert.equal(pose.weaponTipAt(rig,json,'attack',0,'weapon',{x:1,y:0},1,false),null,retired);assert.equal(pose.weaponTipAt(rig,null,'attack',0,'weapon',{x:1,y:0},1,false),null,retired+' fallback');
  const actor={node:{getPosition:()=>({x:10,y:20}),convertToWorldSpaceAR:()=>({x:10,y:20})},ndHp:{[retired]:true,convertToWorldSpaceAR(){throw Error('Disposed native HP bar');}}};
  const point=geometry.actorPoint(actor,{convertToNodeSpaceAR:p=>p});near(point.x,10);near(point.y,20);
 }
 const actor={node:{getPosition:()=>({x:10,y:20}),convertToWorldSpaceAR:()=>({x:10,y:20})},ndHp:{convertToWorldSpaceAR:()=>({x:10,y:120})}};
 near(geometry.actorPoint(actor,{convertToNodeSpaceAR:p=>p}).y,75);
});
test('Fighter arc offset, reach and angle change its visible effect and actual selected hits together',()=>{
 const settings={knockback:0,visual:{offsetY:20,scale:.5,arcDegrees:40}},before=JSON.stringify(settings),m=new Model('fighter',settings,{mode:'active',targets:3,attackRate:0},undefined,undefined,()=>({x:40,y:80}));
 Object.assign(m.targets[0],{x:90,y:100});Object.assign(m.targets[1],{x:110,y:100});Object.assign(m.targets[2],{x:80,y:150});m.advance(.2);assert.equal(m.hits,1);const e=m.effects[0];near(e.x,40);near(e.y,100);near(e.radius,65);near(e.halfAngle,20*Math.PI/180);assert.equal(e.resolved,true);assert.equal(JSON.stringify(settings),before);
});
test('sword, spear, axe and hammer area effects all originate at their equipped weapon point',()=>{
 for(const style of ['fighter','vanguard','bruiser','guardian']){
  const offset={x:30,y:80},m=new Model(style,{duration:1,strikes:1,visual:{offsetX:5,offsetY:10,scale:.75,arcDegrees:60}},{mode:'active',targetDistance:100,targets:1,attackRate:0},undefined,undefined,()=>offset);m.advance(style==='vanguard'?1:.2);const effect=m.effects[0];assert(effect,style);near(effect.x,35);near(effect.y,90);near(effect.radius,{fighter:130,vanguard:155,bruiser:150,guardian:250}[style]*.75);assert(effect.resolved,style);
 }
});
test('Skirmisher exposes a spread angle, range and release windup while legacy projectile fields stay hidden',()=>{
 const fields=Settings.fields('skirmisher'),arrow=fields.visual.map(f=>f.path),all=Settings.descriptors('skirmisher');for(const field of ['visual.originX','visual.scale','projectileFromBow','projectileOffsetY','projectileWidth'])assert(!arrow.includes(field),field);for(const field of ['visual.arcDegrees','volleyRange','windup'])assert(all.some(f=>f.path===field)||arrow.includes(field),field);
 for(const style of ['fighter','vanguard']){const fields=Settings.fields(style).visual;for(const key of ['offsetY','scale','arcDegrees'])assert(fields.some(f=>f.key===key),style+' '+key);}
});
