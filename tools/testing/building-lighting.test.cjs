'use strict';
// Lighting presentation and asset lifetimes only. No engine, game, scene or audio.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'../..'),near=(a,b)=>assert(Math.abs(a-b)<1e-7,a+' != '+b);
function fixture(){
  function color(r,g,b,a=255){if(typeof r==='string'){const hex=r.replace('#','');return{r:parseInt(hex.slice(0,2),16),g:parseInt(hex.slice(2,4),16),b:parseInt(hex.slice(4,6),16),a:255};}return{r,g,b,a};}
  class Node{
    constructor(name=''){Object.assign(this,{name,children:[],components:[],x:0,y:0,angle:0,scaleX:1,scaleY:1,active:true,opacity:255,group:'world',color:color(255,255,255)});}
    set parent(value){if(this._parent)this._parent.children=this._parent.children.filter(n=>n!==this);this._parent=value;if(value)value.children.push(this);}
    get parent(){return this._parent;}
    get activeInHierarchy(){return !this.destroyed&&this.active&&(!this.parent||this.parent.activeInHierarchy);}
    setPosition(x,y){this.x=x;this.y=y;}
    setContentSize(width,height){this.width=width;this.height=height;}
    setAnchorPoint(x,y){this.anchorX=x;this.anchorY=y;}
    setScale(x,y=x){this.scaleX=x;this.scaleY=y;}
    addComponent(Type){const c=new Type();c.node=this;this.components.push(c);return c;}
    convertToWorldSpaceAR(p){const a=this.angle*Math.PI/180,c=Math.cos(a),s=Math.sin(a),v={x:this.x+c*p.x*this.scaleX-s*p.y*this.scaleY,y:this.y+s*p.x*this.scaleX+c*p.y*this.scaleY};return this.parent?this.parent.convertToWorldSpaceAR(v):v;}
    destroy(){this.destroyed=true;this.children.forEach(c=>c.destroy());}
  }
  class Sprite{}Sprite.SizeMode={CUSTOM:0};Sprite.Type={MESH:4};
  class Graphics{constructor(){this.commands=[];}moveTo(x,y){this.commands.push(['move',x,y]);}lineTo(x,y){this.commands.push(['line',x,y]);}close(){this.commands.push(['close']);}fill(){this.commands.push(['fill']);}}
  const textures=[];class Texture{constructor(){this.width=this.height=70;}initWithData(pixels,_format,w,h){this.pixels=pixels;this.width=w;this.height=h;textures.push(this);}setFilters(){}getHtmlElementObj(){return this;}destroy(){this.destroyed=true;}}Texture.PixelFormat={RGBA8888:1};Texture.Filter={LINEAR:1};
  const cc={Node,Sprite,Graphics,Texture2D:Texture,SpriteFrame:function(t){return frame('mask',t);},color,Color:{WHITE:color(255,255,255)},isValid:value=>!!value&&!value.destroyed};
  const maskRuntime={},document={createElement(){let image;return{width:0,height:0,getContext(){return{drawImage(i){image=i;},getImageData(){return{data:image.pixels};}};}};}};
  vm.runInNewContext(fs.readFileSync(path.join(root,'assets/_script/WindowLightMaskRuntime.js'),'utf8'),{cc,document,exports:maskRuntime,require:name=>require('../../assets/_script/'+name)});
  const exports={};vm.runInNewContext(fs.readFileSync(path.join(root,'assets/_script/BuildingLighting.js'),'utf8'),{cc,exports,require:name=>{if(name==='BuildingNightlight')return require('../../assets/_script/BuildingNightlight');if(name==='WindowLightWarp')return require('../../assets/_script/WindowLightWarp');if(name==='WindowLightMaskRuntime')return maskRuntime;throw Error(name);}},{filename:'BuildingLighting.js'});
  const node=new Node('Building'),presentation=new Node('Placement'),base=new Node('Base');presentation.parent=node;base.parent=presentation;base.setPosition(0,-38);base.width=187;base.height=230;
  const lighting=[{points:[{x:-6,y:20},{x:4,y:18},{x:4,y:34},{x:-6,y:36}],glow:true,authorField:'preserve'},
    {points:[{x:15,y:42},{x:22,y:45},{x:22,y:58},{x:15,y:55}],color:'#FFF2B1',opacity:210,glow:{x:18.5,y:50,width:32,height:42,pulse:.2}}];
  const state={node,manual:true},requests=[],owner={node,enabled:true,isDestroyed:false,buildInfo:{cfg:{Appearance:{lighting,unknown:'preserve'}}},_buildingAppearance:state,
    loadSpriteFrame(bundle,file,done){requests.push({bundle,file,done});}};
  owner._buildingManualLights=state;owner._buildingAppearance={node:base};owner.buildInfo.cfg.Nightlight={version:1,emitters:[{id:'light:1'},{id:'light:2'}],lights:{'light:1':{x:-16,y:31},'light:2':{x:17,y:50,scaleX:1.4,scaleY:.6,flipX:true}},future:'keep'};
  function frame(name='glow',texture){if(!texture){texture=new Texture();texture.pixels=new Uint8Array(70*70*4);for(let i=0;i<texture.pixels.length;i+=4)texture.pixels.set([255,239,17,200],i);}return{name,refs:1,adds:0,releases:0,uv:[0,1,1,1,0,0,1,0],getTexture(){return texture;},clone(){return frame(name+'@clone',texture);},destroy(){this.destroyed=true;},addRef(){this.refs++;this.adds++;},decRef(){this.refs--;this.releases++;}};}
  function resolve(index=0,value=frame()){requests[index].done(value);return value;}
  return{api:exports,owner,state,node,base,presentation,lighting,requests,resolve,frame,cc,Node,Graphics,maskRuntime,textures};
}
function record(h){return h.state._buildingLighting;}
function step(h,dt){h.api.update(h.owner,h.state,dt);}
test('stage-prepared erased lights reuse their texture, carry edge nodes, and release consumers before their mask',()=>{
 const h=fixture(),W=require('../../assets/_script/WindowLightWarp'),source=h.frame(),pixels=source.getTexture().pixels.slice(),v=h.owner.buildInfo.cfg.Nightlight.lights['light:1'];v.erase={version:1,strokes:[{op:'erase',radius:8,opacity:.5,softness:.8,points:[{x:.5,y:-.5}]}]};v.warpNodes=W.addNode(undefined,[],0,.5);v.warpNodes[0].y+=1;
 const before=JSON.stringify(h.owner.buildInfo.cfg),stage=h.maskRuntime.prime({BuildEnum:{2:{levelList:[h.owner.buildInfo.cfg]}}},['2'],{'resources/buildings/lighting/native-window-ray:frame':source});assert.equal(h.textures.length,1,'mask baking happens during stage admission');h.api.apply(h.owner,h.state);h.resolve(0,source);const r=record(h),entry=r.maskEntries[0],sprite=r.entries[0].sprite,mesh=sprite.spriteFrame;assert.equal(entry.refs,2);assert.equal(h.textures.length,1,'placing the building creates no new mask');assert.equal(mesh.getTexture(),entry.texture);assert.equal(mesh.vertices.x.length,294);assert.equal(r.entries[1].sprite.spriteFrame,source);assert.equal(entry.texture.pixels[(35*70+35)*4+3],100);assert.deepEqual(source.getTexture().pixels,pixels);for(let i=0;i<pixels.length;i+=4)assert.deepEqual(entry.texture.pixels.slice(i,i+3),pixels.slice(i,i+3));assert.equal(JSON.stringify(h.owner.buildInfo.cfg),before);
 h.api.disposeOwner(h.owner);assert.equal(sprite.spriteFrame,null);assert(mesh.destroyed);assert.equal(entry.refs,1);stage.dispose();assert.equal(entry.refs,0);assert.equal(source.refs,1);const again=h.maskRuntime.acquire(source,v.erase);assert.equal(again,entry);assert.equal(h.textures.length,1);h.maskRuntime.release(again);
});

