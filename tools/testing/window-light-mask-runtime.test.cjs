'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),Mask=require('../../assets/_script/WindowLightMask');
test('native light masking copies straight RGBA, flips readback rows and disposes detached capture objects on success and failure',()=>{
 for(const size of [70,116,79])for(const failure of [false,true]){
  const nodes=[],textures=[],scene={},sourceTexture={width:size,height:size},sourceFrame={getTexture:()=>sourceTexture},pixels=new Uint8Array(size*size*4);for(let y=0;y<size;y++)for(let x=0;x<size;x++)pixels.set([255,y,17,200],(y*size+x)*4);
  class Node{constructor(){nodes.push(this);this.components=[];}setPosition(){}setContentSize(){}addComponent(T){const c=new T();this.components.push(c);return c;}destroy(){this.dead=true;}}
  class Sprite{}Sprite.SizeMode={CUSTOM:1};class Camera{render(root){const sprite=root.components[0];assert.equal(sprite.spriteFrame,sourceFrame);assert.equal(sprite.srcBlendFactor,1);assert.equal(sprite.dstBlendFactor,0);}}Camera.ClearFlags={COLOR:1,DEPTH:2,STENCIL:4};
  class Texture{constructor(){textures.push(this);}initWithSize(w,h){assert.equal(w,size);assert.equal(h,size);}readPixels(){if(failure)throw Error('native read failed');return pixels;}initWithData(p,_format,w,h){this.pixels=p;this.width=w;this.height=h;}setFilters(){}destroy(){this.dead=true;}}Texture.PixelFormat={RGBA8888:1};Texture.Filter={LINEAR:1};class Frame{constructor(t){this.texture=t;}destroy(){this.dead=true;}}
  const cc={Node,Sprite,Camera,Texture2D:Texture,RenderTexture:Texture,SpriteFrame:Frame,macro:{BlendFactor:{ONE:1,ZERO:0}},color:()=>({}),director:{getScene:()=>scene}},api={};vm.runInNewContext(fs.readFileSync(path.resolve(__dirname,'../../assets/_script/WindowLightMaskRuntime.js'),'utf8'),{cc,exports:api,require:n=>{assert.equal(n,'WindowLightMask');return Mask;}});
  const erase={version:1,strokes:[{op:'erase',radius:3,opacity:.5,softness:0,points:[{x:.5,y:-.5}]}]};
  if(failure)assert.throws(()=>api.acquire(sourceFrame,erase),/native read failed/);else{const entry=api.acquire(sourceFrame,erase);assert.equal(entry.texture.width,size);assert.equal(entry.texture.height,size);assert.equal(entry.texture.pixels[1],size-1);assert.equal(entry.texture.pixels[((size-1)*size)*4+1],0);const center=Math.floor(size/2);assert.equal(entry.texture.pixels[(center*size+center)*4+3],100);assert.equal(entry.refs,1);api.release(entry);}
  assert(nodes.every(n=>n.dead&&n.active===false));assert.equal(nodes[0].components[0].spriteFrame,null);assert.equal(nodes[1].components[0].targetTexture,null);assert(textures.find(t=>t.dead),'the readback target is destroyed');
 }
});

