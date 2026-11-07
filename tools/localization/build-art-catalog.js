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
  Object.values(src.frames).forEach(uuid=>out.images[uuid]={key:regions[0].key,template:name,preserveOriginal:{zh:regions.length===1?out.entries[regions[0].key].zh:Object.fromEntries(regions.map(r=>[r.key,out.entries[r.key].zh]))},source:src.path});
  return out.artTemplates[name];
}
const buffs=[['attack_speed_up','ATK SPD +','攻速提升'],['attack_up','ATK +','攻击提升'],['projectiles_up','More Shots','弹道提升'],['heal','Heal','生命回复'],['attack_speed_down','ATK SPD −','攻速下降'],['projectiles_down','Fewer Shots','弹道减少'],['health_down','HP −','生命减少'],['weapon_up','Weapon +','武器强化']];
buffs.forEach((b,i)=>template('buff_'+b[0],56+i,[region(enzh('art.buff.'+b[0],b[1],b[2],'Floating combat buff artwork'),3,3,123,36,{fontSize:29,padding:3,lineHeightRatio:1,gradient:i===2||i===3?['#ffffff','#55ff4b']:i===4?['#ffffff','#89afb2']:i===5||i===6?['#ffffff','#ff4646']:['#ffffff','#fff346'],outlineWidth:3,shadow:{color:'#000000',offsetX:0,offsetY:1,blur:0}})]));
template('new_badge',253,[region(enzh('art.badge.new','New!','新的!','New item badge'),4,2,77,34,{fontSize:29,padding:3,lineHeightRatio:1,gradient:['#58ffff','#8df4ff','#fd6bd8','#ffdd53'],outlineWidth:3,italic:true})]);
template('buy_gems',516,[region(enzh('art.energy.gems','Buy with Gems','钻石购买','Energy purchase header'),3,3,150,36,{fontSize:32,gradient:['#ffffff','#92e7ff'],outlineWidth:3})]);
template('watch_ad',517,[region(enzh('art.energy.ad','Watch an Ad','视频购买','Energy ad header'),3,3,150,36,{fontSize:32,gradient:['#ffffff','#ffef31'],outlineWidth:3})]);
template('level_pass',609,[region(enzh('art.pass.title','Battle Pass','等级通行证','Pass banner'),90,194,230,54,{fontSize:39,gradient:['#ffffff','#30d8ff'],outlineWidth:3})],{source:'assets/resources/localization/neutral/pass.png'});
template('day7',636,[region(enzh('art.sign.day7','Day 7:\nClaim the Grand Prize!','第七天即可\n领取豪华大奖!','Seven-day sign-in special reward banner'),47,57,323,91,{fontSize:31,gradient:['#ffffff','#fff44c'],outlineWidth:3,italic:true})],{source:'assets/resources/localization/neutral/day7.png'});
template('submit',699,[region(enzh('art.feedback.submit','Submit','提交','Feedback submit button'),80,8,324,54,{fontSize:29,outlineWidth:0,locales:{en:{font:null,fontFamily:'Arial',bold:false}}})],{background:{type:'roundedRect',fill:'#fb3959',radius:5}});
template('submitted',705,[region(enzh('art.feedback.success','Submitted','提交成功','Feedback success toast'),11,7,138,46,{fontSize:27,outlineWidth:0,locales:{en:{font:null,fontFamily:'Arial',bold:false}}})],{background:{type:'roundedRect',fill:'#4b4e56',radius:8}});
// Source maps to original SpriteFrame IDs. Runtime preserves node position, anchor,
// dimensions, rotation and scale; the generated file has exactly original pixels.
const tiles=[['by','Barracks','兵营'],['cq','Wall','城墙'],['fw','House','房屋'],['jt','Tower','箭塔'],['mf','Mill','磨坊'],['zc','Castle','主城']];
tiles.forEach((b,i)=>['','_'].forEach((suffix,j)=>{
  const key=enzh('art.build.'+b[0],b[1],b[2],'Isometric construction plot');
  const quad=j?[{x:40,y:33},{x:97,y:66},{x:74,y:84},{x:13,y:49}]:[{x:73,y:66},{x:130,y:33},{x:157,y:49},{x:96,y:84}];
  template('tile_'+b[0]+suffix,314+i*2+j,[region(key,0,0,90,26,{fontSize:31,minFontSize:12,padding:1,lineHeightRatio:1,outlineColor:'#626346',outlineWidth:2.5,quad})],{source:'assets/resources/localization/neutral/tile_'+b[0]+suffix+'.png'});
}));
const spineTitles=[
 ['victory','VICTORY','胜利',{x:1436,y:82,width:125,height:69}],
 ['defeat','Defeat','失败',{x:1436,y:153,width:127,height:70}]
];
out.artTemplates.settlement_atlas={width:1566,height:1008,source:'assets/resources/localization/neutral/settlement_atlas.png',sourceOriginal:inventory[450].path,regions:spineTitles.map(([id,en,zh,r])=>region(enzh('art.result.'+id,en,zh,'Animated battle-result title'),r.x+2,r.y+2,r.width-4,r.height-4,{fontSize:54,outlineWidth:4,locales:{en:{baselineOffset:id==='victory'?-4:0}},shadow:{color:'#000000',offsetX:2,offsetY:3,blur:0},gradient:['#ffffff','#e7e8dc']}))};
// This title is enlarged 1.75x by its existing English Spine binding: keep the
// final outline near the buttons' 3px edge instead of magnifying a 5px stroke.
Object.assign(out.artTemplates.settlement_atlas.regions[0].locales.en, {
  font:'assets/resources/localization/fonts/Lilita One.ttf', outlineWidth:1.7,
  outlineColor:'#000000', padding:3.5, wrap:false, gradient:null,
  shadow:{color:'#000000',offsetX:0,offsetY:1.7,blur:0}
});
out.artTemplates.day7_atlas={width:285,height:518,source:'assets/resources/localization/neutral/day7_atlas.png',sourceOriginal:inventory[451].path,regions:[region('art.sign.day7',0,0,317,87,{fontSize:31,gradient:['#ffffff','#fff44c'],outlineWidth:3,italic:true,quad:[{x:196,y:516},{x:196,y:199},{x:283,y:199},{x:283,y:516}]})]};
for(const [index,name] of [[450,'settlement_atlas'],[451,'day7_atlas']]){
  const p=inventory[index].path;
  const texture=JSON.parse(fs.readFileSync(path.join(root,p+'.meta'),'utf8'));
  const skeleton=JSON.parse(fs.readFileSync(path.join(root,p.replace(/\.png$/,'.json.meta')),'utf8'));
  out.spineImages[texture.uuid]={template:name,skeletonDataUuid:skeleton.uuid,source:p,preserveOriginal:{zh:Object.fromEntries(out.artTemplates[name].regions.map(r=>[r.key,out.entries[r.key].zh]))}};
  if(name==='settlement_atlas')out.spineImages[texture.uuid].boneScales={en:{sl5:1.75}};
}
const relics=[
 ['02',273,'slow','Slow','慢',44,39,36,44,'#ec3838',15],
 ['04',275,'tax','Tax','税收',50,31,35,56,'#f4ded3',20],
 ['06',277,'increase','+','增',45,39,34,44,'#feff54',32],
 ['08',279,'split','Split','分',43,37,38,46,'#511e14',15],
 ['09',280,'save','Save','省',42,37,39,47,'#d5f9ff',15]
];
relics.forEach(([suffix,index,id,en,zh,x,y,w,h,color,size])=>template('relic_'+suffix,index,[region(enzh('art.relic.'+id,en,zh,'Editable glyph on relic parchment; full item meaning appears in its tooltip'),x,y,w,h,{fontSize:size,minFontSize:8,color,outlineWidth:0,padding:1,wrap:false,angle:suffix==='04'?-14:suffix==='09'?26:18})],{source:'assets/resources/localization/neutral/relic_'+suffix+'.png'}));
template('age_rating',686,[region(enzh('art.age.caption','Age Rating','适龄提示','Age guidance badge caption'),18,203,166,39,{fontSize:29,minFontSize:12,color:'#000000',outlineWidth:0,padding:1,wrap:false})],{source:'assets/resources/localization/neutral/age_rating.png'});
template('feedback_icon',696,[region(enzh('art.feedback.icon','Feedback','反馈与投诉','Home feedback icon caption'),4,72,83,18,{fontSize:15,minFontSize:10,color:'#000000',outlineWidth:0,padding:0,wrap:false,lineHeightRatio:1,locales:{en:{font:null,fontFamily:'Arial',bold:true}}})],{source:'assets/resources/localization/neutral/feedback_icon.png'});
const sidebar=[];
function side(id,en,zh,x,y,w,h,style){sidebar.push(region(enzh('art.sidebar.'+id,en,zh,'Sidebar reward guide, embedded instructional screenshot'),x,y,w,h,Object.assign({fontSize:24,minFontSize:8,color:'#101010',outlineWidth:0,padding:0,lineHeightRatio:1,wrap:false,font:null,fontFamily:'Arial'},style)));}
side('step1','1. Open the sidebar','1.点击侧边栏图标',0,0,515,37,{font,fontSize:30,color:'#595959',align:'left'});
side('step2','2. Open Claim the Castle','2.点击拿下一座城',0,203,515,35,{font,fontSize:29,color:'#595959',align:'left'});
side('step3','3. Claim your reward','3.领取奖励',0,536,515,37,{font,fontSize:30,color:'#595959',align:'left'});
[['hot','Hot','热点'],['live','Live','直播'],['tips','Tips','经验'],['local','Local','深圳'],['follow','Follow','关注']].forEach((a,i)=>side(a[0],a[1],a[2],72+i*68,116,64,30,{fontSize:22,color:'#eeeeee'}));
side('greeting','Hello!','上午好',42,270,87,33,{fontSize:25});
side('scan','Scan','扫一扫',335,271,65,32,{fontSize:23});
side('games','Games','小程序',58,352,69,27,{fontSize:20});
side('all','All','全部',339,355,39,24,{fontSize:17,color:'#777777'});
side('game','Claim the\nCastle','拿下一座城',54,485,101,25,{fontSize:12,wrap:false,lineHeightRatio:1});
side('sample_game1','Get Rich…','想致富先…',176,485,94,24,{fontSize:16});
side('sample_game2','Antique Master…','古董大师…',300,485,110,24,{fontSize:13});
template('sidebar_guide',682,sidebar,{source:'assets/resources/localization/neutral/sidebar_guide.png'});
for(const [id,t] of Object.entries(out.artTemplates)) {
  t.pending=!!t.source&&!fs.existsSync(path.join(root,t.source));
}
for(const b of [...Object.values(out.images),...Object.values(out.spineImages)]) {
  if(!out.artTemplates[b.template].pending) b.artwork={en:'localization/generated/en/'+b.template,zh:'localization/generated/zh/'+b.template};
}
fs.writeFileSync(path.join(__dirname,'art-entries.json'),JSON.stringify(out,null,2)+'\n');
console.log(JSON.stringify({entries:Object.keys(out.entries).length,images:Object.keys(out.images).length,templates:Object.keys(out.artTemplates).length,spine:Object.keys(out.spineImages).length}));
