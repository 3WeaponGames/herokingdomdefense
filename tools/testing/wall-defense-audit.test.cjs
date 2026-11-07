'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const { env, authored } = require('./backend-legacy-harness.cjs');

function battle(realBase = false) {
  const h = env(), config = h.load('GAD_Configs'), types = config.emGADRoleType;
  if (realBase) delete h.stubs.GAD_Base;
  let state = config.emGADGameState.Game, tags = 0;
  Object.assign(h.stubs.GAD_PlayerMgr.default.getInstance(), { getState: () => state, setState: value => { state = value; }, getGroupID: () => ++tags, getTagID: () => ++tags });
  h.stubs.GAD_DataMgr.default.getInstance().getParam = (id, fallback = 0) => authored.basicCfg[id]?.para ?? fallback;
  h.cc.Vec2.ZERO = { x: 0, y: 0 }; h.cc.size = (width, height) => ({ width, height });
  h.cc.rect = (x, y, width, height) => ({ x, y, width, height, intersects(other) { return this.x <= other.x + other.width && this.x + this.width >= other.x && this.y <= other.y + other.height && this.y + this.height >= other.y; } });
  const Game = h.load('GAD_UIGame').default, game = new Game();
  Object.assign(game, { node: {}, _fenceLine: -1000, _cardCtrl: { node: { x: 0, y: -500 }, updateCD() {}, enermyHit() {} },
    buildWave() {}, sendEvent() {} });
  function role(kind = types.Enemy, x = 0) {
    const actor = { node: { x, y: 200 }, isUseful: true, isDie: false, boundsCalls: 0, updatePos() {},
      getRoleType: () => kind, getGroupID: () => 1, getTagID: () => 1, getScaleSize: () => ({ width: 100, height: 50 }),
      getWorldColliderRectWithFixed() { this.boundsCalls++; return h.cc.rect(x, 200, 100, 50); },
      bulletHited: () => config.emGADHitState.HitHurt, getScaleWidth: () => 15, scaleWidth() {} };
    return actor;
  }
  function bullet(x = 0) { return { node: { convertToWorldSpaceAR: () => ({ x, y: 210 }) }, isUseful: true,
    getWorldColldierRect: () => h.cc.rect(x, 210, 5, 5), checkAutoDie: () => false, onDie() {},
    getTagID: () => 2, getGroupID: () => 2, getAtkDamage: () => 14, getHitEffectName: () => 'arrow1_hit', removeFromScreen() { this.removed = true; } }; }
  return { ...h, config, types, Game, game, role, bullet, state: () => state };
}

test('Wall Defense samples each target collision box once per frame', () => {
  const h = battle(); h.game._waveRoles = Array.from({ length: 7 }, (_, i) => h.role(h.types.Enemy, 1000 + i * 100));
  h.game._bullets = Array.from({ length: 20 }, () => h.bullet()); h.game.update(1 / 60);
  assert.equal(h.game._waveRoles.reduce((sum, role) => sum + role.boundsCalls, 0), 7);
});

test('overlapping impacts share artwork while all fifteen projectiles still deal damage', () => {
  const h = battle(), target = h.role(); let hits = 0, effects = 0;
  let frame = 10; h.cc.director = { getTotalFrames: () => frame };
  target.bulletHited = () => { hits++; return h.config.emGADHitState.HitHurt; };
  h.game.sendEvent = name => { if (name === h.config.emGADEventName.GAD_Show_Hit_Effect) effects++; };
  h.game._waveRoles = [target]; h.game._bullets = Array.from({ length: 15 }, () => h.bullet());
  h.game.update(1 / 60); assert.equal(hits, 15); assert.equal(effects, 1); assert.equal(h.game._bullets.length, 0);
  frame++; h.game._bullets = [h.bullet()]; h.game.update(1 / 60);
  assert.equal(hits, 16); assert.equal(effects, 1);
  frame++; h.game._bullets = [h.bullet()]; h.game.update(1 / 60);
  assert.equal(hits, 17); assert.equal(effects, 2);
});

