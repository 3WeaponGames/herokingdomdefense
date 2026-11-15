'use strict';
// Native atlas ownership/cache contracts. Does not start a game or GPU process.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const filename=process.env.HKD_NATIVE_SURFACE_ATLAS_SOURCE||path.resolve(__dirname,'../../assets/_script/NativeSurfaceAtlas.js');
const source=fs.readFileSync(filename,'utf8'),LINEAR=9729,NEAREST=9728,MIB=1024*1024;
function fixture(options={}){
  const textures=[],frames=[],nodes=[],sprites=[],events=[],draws=[];let scene,failInit=0,failRender=0,onRender=null,peakBytes=0,creatingSource=false;
  function alive(value){return !!value&&!value.dead;}
  function liveBytes(){return textures.filter(t=>!t.source&&!t.dead).reduce((n,t)=>n+(t.width||0)*(t.height||0)*4,0);}
  class Node{
    constructor(name){this.name=name;this.children=[];this._components=[];this.active=true;this.color={r:255,g:255,b:255};this.opacity=255;this.x=this.y=0;this._renderFlag=0;nodes.push(this);}
    set parent(parent){if(this._parent){const list=this._parent.children;list.splice(list.indexOf(this),1);}this._parent=parent;if(parent)parent.children.push(this);}
    get parent(){return this._parent;}
    get activeInHierarchy(){return this.active&&(!this.parent||this.parent.activeInHierarchy);}
    setPosition(x,y){this.x=x;this.y=y;}
    setContentSize(width,height){this.width=width;this.height=height;}
    addComponent(Type){const comp=new Type();comp.node=this;this._components.push(comp);return comp;}
    destroy(){assert(!this.dead,'Node is released once');this.dead=true;this.active=false;this.children.slice().forEach(n=>n.destroy());this._components.forEach(c=>c.dead=true);this.parent=null;}
  }
  class Texture{
    constructor(){this.source=creatingSource;this._minFilter=LINEAR;this._magFilter=LINEAR;this.filterCalls=[];textures.push(this);}
    initWithSize(width,height){this.width=width;this.height=height;peakBytes=Math.max(peakBytes,liveBytes());events.push(['allocate',this]);if(!this.source&&failInit){failInit--;throw Error('controlled target initialization failure');}}
    setFilters(min,mag){this.filterCalls.push([min,mag]);events.push(['filter',this,min,mag]);if(this.failFilters&&this.failFilters(min,mag))throw Error('controlled source filter failure');this._minFilter=min;this._magFilter=mag;}
    destroy(){
      assert(!this.dead,'Target is released once');assert(frames.every(f=>f.texture!==this||f.dead),'Every output crop is destroyed before its target');
      assert(sprites.every(s=>!s.spriteFrame||s.spriteFrame.getTexture()!==this),'Every copy Sprite detaches its frame before target release');
      assert(sprites.every(s=>s._materials.every(m=>m.texture!==this)),'Component-owned material samplers detach before target release');
      assert(nodes.every(n=>n._components.every(c=>!(c instanceof Camera)||c.targetTexture!==this)),'Every camera detaches its target before target release');
      this.dead=true;events.push(['destroyTexture',this]);
    }
  }
  class Frame{
    constructor(texture,rect,rotated=false,offset={x:0,y:0},originalSize={width:texture.width,height:texture.height}){this.texture=texture;this.rect=rect||{x:0,y:0,width:texture.width,height:texture.height};this.rotated=rotated;this.offset=offset;this.originalSize=originalSize;this.flipY=false;this.uv=[0,0,1,0,0,1,1,1];this.consumers=new Set();frames.push(this);}
    getTexture(){return this.texture;}getRect(){return this.rect;}isRotated(){return this.rotated;}setFlipY(value){this.flipY=value;}
    destroy(){assert(!this.dead,'Crop frame is released once');assert([...this.consumers].every(c=>c.spriteFrame!==this),'External consumers detach before crop retirement');this.dead=true;events.push(['destroyFrame',this]);}
  }
  class Sprite{
    constructor(){this._materials=[{_owner:this,texture:null,setProperty(name,value){this[name]=value;events.push(['sampler',this,name,value]);}}];sprites.push(this);}
    get spriteFrame(){return this._frame;}
    set spriteFrame(value){this._frame=value;if(value)this._materials[0].texture=value.getTexture();}
  }
  Sprite.SizeMode={CUSTOM:1};
  class Camera{
    render(root){
      assert(root.activeInHierarchy);assert(this.targetTexture);assert(this.enabled===false);
      const used=sprites.filter(s=>s.node.parent===root&&s.node.activeInHierarchy);
      for(const sprite of used){assert.equal(sprite.spriteFrame.getTexture()._minFilter,NEAREST);assert.equal(sprite.spriteFrame.getTexture()._magFilter,NEAREST);assert.equal(sprite.srcBlendFactor,1);assert.equal(sprite.dstBlendFactor,0);assert.equal(sprite.node.opacity,255);assert.deepEqual(sprite.node.color,{r:255,g:255,b:255});}
      draws.push({root,target:this.targetTexture,ortho:this.orthoSize,x:this.node.x,y:this.node.y,tiles:used.map(s=>({frame:s.spriteFrame,x:s.node.x,y:s.node.y,width:s.node.width,height:s.node.height}))});
      events.push(['render',this.targetTexture]);if(onRender)onRender(this,root);if(failRender){failRender--;throw Error('controlled camera failure');}
    }
  }
  Camera.ClearFlags={COLOR:1,DEPTH:2,STENCIL:4};scene=new Node('scene');
  const cc={sys:{isNative:options.native!==false},ENGINE_VERSION:options.version||'2.4.13',Node,Camera,Sprite,SpriteFrame:Frame,RenderTexture:Texture,Texture2D:{Filter:{LINEAR,NEAREST}},macro:{BlendFactor:{ONE:1,ZERO:0}},RenderFlow:{FLAG_WORLD_TRANSFORM:8,FLAG_OPACITY:32},director:{getScene:()=>scene},gfx:{RB_FMT_S8:1},isValid:v=>alive(v)&&!v.pendingDestroy,color:(r,g,b,a)=>a===undefined?{r,g,b}:{r,g,b,a},rect:(x,y,width,height)=>({x,y,width,height}),v2:(x,y)=>({x,y}),size:(width,height)=>({width,height})};
  const api={};vm.runInNewContext(source,{cc,exports:api},{filename});
  const atlas=api.create({scene,maxBytesPerGeneration:options.maxBytes,maxPages:options.maxPages});
  function record(width=32,height=40,signature=[1]){creatingSource=true;const texture=new Texture();texture.initWithSize(width,height);creatingSource=false;const frame=new Frame(texture);frame.setFlipY(true);return{frame,texture,signature,center:{x:13,y:27},size:{width:width/4,height:height/4},consumers:new Set()};}
  function bind(frame){const consumer={spriteFrame:frame};frame.consumers.add(consumer);return consumer;}
  function detach(consumer){consumer.spriteFrame=null;}
  function sourceState(records){return records.map(r=>({frame:r.frame,texture:r.texture,signature:r.signature,signatureValues:Array.isArray(r.signature)?r.signature.slice():r.signature,center:r.center,size:r.size,consumers:r.consumers,min:r.texture._minFilter,mag:r.texture._magFilter}));}
  return{cc,api,atlas,record,bind,detach,sourceState,textures,frames,nodes,sprites,draws,events,Texture,Frame,Node,get scene(){return scene;},changeScene(){scene=new Node('replacementScene');},failInit(){failInit++;},failRender(){failRender++;},onRender(fn){onRender=fn;},liveBytes,peakBytes:()=>peakBytes};
}
function finish(f){f.atlas.dispose();assert(f.textures.filter(t=>!t.source).every(t=>t.dead));assert(f.sprites.every(s=>s.spriteFrame===null&&s._materials.every(m=>m.texture===null)));}
function filters(records){return records.map(r=>[r.texture._minFilter,r.texture._magFilter]);}
function version(records,value){records.forEach(r=>r.signature=[value]);}

