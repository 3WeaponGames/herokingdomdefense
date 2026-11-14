'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const Art=require('../../assets/_script/HeroSkillButton'),base=path.resolve(__dirname,'../../assets/resources/gui-pro/skills'),document=JSON.parse(fs.readFileSync(path.join(base,'active-skill.prefab'),'utf8'));
const near=(a,b)=>assert(Math.abs(a-b)<1e-8,`${a} != ${b}`);
test('all six production skill scenes are opaque and at most 128px with matching import metadata',()=>{
 const root=path.resolve(__dirname,'../..'),PNG=require('../../packages/hkd-characters/lib/png-atlas'),crypto=require('node:crypto'),catalog=require('../icons/hero-skill-icons.catalog.json');
 assert.deepEqual(catalog.icons.map(icon=>icon.id),['skirmisher','fighter','vanguard','mystic','bruiser','guardian']);
 const ids=new Set();for(const icon of catalog.icons){const bytes=fs.readFileSync(path.join(root,icon.image)),image=PNG.decode(bytes),meta=JSON.parse(fs.readFileSync(path.join(root,icon.image+'.meta'),'utf8')),frames=Object.values(meta.subMetas);assert(image.width>0&&image.width<=128);assert.equal(image.height,image.width);assert.equal(image.width,icon.width);assert.equal(image.height,icon.height);assert.equal(meta.width,image.width);assert.equal(meta.height,image.height);assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),icon.sha256);for(let i=3;i<image.rgba.length;i+=4)assert.equal(image.rgba[i],255,icon.id+' must fill its background');assert.equal(frames.length,1);const frame=frames[0];assert.equal(frame.trimType,'none');assert.equal(frame.rawTextureUuid,meta.uuid);assert.equal(frame.width,image.width);assert.equal(frame.rawWidth,image.width);assert.equal(frame.height,image.height);assert.equal(frame.rawHeight,image.height);assert.equal(frame.trimX,0);assert.equal(frame.trimY,0);for(const id of [meta.uuid,frame.uuid]){assert(!ids.has(id));ids.add(id);}}
});
function asset(rect={width:100,height:200}){return{refs:0,addRef(){this.refs++;},decRef(){this.refs--;},getRect:()=>rect};}
function fixture(options={}){
 class Node{constructor(name){this.name=name;this.children=[];this.components=[];this.active=true;this.width=this.height=0;this.scale=1;}get activeInHierarchy(){return this.active&&(!this.parent||this.parent.activeInHierarchy);}setParent(p){this.parent=p;p.children.push(this);}setPosition(x,y){this.x=x;this.y=y;}setContentSize(w,h){this.width=w;this.height=h;}getChildByName(name){return this.children.find(n=>n.name===name);}getComponent(type){return this.components.find(c=>c instanceof type);}setSiblingIndex(index){const a=this.parent.children;a.splice(a.indexOf(this),1);a.splice(index,0,this);}destroy(){this.destroyed=true;this.children.forEach(n=>n.destroy());}}
 const radialWrites=[];
 class Color{constructor(value={r:255,g:255,b:255,a:255}){this.set(value);}set(value){if(value)for(const key of ['r','g','b','a'])this[key]=value[key];}clone(){return new Color(this);}}
 class Sprite{};Sprite.SizeMode={CUSTOM:0};Sprite.Type={FILLED:3};Sprite.FillType={RADIAL:2};
 if(options.engineColors){
  // CCNode.color returns a clone, while its setter mutates the owned color.
  Object.defineProperty(Node.prototype,'color',{get(){return this._color.clone();},set(value){if(!this._color)this._color=new Color();this._color.set(value);}});
  for(const key of ['type','fillType','fillCenter','fillStart'])Object.defineProperty(Sprite.prototype,key,{get(){return this['_'+key];},set(value){radialWrites.push(key);this['_'+key]=value;}});
 }
 // Creator 2.4.13's native Mask.type setter always activates materials, even
 // for an unchanged type; its native assembler exists only after activation.
 class Mask{get type(){return this._type;}set type(value){this._type=value;if(options.native){const assembler=this.node.activeInHierarchy?{setRenderSubHandle(){}}:null;assembler.setRenderSubHandle({});}}};Mask.Type={ELLIPSE:1};
 const pending=[],warnings=[],cc={Sprite,Mask,Prefab:class{},color:v=>options.engineColors?new Color({r:parseInt(v.slice(1,3),16),g:parseInt(v.slice(3,5),16),b:parseInt(v.slice(5,7),16),a:255}):v,v2:(x,y)=>({x,y}),isValid:n=>!!n&&!n.destroyed,warn:message=>warnings.push(message),resources:{load(resource,type,done){pending.push({resource,type,done});}},instantiate(){const nodes=new Map();function make(index){if(nodes.has(index))return nodes.get(index);const saved=document[index],n=new Node(saved._name);nodes.set(index,n);n.active=saved._active!==false;n.color=saved._color;n.opacity=saved._opacity;n.width=saved._contentSize.width;n.height=saved._contentSize.height;n.x=saved._trs.array[0];n.y=saved._trs.array[1];for(const component of saved._components||[]){const row=document[component.__id__];if(row.__type__==='cc.Sprite'){const s=new Sprite();s.node=n;for(const key of ['type','fillType','fillCenter','fillStart'])s[(options.engineColors?'_':'')+key]=row['_'+key];s.fillRange=row._fillRange;n.components.push(s);}if(row.__type__==='cc.Mask'){const m=new Mask();m.node=n;m._type=row._type;m._segments=row._segments;m.inverted=row._inverted;n.components.push(m);}}for(const child of saved._children||[])make(child.__id__).setParent(n);return n;}return make(1);}};
 const button=new Node('button'),caption=new Node('caption');caption.setParent(button);let current=true;const handle=Art.create(button,()=>current,cc),prefab=asset();
 const loadPrefab=()=>pending[0].done(null,prefab),set=state=>handle.set({style:'skirmisher',usable:true,aiming:false,cooldown:0,totalCooldown:12,...state});
 return{cc,button,caption,pending,warnings,radialWrites,handle,prefab,loadPrefab,set,retire(){current=false;}};
}

