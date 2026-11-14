"use strict";
// A stage owns its resource references until it closes. Preparing resources
// never creates actors, plays audio, advances a wave, or changes player saves.
var serial = 0;
function buildingKinds(level) {
  var kinds = {1: true};
  [1,2,3,4].forEach(function (tier) { (level["HomeLevel" + tier + "Unlock"] || []).forEach(function (entry) { if (entry[0]) kinds[entry[0]] = true; }); });
  return Object.keys(kinds);
}
function unitIds(level) {
  var ids = {};
  (level.WaveCfg || []).forEach(function (wave) {
    if (Array.isArray(wave.SpawnTimeline)) wave.SpawnTimeline.forEach(function (entry) { ids[entry.unitId] = true; });
    else (wave.RefreshSoldierKind || []).forEach(function (group) { (String(group).split("#")[1] || "").split(";").forEach(function (entry) { var id = Number(entry.split(",")[0]); if (id) ids[id] = true; }); });
  });
  return Object.keys(ids);
}
function collector() {
  var items = [], seen = {};
  function add(bundle, path, type, uuid) {
    if (typeof path !== "string" || !path) return;
    var key = (uuid ? "uuid:" : bundle + "/") + path + ":" + type;
    if (!seen[key]) { seen[key] = true; items.push({key:key,bundle:bundle,path:path,type:type,uuid:!!uuid}); }
  }
  return {items:items,add:add};
}
function plan(config, level, names) {
  var out = collector(), add = out.add, allies = {};
  add(names.IconMap, level.prefab, "prefab");
  ["characters/catalog", "character-parts/catalog", "projectiles/catalog"].forEach(function (path) { add("resources", path, "json"); });
  buildingKinds(level).forEach(function (id) {
    (config.BuildEnum[id] && config.BuildEnum[id].levelList || []).forEach(function (row) {
      add(names.IconBuild, row.Icon, "frame");
      function artwork(value) { if (!value || typeof value !== "object") return; Object.keys(value).forEach(function (key) { if ((key === "sprite" || key === "emptySprite") && typeof value[key] === "string") add("resources", value[key], "frame"); else if (typeof value[key] === "object") artwork(value[key]); }); }
      artwork(row.Appearance);
      if (id === "3" && row.Data) allies[row.Data[1]] = true;
    });
  });
  unitIds(level).forEach(function (id) { var unit = config.SoldierCfg[id]; if (!unit) throw Error("Missing stage enemy " + id); add(names.Enemy, unit.prefab, "prefab"); if (unit.loadIcon) add(unit.loadIcon.indexOf("@icon/") === 0 ? "resources" : names.Enemy, unit.loadIcon.indexOf("@icon/") === 0 ? unit.loadIcon.slice(6) : "icon/" + unit.loadIcon, "frame"); });
  Object.keys(allies).forEach(function (id) { var unit = config.AllyCfg && config.AllyCfg[id] || config.SoldierCfg[id]; if (!unit) throw Error("Missing stage ally " + id); add(names.Enemy, "Play" + unit.prefab, "prefab"); });
  Object.keys(config.GoodsCfg||{}).forEach(function(id){var icon=config.GoodsCfg[id].icon;if(typeof icon==='string')add(icon.indexOf('@icon/')===0?'resources':names.IconGood,icon.indexOf('@icon/')===0?icon.slice(6):icon,'frame');});
  var unitTypes=config.GameTools&&config.GameTools.unitTypes||{};Object.keys(unitTypes).forEach(function(id){var icon=unitTypes[id].icon;if(typeof icon==='string')add(icon.indexOf('@icon/')===0?'resources':names.Enemy,icon.indexOf('@icon/')===0?icon.slice(6):'icon/'+icon,'frame');});
  add(names.IconMap, "ItemHp", "prefab"); add(names.Enemy, "ItemHp", "prefab");
  return {items:out.items,enemies:unitIds(level),allies:Object.keys(allies),kinds:buildingKinds(level)};
}
function presentationPlan(config, level, base, catalogs, options) {
  var out = collector(), add = out.add, profiles = catalogs.characters, parts = {}, selected = [], projectiles = catalogs.projectiles;
  (catalogs.parts.parts || []).forEach(function (part) { parts[part.id] = part; });
  Object.keys(profiles.assignments || {}).forEach(function (key) {
    var bits = key.split(":"), used = bits[0] === "hero" || bits[0] === "enemy" && base.enemies.indexOf(bits[1]) >= 0 || bits[0] === "ally" && base.allies.indexOf(bits[1]) >= 0;
    var profile = used && profiles.profiles[profiles.assignments[key]];
    if (!profile || selected.indexOf(profile) >= 0) return; selected.push(profile);
    function baked(value) { if (!value || typeof value !== "object") return; if (value.resource) add("resources", value.resource, "spine"); Object.keys(value).forEach(function (key) { if (typeof value[key] === "object") baked(value[key]); }); }
    baked(profile.baked); baked(profile.bakedLayers);
    (profile.parts || []).forEach(function (part) { var asset = parts[part.sprite]; if (asset) add("resources", asset.resource, "texture"); });
  });
  var needed = {};
  Object.keys(projectiles.assignments || {}).forEach(function (key) { var bits = key.split(":"), used = key === "hero" || /^tower/.test(key) || bits[0] === "enemy" && base.enemies.indexOf(bits[1]) >= 0 || bits[0] === "ally" && base.allies.indexOf(bits[1]) >= 0; if (used) Object.keys(projectiles.assignments[key]).forEach(function (field) { var value = projectiles.assignments[key][field]; if (typeof value === "string") needed[value] = true; }); });
  (projectiles.assets || []).forEach(function (asset) {
    if (needed[asset.id] || /^hero-skin:/.test(asset.id) || asset.sourcePart && selected.some(function (profile) { return (profile.parts || []).some(function (part) { return part.sprite === asset.sourcePart; }); })) add(asset.bundle || "resources", asset.resource, asset.kind === "spine" ? "spine" : asset.kind === "flipbook" ? "texture" : "frame");
  });
  (options.skillClips || []).forEach(function (clip) { if (clip.style === options.style) add(clip.bundle || "resources", clip.resource, clip.kind === "spine" ? "spine" : "frame"); });
  var visual=options.skills&&options.skills.visual||{};
  ['resource','impactResource','passiveResource','beamResource','markResource','buffResource'].forEach(function(prefix){
    var id=visual[prefix];if(!id)return;var clip=(options.skillClips||[]).find(function(clip){return clip.uuid===id;});
    if(clip)(options.skillClips||[]).filter(function(part){return part===clip||part.group&&part.group===clip.group;}).forEach(function(part){add(part.bundle||'resources',part.resource,part.kind==='spine'?'spine':'frame');});
    else add(visual[prefix+'Bundle']||'',visual[prefix+'Path']||id,visual[prefix+'Kind']==='spine'?'spine':'frame',!visual[prefix+'Path']);
  });
  function resources(value) {
    if (!value || typeof value !== "object") return;
    if (value.resource && value.resourcePath && value.resourceBundle) add(value.resourceBundle, value.resourcePath, value.resourceKind === "spine" ? "spine" : "frame");
    if (value.clip) add(value.bundle || "", value.path || value.clip, "audio", !value.path);
    Object.keys(value).forEach(function (key) { if (typeof value[key] === "object") resources(value[key]); });
  }
  resources(options.skills);
  Object.keys(options.effects || {}).forEach(function (key) { add(options.names.Audio, options.effects[key].path, "audio"); });
  Object.keys(options.prefabs || {}).forEach(function (key) { if (/^Effect/.test(key)) add(options.names.Effect, options.prefabs[key], "prefab"); });
  Object.keys(options.audio || {}).forEach(function (key) { var entry = options.audio[key]; if (entry.path && entry.bundle) add(entry.bundle, entry.path, "audio"); });
  var voices={90001:"royal-knight",90002:"heavy-infantry",90003:"crossbowman",90004:"cavalry"};
  base.allies.forEach(function(id){var name=voices[id];if(!name)return;var path="voices/units/"+name+"/"+name;[1,2,3].forEach(function(tier){[1,2].forEach(function(variant){add(options.names.Audio,path+"-level-"+tier+"-variant-"+variant,"audio");});});["rally","follow"].forEach(function(kind){[1,2,3].forEach(function(variant){add(options.names.Audio,path+"-"+kind+"-variant-"+variant,"audio");});});if(level.EnvironmentBiome)["build","rally","follow"].forEach(function(kind){add(options.names.Audio,path+"-biome-"+level.EnvironmentBiome+"-"+kind,"audio");});});
  return out.items;
}
function Session(options) {
  this.options = options; this.key = "StageAssetWarmup:" + (++serial); this.assets = {}; this.pending = {}; this.held = []; this.rejectors = []; this.closed = false; this.ready = false; this.completed = 0; this.total = 0; this.lastProgress=0;
}
Session.prototype.current = function () { return !this.closed && !this.cancelled && (!this.options.current || this.options.current()); };
Session.prototype.progress = function (value) { this.lastProgress=Math.max(this.lastProgress,value);if (this.current() && this.options.progress) this.options.progress(this.lastProgress); };
Session.prototype.load = function (item) {
  var self = this;
  if (this.pending[item.key]) return this.pending[item.key];
  return this.pending[item.key] = new Promise(function (resolve, reject) {
    self.rejectors.push(reject);
    self.options.load(item, function (error, asset) {
      if (!self.current()) return reject(Error("Stage preparation cancelled"));
      if (error || !asset) return reject(error || Error("Empty stage resource: " + item.path));
      self.assets[item.key] = asset; self.completed++; resolve(asset);
    }, self);
  });
};
Session.prototype.run = async function () {
  var o = this.options, base = plan(o.config, o.level, o.names), self = this;
  // Four active loads keep decoding responsive and bound transient allocations.
  async function batch(items,offset,weight) { items=items.filter(function(item){return !self.pending[item.key];});var position=0,completed=0;self.total+=items.length;async function worker() { while (position < items.length) { if (!self.current()) throw Error("Stage preparation cancelled"); await self.load(items[position++]);completed++;self.progress(offset+weight*completed/items.length); } } await Promise.all([worker(),worker(),worker(),worker()]);self.progress(offset+weight); }
  await batch(base.items,0,.35);
  var catalogs = {characters:this.assets["resources/characters/catalog:json"].json,parts:this.assets["resources/character-parts/catalog:json"].json,projectiles:this.assets["resources/projectiles/catalog:json"].json};
  await batch(presentationPlan(o.config,o.level,base,catalogs,o),.35,.4);
  if (o.prime) await o.prime(catalogs,this.assets);
  var prefab = this.assets[o.names.IconMap + "/" + o.level.prefab + ":prefab"];
  if (o.shadows) this.shadows = await o.shadows(prefab, this, function (value) { self.progress(.8 + value * .2); });
  if (!this.current()) { if(this.shadows)this.shadows.dispose(); throw Error("Stage preparation cancelled"); }
  this.rejectors=[];this.ready = true; this.progress(1); return prefab;
};
Session.prototype.cancel = function () {
  this.cancelled=true;
  this.rejectors.forEach(function(reject){reject(Error("Stage preparation cancelled"));});this.rejectors=[];
};
Session.prototype.dispose = function () {
  if (this.closed) return; this.closed = true; this.cancel();
  if (this.shadows) this.shadows.dispose();
  this.held.forEach(function (asset) { if (asset.decRef) asset.decRef(); }); this.held = [];
  if (this.options.release) this.options.release(this.key); this.assets = {}; this.pending = {};
};
function create(view, config, level) {
  var Config = require("KinghtFallConfig"), manager = require("ResourceMgr").ResourceMgr.getInstance(), style = require("HeroLoadout").selected(require("KinghtFallPlayerMgr").KinghtFallPlayerMgr.getInstance().getUserData()).id;
  var overlay = new cc.Node("StageLoading"); overlay.parent = view.node; overlay.zIndex = 10000; overlay.setContentSize(cc.winSize); overlay.addComponent(cc.BlockInputEvents);
  var g = overlay.addComponent(cc.Graphics); g.fillColor = cc.color(24,32,37,255); g.rect(-cc.winSize.width/2,-cc.winSize.height/2,cc.winSize.width,cc.winSize.height); g.fill();
  var text = new cc.Node("Progress"); text.parent = overlay; var label = text.addComponent(cc.Label); label.fontSize = 30; label.lineHeight = 40;
  var types = {prefab:cc.Prefab,frame:cc.SpriteFrame,texture:cc.Texture2D,json:cc.JsonAsset,audio:cc.AudioClip,spine:sp.SkeletonData};
  function decode(asset,type){
    if(type==='prefab'){if(asset.compileCreateFunction)asset.compileCreateFunction();if(asset.data&&asset.data.getComponentsInChildren)asset.data.getComponentsInChildren(sp.Skeleton).forEach(function(r){if(r.skeletonData&&r.skeletonData.getRuntimeData)r.skeletonData.getRuntimeData();});}
    else if(type==='spine'&&asset.getRuntimeData)asset.getRuntimeData();
  }
  var session = new Session({config:config,level:level,names:Config.KinghtFallBundelName,style:style,skills:require("HeroSkillSettings").effective(style,config),skillClips:require("HeroSkillVFXCatalog").clips,effects:require("BattleSoundCatalog").effects,prefabs:Config.KinghtFallPrefabName,audio:Config.KinghtFallAudioCF,
    current:function () { return !view.isclose && cc.isValid(view.node,true); },
    progress:function (value) { label.string = view.T("loading.progress", [Math.round(value*100)]); },
    load:function (item,done,owner) {
      function error(issue,retry,cancel) { manager.showRuntimeRecovery(issue,retry,function () { if (cancel) cancel(); owner.cancel(); if(!view.isclose)view.closeUI(); done(issue); },cancel); }
      if (item.uuid) manager.loadWithRecovery(item.path,function (callback) { cc.assetManager.loadAny({uuid:item.path,type:types[item.type]},callback); },function (asset) { if (!owner.current()) return done(Error("Stage preparation cancelled")); if (asset.addRef) asset.addRef(); owner.held.push(asset);try{decode(asset,item.type);done(null,asset);}catch(issue){done(issue);} },error,function () { return owner.current(); });
      else manager.loadRes(item.bundle,item.path,types[item.type],function (asset) { if(!owner.current()){require("ResCacheMgr").ResCacheMgr.getInstance().releaseAssetsFromMap(owner.key);return done(Error("Stage preparation cancelled"));}try{decode(asset,item.type);done(null,asset);}catch(issue){done(issue);} },false,60,owner.key,{onError:error,isCurrent:function () { return owner.current(); }});
    },
    prime:function (catalogs,assets) { require("CharacterAppearance").prime(catalogs.characters,catalogs.parts,assets); require("HeroBakedLooks").prime(assets); require("ProjectileLooks").prime(catalogs.projectiles); },
    shadows:function (prefab,owner,progress) { return require("BuildingShadowPreparation").prepare(prefab,config,level,owner,progress); },
    release:function (key) { require("ResCacheMgr").ResCacheMgr.getInstance().releaseAssetsFromMap(key); if (cc.isValid(overlay,true)) overlay.destroy(); }
  });
  session.reveal = function () { if (cc.isValid(overlay,true)) overlay.destroy(); };
  session.retire = function () { if(this.retiring)return;this.retiring=true;this.cancel();cc.director.once(cc.Director.EVENT_AFTER_DRAW,function(){session.dispose();}); };
  session.progress(0); return session;
}
exports.plan=plan; exports.presentationPlan=presentationPlan; exports.buildingKinds=buildingKinds; exports.unitIds=unitIds; exports.Session=Session; exports.create=create;
