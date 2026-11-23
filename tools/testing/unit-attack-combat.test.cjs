'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { setup, hero, Node } = require('./backend-gameplay-harness.cjs');
const Rules = require('../../assets/_script/UnitAttackRules');

function fixture() {
  const prepared = [], hits = [];
  const h = setup({
    BattleSounds: { attack() {} },
    ProjectileLooks: { prepare(shot, _game, key) {
      prepared.push(key);
      shot._launchProjectileLook = () => {};
    } }
  });
  const { g: game, e: { cc, stubs } } = h;
  stubs.UnitAttackRules = Rules;
  stubs.GameToolsOverrides = h.e.load('GameToolsOverrides');
  const scope = { cc, exports: {}, require: h.load };
  const file = path.join(__dirname, '../../assets/_script/UnitAttackCombat.js');
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), scope, { filename: file });
  stubs.UnitAttackCombat = scope.exports;
  game.gameStatus = stubs.KinghtFallModle.KinghtFallGameStage.Fight;
  game._combatEpoch = 1;
  game.ndMain.setPosition(26, -15);
  game.ndUI = new Node('effects', game.node, -43, 69);
  game.ndUI.scaleX = game.ndUI.scaleY = .8;
  h.ui.ctrEffect = { showDamageNum() {}, onMonsterAttack() {} };
  h.d.getAttackableBuildList = () => [];
  const manager = stubs.KinghtFallDataMgr.KinghtFallDataMgr.getInstance();
  manager.getParamsCfgById = () => '1.25';
  const Bullet = h.load('KinghtFallBulletBuild').default;
  game.buildBullet = { node() {
    const shot = new Bullet();
    shot.node = new Node('pooled projectile');
    shot.node.setSiblingIndex = () => {};
    shot.node.getComponent = () => shot;
    shot.bullet = new Node('arrow', shot.node);
    shot.speed = 550;
    return shot.node;
  } };
  function target(name, x, y = 20) {
    const actor = {
      node: new Node(name, game.ndMain, x, y), hp: 1000, cfg: { ID: 90002 }, navigationTeam: 'enemy',
      isDead() { return this.hp <= 0; },
      onAttacked(amount, source, ranged) {
        this.hp -= amount;
        hits.push({ name, amount, source, ranged });
        return amount;
      }
    };
    actor.node._combatGeneration = 1;
    return actor;
  }
  function attacker(kind, settings, primary, range = 250) {
    const actor = h.e.actor(kind, 0, 0, game.ndMain);
    const enemy = kind.startsWith('KinghtFallEnemy');
    actor.cfg = Rules.runtimeCfg({ ID: 90001, AttackType: kind === 'KinghtFallSoldierItem03' ? 2 : 1, AttackRange: range, UnitAttack: settings });
    actor.node._combatGeneration = 1;
    actor._combatGame = game;
    actor.attackRange = range;
    actor.getAttack = () => 100;
    if (enemy) actor.getUpdateTarget = () => ({ canAtt: true, actor: primary });
    else actor.getAttackTarget = () => primary;
    return actor;
  }
  function step(dt) { game.ndBuildArr2.slice().forEach(shot => shot.onUpdate(dt)); }
  const amounts = () => hits.map(({ name, amount }) => [name, amount]);
  return { ...h, game, manager, target, attacker, step, prepared, hits, amounts };
}

test('unit attack overrides resolve supported combinations without editing base records', () => {
  const original = { AttackType: 3, Data: [.2, 150, 2] };
  assert.equal(Rules.runtimeCfg(original), original);
  const draft = { ...original, UnitAttack: { delivery: 'ranged', pattern: 'chain', chainDamageLoss: 0, future: true } };
  const resolved = Rules.runtimeCfg(draft);
  assert.equal(resolved.AttackType, 2);
  assert.equal(resolved.AttackRange, 250);
  assert.equal(resolved.AttackDamage, 5);
  assert.equal(Rules.settings(draft).chainDamageLoss, 0);
  assert.equal(draft.AttackType, 3);
  assert(!Object.hasOwn(draft, 'AttackRange'));
  assert.equal(Rules.settings({ ...original, UnitAttack: { delivery: 'melee', pattern: 'chain' } }), null);
  assert.deepEqual(Rules.issues({ delivery: 'ranged', pattern: 'volley', shotsPerVolley: 1.5 }).map(issue => issue.field), ['shotsPerVolley']);
});

