"use strict";
var BaseUI = require("BaseUI").default;
var List = require("List").default;
var Player = require("KinghtFallPlayerMgr").KinghtFallPlayerMgr;
var Data = require("KinghtFallDataMgr").KinghtFallDataMgr;
var Config = require("KinghtFallConfig");
var Utils = require("Utils").Utils;
var Model = require("KinghtFallModle").default;
var UI = cc.Class({
  extends: BaseUI,
  properties: { btnClose: cc.Node, ctrList: List, emptyLabel: cc.Label },
  start: function () {
    this.ctrList.tmpNode.active = false;
    this.btnClose.on(cc.Node.EventType.TOUCH_END, this.closeUI, this);
    this.addEvent(Config.KinghtFallEventName.TimeUpdate, this.initView);
    this.initView();
  },
  initView: function () {
    if (!this.ctrList) return;
    this.rows = Player.getInstance().getMissionData().getQuestViews();
    var signature = this.rows.map(function (row) { return [row.task.id, row.task.stage, row.progress.num, row.progress.total].join(":"); }).join("|");
    if (this._signature === signature) return;
    this._signature = signature;
    this.ctrList.numItems = this.rows.length;
    if (this.emptyLabel) this.emptyLabel.node.active = !this.rows.length;
  },
  initQuestView: function (node, index) {
    var row = this.rows[index]; if (!row) return;
    node.active = true; node.opacity = 255; node._questId = row.task.id;
    var reward = node.getChildByName("ndItem"), icon = reward.getChildByName("sprIcon"), number = reward.getChildByName("labNum");
    if (!icon) {
      icon = new cc.Node("sprIcon"); icon.parent = reward; icon.setContentSize(78, 78); icon.y = 8;
      icon.addComponent(cc.Sprite).sizeMode = cc.Sprite.SizeMode.CUSTOM;
      number = new cc.Node("labNum"); number.parent = reward; number.y = -38; number.setContentSize(124, 48);
      var amount = number.addComponent(cc.Label); amount.fontSize = 30; amount.lineHeight = 40; amount.horizontalAlign = cc.Label.HorizontalAlign.CENTER;
      var outline = number.addComponent(cc.LabelOutline); outline.color = cc.Color.BLACK; outline.width = 3;
    }
    number.getComponent(cc.Label).string = Model.getInstance().numberFomat(row.cfg.Award[1]);
    var good = Data.getInstance().getGoodsCfgById(row.cfg.Award[0]), id = row.task.id;
    this.loadSpriteFrame(Config.KinghtFallBundelName.IconGood, good.icon, function (frame) {
      if (frame && cc.isValid(node, true) && node._questId === id) icon.getComponent(cc.Sprite).spriteFrame = frame;
    });
    var text = node.getChildByName("labInfo"), rich = text.getComponent(cc.RichText);
    rich.string = "<b>" + Utils.StringFormat.apply(Utils, [this.T(row.cfg.MissionDescribe)].concat(row.cfg.Argument)) + "</b>";
    var ready = row.progress.ready, finish = node.getChildByName("ndFinish"), claim = finish.getChildByName("btnGet");
    finish.active = ready; finish.getChildByName("mask").active = ready;
    finish.getChildByName("btnFinish").active = false; claim.active = ready;
    claim.off(cc.Node.EventType.TOUCH_END);
    claim.on(cc.Node.EventType.TOUCH_END, function (event) { if (event) event.stopPropagation(); this.claimQuest(id, reward); }, this);
    var progress = node.getChildByName("ndPro");
    progress.getChildByName("sprPro").getComponent(cc.Sprite).fillRange = Math.min(1, Math.max(0, row.progress.num / row.progress.total));
    progress.getChildByName("labPro").getComponent(cc.Label).string = Math.min(row.progress.total, Math.max(0, row.progress.num)) + "/" + row.progress.total;
    var right = node.width * (1 - node.anchorX) - 16;
    if (ready) right = Math.min(right, finish.x + (claim.x - claim.width * claim.anchorX * Math.abs(claim.scaleX)) * Math.abs(finish.scaleX) - 16);
    rich.maxWidth = Math.max(32, (right - text.x) / Math.abs(text.scaleX));
  },
  claimQuest: function (id, rewardNode) {
    if (this._claiming) return;
    var player = Player.getInstance(), missions = player.getMissionData(), view = missions.getQuestViews().find(function (row) { return row.task.id === id; }), cfg = view && view.cfg;
    if (!cfg) return;
    this._claiming = true;
    try {
      var result = player.claimRewards([{ id: cfg.Award[0], num: cfg.Award[1] }], 1, rewardNode.convertToWorldSpaceAR(cc.v2(0, 0)),
        function () { return missions.claimQuest(id); },
        function () { return missions.getQuests().some(function (task) { return task.id === id && task.stage === 1; }); });
      if (result) { this._signature = null; this.initView(); this.sendEvent(Config.KinghtFallEventName.UpdateRedPoint, 4); }
    } finally { this._claiming = false; }
  }
});
exports.default = UI;
