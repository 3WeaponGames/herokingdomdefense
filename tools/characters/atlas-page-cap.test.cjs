'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),url=require('node:url'),{test}=require('node:test');
const PNG=require('../../packages/hkd-characters/lib/png-atlas'),Bake=require('../../packages/hkd-characters/lib/native-bake'),Hero=require('../../packages/hkd-characters/lib/hero-bake');
const Units=require('../../packages/game-data-editor/lib/unit-assets');
function image(width,height,seed){
  const rgba=Buffer.alloc(width*height*4);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const at=(y*width+x)*4;rgba[at]=(x*7+seed)%256;rgba[at+1]=(y*11+seed)%256;rgba[at+2]=(x+y+seed)%256;rgba[at+3]=x%5===0?0:x%5===1?1:254;
  }
  return{width,height,rgba};
}
function pixel(image,x,y){return image.rgba.subarray((y*image.width+x)*4,(y*image.width+x+1)*4);}

test('2048px atlas pages preserve every source pixel and two-pixel sampling border across overflow',()=>{
  const pictures={b:image(1200,1100,41),a:image(1200,1100,19),small:image(3,2,77)},before=Object.fromEntries(Object.entries(pictures).map(([name,picture])=>[name,Buffer.from(picture.rgba)]));
  const pages=PNG.packPages(pictures);assert.equal(pages.length,2);
  assert.deepEqual(pages.map(page=>page.positions),PNG.packPages({small:pictures.small,a:pictures.a,b:pictures.b}).map(page=>page.positions),'Input insertion order does not change page placement.');
  const seen=new Set();
  for(const page of pages){
    assert(page.width<=2048&&page.height<=2048);
    for(const [name,p]of Object.entries(page.positions)){
      seen.add(name);const source=pictures[name];
      assert.deepEqual(PNG.crop(page,p.x,p.y,p.width,p.height,false),source,name+' exact unresampled RGBA pixels');
      for(const dx of [-2,-1,0,source.width-1,source.width,source.width+1])for(const dy of [-2,-1,0,source.height-1,source.height,source.height+1]){
        assert.deepEqual(pixel(page,p.x+dx,p.y+dy),pixel(source,Math.max(0,Math.min(source.width-1,dx)),Math.max(0,Math.min(source.height-1,dy))),name+' clamped extrusion');
      }
    }
  }
  assert.deepEqual([...seen].sort(),Object.keys(pictures).sort());
  for(const [name,picture]of Object.entries(pictures))assert.deepEqual(picture.rgba,before[name],'Packing never mutates source artwork.');
  assert.throws(()=>PNG.pack(pictures),/2048/,'The single-page API cannot silently emit a larger character atlas.');
  assert.throws(()=>PNG.packPages({large:image(2045,1,1)}),/2048/,'An indivisible region is rejected instead of scaled down.');
  assert.throws(()=>PNG.packPages({broken:{width:3,height:2,rgba:Buffer.alloc(1)}}),/Invalid character texture/);
  const blank=PNG.packPages({});assert.equal(blank.length,1);assert(blank[0].width<=2048&&blank[0].height<=2048);
});

