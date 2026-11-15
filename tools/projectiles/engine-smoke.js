/* Shared Browser/JSB integration fixture. Uses the real Creator engine and
 * shipped projectile classes; the fixture supplies isolated resource records.
 * No player data, editor scene, gameplay configuration or audio is loaded. */
async function projectileEngineSmoke(input) {
  var report = { engine: cc.ENGINE_VERSION, native: cc.sys.isNative, muted: true, checks: [], errors: [] };
  function check(condition, message) { if (!condition) throw Error(message); report.checks.push(message); }
  function delay(ms) { return new Promise(function (resolve) { setTimeout(resolve, ms); }); }
  var originalWarn=cc.warn;cc.warn=function(){report.warnings=report.warnings||[];report.warnings.push(Array.prototype.map.call(arguments,function(value){return value&&value.stack||String(value);}).join(' '));if(originalWarn)originalWarn.apply(cc,arguments);};
  var moduleCache = {}, fixtures = input.catalog, level = 1,presentationSettings={unitProfiles:{entries:{100001:{baseId:90003}}}};
  var freeGame = { freeBullet: function () {}, freeEnemyBullet: function () {}, freeSoldierBullet: function () {}, freeBuildBullet: function () {} };
  function scriptId(uuid){var hex=uuid.replace(/-/g,''),result=hex.slice(0,5),alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';for(var i=5;i<32;i+=3){var value=parseInt(hex.slice(i,i+3),16);result+=alphabet[value>>6]+alphabet[value&63];}return result;}
  function load(name) {
    name=name.replace(/^\.\//,'');
    if (name === "KinghtFallUIGame") return { default: { instance: { ctrGame: freeGame } } };
    if (name === "KinghtFallPlayerMgr") return { KinghtFallPlayerMgr: { getInstance: function () { return { getUserData: function () { return { getPersonLevel: function () { return level; } }; } }; } } };
    if (name === "KinghtFallDataMgr") return {KinghtFallDataMgr:{getInstance:function(){return{data:{GameTools:presentationSettings},getEquipCfgList:function(){return[{id:3,levelInfo:arrows.map(function(asset,i){return{Level:i+1,EquipSkin:'fixture-'+i};})}];}};}}};
    if (moduleCache[name]) return moduleCache[name].exports;
    var record = input.modules[name]; if (!record) throw Error("Unexpected fixture module: " + name);
    var module = moduleCache[name] = { exports: {} };
    cc._RF.push(module, scriptId(record.uuid), name);
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
    if (!textures[url]) textures[url] = new Promise(function (resolve, reject) { cc.assetManager.loadRemote(url, { ext: ".png" }, function (error, image) { if (error) {report.resourceErrors=report.resourceErrors||[];report.resourceErrors.push({url:url,error:String(error)});reject(error);} else resolve(image); }); });
    return textures[url];
  }
  var itemProfiles = {}, assignments = {}, arrows = fixtures.assets.filter(function (a) { return a.sourcePart; });
  arrows.forEach(function (asset, i) { var id = "fixture-arrow-" + i; assignments["3:" + (i + 1)] = id; itemProfiles[id] = { base: { type: "item", id: "3:" + (i + 1) }, parts: [{ sprite: asset.sourcePart }] }; });
  var imported={},prefabAssets={};
  function deserialize(data){var details=new cc.deserialize.Details(),asset=cc.deserialize(data,details);return Promise.all(details.uuidList.map(importedAsset)).then(function(dependencies){for(var d=0;d<dependencies.length;d++)details.uuidObjList[d][details.uuidPropList[d]]=dependencies[d];return asset;});}
  function importedAsset(uuid){
    if(imported[uuid])return imported[uuid];
    var record=input.prefabRecords.assets[uuid];if(!record)return Promise.reject(Error('Missing real prefab dependency '+uuid));
    imported[uuid]=Promise.resolve().then(async function(){
      var result;
      if(record.kind==='texture')result=await texture(record);
      else if(record.kind==='sprite-frame'){var image=await importedAsset(record.meta.rawTextureUuid),meta=record.meta;result=new cc.SpriteFrame(image,cc.rect(meta.trimX||0,meta.trimY||0,meta.width,meta.height),!!meta.rotated,cc.v2(meta.offsetX||0,meta.offsetY||0),cc.size(meta.rawWidth,meta.rawHeight));}
      else if(record.kind==='builtin-material')result=cc.Material.getBuiltinMaterial('2d-sprite');
      else if(record.kind==='animation'||record.kind==='material')result=await deserialize(record.data);
      else if(record.kind==='particle'){result=new cc.ParticleAsset();result._nativeAsset=cc.plistParser.parse(record.text);}
      else throw Error('Unsupported real prefab asset '+record.kind);
      return result;
    });return imported[uuid];
  }
  function importedPrefab(resource){if(!prefabAssets[resource])prefabAssets[resource]=deserialize(input.prefabRecords.prefabs[resource]);return prefabAssets[resource];}
  var resources = { load: function (resource, type, callback) {
    resourceLoads++;
    if(type===cc.Prefab&&input.prefabRecords.prefabs[resource]){importedPrefab(resource).then(function(asset){callback(null,asset);},function(error){report.resourceErrors=report.resourceErrors||[];report.resourceErrors.push({resource:resource,error:String(error),stack:error.stack});callback(error);});return;}
    var json = resource === "projectiles/catalog" ? fixtures : resource === "hero-items/catalog" ? { assignments: assignments, profiles: itemProfiles } : resource === "character-parts/catalog" ? { parts: arrows.map(function (a) { return { id: a.sourcePart, resource: a.resource }; }) } : null;
    if (json) { var asset = new cc.JsonAsset(); asset.json = json; setTimeout(function () { callback(null, asset); }, 0); return; }
    var entry = fixtures.assets.concat(fixtures.trails || []).find(function (a) { return a.resource === resource; });
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
  async function waitFor(predicate, message) { for (var i = 0; i < 2000; i++) { if (predicate()) return; await delay(10); } throw Error(message); }
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
    load('GAD_BulletEffect');
    // Bind every shipped wall prefab with its real serialized sprites,
    // particles and clips; none may add collision geometry to the battle.
    var realWalls=fixtures.assets.filter(function(asset){return asset.visualPrefab;});
    for(var wall of realWalls){
      var wallShot=shot('Play',0),wallTarget=target(0),oldTrailNode=new cc.Node('old-trail');oldTrailNode.parent=wallShot.node;var oldTrail=oldTrailNode.addComponent(cc.MotionStreak);
      fixtures.assignments.hero={flight:wall.id,size:wall.size};looks.prepare(wallShot.bullet,owner,'hero');wallShot.bullet.setTag(wallShot.node.getPosition(),wallTarget,function(){});
      await waitFor(function(){return wallShot.bullet._projectileVisual.node&&wallShot.bullet._projectileVisual.node._projectilePrefab;},'Actual prefab failed: '+wall.name);
      var visualRoot=wallShot.bullet._projectileVisual.node._projectilePrefab;
      check(visualRoot.getComponentsInChildren(cc.Sprite).some(function(sprite){return sprite.spriteFrame;}),wall.name+' binds its complete original prefab artwork');
      check(visualRoot.getComponentsInChildren(cc.Collider).every(function(collider){return !collider.enabled;})&&!oldTrail.enabled,wall.name+' suppresses legacy collision geometry and previous trails');
      check(visualRoot.getComponentsInChildren(cc.MotionStreak).length===(wall.visualLayers||[]).filter(function(layer){return layer.kind==='trail';}).length,wall.name+' keeps every authored prefab trail');
      wallShot.bullet._projectileVisual.reset();check(oldTrail.enabled,wall.name+' restores original trails after reset');wallShot.bullet.cancel();wallShot.node.destroy();wallTarget.destroy();
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
    // Launch/impact nodes share a pool. Additive flashes must not leave the
    // following normal-alpha effect with additive renderer state.
    var blendClips=clips.filter(function(clip){return clip.additive;});
    if(blendClips.length){
      var blendBank=owner._projectileLooks,pooledBlendNode=null;
      blendBank.update(2);
      for(var blendClip of [blendClips[0],clips.find(function(clip){return !clip.additive;})]){
        blendBank.effect(blendClip,scene,cc.v2(0,0),0,{size:64},function(){return true;});
        var blendEffect=blendBank.effects[blendBank.effects.length-1];
        check(blendEffect.renderer.srcBlendFactor===cc.macro.SRC_ALPHA&&blendEffect.renderer.dstBlendFactor===(blendClip.additive?cc.macro.ONE:cc.macro.ONE_MINUS_SRC_ALPHA),blendClip.name+' uses its authored sprite blend');
        if(pooledBlendNode)check(blendEffect.node===pooledBlendNode,'Real effect pool resets additive blending for normal-alpha artwork');
        pooledBlendNode=blendEffect.node;blendBank.update(2);
      }
    }
    // Exercise the actual engine MotionStreak with every authored texture and
    // one retained shot; blend state must also reset when the preset changes.
    var trailShot=shot('Play',0),trailTarget=target(0),authoredTrailNode=new cc.Node('authored-trail');authoredTrailNode.parent=trailShot.node;
    var authoredTrail=authoredTrailNode.addComponent(cc.MotionStreak);
    for(var preset of fixtures.trails||[]){
      fixtures.assignments.hero={flight:visual,trail:preset.id,size:48};looks.prepare(trailShot.bullet,owner,'hero');trailShot.bullet.setTag(trailShot.node.getPosition(),trailTarget,function(){});
      await waitFor(function(){return trailShot.bullet._projectileVisual.trailNode&&trailShot.bullet._projectileVisual.trailNode.active;},'Selected trail failed to load: '+preset.name);
      var streak=trailShot.bullet._projectileVisual.trailNode.getComponent(cc.MotionStreak);
      check(streak.texture instanceof cc.Texture2D&&streak.enabled&&!authoredTrail.enabled,preset.name+' replaces authored trail with a real texture');
      check(Math.abs(streak.stroke-preset.width)<.001&&Math.abs(streak.fadeTime-preset.lifetime)<.001,preset.name+' retains its authored width and fade time');
      check(streak.dstBlendFactor===(preset.additive?cc.macro.ONE:cc.macro.ONE_MINUS_SRC_ALPHA),preset.name+' resets pooled blend factors');
      trailShot.node.x+=10;await delay(20);
    }
    fixtures.assignments.hero={flight:visual,trail:false};looks.prepare(trailShot.bullet,owner,'hero');trailShot.bullet.setTag(trailShot.node.getPosition(),trailTarget,function(){});
    await delay(20);check(!authoredTrail.enabled&&!trailShot.bullet._projectileVisual.trailNode.active,'Turning trails off disables authored and custom streaks');
    fixtures.assignments.hero={flight:visual};looks.prepare(trailShot.bullet,owner,'hero');trailShot.bullet.setTag(trailShot.node.getPosition(),trailTarget,function(){});
    await delay(20);check(authoredTrail.enabled,'Removing the override restores the authored trail');trailShot.bullet.cancel();trailShot.node.destroy();trailTarget.destroy();
    // Reuse the modern tower entry point after warming the texture cache.
    // Overrides must win after setTowerTag resets its authored MotionStreaks.
    var modern=shot('Build',0),modernTarget=target(0),modernTrailNode=new cc.Node('modern-authored-trail');modernTrailNode.parent=modern.node;
    var modernTrail=modernTrailNode.addComponent(cc.MotionStreak),modernKey='tower:2:4',modernBehavior={attackType:'arrow',splashRadius:0},modernPreset=fixtures.trails[0];
    for(var modernChoice of [false,modernPreset.id,false]){
      fixtures.assignments[modernKey]={flight:visual,trail:modernChoice};looks.prepare(modern.bullet,owner,modernKey);
      modern.bullet.setTowerTag(modern.node.getPosition(),modernTarget,function(){},modernBehavior);
      await waitFor(function(){return modern.bullet._projectileVisual.node;},'Modern tower flight failed');
      if(modernChoice!==false)await waitFor(function(){return modern.bullet._projectileVisual.trailNode&&modern.bullet._projectileVisual.trailNode.active;},'Modern tower trail failed');
      check(!modernTrail.enabled,'Modern tower keeps authored trails disabled for '+(modernChoice===false?'trails off':'custom preset'));
      if(modernChoice===false)check(!modern.bullet._projectileVisual.trailNode||!modern.bullet._projectileVisual.trailNode.active,'Modern tower trails stay off with a hot texture cache');
      else check(modern.bullet._projectileVisual.trailNode.getComponent(cc.MotionStreak).enabled,'Modern tower binds its custom trail with a hot texture cache');
      modern.bullet.cancel();
    }
    modern.node.destroy();modernTarget.destroy();
    // Stage-local variants inherit presentation through their shared fighting
    // profile while keeping their own runtime ID and combat statistics.
    var profileShot=shot('Enemy',0),profileTarget=target(0),profileTrailNode=new cc.Node('profile-authored-trail');profileTrailNode.parent=profileShot.node;
    var profileTrail=profileTrailNode.addComponent(cc.MotionStreak),profileActor={cfg:{ID:1000000000,ProfileBaseID:100001}};
    fixtures.assignments['enemy:90003']={flight:visual,trail:false};looks.prepare(profileShot.bullet,owner,'enemy:1000000000',profileActor);
    profileShot.bullet.setTag(profileShot.node.getPosition(),profileTarget,function(){});
    await waitFor(function(){return profileShot.bullet._projectileVisual.node;},'Stage profile inherited flight failed');
    check(profileShot.bullet._projectileVisual.clip.descriptor.id===visual,'Stage profile inherits its shared fighting parent projectile in the real engine');
    check(!profileTrail.enabled,'Stage profile inherits its shared parent trail-off setting in the real engine');
    profileShot.bullet.cancel();profileShot.node.destroy();profileTarget.destroy();
    // Real renderer gallery kept alive for the final screenshot / pixel check.
    roots.forEach(function (node) { if (cc.isValid(node)) node.destroy(); }); roots = [];
    var gallery = arrows.slice(0, 3).concat(realWalls.slice(0, 3),clips.filter(function (a) { return a.role === "flight"; }).slice(0, 6));
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
  cc.assetManager.getBundle = originalGetBundle;cc.warn=originalWarn;
  return report;
}
if (typeof module !== 'undefined') module.exports = projectileEngineSmoke;