test('white GUI PRO frame stays behind one circular mask for artwork and the clockwise cooldown',()=>{
 const nodes=document.filter(r=>r.__type__==='cc.Node'),find=name=>nodes.find(n=>n._name===name);
 for(const [name,key,w,h,size]of [['Frame','frame',192,206,192],['Frame armed','frame',192,206,192],['Frame disabled','frame',192,206,192],['InBase','base',200,200,166],['Cooltime','base',200,200,166]]){const image=fs.readFileSync(path.join(base,key+'.png')),meta=JSON.parse(fs.readFileSync(path.join(base,key+'.png.meta'),'utf8')),n=find(name),sprite=document[n._components[0].__id__];assert.equal(image.readUInt32BE(16),w);assert.equal(image.readUInt32BE(20),h);assert.equal(n._contentSize.width,size);assert.equal(n._contentSize.height,size===192?206:166);assert.equal(meta.width,w);assert.equal(meta.height,h);assert.equal(sprite._spriteFrame.__uuid__,Object.values(meta.subMetas)[0].uuid);assert.equal(sprite._sizeMode,0);assert.equal(Object.values(meta.subMetas)[0].trimType,'none');}
 const art=find('Artwork'),mask=document[art._components[0].__id__];assert.equal(mask.__type__,'cc.Mask');assert.equal(mask._type,1);assert.equal(mask._inverted,false);assert.equal(mask._segments,96);assert.equal(art._contentSize.width,166);assert.equal(art._contentSize.height,166);near(art._trs.array[1],7);assert.deepEqual(art._children.map(c=>document[c.__id__]._name),['InBase','Icon','Cooltime']);assert.deepEqual(find('Active skill visuals')._children.map(c=>document[c.__id__]._name),['Frame','Frame armed','Frame disabled','Artwork']);
 assert.deepEqual(find('InBase')._color,{__type__:'cc.Color',r:41,g:49,b:79,a:255});
 const cool=find('Cooltime'),fill=document[cool._components[0].__id__];assert.equal(cool._opacity,185);assert.deepEqual(cool._color,{__type__:'cc.Color',r:0,g:0,b:0,a:255});assert.equal(fill._type,3);assert.equal(fill._fillType,2);assert.equal(fill._fillStart,.25);assert.equal(fill._fillCenter.x,.5);assert.equal(fill._fillCenter.y,.5);assert.equal(fill._fillRange,1);near(192*Art.frameScale,104*1.15);near(Art.faceCenterY(),28+7*Art.frameScale);
});