function fixture(t){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'hkd-atlas-page-cap-'));
  t.after(()=>{const resolved=path.resolve(root);if(!resolved.startsWith(path.resolve(os.tmpdir())+path.sep)||!path.basename(resolved).startsWith('hkd-atlas-page-cap-'))throw Error('Unexpected atlas fixture path');fs.rmSync(resolved,{recursive:true,force:true});});
  const pictures={first:image(1200,1100,5),second:image(1200,1100,9)},bytes=Object.fromEntries(Object.entries(pictures).map(([name,picture])=>[name+'.png',PNG.encode(picture)]));
  const atlas=Object.entries(pictures).map(([name,picture])=>'\n'+name+'.png\nsize: '+picture.width+','+picture.height+'\nformat: RGBA8888\nfilter: Linear,Linear\nrepeat: none\n'+name+'\n  rotate: false\n  xy: 0,0\n  size: '+picture.width+','+picture.height+'\n  orig: '+picture.width+','+picture.height+'\n  offset: 0,0\n  index: -1\n').join('');
  const rig={skeleton:{spine:'3.8.99',width:1200,height:1100},bones:[{name:'root'}],slots:[{name:'first',bone:'root',attachment:'first'},{name:'second',bone:'root',attachment:'second'}],
    skins:[{name:'default',attachments:{first:{first:{width:1200,height:1100}},second:{second:{width:1200,height:1100}}}}],
    animations:{idle:{bones:{root:{translate:[{time:0},{time:.7,x:2}]}}},attack:{events:[{time:.17,name:'attack'}]}},events:{attack:{}}};
  const layer={uuid:'source-layer',name:'head',skin:'default',json:rig,atlas,pages:Object.fromEntries(Object.keys(bytes).map(name=>[name,url.pathToFileURL(path.join(root,name)).href]))};
  function read(file){const name=path.basename(file);return bytes[name]||fs.readFileSync(file);}
  return{root,pictures,bytes,rig,layer,read};
}
function verifyFiles(result,base,expected){
  const atlas=result.files.get(base+'.atlas'),metadata=JSON.parse(result.files.get(base+'.json.meta'));
  const pngFiles=[...result.files.keys()].filter(file=>file.startsWith(base)&&file.endsWith('.png'));
  assert(pngFiles.length>=2,'The full compiler publishes the overflow page.');
  assert.deepEqual(pngFiles,[base+'.png',base+'_1.png']);
  assert.deepEqual(metadata.textures,pngFiles.map(file=>JSON.parse(result.files.get(file+'.meta')).uuid));
  const pages={},pageBytes=new Map();for(const file of pngFiles){const bytes=result.files.get(file),texture=JSON.parse(result.files.get(file+'.meta'));assert(bytes.readUInt32BE(16)<=2048&&bytes.readUInt32BE(20)<=2048);assert.equal(texture.width,bytes.readUInt32BE(16));assert.equal(texture.height,bytes.readUInt32BE(20));pages[path.basename(file)]=url.pathToFileURL(path.resolve(file)).href;pageBytes.set(path.resolve(file),bytes);}
  const cut=Bake.readAtlas({atlas,pages},file=>pageBytes.get(path.resolve(file)));
  for(const [name,picture]of Object.entries(expected))assert.deepEqual(cut(name),picture,name+' survived its published page lookup');
  const spine=require(Units.enginePath()),runtimeAtlas=new spine.TextureAtlas(atlas,name=>{const bytes=result.files.get(path.dirname(base)+'/'+name);return new spine.FakeTexture({width:bytes.readUInt32BE(16),height:bytes.readUInt32BE(20)});});
  const data=new spine.SkeletonJson(new spine.AtlasAttachmentLoader(runtimeAtlas)).readSkeletonData(JSON.parse(result.files.get(base+'.json'))),skeleton=new spine.Skeleton(data);skeleton.updateWorldTransform();
  for(const slot of skeleton.slots){const attachment=slot.getAttachment();assert(attachment);const geometry=[];attachment.computeWorldVertices(slot.bone,geometry,0,2);assert(geometry.every(Number.isFinite));}
  return metadata;
}

test('native unit baking publishes complete multipage texture references and preserves authored metadata',t=>{
  const f=fixture(t),base='assets/resources/unit-library/runtime/multipage',existing={
    '.png.meta':{...Bake.textureMeta(base+'.png',4096,4096),uuid:'authored-page-zero',filterMode:'nearest',future:{keep:7}},
    '_1.png.meta':{...Bake.textureMeta(base+'_1.png',4096,256),uuid:'authored-page-one',future:{keep:8}},
    '.json.meta':{ver:'custom',uuid:'authored-skeleton',importer:'spine',textures:['old-texture'],future:{keep:9}}
  };
  for(const [suffix,metadata]of Object.entries(existing)){const file=path.join(f.root,base+suffix);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify(metadata));}
  const result=Bake.bake(f.root,{base:{currentModel:true,type:'enemy',id:'fixture'},parts:[]},'multipage',{height:1100},new Map(),f.read,{description:{layers:[f.layer],fitHeight:1100}});
  const metadata=verifyFiles(result,base,f.pictures);assert.equal(result.uuid,'authored-skeleton');assert.deepEqual(metadata.textures,['authored-page-zero','authored-page-one']);assert.equal(metadata.future.keep,9);
  for(const [index,id]of ['authored-page-zero','authored-page-one'].entries()){const image=JSON.parse(result.files.get(base+(index?'_1':'')+'.png.meta'));assert.equal(image.uuid,id);assert.equal(image.future.keep,index+7);assert(Object.values(image.subMetas).every(frame=>frame.rawTextureUuid===id));}
  assert.deepEqual(JSON.parse(result.files.get(base+'.json')).animations,f.rig.animations,'Atlas paging leaves gameplay animation/event data unchanged.');
});

test('hero equipment baking retains original geometry and animation data across native atlas pages',t=>{
  const f=fixture(t),profile={base:{type:'item'},parts:[{id:'first',layer:f.layer.uuid,slot:'first',bone:'root',sprite:'first',x:0,y:0,rotation:0,scaleX:1,scaleY:1,opacity:1,hideSlots:[]}]};
  const assets=new Map([['first',{id:'first',image:'first.png',width:1200,height:1100}]]),result=Hero.bake(f.root,profile,'multipage-item',{layers:[f.layer]},assets,f.read);
  const base='assets/resources/hero-items/baked/multipage-item_head';verifyFiles(result,base,{item_first:f.pictures.first,second:f.pictures.second});
  const rig=JSON.parse(result.files.get(base+'.json'));assert.deepEqual(rig.animations,f.rig.animations);assert.deepEqual(rig.bones,f.rig.bones);assert.deepEqual(result.bakedLayers[f.layer.uuid],{resource:base.slice('assets/resources/'.length),uuid:JSON.parse(result.files.get(base+'.json.meta')).uuid});
});
