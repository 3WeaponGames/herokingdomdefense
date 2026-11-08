'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),test=require('node:test'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..'),PNG=require('../../packages/hkd-characters/lib/png-atlas');
test('the requested 90 GUI icons and 320 pictograms have stable Cocos frames and only 128px textures',()=>{
 const pictograms=require('./pictograms.catalog.json'),other=require('./gui-pro.catalog.json'),icons=pictograms.icons.concat(other.icons),ids=new Set();assert.equal(pictograms.icons.length,320);assert.equal(other.icons.length,90);
 for(const icon of icons){const bytes=fs.readFileSync(path.join(root,icon.image)),meta=JSON.parse(fs.readFileSync(path.join(root,icon.image+'.meta')));assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),icon.sha256);assert.equal(bytes.readUInt32BE(16),128);assert.equal(bytes.readUInt32BE(20),128);assert.equal(meta.type,'sprite');assert.equal(meta.genMipmaps,false);assert(!ids.has(meta.uuid));ids.add(meta.uuid);assert(icon.reference.startsWith('@icon/icons/'));const frame=Object.values(meta.subMetas)[0];assert.equal(frame.width,128);assert.equal(frame.height,128);assert.equal(frame.rawTextureUuid,meta.uuid);}
});
test('GUI imports contain the requested icons and two lobby backgrounds without unrelated demo artwork',()=>{
 const catalog=require('./gui-pro.catalog.json');assert(catalog.icons.every(icon=>icon.source.startsWith('ResourcesData/Sprite/Component/Icon_ItemIcons(x2)/128/')));
 const folders=fs.readdirSync(path.join(root,'assets/resources/icons/GUI-Pro'),{withFileTypes:true}).filter(e=>e.isDirectory()).map(e=>e.name).sort();assert.deepEqual(folders,['Buttons','Icons']);assert(!catalog.icons.some(icon=>/rune/i.test(icon.source)));
 assert.deepEqual(fs.readdirSync(path.join(root,'assets/resources/icons/GUI-Pro/Buttons')).filter(name=>name.endsWith('.png')).sort(),['LobbyModeBlue.png','LobbyModeGold.png']);
});
test('all twelve monster head portraits include opaque artwork and transparent borders without source sprite changes',()=>{
 const exportTool=require('../characters/export-head-icons.cjs');assert.equal(Object.keys(exportTool.selections).length,12);
 for(const name of Object.keys(exportTool.selections)){const image=PNG.decode(fs.readFileSync(path.join(root,'assets/resources/icons/enemy-heads',name+'.png')));assert.equal(image.width,128);assert.equal(image.height,128);let pixels=0;for(let i=3;i<image.rgba.length;i+=4)if(image.rgba[i]>64)pixels++;assert(pixels>900,name);assert.equal(image.rgba[3],0);}
});
