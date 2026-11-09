'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {test}=require('node:test');
const Cadence=require('../../../assets/_script/AttackCadence'),Schema=require('../lib/schema');
const temporary=require('./owned-temp'),{Store}=require('../lib/store');
const near=(actual,expected)=>assert(Math.abs(actual-expected)<1e-10,actual+' should equal '+expected);
function documents(){
  const unit={ID:90001,Name:'Guard',prefab:'ItemEnemy01',Health:40,AttackDamage:10,AttackInterval:1,AttackRange:50,SearchRange:100,Speed:80,DeathAni:1};
  const A={SoldierCfg:{90001:{...unit}},AllyCfg:{90001:{...unit}},BuildEnum:{3:{lockCose:0,levelList:[1,2,3].map((level,i)=>({ID:3,index:11+i,level,Hp:100,Zoom:1,Data:[4,90001,8]}))}}};
  return {A,overrides:{version:1,timingDefaults:{'ally:90001:default':{attack:.5}},timings:{'ally:90001:default':{attack:.4}},future:{retain:true}},catalog:{version:1,entries:{}}};
}
const findings=d=>Schema.validate(d).filter(issue=>issue.doc==='overrides'&&issue.path[0]==='animationSpeeds');

test('actual frequency includes hit windup and preserves the stored cooldown at different animation speeds',()=>{
  const ordinary=Cadence.measure(.2,.5,1,1),fast=Cadence.measure(.2,.5,1,2),slow=Cadence.measure(.2,.5,1,.5);
  near(ordinary.cooldown,5);near(ordinary.windup,.5);near(ordinary.cycle,5.5);near(ordinary.rate,1/5.5);
  near(fast.cooldown,5);near(fast.windup,.25);near(fast.cycle,5.25);near(fast.rate,1/5.25);
  near(slow.cycle,6);near(slow.rate,1/6);
  assert.notEqual(fast.rate,ordinary.rate*2,'Doubling playback speed must not double the cooldown refill');
});

test('an unfinished attack animation caps landed frequency even after cooldown refills',()=>{
  const result=Cadence.measure(10,.5,2,1);
  near(result.cycle,2);near(result.rate,.5);near(result.maximumRate,.5);
  const fast=Cadence.measure(10,.5,2,2);near(fast.cycle,1);near(fast.rate,1);
});

test('ranged controllers refill cooldown during windup and retain their original start-to-start cadence',()=>{
  const ordinary=Cadence.measure(.2,.5,1,1,'start'),fast=Cadence.measure(.2,.5,1,2,'start');
  near(ordinary.cycle,5);near(ordinary.rate,.2);near(fast.cycle,5);near(fast.rate,.2);
  const blocked=Cadence.measure(10,.5,2,1,'start');near(blocked.cycle,2);near(blocked.maximumRate,.5);
  const pending=Cadence.measure(10,3,2,1,'start');near(pending.cycle,3);near(pending.maximumRate,1/3);
  near(Cadence.cooldownRateFor(.4,.5,1,1,'start'),.4);
  near(Cadence.cooldownRateFor(.5,.5,2,1,'start'),.5);
  assert.equal(Cadence.cooldownRateFor(.51,.5,2,1,'start'),null);
});

test('support casts can restart after their hit and cooldown without waiting for the prior clip to finish',()=>{
  const result=Cadence.measure(10,.5,2,1,'hit-unblocked');near(result.cycle,.6);near(result.rate,1/.6);near(result.maximumRate,2);
  near(Cadence.measure(10,.5,2,2,'hit-unblocked').cycle,.35);
  const stored=Cadence.cooldownRateFor(1,.5,5,1,'hit-unblocked');near(stored,2);near(Cadence.measure(stored,.5,5,1,'hit-unblocked').rate,1);
  assert.equal(Cadence.cooldownRateFor(2,.5,5,1,'hit-unblocked'),null,'A finite cooldown cannot exceed the hit-marker limit');
  const zero=Cadence.measure(3,0,9,1,'hit-unblocked');near(zero.rate,3);assert.equal(zero.maximumRate,Infinity);
});

