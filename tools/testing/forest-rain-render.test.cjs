'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
function fixture(biome='deep-forest'){
 const loads=[],assets=[],pauseCalls=[],listeners=new Map(),camera={x:0,y:0,getScreenToWorldPoint(p){return{x:p.x+this.x,y:p.y+this.y};}};
 class Node{constructor(){this.children=[];this.active=true;this.group='default';this.opacity=255;}setParent(parent){this.parent=parent;parent.children.push(this);}setPosition(p){this.x=p.x;this.y=p.y;}convertToNodeSpaceAR(p){return p;}addComponent(Type){const c=new Type();c.node=this;this.component=c;return c;}destroy(){if(this.destroyed)return;this.destroyed=true;if(this.component&&this.component.onDestroy)this.component.onDestroy();for(const n of [...this.children])n.destroy();if(this.parent)this.parent.children=this.parent.children.filter(n=>n!==this);}}
 const cc={Node,Component:class{},Class(spec){class Component{};Object.assign(Component.prototype,spec);return Component;},Sprite:class{set spriteFrame(value){this.frame=value;this.assignments=(this.assignments||0)+1;}get spriteFrame(){return this.frame;}},SpriteFrame:class{},v2:(x,y)=>({x,y}),rect:(x,y,width,height)=>({x,y,width,height}),size:(width,height)=>({width,height}),isValid:n=>!!n&&!n.destroyed,view:{getVisibleSize:()=>({width:750,height:1334})},resources:{load(resource,_type,done){loads.push({resource,done});}},game:{EVENT_HIDE:'hide',EVENT_SHOW:'show',on(key,fn,owner){listeners.set(key,()=>fn.call(owner));},off(key){listeners.delete(key);}}};
 cc.ParticleSystem=class{constructor(){this.enabled=true;this._simulator={particles:[],emitParticle(){},step(){}};}resetSystem(){this.resets=(this.resets||0)+1;}};cc.ParticleSystem.EmitterMode={GRAVITY:0};cc.ParticleSystem.PositionType={GROUPED:2};cc.macro={SRC_ALPHA:770,ONE:1};cc.sys={isNative:false};cc.color=(r,g,b,a)=>({r,g,b,a});
 const snow={};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../../assets/_script/SnowWeather.js'),'utf8'),{exports:snow,cc,require:name=>require(path.join(__dirname,'../../assets/_script',name))});
 const pause=snow.pause;snow.pause=(record,value,allowCapture)=>{const call={value,active:record.node.parent.active};if(allowCapture!==undefined)call.allowCapture=allowCapture;pauseCalls.push(call);return pause(record,value,allowCapture);};
 const exported={};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../../assets/_script/ForestRain.js'),'utf8'),{exports:exported,cc,require:name=>name.replace(/^\.\//,'')==='SnowWeather'?snow:name==='BattleSounds'?{biome:g=>g.biome}:name==='KinghtFallModle'?{KinghtFallGameStage:{End:9}}:require(path.join(__dirname,'../../assets/_script',name))});
 const root=new Node(),ui={node:new Node(),ctrUI:{node:root}},game={node:new Node(),ndDown:new Node(),biome,gameData:{levelCfg:{ID:12}},_combatEpoch:1,gameStatus:2,camera};ui.node.activeInHierarchy=true;ui.ctrGame=game;
 const runtime={game,ui};function finish(){for(const load of loads.splice(0)){const asset={refs:0,clones:[],addRef(){this.refs++;return this;},decRef(){this.refs--;},getRect:()=>({x:0,y:0}),clone(){const f={setRect(rect){this.rect=rect;},setOriginalSize(){},setOffset(){},destroy(){this.destroyed=true;}};this.clones.push(f);return f;}};assets.push(asset);load.done(null,asset);}}
 return{ensure:()=>exported.ensure(runtime),game,ui,root,loads,assets,listeners,finish,camera,pauseCalls,particleType:cc.ParticleSystem};
}
test('biome weather uses authored air and ground clips, stays below HUD/actors and owns no gameplay/audio/input',()=>{
 for(const biome of ['deep-forest','snow','ice','fire','lava']){
  const f=fixture(biome);f.ensure();f.ensure();assert.equal(f.root.children.length,1);const weather=f.game._forestRain;assert.equal(weather.node.zIndex,-1);assert.equal(weather.ground.parent,f.game.ndDown);assert.equal(weather.ground._depthGroundVisual,true);
  weather.update(1);f.finish();weather.update(1);assert.equal(weather.arts.size,2);for(const art of weather.arts.values()){assert(art.nodes.length<=(art.snow?1:art.ground?35:24));assert(art.nodes.every(r=>r.node.parent===(art.ground?weather.ground:weather.node)));if(art.snow){assert.equal(art.frames.size,0);assert(art.nodes[0].system instanceof f.particleType);}else assert(art.frames.size>1);}
  assert.deepEqual([...f.listeners.keys()].sort(),['hide','show']);weather.node.destroy();assert(f.assets.every(a=>a.refs===0));
 }
 for(const biome of ['forest','autumn','desert']){const f=fixture(biome);f.ensure();assert.equal(f.root.children.length,0);assert.equal(f.loads.length,0);}
});
test('rain remains bounded across transitions, reuses decoded atlas frames and freezes on pause/app hide',()=>{
 const f=fixture();f.ensure();const weather=f.game._forestRain;weather.update(1);f.finish();weather.update(1);
 const time=weather.clock.time;f.ui.isPauset=true;weather.update(10);assert.equal(weather.clock.time,time);f.ui.isPauset=false;f.listeners.get('hide')();weather.update(10);assert.equal(weather.clock.time,time);assert.equal(weather.ground.active,false);f.listeners.get('show')();weather.update(.1);assert(weather.clock.time>time);
 for(let i=0;i<1400;i++){weather.update(.25);f.finish();}assert(weather.arts.size<=5);assert([...weather.arts.values()].every(a=>a.nodes.length<=(a.ground?35:24)&&a.frames.size<=64));assert([...weather.arts.values()].reduce((sum,a)=>sum+a.nodes.filter(r=>r.node.active).length,0)<=118);
 const art=[...weather.arts.values()].find(a=>a.nodes.some(r=>r.node.active)),record=art.nodes.find(r=>r.node.active),assignments=record.sprite.assignments;weather.update(0);assert.equal(record.sprite.assignments,assignments,'unchanged frames do not dirty sprites');
 f.game._combatEpoch++;weather.update(.1);assert.equal(weather.disposed,true);assert.equal(f.game._forestRain,undefined);assert.equal(f.listeners.size,0);assert.equal(weather.ground.destroyed,true);assert(f.assets.every(a=>a.refs===0&&a.clones.every(c=>c.destroyed)));
});
test('ground marks remain anchored in map space when camera scrolls',()=>{
 const f=fixture('ice');f.ensure();const weather=f.game._forestRain;weather.update(1);f.finish();weather.update(1);const art=[...weather.arts.values()].find(a=>a.ground),before=new Map(art.nodes.map(r=>[r.x+':'+r.y,r.sprite.frame]));
 f.camera.x+=256;weather.update(0);let shared=0;for(const record of art.nodes){const key=record.x+':'+record.y;if(before.has(key)){shared++;assert.equal(record.sprite.frame,before.get(key),'world cell keeps the same animation phase');}}assert(shared>0);assert(art.nodes.some(r=>r.x>750));
 weather.onDisable();assert.equal(weather.ground.active,false);weather.onEnable();assert.equal(weather.ground.active,true);weather.node.destroy();
});
test('epoch, biome and UI retirement reject late resources and can recreate weather safely',()=>{
 const f=fixture('snow');f.ensure();const old=f.game._forestRain;old.update(1);assert.equal(f.loads.length,2);f.game._combatEpoch++;f.ensure();const replacement=f.game._forestRain;assert.notEqual(old,replacement);assert.equal(old.disposed,true);f.finish();assert(f.assets.every(a=>a.refs===0));assert.equal(f.root.children.length,1);
 replacement.update(1);f.game.biome='desert';f.finish();assert(f.assets.every(a=>a.refs===0));replacement.update(.1);assert.equal(replacement.disposed,true);assert.equal(f.root.children.length,0);
 const ui=fixture();ui.ensure();ui.ui.isclose=true;ui.game._forestRain.update(.1);assert.equal(ui.game._forestRain,undefined);
});
test('a planning HUD installed before map load gains floor splashes when ndDown becomes ready',()=>{
 const f=fixture('snow'),floor=f.game.ndDown;f.game.ndDown=null;f.ensure();const weather=f.game._forestRain;weather.update(1);assert.equal(f.loads.length,1);assert.equal(weather.ground,undefined);f.finish();f.game.ndDown=floor;weather.update(.1);assert.equal(weather.ground.parent,floor);assert.equal(f.loads.length,1);f.finish();weather.update(.1);assert([...weather.arts.values()].some(a=>a.ground&&a.nodes.length));
 floor.destroy();weather.update(.1);assert.equal(weather.disposed,true);assert(f.assets.every(a=>a.refs===0));
});
test('closing or ending a battle retires weather even when the cached UI stops updating',()=>{
 for(const retire of [f=>{f.ui.isclose=true;},f=>{f.game.gameStatus=9;}]){const f=fixture('ice');f.ensure();const weather=f.game._forestRain;weather.update(1);f.finish();weather.update(1);retire(f);weather.onDisable();assert.equal(weather.disposed,true);assert.equal(f.game._forestRain,undefined);f.ensure();assert.equal(f.game._forestRain,undefined);assert(f.assets.every(a=>a.refs===0));}
});
test('app return cannot reactivate cached-battle ground effects after the UI closed while hidden',()=>{
 const f=fixture('snow');f.ensure();const weather=f.game._forestRain;weather.update(1);f.finish();weather.update(1);f.listeners.get('hide')();assert.equal(weather.ground.active,false);f.ui.isclose=true;f.listeners.get('show')();assert.equal(weather.disposed,true);assert.equal(weather.ground.destroyed,true);assert.equal(f.listeners.size,0);assert.equal(f.game._forestRain,undefined);assert(f.assets.every(a=>a.refs===0));
});

