'use strict';
// Compare production polling with the prior full-boundary poll inside isolated VMs.
// Counter checks prove unused native getters are omitted; no game/audio is launched.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const script=path.resolve(__dirname,'../../assets/_script/GameToolsOverrides.js'),files={baseline:script,candidate:script};
const fightingTypes=require('../../assets/_script/FightingTypeDamage');
function fixture(which,native=false,settings={timingDefaults:{'enemy:91001:default':{attack:.5}}},stock=null){
 const counts={animation:0,name:0,next:0,end:0,duration:0,delay:0,time:0},data={GameTools:settings},context={exports:{},cc:{isValid:x=>!!x&&!x.destroyed,sys:{isNative:native},ENGINE_VERSION:'2.4.13'},sp:stock?.sp,spine:stock?.spine,require(name){if(name==='KinghtFallDataMgr')return{KinghtFallDataMgr:{getInstance:()=>({data})}};if(name==='./FightingTypeDamage')return fightingTypes;throw Error('Unexpected module '+name);}};
 let source=fs.readFileSync(files[which],'utf8');if(which==='baseline'){const narrow='var current = skeleton.getCurrent(0), info = animationPosition(current);';assert.equal(source.split(narrow).length,2);source=source.replace(narrow,'var current = skeleton.getCurrent(0), info = animationInfo(current);').replace('&& stockAttackRenderer(owner, skeleton)','&& false');}vm.runInNewContext(source,context,{filename:files[which]+':'+which});
 const api=context.exports,renderer={current:null,paused:false,hook:null,getCurrent(){if(this.hook){const h=this.hook;this.hook=null;return h();}return this.current;}},node={active:true,activeInHierarchy:true,_combatGeneration:1},owner={cfg:{ID:91001},node,time:{Attack:-1},spAni:renderer,getSpAni:()=>renderer,isDead:()=>false};
 function track(name='attack',time=0,end=1,nextDelay=undefined){const animation={getName(){counts.name++;return name;},getDuration(){counts.duration++;return end;}};return{getAnimation(){counts.animation++;return animation;},getNext(){counts.next++;return nextDelay===undefined?null:{getDelay(){counts.delay++;return nextDelay;}};},getAnimationEnd(){counts.end++;return end;},getTrackTime(){counts.time++;return time;},timeScale:1};}
 renderer.current=track();return{api,owner,renderer,counts,track,settings,reset(){for(const k in counts)counts[k]=0;}};
}
function state(f,hits){return{hits:JSON.parse(JSON.stringify(hits)),pending:f.api.isPending(f.owner),attack:f.owner.time.Attack};}
test('tick avoids unused native boundary getters while full attack capture remains unchanged',()=>{
 for(const which of Object.keys(files)){
  const f=fixture(which,true),hits=[],before=JSON.stringify(f.settings);f.renderer.current=f.track('attack',0,.8,.65);f.api.attack(f.owner,'enemy',()=>hits.push('hit'));
  assert(f.counts.next>0&&f.counts.end>0&&f.counts.delay>0,'Full queue metadata must still be captured');f.reset();
  f.api.tick(.1,true);assert.equal(hits.length,0);f.api.tick(.4,true);assert.deepEqual(hits,['hit']);assert.equal(f.api.isPending(f.owner),false);assert.equal(JSON.stringify(f.settings),before);
  if(which==='candidate'){assert.equal(f.counts.next,0);assert.equal(f.counts.end,0);assert.equal(f.counts.delay,0);assert.equal(f.counts.duration,0);assert(f.counts.time>0);}else assert(f.counts.next>0&&f.counts.end>0&&f.counts.delay>0);
 }
});
test('cached/no TrackEntry and paused renderers retain the same delayed release without unavailable track queries',()=>{
 for(const native of [false,true])for(const cached of [false,true]){
  const outputs=[];for(const which of Object.keys(files)){const f=fixture(which,native),hits=[];if(cached)f.renderer.current=null;f.api.attack(f.owner,'enemy',()=>hits.push('hit'));f.renderer.paused=true;f.reset();f.api.tick(.4,true);assert.equal(hits.length,0);assert.equal(f.counts.time,0);f.renderer.paused=false;f.api.tick(.49,true);assert.equal(hits.length,0);f.api.tick(.01,true);outputs.push(state(f,hits));}assert.deepEqual(outputs[1],outputs[0]);
 }
});
test('malformed live track names/times and missing fields keep exact baseline fallback, including nonfinite numbers',()=>{
 const cases=[null,{}, {animation:null,trackTime:'bad'}, {animation:{name:'attack'},trackTime:undefined}, {animation:{name:'attack'},trackTime:NaN}, {animation:{name:'attack'},trackTime:Infinity}, {animation:{name:'idle'},trackTime:-Infinity}, {getAnimation:()=>({getName:()=>17}),getTrackTime:()=>.1}];
 for(const native of [false,true])for(const current of cases){const outputs=[];for(const which of Object.keys(files)){const f=fixture(which,native),hits=[];f.api.attack(f.owner,'enemy',()=>hits.push('hit'));f.renderer.current=current;f.api.tick(.1,true);f.api.tick(.4,true);outputs.push(state(f,hits));}assert.deepEqual(outputs[1],outputs[0]);}
});
test('natural queued clip completion and early interruption preserve the captured boundary and hit moment',()=>{
 for(const end of [.3,1])for(const native of [false,true]){
  const outputs=[];for(const which of Object.keys(files)){const f=fixture(which,native,{timingDefaults:{'enemy:91001:default':{attack:.6}}}),hits=[];f.renderer.current=f.track('attack',0,end);f.api.attack(f.owner,'enemy',()=>hits.push('hit'));f.renderer.current=f.track('idle',0,100);f.api.tick(.31,true);f.api.tick(.29,true);outputs.push(state(f,hits));assert.equal(hits.length,end===.3?1:0);}assert.deepEqual(outputs[1],outputs[0]);
 }
});
test('reentrant renderer track replacement between playback and polling retains baseline cancellation',()=>{
 for(const which of Object.keys(files)){const f=fixture(which,true),hits=[];f.api.attack(f.owner,'enemy',()=>hits.push('wrong'));const old=f.renderer.current;f.renderer.hook=()=>{f.renderer.current=f.track('idle',0,2);return old;};f.api.tick(.1,true);assert.deepEqual(hits,[]);assert.equal(f.api.isPending(f.owner),false);}
});
test('release callback may replace track and queue a new attack without same-frame dispatch or losing its sentinel',()=>{
 for(const which of Object.keys(files)){const f=fixture(which,true),hits=[];f.api.attack(f.owner,'enemy',function(){hits.push('first');f.renderer.current=f.track('attack_alt',0,.9,.8);this.time.Attack=-1;f.api.attack(this,'enemy',()=>hits.push('second'));});f.api.tick(.5,true);assert.deepEqual(hits,['first']);assert.equal(f.api.isPending(f.owner),true);assert.equal(f.owner.time.Attack,-1);f.api.tick(.49,true);assert.deepEqual(hits,['first']);f.api.tick(.01,true);assert.deepEqual(hits,['first','second']);}
});
test('pooled owner generation, timer replacement and renderer replacement retire old delayed hits',()=>{
 for(const mutate of [f=>f.owner.node._combatGeneration++,f=>f.owner.time={Attack:-1},f=>f.owner.spAni={getCurrent:()=>f.track()},f=>f.owner.destroyed=true]){
  const outputs=[];for(const which of Object.keys(files)){const f=fixture(which,true),hits=[];f.owner.getSpAni=()=>f.owner.spAni;f.api.attack(f.owner,'enemy',()=>hits.push('wrong'));mutate(f);f.reset();f.api.tick(.5,true);outputs.push(state(f,hits));assert.equal(hits.length,0);assert.equal(f.api.isPending(f.owner),false);assert.equal(f.counts.time,0);}assert.deepEqual(outputs[1],outputs[0]);
 }
});
test('reentrant release cancels another queued attack and stops combat without draining a stale snapshot',()=>{
 for(const which of Object.keys(files)){const f=fixture(which,true),hits=[],second={...f.owner,node:{...f.owner.node},time:{Attack:-1}};f.api.attack(f.owner,'enemy',()=>{hits.push('first');f.api.cancel(second);});f.api.attack(second,'enemy',()=>hits.push('wrong'));f.api.tick(.5,true);assert.deepEqual(hits,['first']);assert.equal(f.api.isPending(second),false);f.api.attack(second,'enemy',()=>hits.push('wrong2'));f.api.tick(.5,false);assert.deepEqual(hits,['first']);assert.equal(f.api.isPending(second),false);}
});

