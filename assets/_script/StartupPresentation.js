"use strict";
var Progress = require("StartupProgress"), state = null;
var CHANNEL = "KinghtFallBG", CUE = "hkd-start-screen";
function language() { return require("LanguageMgr").LanguageMgr.getInstance(); }
function text(key, fallback, args) {
  var lang = language(), value = lang.t(key, args);
  return value && value !== key ? value : fallback;
}
function live(node, cc) { return node && cc.isValid(node, true); }
function playStart(cc) {
  var audio = require("AudioMgr").AudioMgr.getInstance();
  if (!audio.audioLifecycleBound) audio.init({});
  if (!audio._startupMusicConfigured) {
    var config = {}; config[CUE] = { bundle: "KinghtFallAudio", path: "music/start-screen", continuous: true };
    audio.addAdConf(config); audio._startupMusicConfigured = true;
  }
  audio.playMusic(CUE, CHANNEL);
}
function release(current, cc) {
  if (!current) return;
  if (current.session) {
    current.session.close();
    var resources = require("ResourceMgr").ResourceMgr.getInstance();
    if (resources.startupProgress === current.session) resources.startupProgress = null;
  }
  if (current.resize) cc.view.off("canvas-resize", current.resize);
  if (current.overlay) current.overlay.destroy();
  if (live(current.backdrop, cc)) current.backdrop.destroy();
  if (current.persisted && live(current.startRoot, cc)) {
    if (cc.game.removePersistRootNode) cc.game.removePersistRootNode(current.startRoot);
    current.startRoot.destroy();
  }
}
function fit(content, cc) {
  if (!live(content, cc)) return;
  var size = cc.view.getVisibleSize();
  var scale = Math.min(1, (size.width - 64) / 720, (size.height - 96) / 1120);
  content.setScale(scale);
  var logo = content.getChildByName("GameLogo");
  if (logo) {
    var inset = 44;
    if (cc.sys && cc.sys.getSafeAreaRect && cc.view.getVisibleOrigin) {
      var safe = cc.sys.getSafeAreaRect(), origin = cc.view.getVisibleOrigin();
      inset += Math.max(0, origin.y + size.height - safe.y - safe.height);
    }
    logo.y = (size.height / 2 - inset) / scale - logo.height * Math.abs(logo.scaleY) * (1 - logo.anchorY);
  }
}
exports.start = function (owner, cc) {
  release(state, cc);
  state = { active: true, startOwner: owner, startRoot: owner.node, content: owner.content };
  playStart(cc);
};
exports.carry = function (owner, cc) {
  if (!state || state.startOwner !== owner) exports.start(owner, cc);
  if (!state.persisted) {
    // Carry artwork without its Canvas. A second persisted Canvas prevents the
    // loading Canvas from becoming Canvas.instance before the lobby opens.
    var root = new cc.Node("Startup artwork carry");
    root.parent = cc.director.getScene(); root.group = owner.node.group;
    root.setPosition(owner.node.getPosition()); root.setScale(owner.node.scaleX, owner.node.scaleY);
    var background = owner.node.getChildByName("Background");
    if (background) background.parent = root;
    owner.content.parent = root;
    state.startRoot = root; cc.game.addPersistRootNode(root); state.persisted = true;
  }
  playStart(cc);
};
exports.restore = function (owner, cc) {
  if (!state || state.startOwner !== owner || !state.persisted || !live(state.startRoot, cc)) return;
  var root = state.startRoot, background = root.getChildByName("Background");
  if (background) background.parent = owner.node;
  owner.content.parent = owner.node;
  if (cc.game.removePersistRootNode) cc.game.removePersistRootNode(root);
  root.destroy(); state.startRoot = owner.node; state.persisted = false;
};
exports.loading = function (owner, parent, cc) {
  if (!state || !state.active) { state = { active: true }; playStart(cc); }
  var current = state, legacy = parent.getChildByName("UILoading") || parent;
  current.loadingOwner = owner;
  var backdrop = current.backdrop = new cc.Node("Startup backdrop");
  backdrop.parent = parent; backdrop.group = parent.group; backdrop.zIndex = 9998;
  legacy.zIndex = 9999;
  if (live(current.startRoot, cc)) {
    var background = current.startRoot.getChildByName("Background");
    if (background) background.parent = backdrop;
    if (live(current.content, cc)) {
      current.content.parent = backdrop;
      var button = current.content.getChildByName("StartButton");
      if (button) button.active = false;
    }
    if (cc.game.removePersistRootNode) cc.game.removePersistRootNode(current.startRoot);
    current.startRoot.destroy(); current.startRoot = null;
  } else {
    require("ResourceMgr").ResourceMgr.getInstance().loadRes("resources", "startup/backdrop", cc.Prefab, function (prefab) {
      if (state !== current || !current.active || !live(backdrop, cc)) return;
      var artwork = cc.instantiate(prefab); artwork.parent = backdrop;
      current.content = artwork.getChildByName("TitleContent"); fit(current.content, cc);
    }, { isCurrent: function () { return state === current && current.active && live(backdrop, cc); } });
  }
  current.resize = function () { fit(current.content, cc); };
  cc.view.on("canvas-resize", current.resize); current.resize();
  var view = { node: legacy, isclose: false, T: function (value) { return value; } };
  current.overlay = require("StageLoading").create(view, null, legacy, cc, {
    transparent: true, detailed: true, panelBottom: 190,
    title: text("startup.title", "Preparing your kingdom")
  });
  current.overlay.node.on(cc.Node.EventType.TOUCH_END, function () { if (live(owner, cc)) owner.retryLoading(); });
  current.session = Progress.create(function (snapshot) {
    if (state !== current || !current.active) return;
    current.overlay.progress(snapshot.value);
    var message = text("startup." + snapshot.phase, snapshot.phase);
    if (snapshot.total) message += " · " + text("startup.count", snapshot.completed + " of " + snapshot.total, [snapshot.completed, snapshot.total]);
    current.overlay.detail(message);
  });
  require("ResourceMgr").ResourceMgr.getInstance().startupProgress = current.session;
  return current.session;
};
exports.error = function (message) { if (state && state.overlay) state.overlay.detail(message); };
exports.isActive = function () { return !!(state && state.active); };
exports.finish = function (cc, complete, isCurrent) {
  var current = state;
  if (!current || !current.active || current.finishing) { if (!current || !current.finishing) complete(); return; }
  current.finishing = true;
  function done() {
    if (state !== current) return;
    if (isCurrent && !isCurrent()) { current.active = false; release(current, cc); state = null; require("AudioMgr").AudioMgr.getInstance().stopMusic(CHANNEL); return; }
    current.active = false; release(current, cc); state = null; complete();
    var config = require("KinghtFallConfig");
    require("AudioMgr").AudioMgr.getInstance().playMusic(config.KinghtFallAudioId.menu_bgm, config.KinghtFallParameter.BGMusic);
  }
  function ready() {
    if (state !== current) return;
    if (isCurrent && !isCurrent()) { done(); return; }
    if (current.session) current.session.complete();
    if (current.overlay) current.overlay.waitForDraw().then(done, done); else done();
  }
  // Decode the lobby cue before releasing the loading screen. Replacing the
  // startup cue then uses a ready clip on the same channel without a cold gap.
  var audio = require("AudioMgr").AudioMgr.getInstance(), config = require("KinghtFallConfig");
  var cue = audio.getAdConf && audio.getAdConf(config.KinghtFallAudioId.menu_bgm);
  if (cue && audio.loadClip) audio.loadClip(cue.bundle, cue.path, cue.path, ready);
  else ready();
};
exports.cancelLoading = function (owner, cc) {
  if (state && state.loadingOwner === owner && !owner._startupMainRequested) {
    state.active = false; release(state, cc); state = null;
    require("AudioMgr").AudioMgr.getInstance().stopMusic(CHANNEL);
  }
};
