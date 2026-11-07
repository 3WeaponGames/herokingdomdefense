/* Shared Browser/JSB integration fixture. Uses the real Creator engine and
 * shipped projectile classes; the fixture supplies isolated resource records.
 * No player data, editor scene, gameplay configuration or audio is loaded. */
async function projectileEngineSmoke(input) {
  var report = { engine: cc.ENGINE_VERSION, native: cc.sys.isNative, muted: true, checks: [], errors: [] };
  function check(condition, message) { if (!condition) throw Error(message); report.checks.push(message); }
  function delay(ms) { return new Promise(function (resolve) { setTimeout(resolve, ms); }); }
  var moduleCache = {}, fixtures = input.catalog, level = 1;
  var freeGame = { freeBullet: function () {}, freeEnemyBullet: function () {}, freeSoldierBullet: function () {}, freeBuildBullet: function () {} };
  function load(name) {
    if (name === "KinghtFallUIGame") return { default: { instance: { ctrGame: freeGame } } };
    if (name === "KinghtFallPlayerMgr") return { KinghtFallPlayerMgr: { getInstance: function () { return { getUserData: function () { return { getPersonLevel: function () { return level; } }; } }; } } };
    if (moduleCache[name]) return moduleCache[name].exports;
    var record = input.modules[name]; if (!record) throw Error("Unexpected fixture module: " + name);
    var module = moduleCache[name] = { exports: {} };
    cc._RF.push(module, record.uuid, name);
    try {
      new Function("module", "exports", "require", "__extends", "__decorate", record.source)(module, module.exports, load,
        function (Child, Parent) { Object.setPrototypeOf(Child, Parent); Child.prototype = Object.create(Parent.prototype); Child.prototype.constructor = Child; },
        function (decorators, target, key, descriptor) { if (key === undefined) return decorators.reduceRight(function (value, decorator) { return decorator(value) || value; }, target); for (var d = decorators.length - 1; d >= 0; d--) decorators[d](target, key, descriptor); });
    } finally { cc._RF.pop(); }
    return module.exports;
  }
  var textures = {}, resourceLoads = 0;
  function texture(asset) {
    var url = input.base + "/asset/" + asset.image.split("/").map(encodeURIComponent).join("/");
    if (!textures[url]) textures[url] = new Promise(function (resolve, reject) { cc.assetManager.loadRemote(url, { ext: ".png" }, function (error, image) { if (error) reject(error); else resolve(image); }); });
    return textures[url];
  }
  var itemProfiles = {}, assignments = {}, arrows = fixtures.assets.filter(function (a) { return a.sourcePart; });
  arrows.forEach(function (asset, i) { var id = "fixture-arrow-" + i; assignments["3:" + (i + 1)] = id; itemProfiles[id] = { base: { type: "item", id: "3:" + (i + 1) }, parts: [{ sprite: asset.sourcePart }] }; });
  var resources = { load: function (resource, type, callback) {
    resourceLoads++;
    var json = resource === "projectiles/catalog" ? fixtures : resource === "hero-items/catalog" ? { assignments: assignments, profiles: itemProfiles } : resource === "character-parts/catalog" ? { parts: arrows.map(function (a) { return { id: a.sourcePart, resource: a.resource }; }) } : null;
    if (json) { var asset = new cc.JsonAsset(); asset.json = json; setTimeout(function () { callback(null, asset); }, 0); return; }
    var entry = fixtures.assets.find(function (a) { return a.resource === resource; });
    if (!entry || entry.kind === "spine") { callback(Error("Unexpected fixture resource " + resource)); return; }
    texture(entry).then(function (image) { callback(null, type === cc.SpriteFrame ? new cc.SpriteFrame(image) : image); }, callback);
  } };
  cc.assetManager.bundles.add("resources", resources);
  // Original bundled static sprites use the real texture loader too.
  var originalGetBundle = cc.assetManager.getBundle;
  cc.assetManager.getBundle = function (name) { return name === "resources" ? resources : { load: resources.load }; };
  var scene = new cc.Scene(), cameraNode = new cc.Node("fixture-camera"); cameraNode.parent = scene; cameraNode.z = 1000;
  var camera = cameraNode.addComponent(cc.Camera); camera.ortho = true; camera.orthoSize = 160; camera.nearClip = .1; camera.farClip = 2000;
  camera.backgroundColor = cc.color(20, 28, 40, 255); camera.clearFlags = cc.Camera.ClearFlags.COLOR | cc.Camera.ClearFlags.DEPTH | cc.Camera.ClearFlags.STENCIL;
  cc.director.runSceneImmediate(scene);
  var owner = { node: scene, _combatEpoch: 1 }, looks = load("ProjectileLooks"), roots = [];
  async function waitFor(predicate, message) { for (var i = 0; i < 600; i++) { if (predicate()) return; await delay(10); } throw Error(message); }
  function shot(type, y) {
    var node = new cc.Node("fixture-" + type); node.parent = scene; node.setPosition(-180, y || 0);
    var original = new cc.Node("authored-art-placeholder"); original.parent = node;
    var sprite = original.addComponent(cc.Sprite);
    var bullet = node.addComponent(load("KinghtFallBullet" + type).default); bullet.bullet = original; bullet.combatContext = owner; bullet.speed = type === "Build" ? 550 : 500;
    bullet.ctrPar = { freeBullet: function () {} }; bullet.spAni = { setAnimation: function () {} }; roots.push(node);
    return { bullet: bullet, original: sprite, node: node };
  }
  function target(y) { var node = new cc.Node("target"); node.parent = scene; node.setPosition(180, y || 0); node._combatGeneration = 1; roots.push(node); return node; }
  function trace(bullet, victim) {
    var damage = 0, positions = []; bullet.setTag(bullet.node.getPosition(), victim, function () { damage += 17; });
    for (var i = 0; i < 240 && !damage; i++) { bullet.onUpdate(1 / 60); positions.push([bullet.node.x, bullet.node.y, bullet.node.angle, bullet.state]); }
    return { damage: damage, positions: positions };
  }
  try {
    for (var i = 0; i < arrows.length; i++) {
      level = i + 1; var sample = shot("Play", 0), victim = target(0);
      looks.prepare(sample.bullet, owner, "hero"); sample.bullet.setTag(sample.node.getPosition(), victim, function () {});
      await waitFor(function () { return sample.bullet._projectileVisual.node; }, "Item arrow failed to bind: " + arrows[i].name);
      check(sample.bullet._projectileVisual.clip.descriptor.sourcePart === arrows[i].sourcePart, "Equipped arrow " + (i + 1) + " renders on the actual hero shot");
      check(!sample.original.enabled && sample.bullet.speed === 500, "Arrow " + (i + 1) + " preserves speed and hides original art");
      sample.bullet.cancel(); sample.node.destroy(); victim.destroy();
    }
    var visual = arrows[0].id;
    for (var type of ["Play", "Enemy", "Soldier", "Build", "Enemy8"]) {
      var baseline = shot(type, 0), styled = shot(type, 0), one = target(0), two = target(0);
      var expected = trace(baseline.bullet, one), key = type === "Play" ? "hero" : "enemy:90003";
      fixtures.assignments[key] = { flight: visual, launch: "toon:flash-5", impact: "toon:hit-5", size: 64 };
      looks.prepare(styled.bullet, owner, key);
      var actual = trace(styled.bullet, two);
      check(actual.damage === 17 && actual.damage === expected.damage, type + " damage remains exactly one hit");
      check(JSON.stringify(actual.positions) === JSON.stringify(expected.positions), type + " trajectory and impact tick match original behavior");
      baseline.bullet.cancel(); styled.bullet.cancel(); baseline.node.destroy(); styled.node.destroy(); one.destroy(); two.destroy();
    }
    var clips = fixtures.assets.filter(function (a) { return a.kind === "flipbook"; });
    for (var clip of clips) {
      var asset = await new Promise(function (resolve) { owner._projectileLooks.get(clip, resolve); });
      check(asset && asset.frames.length === clip.frames && asset.frames.every(function (frame) { return frame instanceof cc.SpriteFrame; }), clip.name + " creates native-compatible SpriteFrames");
    }
    // Real renderer gallery kept alive for the final screenshot / pixel check.
    roots.forEach(function (node) { if (cc.isValid(node)) node.destroy(); }); roots = [];
    var gallery = arrows.slice(0, 4).concat(clips.filter(function (a) { return a.role === "flight"; }).slice(0, 8));
    for (var g = 0; g < gallery.length; g++) {
      var entry = shot("Play", 0); entry.node.setPosition(-192 + g % 4 * 128, 100 - Math.floor(g / 4) * 100);
      fixtures.assignments.hero = { flight: gallery[g].id, size: 72 }; looks.prepare(entry.bullet, owner, "hero");
      entry.bullet.setTag(entry.node.getPosition(), target(0), function () {});
      await waitFor(function () { return entry.bullet._projectileVisual.node; }, "Gallery artwork failed");
      entry.node.angle = 0; entry.bullet._projectileVisual.step(.25);
    }
    await delay(150); camera.render();
    var capture = new cc.RenderTexture(); capture.initWithSize(512, 320); camera.targetTexture = capture; camera.render(scene);
    var pixels = capture.readPixels(), painted = 0;
    if (pixels) for (var p = 0; p < pixels.length; p += 4) if (pixels[p] > 45 || pixels[p + 1] > 45 || pixels[p + 2] > 55) painted++;
    check(painted > 500, "Real renderer draws nonempty projectile artwork"); report.paintedPixels = painted;
    camera.targetTexture = null; capture.destroy();
    report.ok = true; report.resourceLoads = resourceLoads;
  } catch (error) { report.ok = false; report.errors.push({ message: String(error), stack: error.stack }); }
  cc.assetManager.getBundle = originalGetBundle;
  return report;
}
if (typeof module !== 'undefined') module.exports = projectileEngineSmoke;
