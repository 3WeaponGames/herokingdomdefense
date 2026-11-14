"use strict";

// Keep the small set of immutable construction presentations painted. An
// active-to-active reparent preserves Cocos Label render data; disabling a
// cached popup would force every label through the native text rasterizer.
var activePool = null;
var waiters = null;

function choices(config, values, initial) {
  return (Array.isArray(values) ? values : []).filter(function (index, at, all) {
    return typeof index === "number" && index > 0 && Math.floor(index) === index && all.indexOf(index) === at &&
      (config.levelList || []).some(function (row) { return row.index === index && (!initial || row.level === 1); });
  });
}
function plan(data) {
  var result = [], seen = {};
  Object.keys(data.BuildEnum || {}).forEach(function (id) {
    var config = data.BuildEnum[id];
    if (!config || !config.levelList) return;
    function add(row, values) {
      var indexes = choices(config, values, !row), key = id + ":" + (!row) + ":" + indexes.join(",");
      if (indexes.length < 2 || seen[key]) return;
      seen[key] = true;
      result.push({ config: config, row: row, choices: indexes });
    }
    add(null, config.InitialChoices);
    config.levelList.forEach(function (row) { add(row, row.BranchBuild); });
  });
  return result;
}
function facade(recipe) {
  return { buildCfg: recipe.config, buildInfo: recipe.row ? { cfg: recipe.row } : null,
    getUpgradeChoices: function () { return recipe.choices.slice(); } };
}
function signature(build, values) {
  if (!build || !build.buildCfg) return null;
  var config = build.buildCfg, initial = !(build.buildInfo && build.buildInfo.cfg);
  var indexes = choices(config, values || build.getUpgradeChoices && build.getUpgradeChoices(), initial);
  return JSON.stringify([config.enumValue, initial, indexes, indexes.map(function (index) {
    var row = config.levelList.find(function (item) { return item.index === index; });
    return [row.Name, row.LevelUpDescribe, row.Icon, row.Appearance && row.Appearance.sprite,
      !!(row.Appearance && row.Appearance.weapon), row.Zoom, row.Excursion, row.level,
      row.MillDefense && row.MillDefense.kind, row.BuildCost, row.VedioCount, row.BuildSliverCost];
  })]);
}
function size(manager) {
  var root = manager.uiRoot;
  return { width: root.width || cc.winSize.width, height: root.height || cc.winSize.height };
}
function live(value) { return value && cc.isValid(value, true); }
function clearBindings(component) {
  component.build = component.callBack = component.cancelCall = component.choiceIndexes = null;
}
function align(node) {
  node.getComponentsInChildren(cc.Widget).forEach(function (widget) {
    if (widget.enabled && widget.node.activeInHierarchy) widget.updateAlignment();
  });
}
function layoutState(component) {
  if (!component._choicePrepared || !component._choiceRows || !component._choiceRows.length) return null;
  var ready = component._choiceRows.every(function (row) {
    return live(row.getChildByName("sprIcon").getComponent(cc.Sprite).spriteFrame);
  });
  if (!ready) return null;
  var labels = component.node.getComponentsInChildren(cc.Label).filter(function (label) {
    return label.enabled && label.node.activeInHierarchy;
  });
  if (labels.some(function (label) { return !!label._localizedFontRequest; })) return null;
  return labels.map(function (label) {
    return [label.string, label.fontSize, label.lineHeight, label.node.width, label.node.height].join("|");
  }).join(";");
}