test('unsupported native host/version returns no atlas or engine writes',()=>{
  for(const options of [{native:false},{version:'2.4.12'}]){const f=fixture(options);assert.equal(f.atlas,null);assert.equal(f.nodes.length,1);assert.equal(f.textures.length,0);}
});

test('exact-resolution crops use bounded NPOT pages, full crop metadata, and 1:1 copy projection',()=>{
  const f=fixture(),records=[f.record(236,464,[1]),f.record(288,260,[2]),f.record(320,420,[3])],before=f.sourceState(records),result=f.atlas.prepare(records);
  assert(result&&result.changed);assert.equal(result.frames.size,3);assert.equal(result.pages.length,1);assert(result.pages[0].width!==2048||result.pages[0].height!==2048);
  for(const page of result.pages){assert(page.width<=2048&&page.height<=2048);assert.equal(page.texture.width,page.width);assert.equal(page.texture.height,page.height);for(const tile of page.tiles){const frame=result.frames.get(tile.record);assert.equal(tile.width,tile.record.frame.getRect().width);assert.equal(tile.height,tile.record.frame.getRect().height);assert.deepEqual({...frame.originalSize},{width:tile.width,height:tile.height});assert.deepEqual({...frame.offset},{x:0,y:0});assert.equal(frame.flipY,true);assert.equal(frame.rotated,false);assert.equal(frame.getTexture(),page.texture);assert(tile.x>=2&&tile.y>=2&&tile.x+tile.width+2<=page.width&&tile.y+tile.height+2<=page.height);}}
  for(const draw of f.draws){assert.equal(draw.ortho,draw.target.height/2);assert.equal(draw.x,100000+draw.target.width/2);assert.equal(draw.y,100000+draw.target.height/2);assert.equal(draw.root.x,100000);assert.equal(draw.root.y,100000);}
  assert.deepEqual(f.sourceState(records),before);assert.equal(f.scene._renderFlag,40);finish(f);
});