test('simultaneous enemy hits share one audio request while preserving every damage value', () => {
  const h = battle(true), Enemy = h.load('GAD_Enermy').default, enemies = [new Enemy(), new Enemy()];
  let frame = 100, sounds = 0; h.cc.director = { getTotalFrames: () => frame };
  h.stubs.AudioMgr.AudioMgr.getInstance().playEffectFree = () => sounds++;
  enemies.forEach(enemy => { enemy._hp = 1000; enemy.setRoleState(h.config.emGADRoleState.Move); });
  for (let i = 0; i < 15; i++) enemies[i % 2].bulletHited({ getTagID: () => i }, 2);
  assert.equal(sounds, 1); assert.equal(enemies[0]._hp + enemies[1]._hp, 1970);
  frame++; enemies[0].bulletHited({ getTagID: () => 16 }, 3);
  assert.equal(sounds, 2); assert.equal(enemies[0]._hp + enemies[1]._hp, 1967);
});

test('door cooldown absorbs a volley without silently changing its width', () => {
  const h = battle(), door = h.role(h.types.Door), pair = h.role(h.types.Door, 200), changes = [];
  pair.getTagID = () => 3; door.bulletHited = () => h.config.emGADHitState.NoHurt;
  door.scaleWidth = value => changes.push(value); pair.scaleWidth = value => changes.push(value);
  h.game._waveRoles = [door, pair]; h.game._bullets = [h.bullet()]; h.game.update(1 / 60);
  assert.deepEqual(changes, []); assert.equal(h.game._bullets.length, 0);
});

test('a mixed enemy and door group never treats an enemy as the paired gate', () => {
  const h = battle(), door = h.role(h.types.Door), enemy = h.role(h.types.Enemy, 200);
  enemy.getScaleWidth = undefined; enemy.scaleWidth = undefined;
  h.game._waveRoles = [door, enemy]; h.game._bullets = [h.bullet()];
  assert.doesNotThrow(() => h.game.update(1 / 60)); assert.equal(h.game._bullets.length, 0);
});

test('a mandatory card choice stops the rest of the combat frame without losing the next reward', () => {
  const h = battle(), first = h.role(), second = h.role(); let rewards = 0;
  for (const role of [first, second]) role.bulletHited = () => {
    rewards++; role.isDie = true; h.stubs.GAD_PlayerMgr.default.getInstance().setState(h.config.emGADGameState.Pause);
    return h.config.emGADHitState.HitDie;
  };
  h.game._waveRoles = [first, second]; h.game._bullets = [h.bullet(), h.bullet()]; h.game.update(1 / 60);
  assert.equal(rewards, 1); assert.equal(h.game._waveRoles.length, 1); assert.equal(h.game._bullets.length, 1);
});

test('HP subtraction gates retain positive maximum health and a valid bar', () => {
  const h = env(), cards = new (h.load('GAD_Cards').default)();
  cards.maxHp = cards.hp = 20; cards.showHpTips = () => {}; let bar;
  cards.refreshBar = () => { bar = cards.hp / cards.maxHp; };
  cards.addBuff('HPsub', 100);
  assert.equal(cards.hp, 1); assert.equal(cards.maxHp, 1); assert.equal(bar, 1);
});

test('faster attack rate shortens the existing recoil instead of slowing it down', () => {
  const h = battle(), cards = new (h.load('GAD_Cards').default)(), durations = [];
  h.cc.tween = () => { const chain = { to(duration) { durations.push(duration); return chain; }, start() {} }; return chain; };
  h.cc.Tween = { stopAllByTarget() {} }; cards.node = {}; cards.ndRoot = { y: 0, stopAllActions() {} };
  cards.cdParam = 10; cards.playAttack();
  assert(durations.every(Number.isFinite)); assert(durations.reduce((a, b) => a + b, 0) <= .12 / 11 + 1e-9);
});

