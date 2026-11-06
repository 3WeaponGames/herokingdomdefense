const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const scriptRoot = path.resolve(__dirname, '../../assets/_script');
function harness() {
  function Vec(x = 0, y = 0) { this.x = x; this.y = y; }
  Vec.prototype.clone = function () { return new Vec(this.x, this.y); };
  Vec.prototype.len = function () { return Math.hypot(this.x, this.y); };
  Vec.prototype.normalizeSelf = function () { const len = this.len() || 1; this.x /= len; this.y /= len; return this; };
  Vec.prototype.signAngle = function (other) { return Math.atan2(this.x * other.y - this.y * other.x, this.x * other.x + this.y * other.y); };
  Vec.prototype.rotateSelf = function (angle) { const x = this.x; this.x = x * Math.cos(angle) - this.y * Math.sin(angle); this.y = x * Math.sin(angle) + this.y * Math.cos(angle); return this; };
  Vec.RIGHT = new Vec(1, 0); Vec.ZERO = new Vec();
  Vec.subtract = (out, a, b) => { out.x = a.x - b.x; out.y = a.y - b.y; };
  Vec.add = (out, a, b) => { out.x = a.x + b.x; out.y = a.y + b.y; };
  Vec.multiplyScalar = (out, a, b) => { out.x = a.x * b; out.y = a.y * b; };
  Vec.normalize = (out, a) => { out.x = a.x; out.y = a.y; out.normalizeSelf(); };
  let nextId = 0;
  function node(x = 0, y = 0) {
    return { x, y, uuid: String(++nextId), active: true, activeInHierarchy: true,
      getPosition(out) { if (!out) return new Vec(this.x, this.y); out.x = this.x; out.y = this.y; return out; },
      setPosition(p) { this.x = p.x; this.y = p.y; }, setParent() {}, setSiblingIndex() {},
      getComponents: () => [{}, {}], addComponent: () => ({}),
      getComponent() { return this.component || { setSkin() {} }; }, convertToNodeSpaceAR: p => p };
  }
  function Base() { this.debuffInfo = []; }
  Base.prototype.onDestroy = function () {};
  const state = { pooled: 0, damage: [], effects: 0 };
  const singleton = value => ({ getInstance: () => value });
  const cfg = { ID: 90001, AttackRange: 100, SearchRange: 50, Health: 100, AttackDamage: 10, BuildingCross: true };
  const ui = { ctrGame: null, ctrEffect: { showDamageNum: (...args) => state.damage.push(args), onMonsterAttack: () => state.effects++, onSoldierDead() {} }, ctrUI: { setGuide() {} } };
  const modules = {
    BaseCtrl: { default: Base },
    KinghtFallNavigation: { reset() {} },
    KinghtFallInterface: { KinghtFallInterface: Base, KinghtFallEnemyBuffType: { MoveSpeed: 'slow' } },
    KinghtFallModle: { KinghtFallGameStage: { Prepare: 0 }, KinghtFallSoldierAniEnum: { Move: 'move', Idle: 'idle' }, KinghtFallGameArmy: {} },
    KinghtFallConfig: { KinghtFallPoolName: { Enemy: 'enemy', Soldier: 'soldier' }, KinghtFallBundelName: {}, KinghtFallPrefabName: {} },
    KinghtFallEnum: { KinghtFallEnumBuffCfg: { Buff08: 8, Buff15: 15 }, KinghtFallEnumTaskEnum: { SoldierDefeated: 5 } },
    KinghtFallPlayerMgr: { KinghtFallPlayerMgr: singleton({ getGuideData: () => ({ getGuideTips: () => true }), getMissionData: () => ({ getTaskInfo: () => ({}), addTaskNum() {} }) }) },
    KinghtFallMissionData: { KinghtFallTaskCountName: {} },
    KinghtFallDataMgr: { KinghtFallDataMgr: singleton({ getSoldierCfgById: () => cfg }) },
    PoolMgr: { PoolMgr: singleton({ getNode: () => null, freeNode: (key, target) => { state.pooled++; target.activeInHierarchy = false; } }) },
    KinghtFallUIGame: { default: { instance: ui } }
  };
  const cc = { _decorator: { ccclass: ctor => ctor, property: () => () => {} }, Component: Base, Node: function () {}, Vec2: Vec,
    v2: (x, y) => new Vec(x, y), size: (width, height) => ({ width, height }), winSize: { height: 667 },
    isValid: (object, strict) => !!object && !object.destroyed && !(strict && object.pendingDestroy) };
  function load(name) {
    if (modules[name]) return modules[name];
    const context = { exports: {}, require: id => modules[id] || (fs.existsSync(path.join(scriptRoot, id + '.js')) && /^(GameToolsOverrides$|KinghtFall(Bullet|EnemyBase|SoldierBase|GameCtrl$))/.test(id) ? load(id) : { default: Base }),
      console, cc, sp: { Skeleton: function () {} },
      __extends: (ctor, base) => { Object.setPrototypeOf(ctor.prototype, base.prototype); },
      __decorate: (decorators, target, key) => key === undefined ? target : undefined, __spreadArrays: (...args) => [].concat(...args) };
    vm.runInNewContext(fs.readFileSync(path.join(scriptRoot, name + '.js'), 'utf8'), context, { filename: name + '.js' });
    return modules[name] = context.exports;
  }
  const Game = load('KinghtFallGameCtrl').default;
  const game = new Game(); game.node = node(); ui.ctrGame = game;
  game.ndUI = node(); game.setPath = () => ({ nodeIndex: 0, pathList: [node()] });
  game.gameData = { getHpAdd: () => 1, getAttAdd: () => 1, delEnemy() {}, delSoldier() {}, getGameBuff: () => null };
  game.ctrPlay = { getAttWpos: () => new Vec(), ctrPlayAni: { arrName: 'lv1' }, getAttack: () => 10, crit: 0, critDam: 2 };
  function bullet(kind) {
    const result = new (load('KinghtFallBullet' + kind).default)(); result.node = node(); result.node.component = result;
    result.uuid = result.node.uuid; result.bullet = node(); result.combatContext = game;
    result.ctrPar = { freeBullet: b => { b.node.active = false; } };
    result.spAni = { setAnimation() {} };
    return result;
  }
  function enemy() {
    const result = new (load('KinghtFallEnemyBase').default)(); result.node = node(100, 0);
    Object.assign(result, { hpctrl: { setType() {}, setHp() {} }, spAni: { setAnimation() {} }, rigidBody: {}, onChangeSpeed() {}, delAllBuff() {} });
    result.initData(90001, 0); return result;
  }
  return { state, game, bullet, enemy, node, Vec, load };
}

