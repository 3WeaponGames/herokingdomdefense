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
function fixture(){
 class Node{constructor(name){this.name=name;this.children=[];this.components=[];this.active=true;this.width=this.height=0;this.scale=1;}setParent(p){this.parent=p;p.children.push(this);}setPosition(x,y){this.x=x;this.y=y;}setContentSize(w,h){this.width=w;this.height=h;}getChildByName(name){return this.children.find(n=>n.name===name);}getComponent(type){return this.components.find(c=>c instanceof type);}setSiblingIndex(index){const a=this.parent.children;a.splice(a.indexOf(this),1);a.splice(index,0,this);}destroy(){this.destroyed=true;this.children.forEach(n=>n.destroy());}}
 class Sprite{};Sprite.SizeMode={CUSTOM:0};Sprite.Type={FILLED:3};Sprite.FillType={RADIAL:2};
 const pending=[],cc={Sprite,Prefab:class{},color:v=>v,v2:(x,y)=>({x,y}),isValid:n=>!!n&&!n.destroyed,resources:{load(resource,type,done){pending.push({resource,type,done});}},instantiate(){const nodes=new Map();function make(index){if(nodes.has(index))return nodes.get(index);const saved=document[index],n=new Node(saved._name);nodes.set(index,n);n.active=saved._active!==false;n.width=saved._contentSize.width;n.height=saved._contentSize.height;n.x=saved._trs.array[0];n.y=saved._trs.array[1];for(const component of saved._components||[]){const row=document[component.__id__];if(row.__type__==='cc.Sprite'){const s=new Sprite();s.node=n;s.fillRange=row._fillRange;n.components.push(s);}}for(const child of saved._children||[])make(child.__id__).setParent(n);return n;}return make(1);}};
 const button=new Node('button'),caption=new Node('caption');caption.setParent(button);let current=true;const handle=Art.create(button,()=>current,cc),prefab=asset();
 const loadPrefab=()=>pending[0].done(null,prefab),set=state=>handle.set({style:'skirmisher',usable:true,aiming:false,cooldown:0,totalCooldown:12,...state});
 return{cc,button,caption,pending,handle,prefab,loadPrefab,set,retire(){current=false;}};
}

test('GUI PRO prefab uses the native frame, face offset and clockwise top cooldown without stretching',()=>{
 const nodes=document.filter(r=>r.__type__==='cc.Node'),find=name=>nodes.find(n=>n._name===name);
 for(const [name,key,w,h]of [['Frame','frame',222,238],['Frame armed','frame-armed',222,238],['Frame disabled','frame-disabled',222,239],['InBase','base',200,200],['Cooltime','cooldown',200,200]]){const image=fs.readFileSync(path.join(base,key+'.png')),meta=JSON.parse(fs.readFileSync(path.join(base,key+'.png.meta'),'utf8')),n=find(name),sprite=document[n._components[0].__id__];assert.equal(image.readUInt32BE(16),w);assert.equal(image.readUInt32BE(20),h);assert.equal(n._contentSize.width,w);assert.equal(n._contentSize.height,h);assert.equal(meta.width,w);assert.equal(meta.height,h);assert.equal(sprite._spriteFrame.__uuid__,Object.values(meta.subMetas)[0].uuid);assert.equal(sprite._sizeMode,0);assert.equal(Object.values(meta.subMetas)[0].trimType,'none');}
 for(const name of ['InBase','Artwork','Cooltime'])near(find(name)._trs.array[1],7.2);
 assert.deepEqual(find('InBase')._color,{__type__:'cc.Color',r:41,g:49,b:79,a:255});
 const cool=find('Cooltime'),fill=document[cool._components[0].__id__];assert.equal(cool._opacity,255);assert.equal(fill._type,3);assert.equal(fill._fillType,2);assert.equal(fill._fillStart,.25);assert.equal(fill._fillRange,-1);near(222*Art.frameScale,116);near(200*Art.frameScale,104.50450450450451);
});

test('skill scenes fill the face without stretching and frames reflect readiness and aim',()=>{
 const f=fixture();f.set({});f.loadPrefab();assert.equal(f.button.children[0],f.handle.visual,'art remains behind captions and cooldown text');near(f.handle.visual.scale,116/222);assert.equal(f.handle.visual.y,28);
 const icons=[];for(const style of ['skirmisher','fighter','vanguard','mystic','bruiser','guardian']){f.set({style});const request=f.pending.at(-1);assert.equal(request.resource,'skills/icons/'+style);const icon=asset({width:128,height:128});icons.push(icon);request.done(null,icon);assert.equal(f.handle.icon.spriteFrame,icon);assert.equal(f.handle.icon.trim,true);near(f.handle.icon.node.width*f.handle.visual.scale,200*Art.frameScale);near(f.handle.icon.node.height*f.handle.visual.scale,200*Art.frameScale);}
 assert(icons.slice(0,-1).every(a=>a.refs===0));assert.equal(icons.at(-1).refs,1);
 f.set({style:'guardian',aiming:true});assert.equal(f.handle.visual.getChildByName('Frame armed').active,true);assert.equal(f.handle.visual.getChildByName('Frame').active,false);
 f.set({style:'guardian',usable:false,cooldown:3,totalCooldown:12});assert.equal(f.handle.visual.getChildByName('Frame disabled').active,true);assert.equal(f.handle.visual.getChildByName('Cooltime').active,true);near(f.handle.cooldown.fillRange,-.25);assert.equal(f.handle.cooldown.fillStart,.25);assert.equal(f.handle.cooldown.fillType,2);
 const count=f.pending.length;f.set({style:'guardian',usable:false,cooldown:2.5,totalCooldown:12});near(f.handle.cooldown.fillRange,-2.5/12);assert.equal(f.pending.length,count);f.handle.destroy();assert.equal(icons.at(-1).refs,0);assert.equal(f.prefab.refs,0);
});

test('legacy rectangular artwork keeps its proportions within the circular face',()=>{
 const f=fixture();f.set({});f.loadPrefab();f.pending.at(-1).done(null,asset({width:120,height:240}));near(f.handle.icon.node.width*f.handle.visual.scale,100*Art.frameScale);near(f.handle.icon.node.height*f.handle.visual.scale,200*Art.frameScale);f.handle.destroy();
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
