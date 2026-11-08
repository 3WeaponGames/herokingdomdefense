'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),test=require('node:test'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..'),PNG=require('../../packages/hkd-characters/lib/png-atlas');
test('the requested 90 GUI icons and 320 pictograms have stable Cocos frames and only 128px textures',()=>{
 const pictograms=require('./pictograms.catalog.json'),other=require('./gui-pro.catalog.json'),icons=pictograms.icons.concat(other.icons),ids=new Set();assert.equal(pictograms.icons.length,320);assert.equal(other.icons.length,90);
 for(const icon of icons){const bytes=fs.readFileSync(path.join(root,icon.image)),meta=JSON.parse(fs.readFileSync(path.join(root,icon.image+'.meta')));assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),icon.sha256);assert.equal(bytes.readUInt32BE(16),128);assert.equal(bytes.readUInt32BE(20),128);assert.equal(meta.type,'sprite');assert.equal(meta.genMipmaps,false);assert(!ids.has(meta.uuid));ids.add(meta.uuid);assert(icon.reference.startsWith('@icon/icons/'));const frame=Object.values(meta.subMetas)[0];assert.equal(frame.width,128);assert.equal(frame.height,128);assert.equal(frame.rawTextureUuid,meta.uuid);}
});
test('GUI imports contain only the requested icons, lobby backgrounds and shop components',()=>{
 const catalog=require('./gui-pro.catalog.json');assert(catalog.icons.every(icon=>icon.source.startsWith('ResourcesData/Sprite/Component/Icon_ItemIcons(x2)/128/')));
 const folders=fs.readdirSync(path.join(root,'assets/resources/icons/GUI-Pro'),{withFileTypes:true}).filter(e=>e.isDirectory()).map(e=>e.name).sort();assert.deepEqual(folders,['Buttons','Icons','ShopCards']);assert(!catalog.icons.some(icon=>/rune/i.test(icon.source)));
 assert.deepEqual(fs.readdirSync(path.join(root,'assets/resources/icons/GUI-Pro/Buttons')).filter(name=>name.endsWith('.png')).sort(),['Btn_MainButton_Gray.png','Btn_MainButton_Sky.png','Frame_BarFrame_Top01_Navy.png','Icon_MenuIcon00_TabMenu_Focus.png','LobbyModeBlue.png','LobbyModeGold.png']);
 const cards=['Background_06','Common_Glow_Circle_White','Frame_CardFrame00_Base','Frame_CardFrame02_Frame','Frame_ItemFrame01_Color_Green','Frame_ListFrame11_Green','Frame_ListFrame12_Blue','Frame_ListFrame12_Purple','Frame_ListFrame12_Yellow','Frame_ListFrame14_n_Blue','Frame_ListFrame14_s','Icon_Chest','Icon_ImageIcon_Info','Icon_ImageIcon_Gem01_s','Icon_Potion01_Blue','Icon_ShopIcon_Gem0','Icon_ShopIcon_Gem1','Icon_ShopIcon_Gem2','Icon_ShopIcon_Gem3','Icon_ShopIcon_Gem4','Icon_ShopIcon_GemBox','Icon_ShopIcon_Gold0','Icon_ShopIcon_Gold1','Icon_ShopIcon_Gold2','Icon_ShopIcon_Gold3','Label_LeftLabel02','StatusBarIcon_Gold','fx_rotate_line_small'];
 assert.deepEqual(fs.readdirSync(path.join(root,'assets/resources/icons/GUI-Pro/ShopCards')).filter(name=>name.endsWith('.png')).sort(),cards.map(name=>name+'.png').sort());
});
test('all twelve monster head portraits include opaque artwork and transparent borders without source sprite changes',()=>{
 const exportTool=require('../characters/export-head-icons.cjs');assert.equal(Object.keys(exportTool.selections).length,12);
 for(const name of Object.keys(exportTool.selections)){const image=PNG.decode(fs.readFileSync(path.join(root,'assets/resources/icons/enemy-heads',name+'.png')));assert.equal(image.width,128);assert.equal(image.height,128);let pixels=0;for(let i=3;i<image.rgba.length;i+=4)if(image.rgba[i]>64)pixels++;assert(pixels>900,name);assert.equal(image.rgba[3],0);}
});
