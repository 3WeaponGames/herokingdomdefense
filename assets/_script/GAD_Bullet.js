var i;
var cc__extends = __extends;
var cc__decorate = __decorate;
Object.defineProperty(exports, "__esModule", {
  value: true
});
var $z1GAD_Configs = require("GAD_Configs");
var $z1GADGameEnumData = require("GADGameEnumData");
var $z1GAD_DataMgr = require("GAD_DataMgr");
var $z1GAD_PlayerMgr = require("GAD_PlayerMgr");
var $z1GAD_Base = require("GAD_Base");
var cc__decorator = cc._decorator;
var ccp_ccclass = cc__decorator.ccclass;
var ccp_property = cc__decorator.property;
var def_GAD_Bullet = function (t) {
  function _ctor() {
    var e = null !== t && t.apply(this, arguments) || this;
    e.skeArrow = null;
    e.colliderSize = null;
    e._flyDis = 0;
    e._hideDis = 0;
    e._atkDamage = 0;
    e._cfg = null;
    return e;
  }
  cc__extends(_ctor, t);
  _ctor.prototype.start = function () {
    // init also runs on pool reuse; start runs only once per component.
  };
  _ctor.prototype.getHitEffectName = function () {
    return this._cfg.arrowhit;
  };
  _ctor.prototype.init = function (t, e) {
    cc.Tween.stopAllByTarget(this.node);
    this.node.opacity = 255;
    this._isPooled = false;
    this._spawnFrame = cc.director && cc.director.getTotalFrames ? cc.director.getTotalFrames() : -1;
    this.initTagID();
    this._atkDamage = e;
    this._roleType = $z1GAD_Configs.emGADRoleType.Bullet;
    this._cfg = t;
    this._moveSpeed = $z1GAD_DataMgr.default.getInstance().getParam($z1GADGameEnumData.enumGADBasicCfg.swordFlySpeed, 300);
    this._maxSpeed = this._moveSpeed;
    this._hideDis = $z1GAD_DataMgr.default.getInstance().getParam($z1GADGameEnumData.enumGADBasicCfg.swordFLlyDistance, 300);
    this._flyDis = 0;
    this._colliderGroups.clear();
    this._colliderTags.clear();
    this.setRoleState($z1GAD_Configs.emGADRoleState.Move);
    // The authored arrow is a Sprite; its legacy Spine renderer is disabled.
    if (this.skeArrow) {
      if (this.skeArrow.enabled !== false) this.skeArrow.setAnimation(0, this._cfg.resName, true);
      else this.skeArrow.node.active = false;
    }
  };
  _ctor.prototype.getWorldColldierRect = function (width, height) {
    // The flat Sprite keeps the authored artwork size independently of its
    // narrow collision box. Older prefabs retain their node-sized collider.
    var matrix = this._poolGame && this._poolGame._bulletWorldMatrix;
    if (matrix) {
      // Every projectile shares this parent's frame transform. Avoid allocating
      // an anchor, position and converted world vector for every collision query.
      var node = this.node, x = node.x, y = node.y, z = node.z, m = matrix.m;
      var w = ((this.colliderSize ? this.colliderSize.width : node.width) + (width || 0)) * node.scaleX;
      var h = ((this.colliderSize ? this.colliderSize.height : node.height) + (height || 0)) * node.scaleY;
      return cc.rect(x * m[0] + y * m[4] + z * m[8] + m[12] - node.anchorX * w,
        x * m[1] + y * m[5] + z * m[9] + m[13] - node.anchorY * h, w, h);
    }
    return t.prototype.getWorldColldierRect.call(this,
      (width || 0) + (this.colliderSize ? this.colliderSize.width - this.node.width : 0),
      (height || 0) + (this.colliderSize ? this.colliderSize.height - this.node.height : 0));
  };
  _ctor.prototype.checkAutoDie = function () {
    return this._flyDis >= this._hideDis;
  };
  _ctor.prototype.update = function (t) {
    if (this.isUseful && $z1GAD_PlayerMgr.default.getInstance().getState() == $z1GAD_Configs.emGADGameState.Game) {
      t = Math.min(t, .02);
      if (this._projectileVisual) this._projectileVisual.step(t);
      this.node.y += this._moveSpeed * t;
      this._flyDis += this._moveSpeed * t;
    }
  };
  _ctor.prototype.onDie = function () {
    if (this._isPooled || this.isDie) return;
    var t = this;
    this.setRoleState($z1GAD_Configs.emGADRoleState.Die);
    cc.tween(this.node).to(.1, {
      opacity: 0
    }).call(function () {
      t.removeFromScreen();
    }).start();
  };
  _ctor.prototype.removeFromScreen = function () {
    if (this._isPooled) return;
    this._shot = null;
    if (this._projectileVisual) this._projectileVisual.reset();
    this.setRoleState($z1GAD_Configs.emGADRoleState.Die);
    cc.Tween.stopAllByTarget(this.node);
    var game = this._poolGame;
    this._isPooled = true;
    if (game && !game.isclose && game._bulletPool && game._bulletPool.length < 256) {
      this.node.active = false;
      // Keep the slot under its owner. Detaching/reparenting every volley
      // forces Creator to reorder and revisit the entire projectile tree.
      game._bulletPool.push(this.node);
    } else {
      this._poolGame = null;
      this.node.destroy();
    }
  };
  _ctor.prototype.getAtkDamage = function () {
    return this._atkDamage;
  };
  _ctor.prototype.onDestroy = function () {
    if (this._projectileVisual) require("ProjectileLooks").release(this);
    if (t.prototype.onDestroy) t.prototype.onDestroy.call(this);
  };
  cc__decorate([ccp_property(sp.Skeleton)], _ctor.prototype, "skeArrow", undefined);
  cc__decorate([ccp_property(cc.Size)], _ctor.prototype, "colliderSize", undefined);
  return cc__decorate([ccp_ccclass], _ctor);
}($z1GAD_Base.default);
exports.default = def_GAD_Bullet;
