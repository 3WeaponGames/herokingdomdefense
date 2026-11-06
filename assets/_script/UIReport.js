var i;
var cc__extends = __extends;
var cc__decorate = __decorate;
Object.defineProperty(exports, "__esModule", {
  value: true
});
var $z1BaseUI = require("BaseUI");
var $z1GameTrackDataEvent = require("GameTrackDataEvent");
var $z1PlayerMgr = require("PlayerMgr");
var cc__decorator = cc._decorator;
var ccp_ccclass = cc__decorator.ccclass;
var ccp_property = cc__decorator.property;
var def_UIReport = function (t) {
  function _ctor() {
    var e = null !== t && t.apply(this, arguments) || this;
    e.Rendernum = 0;
    e.select = 0;
    return e;
  }
  cc__extends(_ctor, t);
  _ctor.prototype.start = function () {
    this.initEvent();
  };
  _ctor.prototype.initEvent = function () {
    var t = this;
    this.btnClose.on(cc.Node.EventType.TOUCH_END, function () {
      t.closeUI();
    }, this);
    this.btnPublicity.parent.on(cc.Node.EventType.TOUCH_END, function () {
      t.btnPublicity.children[0].active = !t.btnPublicity.children[0].active;
      t.Radio(1);
      t.canRender();
    }, this);
    this.btnDataloss.parent.on(cc.Node.EventType.TOUCH_END, function () {
      t.btnDataloss.children[0].active = !t.btnDataloss.children[0].active;
      t.Radio(2);
      t.canRender();
    }, this);
    this.btnGameStuck.parent.on(cc.Node.EventType.TOUCH_END, function () {
      t.btnGameStuck.children[0].active = !t.btnGameStuck.children[0].active;
      t.Radio(3);
      t.canRender();
    }, this);
    this.btnunableAD.parent.on(cc.Node.EventType.TOUCH_END, function () {
      t.btnunableAD.children[0].active = !t.btnunableAD.children[0].active;
      t.Radio(4);
      t.canRender();
    }, this);
    this.btnRender.on(cc.Node.EventType.TOUCH_END, function () {
      t.Render();
    }, this);
  };
  _ctor.prototype.canRender = function () {
    if (this.btnPublicity.parent.children[0].active || this.btnDataloss.parent.children[0].active || this.btnGameStuck.parent.children[0].active || this.btnunableAD.parent.children[0].active) {
      this.btnRender.active = true;
    } else {
      this.btnRender.active = false;
    }
  };
  _ctor.prototype.Radio = function (t) {
    this.select = t;
    this.btnPublicity.children[0].active = false;
    this.btnDataloss.children[0].active = false;
    this.btnGameStuck.children[0].active = false;
    this.btnunableAD.children[0].active = false;
    if (1 == t) {
      this.btnPublicity.children[0].active = true;
    } else if (2 == t) {
      this.btnDataloss.children[0].active = true;
    } else if (3 == t) {
      this.btnGameStuck.children[0].active = true;
    } else {
      4 == t && (this.btnunableAD.children[0].active = true);
    }
  };
  _ctor.prototype.Render = function () {
    $z1PlayerMgr.PlayerMgr.getInstance().getTrackData().youmengTrack($z1GameTrackDataEvent.TrackId.notice_X_Y, this.select, this.editBox.string);
    this.tips.active = true;
    cc.tween(this.tips).to(1, {
      y: 143.079
    }).start();
    this.scheduleOnce(this.closeUI, 1);
  };
  cc__decorate([ccp_property(cc.Node)], _ctor.prototype, "root", undefined);
  cc__decorate([ccp_property(cc.Node)], _ctor.prototype, "btnClose", undefined);
  cc__decorate([ccp_property(cc.Node)], _ctor.prototype, "btnPublicity", undefined);
  cc__decorate([ccp_property(cc.Node)], _ctor.prototype, "btnDataloss", undefined);
  cc__decorate([ccp_property(cc.Node)], _ctor.prototype, "btnGameStuck", undefined);
  cc__decorate([ccp_property(cc.Node)], _ctor.prototype, "btnunableAD", undefined);
  cc__decorate([ccp_property(cc.Node)], _ctor.prototype, "btnRender", undefined);
  cc__decorate([ccp_property(cc.Node)], _ctor.prototype, "tips", undefined);
  cc__decorate([ccp_property(cc.EditBox)], _ctor.prototype, "editBox", undefined);
  return cc__decorate([ccp_ccclass], _ctor);
}($z1BaseUI.default);
exports.default = def_UIReport;