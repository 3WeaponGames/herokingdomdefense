'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'../..'),authored=require('../../assets/KinghtFallConfig/GameJsonCfg.json');
function fixture(){
 class Node{
  constructor(name=''){Object.assign(this,{name,children:[],components:[],events:{},width:0,height:0,x:0,y:0,scaleX:1,scaleY:1,anchorX:.5,anchorY:.5,active:true});}
  get parent(){return this._parent;}set parent(value){if(this._parent)this._parent.children.splice(this._parent.children.indexOf(this),1);this._parent=value;if(value)value.children.push(this);}
  get activeInHierarchy(){return this.active&&(!this.parent||this.parent.activeInHierarchy);}
  setContentSize(w,h){this.width=w;this.height=h;}setPosition(x,y){if(typeof x==='object')({x,y}=x);this.x=x;this.y=y;}
  addComponent(Type){const c=new Type();c.node=this;this.components.push(c);return c;}getComponent(Type){return this.components.find(c=>c instanceof Type);}
  getChildByName(name){return this.children.find(n=>n.name===name);}on(event,fn,target){(this.events[event]||(this.events[event]=[])).push({fn,target});}
  emit(event,data){for(const cb of this.events[event]||[])cb.fn.call(cb.target,data);}
  convertToWorldSpaceAR(p){const value={x:this.x+p.x*this.scaleX,y:this.y+p.y*this.scaleY};return this.parent?this.parent.convertToWorldSpaceAR(value):value;}
  convertToNodeSpaceAR(p){const value=this.parent?this.parent.convertToNodeSpaceAR(p):p;return{x:(value.x-this.x)/this.scaleX,y:(value.y-this.y)/this.scaleY};}
  destroy(){this.destroyed=true;this.children.forEach(c=>c.destroy());}
 }
 Node.EventType={TOUCH_START:'start',TOUCH_MOVE:'move',TOUCH_END:'end'};
 class Label{
  constructor(){this.string='';this.fontSize=20;this.lineHeight=24;}
  _forceUpdateRenderData(){let lines=0;for(const paragraph of String(this.string).split('\n'))lines+=Math.max(1,Math.ceil(paragraph.length*this.fontSize*.56/Math.max(1,this.node.width)));this.node.height=lines*this.lineHeight;}
 }
 Label.Overflow={RESIZE_HEIGHT:3,SHRINK:2};Label.HorizontalAlign={LEFT:0,CENTER:1,RIGHT:2};Label.VerticalAlign={CENTER:1};
 class Sprite{}Sprite.SizeMode={CUSTOM:0};Sprite.Type={SLICED:1};
 class Graphics{clear(){}roundRect(){}rect(){}fill(){}stroke(){}moveTo(){}lineTo(){}}
 class ScrollView{
  scrollToTop(){this.content.y=0;this.offset=0;this.scrolls=(this.scrolls||0)+1;}
  getScrollOffset(){return{x:0,y:this.offset||0};}
  scrollToOffset(point){this.offset=Math.max(0,Math.min(this.content.height-this.node.height,point.y));this.content.y=this.offset;}
  stopAutoScroll(){this.stopped=true;}
 }
 class Mask{}Mask.Type={RECT:0};class BlockInputEvents{}class LabelOutline{}
 const size={width:750,height:1334},origin={x:-375,y:-667},safe={x:-375,y:-667,width:750,height:1334},keys=[];
 const cc={Node,Label,Sprite,Graphics,ScrollView,Mask,BlockInputEvents,LabelOutline,Color:{BLACK:'black'},
  color:(...v)=>v.length===1?v[0]:v, v2:(x,y)=>({x,y}),isValid:v=>!!v&&!v.destroyed,
  view:{getVisibleOrigin:()=>origin,getVisibleSize:()=>size},sys:{getSafeAreaRect:()=>safe},macro:{KEY:{escape:27}},SystemEvent:{EventType:{KEY_DOWN:'key'}},
  systemEvent:{on(event,fn,target){keys.push({event,fn,target});},off(event,fn,target){const i=keys.findIndex(x=>x.event===event&&x.fn===fn&&x.target===target);if(i>=0)keys.splice(i,1);}}
 };
 const config=structuredClone(authored),pending=[],labels=[],listeners=[],events=[],parent=new Node('BattleUI');parent.width=750;parent.height=1334;
 const catalog=require('../../assets/resources/localization/catalog.json');let currentLanguage='en';
 const language={catalog,t(key,params){const normalized=String(key).replace(/^\[\[loc:(.+)\]\]$/,'$1');return String(catalog.entries[normalized]?.[currentLanguage]||key).replace(/\{(\d+)\}/g,(_,i)=>params&&params[i]||'');},
  bindLabel(label,key,params){label.string=this.t(key,params);labels.push(label);},onChange(fn,target){listeners.push({fn,target});},offChange(fn,target){const i=listeners.findIndex(x=>x.fn===fn&&x.target===target);if(i>=0)listeners.splice(i,1);}};
 language.setCurrentLanguage=value=>{currentLanguage=value;listeners.slice().forEach(x=>x.fn.call(x.target));};
 const data={round:2,levelCfg:{WaveCfg:[{}, {HealthCoefficient:1.8,AttackCoefficient:1.4}]},getHpAdd:()=>1.8,getAttAdd:()=>1.4,getEnemyList:()=>data.enemies||[]};
 const game={gameData:data,gameStatus:0,_combatEpoch:1,moveFun:value=>events.push(['move',value])},ui={node:parent,enemyIconInfo:{},ctrUI:{node:parent,onBlockTouch(){events.push(['stopTouch']);}},ctrGame:game,canBreak:true,_pauseOwners:new Set(),
  onPauseGame(paused,owner){if(paused)this._pauseOwners.add(owner);else this._pauseOwners.delete(owner);this.isPauset=!!this._legacyGamePause||this._pauseOwners.size>0;events.push(['pause',paused]);},
  loadSpriteFrame(bundle,key,done){pending.push({bundle,key,done});}};
 const context={exports:{},cc,require:id=>id==='KinghtFallDataMgr'?{KinghtFallDataMgr:{getInstance:()=>({data:config,getSoldierCfgById:id=>config.SoldierCfg[id]})}}:id==='KinghtFallModle'?{KinghtFallGameStage:{Prepare:0,Transition:1,Fight:2,FightEnd:3,End:4}}:id==='LanguageMgr'?{LanguageMgr:{getInstance:()=>language}}:id==='TestMode'?{TestMode:{getInstance:()=>({clearGameplayInput:()=>events.push(['clearInput'])})}}:null};
 vm.runInNewContext(fs.readFileSync(path.join(root,'assets/_script/EnemyGuide.js'),'utf8'),context,{filename:'EnemyGuide.js'});
 const frame=()=>({getOriginalSize:()=>({width:256,height:128}),clone(){return{destroy(){this.destroyed=true;}};}});
 return{api:context.exports,ui,cc,config,game,data,pending,events,size,origin,safe,keys,listeners,frame,Node,language};
}
function record(f,id=91001,live=false){const item=new f.Node('Marker');item.parent=f.ui.node;const result={id,ndItem:item,tag:true,_guideLive:live};f.ui.enemyIconInfo[id]=result;return result;}
function stats(model){return Object.fromEntries(model.stats);}