function capabilityFixture(mode,native=false,screenHeight=0){
 const nodes=[],captures=[],textures=[],canvases=[],scene={_renderFlag:0};let htmlReads=0,draws=0;
 const topPixels=size=>{const p=new Uint8Array(size*size*4);for(let y=0;y<size;y++)for(let x=0;x<size;x++)p.set([240,y,17,200],(y*size+x)*4);return p;};
 class Node{constructor(name){this.name=name;this.x=this.y=this.z=0;this.components=[];nodes.push(this);}setPosition(x,y,z){this.x=x;this.y=y;if(z!==undefined)this.z=z;}setContentSize(){}addComponent(T){const c=new T();c.node=this;this.components.push(c);if(T===Camera&&screenHeight)this.z=screenHeight/(2*Math.tan(Math.PI/6));return c;}destroy(){this.dead=true;}}
 class Sprite{}Sprite.SizeMode={CUSTOM:1};class Camera{render(root){const sprite=root.components[0];assert.equal(sprite.srcBlendFactor,1);assert.equal(sprite.dstBlendFactor,0);assert.equal(sprite.trim,false);this.targetTexture.source=sprite.spriteFrame.getTexture();const depth=this.node.z-root.z;this.targetTexture.clipped=depth<this.nearClip||depth>this.farClip;captures.push(this.targetTexture.source);}}Camera.ClearFlags={COLOR:1,DEPTH:2,STENCIL:4};
 class Texture{constructor(){textures.push(this);}initWithSize(w,h){this.width=w;this.height=h;}readPixels(){const p=topPixels(this.width),out=new Uint8Array(p.length),stride=this.width*4;if(this.clipped)return out;for(let y=0;y<this.height;y++)out.set(p.subarray(y*stride,(y+1)*stride),(this.height-1-y)*stride);return out;}initWithData(p,_format,w,h){this.pixels=p;this.width=w;this.height=h;}setFilters(){}destroy(){this.dead=true;}}Texture.PixelFormat={RGBA8888:1};Texture.Filter={LINEAR:1};class Frame{constructor(texture){this.texture=texture;}getTexture(){return this.texture;}destroy(){this.dead=true;}}
 const cc={sys:{isNative:native},Node,Sprite,Camera,Texture2D:Texture,RenderTexture:Texture,SpriteFrame:Frame,macro:{BlendFactor:{ONE:1,ZERO:0}},color:()=>({}),RenderFlow:{FLAG_WORLD_TRANSFORM:8,FLAG_OPACITY:32},director:{getScene:()=>scene}};
 const document={createElement(){const canvas={width:0,height:0,getContext(){if(mode==='context throws')throw Error('context unavailable');if(mode==='null context')return null;let image;const context={drawImage(i){draws++;image=i;if(mode==='draw throws')throw Error('draw unsupported');},getImageData(){if(mode==='read throws')throw Error('pixel read unsupported');if(mode==='empty read')return{};if(mode==='truncated read')return{data:new Uint8Array(4)};return{data:topPixels(image.width)};}};if(mode==='no drawImage')delete context.drawImage;if(mode==='no getImageData')delete context.getImageData;return context;}};canvases.push(canvas);return canvas;}};
 function source(size){return new Frame({width:size,height:size,getHtmlElementObj(){htmlReads++;if(native)throw Error('JSB must not attempt HTML image APIs');return{width:size,height:size};}});}
 const api={};vm.runInNewContext(fs.readFileSync(path.resolve(__dirname,'../../assets/_script/WindowLightMaskRuntime.js'),'utf8'),{cc,document,exports:api,require:n=>n==='WindowLightMask'?Mask:n==='BuildingNightlight'?require('../../assets/_script/BuildingNightlight'):(()=>{throw Error(n);})()});
 return{api,source,cc,scene,nodes,captures,textures,canvases,reads:()=>htmlReads,draws:()=>draws,topPixels};
}
const eraseMask={version:1,strokes:[{op:'erase',radius:3,opacity:.5,softness:0,points:[{x:.5,y:-.5}]}]};

// Actual active Camera preload aligns z to height/(2*tan30) before callers
// disable alignWithScreen. Native GPU before/after controls verify this SDK
// behavior independently; the fixture also preserves setPosition(x,y)'s z.
for(const screenHeight of [600,1334,1920])test('active camera initialization preserves every masked light pixel at design height '+screenHeight,()=>{
 for(const size of [70,116,79]){
  const h=capabilityFixture('no drawImage',true,screenHeight),source=h.source(size),entry=h.api.acquire(source,eraseMask);
  assert.equal(Buffer.compare(Buffer.from(entry.texture.pixels),Buffer.from(Mask.pixels(h.topPixels(size),eraseMask,size,size))),0,'Keep the exact source/mask RGBA instead of caching clipped transparent pixels');
  const reused=h.api.acquire(source,eraseMask);assert.equal(reused,entry);assert.equal(entry.refs,2);assert.equal(h.captures.length,1,'A cached acquire does not recapture');h.api.release(reused);h.api.release(entry);
 }
});

