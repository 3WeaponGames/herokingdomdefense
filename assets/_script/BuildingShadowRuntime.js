"use strict";
var Shadow = require("BuildingShadow"),entries=[];
function valid(node) { return !!node && (!cc.isValid || cc.isValid(node,true)); }
function parentFor(owner,game,row){return Shadow.aboveGround(row,owner.buildCfg&&owner.buildCfg.enumValue)&&owner.ndAniDown&&valid(owner.ndAniDown.node)?owner.ndAniDown.node:game&&(game.ndDown||game.ndMain)||owner.node.parent;}
function layout(owner) { var main=owner.ndAniMain,json=main&&main.skeletonData&&main.skeletonData.skeletonJson;return json&&json.wallKit&&json.wallKit.layout; }
function ready(owner) {
  var artwork=owner._buildingAppearance;
  if(artwork&&(artwork.loading||artwork.placementRequest||artwork.placement))return false;
  // Custom artwork disables its original Spine while its own placement runs.
  // Only enabled building renderers own live native construction timelines.
  return [owner.ndAniMain,owner.ndAniDown].concat(owner.ndAniOther||[]).every(function(renderer){
    if(!renderer||renderer.enabled===false||!valid(renderer.node)||renderer.node.activeInHierarchy===false||!renderer.getCurrent)return true;
    var track=renderer.getCurrent(0),animation=track&&(track.animation||track.getAnimation&&track.getAnimation()),name=animation&&(typeof animation==="string"?animation:animation.name||animation.getName&&animation.getName());
    if(!name||!/^(?:create|upgrade)(?:_|$)/i.test(name))return true;
    var duration=animation.duration;if(duration===undefined&&animation.getDuration)duration=animation.getDuration();
    var time=track.trackTime;if(time===undefined&&track.getTrackTime)time=track.getTrackTime();
    return typeof time==="number"&&typeof duration==="number"&&time>=duration;
  });
}
function hide(owner) { var state=owner._buildingShadowRuntime;if(state){state.hidden=true;state.node.active=false;} }
function prepareEntry(value,plan){
  var signature=JSON.stringify([value,plan]),entry=entries.find(function(e){return e.signature===signature;});if(entry){entry.refs++;return entry;}
  var image=Shadow.raster(Shadow.regions(value,plan),value.opacity);if(!image)return null;
  var texture=new cc.Texture2D();texture.initWithData(image.pixels,cc.Texture2D.PixelFormat.RGBA8888,image.pixelWidth,image.pixelHeight);texture.packable=false;texture.setFilters(cc.Texture2D.Filter.LINEAR,cc.Texture2D.Filter.LINEAR);
  delete image.pixels;entry={signature:signature,image:image,texture:texture,frame:new cc.SpriteFrame(texture),refs:1};entries.push(entry);return entry;
}
function releaseEntry(entry){if(!entry||--entry.refs>0)return;var at=entries.indexOf(entry);if(at>=0)entries.splice(at,1);entry.frame.destroy();entry.texture.destroy();}
function dispose(owner) {
  var state=owner._buildingShadowRuntime;if(!state)return;
  cc.director.off(cc.Director.EVENT_BEFORE_DRAW,state.sync);
  if(valid(state.sprite))state.sprite.spriteFrame=null;
  if(valid(state.node))state.node.destroy();
  releaseEntry(state.entry);
  delete owner._buildingShadowRuntime;
}
function apply(owner, game) {
  var cfg=owner.buildInfo&&owner.buildInfo.cfg,value=cfg&&cfg.Shadow,plan=layout(owner),prior=owner._buildingShadowRuntime;
  if(!value){dispose(owner);return;}
  var signature=JSON.stringify([value,plan]);
  if(prior&&prior.signature===signature){prior.value=value;prior.plan=plan;prior.hidden=false;prior.sync();return;}
  dispose(owner);
  var parent=parentFor(owner,game,cfg);
  if(!valid(parent))return;
  var prepared=game&&game._stageAssets&&game._stageAssets.shadows&&game._stageAssets.shadows.getManual&&game._stageAssets.shadows.getManual(owner,cfg,plan),entry=prepared||prepareEntry(value,plan);if(!entry)return;if(prepared)entry.refs++;
  var image=entry.image,texture=entry.texture,frame=entry.frame;
  var node=new cc.Node("BuildingShadowMask");node.parent=parent;node.group=owner.node.group;node._depthGroundVisual=true;
  var child=new cc.Node("ShadowTexture");child.parent=node;child.group=node.group;child.setAnchorPoint(0,0);child.setPosition(image.x,image.y);child.setContentSize(image.width,image.height);
  var sprite=child.addComponent(cc.Sprite);sprite.sizeMode=cc.Sprite.SizeMode.CUSTOM;sprite.spriteFrame=frame;
  // Black mask RGB is already premultiplied. Preserve its alpha when the
  // ground is drawn into a transparent target as well as the game framebuffer.
  sprite.srcBlendFactor=cc.macro.BlendFactor.ONE;
  var state=owner._buildingShadowRuntime={node:node,texture:texture,frame:frame,sprite:sprite,entry:entry,signature:signature,value:value,plan:plan,hidden:false};
  state.sync=function () {
    if(!valid(owner.node)||!valid(node)){dispose(owner);return;}
    var current=owner.buildInfo&&owner.buildInfo.cfg;
    if(!current||current.Shadow!==state.value||layout(owner)!==state.plan){apply(owner,game);return;}
    var nextParent=parentFor(owner,game,current);if(!valid(nextParent)){node.active=false;return;}if(node.parent!==nextParent)node.parent=nextParent;
    node.active=!state.hidden&&owner.enabled!==false&&owner.node.activeInHierarchy!==false&&owner.index>0&&!owner.isDestroyed&&ready(owner);
    if(!node.active)return;
    node.opacity=owner._buildingNight?13:255;
    var source=state.value.body?owner.node:owner.ndAniMain.node;
    function point(x,y){return node.parent.convertToNodeSpaceAR(source.convertToWorldSpaceAR(cc.v2(x,y)));}
    var o=point(0,0),x=point(1,0),y=point(0,1),a=x.x-o.x,b=x.y-o.y,c=y.x-o.x,d=y.y-o.y,sx=Math.hypot(a,b);
    node.setPosition(o);node.angle=Math.atan2(b,a)*180/Math.PI;node.scaleX=sx;node.scaleY=sx?(a*d-b*c)/sx:0;
  };
  state.sync();cc.director.on(cc.Director.EVENT_BEFORE_DRAW,state.sync);
}
exports.apply=apply;exports.hide=hide;exports.dispose=dispose;
exports.ready=ready;
exports.prepareEntry=prepareEntry;exports.releaseEntry=releaseEntry;
