"use strict";
// Visual ownership only. The battle HUD retains all touch and skill logic.
var PREFAB="gui-pro/skills/active-skill",ICON_ROOT="skills/icons/";
var FRAME_WIDTH=192,FRAME_HEIGHT=206,ICON_SIZE=166,FACE_Y=7,ROOT_Y=28,DEFAULT_DIAMETER=104*1.15;
var FRAME_SCALE=DEFAULT_DIAMETER/FRAME_WIDTH;
function validDiameter(value){return typeof value==="number"&&isFinite(value)&&value>0;}
function frameScale(diameter){return (validDiameter(diameter)?diameter:DEFAULT_DIAMETER)/FRAME_WIDTH;}
function bounds(diameter){var scale=frameScale(diameter);return {left:-FRAME_WIDTH*scale/2,right:FRAME_WIDTH*scale/2,bottom:ROOT_Y-FRAME_HEIGHT*scale/2,top:ROOT_Y+FRAME_HEIGHT*scale/2};}
function faceCenterY(diameter){return ROOT_Y+FACE_Y*frameScale(diameter);}
function create(button,current,cc){
  var disposed=false,version=0,prefab=null,root=null,icon=null,iconFrame=null,iconResource="",desired=null,parts=null,appearance="",diameter=DEFAULT_DIAMETER;
  function live(value){return !!value&&(!cc.isValid||cc.isValid(value,true));}
  function owned(){return !disposed&&live(button)&&current();}
  function release(asset){if(asset&&asset.decRef)asset.decRef();}
  function retain(asset){if(asset&&asset.addRef)asset.addRef();return asset;}
  function setIcon(style){
    var resource=ICON_ROOT+style;if(resource===iconResource)return;iconResource=resource;var token=++version;
    if(icon)icon.spriteFrame=null;release(iconFrame);iconFrame=null;
    cc.resources.load(resource,cc.SpriteFrame,function(error,frame){
      if(error||!frame||!owned()||token!==version||!live(icon&&icon.node))return;
      iconFrame=retain(frame);icon.trim=true;icon.sizeMode=cc.Sprite.SizeMode.CUSTOM;icon.spriteFrame=frame;
      // Square skill scenes fill the circular face. Preserve aspect ratio for
      // any older rectangular illustration rather than stretching its artwork.
      var size=frame.getRect?frame.getRect():frame.getOriginalSize(),scale=Math.min(ICON_SIZE/size.width,ICON_SIZE/size.height);
      if(isFinite(scale)&&scale>0)icon.node.setContentSize(size.width*scale,size.height*scale);
    });
  }
  function paint(){
    if(!parts||!desired||!owned())return;
    var cooling=desired.cooldown>0,signature=[desired.style,desired.usable,desired.aiming,cooling].join(":");
    if(signature!==appearance){appearance=signature;parts.normal.active=desired.usable&&!desired.aiming;parts.armed.active=desired.usable&&desired.aiming;parts.disabled.active=!desired.usable;icon.node.color=cc.color(desired.usable||cooling?"#ffffff":"#aaa6b4");setIcon(desired.style);}
    var ratio=Math.max(0,Math.min(1,desired.cooldown/Math.max(1e-9,desired.totalCooldown)));
    parts.cooldown.active=cooling;
    // Positive remaining coverage keeps the dark sector counterclockwise from
    // noon, so the uncovered illustration grows clockwise as time elapses.
    if(parts.fill.fillRange!==ratio)parts.fill.fillRange=ratio;
  }
  if(cc&&cc.resources&&cc.resources.load&&cc.instantiate&&cc.Sprite){
    cc.resources.load(PREFAB,cc.Prefab,function(error,asset){
      if(error||!asset||!owned())return;
      prefab=retain(asset);
      try{
        root=cc.instantiate(asset);root.setParent(button);if(root.setSiblingIndex)root.setSiblingIndex(0);root.setPosition(0,ROOT_Y);root.scale=frameScale(diameter);
        var artwork=root.getChildByName("Artwork");icon=artwork&&artwork.getChildByName("Icon").getComponent(cc.Sprite);
        parts={normal:root.getChildByName("Frame"),armed:root.getChildByName("Frame armed"),disabled:root.getChildByName("Frame disabled"),cooldown:artwork&&artwork.getChildByName("Cooltime")};
        if(!icon||!parts.normal||!parts.armed||!parts.disabled||!parts.cooldown)throw Error("Incomplete skill-button prefab");
        parts.fill=parts.cooldown.getComponent(cc.Sprite);if(!parts.fill)throw Error("Missing skill cooldown sprite");
        if(cc.Mask){var mask=artwork.getComponent(cc.Mask);if(!mask)throw Error("Missing circular skill mask");mask.type=cc.Mask.Type.ELLIPSE;mask.segments=96;mask.inverted=false;}
        parts.fill.type=cc.Sprite.Type.FILLED;parts.fill.fillType=cc.Sprite.FillType.RADIAL;parts.fill.fillCenter=cc.v2(.5,.5);parts.fill.fillStart=.25;
        paint();
      }catch(error){if(live(root))root.destroy();root=null;parts=null;release(prefab);prefab=null;if(cc.warn)cc.warn("Skill button artwork: "+error.message);}
    });
  }
  return {
    set:function(state){desired=state;paint();},
    resize:function(value){if(!validDiameter(value)||diameter===value)return;diameter=value;if(live(root))root.scale=frameScale(diameter);},
    get visual(){return root;},get icon(){return icon;},get cooldown(){return parts&&parts.fill;},
    destroy:function(){if(disposed)return;disposed=true;version++;if(icon)icon.spriteFrame=null;release(iconFrame);iconFrame=null;if(live(root))root.destroy();root=null;parts=null;release(prefab);prefab=null;}
  };
}
exports.create=create;exports.prefab=PREFAB;exports.iconRoot=ICON_ROOT;exports.frameScale=FRAME_SCALE;exports.iconSize=ICON_SIZE*FRAME_SCALE;
exports.defaultDiameter=DEFAULT_DIAMETER;exports.bounds=bounds;exports.faceCenterY=faceCenterY;