test('guide describes queued enemies with the same current-wave scaling and live enemies with their actual mutable stats',()=>{
 const f=fixture(),row=f.config.SoldierCfg[91001];row.Guide={description:'A fast melee creature.',lore:'Authored creature lore.'};
 const before=JSON.stringify(f.config),queued=f.api.describe(f.ui,row.ID,false),s=stats(queued);
 assert.equal(s.health,String(Math.round(row.Health*1.8*100)/100));assert.equal(s.damage,String(Math.round(row.AttackDamage*1.4)));
 assert.equal(s.movement,String(row.Speed));assert.equal(s.sight,String(row.AttackRange+row.SearchRange));assert.equal(queued.description,row.Guide.description);assert.equal(queued.lore,row.Guide.lore);
 f.data.enemies=[{cfg:row,node:new f.Node(),hp:43,hpMax:177,getAttack:()=>32,getAttSpeed:()=>1.2,getSpeed:()=>86,isDead:()=>false}];
 const live=stats(f.api.describe(f.ui,row.ID,true));assert.equal(live.health,'43 / 177');assert.equal(live.damage,'32');assert.equal(live.attackRate,'1.2');assert.equal(live.movement,'86');
 f.data.enemies[0]._isPooled=true;assert.equal(stats(f.api.describe(f.ui,row.ID,true)).health,s.health);
 assert.equal(JSON.stringify(f.config),before);
});