test('distorted lights share the exact source texture and own only their disposable mesh frame',()=>{
 const h=fixture(),W=require('../../assets/_script/WindowLightWarp'),warp=W.controls();warp[1].x+=5;warp[1].y-=2;h.owner.buildInfo.cfg.Nightlight.lights['light:1'].warp=warp;const before=JSON.stringify(h.owner.buildInfo.cfg);h.api.apply(h.owner,h.state);const source=h.resolve(),r=record(h),light=r.entries[0].sprite,plain=r.entries[1].sprite,mesh=light.spriteFrame;
 assert.equal(light.type,h.cc.Sprite.Type.MESH);assert.notEqual(mesh,source);assert.equal(source.vertices,undefined);assert.equal(mesh.vertices.x.length,289);assert.equal(plain.spriteFrame,source);assert.equal(source.refs,2);assert.equal(r.meshFrames.length,1);assert.equal(JSON.stringify(h.owner.buildInfo.cfg),before);step(h,.1);step(h,.1);assert.equal(light.spriteFrame,mesh);assert.equal(h.requests.length,1,'refreshes never reload a deformed image');
 delete h.owner.buildInfo.cfg.Nightlight.lights['light:1'].warp;h.api.apply(h.owner,h.state);assert(mesh.destroyed);assert.equal(light.spriteFrame,null);assert.equal(source.refs,1);h.resolve(1,source);assert.equal(record(h).entries[0].sprite.spriteFrame,source);assert.equal(record(h).meshFrames.length,0);
});