test('an archer changed to melee uses its attack timing and cannon-style splash falloff', () => {
  const f = fixture(), primary = f.target('primary', 60), middle = f.target('middle', 100), edge = f.target('edge', 140), outside = f.target('outside', 141);
  f.d.enemyList = [primary, middle, middle, edge, outside];
  const owner = f.attacker('KinghtFallSoldierItem03', { delivery: 'melee', pattern: 'splash', splashRadius: 80, splashFalloff: .4 }, primary);
  f.manager.data.GameTools = { timingDefaults: { 'ally:90001:default': { attack: .4 } } };
  owner.doAttackStart();
  assert.equal(owner.time.Attack, -1);
  assert(f.load('GameToolsOverrides').isPending(owner));
  f.load('GameToolsOverrides').tick(.39, true);
  assert.equal(f.hits.length, 0);
  f.load('GameToolsOverrides').tick(.011, true);
  assert.deepEqual(f.amounts(), [['primary', 100], ['middle', 70], ['edge', 40]]);
  assert.equal(owner.time.Attack, 0);
  assert.equal(f.game.ndBuildArr2.length, 0);
});

test('a melee enemy changed to ranged fires a real pooled projectile at the correct speed and preserves released damage on reuse', () => {
  const f = fixture(), hero = f.target('hero', 160);
  f.game.ctrPlay = hero;
  const slow = [];
  hero.addBuff = (_type, buff, kind) => slow.push([buff.subNum, buff.time, kind]);
  const owner = f.attacker('KinghtFallEnemyMelee', {
    delivery: 'ranged', pattern: 'single', onHit: { slow: { percent: .25, duration: 2 }, lifeSteal: { percent: .5 } }
  }, hero);
  owner.hp = 20;
  owner.cfg.Suppressed = hero.cfg.ID;
  f.manager.data.GameTools = { projectileSpeeds: { 'enemy:90001:default': 400 } };
  owner.doAttackStart();
  const shot = f.game.ndBuildArr2[0];
  assert.equal(shot.speed, 400);
  assert.deepEqual(f.prepared, ['enemy:90001']);
  assert.equal(owner.time.Attack, 0);
  f.step(.39);
  assert.equal(f.hits.length, 0);
  owner.node._combatGeneration++;
  owner.cfg = { ID: 90007 };
  f.step(.02);
  assert.deepEqual(f.amounts(), [['hero', 125]]);
  assert.equal(f.hits[0].source, null);
  assert.equal(f.hits[0].ranged, true);
  assert.deepEqual(slow, [[.25, 2, 'moveSlow']]);
  assert.equal(owner.hp, 20, 'the previous occupant’s projectile cannot heal this unit');
  f.step(2);
  assert.equal(f.game.ndBuildArr2.length, 0);
  assert.equal(f.game.ndBuildArr1.length, 1);
  assert.equal(shot._unitAttackFlight, null);
});

test('ranged splash lands at its launch point after the primary dies and scales damage to the edge', () => {
  const f = fixture(), primary = f.target('primary', 100), center = f.target('center', 100), edge = f.target('edge', 160), outside = f.target('outside', 161);
  f.d.enemyList = [primary, center, edge, outside];
  const owner = f.attacker('KinghtFallSoldierBase', { delivery: 'ranged', pattern: 'splash', splashRadius: 60, splashFalloff: .25 }, primary);
  owner.doAttackStart();
  primary.hp = 0;
  primary.node._combatGeneration++;
  f.step(.5);
  assert.deepEqual(f.amounts(), [['center', 100], ['edge', 25]]);
});

test('ranged splash slows each damaged defender at impact and refreshes without stacking', () => {
  const f = fixture(), player = hero(f), troop = f.e.actor('KinghtFallSoldierBase', 130, 20, f.game.ndMain);
  const outside = f.target('outside splash', 161);
  player.node.setParent(f.game.ndMain);
  player.node.setPosition(100, 20);
  player.moveSpeed = 100;
  player.hp = player.hpMax = 500;
  player._regenerationDisabled = true;
  troop.cfg = { ...troop.cfg, Speed: 80 };
  troop.hp = troop.hpMax = 500;
  delete troop.getSpeed;
  outside.addBuff = () => assert.fail('A defender outside splash received a slow');
  f.d.soldierList = [troop, outside];
  f.ui.ctrEffect = null;
  const owner = f.attacker('KinghtFallEnemyMelee', {
    delivery: 'ranged', pattern: 'splash', splashRadius: 60, splashFalloff: .5,
    onHit: { slow: { percent: .4, duration: 1 } }
  }, player);
  owner.doAttackStart();
  assert.equal(player.getSpeed(), 100);
  assert.equal(troop.getSpeed(), 80);
  f.step(.25);
  assert.equal(player.hp, 400);
  assert.equal(troop.hp, 425);
  assert.equal(player.getSpeed(), 60);
  assert.equal(troop.getSpeed(), 48);
  assert.equal(outside.hp, 1000);
  player.onUpdata(.75);
  owner.doAttackStart();
  f.step(.25);
  const type = f.load('KinghtFallInterface').KinghtFallEnemyBuffType.MoveSlow;
  assert.equal(player.getBuffList(type).length, 1);
  player.onUpdata(.75);
  assert.equal(player.getSpeed(), 60);
  player.onUpdata(.25);
  assert.equal(player.getSpeed(), 100);
});