function Pool(manager, language) {
  this.manager = manager;
  this.uiRoot = manager.uiRoot;
  this.language = language;
  this.locale = language.currentLan;
  this.catalog = language.catalog;
  this.size = size(manager);
  this.uid = require("KinghtFallConfig").KinghtFallUIID.UIBuildSel;
  this.records = [];
  this.ready = false;
  this.host = new cc.Node("PreparedConstructionMenus");
  this.host._preparedUIHost = true;
  this.host.group = this.uiRoot.group;
  this.host.setContentSize(this.size.width, this.size.height);
  this.host.setPosition(this.size.width * 4, 0);
  this.host.parent = this.uiRoot;
}
Pool.prototype.current = function () {
  var current = size(this.manager);
  return live(this.host) && live(this.uiRoot) && this.manager.uiRoot === this.uiRoot &&
    this.locale === this.language.currentLan && this.catalog === this.language.catalog &&
    current.width === this.size.width && current.height === this.size.height;
};
Pool.prototype.take = function (args) {
  if (!this.ready) return null;
  if (!this.current()) { this.dispose(); return null; }
  var key = signature(args[0], args[3]);
  var record = this.records.find(function (entry) { return entry.key === key && live(entry.component); });
  return record && this.canReuse(record.component) ? record.component : null;
};
Pool.prototype.canReuse = function (component) {
  return this.ready && this.current() && live(component) && live(component.node) && component.isclose &&
    component._preparedUIParked && component.node.parent === this.host && component.node.activeInHierarchy;
};
Pool.prototype.matches = function (component, build, values) {
  return this.ready && this.current() && component._preparedMenuKey === signature(build, values);
};
Pool.prototype.willOpen = function (component) {
  component._preparedUIParked = false;
  var root = component.node.getChildByName("root");
  root.setScale(component._preparedRootScale);
  component.node.resumeSystemEvents(true);
};
Pool.prototype.park = function (component) {
  if (!this.ready || !this.current()) { this.dispose(); return false; }
  component._preparedUIParked = true;
  component.node.pauseSystemEvents(true);
  clearBindings(component);
  component.node.setParent(this.host);
  component.node.setPosition(0, 0);
  component.node.getChildByName("root").setScale(component._preparedRootScale);
  return true;
};
Pool.prototype.dispose = function () {
  var repaintError = null;
  if (this._sceneRepaint) { try { this._sceneRepaint.finish(null, false); } catch (error) { repaintError = error; } }
  this.ready = false;
  if (this.cancelFrame) this.cancelFrame();
  if (this.unregister) this.unregister();
  var manager = this.manager, uid = this.uid;
  this.records.forEach(function (record) {
    var component = record.component;
    component._preparedUIProvider = null;
    component._preparedUIParked = false;
    component.cache = false;
    if (manager.uichace.get(uid) === component) manager.uichace.delete(uid);
    // An open decision remains owned by UIMgr and closes through its normal
    // cancellation/refund path. Only parked presentation nodes belong to us.
    if (manager.uistatck.get(uid) !== component && live(component.node)) {
      clearBindings(component);
      component.node.destroy();
    }
  });
  this.records.length = 0;
  if (this.camera) this.camera.targetTexture = null;
  if (this.texture) this.texture.destroy();
  if (live(this.cameraNode)) this.cameraNode.destroy();
  if (live(this.host)) this.host.destroy();
  if (activePool === this) activePool = null;
  if (repaintError) throw repaintError;
};
Pool.prototype.afterFrame = function (callback, fail) {
  var pool = this, settled = false, event = cc.Director && cc.Director.EVENT_AFTER_DRAW;
  if (!event) throw new Error("Construction menu preparation needs an active renderer");
  function cancel() {
    if (settled) return;
    settled = true;
    clearTimeout(timeout);
    cc.director.off(event, drawn);
    pool.cancelFrame = null;
  }
  function drawn() { cancel(); setTimeout(callback, 0); }
  var timeout = setTimeout(function () { cancel(); fail(new Error("Construction menu preparation did not render")); }, 15000);
  this.cancelFrame = cancel;
  cc.director.once(event, drawn);
};
Pool.prototype.paint = function (component) {
  if (!this.camera) {
    this.cameraNode = new cc.Node("ConstructionWarmupCamera");
    this.cameraNode.parent = this.uiRoot;
    this.camera = this.cameraNode.addComponent(cc.Camera);
    this.camera.enabled = false;
    this.camera.alignWithScreen = false;
    this.camera.ortho = true;
    this.camera.nearClip = -1000;
    this.camera.farClip = 1000;
    this.camera.backgroundColor = cc.color(0, 0, 0, 0);
    this.camera.clearFlags = cc.Camera.ClearFlags.COLOR | cc.Camera.ClearFlags.DEPTH | cc.Camera.ClearFlags.STENCIL;
    // The discarded target uploads full-resolution label/icon textures. It
    // never replaces the real UI or changes its raster dimensions/quality.
    this.texture = new cc.RenderTexture();
    this.texture.initWithSize(64, 128, cc.gfx.RB_FMT_S8);
  }
  var origin = this.host.convertToWorldSpaceAR(cc.v2(0, 0));
  var up = this.host.convertToWorldSpaceAR(cc.v2(0, 1));
  // The camera and host share a parent. World coordinates here would apply
  // the Canvas translation twice and crop the warmup render.
  this.cameraNode.setPosition(this.host.x, this.host.y, 0);
  this.camera.orthoSize = Math.max(this.size.height, this.size.width * 2) * Math.hypot(up.x - origin.x, up.y - origin.y) / 2;
  this.camera.targetTexture = this.texture;
  try { this.camera.render(component.node); }
  finally {
    this.camera.targetTexture = null;
    if (cc.sys && cc.sys.isNative && cc.RenderFlow) {
      // JSB updates transforms/opacity scene-wide for a manual camera, but
      // rebuilds vertices only in its selected subtree. The normal renderer
      // still needs those flags for every other node (including the HUD).
      var flags = cc.RenderFlow.FLAG_WORLD_TRANSFORM | cc.RenderFlow.FLAG_OPACITY;
      function restore(node) {
        node._renderFlag |= flags;
        node.children.forEach(restore);
      }
      var scene = cc.director.getScene();
      if (scene) restore(scene);
    }
  }
};

