'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const test=require('node:test');
const root=path.resolve(__dirname,'../..');
const catalog=JSON.parse(fs.readFileSync(path.join(root,'assets/resources/localization/catalog.json')));
function files(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(path.join(dir,e.name)):[path.join(dir,e.name)]);}
test('Every authored Label and RichText has readable mobile typography in both locales',()=>{
  let count=0;
  for(const file of files(path.join(root,'assets')).filter(f=>/\.(prefab|fire)$/.test(f))){
    const data=JSON.parse(fs.readFileSync(file)),uuid=JSON.parse(fs.readFileSync(file+'.meta')).uuid;
    function nodePath(n){return n._parent?nodePath(data[n._parent.__id__])+'/'+n._name:n._name;}
    function scale(n){return Math.abs(n._trs?.array?.[7]??1)*(n._parent?scale(data[n._parent.__id__]):1);}
    for(const label of data.filter(c=>['cc.Label','cc.RichText'].includes(c.__type__))){
      const node=data[label.node.__id__],fid=data[node._prefab?.__id__]?.fileId;
      const key=catalog.nodeStyles[uuid+':'+fid]||catalog.nodeStyles[fid]||catalog.nodePathStyles[nodePath(node)];
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
  for(const key of ['ui.layout.kinghtfalluinewmodular.35','ui.mobile.kinghtfalluigame.241','ui.layout.kinghtfalluigame.201'])
    for(const language of ['en','zh'])assert.ok(catalog.labelStyles[key][language].fontSize*.5*.48>=15.99,key+' '+language);
  for(const binding of Object.values(catalog.images).filter(b=>b.template?.startsWith('tile_'))){
    assert.ok(binding.readableText?.neutral,'Building captions need clean background art');
    assert.ok(binding.readableText.minimumCssPixels>=14,'World captions must not shrink into their image');
  }
});
