'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'../..'),Maps=require('../../packages/game-data-editor/lib/map-assets'),FX=require('../../assets/_script/BuildingDropShadow');
function fixture(){
 const listeners=new Set(),captures=[],textures=[];let captureError=null,nightStrength=.6;
 function color(r=255,g=255,b=255,a=255){return{r,g,b,a,clone(){return color(this.r,this.g,this.b,this.a);}};}
 class Node{
  constructor(name){this.name=name;this.children=[];this.components=[];this.x=this.y=this.angle=this.skewX=0;this.scaleX=this.scaleY=1;this.anchorX=this.anchorY=.5;this.width=this.height=0;this.opacity=255;this.color=color();this.active=true;this.group='world';}
  set parent(p){if(this._parent)this._parent.children=this._parent.children.filter(n=>n!==this);this._parent=p;if(p)p.children.push(this);}get parent(){return this._parent;}
  addComponent(Type){const c=new Type();c.node=this;this.components.push(c);return c;}getComponent(Type){return this.components.find(c=>c instanceof Type)||null;}
  setPosition(x,y){this.x=typeof x==='object'?x.x:x;this.y=typeof x==='object'?x.y:y;}setAnchorPoint(x,y){this.anchorX=x;this.anchorY=y;}setContentSize(w,h){this.width=w;this.height=h;}
  world(){const a=this.angle*Math.PI/180,c=Math.cos(a),s=Math.sin(a),t=Math.tan(this.skewX*Math.PI/180),m=[c*this.scaleX,s*this.scaleX,-s*this.scaleY+c*this.scaleX*t,c*this.scaleY+s*this.scaleX*t,this.x,this.y];return this.parent?Maps.multiply(this.parent.world(),m):m;}
  convertToWorldSpaceAR(p){return Maps.point(this.world(),p);}convertToNodeSpaceAR(p){return Maps.point(Maps.inverse(this.world()),p);}
  destroy(){this.dead=true;this.parent=null;for(const n of [...this.children])n.destroy();}
 }
 class Sprite{constructor(){this.enabled=true;this.type=0;this.trim=true;}set spriteFrame(f){assert(!this.frame||!this.frame.dead,'detach sprites before evicting their frame');this.frame=f;}get spriteFrame(){return this.frame;}}Sprite.SizeMode={CUSTOM:0};
 class Texture{initWithData(data,format,w,h){this.width=w;this.height=h;textures.push(this);}setFilters(){}destroy(){this.dead=true;}}Texture.PixelFormat={RGBA8888:0};Texture.Filter={LINEAR:1};
 class Frame{constructor(texture){this.texture=texture;}destroy(){this.dead=true;}}
 const scene=new Node('Scene'),main=new Node('ndMain'),down=new Node('ndDown'),background=new Node('ndBg'),tile=new Node('Ground');main.parent=down.parent=background.parent=scene;tile.parent=background;
 const light={active:false,opacity:0},cc={Node,Sprite,Texture2D:Texture,SpriteFrame:Frame,isValid:n=>!!n&&!n.dead,v2:(x=0,y=0)=>({x,y}),color,macro:{BlendFactor:{ONE:1}},Director:{EVENT_BEFORE_DRAW:'draw'},director:{getScene:()=>scene,on:(_event,fn)=>listeners.add(fn),off:(_event,fn)=>listeners.delete(fn)}};
 const runtime={};vm.runInNewContext(fs.readFileSync(path.join(root,'assets/_script/BuildingDropShadowRuntime.js'),'utf8'),{exports:runtime,cc,require:name=>{if(name==='BuildingDropShadow')return FX;if(name==='BuildingShadowTransition')return{};throw Error(name);}});
 runtime.capture=(owner,game,renders)=>{if(captureError)throw captureError;const inv=Maps.inverse(game.ndMain.world()),parts=renders.map(r=>({frame:r.spriteFrame,matrix:Maps.multiply(inv,r.node.world()),width:r.node.width,height:r.node.height,anchorX:r.node.anchorX,anchorY:r.node.anchorY,opacity:r.node.opacity,fillRange:r.fillRange}));captures.push(parts);const points=parts.flatMap(p=>[-p.anchorX*p.width,(1-p.anchorX)*p.width].flatMap(x=>[-p.anchorY*p.height,(1-p.anchorY)*p.height].map(y=>Maps.point(p.matrix,{x,y})))),xs=points.map(p=>p.x),ys=points.map(p=>p.y),x=Math.min(...xs),y=Math.min(...ys),w=Math.max(...xs)-x,h=Math.max(...ys)-y;return{alpha:new Uint8Array(32*64).fill(255),pixelWidth:32,pixelHeight:64,x,y,width:w,height:h};};
 const api={},data={GameTools:{buildingShadows:{global:{angle:-74,length:.89,flatten:.82,opacity:.203}}}};vm.runInNewContext(fs.readFileSync(path.join(root,'assets/_script/MapObjectShadowRuntime.js'),'utf8'),{exports:api,cc,setTimeout,require:name=>{if(name==='BuildingDropShadow')return FX;if(name==='BuildingDropShadowRuntime')return runtime;if(name==='KinghtFallDataMgr')return{KinghtFallDataMgr:{getInstance:()=>({data})}};if(name==='KinghtFallUIGame')return{default:{instance:{ctrUI:{ndLight:light}}}};if(name==='KinghtFallConfig')return{KinghtFallParameter:{BattleNightStrength:nightStrength}};throw Error(name);}});
 const sourceFrame=new Frame(new Texture());sourceFrame._uuid='source-tree';
 function owner(id,x=0,y=0,scale=1,angle=0){const node=new Node(id);node.parent=main;node.setPosition(x,y);node.scaleX=node.scaleY=scale;node.angle=angle;const art=new Node('Artwork');art.parent=node;art.setAnchorPoint(.5,0);art.setContentSize(32,64);const sprite=art.addComponent(Sprite);sprite.spriteFrame=sourceFrame;return{node,sources:[art],mapMain:main,shadowParent:down,mapBackground:background,shadowKey:id,groundOnly:false};}
 function draw(){for(const fn of [...listeners])fn();}
 return{api,runtime,owner,Node,Sprite,Frame,Texture,cc,scene,main,down,background,tile,listeners,captures,textures,data,light,draw,setError:error=>{captureError=error;},setNightStrength:value=>{nightStrength=value;}};
}