function prepare(data, manager, done) {
  var language = require("LanguageMgr").LanguageMgr.getInstance();
  if (activePool && activePool.ready && activePool.current()) { done(null, activePool); return; }
  if (waiters) { waiters.push(done); return; }
  waiters = [done];
  var pool, recipes = plan(data), position = 0, finished = false;
  function finish(error) {
    if (finished) return;
    finished = true;
    if (error && pool) { try { pool.dispose(); } catch (cleanupError) { if (cc.error) cc.error(cleanupError); } }
    var callbacks = waiters; waiters = null;
    var firstError = null;
    callbacks.forEach(function (callback) {
      try { callback(error || null, error ? null : pool); }
      catch (callbackError) { if (!firstError) firstError = callbackError; }
    });
    if (firstError) throw firstError;
  }
  try {
    if (activePool) activePool.dispose();
    pool = activePool = new Pool(manager, language);
    var template = manager.uichace.get(pool.uid);
    if (!template || !live(template.node)) throw new Error("Construction menu prefab is not ready");
    manager.uichace.delete(pool.uid);
    var BaseUI = require("BaseUI").default;
    // Clone before activating the first menu, so every variant starts from the
    // original prefab rather than another variant's generated rows/listeners.
    if (!recipes.length) template.node.destroy();
    recipes.forEach(function (recipe, index) {
      var node = index ? cc.instantiate(template.node) : template.node;
      node.active = false;
      var component = node.getComponent(BaseUI);
      if (!component) { node.destroy(); throw new Error("Construction menu has no controller"); }
      pool.records.push({ component: component, key: signature(facade(recipe), recipe.choices), recipe: recipe });
    });
    function next() {
      try {
        if (!pool.current()) throw new Error("Construction menu preparation context changed");
        if (position === pool.records.length) {
          pool.host.opacity = 0;
          pool.records.forEach(function (record) {
            var component = record.component;
            component.node.opacity = 255;
            clearBindings(component);
            component.isclose = true;
            component._resourceGeneration++;
            component.cache = true;
            component._preparedUIProvider = pool;
            component._preparedUIParked = true;
            component._preparedMenuKey = record.key;
            component._preparedRootScale = component.node.getChildByName("root").scale;
            component.node.pauseSystemEvents(true);
          });
          if (pool.camera) pool.camera.targetTexture = null;
          if (pool.texture) { pool.texture.destroy(); pool.texture = null; }
          if (live(pool.cameraNode)) pool.cameraNode.destroy();
          pool.camera = pool.cameraNode = null;
          pool.ready = true;
          pool.renderedScene = cc.director.getScene();
          pool.unregister = manager.registerPreparedUI(pool.uid, pool);
          finish(); return;
        }
        var record = pool.records[position++], component = record.component;
        component.init(facade(record.recipe), null, null, record.recipe.choices);
        component.node.parent = pool.host;
        component.node.active = true;
        component.node.pauseSystemEvents(true);
        align(component.node);
        var previous = null, stable = 0, frames = 0;
        function settled() {
          try {
            if (!pool.current() || !live(component)) throw new Error("Construction menu preparation was retired");
            var state = layoutState(component);
            stable = state !== null && state === previous ? stable + 1 : 0;
            previous = state;
            if (state !== null && stable >= 2) {
              pool.paint(component);
              component.node.opacity = 0;
              next();
            } else if (++frames > 180) throw new Error("Construction menu layout or textures did not become ready");
            else pool.afterFrame(settled, finish);
          } catch (error) { if (finished) throw error; finish(error); }
        }
        pool.afterFrame(settled, finish);
      } catch (error) { if (finished) throw error; finish(error); }
    }
    next();
  } catch (error) { if (finished) throw error; finish(error); }
}
exports.plan = plan;
exports.signature = signature;
exports.prepare = prepare;
exports.Pool = Pool;

