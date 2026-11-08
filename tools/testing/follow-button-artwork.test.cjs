'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),{test}=require('node:test');
const root=path.resolve(__dirname,'../..'),prefab=JSON.parse(fs.readFileSync(path.join(root,'assets/KinghtFallPrefabs/game/KinghtFallUIGame.prefab')));
test('Follow uses a mipmapped UI boot while Rally retains its flag frames',()=>{
 const find=name=>prefab.find(n=>n._name===name),follow=find('btnFollow'),rally=find('btnAgg');
 const boot=follow._children.map(r=>prefab[r.__id__]).find(n=>n._name==='FollowBoot');
 assert(boot);assert.equal(boot._contentSize.width,80);assert.equal(boot._contentSize.height,80);
 const meta=JSON.parse(fs.readFileSync(path.join(root,'assets/resources/icons/Follow_Boot_Blue.png.meta')));
 assert.equal(prefab[boot._components[0].__id__]._spriteFrame.__uuid__,meta.subMetas.Follow_Boot_Blue.uuid);
 assert(meta.width>=128);assert.equal(meta.width&(meta.width-1),0,'mipmaps need a power-of-two texture');assert.equal(meta.height,meta.width);
 assert.equal(meta.packable,false);assert.equal(meta.genMipmaps,true);
 assert.equal(meta.filterMode,'bilinear');assert.equal(meta.subMetas.Follow_Boot_Blue.trimType,'none');
 assert.deepEqual(rally._children.slice(0,2).map(r=>prefab[prefab[r.__id__]._components[0].__id__]._spriteFrame.__uuid__),['28d4cf80-8983-4a85-b5a3-e02690edcc36','f198d5cd-6af4-4088-8132-c59fb0af3771']);
});
test('both Follow states have stationary white faces and install their border only once',()=>{
 class Sprite{constructor(){this.enabled=true;}}
 class Graphics{constructor(){this.disks=[];}clear(){}circle(x,y,radius){this.radius=radius;}fill(){this.disks.push({radius:this.radius,color:this.fillColor});}}
 class Node{set parent(value){value.background=this;}setContentSize(){}addComponent(Type){return this.graphics=new Type();}}
 const nodes=Object.fromEntries(['ndTag1','ndTag2'].map(name=>[name,{sprite:new Sprite(),getComponent(){return this.sprite;}}]));
 nodes.ndTag1.sprite.spriteFrame='gold';nodes.ndTag2.sprite.spriteFrame='cyan';
 const exports={};vm.runInNewContext(fs.readFileSync(path.join(root,'assets/_script/FollowButtonArtwork.js'),'utf8'),{exports,cc:{Node,Sprite,Graphics,color:(r,g,b,a=255)=>({r,g,b,a})}});
 const button={getChildByName:name=>nodes[name]};exports.install(button);exports.install(button);
 for(const node of Object.values(nodes)){assert.equal(node.sprite.enabled,true,'keep the same textured rim as Rally');assert.equal(node.background.graphics.disks.at(-1).radius,38);assert.deepEqual({...node.background.graphics.disks.at(-1).color},{r:255,g:255,b:255,a:255});}
 assert.equal(nodes.ndTag1.background.graphics.disks.length,1);assert.equal(nodes.ndTag2.background.graphics.disks.length,1);
 assert.equal(nodes.ndTag1.sprite.spriteFrame,'cyan');assert.equal(nodes.ndTag2.sprite.spriteFrame,'gold');
});
