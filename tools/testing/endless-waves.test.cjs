'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { method } = require('./global-ad-fixture.cjs');
const { harness, config, clone } = require('./persistence-harness.cjs');
const Endless = require('../../assets/_script/EndlessWaves');
const SpawnPlan = require('../../assets/_script/AuthoredSpawnPlan');
const RewardRules = require('../../assets/_script/GAD_RewardRules');
const rewardConfig = require('../../assets/gad_configs/GameJsonCfg.json').wallDefenseRewards;
const utils = require('../../assets/_script/Utils').Utils;
const treasures = config.TreasureCfg;

test('each stage requires its own three-star campaign clear', () => {
  const user = { getStageInfo: stage => ({ 1: 7, 2: 3, 3: 1 })[stage] || 0, getMaxStage: () => 9 };
  assert(Endless.unlocked(config.LevelCfg[0], user));
  for (const stage of config.LevelCfg.slice(1)) assert.equal(Endless.unlocked(stage, user), false);
  assert.equal(Endless.unlocked(undefined, user), false);
});

test('Endless plays each authored wave, then increases only the finale’s health and attack multipliers', () => {
  for (const stage of config.LevelCfg) {
    const waves = stage.WaveCfg, finale = waves.at(-1), original = clone(waves);
    waves.forEach((wave, index) => assert.equal(Endless.waveAt(stage, index + 1), wave));
    let previous = finale;
    for (let extra = 1; extra <= 9; extra++) {
      const wave = Endless.waveAt(stage, waves.length + extra);
      assert.equal(wave.Wave, waves.length + extra);
      assert(wave.HealthCoefficient > previous.HealthCoefficient);
      assert(wave.AttackCoefficient > previous.AttackCoefficient);
      const { Wave, HealthCoefficient, AttackCoefficient, ...formation } = wave;
      const { Wave: finalWave, HealthCoefficient: finalHp, AttackCoefficient: finalAttack, ...finalFormation } = finale;
      assert.deepEqual(formation, finalFormation);
      previous = wave;
    }
    const far = Endless.waveAt(stage, Number.MAX_SAFE_INTEGER);
    assert(Number.isFinite(far.HealthCoefficient) && Number.isFinite(far.AttackCoefficient));
    assert.deepEqual(waves, original);
  }
  const legacy = { WaveCfg: [{ HealthCoefficient: 2, AttackCoefficient: 1.5, RefreshSoldierKind: ['1#-1,3;4,2;5,1'] }] };
  assert.deepEqual(SpawnPlan.legacyQueue(Endless.waveAt(legacy, 2).RefreshSoldierKind)[1], [
    { id: -1, num: 3 }, { id: 4, num: 2 }, { id: 5, num: 1 }
  ]);
});

test('the actual battle completes the authored finale once and loads a stronger wave', () => {
  const events = [], levelCfg = config.LevelCfg[0], run = new Endless.Run(1, 'paid', 0, rewardConfig);
  const scope = {
    require: name => ({ EndlessWaves: Endless, AuthoredSpawnPlan: SpawnPlan, RelicRuntime: { active: () => false } })[name],
    BattleSounds: {}, $z1KinghtFallModle: { KinghtFallGameStage: { Fight: 'fight' } },
    $z1KinghtFallConfig: { KinghtFallEventName: { RoundEnd: 'wave-cleared', GameOver: 'campaign-over' } },
    $z1EventMgr: { EventMgr: { getInstance: () => ({ emit: event => events.push(event) }) } },
    $z1KinghtFallEnum: { KinghtFallEnumAchiEnum: {} },
    $z1KinghtFallPlayerMgr: { KinghtFallPlayerMgr: { getInstance: () => ({ getMissionData: () => ({ addAchNum() {} }) }) } }
  };
  const data = { levelCfg, endless: true, round: levelCfg.WaveCfg.length, endlessRun: run, coin: 0,
    ctrPar: { gameStatus: 'fight' }, enemyQueue: {}, enemyList: [], pendingEnemySpawns: 1 };
  data.ctrPar.gameData = data;
  for (let i = 1; i < data.round; i++) run.clear(i);
  for (const name of ['getWaveAt', 'getEnemyWave', 'tryEndGame', 'loadMonster', 'resetEnemyWave', 'getAttAdd']) {
    data[name] = method('KinghtFallGameCtrlData', name, scope);
  }
  data.tryEndGame();
  assert.deepEqual(events, []);
  data.pendingEnemySpawns = 0;
  data.tryEndGame();
  data.tryEndGame();
  assert.deepEqual(events, ['wave-cleared']);
  assert.equal(run.clearedWaves, data.round);
  data.loadMonster();
  assert.equal(data.round, levelCfg.WaveCfg.length + 1);
  assert(data.getAttAdd() > levelCfg.WaveCfg.at(-1).AttackCoefficient);
  assert(data.authoredTimeline.pending());
  data.tryEndGame();
  assert.equal(run.clearedWaves, data.round - 1);
});