test('enemy death destroys its authored Spine children rather than leaking detached native nodes', () => {
  const h = env(), enemy = new (h.load('GAD_Enermy').default)(); let destroyed = 0;
  Object.assign(enemy, { setRoleState() {}, lblHP: { node: {} }, ndBubbleRoot: {}, ndCollider: {},
    ske_die: { node: {}, setAnimation() {}, setCompleteListener() {} },
    layer: { removeAllChildren() {}, destroyAllChildren() { destroyed++; } } });
  enemy.onDie(); assert.equal(destroyed, 1);
});

test('a late enemy model load cannot repopulate an already-dead actor', () => {
  const h = env(), enemy = new (h.load('GAD_Enermy').default)(); let done, layers = 0;
  enemy._enermyCfg = { spineEnemy: 'wqyl_bb', size: 1 }; enemy.enemyItem = { node: {} };
  enemy.node = {}; enemy.loadResFromBundle = (_bundle, _path, _type, callback) => { done = callback; };
  enemy.initEnemyLayer = () => layers++; enemy.initEnermy(); enemy.isDie = true; done({});
  assert.equal(layers, 0);
});

test('death before the first component frame cannot revive an enemy or gate', () => {
  const h = battle(true), enemy = new (h.load('GAD_Enermy').default)(), door = new (h.load('GAD_Door').default)();
  enemy.ani = { playMove() { throw Error('Dead actor resumed its animation'); } };
  for (const actor of [enemy, door]) {
    actor.setRoleState(h.config.emGADRoleState.Die); actor.start(); assert.equal(actor.isDie, true);
  }
  let loaded;
  Object.assign(enemy, { node: {}, enemyItem: { node: null }, _enermyCfg: { spineEnemy: 'wqyl_bb', size: 1 },
    loadResFromBundle(_bundle, _path, _type, done) { loaded = done; }, initEnemyLayer() { throw Error('Destroyed model revived'); } });
  enemy.enemyItem.node = {}; enemy.initEnermy(); enemy.enemyItem.node = null;
  enemy.setRoleState(h.config.emGADRoleState.Move); assert.doesNotThrow(() => loaded({}));
});

test('all authored waves, enemies and existing buffs remain byte-for-byte unchanged by runtime fixes', () => {
  assert.equal(authored.levelCfg.length, 100); assert.equal(authored.enemyCfg.length, 9);
  const before = JSON.stringify(authored), h = battle(); h.game._waveRoles = [h.role()]; h.game._bullets = [h.bullet()];
  h.game.update(1 / 60); assert.equal(JSON.stringify(authored), before);
});

function projectile() {
  const h = battle(true);
  const Bullet = h.load('GAD_Bullet').default, bullet = new Bullet(); let animations = 0, stopped = 0;
  h.cc.Tween = { stopAllByTarget() { stopped++; } };
  bullet.skeArrow = { enabled: false, node: { active: true }, setAnimation() { animations++; } };
  bullet.node = { active: true, opacity: 255, removeFromParent() { this.parent = null; }, destroy() { this.destroyed = true; } };
  bullet.init({ resName: 'arrow1', arrowhit: 'arrow1_hit' }, 14);
  return { ...h, bullet, animations: () => animations, stopped: () => stopped };
}

test('pooled arrows fully reset hit history, distance, opacity, damage and tag identity', () => {
  const h = projectile(), bullet = h.bullet, oldTag = bullet.getTagID();
  const root = bullet.node.parent = {};
  bullet._poolGame = h.game; bullet.setGroupID(10); bullet.addColliderTagID(12); bullet.addColliderGroupID(13);
  bullet._flyDis = 999; bullet.node.opacity = 0; bullet.removeFromScreen(); bullet.removeFromScreen();
  assert.equal(h.game._bulletPool.length, 1); assert.equal(bullet.node.active, false);
  assert.equal(bullet.node.parent, root);
  bullet.init({ resName: 'arrow1', arrowhit: 'arrow1_hit' }, 42);
  assert.equal(bullet.getAtkDamage(), 42); assert.equal(bullet._flyDis, 0); assert.equal(bullet.node.opacity, 255);
  assert.equal(bullet.hasColliderTagID(12), false); assert.equal(bullet.hasColliderGroupID(13), false);
  assert.notEqual(bullet.getTagID(), oldTag); assert.equal(bullet.isUseful, true); assert.equal(h.animations(), 0);
  assert.equal(bullet.skeArrow.node.active, false);
  assert(h.stopped() >= 3);
});