test('map shadows prepare before a stage, share repeated/scaled scenery and attach without capturing again',async()=>{
 const h=fixture(),a=h.owner('a',-40,30),b=h.owner('b',100,-60,2),beforeA=a.sources[0].getComponent(h.Sprite).spriteFrame,staged=await h.api.prepareStage([a,b],h.data,{current:()=>true});
 assert.equal(staged.count,2);assert.equal(h.captures.length,1);assert.equal(h.api.stats().entries,1);assert.equal(h.listeners.size,0);assert.equal(h.api.stats().owners,0);assert.equal(a.sources[0].getComponent(h.Sprite).spriteFrame,beforeA,'preparation never edits live artwork');assert(!h.scene.children.some(n=>n.name==='MapShadowPreparation'));
 h.api.attach(a,h.data);h.api.attach(b,h.data);h.api.attach(a,h.data);assert.equal(h.captures.length,1);assert.equal(h.api.stats().owners,2);assert.equal(h.api.stats().groups,1);assert.equal(h.listeners.size,1);assert.equal(a._mapObjectShadowState.sprite.spriteFrame,b._mapObjectShadowState.sprite.spriteFrame);assert.equal(b._mapObjectShadowState.node.width,a._mapObjectShadowState.node.width*2);assert(Math.abs(b._mapObjectShadowState.node.x-100-(a._mapObjectShadowState.node.x+40)*2)<1e-8);
 assert.equal(h.runtime.stats().active,1);staged.dispose();staged.dispose();assert.equal(h.runtime.stats().active,1,'active owners retain their shared frame after stage-pin release');h.api.detach(a);assert.equal(h.api.stats().owners,1);h.api.detach(a);h.api.detach(b);assert.equal(h.api.stats().entries,0);assert.equal(h.runtime.stats().active,0);assert.equal(h.listeners.size,0);assert.equal(h.api.stats().groups,0);
});

test('map shadows retain world sun direction for rotated, mirrored, masked or differently filled sources',async()=>{
 const h=fixture(),a=h.owner('a'),b=h.owner('b',20,30,1,40),c=h.owner('c',0,0,-1),d=h.owner('d');d.sources[0].getComponent(h.Sprite).spriteFrame=new h.Frame(new h.Texture());d.sources[0].getComponent(h.Sprite).spriteFrame._uuid='masked-tree';const e=h.owner('e');Object.assign(e.sources[0].getComponent(h.Sprite),{type:3,fillType:0,fillRange:.4,fillStart:0,fillCenter:{x:.5,y:.5}});
 const pins=await h.api.prepareStage([a,b,c,d,e],h.data,{current:()=>true});assert.equal(h.captures.length,5);assert.equal(h.api.stats().entries,5);assert(h.captures.some(parts=>parts[0].fillRange===.4));h.api.attach(b);assert.equal(h.captures.length,5);h.api.detach(b);pins.dispose();assert.equal(h.api.stats().entries,0);
});

