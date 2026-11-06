var i;
var a;
Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.KinghtFallPoolName = exports.KinghtFallPrefabName = exports.KinghtFallParameter = exports.KinghtFallEventName = exports.KinghtFallAudioCF = exports.KinghtFallAudioId = exports.KinghtFallUICF = exports.KinghtFallUIID = exports.KinghtFallBundelName = undefined;
var o;
var r;
var $z1Appcfg = require("Appcfg");
var exp_KinghtFallBundelName = function () {
  function _ctor() {}
  _ctor.Prefab = "KinghtFallPrefabs";
  _ctor.Audio = "KinghtFallAudio";
  _ctor.IconGood = "KinghtFallIconGood";
  _ctor.IconMap = "KinghtFallIconMap";
  _ctor.IconTalent = "KinghtFallIconTalent";
  _ctor.IconCharacter = "KinghtFallIconCharacter";
  _ctor.IconBuild = "KinghtFallIconBuild";
  _ctor.IconBuff = "KinghtFallIconBuff";
  _ctor.EnemyAni = "KinghtFallEnemyAni";
  _ctor.Enemy = "KinghtFallEnemy";
  _ctor.Player = "KinghtFallPlayer";
  _ctor.Effect = "KinghtFallEffect";
  return _ctor;
}();
exports.KinghtFallBundelName = exp_KinghtFallBundelName;
(function (t) {
  t.UIHome = "KinghtFallUIHome";
  t.UITop = "KinghtFallUITop";
  t.UISetting = "KinghtFallUISetting";
  t.UIGoldReward = "KinghtFallUIGoldReward";
  t.UITreasureReward = "KinghtFallUITreasureReward";
  t.UINewModular = "KinghtFallUINewModular";
  t.UINewGame = "KinghtFallUINewGame";
  t.UIGame = "KinghtFallUIGame";
  t.UIGameBack = "KinghtFallUIGameBack";
  t.UIGameEnd = "KinghtFallUIGameEnd";
  t.UIBuildSel = "KinghtFallUIBuildSel";
  t.UISuspend = "KinghtFallUISuspend";
  t.UIBuff = "KinghtFallUIBuff";
  t.UIBuildAtlas = "KinghtFallUIBuildAtlas";
  t.UIVideoTips = "KinghtFallUIVideoTips";
  t.UIAchievement = "KinghtFallUIAchievement";
  t.UIPassport = "KinghtFallUIPassport";
  t.UIOnlineReward = "KinghtFallUIOnlineReward";
  t.UISignIn = "KinghtFallUISignIn";
  t.UITalentInfo = "KinghtFallUITalentInfo";
  t.UITreasureInfo = "KinghtFallUITreasureInfo";
  t.UIAddCurrency = "KinghtFallUIAddCurrency";
  t.UIAddStrength = "KinghtFallUIAddStrength";
  t.UIExchangeCode = "KinghtFallUIExchangeCode";
  t.UIAddDesktop = "KinghtFallUIAddDesktop";
  t.UISideBoard = "KinghtFallUISideBoard";
  t.UIGM = "KinghtFallUIGM";
})(o = exports.KinghtFallUIID || (exports.KinghtFallUIID = {}));
exports.KinghtFallUICF = ((i = {})[o.UIHome] = {
  prefab: "home/KinghtFallUIHome",
  name: "KinghtFallUIHome",
  showTop: true,
  showMult: false,
  zIndex: $z1Appcfg.OrderLayer.main,
  bundleName: exp_KinghtFallBundelName.Prefab
}, i[o.UITop] = {
  prefab: "home/KinghtFallUITop",
  name: "KinghtFallUITop",
  showTop: true,
  showMult: false,
  zIndex: $z1Appcfg.OrderLayer.top,
  bundleName: exp_KinghtFallBundelName.Prefab
}, i[o.UINewModular] = {
  prefab: "home/KinghtFallUINewModular",
  name: "KinghtFallUINewModular",
  showTop: false,
  showMult: false,
  zIndex: $z1Appcfg.OrderLayer.pop,
  bundleName: exp_KinghtFallBundelName.Prefab
}, i[o.UISetting] = {
  prefab: "home/KinghtFallUISetting",
  name: "KinghtFallUISetting",
  showTop: false,
  showMult: false,
  zIndex: $z1Appcfg.OrderLayer.pop2,
  bundleName: exp_KinghtFallBundelName.Prefab
}, i[o.UIAddCurrency] = {
  prefab: "commer/KinghtFallUIAddCurrency",
  name: "KinghtFallUIAddCurrency",
  showTop: false,
  showMult: false,
  zIndex: $z1Appcfg.OrderLayer.pop2,
  bundleName: exp_KinghtFallBundelName.Prefab
}, i[o.UIAddStrength] = {
  prefab: "commer/KinghtFallUIAddStrength",
  name: "KinghtFallUIAddStrength",
  showTop: false,
  showMult: false,
  zIndex: $z1Appcfg.OrderLayer.pop2,
  bundleName: exp_KinghtFallBundelName.Prefab
}, i[o.UIExchangeCode] = {
  prefab: "commer/KinghtFallUIExchangeCode",
  name: "KinghtFallUIExchangeCode",
  showTop: false,
  showMult: false,
  zIndex: $z1Appcfg.OrderLayer.pop2,
  bundleName: exp_KinghtFallBundelName.Prefab
}, i[o.UIAddDesktop] = {
  prefab: "commer/KinghtFallUIAddDesktop",
  name: "KinghtFallUIAddDesktop",
  showTop: false,
  showMult: false,
  zIndex: $z1Appcfg.OrderLayer.pop,
  bundleName: exp_KinghtFallBundelName.Prefab
}, i[o.UIAchievement] = {
  prefab: "homePop/KinghtFallUIAchievement",
  name: "KinghtFallUIAchievement",
  showTop: false,
  showMult: false,
  zIndex: $z1Appcfg.OrderLayer.pop,
  bundleName: exp_KinghtFallBundelName.Prefab
}, i[o.UIPassport] = {
  prefab: "homePop/KinghtFallUIPassport",
  name: "KinghtFallUIPassport",
  showTop: false,
  showMult: false,
  zIndex: $z1Appcfg.OrderLayer.pop,
  bundleName: exp_KinghtFallBundelName.Prefab
}, i[o.UIOnlineReward] = {
  prefab: "homePop/KinghtFallUIOnlineReward",
  name: "KinghtFallUIOnlineReward",
  showTop: false,
  showMult: false,
  zIndex: $z1Appcfg.OrderLayer.pop,
  bundleName: exp_KinghtFallBundelName.Prefab
}, i[o.UISignIn] = {
  prefab: "homePop/KinghtFallUISignIn",
  name: "KinghtFallUISignIn",
  showTop: false,
  showMult: false,
  zIndex: $z1Appcfg.OrderLayer.pop,
  bundleName: exp_KinghtFallBundelName.Prefab
}, i[o.UITalentInfo] = {
  prefab: "homePop/KinghtFallUITalentInfo",
  name: "KinghtFallUITalentInfo",
  showTop: false,
  showMult: false,
  zIndex: $z1Appcfg.OrderLayer.pop,
  bundleName: exp_KinghtFallBundelName.Prefab
}, i[o.UITreasureInfo] = {
  prefab: "homePop/KinghtFallUITreasureInfo",
  name: "KinghtFallUITreasureInfo",
  showTop: false,
  showMult: false,
  zIndex: $z1Appcfg.OrderLayer.pop,
  bundleName: exp_KinghtFallBundelName.Prefab
}, i[o.UINewGame] = {
  prefab: "homePop/KinghtFallUINewGame",
  name: "KinghtFallUINewGame",
  showTop: false,
  showMult: false,
  zIndex: $z1Appcfg.OrderLayer.pop,
  bundleName: exp_KinghtFallBundelName.Prefab
}, i[o.UISideBoard] = {
  prefab: "homePop/KinghtFallUISideBoard",
  name: "KinghtFallUISideBoard",
  showTop: false,
  showMult: false,
  zIndex: $z1Appcfg.OrderLayer.pop2,
  bundleName: exp_KinghtFallBundelName.Prefab
}, i[o.UIGoldReward] = {
  prefab: "homePop/KinghtFallUIGoldReward",
  name: "KinghtFallUIGoldReward",
  showTop: false,
  showMult: false,
  zIndex: $z1Appcfg.OrderLayer.pop2,
  bundleName: exp_KinghtFallBundelName.Prefab
}, i[o.UITreasureReward] = {
  prefab: "homePop/KinghtFallUITreasureReward",
  name: "KinghtFallUITreasureReward",
  showTop: false,
  showMult: false,
  zIndex: $z1Appcfg.OrderLayer.pop2,
  bundleName: exp_KinghtFallBundelName.Prefab
}, i[o.UIGame] = {
  prefab: "game/KinghtFallUIGame",
  name: "KinghtFallUIGame",
  showTop: false,
  showMult: false,
  zIndex: $z1Appcfg.OrderLayer.main,
  bundleName: exp_KinghtFallBundelName.Prefab
}, i[o.UIGameBack] = {
  prefab: "game/KinghtFallUIGameBack",
  name: "KinghtFallUIGameBack",
  showTop: false,
  showMult: false,
  zIndex: $z1Appcfg.OrderLayer.pop,
  bundleName: exp_KinghtFallBundelName.Prefab
}, i[o.UIGameEnd] = {
  prefab: "game/KinghtFallUIGameEnd",
  name: "KinghtFallUIGameEnd",
  showTop: false,
  showMult: false,
  zIndex: $z1Appcfg.OrderLayer.pop,
  bundleName: exp_KinghtFallBundelName.Prefab
}, i[o.UIBuildSel] = {
  prefab: "gamePop/KinghtFallUIBuildSel",
  name: "KinghtFallUIBuildSel",
  showTop: false,
  showMult: false,
  zIndex: $z1Appcfg.OrderLayer.pop,
  bundleName: exp_KinghtFallBundelName.Prefab
}, i[o.UISuspend] = {
  prefab: "gamePop/KinghtFallUISuspend",
  name: "KinghtFallUISuspend",
  showTop: false,
  showMult: false,
  zIndex: $z1Appcfg.OrderLayer.pop,
  bundleName: exp_KinghtFallBundelName.Prefab
}, i[o.UIBuff] = {
  prefab: "gamePop/KinghtFallUIBuff",
  name: "KinghtFallUIBuff",
  showTop: false,
  showMult: false,
  zIndex: $z1Appcfg.OrderLayer.pop,
  bundleName: exp_KinghtFallBundelName.Prefab
}, i[o.UIBuildAtlas] = {
  prefab: "gamePop/KinghtFallUIBuildAtlas",
  name: "KinghtFallUIBuildAtlas",
  showTop: false,
  showMult: false,
  zIndex: $z1Appcfg.OrderLayer.pop,
  bundleName: exp_KinghtFallBundelName.Prefab
}, i[o.UIVideoTips] = {
  prefab: "gamePop/KinghtFallUIVideoTips",
  name: "KinghtFallUIVideoTips",
  showTop: false,
  showMult: false,
  zIndex: $z1Appcfg.OrderLayer.pop,
  bundleName: exp_KinghtFallBundelName.Prefab
}, i[o.UIGM] = {
  prefab: "gm/KinghtFallUIGM",
  name: "KinghtFallUIGM",
  showTop: false,
  showMult: false,
  zIndex: $z1Appcfg.OrderLayer.pop2,
  bundleName: exp_KinghtFallBundelName.Prefab
}, i);
(function (t) {
  t.menu_bgm = "KinghtFallmenu_bgm";
  t.ready_bgm = "KinghtFallready_bgm";
  t.fight_bgm = "KinghtFallfight_bgm";
  t.button_click = "KinghtFallbutton_click";
  t.gold_reward = "KinghtFallgold_reward";
  t.item_reward = "KinghtFallitem_reward";
  t.box_treasure = "KinghtFallbox_treasure";
  t.level_up = "KinghtFalllevel_up";
  t.palyer_attack = "KinghtFallpalyer_attack";
  t.player_hurt = "KinghtFallplayer_hurt";
  t.rebirth = "KinghtFallrebirth";
  t.death = "KinghtFalldeath";
  t.game_success = "KinghtFallgame_success";
  t.game_fail = "KinghtFallgame_fail";
  t.set_of = "KinghtFallset_of";
  t.get_idea = "KinghtFallget_idea";
  t.destory = "KinghtFalldestory";
  t.buliding = "KinghtFallbuliding";
  t.Scroll_down = "KinghtFallScroll_down";
  t.unlock = "KinghtFallunlock";
  t.cuo = "KinghtFallcuo";
  t.run = "KinghtFallrun";
})(r = exports.KinghtFallAudioId || (exports.KinghtFallAudioId = {}));
exports.KinghtFallAudioCF = ((a = {})[r.menu_bgm] = {
  path: "menu_bgm",
  bundle: exp_KinghtFallBundelName.Audio
}, a[r.ready_bgm] = {
  path: "ready_bgm",
  bundle: exp_KinghtFallBundelName.Audio
}, a[r.fight_bgm] = {
  path: "fight_bgm",
  bundle: exp_KinghtFallBundelName.Audio
}, a[r.button_click] = {
  path: "button_click",
  bundle: exp_KinghtFallBundelName.Audio
}, a[r.gold_reward] = {
  path: "gold_reward",
  bundle: exp_KinghtFallBundelName.Audio
}, a[r.item_reward] = {
  path: "item_reward",
  bundle: exp_KinghtFallBundelName.Audio
}, a[r.box_treasure] = {
  path: "box_treasure",
  bundle: exp_KinghtFallBundelName.Audio
}, a[r.level_up] = {
  path: "level_up",
  bundle: exp_KinghtFallBundelName.Audio
}, a[r.palyer_attack] = {
  path: "palyer_attack",
  bundle: exp_KinghtFallBundelName.Audio
}, a[r.player_hurt] = {
  path: "player_hurt",
  bundle: exp_KinghtFallBundelName.Audio
}, a[r.rebirth] = {
  path: "rebirth",
  bundle: exp_KinghtFallBundelName.Audio
}, a[r.death] = {
  path: "death",
  bundle: exp_KinghtFallBundelName.Audio
}, a[r.game_success] = {
  path: "game_success",
  bundle: exp_KinghtFallBundelName.Audio
}, a[r.game_fail] = {
  path: "game_fail",
  bundle: exp_KinghtFallBundelName.Audio
}, a[r.set_of] = {
  path: "set_of",
  bundle: exp_KinghtFallBundelName.Audio
}, a[r.get_idea] = {
  path: "get_idea",
  bundle: exp_KinghtFallBundelName.Audio
}, a[r.destory] = {
  path: "destory",
  bundle: exp_KinghtFallBundelName.Audio
}, a[r.buliding] = {
  path: "buliding",
  bundle: exp_KinghtFallBundelName.Audio
}, a[r.Scroll_down] = {
  path: "Scroll_down",
  bundle: exp_KinghtFallBundelName.Audio
}, a[r.unlock] = {
  path: "unlock",
  bundle: exp_KinghtFallBundelName.Audio
}, a[r.cuo] = {
  path: "cuo",
  bundle: exp_KinghtFallBundelName.Audio
}, a[r.run] = {
  path: "run",
  bundle: exp_KinghtFallBundelName.Audio
}, a);
(function (t) {
  t.RefreshGold = "KinghtFallRefreshGold";
  t.RefreshDiamond = "KinghtFallRefreshDiamond";
  t.RefreshPower = "KinghtFallRefreshPower";
  t.AniGold = "KinghtFallAniGold";
  t.AniDiamond = "KinghtFallAniDiamond";
  t.TalentUpdate = "KinghtFallTalentUpdate";
  t.TreasureUpdate = "KinghtFallTreasureUpdate";
  t.TreasureUpdate2 = "KinghtFallTreasureUpdate2";
  t.GamePause = "KinghtFallGamePause";
  t.BuildingLevelUp = "KinghtFallBuildingLevelUp";
  t.MapUpdate = "KinghtFallMapUpdate";
  t.RoundEnd = "KinghtFallRoundEnd";
  t.GameOver = "KinghtFallGameOver";
  t.GameRestart = "KinghtFallGameRestart";
  t.ReviveShow = "KinghtFallReviveShow";
  t.NewbieGuide = "KinghtFallNewbieGuide";
  t.UpdateRedPoint = "KinghtFallUpdateRedPoint";
  t.TimeUpdate = "KinghtFallTimeUpdate";
  t.PlayVideoSucc = "KinghtFallPlayVideoSucc";
  t.UpBattView = "KinghtFallUpBattView";
})(exports.KinghtFallEventName || (exports.KinghtFallEventName = {}));
var exp_KinghtFallParameter = function () {
  function t() {}
  t.AppCacheName = "KinghtFall#";
  t.WebCacheName = "KinghtFall#";
  t.BGMusic = "KinghtFallBG";
  t.RunMusic = "KinghtFallRun";
  t.FollowRange = 120;
  t.FollowMode = 1;
  t.InitGold = 0;
  return t;
}();
exports.KinghtFallParameter = exp_KinghtFallParameter;
var exp_KinghtFallPrefabName = function () {
  function t() {}
  t.ItemGood = "ItemGood";
  t.ItemTreasure = "ItemTreasure";
  t.ItemHp = "ItemHp";
  t.EffectEnemyDead = "EnemyDead";
  t.EffectEnemyAttack = "EnemyAttack";
  t.EffectSoldier7Attack = "Soldier7Attack";
  t.EffectSoldier7Move = "Soldier7Move";
  t.EffectSoldier9Attack = "Soldier9Attack";
  t.EffectSoldier9Buff = "Soldier9Buff";
  t.EffectSoldier10Attack = "Soldier10Attack";
  t.EffectSoldier10Buff = "Soldier10Buff";
  return t;
}();
exports.KinghtFallPrefabName = exp_KinghtFallPrefabName;
var exp_KinghtFallPoolName = function () {
  function t() {}
  t.ItemGood = "FlatBackpackItemGood";
  t.ItemTreasure = "FlatBackpackItemTreasure";
  t.Enemy = "Enemy";
  t.Soldier = "Soldier";
  t.EnemyHp = "EnemyHp";
  t.EnemyDead = "EnemyDead";
  t.EnemyAttack = "EnemyAttack";
  t.Soldier7Attack = "Soldier7Attack";
  t.Soldier7Move = "Soldier7Move";
  t.Soldier9Attack = "Soldier9Attack";
  t.Soldier9Buff = "Soldier9Buff";
  t.Soldier10Attack = "Soldier10Attack";
  t.Soldier10Buff = "Soldier10Buff";
  return t;
}();
exports.KinghtFallPoolName = exp_KinghtFallPoolName;