function diskFixture(saved) {
  return harness(saved, ({ modules }) => {
    modules.Utils.Utils.renameObjectKeys = utils.renameObjectKeys;
    modules.Utils.Utils.restoreObjectKeys = utils.restoreObjectKeys;
  });
}

test('the survival ledger grants the existing reward rates and saves each stage best through the real profile codec', () => {
  const disk = diskFixture(), player = disk.player;
  player.udata.data.powerNum = 30;
  player.udata.data.wallDefenseBestWave = 22;
  for (const [stage, count] of [[1, 10], [2, 15], [1, 5]]) {
    const admission = player.admitWallDefense(10, () => true);
    const sequence = player.udata.data.wallDefenseReceipt?.sequence || 0;
    const run = new Endless.Run(stage, admission, sequence, rewardConfig);
    for (let i = 1; i <= count; i++) run.clear(i);
    run.clear(count);
    run.clear(count + 2);
    for (let i = 0; i < 120; i++) run.tick(1);
    for (const dt of [0, -1, 8, Infinity]) run.tick(dt);
    run.finish('defeat', player, treasures);
    const result = run.getResult(player);
    assert(result.saved);
    assert.equal(result.baseGold, 1000);
    assert.equal(result.crystals, 1);
    assert.equal(result.clearedWaves, count);
    const relics = result.rewards.slice(2).reduce((sum, row) => sum + row.num, 0);
    assert(relics >= count / 5 && relics <= count);
    assert.equal(player.udata.data.wallDefenseAdmission.used, true);
    assert.equal(player.settleWallDefense(run.result).id, run.id);
  }
  const reload = diskFixture(disk.persist()), profile = reload.player.udata.data;
  assert.equal(Endless.bestWave(profile, 1), 10);
  assert.equal(Endless.bestWave(profile, 2), 15);
  assert.equal(Endless.bestWave(profile, 3), 0);
  assert.equal(profile.wallDefenseBestWave, 22);
  assert.equal(reload.player.udata.getGoldNum(), 3000);
  assert.equal(reload.player.udata.getDiamondNum(), 3);
  assert.equal(reload.player.udata.getPowerNum(), 0);
});

test('Endless odds improve with the stage and the cleared reward wave', () => {
  const stages = config.LevelCfg.slice(0, config.GameTools.campaignStageLimit);
  const odds = (stage, wave) => RewardRules.rarityWeights(rewardConfig, wave, stage);
  const { stageWaveOffsets, points } = rewardConfig.endlessRarity;
  assert(stageWaveOffsets.length >= stages.length);
  const firstWave = rewardConfig.wavesPerItem;
  const finalWave = points.at(-1).wave + firstWave;
  for (const { Level } of stages) {
    for (let wave = firstWave; wave <= finalWave; wave += firstWave) {
      const weights = odds(Level, wave);
      assert.equal(weights.length, 4);
      assert(weights.every(weight => weight >= 0));
      assert(Math.abs(weights.reduce((sum, weight) => sum + weight, 0) - 100) < 1e-9);
      for (const tier of [1, 2, 3]) {
        const atLeast = list => list.slice(tier).reduce((sum, weight) => sum + weight, 0);
        if (wave > firstWave) assert(atLeast(weights) >= atLeast(odds(Level, wave - firstWave)) - 1e-9);
        if (Level > 1) assert(atLeast(weights) >= atLeast(odds(Level - 1, wave)) - 1e-9);
      }
    }
    assert.deepEqual(odds(Level, 10000), points.at(-1).weights);
  }
  assert.deepEqual(odds(1, 35), [85, 15, 0, 0]);
  assert.deepEqual(odds(1, 40), [79, 16, 5, 0]);
  assert.deepEqual(odds(14, 5), [85, 15, 0, 0]);
  assert.deepEqual(odds(14, 10), [79, 16, 5, 0]);
  assert.deepEqual(odds(14, 25), [58, 24, 18, 0]);
  assert.deepEqual(odds(14, 30), [52, 26, 21.75, 0.25]);
});