test('map shadows follow a multi-root legacy object as one composite and retain affine source geometry',async()=>{
 const h=fixture(),a=h.owner('legacy',30,70,2),other=new h.Node('Other root');other.parent=h.main;other.setPosition(100,80);other.angle=-20;other.scaleX=3;other.scaleY=1;const sprite=other.addComponent(h.Sprite);sprite.spriteFrame=a.sources[0].getComponent(h.Sprite).spriteFrame;other.setContentSize(30,40);other.skewX=13;a.sources.push(other);const before=a.sources.map(n=>n.world());
 const pins=await h.api.prepareStage([a],h.data,{current:()=>true});assert.equal(h.captures.length,1);assert.equal(h.captures[0].length,2);const description=h.api.describe(a);h.captures[0].forEach((p,i)=>p.matrix.forEach((v,k)=>assert(Math.abs(v-description.list[i].matrix[k])<1e-8,'probe keeps affine matrix component '+k)));assert.deepEqual(a.sources.map(n=>n.world()),before);h.api.attach(a);assert.equal(a._mapObjectShadowState.group.node.children.length,1);h.api.detach(a);pins.dispose();
});

test('map shadows use five percent strength at full night and restore lifted ground tint after disable',()=>{
 const h=fixture(),a=h.owner('ground');a.node.parent=h.down;a.groundOnly=true;a.node.color={r:180,g:160,b:140,a:255};h.api.attach(a);const state=a._mapObjectShadowState;assert.equal(state.group.node.opacity,255);h.light.active=true;h.light.opacity=255*.6;h.tile.color={r:196,g:196,b:196};h.draw();assert.equal(state.group.node.opacity,13);assert.equal(a.node.color.r,Math.round(180*196/255));h.api.detach(a);assert.equal(a.node.color.r,180);h.api.attach(a);h.draw();assert.equal(a.node.color.r,Math.round(180*196/255),'reenabling does not multiply the night tint twice');h.light.opacity=255*.3;h.draw();assert.equal(a._mapObjectShadowState.group.node.opacity,134);h.api.detach(a);
});

test('map shadow cancellation and render failures release stage pins and detached visual probes',async()=>{
 const h=fixture(),a=h.owner('a'),b=h.owner('b',0,0,1,15);let current=true;await assert.rejects(h.api.prepareStage([a,b],h.data,{current:()=>current},()=>{current=false;}),/cancelled/);assert.equal(h.api.stats().entries,0);assert.equal(h.runtime.stats().active,0);assert(!h.scene.children.some(n=>n.name==='MapShadowPreparation'));h.setError(Error('GPU lost'));await assert.rejects(h.api.prepareStage([a],h.data,{current:()=>true}),/GPU lost/);assert.equal(h.api.stats().entries,0);assert(!h.scene.children.some(n=>n.name==='MapShadowPreparation'));assert.equal(h.listeners.size,0);
});

test('map shadow preparation ignores invisible renderers without enabling actors or adding listeners',async()=>{
 const h=fixture(),a=h.owner('invisible');a.sources[0].active=false;const prepared=await h.api.prepareStage([a],h.data,{current:()=>true});assert.equal(prepared.count,0);assert.equal(h.captures.length,0);h.api.attach(a);assert(!a._mapObjectShadowState);assert.equal(h.listeners.size,0);assert.equal(a.sources[0].active,false);prepared.dispose();
});

test('the stage readiness pipeline awaits scenery preparation and owns its pins until disposal',async()=>{
 const h=fixture(),a=h.owner('tree'),api={},progress=[];h.data.BuildEnum={};
 vm.runInNewContext(fs.readFileSync(path.join(root,'assets/_script/BuildingShadowPreparation.js'),'utf8'),{exports:api,cc:h.cc,setTimeout,require:name=>{if(name==='BuildingDropShadow')return FX;if(name==='BuildingDropShadowRuntime')return h.runtime;if(name==='BuildingShadowRuntime')return{releaseEntry(){}};if(name==='MapObjectShadowRuntime')return h.api;throw Error(name);}});
 const prefab={data:{getChildByName:()=>({children:[]}),getComponentsInChildren:name=>{assert.equal(name,'MapObjectShadow');return[a];}}},prepared=await api.prepare(prefab,h.data,{}, {current:()=>true,assets:{}},value=>progress.push(value));
 assert.equal(h.captures.length,1);assert.equal(prepared.count,1);assert.equal(h.runtime.stats().active,1);assert.equal(progress.at(-1),1);h.api.attach(a);assert.equal(h.captures.length,1,'the first visible frame already has a prepared texture');h.api.detach(a);assert.equal(h.runtime.stats().active,1,'the stage still owns its preparation');prepared.dispose();assert.equal(h.runtime.stats().active,0);assert.equal(h.api.stats().entries,0);
});
