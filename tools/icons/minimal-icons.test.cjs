'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict'),{test}=require('node:test');
const root=path.resolve(__dirname,'../..');
function walk(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?walk(path.join(dir,entry.name)):[path.join(dir,entry.name)]);}

for(const pack of [
  {name:'Minimal',catalog:'minimal-pack.catalog.json',folder:'2d-minimal',count:900,example:'Economy/Economy_Coin_04_Gold.png'},
  {name:'Hero Equipment',catalog:'hero-equipment.catalog.json',folder:'2d-minimal-hero-equipment',count:60,example:'Armor/Armor_HelmGolden.png'}
]){
const catalog=require('./'+pack.catalog),library=path.join(root,'assets/resources/icons',pack.folder);
test(`all ${pack.count} ${pack.name} icons retain original 128px PNGs and complete, unique Creator SpriteFrames`,()=>{
  assert.equal(catalog.resolution,128);assert.equal(catalog.icons.length,pack.count);
  assert.equal(Object.values(catalog.categories).reduce((a,b)=>a+b,0),pack.count);
  const paths=new Set(),ids=new Set(),counts={};
  for(const icon of catalog.icons){
    const file=path.resolve(root,icon.path);assert(file.startsWith(library+path.sep));
    assert.equal(path.relative(library,file).replace(/\\/g,'/'),icon.category+'/'+icon.name+'.png');
    assert(!paths.has(file.toLowerCase()));paths.add(file.toLowerCase());counts[icon.category]=(counts[icon.category]||0)+1;
    const bytes=fs.readFileSync(file),meta=JSON.parse(fs.readFileSync(file+'.meta'));
    assert.equal(bytes.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
    assert.equal(bytes.readUInt32BE(16),128);assert.equal(bytes.readUInt32BE(20),128);
    assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),icon.sha256);
    assert.match(icon.unityGuid,/^[a-f0-9]{32}$/i);assert.equal(meta.importer,'texture');assert.equal(meta.type,'sprite');
    const frames=Object.values(meta.subMetas);assert.equal(frames.length,1);
    const frame=frames[0];assert.equal(frame.importer,'sprite-frame');assert.equal(frame.rawTextureUuid,meta.uuid);
    assert.equal(frame.trimType,'none');assert.equal(frame.width,128);assert.equal(frame.height,128);
    assert.equal(frame.rawWidth,128);assert.equal(frame.rawHeight,128);
    for(const uuid of [meta.uuid,frame.uuid]){assert(uuid&&!ids.has(uuid));ids.add(uuid);}
  }
  assert.deepEqual(counts,catalog.categories);
  const files=walk(library);assert.equal(files.filter(file=>file.endsWith('.png')).length,pack.count);
  assert(files.every(file=>/\.(png|meta)$/.test(file)),'runtime icon folders contain sprites and metadata only');
});

test(`every ${pack.name} icon is discoverable in the existing chooser and resolves as a runtime resource`,()=>{
  const index=require('../../packages/game-data-editor/lib/assets').index(root);
  const imported=require('../../packages/game-data-editor/lib/asset-validation').imported;
  const prefix='assets/resources/icons/'+pack.folder+'/';
  const files=index.images.filter(image=>image.path.startsWith(prefix));
  assert.equal(files.length,pack.count);
  const byPath=new Map(files.map(file=>[file.path,file]));
  for(const icon of catalog.icons){
    const asset=byPath.get(icon.path);assert(asset);assert.equal(asset.name,icon.name);assert.equal(asset.reference,icon.reference);
    assert.equal(asset.resource,icon.reference.slice('@icon/'.length));
    assert.equal(imported(root,'resources',icon.reference,'sprite').file,path.join(root,icon.path));
  }
  for(const [category,count]of Object.entries(catalog.categories))assert.equal(files.filter(file=>file.path.startsWith(prefix+category+'/')).length,count);
  assert(byPath.has(prefix+pack.example));
});
}
