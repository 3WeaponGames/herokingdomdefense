'use strict';
// Portable native ownership model. Skin refcounts/delete and Slot borrowing
// match the shipped C++ contract; actual JSB admission is verified separately.
const assert=require('node:assert/strict');
function fixture(options={}){
 const alive=new WeakSet(),values=new WeakMap(),slots=[],events=[],owners=[],renderers=[];
 const stats={owners:0,copies:0,resizes:0,pins:0,unpins:0,validity:0,deletedCopies:0};
 const dataOf=value=>{assert(alive.has(value),'retired native getter');return values.get(value);};
 class Region{
  constructor(name,width=100,height=50,y=0){alive.add(this);values.set(this,{name,path:name,width,height,x:0,y,scaleX:1,scaleY:1,offset:[1,2,3,4,5,6,7,8],uvs:[0,0,0,1,1,1,1,0],color:{a:1},refs:0,copy:false});}
  copy(){const original=dataOf(this),copy=new Region(original.name,original.width,original.height,original.y);values.set(copy,{...original,offset:original.offset.slice(),uvs:original.uvs.slice(),color:{...original.color},refs:0,copy:true});stats.copies++;events.push('copy');return copy;}
  updateOffset(){const v=dataOf(this);stats.resizes++;events.push('resize');if(options.requireOwned)assert(v.refs>0,'native copy must be owned before resize');if(options.throwResize)throw Error('planned offset failure');v.offset[0]=v.scaleX;}
 }
 for(const key of ['name','path','width','height','x','y','scaleX','scaleY','offset','uvs','color'])Object.defineProperty(Region.prototype,key,{get(){return dataOf(this)[key];},...(['x','y','scaleX','scaleY'].includes(key)?{set(value){dataOf(this)[key]=value;}}:{})});
 function region(name,width,height,y){const value=new Region(name,width,height,y);dataOf(value).refs=1;return value;}
 const bed=region('bed',100,50,0),addon=region('scarecrow',20,40,20),other=region('other-bed',120,60,0);
 function slot(name,base){const value={data:{name},getAttachment(){return dataOf(this).attachment;},setAttachment(attachment){const s=dataOf(this);if(options.throwRestore&&s.attachment!==attachment&&s.attachment&&dataOf(s.attachment).copy)throw Error('planned restore failure');if(attachment)dataOf(attachment);s.attachment=attachment;events.push('slot:'+name);}};alive.add(value);values.set(value,{attachment:base});slots.push(value);return value;}
 function rig(){const value={};alive.add(value);const entries=[slot('td__1',bed),slot('mill_addon_td__1',addon)];values.set(value,{slots:entries});Object.defineProperty(value,'slots',{get(){return dataOf(this).slots;}});return value;}
 function retireRig(value){if(!alive.has(value))return;for(const s of dataOf(value).slots)alive.delete(s);alive.delete(value);events.push('native-rig-retired');}
 class Skin{
  constructor(){alive.add(this);values.set(this,{entries:new Map()});}
  setAttachment(index,name,copy){const entries=dataOf(this).entries;assert.equal(index,0);assert(!entries.has(name),'private keys must not replace a possibly borrowed copy');dataOf(copy).refs++;entries.set(name,copy);events.push('skin-own');}
  destroy(){for(const copy of dataOf(this).entries.values()){for(const s of slots)if(alive.has(s))assert.notEqual(dataOf(s).attachment,copy,'freeing a copy still borrowed by a live native Slot');const v=dataOf(copy);if(--v.refs===0){alive.delete(copy);stats.deletedCopies++;}}alive.delete(this);}
 }
 class Data{
  constructor(){stats.owners++;owners.push(this);this.skin=new Skin();this.runtime={findSkin:()=>this.skin};alive.add(this.runtime);}
  getRuntimeData(){return this.runtime;}
  destroy(){if(this.destroyed)return;this.skin.destroy();alive.delete(this.runtime);this.destroyed=true;events.push('owner-destroy');}
 }
 const source={_uuid:'authored-farm',atlasText:'authored atlas',textures:[{shared:true}],textureNames:['farm.png'],scale:1,skeletonJson:{skeleton:{spine:'3.8.99'}},addRef(){stats.pins++;events.push('source-pin');return this;},decRef(){stats.unpins++;events.push('source-unpin');return this;}};
 class Node{
  constructor(name='node'){this.name=name;this.x=this.y=this.angle=0;this.scaleX=this.scaleY=1;this.group='world';this.activeInHierarchy=true;this.children=[];this.components=[];}
  set parent(value){this._parent=value;if(value)value.children.push(this);}get parent(){return this._parent;}
  setParent(value){this.parent=value;}setPosition(x,y){if(typeof x==='object'){this.x=x.x;this.y=x.y;}else{this.x=x;this.y=y;}}
  convertToWorldSpaceAR(p){return{x:p.x+this.x,y:p.y+this.y};}convertToNodeSpaceAR(p){return{x:p.x-this.x,y:p.y-this.y};}
  addComponent(Type){const value=new Type();value.node=this;this.components.push(value);return value;}
  destroy(){this.queued=true;}
 }
 class Skeleton{
  constructor(){this.paused=false;this.timeScale=1;renderers.push(this);}
  set skeletonData(value){if(this._skeleton)retireRig(this._skeleton);this._data=value;if(!value){this._nativeSkeleton=null;events.push('data-null');return;}this._skeleton=rig();this._nativeSkeleton={update(){}};}
  get skeletonData(){return this._data;}
  setSkin(){}setToSetupPose(){}setAnimationCacheMode(){}findAnimation(){return{duration:1};}setAnimation(){return{trackTime:0};}update(){}
 }
 Skeleton.AnimationCacheMode={REALTIME:0};
 const cc={sys:{isNative:true},ENGINE_VERSION:'2.4.13',Node,Director:{EVENT_BEFORE_DRAW:'before-draw'},isValid:(v,strict)=>!!v&&!v.destroyed&&!(strict&&v.queued),v2:(x,y)=>({x,y}),director:{on(){},off(){},getScene(){return scene;}}},scene=new Node('scene');
 function renderer(){const n=new Node('renderer'),value=n.addComponent(Skeleton);value.skeletonData=source;return value;}
 const component=renderer();
 return{cc,sp:{Skeleton,SkeletonData:Data},__isObjectValid(value){stats.validity++;return alive.has(value);},component,source,bed,addon,other,owners,renderers,stats,events,options,
  native:values,alive,slots,Node,renderer,retireRig,rig,sourceShape(){return JSON.stringify([dataOf(bed),dataOf(addon)]);},currentSlots:()=>dataOf(component._skeleton).slots};
}
module.exports={fixture};
