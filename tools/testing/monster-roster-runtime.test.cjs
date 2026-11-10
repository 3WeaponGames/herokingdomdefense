'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { setup, Node, Vec2 } = require('./backend-gameplay-harness.cjs');
const { environment } = require('../navigation/runtime-harness.cjs');
const root = path.resolve(__dirname, '../..');
const config = require('../../assets/KinghtFallConfig/GameJsonCfg.json');
const monsters = Object.values(config.SoldierCfg).filter(row => row.MonsterSource);
const classFor = { 90001: 'KinghtFallEnemyItem01', 90002: 'KinghtFallEnemyItem02', 90003: 'KinghtFallEnemyItem03', 90006: 'KinghtFallEnemyItem06', 90009: 'KinghtFallEnemyItem09' };

test('every new runtime prefab binds its own imported rig to the intended controller and preserves ranged projectile references', () => {
  assert.equal(monsters.length, 316);
  const sources = new Map([...new Set(monsters.map(unit=>unit.MonsterPack))].flatMap(pack =>
    require('../../assets/resources/unit-library/' + pack + '/catalog.json').units.map(unit => [unit.id, unit])));
  const readPrefab = name => JSON.parse(fs.readFileSync(path.join(root, 'assets/KinghtFallEnemy', name + '.prefab'), 'utf8'));
  for (const row of monsters) {
    const source = sources.get(row.MonsterSource), prefab = readPrefab(row.prefab);
    const controller = prefab.find(component => component.spAni);
    const template = readPrefab(config.SoldierCfg[row.BehaviorTemplate].prefab).find(component => component.spAni);
    assert(source && controller, row.MonsterSource);
    assert.equal(controller.__type__, template.__type__, row.MonsterSource);
    const skeleton = prefab[controller.spAni.__id__];
    assert.equal(skeleton.__type__, 'sp.Skeleton');
    assert.equal(skeleton._N$skeletonData.__uuid__, source.uuid, row.MonsterSource);
    const rig = JSON.parse(fs.readFileSync(path.join(root, source.skeleton), 'utf8'));
    for (const name of ['idle', 'move', 'attack', 'hit', 'die']) assert(rig.animations[name], row.MonsterSource + '/' + name);
    const transform = prefab[skeleton.node.__id__]._trs.array;
    assert(Number.isFinite(transform[7]) && transform[7] !== 0);
    assert(Number.isFinite(transform[8]) && transform[8] !== 0);
    if (row.BehaviorTemplate === 90003) {
      const projectile = prefab[controller.ctrArr.__id__];
      assert(projectile && Number.isFinite(projectile.speed) && projectile.speed > 0, row.MonsterSource);
      assert(prefab[projectile.node.__id__]);
      assert(prefab[controller.ndBulletPat.__id__]);
    }
  }
});

test('independent pack monsters use default role keys while the original transforming boss retains its three forms', () => {
  const source = fs.readFileSync(path.join(root, 'assets/_script/KinghtFallUIGame.js'), 'utf8');
  const start = source.indexOf('function resolveEnemyPictogram(');
  const end = source.indexOf('// Keep the complete enemy indicator', start);
  assert(start >= 0 && end > start);
  const context = {};
  vm.runInNewContext(source.slice(start, end), context);
  const settings = { unitTypes: {}, unitTypeAssignments: {} };
  for (const id of [90001, 90009, 90010, 90011, 90012, 90013, 91001, 91100]) {
    const form = id >= 90010 && id <= 90012 ? id - 90009 : 'default';
    settings.unitTypes[id] = { name: String(id), tint: '#80c0ff' };
    settings.unitTypeAssignments['enemy:' + id + ':' + form] = String(id);
    assert.equal(context.resolveEnemyPictogram(settings, id), settings.unitTypes[id]);
    assert.equal(context.resolveEnemyPictogram(settings, String(id)), settings.unitTypes[id]);
  }
  assert.equal(context.resolveEnemyPictogram(null, 91001), null);
});

