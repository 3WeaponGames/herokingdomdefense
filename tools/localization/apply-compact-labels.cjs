const fs=require('fs'),path=require('path');const catPath='tools/localization/text-entries.json',cat=JSON.parse(fs.readFileSync(catPath)),inventory=require('./inventory.json');const layouts={entries:{},labelStyles:{}};let changed=[];
for(const f of [...new Set(inventory.labels.map(x=>x.f))]){let d=JSON.parse(fs.readFileSync(f,'utf8')),dirty=false;for(const row of inventory.labels.filter(x=>x.f===f&&x.k==='_string')){let label=d[row.i],node=d[label.node.__id__],key=label._string.match(/loc:([^\]]+)/)?.[1],entry=cat.entries[key];if(!entry)continue;let names=[],n=node;while(n&&n.__type__==='cc.Node'){names.unshift(n._name);n=d[n._parent?.__id__]}let np=names.join('/'),en;
if(np.includes('/ndBtnLeft/')||np.includes('/ndBtnRight/'))en=({'成就':'Feats','通行证':'Pass','在线奖励':'Rewards','七日签到':'7-Day Gifts','添加桌面':'Shortcut','入口有奖':'Bonus'})[entry.zh];
if(np.includes('/ndBottom/'))en=({'装备':'Gear'})[entry.zh];
if(np.includes('/effectNode/'))en=entry.zh==='音效'?'Sound':en;
if(np.includes('/ndPersonInfo/'))en=({'恢复':'Regen','移动':'Speed','疾风':'Haste'})[entry.zh]||en;
if(entry.zh==='需解锁前置天赋')en='Prerequisite locked';
if(en){let next='ui.layout.'+path.basename(f,'.prefab').toLowerCase()+'.'+row.i;cat.entries[next]={...entry,en,context:f+':'+np+' (compact English control label)'};layouts.entries[next]=cat.entries[next];label._string='[[loc:'+next+']]';if(Object.hasOwn(label,'_N$string'))label._N$string=label._string;dirty=true;}}
if(dirty){fs.writeFileSync(f,JSON.stringify(d,null,2)+'\n');changed.push(f)}}
fs.writeFileSync(catPath,JSON.stringify(cat,null,2)+'\n');fs.writeFileSync('tools/localization/layout-entries.json',JSON.stringify(layouts,null,2)+'\n');console.log(changed);
