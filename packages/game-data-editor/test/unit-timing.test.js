'use strict';
const assert=require('assert'),fs=require('fs'),path=require('path'),vm=require('vm');
const root=path.resolve(__dirname,'../../..'), legacy=require('./fixtures/legacy-attack-starts.json').methods;
let data={};const runtime={exports:{},require(name){if(name==='HeroMakerRider')return{ownsAttackClock:()=>false};assert.equal(name,'KinghtFallDataMgr');return{KinghtFallDataMgr:{getInstance(){return{data};}}};},cc:{isValid:value=>!!value&&!value.destroyed},isFinite};
vm.runInNewContext(fs.readFileSync(path.join(root,'assets/_script/GameToolsOverrides.js'),'utf8'),runtime);const Timing=runtime.exports;
function method(source,name){const start=source.indexOf('_ctor.prototype.'+name+' = function'),end=source.indexOf('\n  };',start);assert(start>=0&&end>=0,name);return source.slice(source.indexOf('function',start),end+4).trim().replace(/;$/,'');}
function compile(body,trace){const statuses={Attack:2};return vm.runInNewContext('('+body+')',{GameToolsOverrides:Timing,r:statuses,s:{Attack:'Attack'},l:{Attack:'Attack'},C:{Attack:'Attack'},$z1KinghtFallModle:{KinghtFallSoldierAniEnum:{Attack:'attack'}},$z1KinghtFallEnemyBase:{KinghtFallEnemyStatus:statuses},$z1KinghtFallSoldierBase:{KinghtFallSoldierStatus:statuses},$z1KinghtFallUIGame:{default:{instance:{ctrGame:{gameData:{getEnemyList(){return[{isDead(){return false;},node:{getPosition(out){out.x=10;out.y=0;}}}];}}}}}},cc:{Vec2:{subtract(out,a,b){out.x=a.x-b.x;out.y=a.y-b.y;return out;}}}});}
function actor(trace){const a={cfg:{ID:90001},node:{active:true,activeInHierarchy:true,getPosition(out){out.x=0;out.y=0;}},time:{Attack:1},attackRange:50,vec2_1:{x:0,y:0},vec2_2:{x:0,y:0,mag(){return Math.hypot(this.x,this.y);}},state:0,dead:false,isDead(){return this.dead;},spAni:{paused:false,setAnimation(...args){trace.push(['animation',...args]);}},getSpAni(){return this.spAni;},doAttack(){trace.push(['effect',this.time.Attack,this.state]);this.time.Attack=0;},doAttackStart(){trace.push(['hero-start']);}};return a;}
let count=0;function test(name,fn){Timing.clear();data={};fn();console.log('PASS '+name);count++;}
Object.keys(legacy).forEach(name=>test('unchanged synchronous ordered trace: '+name,()=>{
    const oldTrace=[],newTrace=[],methodName=name==='KinghtFallGamePlayCtrl'?'onFindEnemy':'doAttackStart';const oldActor=actor(oldTrace),newActor=actor(newTrace);
    // Base enemy uses r for status and s for timer; soldiers use s for status/l for timer.
    function run(body,owner,trace){let text=body;if(name==='KinghtFallSoldierBase')text=text.replace('this.state = s.Attack','this.state = r.Attack');compile(text,trace).call(owner);trace.push(['return',owner.time.Attack,owner.state]);}
    run(legacy[name],oldActor,oldTrace);run(method(fs.readFileSync(path.join(root,'assets/_script/'+name+'.js'),'utf8'),methodName),newActor,newTrace);assert.deepStrictEqual(newTrace,oldTrace);assert(!Timing.isPending(newActor));
}));
test('explicit delay dispatches once across a large time step',()=>{const log=[],a=actor(log);data.GameTools={timings:{'enemy:90001:default':{attack:.5}}};Timing.attack(a,'enemy',a.doAttack);assert.equal(log.length,0);Timing.tick(.2,true);assert.equal(log.length,0);Timing.tick(.4,true);assert.equal(log.length,1);Timing.tick(10,true);assert.equal(log.length,1);});
test('no override and explicit zero remain synchronous',()=>{const log=[],a=actor(log);Timing.attack(a,'enemy',a.doAttack);assert.equal(log.length,1);data.GameTools={timings:{'enemy:90001:default':{attack:0}}};Timing.attack(a,'enemy',a.doAttack);assert.equal(log.length,2);assert(!Timing.isPending(a));});