test('skill scenes fill the face without stretching and frames reflect readiness and aim',()=>{
 const f=fixture();f.set({});f.loadPrefab();assert.equal(f.button.children[0],f.handle.visual,'art remains behind captions and cooldown text');near(f.handle.visual.scale,Art.defaultDiameter/192);assert.equal(f.handle.visual.y,28);
 const icons=[];for(const style of ['skirmisher','fighter','vanguard','mystic','bruiser','guardian']){f.set({style});const request=f.pending.at(-1);assert.equal(request.resource,'skills/icons/'+style);const icon=asset({width:128,height:128});icons.push(icon);request.done(null,icon);assert.equal(f.handle.icon.spriteFrame,icon);assert.equal(f.handle.icon.trim,true);near(f.handle.icon.node.width*f.handle.visual.scale,166*Art.frameScale);near(f.handle.icon.node.height*f.handle.visual.scale,166*Art.frameScale);}
 assert(icons.slice(0,-1).every(a=>a.refs===0));assert.equal(icons.at(-1).refs,1);
 f.set({style:'guardian',aiming:true});assert.equal(f.handle.visual.getChildByName('Frame armed').active,true);assert.equal(f.handle.visual.getChildByName('Frame').active,false);
 f.set({style:'guardian',usable:false,cooldown:3,totalCooldown:12});assert.equal(f.handle.visual.getChildByName('Frame disabled').active,true);assert.equal(f.handle.visual.getChildByName('Artwork').getChildByName('Cooltime').active,true);near(f.handle.cooldown.fillRange,.25);assert.equal(f.handle.cooldown.fillStart,.25);assert.equal(f.handle.cooldown.fillType,2);assert.equal(f.handle.icon.node.color,'#ffffff','The revealed artwork retains its full color during cooldown');
 const count=f.pending.length;f.set({style:'guardian',usable:false,cooldown:2.5,totalCooldown:12});near(f.handle.cooldown.fillRange,2.5/12);assert.equal(f.pending.length,count);f.set({style:'guardian',usable:false,cooldown:0});assert.equal(f.handle.icon.node.color,'#aaa6b4','Unusable skills can still dim once the sweep finishes');f.handle.destroy();assert.equal(icons.at(-1).refs,0);assert.equal(f.prefab.refs,0);
});

test('legacy rectangular artwork keeps its proportions within the circular face',()=>{
 const f=fixture();f.set({});f.loadPrefab();f.pending.at(-1).done(null,asset({width:120,height:240}));near(f.handle.icon.node.width*f.handle.visual.scale,83*Art.frameScale);near(f.handle.icon.node.height*f.handle.visual.scale,166*Art.frameScale);f.handle.destroy();
});