// A scene launch reactivates persistent labels and resets the Web dynamic
// atlas. Repaint the existing presentations before Main removes UILoading.
// Provider ownership stays ready: this never instantiates or rebinds a menu.
function repaintScene(done, isCurrent) {
  var pool = activePool, scene = cc.director.getScene();
  if (cc.sys && cc.sys.isNative || !pool || !pool.ready || !pool.current() || pool.renderedScene === scene) { done(null); return; }
  if (pool._sceneRepaint && pool._sceneRepaint.scene === scene) {
    pool._sceneRepaint.waiters.push({ done: done, current: isCurrent }); return;
  }
  if (pool._sceneRepaint) pool._sceneRepaint.finish(null, false);
  var job = { scene: scene, waiters: [{ done: done, current: isCurrent }], finished: false };
  var hostOpacity = pool.host.opacity, opacities = pool.records.map(function (record) { return record.component.node.opacity; }), index = 0;
  pool._sceneRepaint = job;
  function current() {
    return job.waiters.some(function (entry) { try { return !entry.current || entry.current(); } catch (_) { return false; } });
  }
  function finish(error, rendered, retiredScene) {
    if (job.finished) return;
    job.finished = true;
    function clean(operation) { try { operation(); } catch (issue) { if (!error) error = issue; } }
    clean(function () { if (pool.cancelFrame) pool.cancelFrame(); });
    clean(function () { cc.director.off(cc.Director.EVENT_BEFORE_SCENE_LAUNCH, retired); });
    clean(function () { if (live(pool.host)) pool.host.opacity = hostOpacity; });
    pool.records.forEach(function (record, at) { clean(function () { if (live(record.component.node)) record.component.node.opacity = opacities[at]; }); });
    clean(function () { if (pool.camera) pool.camera.targetTexture = null; });
    clean(function () { if (pool.texture) pool.texture.destroy(); }); pool.texture = null;
    clean(function () { if (live(pool.cameraNode)) pool.cameraNode.destroy(); });
    pool.camera = pool.cameraNode = null;
    if (pool._sceneRepaint === job) pool._sceneRepaint = null;
    if (rendered && !error) pool.renderedScene = scene;
    var firstError = null;
    job.waiters.forEach(function (entry) { try { entry.done(error || null, !!retiredScene); } catch (issue) { if (!firstError) firstError = issue; } });
    job.waiters.length = 0;
    if (firstError) throw firstError;
  }
  job.finish = finish;
  function retired() { finish(null, false, true); }
  cc.director.on(cc.Director.EVENT_BEFORE_SCENE_LAUNCH, retired);
  function next() {
    if (job.finished) return;
    if (cc.director.getScene() !== scene) { finish(null, false, true); return; }
    if (!current() || !pool.current()) { finish(null, false); return; }
    if (index === pool.records.length) { finish(null, true); return; }
    var component = pool.records[index++].component;
    // A real decision opened programmatically during loading remains owned by
    // UIMgr. Do not paint, reparent or cancel it to complete an optimization.
    if (!pool.canReuse(component)) { finish(null, false); return; }
    component.node.opacity = 255;
    align(component.node);
    var previous = null, stable = 0, frames = 0;
    function settled() {
      if (job.finished) return;
      try {
        if (cc.director.getScene() !== scene) { finish(null, false, true); return; }
        if (!current() || !pool.current() || !pool.canReuse(component)) { finish(null, false); return; }
        var state = layoutState(component);
        stable = state !== null && state === previous ? stable + 1 : 0; previous = state;
        if (state !== null && stable >= 2) {
          pool.paint(component); component.node.opacity = 0; next();
        } else if (++frames > 180) finish(new Error("Construction menus did not settle after scene launch"), false);
        else pool.afterFrame(settled, finish);
      } catch (error) { if (job.finished) throw error; finish(error, false); }
    }
    pool.afterFrame(settled, finish);
  }
  try {
    pool.host.opacity = 255;
    pool.records.forEach(function (record) { record.component.node.opacity = 0; });
    next();
  } catch (error) { if (job.finished) throw error; finish(error, false); }
}
exports.repaintScene = repaintScene;
