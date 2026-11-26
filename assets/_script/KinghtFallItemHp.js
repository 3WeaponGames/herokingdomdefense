var i;
var cc__extends = __extends;
var cc__decorate = __decorate;
Object.defineProperty(exports, "__esModule", {
  value: true
});
var $z1KinghtFallModle = require("KinghtFallModle");
var cc__decorator = cc._decorator;
var ccp_ccclass = cc__decorator.ccclass;
var ccp_property = cc__decorator.property;
var nextPosePhase = 0;
var battleUIModule, depthViewModule;
function depthView() {
  return depthViewModule || (depthViewModule = require("KinghtFallDepthView"));
}
function healthBounds(bar, actor, game, parent, scratch) {
  var Depth = depthView();
  var sources = actor.ctrPlayAni ? Depth.bodyVisuals(actor) : [actor.getSpAni ? actor.getSpAni() : actor.spAni];
  var nativeHealth = actor.node._combatActor === actor && !actor.ctrPlayAni;
  var heroMount = game && actor === game.ctrPlay && actor.node._combatActor === actor &&
    actor.ctrHp === bar && actor.ctrPlayAni && actor.ctrPlayAni.spAniMa;
  var box = null;
  sources.forEach(function (renderer) {
    if (!renderer || !renderer.skeletonData) return;
    var weightedMount = renderer === heroMount;
    box = Depth.union(box, Depth.unitBounds(renderer, parent, scratch, nativeHealth || weightedMount, weightedMount));
  });
  return box;
}
var def_KinghtFallItemHp = function (t) {
  function _ctor() {
    var e = null !== t && t.apply(this, arguments) || this;
    e.sprPro1 = null;
    e.sprPro2 = null;
    e.labPro = null;
    e.spAni = null;
    e.sprPro = null;
    e.guiProStyle = false;
    e._posePhase = nextPosePhase++ % 4;
    return e;
  }
  cc__extends(_ctor, t);
  _ctor.prototype.onLoad = function () {
    var t = this;
    if (this.spAni) {
      this.spAni.node.active = false;
      this.spAni.setCompleteListener(function () {
        t.spAni.node.active = false;
      });
    }
    this.labPro && (this.labPro.node.active = false);
    if (this.guiProStyle) {
      if (this.sprPro1) this.setFillProgress(this.sprPro1, this.sprPro1.fillRange);
      if (this.sprPro2) this.setFillProgress(this.sprPro2, this.sprPro2.fillRange);
    }
  };
  _ctor.prototype.setType = function (t, actor) {
    if (actor && actor !== this.actor) {
      this.actor = actor;
      this._poseReady = false;
    }
    switch (t) {
      case $z1KinghtFallModle.KinghtFallGameArmy.None:
        this.sprPro = null;
        this.sprPro1 && (this.sprPro1.node.active = false);
        this.sprPro2 && (this.sprPro2.node.active = false);
        break;
      case $z1KinghtFallModle.KinghtFallGameArmy.Friend:
        this.sprPro = this.sprPro1;
        this.sprPro1 && (this.sprPro1.node.active = true);
        this.sprPro2 && (this.sprPro2.node.active = false);
        break;
      case $z1KinghtFallModle.KinghtFallGameArmy.Enemy:
        this.sprPro = this.sprPro2;
        this.sprPro1 && (this.sprPro1.node.active = false);
        this.sprPro2 && (this.sprPro2.node.active = true);
    }
  };
  _ctor.prototype.onEnable = function () {
    this._poseReady = false;
  };
  _ctor.prototype.lateUpdate = function () {
    var actor = this.actor;
    if (this._battleParent || !actor || !actor.node || !this.node.parent || actor.isDead()) return;
    var parent = this.node.parent;
    var uiModule = battleUIModule || require("KinghtFallUIGame"), UI = uiModule.default;
    if (!battleUIModule && UI) battleUIModule = uiModule;
    var game = UI && UI.instance && UI.instance.ctrGame;
    var data = game && game.gameData;
    var depth = game && game._depthView;
    // The foreground pass will adopt this bar before drawing. Avoid reading
    // every new rig's pose here while its bar still has the authored parent.
    if (depth && !depth._destroyed && depth._unitHealthLayer && depth._unitHealthLayer.activeInHierarchy &&
        actor.node.parent === depth.main && (actor.hpctrl || actor.ctrHp) === this &&
        (actor === game.ctrPlay || actor._combatData === data && !actor._isPooled)) return;
    var population = data && data.enemyList && data.soldierList ? data.enemyList.length + data.soldierList.length : 0;
    var cadence = population >= 64 ? 4 : population >= 32 ? 2 : 1;
    var frame = cc.director && cc.director.getTotalFrames && cc.director.getTotalFrames();
    // The bar moves with the unit every frame. Stagger only the expensive
    // Spine pose measurement so crowded battles do not sample every bar at once.
    if (actor !== (game && game.ctrPlay) && !actor.ctrPlayAni && cadence > 1 && Number.isFinite(frame) &&
      this._poseReady && this._poseParent === parent && (frame + this._posePhase) % cadence !== 0) return;
    var heroBar = game && game.ctrPlay && game.ctrPlay.ctrHp && game.ctrPlay.ctrHp.node;
    if (heroBar && !cc.isValid(heroBar, true)) heroBar = null;
    // All combat units share the hero's GUI Pro bar size, including when the
    // hero bar is hidden at full health. Measuring through the unit's parent
    // cancels inherited model scales for enemies and mounted allies alike.
    var Depth = depthView(), scratch = this._hpSizeScratch || (this._hpSizeScratch = {});
    var reference = Depth.unitReferenceSize(heroBar, parent, heroBar ? heroBar.width : 64, heroBar ? heroBar.height : 10, scratch);
    var referenceWidth = reference.width, referenceHeight = reference.height;
    var box = healthBounds(this, actor, game, parent, scratch);
    if (!box) return;
    var width = this.node.width || this.sprPro && this.sprPro.node.width;
    if (!(width > 0)) return;
    // Keep four units of breathing room at the standard ten-unit bar height.
    // Measure in the bar's parent so unit/model scale cannot enlarge the gap.
    // Read the visible pose each frame: hidden hit/death art and an earlier
    // attack pose must not leave a small unit's bar floating overhead.
    var anchorY = typeof this.node.anchorY === "number" ? this.node.anchorY : .5;
    var x = (box.minX + box.maxX) / 2, y = box.maxY + referenceHeight * (anchorY + .4);
    if (this.node.x !== x || this.node.y !== y) this.node.setPosition(x, y);
    if (referenceWidth > 0) {
      var scaleX = referenceWidth / width;
      if (this.node.scaleX !== scaleX) this.node.scaleX = scaleX;
    }
    if (referenceHeight > 0) {
      var scaleY = referenceHeight / (this.node.height || 10);
      if (this.node.scaleY !== scaleY) this.node.scaleY = scaleY;
    }
    this._poseReady = true;
    this._poseParent = parent;
  };
  _ctor.prototype.battleReferenceSize = function (layer) {
    var saved = this._battleParent, node = this.node;
    var scratch = this._battleReferenceScratch || (this._battleReferenceScratch = {});
    return depthView().unitReferenceSize(saved ? saved.parent : node, layer,
      (node.width || 64) * (saved ? Math.abs(saved.scaleX) : 1),
      (node.height || 10) * (saved ? Math.abs(saved.scaleY) : 1), scratch);
  };
  _ctor.prototype.moveToBattleLayer = function (layer) {
    var node = this.node;
    this._battleParent = { parent: node.parent, x: node.x, y: node.y, angle: node.angle,
      scaleX: node.scaleX, scaleY: node.scaleY, zIndex: node.zIndex };
    node.setParent(layer);
    node.angle = 0;
    node.zIndex = 0;
    this.setHp(this.actor.hp, this.actor.hpMax);
  };
  _ctor.prototype.syncBattlePosition = function (game, reference, frame, cadence, projection) {
    var saved = this._battleParent, actor = this.actor, node = this.node, layer = node.parent;
    if (!saved || !layer) return;
    if (!cc.isValid(saved.parent, true) || !saved.parent.activeInHierarchy) {
      node.active = false;
      return;
    }
    if (!node.active) this.setHp(actor.hp, actor.hpMax);
    var originX, originY;
    if (projection) {
      // Combat roots share the map-to-layer transform even when their own
      // poses and positions are different. Nested actors use their own origin.
      var x = actor.node.x, y = actor.node.y;
      originX = projection.x + projection.a * x + projection.c * y;
      originY = projection.y + projection.b * x + projection.d * y;
    } else {
      var origin = layer.convertToNodeSpaceAR(actor.node.convertToWorldSpaceAR(cc.Vec2.ZERO));
      originX = origin.x;
      originY = origin.y;
    }
    var generation = actor.node._combatGeneration;
    var firstPose = saved.offsetX === undefined;
    var poseDue = actor === game.ctrPlay || (frame + this._posePhase) % cadence === 0 ||
      (firstPose ? cadence < 4 : saved.generation !== generation);
    if (poseDue || firstPose) {
      // Large groups can show every bar immediately from its original anchor.
      // Sample the new rigs on their assigned frames instead of all at once.
      var box = poseDue && healthBounds(this, actor, game, layer, this._hpSizeScratch || (this._hpSizeScratch = {}));
      var anchor = box ? null : layer.convertToNodeSpaceAR(saved.parent.convertToWorldSpaceAR(cc.v2(saved.x, saved.y)));
      saved.offsetX = (box ? (box.minX + box.maxX) / 2 : anchor.x) - originX;
      saved.offsetY = (box ? box.maxY + reference.height * (node.anchorY + .4) : anchor.y) - originY;
      saved.generation = generation;
    }
    var barX = originX + saved.offsetX, barY = originY + saved.offsetY;
    if (node.x !== barX || node.y !== barY) node.setPosition(barX, barY);
    var sx = reference.width / (node.width || 64), sy = reference.height / (node.height || 10);
    if (node.scaleX !== sx) node.scaleX = sx;
    if (node.scaleY !== sy) node.scaleY = sy;
  };
  _ctor.prototype.restoreBattleParent = function () {
    var saved = this._battleParent, node = this.node, actor = this.actor;
    this._battleParent = null;
    this._poseReady = false;
    if (!saved || !cc.isValid(node, true)) return;
    if (!cc.isValid(saved.parent, true)) {
      node.active = false;
      node.destroy();
      return;
    }
    node.setParent(saved.parent);
    node.setPosition(saved.x, saved.y);
    node.angle = saved.angle;
    node.scaleX = saved.scaleX;
    node.scaleY = saved.scaleY;
    node.zIndex = saved.zIndex;
    this.setHp(actor && !actor._isPooled && !actor.isDead() ? actor.hp : 0, actor ? actor.hpMax : 0);
  };
  _ctor.prototype.setFillProgress = function (sprite, progress) {
    sprite.fillRange = progress;
    if (this.guiProStyle) {
      // Sliced kit artwork keeps its border and gloss while health changes.
      // Use geometry rather than stretching/cropping the entire fill texture;
      // this also works in the native simulator and Canvas previews.
      sprite.node.anchorX = 0;
      sprite.node.x = -this.node.width / 2 + 2;
      sprite.node.width = Math.max(0, this.node.width - 4) * progress;
    }
  };
  _ctor.prototype.setProgress = function (t) {
    if (this.sprPro) {
      if (t >= 1 || t <= 0) {
        this.node.active = false;
      } else {
        this.node.active = true;
        this.setFillProgress(this.sprPro, t);
      }
    }
  };
  _ctor.prototype.setHp = function (t, e) {
    if (this.sprPro) {
      if (t <= 0 || e <= 0 || (t >= e && !this._battleParent)) {
        this.node.active = false;
      } else {
        this.node.active = true;
        this.setFillProgress(this.sprPro, Math.min(1, t / e));
        this.labPro && (this.labPro.string = t.toFixed(2) + "/" + e.toFixed(2));
      }
    }
  };
  _ctor.prototype.showAni = function () {
    if (this.spAni) {
      this.spAni.node.active = true;
      this.spAni.setAnimation(0, this.spAni.defaultAnimation, false);
    }
  };
  cc__decorate([ccp_property({
    tooltip: "Use the sliced GUI Pro unit health bar artwork"
  })], _ctor.prototype, "guiProStyle", undefined);
  cc__decorate([ccp_property({
    type: cc.Sprite,
    tooltip: "我方血条"
  })], _ctor.prototype, "sprPro1", undefined);
  cc__decorate([ccp_property({
    type: cc.Sprite,
    tooltip: "敌方血条"
  })], _ctor.prototype, "sprPro2", undefined);
  cc__decorate([ccp_property({
    type: cc.Label,
    tooltip: "敌方血条"
  })], _ctor.prototype, "labPro", undefined);
  cc__decorate([ccp_property({
    type: sp.Skeleton,
    tooltip: "敌方血条"
  })], _ctor.prototype, "spAni", undefined);
  return cc__decorate([ccp_ccclass], _ctor);
}(cc.Component);
exports.default = def_KinghtFallItemHp;
