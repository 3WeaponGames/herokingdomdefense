'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),{test}=require('node:test');
const source=fs.readFileSync(process.env.HKD_NATIVE_GATE_QUAD_SOURCE||path.join(__dirname,'../../assets/_script/NativeGateQuad.js'),'utf8');
function fixture(options={}){
 const events=[],formats=[],created=[];
 class Assembler{
  constructor(){this._dirtyPtr=new Uint32Array(1);this._renderComp=null;this.counts={reset:0,clear:0,destroy:0,detach:0};created.push(this);this.setVertexFormat(this.getVfmt()._nativeObj);}
  init(comp){this._renderComp=comp;comp.node._proxy.setAssembler(this);if(options.throwInit)throw Error('init failed');}
  setVertexFormat(format){this.format=format;}
  setRenderDataList(data){this.data=data;if(data===null)this.counts.detach++;}
  updateEffect(){}
  setUseModel(value){this.useModel=value;}
  reset(){this.counts.reset++;}
  clear(){this.counts.clear++;this._renderData.clear();}
  destroy(){this.counts.destroy++;this._renderComp=null;}
 }
 Assembler.FLAG_VERTICES_OPACITY_CHANGED=1;
 class RenderData{
  constructor(){this.vDatas=[];this.uintVDatas=[];this.iDatas=[];}
  init(asm){this.assembler=asm;asm.setRenderDataList(this);}
  createQuadData(index,floats,count){this.vDatas[index]=new Float32Array(floats);this.uintVDatas[index]=new Uint32Array(this.vDatas[index].buffer);this.iDatas[index]=new Uint16Array(count);this.iDatas[index].set([0,1,2,1,3,2]);}
  clear(){this.vDatas=[];this.uintVDatas=[];this.iDatas=[];}
 }
 class VertexFormat{
  constructor(infos){let offset=0;this._elements=infos.map(x=>{const e={...x,offset};offset+=x.num*(x.type==='byte'?1:4);return e;});this._bytes=offset;this._nativeObj={format:this};formats.push(this);}
 }
 const frame=()=>Object.freeze({getRect:()=>({width:48,height:48}),getOriginalSize:()=>({width:48,height:48}),getOffset:()=>({x:0,y:0})});
 class StockAssembler{constructor(sprite){this._renderComp=sprite;this.kind="stock";this.colors=0;this.resets=0;this._effect=[{oldSampler:{}}];}updateColor(){this.colors++;}reset(){this.resets++;}}
 function original(sprite){return new StockAssembler(sprite);}
 class Sprite{
  constructor(){this.type=0;this.spriteFrame=frame();this.enabled=true;this.dirty=0;this.materialToken={};this.node={width:48,height:64,anchorX:.5,anchorY:.25,activeInHierarchy:true,is3DNode:false,color:{_val:0xff80aabb},_proxy:{setAssembler(a){this.current=a;events.push(['proxy',a]);}}};this.node._renderComponent=this;this._assembler=original(this);this.node._proxy.current=this._assembler;}
  setVertsDirty(){this.dirty++;}
  _updateColor(){this._assembler.updateColor(this,this.node.color._val);}
  _resetAssembler(){this._assembler=original(this);this.node._proxy.setAssembler(this._assembler);}
 }
 Sprite.Type={SIMPLE:0};Sprite.__assembler__={Simple:StockAssembler};
 const cc={sys:{isNative:options.native!==false},ENGINE_VERSION:options.version||'2.4.13',Assembler,RenderData,Sprite,gfx:{VertexFormat,ATTR_TYPE_FLOAT32:'float',ATTR_TYPE_UINT8:'byte'},isValid:(v,strict)=>!!v&&!v.destroyed&&(!strict||!v.pendingDestroy)};
 const exports={};vm.runInNewContext(source,{cc,exports,WeakMap,Float32Array,Uint32Array,isFinite});
 const sprite=new Sprite(),saved=sprite._assembler;const values=()=>({wallUV:[0,0,1,0,0,1,1,1],actorUV:[.1,.2,.3,.2,.1,.4,.3,.4],clipXY:[-.5,0,1.5,0,-.5,1,1.5,1],maskOpacity:.8,alphaThreshold:.1,paintIsActor:0});
 return{cc,api:exports,sprite,saved,values,events,formats,created,options,Sprite,frame};
}
test('unsupported host/type/frame/proxy guards perform no swap',()=>{
 for(const options of [{native:false},{version:'2.4.12'}]){const f=fixture(options);assert.equal(f.api.create(f.sprite),null);assert.equal(f.created.length,0);assert.equal(f.sprite._assembler,f.saved);}
 for(const mutate of [s=>s.type=1,s=>s.node.is3DNode=true,s=>s.node._proxy=null,s=>s.spriteFrame=null,s=>s.spriteFrame={getRect:()=>({width:24,height:24}),getOriginalSize:()=>({width:48,height:48}),getOffset:()=>({x:0,y:0})}]){const f=fixture();mutate(f.sprite);assert.equal(f.api.create(f.sprite),null);assert.equal(f.created.length,0);}
});
test('one module-singleton six-attribute native format serves independent Sprite leases',()=>{const f=fixture(),a=f.api.create(f.sprite),other=new f.Sprite(),b=f.api.create(other);assert(a&&b);assert.equal(f.formats.length,1);assert.equal(f.formats[0]._bytes,52);assert.equal(f.formats[0]._elements[3].offset,28);assert.equal(f.formats[0]._elements[3].normalize,true);assert.equal(a.custom.format,b.custom.format);assert.equal(a.custom.useModel,false);assert.equal(f.saved.resets,1);assert.equal(f.saved._effect.length,0);assert.equal(f.api.create(f.sprite),a);a.dispose();b.dispose();});
test('full per-vertex layout and packed colors retain copied inputs, width and anchors',()=>{
 const f=fixture(),a=f.api.create(f.sprite),data=f.values();assert(a.update(data));data.wallUV[0]=123;data.actorUV[0]=999;const custom=a.custom;custom.updateRenderData(f.sprite);const v=custom._renderData.vDatas[0],u=custom._renderData.uintVDatas[0];assert.equal(v.length,52);assert.equal(v[3],0);assert(Math.abs(v[5]-.1)<1e-6);assert.equal(v[0],-24);assert.equal(v[1],-16);assert.equal(v[13],24);assert.equal(v[27],48);for(let i=0;i<4;i++){assert.equal(u[i*13+7],0xff80aabb);assert.equal(v[i*13+12],0);}assert.equal(custom._dirtyPtr[0],1);a.dispose();
});
test('same Float32 data causes no redundant geometry dirtiness and geometry change does',()=>{const f=fixture(),a=f.api.create(f.sprite);assert(a.update(f.values()));const count=f.sprite.dirty;assert(a.update(f.values()));assert.equal(f.sprite.dirty,count);const v=f.values();v.actorUV[0]=Math.fround(v.actorUV[0]);assert(a.update(v));assert.equal(f.sprite.dirty,count);f.sprite.node.width=50;assert(a.update(f.values()));assert.equal(f.sprite.dirty,count+1);a.dispose();});
test('color updates use named packed-color slot while native opacity is left to engine',()=>{const f=fixture(),a=f.api.create(f.sprite);a.update(f.values());a.custom.updateRenderData(f.sprite);f.sprite.node.color._val=0xff123456;f.sprite._updateColor();const u=a.custom._renderData.uintVDatas[0];for(let i=0;i<4;i++)assert.equal(u[i*13+7],0xff123456);assert.equal(a.custom._dirtyPtr[0]&1,1);a.dispose();});
test('private inactive gate-pool lease retains only scalar data and resumes without rebuilding',()=>{const f=fixture(),a=f.api.create(f.sprite),custom=a.custom;a.update(f.values());f.sprite.node.activeInHierarchy=false;f.sprite.node._renderComponent=null;f.sprite.spriteFrame=null;assert(a.owns());assert.equal(custom._gateQuadData instanceof Float32Array,true);assert.equal(custom._gateQuadData.length,31);f.sprite.spriteFrame=f.frame();assert(a.update(f.values()));assert.equal(f.api.create(f.sprite),a);f.sprite.node.activeInHierarchy=true;f.sprite.node._renderComponent=f.sprite;assert(a.owns());assert.equal(a.custom,custom);a.dispose();});
test('dispose restores original Sprite/proxy, does not change material or frame, and is idempotent',()=>{const f=fixture(),material=f.sprite.materialToken,frame=f.sprite.spriteFrame,a=f.api.create(f.sprite),custom=a.custom;a.update(f.values());assert(a.dispose());assert.equal(f.sprite._assembler,f.saved);assert.equal(f.sprite.node._proxy.current,f.saved);assert.equal(f.sprite.materialToken,material);assert.equal(f.sprite.spriteFrame,frame);assert.deepEqual(custom.counts,{reset:1,clear:1,destroy:1,detach:1});assert.equal(custom._gateQuadData,null);assert.equal(a.sprite,null);assert.equal(a.dispose(),false);assert.deepEqual(custom.counts,{reset:1,clear:1,destroy:1,detach:1});});
test('pending destruction is restored before component lifecycle can pool original assembler',()=>{const f=fixture(),a=f.api.create(f.sprite);f.sprite.pendingDestroy=true;f.sprite.node.pendingDestroy=true;assert.equal(a.owns(),false);assert(a.dispose());assert.equal(f.sprite._assembler,f.saved);assert.equal(f.sprite.node._proxy.current,f.saved);});
test('different active renderer is never stolen and newer Sprite assembler stays installed',()=>{const f=fixture(),a=f.api.create(f.sprite),custom=a.custom,newer={_renderComp:f.sprite},otherRenderer={};f.sprite._assembler=newer;f.sprite.node._renderComponent=otherRenderer;f.sprite.node._proxy.current=newer;const count=f.events.length;assert.equal(a.update(f.values()),false);assert.equal(f.events.length,count);assert.equal(f.sprite._assembler,newer);assert.equal(f.sprite.node._proxy.current,newer);assert.equal(custom.counts.clear,1);});
test('another render component on same node keeps its native proxy during restoration',()=>{const f=fixture(),a=f.api.create(f.sprite),newer={};f.sprite.node._renderComponent={};f.sprite.node._proxy.current=newer;const count=f.events.length;assert.equal(a.owns(),false);assert(a.dispose());assert.equal(f.sprite._assembler,f.saved);assert.equal(f.sprite.node._proxy.current,newer);assert.equal(f.events.length,count);});
test('a custom assembler that entered global pool or was recycled is never cleared through stale lease',()=>{for(const reuse of [false,true]){const f=fixture(),a=f.api.create(f.sprite),custom=a.custom;custom._renderComp=reuse?new f.Sprite():null;const counts={...custom.counts};a.dispose();assert.deepEqual(custom.counts,counts);assert.equal(custom._gateQuadToken!==null,true);}});
test('invalid array/overflow/role/opacity data retires to original renderer',()=>{for(const mutate of [v=>v.wallUV.pop(),v=>v.actorUV[2]=NaN,v=>v.clipXY[0]=1e99,v=>v.maskOpacity=-.1,v=>v.alphaThreshold=2,v=>v.paintIsActor=true]){const f=fixture(),a=f.api.create(f.sprite),v=f.values();mutate(v);assert.equal(a.update(v),false);assert.equal(f.sprite._assembler,f.saved);assert.equal(a.owns(),false);}});
test('changed node/frame/type eligibility retires without attempting to render unsupported geometry',()=>{for(const mutate of [s=>s.type=1,s=>s.spriteFrame=null,s=>s.node.width=0]){const f=fixture(),a=f.api.create(f.sprite);mutate(f.sprite);assert.equal(a.update(f.values()),false);assert.equal(f.sprite._assembler,f.saved);}});
test('partial native init failure restores native proxy and permits future retry',()=>{const f=fixture({throwInit:true});assert.equal(f.api.create(f.sprite),null);assert.equal(f.sprite._assembler,f.saved);assert.equal(f.sprite.node._proxy.current,f.saved);assert.equal(f.created[0].counts.clear,1);f.options.throwInit=false;const a=f.api.create(f.sprite);assert(a);assert.equal(f.formats.length,1);a.dispose();});
test('callbacks retained after disposal safely bypass cleared typed buffers',()=>{const f=fixture(),a=f.api.create(f.sprite),custom=a.custom;a.update(f.values());a.dispose();assert.doesNotThrow(()=>custom.updateColor(f.sprite));assert.doesNotThrow(()=>custom.updateRenderData(f.sprite));assert.equal(custom._renderData.vDatas.length,0);});

test('destroyed/pending or invalid native frame getters reject with safe ordinary-renderer fallback',()=>{for(const frame of [{destroyed:true},{pendingDestroy:true},{getRect(){throw Error('retired frame');}}]){const f=fixture(),a=f.api.create(f.sprite);f.sprite.spriteFrame=frame;assert.doesNotThrow(()=>assert.equal(a.update(f.values()),false));assert.equal(f.sprite._assembler,f.saved);}});
