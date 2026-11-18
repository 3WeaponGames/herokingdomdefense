'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
function fixture(){
 const events=new Map(),timers=new Map(),nodes=[],rendered=[],fences=[],completed=[];let serial=0,frame=0,scene;
 class Node{
  constructor(name){Object.assign(this,{name,children:[],active:true,opacity:255,scaleX:1,scaleY:1,group:'UI'});nodes.push(this);}
  setParent(parent){this.parent=parent;parent.children.push(this);}setPosition(x,y){this.x=x;this.y=y;}setScale(v){this.scaleX=this.scaleY=v;}setContentSize(w,h){this.width=w;this.height=h;}
  addComponent(Type){this.renderer=new Type();this.renderer.node=this;return this.renderer;}
  destroy(){this.pending=true;}get activeInHierarchy(){return !this.dead&&this.active&&(!this.parent||this.parent.activeInHierarchy);}
 }
 class Sprite{};Sprite.SizeMode={CUSTOM:1};
 class Skeleton{constructor(){this._nativeSkeleton={update:()=>this.committed=this.track.time};}setSkin(skin){this.skin=skin;}setAnimation(_i,name,loop){this.animation=name;this.loop=loop;return this.track={time:0,setTrackTime(time){this.time=time;},setTimeScale(speed){this.speed=speed;}};}}
 scene=new Node('Loading');const canvas=new Node('Canvas');canvas.setParent(scene);
 function on(event,fn,once=false){const list=events.get(event)||[];list.push({fn,once});events.set(event,list);}
 function off(event,fn){events.set(event,(events.get(event)||[]).filter(entry=>entry.fn!==fn));}
 function emit(event){for(const entry of (events.get(event)||[]).slice()){if(entry.once)off(event,entry.fn);entry.fn();}}
 const cc={Node,Sprite,Canvas:{instance:{node:canvas}},Director:{EVENT_AFTER_DRAW:'draw',EVENT_BEFORE_SCENE_LAUNCH:'scene'},director:{getScene:()=>scene,on,once:(event,fn)=>on(event,fn,true),off},isValid:(value,strict)=>!!value&&!value.dead&&!(strict&&value.pending),game:{_renderContext:{MAX_TEXTURE_SIZE:3379,finish(){fences.push(['finish',frame]);},getParameter(value){assert.equal(value,3379);fences.push(['query',frame]);}}},instantiate(){throw Error('Gameplay instantiation forbidden');},AudioSource:class{constructor(){throw Error('Audio forbidden');}}};
 const exported={};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../../assets/_script/HeroSkillRendererWarmup.js'),'utf8'),{exports:exported,cc,sp:{Skeleton},setTimeout(fn,ms){const id=++serial;timers.set(id,{fn,ms});return id;},clearTimeout:id=>timers.delete(id)});
 function tick(){let guard=0;while([...timers.values()].some(t=>t.ms===0)){if(guard++>100)throw Error('Timer loop');const entry=[...timers].find(([,t])=>t.ms===0);timers.delete(entry[0]);entry[1].fn();}}
 function draw(){frame++;function destroy(node){if(node.pending||node.parent&&node.parent.dead){node.dead=true;node.children.forEach(destroy);}}nodes.forEach(destroy);for(const node of nodes)if(node.renderer&&node.activeInHierarchy)rendered.push({frame,node,asset:node.renderer.spriteFrame||node.renderer.skeletonData});emit('draw');tick();}
 const spriteAsset={id:'sprite',refs:1},spineAsset={id:'spine',refs:1,skeletonJson:{skins:[{name:'authored'}],animations:{cast:{bones:{bone:{rotate:[{time:0},{time:2}]}}}}}},rows=[{resource:'sprite',kind:'flipbook',asset:spriteAsset,clip:{}},{resource:'spine',kind:'spine',asset:spineAsset,clip:{animation:'cast',skin:'authored',premultipliedAlpha:false,duration:2,trimStart:.4,sourceEnd:1.6}}];
 return{cc,rows,nodes,rendered,fences,completed,timers,tick,draw,start(value=rows){return exported.warm(value,error=>completed.push(error),cc);},changeScene(){emit('scene');scene=new Node('Replacement');},listeners:()=>[...events.values()].reduce((n,list)=>n+list.length,0)};
}

