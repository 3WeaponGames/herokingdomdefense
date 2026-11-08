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
 const calls=[],requests=[],nodes=[],outlines=[];class Stars{}
 const label={enabled:true,string:'Best: Wave 6'},caption={getComponent:()=>label},owner={ndLevelInfo:{getChildByName:()=>caption},loadPrefab(bundle,file,done){requests.push({bundle,file,done});}};
 const cc={view:{},Label:class{},v2:(x,y)=>({x,y}),isValid:n=>!!n&&!n.destroyed,instantiate(){const component={show:(count,animated)=>calls.push({count,animated}),setOutline:width=>outlines.push(width)},node={active:true,getComponent:()=>component,setPosition(value){this.x=value.x;this.y=value.y;},setScale(value){this.scale=value;}};nodes.push(node);return node;}};
 const context={exports:{},cc,require:name=>name==='StageStarsCore'?Core:{default:Stars}};vm.runInNewContext(fs.readFileSync(path.join(root,'assets/_script/StageStarPresentation.js'),'utf8'),context);return{api:context.exports,owner,label,requests,calls,nodes,outlines};
}
test('incomplete lobby stage keeps its best-wave label and does not load a star widget',()=>{
 const f=presentation();f.api.showLobby(f.owner,stage,0,1);assert.equal(f.label.enabled,true);assert.equal(f.label.string,'Best: Wave 6');assert.equal(f.requests.length,0);
});
test('rapid stage selection shares one owned prefab request and never displays stars on an incomplete stage',()=>{
 const f=presentation();f.api.showLobby(f.owner,stage,1,2);f.api.showLobby(f.owner,stage,3,2);assert.equal(f.requests.length,1);assert.equal(f.label.enabled,false);f.api.showLobby(f.owner,{...stage,Level:2},0,2);f.requests[0].done({});assert.equal(f.nodes[0].active,false);assert.equal(f.label.enabled,true);assert.deepEqual(f.calls,[{count:2,animated:false}]);
 f.api.showLobby(f.owner,stage,7,2);assert.equal(f.nodes[0].active,true);assert.equal(f.label.enabled,false);assert.equal(f.requests.length,1);assert.equal(f.calls.at(-1).count,3);
 assert.equal(f.nodes[0].scale,1.44);assert.equal(f.nodes[0].y,-16);assert.deepEqual(f.outlines,[3,3]);
});
test('result stars use the frozen settlement mask, run once and leave defeat layout alone',()=>{
 const f=presentation();Object.assign(f.owner,{isWin:false,ndReward:{node:{y:0}},spAni:{node:{parent:{}}}});f.api.showResult(f.owner,stage,7);assert.equal(f.requests.length,0);assert.equal(f.owner.ndReward.node.y,0);
 f.owner.isWin=true;f.api.showResult(f.owner,stage,3);f.requests[0].done({});assert.deepEqual(f.calls,[{count:2,animated:true}]);assert.equal(f.owner.ndReward.node.y,-55);
 assert.equal(f.nodes[0].scale,.8);assert.deepEqual(f.outlines,[0]);
});
test('closing an owner before its star asset arrives performs no instantiation or presentation',()=>{
 const f=presentation();f.api.showLobby(f.owner,stage,7,2);f.owner.isclose=true;f.requests[0].done({});assert.equal(f.nodes.length,0);assert.equal(f.calls.length,0);
});
test('star outlines persist across earned states without creating duplicate nodes or changing artwork sizes',()=>{
 class Node{constructor(name){this.name=name;this.children=[];this.active=true;}set parent(value){this._parent=value;value.children.push(this);}get parent(){return this._parent;}setPosition(x,y){this.x=x;this.y=y;}setContentSize(width,height){this.width=width;this.height=height;}setScale(value){this.scale=value;}addComponent(Type){return new Type();}}
 class Sprite{setMaterial(){}}Sprite.SizeMode={CUSTOM:0};
 const cc={Component:class{},Node,Sprite,SpriteFrame:class{},game:{renderType:1,RENDER_TYPE_WEBGL:1},Material:{getBuiltinMaterial:()=>({})},Color:{BLACK:'#000000'},color:value=>value,Tween:{stopAllByTarget(){}},isValid:()=>true,
  Class(definition){function Type(){for(const[key,value]of Object.entries(definition.properties))this[key]=value&&typeof value==='object'&&'default'in value?value.default:value;}Object.assign(Type.prototype,definition);return Type;}};
 const context={exports:{},cc};vm.runInNewContext(fs.readFileSync(path.join(root,'assets/_script/StageStars.js'),'utf8'),context);const owner=new context.exports.default();owner.node=new Node('Stars');owner.starFrame={};owner.build();
 assert(owner.stars.every(star=>!star.outline));owner.setOutline(3);const outlines=owner.stars.map(star=>star.outline);
 for(const count of [1,3,2,0,1]){owner.show(count,false);owner.setOutline(3);owner.stars.forEach((star,index)=>{assert.equal(star.outline,outlines[index]);assert.equal(star.node.children.length,3);assert.equal(star.outline.color,cc.Color.BLACK);assert.equal(star.outline.zIndex,-1);assert.equal(star.outline.width,star.size+6);assert.equal(star.gold.width,star.size);assert.equal(star.gray.width,star.size);assert.equal(star.gold.active,index<count);assert.equal(star.gray.active,index>=count);assert(star.outline.active);});}
 owner.setOutline(0);assert(owner.stars.every(star=>!star.outline.active));owner.setOutline(3);assert(owner.stars.every((star,index)=>star.outline===outlines[index]&&star.outline.active));
});
test('the Cocos star prefab retains the full-resolution Unity artwork, its effect textures and editable sizing',()=>{
 const file='assets/resources/ui/stage-stars/StageStars.prefab',p=JSON.parse(fs.readFileSync(path.join(root,file))),c=p[2];assert.equal(c.sideSize,120);assert(c.centerSize>c.sideSize);assert.equal(c.awardInterval,.36);
 const script=JSON.parse(fs.readFileSync(path.join(root,'assets/_script/StageStars.js.meta')));assert(c.__type__.startsWith(script.uuid.slice(0,5)));
 const png=fs.readFileSync(path.join(root,'assets/resources/ui/stage-stars/star.png')),unity='C:/Users/danny/Documents/projects/Hero Line Wars/Idle Hero Defense/Assets/GUI PRO Kit - Casual Game/ResourcesData/Sprite/Demo/Demo_Icon/Icon_ImageIcon_Star01_l.png';assert.equal(png.readUInt32BE(16),323);assert.equal(png.readUInt32BE(20),325);if(fs.existsSync(unity))assert(png.equals(fs.readFileSync(unity)));
 for(const[name,property]of [['star','starFrame'],['sparkle','sparkleFrame'],['glow','glowFrame']]){const m=JSON.parse(fs.readFileSync(path.join(root,'assets/resources/ui/stage-stars/'+name+'.png.meta')));assert.equal(c[property].__uuid__,m.subMetas[name].uuid);}
});