test('every imported monster spawns through the shipped enemy factory with its own prefab and pool, including warm reuse', () => {
  assert.equal(monsters.length, 316);
  const pool = new Map(), requests = [], allocations = [];
  const manager = {
    getNode: key => { const values = pool.get(key); return values && values.pop(); },
    getNodeFromPrefab(key, prefab) {
      const node = prefab(); allocations.push({ key, node }); return node;
    },
    freeNode(key, node) { if (!pool.has(key)) pool.set(key, []); pool.get(key).push(node); }
  };
  const h = setup({ PoolMgr: { PoolMgr: { getInstance: () => manager } } });
  const parameters = h.e.stubs.KinghtFallConfig;
  parameters.KinghtFallPoolName.Enemy = 'enemy';
  parameters.KinghtFallBundelName.Enemy = 'units';
  h.e.stubs.KinghtFallDataMgr.KinghtFallDataMgr.getInstance().getSoldierCfgById = id => config.SoldierCfg[id];
  h.g._combatEpoch = 1;
  h.g.loadPrefab = (bundle, prefab, callback) => requests.push({ bundle, prefab, callback });
  function prefab(row) {
    return () => {
      const node = new Node(row.prefab), actor = { node, cfg: row, uuid: row.ID, initData(id, lane) { this.initArgs = [id, lane]; } };
      node.getComponent = () => actor;
      return node;
    };
  }
  for (const row of monsters) h.g.addEnemy(row.ID, row.ID % 3 + 1);
  assert.equal(h.d.pendingEnemySpawns, monsters.length);
  assert.deepEqual(requests.map(request => request.prefab), monsters.map(row => row.prefab));
  assert(requests.every(request => request.bundle === 'units'));
  // Resource completion order must not change the record or lane being spawned.
  for (let i = requests.length - 1; i >= 0; i--) requests[i].callback(prefab(monsters[i]));
  assert.equal(h.d.pendingEnemySpawns, 0);
  assert.equal(h.d.enemyList.length, monsters.length);
  assert.equal(new Set(allocations.map(row => row.key)).size, monsters.length);
  for (const actor of h.d.enemyList) {
    assert.equal(actor.node.parent, h.g.ndMain);
    assert.deepEqual(actor.initArgs, [actor.cfg.ID, actor.cfg.ID % 3 + 1]);
    manager.freeNode('enemy_' + actor.cfg.ID, actor.node);
  }
  h.d.enemyList = [];
  for (const row of monsters) h.g.addEnemy(row.ID, 2);
  assert.equal(requests.length, monsters.length, 'Warm spawns should reuse the individual unit pools');
  assert.equal(allocations.length, monsters.length);
  assert.equal(h.d.enemyList.length, monsters.length);
  assert(h.d.enemyList.every(actor => actor.initArgs[1] === 2));
});

function actorFixture(row) {
  const e = environment();
  e.stubs.KinghtFallDataMgr.KinghtFallDataMgr.getInstance().getSoldierCfgById = () => row;
  Object.assign(e.stubs.KinghtFallModle.KinghtFallSoldierAniEnum, { Attack: 'attack', Idle: 'idle', Move: 'move' });
  e.game.setPath = () => ({ nodeIndex: 0, pathList: [new Node('objective', e.game.ndMain, 150, 0)] });
  const actor = e.actor(classFor[row.BehaviorTemplate], 0, 0);
  actor.uuid = 'source';
  actor.initData(row.ID, 1);
  const effects = [], received = [], projectile = [];
  const target = {
    uuid: 'target', node: new Node('target', e.game.ndMain, 1, 0), isDead: () => false,
    onAttacked(amount) { received.push(amount); return amount; },
    addBuff(type, value) { received.push({ type, value }); },
    addHpPro(amount) { received.push(amount); }
  };
  e.game.ctrPlay = target;
  e.game.gameData.enemies = [actor, target];
  Object.assign(e.stubs.KinghtFallUIGame.default.instance.ctrEffect, {
    showDamageNum() {}, onMonsterAttack() {},
    onMoveTrack(...args) { effects.push(args); }, onBuff(...args) { effects.push(args); }
  });
  e.game.onShotEnemy = () => ({ pos: new Vec2(), ctr: {
    setParent(owner) { assert.equal(owner, actor); },
    setTag(position, node, done) { projectile.push({ position, node, done }); }
  } });
  return { e, actor, target, received, projectile, effects };
}