test('every planning icon has a full gray overlay and restores the authored battle cooldown sweep',()=>{
 const f=fixture();f.set({});f.loadPrefab();const overlay=f.handle.visual.getChildByName('Artwork').getChildByName('Cooltime'),battleColor=overlay.color,battleOpacity=overlay.opacity;
 for(const style of ['skirmisher','fighter','vanguard','mystic','bruiser','guardian']){
  f.set({style,planning:true,usable:false,cooldown:7,totalCooldown:12});assert.equal(f.handle.visual.getChildByName('Frame disabled').active,true);assert.equal(f.handle.visual.getChildByName('Frame armed').active,false);assert.equal(overlay.active,true);assert.equal(overlay.color,'#686b73');assert.equal(overlay.opacity,165);assert.equal(f.handle.cooldown.fillRange,1);assert.equal(f.handle.icon.node.color,'#ffffff');
  f.set({style,planning:false,usable:false,cooldown:3,totalCooldown:12});assert.equal(overlay.color,battleColor);assert.equal(overlay.opacity,battleOpacity);near(f.handle.cooldown.fillRange,.25);assert.equal(f.handle.icon.node.color,'#ffffff');
  f.set({style,planning:false,usable:true,cooldown:0});assert.equal(overlay.active,false);assert.equal(f.handle.visual.getChildByName('Frame').active,true);
 }
 f.handle.destroy();
});

test('Creator color copies preserve the authored black battle sweep through native planning transitions without geometry setters',()=>{
 const f=fixture({native:true,engineColors:true});f.button.active=false;f.set({planning:true,usable:false});f.loadPrefab();
 const overlay=f.handle.visual.getChildByName('Artwork').getChildByName('Cooltime'),internal=overlay._color,rgba=c=>({r:c.r,g:c.g,b:c.b,a:c.a});
 assert.deepEqual(rgba(overlay.color),{r:104,g:107,b:115,a:255});assert.equal(overlay.opacity,165);assert.equal(f.handle.cooldown.fillRange,1);
 f.button.active=true;f.set({planning:false,usable:false,cooldown:3,totalCooldown:12});
 assert.equal(overlay._color,internal,'the engine setter updates its owned color in place');
 assert.notEqual(overlay.color,internal,'the engine getter must return a separate color');
 const authored=overlay.color;assert.deepEqual(rgba(authored),{r:0,g:0,b:0,a:255});assert.equal(overlay.opacity,185);near(f.handle.cooldown.fillRange,.25);
 f.set({planning:true,usable:false});assert.deepEqual(rgba(authored),{r:0,g:0,b:0,a:255},'the captured battle color cannot alias planning gray');
 f.set({planning:false,usable:false,cooldown:6,totalCooldown:12});assert.deepEqual(rgba(overlay.color),{r:0,g:0,b:0,a:255});assert.equal(overlay.opacity,185);near(f.handle.cooldown.fillRange,.5);
 assert.deepEqual(f.radialWrites,[]);assert.deepEqual(f.warnings,[]);
 assert.equal(f.handle.cooldown.type,3);assert.equal(f.handle.cooldown.fillType,2);assert.equal(f.handle.cooldown.fillStart,.25);assert.equal(f.handle.cooldown.fillCenter.x,.5);assert.equal(f.handle.cooldown.fillCenter.y,.5);
 f.handle.destroy();assert.equal(f.prefab.refs,0);
});

test('artwork loaded during planning begins gray and a later battle transition removes its overlay',()=>{
 const f=fixture();f.set({style:'guardian',planning:true,usable:false,cooldown:0});f.loadPrefab();const overlay=f.handle.visual.getChildByName('Artwork').getChildByName('Cooltime');assert.equal(overlay.active,true);assert.equal(overlay.color,'#686b73');assert.equal(f.handle.cooldown.fillRange,1);f.pending.at(-1).done(null,asset({width:128,height:128}));assert(f.handle.icon.spriteFrame);f.set({style:'guardian',planning:false,usable:true,cooldown:0});assert.equal(overlay.active,false);f.handle.destroy();
});