test('upcoming portraits preload once and open immediately without restoring the older portrait frame or duplicate header',()=>{
 const f=fixture(),r=record(f);f.api.bind(f.ui,r);f.api.bind(f.ui,r);
 const path=f.config.SoldierCfg[r.id].loadIcon.slice(6),requests=f.pending.filter(p=>p.key===path);assert.equal(requests.length,1);
 const frame=f.frame();requests[0].done(frame);f.api.open(f.ui,r);const state=f.ui._enemyGuide;
 assert.equal(state.portrait.spriteFrame,frame);assert.equal(state.name._localizedFontRole,'body');
 assert.equal(state.roleIcon.node.parent,state.roleIconCard);assert(state.roleIcon.node.width<state.roleIconCard.width);
 assert.equal(state.content.getChildByName('Role'),undefined);assert.equal(state.content.getChildByName('WaveContext'),undefined);
 assert.equal(state.name.node.parent,state.profile);assert.equal(state.portraitCard.getComponent(f.cc.Graphics),undefined);
 const close=f.pending.find(p=>p.key==='_res/textures/KinghtFallUIOnlineReward/wg_zy_gb');assert(close);close.done(frame);
 assert.equal(state.closeIcon.spriteFrame,frame);assert.equal(state.close.getChildByName('Caption').active,false);
 f.api.close(f.ui);f.api.open(f.ui,r);assert.equal(f.pending.filter(p=>p.key===path).length,1);assert.equal(f.ui._enemyGuide.portrait.spriteFrame,frame);f.api.close(f.ui);
});

test('all enemy records resolve to existing nonempty head portraits without generating or changing unit data',()=>{
 const PNG=require('../../packages/hkd-characters/lib/png-atlas'),icons=new Set();
 for(const row of Object.values(authored.SoldierCfg)){assert(row.loadIcon.startsWith('@icon/'));icons.add(row.loadIcon.slice(6));}
 assert(icons.size>=112);
 for(const icon of icons){const file=path.join(root,'assets/resources',icon+'.png');assert(fs.existsSync(file),icon);const image=PNG.decode(fs.readFileSync(file));let visible=0;for(let i=3;i<image.rgba.length;i+=4)if(image.rgba[i]>64)visible++;assert(visible>300,icon+' has no usable portrait');assert(fs.existsSync(file+'.meta'));}
});

test('portrait preloads respect resource generations and failed loads can retry without updating a closed guide',()=>{
 const f=fixture(),r=record(f),key=f.config.SoldierCfg[r.id].loadIcon.slice(6);f.ui._resourceGeneration=1;f.api.bind(f.ui,r);const old=f.pending.find(p=>p.key===key);
 f.ui._resourceGeneration=2;f.api.open(f.ui,r);const state=f.ui._enemyGuide,request=f.pending.findLast(p=>p.key===key);assert.notEqual(request,old);
 old.done(f.frame());assert.equal(state.portrait.spriteFrame,null);request.done(null);assert.equal(state.portrait.spriteFrame,null);f.api.close(f.ui);
 f.api.open(f.ui,r);const next=f.ui._enemyGuide,retry=f.pending.findLast(p=>p.key===key);assert.notEqual(retry,request);f.api.close(f.ui);retry.done(f.frame());assert.equal(next.portrait.spriteFrame,null);
 f.api.open(f.ui,r);assert(f.ui._enemyGuide.portrait.spriteFrame);f.api.close(f.ui);
});

