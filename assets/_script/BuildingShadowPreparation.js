"use strict";
// Render-only stage preparation. We read the prefab template, then construct
// only Sprite/Spine renderers. No building/controller/prefab lifecycle runs.
var FX=require("BuildingDropShadow"), Runtime=require("BuildingDropShadowRuntime"),Manual=require("BuildingShadowRuntime"),serial=0;
function transform(node,frame){
  function p(x,y){return frame.convertToNodeSpaceAR(node.convertToWorldSpaceAR(cc.v2(x,y)));}
  var o=p(0,0),x=p(1,0),y=p(0,1);return[x.x-o.x,x.y-o.y,y.x-o.x,y.y-o.y,o.x,o.y];
}
function place(node,m){var sx=Math.hypot(m[0],m[1]);node.setPosition(m[4],m[5]);node.angle=Math.atan2(m[1],m[0])*180/Math.PI;node.scaleX=sx;node.scaleY=sx?(m[0]*m[3]-m[1]*m[2])/sx:0;}
function stamp(row,settings,owner){return JSON.stringify([row.ID,row.index,row.Skin,row.Appearance,row.PartScale,row.WorldScale,row.ModelOffset,settings,owner.wallFacing,owner.wallRotation,owner.wallOpening,owner.wallRun]);}
function geometry(owner){return [owner.node.scaleX,owner.node.scaleY,owner.node.angle,[owner.ndAniMain,owner.ndAniDown].concat(owner.ndAniOther||[]).filter(Boolean).map(function(r){return[r.skeletonData&&(r.skeletonData.uuid||r.skeletonData._uuid),r.spriteFrame&&(r.spriteFrame.uuid||r.spriteFrame._uuid),transform(r.node,owner.node).map(function(n){return Math.round(n*100000)/100000;}),r.node.width,r.node.height,r.node.anchorX,r.node.anchorY];})];}
function probe(template,row,root,assets,open){
  var node=new cc.Node("ShadowStructurePose");node.parent=root;node.angle=template.node.angle;var scale=require("BuildingWorldScale").value(row);node.scaleX=template.node.scaleX*scale;node.scaleY=template.node.scaleY*scale;
  var owner={node:node,ndAniOther:[],buildInfo:{cfg:row},clones:[]};
  var main=template.ndAniMain,kit=main&&main.skeletonData&&main.skeletonData.skeletonJson.wallKit,layout;
  if(kit){var endpoints=[];(template.ndAniOther||[]).forEach(function(r){(r.skeletonData&&r.skeletonData.skeletonJson.wallAnchors||[]).forEach(function(p){endpoints.push(main.node.convertToNodeSpaceAR(r.node.convertToWorldSpaceAR(cc.v2(p.x,p.y))));});});layout=require("WallKit").layout(template.wallRun?JSON.parse(template.wallRun):null,endpoints);}
  function dataFor(source){
    var data=source.skeletonData,json=data.skeletonJson,next=json,m=transform(source.node,template.node),mirror=m[0]*m[3]-m[1]*m[2];mirror*=template.node.scaleX*template.node.scaleY;
    if(layout&&json.wallKit)next=require("WallKit").install(json,layout,undefined,{mirrorX:mirror<0,tier:row.level,face:template.wallFacing,adjustmentsData:require("WallAdjustments").getData()});
    else if(layout&&json.wallGate)next=require("WallKit").fitGatePart(json,layout,{frameToLocal:transform(main.node,source.node)});
    if((source===main||source===template.ndAniDown)&&require("GateFacing").reverse(template.wallFacing))next=require("GateFacing").mirrorJson(next);
    if(next===json)return data;
    var clone=new sp.SkeletonData();clone.skeletonJson=next;clone.atlasText=data.atlasText;clone.textures=(data.textures||[]).slice();clone.textureNames=(data.textureNames||[]).slice();clone.scale=data.scale;clone._uuid=(data._uuid||data.uuid)+"@shadow-preparation:"+(++serial);owner.clones.push(clone);return clone;
  }
  function child(name,m){var n=new cc.Node(name);n.parent=node;place(n,m);n.group=template.node.group;return n;}
  function sprite(n,frame,width,height,ax,ay){var r=n.addComponent(cc.Sprite);r.sizeMode=cc.Sprite.SizeMode.CUSTOM;n.setAnchorPoint(ax,ay);n.setContentSize(width,height);r.spriteFrame=frame;return r;}
  try{if(row.Appearance&&row.Appearance.sprite){
    var a=row.Appearance,n=child("StructureArtwork",[1,0,0,1,a.offsetX||0,a.offsetY||0]),base=sprite(n,assets["resources/"+a.sprite+":frame"],a.width||160,a.height||200,.5,0);owner._buildingAppearance={sprite:base};
  }else{
    [template.ndAniMain].concat(Number(row.ID)!==6&&!kit?[]:[template.ndAniDown],template.ndAniOther||[]).filter(Boolean).forEach(function(source){
      if(!source.skeletonData)return;var n=child("StructureSpine",transform(source.node,template.node)),r=n.addComponent(sp.Skeleton);owner.ndAniOther.push(r);r.skeletonData=dataFor(source);r.premultipliedAlpha=source.premultipliedAlpha;r.enableBatch=source.enableBatch;
      if(r.setAnimationCacheMode)r.setAnimationCacheMode(sp.Skeleton.AnimationCacheMode.REALTIME);
      if(row.Skin)r.setSkin(row.Skin);if(r.setToSetupPose)r.setToSetupPose();
      var opening=require("GateFacing").animation(r.skeletonData.skeletonJson,"open",template.wallOpening,false),animation=open&&r.findAnimation(opening)?opening:r.findAnimation("idle")?"idle":source.defaultAnimation;
      if(animation){var track=r.setAnimation(0,animation,false);if(open&&track){var duration=r.findAnimation(animation).duration;if(track.setTrackTime)track.setTrackTime(duration);else track.trackTime=duration;}}
      r.timeScale=0;if(r.update)r.update(0);if(r._nativeSkeleton&&r._nativeSkeleton.update)r._nativeSkeleton.update(0);
      require("BuildingPartScale").apply(r,row);r.paused=true;
    });
  }
  return owner;}catch(error){owner.ndAniOther.forEach(function(r){r.skeletonData=null;});owner.node.active=false;owner.node.destroy();owner.clones.forEach(function(asset){asset.destroy();});throw error;}
}
function smaller(source){
  var factor=Math.min(1,256/Math.max(source.pixelWidth,source.pixelHeight));if(factor===1)return source;
  var w=Math.max(1,Math.ceil(source.pixelWidth*factor)),h=Math.max(1,Math.ceil(source.pixelHeight*factor)),alpha=new Uint8Array(w*h);
  for(var y=0;y<h;y++)for(var x=0;x<w;x++)alpha[y*w+x]=source.alpha[Math.min(source.pixelHeight-1,Math.floor((y+.5)/factor))*source.pixelWidth+Math.min(source.pixelWidth-1,Math.floor((x+.5)/factor))];
  return Object.assign({},source,{alpha:alpha,pixelWidth:w,pixelHeight:h,layers:source.layers&&source.layers.map(smaller)});
}
async function prepare(prefab,config,level,session,progress){
  var main=prefab.data.getChildByName("ndMain");if(!main)throw Error("Stage map has no structure layer");
  var kinds={1:1},slots={},pins=[],manualPins=[],cache={},jobs=[];
  [1,2,3,4].forEach(function(tier){(level["HomeLevel"+tier+"Unlock"]||[]).forEach(function(pair){if(kinds[pair[1]]===undefined)kinds[pair[1]]=pair[0];});});
  main.children.forEach(function(node){var template=node.getComponent("KinghtFallBuildBase"),kind=template&&kinds[template.ID],category=kind&&config.BuildEnum[kind];if(!category)return;slots[template.ID]={};(category.levelList||[]).forEach(function(row){var style=FX.resolve(category,row,config.GameTools);if(style.mode==='none'||!style.active&&!row.Shadow)return;[false].concat(style.active&&Number(kind)===6?[true]:[]).forEach(function(open){jobs.push({template:template,row:row,style:style,open:open,manual:!style.active});});});});
  var root=new cc.Node("StageShadowPreparation");root.parent=cc.director.getScene();root.setPosition(100000,100000);
  function dispose(){pins.forEach(Runtime.releaseEntry);manualPins.forEach(Manual.releaseEntry);pins=[];manualPins=[];slots={};}
  try{
    for(var i=0;i<jobs.length;i++){
      if(!session.current())throw Error("Stage shadow preparation cancelled");
      var job=jobs[i],s=stamp(job.row,job.style.settings,job.template),key="stage-shadow:"+JSON.stringify([s,geometry(job.template),job.open,job.manual&&job.row.Shadow]),entry=cache[key],plan;
      if(!entry){var owner=probe(job.template,job.row,root,session.assets,job.open);try{if(job.manual){var renderer=owner.ndAniOther.find(function(r){return r.skeletonData&&r.skeletonData.skeletonJson.wallKit;}),json=renderer&&renderer.skeletonData.skeletonJson;plan=json&&json.wallKit.layout;entry=Manual.prepareEntry(job.row.Shadow,plan);if(entry)manualPins.push(entry);}else{var source=Runtime.capture(owner,{ndMain:root},Runtime.sources(owner));if(!source)throw Error("Could not prepare structure shadow "+job.template.ID+":"+job.row.index);entry=Runtime.prepareEntry(key,smaller(source),job.style.settings);pins.push(entry);}cache[key]=entry;}finally{owner.node.active=false;owner.ndAniOther.forEach(function(r){r.skeletonData=null;});owner.node.destroy();owner.clones.forEach(function(asset){asset.destroy();});}}
      var rows=slots[job.template.ID],value=rows[job.row.index]||(rows[job.row.index]={stamp:s});if(job.manual){value.manual=entry;value.manualStamp=entry&&entry.signature;}else value[job.open?"open":"closed"]=entry;
      if(progress)progress((i+1)/Math.max(1,jobs.length));await new Promise(function(resolve){setTimeout(resolve,0);});
    }
    if(!session.current())throw Error("Stage shadow preparation cancelled");
    return{get:function(owner,row,settings){var value=slots[owner.ID]&&slots[owner.ID][row.index];return value&&value.stamp===stamp(row,settings,owner)?value[owner.isOpen?"open":"closed"]:null;},getManual:function(owner,row,plan){var value=slots[owner.ID]&&slots[owner.ID][row.index];return value&&value.manualStamp===JSON.stringify([row.Shadow,plan])?value.manual:null;},dispose:dispose,count:pins.length+manualPins.length};
  }catch(error){dispose();throw error;}finally{root.active=false;root.destroy();}
}
exports.prepare=prepare;exports.stamp=stamp;exports.smaller=smaller;
