'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),{test}=require('node:test');
const source=fs.readFileSync(process.env.HKD_NATIVE_GATE_QUAD_SOURCE||path.join(__dirname,'../../assets/_script/NativeGateQuad.js'),'utf8');
function fixture(options={}){
 const events=[],formats=[],created=[],metadataCalls={rect:0,size:0,offset:0};
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
 class Frame{constructor(){this._rect={width:48,height:48};this._originalSize={width:48,height:48};this._offset={x:0,y:0};}getRect(){metadataCalls.rect++;return{...this._rect};}getOriginalSize(){metadataCalls.size++;return{...this._originalSize};}getOffset(){metadataCalls.offset++;return{...this._offset};}}
 const frame=()=>new Frame();
 class StockAssembler{constructor(sprite){this._renderComp=sprite;this.kind="stock";this.colors=0;this.resets=0;this._effect=[{oldSampler:{}}];}updateColor(){this.colors++;}reset(){this.resets++;}}
 function original(sprite){return new StockAssembler(sprite);}
 class Sprite{
  constructor(){this.type=0;this.spriteFrame=frame();this.enabled=true;this.dirty=0;this.materialToken={};this.node={width:48,height:64,anchorX:.5,anchorY:.25,activeInHierarchy:true,is3DNode:false,color:{_val:0xff80aabb},_proxy:{setAssembler(a){this.current=a;events.push(['proxy',a]);}}};this.node._renderComponent=this;this._assembler=original(this);this.node._proxy.current=this._assembler;}
  setVertsDirty(){this.dirty++;}
  _updateColor(){this._assembler.updateColor(this,this.node.color._val);}
  _resetAssembler(){this._assembler=original(this);this.node._proxy.setAssembler(this._assembler);}
 }
 Sprite.Type={SIMPLE:0};Sprite.__assembler__={Simple:StockAssembler};
 const cc={sys:{isNative:options.native!==false},ENGINE_VERSION:options.version||'2.4.13',Assembler,RenderData,Sprite,SpriteFrame:Frame,gfx:{VertexFormat,ATTR_TYPE_FLOAT32:'float',ATTR_TYPE_UINT8:'byte'},isValid:(v,strict)=>!!v&&!v.destroyed&&(!strict||!v.pendingDestroy)};
 const exports={};vm.runInNewContext(source,{cc,exports,WeakMap,Float32Array,Uint32Array,isFinite});
 const sprite=new Sprite(),saved=sprite._assembler;const values=()=>({wallUV:[0,0,1,0,0,1,1,1],actorUV:[.1,.2,.3,.2,.1,.4,.3,.4],clipXY:[0,0,1,0,0,1,1,1],maskOpacity:.8,alphaThreshold:.1,paintIsActor:0});
 return{metadataCalls,Frame,cc,api:exports,sprite,saved,values,events,formats,created,options,Sprite,frame};
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

// Geometry reduction preserves the original shader sampling and stencil test.
const near=(a,b,tolerance=1e-5)=>assert(Math.abs(a-b)<=tolerance,`${a} != ${b}`);
function geometry(f,input){const lease=f.api.create(f.sprite);assert(lease.update(input));lease.custom.updateRenderData(f.sprite);return{lease,d:Array.from(lease.custom._gateQuadData),vertices:lease.custom._renderData.vDatas[0]};}
function fullBounds(node){return[Math.fround(-node.width*node.anchorX),Math.fround(-node.height*node.anchorY),Math.fround(node.width*(1-node.anchorX)),Math.fround(node.height*(1-node.anchorY))];}
function rect(x0,y0,x1,y1){return[x0,y0,x1,y0,x0,y1,x1,y1];}
function at(corners,x,y){return[corners[0]+(corners[2]-corners[0])*x,corners[1]+(corners[5]-corners[1])*y];}
function texture(u,v,seed){return[.1+.7*u,.2+.5*v,.05+.3*u+.4*v,.12+.75*(seed?u*.7+v*.3:u*.3+v*.7)];}

test('a 512px wall through 64x96 actor bounds emits only the exact intersection, reducing area by over 97 percent',()=>{
 const f=fixture(),n=f.sprite.node;n.width=n.height=512;n.anchorX=n.anchorY=.5;
 const input=f.values();input.clipXY=rect(-3.5,.5-512/96/2,4.5,.5+512/96/2);
 const {lease,d}=geometry(f,input);near(d[27],-32);near(d[29],32);near(d[28],-48);near(d[30],48);assert((d[29]-d[27])*(d[30]-d[28])/(512*512)<.024);lease.dispose();
});

test('partial overlap clips against both original paint bounds and mask bounds while retaining its original UV samples',()=>{
 const f=fixture(),n=f.sprite.node;n.width=n.height=512;n.anchorX=n.anchorY=.5;
 const input=f.values();input.clipXY=rect((-256-200)/64,(-256+100)/200,(256-200)/64,(256+100)/200);
 const {lease,d}=geometry(f,input);near(d[27],200);near(d[29],256);near(d[28],-100);near(d[30],100);
 near(d[0],(200+256)/512);near(d[2],1);near(d[1],156/512);near(d[5],356/512);lease.dispose();
});

test('disjoint and edge-touching rectangles produce a reusable zero-area quad then recover without allocating',()=>{
 const f=fixture(),lease=f.api.create(f.sprite),custom=lease.custom,count=f.created.length;
 for(const clip of [rect(2,2,3,3),rect(-2,0,-1,1),rect(1,0,2,1),rect(2,0,2,1)]){
  const input=f.values();input.clipXY=clip;assert(lease.update(input));const d=custom._gateQuadData;assert.equal((d[29]-d[27])*(d[30]-d[28]),0);assert(lease.owns());
 }
 const input=f.values();input.clipXY=rect(0,0,1,1);assert(lease.update(input));const d=custom._gateQuadData;assert(d[29]>d[27]&&d[30]>d[28]);assert.equal(f.created.length,count);assert.equal(lease.custom,custom);lease.dispose();
});

test('contained paint, constant-inside clip coordinates and unknown warped mappings preserve the original full-quad behavior',()=>{
 for(const kind of ['contained','constant','warped clip','warped wall UV','warped actor UV']){
  const f=fixture(),input=f.values();input.clipXY=kind==='constant'?rect(.4,.2,.4,.9):rect(.2,.1,.8,.9);
  if(kind==='warped clip'){input.clipXY=rect(-2,-3,4,5);input.clipXY[4]+=.1;}
  if(kind==='warped wall UV'){input.clipXY=rect(-2,-3,4,5);input.wallUV[4]+=.1;}
  if(kind==='warped actor UV'){input.clipXY=rect(-2,-3,4,5);input.actorUV[4]+=.1;}
  const {lease,d}=geometry(f,input);assert.deepEqual(d.slice(27),fullBounds(f.sprite.node));lease.dispose();
 }
});

test('1000 independent rectangles retain fragment coverage and sampled RGBA for cropped/flipped UVs, inverse paint roles and anchors',()=>{
 let seed=784291,probes=0,visible=0;const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
 const f=fixture(),lease=f.api.create(f.sprite),n=f.sprite.node;
 for(let sample=0;sample<1000;sample++){
  n.width=10+random()*700;n.height=10+random()*700;n.anchorX=random();n.anchorY=random();
  const input=f.values();input.wallUV=rect(random(),random(),random(),random());input.actorUV=rect(random(),random(),random(),random());
  const cx=-3+random()*6,cy=-3+random()*6,dx=(sample%2?-1:1)*(.01+random()*8),dy=(sample%3?-1:1)*(.01+random()*8);input.clipXY=rect(cx,cy,cx+dx,cy+dy);input.paintIsActor=sample%2;input.maskOpacity=.9;input.alphaThreshold=.1;
  const original=[...input.wallUV,...input.actorUV,...input.clipXY].map(Math.fround),bounds=fullBounds(n);assert(lease.update(input));const d=Array.from(lease.custom._gateQuadData),width=d[29]-d[27],height=d[30]-d[28];
  assert(width>=0&&height>=0);assert(width*height<=(bounds[2]-bounds[0])*(bounds[3]-bounds[1])+1);
  for(let point=0;point<36;point++){
   const tx=random(),ty=random(),x=bounds[0]+tx*(bounds[2]-bounds[0]),y=bounds[1]+ty*(bounds[3]-bounds[1]),oldClip=at(original.slice(16),tx,ty);
   // Pixel centers arbitrarily close to an edge require the native rasterizer
   // oracle; omit that Float32-sized boundary from this continuous model.
   if(oldClip.some(v=>Math.abs(v)<1e-5||Math.abs(v-1)<1e-5))continue;
   const oldVisible=oldClip.every(v=>v>=0&&v<=1),covered=width>0&&height>0&&x>=d[27]&&x<=d[29]&&y>=d[28]&&y<=d[30];assert.equal(covered,oldVisible);probes++;
   if(!covered)continue;
   const sx=(x-d[27])/width,sy=(y-d[28])/height,oldWall=at(original,tx,ty),oldActor=at(original.slice(8),tx,ty),wall=at(d,sx,sy),actor=at(d.slice(8),sx,sy),clip=at(d.slice(16),sx,sy);
   near(wall[0],oldWall[0],5e-6);near(wall[1],oldWall[1],5e-6);near(actor[0],oldActor[0],5e-6);near(actor[1],oldActor[1],5e-6);near(clip[0],oldClip[0],5e-6);near(clip[1],oldClip[1],5e-6);
   const oldPaint=texture(...(input.paintIsActor?oldActor:oldWall),input.paintIsActor),paint=texture(...(input.paintIsActor?actor:wall),input.paintIsActor),oldMask=texture(...(input.paintIsActor?oldWall:oldActor),!input.paintIsActor),mask=texture(...(input.paintIsActor?wall:actor),!input.paintIsActor);
   for(let c=0;c<4;c++)near(paint[c],oldPaint[c],5e-6);assert.equal(mask[3]*input.maskOpacity>=input.alphaThreshold,oldMask[3]*input.maskOpacity>=input.alphaThreshold);visible++;
  }
 }
 assert(probes>35000);assert(visible>300);lease.dispose();
});

test('clipped Float32 geometry stays stable across120 repeated updates and private pool parking',()=>{
 const f=fixture(),input=f.values(),lease=f.api.create(f.sprite);input.clipXY=rect(-.5,0,1.5,1);assert(lease.update(input));const dirties=f.sprite.dirty,custom=lease.custom;
 for(let frame=0;frame<120;frame++)assert(lease.update(input));assert.equal(f.sprite.dirty,dirties);
 f.sprite.node.activeInHierarchy=false;f.sprite.node._renderComponent=null;f.sprite.spriteFrame=null;assert(lease.owns());f.sprite.spriteFrame=f.frame();assert(lease.update(input));assert.equal(lease.custom,custom);assert.equal(f.sprite.dirty,dirties);lease.dispose();
});


test('300 real native Quad updates avoid stock frame getter clones while retaining fresh metadata validation',()=>{
  const f=fixture(),lease=f.api.create(f.sprite);assert(lease);
  for(let i=0;i<300;i++){f.sprite.node.width=48+i%11;f.sprite.node.height=64+i%7;assert(lease.update(f.values()));lease.custom.updateRenderData(f.sprite);}
  assert.deepEqual(f.metadataCalls,{rect:0,size:0,offset:0});lease.dispose();
});

test('live stock frame size/offset mutations and customized getter/subclass semantics restore ordinary geometry',()=>{
  for(const mutation of ['size','offset','instance API','prototype API','subclass']){
    const f=fixture(),lease=f.api.create(f.sprite);assert(lease);assert(lease.update(f.values()));
    if(mutation==='size')f.sprite.spriteFrame._originalSize.width++;
    if(mutation==='offset')f.sprite.spriteFrame._offset.y=1;
    if(mutation==='instance API')f.sprite.spriteFrame.getRect=()=>({width:24,height:24});
    if(mutation==='prototype API')f.Frame.prototype.getRect=()=>({width:24,height:24});
    if(mutation==='subclass'){class CustomFrame extends f.Frame{getRect(){return{width:24,height:24};}}f.sprite.spriteFrame=new CustomFrame();}
    assert.equal(lease.update(f.values()),false);assert.equal(f.sprite._assembler,f.saved);assert.equal(lease.owns(),false);
  }
});
