'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../../..'),Picker=require('../panel/icon-picker'),Assets=require('../lib/asset-validation'),Args=require('../../../assets/_script/ArgsParseUtils').ArgsParseUtils;
const folder=path.join(root,'assets/resources/Relic Icons');

test('all fifty relic icons are 128px RGBA sprites with stable full-canvas frames',()=>{
  const files=fs.readdirSync(folder).filter(name=>name.endsWith('.png')).sort();
  assert.equal(files.length,50);
  const uuids=new Set();
  for(const file of files){
    const png=fs.readFileSync(path.join(folder,file)),meta=JSON.parse(fs.readFileSync(path.join(folder,file+'.meta'),'utf8'));
    assert.deepEqual([...png.subarray(0,8)],[137,80,78,71,13,10,26,10],file);
    assert.equal(png.readUInt32BE(16),128,file);assert.equal(png.readUInt32BE(20),128,file);assert.equal(png[25],6,file+' must preserve RGBA');
    assert.equal(meta.type,'sprite',file);assert.equal(meta.width,128,file);assert.equal(meta.height,128,file);
    const frame=meta.subMetas[path.basename(file,'.png')];
    assert.equal(frame.importer,'sprite-frame',file);assert.equal(frame.rawTextureUuid,meta.uuid,file);assert.equal(frame.trimType,'none',file);
    assert.equal(frame.rawWidth,128,file);assert.equal(frame.rawHeight,128,file);assert.equal(frame.width,128,file);assert.equal(frame.height,128,file);
    for(const id of [meta.uuid,frame.uuid]){assert(!uuids.has(id),file+' duplicate UUID');uuids.add(id);}
  }
});

test('every authored relic uses a unique loadable icon in both config copies',()=>{
  const current=JSON.parse(fs.readFileSync(path.join(root,'assets/KinghtFallConfig/GameJsonCfg.json'),'utf8'));
  const generic=JSON.parse(fs.readFileSync(path.join(root,'assets/configs/GameJsonCfg.json'),'utf8'));
  assert.equal(current.TreasureCfg.length,50);
  const references=new Set();
  for(const relic of current.TreasureCfg){
    const goods=current.GoodsCfg[relic.goodID],reference=goods.icon;
    assert.equal(goods.itemID,relic.ID);assert(reference.startsWith('@icon/Relic Icons/'),reference);assert(!references.has(reference),reference);references.add(reference);
    assert.equal(generic.GoodsCfg[relic.goodID].icon,reference);
    for(const prefix of ['','icon/']){
      const args=Args._makeloadSpriteFrameResrgs('KinghtFallIconGood',prefix+reference,()=>{});
      assert.equal(args.bundle,'resources');assert.equal(args.path,reference.slice(6));
      assert.doesNotThrow(()=>Assets.imported(root,args.bundle,args.path,'sprite'));
    }
  }
});

test('Relic Icons is the final collection, includes all fifty assets and preserves spaced paths',()=>{
  const images=require('../lib/assets').index(root).images;
  const stats={name:'Health',path:'assets/resources/Stats Icons/health.png',reference:'@icon/Stats Icons/health'};
  const custom={name:'Future',path:'assets/resources/icons/future-pack/future.png',reference:'@icon/icons/future-pack/future'};
  const library=Picker.createLibrary(images.concat(stats,custom)),collection=library.root.children.at(-1);
  assert.equal(collection.name,'Relic Icons');assert.equal(collection.count,50);assert.equal(collection.assets.length,50);
  assert.equal(library.root.children.at(-2).name,'Stats Icons');
  assert.deepEqual(Picker.folders({path:'assets\\resources\\Relic Icons\\01-revive-token.png'}),['Relic Icons']);
  assert.equal(library.search('relic icons revive token')[0].asset.reference,'@icon/Relic Icons/01-revive-token');
});