test('native artwork loaded into an inactive HUD retains its authored mask and becomes visible on activation',()=>{
 const f=fixture({native:true});f.button.active=false;f.set({style:'guardian',planning:true,usable:false});f.loadPrefab();
 assert(f.handle.visual,'The native mask setter must not destroy the artwork while its HUD is inactive');
 assert.deepEqual(f.warnings,[]);assert.equal(f.prefab.refs,1);
 const artwork=f.handle.visual.getChildByName('Artwork'),mask=artwork.getComponent(f.cc.Mask),icon=asset({width:128,height:128});
 assert.equal(mask.type,f.cc.Mask.Type.ELLIPSE);assert.equal(mask._segments,96);assert.equal(mask.inverted,false);assert.equal(artwork.activeInHierarchy,false);
 f.pending.at(-1).done(null,icon);assert.equal(f.handle.icon.spriteFrame,icon);assert.equal(icon.refs,1);
 f.button.active=true;f.set({style:'guardian',planning:false,usable:true,cooldown:0});
 assert.equal(artwork.activeInHierarchy,true);assert.equal(f.handle.visual.getChildByName('Frame').active,true);assert.equal(artwork.getChildByName('Cooltime').active,false);
 assert.equal(f.handle.icon.spriteFrame,icon);assert.equal(f.pending.length,2,'Activation reuses the loaded visual and icon');
 f.handle.destroy();assert.equal(icon.refs,0);assert.equal(f.prefab.refs,0);
});

test('command-relative resizing works before and after async prefab loading without reloading artwork',()=>{
 const f=fixture();f.handle.resize(149.5);f.set({});f.loadPrefab();near(f.handle.visual.scale,149.5/192);const count=f.pending.length;f.handle.resize(119.6);near(f.handle.visual.scale,119.6/192);for(const bad of [0,-1,NaN,Infinity,'140'])f.handle.resize(bad);near(f.handle.visual.scale,119.6/192);assert.equal(f.pending.length,count);const b=Art.bounds(119.6);near(b.right-b.left,119.6);near(b.top-b.bottom,206*119.6/192);f.handle.destroy();
});

test('late prefab or icon completions cannot attach to retired, destroyed or replaced HUD owners',()=>{
 const retired=fixture();retired.retire();retired.loadPrefab();assert.equal(retired.handle.visual,null);assert.equal(retired.prefab.refs,0);
 const destroyed=fixture();destroyed.handle.destroy();destroyed.loadPrefab();assert.equal(destroyed.handle.visual,null);assert.equal(destroyed.prefab.refs,0);
 const f=fixture();f.set({style:'skirmisher'});f.loadPrefab();const old=f.pending.at(-1);f.set({style:'fighter'});const latest=f.pending.at(-1),a=asset(),b=asset();latest.done(null,b);old.done(null,a);assert.equal(f.handle.icon.spriteFrame,b);assert.equal(a.refs,0);assert.equal(b.refs,1);
 f.set({style:'mystic'});const pending=f.pending.at(-1),c=asset();f.handle.destroy();pending.done(null,c);assert.equal(c.refs,0);assert.equal(b.refs,0);assert.equal(f.prefab.refs,0);
});

test('optional artwork load failure preserves the owner and creates no retry storm or asset references',()=>{
 const f=fixture();f.set({});f.pending[0].done(Error('missing prefab'));for(let i=0;i<100;i++)f.set({cooldown:i/100});assert.equal(f.pending.length,1);assert.equal(f.handle.visual,null);assert.equal(f.prefab.refs,0);f.handle.destroy();
});

test('destroyed native artwork cannot receive icon setters during late completion, painting or cleanup',()=>{
 const f=fixture();f.set({});f.loadPrefab();const icon=f.handle.icon,frame=asset();f.pending.at(-1).done(null,frame);assert.equal(frame.refs,1);
 Object.defineProperty(icon,'spriteFrame',{get(){return frame;},set(){if(icon.node.destroyed)throw Error('disposed native sprite');}});
 f.handle.visual.destroy();assert.doesNotThrow(()=>f.set({style:'fighter',cooldown:2}));assert.doesNotThrow(()=>f.handle.destroy());assert.equal(frame.refs,0);assert.equal(f.prefab.refs,0);
 const late=fixture();late.set({});late.loadPrefab();const pending=late.pending.at(-1),deadIcon=late.handle.icon;late.handle.visual.destroy();Object.defineProperty(deadIcon,'spriteFrame',{set(){throw Error('late native setter');}});assert.doesNotThrow(()=>pending.done(null,asset()));assert.doesNotThrow(()=>late.handle.destroy());
});