test('the payout rolls each milestone at its own wave and uses the played stage', () => {
  const payout = (stage, settings = rewardConfig) => RewardRules.createResult({
    endlessStage: stage, id: 'curve-test', sequence: 1, endReason: 'defeat',
    activeMilliseconds: 240000, clearedWaves: 10
  }, settings, treasures, [], () => 0.975);
  const early = payout(1), late = payout(14);
  assert.deepEqual(early.drops.map(drop => [drop.wave, drop.quality]), [[5, 4], [10, 3]]);
  assert.deepEqual(late.drops.map(drop => [drop.wave, drop.quality]), [[5, 3], [10, 2]]);
  assert(RewardRules.validResult(late));
  assert.deepEqual(late.rewards.slice(0, 2), [{ id: 2001, num: 2000 }, { id: 2002, num: 2 }]);
  const { endlessRarity, ...oldSettings } = rewardConfig;
  assert.deepEqual(payout(1, oldSettings).drops, payout(14, oldSettings).drops);
});

test('every cleared non-milestone wave has a 10% chance to add a relic on every stage', () => {
  for (const { Level } of config.LevelCfg.slice(0, config.GameTools.campaignStageLimit)) {
    for (const clearedWaves of [0, 1, 4, 5, 9, 10, 11, 19, 20]) {
      const run = { endlessStage: Level, id: 'bonus-test', sequence: 1, endReason: 'defeat', activeMilliseconds: 0, clearedWaves };
      const count = roll => RewardRules.createResult(run, rewardConfig, treasures, [], () => roll)
        .rewards.slice(2).reduce((sum, row) => sum + row.num, 0);
      assert.equal(count(0.09999), clearedWaves);
      assert.equal(count(0.1), Math.floor(clearedWaves / 5));
    }
  }
});

test('bonus drops halve the next milestone’s blue, epic and legendary chances', () => {
  function quality(stage, wave, rarityRoll) {
    const rolls = [];
    for (let current = 1; current <= wave; current++) {
      if (current % 5) {
        rolls.push(current === wave ? 0 : 0.99);
        if (current < wave) continue;
      }
      rolls.push(current === wave ? rarityRoll : 0, current === wave ? 0.99 : 0);
    }
    const result = RewardRules.createResult({
      endlessStage: stage, id: 'bonus-rarity-test', sequence: 1, endReason: 'defeat', activeMilliseconds: 0, clearedWaves: wave
    }, rewardConfig, treasures, [], () => rolls.shift());
    assert.equal(rolls.length, 0);
    return result.drops.find(drop => drop.wave === wave)?.quality;
  }
  // Stage 1's wave 15 table is 4% blue. Waves 11–14 roll 2% blue.
  for (const wave of [11, 12, 13, 14]) {
    assert.equal(quality(1, wave, 0.9799), 4);
    assert.equal(quality(1, wave, 0.9801), 3);
  }
  assert.equal(quality(1, 15, 0.9601), 3);
  // Stage 14's wave 30 table is 26% blue, 21.75% epic and 0.25% legendary.
  assert.equal(quality(14, 26, 0.7599), 4);
  assert.equal(quality(14, 26, 0.7601), 3);
  assert.equal(quality(14, 29, 0.8899), 3);
  assert.equal(quality(14, 29, 0.8901), 2);
  assert.equal(quality(14, 29, 0.9987), 2);
  assert.equal(quality(14, 29, 0.9988), 1);
  assert.equal(quality(14, 30, 0.9976), 1);
});