for (const kind of ['Play', 'Build']) {
  for (const transition of ['death', 'pool', 'reuse', 'inactive', 'destroy', 'pending-destroy', 'restart']) {
    test(`${kind} shot cannot hit after target ${transition}`, () => {
      const h = harness(), enemy = h.enemy(), shot = h.bullet(kind);
      if (kind === 'Play') { h.game.ndPlayArr1.push(shot.node); h.game.onPlayAttack(enemy); }
      else { h.game.ndBuildArr1.push(shot.node); h.game.onShotBuild({ getAttPos: () => new h.Vec(), getAttack: () => 10 }, enemy); }
      const retainedImpact = shot.callAttack;
      if (transition === 'death') enemy.onAttacked(100);
      if (transition === 'pool' || transition === 'reuse') enemy.freeNode();
      if (transition === 'reuse') { enemy.node.activeInHierarchy = true; enemy.initData(90001, 0); }
      if (transition === 'inactive') enemy.node.activeInHierarchy = false;
      if (transition === 'destroy') enemy.node.destroyed = true;
      if (transition === 'pending-destroy') enemy.node.pendingDestroy = true;
      if (transition === 'restart') h.game.cleanMap();
      const hp = enemy.hp, effects = h.state.effects;
      retainedImpact(); shot.onDie();
      assert.equal(enemy.hp, hp); assert.equal(h.state.effects, effects);
    });
  }
  test(`${kind} shot hits a live target exactly once`, () => {
    const h = harness(), enemy = h.enemy(), shot = h.bullet(kind);
    if (kind === 'Play') { h.game.ndPlayArr1.push(shot.node); h.game.onPlayAttack(enemy); }
    else { h.game.ndBuildArr1.push(shot.node); h.game.onShotBuild({ getAttPos: () => new h.Vec(), getAttack: () => 10 }, enemy); }
    const retainedImpact = shot.callAttack;
    shot.onDie(); retainedImpact(); shot.onDie();
    assert.equal(enemy.hp, 90); assert.equal(h.state.effects, 1);
  });
}

