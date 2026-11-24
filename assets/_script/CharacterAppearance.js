"use strict";
var Core = require("CharacterPartsCore");
var UnitLevelStats = require("UnitLevelStats");
var library = null, looks = null, loading = false, retryAt = 0, failures = {}, textureJobs = {}, profileKeys = new WeakMap();
var nativePartsNotice = false;
var bakedJobs = {};
var looksLoading = false, looksCallbacks = [], looksFinish = null;
var dataManagerModule;
function skeletonDataId(asset) { return asset && (asset._uuid || asset.uuid); }
function allyLevel(actor) { return UnitLevelStats.level(actor); }
function validAnimationSpeed(value) { return typeof value === "number" && isFinite(value) && value >= 0 && value <= 2; }
var own = Object.prototype.hasOwnProperty;
var enemyKeys = new Map();
function enemyParentKey(id) {
  var key = enemyKeys.get(id);
  if (key === undefined) {
    key = "enemy:" + id + ":" + (id >= 90010 && id <= 90012 ? id - 90009 : "default");
    if (enemyKeys.size < 2048) enemyKeys.set(id, key);
  }
  return key;
}
function stockEnemy(actor, team) {
  return team === "enemy" && cc.sys && cc.sys.isNative && cc.ENGINE_VERSION === "2.4.13" &&
    actor && actor.navigationTeam === "enemy" && !actor.getSpAni && actor.spAni &&
    typeof sp !== "undefined" && sp.Skeleton && Object.getPrototypeOf(actor.spAni) === sp.Skeleton.prototype;
}
function profileFrom(profiles, id) {
  return id && own.call(profiles, id) && plainAppearanceMap(profiles[id]) ? profiles[id] : undefined;
}
function validInheritedValue(profiles, value) {
  return profiles ? !!profileFrom(profiles, value) : validAnimationSpeed(value);
}
function inheritedEnemyValue(actor, values, profiles, stock) {
  var cfg = actor.cfg;
  if (!cfg.ProfileBaseID && cfg.ID < 100000) return undefined;
  var settings;
  try {
    var dependency = dataManagerModule || require("KinghtFallDataMgr");
    var data = dependency.KinghtFallDataMgr.getInstance().data;
    if (!dataManagerModule) dataManagerModule = dependency;
    settings = data && data.GameTools;
  } catch (error) { return undefined; }

  if (stock) {
    var table = settings && settings.unitProfiles;
    var entries = table && table.entries, forms = table && table.bossForms;
    var id = cfg.ProfileBaseID || cfg.ID;
    // Most authored profiles have one parent. Walk the live rows so changing
    // a parent or a catalog entry takes effect immediately, with no chain array.
    for (var step = 0; id && Number.isSafeInteger(id) && id > 0 && step < 8; step++) {
      var value = values[enemyParentKey(id)];
      if (validInheritedValue(profiles, value)) return value;
      var entry = entries && entries[id];
      var form = forms && forms[id];
      id = entry ? entry.baseId : form && form.source;
    }
    if (!id) return undefined;
  }

  // Keep the authoring lookup for deep, cyclic and non-numeric legacy profiles.
  var ids;
  try { ids = require("EnemyStageProfiles").referenceIds(cfg, settings); }
  catch (error) { return undefined; }
  for (var i = 0; i < ids.length; i++) {
    var inherited = values[enemyParentKey(ids[i])];
    if (validInheritedValue(profiles, inherited)) return inherited;
  }
  return undefined;
}
function animationSpeed(actor, team) {
  var speeds = looks && looks.unitAnimationSpeeds;
  if (!speeds || !actor || team !== "hero" && !actor.cfg) return undefined;
  var level = team === "ally" && allyLevel(actor), scoped = level && speeds["ally:" + actor.cfg.ID + ":level:" + level];
  if (validAnimationSpeed(scoped)) return scoped;
  var shared = speeds[Core.actorKey(actor, team)];
  if (validAnimationSpeed(shared)) return shared;
  return team === "enemy" ? inheritedEnemyValue(actor, speeds, null, stockEnemy(actor, team)) : undefined;
}
function preload(done) {
  if (looks || !cc.resources) { if (done) done(); return; }
  if (done) looksCallbacks.push(done);
  if (looksLoading) return;
  looksLoading = true;
  var settled = false, timer = typeof setTimeout === "function" ? setTimeout(function () { finish(new Error("Character catalog request timed out.")); }, 20000) : null;
  function finish(issue, asset) {
    if (settled) return; settled = true; if (typeof clearTimeout === "function") clearTimeout(timer);
    looksLoading = false; looksFinish = null;
    if (!issue && (!asset || !asset.json || typeof asset.json !== "object" || Array.isArray(asset.json))) issue = new Error("Character catalog returned no usable table.");
    if (!issue) { looks = asset.json; retryAt = 0; }
    else retryAt = Date.now() + 1000;
    var callbacks = looksCallbacks; looksCallbacks = [];
    drainCallbacks(callbacks, issue);
  }
  looksFinish = finish;
  try { cc.resources.load("characters/catalog", cc.JsonAsset, finish); }
  catch (issue) { if (settled) throw issue; finish(issue); }
}
function enemyLookId(data, actor, stock) {
  var assignments = data.assignments, profiles = data.profiles;
  var id = assignments[Core.actorKey(actor, "enemy")];
  if (profileFrom(profiles, id)) return id;
  return inheritedEnemyValue(actor, assignments, profiles, stock) || id;
}
function assignedLook(data, actor, team) {
  if (!validAppearanceMaps(data)) return { id: undefined, profile: undefined };
  if (team === "enemy") {
    var enemyId = enemyLookId(data, actor, stockEnemy(actor, team));
    return { id: enemyId, profile: profileFrom(data.profiles, enemyId) };
  }
  var key = Core.actorKey(actor, team), level = team === "ally" && allyLevel(actor);
  var exact = level && data.assignments["ally:" + actor.cfg.ID + ":level:" + level];
  var id = profileFrom(data.profiles, exact) ? exact : data.assignments[key];
  return { id: id, profile: profileFrom(data.profiles, id) };
}
function plainAppearanceMap(value) {
  if (!value || Object.prototype.toString.call(value) !== "[object Object]") return false;
  var prototype = Object.getPrototypeOf(value);
  return prototype === null || Object.getPrototypeOf(prototype) === null;
}
function validAppearanceMaps(data) { return !!data && plainAppearanceMap(data.assignments) && plainAppearanceMap(data.profiles); }
function drainCallbacks(list, error, value) {
  var first = null;
  list.forEach(function (callback) { try { callback(error, value); } catch (issue) { if (!first) first = issue; } });
  if (first) throw first;
}
function requestBakedAsset(resource, callback, retry) {
  var cancelled = false, waiter = callback && function (error, asset) { if (!cancelled) callback(error, asset); };
  var handle = { cancel: function () { cancelled = true; if (job && job.waiters && waiter) { var index = job.waiters.indexOf(waiter); if (index >= 0) job.waiters.splice(index, 1); } } }, job = bakedJobs[resource];
  if (job && job.asset && (!cc.isValid || cc.isValid(job.asset, true))) {
    // Stage priming lends its already decoded assets. Retain a baked rig only
    // when this shared appearance cache actually consumes it after priming.
    if (!job.retained && job.asset.addRef) { job.asset.addRef(); job.retained = true; }
    if (waiter) waiter(null, job.asset); return handle;
  }
  if (job && job.asset && job.retained) { job.retained = false; if (job.asset.decRef) job.asset.decRef(); }
  if (job && job.loading) { if (waiter) job.waiters.push(waiter); return handle; }
  if (job && job.retryAt && Date.now() < job.retryAt && !retry) { if (waiter) waiter(job.error); return handle; }
  job = bakedJobs[resource] = { loading: true, waiters: waiter ? [waiter] : [], failedAsset: job && job.failedAsset, failedRevision: job && job.failedRevision, error: job && job.error };
  var settled = false;
  function finish(error, asset) {
    if (settled) return; settled = true; if (typeof clearTimeout === "function") clearTimeout(job.timer); job.loading = false;
    job.finish = null;
    if (!error && asset === job.failedAsset && sameBakedRevision(job.failedRevision, asset)) error = job.error || new Error("Baked Spine runtime is not ready: " + resource);
    if (!error && asset) { try { if (asset.addRef) { asset.addRef(); job.retained = true; } job.asset = asset; job.error = null; } catch (issue) { error = issue; } }
    if (error || !job.asset) { job.error = error || new Error("No baked Spine asset: " + resource); job.retryAt = Date.now() + 1000; }
    var waiters = job.waiters; job.waiters = [];
    drainCallbacks(waiters, job.error, job.asset);
  }
  job.finish = finish;
  job.timer = typeof setTimeout === "function" ? setTimeout(function () { finish(new Error("Baked Spine request timed out: " + resource)); }, 20000) : null;
  try { cc.resources.load(resource, sp.SkeletonData, finish); }
  catch (error) { if (settled) throw error; finish(error); }
  return handle;
}
function bakedAsset(resource) {
  requestBakedAsset(resource, null, false);
  var job = bakedJobs[resource];
  if (job && job.asset && !bakedRuntimeReady(resource, job)) return null;
  return job && job.asset;
}
function bakedRevision(asset) { return { json: asset.skeletonJson, atlas: asset.atlasText, scale: asset.scale, buffer: asset._nativeAsset, textures: asset.textures, names: asset.textureNames, runtime: asset._skeletonCache }; }
function sameBakedRevision(revision, asset) { return !!revision && revision.json === asset.skeletonJson && revision.atlas === asset.atlasText && revision.scale === asset.scale && revision.buffer === asset._nativeAsset && revision.textures === asset.textures && revision.names === asset.textureNames && revision.runtime === asset._skeletonCache; }
function failBakedRuntime(resource, asset, issue) {
  var cached = bakedJobs[resource];
  if (!cached || cached.asset !== asset) return;
  cached.failedAsset = asset; cached.failedRevision = bakedRevision(asset); cached.asset = null; cached.runtimeReady = false;
  cached.error = issue; cached.retryAt = Date.now() + 1000;
  if (cached.retained) { cached.retained = false; if (asset.decRef) asset.decRef(); }
}
function preparedBakedRuntime(resource, asset) { var cached = bakedJobs[resource]; if (cached && cached.asset === asset) { if (cached.runtimePreparing) { cached.runtimePreparing.finished = true; removeConstructionStep(cached.runtimePreparing); cached.runtimePreparing = null; } cached.runtimeReady = true; cached.runtimeRevision = bakedRevision(asset); cached.failedAsset = cached.failedRevision = null; cached.error = null; } }
function bakedRuntimeReady(resource, cached) {
  var asset = cached.asset;
  if (cached.runtimeReady && sameBakedRevision(cached.runtimeRevision, asset)) return true;
  if (cached.runtimePreparing) return false;
  var task = { finished: false, frame: null };
  cached.runtimePreparing = task;
  task.run = function () {
    task.finished = true; cached.runtimePreparing = null;
    if (bakedJobs[resource] !== cached || cached.asset !== asset) return;
    try { if (!(asset instanceof sp.SkeletonData) || cc.isValid && !cc.isValid(asset, true) || typeof asset.getRuntimeData !== "function" || !asset.getRuntimeData()) throw new Error("Baked Spine runtime could not prepare: " + resource); preparedBakedRuntime(resource, asset); }
    catch (issue) { failBakedRuntime(resource, asset, issue); if (cc.warn && !failures["construction:" + resource]) { failures["construction:" + resource] = true; cc.warn("Construction appearance fallback: " + resource, issue); } }
  };
  task.frame = { job: task, run: task.run }; constructionSteps.push(task.frame); scheduleConstructionFrame();
  return false;
}
var libraryJob = null, libraryRetryAt = 0, libraryIssue = null;
function preloadLibrary(done, retry) {
  var cancelled = false, waiter = done && function (error) { if (!cancelled) done(error); }, job = libraryJob;
  var handle = { cancel: function () { cancelled = true; if (job && waiter) { var at = job.waiters.indexOf(waiter); if (at >= 0) job.waiters.splice(at, 1); } } };
  if (library) { if (waiter) waiter(); return handle; }
  if (!cc.resources || typeof cc.resources.load !== "function") { if (waiter) waiter(new Error("Character parts metadata loader is unavailable.")); return handle; }
  if (job) { if (waiter) job.waiters.push(waiter); return handle; }
  if (!retry && Date.now() < libraryRetryAt) { if (waiter) waiter(libraryIssue); return handle; }
  job = libraryJob = { waiters: waiter ? [waiter] : [], settled: false, timer: null };
  function finish(issue, asset) {
    if (job.settled) return;
    job.settled = true; job.finish = null; if (typeof clearTimeout === "function") clearTimeout(job.timer);
    if (libraryJob === job) libraryJob = null;
    var next = Object.create(null);
    if (!issue) {
      try {
        if (!asset || !asset.json || !Array.isArray(asset.json.parts)) throw new Error("Character parts metadata returned no usable parts array.");
        asset.json.parts.forEach(function (part) {
          if (!plainAppearanceMap(part) || typeof part.id !== "string" || !part.id || typeof part.resource !== "string" || !part.resource) throw new Error("Character parts metadata contains an invalid part.");
          next[part.id] = part;
        });
      } catch (error) { issue = error; }
    }
    if (!issue) { library = next; libraryIssue = null; libraryRetryAt = 0; }
    else { libraryIssue = issue; libraryRetryAt = Date.now() + 1000; }
    var callbacks = job.waiters; job.waiters = [];
    drainCallbacks(callbacks, issue);
  }
  job.finish = finish;
  job.timer = typeof setTimeout === "function" ? setTimeout(function () { finish(new Error("Character parts metadata request timed out.")); }, 20000) : null;
  try { cc.resources.load("character-parts/catalog", cc.JsonAsset, finish); }
  catch (issue) { if (job.settled) throw issue; finish(issue); }
  return handle;
}

