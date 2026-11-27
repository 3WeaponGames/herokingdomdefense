var i;
var cc__extends = __extends;
var cc__decorate = __decorate;
Object.defineProperty(exports, "__esModule", {
  value: true
});
var $z1BaseUI = require("BaseUI");
var $z1AudioMgr = require("AudioMgr");
var $z1GAD_Configs = require("GAD_Configs");
var $z1GAD_App = require("GAD_App");
var $z1GAD_PlayerMgr = require("GAD_PlayerMgr");
var $z1KinghtFallConfig = require("KinghtFallConfig");
var $z1KinghtFallItemGood = require("KinghtFallItemGood");
var $z1KinghtFallDataMgr = require("KinghtFallDataMgr");
var $z1UIMgr = require("UIMgr");
var cc__decorator = cc._decorator;
var ccp_ccclass = cc__decorator.ccclass;
var ccp_property = cc__decorator.property;
var def_GAD_UIResult = function (t) {
  function _ctor() {
    var e = null !== t && t.apply(this, arguments) || this;
    e.isWin = false;
    e.lblStats = null;
    e.lblSaved = null;
    e.ndRewards = null;
    return e;
  }
  cc__extends(_ctor, t);
  _ctor.prototype.lateUpdate = function () {
    require("BattleResultTitle").sync(this, this.resultSp, this.btnExit, true, this._endlessResult ? "lobby.endless" : undefined);
  };
  _ctor.prototype.init = function (t, endlessResult) {
    this.isWin = t;
    this._endlessResult = endlessResult || null;
    this._rewardSignature = null;
  };
  _ctor.prototype.start = function () {
    var t = this;
    this.resultSp.setAnimation(0, "victory_appear", false);
    this.resultSp.setCompleteListener(function () {
      if (!t.isclose && cc.isValid(t.resultSp, true)) t.resultSp.setAnimation(0, "victory_idle", false);
    });
    var audio = $z1AudioMgr.AudioMgr.getInstance(), sound;
    if (this._endlessResult) {
      audio.stopMusic($z1KinghtFallConfig.KinghtFallParameter.BGMusic);
      var sounds = $z1KinghtFallConfig.KinghtFallAudioId;
      sound = this.isWin ? sounds.game_success : sounds.game_fail;
      var caption = this.btnExit.getChildByName("effectLabel");
      if (caption) require("LanguageMgr").LanguageMgr.getInstance().bindLabel(caption.getComponent(cc.Label), "pause.returnHome");
    } else {
      audio.stopMusic($z1GAD_Configs.GADConfig.BgMusic);
      sound = this.isWin ? $z1GAD_Configs.GAD_AudioId.victory : $z1GAD_Configs.GAD_AudioId.fail;
    }
    audio.playEffectFree(sound, undefined, undefined, { owner: this, game: this });
    this.addEvent("SaveRecovered", this.refreshResult);
    this.refreshResult();
    this.loadPrefab($z1KinghtFallConfig.KinghtFallBundelName.IconGood, $z1KinghtFallConfig.KinghtFallPrefabName.ItemGood, function (prefab) {
      t._rewardPrefab = prefab;
      t.refreshResult();
    });
    this.btnExit.on(cc.Node.EventType.TOUCH_END, function () {
      if (t._endlessResult) t._endlessResult.exit();
      else $z1GAD_App.default.instance.exit_App(0);
    });
  };
  _ctor.prototype.refreshResult = function () {
    if (this.isclose || !this.lblStats || !this.ndRewards) return;
    var result = this._endlessResult ? this._endlessResult.getResult() : $z1GAD_PlayerMgr.default.getInstance().getResult();
    if (!result) return;
    var seconds = Math.floor(result.activeMilliseconds / 1000);
    var time = Math.floor(seconds / 60) + ":" + (seconds % 60 < 10 ? "0" : "") + seconds % 60;
    require("LanguageMgr").LanguageMgr.getInstance().bindLabel(this.lblStats, "wallDefense.result.stats", [time, result.clearedWaves]);
    this.lblSaved.string = this.T(result.saved ? "wallDefense.result.saved" : "wallDefense.result.saving");
    if (!this._rewardPrefab) return;
    var rows = [];
    result.awarded.forEach(function (reward) {
      var existing = rows.filter(function (row) { return row.id === reward.id; })[0];
      if (existing) existing.num += reward.num; else rows.push({ id: reward.id, num: reward.num });
    });
    var signature = JSON.stringify([rows, result.unlockedGoods]);
    if (this._rewardSignature === signature) return;
    this._rewardSignature = signature;
    this.ndRewards.destroyAllChildren();
    var columns = 6, spacing = 100;
    var firstRow = this._endlessResult ? -spacing / 2 : 0;
    if (this._endlessResult) this.layoutEndlessRewards(Math.ceil(rows.length / columns), spacing);
    for (var i = 0; i < rows.length; i++) {
      var node = cc.instantiate(this._rewardPrefab);
      node.parent = this.ndRewards;
      var rowLength = Math.min(columns, rows.length - Math.floor(i / columns) * columns);
      node.setPosition((i % columns - (rowLength - 1) / 2) * spacing, firstRow - Math.floor(i / columns) * spacing);
      node.getComponent($z1KinghtFallItemGood.default).initView(rows[i], 95);
      var relic = $z1KinghtFallDataMgr.KinghtFallDataMgr.getInstance().getTreasureCfg().filter(function (item) { return item.goodID === rows[i].id; })[0];
      if (relic) node.on(cc.Node.EventType.TOUCH_END, this.openRelicDetails.bind(this, relic));
      if (result.unlockedGoods.indexOf(rows[i].id) >= 0) {
        var badge = new cc.Node("NewItem");
        badge.parent = node;
        badge.setPosition(0, 32);
        badge.setContentSize(90, 30);
        var label = badge.addComponent(cc.Label);
        label._localizedFontRole = "body";
        label.fontSize = 26;
        label.lineHeight = 30;
        label.horizontalAlign = cc.Label.HorizontalAlign.CENTER;
        label.string = this.T("wallDefense.reward.new");
        var outline = badge.addComponent(cc.LabelOutline);
        outline.width = 2;
        outline.color = cc.Color.BLACK;
      }
    }
  };
  _ctor.prototype.layoutEndlessRewards = function (rows, spacing) {
    var content = this.ndRewards, scroll = this._rewardScroll;
    // Leave the save status and Return Home button outside the reward list.
    // A small glimpse of the fifth row makes longer lists discoverable.
    var height = 4 * spacing + 12;
    if (!scroll) {
      var position = content.getPosition();
      var viewport = new cc.Node("RewardViewport");
      viewport.parent = content.parent;
      viewport.setSiblingIndex(content.getSiblingIndex());
      viewport.setContentSize(content.width, height);
      viewport.setPosition(position.x, position.y + (spacing - height) / 2);
      viewport.addComponent(cc.Mask).type = cc.Mask.Type.RECT;
      content.parent = viewport;
      content.anchorY = 1;
      content.setPosition(0, height / 2);
      scroll = this._rewardScroll = viewport.addComponent(cc.ScrollView);
      scroll.horizontal = false;
      scroll.elastic = false;
      scroll.cancelInnerEvents = true;
      scroll.content = content;
    }
    var offset = scroll.getScrollOffset().y;
    scroll.stopAutoScroll();
    content.height = Math.max(height, rows * spacing);
    scroll.vertical = content.height > height;
    scroll.scrollToOffset(cc.v2(0, Math.max(0, Math.min(offset, content.height - height))), 0);
  };
  _ctor.prototype.openRelicDetails = function (relic, event) {
    if (event) event.stopPropagation();
    var current = this._relicDetailNode && cc.isValid(this._relicDetailNode, true) && this._relicDetailNode.getComponent($z1BaseUI.default);
    if (this.isclose || this._relicDetailOpening || current && !current.isclose) return;
    var result = this;
    this._relicDetailOpening = true;
    $z1UIMgr.UIMgr.getInstance().openUIWithOwner($z1KinghtFallConfig.KinghtFallUIID.UITreasureInfo, this.uid, {
      parent: this,
      isCurrent: this.resourceOptions(this._resourceGeneration).isCurrent,
      onCancel: function () { result._relicDetailOpening = false; },
      onOpened: function (node) {
        result._relicDetailOpening = false;
        result._relicDetailNode = node;
        node.zIndex = Math.min(cc.macro.MAX_ZINDEX, result.node.zIndex + 1);
      }
    }, relic, true);
  };
  _ctor.prototype.onClose = function () {
    $z1AudioMgr.AudioMgr.getInstance().stopOwnedEffects(this);
    var node = this._relicDetailNode;
    this._relicDetailNode = null;
    if (node && cc.isValid(node, true)) $z1UIMgr.UIMgr.getInstance().closeUI(node);
  };
  _ctor.prototype.onDestroy = function () {
    try { this.onClose(); }
    finally { t.prototype.onDestroy.call(this); }
  };
  cc__decorate([ccp_property(sp.Skeleton)], _ctor.prototype, "resultSp", undefined);
  cc__decorate([ccp_property(cc.Node)], _ctor.prototype, "btnExit", undefined);
  cc__decorate([ccp_property(cc.Label)], _ctor.prototype, "lblStats", undefined);
  cc__decorate([ccp_property(cc.Label)], _ctor.prototype, "lblSaved", undefined);
  cc__decorate([ccp_property(cc.Node)], _ctor.prototype, "ndRewards", undefined);
  return cc__decorate([ccp_ccclass], _ctor);
}($z1BaseUI.default);
exports.default = def_GAD_UIResult;
