'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'../..'),Progress=require('../../assets/_script/StartupProgress');
test('startup progress begins empty, reports actual fractional work and reserves 100% for lobby readiness',()=>{
 const renders=[],s=new Progress.Session(x=>renders.push(x));assert.equal(renders[0].value,0);
 s.phase('characters');const job=s.begin('texture');job.progress(1,10);const a=s.value;job.progress(2,10);assert(s.value>a);
 job.complete();assert(s.value<.5);s.phase('scene');s.scene(100,100);assert(s.value<1);
 s.phase('lobby');const ui=s.begin('home');ui.progress(4,10);assert(s.value>=.92&&s.value<.98);
 s.phase('finishing');assert(s.value>=.98&&s.value<1);s.complete();assert.equal(renders.at(-1).value,1);
});
test('late work, retries and obsolete phase callbacks cannot regress or revive retired startup progress',()=>{
 const renders=[],s=new Progress.Session(x=>renders.push(x)),job=s.begin();job.progress(5,10);const first=s.value;
 job.progress(1,10);assert.equal(s.value,first);s.phase('skills');job.complete();assert(s.value>=.68);
 s.phase('settings');assert.equal(s.key,'skills');s.phase('invalid');assert.equal(s.key,'skills');
 s.close();const count=renders.length;job.complete();s.phase('ready');s.complete();assert.equal(renders.length,count);
});
test('the actual resource recovery loader exposes real asset progress without changing retries or completion',()=>{
 const exports={},timers=new Set(),modules={LogMgr:{LogMgr:{getInstance:()=>({error(){}})}}};
 vm.runInNewContext(fs.readFileSync(path.join(root,'assets/_script/ResourceMgr.js'),'utf8'),{exports,require:id=>modules[id]||{},cc:{},setTimeout(fn){timers.add(fn);return fn;},clearTimeout(fn){timers.delete(fn);}});
 const m=exports.ResourceMgr.getInstance(),s=new Progress.Session(()=>{});s.phase('characters');m.startupProgress=s;
 let callbacks,finished=0;m.loadWithRecovery('characters',(done,report)=>{callbacks={done,report};},()=>finished++);
 callbacks.report(5,10);assert(s.value>.35&&s.value<.5);callbacks.done(null,{});assert.equal(finished,1);assert.equal(timers.size,0);
 const before=s.value;callbacks.report(1,10);assert(s.value>=before);callbacks.done(null,{});assert.equal(finished,1);
});
function fixture(){
 class Node{
  constructor(name){this.name=name;this.children=[];this.components=[];this.events={};this.group='default';this.active=true;this.width=0;this.height=100;this.scaleY=1;this.anchorY=.5;}
  set parent(value){if(this._parent)this._parent.children=this._parent.children.filter(x=>x!==this);this._parent=value;if(value)value.children.push(this);}
  get parent(){return this._parent;}getChildByName(name){return this.children.find(x=>x.name===name);}
  setScale(value){this.scale=value;}getPosition(){return{x:0,y:0};}setPosition(x,y){this.position={x,y};}on(event,callback){this.events[event]=callback;}
  setContentSize(width,height){Object.assign(this,{width,height});}
  addComponent(Type){const value=new Type();this.components.push(value);return value;}
  getComponent(Type){return this.components.find(value=>value instanceof Type);}
  destroy(){this.destroyed=true;for(const child of this.children.slice())child.destroy();this.parent=null;}
 }
 Node.EventType={TOUCH_END:'touch'};
 class Camera{constructor(){this.clearFlags=6;}} Camera.ClearFlags={COLOR:1};
 class Graphics{clear(){}rect(...rect){this.bounds=rect;}fill(){}}
 const persisted=new Set(),resizes=new Map(),music=[],sources=[],resources={loadRes(...args){sources.push(args);}},draws=[],badge=[];
 const audio={init(){this.audioLifecycleBound=true;},addAdConf(){},playMusic:(...args)=>music.push(args),stopMusic:(...args)=>music.push(['stop',...args])};
 let size={width:750,height:1334};
 const scene=new Node('scene'),overlays=[],cc={Node,Camera,Graphics,color:(...values)=>values,Prefab:function(){},isValid:value=>!!value&&!value.destroyed,winSize:{height:1334,width:750},director:{getScene:()=>scene},
  view:{getVisibleSize:()=>size,on(event,fn){resizes.set(event,fn);},off(event){resizes.delete(event);}},game:{addPersistRootNode(node){persisted.add(node);},removePersistRootNode(node){persisted.delete(node);}},instantiate:node=>node};
 const modules={StartupProgress:Progress,LanguageMgr:{LanguageMgr:{getInstance:()=>({t:key=>key})}},AudioMgr:{AudioMgr:{getInstance:()=>audio}},ResourceMgr:{ResourceMgr:{getInstance:()=>resources}},KinghtFallConfig:{KinghtFallAudioId:{menu_bgm:'lobby'},KinghtFallParameter:{BGMusic:'KinghtFallBG'}},
  TestMode:{TestMode:{getInstance:()=>({setStartupActive:active=>badge.push(active)})}},
  StageLoading:{create(view,level,parent,engine,options){const overlay={node:new Node('overlay'),values:[],messages:[],options,progress(value){this.values.push(value);},detail(message){this.messages.push(message);},destroy(){this.destroyed=true;},waitForDraw(){return new Promise(resolve=>draws.push(resolve));}};overlay.node.parent=parent;overlays.push(overlay);return overlay;}}};
 const exports={};vm.runInNewContext(fs.readFileSync(path.join(root,'assets/_script/StartupPresentation.js'),'utf8'),{exports,require:id=>modules[id]});
 const start=new Node('StartCanvas'),background=new Node('Background'),content=new Node('TitleContent'),logo=new Node('GameLogo'),button=new Node('StartButton');
 background.parent=start;content.parent=start;logo.parent=content;button.parent=content;
 const owner={node:start,content},parent=new Node('uiRoot'),loading=new Node('UILoading');loading.parent=parent;
 const cameraNode=new Node('Main Camera');cameraNode.parent=parent;const camera=cameraNode.addComponent(Camera);
 return {api:exports,cc,owner,background,content,button,persisted,music,audio,resizes,resources,sources,overlays,draws,parent,loading,camera,badge,
  resize(width,height){size={width,height};resizes.get('design-resolution-changed')();},loadingOwner:{node:new Node('Scene'),retryLoading(){}}};
}
test('the same start artwork moves through loading and start music carries until the lobby really finishes',async()=>{
 const f=fixture();f.api.start(f.owner,f.cc);f.api.carry(f.owner,f.cc);const carried=[...f.persisted][0];assert(carried);assert.notEqual(carried,f.owner.node);
 f.api.loading(f.loadingOwner,f.parent,f.cc);
 assert(carried.destroyed);assert.equal(f.owner.node.destroyed,undefined);assert.equal(f.persisted.size,0);assert.equal(f.background.destroyed,undefined);assert.equal(f.content.destroyed,undefined);assert.equal(f.button.active,false);
 const overlay=f.overlays[0];assert.equal(overlay.options.transparent,true);assert.equal(overlay.values[0],0);assert(f.api.isActive());
 const backdrop=f.background.parent;
 assert.equal(backdrop.parent,f.loading);assert.equal(f.camera.clearFlags,7);assert(f.background.active);
 f.resize(750,1624);
 assert.equal(backdrop.height,1624);
 assert.deepEqual(backdrop.getComponent(f.cc.Graphics).bounds,[-375,-812,750,1624]);
 assert.deepEqual(f.badge,[true,true]);
 let closed=0;f.api.finish(f.cc,()=>closed++);assert.equal(overlay.values.at(-1),1);assert.equal(closed,0);assert(!f.music.some(row=>row[0]==='lobby'));
 f.draws.shift()();await Promise.resolve();assert.equal(closed,1);assert.equal(f.music.at(-1)[0],'lobby');assert.equal(f.music.at(-1)[1],'KinghtFallBG');assert.equal(f.resizes.size,0);assert(f.background.destroyed);assert.equal(f.resources.startupProgress,null);assert.equal(f.api.isActive(),false);
 assert.equal(f.camera.clearFlags,6);assert.equal(overlay.node.active,false);assert.deepEqual(f.badge,[true,true,false]);
});
test('a failed scene transition returns the carried artwork to its title Canvas and can retry',()=>{
 const f=fixture();f.api.start(f.owner,f.cc);f.api.carry(f.owner,f.cc);f.api.restore(f.owner,f.cc);
 assert.equal(f.persisted.size,0);assert.equal(f.background.parent,f.owner.node);assert.equal(f.content.parent,f.owner.node);
 f.api.carry(f.owner,f.cc);assert.equal(f.persisted.size,1);assert(!f.background.destroyed);
});
test('retired startup and Main owners cannot leave the backdrop alive or start lobby music late',async()=>{
 const f=fixture();f.api.start(f.owner,f.cc);f.api.carry(f.owner,f.cc);f.api.loading(f.loadingOwner,f.parent,f.cc);
 let current=true;f.api.finish(f.cc,()=>{throw Error('Retired Main resumed');},()=>current);current=false;f.draws.shift()();await Promise.resolve();
 assert(!f.music.some(row=>row[0]==='lobby'));assert(f.overlays[0].destroyed);assert.equal(f.resizes.size,0);assert.equal(f.api.isActive(),false);assert.equal(f.music.at(-1)[0],'stop');
});