test('all imported records and campaign aliases have finite supported stats and use their own authored name, portrait and guide',()=>{
 const f=fixture();for(const row of Object.values(f.config.SoldierCfg)){
  const model=f.api.describe(f.ui,row.ID,false);assert.equal(model.name,row.Name);assert.equal(model.icon,row.loadIcon);assert.equal(model.description,row.Guide&&row.Guide.description||model.description);
  for(const [key,value]of model.stats){assert(!/NaN|Infinity|undefined/.test(value),row.ID+'/'+key);assert(value.length>0);}
 }
 const original=f.config.SoldierCfg[91001];f.config.SoldierCfg[92999]={...original,ID:92999,CampaignBaseUnit:90009,BehaviorTemplate:90009,Guide:undefined,Name:'Custom Campaign Vampire',loadIcon:'@icon/custom/head'};
 const alias=f.api.describe(f.ui,92999,false);assert.equal(alias.description,'enemyGuide.fallbackHealer');assert.equal(alias.name,'Custom Campaign Vampire');assert.equal(alias.icon,'@icon/custom/head');
 delete f.config.SoldierCfg[92999].AttackRange;f.config.SoldierCfg[92999].Data=[.2,275,5];f.config.SoldierCfg[92999].SearchRange=80;
 const support=stats(f.api.describe(f.ui,92999,false));assert.equal(support.range,'275');assert.equal(support.sight,'355');
 const roleId=f.config.GameTools.unitTypeAssignments['enemy:91001:default'];assert.equal(f.api.describe(f.ui,91001,false).role,'enemyGuide.role.'+roleId);
 f.config.GameTools.unitTypes[roleId].name='Custom Forest Hunters';assert.equal(f.api.describe(f.ui,91001,false).role,'Custom Forest Hunters');
});

test('opening blocks movement and owns only its own pause; closing preserves another pause and rejects every late resource callback',()=>{
 const f=fixture(),other={};f.ui.onPauseGame(true,other);f.api.open(f.ui,record(f));const state=f.ui._enemyGuide;
 assert(state);assert(f.ui.isPauset);assert.equal(f.ui._pauseOwners.size,2);assert(f.events.some(e=>e[0]==='stopTouch'));assert(f.events.some(e=>e[0]==='move'&&e[1]===null));
 assert.equal(f.keys.length,1);assert.equal(f.listeners.length,1);
 const pending=f.pending.slice();f.api.close(f.ui);assert.equal(f.ui._enemyGuide,null);assert(f.ui.isPauset);assert(f.ui._pauseOwners.has(other));assert.equal(f.keys.length,0);assert.equal(f.listeners.length,0);assert(state.root.destroyed);
 for(const request of pending)request.done(f.frame());assert.equal(state.portrait.spriteFrame,null);assert(!state.closeIcon.spriteFrame);
 f.api.close(f.ui);assert.equal(f.ui._pauseOwners.size,1);
});

test('reused markers bind once and read their current unit; mixed offscreen groups page without stale portraits or ending pause',()=>{
 const f=fixture(),r=record(f);f.api.bind(f.ui,r);f.api.bind(f.ui,r);assert.equal(r.ndItem.events.end.length,1);assert.equal(r.ndItem.components.length,1);
 r.id=91002;r._guideIds=[91001,91002,91001,91003];r.ndItem.emit('end',{stopPropagation(){},getLocation:()=>({x:0,y:0}),getStartLocation:()=>({x:0,y:0})});
 const state=f.ui._enemyGuide;assert.equal(state.model.id,91002);assert.equal(state.ids.length,3);assert.equal(state.index,1);assert(state.next.active);
 const old=f.pending[0];state.next.emit('end',{stopPropagation(){}});assert.equal(state.model.id,91003);assert(f.ui.isPauset);old.done(f.frame());assert.equal(state.portrait.spriteFrame,null);
 f.pending.findLast(x=>x.key.endsWith(f.config.SoldierCfg[91003].loadIcon.replace('@icon/',''))).done(f.frame());assert(state.portrait.spriteFrame);f.api.close(f.ui);assert.equal(f.ui.isPauset,false);
 r.ndItem.emit('end',{stopPropagation(){},getLocation:()=>({x:90,y:0}),getStartLocation:()=>({x:0,y:0})});assert.equal(f.ui._enemyGuide,null,'Dragging a marker must not open the guide');
});