test('browser GPU fallback survives active camera alignment at tall design height',()=>{
 const h=capabilityFixture('no drawImage',false,1920),source=h.source(116),entry=h.api.acquire(source,eraseMask);
 assert.equal(Buffer.compare(Buffer.from(entry.texture.pixels),Buffer.from(Mask.pixels(h.topPixels(116),eraseMask,116,116))),0);assert.equal(h.captures.length,1);h.api.release(entry);
});

test('JSB stage prewarming preserves all three light types and cached erasures despite its document/canvas polyfill',()=>{
 const h=capabilityFixture('no drawImage',true),sources=[h.source(70),h.source(116),h.source(79)],types=require('../../assets/_script/BuildingLightTypes').list,assets={},lights={},emitters=[];
 types.forEach((t,i)=>{assets['resources/'+t.sprite+':frame']=sources[i];const id='light:'+(i+1);emitters.push({id,type:t.id});lights[id]={erase:eraseMask};});
 const config={BuildEnum:{2:{levelList:[{Nightlight:{emitters,lights}}]}}},before=JSON.stringify(config),prepared=h.api.prime(config,['2'],assets);assert.equal(h.reads(),0,'Native paths do not probe HTML image wrappers');assert.equal(h.canvases.length,0,'A JSB canvas with no browser drawing API is never selected');assert.equal(h.captures.length,3);
 for(let i=0;i<sources.length;i++){const size=[70,116,79][i],entry=h.api.acquire(sources[i],eraseMask),original=h.topPixels(size);assert.equal(entry.refs,2);assert.equal(entry.texture.width,size);assert.equal(entry.texture.height,size);for(let pixel=0;pixel<size*size;pixel++)assert.deepEqual(Array.from(entry.texture.pixels.subarray(pixel*4,pixel*4+3)),Array.from(original.subarray(pixel*4,pixel*4+3)),'Authored RGB is unchanged');const center=Math.floor(size/2);assert.equal(entry.texture.pixels[(center*size+center)*4+3],100);assert.equal(entry.texture.pixels[1],0,'GPU rows return to image-space orientation');h.api.release(entry);}
 assert.equal(h.captures.length,3,'Placing stage-prepared lights does not recapture or rebuild the source pixels');assert.equal(JSON.stringify(config),before);assert(h.scene._renderFlag&h.cc.RenderFlow.FLAG_WORLD_TRANSFORM);assert(h.scene._renderFlag&h.cc.RenderFlow.FLAG_OPACITY);assert(h.nodes.every(n=>n.dead&&n.active===false));prepared.dispose();
});

for(const mode of ['no drawImage','no getImageData','null context','context throws','draw throws','read throws','empty read','truncated read'])test('browser '+mode+' uses exact GPU fallback and releases temporary canvas state',()=>{
 const h=capabilityFixture(mode),source=h.source(70),entry=h.api.acquire(source,eraseMask);assert.equal(h.captures.length,1);assert.equal(entry.texture.pixels[1],0);assert.equal(entry.texture.pixels[(35*70+35)*4+3],100);assert(h.canvases.every(c=>c.width===1&&c.height===1));assert(h.nodes.every(n=>n.dead));h.api.release(entry);
});

test('capable browser canvas keeps its original readback path without a manual camera',()=>{
 const h=capabilityFixture('browser'),source=h.source(70),entry=h.api.acquire(source,eraseMask);assert.equal(h.captures.length,0);assert.equal(h.draws(),1);assert.equal(entry.texture.pixels[1],0);assert.equal(entry.texture.pixels[(35*70+35)*4+3],100);assert(h.canvases.every(c=>c.width===1&&c.height===1));h.api.release(entry);
});
