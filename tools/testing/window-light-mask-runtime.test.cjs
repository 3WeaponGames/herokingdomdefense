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
