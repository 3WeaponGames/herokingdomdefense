const fs=require('fs');const rows=JSON.parse(fs.readFileSync('tools/localization/layout-audit.json','utf8'));const out=[];
for(const row of rows){if(row.kind!=='cc.Label')continue;const d=JSON.parse(fs.readFileSync(row.f)),label=d[row.i],node=d[label.node.__id__],tr=node._trs?.array||[0,0,0,0,0,0,1,1,1,1];let sx=Math.abs(tr[7]||1),x=tr[0]||0;let parent=d[node._parent?.__id__],pw=parent?._contentSize?.width||0;let aw=pw?((pw/2-Math.abs(x))*2-12)/sx:0;
let target=Math.max(row.width,aw>0?aw:row.width);if(target>600)target=600;
// Deliberate containers: side badges and bottom tabs should stay within their controls.
if(row.path.includes('/ndBtnLeft/')||row.path.includes('/ndBtnRight/'))target=210;
if(row.path.includes('/ndBottom/'))target=164;
if(row.path.includes('/effectNode/')||row.path.includes('/musicNode/'))target=220;
if(row.path.includes('/ndPersonInfo/')&&['恢复','移动','攻击','疾风'].includes(row.zh))target=154;
if(row.estimatedEnglishWidth>target*1.02){out.push({asset:row.f,component:row.i,nodePath:row.path,key:row.key,en:row.text,zh:row.zh,originalFont:row.size,originalWidth:row.width,scaleX:sx,estimatedEnglishWidth:row.estimatedEnglishWidth,recommendedMaxWidth:Math.round(target),recommendedFontSize:Math.max(14,Math.floor(row.size*target/row.estimatedEnglishWidth)),horizontalAlign:row.align,note:'Keep transform/anchor/style; apply fitting only to non-Chinese locales. This is a static estimate; confirm in Cocos.'})}}
fs.writeFileSync('tools/localization/label-fit-recommendations.json',JSON.stringify(out,null,2));console.log(out.length);console.log(out.slice(0,15));
