'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {test}=require('node:test');
const Profile=require('../lib/attack-profile');
const clone=value=>JSON.parse(JSON.stringify(value));
function description(){return {type:'ally',id:'90004',key:'ally:90004:default',form:'default',level:2,defaultTiming:.5,layers:[
  {json:{animations:{
    attack:{bones:{body:{rotate:[{time:0},{time:.8}]}},slots:{weapon:{attachment:[{time:1.2}]}}},
    idle:{bones:{body:{translate:[{time:99}]}}}
  }}},
  {json:{animations:{attack:{drawOrder:[{time:1.4}],deform:{body:{mesh:{deform:[{time:1.6}]}}},events:[{time:.5,name:'hit'}]}}}}
]};}
const request=(level=2)=>({type:'ally',id:90004,level,record:{ID:90004,AttackInterval:.829}});

test('Fantasy Boss metrics inherit 0.25 playback without creating settings and honor explicit attack speed edits',()=>{
 const source=description();source.layers[0].json._fantasy={pack:'fantasy-bosses'};const settings={timingDefaults:{'enemy:94001:default':{attack:.52}}},before=clone(settings),input={type:'enemy',id:94001,record:{AttackInterval:1}};
 assert.equal(Profile.describe(source,settings,input).animationSpeed,.25);assert.deepEqual(settings,before);source.layers[0].json._fantasy.pack='fantasy-monsters';assert.equal(Profile.describe(source,settings,input).animationSpeed,.35);settings.animationSpeeds={'enemy:94001:default':1.2};assert.equal(Profile.describe(source,settings,input).animationSpeed,1.2);
});

test('saved whole-unit speed controls attack metrics before legacy attack edits, including frozen zero and compact metadata',()=>{
 const source=description();source.layers[0].json._fantasy={pack:'fantasy-bosses'};source.unitAnimationSpeed=.5;
 const settings={animationSpeeds:{'ally:90004:default':2,'ally:90004:level:2':3}},before=clone(settings);
 const profile=Profile.describe(source,settings,request());assert.equal(profile.animationSpeed,.125);assert.equal(profile.unitAnimationSpeed,.5);assert.equal(profile.modelAnimationSpeed,.25);
 const compact={...profile,attackDuration:profile.duration,layers:[]};assert.equal(Profile.describe(compact,settings,request()).animationSpeed,.125);
 source.unitAnimationSpeed=.01;const slow=Profile.describe(source,settings,request());assert.equal(slow.animationSpeed,.0025);const cadence=require('../../../assets/_script/AttackCadence').measure(slow.cooldownRate,slow.hitTime,slow.duration,slow.animationSpeed,slow.cooldownStart);assert(cadence&&cadence.rate>0);assert(Number.isFinite(cadence.cycle));
 source.unitAnimationSpeed=0;assert.equal(Profile.describe(source,settings,request()).animationSpeed,0);
 for(const bad of [null,'1',-1,2.01,Infinity]){source.unitAnimationSpeed=bad;assert.equal(Profile.describe(source,settings,request()).animationSpeed,3);}
 assert.deepEqual(settings,before);
});

test('attack profile measures the complete selected appearance across bones, slots, deforms, draw order and events',()=>{
  const source=description(),before=clone(source),profile=Profile.describe(source,{},request());
  assert.equal(profile.duration,1.6);assert.equal(profile.cooldownRate,.829,'The profile keeps source precision for calculation');
  assert.equal(profile.level,2);assert.equal(profile.id,'90004');assert.equal(profile.key,'ally:90004:default');assert.equal(profile.speedKey,'ally:90004:level:2');
  assert.deepEqual(source,before);assert.equal(profile.hitTime,0,'Reference-only animation events do not become gameplay defaults');
});

