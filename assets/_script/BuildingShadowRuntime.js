"use strict";
var Shadow = require("BuildingShadow");
function valid(node) { return !!node && (!cc.isValid || cc.isValid(node,true)); }
function layout(owner) { var main=owner.ndAniMain,json=main&&main.skeletonData&&main.skeletonData.skeletonJson;return json&&json.wallKit&&json.wallKit.layout; }
function hide(owner) { var state=owner._buildingShadowRuntime;if(state){state.hidden=true;state.node.active=false;} }
function dispose(owner) {
  var state=owner._buildingShadowRuntime;if(!state)return;
  cc.director.off(cc.Director.EVENT_BEFORE_DRAW,state.sync);
  if(valid(state.node))state.node.destroy();
  if(state.frame)state.frame.destroy();if(state.texture)state.texture.destroy();
  delete owner._buildingShadowRuntime;
}
function apply(owner, game) {
  var cfg=owner.buildInfo&&owner.buildInfo.cfg,value=cfg&&cfg.Shadow,plan=layout(owner),prior=owner._buildingShadowRuntime;
  if(!value){dispose(owner);return;}
  var signature=JSON.stringify([value,plan]);
  if(prior&&prior.signature===signature){prior.value=value;prior.plan=plan;prior.hidden=false;prior.sync();return;}
  dispose(owner);
  var image=Shadow.raster(Shadow.regions(value,plan),value.opacity);if(!image)return;
  var parent=game&&(game.ndDown||game.ndMain)||owner.node.parent;
  if(!valid(parent))return;
  var node=new cc.Node("BuildingShadowMask");node.parent=parent;node.group=owner.node.group;node._depthGroundVisual=true;
  var child=new cc.Node("ShadowTexture");child.parent=node;child.group=node.group;child.setAnchorPoint(0,0);child.setPosition(image.x,image.y);child.setContentSize(image.width,image.height);
  var texture=new cc.Texture2D();texture.initWithData(image.pixels,cc.Texture2D.PixelFormat.RGBA8888,image.pixelWidth,image.pixelHeight);texture.packable=false;
  texture.setFilters(cc.Texture2D.Filter.LINEAR,cc.Texture2D.Filter.LINEAR);
  var frame=new cc.SpriteFrame(texture),sprite=child.addComponent(cc.Sprite);sprite.sizeMode=cc.Sprite.SizeMode.CUSTOM;sprite.spriteFrame=frame;
  // Black mask RGB is already premultiplied. Preserve its alpha when the
  // ground is drawn into a transparent target as well as the game framebuffer.
  sprite.srcBlendFactor=cc.macro.BlendFactor.ONE;
  var state=owner._buildingShadowRuntime={node:node,texture:texture,frame:frame,signature:signature,value:value,plan:plan,hidden:false};
  state.sync=function () {
    if(!valid(owner.node)||!valid(node)){dispose(owner);return;}
    var current=owner.buildInfo&&owner.buildInfo.cfg;
    if(!current||current.Shadow!==state.value||layout(owner)!==state.plan){apply(owner,game);return;}
    node.active=!state.hidden&&owner.enabled!==false&&owner.node.activeInHierarchy!==false&&owner.index>0&&!owner.isDestroyed;
    if(!node.active)return;
    var source=state.value.body?owner.node:owner.ndAniMain.node;
    function point(x,y){return node.parent.convertToNodeSpaceAR(source.convertToWorldSpaceAR(cc.v2(x,y)));}
    var o=point(0,0),x=point(1,0),y=point(0,1),a=x.x-o.x,b=x.y-o.y,c=y.x-o.x,d=y.y-o.y,sx=Math.hypot(a,b);
    node.setPosition(o);node.angle=Math.atan2(b,a)*180/Math.PI;node.scaleX=sx;node.scaleY=sx?(a*d-b*c)/sx:0;
  };
  state.sync();cc.director.on(cc.Director.EVENT_BEFORE_DRAW,state.sync);
}
exports.apply=apply;exports.hide=hide;exports.dispose=dispose;