test('an interrupted Endless payout recovers the same bonus relics and best wave once', () => {
  const disk = diskFixture(), player = disk.player;
  player.udata.data.powerNum = 10;
  const admission = player.admitWallDefense(10, () => true);
  const rules = disk.load('./GAD_RewardRules'), createResult = rules.createResult;
  rules.createResult = (run, settings, table, inventory) => createResult(run, settings, table, inventory, () => 0);
  const run = new (disk.load('EndlessWaves').Run)(2, admission, 0, rewardConfig);
  for (let i = 0; i < 120; i++) run.tick(1);
  for (let wave = 1; wave <= 4; wave++) run.clear(wave);
  disk.state.failKeys.add(player.rewardJournalKey());
  run.finish('quit', player, treasures);
  assert.equal(run.getResult(player).saved, false);
  const expected = clone(player.udata.data.wallDefensePending);
  const reload = diskFixture(disk.persist());
  assert(reload.player.retryRewardRecovery());
  assert(reload.player.retryRewardRecovery());
  assert.deepEqual(clone(reload.player.udata.data.wallDefenseReceipt.result), expected);
  assert.equal(expected.drops[0].wave, 1);
  assert.equal(reload.player.udata.getTreasureLevel(expected.drops[0].itemID).frame, 3);
  assert.equal(Endless.bestWave(reload.player.udata.data, 2), 4);
  assert.equal(reload.player.udata.getGoldNum(), 1000);
});

test('recovery pays an Endless result that was waiting for an earlier reward journal', () => {
  const disk = diskFixture(), player = disk.player;
  player.udata.data.powerNum = 10;
  const admission = player.admitWallDefense(10, () => true);
  const run = new Endless.Run(2, admission, 0, rewardConfig);
  for (let i = 0; i < 60; i++) run.tick(1);
  run.clear(1);
  disk.state.failKeys.add(player.udata.gameKey);
  assert(player.grantAdRewards([{ id: 2001, num: 25 }]));
  run.finish('quit', player, treasures);
  assert.equal(player.udata.data.wallDefensePending, undefined);
  assert.equal(run.getResult(player).saved, false);
  assert.equal(JSON.parse(disk.Cache.getData(player.endlessPendingKey())).id, run.id);
  const reloaded = diskFixture(disk.persist());
  assert(reloaded.player.restorePendingRewards());
  assert(reloaded.player.retryRewardRecovery());
  assert(reloaded.player.retryRewardRecovery());
  assert.equal(reloaded.player.udata.getGoldNum(), 525);
  assert.equal(Endless.bestWave(reloaded.player.udata.data, 2), 1);
  assert.equal(reloaded.Cache.getData(reloaded.player.endlessPendingKey()), null);
  disk.state.failKeys.clear();
  assert(player.retryRewardRecovery());
  assert(player.retryRewardRecovery());
  assert.equal(run.getResult(player).saved, true);
  assert.equal(Endless.bestWave(player.udata.data, 2), 1);
  assert.equal(player.udata.getGoldNum(), 525);
});

test('stale fallback cleanup also recovers a newer roll whose fallback write failed', () => {
  const disk = diskFixture(), { player } = disk;
  const frozen = (id, sequence, activeMilliseconds) => RewardRules.createResult({
    id, sequence, activeMilliseconds, endlessStage: 1, clearedWaves: sequence, endReason: 'quit'
  }, rewardConfig, treasures, []);
  const older = frozen('already-paid', 1, 60000);
  const newer = frozen('waiting', 2, 120000);
  assert(player.settleEndlessRun(older));
  const key = player.endlessPendingKey();
  assert(disk.Cache.saveData(key, JSON.stringify(older)));
  disk.state.failKeys.add(key);
  disk.state.failKeys.add(player.udata.gameKey);
  assert(player.grantAdRewards([{ id: 2002, num: 1 }]));
  assert.equal(player.settleEndlessRun(newer), false);
  assert.equal(player.udata.data.wallDefensePending, undefined);
  assert.equal(JSON.parse(disk.Cache.getData(key)).id, older.id);
  disk.state.failKeys.clear();
  assert(player.retryRewardRecovery());
  assert(player.retryRewardRecovery());
  assert.equal(player.udata.getGoldNum(), 1500);
  assert.equal(Endless.bestWave(player.udata.data, 1), 2);
  assert.equal(disk.Cache.getData(key), null);
});

