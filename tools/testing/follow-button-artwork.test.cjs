'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),{test}=require('node:test');
const root=path.resolve(__dirname,'../..'),prefab=JSON.parse(fs.readFileSync(path.join(root,'assets/KinghtFallPrefabs/game/KinghtFallUIGame.prefab')));
const RelicRuntime=require('../../assets/_script/RelicRuntime');
test('Rally and Follow use the requested white flag and connect pictograms above their state rims',()=>{
 const find=name=>prefab.find(n=>n._name===name),follow=find('btnFollow'),rally=find('btnAgg');
 for(const [button,nodeName,asset]of[[follow,'FollowIcon','Pictoicon_Connect'],[rally,'RallyIcon','Pictoicon_Flag_0']]){
  const children=button._children.map(r=>prefab[r.__id__]),icon=children.find(n=>n._name===nodeName);
  assert(icon);assert.equal(icon._contentSize.width,80);assert.equal(icon._contentSize.height,80);
  const meta=JSON.parse(fs.readFileSync(path.join(root,'assets/resources/icons/Pictograms',asset+'.png.meta')));
  assert.equal(prefab[icon._components[0].__id__]._spriteFrame.__uuid__,meta.subMetas[asset].uuid);
  assert.equal(meta.packable,false);assert.equal(meta.filterMode,'bilinear');assert.equal(meta.subMetas[asset].trimType,'none');
  assert(children.indexOf(icon)>children.findIndex(n=>n._name==='ndTag2'),'the white symbol must draw above both state faces');
  assert(!children.some(n=>n._name==='FollowBoot'),'old boot must not cover the replacement');
 }
 assert.deepEqual(rally._children.slice(0,2).map(r=>prefab[prefab[r.__id__]._components[0].__id__]._spriteFrame.__uuid__),['28d4cf80-8983-4a85-b5a3-e02690edcc36','f198d5cd-6af4-4088-8132-c59fb0af3771']);
});
function artworkFixture(){
 class Sprite{constructor(){this.enabled=true;}}Sprite.SizeMode={CUSTOM:0};
 class Graphics{constructor(){this.disks=[];}clear(){}circle(x,y,radius){this.radius=radius;}fill(){this.disks.push({radius:this.radius,color:this.fillColor});}}
 class Node{
  constructor(name){this.name=name;this.children=[];this.components=[];this.active=true;}
  set parent(value){value.children.push(this);}setContentSize(width,height){this.width=width;this.height=height;}
  addComponent(Type){const c=new Type();this.components.push(c);return c;}getComponent(Type){return this.components.find(c=>c instanceof Type);}
  getChildByName(name){return this.children.find(n=>n.name===name);}
 }
 class Texture2D{
  initWithData(pixels,format,width,height){Object.assign(this,{pixels,format,width,height});}
  setFilters(min,mag){this.filters=[min,mag];}update(options){Object.assign(this,options);}destroy(){this.destroyed=true;}
 }Texture2D.PixelFormat={RGBA8888:6};Texture2D.Filter={LINEAR:1};
 class SpriteFrame{constructor(texture){this.texture=texture;}destroy(){this.destroyed=true;}}
 const cc={Node,Sprite,Graphics,Texture2D,SpriteFrame,color:(r,g,b,a=255)=>({r,g,b,a})};
 const button=new Node('Follow'),nodes={};
 for(const [name,frame] of [['ndTag1','gold'],['ndTag2','cyan']]){const node=nodes[name]=new Node(name);node.parent=button;node.addComponent(Sprite).spriteFrame=frame;}
 const exports={};vm.runInNewContext(fs.readFileSync(path.join(root,'assets/_script/FollowButtonArtwork.js'),'utf8'),{exports,cc});
 return{cc,button,nodes,artwork:exports};
}