function nativeRig() {
  const counts = { current: 0, animation: 0, name: 0, time: 0, speed: 0 };
  class Animation {
    constructor(label) { this.label = label; }
    get name() { return this.getName(); }
    getName() { counts.name++; return this.label; }
    getDuration() { return 1; }
  }
  class TrackEntry {
    constructor(label) { this.clip = new Animation(label); this.rate = 1; }
    get animation() { return this.getAnimation(); }
    getAnimation() { counts.animation++; return this.clip; }
    getNext() { return null; }
    getAnimationEnd() { return 1; }
    getTrackTime() { counts.time++; return 0; }
    getTimeScale() { return this.rate; }
    setTimeScale(rate) { counts.speed++; this.rate = rate; }
  }
  class SkeletonAnimation {
    getCurrent() { counts.current++; return this.track; }
  }
  class Skeleton {
    constructor() { this._nativeSkeleton = new SkeletonAnimation(); }
    isAnimationCached() { return false; }
    getCurrent(index) { return this.isAnimationCached() ? null : this._nativeSkeleton.getCurrent(index); }
    get paused() { return this.stopped || false; }
  }
  const renderer = new Skeleton();
  return { sp: { Skeleton }, spine: { TrackEntry, Animation, SkeletonAnimation }, counts, renderer,
    setTrack(label) { return (renderer._nativeSkeleton.track = new TrackEntry(label)); },
    reset() { for (const key of Object.keys(counts)) counts[key] = 0; } };
}

