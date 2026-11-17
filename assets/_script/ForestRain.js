"use strict";
// Authored, baked biome ambience in battles only. No input, audio, collision,
// actor state, saved data or combat RNG is owned by this component.
var Clock = require("./BiomeWeatherState"), Catalog = require("./WeatherVFXCatalog"), RainCatalog = require("./HeroSkillVFXCatalog"), Snow = require("./SnowWeather");
function valid(node) { return !!node && cc.isValid(node, true); }
function activate(node, value) { if (node.active !== value) node.active = value; }
function frameFor(art, index) {
  var frame = art.frames.get(index), clip = art.clip;
  if (!frame) {
    var base = art.asset.getRect(); frame = art.asset.clone();
    frame.setRect(cc.rect(base.x + index % clip.columns * clip.cell, base.y + Math.floor(index / clip.columns) * clip.cell, clip.cell, clip.cell));
    frame.setOriginalSize(cc.size(clip.cell, clip.cell)); frame.setOffset(cc.v2(0, 0)); art.frames.set(index, frame);
  }
  return frame;
}
var Weather = cc.Class({
  extends: cc.Component,
  init: function (runtime) {
    this.game = runtime.game; this.ui = runtime.ui; this.data = this.game.gameData; this.epoch = this.game._combatEpoch;
    this.biome = require("BattleSounds").biome(this.game); this.arts = new Map(); this.hidden = false; this.disposed = false;
    var cfg = this.data.levelCfg || {}, seed = String(cfg.ID || cfg.id || cfg.prefab || this.biome).split("").reduce(function (n, c) { return ((n * 33) ^ c.charCodeAt(0)) >>> 0; }, 5381);
    this.clock = Clock.create(seed, this.biome);
    this.ensureGround();
    this.hide = function () { if (!this.current()) { this.node.destroy(); return; } this.pauseSnow(true);this.hidden = true; activate(this.node, false); if (valid(this.ground)) activate(this.ground, false); };
    this.show = function () { if (!this.current()) { this.node.destroy(); return; } this.hidden = false; activate(this.node, true);this.pauseSnow(!!this.ui.isPauset||!this.ui.node.activeInHierarchy); if (valid(this.ground)) activate(this.ground, true); };
    cc.game.on(cc.game.EVENT_HIDE, this.hide, this); cc.game.on(cc.game.EVENT_SHOW, this.show, this);
  },
  current: function () {
    return this.game && valid(this.game.node) && valid(this.ui.node) && !this.ui.isclose && this.ui.ctrGame === this.game &&
      this.game.gameData === this.data && this.game._combatEpoch === this.epoch && require("BattleSounds").biome(this.game) === this.biome &&
      this.game.gameStatus !== require("KinghtFallModle").KinghtFallGameStage.End &&
      (!this.groundParent || this.game.ndDown === this.groundParent && valid(this.groundParent));
  },
  ensureGround: function () {
    // Map loading may finish after the planning HUD first installs weather.
    if (valid(this.ground) || !valid(this.game.ndDown)) return;
    this.ground = new cc.Node("Weather ground splashes"); this.ground.setParent(this.game.ndDown); this.groundParent = this.game.ndDown;
    this.ground.group = this.game.ndDown.group; this.ground.zIndex = 0; this.ground._depthGroundVisual = true;
  },
  pauseSnow: function(value,allowCapture){if(this.arts)this.arts.forEach(function(art){if(art.snow)art.nodes.forEach(function(record){Snow.pause(record,!!value,allowCapture);});});},
  prepare: function (kind, ground) {
    var art = this.arts.get(kind), self = this; if (art) return art;
    var clip = (kind.indexOf("forest-rain-") === 0 ? RainCatalog : Catalog).clips.filter(function (c) { return c.id === kind; })[0];
    if (!clip || ground && !valid(this.ground)) return null;
    art = { clip: clip, frames: new Map(), nodes: [], asset: null, ground: ground }; this.arts.set(kind, art);
    art.snow=Snow.supported(kind)&&!ground;
    cc.resources.load(art.snow?Snow.resource:clip.resource, cc.SpriteFrame, function (error, asset) {
      if (self.disposed || !valid(self.node) || self.arts.get(kind) !== art || !self.current()) return;
      if (error || !asset) { art.failed = true; return; } art.asset = asset.addRef ? asset.addRef() : asset;
    });
    return art;
  },
  viewport: function (ground) {
    var size = cc.view.getVisibleSize(), origin = cc.view.getVisibleOrigin ? cc.view.getVisibleOrigin() : cc.v2(0, 0);
    var parent = ground ? this.ground : this.node, camera = this.game.camera || cc.Camera && cc.Camera.main;
    function local(x, y) {
      var point = cc.v2(x, y);
      if (ground && camera && camera.getScreenToWorldPoint) point = camera.getScreenToWorldPoint(point);
      return parent.convertToNodeSpaceAR(point);
    }
    var a = local(origin.x, origin.y), b = local(origin.x + size.width, origin.y + size.height);
    return { minX: Math.min(a.x, b.x), minY: Math.min(a.y, b.y), width: Math.abs(b.x - a.x), height: Math.abs(b.y - a.y) };
  },
  paint: function (entity, seen, areas) {
    var art = this.prepare(entity.kind, entity.ground); if (!art) return; seen.add(art);
    if (!art.asset) return;
    var clip = art.clip, area = entity.ground ? areas.ground : areas.air;
    if (!area || !area.width || !area.height) return;
    if(art.snow){
      var snow=art.nodes[0];if(!snow){snow=Snow.create(this.node,entity.kind,art.asset,this.clock.seed,area);art.nodes.push(snow);}
      activate(snow.node,true);Snow.paint(snow,area,entity.opacity);return;
    }
    var cell = Math.max(256, area.width / 4, area.height / 6), columns, rows, startX, startY;
    if (entity.ground) {
      // World-aligned cells keep marks on the floor during camera movement.
      startX = Math.floor(area.minX / cell); startY = Math.floor(area.minY / cell);
      columns = Math.ceil((area.minX + area.width) / cell) - startX; rows = Math.ceil((area.minY + area.height) / cell) - startY;
    } else { startX = area.minX / cell; startY = area.minY / cell; columns = Math.ceil(area.width / cell); rows = Math.ceil(area.height / cell); }
    var count = Math.min(entity.ground ? 35 : 24, columns * rows), opacity = Math.round(255 * entity.opacity);
    for (var i = 0; i < count; i++) {
      var x = startX + i % columns, y = startY + Math.floor(i / columns), phase = entity.ground ? ((x * 73 + y * 137) % 127 + 127) % 127 * .017 : i * .157;
      var index = Math.floor((entity.age + phase) * clip.fps) % clip.frames, record = art.nodes[i];
      if (!record || !valid(record.node)) { var node = new cc.Node("Biome weather " + entity.kind); node.setParent(entity.ground ? this.ground : this.node); node.group = node.parent.group; record = { node: node, sprite: node.addComponent(cc.Sprite), index: -1 }; art.nodes[i] = record; }
      activate(record.node, true);
      var px = (x + .5) * cell, py = (y + .5) * cell, scale = cell / clip.cell;
      if (record.x !== px || record.y !== py) { record.node.setPosition(cc.v2(px, py)); record.x = px; record.y = py; }
      if (record.scale !== scale) { record.node.scale = scale; record.scale = scale; }
      if (record.node.opacity !== opacity) record.node.opacity = opacity;
      if (record.index !== index) { record.sprite.spriteFrame = frameFor(art, index); record.index = index; }
    }
    for (var n = count; n < art.nodes.length; n++) if (valid(art.nodes[n].node)) activate(art.nodes[n].node, false);
  },
  update: function (dt) {
    if (!this.clock || this.disposed) return;
    if (!this.current() || this.game.gameStatus === require("KinghtFallModle").KinghtFallGameStage.End) { this.node.destroy(); return; }
    var paused=this.hidden||this.ui.isPauset||!this.ui.node.activeInHierarchy;
    this.pauseSnow(paused);
    if(paused)return;
    this.ensureGround();
    var entities = Clock.step(this.clock, Math.max(0, Math.min(1, dt))), seen = new Set(), areas = { air: this.viewport(false), ground: valid(this.ground) ? this.viewport(true) : null };
    for (var i = 0; i < entities.length; i++) this.paint(entities[i], seen, areas);
    this.arts.forEach(function (art) { if (!seen.has(art)) art.nodes.forEach(function (record) { if (valid(record.node)) activate(record.node, false); }); });
  },
  onDisable: function () { this.pauseSnow(true,false);if (valid(this.ground)) activate(this.ground, false); if (this.clock && !this.disposed && !this.current()) this.node.destroy(); },
  // Reconcile snow from update, after parent activation has completed. Both a
  // capture and releasing its sprite can otherwise mutate an activating tree.
  onEnable: function () { if (!this.hidden && valid(this.ground)) activate(this.ground, true); },
  onDestroy: function () {
    this.disposed = true; cc.game.off(cc.game.EVENT_HIDE, this.hide, this); cc.game.off(cc.game.EVENT_SHOW, this.show, this);
    if (this.arts) this.arts.forEach(function (art) { art.nodes.forEach(function (record) { if(art.snow){Snow.releaseSnapshot(record);if(valid(record.node)){record.system.spriteFrame=null;record.node.destroy();}}else if (valid(record.node)) record.sprite.spriteFrame = null; }); art.frames.forEach(function (frame) { frame.destroy(); }); if (art.asset && art.asset.decRef) art.asset.decRef(); });
    if (valid(this.ground)) this.ground.destroy();
    if (this.game && this.game._forestRain === this) delete this.game._forestRain;
  }
});
exports.ensure = function (runtime) {
  if (typeof CC_EDITOR !== "undefined" && CC_EDITOR || !runtime || !runtime.game || !runtime.ui || runtime.ui.isclose || !runtime.ui.ctrUI || !valid(runtime.ui.ctrUI.node) || runtime.game.gameStatus === require("KinghtFallModle").KinghtFallGameStage.End || !Clock.supported(require("BattleSounds").biome(runtime.game))) return;
  var previous = runtime.game._forestRain;
  if (previous && valid(previous.node)) { if (previous.current()) return; previous.node.destroy(); }
  var node = new cc.Node("Battle biome weather"); node.setParent(runtime.ui.ctrUI.node); node.zIndex = -1;
  var weather = node.addComponent(Weather); runtime.game._forestRain = weather; weather.init(runtime);
};