test('only finite attack keyframe times contribute, and explicit measured durations override JSON without invented defaults',()=>{
  const source=description();source.layers[0].json.animations.attack.bones.body.rotate.push({time:NaN},{time:Infinity},{time:'20'},{time:-9});
  assert.equal(Profile.describe(source,{},request()).duration,1.6);
  source.attackDuration=.75;assert.equal(Profile.describe(source,{},request()).duration,.75);
  source.attackDuration=0;assert.equal(Profile.describe(source,{},request()).duration,0);
  for(const invalid of [NaN,Infinity,-1,'2']){source.attackDuration=invalid;assert.equal(Profile.describe(source,{},request()).duration,1.6);}
  assert.equal(Profile.describe({layers:[{},null,{json:{animations:{idle:{events:[{time:10}]}}}}]},null,request()).duration,0);
  assert.equal(Profile.duration(null),0);
});

test('each ally level resolves its own speed, then shared speed, while all other settings remain untouched',()=>{
  const settings={animationSpeeds:{'ally:90004:default':1.25,'ally:90004:level:1':.5,'ally:90004:level:2':2},future:{retain:true}},before=clone(settings);
  assert.equal(Profile.describe(description(),settings,request(1)).animationSpeed,.5);
  assert.equal(Profile.describe(description(),settings,request(2)).animationSpeed,2);
  assert.equal(Profile.describe(description(),settings,request(3)).animationSpeed,1.25);
  assert.deepEqual(settings,before);
  for(const invalid of [undefined,null,'2',0,.09,4.01,NaN,Infinity]){
    settings.animationSpeeds['ally:90004:level:2']=invalid;
    assert.equal(Profile.describe(description(),settings,request()).animationSpeed,1.25);
  }
  delete settings.animationSpeeds;assert.equal(Profile.describe(description(),settings,request()).animationSpeed,1);
});

test('runtime gold timing precedence includes explicit zero and does not revive a malformed custom value from defaults',()=>{
  const source=description(),settings={timingDefaults:{'ally:90004:default':{attack:.5}},timings:{'ally:90004:default':{attack:.7}}};
  assert.equal(Profile.describe(source,settings,request()).hitTime,.7);
  settings.timings['ally:90004:default'].attack=0;assert.equal(Profile.describe(source,settings,request()).hitTime,0);
  for(const malformed of [null,{},7,{attack:'1'},{attack:-1},{attack:10.1},{attack:Infinity}]){
    settings.timings['ally:90004:default']=malformed;assert.equal(Profile.describe(source,settings,request()).hitTime,0);
  }
  delete settings.timings['ally:90004:default'];assert.equal(Profile.describe(source,settings,request()).hitTime,.5);
  delete settings.timingDefaults;assert.equal(Profile.describe(source,settings,request()).hitTime,0,'An authored defaultTiming reference is not an active saved windup');
  delete settings.timings;assert.equal(Profile.describe(source,settings,request()).hitTime,0);
});

test('enemy forms, allies and the hero keep independent canonical timing/speed keys',()=>{
  const settings={animationSpeeds:{'enemy:90011:2':.75,'ally:90011:level:2':2,'hero:hero:default':1.5},timingDefaults:{'enemy:90011:2':{attack:.4},'hero:hero:default':{attack:.2}}};
  const enemy=Profile.describe({type:'enemy',id:90011,key:'enemy:90011:2'},settings,{type:'enemy',id:90011,level:2,record:{AttackInterval:1}});
  assert.equal(enemy.key,'enemy:90011:2');assert.equal(enemy.speedKey,enemy.key);assert.equal(enemy.level,0);assert.equal(enemy.animationSpeed,.75);assert.equal(enemy.hitTime,.4);
  const hero=Profile.describe({type:'hero',id:'hero'},settings,{type:'hero',id:'hero',record:{AttackInterval:1}});
  assert.equal(hero.key,'hero:hero:default');assert.equal(hero.animationSpeed,1.5);assert.equal(hero.hitTime,.2);
  const ally=Profile.describe(description(),settings,{type:'ally',id:90011,level:2,record:{AttackInterval:1}});
  assert.equal(ally.key,'ally:90011:default');assert.equal(ally.animationSpeed,2);assert.equal(ally.hitTime,0);
});

