var i;
var cc__extends = __extends;
var cc__decorate = __decorate;
Object.defineProperty(exports, "__esModule", {
  value: true
});
var $z1BaseCtrl = require("BaseCtrl");
var $z1UIMgr = require("UIMgr");
var $z1Config = require("Config");
var $z1KinghtFallConfig = require("KinghtFallConfig");
var $z1KinghtFallDataMgr = require("KinghtFallDataMgr");
var $z1KinghtFallPlayerMgr = require("KinghtFallPlayerMgr");
var cc__decorator = cc._decorator;
var ccp_ccclass = cc__decorator.ccclass;
var ccp_property = cc__decorator.property;
var def_KinghtFallHomeTalentCtrl = function (t) {
  function _ctor() {
    var e = null !== t && t.apply(this, arguments) || this;
    e.ndItem = null;
    e.ndParent = null;
    e.graphics1 = null;
    e.graphics2 = null;
    e.graphics3 = null;
    e.max = 0;
    e.stratPos = cc.v2();
    e.cellSize = new cc.Size(250, 220);
    e.range = 22;
    return e;
  }
  cc__extends(_ctor, t);
  _ctor.prototype.onEnable = function () {
    if (!this._homeTabReady) return;
    this.initItem();
    this.scheduleHomeGuide();
  };
  _ctor.prototype.onDisable = function () {
    this.unschedule(this.showHomeGuide);
  };
  _ctor.prototype.start = function () {
    this.ndItem.getPosition(this.stratPos);
    this.ndItem.active = false;
    this.initEventListener();
    this.initData();
    this.initView();
    this.initItem();
    this._homeTabReady = true;
    this.scheduleHomeGuide();
    var e = this.nodeInfo[this.max].ndItem[0];
    this.ndParent.scrollToOffset(cc.v2(e.x, this.ndParent.content.height - e.y - this.cellSize.height), .1);
  };
  _ctor.prototype.scheduleHomeGuide = function () {
    this.unschedule(this.showHomeGuide);
    this.scheduleOnce(this.showHomeGuide, .5);
  };
  _ctor.prototype.showHomeGuide = function () {
    if (!this.node.activeInHierarchy) return;
    var guide = $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getGuideData();
    var level = $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getUserData().getTalentLevel(this.nodeInfo[0].cfgList[0].ID);
    if (6 == guide.getGroupId() && level && level.isLock) {
      guide.setGroupId(7);
      return void guide.setStepId(0);
    }
    this.sendEvent($z1KinghtFallConfig.KinghtFallEventName.NewbieGuide, 6, this.nodeInfo[0].ndItem[0]);
  };
  _ctor.prototype.initEventListener = function () {
    this.addEvent($z1KinghtFallConfig.KinghtFallEventName.TalentUpdate, this.initItem);
    this.addEvent($z1KinghtFallConfig.KinghtFallEventName.RefreshGold, this.initItem);
  };
  _ctor.prototype.initData = function () {
    var t = this;
    this.nodeInfo = [];
    var e = $z1KinghtFallDataMgr.KinghtFallDataMgr.getInstance().getTalentLevelCfg();
    var n = function (t) {
      var n = [];
      for (var i = 0; i < e.length; i++) {
        e[i].Level == t && n.push(e[i]);
      }
      return n.sort(function (left, right) { return (left.BranchColumn || 0) - (right.BranchColumn || 0); });
    };
    var i = function (e) {
      var i = n(e);
      if (0 == i.length) {
        return "break";
      }
      var o = {
        level: e,
        cfgList: i,
        ndItem: [],
        pos: [],
        tag: []
      };
      var r = a.stratPos.x - (i.length - 1) / 2 * a.cellSize.width;
      var s = function (n) {
        var s = cc.instantiate(a.ndItem);
        var l = cc.v2(r + n * a.cellSize.width, a.stratPos.y + (e - 1) * a.cellSize.height);
        s.setParent(a.ndParent.content);
        s.active = true;
        s.setPosition(l);
        var g = $z1KinghtFallDataMgr.KinghtFallDataMgr.getInstance().getTalentCfg(i[n].kindID);
        a.loadSpriteFrame($z1KinghtFallConfig.KinghtFallBundelName.IconTalent, g.Image, function (t) {
          if (!t || !cc.isValid(s, true)) return;
          var icon = s.getChildByName("sprIcon").getComponent(cc.Sprite);
          icon.spriteFrame = t;
          // Full-canvas stat sprites retain transparent padding. Keep their
          // artwork inside the authored badge instead of adopting 128px size.
          if (typeof g.Image === "string" && g.Image.indexOf("@icon/Stats Icons/") === 0) {
            icon.sizeMode = cc.Sprite.SizeMode.CUSTOM;
            icon.node.setContentSize(96, 96);
          }
        });
        s.on(cc.Node.EventType.TOUCH_END, function () {
          t.onClick(i[n]);
        }, a);
        cc.tween(s.getChildByName("ndArr")).set({
          y: 40
        }).to(.2, {
          y: 50
        }).to(.4, {
          y: 30
        }).to(.2, {
          y: 40
        }).union().repeatForever().start();
        o.ndItem.push(s);
        o.pos.push(l);
      };
      for (var l = 0; l < i.length; l++) {
        s(l);
      }
      a.nodeInfo.push(o);
    };
    var a = this;
    for (var o = 1; "break" !== i(o); o++) {
      ;
    }
    this.ndParent.content.height = this.cellSize.height * this.nodeInfo.length + this.stratPos.y;
  };
  _ctor.prototype.initView = function () {
    for (var t = 0; t < this.nodeInfo.length; t++) {
      this.lineToLevel(t, this.graphics1);
      this.lineToLevel(t, this.graphics2);
    }
    this.graphics1.stroke();
    this.graphics2.stroke();
  };
  _ctor.prototype.lineToLevel = function (t, e) {
    var n = this.nodeInfo[t];
    var i = this.nodeInfo[t + 1];
    if (n && i) {
      if (n.cfgList.length > 1 && i.cfgList.length > 1) {
        var middle = (n.pos[0].y + i.pos[0].y) / 2, center = this.stratPos.x;
        n.pos.forEach(function (point) { e.moveTo(point.x, point.y); e.lineTo(point.x, middle); e.lineTo(center, middle); });
        i.pos.forEach(function (point) { e.moveTo(center, middle); e.lineTo(point.x, middle); e.lineTo(point.x, point.y); });
      } else if (1 == n.cfgList.length && 1 == i.cfgList.length) {
        var a = n.pos[0];
        var o = i.pos[0];
        e.moveTo(a.x, a.y);
        e.lineTo(o.x, o.y);
      } else if (1 == n.cfgList.length && i.cfgList.length > 1) {
        a = n.pos[0];
        o = i.pos;
        for (var r = 0; r < o.length; r++) {
          if ((s = o[r]).x == a.x) {
            e.moveTo(a.x, a.y);
            e.lineTo(s.x, s.y);
          } else {
            e.moveTo(a.x, a.y);
            e.lineTo(s.x - this.range * Math.sign(s.x - a.x), a.y);
            e.arc(s.x - this.range * Math.sign(s.x - a.x), a.y + this.range, this.range, -90 * Math.PI / 180, (Math.sign(s.x - a.x) > 0 ? 0 : 180) * Math.PI / 180, Math.sign(s.x - a.x) > 0);
            e.lineTo(s.x, s.y);
          }
        }
      } else {
        a = n.pos;
        o = i.pos[0];
        for (r = 0; r < a.length; r++) {
          var s;
          if ((s = a[r]).x == o.x) {
            e.moveTo(s.x, s.y);
            e.lineTo(o.x, o.y);
          } else {
            e.moveTo(s.x, s.y);
            e.lineTo(s.x, o.y - this.range);
            e.arc(s.x + this.range * Math.sign(o.x - s.x), o.y - this.range, this.range, (Math.sign(o.x - s.x) > 0 ? 180 : 0) * Math.PI / 180, 90 * Math.PI / 180, Math.sign(o.x - s.x) < 0);
            e.lineTo(o.x, o.y);
          }
        }
      }
    }
  };
  _ctor.prototype.initItem = function () {
    this.graphics3.clear();
    for (var t = 0; t < this.nodeInfo.length; t++) {
      var e = this.nodeInfo[t];
      for (var n = 0; n < e.cfgList.length; n++) {
        e.tag[n] = this.canUnlock(e.cfgList[n]);
        var i = e.ndItem[n];
        switch (e.tag[n]) {
          case 1:
            i.getChildByName("ndArr").active = false;
            i.getChildByName("ndMask").active = false;
            i.getChildByName("ndLayout").active = false;
            var a = this.nodeInfo[e.cfgList[n].Level];
            if (a) {
              for (var o = 0; o < a.cfgList.length; o++) {
                var r = a.cfgList[o];
                this.lineToLevelPro(e.cfgList[n], r, this.graphics3);
              }
              this.max = Math.max(this.max, e.cfgList[n].Level);
            }
            break;
          case 2:
            var s = $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getUserData().getGoldNum();
            i.getChildByName("ndArr").active = s >= e.cfgList[n].GoldCost;
            i.getChildByName("ndMask").active = true;
            i.getChildByName("ndLayout").active = false;
            break;
          case 3:
            i.getChildByName("ndArr").active = true;
            i.getChildByName("ndMask").active = true;
            i.getChildByName("ndLayout").active = false;
            break;
          case 4:
            i.getChildByName("ndArr").active = false;
            i.getChildByName("ndMask").active = true;
            i.getChildByName("ndLayout").active = false;
        }
      }
    }
    this.graphics3.stroke();
  };
  _ctor.prototype.canUnlock = function (t) {
    var e = $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getUserData().getTalentLevel(t.ID);
    if (e && e.isLock) {
      return 1;
    }
    if (1 == t.Level) {
      return 2;
    }
    var n = this.nodeInfo[t.Level - 2];
    var i = false;
    for (var a = 0; a < n.cfgList.length; a++) {
      var o = n.cfgList[a];
      var r = $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getUserData().getTalentLevel(o.ID);
      if (r && r.isLock) {
        i = true;
        break;
      }
    }
    if (i) {
      var s = this.nodeInfo[t.Level - 1];
      // The three visible paths are optional purchases. One opens the next
      // tier; buying siblings later never forces an ad or blocks progression.
      if (require("HeroStyleTalents").optional(t, s.cfgList)) return 2;
      if (s.cfgList.length > 1) {
        for (a = 0; a < s.cfgList.length; a++) {
          o = s.cfgList[a];
          var l = $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getUserData().getTalentLevel(o.ID);
          if (l && l.isLock) {
            return 3;
          }
        }
      }
      return 2;
    }
    return 4;
  };
  _ctor.prototype.lineToLevelPro = function (t, e, n) {
    var i = this.nodeInfo[t.Level - 1];
    var a = this.nodeInfo[e.Level - 1];
    if (i && a) {
      if (i.cfgList.length > 1 && a.cfgList.length > 1) {
        var from = i.pos[i.cfgList.findIndex(function (row) { return row.ID === t.ID; })], to = a.pos[a.cfgList.findIndex(function (row) { return row.ID === e.ID; })], middle = (from.y + to.y) / 2;
        n.moveTo(from.x,from.y);n.lineTo(from.x,middle);n.lineTo(to.x,middle);n.lineTo(to.x,to.y);
      } else if (1 == i.cfgList.length && 1 == a.cfgList.length) {
        var o = i.pos[0];
        var r = a.pos[0];
        n.moveTo(o.x, o.y);
        n.lineTo(r.x, r.y);
      } else if (1 == i.cfgList.length && a.cfgList.length > 1) {
        o = i.pos[0];
        r = a.pos;
        for (var s = 0; s < r.length; s++) {
          if (a.cfgList[s].ID == e.ID) {
            if ((l = r[s]).x == o.x) {
              n.moveTo(o.x, o.y);
              n.lineTo(l.x, l.y);
            } else {
              n.moveTo(o.x, o.y);
              n.lineTo(l.x - this.range * Math.sign(l.x - o.x), o.y);
              n.arc(l.x - this.range * Math.sign(l.x - o.x), o.y + this.range, this.range, -90 * Math.PI / 180, (Math.sign(l.x - o.x) > 0 ? 0 : 180) * Math.PI / 180, Math.sign(l.x - o.x) > 0);
              n.lineTo(l.x, l.y);
            }
          }
        }
      } else {
        o = i.pos;
        r = a.pos[0];
        for (s = 0; s < o.length; s++) {
          var l;
          if (i.cfgList[s].ID == t.ID) {
            if ((l = o[s]).x == r.x) {
              n.moveTo(l.x, l.y);
              n.lineTo(r.x, r.y);
            } else {
              n.moveTo(l.x, l.y);
              n.lineTo(l.x, r.y - this.range);
              n.arc(l.x + this.range * Math.sign(r.x - l.x), r.y - this.range, this.range, (Math.sign(r.x - l.x) > 0 ? 180 : 0) * Math.PI / 180, 90 * Math.PI / 180, Math.sign(r.x - l.x) < 0);
              n.lineTo(r.x, r.y);
            }
          }
        }
      }
    }
  };
  _ctor.prototype.onClick = function (t) {
    $z1UIMgr.UIMgr.getInstance().openUI($z1KinghtFallConfig.KinghtFallUIID.UITalentInfo, $z1Config.UIID.UINONE, t, this.nodeInfo);
  };
  cc__decorate([ccp_property({
    type: cc.Node,
    tooltip: "节点信息"
  })], _ctor.prototype, "ndItem", undefined);
  cc__decorate([ccp_property({
    type: cc.ScrollView,
    tooltip: "节点信息"
  })], _ctor.prototype, "ndParent", undefined);
  cc__decorate([ccp_property({
    type: cc.Graphics,
    tooltip: "底部绘图"
  })], _ctor.prototype, "graphics1", undefined);
  cc__decorate([ccp_property({
    type: cc.Graphics,
    tooltip: "底部绘图"
  })], _ctor.prototype, "graphics2", undefined);
  cc__decorate([ccp_property({
    type: cc.Graphics,
    tooltip: "绘图进度"
  })], _ctor.prototype, "graphics3", undefined);
  return cc__decorate([ccp_ccclass], _ctor);
}($z1BaseCtrl.default);
exports.default = def_KinghtFallHomeTalentCtrl;