test('native VFX renderers draw offscreen with authored settings and finish only after fences and deferred destruction',()=>{
 const f=fixture(),before=JSON.stringify(f.rows);f.start();assert.equal(f.completed.length,0);f.tick();assert.equal(f.rendered.length,0);f.draw();assert.equal(f.rendered.length,1);assert.equal(f.completed.length,0);
 const sprite=f.rendered[0].node;assert.equal(sprite.width,16);assert.equal(sprite.parent.x,1000000);assert.equal(sprite.parent.opacity,255);assert.equal(sprite.renderer.spriteFrame,null);
 f.draw();assert.equal(f.rendered.length,2);const spine=f.rendered[1].node.renderer;assert.equal(spine.animation,'cast');assert.equal(spine.skin,'authored');assert.equal(spine.premultipliedAlpha,false);assert(spine.committed>.4&&spine.committed<1.6);assert.equal(spine.track.speed,0);assert.equal(spine.skeletonData,null);assert.equal(f.completed.length,0);
 f.draw();assert.equal(f.completed.length,1);assert.equal(f.completed[0],null);assert.deepEqual(f.fences.map(x=>x[0]),['finish','query','finish','query']);assert.equal(f.listeners(),0);assert.equal(f.timers.size,0);assert.equal(JSON.stringify(f.rows),before);assert(f.nodes.filter(n=>n.name.includes('preparation')).every(n=>n.dead));
});

test('cancelling pending draw preparation clears component references and suppresses every later callback',()=>{
 for(const progressed of [false,true]){const f=fixture(),handle=f.start();f.tick();if(progressed)f.draw();handle.cancel();handle.cancel();assert.equal(f.listeners(),0);assert.equal(f.timers.size,0);for(let i=0;i<3;i++)f.draw();assert.equal(f.completed.length,0);assert(f.nodes.filter(n=>n.renderer).every(n=>!n.renderer.spriteFrame&&!n.renderer.skeletonData));assert(f.rows.every(row=>row.asset.refs===1));}
});

test('scene replacement retires its preparation host without creating anything in the replacement scene',()=>{
 const f=fixture();f.start();f.tick();f.changeScene();const count=f.nodes.length;for(let i=0;i<3;i++)f.draw();assert.equal(f.nodes.length,count);assert.equal(f.completed.length,0);assert.equal(f.listeners(),0);assert.equal(f.timers.size,0);
});

test('a malformed authored animation fails without entering readiness or retaining renderer references',()=>{
 const f=fixture();f.rows[1].clip.animation='missing';f.start();f.tick();f.draw();assert.equal(f.completed.length,1);assert.match(String(f.completed[0]),/animation unavailable/);assert.equal(f.listeners(),0);for(const n of f.nodes.filter(n=>n.renderer))assert(!n.renderer.spriteFrame&&!n.renderer.skeletonData);
});

test('asset readiness awaits renderer warmup, supports cancellation and retains its existing assets across retry',()=>{
 const api=require('../../assets/_script/HeroSkillAssetWarmup'),loads=[],scheduled=[],warm=[],flush=[],assets=[],calls=[];
 const pool=api.create({load(row,done){loads.push({row,done});return{cancel(){}};},retain:a=>a.refs++,release:a=>a.refs--,schedule:fn=>scheduled.push(fn),warm(held,done){const h={held,done,cancelled:false,cancel(){this.cancelled=true;assert([...held.values()].every(a=>a.refs===1),'Preparation must cancel before assets release');}};warm.push(h);return h;},flush(done){flush.push(done);return{cancel(){}};}});
 function drain(){while(loads.length||scheduled.length){const load=loads.shift();if(load){const asset={refs:0};assets.push(asset);load.done(null,asset);}while(scheduled.length)scheduled.shift()();}}
 pool.preload(error=>calls.push(error));drain();assert.equal(warm.length,1);assert.equal(flush.length,0);assert.equal(pool.status().ready,false);pool.release();assert(warm[0].cancelled);assert(assets.every(a=>a.refs===0));warm[0].done(null);assert.equal(flush.length,0);assert.equal(calls.length,0);
 pool.preload(error=>calls.push(error));drain();warm[1].done(null);assert.equal(flush.length,1);assert.equal(pool.status().ready,false);flush[0](null);assert.equal(pool.status().ready,true);assert.deepEqual(calls,[null]);pool.release();assert(assets.every(a=>a.refs===0));
});