test('cadence policy matches every original enemy controller and the independent allied Crossbow controller',()=>{
  const expected={90001:'hit',90002:'hit',90003:'start',90004:'hit',90005:'start',90006:'hit-unblocked',90007:'hit',90008:'start',90009:'hit-unblocked',90010:'hit',90011:'hit',90012:'hit'};
  for(const [id,policy]of Object.entries(expected))assert.equal(Profile.describe({}, {}, {type:'enemy',id,record:{AttackInterval:1}}).cooldownStart,policy,id);
  for(const id of [90001,90002,90003,90004])assert.equal(Profile.describe({}, {}, {type:'ally',id,record:{AttackInterval:1}}).cooldownStart,id===90003?'start':'hit');
  for(const [BehaviorTemplate,policy]of Object.entries(expected).filter(([id])=>Number(id)<=90009)){
    const record={ID:92055,prefab:'Campaign_92055',BehaviorTemplate:Number(BehaviorTemplate),AttackInterval:1};
    assert.equal(Profile.describe({}, {}, {type:'enemy',id:92055,record}).cooldownStart,policy,'Imported/campaign '+BehaviorTemplate);
  }
  const original={prefab:'ItemEnemy03',BehaviorTemplate:90001,AttackInterval:1};
  assert.equal(Profile.describe({}, {}, {type:'ally',id:90004,record:original}).cooldownStart,'start','A selected original prefab determines the actual controller');
  assert.equal(Profile.describe({cooldownStart:'start'}, {}, {type:'enemy',id:90001}).cooldownStart,'start','An explicit controller measurement can override inferred metadata');
});

test('inferred policies agree with the shipped controller timer anchors and attack-state restart rules',()=>{
  const {environment}=require('../../../tools/navigation/runtime-harness.cjs');
  for(const [type,ids]of [['enemy',[90001,90002,90003,90004,90005,90006,90007,90008,90009,90010]],['ally',[90001,90002,90003,90004]]])for(const id of ids){
    const e=environment();let starts=0;
    e.stubs.GameToolsOverrides={isPending:()=>false,attack(){starts++;}};
    const name='KinghtFall'+(type==='ally'?'Soldier':'Enemy')+'Item'+String(id-90000).padStart(2,'0');
    const actor=e.actor(name);actor.cfg={...e.cfg,ID:id};actor.time.Attack=123;
    let target;
    if(type==='ally'){
      // Timer policy is measured for an eligible attack, not an empty battlefield.
      e.game._combatEpoch=1;actor.node._combatGeneration=1;
      target={...e.unit(actor.node.x+10,actor.node.y),hp:100,isDead:()=>false};target.node._combatGeneration=1;
      e.game.gameData.enemies.push(target);actor._orderTarget=target;actor._orderTargetGeneration=1;
    }
    actor.doAttackStart();assert.equal(starts,1,name);
    if(target)assert.equal(actor._attackIntent.target,target,name+' captures the live target before measuring its timer');
    const policy=Profile.describe({}, {}, {type,id,record:actor.cfg}).cooldownStart;
    assert.equal(actor.time.Attack,policy==='start'?0:-1,name+' cooldown anchor');
    if(id===90010)continue; // Boss form transitions have their own update path.
    starts=0;actor.time.Attack=1;actor.state=2;actor.bornInfo={nodeIndex:1,pathList:[]};
    actor.onUpdate(0);
    assert.equal(starts,policy==='hit-unblocked'?1:0,name+' animation completion gate');
  }
});

test('profile metadata is safe for missing records and runs in the browser without filesystem or Node globals',()=>{
  const source=fs.readFileSync(path.join(__dirname,'../lib/attack-profile.js'),'utf8'),context={module:{exports:{}}};
  vm.runInNewContext(source,context);const browser=context.module.exports;
  assert.equal(browser.describe(description(),{},request()).duration,1.6);
  for(const record of [undefined,{}, {AttackInterval:0},{AttackInterval:-1},{AttackInterval:NaN},{AttackInterval:Infinity},{AttackInterval:'1'}])assert.equal(browser.describe(null,null,{type:'ally',id:90004,record}).cooldownRate,0);
  assert.equal(browser.describe(description(),{},request('2')).level,0);
});