test('all added monsters initialize their real melee, ranged, buff or healing controller and perform that behavior', () => {
  assert.equal(monsters.length, 316);
  const behaviors = new Set();
  for (const row of monsters) {
    assert(classFor[row.BehaviorTemplate], row.MonsterSource);
    behaviors.add(row.BehaviorTemplate);
    const f = actorFixture(row), actor = f.actor;
    assert.equal(actor.cfg, row);
    assert(Number.isFinite(actor.hp) && actor.hp > 0, row.MonsterSource);
    if (row.BehaviorTemplate !== 90006 && row.BehaviorTemplate !== 90009) {
      const passive=require('../characters/monster-roster-definitions.json').units.find(unit=>unit.id===row.ID).passive;
      assert(Number.isFinite(actor.getAttack()) && (passive?actor.getAttack()===0:actor.getAttack()>0),row.MonsterSource);
    }
    assert.equal(actor.rigidBody.active, !!row.BuildingCross);
    actor.doAttack();
    if (row.BehaviorTemplate === 90003) {
      assert.equal(f.projectile.length, 1, row.MonsterSource);
      assert.equal(f.projectile[0].node, f.target.node);
      assert.equal(f.received.length, 0, 'Ranged damage must wait for projectile impact');
      f.projectile[0].done();
      assert.equal(f.received[0], actor.getAttack());
    } else if (row.BehaviorTemplate === 90006) {
      assert.equal(f.received.length, 1, row.MonsterSource);
      assert.equal(f.received[0].value.addSpeed, row.Data[0]);
      assert.equal(f.received[0].value.time, row.Data[1]);
    } else if (row.BehaviorTemplate === 90009) {
      assert.deepEqual(f.received, [row.Data[0]], row.MonsterSource);
      assert.equal(f.effects.length, 2);
    } else {
      assert.deepEqual(f.received, [actor.getAttack()], row.MonsterSource);
    }
  }
  assert.deepEqual([...behaviors].sort(), [90001, 90002, 90003, 90006, 90009]);
});

test('flying imported monsters retain their obstacle-crossing behavior and reach the next objective', () => {
  const flying = monsters.filter(row => !row.BuildingCross);
  assert(flying.length > 0);
  for (const row of flying) {
    const f = actorFixture(row), actor = f.actor;
    // Completely block the ordinary ground corridor.
    f.e.box(0, 0, 30, 400);
    actor.node.setPosition(-100, 0);
    const movement = f.e.nav.moveTo(actor, f.e.game, { x: 100, y: 0 }, 10);
    assert.equal(movement.arrived, true, row.MonsterSource);
    assert.equal(movement.blocked, false);
    assert.equal(actor.node.x, 100);
    assert.equal(actor.node.y, 0);
    assert.equal(actor._navigationState, null);
  }
});

test('new monster timing, mirror and counter settings use independent default keys without mutating authored settings', () => {
  assert.equal(monsters.length, 316);
  const e = environment(), settings = structuredClone(config.GameTools);
  e.stubs.KinghtFallDataMgr.KinghtFallDataMgr.getInstance().data = { GameTools: settings };
  const tools = e.load('GameToolsOverrides');
  const before = JSON.stringify(settings);
  for (const row of monsters) {
    const key = 'enemy:' + row.ID + ':default', hits = [];
    const actor = { cfg: row, node: new Node(), time: { Attack: -1 }, spAni: { node: new Node() }, isDead: () => false, navigationTeam: 'enemy' };
    const timing = settings.timingDefaults[key];
    assert(timing && timing.attack > 0, key);
    const playback = settings.animationSpeeds && settings.animationSpeeds[key] || 1;
    tools.attack(actor, 'enemy', () => hits.push(row.ID));
    assert.equal(hits.length, 0);
    tools.tick(timing.attack / playback + .001, true);
    assert.deepEqual(hits, [row.ID]);
    const mirror = settings.visuals[key] && settings.visuals[key].mirrorX === true ? -1 : 1;
    assert.equal(tools.facing(actor, 'enemy', false), mirror);
    assert.equal(tools.facing(actor, 'enemy', true), -mirror);
    const role = settings.unitTypeAssignments[key];
    assert(role && settings.unitTypes[role], key);
    assert(tools.counters({ cfg: { CounterType: role } }, actor));
  }
  assert.equal(JSON.stringify(settings), before);
});