function constructionAssets(prefabs) {
  var result = [], seen = new Set();
  function add(asset) { if (asset && !seen.has(asset)) { seen.add(asset); result.push(asset); } }
  (prefabs || []).forEach(function (prefab) {
    if (prefab instanceof sp.SkeletonData) { add(prefab); return; }
    if (!prefab || !prefab.data || typeof prefab.data.getComponentsInChildren !== "function") throw new Error("Construction prefab cannot enumerate Spine data.");
    prefab.data.getComponentsInChildren(sp.Skeleton).forEach(function (component) { add(component.skeletonData); });
    // Include loaded Spine dependencies referenced outside a renderer property.
    var manager = cc.assetManager, deps = manager && manager.dependUtil, assets = manager && manager.assets;
    if (prefab._uuid && deps && typeof deps.getDepsRecursively === "function" && assets && typeof assets.get === "function") {
      deps.getDepsRecursively(prefab._uuid).forEach(function (id) { var asset = assets.get(id); if (asset instanceof sp.SkeletonData) add(asset); });
    }
  });
  return result;
}
function constructionPlan(config, data, assets, optional) {
  var known = Object.create(null), resources = [], seen = Object.create(null);
  if (!validAppearanceMaps(data)) { if (optional) optional.push({ resource: "characters/catalog", message: "Character appearance maps are unavailable; using prefab appearances." }); return resources; }
  (assets || []).forEach(function (asset) { var id = skeletonDataId(asset); if (id) known[id] = true; });
  Object.keys(config && config.BuildEnum || {}).forEach(function (id) {
    if (Number(id) !== 3) return;
    (config.BuildEnum[id].levelList || []).forEach(function (row) {
      var unit = row.Data && row.Data[1], soldier = config.AllyCfg && config.AllyCfg[unit] || config.SoldierCfg && config.SoldierCfg[unit];
      if (!soldier) return;
      var selected = assignedLook(data, { cfg: soldier, outBuild: { buildInfo: { cfg: row } } }, "ally"), baked = selected.profile && selected.profile.baked;
      if (!baked || baked.uuid && known[baked.uuid]) return;
      if (typeof baked.resource !== "string" || !baked.resource) {
        var issue = new Error("Construction look has no baked resource: " + selected.id);
        if (optional) { optional.push({ resource: String(selected.id), message: issue.message }); return; }
        throw issue;
      }
      if (!seen[baked.resource]) { seen[baked.resource] = true; resources.push(baked.resource); }
    });
  });
  return resources;
}
var constructionJobs = new Map(), constructionAssetIds = new WeakMap(), nextConstructionAssetId = 0;
var constructionSteps = [], constructionFrame = null, constructionTimer = null, constructionDrawing = false;
function scheduleConstructionFrame() {
  if (constructionFrame || constructionTimer !== null || !constructionSteps.length) return;
  var frame = constructionFrame = function () {
    var task = constructionSteps.shift();
    if (task) task.job.frame = null;
    constructionDrawing = true;
    try { if (task && !task.job.finished) task.run(); }
    finally {
      constructionDrawing = false;
      constructionFrame = null;
      // Register the next draw listener outside this emit, even on hosts whose
      // event dispatcher would invoke newly appended listeners immediately.
      if (constructionSteps.length) constructionTimer = setTimeout(function () { constructionTimer = null; scheduleConstructionFrame(); }, 0);
    }
  };
  if (cc.director && typeof cc.director.once === "function" && typeof cc.director.off === "function" && cc.Director && cc.Director.EVENT_AFTER_DRAW) cc.director.once(cc.Director.EVENT_AFTER_DRAW, frame);
  else constructionTimer = setTimeout(function () { constructionTimer = null; frame(); }, 0);
}
function removeConstructionStep(job) {
  constructionSteps = constructionSteps.filter(function (task) { return task.job !== job; }); job.frame = null;
  if (!constructionSteps.length && !constructionDrawing) {
    if (constructionFrame && cc.director && cc.director.off && cc.Director) cc.director.off(cc.Director.EVENT_AFTER_DRAW, constructionFrame);
    clearTimeout(constructionTimer); constructionTimer = null; constructionFrame = null;
  }
}
function preloadConstruction(config, prefabs, done, isCurrent) {
  var cancelled = false, subscription = null, librarySubscription = null, native = !!(cc.sys && cc.sys.isNative);
  var handle = { cancel: function () { cancelled = true; if (subscription) subscription.cancel(); if (librarySubscription) librarySubscription.cancel(); } };
  function current() { return !cancelled && (!isCurrent || isCurrent()); }
  preload(function (error) {
    if (!current()) return;
    librarySubscription = preloadLibrary(function (libraryError) {
    if (!current()) return;
    var assets, resources, optional = error ? [{ resource: "characters/catalog", message: error.message || String(error) }] : [];
    if (libraryError) optional.push({ resource: "character-parts/catalog", message: libraryError.message || String(libraryError) });
    try { assets = constructionAssets(prefabs); }
    catch (issue) { if (done) done(issue); return; }
    try { resources = looks ? constructionPlan(config, looks, assets, optional) : []; }
    catch (issue) { resources = []; optional.push({ resource: "characters/catalog", message: issue.message || String(issue) }); }
    optional.forEach(function (value) { if (cc.warn && !failures["construction:" + value.resource]) { failures["construction:" + value.resource] = true; cc.warn("Construction appearance fallback: " + value.resource, value.message); } });
    var key = JSON.stringify(assets.map(function (asset) { if (!constructionAssetIds.has(asset)) constructionAssetIds.set(asset, ++nextConstructionAssetId); return constructionAssetIds.get(asset); }).concat(resources, optional));
    var job = constructionJobs.get(key), waiter = { done: done, current: current, cancelled: false };
    if (!job) {
      job = { native: native, waiters: [], items: assets.map(function (asset) { return { asset: asset }; }).concat(resources.map(function (resource) { return { resource: resource }; })), required: assets.length, fallbacks: optional, position: 0, prepared: 0, finished: false, frame: null, request: null };
      constructionJobs.set(key, job);
      job.live = function () { return job.waiters.some(function (value) { return !value.cancelled && value.current(); }); };
      job.finish = function (issue) {
        if (job.finished) return; job.finished = true; constructionJobs.delete(key);
        removeConstructionStep(job); clearTimeout(job.watchdog); if (job.request) job.request.cancel(); job.request = null;
        var callbacks = [], first = null, waiters = job.waiters; job.waiters = [];
        waiters.forEach(function (value) { try { if (!value.cancelled && value.current() && value.done) callbacks.push(value.done); } catch (error) { if (!first) first = error; } });
        try { drainCallbacks(callbacks, issue, issue ? null : { native: job.native, prepared: job.prepared, requiredReady: true, ready: !job.fallbacks.length, fallbacks: job.fallbacks.slice() }); } catch (error) { if (!first) first = error; }
        if (first) throw first;
      };
      job.schedule = function () {
        if (job.finished || job.frame) return;
        // A long queue can take many frames even when each rig prepares successfully.
        clearTimeout(job.watchdog);
        job.watchdog = setTimeout(function () {
          if (job.position < job.required) { job.finish(new Error("Required construction Spine preparation timed out.")); return; }
          job.items.slice(job.position).forEach(function (item) { if (!item.resource) return; var issue = "Optional construction appearance preparation timed out; using prefab appearance."; job.fallbacks.push({ resource: item.resource, message: issue }); if (cc.warn && !failures["construction:" + item.resource]) { failures["construction:" + item.resource] = true; cc.warn("Construction appearance fallback: " + item.resource, issue); } });
          job.finish();
        }, 25000);
        job.frame = { job: job, run: job.run }; constructionSteps.push(job.frame); scheduleConstructionFrame();
      };
      job.optionalFailure = function (item, issue) {
        if (item.asset) failBakedRuntime(item.resource, item.asset, issue);
        job.fallbacks.push({ resource: item.resource, message: issue.message || String(issue) });
        if (cc.warn && !failures["construction:" + item.resource]) { failures["construction:" + item.resource] = true; cc.warn("Construction appearance fallback: " + item.resource, issue); }
        job.position++; job.schedule();
      };
      job.run = function () {
        if (job.finished) return;
        var live; try { live = job.live(); } catch (error) { job.finish(error); return; }
        if (!live || job.position >= job.items.length) { job.finish(); return; }
        var item = job.items[job.position];
        if (!item.asset) {
          var replied = false, request = requestBakedAsset(item.resource, function (error, asset) {
            replied = true;
            job.request = null; if (job.finished) return;
            if (error) { job.optionalFailure(item, error); return; }
            item.asset = asset; job.schedule();
          }, true);
          if (!replied && !job.finished) job.request = request;
          return;
        }
        var issue = null;
        try { if (!(item.asset instanceof sp.SkeletonData) || cc.isValid && !cc.isValid(item.asset, true) || typeof item.asset.getRuntimeData !== "function" || !item.asset.getRuntimeData()) throw new Error("Construction Spine runtime could not prepare: " + (item.resource || item.asset.name || item.asset._uuid || "unknown")); }
        catch (error) { issue = error; }
        if (issue) { if (item.resource) job.optionalFailure(item, issue); else job.finish(issue); return; }
        if (item.resource) preparedBakedRuntime(item.resource, item.asset);
        job.position++; job.prepared++; job.schedule();
      };
    }
    job.waiters.push(waiter);
    subscription = { cancel: function () { waiter.cancelled = true; if (!job.finished && !job.live()) job.finish(); } };
    if (job.waiters.length === 1) job.schedule();
    }, true);
  });
  return handle;
}