test('cold lobby audio keeps loading below 100% and an obsolete decode cannot switch music',async()=>{
 const f=fixture();f.api.start(f.owner,f.cc);f.api.carry(f.owner,f.cc);f.api.loading(f.loadingOwner,f.parent,f.cc);
 let decoded,closed=0;f.audio.getAdConf=()=>({bundle:'music',path:'menu'});
 f.audio.loadClip=(bundle,path,key,complete)=>{assert.equal(path,'menu');decoded=complete;};
 f.api.finish(f.cc,()=>closed++);assert(f.overlays[0].values.at(-1)<1);assert.equal(f.draws.length,0);assert.equal(closed,0);
 decoded({});assert.equal(f.overlays[0].values.at(-1),1);assert.equal(closed,0);
 f.draws.shift()();await Promise.resolve();assert.equal(closed,1);assert.equal(f.music.at(-1)[0],'lobby');
 const stale=fixture();stale.api.start(stale.owner,stale.cc);stale.api.loading(stale.loadingOwner,stale.parent,stale.cc);
 stale.audio.getAdConf=f.audio.getAdConf;stale.audio.loadClip=(_bundle,_path,_key,done)=>{decoded=done;};
 stale.api.finish(stale.cc,()=>{throw Error('Cancelled startup resumed');});stale.api.cancelLoading(stale.loadingOwner,stale.cc);decoded({});
 assert.equal(stale.draws.length,0);assert(!stale.music.some(row=>row[0]==='lobby'));
});
test('direct loading previews use the shared start-art fallback and ignore late art after cancellation',()=>{
 const f=fixture();f.api.loading(f.loadingOwner,f.parent,f.cc);assert.equal(f.resources.startupProgress.value,0);assert.equal(f.music[0][0],'hkd-start-screen');
 assert.equal(f.sources[0][1],'startup/backdrop');const before=f.loading.children.length;
 f.api.cancelLoading(f.loadingOwner,f.cc);assert.equal(f.api.isActive(),false);assert.equal(f.resources.startupProgress,null);
 f.sources[0][3](f.owner.node);assert.equal(f.loading.children.length,before-1);assert.equal(f.owner.node.parent,undefined);
 assert.equal(f.camera.clearFlags,6);
});
test('direct loading centers the authored backdrop and fits its artwork parent on resize',()=>{
 const f=fixture();f.api.loading(f.loadingOwner,f.parent,f.cc);
 f.sources[0][3](f.owner.node);
 assert.equal(f.owner.node.parent,f.loading.getChildByName('Startup backdrop'));
 assert.deepEqual(f.owner.node.position,{x:0,y:0});
 f.resize(624,1308);
 assert.equal(f.owner.node.width,624);assert.equal(f.owner.node.height,1308);
 f.api.cancelLoading(f.loadingOwner,f.cc);
});
test('the startup backdrop prefab shares the title artwork and the saved loading screen has no visible legacy background or bar',()=>{
 const scene=JSON.parse(fs.readFileSync(path.join(root,'assets/scenes/loading.fire'),'utf8')),loading=scene.find(x=>x._name==='UILoading');
 for(const child of loading._children)assert.equal(scene[child.__id__]._active,false);
 const prefab=JSON.parse(fs.readFileSync(path.join(root,'assets/resources/startup/backdrop.prefab'),'utf8'));
 assert(prefab.some(x=>x._name==='Background'));assert(prefab.some(x=>x._name==='GameLogo'));assert(!prefab.some(x=>x._name==='StartButton'));
 const title=JSON.parse(fs.readFileSync(path.join(root,'assets/scenes/Start.fire'),'utf8'));
 const sprite=list=>list.find(x=>x.__type__==='cc.Sprite'&&list[x.node.__id__]._name==='Background')._spriteFrame.__uuid__;
 assert.equal(sprite(prefab),sprite(title));
});