test('idle projectile capacity and closed-owner cleanup never limit active shots or leak nodes', () => {
  const h = projectile(), bullet = h.bullet; bullet._poolGame = h.game;
  h.game._bulletPool.length = 256; bullet.removeFromScreen(); assert.equal(bullet.node.destroyed, true);
  const next = projectile(); next.bullet._poolGame = next.game; next.game._bulletPool = null;
  next.bullet.removeFromScreen(); assert.equal(next.bullet.node.destroyed, true);
});

test('closing Wall Defense destroys detached arrows and drops its collision scratch references', () => {
  const h = battle(), node = { destroy() { this.destroyed = true; } }, bullet = { _poolGame: h.game };
  h.game._bulletPool.push(node); h.game._bullets.push(bullet); h.game._collisionBounds.set({}, {});
  h.game._passedDoors.push({}); h.game._doors.push({}); h.game._hitDoorGroups.add(1);
  h.game.onClose(); h.game.onClose();
  assert.equal(node.destroyed, true); assert.equal(bullet._poolGame, null); assert.equal(h.game._bulletPool, null);
  assert.equal(h.game._bullets.length, 0); assert.equal(h.game._collisionBounds.size, 0);
  assert.equal(h.game._doors.length + h.game._passedDoors.length + h.game._hitDoorGroups.size, 0);
});

test('multiple damaging arrows apply all damage but refresh living enemy HP once per frame', () => {
  const h = battle(), enemy = h.role(); let hp = 1000, writes = 0;
  enemy.bulletHited = (_bullet, damage) => { hp -= damage; enemy._hpDirty = true; return h.config.emGADHitState.HitHurt; };
  enemy.updateHp = () => { writes++; enemy._hpDirty = false; };
  h.game._waveRoles = [enemy]; h.game._bullets = Array.from({ length: 10 }, () => h.bullet()); h.game.update(1 / 60);
  assert.equal(hp, 860); assert.equal(writes, 1); assert.equal(enemy.boundsCalls, 1);
});

test('defeat at the fence stops remaining enemy damage and wave construction in the same frame', () => {
  const h = battle(), a = h.role(), b = h.role(); let hits = 0, waves = 0;
  for (const role of [a, b]) { role.node.y = -1100; role.getAtkPower = () => 10; role.onDie = () => { role.isDie = true; }; }
  h.game._cardCtrl.enermyHit = () => { hits++; h.stubs.GAD_PlayerMgr.default.getInstance().setState(h.config.emGADGameState.Over); };
  h.game.buildWave = () => waves++; h.game._waveRoles = [a, b]; h.game.update(1 / 60);
  assert.equal(hits, 1); assert.equal(waves, 0); assert.equal(h.game._waveRoles.length, 1);
});

test('door cooldown and width interpolation remain frozen while a reward or pause is open', () => {
  const h = battle(), door = new (h.load('GAD_Door').default)(); let resizes = 0;
  door._coolTime = 1; door._step = 5; door.updateWidth = () => resizes++;
  h.stubs.GAD_PlayerMgr.default.getInstance().setState(h.config.emGADGameState.Pause); door.update(.02);
  assert.equal(door._coolTime, 1); assert.equal(resizes, 0);
  h.stubs.GAD_PlayerMgr.default.getInstance().setState(h.config.emGADGameState.Game); door.update(.02);
  assert.equal(door._coolTime, .98); assert.equal(resizes, 1);
});

