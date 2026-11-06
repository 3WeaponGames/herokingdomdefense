const fs=require('fs'),path=require('path');const catFile='tools/localization/text-entries.json',cat=JSON.parse(fs.readFileSync(catFile)),bundle=JSON.parse(fs.readFileSync('tools/localization/layout-entries.json')),rows=JSON.parse(fs.readFileSync('tools/localization/layout-audit.json'));let files=new Map();
for(let r of rows){if(r.kind!=='cc.Label')continue;let d=files.get(r.f)||JSON.parse(fs.readFileSync(r.f)),c=d[r.i],node=d[c.node.__id__],oldKey=c._string.match(/loc:([^\]]+)/)?.[1];if(!oldKey)continue;let key='ui.layout.'+path.basename(r.f,path.extname(r.f)).toLowerCase()+'.'+r.i;let e={...cat.entries[oldKey],context:r.f+':'+r.path+' (localized control layout)'};let style=bundle.labelStyles[key]?.en||{width:r.width,wrap:false,overflow:'SHRINK'};style.height=r.height;style.maxLines=1;
// Source multi-line text remains multiline. Long paragraphs need a readable text block.
if(e.en.includes('\n')){style.wrap=true;style.maxLines=Math.max(2,e.en.split('\n').length);style.height=Math.max(r.height,style.maxLines*r.lineHeight+12)}
if(r.path.includes('/ndBtnLeft/')||r.path.includes('/ndBtnRight/')){let names={'成就':'Achievements','通行证':'Battle Pass','在线奖励':'Playtime\nRewards','七日签到':'7-Day Login','添加桌面':'Shortcut','入口有奖':'Entry Rewards'};e.en=names[e.zh]||e.en;style={width:320,height:108,wrap:true,maxLines:2,fontSize:44,lineHeight:44,overflow:'SHRINK'};}
if(r.path.includes('/ndBoxShow/')&&r.path.endsWith('/labName')){e.en=({'通过关卡':'Stage\nCleared','主角未死亡':'Hero\nSurvived','主堡未受过攻击':'Castle\nUnharmed'})[e.zh]||e.en;style={width:220,height:104,wrap:true,maxLines:2,fontSize:44,lineHeight:44,overflow:'SHRINK'};}
if(r.path.includes('/ndTaskInfo/labName'))style={width:380,height:104,wrap:true,maxLines:2,fontSize:38,lineHeight:44,overflow:'SHRINK'};
if(r.path.includes('/btnSubPlay1/labName')){e.en='Wall Defense';style={width:330,height:62,wrap:false,maxLines:1,fontSize:42,lineHeight:44,overflow:'SHRINK'};}
if(r.path.includes('/btnSubPlay1/labInfo')){e.en='Chapter 4';style={width:280,height:62,wrap:false,maxLines:1,fontSize:40,lineHeight:42,overflow:'SHRINK'};}
if(r.path.includes('/btnLock/labNum')){e.en='Clear stage to upgrade';style={width:380,height:106,wrap:true,maxLines:2,fontSize:44,lineHeight:44,overflow:'SHRINK'};}
if(r.path.endsWith('/ndTask/labNoFinish')){e.en='Pending';style.width=180;}
if(r.path.endsWith('/New Layout/title'))style={width:1100,height:136,wrap:true,maxLines:2,fontSize:56,lineHeight:56,overflow:'SHRINK'};
if(r.path==='KinghtFallUISetting/root/effectLabel'){e.en='Reset Data';style.width=250;}
if(r.path==='UIReport/root/New EditBox/New Label1'){e.en='Your Issue';style.width=140;}
if(r.path==='UIReport/root/New EditBox/New Label'){e.en='Progress is saved locally. Clearing data erases it.';style={width:960,height:92,wrap:true,maxLines:2,fontSize:34,lineHeight:36,overflow:'SHRINK'};}
if(r.path.includes('/FalsePublicity/')){e.en='False Ads';style.width=110;}
if(r.path.includes('/Dataloss/')){e.en='Lost Data';style.width=110;}
if(r.path.includes('/GameStuck/')){e.en='Freezing';style.width=110;}
if(r.path.includes('/gmNode/')&&e.en.startsWith('Attack Speed'))e.en=e.en.replace('Attack Speed','Speed');
if(r.f.endsWith('loading.fire')&&e.zh.startsWith('\n')){style={width:1320,height:340,wrap:true,maxLines:5,fontSize:40,lineHeight:58,overflow:'SHRINK'};}
if(r.f.endsWith('loading.fire')&&e.zh==='《健康游戏忠告》')style={width:1000,height:84,wrap:false,maxLines:1,fontSize:52,lineHeight:60,overflow:'SHRINK'};
cat.entries[key]=e;bundle.entries[key]=e;bundle.labelStyles[key]={en:style};c._string='[[loc:'+key+']]';if(Object.hasOwn(c,'_N$string'))c._N$string=c._string;files.set(r.f,d);}
// Keep the root's +40 vertical adjustment; widen side margins symmetrically.
let f='assets/KinghtFallPrefabs/home/homectrl/KinghtFallHomeBattleCtrl.prefab';let actual=[...files.keys()].find(x=>x.replace(/\\/g,'/')===f),d=files.get(actual);d[158]._trs.array[0]=-287.4;d[230]._trs.array[0]=287.1;
// Sub-mode panel itself stays in the same position. Label widths are bounded above.
for(let [f,d]of files)fs.writeFileSync(f,JSON.stringify(d,null,2)+'\n');fs.writeFileSync(catFile,JSON.stringify(cat,null,2)+'\n');fs.writeFileSync('tools/localization/layout-entries.json',JSON.stringify(bundle,null,2)+'\n');console.log({styles:Object.keys(bundle.labelStyles).length,entries:Object.keys(cat.entries).length});