test('stock native attacks reuse one current track and animation name per tick', () => {
  const outputs = [];
  for (const which of Object.keys(files)) {
    const rig = nativeRig();
    const f = fixture(which, true, { timingDefaults: { 'enemy:91001:default': { attack: .5 } },
      animationSpeeds: { 'enemy:91001:default': 2 } }, rig);
    delete f.owner.getSpAni;
    f.owner.spAni = rig.renderer;
    const track = rig.setTrack('attack');
    const hits = [];
    f.api.attack(f.owner, 'enemy', () => hits.push('hit'));
    rig.reset();
    f.api.tick(.1, true);
    const queries = which === 'baseline' ? 2 : 1;
    assert.deepEqual(rig.counts, { current: queries, animation: queries, name: queries, time: 1, speed: 1 });
    assert.equal(track.rate, 2);
    assert.deepEqual(hits, []);
    f.api.tick(.15, true);
    assert.deepEqual(hits, ['hit']);
    outputs.push(state(f, hits));
  }
  assert.deepEqual(outputs[1], outputs[0]);
});

test('custom native renderer and playback hooks still re-read an interrupted attack', () => {
  for (const hook of ['renderer', 'clock', 'animation accessor']) {
    const rig = nativeRig();
    const f = fixture('candidate', true, { timingDefaults: { 'enemy:91001:default': { attack: .5 } },
      animationSpeeds: { 'enemy:91001:default': 2 } }, rig);
    delete f.owner.getSpAni;
    f.owner.spAni = rig.renderer;
    const track = rig.setTrack('attack');
    f.api.attack(f.owner, 'enemy', () => assert.fail('Interrupted attack hit'));
    if (hook === 'renderer') {
      rig.renderer.getCurrent = function (index) {
        const observed = this._nativeSkeleton.getCurrent(index);
        if (observed === track) rig.setTrack('idle');
        return observed;
      };
    } else if (hook === 'clock') track.setTimeScale = () => rig.setTrack('idle');
    else Object.defineProperty(rig.spine.TrackEntry.prototype, 'animation', {
      get() {
        if (this === track) rig.setTrack('idle');
        return this.getAnimation();
      }
    });
    rig.reset();
    f.api.tick(.1, true);
    assert.equal(rig.counts.current, 2);
    assert.equal(f.api.isPending(f.owner), false);
  }
});