test('all automatic masks and fan meshes stay off until the user adds a manual sprite',()=>{
 const h=fixture();delete h.owner.buildInfo.cfg.Nightlight;const before=JSON.stringify(h.owner.buildInfo.cfg);h.api.syncOwner(h.owner);h.api.apply(h.owner,h.owner._buildingAppearance);assert.equal(h.owner._buildingManualLights,undefined);assert.equal(h.requests.length,0);assert.equal(h.api.config(h.owner).length,0);assert.equal(JSON.stringify(h.owner.buildInfo.cfg),before);
});
test('every emitter is one unmodified square sprite using the exact shared window-light texture',()=>{
 const h=fixture(),before=JSON.stringify(h.owner.buildInfo.cfg);h.api.apply(h.owner,h.state);const r=record(h);assert.equal(r.entries.length,2);assert.equal(h.requests.length,1);assert.equal(h.requests[0].file,'buildings/lighting/native-window-ray');const shared=h.resolve();assert.equal(shared.adds,1);
 for(const e of r.entries){assert.equal(e.glows.length,1);const g=e.glows[0];assert.equal(g.node.width,70);assert.equal(g.node.height,70);assert.equal(g.node.anchorX,.5);assert.equal(g.node.anchorY,.5);assert.equal(g.node.skewX,0);assert.equal(g.node.skewY,0);assert.deepEqual(g.node.color,h.cc.color('#FFFFFF'));assert.equal(g.sprite.spriteFrame,shared);assert.equal(g.sprite.trim,false);assert.equal(g.node.components.length,1);}
 assert.deepEqual([r.entries[0].glow.x,r.entries[0].glow.y,r.entries[0].glow.scaleX,r.entries[0].glow.scaleY],[-16,31,1,1]);assert.deepEqual([r.entries[1].glow.x,r.entries[1].glow.y,r.entries[1].glow.scaleX,r.entries[1].glow.scaleY],[17,50,-1.4,.6]);assert.equal(JSON.stringify(h.owner.buildInfo.cfg),before);
});
test('night fades in and day hides immediately while the original sprite pixels keep their intensity',()=>{
 const h=fixture();h.api.apply(h.owner,h.state);h.resolve();const r=record(h);assert(!r.node.active);h.api.setNight(h.owner,true);step(h,.25);near(r.blend,.5);step(h,.25);assert.equal(r.node.opacity,255);const glow=r.entries[0].glow;assert.equal(glow.opacity,255);step(h,1.2);assert.equal(glow.opacity,255);h.api.setNight(h.owner,false);assert.equal(r.node.opacity,0);assert(!r.node.active);
});
test('custom lights also render on Spine buildings with no layered Appearance object',()=>{
 const h=fixture();delete h.owner.buildInfo.cfg.Appearance;delete h.owner._buildingAppearance;h.api.setNight(h.owner,true);const f=h.resolve();h.api.updateOwner(h.owner,.5);const r=record(h);assert.equal(r.parent,h.owner.node);assert(r.node.active);assert.equal(r.entries.length,2);assert.equal(r.entries[0].sprite.spriteFrame,f);
});
test('deleting the final light disposes its overlay and detaches all consumers before releasing the frame',()=>{
 const h=fixture();h.api.syncOwner(h.owner);const f=h.resolve(),r=record(h),sprites=Object.values(r.resources).flatMap(r=>r.sprites),release=f.decRef;f.decRef=function(){assert(sprites.every(s=>s.spriteFrame===null));return release.call(this);};h.owner.buildInfo.cfg.Nightlight.emitters=[];h.api.syncOwner(h.owner);assert.equal(h.owner._buildingManualLights,undefined);assert(r.node.destroyed);assert.equal(f.releases,1);
});
test('changing a layout invalidates pending loads and keeps the new emitter list independent',()=>{
 const h=fixture();h.api.syncOwner(h.owner);const previous=record(h);h.owner.buildInfo.cfg.Nightlight.emitters.shift();h.api.syncOwner(h.owner);const next=record(h);assert.notEqual(next,previous);assert.equal(next.entries.length,1);const stale=h.frame();h.requests[0].done(stale);assert.equal(stale.adds,0);h.resolve(1);assert(next.entries[0].sprite.spriteFrame);assert(!previous.node.active);
});
for(const transition of ['hide','death','dispose','disable','scene'])test('late light loads cannot revive an overlay after '+transition,()=>{
 const h=fixture();h.api.syncOwner(h.owner);const r=record(h);if(transition==='hide')h.api.hideOwner(h.owner);if(transition==='death')h.owner.isDestroyed=true;if(transition==='dispose')h.api.disposeOwner(h.owner);if(transition==='disable')h.owner.enabled=false;if(transition==='scene')h.owner.node.active=false;const f=h.resolve();assert.equal(f.adds,0);assert(!r.node.active);
});
test('repeated refreshes keep the same frame and pose; hide and repair retry invalidated loads safely',()=>{
 const h=fixture();h.api.setNight(h.owner,true);h.api.updateOwner(h.owner,.2);const r=record(h);h.api.hideOwner(h.owner);h.api.syncOwner(h.owner);assert.equal(record(h),r);assert.equal(h.requests.length,2);const stale=h.frame();h.requests[0].done(stale);assert.equal(stale.adds,0);const f=h.resolve(1);h.api.updateOwner(h.owner,.5);const pose=[r.entries[0].glow.x,r.entries[0].glow.y];h.api.syncOwner(h.owner);assert.equal(record(h),r);assert.equal(h.requests.length,2);assert.equal(f.adds,1);assert.deepEqual([r.entries[0].glow.x,r.entries[0].glow.y],pose);
});
test('night tint affects the building body without tinting the manually added light image',()=>{
 const h=fixture(),appearance=h.owner._buildingAppearance;h.owner.buildInfo.cfg.Appearance.nightTint='#A7A7A7';h.api.setNight(h.owner,true);h.resolve();h.api.update(h.owner,appearance,.5);h.api.updateOwner(h.owner,.5);assert.deepEqual(h.base.color,h.cc.color(167,167,167));assert.deepEqual(record(h).entries[0].glow.color,h.cc.color('#FFFFFF'));assert.equal(record(h).tint,null);h.api.setNight(h.owner,false);assert.deepEqual(h.base.color,h.cc.color(255,255,255));
});
test('hidden building artwork cannot show or reload floating manual lights before it is visible again',()=>{
 const h=fixture();h.api.setNight(h.owner,true);const r=record(h);h.api.hideOwner(h.owner);h.owner.ndAniMain={node:{active:false}};h.api.updateOwner(h.owner,.5);assert(!r.node.active);assert.equal(h.requests.length,1);const stale=h.resolve();assert.equal(stale.adds,0);h.owner.ndAniMain.node.active=true;h.api.updateOwner(h.owner,.5);assert.equal(h.requests.length,2);h.resolve(1);assert(r.node.active);
});
