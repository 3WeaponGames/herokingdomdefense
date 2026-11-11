'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const Stats=require('../worlds/wave-stats'),Picker=require('../worlds/unit-picker'),Gallery=require('../worlds/unit-model-gallery');

test('wave stat preview matches enemy health multiplication and damage rounding without mutating inputs',()=>{
 const unit={id:92047,health:40,damage:10},wave={HealthCoefficient:.9,AttackCoefficient:.7},before=JSON.stringify({unit,wave});
 assert.deepEqual(Stats.resolve(unit,wave),{health:36,damage:7,baseHealth:40,baseDamage:10,healthMultiplier:.9,damageMultiplier:.7});
 assert.equal(Stats.describe(unit,wave),'36 HP · 7 damage / hit');
 assert.equal(Stats.multipliers(wave),'HP ×0.9 · Damage ×0.7');
 assert.match(Stats.formula(unit,wave),/HP: 40 × 0\.9 = 36\nDamage: round\(10 × 0\.7\) = 7/);
 assert.equal(JSON.stringify({unit,wave}),before);
 const fractional=Stats.resolve({health:33.333,damage:15},{HealthCoefficient:1.6,AttackCoefficient:.7});
 assert.equal(fractional.health,33.333*1.6);assert.equal(fractional.damage,11);
 assert.equal(Stats.format(fractional.health),'53.33');
});

test('zero coefficients and damage stay zero while missing, invalid and overflowing values stay unknown',()=>{
 assert.deepEqual(Stats.resolve({health:40,damage:0},{HealthCoefficient:0,AttackCoefficient:2}).health,0);
 assert.equal(Stats.resolve({health:40,damage:0},{HealthCoefficient:1,AttackCoefficient:2}).damage,0);
 const support=Stats.resolve({health:100},{HealthCoefficient:2,AttackCoefficient:3});assert.equal(support.health,200);assert.equal(support.damage,null);assert.equal(support.baseDamage,null);
 for(const value of [undefined,null,'2',NaN,Infinity,-1]){
  assert.equal(Stats.resolve({health:value,damage:value},{HealthCoefficient:1,AttackCoefficient:1}).health,null);
  assert.equal(Stats.resolve({health:40,damage:10},{HealthCoefficient:value,AttackCoefficient:value}).damage,null);
 }
 assert.equal(Stats.resolve({health:Number.MAX_VALUE,damage:Number.MAX_VALUE},{HealthCoefficient:2,AttackCoefficient:2}).health,null);
 assert.equal(Stats.resolve({health:40,damage:Number.MAX_VALUE},{HealthCoefficient:1,AttackCoefficient:2}).damage,null);
 assert.equal(Stats.describe(undefined,{}),'— HP · — damage / hit');
 assert.equal(Stats.format(.000001),'0.000001');assert.equal(Stats.format(1.5999999999999999),'1.6');
});

test('fractional wave multipliers retain authored precision in headers and calculation details',()=>{
 const unit={health:40,damage:15},wave={HealthCoefficient:1.125,AttackCoefficient:.675};
 assert.equal(Stats.multipliers(wave),'HP ×1.125 · Damage ×0.675');
 assert.match(Stats.formula(unit,wave),/HP: 40 × 1\.125 = 45\nDamage: round\(15 × 0\.675\) = 10/);
 assert.equal(Stats.factor(1.5999999999999999),'1.6');assert.equal(Stats.factor(1.23456789012345),'1.23456789012');
 assert.equal(Stats.factor(.00000125),'0.00000125');assert.equal(Stats.factor(undefined),'—');
 const fractional={health:33.333,damage:15};
 assert.match(Stats.formula(fractional,{HealthCoefficient:1.125,AttackCoefficient:.675}),/HP: 33\.333 × 1\.125 = 37\.499625/);
 assert.equal(Stats.describe(fractional,{HealthCoefficient:1.125,AttackCoefficient:.675}),'37.5 HP · 10 damage / hit');
});

