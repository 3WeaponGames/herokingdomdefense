'use strict';
// Real catalog/controller with inert scene nodes; no game, storage, SDK or audio.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {fixture}=require('./backend-ui-harness.cjs'),root=path.resolve(__dirname,'../..');
function atlas(options={}){
 const h=fixture(),config=JSON.parse(fs.readFileSync(path.join(root,'assets/KinghtFallConfig/GameJsonCfg.json'))),catalog=JSON.parse(fs.readFileSync(path.join(root,'assets/resources/localization/catalog.json')));
 if(options.direct)for(const cfg of Object.values(config.BuildEnum))delete cfg.InitialChoices;
 if(options.edit)options.edit(config);
 const before=JSON.stringify(config),listeners=[],loads=[];let language='en';
 const translate=value=>String(value||'').replace(/\[\[loc:(.+?)\]\]/g,(_match,key)=>catalog.entries[key]?.[language]||catalog.entries[key]?.en||key);
 const lang={t:translate,bindLabel:(label,text)=>{label.string=translate(text);},format:(text,values)=>translate(text).replace(/\{(\d+)\}/g,(_match,id)=>values[id]),onChange(fn,owner){this.offChange(fn,owner);listeners.push({fn,owner});},offChange(fn,owner){for(let i=listeners.length-1;i>=0;i--)if(listeners[i].fn===fn&&listeners[i].owner===owner)listeners.splice(i,1);},setCurrentLanguage(value){language=value;listeners.slice().forEach(x=>x.fn.call(x.owner));}};
 class Node extends h.cc.Node{
  constructor(name){super(name);Object.assign(this,{components:new Map(),width:0,height:0,x:0,y:0,anchorX:.5,anchorY:.5,scale:1,scaleX:1,scaleY:1});}
  addComponent(Type){const value=new Type();value.node=this;this.components.set(Type,value);return value;}
  getComponent(Type){return this.components.get(Type);}
  setPosition(x,y){if(typeof x==='object')({x,y}=x);this.x=x;this.y=y;}
  setScale(value){this.scale=this.scaleX=this.scaleY=value;}
  setSiblingIndex(index){if(this.parent){const siblings=this.parent.children;siblings.splice(siblings.indexOf(this),1);siblings.splice(index,0,this);}}
  on(type,fn,owner){this.handlers[type]=owner?fn.bind(owner):fn;}
  off(type){delete this.handlers[type];}
 }
 Node.EventType={TOUCH_END:'end',SIZE_CHANGED:'size'};
 class Label{_forceUpdateRenderData(){if(this.overflow!==Label.Overflow.RESIZE_HEIGHT)return;const text=String(this.string||''),lines=Math.max(1,Math.ceil(text.length*this.fontSize*.55/Math.max(1,this.node.width)));this.node.height=lines*this.lineHeight+this.fontSize*.25;}}
 Label.Overflow={RESIZE_HEIGHT:3,SHRINK:2};Label.HorizontalAlign={LEFT:0,CENTER:1};Label.VerticalAlign={TOP:0,CENTER:1};
 class RichText{_updateRichText(){const text=String(this.string||'').replace(/<[^>]*>/g,''),lines=Math.max(1,Math.ceil(text.length*this.fontSize*.5/Math.max(1,this.maxWidth)));this.node.width=this.maxWidth;this.node.height=lines*this.lineHeight+this.fontSize*.25;}}
 class Sprite{}Sprite.SizeMode={CUSTOM:0,TRIMMED:1};
 class Graphics{clear(){}roundRect(){}fill(){}stroke(){}moveTo(){}lineTo(){}}
 class Layout{}class Color{constructor(r,g,b,a){Object.assign(this,{r,g,b,a});}}
 class Scroll{
  constructor(){this.offset=0;}
  getScrollOffset(){return{x:0,y:this.offset};}
  getMaxScrollOffset(){return{x:0,y:Math.max(0,this.content.height-this.view.height)};}
  scrollToOffset(point){this.offset=Math.max(0,Math.min(this.getMaxScrollOffset().y,point.y));}
  stopAutoScroll(){this.stopped=true;}
 }
 Object.assign(h.cc,{Node,Label,RichText,Sprite,Graphics,Layout,Color,ScrollView:Scroll});
 Object.assign(h.modules,{KinghtFallConfig:{KinghtFallBundelName:{IconBuild:'KinghtFallIconBuild'}},KinghtFallEnum:{KinghtFallEnumBuildEnum:{CastleCenter:1,ArrowTower:2,Barracks:3,PrivateHouse:4,Mill:5,Wall:6}},KinghtFallDataMgr:{KinghtFallDataMgr:{getInstance:()=>({getBuildCfgById:id=>config.BuildEnum[id]})}},LanguageMgr:{LanguageMgr:{getInstance:()=>lang}}});
 const Type=h.load('KinghtFallUIBuildAtlas').default,ui=new Type();ui.node=new Node('Atlas');ui.node.setContentSize(options.width||750,options.height||1334);ui.T=options.tokens?value=>value:translate;
 const node=(name,parent,Component)=>{const child=new Node(name);child.parent=parent;if(Component)child.addComponent(Component);return child;};
 const parent=node('root',ui.node),banner=node('wg_jzfz_bt',parent,Sprite);node('title',banner,Label);
 ui.btnClose=node('Close',parent,Sprite);ui.ndItem=node('Template',parent);
 const scroll=node('New ScrollView',parent,Scroll),view=node('view',scroll);ui.ndParent=node('content',view,Layout);
 const motion=scroll.getComponent(Scroll);motion.content=ui.ndParent;motion.view=view;
 ui.loadSpriteFrame=(bundle,file,done)=>{loads.push({bundle,file,done});if(!options.defer)done({getRect:()=>({width:1000,height:1200})});};
 ui.start();return{ui,h,config,before,loads,lang,listeners,visible:()=>ui.entries.filter(e=>e.node.active),names:()=>ui.entries.map(e=>e.name.string)};
}
function inside(entry){
 const row=entry.node,half=row.height/2,name=entry.name.node,info=entry.info.node,badge=entry.badge;
 assert(name.x>=-row.width/2+12);assert(badge.x+badge.width/2<name.x-12);assert(name.x+name.width<=row.width/2-12);
 assert(name.y<=half-12);assert(info.y-info.height>=-half+12);
 assert(info.x+info.width<=row.width/2-12);assert(badge.x+badge.width/2<=row.width/2-12);
 assert(entry.icon.width*entry.icon.scale<=entry.iconWidth+1e-8);assert(entry.icon.height*entry.icon.scale<=116+1e-8);
 assert(info.y<=name.y-name.height-3);assert(badge.y+18<=80);assert(badge.x-badge.width/2>=-row.width/2+12);
 assert(entry.icon.y+entry.icon.height*entry.icon.scale/2<=badge.y-18-1);
}
test('Buildings catalog includes every authored starting type with separate names/levels and complete tower portraits',()=>{
 const p=atlas();assert.equal(p.ui.entries.length,11);
 for(const name of ['Cannon Tower','Sniper Tower','Guard Barracks','Shield Barracks','Crossbow Barracks','Timber Stables'])assert(p.names().includes(name),name);
 assert(p.ui.entries.every(e=>e.level.string==='Lv 1'&&e.info.string.length>0));
 for(const file of ['painted-cannon-1','painted-sniper-1'])assert(p.loads.some(x=>x.bundle==='KinghtFallIconBuild'&&x.file===file));
 assert.deepEqual(p.loads.filter(x=>x.bundle==='resources').map(x=>x.file),['buildings/redesign/towers/archer-1']);p.ui.entries.forEach(inside);assert.equal(JSON.stringify(p.config),p.before);
});
test('category tabs show only their rows and reset scrolling without rebuilding portraits or changing data',()=>{
 const p=atlas(),loads=p.loads.length;p.ui._atlasScroll.offset=300;
 p.ui._atlasTabButtons.find(x=>x.id==='towers').node.handlers.end({stopPropagation(){}});
 assert.deepEqual(Array.from(p.visible(),e=>e.name.string),['Archer Lookout','Cannon Tower','Sniper Tower']);assert.equal(p.ui._atlasScroll.offset,0);assert.equal(p.ui._atlasScroll.stopped,true);assert.equal(p.ui._atlasBar.node.active,false);
 p.ui.selectCategory('barracks');assert.deepEqual(Array.from(p.visible(),e=>e.name.string),['Guard Barracks','Shield Barracks','Crossbow Barracks','Timber Stables']);assert(p.ui._atlasGroups.filter(g=>g.node.active).every(g=>g.id==='barracks'));
 p.ui.selectCategory('all');assert.equal(p.visible().length,11);assert.equal(p.loads.length,loads);assert.equal(JSON.stringify(p.config),p.before);
});
test('short screens and long authored descriptions grow their own card without name, badge or body collisions',()=>{
 const p=atlas({width:540,height:820,edit(c){c.BuildEnum[2].levelList[0].Name='Very Long Authored Arrow Tower Name';c.BuildEnum[2].levelList[0].LevelUpDescribe='An unusually long custom description with many useful details, which should wrap over several lines while staying inside the card. '.repeat(3);}});
 assert(p.ui.entries[0].node.height>146);p.ui.entries.forEach(inside);assert.equal(p.ui._atlasRoot.width,496);assert.equal(p.ui._atlasRoot.height,708);
 assert(p.ui._atlasScrollNode.y+p.ui._atlasScrollNode.height/2<p.ui._atlasTabs.y-32);assert(p.ui._atlasScrollNode.y-p.ui._atlasScrollNode.height/2>p.ui._atlasFooter.node.y+21);
});
test('language changes refresh filtered labels and badges without reloading assets or changing building configuration',()=>{
 const p=atlas(),loads=p.loads.length;p.ui.selectCategory('barracks');p.lang.setCurrentLanguage('zh');assert(p.names().includes('卫兵营房'));assert(p.ui.entries.every(e=>e.level.string==='1级'));assert(p.visible().every(e=>!/[·•]/.test(e.name.string)));p.ui.entries.forEach(inside);
 p.lang.setCurrentLanguage('en');assert(p.names().includes('Guard Barracks'));assert.equal(p.loads.length,loads);assert.equal(JSON.stringify(p.config),p.before);
});
test('scroll guidance and thumb visibility follow the selected content and current position',()=>{
 const p=atlas();assert.equal(p.ui._atlasFooter.string,'More buildings below ↓');assert.equal(p.ui._atlasBar.node.active,true);
 p.ui._atlasScroll.offset=p.ui._atlasScroll.getMaxScrollOffset().y;p.ui.updateScrollHint();assert.equal(p.ui._atlasFooter.string,'All buildings shown');p.ui.selectCategory('towers');assert.equal(p.ui._atlasBar.node.active,false);assert.equal(p.ui._atlasFooter.string,'All buildings shown');
});
test('close retires late portrait callbacks and language subscriptions without touching gameplay',()=>{
 const p=atlas({defer:true});assert.equal(p.listeners.length,1);p.ui.btnClose.handlers.end();assert.equal(p.ui.isclose,true);for(const request of p.loads)request.done({getRect:()=>({width:100,height:100})});assert(p.ui.entries.every(e=>!e.frame));p.ui.onDestroy();assert.equal(p.listeners.length,0);assert.equal(JSON.stringify(p.config),p.before);
});
test('direct construction uses each category’s first authored branch without assuming branch one exists',()=>{
 const p=atlas({direct:true});assert.equal(p.ui.entries.length,6);assert.deepEqual(p.loads.filter(x=>x.bundle==='resources').map(x=>x.file),['buildings/redesign/towers/archer-1']);p.ui.selectCategory('towers');assert.equal(p.visible().length,1);p.ui.selectCategory('barracks');assert.equal(p.visible().length,1);assert.equal(p.visible()[0].index,11);
});
test('custom complete artwork uses Resources and malformed duplicate or missing initial choices are ignored',()=>{
 const p=atlas({edit(c){delete c.BuildEnum[2].levelList[3].Appearance.weapon;c.BuildEnum[3].InitialChoices=[11,11,-1,999,14];}});assert(p.loads.some(x=>x.bundle==='resources'&&x.file==='buildings/redesign/towers/cannon-1'));p.ui.selectCategory('barracks');assert.equal(p.visible().length,2);assert.equal(JSON.stringify(p.config),p.before);
});
test('live localization tokens resolve before level suffixes are removed, and badge previews wrap without writes',()=>{
 const p=atlas({tokens:true}),entry=p.ui.entries.find(e=>e.kind===2&&e.index===4),height=entry.node.height;
 assert.equal(entry.name.string,'Cannon Tower');assert(!p.names().some(name=>/Lv\s*\d/.test(name)));
 const click=()=>entry.badge.handlers.end({stopPropagation(){}});
 click();assert.equal(entry.cfg.level,2);assert.equal(entry.level.string,'Lv 2');assert.equal(p.loads.at(-1).file,'painted-cannon-2');assert.match(entry.info.string,/larger blasts/i);assert.equal(entry.node.height,height);inside(entry);
 click();assert.equal(entry.cfg.level,3);assert.match(entry.info.string,/upgrade/i);assert(!/final/i.test(entry.info.string));assert.equal(p.loads.at(-1).file,'painted-cannon-3');assert.equal(entry.node.height,height);
 click();assert.equal(entry.cfg.level,4);assert.equal(entry.name.string,'Royal Cannon Tower');assert.match(entry.info.string,/final upgrade/i);assert.equal(p.loads.at(-1).file,'painted-cannon-4');assert.equal(entry.node.height,height);
 p.lang.setCurrentLanguage('zh');assert.equal(entry.name.string,'皇家加农炮塔');assert.equal(entry.level.string,'4级');assert.match(entry.info.string,/最终升级/);
 p.lang.setCurrentLanguage('en');click();assert.equal(entry.cfg.level,1);assert.equal(entry.level.string,'Lv 1');assert.equal(entry.name.string,'Cannon Tower');assert.equal(entry.node.height,height);
 assert.equal(JSON.stringify(p.config),p.before);
});
test('every authored preview branch has a portrait and level-specific notes, with three reserved text rows',()=>{
 const p=atlas();for(const entry of p.ui.entries){const initial=entry.cfg,seen=[];for(let i=0;i<entry.levels.length;i++){
  seen.push(entry.cfg);assert(entry.info.string.length>0);assert(entry.info.node.y-entry.info.lineHeight*3>=-entry.node.height/2+12);inside(entry);
  if(entry.cfg.BranchBuild?.length)assert.match(entry.info.string,/upgrade/i);else assert.match(entry.info.string,/final upgrade/i);
  entry.badge.handlers.end({stopPropagation(){}});
 }assert.equal(entry.cfg,initial);assert.equal(new Set(seen).size,entry.levels.length);}
 const arrow=p.ui.entries.find(e=>e.kind===2&&e.index===1);assert.deepEqual(Array.from(arrow.levels,l=>l.level),[1,2,3,4],'the approved progression contains four distinct authored tiers');assert.equal(JSON.stringify(p.config),p.before);
});
test('quick level changes reject old portrait loads while keeping scroll position and preview labels',()=>{
 const p=atlas({defer:true}),entry=p.ui.entries.find(e=>e.kind===2&&e.index===7),old=p.loads.find(x=>x.file==='painted-sniper-1');p.ui._atlasScroll.offset=160;
 entry.badge.handlers.end({stopPropagation(){}});const middle=p.loads.at(-1);entry.badge.handlers.end({stopPropagation(){}});const current=p.loads.at(-1);
 old.done({getRect:()=>({width:10,height:10})});middle.done({getRect:()=>({width:10,height:10})});assert.equal(entry.frame,null);
 const frame={getRect:()=>({width:110,height:200})};current.done(frame);assert.equal(entry.frame,frame);assert.equal(entry.level.string,'Lv 3');assert.equal(p.ui._atlasScroll.offset,160);
});
