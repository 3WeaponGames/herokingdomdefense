'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const Schema=require('../lib/schema'),Assets=require('../lib/asset-validation'),M=require('../worlds/model'),P=require('../worlds/prefab'),L=require('../worlds/legacy'),Replace=require('../worlds/stage-replace'),Nav=require('../worlds/navigation'),Preview=require('../worlds/building-preview');
const root=path.resolve(__dirname,'../../..'),clone=M.clone;
const source=JSON.parse(fs.readFileSync(path.join(root,'assets/KinghtFallConfig/GameJsonCfg.json'),'utf8'));
const at=['BuildEnum','2','levelList',0,'Appearance'];
function documents(appearance){const docs={A:{data:clone(source)}};docs.A.data.BuildEnum[2].levelList[0].Appearance=appearance;return docs;}
function issues(docs){return Schema.validate(docs,[{doc:'A',path:at}]).filter(x=>x.severity==='error'&&x.path.slice(0,at.length).join('/')===at.join('/'));}
function lighting(){return {sprite:'icons/enemy-heads/wolf',width:100,height:140,nightTint:'#A7A7A7',lighting:[{sprite:'icons/enemy-heads/wolf',width:100,height:140,offsetX:0,offsetY:0,color:'#FFE89A',opacity:240,glows:[{x:-10,y:80,width:25,height:30,color:'#FFC85B',opacity:80,pulse:.08}]}]};}

test('four progression levels retain the original wall and collider-tag limits',()=>{
 for(const id of [1,2,3,4,5])assert.equal(Schema.descriptor('level',{table:'BuildEnum',id}).max,4);
 assert.equal(Schema.descriptor('level',{table:'BuildEnum',id:6}).max,2,'three wall visuals retain their authored logical levels');
 const docs=documents(lighting()),row=docs.A.data.BuildEnum[2].levelList[0],rowAt=at.slice(0,-1);row.level=4;row.ColliderIndex=3;
 assert(!Schema.validate(docs,[{doc:'A',path:rowAt}]).some(x=>x.severity==='error'&&['level','ColliderIndex'].includes(x.path.at(-1))));
 row.level=5;assert(Schema.validate(docs,[{doc:'A',path:rowAt}]).some(x=>x.severity==='error'&&x.path.at(-1)==='level'));
 row.level=4;row.ColliderIndex=4;assert(Schema.validate(docs,[{doc:'A',path:rowAt}]).some(x=>x.severity==='error'&&x.path.at(-1)==='ColliderIndex'));
});

test('separate aperture sprites and per-aperture glows validate without editing the source',()=>{
 const docs=documents(lighting()),before=JSON.stringify(docs);
 assert.deepEqual(issues(docs),[]);assert.deepEqual(Assets.validate(root,docs,[{doc:'A',path:at}]),[]);
 assert.equal(JSON.stringify(docs),before);
 const polygon=lighting();polygon.lighting=[{points:[{x:1,y:1},{x:8,y:1},{x:8,y:9}],color:'#FFE89A',opacity:240,glow:true}];
 assert.deepEqual(issues(documents(polygon)),[],'legacy polygon fills and implicit glow resources remain supported');
});

test('lighting shape, dimensions, offsets, colors and glow ranges reject malformed drafts',()=>{
 const changes=[
  ['sprite',value=>value.lighting[0].sprite='../outside'],
  ['width',value=>value.lighting[0].width=0],
  ['height',value=>value.lighting[0].height=Infinity],
  ['offsetX',value=>value.lighting[0].offsetX=NaN],
  ['color',value=>value.lighting[0].color='#wrong'],
  ['opacity',value=>value.lighting[0].opacity=256],
  ['glows',value=>value.lighting[0].glows={}],
  ['glows',value=>value.lighting[0].glows=[null]],
  ['pulse',value=>value.lighting[0].glows[0].pulse=1.01],
  ['width',value=>value.lighting[0].glows[0].width=-1],
  ['nightTint',value=>value.nightTint='yellow'],
  ['lighting',value=>value.lighting={points:[]}],
  ['points',value=>value.lighting=[{points:[{x:1,y:1},{x:2,y:2}]}]],
  ['x',value=>value.lighting=[{points:[{x:1,y:1},{x:NaN,y:2},{x:2,y:5}]}]]
 ];
 for(const [field,change] of changes){const value=lighting();change(value);const docs=documents(value);change(docs.A.data.BuildEnum[2].levelList[0].Appearance);assert(issues(docs).some(x=>x.path.includes(field)),field);}
});

test('mask and custom glow resources use their actual imported resources and respect touched paths',()=>{
 const docs=documents(lighting());docs.A.data.BuildEnum[2].levelList[0].Appearance.lighting[0].sprite='missing/window-mask';
 assert(Assets.validate(root,docs,[{doc:'A',path:at}]).some(x=>x.path.join('/')===at.concat('lighting',0,'sprite').join('/')));
 assert.deepEqual(Assets.validate(root,docs,[{doc:'A',path:['BuildEnum','2','levelList',0,'Data',0]}]),[],'an unrelated stat edit does not repair legacy art');
 docs.A.data.BuildEnum[2].levelList[0].Appearance.lighting[0].sprite='icons/enemy-heads/wolf';
 docs.A.data.BuildEnum[2].levelList[0].Appearance.lighting[0].glows[0].sprite='missing/glow';
 assert(Assets.validate(root,docs,[{doc:'A',path:at}]).some(x=>x.path.join('/')===at.concat('lighting',0,'glows',0,'sprite').join('/')));
});