test('outside, close and Escape dismiss; changed battle identity or exiting UI cannot resume an obsolete battle',()=>{
 for(const route of ['outside','close','escape','epoch','round','hidden','exit']){
  const f=fixture();f.api.open(f.ui,record(f));const state=f.ui._enemyGuide,start=f.events.length;
  if(route==='outside')state.root.emit('end',{stopPropagation(){}});
  else if(route==='close')state.close.emit('end',{stopPropagation(){}});
  else if(route==='escape')f.keys[0].fn.call(f.keys[0].target,{keyCode:27,stopPropagation(){}});
  else if(route==='epoch'){f.game._combatEpoch++;f.api.update(f.ui);}
  else if(route==='round'){f.data.round++;f.api.update(f.ui);}
  else if(route==='hidden'){f.ui.node.active=false;f.api.update(f.ui);}
  else {f.ui.isclose=true;f.api.close(f.ui,true);}
  assert.equal(f.ui._enemyGuide,null,route);assert.equal(f.keys.length,0,route);assert.equal(f.ui._pauseOwners.size,0,route);
  if(route==='epoch'||route==='exit')assert(!f.events.slice(start).some(e=>e[0]==='pause'&&e[1]===false),route);
 }
});

test('notched, narrow, short and transformed phone viewports keep the whole modal inside safe bounds and long copy scrolls',()=>{
 for(const screen of [{w:750,h:1334},{w:360,h:780},{w:1024,h:560},{w:750,h:1650}]){
  const f=fixture();Object.assign(f.size,{width:screen.w,height:screen.h});Object.assign(f.origin,{x:-screen.w/2,y:-screen.h/2});Object.assign(f.safe,{x:f.origin.x+12,y:f.origin.y+26,width:screen.w-24,height:screen.h-70});
  f.ui.node.scaleX=f.ui.node.scaleY=.8;
  f.config.SoldierCfg[91001].Guide={description:'A long attack description with enough detail to require wrapping. '.repeat(50),lore:'Creature history and appearance. '.repeat(80)};
  f.api.open(f.ui,record(f));const state=f.ui._enemyGuide,bounds=f.api.safeBounds(state.root),panel=state.panel;
  assert(panel.x-panel.width/2>=bounds.left+19.9);assert(panel.x+panel.width/2<=bounds.right-19.9);assert(panel.y-panel.height/2>=bounds.bottom+19.9);assert(panel.y+panel.height/2<=bounds.top-19.9);
  assert(state.content.height>state.view.height);assert.equal(state.scroll.vertical,true);assert.equal(state.scroll.horizontal,false);assert.equal(state.scroll.inertia,true);assert(state.description.node.height>state.description.lineHeight);
  for(const cell of state.stats){assert(cell.label.node.width<cell.node.width);assert(cell.value.node.width<cell.node.width);assert(cell.node.y-cell.node.height/2<0);}
  f.size.width+=70;f.safe.width+=70;f.api.update(f.ui);assert(state.root.width>screen.w/.8);f.api.close(f.ui);
 }
});

test('clean guide backgrounds never request the decorative pause frame, and replacement guides ignore delayed close artwork',()=>{
 const f=fixture();f.api.open(f.ui,record(f));const state=f.ui._enemyGuide,request=f.pending.find(p=>p.bundle==='KinghtFallPrefabs'),source=f.frame();request.done(source);
 assert(!f.pending.some(p=>p.key.endsWith('wg_zt_d')));assert.equal(state.closeIcon.spriteFrame,source);assert.equal(state.close.getChildByName('Caption').active,false);
 f.api.close(f.ui);
 f.api.open(f.ui,record(f,91002));request.done(f.frame());assert(!f.ui._enemyGuide.closeIcon.spriteFrame);f.api.close(f.ui);
});

test('only planning portraits open guides; combat, transitions and live markers never capture movement or pause',()=>{
 for(const phase of [1,2,3,4,undefined]){
  const f=fixture(),r=record(f);f.game.gameStatus=phase;f.api.bind(f.ui,r);f.api.update(f.ui);
  assert.equal(r.ndItem._enemyGuideInputBlocker.enabled,false);
  let stopped=false;r.ndItem.emit('end',{stopPropagation(){stopped=true;}});f.api.open(f.ui,r);
  assert.equal(stopped,false);assert(!f.ui._enemyGuide);assert.equal(f.pending.length,0);assert.equal(f.ui._pauseOwners.size,0);
  f.game.gameStatus=0;f.api.update(f.ui);assert.equal(r.ndItem._enemyGuideInputBlocker.enabled,true);
  r.ndItem.emit('end',{stopPropagation(){}});assert(f.ui._enemyGuide);f.api.close(f.ui);
 }
 const f=fixture(),live=record(f,91001,true);f.api.bind(f.ui,live);f.api.open(f.ui,live);
 assert.equal(live.ndItem.components.length,0);assert(!live.ndItem.events.end);assert(!f.ui._enemyGuide);
});

