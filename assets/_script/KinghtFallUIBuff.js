var i;
var cc__extends = __extends;
var cc__decorate = __decorate;
var cc__spreadArrays = __spreadArrays;
Object.defineProperty(exports, "__esModule", {
  value: true
});
var $z1BasePlatform = require("BasePlatform");
var $z1BaseUI = require("BaseUI");
var $z1Appcfg = require("Appcfg");
var $z1PlatformSetting = require("PlatformSetting");
var $z1SdkMgr = require("SdkMgr");
var $z1Utils = require("Utils");
var $z1Config = require("Config");
var $z1GameTrackDataEvent = require("GameTrackDataEvent");
var $z1PlayerMgr = require("PlayerMgr");
var $z1UIGuide = require("UIGuide");
var $z1KinghtFallConfig = require("KinghtFallConfig");
var $z1KinghtFallTextConfig = require("KinghtFallTextConfig");
var $z1KinghtFallDataMgr = require("KinghtFallDataMgr");
var $z1KinghtFallPlayerMgr = require("KinghtFallPlayerMgr");
var $z1KinghtFallUIGame = require("KinghtFallUIGame");
var cc__decorator = cc._decorator;
var ccp_ccclass = cc__decorator.ccclass;
var ccp_property = cc__decorator.property;
var def_KinghtFallUIBuff = function (t) {
  function _ctor() {
    var e = null !== t && t.apply(this, arguments) || this;
    e.ndItem = null;
    e.ndParent = null;
    e.sprfIconList = [];
    e.sprfBgList = [];
    e.ndTitle = null;
    e.btnRefresh = null;
    e.btnGetAll = null;
    e.callBack = null;
    e.ndItemList = [];
    e.canOutBuff = [];
    e.minQua = 3;
    e.selInfo = [];
    e.isAni = false;
    return e;
  }
  cc__extends(_ctor, t);
  _ctor.prototype._nativeFrame = function (frame) {
    if (!frame || !cc.sys.isNative) return frame;
    var original = frame._original;
    var texture = original ? original._texture : frame.getTexture();
    // JSB can retain blank regions in its dynamic UI atlas after battle/UI
    // transitions. Keep this small modal on the original artwork textures.
    texture.packable = false;
    if (!original) return frame;
    if (!this._nativeSpriteFrames) this._nativeSpriteFrames = new Map();
    if (this._nativeSpriteFrames.has(frame)) return this._nativeSpriteFrames.get(frame);
    var rect = frame.getRect();
    rect.x = original._x; rect.y = original._y;
    // Do not reset a shared source frame: other live UIs may still use its
    // packed UVs/material. Each modal owns only these small frame wrappers.
    var copy = new cc.SpriteFrame(texture, rect, frame.isRotated(), frame.getOffset(), frame.getOriginalSize());
    ["insetLeft", "insetRight", "insetTop", "insetBottom"].forEach(function (key) { copy[key] = frame[key]; });
    this._nativeSpriteFrames.set(frame, copy);
    return copy;
  };
  _ctor.prototype.onLoad = function () {
    t.prototype.onLoad.call(this);
    if (!cc.sys.isNative) return;
    var self = this;
    this.node.getComponentsInChildren(cc.Sprite).forEach(function (sprite) {
      sprite.spriteFrame = self._nativeFrame(sprite.spriteFrame);
    });
  };
  _ctor.prototype.onDestroy = function () {
    if (this._nativeSpriteFrames) {
      this._nativeSpriteFrames.forEach(function (frame) { frame.destroy(); });
      this._nativeSpriteFrames.clear();
    }
    t.prototype.onDestroy.call(this);
  };
  _ctor.prototype.init = function (t) {
    this.callBack = t;
  };
  _ctor.prototype.canChoosePerk = function () {
    return !this.isAni && !this.isclose && !this._decisionPending && !this._decisionCompleted && cc.isValid(this);
  };
  _ctor.prototype.requestPerkAd = function (placement, success) {
    if (!this.canChoosePerk()) return;
    var self = this, generation = this._resourceGeneration, settled = false;
    this._decisionPending = true;
    function finish(accepted) {
      if (settled) return;
      settled = true;
      if (self.isclose || self._decisionCompleted || generation !== self._resourceGeneration || !cc.isValid(self)) return;
      self._decisionPending = false;
      if (accepted) success();
    }
    try {
      $z1SdkMgr.SdkMgr.getInstance().playVideo($z1SdkMgr.AdType.AdFreeTime, function () { finish(true); }, function () { finish(false); }, placement);
    } catch (error) { finish(false); throw error; }
  };
  _ctor.prototype.start = function () {
    var t = this;
    this.initData();
    if (this._customPerkPool && this.canOutBuff.length === 0) {
      var emptyGeneration = this._resourceGeneration;
      this._decisionPending = true;
      this.scheduleOnce(function () { t.finishDecision(t.callBack, [], emptyGeneration); }, 0);
      return;
    }
    this.initBtnView();
    this.onRefreshBuff();
    this.ndItem.active = false;
    var e = function (e) {
      var i = cc.instantiate(n.ndItem);
      i.parent = n.ndParent;
      i.active = true;
      i.setPosition(0, 0);
      n.ndItemList[e] = i;
      n.showItem(e);
      i.on(cc.Node.EventType.TOUCH_END, function () {
        t.clickItem(e);
      }, n);
    };
    var n = this;
    for (var i = 0; i < 3; i++) {
      e(i);
    }
    this.btnRefresh.on(cc.Node.EventType.TOUCH_END, function () {
      t.requestPerkAd("battle.buff.refresh", function () {
        $z1PlayerMgr.PlayerMgr.getInstance().getTrackData().youmengTrack($z1GameTrackDataEvent.TrackId.buff_1);
        $z1PlayerMgr.PlayerMgr.getInstance().getTrackData().youmengTrack($z1GameTrackDataEvent.TrackId.pay_buff_1_Y, $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getUserData().getMaxStage());
        t.onRefreshBuff(true);
        t.initBtnView();
        for (var e = 0; e < 3; e++) {
          t.showItem(e);
        }
        t.showAni();
      });
    }, this);
    this.btnGetAll.active = true;
    this.btnGetAll.on(cc.Node.EventType.TOUCH_END, function () {
      t.requestPerkAd("battle.buff.takeAll", function () {
        $z1PlayerMgr.PlayerMgr.getInstance().getTrackData().youmengTrack($z1GameTrackDataEvent.TrackId.buff_3);
        $z1PlayerMgr.PlayerMgr.getInstance().getTrackData().youmengTrack($z1GameTrackDataEvent.TrackId.pay_buff_3_Y, $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getUserData().getMaxStage());
        t.isAni = true;
        t._decisionPending = true;
        var selected = t.selInfo.slice(), generation = t._resourceGeneration;
        for (var e = 0; e < t.ndItemList.length; e++) {
          var n = t.ndItemList[e];
          if (0 == e) {
            cc.tween(n).to(.1, {
              scale: 1.2
            }).delay(.1).call(function () {
              t.finishDecision(t.callBack, selected, generation);
            }).start();
          } else {
            cc.tween(n).to(.1, {
              scale: 1.2
            }).delay(.1).start();
          }
        }
      });
    }, this);
    this.showAni();
    this.startGuide();
  };
  _ctor.prototype.initData = function () {
    var t = $z1KinghtFallDataMgr.KinghtFallDataMgr.getInstance().getBuffCfgList();
    var custom = $z1KinghtFallDataMgr.KinghtFallDataMgr.getInstance().data.GameTools;
    this._customPerkPool = !!(custom && custom.perks && Object.keys(custom.perks).length);
    var e = function (t) {
      var e = $z1KinghtFallUIGame.default.instance.ctrGame.gameData.buffList;
      for (var n = 0; n < e.length; n++) {
        if (e[n].id == t) {
          return true;
        }
      }
      return false;
    };
    var n = function (t) {
      var e = $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getUserData().getTalent();
      for (var n = 0; n < e.length; n++) {
        var i = e[n];
        var talent = i && i.isLock && $z1KinghtFallDataMgr.KinghtFallDataMgr.getInstance().getTalentLevelCfgById(i.id);
        if (talent && talent.kindID == t) {
          return true;
        }
      }
      return false;
    };
    for (var i = 0; i < t.length; i++) {
      var a = t[i];
      if (!e(a.ID) && require("GameToolsOverrides").perkEnabled(a.ID) && (!this._customPerkPool || a.Weight > 0)) {
        if (a.Unlock) {
          n(a.Unlock) && this.canOutBuff.push({
            id: a.ID,
            qua: a.Quality,
            weight: a.Weight
          });
        } else {
          this.canOutBuff.push({
            id: a.ID,
            qua: a.Quality,
            weight: a.Weight
          });
        }
      }
    }
  };
  _ctor.prototype.showAni = function () {
    var t = this;
    this.isAni = true;
    cc.tween(this.ndTitle).set({
      scale: 0
    }).to(.06, {
      scale: 1
    }).start();
    for (var e = 0; e < 3; e++) {
      var n = this.ndItemList[e];
      cc.tween(n).set({
        scale: 0
      }).to(.06 + .18 * e, {
        scale: 1
      }).to(.06, {
        scale: 1.2
      }).to(.06, {
        scale: 1
      }).start();
    }
    cc.tween(this.btnRefresh.parent).set({
      scale: 0
    }).delay(.53).to(.06, {
      scale: 1
    }).to(.06, {
      scale: 1.2
    }).to(.06, {
      scale: 1
    }).call(function () {
      t.isAni = false;
    }).start();
  };
  _ctor.prototype.initEvent = function () {
    this.addEvent($z1KinghtFallConfig.KinghtFallEventName.NewbieGuide, this.startGuide);
  };
  _ctor.prototype.initBtnView = function () {
    var t = this.btnRefresh.getChildByName("layout1").getChildByName("labQue").getComponent(cc.Label);
    if (this._customPerkPool) {
      var minimum = this.minQua;
      t.node.active = this.canOutBuff.some(function (item) { return item.qua >= minimum && item.weight > 0; });
    }
    switch (this.minQua) {
      case 2:
        t.node.color = new cc.Color().fromHEX("#1FDDFF");
        t.string = require("LanguageMgr").LanguageMgr.getInstance().t("format.perk.minimumQuality", [this.T($z1KinghtFallTextConfig.KinghtFallTextConfig.GameBuff02)]);
        break;
      case 3:
        t.node.color = new cc.Color().fromHEX("#e95cff");
        t.string = require("LanguageMgr").LanguageMgr.getInstance().t("format.perk.minimumQuality", [this.T($z1KinghtFallTextConfig.KinghtFallTextConfig.GameBuff03)]);
    }
    this._layoutRerollGuarantee();
  };
  _ctor.prototype.lateUpdate = function () {
    this._layoutRerollGuarantee();
  };
  _ctor.prototype._layoutRerollGuarantee = function () {
    if (!this.btnRefresh) return;
    var node = this.btnRefresh.getChildByName("layout1"), layout = node.getComponent(cc.Layout);
    var rarity = node.getChildByName("labQue"), caption = node.children[0], suffix = node.children[2];
    var available = !this._customPerkPool || this.canOutBuff.some(function (item) { return item.qua >= this.minQua && item.weight > 0; }, this);
    node.active = available;
    if (!available) return;
    var english = require("LanguageMgr").LanguageMgr.getInstance().getCurrentLanguage() === "en";
    suffix.active = !english;
    var narrow = cc.view.getFrameSize().width < 360;
    var signature = [english, narrow, this.btnRefresh.width, caption.width, caption.height, rarity.width, rarity.height,
      caption.getComponent(cc.Label).string, rarity.getComponent(cc.Label).string].join(":");
    if (signature === this._guaranteeLayoutSignature) return;
    if (english) {
      [caption, rarity].forEach(function (child) {
        var label = child.getComponent(cc.Label);
        label.fontSize = narrow ? 56 : 52;
        label.lineHeight = narrow ? 56 : 58;
        label.overflow = cc.Label.Overflow.NONE;
        label.enableWrapText = false;
        label._forceUpdateRenderData();
      });
      var width = (caption.width + rarity.width + 10) * Math.abs(node.scaleX);
      // The centered caption may extend a little beyond the button's edges;
      // longer rarity names or narrow viewports use two complete lines.
      var stacked = narrow || width > this.btnRefresh.width + 48;
      layout.type = stacked ? cc.Layout.Type.VERTICAL : cc.Layout.Type.HORIZONTAL;
      [caption, rarity].forEach(function (child) { if (stacked) child.x = 0; else child.y = 0; });
      if (stacked) node.width = Math.max(caption.width, rarity.width);
      else node.height = Math.max(caption.height, rarity.height);
      layout.spacingX = 10;
      layout.spacingY = 0;
    } else {
      layout.type = cc.Layout.Type.HORIZONTAL;
      node.children.forEach(function (child) { child.y = 0; });
      node.height = Math.max(caption.height, rarity.height, suffix.height);
      layout.spacingX = 0;
      layout.spacingY = 0;
    }
    layout.updateLayout();
    node.x = 0;
    node.y = this.btnRefresh.height / 2 + 10 + node.height * Math.abs(node.scaleY) / 2;
    this._guaranteeLayoutSignature = signature;
  };
  _ctor.prototype.onRefreshBuff = function (t) {
    var e = this;
    undefined === t && (t = false);
    var n = cc__spreadArrays(this.canOutBuff);
    this.selInfo = [];
    var i = function (t) {
      e.selInfo.push(t);
      for (var i = 0; i < n.length; i++) {
        if (n[i].id == t) {
          n.splice(i, 1);
          break;
        }
      }
    };
    if (t) {
      var a = [];
      for (var o = 0; o < this.canOutBuff.length; o++) {
        var s = this.canOutBuff[o];
        s.qua >= this.minQua && a.push(s);
      }
      var guaranteed = $z1Utils.Utils.weight_rand(a);
      if (guaranteed) i(guaranteed.id);
    }
    for (; this.selInfo.length < 3 && n.length > 0;) {
      var selected = $z1Utils.Utils.weight_rand(n);
      if (!selected) break;
      i(selected.id);
    }
    this.selInfo.sort(function () {
      return Math.random() - .5;
    });
  };
  _ctor.prototype.showItem = function (t) {
    var e = this.ndItemList[t];
    if (this.selInfo[t]) {
      var n = $z1KinghtFallDataMgr.KinghtFallDataMgr.getInstance().getBuffCfgById(this.selInfo[t]);
      var i = e.getChildByName("spAniBg").getComponent(sp.Skeleton);
      var a = e.getChildByName("spAniIcon");
      var o = e.getChildByName("sprIcon").getComponent(cc.Sprite);
      var s = e.getChildByName("labInfo").getComponent(cc.RichText);
      e.getChildByName("sprBg").getComponent(cc.Sprite).spriteFrame = this._nativeFrame(this.sprfBgList[n.Quality - 1]);
      e.getChildByName("sprIocnBg").getComponent(cc.Sprite).spriteFrame = this._nativeFrame(this.sprfIconList[n.Quality - 1]);
      switch (n.Quality) {
        case 1:
        case 2:
          i.node.active = false;
          a.active = false;
          break;
        case 3:
          i.node.active = true;
          i.setSkin("zise");
          a.active = true;
          break;
        case 4:
          i.node.active = true;
          i.setSkin("jinse");
          a.active = true;
      }
      this.loadSpriteFrame($z1KinghtFallConfig.KinghtFallBundelName.IconBuff, n.Image, function (t) {
        o.spriteFrame = this._nativeFrame(t);
      }.bind(this));
      var l = [];
      for (var c = 0; c < n.Pamer.length; c++) {
        if (n.isPerecentage && n.isPerecentage[c]) {
          l.push(Math.ceil(1e4 * n.Pamer[c] / 100) + "%");
        } else {
          l.push("" + n.Pamer[c]);
        }
      }
      s.string = require("LanguageMgr").LanguageMgr.getInstance().format("<b><outline color=#000000 width=4>{0}</outline></b>", [$z1Utils.Utils.StringFormat.apply($z1Utils.Utils, cc__spreadArrays([n.Describe], l))]);
    } else {
      e.active = false;
    }
  };
  _ctor.prototype.clickItem = function (t) {
    var e = this;
    if (this.canChoosePerk() && this.selInfo[t] !== undefined) {
      this.isAni = true;
      this._decisionPending = true;
      var selected = this.selInfo[t], generation = this._resourceGeneration;
      for (var n = 0; n < this.ndItemList.length; n++) {
        var i = this.ndItemList[n];
        if (t == n) {
          cc.tween(i).to(.1, {
            scale: 1.2
          }).delay(.1).call(function () {
            e.finishDecision(e.callBack, [selected], generation);
          }).start();
        } else {
          cc.tween(i).to(.1, {
            scaleX: 0
          }).start();
        }
      }
    }
  };
  _ctor.prototype.startGuide = function () {
    if ($z1PlatformSetting.PlatformSetting.currentPlatform != $z1BasePlatform.Platform.WEB_LINK) {
      var t = $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getGuideData().getGroupId();
      var e = $z1KinghtFallDataMgr.KinghtFallDataMgr.getInstance().getGuideCfgById(t);
      if (!(e.length <= 0)) {
        var n;
        var i = $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getGuideData().getStepId();
        var a = e[i];
        switch (t) {
          case 3:
            (n = new $z1UIGuide.GuildCfg()).isWeek = !!a.Close;
            n.showHand = a.Finger;
            n.hideMask = !a.Mask;
            n.tipstring = a.Describe;
            n.showAni = !!a.ShowKing;
            switch (i) {
              case 0:
                n.distNode = this.ndParent;
                n.deviationTipsAll = cc.v2(0, a.Offset || 0);
                n.lightType = 1;
                $z1PlayerMgr.PlayerMgr.getInstance().getTrackData().youmengTrack($z1GameTrackDataEvent.TrackId.guide9);
            }
        }
        if (n) {
          this.openUICallBack($z1Config.UIID.UIGuide, function () {
            if (e[i + 1]) {
              $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getGuideData().setStepId(i + 1);
            } else {
              $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getGuideData().setGroupId(t + 1);
              $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getGuideData().setStepId(0);
            }
          }, n);
        } else {
          this.sendEvent($z1Appcfg.BaseEventName.blocktouch, true);
        }
      }
    }
  };
  cc__decorate([ccp_property(cc.Node)], _ctor.prototype, "ndItem", undefined);
  cc__decorate([ccp_property(cc.Node)], _ctor.prototype, "ndParent", undefined);
  cc__decorate([ccp_property([cc.SpriteFrame])], _ctor.prototype, "sprfIconList", undefined);
  cc__decorate([ccp_property([cc.SpriteFrame])], _ctor.prototype, "sprfBgList", undefined);
  cc__decorate([ccp_property(cc.Node)], _ctor.prototype, "ndTitle", undefined);
  cc__decorate([ccp_property(cc.Node)], _ctor.prototype, "btnRefresh", undefined);
  cc__decorate([ccp_property(cc.Node)], _ctor.prototype, "btnGetAll", undefined);
  return cc__decorate([ccp_ccclass], _ctor);
}($z1BaseUI.default);
exports.default = def_KinghtFallUIBuff;