test('opening the pause menu consumes the exit touch and ignores a stale resume callback', () => {
  const h = battle(), view = new (h.load('GAD_UIGameView').default)(), handlers = {};
  h.cc.Node.EventType = { TOUCH_END: 'end' }; h.cc.winSize = { width: 750, height: 1334 };
  const node = name => ({ active: true, width: 100, height: 100, on(event, fn) { handlers[name] = fn; } });
  Object.assign(view, { node: {}, ndWarn: node('warn'), btnPause: node('pause'), btnExit: node('exit'), ndLayer: node('layer'), addEvent() {} });
  let owner, resume, stopped = 0;
  h.stubs.UIMgr.UIMgr.getInstance().openUIWithOwner = (_id, _from, nextOwner, callback) => { owner = nextOwner; resume = callback; };
  h.Game.script = h.game; h.game._resourceGeneration = 3; h.game.resourceOptions = () => ({ isCurrent: () => true });
  view.start(); view.webPause(); handlers.exit({ stopPropagation() { stopped++; } });
  assert.equal(stopped, 1); assert.equal(h.state(), h.config.emGADGameState.Pause); assert.equal(owner.parent, h.game);
  h.game._resourceGeneration++; resume(true); assert.equal(h.state(), h.config.emGADGameState.Pause);
});

test('Space and background touches cannot resume behind an open or loading pause menu', () => {
  const h = battle(), view = new (h.load('GAD_UIGameView').default)(); h.Game.script = h.game;
  Object.assign(view, { ndLayer: { active: true }, btnPause: { active: false } });
  h.stubs.GAD_PlayerMgr.default.getInstance().setState(h.config.emGADGameState.Pause);
  h.game._decisionNode = {}; view.webPause(); assert.equal(h.state(), h.config.emGADGameState.Pause);
  h.game._decisionNode = null; h.game._pendingUIOpens = new Set([{}]); view.webPause(); assert.equal(h.state(), h.config.emGADGameState.Pause);
  h.game._pendingUIOpens.clear(); view.webPause(); assert.equal(h.state(), h.config.emGADGameState.Game);
});

test('delayed hit effects return to the pool that issued them across mode restarts', () => {
  const h = battle(), view = new (h.load('GAD_UIGameView').default)(), returned = [], callbacks = [];
  const skeleton = { setAnimation() {}, findAnimation: () => ({ duration: .3667 }) }, effect = { setPosition() {}, getComponent: () => skeleton };
  view.node = { convertToNodeSpaceAR: point => point }; view.scheduleOnce = (fn, duration) => { assert.equal(duration, .3667); callbacks.push(fn); };
  view._hitPool = { getNode: () => effect, freeNode: node => returned.push(node) };
  h.stubs.PoolMgr = { PoolMgr: { getInstance() { throw Error('Must not look up a replacement pool by global name'); } } };
  view.showHitEffect({ x: 1, y: 2 }); view._hitPool = { freeNode() { throw Error('Wrong game pool'); } };
  callbacks[0](); assert.deepEqual(returned, [effect]);
});

test('a closing lottery cannot resume gameplay or deliver a delayed reward', () => {
  const h = battle(), lottery = new (h.load('GAD_UILottery').default)(), callbacks = [], choice = { uuid: 'choice' };
  Object.assign(lottery, { canTouch: true, nodeLayer: { children: [choice] }, openAnimation() {},
    scheduleOnce: fn => callbacks.push(fn), sendEvent() { throw Error('Stale reward'); }, closeUI() {} });
  h.stubs.GAD_PlayerMgr.default.getInstance().setState(h.config.emGADGameState.Pause);
  lottery.onTouchEnd(choice, { buffType: 'ATKplus' }, 'choice', 1);
  callbacks.shift()(); assert.equal(callbacks.length, 1);
  lottery.isclose = true; callbacks.shift()(); assert.equal(h.state(), h.config.emGADGameState.Pause);
  lottery.selectNum = 1; lottery.onTouchEnd(choice, { buffType: 'ATKplus' }, 'choice', 1);
  assert.equal(lottery.selectNum, 1); assert.equal(callbacks.length, 0);
});