test('unchanged content, order changes and duplicate records reuse frames with no GPU/filter writes',()=>{
  const f=fixture(),records=[f.record(32,48,[1]),f.record(36,24,[2])],first=f.atlas.prepare(records),count=f.draws.length,calls=records.map(r=>r.texture.filterCalls.length),frameCount=f.frames.length;
  for(let i=0;i<120;i++){const next=f.atlas.prepare(i%2?[records[1],records[0],records[0]]:records);assert(next&&!next.changed);assert.equal(next.frames,first.frames);}
  assert.equal(f.draws.length,count);assert.equal(f.frames.length,frameCount);assert.deepEqual(records.map(r=>r.texture.filterCalls.length),calls);assert.equal(f.atlas.stats().cacheHits,120);finish(f);
});

test('flat signature snapshots, UV mutation and replacement frame identity each invalidate cached pixels',()=>{
  const f=fixture(),records=[f.record(40,40,[1])];let result=f.atlas.prepare(records);records[0].signature[0]=2;result=f.atlas.prepare(records);assert(result.changed);result.releasePrevious();
  records[0].frame.uv[0]=.1;result=f.atlas.prepare(records);assert(result.changed);result.releasePrevious();
  records[0].frame=new f.Frame(records[0].texture);result=f.atlas.prepare(records);assert(result.changed);result.releasePrevious();assert.equal(f.draws.length,4);finish(f);
});

test('missing signature intentionally copies again instead of assuming an unchanged render texture',()=>{
  const f=fixture(),records=[f.record()];delete records[0].signature;f.atlas.prepare(records);const next=f.atlas.prepare(records);assert(next.changed);assert.equal(f.draws.length,2);next.releasePrevious();finish(f);
});

test('current atlas crop aliases keep canonical stamps and perform no copy',()=>{
  const f=fixture(),record=f.record(),result=f.atlas.prepare([record]);record.frame=result.frames.get(record);record.texture=record.frame.getTexture();const next=f.atlas.prepare([record]);assert(!next.changed);assert.equal(next.frames,result.frames);assert.equal(f.draws.length,1);finish(f);
});

test('source minification/magnification filters restore exactly and duplicate textures update once',()=>{
  const f=fixture(),a=f.record(),b={...a,signature:[2]};a.texture._minFilter=NEAREST;a.texture._magFilter=LINEAR;const result=f.atlas.prepare([a,b]);assert(result);assert.deepEqual(filters([a,b]),[[NEAREST,LINEAR],[NEAREST,LINEAR]]);assert.deepEqual(a.texture.filterCalls,[[NEAREST,NEAREST],[NEAREST,LINEAR]]);finish(f);
});

test('unknown sampler ABI, unsupported crop shape and stale sources fall back before any renderer mutation',()=>{
  for(const mutate of [r=>r.texture.setFilters=null,r=>r.texture._minFilter=123,r=>r.frame.rotated=true,r=>r.frame.rect.width=2045,r=>r.frame.rect.width=1.5,r=>r.frame.uv[0]=NaN,r=>r.frame.dead=true,r=>r.texture=new Object()]){
    const f=fixture(),record=f.record();mutate(record);assert.equal(f.atlas.prepare([record]),null);assert.equal(f.draws.length,0);assert.equal(f.nodes.length,1);assert.equal(f.textures.filter(t=>!t.source).length,0);finish(f);
  }
});

