var i;
var a;
var o;
var r;
var s;
Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.emGADHitState = exports.emGADGameState = exports.emGADRoleState = exports.emGADRoleType = exports.emGADEventName = exports.GAD_AudioCF = exports.GAD_AudioId = exports.GAD_UICF = exports.GADConfig = exports.emGADBundles = exports.GAD_UIID = undefined;
(function (t) {
  t.UIGame = "GAD_UIGame";
  t.UIResult = "GAD_UIResult";
  t.UIPause = "GAD_UIPause";
  t.UILottery = "GAD_UILottery";
})(o = exports.GAD_UIID || (exports.GAD_UIID = {}));
(function (t) {
  t.prefabs = "gad_prefabs";
  t.audios = "gad_audios";
  t.imgs = "gad_imgs";
  t.configs = "gad_configs";
})(r = exports.emGADBundles || (exports.emGADBundles = {}));
exports.GADConfig = {
  WallWidth: 350,
  EnemyFixedWidth: 188,
  BgMusic: "BraveTowerBG",
  bullet: "bullet",
  BottomHeight: 265
};
exports.GAD_UICF = ((i = {})[o.UIGame] = {
  prefab: "ui/GAD_UIGame",
  name: "GAD_UIGame",
  showTop: true,
  showMult: false,
  zIndex: 1e3,
  bundleName: r.prefabs
}, i[o.UIResult] = {
  prefab: "ui/GAD_UIResult",
  name: "GAD_UIResult",
  showTop: true,
  showMult: false,
  zIndex: 1e3,
  bundleName: r.prefabs
}, i[o.UIPause] = {
  prefab: "ui/GAD_UIPause",
  name: "GAD_UIPause",
  showTop: true,
  showMult: false,
  zIndex: 1e3,
  bundleName: r.prefabs
}, i[o.UILottery] = {
  prefab: "ui/GAD_UILottery",
  name: "GAD_UILottery",
  showTop: true,
  showMult: false,
  zIndex: 1e3,
  bundleName: r.prefabs
}, i);
(function (t) {
  t.bgm = "bgm";
  t.Cards = "GAD_Cards";
  t.fail = "GAD_fail";
  t.attack2 = "GAD_attack2";
  t.victory = "GAD_victory";
  t.strike = "GAD_strike";
  t.reward = "GAD_reward";
  t.open = "GAD_open";
  t.bullet = "GAD_bullet";
  t.enemyHit = "GAD_enemyHit";
  t.buff = "GAD_buff";
  t.mission = "GAD_mission";
})(s = exports.GAD_AudioId || (exports.GAD_AudioId = {}));
exports.GAD_AudioCF = ((a = {})[s.bgm] = {
  path: "bgm",
  bundle: r.audios
}, a[s.Cards] = {
  path: "Cards",
  bundle: r.audios
}, a[s.victory] = {
  path: "victory",
  bundle: r.audios
}, a[s.fail] = {
  path: "fail",
  bundle: r.audios
}, a[s.attack2] = {
  path: "attack2",
  bundle: r.audios
}, a[s.strike] = {
  path: "strike",
  bundle: r.audios
}, a[s.reward] = {
  path: "reward",
  bundle: r.audios
}, a[s.open] = {
  path: "open",
  bundle: r.audios
}, a[s.bullet] = {
  path: "bullet",
  bundle: r.audios
}, a[s.enemyHit] = {
  path: "enemyHit",
  bundle: r.audios
}, a[s.buff] = {
  path: "buff",
  bundle: r.audios
}, a[s.mission] = {
  path: "buff",
  bundle: r.audios
}, a);
(function (t) {
  t.GAD_Player_Die = "gad_player_die";
  t.GAD_Shoot_Bullet = "gad_shoot_bullet";
  t.GAD_Show_Hit_Text = "gad_show_hit_text";
  t.GAD_Show_Warn = "gad_show_warn";
  t.GAD_Bubble_Buf = "gad_add_bubble_buf";
  t.GAD_Show_Hit_Effect = "gad_hit_effect";
  t.GAD_Show_Buff_Tip = "gad_show_buff_tip";
  t.GAD_Setting_Back = "gad_setting_back";
  t.GAD_Show_Wave_Num = "gad_show_wave_num";
  t.GAD_AddBuff = "GAD_AddBuff";
  t.GAD_WebPause = "GAD_WebPause";
  t.GAD_BuffAnimation = "GAD_BuffAnimation";
})(exports.emGADEventName || (exports.emGADEventName = {}));
(function (t) {
  t[t.Player = 1] = "Player";
  t[t.Enemy = 2] = "Enemy";
  t[t.Bullet = 3] = "Bullet";
  t[t.Card = 4] = "Card";
  t[t.Door = 5] = "Door";
  t[t.Prop = 6] = "Prop";
  t[t.Boss = 7] = "Boss";
})(exports.emGADRoleType || (exports.emGADRoleType = {}));
(function (t) {
  t[t.None = 0] = "None";
  t[t.Idle = 1] = "Idle";
  t[t.Move = 2] = "Move";
  t[t.Attack = 3] = "Attack";
  t[t.Die = 4] = "Die";
  t[t.Hited = 5] = "Hited";
})(exports.emGADRoleState || (exports.emGADRoleState = {}));
(function (t) {
  t[t.None = 0] = "None";
  t[t.Game = 1] = "Game";
  t[t.Pause = 2] = "Pause";
  t[t.Over = 3] = "Over";
})(exports.emGADGameState || (exports.emGADGameState = {}));
(function (t) {
  t[t.None = 0] = "None";
  t[t.NoHurt = 1] = "NoHurt";
  t[t.HitHurt = 2] = "HitHurt";
  t[t.HitDie = 3] = "HitDie";
})(exports.emGADHitState || (exports.emGADHitState = {}));