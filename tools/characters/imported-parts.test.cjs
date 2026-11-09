'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict'),{test}=require('node:test');
const root=path.resolve(__dirname,'../..'),catalog=require('../../assets/resources/character-parts/catalog.json');
test('all 678 imported parts retain original PNG bytes, Cocos sprite metadata, dimensions and unique IDs',()=>{
  const imported=catalog.parts.filter(part=>!part.id.startsWith('Hero/'));assert.equal(imported.length,678);const ids=new Set(),uuids=new Set();
  for(const part of imported){assert(!ids.has(part.id));ids.add(part.id);const file=path.resolve(root,part.image);assert(file.startsWith(path.join(root,'assets/resources/character-parts')+path.sep));const bytes=fs.readFileSync(file),meta=JSON.parse(fs.readFileSync(file+'.meta'));
    assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),part.sha256);assert.equal(bytes.readUInt32BE(16),part.width);assert.equal(bytes.readUInt32BE(20),part.height);assert.equal(meta.importer,'texture');assert.equal(meta.type,'sprite');assert(!uuids.has(meta.uuid));uuids.add(meta.uuid);
    const sprite=Object.values(meta.subMetas)[0];assert.equal(sprite.rawTextureUuid,meta.uuid);assert.equal(sprite.rawWidth,part.width);assert.equal(sprite.rawHeight,part.height);assert(fs.existsSync(path.join(root,part.thumbnail)));
  }
});
test('all 635 imported thumbnail PNGs have their own Cocos metadata',()=>{
  function walk(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(v=>v.isDirectory()?walk(path.join(dir,v.name)):[path.join(dir,v.name)]);}
  const images=walk(path.join(root,'assets/resources/character-parts/Thumbnail')).filter(f=>f.endsWith('.png'));assert.equal(images.length,635);for(const image of images)assert.equal(JSON.parse(fs.readFileSync(image+'.meta')).type,'sprite');
});