function stage(){return {id:'A-1',variant:'A',level:1,config:{Level:1,WaveCfg:[],HomeLevel1Unlock:[],HomeLevel2Unlock:[],HomeLevel3Unlock:[],Future:{keep:true}},buildings:[{id:1,kind:1,unlock:1,enabled:true},{id:2,kind:2,unlock:1,enabled:true}],specials:[],graphs:[],spawns:[],hero:{x:0,y:0},nextBuilding:3,nextSpecial:1};}
test('level-four unlock export preserves absence until a level-four building is authored',()=>{
 const value=stage(),before=JSON.stringify(value);assert(!Object.hasOwn(P.unlocks(value),'HomeLevel4Unlock'));assert.equal(JSON.stringify(value),before);
 value.buildings[1].unlock=4;assert.deepEqual(P.unlocks(value).HomeLevel4Unlock,[[2,2]]);
 value.config.HomeLevel4Unlock=[[2,2,'future-pair-data']];assert.deepEqual(P.unlocks(value).HomeLevel4Unlock,[[2,2,'future-pair-data']]);
 value.buildings[1].enabled=false;assert.deepEqual(P.unlocks(value).HomeLevel4Unlock,[],'an existing authored field remains present');
 delete value.config.HomeLevel4Unlock;assert(!Object.hasOwn(P.unlocks(value),'HomeLevel4Unlock'));
});

test('replacing buildings owns optional level-four unlocks while settings alone preserves them',()=>{
 const target=stage(),replacement=stage();target.config.HomeLevel4Unlock=[[2,2,'target']];replacement.config.HomeLevel4Unlock=[[2,2,'source']];replacement.buildings[1].unlock=4;
 const before=JSON.stringify({target,replacement});assert.deepEqual(Replace.replace(target,replacement,['settings']).config.HomeLevel4Unlock,target.config.HomeLevel4Unlock);
 assert.deepEqual(Replace.replace(target,replacement,['buildings']).config.HomeLevel4Unlock,replacement.config.HomeLevel4Unlock);
 assert.equal(JSON.stringify({target,replacement}),before);delete replacement.config.HomeLevel4Unlock;
 assert(!Object.hasOwn(Replace.replace(target,replacement,['buildings']).config,'HomeLevel4Unlock'));
});

test('legacy stage import restores level-four unlocks without adding or saving fields',()=>{
 const config=clone(source.LevelCfg[0]);config.prefab='Map01';delete config.StageLayoutId;
 const initial=L.adaptStage(root,'A',1,config),tower=initial.buildings.find(x=>x.kind===2);
 for(const tier of [1,2,3])config['HomeLevel'+tier+'Unlock']=[];
 config.HomeLevel4Unlock=[[tower.kind,tower.id]];const before=JSON.stringify(config),value=L.adaptStage(root,'A',1,config),actual=value.buildings.find(x=>x.id===tower.id);
 assert.equal(actual.unlock,4);assert.equal(actual.enabled,true);assert.equal(JSON.stringify(config),before);
});

test('hall-four preview renders a real fourth body and retains selected wall-three geometry',()=>{
 const config=clone(source),hallRows=config.BuildEnum[1].levelList,previous=hallRows.find(x=>x.level===3),four=clone(previous);four.index=99;four.level=4;four.ColliderIndex=3;four.Appearance={sprite:'icons/enemy-heads/wolf',width:100,height:140,offsetX:0,offsetY:0};delete four.BranchBuild;
 config.BuildEnum[1].levelList=hallRows.filter(x=>x.level!==4).concat(four);
 const sourceMap=L.inspect(root,'Map01'),value=L.adaptStage(root,'A',1,{...config.LevelCfg[0],prefab:'Map01'}),wall=value.buildings.find(x=>x.kind===6),hall=value.buildings.find(x=>x.kind===1);wall.previewBranch=config.BuildEnum[6].levelList.at(-1).index;value.buildings=[hall,wall];
 const service={root,index:()=>({documents:{A:config}}),source:()=>sourceMap.data},before=JSON.stringify({value,config}),result=Preview.describe(service,value);
 assert.deepEqual(result.errors,[]);const fourth=result.buildings[hall.id].levels[4];assert.equal(fourth.skeletons.length,0);assert(result.images[fourth.sprites.at(-1).frame].url.includes('/icons/enemy-heads/wolf.png'));
 assert.deepEqual(result.buildings[wall.id].levels[4].skeletons.map(x=>x.skin),result.buildings[wall.id].levels[3].skeletons.map(x=>x.skin));
 assert.equal(Nav.colliderIndex(hall,4,config),3);assert.equal(JSON.stringify({value,config}),before);
 const oldConfig=clone(config);oldConfig.BuildEnum[1].levelList=oldConfig.BuildEnum[1].levelList.filter(x=>x.level!==4);assert.equal(Nav.buildingRow(hall,4,oldConfig).level,3,'legacy three-level sources fall back instead of inventing a model');
});

test('navigation accepts hall four and rejects higher or fractional levels',()=>{
 const map=M.createMap('tier-four-nav','Tier four','forest');map.size=map.playable={width:400,height:400};map.blockerMask=[];
 const value={mapId:map.id,buildings:[],spawns:[{id:1,x:-100,y:0,enabled:true}],graphs:[{id:'route',spawnIds:[1],entry:'a',nodes:[{id:'a',x:-100,y:0},{id:'b',x:100,y:0,goal:true}],edges:[{id:'edge',from:'a',to:'b',weight:1}]}]},service={root,doc:()=>({data:value}),loadMap:()=>({data:map})};
 assert(!Nav.preview(service,{key:'stage:test',spawnId:1,hall:4,radius:0}).frontier);
 for(const hall of [0,5,3.5,NaN])assert.throws(()=>Nav.preview(service,{key:'stage:test',spawnId:1,hall,radius:0}),/hall level/);
});
