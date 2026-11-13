'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'../..');
function setup(width=200,delayed=false){
 class Node{
  constructor(name){this.name=name;this.active=true;this.x=this.y=0;this.width=this.height=0;this.anchorX=this.anchorY=.5;}
  setAnchorPoint(x,y){this.anchorX=x;this.anchorY=y;}
  setPosition(x,y){this.x=x;this.y=y;}
  setContentSize(w,h){this.width=w;this.height=h;}
  addComponent(T){return new T();}
  convertToWorldSpaceAR(p){return{x:p.x+this.x,y:p.y+this.y};}
  convertToNodeSpaceAR(p){return{x:p.x-this.x,y:p.y-this.y};}
  destroy(){this.destroyed=true;}
 }
 class Sprite{}Sprite.SizeMode={CUSTOM:1};const listeners=new Set(),requests=[],frame={name:'shared'};
 const cc={Node,Sprite,color:(r,g,b)=>({r,g,b}),v2:(x,y)=>({x,y}),isValid:n=>!!n&&!n.destroyed,Director:{EVENT_BEFORE_DRAW:'draw'},director:{on:(e,f)=>listeners.add(f),off:(e,f)=>listeners.delete(f)}};
 const m={exports:{}};vm.runInNewContext(fs.readFileSync(path.join(root,'assets/_script/BuildingDebris.js'),'utf8'),{cc,exports:m.exports});
 const image=new Node('body');image.width=width;image.height=180;image.y=90;
 const native={color:{a:1}},smoke={color:{a:1}},owner={node:new Node('owner'),_buildingAppearance:{node:image},ndAniMain:{timeScale:1,_skeleton:{findSlot:n=>n==='fx'?native:smoke}},loadSpriteFrame(bundle,name,done){requests.push({bundle,name,done});if(!delayed)done(frame);}};
 return{api:m.exports,owner,listeners,requests,frame,native,smoke,Node};
}
test('one native debris texture scales uniformly to the original structure footprint',()=>{
 for(const width of [80,200,500]){const e=setup(width);e.api.capture(e.owner);e.owner.isDestroyed=true;e.api.update(e.owner,.2);const r=e.owner._sharedBuildingDebris.building;assert(!r.node.active);e.api.update(e.owner,.07);assert(r.node.active);assert.equal(r.node.width,width*.7);assert.equal(r.node.height/r.node.width,66/115);assert.equal(r.node.y,0);assert.equal(r.node.color.r,167);assert.equal(e.requests[0].name,'buildings/shared/debris');assert.equal(e.native.color.a,0);assert.equal(e.smoke.color.a,1);e.api.destroy(e.owner);assert.equal(e.listeners.size,0);}
});
test('debris waits for its frame and native rubble remains until the shared sprite is ready',()=>{
 const e=setup(200,true);e.api.capture(e.owner);e.owner.isDestroyed=true;e.api.update(e.owner,1);const r=e.owner._sharedBuildingDebris.building;assert(!r.node.active);assert.equal(e.native.color.a,1);e.requests[0].done(e.frame);assert(r.node.active);for(const fn of e.listeners)fn();assert.equal(e.native.color.a,0);e.api.clear(e.owner);assert(r.node.destroyed);assert.equal(e.listeners.size,0);
});
test('farm debris uses the same resource and repairs remove old nodes without altering shared attachments',()=>{
 const e=setup(),attachment={computeWorldVertices(b,out){out.push(-40,0,40,0,40,30,-40,30);}},field={attachment,slot:{bone:{}}},source={node:new e.Node('plots')};
 e.api.field(e.owner,source,field,true);const r=field.debris;assert(r.node.active);assert.equal(r.sprite.spriteFrame,e.frame);assert.equal(r.node.width,56);e.api.field(e.owner,source,field,false);assert(!r.node.active);assert.equal(field.attachment,attachment);e.api.discard(e.owner,r);assert(r.node.destroyed);assert.equal(e.owner._sharedBuildingDebris.records.length,0);
});
test('destroyed owners reject late resource callbacks and cannot revive retired debris',()=>{
 const e=setup(200,true);e.api.capture(e.owner);e.owner.isDestroyed=true;e.api.update(e.owner,1);const r=e.owner._sharedBuildingDebris.building;e.api.destroy(e.owner);e.requests[0].done(e.frame);assert(r.node.destroyed);assert(!r.node.active);assert.equal(e.owner._sharedBuildingDebris,null);assert.equal(e.listeners.size,0);
});
test('native destruction clocks reveal debris after combat updates stop, including castle defeat',()=>{
 const e=setup();e.owner.ndAniMain.skeletonData={skeletonJson:{animations:{destroy:{slots:{fx:{attachment:[{time:.4,name:'fx'}]}}}}}};let elapsed=.2;e.owner.ndAniMain.getCurrent=()=>({animation:{name:'destroy'},trackTime:elapsed});e.api.capture(e.owner);e.owner.isDestroyed=true;for(const fn of e.listeners)fn();assert(!e.owner._sharedBuildingDebris.building.node.active);elapsed=.41;for(const fn of e.listeners)fn();assert(e.owner._sharedBuildingDebris.building.node.active);e.api.destroy(e.owner);
});
test('retiring a tower native rubble renderer cannot hide or flicker the shared replacement',()=>{
 const e=setup();e.owner._buildingAppearance.deathRubbleFx=new e.Node('native rubble');e.owner._buildingAppearance.deathRubbleSpine={getCurrent:()=>({animation:{name:'destroy'},trackTime:.25})};e.api.capture(e.owner);e.owner.isDestroyed=true;e.api.update(e.owner,.3);assert(e.owner._sharedBuildingDebris.building.node.active);assert(!e.owner._buildingAppearance.deathRubbleFx.active);for(let i=0;i<10;i++)for(const fn of e.listeners)fn();assert(e.owner._sharedBuildingDebris.building.node.active);e.api.destroy(e.owner);
});
test('the shared resource is the exact shipped mill debris and no tower preloads custom ruins',()=>{
 const {decode}=require('../../packages/hkd-characters/lib/png-atlas'),source=decode(fs.readFileSync(path.join(root,'assets/KinghtFallIconMap/com/Ani/mf/mf.png'))),target=decode(fs.readFileSync(path.join(root,'assets/resources/buildings/shared/debris.png')));
 assert.deepEqual([target.width,target.height],[115,66]);for(let y=0;y<66;y++)assert.deepEqual(Buffer.from(target.rgba).subarray(y*115*4,(y+1)*115*4),Buffer.from(source.rgba).subarray(((29+y)*source.width+2)*4,((29+y)*source.width+117)*4));
 for(const name of ['KinghtFallConfig','configs']){const config=JSON.parse(fs.readFileSync(path.join(root,'assets',name,'GameJsonCfg.json')));for(const row of config.BuildEnum[2].levelList)assert.equal(row.Appearance?.destroyed,undefined);}
 const atlas=fs.readFileSync(path.join(root,'assets/KinghtFallIconMap/com/Ani/td/td.atlas'),'utf8');assert(!atlas.includes('td-ruins.png'));
});