test('boss relic slowing also delays an already queued hit without changing its authored timing',()=>{
    const log=[],a=actor(log);a.node._combatGeneration=1;
    data.GameTools={timingDefaults:{'enemy:90001:default':{attack:.5}}};const saved=JSON.stringify(data);
    Timing.attack(a,'enemy',a.doAttack);a._relicControl={generation:1,freeze:0,slow:.5,duration:2};
    Timing.tick(.5,true);assert.equal(log.length,0);Timing.tick(.5,true);assert.equal(log.length,1);assert.equal(JSON.stringify(data),saved);
});
test('saved animation defaults dispatch enemy, allied and hero attacks at their authored markers',()=>{
    const cases=[['enemy',90001,.5],['ally',90004,.5],['hero','hero',.1667]];
    cases.forEach(([type,id,at])=>{const log=[],a=actor(log);a.cfg.ID=id;data.GameTools={timingDefaults:{[Timing.keyFor(a,type)]:{attack:at}}};Timing.attack(a,type,a.doAttack);Timing.tick(at-.0001,true);assert.equal(log.length,0,type);Timing.tick(.0001,true);assert.equal(log.length,1,type);Timing.tick(1,true);assert.equal(log.length,1,type);});
});
test('a custom timing wins over its saved animation default',()=>{const log=[],a=actor(log);data.GameTools={timingDefaults:{'enemy:90001:default':{attack:.5}},timings:{'enemy:90001:default':{attack:.2}}};Timing.attack(a,'enemy',a.doAttack);Timing.tick(.2,true);assert.equal(log.length,1);});
test('an explicit zero timing remains immediate even when the animation default is later',()=>{const log=[],a=actor(log);data.GameTools={timingDefaults:{'enemy:90001:default':{attack:.5}},timings:{'enemy:90001:default':{attack:0}}};Timing.attack(a,'enemy',a.doAttack);assert.equal(log.length,1);assert(!Timing.isPending(a));});
test('resetting a custom timing restores its saved animation default',()=>{const log=[],a=actor(log);data.GameTools={timingDefaults:{'enemy:90001:default':{attack:.5}},timings:{'enemy:90001:default':{attack:.2}}};Timing.attack(a,'enemy',a.doAttack);Timing.tick(.2,true);assert.equal(log.length,1);delete data.GameTools.timings['enemy:90001:default'];Timing.attack(a,'enemy',a.doAttack);Timing.tick(.2,true);assert.equal(log.length,1);Timing.tick(.3,true);assert.equal(log.length,2);});
test('double-speed game time advances markers once without multiplying skeleton speed again',()=>{const log=[],a=actor(log);a.spAni.timeScale=2;data.GameTools={timingDefaults:{'enemy:90001:default':{attack:.5}}};Timing.attack(a,'enemy',a.doAttack);Timing.tick(.1*2,true);Timing.tick(.1*2,true);assert.equal(log.length,0);Timing.tick(.05*2,true);assert.equal(log.length,1);});
test('a paused default timing resumes at the same animation position',()=>{const log=[],a=actor(log);data.GameTools={timingDefaults:{'enemy:90001:default':{attack:.5}}};Timing.attack(a,'enemy',a.doAttack);Timing.tick(.2,true);a.spAni.paused=true;Timing.tick(5,true);assert.equal(log.length,0);a.spAni.paused=false;Timing.tick(.3,true);assert.equal(log.length,1);});
test('a delayed hero can attack again if every target leaves before its release marker',()=>{
    const log=[],a=actor(log);a.time.Attack=-1;
    const original=method(fs.readFileSync(path.join(root,'assets/_script/KinghtFallGamePlayCtrl.js'),'utf8'),'doAttack');
    const hit=vm.runInNewContext('('+original+')',{C:{Attack:'Attack'},BattleSounds:{attack(){log.push('release');}},$z1AudioMgr:{AudioMgr:{getInstance(){return{playEffectFree(){log.push('release');}};}}},$z1KinghtFallConfig:{KinghtFallAudioId:{palyer_attack:'attack'}},$z1KinghtFallUIGame:{default:{instance:{ctrGame:{gameData:{getEnemyList(){return[];}}}}}}});
    data.GameTools={timingDefaults:{'hero:hero:default':{attack:.1667}}};Timing.attack(a,'hero',hit);Timing.tick(.1667,true);assert.deepStrictEqual(log,['release']);assert.equal(a.time.Attack,0);assert(!Timing.isPending(a));
});
test('pause does not advance a pending effect',()=>{const log=[],a=actor(log);data.GameTools={timings:{'enemy:90001:default':{attack:.5}}};Timing.attack(a,'enemy',a.doAttack);a.spAni.paused=true;Timing.tick(5,true);assert.equal(log.length,0);a.spAni.paused=false;Timing.tick(.5,true);assert.equal(log.length,1);});
test('replacing an unfinished animation cancels and releases cooldown',()=>{const log=[],a=actor(log);let current={animation:{name:'attack',duration:1},trackTime:.1};a.spAni.getCurrent=()=>current;a.time.Attack=-1;data.GameTools={timings:{'enemy:90001:default':{attack:.5}}};Timing.attack(a,'enemy',a.doAttack);current={animation:{name:'move',duration:1},trackTime:0};Timing.tick(.5,true);assert.equal(log.length,0);assert.equal(a.time.Attack,0);assert(!Timing.isPending(a));});
test('natural animation completion does not lose an end-frame effect',()=>{const log=[],a=actor(log);const previous={animation:{name:'attack',duration:.5},trackTime:.1};let current=previous;a.spAni.getCurrent=()=>current;data.GameTools={timings:{'enemy:90001:default':{attack:.5}}};Timing.attack(a,'enemy',a.doAttack);previous.trackTime=.5;current={animation:{name:'idle',duration:1},trackTime:0};Timing.tick(.6,true);assert.equal(log.length,1);});
['death','disable','destroy','time reset','form change','cancel','end battle'].forEach(reason=>test('cancel pending on '+reason,()=>{const log=[],a=actor(log);data.GameTools={timings:{'enemy:90001:default':{attack:.5}}};Timing.attack(a,'enemy',a.doAttack);if(reason==='death')a.dead=true;if(reason==='disable')a.node.active=false;if(reason==='destroy')a.destroyed=true;if(reason==='time reset')a.time={};if(reason==='form change')a.cfg.ID=90002;if(reason==='cancel')Timing.cancel(a);Timing.tick(1,reason!=='end battle');assert.equal(log.length,0);assert(!Timing.isPending(a));}));
test('shared skeleton units and boss forms use independent keys',()=>{const log=[],a=actor(log),b=actor(log);b.spIdx=1;b.cfg.ID=90011;assert.equal(Timing.keyFor(b,'enemy'),'enemy:90011:2');data.GameTools={timings:{'enemy:90001:default':{attack:.5}}};Timing.attack(a,'enemy',a.doAttack);Timing.attack(a,'ally',a.doAttack);assert.equal(log.length,1);Timing.attack(b,'enemy',b.doAttack);assert.equal(log.length,2);Timing.clear();});
test('resetting override restores original effect',()=>{const log=[],a=actor(log);data.GameTools={timings:{'hero:hero:default':{attack:.5}}};Timing.attack(a,'hero',a.doAttack);Timing.tick(.5,true);delete data.GameTools.timings['hero:hero:default'];Timing.attack(a,'hero',a.doAttack);assert.equal(log.length,2);assert(!Timing.isPending(a));});
test('perk/parameter helper defaults preserve absent data',()=>{assert.equal(Timing.perkEnabled(50001),true);assert.equal(Timing.parameter('BuildStandTime',1.5),1.5);data.GameTools={perks:{50001:{enabled:false}},parameters:{BuildStandTime:2}};assert.equal(Timing.perkEnabled(50001),false);assert.equal(Timing.perkEnabled(50002),true);assert.equal(Timing.parameter('BuildStandTime',1.5),2);});
test('saved playback scales attack tracks and their release delay without changing authored defaults',()=>{
    const log=[],a=actor(log),track={animation:{name:'attack',duration:1},trackTime:0,timeScale:1};a.spAni.getCurrent=()=>track;
    data.GameTools={timingDefaults:{'enemy:90001:default':{attack:.6}},animationSpeeds:{'enemy:90001:default':1.2}};
    const before=JSON.stringify(data);Timing.attack(a,'enemy',a.doAttack);assert.equal(track.timeScale,1.2);
    Timing.tick(.4999,true);assert.equal(log.length,0);Timing.tick(.0001,true);assert.equal(log.length,1);assert.equal(JSON.stringify(data),before);
});
test('native attack layers receive setters and idle layers retain their normal playback',()=>{
    const a=actor([]),tracks=[{name:'attack',value:1},{name:'attack',value:1},{name:'idle',value:1}];
    const renderers=tracks.map(t=>({getCurrent:()=>({getAnimation:()=>({getName:()=>t.name}),setTimeScale:value=>t.value=value})}));
    a.ctrPlayAni={spAniBody:renderers[0],spAniBow:renderers[1],spAniMa:renderers[2]};data.GameTools={animationSpeeds:{'hero:hero:default':.8}};
    Timing.applyAttackPlayback(a,'hero');assert.deepStrictEqual(tracks.map(t=>t.value),[.8,.8,1]);
});
test('saved playback remains scoped to side and boss form and invalid speeds use the existing rate',()=>{
    const a=actor([]);data.GameTools={animationSpeeds:{'enemy:90001:default':1.2,'ally:90001:default':.8,'enemy:90011:2':1.5}};
    assert.equal(Timing.attackPlayback(a,'enemy'),1.2);assert.equal(Timing.attackPlayback(a,'ally'),.8);a.cfg.ID=90011;a.spIdx=1;assert.equal(Timing.attackPlayback(a,'enemy'),1.5);a.spIdx=0;assert.equal(Timing.attackPlayback(a,'enemy'),1);
});
console.log(count+' timing tests passed.');