test('leaving planning closes an open guide, preserves other pause owners and rejects its late artwork',()=>{
 const f=fixture(),other={},r=record(f);f.api.bind(f.ui,r);f.ui.onPauseGame(true,other);f.api.open(f.ui,r);
 const state=f.ui._enemyGuide,pending=f.pending.slice();f.game.gameStatus=1;
 for(const request of pending)request.done(f.frame());assert.equal(state.portrait.spriteFrame,null);assert(!state.closeIcon.spriteFrame);
 f.api.update(f.ui);assert.equal(f.ui._enemyGuide,null);assert(state.root.destroyed);assert(f.ui.isPauset);assert(f.ui._pauseOwners.has(other));assert.equal(f.ui._pauseOwners.size,1);
 assert.equal(r.ndItem._enemyGuideInputBlocker.enabled,false);
});

test('field-manual layout keeps the name between portrait and type, with no duplicated upper identity strip',()=>{
 const f=fixture();f.api.open(f.ui,record(f,90001));const s=f.ui._enemyGuide;
 assert.equal(s.name.node.parent,s.profile);assert.equal(s.typeButton.parent,s.profile);
 assert(s.portraitCard.y-s.portraitCard.height/2>s.name.node.y+s.name.node.height/2);
 assert(s.name.node.y-s.name.node.height/2>s.typeButton.y+s.typeButton.height/2);
 assert(!s.content.children.some(n=>n.name==='WaveContext'||n.name==='Name'||n.name==='Role'));
 assert.equal(s.name.node.getComponent(f.cc.LabelOutline),undefined);assert.equal(s.close.getComponent(f.cc.Graphics),undefined);
 for(const section of [s.abilitySection,s.loreSection]){
  assert(section.card.height>=section.body.lineHeight*3+20);
  assert(section.body.node.y+section.body.node.height/2<section.card.height/2);
  assert(section.body.node.y-section.body.node.height/2>-section.card.height/2);
 }
 for(const cell of s.stats){assert.equal(cell.label.horizontalAlign,f.cc.Label.HorizontalAlign.LEFT);assert.equal(cell.value.horizontalAlign,f.cc.Label.HorizontalAlign.RIGHT);assert(cell.label.node.x+cell.label.node.width/2<cell.value.node.x-cell.value.node.width/2);}
 f.api.close(f.ui);
});

test('long guide copy grows within its card and the visible scrollbar supports track clicks and thumb dragging',()=>{
 const f=fixture();f.config.SoldierCfg[90001].Guide={description:'A long attack description. '.repeat(70),lore:'The wolf came from the grasslands. '.repeat(60)};
 f.api.open(f.ui,record(f,90001));const s=f.ui._enemyGuide;
 assert(s.bar.active);assert(s.content.height>s.view.height);assert(s.abilitySection.card.height>s.description.lineHeight*3);
 const event=localY=>({getLocation:()=>s.bar.convertToWorldSpaceAR({x:0,y:localY}),stopPropagation(){}});
 s.bar.emit('start',event(-s.bar.height/2+2));assert(s.scroll.getScrollOffset().y>s.content.height-s.view.height-10);
 s.bar.emit('start',event(s.thumbY));s.bar.emit('move',event(s.bar.height/2));assert.equal(s.scroll.getScrollOffset().y,0);
 assert(s.scroll.stopped);assert.equal(s.scroll.elastic,false);f.api.close(f.ui);
});

