"use strict";
// Screen-space weather in the real battle only. This owns no inputs, audio,
// gameplay random state, damage, editor drafts or player progress.
var Clock=require("./ForestRainState"),Catalog=require("./HeroSkillVFXCatalog");
function valid(node){return !!node&&cc.isValid(node,true);}
var Rain=cc.Class({
  extends:cc.Component,
  init:function(runtime){
    this.game=runtime.game;this.ui=runtime.ui;this.data=this.game.gameData;this.epoch=this.game._combatEpoch;this.arts=new Map();this.hidden=false;this.disposed=false;
    var cfg=this.data.levelCfg||{},seed=String(cfg.ID||cfg.id||cfg.prefab||"deep-forest").split("").reduce(function(n,c){return((n*33)^c.charCodeAt(0))>>>0;},5381);this.clock=Clock.create(seed);
    this.hide=function(){this.hidden=true;this.node.active=false;};this.show=function(){this.hidden=false;this.node.active=true;};
    cc.game.on(cc.game.EVENT_HIDE,this.hide,this);cc.game.on(cc.game.EVENT_SHOW,this.show,this);
  },
  current:function(){return this.game&&valid(this.game.node)&&valid(this.ui.node)&&!this.ui.isclose&&this.ui.ctrGame===this.game&&this.game.gameData===this.data&&this.game._combatEpoch===this.epoch&&require("BattleSounds").biome(this.game)==="deep-forest";},
  prepare:function(kind){
    var art=this.arts.get(kind),self=this;if(art)return art;
    var clip=Catalog.clips.filter(function(c){return c.id==="forest-rain-"+(kind==="soft"?"soft":kind);})[0];if(!clip)return null;
    art={clip:clip,frames:new Map(),nodes:[],asset:null};this.arts.set(kind,art);
    cc.resources.load(clip.resource,cc.SpriteFrame,function(error,asset){if(self.disposed||!valid(self.node)||self.arts.get(kind)!==art||!self.current())return;if(error||!asset){art.failed=true;return;}art.asset=asset.addRef?asset.addRef():asset;});return art;
  },
  paint:function(entity){
    var art=this.prepare(entity.kind);if(!art||!art.asset)return;var clip=art.clip;
    var size=cc.view.getVisibleSize(),origin=cc.view.getVisibleOrigin?cc.view.getVisibleOrigin():cc.v2(0,0),cell=Math.max(256,size.width/4,size.height/6),columns=Math.ceil(size.width/cell),rows=Math.ceil(size.height/cell),count=Math.min(24,columns*rows);
    for(var i=0;i<count;i++){
      // Stagger tile phases: sparse rain must not blink out everywhere on the
      // same empty frame or repeat an obvious synchronized pattern.
      var index=Math.floor((entity.age+i*.157)*clip.fps)%clip.frames,frame=art.frames.get(index);
      if(!frame){var base=art.asset.getRect();frame=art.asset.clone();frame.setRect(cc.rect(base.x+index%clip.columns*clip.cell,base.y+Math.floor(index/clip.columns)*clip.cell,clip.cell,clip.cell));frame.setOriginalSize(cc.size(clip.cell,clip.cell));frame.setOffset(cc.v2(0,0));art.frames.set(index,frame);}
      var record=art.nodes[i];if(!record){var node=new cc.Node("Forest rain "+entity.kind);node.setParent(this.node);record={node:node,sprite:node.addComponent(cc.Sprite)};art.nodes.push(record);}
      var world=cc.v2(origin.x+(i%columns+.5)*cell,origin.y+(Math.floor(i/columns)+.5)*cell),local=this.node.convertToNodeSpaceAR(world),unit=this.node.convertToNodeSpaceAR(cc.v2(world.x+cell,world.y));
      record.node.active=true;record.node.setPosition(local);record.node.scale=Math.hypot(unit.x-local.x,unit.y-local.y)/clip.cell;record.node.opacity=Math.round(190*entity.opacity);record.sprite.spriteFrame=frame;
    }
    for(var n=count;n<art.nodes.length;n++)art.nodes[n].node.active=false;
  },
  update:function(dt){
    if(!this.clock||this.disposed)return;if(!this.current()||this.game.gameStatus===require("KinghtFallModle").KinghtFallGameStage.End){this.node.destroy();return;}
    if(this.hidden||this.ui.isPauset||!this.ui.node.activeInHierarchy)return;
    this.arts.forEach(function(art){art.nodes.forEach(function(record){record.node.active=false;});});
    var entities=Clock.step(this.clock,Math.max(0,Math.min(1,dt)));for(var i=0;i<entities.length;i++)this.paint(entities[i]);
  },
  onDestroy:function(){
    this.disposed=true;cc.game.off(cc.game.EVENT_HIDE,this.hide,this);cc.game.off(cc.game.EVENT_SHOW,this.show,this);
    if(this.arts)this.arts.forEach(function(art){art.nodes.forEach(function(record){record.sprite.spriteFrame=null;});art.frames.forEach(function(frame){frame.destroy();});if(art.asset&&art.asset.decRef)art.asset.decRef();});
    if(this.game&&this.game._forestRain===this)delete this.game._forestRain;
  }
});
exports.ensure=function(runtime){
  if(typeof CC_EDITOR!=="undefined"&&CC_EDITOR||!runtime||!runtime.game||!runtime.ui||!runtime.ui.ctrUI||!valid(runtime.ui.ctrUI.node)||require("BattleSounds").biome(runtime.game)!=="deep-forest")return;
  if(runtime.game._forestRain&&valid(runtime.game._forestRain.node))return;
  var node=new cc.Node("Deep Forest weather");node.setParent(runtime.ui.ctrUI.node);node.zIndex=-1;var rain=node.addComponent(Rain);runtime.game._forestRain=rain;rain.init(runtime);
};
