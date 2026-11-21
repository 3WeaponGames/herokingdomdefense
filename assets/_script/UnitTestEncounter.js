"use strict";

var Targeting = require("EnemyTargeting");
var GameToolsOverrides = require("GameToolsOverrides");
var MAX_COUNT = 100;
var PACKS = {
  monster1: "Monster Pack 1", monster2: "Monster Pack 2", monster3: "Monster Pack 3",
  "fantasy-monsters": "Fantasy Monsters", "fantasy-bosses": "Fantasy Bosses", "knight-fall": "Knight Fall"
};

function canOpen(ui) {
  var game = ui && ui.ctrGame;
  return !!(game && game.gameData && game.ndMain && game.ndPath && ui.ctrUI && ui.canBreak &&
    !ui.isclose && !ui.isPauset && !ui._isEntryLoading && !ui._enemyGuide && !ui._battleDialog &&
    game.gameStatus === require("KinghtFallModle").KinghtFallGameStage.Prepare);
}

function spawnPoints(game) {
  var holder = game.ndPath.getChildByName("Authored routes");
  var authored = holder && holder.getComponent("AuthoredStagePaths");
  return game.ndPath.children.reduce(function (spawns, node) {
    var match = /^ndEnemy(0|[1-9]\d*)$/.exec(node.name);
    if (!match) return spawns;
    var id = Number(match[1]), spec = authored && authored.spawnSpec(id);
    if (!spec || spec.enabled !== false) spawns.push({ id: id, name: spec && spec.name || "Spawn " + id });
    return spawns;
  }, []).sort(function (a, b) { return a.id - b.id; });
}

function catalog(manager, stage, translate) {
  var data = manager.data, units = data.SoldierCfg || {}, tools = data.GameTools || {};
  var profiles = tools.unitProfiles || {}, families = new Map(), byUnit = new Map(), models = new Map();
  Object.keys(profiles.families || {}).forEach(function (key) {
    var family = profiles.families[key];
    Object.keys(family.profiles || {}).forEach(function (role) {
      families.set(Number(family.profiles[role]), { key: key, name: family.name, role: role });
    });
  });
  function add(id, unit, custom) {
    if (!unit || !unit.prefab) return;
    var base = custom ? byUnit.get(custom.baseId) : null, family = families.get(id);
    var key = family ? "family:" + family.key : "model:" + (unit.MonsterSource || unit.prefab);
    var model = base && base.model || models.get(key);
    if (!model) {
      var pack = unit.MonsterPack || "knight-fall";
      model = {
        name: translate(family && family.name || unit.Name) || "Unit " + id,
        icon: unit.loadIcon, pack: PACKS[pack] || pack, profiles: []
      };
      models.set(key, model);
    }
    var entry = profiles.entries && profiles.entries[id];
    var form = id >= 90010 && id <= 90012 ? id - 90009 : "default";
    var role = family && family.role || unit.FightingType ||
      tools.unitTypeAssignments && tools.unitTypeAssignments["enemy:" + id + ":" + form];
    var type = tools.unitTypes && tools.unitTypes[role];
    var rule = Targeting.settings(unit);
    var support = unit.AttackType === 3 && !(unit.UnitAttack && require("UnitAttackRules").active(unit));
    var targetingName = support ? "Support" : rule ? Targeting.modes.find(function (mode) { return mode.value === rule.mode; }).label : "Nearest target";
    var profile = {
      id: id, preferred: !custom && role === "fighter", model: model,
      name: custom ? "Custom · " + custom.name : translate(type && type.name || entry && entry.name) || "Default",
      movement: unit.BuildingCross ? "Ground" : "Flight",
      targeting: targetingName
    };
    profile.searchText = [model.name, model.pack, id, profile.name, profile.movement, profile.targeting].join(" ").toLowerCase();
    model.profiles.push(profile);
    byUnit.set(id, profile);
  }
  Object.keys(units).forEach(function (key) {
    if (!profiles.aliases || !profiles.aliases[key]) add(Number(key), units[key]);
  });
  Object.keys(stage.EnemyProfiles || {}).forEach(function (key) {
    add(Number(key), manager.getSoldierCfgById(Number(key)), stage.EnemyProfiles[key]);
  });
  var nameCounts = new Map();
  models.forEach(function (model) { nameCounts.set(model.name, (nameCounts.get(model.name) || 0) + 1); });
  return Array.from(models.values()).sort(function (a, b) { return a.name.localeCompare(b.name); }).map(function (model) {
    model.profiles.sort(function (a, b) { return Number(b.preferred) - Number(a.preferred) || a.name.localeCompare(b.name) || a.id - b.id; });
    model.displayPack = nameCounts.get(model.name) > 1;
    return model;
  });
}