test('budget and page caps fall back without downscaling or allocating rejected targets',()=>{
  for(const options of [{maxBytes:4},{maxPages:1}]){const f=fixture(options),records=options.maxPages?[f.record(2044,2044,[1]),f.record(2044,2044,[2])]:[f.record(32,32)];assert.equal(f.atlas.prepare(records),null);assert.match(f.atlas.lastError,/budget/);assert.equal(f.textures.filter(t=>!t.source).length,0);assert.equal(f.draws.length,0);finish(f);}
  const f=fixture(),records=[1,2,3].map(n=>f.record(2044,2044,[n]));assert.equal(f.atlas.prepare(records),null);assert.match(f.atlas.lastError,/budget/);assert.equal(f.liveBytes(),0);finish(f);
});

test('both ping-pong generations and one transient replacement page stay within the explicit default memory bound',()=>{
  const f=fixture(),records=[f.record(2044,2044,[1]),f.record(2044,2044,[2])];let result=f.atlas.prepare(records);assert(result);version(records,2);result=f.atlas.prepare(records);result.releasePrevious();assert.equal(f.atlas.stats().bytes,64*MIB);
  records.forEach(r=>{r.frame.rect.width=2000;r.signature=[3];});result=f.atlas.prepare(records);assert(result);result.releasePrevious();assert(f.atlas.stats().bytes<=64*MIB);assert(f.peakBytes()<=80*MIB);finish(f);
});

test('previous frames remain leased until every consumer detaches; a third update waits for retirement',()=>{
  const f=fixture(),records=[f.record()],first=f.atlas.prepare(records),old=first.frames.get(records[0]),consumer=f.bind(old);version(records,2);const second=f.atlas.prepare(records);assert(second);assert(!old.dead);version(records,3);assert.equal(f.atlas.prepare(records),null);assert.match(f.atlas.lastError,/still leased/);assert.equal(f.draws.length,2);
  f.detach(consumer);second.releasePrevious();assert(old.dead);const third=f.atlas.prepare(records);assert(third);third.releasePrevious();finish(f);
});

test('stale release callbacks never retire a newer generation that reused the same buffer',()=>{
  const f=fixture(),records=[f.record()];f.atlas.prepare(records);version(records,2);const second=f.atlas.prepare(records);second.releasePrevious();version(records,3);const third=f.atlas.prepare(records),frame=third.frames.get(records[0]);second.releasePrevious();assert(!frame.dead);assert.equal(third.frames.get(records[0]),frame);third.releasePrevious();finish(f);
});

test('a source texture also present in the spare target generation rejects GPU feedback before rendering',()=>{
  const f=fixture(),record=f.record(),first=f.atlas.prepare([record]),spare=first.frames.get(record).getTexture();record.signature=[2];const second=f.atlas.prepare([record]);second.releasePrevious();
  const borrowed=new f.Frame(spare,{x:0,y:0,width:record.frame.rect.width,height:record.frame.rect.height});record.frame=borrowed;record.texture=spare;record.signature=[3];const count=f.draws.length,calls=spare.filterCalls.length;assert.equal(f.atlas.prepare([record]),null);assert.match(f.atlas.lastError,/feedback/);assert.equal(f.draws.length,count);assert.equal(spare.filterCalls.length,calls);borrowed.destroy();finish(f);
});

for(const failure of ['initialization','camera'])test(failure+' exceptions restore source filters, detach copy samplers and preserve the current leased generation',()=>{
  const f=fixture(),records=[f.record(),f.record(48,24,[2])],first=f.atlas.prepare(records),oldFrames=[...first.frames.values()];version(records,3);if(failure==='initialization')f.failInit();else f.failRender();assert.equal(f.atlas.prepare(records),null);assert(oldFrames.every(frame=>!frame.dead));assert.deepEqual(filters(records),[[LINEAR,LINEAR],[LINEAR,LINEAR]]);assert(f.sprites.every(s=>s.spriteFrame===null&&s._materials.every(m=>m.texture===null)));assert.equal(f.atlas.camera.targetTexture,null);assert(!f.atlas.root.active);assert(!f.atlas.cameraNode.active);assert.equal(f.scene._renderFlag,40);const retry=f.atlas.prepare(records);assert(retry);retry.releasePrevious();finish(f);
});

test('partial source-filter update failure restores the throwing source and every earlier source',()=>{
  const f=fixture(),records=[f.record(),f.record(48,24,[2])];let once=true;records[1].texture.failFilters=(min)=>{if(min===NEAREST&&once){once=false;return true;}return false;};assert.equal(f.atlas.prepare(records),null);assert.match(f.atlas.lastError,/filter failure/);assert.deepEqual(filters(records),[[LINEAR,LINEAR],[LINEAR,LINEAR]]);assert.equal(f.draws.length,0);assert.equal(f.atlas.current,-1);finish(f);
});

