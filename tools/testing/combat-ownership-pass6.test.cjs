'use strict';
const assert = require('node:assert/strict'), test = require('node:test');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const { environment, Node, installIntersection } = require('../navigation/runtime-harness.cjs');
const root = path.resolve(__dirname, '../..');
const units = require('../../assets/KinghtFallConfig/GameJsonCfg.json').SoldierCfg;

function skeleton() {
  return { node: new Node(), defaultAnimation: 'animation', setCompleteListener(fn) { this.complete = fn; },
    setAnimation(_track, name) { return this.entry = { animation: { name } }; },
    setTrackCompleteListener(entry, fn) { assert.equal(entry, this.entry); entry.complete = fn; } };
}
function bossFixture(heroX) {
  const h = environment(); installIntersection(h.cc);
  const boss = h.actor('KinghtFallEnemyItem10', 0, 0);
  for (const key of ['spAni', 'spAni2', 'spAni3', 'spAniUp']) boss[key] = skeleton();
  for (const key of ['getFind', 'getSpeed', 'getAttSpeed', 'setLeft', 'isDead']) delete boss[key];
  boss.spAni2.node.active = boss.spAni3.node.active = false;
  boss.bornInfo = { nodeIndex: 0, pathList: [new Node('route', h.game.ndMain, 180, 0)] };
  h.game.ctrPlay.node.setPosition(heroX, 0);
  h.stubs.KinghtFallDataMgr.KinghtFallDataMgr.getInstance().getSoldierCfgById = id => units[id];
  boss.onLoad(); boss.cfg = units[90010]; boss.upData(90011);
  return { h, boss, state: h.load('KinghtFallEnemyBase').KinghtFallEnemyStatus };
}

for (const heroX of [20, 150]) test('transforming boss holds position and combat until the owned animation completes at range ' + heroX, () => {
  const { boss, state } = bossFixture(heroX);
  let attacks = 0; boss.onFindList = () => attacks++;
  boss.time.Attack = 2; boss.debuffInfo.push({ type: 1, time: 0, timeMax: .1 });
  for (let i = 0; i < 20; i++) boss.onUpdate(1 / 60);
  assert.equal(boss.state, state.Wait); assert.equal(boss.node.x, 0); assert.equal(attacks, 0);
  assert.equal(boss.spAni2.node.active, false); assert.equal(boss.spAniUp.node.active, true);
  assert.equal(boss.debuffInfo.length, 0); assert(boss.time.Attack > 2, 'authored cooldown still elapses');
  const complete = boss.spAniUp.entry.complete; complete(); complete();
  assert.equal(boss.state, state.Move); assert(boss.spAni2.node.active); assert(!boss.spAniUp.node.active);
  boss.onUpdate(.05); assert(heroX === 20 ? attacks === 1 : boss.node.x > 0);
});

test('obsolete or pooled transformation completions cannot reveal or move a different boss stage', () => {
  const { boss, state } = bossFixture(150), obsolete = boss.spAniUp.entry.complete;
  boss.upData(90012); const current = boss.spAniUp.entry.complete;
  obsolete(); assert.equal(boss.spIdx, 2); assert.equal(boss.state, state.Wait); assert(!boss.spAni3.node.active);
  boss._isPooled = true; current(); assert.equal(boss.state, state.Wait); assert(boss.spAniUp.node.active);
  boss._isPooled = false; boss.state = state.Dead; current(); assert.equal(boss.state, state.Dead);
  boss.state = state.Wait; boss.node.destroyed = true; current(); assert.equal(boss.state, state.Wait);
});

const engine = process.env.COCOS_ENGINE_ROOT || 'C:/ProgramData/cocos/editors/Creator/2.4.13/resources/engine';
const poolSource = path.join(engine, 'extensions/ccpool/CCNodePool.js');
const optionalEngine = { skip: !process.env.COCOS_ENGINE_ROOT && !fs.existsSync(poolSource) ? 'Install Creator 2.4.13 for actual NodePool integration' : false };