test('Windows health counters select the canvas glyph cache while retaining their authored font', () => {
  const h = battle(true); h.cc.sys = { isNative: true, os: 'Windows', OS_WINDOWS: 'Windows' }; h.cc.Label.CacheMode = { CHAR: 2 };
  h.cc.game = { renderType: 1, RENDER_TYPE_CANVAS: 0 };
  const enemy = new (h.load('GAD_Enermy').default)(), font = {};
  h.stubs.GAD_DataMgr.default.getInstance().getEnemyCfg = () => ({ width: 100, height: 100 });
  Object.assign(enemy, { node: { position: { clone() { return {}; } } }, lblHP: { font }, ndCollider: { setContentSize() {} }, initEnermy() {} });
  enemy.init('1', '1000', null, false);
  assert.equal(enemy.lblHP._forceUseCanvas, true); assert.equal(enemy.lblHP.cacheMode, 2); assert.equal(enemy.lblHP.font, font);
});

test('Canvas fallback keeps its supported counter renderer without enabling CHAR mode', () => {
  const h = battle(true); h.cc.sys = { isNative: false }; h.cc.game = { renderType: 0, RENDER_TYPE_CANVAS: 0 };
  h.cc.Label.CacheMode = { CHAR: 2 }; h.stubs.GAD_DataMgr.default.getInstance().getEnemyCfg = () => ({ width: 100, height: 100 });
  const enemy = new (h.load('GAD_Enermy').default)(), door = new (h.load('GAD_Door').default)();
  Object.assign(enemy, { node: { position: { clone() { return {}; } } }, lblHP: { cacheMode: 0 }, ndCollider: { setContentSize() {} }, initEnermy() {} });
  Object.assign(door, { node: { position: { clone() { return {}; } }, x: 0 }, text: { cacheMode: 0 }, _initBuffCfg() {} });
  enemy.init('1', '1000', null, false); door.init('speedPlus', 1);
  assert.equal(enemy.lblHP.cacheMode, 0); assert.equal(door.text.cacheMode, 0);
});

test('native animation-cache recreation precedes restoring the authored enemy skin', () => {
  const h = battle(), enemy = new (h.load('GAD_Enermy').default)(); let visible = 0;
  h.cc.Component.AnimationCacheMode = { SHARED_CACHE: 1 };
  h.cc.instantiate = () => { let skin; const skeleton = {
    setAnimationCacheMode() { skin = undefined; }, setSkin(value) { skin = value; },
    setAnimation() { assert.equal(skin, 'hong'); visible++; }
  }; return { setPosition() {}, getComponent: () => skeleton }; };
  Object.assign(enemy, { _enermyCfg: { id: 4, itemNum: 4, width: 70, height: 50, size: 1 }, enemyItem: { node: {} },
    node: {}, layer: {}, scheduleOnce() {} });
  enemy.initEnemyLayer(); assert.equal(visible, 4);
});

test('fifteen projectiles reuse existing members, retain one firing group, and fit inside the field', () => {
  const h = battle(), cards = new (h.load('GAD_Cards').default)(), shots = [];
  h.cc.winSize = { width: 750, height: 1334 };
  h.cc.Tween = { stopAllByTarget() {} }; h.cc.tween = () => { const t = { to() { return t; }, start() {} }; return t; };
  h.stubs.GAD_DataMgr.default.getInstance().getAllMembers = () => authored.memberCfg;
  h.stubs.GAD_PlayerMgr.default.getInstance().removeCard = () => {};
  cards._cards = authored.memberCfg.map(cfg => ({ node: { destroy() {} }, getCardCfg: () => cfg, playAttack: (group, _speed, point) => shots.push({ group, point }) }));
  Object.assign(cards, { maxBulletCnt: 15, ndCardRoot: { children: cards._cards.map(card => card.node) }, node: { x: 330, convertToWorldSpaceAR: point => ({ x: point.x + 330, y: point.y }) }, ndRoot: { y: 0 } });
  cards.addMember(20); assert.equal(cards._cards.length, 10); assert.equal(cards._extraProjectiles, 5);
  cards.playAttack(); assert.equal(shots.length, 15); assert.equal(new Set(shots.map(shot => shot.group)).size, 1);
  assert(shots.every(shot => shot.point.x > -375 && shot.point.x < 375));
  cards.subMember(6); assert.equal(cards._extraProjectiles, 0); assert.equal(cards._cards.length, 9);
});

