'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),Catalog=require('../../assets/_script/HeroSkillVFXCatalog');
function fixture(){
 const loads=[],assets=[],listeners=new Map();
 class Node{constructor(){this.children=[];this.active=true;}setParent(parent){this.parent=parent;parent.children.push(this);}setPosition(p){this.x=p.x;this.y=p.y;}convertToNodeSpaceAR(p){return p;}addComponent(Type){const c=new Type();c.node=this;this.component=c;return c;}destroy(){this.destroyed=true;if(this.component&&this.component.onDestroy)this.component.onDestroy();}}
 const cc={Node,Component:class{},Class(spec){class Component{};Object.assign(Component.prototype,spec);return Component;},Sprite:class{},SpriteFrame:class{},v2:(x,y)=>({x,y}),rect:(x,y,width,height)=>({x,y,width,height}),size:(width,height)=>({width,height}),isValid:n=>!!n&&!n.destroyed,view:{getVisibleSize:()=>({width:750,height:1334})},resources:{load(resource,_type,done){loads.push({resource,done});}},game:{EVENT_HIDE:'hide',EVENT_SHOW:'show',on(key,fn,owner){listeners.set(key,()=>fn.call(owner));},off(key){listeners.delete(key);}}};
 const exported={};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../../assets/_script/ForestRain.js'),'utf8'),{exports:exported,cc,require:name=>name==='BattleSounds'?{biome:g=>g.biome}:name==='KinghtFallModle'?{KinghtFallGameStage:{End:9}}:require(path.join(__dirname,'../../assets/_script',name))});
 const root=new Node(),ui={node:new Node(),ctrUI:{node:root}},game={node:new Node(),biome:'deep-forest',gameData:{levelCfg:{ID:12}},_combatEpoch:1,gameStatus:2};ui.node.activeInHierarchy=true;ui.ctrGame=game;
 const runtime={game,ui};function finish(){for(const load of loads.splice(0)){const clip=Catalog.clips.find(c=>c.resource===load.resource),asset={refs:0,clones:[],addRef(){this.refs++;return this;},decRef(){this.refs--;},getRect:()=>({x:0,y:0}),clone(){const f={setRect(){},setOriginalSize(){},setOffset(){},destroy(){this.destroyed=true;}};this.clones.push(f);return f;}};assets.push(asset);load.done(null,asset);}}
 return{ensure:()=>exported.ensure(runtime),game,ui,root,loads,assets,listeners,finish};
}
test('Deep Forest weather is installed once, owns no input/audio, uses bounded tiles and freezes while paused or hidden',()=>{
 const f=fixture();f.ensure();f.ensure();assert.equal(f.root.children.length,1);const rain=f.game._forestRain;rain.update(1);f.finish();rain.update(1);const art=[...rain.arts.values()][0];assert(art.nodes.length<=24);assert(art.frames.size>1,'tiles use staggered phases');assert(art.nodes.every(r=>r.node.component===r.sprite));
 const time=rain.clock.time;f.ui.isPauset=true;rain.update(10);assert.equal(rain.clock.time,time);f.ui.isPauset=false;f.listeners.get('hide')();rain.update(10);assert.equal(rain.clock.time,time);f.listeners.get('show')();rain.update(.1);assert(rain.clock.time>time);
 for(let i=0;i<1200;i++){rain.update(.25);f.finish();}assert(rain.arts.size<=3);assert([...rain.arts.values()].every(a=>a.nodes.length<=24&&a.frames.size<=64));assert([...rain.arts.values()].reduce((sum,a)=>sum+a.nodes.filter(r=>r.node.active).length,0)<=48);
 f.game._combatEpoch++;rain.update(.1);assert.equal(rain.disposed,true);assert.equal(f.game._forestRain,undefined);assert.equal(f.listeners.size,0);assert(f.assets.every(a=>a.refs===0&&a.clones.every(c=>c.destroyed)));
});
test('other biomes never load rain and a late weather resource cannot attach after scene retirement',()=>{
 const f=fixture();f.game.biome='desert';f.ensure();assert.equal(f.root.children.length,0);assert.equal(f.loads.length,0);f.game.biome='deep-forest';f.ensure();const rain=f.game._forestRain;rain.update(1);assert.equal(f.loads.length,1);rain.node.destroy();f.finish();assert.equal(f.assets[0].refs,0);
});