class Element{
 constructor(tag,text,cls){this.tagName=tag;this._text=text||'';this.className=cls||'';this.children=[];this.dataset={};this.attributes={};this.value='';this.classList={add:name=>{this.className+=' '+name;},contains:name=>this.className.split(/\s+/).includes(name),toggle:(name,on)=>{const active=on===undefined?!this.classList.contains(name):on;this.className=this.className.split(/\s+/).filter(item=>item!==name).concat(active?[name]:[]).join(' ');return active;}};}
 appendChild(child){if(child.parentNode)child.remove();this.children.push(child);child.parentNode=this;return child;}
 insertBefore(child,before){if(child.parentNode)child.remove();const index=this.children.indexOf(before);this.children.splice(index<0?this.children.length:index,0,child);child.parentNode=this;return child;}
 remove(){if(this.parentNode){const siblings=this.parentNode.children;siblings.splice(siblings.indexOf(this),1);this.parentNode=null;}}
 setAttribute(name,value){this.attributes[name]=String(value);}
 getAttribute(name){return this.attributes[name];}
 set textContent(value){this._text=String(value);for(const child of this.children)child.parentNode=null;this.children=[];}
 get textContent(){return this._text+this.children.map(child=>child.textContent).join('');}
 get options(){return this.children;}
 querySelector(selector){const descendants=this.children.flatMap(child=>[child,...child.descendants()]);return descendants.find(child=>selector.startsWith('.')?child.classList.contains(selector.slice(1)):selector==='[role="alert"]'?child.attributes.role==='alert':child.tagName===selector)||null;}
 descendants(){return this.children.flatMap(child=>[child,...child.descendants()]);}
}

test('unit chooser shows scaled stats on every model and refreshes them for profile selection and catalog reload',t=>{
 t.mock.method(Gallery,'create',()=>({watch(){},setUnit(){},destroy(){}}));
 const oldRequest=global.requestAnimationFrame,oldCancel=global.cancelAnimationFrame;global.requestAnimationFrame=()=>1;global.cancelAnimationFrame=()=>{};
 const el=(tag,text,cls)=>new Element(tag,text,cls),dialog=el('section'),units=[{id:1,name:'Solo',health:40,damage:10},{id:2,name:'Mage',modelKey:'mage',profileName:'Standard',health:20,damage:15},{id:3,name:'Mage',modelKey:'mage',profileName:'Elite',health:60,damage:30}],wave={HealthCoefficient:1.5,AttackCoefficient:.7},before=JSON.stringify({units,wave}),selected=new Set([2]);
 const button=(parent,text,handler)=>{const input=el('button',text);input.onclick=handler;parent.appendChild(input);return input;},field=(parent,name,value,change)=>{const label=el('label'),input=el('select');input.value=value;input.change=change;label.appendChild(input);parent.appendChild(label);return input;};
 let dispose;
 try{
  dispose=Picker.mount(dialog,{el,button,field,units,wave,selected,controls:el('div'),ipc(){throw Error('Stats cannot request game operations');}});
  assert.equal(dialog.querySelector('.world-unit-picker-scaling').textContent,'HP ×1.5 · Damage ×0.7 · Per unit, before battle buffs.');
  const entries=()=>dialog.descendants().filter(item=>item.classList.contains('world-unit-entry')),solo=entries()[0],mage=entries()[1];
  assert.equal(solo.querySelector('.world-unit-profile-stats').textContent,'60 HP · 7 damage / hit');
  assert.equal(mage.querySelector('.world-unit-profile-stats').textContent,'30 HP · 11 damage / hit');
  assert.match(solo.querySelector('.world-unit-choice').title,/HP: 40 × 1\.5 = 60/);
  mage.querySelector('select').change(3);
  assert.deepEqual([...selected],[3]);assert.equal(mage.querySelector('.world-unit-profile-stats').textContent,'90 HP · 21 damage / hit');
  assert.equal(JSON.stringify({units,wave}),before,'Browsing profiles leaves all source data intact');
  dispose.reload(units.map(unit=>Object.assign({},unit,unit.id===3?{health:80,damage:40}:{})));
  assert.equal(dialog.descendants().filter(item=>item.classList.contains('world-unit-picker-scaling')).length,1);
  assert.equal(entries()[1].querySelector('.world-unit-profile-stats').textContent,'120 HP · 28 damage / hit');
  assert.match(entries()[1].querySelector('.world-unit-profile-stats').title,/Damage: round\(40 × 0\.7\) = 28/);
 }finally{if(dispose)dispose();if(oldRequest===undefined)delete global.requestAnimationFrame;else global.requestAnimationFrame=oldRequest;if(oldCancel===undefined)delete global.cancelAnimationFrame;else global.cancelAnimationFrame=oldCancel;}
});
