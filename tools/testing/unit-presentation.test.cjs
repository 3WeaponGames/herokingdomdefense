'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const { environment, Node } = require('../navigation/runtime-harness.cjs');

function deathRenderer() {
    const completions = [];
    return { completions, findAnimation: name => name === 'die',
        setAnimation(track, name, loop) { assert.equal(track, 0); assert.equal(name, 'die'); assert.equal(loop, false); return {}; },
        setTrackCompleteListener(entry, done) { completions.push(done); } };
}

test('allied death finishes visibly before dust, disappearance and the barracks respawn queue', () => {
    const e = environment(), actor = e.actor('KinghtFallSoldierBase'), events = [], renderer = deathRenderer();
    delete actor.isDead;
    actor.spAni = renderer; actor.hp = 10; actor.ndEffect = { removeAllChildren() {} };
    actor.outBuild = { addDie: () => events.push('respawn-queue') };
    e.stubs.KinghtFallUIGame.default.instance.ctrEffect = { onSoldierDead: () => events.push('dust') };
    actor.onAttacked(20);
    assert.equal(actor.isDead(), true); assert.equal(actor.node.active, true);
    assert.equal(actor.rigidBody.active, false); assert.deepEqual(events, []);
    renderer.completions[0]();
    assert.equal(actor.node.active, false); assert.deepEqual(events, ['dust', 'respawn-queue']);
    renderer.completions[0](); assert.equal(events.length, 2);
});

test('enemy death finishes before dust and pooling, while kill credit is recorded once', () => {
    const e = environment(), renderer = deathRenderer(), events = [];
    e.stubs.KinghtFallPlayerMgr = { KinghtFallPlayerMgr: { getInstance: () => ({ getMissionData: () => ({ getTaskInfo: () => ({ type: -1 }), addTaskNum: () => events.push('kill-credit') }) }) } };
    e.stubs.KinghtFallMissionData = { KinghtFallTaskCountName: { Kill: 'kill' } };
    const actor = e.actor('KinghtFallEnemyBase'); delete actor.isDead;
    actor.spAni = renderer; actor.hp = 10; actor.ndEffect = { removeAllChildren() {} };
    actor.freeNode = () => { actor._isPooled = true; events.push('pool'); };
    e.stubs.KinghtFallUIGame.default.instance.ctrEffect = { onSoldierDead: () => events.push('dust') };
    actor.onAttacked(20); assert.deepEqual(events, ['kill-credit']);
    actor.onAttacked(20); assert.equal(renderer.completions.length, 1);
    renderer.completions[0](); assert.deepEqual(events, ['kill-credit', 'dust', 'pool']);
});

test('a death callback cannot remove a reused unit or complete a previous boss form', () => {
    const e = environment(), actor = e.unit(), first = deathRenderer(), second = deathRenderer();
    const play = e.load('KinghtFallInterface').KinghtFallInterface.prototype.playDeath;
    let dead = true, renderer = first, finishes = 0;
    Object.assign(actor, { isDead: () => dead, getSpAni: () => renderer });
    play.call(actor, () => finishes++);
    actor.node._combatGeneration = 2; renderer = second;
    play.call(actor, () => finishes++);
    first.completions[0](); assert.equal(finishes, 0);
    second.completions[0](); assert.equal(finishes, 1);
    second.completions[0](); assert.equal(finishes, 1);
    dead = false;
});

test('a boss killed during transformation reveals its selected form and completes death', () => {
    const e = environment(), actor = e.actor('KinghtFallEnemyItem10'), renderer = deathRenderer();
    renderer.node = new Node('second-form', actor.node); renderer.node.active = false;
    actor.spAni2 = renderer; actor.spIdx = 1; actor.spAniUp = { node: new Node('transform', actor.node) };
    actor._transform = {}; actor.isDead = () => true;
    let finished = 0; actor.playDeath(() => finished++);
    assert.equal(actor._transform, null); assert.equal(actor.spAniUp.node.active, false); assert.equal(renderer.node.active, true);
    assert.equal(finished, 0); renderer.completions[0](); assert.equal(finished, 1);
});