test('inverse editing round-trips all controller policies without rewriting their timing or precision',()=>{
  for(const policy of ['hit','start','hit-unblocked'])for(const [cooldown,hit,duration,speed]of [[.2,.5,1,1],[2,.5,3,2],[1.234567,.3,.6,1.25]]){
    const result=Cadence.measure(cooldown,hit,duration,speed,policy),stored=Cadence.cooldownRateFor(result.rate,hit,duration,speed,policy);
    assert(stored>0);near(Cadence.measure(stored,hit,duration,speed,policy).rate,result.rate);
  }
});

test('editing actual frequency reverses to full-precision cooldown without moving the hit or altering the clip',()=>{
  for(const [cooldown,hit,duration,speed]of [[.2,.5,1,1],[.2,.5,1,2],[1.234567,.3,.6,1.25],[10,.5,2,1]]){
    const measured=Cadence.measure(cooldown,hit,duration,speed),stored=Cadence.cooldownRateFor(measured.rate,hit,duration,speed);
    assert(stored>0);near(Cadence.measure(stored,hit,duration,speed).rate,measured.rate);
    if(measured.cycle>measured.animationDuration)near(stored,cooldown);
  }
  const stored=Cadence.cooldownRateFor(.83,.2,.5,1);near(Cadence.measure(stored,.2,.5,1).rate,.83);
  assert.notEqual(stored,Number(stored.toFixed(2)),'Storage must not round to the display precision');
  assert.equal(Cadence.cooldownRateFor(.51,.5,2,1),null,'A rate above clip capacity cannot be authored');
  assert.equal(Cadence.cooldownRateFor(2,.5,.4,1),null,'A hit-time limit requires a positive cooldown');
});

test('zero hit times and zero-length clips stay valid while missing or unsafe metadata stays unknown',()=>{
  const zero=Cadence.measure(2,0,0,1);near(zero.rate,2);assert.equal(zero.maximumRate,Infinity);
  near(Cadence.cooldownRateFor(2,0,0,1),2);
  for(const index of [0,1,2,3])for(const value of [undefined,null,'1',NaN,Infinity,-1]){
    const args=[1,.5,1,1];args[index]=value;assert.equal(Cadence.measure(...args),null,index+':'+value);
    assert.equal(Cadence.cooldownRateFor(...args),null,index+':'+value);
  }
  assert.equal(Cadence.measure(0,.5,1,1),null);assert.equal(Cadence.measure(1,.5,1,0),null);
  assert.equal(Cadence.cooldownRateFor(0,.5,1,1),null);assert.equal(Cadence.cooldownRateFor(1,.5,1,0),null);
});

test('presentation rounds to two decimal digits without changing the measured value',()=>{
  for(const [value,text]of [[.829,'0.83'],[.824,'0.82'],[1,'1.00'],[0,'0.00'],[1.005,'1.01'],[2.675,'2.68']])assert.equal(Cadence.format(value),text);
  for(const value of [undefined,null,NaN,Infinity,-1,'1'])assert.equal(Cadence.format(value),'—');
  const result=Cadence.measure(1.234567,.3,.6,1.25),before=JSON.stringify(result);Cadence.format(result.rate);assert.equal(JSON.stringify(result),before);
});

test('cadence math also loads in Cocos or browser VMs without Node or mutable configuration',()=>{
  const context={exports:{}};vm.runInNewContext(fs.readFileSync(path.resolve(__dirname,'../../../assets/_script/AttackCadence.js'),'utf8'),context);
  near(context.exports.measure(.2,.5,1,2).rate,1/5.25);assert.equal(context.exports.format(.829),'0.83');
});