function trackValue(track, name) {
  var getter = "get" + name.charAt(0).toUpperCase() + name.slice(1);
  return track && (typeof track[getter] === "function" ? track[getter]() : track[name]);
}
function setTrackValue(track, name, value) {
  if (!track || value === undefined) return;
  var setter = "set" + name.charAt(0).toUpperCase() + name.slice(1);
  if (typeof track[setter] === "function") track[setter](value);
  else track[name] = value;
}
function switchAllyRig(component, actor, renderers, profile) {
  var ready = true;
  renderers.forEach(function (renderer) {
    if (!renderer.skeletonData) return;
    var records = component.bakedModels || (component.bakedModels = []);
    var record = records.filter(function (value) { return value.renderer === renderer; })[0];
    var baked = profile && profile.baked, target;
    if (baked && skeletonDataId(renderer.skeletonData) === baked.uuid) return;
    if (baked && baked.resource) {
      target = bakedAsset(baked.resource);
      if (!target) { ready = false; return; }
    } else if (record) target = record.original;
    else return;
    if (renderer.skeletonData === target) return;
    // A rig change replaces track entries. Wait for gameplay callbacks and the
    // separate hit-reaction track to finish rather than replaying or losing one.
    var track = renderer.getCurrent && renderer.getCurrent(0), animation = trackValue(track, "animation");
    var name = animation && (animation.name || typeof animation.getName === "function" && animation.getName());
    var loop = trackValue(track, "loop");
    if (!track) { name = renderer.animation; loop = renderer.loop; }
    if (actor._isPooled || actor._hitReactionPlaying || actor.isDead && actor.isDead() ||
        actor.time && actor.time.Attack === -1 || !/^(idle|move|walk|run)$/.test(name || "") || loop === false) {
      ready = false; return;
    }
    if (renderer.getCurrent && renderer.getCurrent(1)) { ready = false; return; }
    if (!record) {
      record = { renderer: renderer, original: renderer.skeletonData, defaultSkin: renderer.defaultSkin, defaultAnimation: renderer.defaultAnimation,
        skin: renderer._skeleton && renderer._skeleton.skin && renderer._skeleton.skin.name || renderer.defaultSkin };
      records.push(record);
    }
    var time = trackValue(track, "trackTime"), speed = trackValue(track, "timeScale");
    component.clear();
    renderer.skeletonData = target;
    record.applied = target;
    var skin = target === record.original ? record.skin : "default";
    if (skin) renderer.setSkin(skin);
    renderer.defaultSkin = target === record.original ? record.defaultSkin : "default";
    renderer.defaultAnimation = record.defaultAnimation;
    if (name) {
      var resumed = renderer.setAnimation(0, name, loop !== false);
      setTrackValue(resumed, "trackTime", time);
      setTrackValue(resumed, "timeScale", speed);
    }
  });
  return ready;
}
function restoreAllyRigs(component) {
  (component.bakedModels || []).forEach(function (record) {
    var renderer = record.renderer;
    if (!cc.isValid(renderer, true) || !cc.isValid(renderer.node, true) || renderer.skeletonData !== record.applied) return;
    renderer.skeletonData = record.original;
    if (record.skin) renderer.setSkin(record.skin);
    renderer.defaultSkin = record.defaultSkin; renderer.defaultAnimation = record.defaultAnimation;
  });
  component.bakedModels = [];
}
function profileKey(profile) {
  if (!profileKeys.has(profile)) profileKeys.set(profile, JSON.stringify(profile));
  return profileKeys.get(profile);
}
function load() {
  if (loading || library && looks || Date.now() < retryAt) return;
  loading = true;
  preloadLibrary(function (libraryError) {
    if (libraryError) { loading = false; retryAt = Date.now() + 1000; return; }
    preload(function (issue) {
      loading = false;
      retryAt = issue ? Date.now() + 1000 : 0;
    });
  });
}
function skeletonTexture(image) {
  if (cc.sys && cc.sys.isNative) {
    // Creator's JSB Spine adapter uses middleware textures; SkeletonTexture
    // exists only in the web runtime. Bind the existing GPU texture directly.
    var native = new middleware.Texture2D();
    native.setPixelsWide(image.width);
    native.setPixelsHigh(image.height);
    native.setNativeTexture(image.getImpl());
    return native;
  }
  var adapter = new sp.SkeletonTexture({ width: image.width, height: image.height });
  adapter.setRealTexture(image);
  return adapter;
}
function texture(id) {
  var job = textureJobs[id];
  if (job && (!job.retryAt || Date.now() < job.retryAt)) return job.texture;
  var entry = library && library[id]; if (!entry) return null;
  job = textureJobs[id] = {};
  function failed(error) {
    job.retryAt = Date.now() + 1000;
    if (error && !failures["texture:" + id]) {
      failures["texture:" + id] = true;
      if (typeof cc.warn === "function") cc.warn("Character texture " + id + ": " + (error.message || error));
    }
  }
  try {
    cc.resources.load(entry.resource, cc.Texture2D, function (error, image) {
      if (error || !image) { failed(error); return; }
      // This callback runs after lateUpdate's setup try/catch has returned.
      try {
        job.texture = skeletonTexture(image);
      } catch (issue) { failed(issue); }
    });
  } catch (issue) { failed(issue); }
  return null;
}
function visuals(actor, type) {
  if (type !== "hero") return [actor.getSpAni ? actor.getSpAni() : actor.spAni].filter(Boolean);
  var animation = actor.ctrPlayAni;
  return ["spAniMa", "spAniBody", "spAniDrap", "spAniHead", "spAniBow", "spAniArrow", "spAniHand"].map(function (key) { return animation[key]; }).filter(Boolean);
}
function makerRider(appearance) {
  var actor=appearance.owner,controller=appearance.team==='hero'&&actor&&actor.ctrPlayAni,data=controller&&controller.spAniBody&&controller.spAniBody.skeletonData;
  return data&&data.skeletonJson&&data.skeletonJson._heroMaker?require("HeroMakerRider"):null;
}
var Appearance = cc.Class({
  extends: cc.Component,
  init: function (actor, type) { this.clear(); restoreAllyRigs(this); this.owner = actor; this.team = type; load(); },
  clear: function () {
    var maker=makerRider(this);if(maker)maker.removeFollow(this.owner.ctrPlayAni);
    (this.states || []).forEach(Core.restore);
    (this.models || []).forEach(function (model) {
      if (!cc.isValid(model.renderer.node)) return;
      var node = model.renderer.node;
      node.scaleX = (node.scaleX < 0 ? -1 : 1) * model.scaleX; node.scaleY = model.scaleY;
      if (model.transformed) { node.x = model.x; node.y = model.y; node.angle = model.angle; node.opacity = model.opacity; }
      if (model.tinted && model.color) node.color = model.color;
      if (model.appliedSkin && model.renderer._skeleton && model.renderer._skeleton.skin && model.renderer._skeleton.skin.name === model.appliedSkin && model.skin) model.renderer.setSkin(model.skin);
    });
    this.states = []; this.models = []; this.signature = "";
  },
  lateUpdate: function () {
    var actor = this.owner;
    if (!actor || !actor.node.activeInHierarchy) return;
    var effectData = this.team === "enemy" && actor.spAni && actor.spAni.skeletonData && actor.spAni.skeletonData.skeletonJson;
    var hasAmbient = effectData && effectData._fantasy && effectData._fantasy.effects && effectData._fantasy.effects.ambientAnimation;
    if (hasAmbient || this.fantasyAmbient) { require("FantasyEffects").ambient(actor, require("GameToolsOverrides").animationPlayback(actor, this.team)); this.fantasyAmbient = !!hasAmbient; }
    var pack = effectData && effectData._fantasy && effectData._fantasy.pack;
    var hasFantasyPlayback = pack === "fantasy-bosses" || pack === "fantasy-monsters";
    var customPlayback = animationSpeed(actor, this.team) !== undefined;
    if (hasFantasyPlayback || this.fantasyPlayback || customPlayback || this.customPlayback) { require("GameToolsOverrides").applyAnimationPlayback(actor, this.team); this.fantasyPlayback = !!hasFantasyPlayback; this.customPlayback = customPlayback; }
    var maker=makerRider(this);if(maker)maker.removeFollow(actor.ctrPlayAni);
    try {
    if (!looks || !library) load();
    if (!looks || !library || !actor.cfg && this.team !== "hero") return;
    var id, profile;
    if (stockEnemy(actor, this.team)) {
      if (validAppearanceMaps(looks)) {
        id = enemyLookId(looks, actor, true);
        profile = profileFrom(looks.profiles, id);
      }
      // Ordinary enemies have no alternate rig to restore. Don't collect a
      // renderer list for an unassigned look or after clearing a removed look.
      if (!profile) { if (this.models.length) this.clear(); return; }
    } else {
      var selected = assignedLook(looks, actor, this.team);
      id = selected.id; profile = selected.profile;
    }
    if (this.team === "hero") profile = require("HeroItemLooks").current(profile);
    var renderers = visuals(actor, this.team);
    if (this.team === "ally" && !switchAllyRig(this, actor, renderers, profile)) return;
    var heroBaked = this.team === "hero" ? require("HeroBakedLooks") : null;
    if (heroBaked) heroBaked.apply(renderers, profile);
    if (!profile) { if (this.models.length) this.clear(); return; }
    // Saved imported units are baked into normal Spine assets for web and
    // native play. Their equipped parts must not be overlaid a second time.
    if (this.team !== "hero" && renderers.some(function (renderer) { return renderer.skeletonData && (profile.baked && skeletonDataId(renderer.skeletonData) === profile.baked.uuid || renderer.skeletonData.skeletonJson && renderer.skeletonData.skeletonJson._unitLook === id); })) {
      if (this.models.length) this.clear();
      return;
    }
    // JSB has neither SkeletonTexture nor the JS attachment vertex hook used
    // by Core. Keep native attachments intact; skins/model overrides still work.
    var nativeParts = !!(cc.sys && cc.sys.isNative) || renderers.some(function (renderer) { return !!renderer._nativeSkeleton; });
    if (nativeParts && renderers.some(function (renderer) { return renderer.skeletonData && !renderer._skeleton; })) return;
    var profileParts = Array.isArray(profile.parts) ? profile.parts : [];
    if (nativeParts && profileParts.length && !profile.bakedLayers && !nativePartsNotice) {
      nativePartsNotice = true;
      if (typeof cc.log === "function") cc.log("Native Spine retains original character attachments; custom part fitting requires the web Spine runtime.");
    }
    var fittedParts = nativeParts ? [] : profileParts.filter(function (part) { return !heroBaked || !renderers.some(function (renderer) { return heroBaked.originalId(renderer) === part.layer && (heroBaked.baked(renderer) || profile.bakedLayers && profile.bakedLayers[part.layer]); }); });
    var signature = id + ":" + profileKey(profile) + ":" + nativeParts + ":" + renderers.map(function (renderer) { return renderer.uuid + ":" + (renderer.skeletonData && skeletonDataId(renderer.skeletonData)); }).join("|");
    if (this.signature !== signature || this.states.some(function (state) { return !renderers.some(function (renderer) { return renderer._skeleton === state.skeleton; }); })) {
      this.clear();
      var textures = {}, ready = true;
      fittedParts.forEach(function (part) { textures[part.sprite] = texture(part.sprite); if (!textures[part.sprite]) ready = false; });
      fittedParts.forEach(function (part) { if (!renderers.some(function (renderer) { return renderer.skeletonData && skeletonDataId(renderer.skeletonData) === part.layer && renderer._skeleton; })) ready = false; });
      if (!ready) return;
      try {
        var pending = [], models = [];
        renderers.forEach(function (renderer) {
          var node = renderer.node;
          models.push({ renderer: renderer, scaleX: Math.abs(node.scaleX), scaleY: node.scaleY, x: node.x || 0, y: node.y || 0, angle: node.angle || 0, opacity: node.opacity === undefined ? 255 : node.opacity, color: node.color && node.color.clone ? node.color.clone() : node.color, skin: renderer._skeleton && renderer._skeleton.skin && renderer._skeleton.skin.name });
          var parts = fittedParts.filter(function (part) { return renderer.skeletonData && part.layer === skeletonDataId(renderer.skeletonData); });
          if ((parts.length || (profile.faceless || Core.skinTint(profile)) && !nativeParts) && renderer._skeleton) pending.push(Core.prepare(sp.spine, renderer._skeleton, parts, library, textures, { faceless: !!profile.faceless, skinTint: Core.skinTint(profile) }));
        });
        this.states = pending; this.models = models; this.signature = signature;
      } catch (error) { this.clear(); if (!failures[id]) { failures[id] = true; cc.warn("Character look " + id + ": " + error.message); } return; }
    }
    this.models.forEach(function (model) {
      var node = model.renderer.node, scale = profile.scale || 1;
      node.scaleX = (node.scaleX < 0 ? -1 : 1) * model.scaleX * scale; node.scaleY = model.scaleY * scale;
      var layerId = heroBaked ? heroBaked.originalId(model.renderer) : skeletonDataId(model.renderer.skeletonData);
      var transform = profile.models && profile.models[layerId];
      if (transform) {
        if (transform.tint) { node.color = cc.color(transform.tint); model.tinted = true; }
        node.x = model.x + (transform.x || 0); node.y = model.y + (transform.y || 0);
        node.angle = model.angle + (transform.rotation || 0); node.opacity = model.opacity * (transform.opacity === undefined ? 1 : transform.opacity);
        node.scaleX *= transform.scaleX === undefined ? 1 : transform.scaleX; node.scaleY *= transform.scaleY === undefined ? 1 : transform.scaleY; model.transformed = true;
      }
      var skin = profile.skins && profile.skins[layerId];
      var current = model.renderer._skeleton && model.renderer._skeleton.skin && model.renderer._skeleton.skin.name;
      if (skin && current !== skin) { model.skin = current; model.renderer.setSkin(skin); model.renderer.setSlotsToSetupPose(); model.appliedSkin = skin; }
    });
    this.states.forEach(Core.apply);
    } finally { if(maker)maker.follow(actor.ctrPlayAni); }
  },
  onDisable: function () { if(this.fantasyAmbient)require("FantasyEffects").reset(this.owner);this.fantasyAmbient=false;this.clear(); restoreAllyRigs(this); },
  onDestroy: function () { if(this.fantasyAmbient)require("FantasyEffects").reset(this.owner);this.fantasyAmbient=false;this.clear(); restoreAllyRigs(this); this.owner = null; }
});
exports.bind = function (actor, type) {
  if (!actor || !actor.node || !actor.node.addComponent || !cc.resources) return;
  var appearance = actor.node.getComponent(Appearance) || actor.node.addComponent(Appearance);
  appearance.init(actor, type); return appearance;
};
exports.reset = function (actor) {
  if (!actor || !actor.node || !actor.node.getComponent) return;
  var appearance = actor.node.getComponent(Appearance); if (appearance) appearance.clear();
};
exports.component = Appearance;
exports.allyLevel = allyLevel; exports.assignedLook = assignedLook;
exports.animationSpeed = animationSpeed; exports.preload = preload;
exports.prime = function (catalog,parts,assets) {
  looks=catalog;library=Object.create(null);(parts.parts||[]).forEach(function(part){library[part.id]=part;});
  textureJobs={};Object.keys(assets||{}).forEach(function(key){
    if(key.indexOf("resources/")!==0||!/:spine$/.test(key))return;
    var resource=key.slice(10,-6),asset=assets[key],job=bakedJobs[resource];
    // Complete an existing coalesced request once. Its late resource callback
    // then cannot replace the stage's asset or strand construction subscribers.
    if(job&&job.loading&&job.finish)job.finish(null,asset);
    else if(!job||job.asset!==asset){
      if(job&&job.runtimePreparing){job.runtimePreparing.finished=true;removeConstructionStep(job.runtimePreparing);}
      if(job&&job.retained&&job.asset&&job.asset.decRef)job.asset.decRef();
      bakedJobs[resource]={asset:asset};
    }
    // Creator can report a failed decode by returning null without throwing.
    // Both web and JSB publish successful data in this cache; inspect that
    // result rather than parsing again or reviving a quarantined optional rig.
    if(typeof sp.SkeletonData==="function"&&asset instanceof sp.SkeletonData&&!asset._skeletonCache){
      var issue=new Error("Stage baked Spine runtime could not prepare: "+resource);failBakedRuntime(resource,asset,issue);
      if(cc.warn&&!failures["construction:"+resource]){failures["construction:"+resource]=true;cc.warn("Construction appearance fallback: "+resource,issue);}
    }else preparedBakedRuntime(resource,asset);
  });
  Object.keys(library).forEach(function(id){var image=assets["resources/"+library[id].resource+":texture"];if(image)textureJobs[id]={texture:skeletonTexture(image)};});
  // Publish every stage cache before releasing coalesced metadata consumers.
  // Completing both jobs retires their timers and rejects older late replies.
  var first=null,metadata=[libraryJob&&libraryJob.finish,looksFinish];
  metadata.forEach(function(finish,index){if(finish)try{finish(null,{json:index?catalog:parts});}catch(issue){if(!first)first=issue;}});
  if(first)throw first;
};

exports.constructionPlan = constructionPlan; exports.preloadConstruction = preloadConstruction;