test('a reused boss resets to its first body before the base initializer starts movement', () => {
    const e = environment(), Type = e.load('KinghtFallEnemyItem10').default, actor = e.actor('KinghtFallEnemyItem10');
    const parent = Object.getPrototypeOf(Type.prototype), original = parent.initData, played = [];
    function renderer(index) { return { node: new Node('form-' + index, actor.node), setAnimation: (_track, name) => played.push([index, name]) }; }
    actor.spAni = renderer(0); actor.spAni2 = renderer(1); actor.spAni3 = renderer(2); actor.spAniUp = renderer(3);
    actor.spIdx = 2; actor.bornInfo = { nodeIndex: 0, pathList: [{}] };
    parent.initData = function () { this.time = {}; this.cfg = { Data: [0, 2] }; this.doMove(); };
    try { actor.initData(90010, 1); } finally { parent.initData = original; }
    assert.equal(actor.spIdx, 0); assert.deepEqual(played, [[0, 'move']]);
    assert.equal(actor.spAni.node.active, true); assert.equal(actor.spAni2.node.active, false); assert.equal(actor.spAni3.node.active, false);
});

test('a transformed enemy returns to its original spawn pool', () => {
    const e = environment(), released = [];
    e.stubs.PoolMgr = { PoolMgr: { getInstance: () => ({ freeNode: key => released.push(key) }) } };
    e.stubs.KinghtFallConfig.KinghtFallPoolName = { Enemy: 'Enemy' };
    e.game.gameData.delEnemy = () => {};
    const actor = e.actor('KinghtFallEnemyBase'); actor._poolCfgID = 90010; actor.cfg.ID = 90012;
    actor.freeNode(); assert.deepEqual(released, ['Enemy_90010']);
});

test('hit reactions stop actual navigation without consuming its route and movement resumes afterward', () => {
    const e = environment(), actor = e.unit(), target = { x: 100, y: 0 };
    e.nav.moveTo(actor, e.game, target, 1 / 60);
    const x = actor.node.x, route = actor._navigationState;
    actor._hitReactionPlaying = true; actor.rigidBody.linearVelocity = { x: 50, y: 0 };
    for (let i = 0; i < 20; i++) {
        const result = e.nav.moveTo(actor, e.game, target, 1 / 60);
        assert.equal(result.arrived, false); assert.equal(result.blocked, false);
    }
    assert.equal(actor.node.x, x); assert.equal(actor._navigationState, route); assert.equal(actor.rigidBody.linearVelocity.x, 0);
    actor._hitReactionPlaying = false; e.nav.moveTo(actor, e.game, target, 1 / 60);
    assert(actor.node.x > x);
});

test('health bars follow visible head bounds, double their length at 2x scale and cache unchanged geometry', () => {
    const e = environment(), actor = e.unit(30, 40), visual = new Node('body', actor.node), hpParent = new Node('hp', actor.node, 0, 58);
    const renderer = { node: visual, skeletonData: {} }; actor.spAni = renderer; actor.isDead = () => false;
    let measured = 0;
    const exports = {}, cc = { ...e.cc, Component: function () {}, Label: function () {}, Sprite: function () {} };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../../assets/_script/KinghtFallItemHp.js'), 'utf8'), {
        exports, cc, sp: { Skeleton: function () {} },
        require: name => name === 'KinghtFallDepthView' ? { bounds: () => { measured++; return { minX: -30 * Math.abs(visual.scaleX), maxX: 30 * Math.abs(visual.scaleX), minY: 0, maxY: 100 * visual.scaleY }; } } : {},
        __extends(C, B) { C.prototype = Object.create(B.prototype); }, __decorate: (_d, value, key) => key === undefined ? value : undefined
    });
    const hp = new exports.default(); hp.actor = actor; hp.node = new Node('bar', hpParent); hp.node.width = 48;
    hp.lateUpdate(); const first = hp.node.width * hp.node.scaleX;
    assert.equal(first, 60); assert.equal(hp.node.y + hpParent.y, 110);
    hp.lateUpdate(); hp.lateUpdate(); assert.equal(measured, 1);
    visual.scaleX = visual.scaleY = 2; hp.lateUpdate();
    assert.equal(hp.node.width * hp.node.scaleX, first * 2); assert.equal(hp.node.y + hpParent.y, 220);
    actor.getSpAni = () => ({ node: visual, skeletonData: {} }); hp.lateUpdate(); assert.equal(measured, 3);
});
