"use strict";
// Visual ownership only. The battle HUD retains all touch and skill logic.
var PREFAB="gui-pro/skills/active-skill",ICON_ROOT="skills/icons/";
var FRAME_SCALE=116/222,ICON_SIZE=80/FRAME_SCALE;
function create(button,current,cc){
  var disposed=false,version=0,prefab=null,root=null,icon=null,iconFrame=null,iconResource="",desired=null,parts=null,appearance="";
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
      // Generated canvases contain transparent padding. Fit their imported
      // alpha bounds, preserving the illustration's own aspect ratio.
      var size=frame.getRect?frame.getRect():frame.getOriginalSize(),scale=Math.min(ICON_SIZE/size.width,ICON_SIZE/size.height);
      if(isFinite(scale)&&scale>0)icon.node.setContentSize(size.width*scale,size.height*scale);
    });
  }
  function paint(){
    if(!parts||!desired||!owned())return;
    var signature=[desired.style,desired.usable,desired.aiming].join(":");
    if(signature!==appearance){appearance=signature;parts.normal.active=desired.usable&&!desired.aiming;parts.armed.active=desired.usable&&desired.aiming;parts.disabled.active=!desired.usable;icon.node.color=cc.color(desired.usable?"#ffffff":"#aaa6b4");setIcon(desired.style);}
    var ratio=Math.max(0,Math.min(1,desired.cooldown/Math.max(1e-9,desired.totalCooldown)));
    parts.cooldown.active=desired.cooldown>0;
    if(parts.fill.fillRange!==-ratio)parts.fill.fillRange=-ratio;
  }
  if(cc&&cc.resources&&cc.resources.load&&cc.instantiate&&cc.Sprite){
    cc.resources.load(PREFAB,cc.Prefab,function(error,asset){
      if(error||!asset||!owned())return;
      prefab=retain(asset);
      try{
        root=cc.instantiate(asset);root.setParent(button);if(root.setSiblingIndex)root.setSiblingIndex(0);root.setPosition(0,28);root.scale=FRAME_SCALE;
        var artwork=root.getChildByName("Artwork");icon=artwork&&artwork.getChildByName("Icon").getComponent(cc.Sprite);
        parts={normal:root.getChildByName("Frame"),armed:root.getChildByName("Frame armed"),disabled:root.getChildByName("Frame disabled"),cooldown:root.getChildByName("Cooltime")};
        if(!icon||!parts.normal||!parts.armed||!parts.disabled||!parts.cooldown)throw Error("Incomplete skill-button prefab");
        parts.fill=parts.cooldown.getComponent(cc.Sprite);if(!parts.fill)throw Error("Missing skill cooldown sprite");
        parts.fill.type=cc.Sprite.Type.FILLED;parts.fill.fillType=cc.Sprite.FillType.RADIAL;parts.fill.fillCenter=cc.v2(.5,.5);parts.fill.fillStart=.25;
        paint();
      }catch(error){if(live(root))root.destroy();root=null;parts=null;release(prefab);prefab=null;if(cc.warn)cc.warn("Skill button artwork: "+error.message);}
    });
  }
  return {
    set:function(state){desired=state;paint();},
    get visual(){return root;},get icon(){return icon;},get cooldown(){return parts&&parts.fill;},
    destroy:function(){if(disposed)return;disposed=true;version++;if(icon)icon.spriteFrame=null;release(iconFrame);iconFrame=null;if(live(root))root.destroy();root=null;parts=null;release(prefab);prefab=null;}
  };
}
exports.create=create;exports.prefab=PREFAB;exports.iconRoot=ICON_ROOT;exports.frameScale=FRAME_SCALE;exports.iconSize=80;
