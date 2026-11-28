'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{fixture}=require('./backend-ui-harness.cjs');
function settings(globals){
 const h=fixture(globals),listeners=new Set(),preferenceListeners=new Set(),autoListeners=new Set(),writes=[],languages=Array.from({length:12},(_,i)=>({code:i?'language-'+i:'en',nameKey:'language.name'+i}));let current='en',hidden=false,auto=false;
 const lang={t:key=>key,getLanguages:()=>languages,getCurrentLanguage:()=>current,bindLabel:(label,key)=>label.string=key,setCurrentLanguage(code){current=code;writes.push(['language',code]);listeners.forEach(l=>l.fn.call(l.owner));},onChange(fn,owner){listeners.add({fn,owner});},offChange(fn,owner){for(const l of listeners)if(l.fn===fn&&l.owner===owner)listeners.delete(l);}};
 class Node extends h.cc.Node{constructor(name){super(name);this.components=new Map();Object.assign(this,{width:0,height:0,x:0,y:0,anchorX:.5,anchorY:.5,scaleX:1,scaleY:1});}addComponent(Type){const c=new Type();c.node=this;this.components.set(Type,c);return c;}getComponent(Type){return this.components.get(Type);}setScale(v){this.scaleX=this.scaleY=v;}setPosition(x,y){if(typeof x==='object')({x,y}=x);this.x=x;this.y=y;}setSiblingIndex(i){const a=this.parent.children;a.splice(a.indexOf(this),1);a.splice(i,0,this);}setAnchorPoint(x,y){this.anchorX=x;this.anchorY=y;}on(type,fn,owner){this.handlers[type]=owner?fn.bind(owner):fn;}}
 Node.EventType={TOUCH_END:'end'};class Label{}Label.HorizontalAlign={LEFT:0,CENTER:1};Label.VerticalAlign={CENTER:1};Label.Overflow={SHRINK:2,RESIZE_HEIGHT:3};class Outline{}class Shadow{}class Button{}Button.Transition={SCALE:1};class Graphics{clear(){}rect(){}roundRect(){}fill(){}stroke(){}moveTo(){}lineTo(){}}class Sprite{}Sprite.SizeMode={CUSTOM:0};Sprite.Type={SLICED:1};class Widget{}class Slider{}
 Object.assign(h.cc,{Node,Label,LabelOutline:Outline,LabelShadow:Shadow,Button,Graphics,Sprite,Widget,Slider,color:x=>x,Class(def){function C(){Object.assign(this,def.properties||{});}Object.assign(C.prototype,def);return C;}});
 const volumes={music:.6,effect:.3};h.modules.LanguageMgr={LanguageMgr:{getInstance:()=>lang}};
 h.modules.ControlPreferences={getHideIdle:()=>hidden,setHideIdle(value){hidden=value;writes.push(['controls',value]);preferenceListeners.forEach(fn=>fn());},subscribe(fn){preferenceListeners.add(fn);return()=>preferenceListeners.delete(fn);}};
 h.modules.ControlPreferences.autoSkillCast={get:()=>auto,set(value){auto=value;writes.push(['auto',value]);autoListeners.forEach(fn=>fn());},subscribe(fn){autoListeners.add(fn);return()=>autoListeners.delete(fn);}};
 h.modules.AudioMgr={AudioMgr:{getInstance:()=>({getMusicVolume:()=>volumes.music,getEffectVolume:()=>volumes.effect,setMusicVolume(v){writes.push(['music',v]);volumes.music=v;},setEffectVolume(v){writes.push(['effect',v]);volumes.effect=v;}})}};
 const node=(name,parent,Type)=>{const n=new Node(name);if(parent)n.parent=parent;if(Type)n.addComponent(Type);return n;};
 function owner(width=750,height=1334){const ui={node:node('UI')};ui.node.setContentSize(width,height);const root=node('root',ui.node,Sprite);ui.ndTitle=node('title',root,Label);ui.version=node('version',root,Label).getComponent(Label);ui.btnClose=node('Close',root);ui.btnNewGame=node('Home',root);ui.btnDismiss=node('X',root);ui.btnExchangeCode=node('Gift',root);ui.btnExchangeCode.active=false;ui.btnCleardata=node('Clear',root,Label).getComponent(Label);
  function slider(name){const row=node(name,root);node(name+'Label',row,Label);const n=node(name+'Slider',row,Slider);node('Background',n,Sprite).width=306;node('Background2',n,Sprite).width=300;return n.getComponent(Slider);}ui.musicSlider=slider('music');ui.effectSlider=slider('effect');const scroll=node('Scroll',root);node('view',scroll,Widget);ui.ndParent={node:scroll};return ui;}
 function start(node){for(const c of node.components.values())if(c.start&&!c.started){c.started=true;c.start();}}
 return{h,lang,writes,volumes,languages,listeners,preferenceListeners,autoListeners,owner,start,load:h.load};
}
test('arrow language selector reaches every future language in both directions without adding buttons or saving on open',()=>{
 const f=settings(),ui=f.owner(),options=f.load('LanguageOptions').attach(ui.node,12,448);f.start(ui.node);assert.equal(f.writes.length,0);assert.equal(options.arrows.length,2);const initial=options.value.string;
 const click=direction=>options.arrows.find(a=>a.direction===direction).node.handlers.end({stopPropagation(){}});
 for(let i=0;i<12;i++)click(1);assert.equal(options.value.string,initial);assert.equal(new Set(f.writes.map(w=>w[1])).size,12);
 click(-1);assert.equal(f.lang.getCurrentLanguage(),'language-11');assert.equal(options.row.children.length,3);assert(options.value.node.width<options.selector.width-100);
 options.onDestroy();assert.equal(f.listeners.size,0);
});
test('shared Music and Sound sliders show saved values and write only when the user slides them',()=>{
 const f=settings(),ui=f.owner(),api=f.load('AudioOptions');api.bind(ui);api.bind(ui);assert.equal(ui.musicSlider.progress,.6);assert.equal(ui.effectSlider.progress,.3);assert.deepEqual(f.writes,[]);
 ui.musicSlider.progress=.2;ui.musicSlider.node.handlers.slide();ui.effectSlider.progress=0;ui.effectSlider.node.handlers.slide();assert.deepEqual(f.writes,[['music',.2],['effect',0]]);assert.equal(ui.musicSlider.node.getChildByName('Background2').width,60);
});

