"use strict";
// Passive map-scenery lighting. Stage preparation renders detached visual
// probes only; live owners share those results without starting game actors.
var FX=require("BuildingDropShadow"),Runtime=require("BuildingDropShadowRuntime"),Quality=require("MapShadowQuality"),pool=new Map(),groups=new WeakMap(),activeGroups=new Set(),serial=0;
function valid(node){return !!node&&(!cc.isValid||cc.isValid(node,true));}
function config(){return require("KinghtFallDataMgr").KinghtFallDataMgr.getInstance().data;}
function settings(data){return FX.settings(data&&data.GameTools&&data.GameTools.buildingShadows&&data.GameTools.buildingShadows.global);}
function matrix(node,frame){function p(x,y){return frame.convertToNodeSpaceAR(node.convertToWorldSpaceAR(cc.v2(x,y)));}var o=p(0,0),x=p(1,0),y=p(0,1);return[x.x-o.x,x.y-o.y,y.x-o.x,y.y-o.y,o.x,o.y];}
function place(node,m){var sx=Math.hypot(m[0],m[1]);node.setPosition(m[4],m[5]);node.angle=Math.atan2(m[1],m[0])*180/Math.PI;node.scaleX=sx;node.scaleY=sx?(m[0]*m[3]-m[1]*m[2])/sx:0;var shear=sx?(m[0]*m[2]+m[1]*m[3])/(sx*sx):0;if(Math.abs(shear)>1e-7)node.skewX=Math.atan(shear)*180/Math.PI;}
function describe(owner){
 var main=owner.mapMain,origin=main.convertToNodeSpaceAR(owner.node.convertToWorldSpaceAR(cc.v2(0,0))),list=[];
 function visit(node){if(!valid(node)||node.active===false||node._mapObjectShadowVisual)return;var sprite=node.getComponent(cc.Sprite),spine=typeof sp!=="undefined"&&node.getComponent(sp.Skeleton),r=sprite&&sprite.spriteFrame?sprite:spine&&spine.skeletonData?spine:null;
  if(r&&r.enabled!==false){var m=matrix(node,main),opacity=1;m[4]-=origin.x;m[5]-=origin.y;for(var n=node;n&&n!==main&&n!==owner.shadowParent;n=n.parent)opacity*=(n.opacity===undefined?255:n.opacity)/255;list.push({source:r,matrix:m,opacity:opacity});}
  (node.children||[]).forEach(visit);
 }
 (owner.sources&&owner.sources.length?owner.sources:[owner.node]).forEach(visit);
 var scale=list.length?Math.hypot(list[0].matrix[0],list[0].matrix[1]):1;if(!(scale>0))scale=1;list.forEach(function(p){p.matrix=p.matrix.map(function(v){return v/scale;});});
 var minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;list.forEach(function(p){var n=p.source.node,json=p.source.skeletonData&&p.source.skeletonData.skeletonJson,meta=json&&json.skeleton,w=n.width||meta&&meta.width||1024,h=n.height||meta&&meta.height||1024,m=p.matrix;[-n.anchorX*w,(1-n.anchorX)*w].forEach(function(x){[-n.anchorY*h,(1-n.anchorY)*h].forEach(function(y){var px=m[0]*x+m[2]*y+m[4],py=m[1]*x+m[3]*y+m[5];minX=Math.min(minX,px);maxX=Math.max(maxX,px);minY=Math.min(minY,py);maxY=Math.max(maxY,py);});});});
 return{origin:origin,list:list,scale:scale,quality:Quality.forBounds(list.length?maxX-minX:1,list.length?maxY-minY:1,scale),signature:JSON.stringify(list.map(function(p){var r=p.source,n=r.node,a=r.spriteFrame||r.skeletonData;return[a._uuid||a.uuid,p.matrix.map(function(v){return Math.round(v*1000)/1000;}),n.width,n.height,n.anchorX,n.anchorY,p.opacity,r.type,r.trim,r.fillType,r.fillStart,r.fillRange,r.fillCenter,r.defaultSkin,r.defaultAnimation];}))};
}
function acquire(owner,data,root){
 var description=describe(owner);if(!description.list.length)return null;var preset=settings(data),quality=description.quality,key="map-shadow:"+JSON.stringify([description.signature,preset,quality]),record=pool.get(key);if(record){record.refs++;return record;}
 var temporary=!root;if(temporary){root=new cc.Node("MapShadowPreparation");root.parent=cc.director.getScene();root.setPosition(100000,100000);}var node=new cc.Node("MapSceneryProbe");node.parent=root;var renders=[];
 try{description.list.forEach(function(p){var source=p.source,n=new cc.Node("MapShadowSource");n.parent=node;place(n,p.matrix);n.setAnchorPoint(source.node.anchorX,source.node.anchorY);n.setContentSize(source.node.width,source.node.height);n.opacity=Math.round(p.opacity*255);n.group=source.node.group;var r;
   if(source.spriteFrame){r=n.addComponent(cc.Sprite);r.type=source.type;r.sizeMode=cc.Sprite.SizeMode.CUSTOM;r.trim=source.trim;if(source.fillType!==undefined){r.fillType=source.fillType;r.fillStart=source.fillStart;r.fillRange=source.fillRange;r.fillCenter=source.fillCenter;}r.spriteFrame=source.spriteFrame;}
   else{r=n.addComponent(sp.Skeleton);r.skeletonData=source.skeletonData;r.premultipliedAlpha=source.premultipliedAlpha;if(r.setAnimationCacheMode)r.setAnimationCacheMode(sp.Skeleton.AnimationCacheMode.REALTIME);if(source.defaultSkin)r.setSkin(source.defaultSkin);var animation=source.defaultAnimation||"idle";if(r.findAnimation(animation))r.setAnimation(0,animation,false);if(r.update)r.update(0);r.paused=true;}
   renders.push(r);
  });
  var source=Runtime.capture({node:node,ndAniOther:renders},{ndMain:root},renders,quality);if(!source)throw Error("Could not prepare map-object shadow "+owner.shadowKey);record={key:key,entry:Runtime.prepareEntry(key,source,preset,Quality.rasterOptions(quality)),refs:1,order:++serial};pool.set(key,record);return record;
 }finally{renders.forEach(function(r){if(r.spriteFrame)r.spriteFrame=null;if(r.skeletonData)r.skeletonData=null;});node.active=false;node.destroy();if(temporary){root.active=false;root.destroy();}}
}
function release(record){if(!record||record.refs<=0)return;if(--record.refs)return;pool.delete(record.key);Runtime.releaseEntry(record.entry);}
function night(){try{var ui=require("KinghtFallUIGame").default.instance,light=ui&&ui.ctrUI&&ui.ctrUI.ndLight;if(!light||!light.active)return 0;var maximum=Number(require("KinghtFallConfig").KinghtFallParameter.BattleNightStrength);return maximum>0?Math.max(0,Math.min(1,light.opacity/(255*maximum))):1;}catch(_){return 0;}}
function groupFor(owner){
 var main=owner.mapMain,group=groups.get(main);if(group&&valid(group.node))return group;
 var parent=owner.shadowParent||main,node=new cc.Node("MapGlobalShadows");node.parent=parent;node.group=main.group;node.zIndex=-1000;node._depthGroundVisual=true;node._mapObjectShadowVisual=true;group={node:node,main:main,parent:parent,owners:new Set(),tint:null};groups.set(main,group);activeGroups.add(group);
 group.sync=function(){if(!valid(node)||!valid(main))return;place(node,matrix(main,parent));node.opacity=Math.round(255*(1-.95*night()));var first=owner.mapBackground&&owner.mapBackground.children&&owner.mapBackground.children[0],tint=first&&first.color,key=tint&&[tint.r,tint.g,tint.b].join(":");if(key&&key!==group.tint){group.tint=key;group.owners.forEach(function(o){if(o.groundOnly&&valid(o.node)){var base=o._mapObjectShadowState.baseTint;o.node.color=cc.color(Math.round(base.r*tint.r/255),Math.round(base.g*tint.g/255),Math.round(base.b*tint.b/255),base.a);}});}};
 cc.director.on(cc.Director.EVENT_BEFORE_DRAW,group.sync);group.sync();return group;
}
function attach(owner,data){
 if(owner._mapObjectShadowState||!valid(owner.node)||!valid(owner.mapMain))return;data=data||config();var record=acquire(owner,data);if(!record)return;var group=groupFor(owner),node=new cc.Node("MapObjectGlobalShadow"),image=record.entry.image,description=describe(owner),origin=description.origin,scale=description.scale;node.parent=group.node;node.group=owner.node.group;node.zIndex=record.order;node._mapObjectShadowVisual=true;node.setAnchorPoint(0,0);node.setPosition(origin.x+image.x*scale,origin.y+image.y*scale);node.setContentSize(image.width*scale,image.height*scale);var sprite=node.addComponent(cc.Sprite);sprite.sizeMode=cc.Sprite.SizeMode.CUSTOM;sprite.srcBlendFactor=cc.macro.BlendFactor.ONE;sprite.spriteFrame=record.entry.frame;
 owner._mapObjectShadowState={record:record,group:group,node:node,sprite:sprite,baseTint:owner.node.color.clone?owner.node.color.clone():Object.assign({},owner.node.color)};group.owners.add(owner);group.tint=null;group.sync();
}
function detach(owner){var state=owner._mapObjectShadowState;if(!state)return;delete owner._mapObjectShadowState;if(owner.groundOnly&&valid(owner.node))owner.node.color=state.baseTint;if(valid(state.sprite))state.sprite.spriteFrame=null;if(valid(state.node))state.node.destroy();release(state.record);var group=state.group;group.owners.delete(owner);if(!group.owners.size){cc.director.off(cc.Director.EVENT_BEFORE_DRAW,group.sync);groups.delete(group.main);activeGroups.delete(group);if(valid(group.node))group.node.destroy();}}
async function prepareStage(casters,data,session,progress){
 var root=new cc.Node("MapShadowPreparation");root.parent=cc.director.getScene();root.setPosition(100000,100000);var pins=[];
 function dispose(){pins.forEach(release);pins=[];}
 try{for(var i=0;i<casters.length;i++){if(!session.current())throw Error("Map shadow preparation cancelled");var record=acquire(casters[i],data,root);if(record)pins.push(record);if(progress)progress((i+1)/casters.length);await new Promise(function(resolve){setTimeout(resolve,0);});}if(!session.current())throw Error("Map shadow preparation cancelled");return{count:pins.length,dispose:dispose};}catch(error){dispose();throw error;}finally{root.active=false;root.destroy();}
}
exports.attach=attach;exports.detach=detach;exports.prepareStage=prepareStage;exports.settings=settings;exports.describe=describe;exports.stats=function(){return{entries:pool.size,groups:activeGroups.size,owners:Array.from(activeGroups).reduce(function(n,g){return n+g.owners.size;},0)};};