function validate(game, units, count, spawn, interval) {
  if (!units.length || units.some(function (unit) { return !unit || !unit.prefab; })) throw Error("Choose a unit model.");
  if (!Number.isSafeInteger(count) || count < 1 || count > MAX_COUNT) throw Error("Count must be 1–" + MAX_COUNT + ".");
  if (count * units.length > MAX_COUNT) throw Error("Send up to " + MAX_COUNT + " units total. Reduce the count or select fewer profiles.");
  if (!spawnPoints(game).some(function (point) { return point.id === spawn; })) throw Error("Choose a spawn point on this stage.");
  if (!Number.isFinite(interval) || interval < .1 || interval > 10) throw Error("Spacing must be 0.1–10 seconds.");
}

function Encounter(game, units, spawn, count, interval, follow, breakWalls) {
  this.game = game;
  this.data = game.gameData;
  this.epoch = game._combatEpoch;
  this.units = units;
  this.prefabs = Array.from(new Set(units.map(function (unit) { return unit.prefab; })));
  this.prefabs.forEach(function (prefab) { prefab.addRef(); });
  this.spawn = spawn;
  this.count = this.remaining = count * units.length;
  this.interval = this.cooldown = interval;
  this.follow = follow;
  this.breakWalls = breakWalls === true;
  this.wallHits = new Map();
  this.walls = new Map();
  this.wallDamageVisible = true;
  this.actors = [];
  this.error = "";
}

Encounter.prototype.current = function () {
  return this.game._unitTest === this && cc.isValid(this.game, true) &&
    this.game.gameData === this.data && this.game._combatEpoch === this.epoch &&
    this.game.gameStatus === require("KinghtFallModle").KinghtFallGameStage.Prepare;
};

Encounter.prototype.spawnOne = function () {
  var unit = this.units[(this.count - this.remaining) % this.units.length];
  var preview = { prefab: unit.prefab, current: this.current.bind(this), overrides: unit.overrides };
  var actor = this.game.addEnemy(unit.profile.id, this.spawn, null, preview);
  if (!actor) throw Error("Could not place " + unit.profile.model.name + " at this spawn.");
  this.actors.push(actor);
  this.remaining--;
};

function sameWall(wall, record) {
  return cc.isValid(wall, true) && !wall._isPooled && wall.buildInfo === record.info &&
    wall.node === record.node && cc.isValid(record.node, true) && record.node.activeInHierarchy !== false &&
    record.node._combatGeneration === record.generation;
}

Encounter.prototype.attackWall = function (actor, target) {
  var wall = target && target.canAtt && target.building;
  if (!wall || !wall.openUnitTestBreach || !actor.cfg.BuildingCross || !this.current() || this.actors.indexOf(actor) < 0) return false;
  var info = wall.buildInfo, node = wall.node;
  if (!info || !(info.hp > 0) || !wall.getIsWork()) return false;
  var encounter = this, life = { info: info, node: node, generation: node._combatGeneration };
  // The test owns its release queue so planning frames never tick live hits.
  GameToolsOverrides.attack(actor, "enemy", function () {
    if (!encounter.current() || !sameWall(wall, life) || !wall.getIsWork()) return;
    var selected = actor.getUpdateTarget();
    if (!selected || !selected.canAtt || selected.building !== wall) return;
    var damage = actor.getAttack();
    if (!Number.isFinite(damage) || damage <= 0) return;
    var record = encounter.walls.get(wall);
    if (!record || !sameWall(wall, record)) {
      record = life;
      record.hp = info.hp;
      encounter.walls.set(wall, record);
    }
    record.hp = Math.max(0, record.hp - damage);
    encounter.showWallDamage(wall, record, true);
  }, this.wallHits);
  return true;
};