for (const kind of ['Base', 'Play', 'Build', 'Soldier', 'Enemy', 'Enemy8']) {
  test(`${kind} projectile stops tracking a recycled target`, () => {
    const h = harness(), enemy = h.enemy(), shot = h.bullet(kind);
    let hits = 0; shot.setTag(new h.Vec(), enemy.node, () => hits++);
    enemy.freeNode(); enemy.node.activeInHierarchy = true; enemy.initData(90001, 0);
    enemy.node.getPosition = () => assert.fail('must not track the replacement enemy');
    shot.onUpdate(0.01); assert.equal(shot.state, 2); assert.equal(hits, 0); assert.equal(shot.callAttack, null);
  });
}

test('reused projectile invalidates its old retained impact callback', () => {
  const h = harness(), enemy = h.enemy(), shot = h.bullet('Play'); let hits = 0;
  shot.setTag(new h.Vec(), enemy.node, () => hits += 10);
  const oldImpact = shot.callAttack;
  shot.cancel(); shot.combatContext = h.game;
  shot.setTag(new h.Vec(), enemy.node, () => hits++);
  oldImpact(); shot.onDie(); assert.equal(hits, 1);
});

test('a missed impact cannot apply later when its target becomes active again', () => {
  const h = harness(), enemy = h.enemy(), shot = h.bullet('Play'); let hits = 0;
  shot.setTag(new h.Vec(), enemy.node, () => hits++);
  const impact = shot.callAttack;
  enemy.node.activeInHierarchy = false; shot.onDie();
  enemy.node.activeInHierarchy = true; impact(); assert.equal(hits, 0);
});

test('a revived allied soldier has a new projectile lifetime', () => {
  const h = harness();
  const Soldier = h.load('KinghtFallSoldierBase').default;
  const ally = new Soldier(); Object.assign(ally, { node: h.node(100), hpMax: 100, doIdel() { this.dead = false; }, isDead() { return this.dead; } });
  ally.node._combatActor = ally; ally.setNew();
  const shot = h.bullet('Enemy'); let hits = 0;
  shot.setTag(new h.Vec(), ally.node, () => hits++);
  ally.dead = true; ally.setNew(); shot.onDie(); assert.equal(hits, 0);
});

test('enemy pooling is idempotent and invalidates the target generation', () => {
  const h = harness(), enemy = h.enemy(), before = enemy.node._combatGeneration;
  enemy.freeNode(); enemy.freeNode();
  assert.equal(h.state.pooled, 1); assert.equal(enemy.node._combatGeneration, before + 1);
  enemy.node.activeInHierarchy = true; enemy.initData(90001, 0);
  assert.equal(enemy.node._combatGeneration, before + 2);
  enemy.freeNode(); assert.equal(h.state.pooled, 2);
});

test('round cleanup cancels every projectile family and retained impacts', () => {
  const h = harness(), enemy = h.enemy(); let hits = 0;
  const shots = ['Play', 'Build', 'Soldier', 'Enemy', 'Enemy8'].map(kind => h.bullet(kind));
  shots.forEach(shot => shot.setTag(new h.Vec(), enemy.node, () => hits++));
  const impacts = shots.map(shot => shot.callAttack);
  h.game.ndPlayArr2 = [shots[0]]; h.game.ndBuildArr2 = [shots[1]];
  h.game.ndSoldArr = [shots[2]]; h.game.ndEnemyArr = [shots[3], shots[4]];
  h.game.cleanMap(); impacts.forEach(hit => hit());
  assert.equal(hits, 0); assert.ok(shots.every(shot => shot.state === 2 && shot.callAttack === null && shot.tagNode === null));
});

for (const actor of ['Enemy', 'Soldier']) {
  test(`delayed ${actor.toLowerCase()} prefab cannot spawn into the next battle`, () => {
    const h = harness(); let complete;
    h.game.loadPrefab = (bundle, prefab, done) => { complete = done; };
    if (actor === 'Enemy') h.game.addEnemy(90001, 0);
    else h.game.addSoldier(90001, () => assert.fail('stale spawn callback'));
    assert.equal(typeof complete, 'function');
    h.game.cleanMap();
    // The harness deliberately has no cc.instantiate: a stale completion must return before it.
    assert.doesNotThrow(() => complete({}));
  });
}