test('a fresh-run projectile gate grows past +2 and equips all fifteen shots through the real buff path', () => {
  const h=battle(true), cards=new (h.load('GAD_Cards').default)(), gate=new (h.load('GAD_Door').default)(), shots=[];
  h.cc.winSize={width:750,height:1334};h.cc.Tween={stopAllByTarget(){}};h.cc.tween=()=>{const t={to(){return t;},start(){}};return t;};
  h.stubs.GAD_DataMgr.default.getInstance().getAllMembers=()=>authored.memberCfg;
  h.stubs.GAD_PlayerMgr.default.getInstance().addCard=()=>{};
  cards.addCardItem=function(cfg){this._cards.push({getCardCfg:()=>cfg,playAttack:()=>shots.push(cfg.id)});};
  Object.assign(cards,{maxBulletCnt:authored.basicCfg[18].para,ndRoot:{y:0},node:{x:0,convertToWorldSpaceAR:p=>p}});cards.showPropTips=()=>{};cards.addMember(1);
  Object.assign(gate,{node:{active:true},_bufType:'memberPlus',_value:1,_hitEffectValue:1,_initBuffCfg(value){this._value=value;}});gate.setRoleState(h.config.emGADRoleState.Move);
  for(let group=1;group<=30;group++){gate._coolTime=-1;gate.bulletHited({getGroupID:()=>group,getTagID:()=>group});}
  assert.equal(gate.getValue(),15);cards.addBuff(gate.getBufType(),gate.getValue());cards.playAttack();
  assert.equal(cards._cards.length,10);assert.equal(cards._extraProjectiles,5);assert.equal(shots.length,15);
});

test('chest swaps run at half speed with a readable 0.20 second minimum', () => {
  const h=battle(), lottery=new (h.load('GAD_UILottery').default)(), durations=[];
  const point=x=>({x,clone(){return point(this.x);}});
  lottery.nodeLayer={children:[{position:point(0)},{position:point(1)},{position:point(2)}]};lottery.shuffleArray=a=>a;
  h.cc.tween=()=>{const t={to(duration){durations.push(duration);return t;},call(){return t;},start(){}};return t;};
  for(const [remaining,expected]of [[20,.4],[15,.3],[10,.2],[5,.2],[1,.2]]){lottery.changeNum=remaining;lottery.swapCards();assert.equal(durations.pop(),expected);assert.equal(durations.pop(),expected);}
});

test('chest swap endpoints are snapshots, so moving one chest cannot drag the other endpoint',()=>{
  const h=battle(),lottery=new (h.load('GAD_UILottery').default)();
  const point=x=>({x,y:0,clone(){return point(this.x);}}),nodes=[{position:point(-200)},{position:point(0)},{position:point(200)}];
  lottery.nodeLayer={children:nodes};lottery.shuffleArray=a=>a;lottery.changeNum=1;
  h.cc.tween=node=>{let end;const chain={to(_duration,props){end=props.position;return chain;},call(){return chain;},start(){node.position.x=end.x;}};return chain;};
  lottery.swapCards();assert.deepEqual(nodes.map(n=>n.position.x),[0,-200,200]);
});

