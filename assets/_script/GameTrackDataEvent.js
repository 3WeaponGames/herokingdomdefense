var i;
var a;
Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.EventCF = exports.TrackId = undefined;
(function (t) {
  t[t.dau = 0] = "dau";
  t[t.guide1 = 1] = "guide1";
  t[t.guide2 = 2] = "guide2";
  t[t.guide3 = 3] = "guide3";
  t[t.guide4 = 4] = "guide4";
  t[t.guide5 = 5] = "guide5";
  t[t.guide6 = 6] = "guide6";
  t[t.guide7 = 7] = "guide7";
  t[t.guide8 = 8] = "guide8";
  t[t.guide9 = 9] = "guide9";
  t[t.guide10 = 10] = "guide10";
  t[t.guide11 = 11] = "guide11";
  t[t.guide12 = 12] = "guide12";
  t[t.guide13 = 13] = "guide13";
  t[t.guide14 = 14] = "guide14";
  t[t.guide15 = 15] = "guide15";
  t[t.guide16 = 16] = "guide16";
  t[t.guide17 = 17] = "guide17";
  t[t.guide18 = 18] = "guide18";
  t[t.guide19 = 19] = "guide19";
  t[t.guide20 = 20] = "guide20";
  t[t.guide21 = 21] = "guide21";
  t[t.guide22 = 22] = "guide22";
  t[t.add_desktop = 23] = "add_desktop";
  t[t.add_sidebar = 24] = "add_sidebar";
  t[t.box_draw1 = 25] = "box_draw1";
  t[t.box_draw10 = 26] = "box_draw10";
  t[t.start_X_Y = 27] = "start_X_Y";
  t[t.fail_X_Y = 28] = "fail_X_Y";
  t[t.talent_unlock_X = 29] = "talent_unlock_X";
  t[t.token_normal_X = 30] = "token_normal_X";
  t[t.token_better_X = 31] = "token_better_X";
  t[t.building_X = 32] = "building_X";
  t[t.lv_building_X_Y = 33] = "lv_building_X_Y";
  t[t.building_up_2v1_X = 34] = "building_up_2v1_X";
  t[t.equip_X = 35] = "equip_X";
  t[t.token = 36] = "token";
  t[t.gold = 37] = "gold";
  t[t.diamond = 38] = "diamond";
  t[t.power = 39] = "power";
  t[t.day7_double = 40] = "day7_double";
  t[t.day7_once = 41] = "day7_once";
  t[t.game_revive = 42] = "game_revive";
  t[t.building_2v1 = 43] = "building_2v1";
  t[t.buff_1 = 44] = "buff_1";
  t[t.buff_3 = 45] = "buff_3";
  t[t.win_double = 46] = "win_double";
  t[t.hero_revive = 47] = "hero_revive";
  t[t.map_add_soldier = 48] = "map_add_soldier";
  t[t.map_weapon = 49] = "map_weapon";
  t[t.map_coin = 50] = "map_coin";
  t[t.map_horse = 51] = "map_horse";
  t[t.box_1 = 52] = "box_1";
  t[t.talent = 53] = "talent";
  t[t.button_coin = 54] = "button_coin";
  t[t.defend_wall = 55] = "defend_wall";
  t[t.arrow2 = 56] = "arrow2";
  t[t.horse2 = 57] = "horse2";
  t[t.pay_token_Y = 58] = "pay_token_Y";
  t[t.pay_gold_Y = 59] = "pay_gold_Y";
  t[t.pay_diamond_Y = 60] = "pay_diamond_Y";
  t[t.pay_power_Y = 61] = "pay_power_Y";
  t[t.pay_day7_double_Y = 62] = "pay_day7_double_Y";
  t[t.pay_day7_once_Y = 63] = "pay_day7_once_Y";
  t[t.pay_game_revive_Y = 64] = "pay_game_revive_Y";
  t[t.pay_building_2v1_Y = 65] = "pay_building_2v1_Y";
  t[t.pay_buff_1_Y = 66] = "pay_buff_1_Y";
  t[t.pay_buff_3_Y = 67] = "pay_buff_3_Y";
  t[t.pay_win_double_Y = 68] = "pay_win_double_Y";
  t[t.pay_hero_revive_Y = 69] = "pay_hero_revive_Y";
  t[t.pay_map_add_soldier_Y = 70] = "pay_map_add_soldier_Y";
  t[t.pay_map_weapon_Y = 71] = "pay_map_weapon_Y";
  t[t.pay_map_coin_Y = 72] = "pay_map_coin_Y";
  t[t.pay_map_horse_Y = 73] = "pay_map_horse_Y";
  t[t.pay_box_1_Y = 74] = "pay_box_1_Y";
  t[t.pay_talent_Y = 75] = "pay_talent_Y";
  t[t.pay_button_coin_Y = 76] = "pay_button_coin_Y";
  t[t.pay_arrow2_Y = 77] = "pay_arrow2_Y";
  t[t.pay_horse2_Y = 78] = "pay_horse2_Y";
  t[t.time_1 = 79] = "time_1";
  t[t.time_3 = 80] = "time_3";
  t[t.time_5 = 81] = "time_5";
  t[t.time_7 = 82] = "time_7";
  t[t.time_10 = 83] = "time_10";
  t[t.time_15 = 84] = "time_15";
  t[t.time_20 = 85] = "time_20";
  t[t.time_30 = 86] = "time_30";
  t[t.time_1h = 87] = "time_1h";
  t[t.time_3h = 88] = "time_3h";
  t[t.time_5h = 89] = "time_5h";
  t[t.dau_day_X = 90] = "dau_day_X";
  t[t.notice_X_Y = 91] = "notice_X_Y";
})(a = exports.TrackId || (exports.TrackId = {}));
exports.EventCF = ((i = {})[a.dau] = {
  eventKey: "dau",
  eventValue: "dau",
  onlyOne: false,
  info: "活跃人数",
  alias: "1"
}, i[a.guide1] = {
  eventKey: "guide",
  eventValue: "guide1",
  onlyOne: true,
  info: "进入游戏主界面的玩家人数",
  alias: "2"
}, i[a.guide2] = {
  eventKey: "guide",
  eventValue: "guide2",
  onlyOne: true,
  info: "[强引导1]噢，宽广的土地又来了一位新的国王（文本）",
  alias: "3"
}, i[a.guide3] = {
  eventKey: "guide",
  eventValue: "guide3",
  onlyOne: true,
  info: "[强引导2]去开拓疆土，点击关卡开始战斗！（点击开始游戏）",
  alias: "4"
}, i[a.guide4] = {
  eventKey: "guide",
  eventValue: "guide4",
  onlyOne: true,
  info: "[强引导3]这里是我们现在拥有的银币，银币可以用来建造建筑（文本）",
  alias: "5"
}, i[a.guide5] = {
  eventKey: "guide",
  eventValue: "guide5",
  onlyOne: true,
  info: "[强引导4]拖动摇杆移动来这里，建造主堡吧",
  alias: "6"
}, i[a.guide6] = {
  eventKey: "guide",
  eventValue: "guide6",
  onlyOne: true,
  info: "成功建立主城的玩家人数",
  alias: "7"
}, i[a.guide7] = {
  eventKey: "guide",
  eventValue: "guide7",
  onlyOne: true,
  info: "这里会显示敌人的数量和出现的位置（文本）",
  alias: "8"
}, i[a.guide8] = {
  eventKey: "guide",
  eventValue: "guide8",
  onlyOne: true,
  info: "准备好了吗？开始迎击！（点击迎击敌人）",
  alias: "9"
}, i[a.guide9] = {
  eventKey: "guide",
  eventValue: "guide9",
  onlyOne: true,
  info: "每场战斗后，都可以选择1个属性强化！（文本）",
  alias: "10"
}, i[a.guide10] = {
  eventKey: "guide",
  eventValue: "guide10",
  onlyOne: true,
  info: "[弱引导]箭塔拥有强大的攻击力可以帮你抵御敌人（文本）",
  alias: "11"
}, i[a.guide11] = {
  eventKey: "guide",
  eventValue: "guide11",
  onlyOne: true,
  info: "[弱引导]兵营会为你招募士兵，试着点击召集按钮（文本）",
  alias: "12"
}, i[a.guide12] = {
  eventKey: "guide",
  eventValue: "guide12",
  onlyOne: true,
  info: "[弱引导]民宅能提供额外的银币（文本）",
  alias: "13"
}, i[a.guide13] = {
  eventKey: "guide",
  eventValue: "guide13",
  onlyOne: true,
  info: "[弱引导]磨坊能为你提供更多的银币（文本）",
  alias: "14"
}, i[a.guide14] = {
  eventKey: "guide",
  eventValue: "guide14",
  onlyOne: true,
  info: "[弱引导]城墙可以阻挡敌人的前进（文本）",
  alias: "15"
}, i[a.guide15] = {
  eventKey: "guide",
  eventValue: "guide15",
  onlyOne: true,
  info: "[弱引导]该去看我们的天赋了！这能使我们战力更强大！（解锁天赋）",
  alias: "16"
}, i[a.guide16] = {
  eventKey: "guide",
  eventValue: "guide16",
  onlyOne: true,
  info: "[弱引导]点击图标，可以查看天赋的详细信息（文本）",
  alias: "17"
}, i[a.guide17] = {
  eventKey: "guide",
  eventValue: "guide17",
  onlyOne: true,
  info: "[弱引导]点击解锁按钮，为建筑解锁吧。（点击解锁）",
  alias: "18",
  preEvent: "17"
}, i[a.guide18] = {
  eventKey: "guide",
  eventValue: "guide18",
  onlyOne: true,
  info: "[弱引导]装备解锁了，快去看看吧（解锁装备）",
  alias: "19"
}, i[a.guide19] = {
  eventKey: "guide",
  eventValue: "guide19",
  onlyOne: true,
  info: "[弱引导]点击强化按钮可消耗金币提升装备属性",
  alias: "20"
}, i[a.guide20] = {
  eventKey: "guide",
  eventValue: "guide20",
  onlyOne: true,
  info: "[弱引导]世界上隐藏着许多强大的至宝！我们去看看",
  alias: "21"
}, i[a.guide21] = {
  eventKey: "guide",
  eventValue: "guide21",
  onlyOne: true,
  info: "[弱引导]第一次抽奖免费噢！快点击试试",
  alias: "22"
}, i[a.guide22] = {
  eventKey: "guide",
  eventValue: "guide22",
  onlyOne: true,
  info: "[弱引导]点击至宝查看详细吧。",
  alias: "23",
  preEvent: "22"
}, i[a.add_desktop] = {
  eventKey: "guide",
  eventValue: "add_desktop",
  onlyOne: true,
  info: "添加桌面——抖音渠道专属",
  alias: "24"
}, i[a.add_sidebar] = {
  eventKey: "guide",
  eventValue: "add_sidebar",
  onlyOne: true,
  info: "添加侧边栏——抖音渠道专属",
  alias: "25"
}, i[a.box_draw1] = {
  eventKey: "lv",
  eventValue: "box_draw1",
  onlyOne: false,
  info: "主界面-至宝盒子-单次抽奖的次数（包括钻石抽奖、看视频抽奖）",
  alias: "26"
}, i[a.box_draw10] = {
  eventKey: "lv",
  eventValue: "box_draw10",
  onlyOne: false,
  info: "主界面-至宝盒子-十连抽的次数",
  alias: "27"
}, i[a.start_X_Y] = {
  eventKey: "lv",
  eventValue: "start_",
  onlyOne: false,
  info: "到达关卡X 波数Y的玩家人数（X=对应关卡id，Y=局内波数）",
  alias: "28"
}, i[a.fail_X_Y] = {
  eventKey: "lv",
  eventValue: "fail_",
  onlyOne: false,
  info: "在关卡X 波数Y战斗失败的玩家人数（X=对应关卡id，Y=局内波数）",
  alias: "29"
}, i[a.talent_unlock_X] = {
  eventKey: "lv",
  eventValue: "talent_unlock_",
  onlyOne: false,
  info: "解锁天赋X的玩家人数（X=对应天赋id）",
  alias: "30"
}, i[a.token_normal_X] = {
  eventKey: "lv",
  eventValue: "token_normal_",
  onlyOne: false,
  info: "通行证X-普通奖励 领取的玩家人数（X=对应通行证等级）",
  alias: "31"
}, i[a.token_better_X] = {
  eventKey: "lv",
  eventValue: "token_better_",
  onlyOne: false,
  info: "通行证X-高级奖励 领取的玩家人数（X=对应通行证等级）",
  alias: "32"
}, i[a.building_X] = {
  eventKey: "lv",
  eventValue: "building_",
  onlyOne: false,
  info: "局内建筑X升级的次数（X=home(主堡)、arrwo(箭塔）、house(民宅）、camp(兵营)、mill(磨坊)、wall（城墙)）",
  alias: "33"
}, i[a.lv_building_X_Y] = {
  eventKey: "lv",
  eventValue: "lv_building_",
  onlyOne: false,
  info: "统计在关卡X解锁建筑Y的玩家人数（X=对应关卡id，Y=对应建筑id）",
  alias: "34"
}, i[a.building_up_2v1_X] = {
  eventKey: "lv",
  eventValue: "building_up_2v1_",
  onlyOne: false,
  info: "局内-建筑X升级二选一（看视频解锁），对应的建筑次数（X=arrwo(箭塔）、house(民宅）、camp(兵营)、mill(磨坊)、wall（城墙)）",
  alias: "35"
}, i[a.equip_X] = {
  eventKey: "lv",
  eventValue: "equip_",
  onlyOne: false,
  info: "主界面-升级X装备的次数（X=对应装备id）",
  alias: "36"
}, i[a.token] = {
  eventKey: "video",
  eventValue: "token",
  onlyOne: false,
  info: "通行证-高级奖励的次数",
  alias: "37"
}, i[a.gold] = {
  eventKey: "video",
  eventValue: "gold",
  onlyOne: false,
  info: "金币补充的次数",
  alias: "38"
}, i[a.diamond] = {
  eventKey: "video",
  eventValue: "diamond",
  onlyOne: false,
  info: "钻石补充的次数",
  alias: "39"
}, i[a.power] = {
  eventKey: "video",
  eventValue: "power",
  onlyOne: false,
  info: "体力补充的次数",
  alias: "40"
}, i[a.day7_double] = {
  eventKey: "video",
  eventValue: "day7_double",
  onlyOne: false,
  info: "7天签到-双倍领取的次数",
  alias: "41"
}, i[a.day7_once] = {
  eventKey: "video",
  eventValue: "day7_once",
  onlyOne: false,
  info: "7天签到-再领一次的次数",
  alias: "42"
}, i[a.game_revive] = {
  eventKey: "video",
  eventValue: "game_revive",
  onlyOne: false,
  info: "局内-建筑复活的次数",
  alias: "43"
}, i[a.building_2v1] = {
  eventKey: "video",
  eventValue: "building_2v1",
  onlyOne: false,
  info: "局内-建筑升级二选一的次数",
  alias: "44"
}, i[a.buff_1] = {
  eventKey: "video",
  eventValue: "buff_1",
  onlyOne: false,
  info: "局内-灵光【刷新】的次数",
  alias: "45"
}, i[a.buff_3] = {
  eventKey: "video",
  eventValue: "buff_3",
  onlyOne: false,
  info: "局内-灵光【全都要】的次数",
  alias: "46"
}, i[a.win_double] = {
  eventKey: "video",
  eventValue: "win_double",
  onlyOne: false,
  info: "局内-胜利结算-双倍领取奖励的次数",
  alias: "47"
}, i[a.hero_revive] = {
  eventKey: "video",
  eventValue: "hero_revive",
  onlyOne: false,
  info: "局内-主角复活的次数",
  alias: "48"
}, i[a.map_add_soldier] = {
  eventKey: "video",
  eventValue: "map_add_soldier",
  onlyOne: false,
  info: "地图-【兵营-增加士兵】点击的次数",
  alias: "49"
}, i[a.map_weapon] = {
  eventKey: "video",
  eventValue: "map_weapon",
  onlyOne: false,
  info: "地图-点击 获取 武器的次数",
  alias: "50"
}, i[a.map_coin] = {
  eventKey: "video",
  eventValue: "map_coin",
  onlyOne: false,
  info: "地图-点击 获取 银币的次数",
  alias: "51"
}, i[a.map_horse] = {
  eventKey: "video",
  eventValue: "map_horse",
  onlyOne: false,
  info: "地图-点击 获取 马匹的次数",
  alias: "52"
}, i[a.box_1] = {
  eventKey: "video",
  eventValue: "box_1",
  onlyOne: false,
  info: "至宝盒子【抽一次】的次数",
  alias: "53"
}, i[a.talent] = {
  eventKey: "video",
  eventValue: "talent",
  onlyOne: false,
  info: "主界面-广告解锁天赋的次数",
  alias: "54"
}, i[a.button_coin] = {
  eventKey: "video",
  eventValue: "button_coin",
  onlyOne: false,
  info: "局内-【迎击敌人】获取银币的次数",
  alias: "55"
}, i[a.defend_wall] = {
  eventKey: "video",
  eventValue: "defend_wall",
  onlyOne: false,
  info: "主界面-通过广告进入【守卫城墙】副玩法的次数",
  alias: "56"
}, i[a.arrow2] = {
  eventKey: "iaa",
  eventValue: "arrow2",
  onlyOne: false,
  info: "地图-通过 广告获取2阶【地图-弓箭】的次数",
  alias: "57"
}, i[a.horse2] = {
  eventKey: "iaa",
  eventValue: "horse2",
  onlyOne: false,
  info: "地图-通过 广告获取2阶【地图-马匹】的次数",
  alias: "58"
}, i[a.pay_token_Y] = {
  eventKey: "pay",
  eventValue: "pay_token_",
  onlyOne: false,
  info: "记录所有广告点触发时玩家所在的位置（X=video id，Y=玩家当前所在的关卡数）",
  alias: "59"
}, i[a.pay_gold_Y] = {
  eventKey: "pay",
  eventValue: "pay_gold_",
  onlyOne: false,
  info: "记录所有广告点触发时玩家所在的位置（X=video id，Y=玩家当前所在的关卡数）",
  alias: "60"
}, i[a.pay_diamond_Y] = {
  eventKey: "pay",
  eventValue: "pay_diamond_",
  onlyOne: false,
  info: "记录所有广告点触发时玩家所在的位置（X=video id，Y=玩家当前所在的关卡数）",
  alias: "61"
}, i[a.pay_power_Y] = {
  eventKey: "pay",
  eventValue: "pay_power_",
  onlyOne: false,
  info: "记录所有广告点触发时玩家所在的位置（X=video id，Y=玩家当前所在的关卡数）",
  alias: "62"
}, i[a.pay_day7_double_Y] = {
  eventKey: "pay",
  eventValue: "pay_day7_double_",
  onlyOne: false,
  info: "记录所有广告点触发时玩家所在的位置（X=video id，Y=玩家当前所在的关卡数）",
  alias: "63"
}, i[a.pay_day7_once_Y] = {
  eventKey: "pay",
  eventValue: "pay_day7_once_",
  onlyOne: false,
  info: "记录所有广告点触发时玩家所在的位置（X=video id，Y=玩家当前所在的关卡数）",
  alias: "64"
}, i[a.pay_game_revive_Y] = {
  eventKey: "pay",
  eventValue: "pay_game_revive_",
  onlyOne: false,
  info: "记录所有广告点触发时玩家所在的位置（X=video id，Y=玩家当前所在的关卡数）",
  alias: "65"
}, i[a.pay_building_2v1_Y] = {
  eventKey: "pay",
  eventValue: "pay_building_2v1_",
  onlyOne: false,
  info: "记录所有广告点触发时玩家所在的位置（X=video id，Y=玩家当前所在的关卡数）",
  alias: "66"
}, i[a.pay_buff_1_Y] = {
  eventKey: "pay",
  eventValue: "pay_buff_1_",
  onlyOne: false,
  info: "记录所有广告点触发时玩家所在的位置（X=video id，Y=玩家当前所在的关卡数）",
  alias: "67"
}, i[a.pay_buff_3_Y] = {
  eventKey: "pay",
  eventValue: "pay_buff_3_",
  onlyOne: false,
  info: "记录所有广告点触发时玩家所在的位置（X=video id，Y=玩家当前所在的关卡数）",
  alias: "68"
}, i[a.pay_win_double_Y] = {
  eventKey: "pay",
  eventValue: "pay_win_double_",
  onlyOne: false,
  info: "记录所有广告点触发时玩家所在的位置（X=video id，Y=玩家当前所在的关卡数）",
  alias: "69"
}, i[a.pay_hero_revive_Y] = {
  eventKey: "pay",
  eventValue: "pay_hero_revive_",
  onlyOne: false,
  info: "记录所有广告点触发时玩家所在的位置（X=video id，Y=玩家当前所在的关卡数）",
  alias: "70"
}, i[a.pay_map_add_soldier_Y] = {
  eventKey: "pay",
  eventValue: "pay_map_add_soldier_",
  onlyOne: false,
  info: "记录所有广告点触发时玩家所在的位置（X=video id，Y=玩家当前所在的关卡数）",
  alias: "71"
}, i[a.pay_map_weapon_Y] = {
  eventKey: "pay",
  eventValue: "pay_map_weapon_",
  onlyOne: false,
  info: "记录所有广告点触发时玩家所在的位置（X=video id，Y=玩家当前所在的关卡数）",
  alias: "72"
}, i[a.pay_map_coin_Y] = {
  eventKey: "pay",
  eventValue: "pay_map_coin_",
  onlyOne: false,
  info: "记录所有广告点触发时玩家所在的位置（X=video id，Y=玩家当前所在的关卡数）",
  alias: "73"
}, i[a.pay_map_horse_Y] = {
  eventKey: "pay",
  eventValue: "pay_map_horse_",
  onlyOne: false,
  info: "记录所有广告点触发时玩家所在的位置（X=video id，Y=玩家当前所在的关卡数）",
  alias: "74"
}, i[a.pay_box_1_Y] = {
  eventKey: "pay",
  eventValue: "pay_box_1_",
  onlyOne: false,
  info: "记录所有广告点触发时玩家所在的位置（X=video id，Y=玩家当前所在的关卡数）",
  alias: "75"
}, i[a.pay_talent_Y] = {
  eventKey: "pay",
  eventValue: "pay_talent_",
  onlyOne: false,
  info: "记录所有广告点触发时玩家所在的位置（X=video id，Y=玩家当前所在的关卡数）",
  alias: "76"
}, i[a.pay_button_coin_Y] = {
  eventKey: "pay",
  eventValue: "pay_button_coin_",
  onlyOne: false,
  info: "记录所有广告点触发时玩家所在的位置（X=video id，Y=玩家当前所在的关卡数）",
  alias: "77"
}, i[a.pay_arrow2_Y] = {
  eventKey: "pay",
  eventValue: "pay_arrow2_",
  onlyOne: false,
  info: "记录所有广告点触发时玩家所在的位置（X=video id，Y=玩家当前所在的关卡数）",
  alias: "78"
}, i[a.pay_horse2_Y] = {
  eventKey: "pay",
  eventValue: "pay_horse2_",
  onlyOne: false,
  info: "记录所有广告点触发时玩家所在的位置（X=video id，Y=玩家当前所在的关卡数）",
  alias: "79"
}, i[a.time_1] = {
  eventKey: "time",
  eventValue: "time_1",
  onlyOne: true,
  info: "在线时长达到1m",
  alias: "80"
}, i[a.time_3] = {
  eventKey: "time",
  eventValue: "time_3",
  onlyOne: true,
  info: "在线时长达到3m",
  alias: "81"
}, i[a.time_5] = {
  eventKey: "time",
  eventValue: "time_5",
  onlyOne: true,
  info: "在线时长达到5m",
  alias: "82"
}, i[a.time_7] = {
  eventKey: "time",
  eventValue: "time_7",
  onlyOne: true,
  info: "在线时长达到7m",
  alias: "83"
}, i[a.time_10] = {
  eventKey: "time",
  eventValue: "time_10",
  onlyOne: true,
  info: "在线时长达到10m",
  alias: "84"
}, i[a.time_15] = {
  eventKey: "time",
  eventValue: "time_15",
  onlyOne: true,
  info: "在线时长达到15m",
  alias: "85"
}, i[a.time_20] = {
  eventKey: "time",
  eventValue: "time_20",
  onlyOne: true,
  info: "在线时长达到20m",
  alias: "86"
}, i[a.time_30] = {
  eventKey: "time",
  eventValue: "time_30",
  onlyOne: true,
  info: "在线时长达到30m",
  alias: "87"
}, i[a.time_1h] = {
  eventKey: "time",
  eventValue: "time_1h",
  onlyOne: true,
  info: "在线时长达到1h",
  alias: "88"
}, i[a.time_3h] = {
  eventKey: "time",
  eventValue: "time_3h",
  onlyOne: true,
  info: "在线时长达到3h",
  alias: "89"
}, i[a.time_5h] = {
  eventKey: "time",
  eventValue: "time_5h",
  onlyOne: true,
  info: "在线时长达到5h",
  alias: "90"
}, i[a.dau_day_X] = {
  eventKey: "time",
  eventValue: "dau_day_",
  onlyOne: true,
  info: "DayX——活跃用户（X=1.2.3.4.5.6.7.8-10.11-15.16-30）",
  alias: "91"
}, i[a.notice_X_Y] = {
  eventKey: "notice",
  eventValue: "notice_",
  onlyOne: false,
  info: "反馈与投诉界面选项统计（X=1~4,1=虚假宣传,2=数据丢失,3=游戏卡死,4=无法看广告,Y=反馈的文字内容）",
  alias: "92"
}, i);