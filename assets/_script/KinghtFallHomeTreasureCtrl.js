var i;
var cc__extends = __extends;
var cc__decorate = __decorate;
Object.defineProperty(exports, "__esModule", {
  value: true
});
var $z1BaseCtrl = require("BaseCtrl");
var $z1Appcfg = require("Appcfg");
var $z1AudioMgr = require("AudioMgr");
var $z1LogMgr = require("LogMgr");
var $z1SdkMgr = require("SdkMgr");
var $z1UIMgr = require("UIMgr");
var $z1Utils = require("Utils");
var $z1Config = require("Config");
var $z1GameTrackDataEvent = require("GameTrackDataEvent");
var $z1PlayerMgr = require("PlayerMgr");
var $z1KinghtFallConfig = require("KinghtFallConfig");
var $z1KinghtFallTextConfig = require("KinghtFallTextConfig");
var $z1KinghtFallEnum = require("KinghtFallEnum");
var $z1KinghtFallDataMgr = require("KinghtFallDataMgr");
var $z1KinghtFallPlayerMgr = require("KinghtFallPlayerMgr");
var $z1KinghtFallModle = require("KinghtFallModle");
var cc__decorator = cc._decorator;
var ccp_ccclass = cc__decorator.ccclass;
var ccp_property = cc__decorator.property;
var def_KinghtFallHomeTreasureCtrl = function (t) {
  function _ctor() {
    var e = null !== t && t.apply(this, arguments) || this;
    e.labNum = null;
    e.ndParent = null;
    e.ndItem = null;
    e.labBox = null;
    e.labTime = null;
    e.btnOne = null;
    e.btnVideo = null;
    e.btnTen = null;
    e.cfgBox = null;
    e.ndInfo = [];
    return e;
  }
  cc__extends(_ctor, t);
  _ctor.prototype.onEnable = function () {
    if (!this._homeTabReady) return;
    this.initView();
    this.upView();
    this.scheduleHomeGuide();
  };
  _ctor.prototype.onDisable = function () {
    this.unschedule(this.showHomeGuide);
  };
  _ctor.prototype.start = function () {
    var t = this;
    this.prepareDrawFooter();
    this.ndItem.active = false;
    this.initEventListener();
    this.initData();
    this.initView();
    this.cfgBox = $z1KinghtFallDataMgr.KinghtFallDataMgr.getInstance().getBoxCfgById($z1KinghtFallEnum.KinghtFallEnumShopEnum.Treasure);
    this.labBox.string = this.T(this.cfgBox.Name);
    this.initBtnListener();
    var e = $z1KinghtFallDataMgr.KinghtFallDataMgr.getInstance().getGoodsCfgById(this.cfgBox.Cost[0]);
    this.loadSpriteFrame($z1KinghtFallConfig.KinghtFallBundelName.IconGood, e.icon, function (e) {
      t.btnOne.getChildByName("Layout").getChildByName("sprIcon").getComponent(cc.Sprite).spriteFrame = e;
    });
    this.btnOne.getChildByName("Layout").getChildByName("labNum").getComponent(cc.Label).string = $z1KinghtFallModle.default.getInstance().numberFomat(this.cfgBox.Cost[1]);
    var n = $z1KinghtFallDataMgr.KinghtFallDataMgr.getInstance().getGoodsCfgById(this.cfgBox.Cost10[0]);
    this.loadSpriteFrame($z1KinghtFallConfig.KinghtFallBundelName.IconGood, n.icon, function (e) {
      t.btnTen.getChildByName("Layout").getChildByName("sprIcon").getComponent(cc.Sprite).spriteFrame = e;
    });
    this.btnTen.getChildByName("Layout").getChildByName("labNum").getComponent(cc.Label).string = $z1KinghtFallModle.default.getInstance().numberFomat(this.cfgBox.Cost10[1]);
    this.upView();
    this._homeTabReady = true;
    this.scheduleHomeGuide();
  };
  _ctor.prototype.prepareDrawFooter = function () {
    if (this._drawFooter || !this.btnOne || !this.labTime) return;
    var footer = this.btnOne.parent, sprite = footer.getComponent(cc.Sprite), source = sprite && sprite.spriteFrame;
    this._drawFooter = footer;
    this._drawGuaranteeNode = this.labTime.node;
    // Reuse the undecorated right-hand section of the native orange panel.
    // The imported frame stays intact for other screens and cached UI pages.
    if (source) {
      var rect = source.getRect(), frame = source.clone();
      frame.name = (source.name || "RelicDraw") + "@clean-footer";
      frame.setRect(cc.rect(rect.x + rect.width * 330 / 750, rect.y, rect.width * 420 / 750, rect.height));
      frame.setOriginalSize(cc.size(rect.width * 420 / 750, rect.height));
      frame.setOffset(cc.v2(0, 0));
      frame.insetLeft = frame.insetRight = 0;
      frame.insetTop = frame.insetBottom = rect.height * 6 / 358;
      sprite.sizeMode = cc.Sprite.SizeMode.CUSTOM;
      sprite.type = cc.Sprite.Type.SLICED;
      sprite.spriteFrame = frame;
      this._drawFooterFrame = frame;
      this._drawFooterSource = source;
      this._drawFooterSprite = sprite;
    }
    footer.on(cc.Node.EventType.SIZE_CHANGED, this.layoutDrawFooter, this);
    this._drawGuaranteeNode.on(cc.Node.EventType.SIZE_CHANGED, this.fitDrawGuarantee, this);
    this.layoutDrawFooter();
  };
  _ctor.prototype.layoutDrawFooter = function () {
    var footer = this._drawFooter;
    if (!footer || footer.width <= 0) return;
    var width = Math.max(1, Math.floor((footer.width - 68) / 3)), scale = Math.min(1, footer.width / 750);
    [this.btnOne, this.btnVideo, this.btnTen].forEach(function (button, index) {
      button.setContentSize(width, 132);
      button.x = (index - 1) * (width + 16);
      button.y = -37;
      var padding = button.getComponent("PaddedTextBackground");
      if (padding) {
        padding.minWidth = padding.maxWidth = width;
        padding.minHeight = 132;
        padding.invalidate();
      }
      var caption = button.getChildByName("labDay"), row = button.getChildByName("Layout");
      caption.scaleX = caption.scaleY = .5 * scale;
      row.getChildByName("labNum").scaleX = row.getChildByName("labNum").scaleY = .5 * scale;
      row.getChildByName("sprIcon").scaleX = row.getChildByName("sprIcon").scaleY = (index === 1 ? .9 : .65) * scale;
    });
    this.fitDrawGuarantee();
  };
  _ctor.prototype.fitDrawGuarantee = function () {
    var node = this._drawGuaranteeNode, footer = this._drawFooter;
    if (!node || !footer || footer.width <= 0) return;
    var scale = Math.min(.5, Math.max(1, footer.width - 36) / Math.max(1, node.width));
    node.scaleX = node.scaleY = scale;
    node.setPosition(0, footer.height / 2 - 50);
  };
  _ctor.prototype.onDestroy = function () {
    var footer = this._drawFooter, label = this._drawGuaranteeNode;
    if (footer && (!cc.isValid || cc.isValid(footer))) footer.off(cc.Node.EventType.SIZE_CHANGED, this.layoutDrawFooter, this);
    if (label && (!cc.isValid || cc.isValid(label))) label.off(cc.Node.EventType.SIZE_CHANGED, this.fitDrawGuarantee, this);
    var frame = this._drawFooterFrame, sprite = this._drawFooterSprite;
    if (sprite && (!cc.isValid || cc.isValid(sprite)) && sprite.spriteFrame === frame) sprite.spriteFrame = this._drawFooterSource;
    if (frame && (!cc.isValid || cc.isValid(frame, true))) frame.destroy();
    this._drawFooter = this._drawGuaranteeNode = this._drawFooterFrame = this._drawFooterSource = this._drawFooterSprite = null;
    if (t.prototype.onDestroy) t.prototype.onDestroy.call(this);
  };
  _ctor.prototype.scheduleHomeGuide = function () {
    this.unschedule(this.showHomeGuide);
    this.scheduleOnce(this.showHomeGuide, .5);
  };
  _ctor.prototype.showHomeGuide = function () {
    if (!this.node.activeInHierarchy) return;
    var target = this;
    this.sendEvent($z1KinghtFallConfig.KinghtFallEventName.NewbieGuide, 5, this.btnOne, function () {
      $z1PlayerMgr.PlayerMgr.getInstance().getTrackData().youmengTrack($z1GameTrackDataEvent.TrackId.box_draw1);
      target.getReward(1, 1);
    });
  };
  _ctor.prototype.initEventListener = function () {
    this.addEvent($z1KinghtFallConfig.KinghtFallEventName.TreasureUpdate, this.initView);
    this.addEvent($z1KinghtFallConfig.KinghtFallEventName.TreasureUpdate2, this.upView);
    this.addEvent($z1Appcfg.BaseEventName.CloseUI, this.onCloseUI);
  };
  _ctor.prototype.initData = function () {
    var t = this;
    var e = $z1KinghtFallDataMgr.KinghtFallDataMgr.getInstance().getTreasureCfg();
    var n = function (n) {
      var a = e[n];
      var o = cc.instantiate(i.ndItem);
      o.parent = i.ndParent;
      o.active = true;
      o.on(cc.Node.EventType.TOUCH_END, function () {
        t.onClick(a);
      }, i);
      var r = $z1KinghtFallDataMgr.KinghtFallDataMgr.getInstance().getGoodsCfgById(a.goodID);
      i.loadSpriteFrame($z1KinghtFallConfig.KinghtFallBundelName.IconGood, r.sprBg, function (t) {
        o.getChildByName("sprBg").getComponent(cc.Sprite).spriteFrame = t;
      });
      i.loadSpriteFrame($z1KinghtFallConfig.KinghtFallBundelName.IconGood, r.icon, function (t) {
        o.getChildByName("sprIcon").getComponent(cc.Sprite).spriteFrame = t;
      });
      o.name = "treasure_" + a.ID;
      cc.tween(o.getChildByName("ndArr")).set({
        y: 40
      }).to(.2, {
        y: 45
      }).to(.4, {
        y: 35
      }).to(.2, {
        y: 40
      }).union().repeatForever().start();
      i.ndInfo.push({
        cfg: a,
        node: o,
        info: $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getUserData().getTreasureLevel(a.ID)
      });
    };
    var i = this;
    for (var a = 0; a < e.length; a++) {
      n(a);
    }
  };
  _ctor.prototype.initView = function () {
    var t = 0;
    for (var e = 0; e < this.ndInfo.length; e++) {
      (i = this.ndInfo[e]).info = $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getUserData().getTreasureLevel(i.cfg.ID);
      i.info && t++;
    }
    this.ndInfo.sort(function (t, e) {
      if (t.info && e.info) {
        if (t.cfg.Quality == e.cfg.Quality) {
          return t.cfg.ID - e.cfg.ID;
        } else {
          return t.cfg.Quality - e.cfg.Quality;
        }
      } else {
        if (t.info) {
          return -1;
        } else {
          if (e.info) {
            return 1;
          } else {
            if (t.cfg.Quality == e.cfg.Quality) {
              return t.cfg.ID - e.cfg.ID;
            } else {
              return t.cfg.Quality - e.cfg.Quality;
            }
          }
        }
      }
    });
    var n = $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getUserData().getGoldNum();
    for (e = 0; e < this.ndInfo.length; e++) {
      var i;
      (i = this.ndInfo[e]).node.zIndex = e;
      // Keep missing-relic copy centered; owned relics retain their level caption.
      i.node.getChildByName("labNum").y = i.info ? this.ndItem.getChildByName("labNum").y : 0;
      if (i.info) {
        i.node.getChildByName("labNum").getComponent(cc.Label).string = $z1Utils.Utils.StringFormat(this.T($z1KinghtFallTextConfig.KinghtFallTextConfig.HomeTrea02), i.info.level);
        i.node.getChildByName("ndMask").active = false;
        var a = false;
        i.info.level < i.cfg.levelInfo.length && i.cfg.levelInfo[i.info.level - 1].GoldCost <= n && i.cfg.levelInfo[i.info.level - 1].PieceCost <= i.info.frame && (a = true);
        i.node.getChildByName("ndArr").active = a;
        var o = i.node.getChildByName("ndPro");
        if (i.info.level >= i.cfg.levelInfo.length) {
          o.active = false;
        } else {
          o.active = true;
          o.getChildByName("sprPro").getComponent(cc.Sprite).fillRange = i.info.frame / i.cfg.levelInfo[i.info.level - 1].PieceCost;
          o.getChildByName("labPro").getComponent(cc.Label).string = i.info.frame + "/" + i.cfg.levelInfo[i.info.level - 1].PieceCost;
        }
      } else {
        i.node.getChildByName("labNum").getComponent(cc.Label).string = this.T($z1KinghtFallTextConfig.KinghtFallTextConfig.HomeTrea01);
        i.node.getChildByName("ndMask").active = true;
        i.node.getChildByName("ndArr").active = false;
        i.node.getChildByName("ndPro").active = false;
      }
    }
    this.labNum.string = t + "/" + this.ndInfo.length;
  };
  _ctor.prototype.onClick = function (t) {
    $z1UIMgr.UIMgr.getInstance().openUI($z1KinghtFallConfig.KinghtFallUIID.UITreasureInfo, $z1Config.UIID.UINONE, t);
  };
  _ctor.prototype.initBtnListener = function () {
    var t = this;
    this.btnOne.on(cc.Node.EventType.TOUCH_END, function () {
      var e = {
        id: t.cfgBox.Cost[0],
        num: t.cfgBox.Cost[1]
      };
      if ($z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().trySub([e], true)) {
        $z1PlayerMgr.PlayerMgr.getInstance().getTrackData().youmengTrack($z1GameTrackDataEvent.TrackId.box_draw1);
        t.getReward(1, 1, [e]);
      }
    }, this);
    this.btnTen.on(cc.Node.EventType.TOUCH_END, function () {
      var e = {
        id: t.cfgBox.Cost10[0],
        num: t.cfgBox.Cost10[1]
      };
      if ($z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().trySub([e], true)) {
        $z1PlayerMgr.PlayerMgr.getInstance().getTrackData().youmengTrack($z1GameTrackDataEvent.TrackId.box_draw10);
        t.getReward(10, 2, [e]);
      }
    }, this);
    this.btnVideo.on(cc.Node.EventType.TOUCH_END, function () {
      $z1SdkMgr.SdkMgr.getInstance().playVideo($z1SdkMgr.AdType.AdFreeTime, function () {
        $z1PlayerMgr.PlayerMgr.getInstance().getTrackData().youmengTrack($z1GameTrackDataEvent.TrackId.box_1);
        $z1PlayerMgr.PlayerMgr.getInstance().getTrackData().youmengTrack($z1GameTrackDataEvent.TrackId.pay_box_1_Y, $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getUserData().getMaxStage());
        t.getReward(1, 3, [], true);
      }, null, "home.treasure.draw");
    }, this);
  };
  _ctor.prototype.getReward = function (count, type, costs, video) {
    var result = $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().drawTreasures(this.cfgBox, count, costs || [], video);
    if (!result) return;
    if (result.pending) { this.upView(); return; }
    var a = result.rewards;
    $z1AudioMgr.AudioMgr.getInstance().playEffect($z1KinghtFallConfig.KinghtFallAudioId.box_treasure);
    $z1UIMgr.UIMgr.getInstance().openUI($z1KinghtFallConfig.KinghtFallUIID.UITreasureReward, $z1Config.UIID.UINONE, a, type);
    this.sendEvent($z1KinghtFallConfig.KinghtFallEventName.UpdateRedPoint, 8);
    this.initView();
    this.upView();
  };
  _ctor.prototype.upView = function () {
    var t = $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getUserData().getShopInfo($z1KinghtFallEnum.KinghtFallEnumShopEnum.Treasure);
    t || (t = {
      id: $z1KinghtFallEnum.KinghtFallEnumShopEnum.Treasure,
      time: 0,
      video: 0
    });
    this.labTime.string = $z1Utils.Utils.StringFormat(this.T($z1KinghtFallTextConfig.KinghtFallTextConfig.HomeTrea03), this.cfgBox.GuarantNumber - t.time);
    this.btnVideo.getChildByName("Layout").getChildByName("labNum").getComponent(cc.Label).string = t.video + "/" + this.cfgBox.VedioCount;
  };
  _ctor.prototype.onCloseUI = function (t) {
    t == $z1KinghtFallConfig.KinghtFallUIID.UITreasureReward && this.sendEvent($z1KinghtFallConfig.KinghtFallEventName.NewbieGuide, 5, this.ndInfo[0].node);
  };
  cc__decorate([ccp_property({
    type: cc.Label,
    tooltip: "盒子"
  })], _ctor.prototype, "labNum", undefined);
  cc__decorate([ccp_property({
    type: cc.Node,
    tooltip: "节点信息"
  })], _ctor.prototype, "ndParent", undefined);
  cc__decorate([ccp_property({
    type: cc.Node,
    tooltip: "节点信息"
  })], _ctor.prototype, "ndItem", undefined);
  cc__decorate([ccp_property({
    type: cc.Label,
    tooltip: "盒子"
  })], _ctor.prototype, "labBox", undefined);
  cc__decorate([ccp_property({
    type: cc.RichText,
    tooltip: "保底次数"
  })], _ctor.prototype, "labTime", undefined);
  cc__decorate([ccp_property({
    type: cc.Node,
    tooltip: "抽一次"
  })], _ctor.prototype, "btnOne", undefined);
  cc__decorate([ccp_property({
    type: cc.Node,
    tooltip: "抽一次"
  })], _ctor.prototype, "btnVideo", undefined);
  cc__decorate([ccp_property({
    type: cc.Node,
    tooltip: "抽一次"
  })], _ctor.prototype, "btnTen", undefined);
  return cc__decorate([ccp_ccclass], _ctor);
}($z1BaseCtrl.default);
exports.default = def_KinghtFallHomeTreasureCtrl;
