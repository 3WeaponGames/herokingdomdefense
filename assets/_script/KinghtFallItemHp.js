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
var def_KinghtFallItemHp = function (t) {
  function _ctor() {
    var e = null !== t && t.apply(this, arguments) || this;
    e.sprPro1 = null;
    e.sprPro2 = null;
    e.labPro = null;
    e.spAni = null;
    e.sprPro = null;
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
  };
  _ctor.prototype.setType = function (t, actor) {
    if (actor && this.actor !== actor) { this.actor = actor; this._hpLayoutSignature = null; }
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
  _ctor.prototype.lateUpdate = function () {
    var actor = this.actor;
    if (!actor || !actor.node || !this.node.parent || actor.isDead()) return;
    var renderer = actor.getSpAni ? actor.getSpAni() : actor.spAni, visual = renderer && renderer.node;
    if (!visual || !renderer.skeletonData || !visual.activeInHierarchy) return;
    var parent = this.node.parent, referenceWidth = 0, referenceHeight = 0;
    if (actor.navigationTeam === "friendly") {
      var UI = require("KinghtFallUIGame").default, game = UI && UI.instance && UI.instance.ctrGame;
      var heroBar = game && game.ctrPlay && game.ctrPlay.ctrHp && game.ctrPlay.ctrHp.node;
      if (heroBar && !cc.isValid(heroBar, true)) heroBar = null;
      // Measure the hero's actual world-space bar, even when it is hidden at
      // full health. Converting those axes through the ally's parent cancels
      // every inherited unit/model scale, including a mounted rider's scale.
      var origin = heroBar ? heroBar.convertToWorldSpaceAR(cc.v2(0, 0)) : cc.v2(0, 0);
      var horizontal = heroBar ? heroBar.convertToWorldSpaceAR(cc.v2(heroBar.width, 0)) : cc.v2(64, 0);
      var vertical = heroBar ? heroBar.convertToWorldSpaceAR(cc.v2(0, heroBar.height)) : cc.v2(0, 10);
      origin = parent.convertToNodeSpaceAR(origin); horizontal = parent.convertToNodeSpaceAR(horizontal); vertical = parent.convertToNodeSpaceAR(vertical);
      referenceWidth = Math.hypot(horizontal.x - origin.x, horizontal.y - origin.y);
      referenceHeight = Math.hypot(vertical.x - origin.x, vertical.y - origin.y);
    }
    var signature = [visual.x, visual.y, visual.scaleX, visual.scaleY, visual.angle, referenceWidth, referenceHeight].join(":");
    if (this._hpRenderer === renderer && this._hpData === renderer.skeletonData && this._hpParent === this.node.parent && this._hpLayoutSignature === signature) return;
    var box = require("KinghtFallDepthView").bounds(renderer, actor.node);
    if (!box) return;
    var width = this.node.width || this.sprPro && this.sprPro.node.width;
    if (!(width > 0)) return;
    var y = box.maxY + Math.max(10, (box.maxY - box.minY) * .1);
    // Horse/weapon bounds position the bar above the rider. The hero's measured
    // bar axes determine allied dimensions independently of those visual bounds.
    var displayWidth = box.maxX - box.minX;
    var center = (box.minX + box.maxX) / 2;
    var left = parent.convertToNodeSpaceAR(actor.node.convertToWorldSpaceAR(cc.v2(center - displayWidth / 2, y)));
    var right = parent.convertToNodeSpaceAR(actor.node.convertToWorldSpaceAR(cc.v2(center + displayWidth / 2, y)));
    this.node.setPosition((left.x + right.x) / 2, Math.max(left.y, right.y));
    this.node.scaleX = referenceWidth > 0 ? referenceWidth / width : Math.abs(right.x - left.x) / width;
    if (referenceHeight > 0) this.node.scaleY = referenceHeight / (this.node.height || 10);
    this._hpRenderer = renderer; this._hpData = renderer.skeletonData; this._hpParent = parent; this._hpLayoutSignature = signature;
  };
  _ctor.prototype.setProgress = function (t) {
    if (this.sprPro) {
      if (t >= 1 || t <= 0) {
        this.node.active = false;
      } else {
        this.node.active = true;
        this.sprPro.fillRange = t;
      }
    }
  };
  _ctor.prototype.setHp = function (t, e) {
    if (this.sprPro) {
      if (t >= e || t <= 0) {
        this.node.active = false;
      } else {
        this.node.active = true;
        this.sprPro.fillRange = t / e;
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