test('cached audio panels refresh stale fills and handles without writing preferences or rebinding listeners',()=>{
 const f=settings(),ui=f.owner(),api=f.load('AudioOptions');
 const fill=slider=>slider.node.getChildByName('Background2');
 fill(ui.musicSlider).width=fill(ui.effectSlider).width=300;
 api.bind(ui);assert.equal(fill(ui.musicSlider).width,180);assert.equal(fill(ui.effectSlider).width,90);
 const musicHandler=ui.musicSlider.node.handlers.slide,soundHandler=ui.effectSlider.node.handlers.slide;
 f.volumes.music=.15;f.volumes.effect=.8;api.bind(ui);
 assert.equal(ui.musicSlider.progress,.15);assert.equal(fill(ui.musicSlider).width,45);
 assert.equal(ui.effectSlider.progress,.8);assert.equal(fill(ui.effectSlider).width,240);
 assert.equal(ui.musicSlider.node.handlers.slide,musicHandler);assert.equal(ui.effectSlider.node.handlers.slide,soundHandler);
 f.volumes.music=0;f.volumes.effect=1;api.refresh(ui);
 assert.equal(ui.musicSlider.progress,0);assert.equal(fill(ui.musicSlider).width,0);
 assert.equal(ui.effectSlider.progress,1);assert.equal(fill(ui.effectSlider).width,300);assert.deepEqual(f.writes,[]);
});
test('Hide idle controls is shared between Settings and Pause and releases subscriptions when closed',()=>{
 const f=settings(),a=f.owner(),b=f.owner(),api=f.load('ControlIndicatorOptions'),one=api.attach(a.node,{width:448,rowY:-100,helpY:-150}),two=api.attach(b.node,{width:488,rowY:-200,helpY:-250});f.start(a.node);f.start(b.node);assert.equal(f.writes.length,0);
 one.idle.button.handlers.end({stopPropagation(){}});assert.equal(two.idle.button.getChildByName('Value').getComponent(f.h.cc.Label).string,'settings.controlsOn');assert(two.idle.caption.node.x+two.idle.caption.node.width<=two.idle.button.x-54-12);one.onDestroy();two.onDestroy();assert.equal(f.preferenceListeners.size,0);
});
test('Auto Skill Cast is visible in Settings and updates both open panels only when changed',()=>{
 const f=settings(),layouts=f.load('SettingsPanelLayout'),lobby=f.owner(),battle=f.owner(540,820);
 battle.btnExchangeCode.active=true;
 for(const ui of [lobby,battle]){layouts.settings(ui);f.start(ui.node);}
 assert.deepEqual(f.writes,[]);
 function row(ui){return ui.node.getChildByName('root').getChildByName('AutoSkillCastOptions');}
 function button(ui){return row(ui).getChildByName('Toggle');}
 function displayed(ui){return button(ui).getChildByName('Value').getComponent(f.h.cc.Label).string;}
 for(const ui of [lobby,battle]){
  const root=ui.node.getChildByName('root'),auto=row(ui),idle=root.getChildByName('IdleControlOptions');
  assert.equal(auto.getChildByName('Caption').getComponent(f.h.cc.Label).string,'settings.autoSkillCast');
  assert.equal(displayed(ui),'settings.controlsOff');
  assert(idle.y+idle.height/2<auto.y-auto.height/2);
  assert(auto.y+auto.height/2<ui.effectSlider.node.parent.y-ui.effectSlider.node.parent.height/2);
 }
 const tap={stopPropagation(){}};
 button(lobby).handlers.end(tap);
 assert.equal(displayed(battle),'settings.controlsOn');
 button(battle).handlers.end(tap);
 assert.equal(displayed(lobby),'settings.controlsOff');
 assert.deepEqual(f.writes,[['auto',true],['auto',false]]);
 for(const ui of [lobby,battle])for(const component of ui.node.components.values())if(component.auto)component.onDestroy();
 assert.equal(f.autoListeners.size,0);
});
test('Settings matches the shared concept while Pause keeps details above four distinct GUI Pro actions',()=>{
 const f=settings(),layout=f.load('SettingsPanelLayout');for(const [width,height]of [[750,1334],[540,820]]){
  const ui=f.owner(width,height);layout.settings(ui);f.start(ui.node);const root=ui.node.getChildByName('root');assert(root.width<=600);assert.equal(root.getComponent(f.h.cc.Sprite).enabled,false);assert(ui.ndTitle.y>root.height/2-82);assert(ui.musicSlider.node.parent.y<ui.ndTitle.y-60);assert.equal(f.writes.length,0);
  const pause=f.owner(width,height);pause.ndTitle.name='title';layout.pause(pause);f.start(pause.node);const body=pause.node.getChildByName('root'),scroll=pause.ndParent.node;
  assert(scroll.y-scroll.height/2>pause.btnClose.y+pause.btnClose.height/2);assert.equal(pause.musicSlider.node.parent.active,false);assert.equal(pause.effectSlider.node.parent.active,false);assert.equal(pause.btnSettings.parent,body);assert.equal(pause.btnRestart.parent,body);assert(pause.btnSettings.x<pause.btnClose.x&&pause.btnClose.x<pause.btnRestart.x&&pause.btnRestart.x<pause.btnNewGame.x);
  const stats=f.owner(width,height);stats._stats=[];layout.pause(stats);assert(stats.node.getChildByName('root').getChildByName('PauseActionsBand'));assert.equal(stats.musicSlider.node.parent.active,false);
 }
 assert.deepEqual(f.writes,[]);
});
test('Android Settings displays the installed APK version instead of analytics metadata', () => {
 const calls = [];
 const f = settings({ jsb: { reflection: { callStaticMethod(...args) { calls.push(args); return '1.0.9'; } } } });
 const entries = require('../../assets/resources/localization/catalog.json').entries;
 f.lang.t = (key, params) => entries[key].en.replace(/\{(\d+)\}/g, (_, index) => params[index]);
 f.lang.bindLabel = (label, key, params) => { label.string = f.lang.t(key, params); };
 Object.assign(f.h.modules, {
  TestMode: { TestMode: {} }, PlatformSetting: {}, PlatformConfig: {}, KinghtFallConfig: {}, SdkMgr: {}, ServerDataMgr: {},
  PlayerMgr: { PlayerMgr: { getInstance: () => ({ getAbType: () => 0,
    getTrackData: () => ({ getVersionConf: () => '1.0.6', getVersionName: () => '1.0.6' }) }) } }
 });
 f.h.cc.sys = { isNative: true, os: 'Android', OS_ANDROID: 'Android' };
 const Settings = f.load('KinghtFallUISetting').default;
 const panel = Object.assign(new Settings(), f.owner());
 panel.refreshVersion();
 assert.deepEqual(calls, [['org/cocos2dx/lib/Cocos2dxHelper', 'getVersion', '()Ljava/lang/String;']]);
 assert.equal(panel.version.string, 'Version 1.0.9');
 f.h.cc.sys.isNative = false;
 panel.refreshVersion();
 assert.equal(calls.length, 1);
 assert.equal(panel.version.string, 'Version 1.0.6 · 1.0.6 · 0');
});
test('developer controls fit narrow Settings and open the right tool with a touch', () => {
 const f = settings(), calls = [];
 let debug = false, enabled = false, currentPause = null;
 const mode = {
  isAvailable: () => debug, isEnabled: () => enabled, ownsBattlePause: pause => pause === currentPause,
  toggle() { enabled = !enabled; calls.push(['test', enabled]); },
  toggleRewardTesting(startScreen, pause) { calls.push(['reward', startScreen, pause]); return true; },
  toggleBattleTesting(tool, pause) { calls.push([tool, pause]); return true; }
 };
 Object.assign(f.h.modules, {
  TestMode: { TestMode: { getInstance: () => mode } },
  PlatformSetting: {}, PlatformConfig: {}, KinghtFallConfig: {}, SdkMgr: {}, ServerDataMgr: {}, PlayerMgr: {}
 });
 const Settings = f.load('KinghtFallUISetting').default, layouts = f.load('SettingsPanelLayout');
 function panel() {
  const owner = Object.assign(new Settings(), f.owner(540, 820));
  owner.closeNotAni = () => { owner.isclose = true; };
  return owner;
 }
 function tools(owner) { return owner.node.getChildByName('root').getChildByName('DeveloperTools'); }
 const lobby = panel();
 layouts.settings(lobby);
 assert.equal(tools(lobby), undefined);
 assert.deepEqual(calls, []);
 debug = true;
 layouts.settings(lobby);
 f.start(lobby.node);
 const group = tools(lobby), toggle = group.getChildByName('ToggleTestMode');
 const reward = group.getChildByName('RewardTesting'), wave = group.getChildByName('WaveAdjuster');
 assert(reward.x + reward.width / 2 < wave.x - wave.width / 2);
 assert(group.y + toggle.height / 2 < lobby.node.getChildByName('root').getChildByName('IdleControlHelp').y - 28);
 const touch = { stopPropagation() {} };
 assert.equal(wave.getComponent(f.h.cc.Button).interactable, false);
 wave.handlers.end(touch);
 assert.deepEqual(calls, []);
 toggle.handlers.end(touch);
 layouts.settings(lobby);
 assert.equal(toggle.getChildByName('Caption').getComponent(f.h.cc.Label).string, 'settings.controlsOn');
 reward.handlers.end(touch);
 assert.equal(lobby.isclose, true);
 assert.deepEqual(calls, [['test', true], ['reward', null, undefined]]);

 const campaign = panel();
 currentPause = campaign._pauseParent = { node: {}, _settingsUI: campaign, menuMetadata: { mode: 'campaign' } };
 layouts.settings(campaign);
 const battleWave = tools(campaign).getChildByName('WaveAdjuster');
 assert.equal(battleWave.getComponent(f.h.cc.Button).interactable, true);
 battleWave.handlers.end(touch);
 assert.equal(campaign.isclose, true);
 assert.deepEqual(calls.at(-1), ['wave', currentPause]);
 assert.deepEqual(f.writes, []);
});
test('Pause prefab owns complete independent native Slider subtrees and declared controller properties',()=>{
 const root=path.resolve(__dirname,'../..'),d=JSON.parse(fs.readFileSync(path.join(root,'assets/KinghtFallPrefabs/gamePop/KinghtFallUISuspend.prefab'))),owner=d.find(x=>x.sprfBgList&&x.ndParent);
 for(const key of ['musicSlider','effectSlider']){const slider=d[owner[key].__id__];assert.equal(slider.__type__,'cc.Slider');const n=d[slider.node.__id__];assert.equal(d[n._parent.__id__]._active,false);const handle=d[slider._N$handle.__id__];assert.equal(handle.__type__,'cc.Button');assert.equal(d[handle.node.__id__]._parent.__id__,slider.node.__id__);}
});