test('animation speed keys support independent authored ally levels and retain existing hero, enemy and shared settings',()=>{
  const d=documents();d.overrides.animationSpeeds={'ally:90001:default':1.25,'ally:90001:level:1':.5,'ally:90001:level:2':2,'ally:90001:level:3':3,'enemy:90001:default':1.5,'hero:hero:default':.75};
  const before=JSON.stringify(d);assert.deepEqual(findings(d),[]);assert.equal(JSON.stringify(d),before,'Validation never seeds or migrates speed settings');
  assert.deepEqual(d.overrides.timingDefaults,{'ally:90001:default':{attack:.5}});assert.deepEqual(d.overrides.timings,{'ally:90001:default':{attack:.4}});
});

test('noncanonical, nonexistent, wrong-side and unavailable animation speed levels are rejected without repair',()=>{
  const keys=['ally:90001:level:0','ally:90001:level:01','ally:090001:level:1','ally:90001:level:4','ally:90005:level:1','enemy:90001:level:1','hero:hero:level:1','ally:90001:level:1:extra','enemy:90001:2'];
  for(const key of keys){const d=documents();d.overrides.animationSpeeds={[key]:1};const before=JSON.stringify(d);assert(findings(d).some(issue=>issue.path[1]===key),key);assert.equal(JSON.stringify(d),before);}
  for(const speed of [0,.099,4.001,NaN,Infinity,'2',null]){const d=documents();d.overrides.animationSpeeds={'ally:90001:level:2':speed};assert(findings(d).some(issue=>/between 0.1 and 4/.test(issue.message)),String(speed));}
  const d=documents();d.overrides.animationSpeeds={'ally:90001:level:3':2};d.A.BuildEnum[3].levelList.pop();assert(findings(d).some(issue=>issue.path[1]==='ally:90001:level:3'));
});

test('a level speed remains a draft through undo and saves only its own key with exact shared timings preserved',()=>{
  const directory=temporary('hkd-level-animation-speed-'),d=documents(),config='assets/KinghtFallConfig/GameJsonCfg.json';
  d.overrides.animationSpeeds={'ally:90001:default':1.25,'ally:90001:level:1':.5,'enemy:90001:default':1.5};
  d.A.GameTools=d.overrides;
  const files={
    [config]:JSON.stringify(d.A,null,2).replace('"attack": 0.5','"attack": 0.5000').replace('"attack": 0.4','"attack": 0.4000')+'\n',
    'assets/KinghtFallConfigB/GameJsonCfg.json':'{"LevelCfg":[]}\n',
    'assets/KinghtFallConfigD/GameJsonCfg.json':'{"LevelCfg":[]}\n',
    'assets/resources/localization/catalog.json':'{"version":1,"entries":{}}\n'
  };
  for(const [relative,text]of Object.entries(files)){const file=path.join(directory,relative);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,text);}
  const backupRoot=path.join(directory,'backups'),store=new Store(directory,{validators:[Schema.validate],backupRoot}),before=store.draftState(),key='ally:90001:level:2';
  const read=()=>fs.readFileSync(path.join(directory,config),'utf8');
  assert.equal(store.save({version:store.version}).result.noChanges,true);assert.equal(read(),files[config]);assert(!fs.existsSync(backupRoot));
  store.change({version:store.version,edits:[{doc:'overrides',path:['animationSpeeds',key],value:2.3456}]});
  assert.equal(read(),files[config]);store.undo({version:store.version});assert.deepEqual(store.draftState(),before);
  store.redo({version:store.version});assert.equal(store.documents.overrides.data.animationSpeeds[key],2.3456);
  const result=store.save({version:store.version}).result;assert.equal(result.saved,true);assert.deepEqual(result.files,[config]);
  const expected=JSON.parse(files[config]);expected.GameTools.animationSpeeds[key]=2.3456;assert.deepEqual(JSON.parse(read()),expected);
  assert(read().includes('"attack": 0.5000'));assert(read().includes('"attack": 0.4000'));
  assert.equal(fs.readFileSync(path.join(result.backup,config),'utf8'),files[config]);
  const saved=read(),backups=fs.readdirSync(backupRoot);assert.equal(store.save({version:store.version}).result.noChanges,true);assert.equal(read(),saved);assert.deepEqual(fs.readdirSync(backupRoot),backups);
});
