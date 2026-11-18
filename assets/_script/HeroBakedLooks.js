"use strict";
// Normal Spine assets work in both JSB and the browser. Switch only during a
// looping locomotion pose so an attack/death callback is never replayed.
var renderers = new WeakMap(), jobs = {};
function originalId(renderer) { var record = renderers.get(renderer), asset = record ? record.original : renderer.skeletonData; return asset && (asset._uuid || asset.uuid); }
function baked(renderer) { var record = renderers.get(renderer); return !!record && renderer.skeletonData !== record.original; }
function apply(list, profile) {
  list.forEach(function (renderer) {
    if (!renderer.skeletonData) return;
    var record = renderers.get(renderer), id = originalId(renderer), desired = profile && profile.bakedLayers && profile.bakedLayers[id];
    if (!record && !desired) return;
    if (!record) { record = { original: renderer.skeletonData }; renderers.set(renderer, record); }
    var target = record.original;
    if (desired) {
      var job = jobs[desired.resource];
      if (!job || job.retryAt && Date.now() >= job.retryAt) {
        job = jobs[desired.resource] = {};
        try {
          cc.resources.load(desired.resource, sp.SkeletonData, function (error, asset) { if (error || !asset) job.retryAt = Date.now() + 1000; else job.asset = asset; });
        } catch (error) { job.retryAt = Date.now() + 1000; }
      }
      if (!job.asset) return;
      target = job.asset;
    }
    if (renderer.skeletonData === target) return;
    var track = renderer.getCurrent && renderer.getCurrent(0), animation = track && (track.getAnimation ? track.getAnimation() : track.animation);
    var name = animation && (animation.getName ? animation.getName() : animation.name);
    var loop = track ? !!(track.getLoop ? track.getLoop() : track.loop) : !!renderer.loop;
    if (track && !loop && name && !/^(idle|move|walk|run)$/.test(name)) return;
    var time = track && (track.getTrackTime ? track.getTrackTime() : track.trackTime) || 0;
    var rate = track && (track.getTimeScale ? track.getTimeScale() : track.timeScale);
    var skin = renderer._skeleton && renderer._skeleton.skin && renderer._skeleton.skin.name || renderer.defaultSkin;
    renderer.skeletonData = target;
    if (skin) renderer.setSkin(skin);
    if (name) { var resumed = renderer.setAnimation(0, name, loop); if (resumed) {
      if (resumed.setTrackTime) resumed.setTrackTime(time); else resumed.trackTime = time;
      if (typeof rate === "number" && isFinite(rate)) { if (resumed.setTimeScale) resumed.setTimeScale(rate); else resumed.timeScale = rate; }
    } }
  });
}
exports.apply = apply; exports.originalId = originalId; exports.baked = baked;
exports.prime = function (assets) { jobs={};Object.keys(assets||{}).forEach(function(key){if(key.indexOf("resources/")===0&&/:spine$/.test(key))jobs[key.slice(10,-6)]={asset:assets[key]};}); };
