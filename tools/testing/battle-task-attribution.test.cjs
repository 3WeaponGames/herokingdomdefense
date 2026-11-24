'use strict';

const test = require('node:test'), assert = require('node:assert/strict');
const { setup, Node } = require('./backend-gameplay-harness.cjs');
const enums = require('../../assets/_script/KinghtFallEnum');

function fixture() {
  const tasks = [];
  const h = setup({
    KinghtFallEnum: enums,
    KinghtFallMissionData: { KinghtFallTaskCountName: { Kill: 'Kill' } },
    AudioMgr: { AudioMgr: { getInstance: () => ({ playEffectFree() {} }) } },
    KinghtFallPlayerMgr: { KinghtFallPlayerMgr: { getInstance: () => ({
      getUserData: () => ({}),
      getMissionData: () => ({ recordQuestEvent() {}, addTaskNum() {} })
    }) } }
  });
  const { g, d, e, noop } = h;
  g.gameStatus = e.stubs.KinghtFallModle.KinghtFallGameStage.Fight;
  g._combatEpoch = 1;
  g.ndUI = g.ndMain;
  d.recordBattleTask = (kind, tag) => tasks.push([kind, tag]);
  function enemy(x = 0, registered = true) {
    const actor = e.actor('KinghtFallEnemyBase', x, 0, g.ndMain);
    actor.node._combatGeneration = 1;
    actor.hp = 10;
    actor.isDead = h.load('KinghtFallEnemyBase').default.prototype.isDead;
    actor.playDeath = noop;
    if (registered) d.addEnemy(actor);
    return actor;
  }
  function building(kind, registered = true) {
    const Base = h.load('KinghtFallBuildBase').default;
    const build = new Base();
    Object.assign(build, {
      ID: kind, node: new Node('building', g.ndMain), index: 1, buildCfg: { enumValue: kind },
      buildInfo: { BuildID: kind, hp: 10, hpMax: 10 },
      ndAniMain: { setAnimation() {} }, cancelUpgrade: noop, _stopColliderTweens: noop, sendEvent: noop
    });
    if (registered) d.bulidPointMap[kind] = build;
    return build;
  }
  return { ...h, enemy, building, tasks };
}

test('lethal live enemy hits credit only the final attacker before death callbacks', () => {
  const f = fixture(), victim = f.enemy();
  const tower = { buildInfo: { BuildID: enums.KinghtFallEnumBuildEnum.ArrowTower } };
  victim.onAttacked(3, f.g.ctrPlay);
  assert.deepEqual(f.tasks, []);
  victim.playDeath = () => assert.deepEqual(f.tasks, [['kill', 'tower']]);
  victim.onAttacked(7, tower);
  victim.onAttacked(100, f.g.ctrPlay);

  f.enemy().onAttacked(10, f.g.ctrPlay, true);
  f.enemy().onAttacked(10, f.e.actor('KinghtFallSoldierBase'));
  f.enemy().onAttacked(10, null, false, { barracksProjectile: true });
  f.enemy().onAttacked(10, { _battleTaskKillSource: 'scarecrow' });
  assert.deepEqual(f.tasks, [
    ['kill', 'tower'], ['kill', 'hero'], ['kill', 'barracks'], ['kill', 'barracks'], ['kill', 'scarecrow']
  ]);
});

test('bomb splash credits each actual victim and skips test actors, detached enemies and the main hall', () => {
  const f = fixture(), center = f.enemy(0), nearby = f.enemy(20), outside = f.enemy(61), preview = f.enemy(10);
  preview._unitTestActor = true;
  const bomb = { _battleTaskKillSource: 'bomb-mill' };
  f.load('TowerCombat').damage(f.g, center, { x: 0, y: 0 }, 20,
    { attackType: 'cannon', splashRadius: 60, splashFalloff: 1 }, null, bomb);
  assert(center.isDead() && nearby.isDead() && !outside.isDead());
  f.enemy(0, false).onAttacked(100, bomb);
  f.enemy().onAttacked(100, { buildInfo: { BuildID: enums.KinghtFallEnumBuildEnum.CastleCenter } });
  assert.deepEqual(f.tasks, [['kill', 'bomb-mill'], ['kill', 'bomb-mill']]);
});

test('only real wall, tower and house destruction invalidates its survival objective', () => {
  const f = fixture(), kinds = enums.KinghtFallEnumBuildEnum;
  const wall = f.building(kinds.Wall), tower = f.building(kinds.ArrowTower), house = f.building(kinds.PrivateHouse);
  wall.onAttacked(4);
  assert.deepEqual(f.tasks, []);
  for (const building of [wall, tower, house]) {
    building.onAttacked(10);
    building.onDead();
    assert.equal(building.isDestroyed, true);
  }
  f.building(kinds.Barracks).onAttacked(10);
  f.building(kinds.Mill).onAttacked(10);
  f.building(kinds.Wall, false).onAttacked(10);
  const preview = f.building(kinds.Wall);
  preview._unitTestBreach = f.noop;
  preview.onAttacked(10);
  assert.deepEqual(f.tasks, [['survive', 'wall'], ['survive', 'tower'], ['survive', 'house']]);
});