test('melee single and splash can both slow and steal life from damage after mitigation and overkill', () => {
  for (const pattern of ['single', 'splash']) {
    const f = fixture(), primary = f.e.actor('KinghtFallEnemyMelee', 60, 20, f.game.ndMain);
    const lethal = f.target('lethal', 100), blocked = f.target('blocked', 110);
    primary.cfg = { ...primary.cfg, Speed: 80 };
    primary.hp = primary.hpMax = 400;
    delete primary.getSpeed;
    const applyDamage = primary.onAttacked;
    primary.onAttacked = function (amount, source) {
      return applyDamage.call(this, amount * .6, source);
    };
    lethal.hp = 20;
    lethal.addBuff = () => assert.fail('A dead target received a slow');
    blocked.onAttacked = () => 0;
    blocked.addBuff = () => assert.fail('A target that blocked the damage received a slow');
    f.d.enemyList = [primary, lethal, blocked];
    const owner = f.attacker('KinghtFallSoldierBase', {
      delivery: 'melee', pattern, splashRadius: 80, splashFalloff: .5,
      onHit: { slow: { percent: .25, duration: 3 }, lifeSteal: { percent: .5 } }
    }, primary);
    owner.hp = 25;
    owner.doAttackStart();
    assert.equal(primary.hp, 340);
    assert.equal(primary.getSpeed(), 60);
    assert.equal(owner.hp, pattern === 'single' ? 55 : 65);
    assert.equal(lethal.hp <= 0, pattern === 'splash');
    assert.equal(blocked.hp, 1000);
  }
});

test('Cannon Slime releases a shell from its mirrored muzzle and splashes nearby defenders on impact', () => {
  const config = require('../../assets/KinghtFallConfig/GameJsonCfg.json');
  const row = config.SoldierCfg[91152];
  const prefabPath = path.join(__dirname, '../../assets/KinghtFallEnemy', row.prefab + '.prefab');
  const prefab = JSON.parse(fs.readFileSync(prefabPath, 'utf8'));
  const binding = prefab.find(component => component.ctrArr);
  const modelId = prefab[binding.spAni.__id__].node.__id__;
  const muzzleNode = prefab[prefab[binding.ctrArr.__id__].node.__id__];
  assert.equal(muzzleNode._parent.__id__, modelId);
  const [muzzleX, muzzleY] = muzzleNode._trs.array;
  const modelScale = prefab[modelId]._trs.array[8];
  const key = 'enemy:' + row.ID + ':default';
  const timing = config.GameTools.timingDefaults[key].attack;
  for (const facing of [-1, 1]) {
    const f = fixture();
    const radius = row.UnitAttack.splashRadius;
    const primary = f.target('primary', 130 * facing);
    const edge = f.target('edge', (130 + radius) * facing);
    const outside = f.target('outside', (131 + radius) * facing);
    f.game.ctrPlay = primary;
    f.d.soldierList = [edge, edge, outside];
    const owner = f.attacker('KinghtFallEnemyItem03', row.UnitAttack, primary, row.AttackRange);
    owner.cfg = Rules.runtimeCfg(row);
    owner.getAttack = () => row.AttackDamage;
    owner.setLeft = f.load('KinghtFallEnemyBase').default.prototype.setLeft;
    owner.spAni.node = new Node('slime art', owner.node);
    owner.spAni.node.scaleX = owner.spAni.node.scaleY = modelScale;
    owner.ctrArr = { node: new Node('muzzle', owner.spAni.node, muzzleX, muzzleY) };
    owner.ndBulletPat = new Node('shell pool', owner.node);

    const Shot = f.load('KinghtFallBulletEnemy').default;
    const shot = new Shot();
    shot.node = new Node('cannonball');
    shot.node.setSiblingIndex = () => {};
    shot.node.getComponent = () => shot;
    shot.bullet = new Node('shell art', shot.node);
    shot.speed = prefab[binding.ctrArr.__id__].speed;
    owner.getBullet = () => shot.node;
    f.manager.data.GameTools = {
      timingDefaults: { [key]: { attack: timing } },
      visuals: { [key]: config.GameTools.visuals[key] }
    };

    owner.doAttackStart();
    const overrides = f.load('GameToolsOverrides');
    overrides.tick(timing - .01, true);
    assert.equal(f.game.ndEnemyArr.length, 0);
    overrides.tick(.011, true);
    assert.equal(f.game.ndEnemyArr.length, 1);
    assert.equal(f.game.ndEnemyArr[0], shot);
    assert.deepEqual(f.prepared, ['enemy:' + row.ID]);
    const origin = f.game.ndMain.convertToNodeSpaceAR(shot.node.convertToWorldSpaceAR({ x: 0, y: 0 }));
    assert(Math.abs(origin.x - Math.abs(muzzleX) * modelScale * facing) < 1e-6);
    assert(Math.abs(origin.y - muzzleY * modelScale) < 1e-6);
    shot.onUpdate(.01);
    assert.equal(f.hits.length, 0);
    shot.onUpdate(.5);
    assert.deepEqual(f.amounts(), [
      ['primary', row.AttackDamage],
      ['edge', row.AttackDamage * row.UnitAttack.splashFalloff]
    ]);
    assert(f.hits.every(hit => hit.ranged));
    assert.equal(shot._unitAttackFlight, null);
  }
});