test('type explanations derive exact enemy and aggregate matchups from saved types without changing records or reviving cleared legacy counters',()=>{
 const f=fixture(),assign=f.config.GameTools.unitTypeAssignments,types=f.config.GameTools.unitTypes;
 assign['enemy:91001:default']='fighter';f.config.SoldierCfg[91001].CounterType='';f.config.SoldierCfg[91001].Suppressed=90002;
 assign['ally:90002:default']='guardian';f.config.AllyCfg[90002].CounterType='fighter';
 types.custom={name:'Custom Hunters',description:'An authored custom explanation.',icon:'@icon/custom/head',tint:'#ff8080'};
 assign['ally:99999:default']='custom';f.config.AllyCfg[99999]={ID:99999,CounterType:'fighter'};
 const before=JSON.stringify(f.config),guide=f.api.describeTypes(f.ui,91001);
 assert.equal(guide.types.length,7);assert.equal(guide.unit.strong.length,0);assert(guide.unit.weak.includes('guardian'));assert(guide.unit.weak.includes('custom'));
 assert.equal(guide.types.find(t=>t.id==='custom').description,'An authored custom explanation.');
 assert(guide.types.find(t=>t.id==='fighter').weak.includes('custom'));
 assert.equal(JSON.stringify(f.config),before);
 delete f.config.SoldierCfg[91001].CounterType;
 assert(f.api.describeTypes(f.ui,91001).unit.strong.includes('guardian'),'missing overrides retain exact-ID legacy behavior');
 f.config.SoldierCfg[91001].CounterType='skirmisher';assert.deepEqual(Array.from(f.api.describeTypes(f.ui,91001).unit.strong),['skirmisher']);
});

test('type tooltip is safe, scrollable and dismisses anywhere or by Escape without stacking visible panels or releasing the guide pause',()=>{
 for(const route of ['inside','outside','escape','close']){
  const f=fixture();f.api.open(f.ui,record(f,90001));const s=f.ui._enemyGuide;
  s.typeButton.emit('end',{stopPropagation(){}});const tip=s.typeTooltip;
  assert(tip);assert.equal(s.panel.active,false);assert.equal(tip.rows.length,7);assert(tip.bar.active);assert.equal(f.ui._pauseOwners.size,1);assert.equal(f.keys.length,1);assert.equal(f.listeners.length,1);
  const bounds=f.api.safeBounds(s.root),p=tip.panel;assert(p.x-p.width/2>=bounds.left+31.9);assert(p.x+p.width/2<=bounds.right-31.9);
  tip.root.emit('end',{stopPropagation(){},getLocation:()=>({x:0,y:120}),getStartLocation:()=>({x:0,y:0})});assert.equal(s.typeTooltip,tip,'dragging must not dismiss the scrolling tooltip');
  if(route==='inside')tip.root.emit('end',{target:tip.rows[1].name.node,stopPropagation(){}});
  else if(route==='outside')s.root.emit('end',{stopPropagation(){}});
  else if(route==='escape')f.keys[0].fn.call(f.keys[0].target,{keyCode:27,stopPropagation(){}});
  else tip.close.emit('end',{stopPropagation(){}});
  assert.equal(s.typeTooltip,null);assert(tip.root.destroyed);assert.equal(f.ui._enemyGuide,s);assert.equal(f.ui.isPauset,true);assert.equal(s.root.active,true);assert.equal(s.panel.active,true);assert.equal(f.ui._pauseOwners.size,1);
  f.api.close(f.ui);assert.equal(f.ui.isPauset,false);
 }
});

test('open type tooltips translate and resize, and dismissing or leaving planning rejects their delayed artwork',()=>{
 const f=fixture();f.api.open(f.ui,record(f,90001));const s=f.ui._enemyGuide;s.typeButton.emit('end',{stopPropagation(){}});
 const old=s.typeTooltip,requests=f.pending.slice();f.language.setCurrentLanguage('zh');const tip=s.typeTooltip;
 assert(tip&&tip!==old);assert(old.root.destroyed);assert.equal(tip.title.string,'兵种说明');assert(tip.rows.some(r=>r.name.string==='斗士'));assert.equal(f.listeners.length,1);
 for(const request of requests)request.done(f.frame());assert(old.rows.slice(1).every(r=>!r.icon.spriteFrame));
 f.size.width=360;f.size.height=640;Object.assign(f.origin,{x:-180,y:-320});Object.assign(f.safe,{x:-168,y:-294,width:336,height:590});f.api.update(f.ui);
 const bounds=f.api.safeBounds(s.root);assert(tip.panel.x-tip.panel.width/2>=bounds.left+31.9);assert(tip.content.height>tip.view.height);
 const late=f.pending.slice();f.game.gameStatus=2;f.api.update(f.ui);for(const request of late)request.done(f.frame());
 assert.equal(f.ui._enemyGuide,null);assert(tip.root.destroyed);assert.equal(f.ui._pauseOwners.size,0);assert.equal(f.keys.length,0);assert.equal(f.listeners.length,0);
});
