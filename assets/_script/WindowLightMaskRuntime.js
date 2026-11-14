"use strict";
var Mask=require("WindowLightMask"),sourcePixels=new WeakMap(),entries=[],serial=0;
function read(frame){
 var saved=sourcePixels.get(frame);if(saved)return saved;
 var texture=frame.getTexture(),image=texture.getHtmlElementObj&&texture.getHtmlElementObj();
 if(image&&typeof document!=="undefined"){
  var canvas=document.createElement("canvas");canvas.width=canvas.height=70;var g=canvas.getContext("2d");g.drawImage(image,0,0,70,70);saved=new Uint8Array(g.getImageData(0,0,70,70).data);canvas.width=canvas.height=1;
 }else{
  // Native textures have no HTML image. Render only this detached sprite, at
  // its exact source resolution, with a copy blend (straight RGB and alpha).
  var root=new cc.Node("WindowLightMaskRead"),cameraNode=new cc.Node("WindowLightMaskCamera"),target=new cc.RenderTexture(),sprite,camera;
  try{root.parent=cc.director.getScene();root.setPosition(100000,100000);root.setContentSize(70,70);sprite=root.addComponent(cc.Sprite);sprite.sizeMode=cc.Sprite.SizeMode.CUSTOM;sprite.trim=false;sprite.spriteFrame=frame;sprite.srcBlendFactor=cc.macro.BlendFactor.ONE;sprite.dstBlendFactor=cc.macro.BlendFactor.ZERO;
   cameraNode.parent=cc.director.getScene();cameraNode.setPosition(100000,100000);camera=cameraNode.addComponent(cc.Camera);camera.enabled=false;camera.alignWithScreen=false;camera.ortho=true;camera.orthoSize=35;camera.nearClip=-1000;camera.farClip=1000;camera.backgroundColor=cc.color(0,0,0,0);camera.clearFlags=cc.Camera.ClearFlags.COLOR|cc.Camera.ClearFlags.DEPTH|cc.Camera.ClearFlags.STENCIL;target.initWithSize(70,70);camera.targetTexture=target;camera.render(root);
   var raw=target.readPixels();saved=new Uint8Array(70*70*4);for(var y=0;y<70;y++)saved.set(raw.subarray((69-y)*280,(70-y)*280),y*280);
  }finally{if(sprite)sprite.spriteFrame=null;if(camera)camera.targetTexture=null;root.active=cameraNode.active=false;root.destroy();cameraNode.destroy();target.destroy();}
 }
 sourcePixels.set(frame,saved);return saved;
}
function trim(){for(var i=0;entries.length>32&&i<entries.length;){var entry=entries[i];if(entry.refs){i++;continue;}entries.splice(i,1);entry.frame.destroy();entry.texture.destroy();}}
function acquire(source,mask){
 if(!mask||!mask.strokes.length)return null;
 var signature=JSON.stringify(mask),entry=entries.find(function(e){return e.source===source&&e.signature===signature;});
 if(!entry){var texture=new cc.Texture2D();texture.initWithData(Mask.pixels(read(source),mask,70,70),cc.Texture2D.PixelFormat.RGBA8888,70,70);texture.packable=false;texture.setFilters(cc.Texture2D.Filter.LINEAR,cc.Texture2D.Filter.LINEAR);var frame=new cc.SpriteFrame(texture);frame._uuid=(source._uuid||source.uuid||"window-light")+"@mask:"+(++serial);entry={source:source,signature:signature,texture:texture,frame:frame,refs:0};entries.push(entry);}
 entry.refs++;trim();return entry;
}
function release(entry){if(entry){entry.refs--;trim();}}
function prime(config,kinds,assets){var pins=[],source=assets["resources/buildings/lighting/native-window-ray:frame"];try{if(source)(kinds||[]).forEach(function(kind){(config.BuildEnum[kind]&&config.BuildEnum[kind].levelList||[]).forEach(function(row){require("BuildingNightlight").emitters(row).forEach(function(e){var v=row.Nightlight.lights[e.id],entry=v&&acquire(source,v.erase);if(entry)pins.push(entry);});});});}catch(error){pins.forEach(release);throw error;}return{dispose:function(){pins.forEach(release);pins=[];}};}
exports.acquire=acquire;exports.release=release;exports.prime=prime;
