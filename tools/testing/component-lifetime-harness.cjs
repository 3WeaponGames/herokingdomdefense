'use strict';
// Creator destroys children before their parent controller. Its enabled setter
// still dereferences Component.node, which is null after component retirement.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
function enabledProperty(cc){
 const file=path.join(process.env.COCOS_ENGINE_ROOT||'C:/ProgramData/cocos/editors/Creator/2.4.13/resources/engine','cocos2d/core/components/CCComponent.js');
 if(fs.existsSync(file)){
  let definition;const object=function(){};object.Flags={};
  const api={...cc,Class:value=>{definition=value;return function(){};}};
  vm.runInNewContext(fs.readFileSync(file,'utf8'),{cc:api,module:{exports:{}},CC_EDITOR:false,CC_PREVIEW:false,CC_TEST:false,CC_DEV:false,CC_JSB:false,CC_NATIVERENDERER:false,require:name=>name.endsWith('CCObject')?object:name.endsWith('id-generater')?function(){}:{value:(target,key,value)=>target[key]=value}},{filename:file});
  return definition.properties.enabled;
 }
 return{get(){return this._enabled;},set(value){if(this._enabled!==value){this._enabled=value;if(this.node._activeInHierarchy){const scheduler=cc.director._compScheduler;(value?scheduler.enableComp:scheduler.disableComp)(this);}}}};
}
function protect(component,key){let value=component[key];Object.defineProperty(component,key,{configurable:true,get(){if(!this.node||this.destroyed||this.toDestroy||this.node.destroyed||this.node.toDestroy)throw Error('Retired native '+key+' access');return value;},set(next){if(!this.node||this.destroyed||this.toDestroy||this.node.destroyed||this.node.toDestroy)throw Error('Retired native '+key+' write');value=next;}});}
module.exports={enabledProperty,protect};