function healFixture() {
  const h = environment(), cc = h.cc, requests = []; let allocated = 0;
  class Effect {
    constructor() { this.children = []; this.parent = null; this.spine = skeleton(); }
    setParent(parent) { this.removeFromParent(); this.parent = parent; if (parent) parent.children.push(this); }
    removeFromParent() { if (this.parent) this.parent.children.splice(this.parent.children.indexOf(this), 1); this.parent = null; }
    removeAllChildren() { this.children.slice().forEach(child => child.removeFromParent()); }
    getComponentInChildren() { return this.spine; } setPosition() {} destroy() { this.destroyed = true; }
  }
  cc.instantiate = () => { allocated++; return new Effect(); };
  vm.runInNewContext(fs.readFileSync(poolSource, 'utf8'), { cc, CC_DEV: false, module: { exports: {} }, require: () => ({}) });
  const exports = {};
  vm.runInNewContext(fs.readFileSync(path.join(root, 'assets/_script/PoolMgr.js'), 'utf8'), { exports, cc });
  const pool = exports.PoolMgr.getInstance(); h.stubs.PoolMgr = exports;
  h.stubs.KinghtFallConfig.KinghtFallPoolName.Soldier9Buff = 'heal';
  const effectModule = {};
  vm.runInNewContext(fs.readFileSync(path.join(root, 'assets/_script/KinghtFallGameEffect.js'), 'utf8'), {
    exports: effectModule, cc, sp: { Skeleton: function () {} }, require: name => h.stubs[name] || {},
    __extends(C, B) { C.prototype = Object.create(B.prototype); C.prototype.constructor = C; },
    __decorate: (_d, target, key) => key === undefined ? target : undefined });
  const effects = new effectModule.default(); effects.onMoveTrack = () => {};
  effects.loadPrefab = (_bundle, _name, done) => requests.push(done); h.stubs.KinghtFallUIGame.default.instance.ctrEffect = effects;
  const healer = h.actor('KinghtFallEnemyItem09', 0, 0), target = h.actor('KinghtFallEnemyBase', 0, 0);
  healer.uuid = 'healer'; healer.cfg = units[90009]; target.uuid = 'target'; target.hp = 20;
  target.ndEffect = new Effect(); target.hpctrl = { setHp() {}, showAni() {} }; target.node._combatGeneration = 1;
  h.game.gameData.enemies = [healer, target];
  return { healer, target, requests, pool, allocated: () => allocated };
}

test('actual Creator effect pool stays bounded through early deaths and duplicate/stale animation completion', optionalEngine, () => {
  const h = healFixture(); h.healer.doAttack(); h.requests[0]({});
  const allocationAfterWarmup = h.allocated(), pool = h.pool.poolMap.get('heal');
  let stale;
  for (let i = 0; i < 32; i++) {
    if (i) h.healer.doAttack();
    const fx = h.target.ndEffect.children[0], complete = fx.spine.complete;
    if (stale) stale(); assert.equal(h.target.ndEffect.children.length, 1, 'old completion cannot free a reused node');
    if (i % 2) complete(); else h.target.delAllBuff();
    complete(); assert.equal(h.target.ndEffect.children.length, 0); assert.equal(pool._nodes.size(), 11);
    assert.equal(h.target._healingEffects.size, 0); stale = complete;
  }
  assert.equal(h.allocated(), allocationAfterWarmup); assert(h.target.hp > 20);
  h.healer.doAttack(); h.healer.doAttack(); assert.equal(h.target._healingEffects.size, 2);
  h.target.onDestroy(); assert.equal(h.target._healingEffects.size, 0); assert.equal(pool._nodes.size(), 11);
});

test('late shaman heal prefab returns to its pool when the target was recycled or destroyed', optionalEngine, () => {
  for (const change of ['reused', 'pooled', 'destroyed']) {
    const h = healFixture(); h.healer.doAttack(); const healed = h.target.hp;
    if (change === 'reused') h.target.node._combatGeneration++;
    if (change === 'pooled') h.target._isPooled = true;
    if (change === 'destroyed') h.target.node.destroyed = true;
    h.requests[0]({}); assert.equal(h.target.ndEffect.children.length, 0); assert.equal(h.target.hp, healed);
    assert.equal(h.pool.poolMap.get('heal')._nodes.size(), 11);
  }
});
