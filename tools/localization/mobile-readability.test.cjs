'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const test=require('node:test');
const root=path.resolve(__dirname,'../..');
const catalog=JSON.parse(fs.readFileSync(path.join(root,'assets/resources/localization/catalog.json')));
function files(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(path.join(dir,e.name)):[path.join(dir,e.name)]);}

// Read the shipped display font's advances so a fixed, full-size title cannot
// silently start clipping when a longer authored relic name or font is added.
function displayAdvances(bytes){
  const tables={};
  for(let i=0;i<bytes.readUInt16BE(4);i++){const p=12+i*16;tables[bytes.toString('ascii',p,p+4)]=bytes.readUInt32BE(p+8);}
  const units=bytes.readUInt16BE(tables.head+18),metrics=bytes.readUInt16BE(tables.hhea+34),cmap=tables.cmap;
  let mapping;
  for(let i=0;i<bytes.readUInt16BE(cmap+2);i++){
    const p=cmap+4+i*8,start=cmap+bytes.readUInt32BE(p+4);
    if(bytes.readUInt16BE(start)===4&&bytes.readUInt16BE(p)===3&&bytes.readUInt16BE(p+2)===1){mapping=start;break;}
  }
  assert.ok(mapping,'The display font needs its Unicode BMP character map');
  const segments=bytes.readUInt16BE(mapping+6)/2,end=mapping+14,start=end+segments*2+2,delta=start+segments*2,ranges=delta+segments*2;
  return(text,size)=>{
    let width=0;
    for(const character of text){
      const code=character.codePointAt(0);let glyph=0;
      for(let i=0;i<segments;i++){
        if(code>bytes.readUInt16BE(end+i*2))continue;
        const first=bytes.readUInt16BE(start+i*2);if(code<first)break;
        const shift=bytes.readInt16BE(delta+i*2),range=bytes.readUInt16BE(ranges+i*2);
        glyph=range?bytes.readUInt16BE(ranges+i*2+range+(code-first)*2):code;
        if(glyph||!range)glyph=(glyph+shift)&65535;break;
      }
      assert.ok(glyph,'The display font must contain '+JSON.stringify(character));
      width+=bytes.readUInt16BE(tables.hmtx+Math.min(glyph,metrics-1)*4)*size/units;
    }
    return width;
  };
}
test('Every authored Label and RichText has readable mobile typography in both locales',()=>{
  let count=0;
  for(const file of files(path.join(root,'assets')).filter(f=>/\.(prefab|fire)$/.test(f))){
    const data=JSON.parse(fs.readFileSync(file)),uuid=JSON.parse(fs.readFileSync(file+'.meta')).uuid;
    function nodePath(n){return n._parent?nodePath(data[n._parent.__id__])+'/'+n._name:n._name;}
    function scale(n){return Math.abs(n._trs?.array?.[7]??1)*(n._parent?scale(data[n._parent.__id__]):1);}
    for(const label of data.filter(c=>c&&['cc.Label','cc.RichText'].includes(c.__type__))){
      const node=data[label.node.__id__],fid=data[node._prefab?.__id__]?.fileId;
      // Match LanguageMgr's prefab identity/path suffix/token precedence.
      // Keep legacy serialized path metadata for script-owned labels too.
      let key=fid&&(catalog.nodeStyles[uuid+':'+fid]||catalog.nodeStyles[fid]);
      const parts=[];
      for(let current=node;!key&&current;current=current._parent&&data[current._parent.__id__]){
        parts.unshift(current._name||'');
        key=catalog.nodePathStyles[parts.join('/')];
      }
      if(!key)key=catalog.nodePathStyles[nodePath(node)]||/\[\[loc:([\w.-]+)\]\]/.exec(label._string||label._N$string||'')?.[1];
      assert.ok(catalog.labelStyles[key],path.relative(root,file)+':'+nodePath(node)+' needs a layout');
      for(const language of ['en','zh']){
        const style=catalog.labelStyles[key][language];
        const font=style?.fontSize||label._fontSize||label._N$fontSize||40;
        assert.ok(font*scale(node)*360/750>=11.99,nodePath(node)+' '+language+' fell below the compact-text minimum');
        if(label.__type__==='cc.Label'){
          const footerTab=/^KinghtFallUIHome\/ndBottom\/Toggle[1-5]\/checkmark\/labName$/.test(nodePath(node));
          if(footerTab){assert.equal(style.wrap,false);assert.equal(style.overflow,'SHRINK');}
          else assert.notEqual(style.overflow,'SHRINK',nodePath(node)+' must wrap or grow instead of shrinking');
        }
      }
      count++;
    }
  }
  assert.ok(count>=335,'The audit must cover the full authored label set');
});
test('Primary captions and world-building names retain their readable defaults',()=>{
  for(const key of ['ui.layout.kinghtfalluinewmodular.35','ui.layout.kinghtfalluigame.201'])
    for(const language of ['en','zh'])assert.ok(catalog.labelStyles[key][language].fontSize*.5*.48>=15.99,key+' '+language);
  // The battle header intentionally makes the wave a smaller secondary line.
  for(const language of ['en','zh']){
    assert.equal(catalog.labelStyles['ui.mobile.kinghtfalluigame.241'][language].fontSize,54);
    assert.equal(catalog.labelStyles['ui.mobile.kinghtfalluigame.238'][language].fontSize,84);
  }
  for(const binding of Object.values(catalog.images).filter(b=>b.template?.startsWith('tile_'))){
    assert.ok(binding.readableText?.neutral,'Building captions need clean background art');
    assert.ok(binding.readableText.minimumCssPixels>=14,'World captions must not shrink into their image');
  }
});

test('fixed relic titles retain full readable size and fit every authored name before Close',()=>{
  const data=JSON.parse(fs.readFileSync(path.join(root,'assets/KinghtFallConfig/GameJsonCfg.json')));
  const measure=displayAdvances(fs.readFileSync(path.join(root,'assets/resources',catalog.fonts.en+'.ttf')));
  const styleKey='ui.layout.kinghtfalluitreasureinfo.8',instructionKey='ui.layout.kinghtfalluitreasureinfo.66';
  for(const language of ['en','zh']){
    const style=catalog.labelStyles[styleKey][language],instruction=catalog.labelStyles[instructionKey][language];
    assert.equal(style.overflow,'CLAMP');assert.equal(style.wrap,false);assert.equal(instruction.overflow,'CLAMP');assert.equal(instruction.wrap,false);
    assert.ok(style.fontSize*.5*.48>=16,'The title never shrinks below its authored primary-caption size');
    assert.ok(instruction.fontSize*.5*.48>=12,'The instruction retains the compact-text minimum');
    for(const relic of data.TreasureCfg){
      const marker=data.GoodsCfg[relic.goodID].name,key=/^\[\[loc:([^\]]+)\]\]$/.exec(marker)?.[1],name=catalog.entries[key]?.[language];
      assert.ok(name,'Every authored relic has a localized title');
      // Latin uses exact advances plus a small allowance for ink/kerning;
      // Chinese uses the conservative full-em width for every character.
      const width=language==='en'?measure(name,style.fontSize)*1.05:Array.from(name).length*style.fontSize;
      assert.ok(width+8<=style.width,`${language}: ${name} must fit at full size rather than clip or shrink`);
    }
  }
});