test('an authored ranged enemy keeps its native projectile and impact animation', () => {
  const f = fixture(), hero = f.target('hero', 120), animations = [];
  f.game.ctrPlay = hero;
  const owner = f.attacker('KinghtFallEnemyItem08', { delivery: 'ranged', pattern: 'single' }, hero);
  const Shot = f.load('KinghtFallBulletEnemy8').default;
  const shot = new Shot();
  shot.node = new Node('native fireball');
  shot.node.setSiblingIndex = () => {};
  shot.node.getComponent = () => shot;
  shot.node.getComponentInChildren = () => ({ setAnimation(_track, name) { animations.push(name); } });
  shot.bullet = new Node('fireball art', shot.node);
  owner.ctrArr = { node: new Node('muzzle', owner.node, 0, 20) };
  owner.getBullet = () => shot.node;
  owner.doAttackStart();
  assert.equal(f.game.ndEnemyArr[0], shot);
  assert.equal(f.game.ndBuildArr2.length, 0);
  shot.onUpdate(.5);
  assert.deepEqual(f.amounts(), [['hero', 100]]);
  assert.deepEqual(animations, ['hit', 'blast']);
});

test('a volley launches one projectile per available target in range and no duplicates', () => {
  const f = fixture(), primary = f.target('primary', 100), second = f.target('second', 120), third = f.target('third', 160), outside = f.target('outside', 400);
  f.d.enemyList = [outside, primary, second, third, second];
  const owner = f.attacker('KinghtFallSoldierBase', { delivery: 'ranged', pattern: 'volley', shotsPerVolley: 4 }, primary);
  owner.doAttackStart();
  assert.equal(f.game.ndBuildArr2.length, 3);
  f.step(.5);
  assert.deepEqual(f.amounts(), [['primary', 100], ['second', 100], ['third', 100]]);
});

test('piercing uses swept contacts in flight order, with a distinct target cap', () => {
  const f = fixture(), first = f.target('first', 80), second = f.target('second', 150), third = f.target('third', 220), offLine = f.target('off line', 120, 100);
  f.d.enemyList = [third, second, offLine, first, first];
  const owner = f.attacker('KinghtFallSoldierBase', { delivery: 'ranged', pattern: 'piercing', pierceTargets: 2 }, first);
  owner.doAttackStart();
  f.step(.5);
  assert.deepEqual(f.amounts(), [['first', 100], ['second', 100]]);
  assert.equal(f.game.ndBuildArr2[0].state, 1);
});

test('chain hits fly between nearest unhit targets and apply loss to each previous hit', () => {
  const f = fixture(), first = f.target('first', 100), second = f.target('second', 145), third = f.target('third', 190), fourth = f.target('fourth', 240);
  f.d.enemyList = [fourth, third, first, second, first];
  const owner = f.attacker('KinghtFallSoldierBase', { delivery: 'ranged', pattern: 'chain', chainHits: 3, chainRange: 60, chainDamageLoss: .25 }, first);
  owner.doAttackStart();
  f.step(.2);
  assert.deepEqual(f.amounts(), [['first', 100]]);
  assert.equal(f.game.ndBuildArr2[0].state, 0);
  f.step(.05);
  assert.equal(f.hits.length, 1);
  f.step(.25);
  assert.deepEqual(f.amounts(), [['first', 100], ['second', 75], ['third', 56.25]]);
  assert.equal(f.prepared.length, 1);
});

test('queued flight can neither hit recycled targets nor continue in a replacement battle', () => {
  for (const retire of ['target', 'battle']) {
    const f = fixture(), first = f.target('first', 100), second = f.target('second', 140);
    f.d.enemyList = [first, second];
    const owner = f.attacker('KinghtFallSoldierBase', { delivery: 'ranged', pattern: 'chain', chainHits: 2 }, first);
    owner.doAttackStart();
    f.step(.2);
    if (retire === 'target') second.node._combatGeneration++;
    else f.game._combatEpoch++;
    f.step(.5);
    assert.deepEqual(f.amounts(), [['first', 100]]);
    assert.equal(f.game.ndBuildArr2.length, 0);
  }
});
