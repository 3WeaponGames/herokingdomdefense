'use strict';
// Author mobile typography into the existing editable localization layouts.
// Run without --apply to audit. Preview measured output before accepting changes.
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '../..');
const catalogFile = path.join(root, 'assets/resources/localization/catalog.json');
const catalog = JSON.parse(fs.readFileSync(catalogFile));
function files(dir) { return fs.readdirSync(dir, {withFileTypes:true}).flatMap(e => e.isDirectory() ? files(path.join(dir,e.name)) : [path.join(dir,e.name)]); }
const patch = { entries:{}, labelStyles:{}, nodeStyles:{}, nodePathStyles:{} }, report=[];
const originals = new Map();
const dataFiles = new Map();
function targetFor(file, nodePath, text) {
  if (/\/ndHp\/|ItemHp\.prefab|\/gmNode\/|\bgm\//.test(file+'/'+nodePath)) return 12;
  if (/\/ndBoxShow\/|\/ndBtnLeft\/|\/ndBtnRight\/|\/btnSubEnter\//.test(nodePath)) return 14;
  if (/KinghtFallUISignIn\/root\/ndDay7\/labName$/.test(nodePath)) return 14;
  if (/lab(Num|Power|Pro|Level|Time|Day)$|\/version$|labClose$/.test(nodePath) && !/<|[a-z]{8}/i.test(text)) return 14;
  if (/lab(Num|Power|Pro|Level)$|\/version$|labClose$|TEXT_LABEL|PLACEHOLDER_LABEL/.test(nodePath)) return 14;
  return 16;
}
for (const absolute of files(path.join(root,'assets')).filter(f => /\.(prefab|fire)$/.test(f))) {
  const file=path.relative(root,absolute).replaceAll('\\','/');
  const data=JSON.parse(fs.readFileSync(absolute));
  const uuid=JSON.parse(fs.readFileSync(absolute+'.meta')).uuid;
  function nodePath(n) { return n._parent ? nodePath(data[n._parent.__id__])+'/'+n._name : n._name; }
  function scale(n) { return (n._trs?.array?.[7]??1) * (n._parent ? scale(data[n._parent.__id__]) : 1); }
  for (let i=0;i<data.length;i++) {
    const label=data[i];if (!['cc.Label','cc.RichText'].includes(label.__type__)) continue;
    const node=data[label.node?.__id__];if (!node) continue;
    const p=nodePath(node), s=Math.abs(scale(node));if (s<.2) continue;
    const fileId=data[node._prefab?.__id__]?.fileId;
    const text=label._string||label._N$string||'';
    const token=text.match(/\[\[loc:([^\]]+)\]\]/)?.[1];
    const existing=catalog.nodeStyles?.[uuid+':'+fileId]||catalog.nodeStyles?.[fileId]||catalog.nodePathStyles?.[p]||token;
    const key=catalog.labelStyles?.[existing] ? existing : 'ui.mobile.'+path.basename(file,path.extname(file)).toLowerCase()+'.'+i;
    const entry=catalog.entries[token]||catalog.entries[existing]||{en:text,zh:text};
    const target=targetFor(file,p,entry.en||text);
    const base=label._fontSize||label._N$fontSize||40;
    const baseLine=label._lineHeight||label._N$lineHeight||base;
    const styles={};
    for (const language of ['en','zh']) {
      const old=catalog.labelStyles?.[existing]?.[language]||{};
      const oldFont=old.fontSize||base, font=Math.max(oldFont,Math.ceil(target/(s*.48)));
      const line=Math.max(old.lineHeight||baseLine,Math.ceil(font*1.15));
      const oldWidth=old.width??label._N$maxWidth??node._contentSize?.width??600;
      const parent=node._parent&&data[node._parent.__id__];
      const x=old.x??node._trs?.array?.[0]??0, sx=Math.abs(node._trs?.array?.[7]??1), anchor=node._anchorPoint?.x??.5;
      const pw=parent?._contentSize?.width||750, pa=parent?._anchorPoint?.x??.5;
      const left=-pw*pa+12,right=pw*(1-pa)-12;
      const available=(anchor===0?right-x:anchor===1?x-left:2*Math.min(x-left,right-x))/sx;
      const width=Math.ceil(Math.min(Math.max(oldWidth,available),Math.max(oldWidth,oldWidth*font/oldFont,140)));
      const numeric=/lab(Num|Power|Pro|Level)$/.test(p) || /\/ndHp\/|ItemHp\.prefab/.test(file+'/'+p);
      styles[language]={...old,fontSize:font,lineHeight:line};
      if(label.__type__==='cc.RichText') styles[language].width=Math.max(140,width);
      else Object.assign(styles[language],{width:Math.max(140,width),overflow:numeric?'NONE':'RESIZE_HEIGHT',wrap:!numeric});
      delete styles[language].maxLines;
      report.push({file,component:i,path:p,language,key,target,font,scale:s,css:font*s*.48,previousCss:oldFont*s*.48});
    }
    patch.labelStyles[key]=styles;
    if(!catalog.entries[key])patch.entries[key]={en:entry.en||'Label',zh:entry.zh||'Label',context:file+':'+p+' (mobile typography)'};
    if(fileId)patch.nodeStyles[uuid+':'+fileId]=key;
    patch.nodePathStyles[p]=key;
    // Source prefab sizes remain useful before localization initializes.
    const font=Math.max(base,Math.ceil(target/(s*.48)));
    if(font!==base){
      if(!originals.has(absolute))originals.set(absolute,fs.readFileSync(absolute));
      const fk=label.__type__==='cc.RichText'?'_N$fontSize':'_fontSize';
      const lk=label.__type__==='cc.RichText'?'_N$lineHeight':'_lineHeight';
      label[fk]=font;label[lk]=Math.max(baseLine,Math.ceil(font*1.15));dataFiles.set(absolute,data);
    }
  }
}
const out=path.join(root,'local/mobile-text-verification');fs.mkdirSync(out,{recursive:true});
fs.writeFileSync(path.join(out,'authored-font-audit.json'),JSON.stringify(report,null,2)+'\n');
if(process.argv.includes('--apply')){
  const patchFile=path.join(__dirname,'mobile-text-layout-patch.json');
  fs.writeFileSync(patchFile,JSON.stringify(patch,null,2)+'\n');
  for(const [file,data]of dataFiles){
    const backup=path.join(out,'before',path.relative(root,file));fs.mkdirSync(path.dirname(backup),{recursive:true});
    if(!fs.existsSync(backup))fs.writeFileSync(backup,originals.get(file));
    fs.writeFileSync(file,JSON.stringify(data,null,2)+'\n');
  }
  for(const relative of ['assets/resources/localization/catalog.json','tools/localization/layout-entries.json']){
    const file=path.join(root,relative),data=JSON.parse(fs.readFileSync(file));
    const backup=path.join(out,'before',relative);fs.mkdirSync(path.dirname(backup),{recursive:true});if(!fs.existsSync(backup))fs.copyFileSync(file,backup);
    for(const section of Object.keys(patch))Object.assign(data[section]||(data[section]={}),patch[section]);
    fs.writeFileSync(file,JSON.stringify(data,null,2)+'\n');
  }
}
console.log(JSON.stringify({labels:report.length/2,styles:Object.keys(patch.labelStyles).length,
  enlarged:report.filter(r=>r.language==='en'&&r.css>r.previousCss).length,prefabs:dataFiles.size,apply:process.argv.includes('--apply')}));