Encounter.prototype.showWallDamage = function (wall, record, visible) {
  if (!visible && record.restore) {
    record.restore();
    record.restore = null;
  }
  if (!sameWall(wall, record)) return;
  if (visible && record.hp === 0 && wall.getIsWork()) record.restore = wall.openUnitTestBreach(this.game);
  var bar = wall.ctrHp;
  if (cc.isValid(bar, true) && cc.isValid(bar.node, true)) {
    if (visible) bar.setHp(record.hp, record.info.hpMax);
    else wall.upHpView();
  }
};

Encounter.prototype.setWallDamageVisible = function (visible) {
  if (visible === this.wallDamageVisible) return;
  this.wallDamageVisible = visible;
  this.walls.forEach(function (record, wall) { this.showWallDamage(wall, record, visible); }, this);
};

Encounter.prototype.update = function (dt) {
  if (!this.current()) { this.dispose(); return; }
  if (this.wallHits.size) {
    GameToolsOverrides.tickAttacks(dt, this.wallHits);
    if (!this.current()) { this.dispose(); return; }
  }
  this.cooldown -= dt;
  while (this.remaining && this.cooldown <= 0) {
    try { this.spawnOne(); }
    catch (error) {
      this.error = error.message;
      this.remaining = 0;
      cc.warn(error);
    }
    this.cooldown += this.interval;
  }
  var enemy = require("KinghtFallEnemyBase");
  this.actors.forEach(function (actor) {
    if (!cc.isValid(actor, true) || !cc.isValid(actor.node, true)) return;
    // An explicit F7 target uses normal pursuit even for a support unit.
    if (actor.cfg.AttackType === 3 && !actor._unitTestTargeting) actor.onUpdate(dt);
    else {
      enemy.default.prototype.onUpdate.call(actor, dt);
      var route = actor.bornInfo;
      if (!Targeting.settings(actor.cfg) && !actor._unitTestRouteAttack && actor.state === enemy.KinghtFallEnemyStatus.Wait &&
          route && route.nodeIndex >= route.pathList.length && actor.time.Attack >= 1) {
        // An unconfigured model still gets a sample attack at an empty objective.
        actor._unitTestRouteAttack = true;
        actor.doAttackStart();
      }
    }
  });
};

Encounter.prototype.cameraTarget = function () {
  var actor = this.actors[0];
  return this.follow && actor && cc.isValid(actor.node, true) ? actor.node : null;
};

Encounter.prototype.playAttack = function () {
  this.actors.forEach(function (actor) {
    if (cc.isValid(actor, true) && cc.isValid(actor.node, true)) actor.doAttackStart();
  });
};

Encounter.prototype.setPause = function (paused) {
  this.actors.forEach(function (actor) {
    if (cc.isValid(actor, true) && cc.isValid(actor.node, true)) actor.setPause(paused);
  });
};

Encounter.prototype.dispose = function () {
  if (this.game._unitTest === this) this.game._unitTest = null;
  this.wallHits.clear();
  this.setWallDamageVisible(false);
  this.walls.clear();
  var navigation = require("KinghtFallNavigation");
  this.actors.splice(0).forEach(function (actor) {
    if (!cc.isValid(actor, true) || !cc.isValid(actor.node, true)) return;
    navigation.reset(actor);
    actor.node.active = false;
    actor.node.destroy();
  });
  this.prefabs.splice(0).forEach(function (prefab) { prefab.decRef(); });
};

function send(game, units, spawn, count, interval, follow, breakWalls) {
  var previous = game._unitTest;
  var test = game._unitTest = new Encounter(game, units, spawn, count, interval, follow, breakWalls);
  try {
    if (previous) previous.setWallDamageVisible(false);
    test.spawnOne();
  }
  catch (error) {
    if (test.current()) {
      game._unitTest = previous;
      if (previous) previous.setWallDamageVisible(true);
    } else if (previous) previous.dispose();
    test.dispose();
    throw error;
  }
  if (previous) previous.dispose();
  return test;
}

exports.canOpen = canOpen;
exports.spawnPoints = spawnPoints;
exports.catalog = catalog;
exports.validate = validate;
exports.send = send;
exports.MAX_COUNT = MAX_COUNT;