test('chest swaps wait for both native targets before capturing the next pair of endpoints',()=>{
  for(const order of [[0,1],[1,0]]){
    const h=battle(),lottery=new (h.load('GAD_UILottery').default)(),pending=[];
    const point=x=>({x,y:0,clone(){return point(this.x);}}),nodes=[{position:point(-200)},{position:point(0)},{position:point(200)}];
    lottery.nodeLayer={children:nodes};lottery.shuffleArray=a=>a;lottery.changeNum=20;
    h.cc.tween=node=>{let end,done;const chain={to(_duration,props){end=props.position;return chain;},call(callback){done=callback;return chain;},start(){pending.push(()=>{node.position.x=end.x;done();});}};return chain;};
    lottery.scheduleOnce=callback=>callback();lottery.swapCards();
    for(let remaining=20;remaining>0;remaining--){
      assert.equal(pending.length,2);const pair=pending.splice(0);
      pair[order[0]]();assert.equal(lottery.changeNum,remaining);assert.equal(pending.length,0);
      pair[order[1]]();assert.equal(lottery.changeNum,remaining-1);
      assert.deepEqual(nodes.map(n=>n.position.x).sort((a,b)=>a-b),[-200,0,200]);
    }
    assert.equal(pending.length,0);assert.equal(lottery.canTouch,true);
  }
});

test('chests retain their tracked final positions when selection becomes available',()=>{
  const h=battle(),lottery=new (h.load('GAD_UILottery').default)();
  const positions=[{x:200,y:20},{x:-200,y:20},{x:0,y:20}];lottery.nodeLayer={children:positions.map(position=>({position}))};
  h.cc.tween=()=>{throw Error('Final reveal must not re-deal tracked chests');};
  lottery.standPos();assert.equal(lottery.canTouch,true);assert.deepEqual(lottery.nodeLayer.children.map(node=>node.position),positions);
  lottery.isclose=true;lottery.standPos();assert.equal(lottery.canTouch,false);
});

test('flat projectile artwork retains its original narrow collision bounds', () => {
  const h = battle(true), Bullet = h.load('GAD_Bullet').default, bullet = new Bullet();
  bullet.colliderSize = h.cc.size(8.3, 77.2);
  bullet.node = { width: 35, height: 119, scaleX: 2, scaleY: .5, position: { x: 100, y: 200 },
    getAnchorPoint: () => ({ x: .5, y: .5 }), parent: { convertToWorldSpaceAR: point => point } };
  const rect = bullet.getWorldColldierRect();
  assert(Math.abs(rect.width - 16.6) < 1e-9); assert(Math.abs(rect.height - 38.6) < 1e-9);
  assert.equal(rect.x, 100 - rect.width / 2); assert.equal(rect.y, 200 - rect.height / 2);
  bullet.colliderSize = null;
  assert.equal(bullet.getWorldColldierRect().width, 70);
  Object.assign(bullet.node, { x: 100, y: 200, z: 0, anchorX: .5, anchorY: .5 });
  bullet.colliderSize = h.cc.size(8.3, 77.2);
  const matrix = { m: new Float32Array([0, 2, 0, 0, -3, 0, 0, 0, 0, 0, 1, 0, 40, 50, 0, 1]) };
  bullet.node.parent.convertToWorldSpaceAR = point => ({ x: 40 - 3 * point.y, y: 50 + 2 * point.x });
  const expected = bullet.getWorldColldierRect(2, 4);
  bullet._poolGame = { _bulletWorldMatrix: matrix };
  const cached = bullet.getWorldColldierRect(2, 4);
  for (const key of ['x', 'y', 'width', 'height']) assert(Math.abs(cached[key] - expected[key]) < 1e-9, key);
});

test('compact health labels retain exact enemy health and use numeric state for legacy health rolls',()=>{
  const h=battle(true),enemy=new (h.load('GAD_Enermy').default)();
  enemy.lblHP={};enemy._hp=32000000;enemy.updateHp();assert.equal(enemy.lblHP.string,'32mil');assert.equal(enemy.getHp(),32000000);
  enemy._hp=20000;enemy._displayHp=20002;enemy._isRolling=true;enemy.unschedule=()=>{};
  enemy.scheduleLabelRoll();assert.equal(enemy._displayHp,20001);assert.equal(enemy.lblHP.string,'20k');
  enemy.scheduleLabelRoll();assert.equal(enemy.getHp(),20000);assert.equal(enemy._displayHp,20000);assert.equal(enemy._isRolling,false);
});
