"use strict";
var Mask=require("WindowLightMask"),sourcePixels=new WeakMap(),entries=[],serial=0;
function read(frame){
 var saved=sourcePixels.get(frame);if(saved)return saved;
 var texture=frame.getTexture(),native=!!(cc.sys&&cc.sys.isNative),image=!native&&texture.getHtmlElementObj&&texture.getHtmlElementObj(),width=texture.width||70,height=texture.height||70;
 if(!native&&image&&typeof document!=="undefined"&&document.createElement){
  // JSB exposes document/canvas and an image wrapper without the browser's
  // drawImage/getImageData APIs. Use canvas only when actual readback exists.
  var canvas;
  try{canvas=document.createElement("canvas");canvas.width=width;canvas.height=height;var g=canvas.getContext&&canvas.getContext("2d");if(g&&typeof g.drawImage==="function"&&typeof g.getImageData==="function"){g.drawImage(image,0,0,width,height);var data=g.getImageData(0,0,width,height);if(data&&data.data&&data.data.length===width*height*4)saved=new Uint8Array(data.data);}}
  catch(error){saved=null;}
  finally{if(canvas)canvas.width=canvas.height=1;}
 }
 if(!saved){
  // Native textures have no HTML image. Render only this detached sprite, at
  // its exact source resolution, with a copy blend (straight RGB and alpha).
  var root=new cc.Node("WindowLightMaskRead"),cameraNode=new cc.Node("WindowLightMaskCamera"),target=new cc.RenderTexture(),sprite,camera;
  try{root.parent=cc.director.getScene();root.setPosition(100000,100000);root.setContentSize(width,height);sprite=root.addComponent(cc.Sprite);sprite.sizeMode=cc.Sprite.SizeMode.CUSTOM;sprite.trim=false;sprite.spriteFrame=frame;sprite.srcBlendFactor=cc.macro.BlendFactor.ONE;sprite.dstBlendFactor=cc.macro.BlendFactor.ZERO;
   cameraNode.parent=cc.director.getScene();camera=cameraNode.addComponent(cc.Camera);camera.enabled=false;camera.alignWithScreen=false;camera.ortho=true;camera.orthoSize=height/2;camera.nearClip=-1000;camera.farClip=1000;camera.backgroundColor=cc.color(0,0,0,0);camera.clearFlags=cc.Camera.ClearFlags.COLOR|cc.Camera.ClearFlags.DEPTH|cc.Camera.ClearFlags.STENCIL;
   // Active Camera preload aligns z to the screen. Restore all three capture
   // coordinates after disabling alignment, so tall views cannot clip the light.
   cameraNode.setPosition(100000,100000,0);target.initWithSize(width,height);camera.targetTexture=target;camera.render(root);
   var raw=target.readPixels(),stride=width*4;saved=new Uint8Array(width*height*4);for(var y=0;y<height;y++)saved.set(raw.subarray((height-1-y)*stride,(height-y)*stride),y*stride);
  }finally{if(sprite)sprite.spriteFrame=null;if(camera)camera.targetTexture=null;root.active=cameraNode.active=false;root.destroy();cameraNode.destroy();target.destroy();var scene=cc.director.getScene(),flow=cc.RenderFlow;if(scene&&flow)scene._renderFlag|=flow.FLAG_WORLD_TRANSFORM|flow.FLAG_OPACITY;}
 }
 saved={pixels:saved,width:width,height:height};sourcePixels.set(frame,saved);return saved;
}
function trim(){for(var i=0;entries.length>32&&i<entries.length;){var entry=entries[i];if(entry.refs){i++;continue;}entries.splice(i,1);entry.frame.destroy();entry.texture.destroy();}}
function acquire(source,mask){
 if(!mask||!mask.strokes.length)return null;
 var signature=JSON.stringify(mask),entry=entries.find(function(e){return e.source===source&&e.signature===signature;});
 if(!entry){var data=read(source),texture=new cc.Texture2D();texture.initWithData(Mask.pixels(data.pixels,mask,data.width,data.height),cc.Texture2D.PixelFormat.RGBA8888,data.width,data.height);texture.packable=false;texture.setFilters(cc.Texture2D.Filter.LINEAR,cc.Texture2D.Filter.LINEAR);var frame=new cc.SpriteFrame(texture);frame._uuid=(source._uuid||source.uuid||"window-light")+"@mask:"+(++serial);entry={source:source,signature:signature,texture:texture,frame:frame,refs:0};entries.push(entry);}
 entry.refs++;trim();return entry;
}
function release(entry){if(entry){entry.refs--;trim();}}
function prime(config,kinds,assets){var pins=[],T=require("BuildingNightlight");try{(kinds||[]).forEach(function(kind){(config.BuildEnum[kind]&&config.BuildEnum[kind].levelList||[]).forEach(function(row){T.emitters(row).forEach(function(e){var source=assets["resources/"+T.lightType(e).sprite+":frame"],v=row.Nightlight.lights&&row.Nightlight.lights[e.id],entry=source&&v&&acquire(source,v.erase);if(entry)pins.push(entry);});});});}catch(error){pins.forEach(release);throw error;}return{dispose:function(){pins.forEach(release);pins=[];}};}
exports.acquire=acquire;exports.release=release;exports.prime=prime;