test('settlement cleanup leaves a newer roll recorded by a recovery callback', () => {
  const disk = diskFixture(), { player } = disk;
  const freeze = (id, sequence) => RewardRules.createResult({
    id, sequence, activeMilliseconds: 60000, endlessStage: 2, clearedWaves: sequence, endReason: 'quit'
  }, rewardConfig, treasures, []);
  const first = freeze('first', 1), newer = freeze('newer', 2), key = player.endlessPendingKey();
  assert(disk.Cache.saveData(key, JSON.stringify(first)));
  const bus = disk.modules.EventMgr.EventMgr.getInstance(), emit = bus.emit;
  bus.emit = (event, info) => {
    emit(event, info);
    if (event === 'SaveRecovered') {
      bus.emit = emit;
      assert(disk.Cache.saveData(key, JSON.stringify(newer)));
    }
  };
  assert(player.settleEndlessRun(first));
  assert.equal(JSON.parse(disk.Cache.getData(key)).id, newer.id);
  assert(player.retryRewardRecovery());
  assert.equal(player.udata.getGoldNum(), 1000);
  assert.equal(player.udata.data.wallDefenseReceipt.id, newer.id);
  assert.equal(disk.Cache.getData(key), null);
});

test('malformed fallback bytes are preserved and reported as a save failure', () => {
  const disk = diskFixture(), { player } = disk;
  const key = player.endlessPendingKey(), raw = '{incomplete';
  assert(disk.Cache.saveData(key, raw));
  assert.equal(player.retryRewardRecovery(), false);
  assert.equal(disk.Cache.getData(key), raw);
  assert(disk.state.events.some(event => event[0] === 'SaveFailed'));
  assert.equal(player.udata.getGoldNum(), 0);
});

test('a different pending roll is preserved until it can settle', () => {
  const disk = diskFixture(), { player } = disk;
  const freeze = (id, sequence) => RewardRules.createResult({
    id, sequence, activeMilliseconds: 60000, endlessStage: 2, clearedWaves: sequence, endReason: 'quit'
  }, rewardConfig, treasures, []);
  const persisted = freeze('pending', 2), key = player.endlessPendingKey();
  assert(disk.Cache.saveData(key, JSON.stringify(persisted)));
  assert.equal(player.settleEndlessRun(freeze('older', 1)), false);
  assert.equal(JSON.parse(disk.Cache.getData(key)).id, persisted.id);
  assert.equal(player.udata.getGoldNum(), 0);
  assert(player.retryRewardRecovery());
  assert(player.retryRewardRecovery());
  assert.equal(player.udata.getGoldNum(), 500);
  assert.equal(player.udata.data.wallDefenseReceipt.id, persisted.id);
  assert.equal(disk.Cache.getData(key), null);
});

test('a long admission ID from an existing profile still settles and consumes the paid entry', () => {
  const disk = diskFixture();
  const admission = 'a'.repeat(160);
  disk.player.udata.data.wallDefenseAdmission = { id: admission, cost: 10, used: false };
  assert(disk.player.udata.saveData());
  const { player } = diskFixture(disk.persist());
  assert.equal(player.admitWallDefense(10, () => true), admission);
  const run = new Endless.Run(2, admission, 0, rewardConfig);
  run.clear(1);
  run.finish('quit', player, treasures);
  assert(run.getResult(player).saved);
  assert.equal(player.udata.data.wallDefenseReceipt.result.admissionId, admission);
  assert.equal(player.udata.data.wallDefenseAdmission.used, true);
  assert.equal(Endless.bestWave(player.udata.data, 2), 1);
  assert(player.retryRewardRecovery());
});

test('exact reward thresholds agree across frame rates and exclude time below the threshold', () => {
  for (const rate of [30, 60, 120, 144]) {
    for (const shortfall of [0, 0.001]) {
      const run = new Endless.Run(1, 'paid', 0, rewardConfig);
      for (let frame = 1; frame < rate * 120; frame++) run.tick(1 / rate);
      run.tick(1 / rate - shortfall);
      run.finish('quit', {
        getUserData: () => ({ data: { treasureInfo: [] } }),
        settleEndlessRun() {}
      }, treasures);
      assert.equal(run.result.activeMilliseconds, shortfall ? 119999 : 120000);
      assert.equal(run.result.baseGold, shortfall ? 999 : 1000);
      assert.equal(run.result.crystals, shortfall ? 0 : 1);
    }
  }
});

