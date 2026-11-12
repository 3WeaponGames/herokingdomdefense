var i;
var cc__extends = __extends;
var cc__decorate = __decorate;
Object.defineProperty(exports, "__esModule", {
  value: true
});
var $z1BaseCtrl = require("BaseCtrl");
var $z1BaseButton = require("BaseButton");
var $z1AudioMgr = require("AudioMgr");
var $z1UIMgr = require("UIMgr");
var $z1Utils = require("Utils");
var $z1Config = require("Config");
var $z1GameTrackDataEvent = require("GameTrackDataEvent");
var $z1PlayerMgr = require("PlayerMgr");
var $z1KinghtFallConfig = require("KinghtFallConfig");
var $z1KinghtFallTextConfig = require("KinghtFallTextConfig");
var $z1KinghtFallMissionData = require("KinghtFallMissionData");
var $z1KinghtFallEnum = require("KinghtFallEnum");
var $z1KinghtFallDataMgr = require("KinghtFallDataMgr");
var $z1KinghtFallPlayerMgr = require("KinghtFallPlayerMgr");
var $z1KinghtFallModle = require("KinghtFallModle");
var $z1KinghtFallPlayAniCtrl = require("KinghtFallPlayAniCtrl");
var HeroItemLooks = require("HeroItemLooks");
var cc__decorator = cc._decorator;
var ccp_ccclass = cc__decorator.ccclass;
var ccp_property = cc__decorator.property;
var def_KinghtFallHomePersonCtrl = function (t) {
  function _ctor() {
    var e = null !== t && t.apply(this, arguments) || this;
    e.ctrPlayAni = null;
    e.labPower = null;
    e.spPower = null;
    e.ndItemTop = [];
    e.labNum = [];
    e.scrView = null;
    e.ndItemDown = [];
    e.nodeInfo = [];
    e.levelLimit = 0;
    e.nextLevel = 0;
    e.subNum = 1;
    return e;
  }
  cc__extends(_ctor, t);
  _ctor.prototype.onEnable = function () {
    if (!this._homeTabReady) return;
    this.layoutScrollToFooter();
    this.refreshEquipmentLimits();
    this.initView();
    this.scheduleHomeGuide();
  };
  _ctor.prototype.onDisable = function () {
    require("HeroWeaponPicker").close(this);
    this.unschedule(this.showHomeGuide);
    this.unschedule(this.finishScrollFooterLayout);
    this._gearFooterLayoutPending = false;
  };
  _ctor.prototype.refreshEquipmentLimits = function () {
    var player = $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance();
    var data = $z1KinghtFallDataMgr.KinghtFallDataMgr.getInstance();
    var relic = player.getUserData().getTreasureLevel($z1KinghtFallEnum.KinghtFallEnumTreasureEnum.ForgeAmulet);
    this.subNum = 1;
    if (relic) {
      var level = data.getTreasureCfgById($z1KinghtFallEnum.KinghtFallEnumTreasureEnum.ForgeAmulet).levelInfo[relic.level - 1];
      if (level && level.param) this.subNum = 1 - level.param[0];
    }
    var stage = player.getUserData().getMaxStage();
    this.levelLimit = data.getLevelCfgById2(stage).EquipLevelCap;
    this.nextLevel = 5 * ((stage - 1) / 5 + 1);
    for (var index = 0; index < this.nodeInfo.length; index++) {
      this.nodeInfo[index].ndInfo.getChildByName("btnLock").getChildByName("labNum").getComponent(cc.Label).string = $z1Utils.Utils.StringFormat(this.T($z1KinghtFallTextConfig.KinghtFallTextConfig.HomePerson03), this.nextLevel);
    }
  };
  _ctor.prototype.start = function () {
    var e = this;
    this.cfgEquip = $z1KinghtFallDataMgr.KinghtFallDataMgr.getInstance().getEquipCfgList();
    this.refreshEquipmentLimits();
    this.spPower.node.active = false;
    var r = function (t) {
      var n = s.cfgEquip[t];
      s.nodeInfo[n.id - 1] = {
        type: n.id,
        cfg: n,
        ndItem: s.ndItemTop[t],
        labNum: s.labNum[t],
        ndInfo: s.ndItemDown[t]
      };
      s.ndItemTop[t].getChildByName("spAni").active = false;
      if (n.id === 3 || n.id === 4) {
        s.ndItemTop[t].on(cc.Node.EventType.TOUCH_END, function () { require("HeroWeaponPicker").open(e); }, s);
      }
      s.ndItemDown[t].getChildByName("btnUpgeade").on(cc.Node.EventType.TOUCH_END, function () {
        e.onUpgeade(n.id);
      }, s);
      s.ndItemDown[t].getChildByName("btnLock").on(cc.Node.EventType.TOUCH_END, function () {
        e.onUpgeade(n.id);
      }, s);
      s.ndItemDown[t].getChildByName("btnLock").getChildByName("labNum").getComponent(cc.Label).string = $z1Utils.Utils.StringFormat(s.T($z1KinghtFallTextConfig.KinghtFallTextConfig.HomePerson03), s.nextLevel);
    };
    var s = this;
    for (var l = 0; l < this.cfgEquip.length; l++) {
      r(l);
    }
    require("HeroWeaponPicker").installSwitch(this);
    this.bindScrollFooter();
    this.layoutScrollToFooter();
    this.initView();
    if (cc.resources) this._cancelItemLookReady = HeroItemLooks.whenReady(function () {
      e._cancelItemLookReady = null;
      if (cc.isValid(e, true) && cc.isValid(e.node, true) && e.node.activeInHierarchy) e.initView();
    });
    this.initEventListener();
    this._homeTabReady = true;
    this.scheduleHomeGuide();
  };
  _ctor.prototype.bindScrollFooter = function () {
    if (this._gearScrollBoundsBound) return;
    var parent = this.node;
    while (parent && !this._gearFooter) {
      this._gearFooter = parent.getChildByName("ndBottom");
      parent = parent.parent;
    }
    this.node.on(cc.Node.EventType.SIZE_CHANGED, this.layoutScrollToFooter, this);
    if (this._gearFooter) {
      this._gearFooter.on(cc.Node.EventType.SIZE_CHANGED, this.layoutScrollToFooter, this);
      this._gearFooter.on(cc.Node.EventType.POSITION_CHANGED, this.layoutScrollToFooter, this);
    }
    this._gearScrollBoundsBound = true;
  };
  _ctor.prototype.finishScrollFooterLayout = function () {
    this._gearFooterLayoutPending = false;
    this.layoutScrollToFooter(true);
  };
  _ctor.prototype.layoutScrollToFooter = function (finalPass) {
    var scroll = this.scrView && this.scrView.node, widget = scroll && scroll.getComponent(cc.Widget);
    if (!widget) return;
    // Native Creator can run start and size callbacks before ancestor Widgets
    // and their transforms are initialized. Recheck once after that frame's
    // alignment, coalescing all geometry notifications into the same callback.
    if (finalPass !== true && !this._gearFooterLayoutPending) {
      this._gearFooterLayoutPending = true;
      this.scheduleOnce(this.finishScrollFooterLayout, 0);
    }
    var footer = this._gearFooter, target = widget.target || scroll.parent;
    if (footer && target) {
      if (!(target.height > 0)) return;
      // Measure the navigation's actual upper edge; a safe-area offset or a
      // resized footer must not leave a strip or expose controls behind it.
      var top = target.convertToNodeSpaceAR(footer.convertToWorldSpaceAR(cc.v2(0, footer.height * (1 - footer.anchorY)))).y;
      widget.isAbsoluteBottom = true;
      widget.bottom = top + target.height * target.anchorY;
    }
    widget.updateAlignment();
    var viewport = scroll.children[0], viewWidget = viewport && viewport.getComponent(cc.Widget);
    if (viewWidget) viewWidget.updateAlignment();
  };
  _ctor.prototype.scheduleHomeGuide = function () {
    this.unschedule(this.showHomeGuide);
    this.scheduleOnce(this.showHomeGuide, .5);
  };
  _ctor.prototype.showHomeGuide = function () {
    if (this.node.activeInHierarchy) this.sendEvent($z1KinghtFallConfig.KinghtFallEventName.NewbieGuide, 4, this.nodeInfo[0].ndInfo.getChildByName("btnUpgeade"));
  };
  _ctor.prototype.onDestroy = function () {
    require("HeroWeaponPicker").close(this);
    if (this._cancelItemLookReady) this._cancelItemLookReady();
    this._cancelItemLookReady = null;
    this.unschedule(this.finishScrollFooterLayout);
    this._gearFooterLayoutPending = false;
    if (this._gearScrollBoundsBound) {
      this.node.off(cc.Node.EventType.SIZE_CHANGED, this.layoutScrollToFooter, this);
      if (this._gearFooter) {
        this._gearFooter.off(cc.Node.EventType.SIZE_CHANGED, this.layoutScrollToFooter, this);
        this._gearFooter.off(cc.Node.EventType.POSITION_CHANGED, this.layoutScrollToFooter, this);
      }
    }
    t.prototype.onDestroy.call(this);
  };
  _ctor.prototype.initEventListener = function () {
    this.addEvent($z1KinghtFallConfig.KinghtFallEventName.RefreshGold, this.initBtnView);
  };
  _ctor.prototype.initView = function () {
    var e = $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getUserData().getGoldNum();
    var n = $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getUserData().getMaxStage();
    var i = $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getUserData().getMaxOrder();
    var a = function (a) {
      var r = o.nodeInfo[a];
      var l = $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getUserData().getPersonLevel(r.type);
      var c = true;
      r.cfg.Unlock && (c = r.cfg.Unlock[0] < n || !(r.cfg.Unlock[0] > n) && r.cfg.Unlock[1] < i);
      var customImage = cc.resources && HeroItemLooks.gearImage(r.type, l, 'equipment'), upgradeImage = cc.resources && HeroItemLooks.gearImage(r.type, l, 'upgrade'), iconRequest = r._itemIconRequest = (r._itemIconRequest || 0) + 1;
      var setItemIcon = function (t, area, image) {
        if (!cc.isValid(o.node) || r._itemIconRequest !== iconRequest) return;
        var target = (area === 'equipment' ? r.ndItem : r.ndInfo.getChildByName('ndItem')).getChildByName('sprIcon'), sprite = target.getComponent(cc.Sprite);
        require("EquipmentIconFit").apply(sprite, t, image);
        sprite.setState(image && image.gray ? cc.Sprite.State.GRAY : cc.Sprite.State.NORMAL);
        target.opacity = image && image.opacity || 255;
        if (cc.color) {
          target.color = cc.color(image && image.tint || '#ffffff');
        }
      };
      [['equipment',customImage],['upgrade',upgradeImage]].forEach(function (entry) {
        if (entry[1]) cc.resources.load(entry[1].resource, cc.SpriteFrame, function (error, frame) { if (!error) setItemIcon(frame, entry[0], entry[1]); });
        else o.loadSpriteFrame($z1KinghtFallConfig.KinghtFallBundelName.IconCharacter, r.cfg.levelInfo[l - 1].Image, function (frame) { setItemIcon(frame, entry[0], null); });
      });
      o.loadSpriteFrame($z1KinghtFallConfig.KinghtFallBundelName.IconGood, r.cfg.levelInfo[l - 1].EquipBottom, function (t) {
        r.ndItem.getComponent(cc.Sprite).spriteFrame = t;
        r.ndInfo.getChildByName("ndItem").getComponent(cc.Sprite).spriteFrame = t;
        var tint = cc.color(require("EquipmentTiers").tint(r.cfg.levelInfo[l - 1]));
        r.ndItem.color = tint; r.ndInfo.getChildByName("ndItem").color = tint;
      });
      var equippedStyle = $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getUserData().getHeroWeapon(), slotView = require('HeroWeapons').gear(equippedStyle.id, r.type, 'equipment'), shownLevel = slotView && slotView.occupiedBy && (!customImage || customImage.linked) ? $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getUserData().getPersonLevel(slotView.occupiedBy) : l;
      r.ndItem.getChildByName("labPower").getComponent(cc.Label).string = $z1Utils.Utils.StringFormat(o.T($z1KinghtFallTextConfig.KinghtFallTextConfig.HomeTrea02), shownLevel);
      r.ndInfo.getChildByName("ndItem").getChildByName("labPower").getComponent(cc.Label).string = $z1Utils.Utils.StringFormat(o.T($z1KinghtFallTextConfig.KinghtFallTextConfig.HomeTrea02), l);
      var g = r.ndInfo.getChildByName("ndLay");
      // Captions have their own localized labels; values never flow into them.
      r.labNum.string = "" + r.cfg.levelInfo[l - 1].Parameters;
      g.getChildByName("labNum1").getComponent(cc.Label).string = "" + r.cfg.levelInfo[l - 1].Parameters;
      var hasNextLevel = l < r.cfg.levelInfo.length;
      g.getChildByName("ndArr").active = hasNextLevel;
      g.getChildByName("labNum2").active = hasNextLevel;
      // A campaign cap disables the action, but still shows the real next
      // configured value instead of the prefab's old placeholder.
      if (hasNextLevel) g.getChildByName("labNum2").getComponent(cc.Label).string = "" + r.cfg.levelInfo[l].Parameters;
      var customItem = cc.resources && HeroItemLooks.item(r.type, l);
      r.ndInfo.getChildByName("labName").getComponent(cc.Label).string = customItem ? customItem.name : o.T(r.cfg.levelInfo[l - 1].EquipName);
      if ((r.type === 1 || r.type === 5) && !customItem) r.ndInfo.getChildByName('labName').getComponent(cc.Label).string = require('HeroWeapons').gear(equippedStyle.id,r.type,'upgrade').name;
      if (r.type === 3 || r.type === 4) {
        var style = $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getUserData().getHeroWeapon();
        r.ndInfo.getChildByName("labName").getComponent(cc.Label).string = style.name + " · " + require("HeroWeapons").gear(style.id, r.type, 'upgrade').name;
      }
      r.ndInfo.getChildByName("labName").active = c;
      if (c) {
        g.active = true;
        r.ndInfo.getChildByName("ndLock").active = false;
        if (l >= o.levelLimit) {
          r.ndInfo.getChildByName("btnUpgeade").active = false;
          r.ndInfo.getChildByName("btnLock").active = l < r.cfg.levelInfo.length;
        } else {
          r.ndInfo.getChildByName("btnLock").active = false;
          if (l >= r.cfg.levelInfo.length) {
            g.getChildByName("ndArr").active = false;
            g.getChildByName("labNum2").active = false;
            r.ndInfo.getChildByName("btnUpgeade").active = false;
          } else {
            g.getChildByName("ndArr").active = true;
            g.getChildByName("labNum2").active = true;
            r.ndInfo.getChildByName("btnUpgeade").active = true;
            g.getChildByName("labNum2").getComponent(cc.Label).string = "" + r.cfg.levelInfo[l].Parameters;
            var u = Math.floor(r.cfg.levelInfo[l - 1].GoldCost * o.subNum);
            r.ndInfo.getChildByName("btnUpgeade").getChildByName("Layout").getChildByName("labNum").getComponent(cc.Label).string = $z1KinghtFallModle.default.getInstance().numberFomat(u);
            r.ndInfo.getChildByName("btnUpgeade").getComponent($z1BaseButton.BaseButton).interactable = e >= u;
          }
        }
      } else {
        g.active = false;
        r.ndInfo.getChildByName("ndLock").active = true;
        r.ndInfo.getChildByName("ndLock").getComponentInChildren(cc.Label).string = $z1Utils.Utils.StringFormat(o.T($z1KinghtFallTextConfig.KinghtFallTextConfig.HomePerson04), r.cfg.Unlock[0], r.cfg.Unlock[1]);
        r.ndInfo.getChildByName("btnUpgeade").active = false;
        r.ndInfo.getChildByName("btnLock").active = false;
      }
    };
    var o = this;
    for (var r = 0; r < this.nodeInfo.length; r++) {
      a(r);
    }
    this.refreshCombatPower();
    if (cc.resources) require("CharacterAppearance").reset(this);
    this.ctrPlayAni.initView();
    if (cc.resources) require("CharacterAppearance").bind(this, "hero");
  };
  _ctor.prototype.refreshCombatPower = function () {
    if (!this.labPower) return;
    var manager = $z1KinghtFallDataMgr.KinghtFallDataMgr.getInstance(), powerConfig = manager.data || { EquipCfg: this.nodeInfo.map(function (row) { return row.cfg; }), TalentLevelCfg: manager.getTalentLevelCfg ? manager.getTalentLevelCfg() : [] };
    var power = require("HeroLoadout").calculate(powerConfig, $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getUserData());
    this._combatPower = power;
    this.labPower.string = power.reason ? "—" : $z1KinghtFallModle.default.getInstance().numberFomat(Math.round(power.cp * 100) / 100);
  };
  _ctor.prototype.initBtnView = function () {
    var t = $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getUserData().getGoldNum();
    for (var e = 0; e < this.nodeInfo.length; e++) {
      var n = this.nodeInfo[e];
      var i = $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getUserData().getPersonLevel(n.type);
      if (i >= n.cfg.levelInfo.length) {
        ;
      } else {
        var a = Math.floor(n.cfg.levelInfo[i - 1].GoldCost * this.subNum);
        n.ndInfo.getChildByName("btnUpgeade").getComponent($z1BaseButton.BaseButton).interactable = t >= a;
      }
    }
    this.refreshCombatPower();
  };
  _ctor.prototype.onUpgeade = function (t) {
    var e = this;
    var n = $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance().getUserData().getPersonLevel(t);
    if (!this.cfgEquip[t - 1] || n >= this.cfgEquip[t - 1].levelInfo.length) return;
    if (n >= this.levelLimit) {
      $z1UIMgr.UIMgr.getInstance().openUI($z1Config.UIID.UITips, $z1Config.UIID.UIHome, $z1KinghtFallTextConfig.KinghtFallTextConfig.HomePerson02);
    } else {
      var i = Math.floor(this.cfgEquip[t - 1].levelInfo[n - 1].GoldCost * this.subNum);
      var player = $z1KinghtFallPlayerMgr.KinghtFallPlayerMgr.getInstance();
      if (player.purchase([{ id: $z1KinghtFallEnum.KinghtFallEnumGoodsCfg.Coin, num: i }], function () {
        player.getMissionData().addTaskNum($z1KinghtFallMissionData.KinghtFallTaskCountName.EquipUp, 1);
        player.getUserData().setPersonLevel(t, n + 1);
      }, function () { return player.getUserData().getPersonLevel(t) === n; })) {
        $z1PlayerMgr.PlayerMgr.getInstance().getTrackData().youmengTrack($z1GameTrackDataEvent.TrackId.equip_X, t);
        $z1AudioMgr.AudioMgr.getInstance().playEffectFree($z1KinghtFallConfig.KinghtFallAudioId.level_up);
        this.initView();
        this.sendEvent($z1KinghtFallConfig.KinghtFallEventName.UpdateRedPoint, 1);
        var a = this.nodeInfo[t - 1].ndItem.getChildByName("spAni").getComponent(sp.Skeleton);
        a.node.active = true;
        var o = a.setAnimation(0, "animation", false);
        a.setTrackCompleteListener(o, function () {
          a.node.active = false;
        });
        this.spPower.node.active = true;
        var r = this.spPower.setAnimation(0, "animation", false);
        this.spPower.setTrackCompleteListener(r, function () {
          e.spPower.node.active = false;
        });
      } else if (player.getUserData().getGoldNum() < i) {
        $z1UIMgr.UIMgr.getInstance().openUI($z1KinghtFallConfig.KinghtFallUIID.UIAddCurrency, $z1Config.UIID.UIHome, $z1KinghtFallEnum.KinghtFallEnumGoodsCfg.Coin);
      }
    }
  };
  cc__decorate([ccp_property({
    type: $z1KinghtFallPlayAniCtrl.default,
    tooltip: "玩家动画"
  })], _ctor.prototype, "ctrPlayAni", undefined);
  cc__decorate([ccp_property({
    type: cc.Label,
    tooltip: "战力"
  })], _ctor.prototype, "labPower", undefined);
  cc__decorate([ccp_property({
    type: sp.Skeleton,
    tooltip: "战力"
  })], _ctor.prototype, "spPower", undefined);
  cc__decorate([ccp_property({
    type: [cc.Node],
    tooltip: "战力"
  })], _ctor.prototype, "ndItemTop", undefined);
  cc__decorate([ccp_property({
    type: [cc.Label],
    tooltip: "数值"
  })], _ctor.prototype, "labNum", undefined);
  cc__decorate([ccp_property({
    type: cc.ScrollView,
    tooltip: "具体信息"
  })], _ctor.prototype, "scrView", undefined);
  cc__decorate([ccp_property({
    type: [cc.Node],
    tooltip: "等级"
  })], _ctor.prototype, "ndItemDown", undefined);
  return cc__decorate([ccp_ccclass], _ctor);
}($z1BaseCtrl.default);
exports.default = def_KinghtFallHomePersonCtrl;
