'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),{test}=require('node:test');
const root=path.resolve(__dirname,'../..'),Core=require('../../assets/_script/StageStarsCore'),stage={Level:1,Challenge:[1,2,3]};
test('victory awards one to three stars from the run objectives, independently of chest claims',()=>{
 for(let mask=0;mask<8;mask++){assert.equal(Core.count(stage,mask,true),1+Number(!!(mask&2))+Number(!!(mask&4)));assert.equal(Core.count(stage,mask,false),0);}
 assert.equal(Core.count({Challenge:[1,3,2]},3,true),2);assert.equal(Core.count(stage,255,true),3);
});
test('only completed lobby stages replace Best Wave; old cleared saves retain at least one star without writes',()=>{
 const input={...stage,Challenge:[1,2,3]},before=JSON.stringify(input);assert.equal(Core.cleared(input,0,1),false);assert.equal(Core.cleared(input,1,1),true);assert.equal(Core.cleared(input,0,2),true);assert.equal(Core.count(input,0,true),1);assert.equal(JSON.stringify(input),before);
});
function presentation(){
 const calls=[],requests=[],nodes=[];class Stars{}
 const label={enabled:true,string:'Best: Wave 6'},caption={getComponent:()=>label},owner={ndLevelInfo:{getChildByName:()=>caption},loadPrefab(bundle,file,done){requests.push({bundle,file,done});}};
 const cc={view:{},Label:class{},v2:(x,y)=>({x,y}),isValid:n=>!!n&&!n.destroyed,instantiate(){const component={show:(count,animated)=>calls.push({count,animated})},node={active:true,getComponent:()=>component,setPosition(){},setScale(){}};nodes.push(node);return node;}};
 const context={exports:{},cc,require:name=>name==='StageStarsCore'?Core:{default:Stars}};vm.runInNewContext(fs.readFileSync(path.join(root,'assets/_script/StageStarPresentation.js'),'utf8'),context);return{api:context.exports,owner,label,requests,calls,nodes};
}
test('incomplete lobby stage keeps its best-wave label and does not load a star widget',()=>{
 const f=presentation();f.api.showLobby(f.owner,stage,0,1);assert.equal(f.label.enabled,true);assert.equal(f.label.string,'Best: Wave 6');assert.equal(f.requests.length,0);
});
test('rapid stage selection shares one owned prefab request and never displays stars on an incomplete stage',()=>{
 const f=presentation();f.api.showLobby(f.owner,stage,1,2);f.api.showLobby(f.owner,stage,3,2);assert.equal(f.requests.length,1);assert.equal(f.label.enabled,false);f.api.showLobby(f.owner,{...stage,Level:2},0,2);f.requests[0].done({});assert.equal(f.nodes[0].active,false);assert.equal(f.label.enabled,true);assert.deepEqual(f.calls,[{count:2,animated:false}]);
 f.api.showLobby(f.owner,stage,7,2);assert.equal(f.nodes[0].active,true);assert.equal(f.label.enabled,false);assert.equal(f.requests.length,1);assert.equal(f.calls.at(-1).count,3);
});
test('result stars use the frozen settlement mask, run once and leave defeat layout alone',()=>{
 const f=presentation();Object.assign(f.owner,{isWin:false,ndReward:{node:{y:0}},spAni:{node:{parent:{}}}});f.api.showResult(f.owner,stage,7);assert.equal(f.requests.length,0);assert.equal(f.owner.ndReward.node.y,0);
 f.owner.isWin=true;f.api.showResult(f.owner,stage,3);f.requests[0].done({});assert.deepEqual(f.calls,[{count:2,animated:true}]);assert.equal(f.owner.ndReward.node.y,-55);
});
test('closing an owner before its star asset arrives performs no instantiation or presentation',()=>{
 const f=presentation();f.api.showLobby(f.owner,stage,7,2);f.owner.isclose=true;f.requests[0].done({});assert.equal(f.nodes.length,0);assert.equal(f.calls.length,0);
});
test('the Cocos star prefab retains the full-resolution Unity artwork, its effect textures and editable sizing',()=>{
 const file='assets/resources/ui/stage-stars/StageStars.prefab',p=JSON.parse(fs.readFileSync(path.join(root,file))),c=p[2];assert.equal(c.sideSize,120);assert(c.centerSize>c.sideSize);assert.equal(c.awardInterval,.36);
 const script=JSON.parse(fs.readFileSync(path.join(root,'assets/_script/StageStars.js.meta')));assert(c.__type__.startsWith(script.uuid.slice(0,5)));
 const png=fs.readFileSync(path.join(root,'assets/resources/ui/stage-stars/star.png')),unity='C:/Users/danny/Documents/projects/Hero Line Wars/Idle Hero Defense/Assets/GUI PRO Kit - Casual Game/ResourcesData/Sprite/Demo/Demo_Icon/Icon_ImageIcon_Star01_l.png';assert.equal(png.readUInt32BE(16),323);assert.equal(png.readUInt32BE(20),325);if(fs.existsSync(unity))assert(png.equals(fs.readFileSync(unity)));
 for(const[name,property]of [['star','starFrame'],['sparkle','sparkleFrame'],['glow','glowFrame']]){const m=JSON.parse(fs.readFileSync(path.join(root,'assets/resources/ui/stage-stars/'+name+'.png.meta')));assert.equal(c[property].__uuid__,m.subMetas[name].uuid);}
});
