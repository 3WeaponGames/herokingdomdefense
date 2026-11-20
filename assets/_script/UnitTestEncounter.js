"use strict";

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
    var profile = {
      id: id, preferred: !custom && role === "fighter", model: model,
      name: custom ? "Custom · " + custom.name : translate(type && type.name || entry && entry.name) || "Default"
    };
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
    model.searchText = [model.name, model.pack].concat(model.profiles.map(function (profile) {
      return profile.id + " " + profile.name;
    })).join(" ").toLowerCase();
    return model;
  });
}

function validate(game, unit, count, spawn, interval) {
  if (!unit || !unit.prefab) throw Error("Choose a unit model.");
  if (!Number.isSafeInteger(count) || count < 1 || count > MAX_COUNT) throw Error("Count must be 1–" + MAX_COUNT + ".");
  if (!spawnPoints(game).some(function (point) { return point.id === spawn; })) throw Error("Choose a spawn point on this stage.");
  if (!Number.isFinite(interval) || interval < .1 || interval > 10) throw Error("Spacing must be 0.1–10 seconds.");
}

function Encounter(game, prefab, profile, spawn, count, interval, follow) {
  this.game = game;
  this.data = game.gameData;
  this.epoch = game._combatEpoch;
  this.prefab = prefab.addRef();
  this.profile = profile;
  this.spawn = spawn;
  this.count = count;
  this.remaining = count;
  this.interval = this.cooldown = interval;
  this.follow = follow;
  this.actors = [];
  this.error = "";
}

Encounter.prototype.current = function () {
  return this.game._unitTest === this && cc.isValid(this.game, true) &&
    this.game.gameData === this.data && this.game._combatEpoch === this.epoch &&
    this.game.gameStatus === require("KinghtFallModle").KinghtFallGameStage.Prepare;
};

Encounter.prototype.spawnOne = function () {
  var actor = this.game.addEnemy(this.profile.id, this.spawn, null, this);
  if (!actor) throw Error("Could not place " + this.profile.model.name + " at this spawn.");
  this.actors.push(actor);
  this.remaining--;
};

Encounter.prototype.update = function (dt) {
  if (!this.current()) { this.dispose(); return; }
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
    // Ordinary target acquisition uses the real stage. Support units can also
    // play their cast while walking. Special combat abilities stay out of F7.
    if (actor.cfg.AttackType === 3) actor.onUpdate(dt);
    else {
      enemy.default.prototype.onUpdate.call(actor, dt);
      var route = actor.bornInfo;
      if (!actor._unitTestRouteAttack && actor.state === enemy.KinghtFallEnemyStatus.Wait &&
          route && route.nodeIndex >= route.pathList.length && actor.time.Attack >= 1) {
        // Planning can leave the route's objective unbuilt and out of combat range.
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
  var navigation = require("KinghtFallNavigation");
  this.actors.splice(0).forEach(function (actor) {
    if (!cc.isValid(actor, true) || !cc.isValid(actor.node, true)) return;
    navigation.reset(actor);
    actor.node.active = false;
    actor.node.destroy();
  });
  if (this.prefab) { this.prefab.decRef(); this.prefab = null; }
};

function send(game, prefab, profile, spawn, count, interval, follow) {
  var previous = game._unitTest;
  var test = game._unitTest = new Encounter(game, prefab, profile, spawn, count, interval, follow);
  try { test.spawnOne(); }
  catch (error) {
    if (test.current()) game._unitTest = previous;
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