test('transient filter restoration failure is retried before any successful output is published',()=>{
  const f=fixture(),records=[f.record(),f.record(48,24,[2])];let once=true;records[1].texture.failFilters=min=>{if(min===LINEAR&&once){once=false;return true;}return false;};const result=f.atlas.prepare(records);assert(result);assert.deepEqual(filters(records),[[LINEAR,LINEAR],[LINEAR,LINEAR]]);assert.equal(records[1].texture.filterCalls.length,3);finish(f);
});

test('persistent restoration failure still restores other sources and publishes no new crop leases',()=>{
  const f=fixture(),records=[f.record(),f.record(48,24,[2])];records[1].texture.failFilters=min=>min===LINEAR;assert.equal(f.atlas.prepare(records),null);assert.match(f.atlas.lastError,/filter failure/);assert.equal(records[0].texture._minFilter,LINEAR);assert.equal(f.atlas.current,-1);assert.equal(f.atlas.stats().leasedFrames,0);records[1].texture.failFilters=null;records[1].texture.setFilters(LINEAR,LINEAR);finish(f);
});

test('retire detaches all frame leases while preserving bounded target capacity for later reuse',()=>{
  const f=fixture(),records=[f.record()],first=f.atlas.prepare(records),old=first.frames.get(records[0]),consumer=f.bind(old),target=old.getTexture();f.detach(consumer);f.atlas.retire();assert(old.dead);assert(!target.dead);assert.equal(f.atlas.stats().leasedFrames,0);assert.equal(f.atlas.current,-1);const result=f.atlas.prepare(records);assert(result.changed);assert.equal(result.frames.get(records[0]).getTexture(),target);finish(f);
});

test('zero input records retire former output frames only when the old-generation callback is invoked',()=>{
  const f=fixture(),records=[f.record()],first=f.atlas.prepare(records),old=first.frames.get(records[0]),consumer=f.bind(old),empty=f.atlas.prepare([]);assert(empty&&empty.changed);assert.equal(empty.frames.size,0);assert(!old.dead);f.detach(consumer);empty.releasePrevious();assert(old.dead);assert(!f.atlas.prepare([]).changed);finish(f);
});

test('disposal during synchronous capture defers owned target destruction until all Sprite/Camera bindings clear',()=>{
  const f=fixture(),records=[f.record()];f.onRender(()=>{f.atlas.dispose();assert(f.atlas.drawing);assert(f.atlas.root);});assert.equal(f.atlas.prepare(records),null);assert(f.atlas.disposed);assert.equal(f.atlas.root,null);assert.equal(f.atlas.camera,null);assert.equal(f.atlas.stats().leasedFrames,0);assert.deepEqual(filters(records),[[LINEAR,LINEAR]]);finish(f);
});

test('scene replacement during capture rejects publication and leaves no active temporary renderer',()=>{
  const f=fixture(),records=[f.record()];f.onRender(()=>f.changeScene());assert.equal(f.atlas.prepare(records),null);assert.match(f.atlas.lastError,/scene retired/);assert.equal(f.atlas.current,-1);assert(!f.atlas.root.active);assert(!f.atlas.cameraNode.active);assert.equal(f.atlas.camera.targetTexture,null);assert.deepEqual(filters(records),[[LINEAR,LINEAR]]);assert.equal(f.scene._renderFlag,40);assert.equal(f.atlas.prepare(records),null);finish(f);
});

test('reentrant prepare cannot replace an in-flight camera target or sampler restoration list',()=>{
  const f=fixture(),records=[f.record()];f.onRender(()=>assert.equal(f.atlas.prepare(records),null));const result=f.atlas.prepare(records);assert(result);assert.equal(f.draws.length,1);assert.deepEqual(filters(records),[[LINEAR,LINEAR]]);finish(f);
});

test('dispose is idempotent and leaves borrowed source records, source textures and unrelated scene nodes intact',()=>{
  const f=fixture(),records=[f.record()],before=f.sourceState(records),other=new f.Node('unrelated');other.parent=f.scene;const result=f.atlas.prepare(records),frame=result.frames.get(records[0]),consumer=f.bind(frame);f.detach(consumer);f.atlas.dispose();f.atlas.dispose();assert(frame.dead);assert(!records[0].texture.dead);assert(!records[0].frame.dead);assert(!other.dead);assert.deepEqual(f.sourceState(records),before);assert.equal(f.atlas.prepare(records),null);assert.equal(f.atlas.stats().bytes,0);finish(f);
});
