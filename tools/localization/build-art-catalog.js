'use strict';
// Art translations and measured source coordinates. Run after audit-art.py.
const fs=require('fs'), path=require('path');
const root=path.resolve(__dirname,'../..');
const inventory=JSON.parse(fs.readFileSync(path.join(root,'local/localization-art-audit/inventory.json'),'utf8'));
const font='assets/resources/localization/fonts/NotoSansSC-Black.ttf';
const out={entries:{},images:{},spineImages:{},artTemplates:{}};
const enzh=(id,en,zh,context)=>{out.entries[id]={en,zh,context};return id;};
const region=(key,x,y,width,height,style={})=>Object.assign({key,rect:{x,y,width,height},font,fontSize:height*.8,minFontSize:6,color:'#ffffff',outlineColor:'#16150f',outlineWidth:2,align:'center'},style);
function template(name,index,regions,props={}) {
  const src=inventory[index];
  out.artTemplates[name]=Object.assign({width:src.size[0],height:src.size[1],regions,sourceOriginal:src.path},props);
  Object.values(src.frames).forEach(uuid=>out.images[uuid]={key:regions[0].key,template:name,preserveOriginal:{zh:regions.map(r=>out.entries[r.key].zh).join('\n')},source:src.path});
  return out.artTemplates[name];
}
const buffs=[['attack_speed_up','Attack Speed Up','攻速提升'],['attack_up','Attack Up','攻击提升'],['projectiles_up','More Shots','弹道提升'],['heal','Heal','生命回复'],['attack_speed_down','Attack Speed Down','攻速下降'],['projectiles_down','Fewer Shots','弹道减少'],['health_down','Health Down','生命减少'],['weapon_up','Weapon Up','武器强化']];
buffs.forEach((b,i)=>template('buff_'+b[0],56+i,[region(enzh('art.buff.'+b[0],b[1],b[2],'Floating combat buff artwork'),3,3,123,36,{fontSize:29,gradient:i===2||i===3?['#ffffff','#55ff4b']:i===4?['#ffffff','#89afb2']:i===5||i===6?['#ffffff','#ff4646']:['#ffffff','#fff346'],outlineWidth:3,shadow:{color:'#000000',offsetX:0,offsetY:1,blur:0}})]));
template('new_badge',253,[region(enzh('art.badge.new','New!','新的!','New item badge'),4,2,77,34,{fontSize:29,gradient:['#58ffff','#8df4ff','#fd6bd8','#ffdd53'],outlineWidth:3,italic:true})]);
template('buy_gems',516,[region(enzh('art.energy.gems','Buy with Gems','钻石购买','Energy purchase header'),3,3,150,36,{fontSize:32,gradient:['#ffffff','#92e7ff'],outlineWidth:3})]);
template('watch_ad',517,[region(enzh('art.energy.ad','Watch an Ad','视频购买','Energy ad header'),3,3,150,36,{fontSize:32,gradient:['#ffffff','#ffef31'],outlineWidth:3})]);
template('level_pass',609,[region(enzh('art.pass.title','Level Pass','等级通行证','Pass banner'),90,194,230,54,{fontSize:39,gradient:['#ffffff','#30d8ff'],outlineWidth:3})],{source:'assets/resources/localization/neutral/pass.png'});
template('day7',636,[region(enzh('art.sign.day7','Day 7:\nClaim the Grand Prize!','第七天即可\n领取豪华大奖!','Seven-day sign-in special reward banner'),47,57,323,91,{fontSize:31,gradient:['#ffffff','#fff44c'],outlineWidth:3,italic:true})],{source:'assets/resources/localization/neutral/day7.png'});
template('submit',699,[region(enzh('art.feedback.submit','Submit','提交','Feedback submit button'),80,8,324,54,{fontSize:29,outlineWidth:0})],{background:{type:'roundedRect',fill:'#fb3959',radius:5}});
template('submitted',705,[region(enzh('art.feedback.success','Submitted','提交成功','Feedback success toast'),11,7,138,46,{fontSize:27,outlineWidth:0})],{background:{type:'roundedRect',fill:'#4b4e56',radius:8}});
// Source maps to original SpriteFrame IDs. Runtime preserves node position, anchor,
// dimensions, rotation and scale; the generated file has exactly original pixels.
const tiles=[['by','Barracks','兵营'],['cq','Wall','城墙'],['fw','House','房屋'],['jt','Tower','箭塔'],['mf','Mill','磨坊'],['zc','Castle','主城']];
tiles.forEach((b,i)=>['','_'].forEach((suffix,j)=>{
  const key=enzh('art.build.'+b[0],b[1],b[2],'Isometric construction plot');
  const quad=j?[{x:23,y:45},{x:88,y:79},{x:70,y:90},{x:5,y:56}]:[{x:76,y:73},{x:139,y:37},{x:157,y:47},{x:94,y:84}];
  template('tile_'+b[0]+suffix,314+i*2+j,[region(key,0,0,90,26,{fontSize:24,minFontSize:11,outlineColor:'#626346',outlineWidth:2,quad})],{source:'assets/resources/localization/neutral/tile_'+b[0]+suffix+'.png'});
}));
const spineTitles=[
 ['victory','Victory','胜利',{x:1436,y:82,width:125,height:69}],
 ['defeat','Defeat','失败',{x:1436,y:153,width:127,height:70}]
];
out.artTemplates.settlement_atlas={width:1566,height:1008,source:'assets/resources/localization/neutral/settlement_atlas.png',sourceOriginal:inventory[450].path,regions:spineTitles.map(([id,en,zh,r])=>region(enzh('art.result.'+id,en,zh,'Animated battle-result title'),r.x+2,r.y+2,r.width-4,r.height-4,{fontSize:54,outlineWidth:4,shadow:{color:'#000000',offsetX:2,offsetY:3,blur:0},gradient:['#ffffff','#e7e8dc']}))};
out.artTemplates.day7_atlas={width:285,height:518,source:'assets/resources/localization/neutral/day7_atlas.png',sourceOriginal:inventory[451].path,regions:[region('art.sign.day7',0,0,317,87,{fontSize:31,gradient:['#ffffff','#fff44c'],outlineWidth:3,italic:true,quad:[{x:196,y:516},{x:196,y:199},{x:283,y:199},{x:283,y:516}]})]};
for(const [index,name] of [[450,'settlement_atlas'],[451,'day7_atlas']]){
  const p=inventory[index].path;
  const texture=JSON.parse(fs.readFileSync(path.join(root,p+'.meta'),'utf8'));
  const skeleton=JSON.parse(fs.readFileSync(path.join(root,p.replace(/\.png$/,'.json.meta')),'utf8'));
  out.spineImages[texture.uuid]={template:name,skeletonDataUuid:skeleton.uuid,source:p,preserveOriginal:{zh:true}};
}
fs.writeFileSync(path.join(__dirname,'art-entries.json'),JSON.stringify(out,null,2)+'\n');
console.log(JSON.stringify({entries:Object.keys(out.entries).length,images:Object.keys(out.images).length,templates:Object.keys(out.artTemplates).length,spine:Object.keys(out.spineImages).length}));