test('white command pictograms retain a dark face and a blue enabled rim without resetting live state',()=>{
 const f=artworkFixture();f.artwork.install(f.button);
 const {ndTag1:idle,ndTag2:active}=f.nodes,rim=f.button._armyButtonArtwork;
 assert(idle.active);assert(!active.active,'Follow must not start highlighted');
 for(const node of [idle,active]){
  assert.equal(node.getComponent(f.cc.Sprite).spriteFrame,'gold');assert.equal(node.width,104);assert.equal(node.height,104);
  const face=node.getChildByName('CommandFace').getComponent(f.cc.Graphics);
  assert.equal(face.disks.length,1);assert.equal(face.disks[0].radius,38);assert.deepEqual({...face.disks[0].color},{r:36,g:45,b:57,a:255});
 }
 assert(!idle.getChildByName('CommandActiveRim'));assert(active.getChildByName('CommandActiveRim'));
 const texture=rim.texture;assert(texture.genMipmaps);assert.deepEqual(texture.filters,[1,1]);assert.equal(texture.mipFilter,1);
 const alphaAt=r=>texture.pixels[(128*256+Math.floor(128+r*256/128))*4+3];
 assert.equal(alphaAt(40),0,'gold ring must remain uncovered');assert.equal(alphaAt(48),255);assert.equal(alphaAt(53),0);
 assert(texture.pixels.some((value,index)=>index%4===3&&value>0&&value<255),'rim requires antialiased edge coverage');
 idle.active=false;active.active=true;f.artwork.install(f.button);
 assert.equal(f.button._armyButtonArtwork,rim);assert(active.active,'reinstall must not reset a live Follow state');
 assert.equal(active.children.length,2);
 f.artwork.dispose(f.button);f.artwork.dispose(f.button);assert(rim.texture.destroyed&&rim.frame.destroyed);
});

function method(file,name,context){
 const source=fs.readFileSync(path.join(root,'assets/_script',file),'utf8'),marker='_ctor.prototype.'+name+' = ';
 const start=source.indexOf(marker)+marker.length,end=source.indexOf('\n  };',start);
 assert(start>=marker.length&&end>start);return vm.runInNewContext('('+source.slice(start,end)+'\n  })',context);
}

test('fresh and restored battle initialization both disable gameplay Follow and its hero ring',()=>{
 const follow=prefab.find(n=>n._name==='btnFollow'),tags=follow._children.map(r=>prefab[r.__id__]);
 assert.notEqual(tags.find(n=>n._name==='ndTag1')._active,false);assert.equal(tags.find(n=>n._name==='ndTag2')._active,false);
 for(const restoring of [false,true]){
  const init=method('KinghtFallGameCtrl.js','initData',{GameToolsOverrides:{clear(){}},
   require:name=>{assert.equal(name,'RelicRuntime');return RelicRuntime;},
   $z1KinghtFallPlayerMgr:{KinghtFallPlayerMgr:{getInstance:()=>({getGameData:()=>({hasSave:()=>restoring})})}},
   $z1KinghtFallGameCtrlData:{default:function(){}}});
  const game={isAgg:true,_combatEpoch:0,ctrPlay:{initData(){},ndAgg:{active:true}},buildBullet:{node:{}},ndAggFlag:{active:true}};
  init.call(game,1);assert.equal(game.isAgg,false);assert.equal(game.ctrPlay.ndAgg.active,false);
 }
});

test('the blue Follow state agrees with actual soldiers through off, on and off commands',()=>{
 const {environment}=require('../navigation/runtime-harness.cjs'),e=environment(),game=e.game;
 Object.setPrototypeOf(game,e.load('KinghtFallGameCtrl').default.prototype);
 Object.assign(game,{isAgg:false,_separateArmyCommands:true,pathIndex:0});
 game.ctrPlay.node.setPosition(0,0);game.ctrPlay.ndAgg.setParent(game.ctrPlay.node);Object.assign(game.ctrPlay.ndAgg,{width:208,height:108,active:false});
 const unit=e.actor('KinghtFallSoldierItem01',0,0);unit.setNew();game.gameData.soldiers.push(unit);
 const f=artworkFixture();f.artwork.install(f.button);
 const label={string:''},rallyTags={ndTag1:{},ndTag2:{}};
 const ui={ctrGame:game,btnFollow:f.button,btnAgg:{active:true,getChildByName:name=>name==='labNum'?{getComponent:()=>label}:rallyTags[name]},T:x=>x};
 const caption=new f.cc.Node('labNum');caption.parent=f.button;caption.getComponent=()=>label;
 const refresh=method('KinghtFallUIGame.js','_refreshArmyButtons',{cc:{Label:function(){}},$z1KinghtFallTextConfig:{KinghtFallTextConfig:{Game04:'Rally',Game05:'Follow'}}});
 for(const enabled of [false,true,false]){
  if(game.isAgg!==enabled)game.followCommand();refresh.call(ui);
  assert.equal(game.isAgg,enabled);assert.equal(unit.isAgg,enabled);assert.equal(game.ctrPlay.ndAgg.active,enabled);
  assert.equal(f.nodes.ndTag2.active,enabled);assert.equal(f.nodes.ndTag1.active,!enabled);
 }
});
