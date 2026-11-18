'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const folder=path.resolve(__dirname,'../../assets/resources/gui-pro/loading'),Kit=require('./loading-bar-fixture.cjs');
test('GUI PRO loading bar retains the exact Slider17 artwork including its baked shadow and a valid Cocos slice center',()=>{
 const originals={frame:'2cdb1962a8d8526ced5747c586276b9c3243c0f4b5e83339e9c84a3d5452ae0f',fill:'d4a2af72c9c48f0c7afd2b73505fd4d195438945973dd843fff0702546179669'},ids=new Set();
 for(const name of ['frame','fill']){
  const bytes=fs.readFileSync(path.join(folder,name+'.png')),meta=JSON.parse(fs.readFileSync(path.join(folder,name+'.png.meta'))),sprite=meta.subMetas[name];
  assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),originals[name]);
  assert.equal(meta.width,bytes.readUInt32BE(16));assert.equal(meta.height,bytes.readUInt32BE(20));assert.equal(sprite.trimType,'none');assert.equal(sprite.rawHeight,meta.height);assert.equal(sprite.borderTop,0);assert.equal(sprite.borderBottom,0);assert.equal(sprite.width-sprite.borderLeft-sprite.borderRight,1);
  for(const id of [meta.uuid,sprite.uuid]){assert(!ids.has(id));ids.add(id);}assert.equal(sprite.rawTextureUuid,meta.uuid);
  assert(Kit.data.some(item=>item.__type__==='cc.Sprite'&&item._spriteFrame.__uuid__===sprite.uuid&&item._type===1));
 }
});
test('the shared loading prefab preserves kit geometry, centered Lilita typography and black outline',()=>{
 const node=name=>Kit.data.find(item=>item.__type__==='cc.Node'&&item._name===name),root=node('Slider_LoadingBar'),fill=node('Fill'),text=node('Progress');
 assert.equal(root._contentSize.height,76);assert.equal(fill._contentSize.height,64);assert.equal(fill._anchorPoint.x,0);assert.equal(fill._trs.array[0],-root._contentSize.width/2+3);assert.equal(fill._trs.array[1],3);assert.equal(text._trs.array[0],0);assert.equal(text._trs.array[1],3);
 const label=Kit.data[text._components[0].__id__],outline=Kit.data[text._components[1].__id__];
 const catalog=JSON.parse(fs.readFileSync(path.resolve(folder,'../../localization/catalog.json'))),key=/^\[\[loc:([\w.-]+)\]\]$/.exec(label._string)?.[1];assert(key,'The authored initial caption must be localized');assert.equal(label['_N$string'],label._string);assert.equal(catalog.entries[key].en,'Loading...0%');assert.equal(catalog.entries[key].zh,'加载中...0%');assert.equal(label['_N$overflow'],1);for(const locale of ['en','zh']){const style=catalog.labelStyles[key][locale];assert.equal(style.fontSize,40);assert.equal(style.lineHeight,48);assert.equal(style.width,text._contentSize.width);assert.equal(style.height,text._contentSize.height);assert.equal(style.wrap,false);assert.equal(style.overflow,'CLAMP');}
 assert.equal(label.__type__,'cc.Label');assert.equal(label._fontSize,40);assert.equal(label['_N$horizontalAlign'],1);assert.equal(label['_N$verticalAlign'],1);assert.equal(label._enableWrapText,false);assert.equal(label._isSystemFontUsed,false);assert.equal(label['_N$file'].__uuid__,JSON.parse(fs.readFileSync(path.resolve(folder,'../../localization/fonts/Lilita One.ttf.meta'))).uuid);
 assert.equal(outline.__type__,'cc.LabelOutline');assert.equal(outline._width,3);assert.deepEqual([outline._color.r,outline._color.g,outline._color.b,outline._color.a],[0,0,0,255]);
});
