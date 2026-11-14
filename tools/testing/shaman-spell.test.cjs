'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),test=require('node:test');
const root=path.resolve(__dirname,'../..');
const prefab=JSON.parse(fs.readFileSync(path.join(root,'assets/KinghtFallEffect/Soldier9Attack.prefab')));
const skeleton=prefab.find(c=>c.__type__==='sp.Skeleton');
const clip=JSON.parse(fs.readFileSync(path.join(root,'assets/KinghtFallEffect/wqyl_xems_Circle/wqyl_xems_Circle.json')));

test('The shaman spell declares a default clip present in its actual Spine asset',()=>{
  assert.ok(skeleton.defaultAnimation,'An empty name aborts Creator 2.4.13 Win32 Spine');
  assert.ok(Object.hasOwn(clip.animations,skeleton.defaultAnimation));
  assert.equal(skeleton._animationName,skeleton.defaultAnimation,'Cached playback agrees with the authored default');
});

test('The shipped shaman spell effect plays the authored clip on both initial load and pooled reuse',()=>{
  const source=fs.readFileSync(path.join(root,'assets/_script/KinghtFallGameEffect.js'),'utf8');
  const calls=[],returned=[],pool=[];
  const animated={defaultAnimation:skeleton.defaultAnimation,setCompleteListener(){},setAnimation(track,name,loop){assert.ok(Object.hasOwn(clip.animations,name),'Native Spine must receive a real nonempty animation');calls.push({track,name,loop});}};
  const node={setParent(p){this.parent=p;},setPosition(p){this.position=p;},getComponentInChildren(){return animated;}};
  const manager={getNode(){return pool.pop();},getNodeFromPrefab(_key,prefab){return cc.instantiate(prefab);},freeNode(name,value){returned.push(name);pool.push(value);}};
  const cc={instantiate(){return node;},_decorator:{ccclass:value=>value,property:()=>()=>{}}},modules={BaseCtrl:{default:function(){}},PoolMgr:{PoolMgr:{getInstance:()=>manager}},KinghtFallUIGame:{default:{instance:{ctrGame:{ndTrack:{name:'tracks'}}}}},KinghtFallConfig:{KinghtFallBundelName:{Effect:'KinghtFallEffect'}},EquipmentTiers:require('../../assets/_script/EquipmentTiers')},exports={};
  vm.runInNewContext(source,{exports,cc,sp:{Skeleton:function(){}},require:name=>modules[name],__extends(C,B){C.prototype=Object.create(B.prototype);C.prototype.constructor=C;},__decorate:(_d,value,key)=>key===undefined?value:undefined});
  let loads=0;const owner=new exports.default();owner.node={};owner.loadPrefab=(bundle,name,cb)=>{loads++;assert.equal(name,'Soldier9Attack');cb(prefab);};
  for(let i=0;i<3;i++){owner.onMoveTrack({x:20,y:30},'Soldier9Attack','Soldier9Attack');owner.update(2);}
  assert.equal(loads,1);assert.equal(calls.length,3);assert.ok(calls.every(c=>c.track===0&&c.name==='attack'&&c.loop===true));assert.equal(returned.length,3);
});
