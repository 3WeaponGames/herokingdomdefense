"use strict";
var FX=require("BuildingDropShadow"),entries=[],bytes=0,LIMIT=24*1024*1024;
function valid(n){return !!n&&(!cc.isValid||cc.isValid(n,true));}
function dispose(owner){var state=owner._buildingDropShadowRuntime;if(!state)return;delete owner._buildingDropShadowRuntime;cc.director.off(cc.Director.EVENT_BEFORE_DRAW,state.sync);if(valid(state.sprite))state.sprite.spriteFrame=null;if(valid(state.node))state.node.destroy();if(state.entry){state.entry.refs--;trim();}}
function trim(){for(var i=0;bytes>LIMIT&&i<entries.length;){var e=entries[i];if(e.refs){i++;continue;}entries.splice(i,1);bytes-=e.bytes;e.frame.destroy();e.texture.destroy();}}
function hide(owner){var s=owner._buildingDropShadowRuntime;if(s){s.hidden=true;s.node.active=false;}}
function sources(owner){
 var list=[owner.ndAniMain,owner.ndAniDown].concat(owner.ndAniOther||[]),a=owner._buildingAppearance;if(a)list.push(a.sprite,a.weaponSprite);
 return list.filter(function(r,i){return r&&list.indexOf(r)===i&&valid(r)&&valid(r.node)&&r.enabled!==false&&r.node.activeInHierarchy!==false&&(r.spriteFrame||r.skeletonData);});
}
function ready(owner,list){
 if(owner._buildingAppearance&&(owner._buildingAppearance.loading||owner._buildingAppearance.placement))return false;
 return list.length&&list.every(function(r){if(!r.getCurrent)return true;var track=r.getCurrent(0),a=track&&(track.animation||track.getAnimation&&track.getAnimation()),name=a&&(a.name||a.getName&&a.getName());if(!name||!/create|upgrade|^open|^shut|^Fade_in/.test(name))return true;var duration=a.duration||a.getDuration&&a.getDuration()||0,time=track.trackTime;if(time===undefined&&track.getTrackTime)time=track.getTrackTime();return typeof time==="number"&&time>=duration;});
}
function capture(owner,game,list){
 if(!cc.Camera||!cc.RenderTexture||!game||!valid(game.ndMain))return null;
 var Depth=require("KinghtFallDepthView"),view=Object.create(Depth.DepthView.prototype),box=list.reduce(function(b,r){return Depth.union(b,Depth.bounds(r,game.ndMain));},null);if(!box)return null;
 view.main=game.ndMain;view.nativeCapture=!!(cc.sys&&cc.sys.isNative);view.capture=new cc.Node("ShadowCapture");view.capture.parent=cc.director.getScene();view.capture.active=false;view.cameraNode=new cc.Node("ShadowCamera");view.cameraNode.parent=cc.director.getScene();view.camera=view.cameraNode.addComponent(cc.Camera);
 var camera=view.camera;camera.enabled=false;camera.alignWithScreen=false;camera.ortho=true;camera.nearClip=-1000;camera.farClip=1000;camera.backgroundColor=cc.color(0,0,0,0);camera.clearFlags=cc.Camera.ClearFlags.COLOR|cc.Camera.ClearFlags.DEPTH|cc.Camera.ClearFlags.STENCIL;
 var object={sources:list};
 try{
  view.snapshot(object,box);if(!object.texture)return null;var rgba=object.texture.readPixels(),w=object.texture.width,h=object.texture.height;if(!rgba)return null;
  var alpha=new Uint8Array(w*h);for(var y=0;y<h;y++)for(var x=0;x<w;x++)alpha[y*w+x]=rgba[((h-1-y)*w+x)*4+3];
  var origin=game.ndMain.convertToNodeSpaceAR(owner.node.convertToWorldSpaceAR(cc.v2(0,0)));
  return{alpha:alpha,pixelWidth:w,pixelHeight:h,x:object.center.x-object.size.width/2-origin.x,y:object.center.y-object.size.height/2-origin.y,width:object.size.width,height:object.size.height};
 }finally{camera.targetTexture=null;if(object.frame)object.frame.destroy();if(object.texture)object.texture.destroy();if(valid(view.capture))view.capture.destroy();if(valid(view.cameraNode))view.cameraNode.destroy();}
}
function geometry(owner){var r=owner.buildInfo.cfg,main=owner.ndAniMain,json=main&&main.skeletonData&&main.skeletonData.skeletonJson;return JSON.stringify([owner.ID,r.index,r.Skin,r.Appearance,r.PartScale,owner.node.scaleX,owner.node.scaleY,owner.wallFacing,owner.wallRotation,owner.wallOpening,!!owner.isOpen,json&&json.wallKit&&json.wallKit.layout]);}
function obtain(key,source,settings){
 var entry=entries.find(function(e){return e.key===key;});if(entry){entry.refs++;entries.splice(entries.indexOf(entry),1);entries.push(entry);return entry;}
 var image=FX.raster(source,settings),texture=new cc.Texture2D();texture.initWithData(image.pixels,cc.Texture2D.PixelFormat.RGBA8888,image.pixelWidth,image.pixelHeight);texture.packable=false;texture.setFilters(cc.Texture2D.Filter.LINEAR,cc.Texture2D.Filter.LINEAR);
 entry={key:key,texture:texture,frame:new cc.SpriteFrame(texture),image:image,bytes:image.pixels.length,refs:1};delete image.pixels;entries.push(entry);bytes+=entry.bytes;trim();return entry;
}
function apply(owner,game,data){
 var row=owner.buildInfo&&owner.buildInfo.cfg,category=data&&data.BuildEnum&&data.BuildEnum[row&&row.ID||owner.buildCfg&&owner.buildCfg.enumValue],effective=row&&category&&FX.resolve(category,row,data&&data.GameTools),old=owner._buildingDropShadowRuntime;
 if(!effective||!effective.active){dispose(owner);if(effective&&effective.mode==='none')require("BuildingShadowRuntime").dispose(owner);else require("BuildingShadowRuntime").apply(owner,game);return;}
 require("BuildingShadowRuntime").dispose(owner);
 if(old){old.hidden=false;old.data=data;old.sync();return;}
 var parent=game&&(game.ndDown||game.ndMain);if(!valid(parent))return;
 var node=new cc.Node("BuildingTextureShadow");node.parent=parent;node.group=owner.node.group;node._depthGroundVisual=true;node.active=false;
 var child=new cc.Node("DropShadowTexture");child.parent=node;child.group=node.group;child.setAnchorPoint(0,0);var sprite=child.addComponent(cc.Sprite);sprite.sizeMode=cc.Sprite.SizeMode.CUSTOM;sprite.srcBlendFactor=cc.macro.BlendFactor.ONE;
 var state=owner._buildingDropShadowRuntime={node:node,child:child,sprite:sprite,data:data,hidden:false,wait:2};
 state.sync=function(){
  if(!valid(owner.node)||!valid(node)){dispose(owner);return;}
  var row=owner.buildInfo&&owner.buildInfo.cfg,category=state.data&&state.data.BuildEnum&&state.data.BuildEnum[row&&row.ID||owner.buildCfg&&owner.buildCfg.enumValue],current=row&&category&&FX.resolve(category,row,state.data.GameTools);
  if(!current||!current.active){apply(owner,game,state.data);return;}
  if(state.hidden||owner.enabled===false||owner.node.activeInHierarchy===false||!owner.index||owner.isDestroyed){node.active=false;return;}
  if(state.wait>0){state.wait--;return;}var list=sources(owner),next=geometry(owner),settingsKey=JSON.stringify(current.settings),key=next+settingsKey;
  if(state.key!==key){
   if(!ready(owner,list))return;
   var entry=entries.find(function(e){return e.key===key;});
   if(entry){entry.refs++;}
   else{if(state.failedKey===key)return;try{if(state.geometry!==next||!state.source){state.source=capture(owner,game,list);if(!state.source)return;state.geometry=next;}entry=obtain(key,state.source,current.settings);}catch(error){state.failedKey=key;node.active=false;if(cc.warn)cc.warn("Building shadow unavailable",error.message||error);return;}}
   // Detach the old frame while it is still live: cache eviction destroys its
   // texture, and Creator's Sprite setter first removes the old load listener.
   var prior=state.entry;sprite.spriteFrame=entry.frame;state.entry=entry;state.key=key;
   child.setPosition(entry.image.x,entry.image.y);child.setContentSize(entry.image.width,entry.image.height);
   if(prior){prior.refs--;trim();}
  }
  node.active=!!state.entry;if(!node.active)return;
  function p(x,y){return parent.convertToNodeSpaceAR(game.ndMain.convertToWorldSpaceAR(cc.v2(x,y)));}
  var origin=game.ndMain.convertToNodeSpaceAR(owner.node.convertToWorldSpaceAR(cc.v2(0,0))),o=p(origin.x,origin.y),x=p(origin.x+1,origin.y),y=p(origin.x,origin.y+1),a=x.x-o.x,b=x.y-o.y,c=y.x-o.x,d=y.y-o.y,sx=Math.hypot(a,b);
  node.setPosition(o);node.angle=Math.atan2(b,a)*180/Math.PI;node.scaleX=sx;node.scaleY=sx?(a*d-b*c)/sx:0;
 };
 cc.director.on(cc.Director.EVENT_BEFORE_DRAW,state.sync);
}
exports.apply=apply;exports.dispose=dispose;exports.hide=hide;exports.capture=capture;exports.stats=function(){return{entries:entries.length,bytes:bytes,active:entries.filter(function(e){return e.refs>0;}).length};};