test('direct teardown settles an active run exactly once and still skips a restart', () => {
  for (const restart of [false, true]) {
    const { player } = diskFixture();
    player.udata.data.powerNum = 10;
    const admission = player.admitWallDefense(10, () => true);
    const run = new Endless.Run(3, admission, 0, rewardConfig);
    run.clear(1);
    for (let second = 0; second < 60; second++) run.tick(1);
    const calls = [];
    const scope = {
      GameplayAdOwner: { cancel() {} },
      t: { prototype: { onDestroy() { calls.push('destroy'); } } },
      $z1KinghtFallPlayerMgr: { KinghtFallPlayerMgr: { getInstance: () => player } },
      $z1KinghtFallDataMgr: { KinghtFallDataMgr: { getInstance: () => ({ getTreasureCfg: () => treasures }) } }
    };
    const ui = {
      _restartPending: restart, _endlessRun: run,
      finishEndless: method('KinghtFallUIGame', 'finishEndless', scope),
      cancelBattleDialog() { calls.push('cancel-dialog'); }
    };
    const destroy = method('KinghtFallUIGame', 'onDestroy', scope);
    destroy.call(ui);
    assert.deepEqual(calls, ['cancel-dialog', 'destroy']);
    assert.equal(player.udata.getGoldNum(), restart ? 0 : 500);
    assert.equal(Endless.bestWave(player.udata.data, 3), restart ? 0 : 1);
    assert.equal(player.udata.data.wallDefenseAdmission.used, !restart);
    destroy.call(ui);
    assert.equal(player.udata.getGoldNum(), restart ? 0 : 500);
  }
});

test('very long runs retain all milestone and bonus drops in a bounded receipt', () => {
  const run = { endlessStage: 1, id: 'endless-test', sequence: 1, endReason: 'quit', activeMilliseconds: 0, clearedWaves: 5005 };
  const result = RewardRules.createResult(run, rewardConfig, treasures, [], () => 0);
  assert(RewardRules.validResult(result));
  assert.equal(result.rewards.reduce((sum, row) => sum + row.num, 0), run.clearedWaves);
  assert(result.drops.length <= treasures.length);
});

test('losing or ending an Endless run freezes combat and opens its own result', () => {
  for (const reason of ['defeat', 'quit']) {
    const dialog = { isCurrent: () => true }, effects = [], player = {};
    const scope = {
      BattleSounds: {}, $z1KinghtFallModle: { KinghtFallGameStage: { End: 'end' } },
      $z1KinghtFallConfig: { KinghtFallUIID: { UIEndlessResult: 'endless-result' } },
      $z1KinghtFallPlayerMgr: { KinghtFallPlayerMgr: { getInstance: () => player } }
    };
    const ui = {
      _endlessRun: { getResult: value => value },
      ctrGame: { moveFun() {}, onPauseGame() {} }, ctrUI: { setRevive() {} },
      beginBattleDialog: () => dialog, scheduleOnce: fn => fn(),
      onPauseGame: paused => effects.push(paused), finishEndless: cause => effects.push(cause),
      closeUI: () => effects.push('home'),
      openBattleDialog(owner, id, _, quit, result) {
        assert.equal(owner, dialog);
        assert.equal(id, 'endless-result');
        assert.equal(quit, reason === 'quit');
        assert.equal(result.getResult(), player);
        result.exit();
      }
    };
    assert(method('KinghtFallUIGame', 'onGameOver', scope).call(ui, false, undefined, reason === 'quit' ? 'quit' : undefined));
    assert.equal(ui.ctrGame.gameStatus, 'end');
    assert.equal(dialog.paused, true);
    assert.deepEqual(effects, [true, reason, 'home']);
  }
});

test('Endless advances when there are no perks left to offer', () => {
  const selected = [], callback = rewards => selected.push(Array.from(rewards));
  const panel = { _resourceGeneration: 1, _endless: true, canOutBuff: [], callBack: callback,
    initData() {}, scheduleOnce: fn => fn(), finishDecision: (fn, rewards) => fn(rewards) };
  method('KinghtFallUIBuff', 'start', {}).call(panel);
  assert.deepEqual(selected, [[]]);
});