test('snow freezes before app-hide deactivates its parent and resumes without waiting for another weather update',()=>{
 for(const biome of ['snow','ice']){const f=fixture(biome);f.ensure();const weather=f.game._forestRain;weather.update(1);f.finish();weather.update(1);const art=[...weather.arts.values()].find(art=>art.snow),record=art.nodes[0],time=weather.clock.time;f.pauseCalls.length=0;f.listeners.get('hide')();assert.equal(record.paused,true);assert.deepEqual(f.pauseCalls,[{value:true,active:true}],'Native capture must happen while the emitter is still visible');assert.equal(weather.node.active,false);assert.equal(weather.clock.time,time);f.listeners.get('show')();assert.equal(record.paused,false);assert.equal(weather.node.active,true);assert.equal(weather.clock.time,time);f.ui.isPauset=true;f.listeners.get('hide')();f.listeners.get('show')();assert.equal(record.paused,true,'Showing the app does not override an existing gameplay pause');weather.node.destroy();assert(f.assets.every(asset=>asset.refs===0));assert.equal(f.listeners.size,0);}
});

test('weather activation callbacks defer snow hierarchy changes until the regular update',()=>{
 const f=fixture('snow');f.ensure();const weather=f.game._forestRain;weather.update(1);f.finish();weather.update(1);
 f.pauseCalls.length=0;weather.onDisable();assert.deepEqual(f.pauseCalls,[{value:true,active:true,allowCapture:false}]);
 weather.onEnable();assert.equal(f.pauseCalls.length,1,'An activating parent cannot create or release a snapshot child');
 weather.update(0);assert.equal(f.pauseCalls.length,2);assert.deepEqual(f.pauseCalls[1],{value:false,active:true});weather.node.destroy();
});
