"use strict";

// Explicit window-light sprites in building-local coordinates. Layered artwork
// retains its independent night tint; light pixels always remain unmodified.
var FADE = .5, PERIOD = 2;
function valid(value) { return !!value && (!cc.isValid || cc.isValid(value, true)); }
function finite(value, fallback) { return typeof value === "number" && isFinite(value) ? value : fallback; }
function visible(owner){var appearance=owner._buildingAppearance,row=owner.buildInfo&&owner.buildInfo.cfg;if(row&&row.Appearance&&row.Appearance.sprite&&appearance&&(appearance.loading||!valid(appearance.node)||!appearance.node.active))return false;return !owner.ndAniMain||!owner.ndAniMain.node||owner.ndAniMain.node.active!==false;}
function tint(owner) {
  var appearance = owner && owner.buildInfo && owner.buildInfo.cfg && owner.buildInfo.cfg.Appearance;
  var value = appearance && appearance.nightTint;
  return typeof value === "string" && /^#?[0-9a-f]{6}$/i.test(value) ? "#" + value.replace(/^#/, "").toUpperCase() : null;
}
function signature(owner, lights) { return JSON.stringify({ lights: lights || config(owner), tint: tint(owner),transform:owner && owner.buildInfo && owner.buildInfo.cfg && owner.buildInfo.cfg.Nightlight }); }
function colorValue(color) { return { r: finite(color && color.r, 255), g: finite(color && color.g, 255), b: finite(color && color.b, 255), a: finite(color && color.a, 255) }; }
function setColor(node, color) { if (valid(node)) node.color = cc.color(color.r, color.g, color.b, color.a); }
function restoreColor(record) {
  if (record.tint) { setColor(record.parent, record.dayColor); if (record.weaponDayColor) setColor(record.weapon, record.weaponDayColor); }
}
function config(owner) {
  var T=require("BuildingNightlight"),row=owner&&owner.buildInfo&&owner.buildInfo.cfg;
  return T.emitters(row).map(function(emitter){return {id:emitter.id,opacity:0,glows:[T.glow(emitter)]};});
}
function live(owner, state, record) {
  return valid(owner) && valid(owner.node) && owner.enabled !== false && owner.node.activeInHierarchy !== false && !owner.isDestroyed && (!state.manual||visible(owner)) &&
    (owner._buildingAppearance === state || owner._buildingManualLights === state) && state._buildingLighting === record && valid(state.node) && state.node.active &&
    state.node.activeInHierarchy !== false && record.parent === state.node && valid(record.node);
}
function release(record) {
  Object.keys(record.resources).forEach(function (path) {
    var resource = record.resources[path];
    // Sprite setters still unsubscribe from their previous frame. Detach every
    // live consumer before releasing this layout's retained asset reference.
    resource.sprites.forEach(function(sprite){if(valid(sprite)&&valid(sprite.node))sprite.spriteFrame=null;});
    if (resource.frame && resource.retained && resource.frame.decRef) resource.frame.decRef();
    resource.frame = null; resource.retained = false; resource.token = null;
  });
  (record.meshFrames||[]).forEach(function(frame){frame.destroy();});record.meshFrames=[];
  (record.maskEntries||[]).forEach(function(entry){require("WindowLightMaskRuntime").release(entry);});record.maskEntries=[];
}
function dispose(owner, state) {
  var record = state && state._buildingLighting;
  if (!record) return;
  hide(owner, state); state._buildingLighting = null;
  release(record);
  if (valid(record.node)) record.node.destroy();
}
function hide(owner, state) {
  var record = state && state._buildingLighting;
  if (!record) return;
  record.generation++; record.night = null; record.blend = record.from = record.to = 0; record.fadeElapsed = 0;
  restoreColor(record);
  Object.keys(record.resources).forEach(function (path) { record.resources[path].token = null; });
  if (valid(record.node)) { record.node.active = false; record.node.opacity = 0; }
}
function paint(owner, state, record) {
  if (!live(owner, state, record)) return;
  if (record.tint) {
    var target = record.tint, blend = record.blend;
    function shade(node, color) {
      if (color) setColor(node, { r: Math.round(color.r + (target.r - color.r) * blend),
        g: Math.round(color.g + (target.g - color.g) * blend), b: Math.round(color.b + (target.b - color.b) * blend), a: color.a });
    }
    shade(record.parent, record.dayColor); shade(record.weapon, record.weaponDayColor);
  }
  record.node.opacity = Math.round(record.blend * 255); record.node.active = record.blend > 0;
  record.entries.forEach(function (entry, index) {
    (entry.glows || []).forEach(function (part, at) {
      var glow = part.config, pulse = 1 - glow.pulse * (1 - Math.cos(record.clock * Math.PI * 2 / PERIOD + (index + at) * .7)) / 2;
      part.node.opacity = Math.round(glow.opacity * pulse);
    });
  });
}
function loadGlows(owner, state, record) {
  if (!owner.loadSpriteFrame) return;
  Object.keys(record.resources).forEach(function (path) {
    var resource = record.resources[path];
    if (resource.frame || resource.token) return;
    var token = {}, generation = record.generation;
    resource.token = token;
    owner.loadSpriteFrame("resources", path, function (frame) {
      if (!live(owner, state, record) || record.generation !== generation || resource.token !== token ||
          signature(owner) !== record.signature) return;
      resource.token = null;
      if (!frame) return;
      // The loader owns its reference; this cache retains exactly one more and
      // releases it when a new light layout replaces this one or it is disposed.
      if (frame.addRef) { frame.addRef(); resource.retained = true; }
      resource.frame = frame;
      resource.sprites.forEach(function (sprite) {
        var base=frame;if(sprite._windowLightErase){var entry=require("WindowLightMaskRuntime").acquire(frame,sprite._windowLightErase);if(entry){record.maskEntries.push(entry);base=entry.frame;}}
        if(sprite._windowLightWarp){var mesh=base.clone(),texture=base.getTexture();mesh.vertices=require("WindowLightWarp").forType(sprite._windowLightType).vertices(sprite._windowLightWarp,base.uv,texture.width,texture.height,sprite._windowLightNodes);mesh._uuid=(base._uuid||base.uuid||"window-light")+"@warp:"+record.meshFrames.length;record.meshFrames.push(mesh);sprite.type=cc.Sprite.Type.MESH;sprite.spriteFrame=mesh;}
        else sprite.spriteFrame = base;
      });
      // Loading never activates a light. Its phase/fade alone controls visibility.
    });
  });
}
function build(owner, state, lights, layoutSignature) {
  var node = new cc.Node("BuildingNightLights"); node.parent = state.node; node.group = owner.node.group; node.zIndex = 1;
  node._structureShadowExcluded=true;
  node.active = false; node.opacity = 0;
  var night = state.manual ? null : tint(owner), nightColor = night ? { r: parseInt(night.slice(1, 3), 16), g: parseInt(night.slice(3, 5), 16), b: parseInt(night.slice(5, 7), 16) } : null;
  var weapon = valid(state.weaponNode) ? state.weaponNode : null;
  var record = state._buildingLighting = { node: node, parent: state.node, signature: layoutSignature, entries: [], resources: {}, tint: nightColor, dayColor: colorValue(state.node.color), weapon: weapon, weaponDayColor: weapon ? colorValue(weapon.color) : null,
    generation: 0, night: null, blend: 0, from: 0, to: 0, fadeElapsed: 0, clock: 0,meshFrames:[],maskEntries:[] };
  lights.forEach(function (light, index) {
    var entry = { config: light, glows: [] };
    function resource(path, sprite) {
      var recordResource = record.resources[path] = record.resources[path] || { frame: null, token: null, retained: false, sprites: [] };
      recordResource.sprites.push(sprite);
    }
    var glows = (light.glow ? [light.glow] : []).concat(light.glows || []);
    glows.forEach(function (settings, at) {
      var glow = new cc.Node("WindowGlow" + index + "_" + at); glow.parent = node; glow.group = node.group; glow.zIndex = 0;
      glow.setPosition(settings.x, settings.y); glow.setContentSize(settings.width, settings.height); glow.color = cc.color(settings.color);
      // Transform the complete square image; its internal fade stays intact.
      var adjustment=require("BuildingNightlight").value(owner.buildInfo.cfg,light.id);
      glow.setPosition(settings.x+adjustment.x,settings.y+adjustment.y);
      glow.angle = settings.angle+adjustment.angle; glow.skewX = settings.shearX; glow.skewY = settings.shearY;
      glow.scaleX=adjustment.scaleX*(adjustment.flipX?-1:1);glow.scaleY=adjustment.scaleY*(adjustment.flipY?-1:1);
      glow.setAnchorPoint(.5,.5);var sprite = glow.addComponent(cc.Sprite); sprite.sizeMode = cc.Sprite.SizeMode.CUSTOM; sprite.trim = false;
      sprite._windowLightType=settings.lightType;
      if(adjustment.warp||adjustment.warpNodes&&adjustment.warpNodes.length){sprite._windowLightWarp=adjustment.warp||require("WindowLightWarp").forType(settings.lightType).controls();sprite._windowLightNodes=adjustment.warpNodes;}
      if(adjustment.erase&&adjustment.erase.strokes.length)sprite._windowLightErase=adjustment.erase;
      entry.glows.push({ node: glow, sprite: sprite, config: settings });
      if (!at) { entry.glow = glow; entry.sprite = sprite; }
      resource(settings.sprite, sprite);
    });
    record.entries.push(entry);
  });
  return record;
}
function apply(owner, state) {
  if (!state) return;
  var lights = state.manual ? config(owner) : [], record = state._buildingLighting;
  if (!lights.length && (state.manual || !tint(owner))) { dispose(owner, state); return; }
  if (!valid(owner) || !valid(owner.node) || owner.enabled === false || owner.isDestroyed || state.manual&&!visible(owner) || !valid(state.node) || !state.node.active ||
      owner.node.activeInHierarchy === false || state.node.activeInHierarchy === false) { hide(owner, state); return; }
  var layoutSignature = signature(owner, lights);
  if (record && (record.signature !== layoutSignature || record.parent !== state.node || !valid(record.node))) { dispose(owner, state); record = null; }
  if (!record) record = build(owner, state, lights, layoutSignature);
  var weapon = valid(state.weaponNode) ? state.weaponNode : null;
  if (record.weapon !== weapon) {
    if (record.tint && record.weaponDayColor) setColor(record.weapon, record.weaponDayColor);
    record.weapon = weapon; record.weaponDayColor = weapon ? colorValue(weapon.color) : null;
  }
  var night = owner._buildingNight === true;
  if (record.night !== night) {
    record.night = night; record.from = record.blend; record.to = night ? 1 : 0; record.fadeElapsed = 0;
    if (night) record.clock = 0;
    // The Archer switches straight to idle in planning. That phase does not
    // necessarily tick tower simulation, so day must settle without an update.
    else { record.blend = record.from = record.to = 0; record.fadeElapsed = FADE; }
  }
  paint(owner, state, record); loadGlows(owner, state, record);
}
function update(owner, state, dt) {
  var record = state && state._buildingLighting;
  if (!record) return;
  if (!live(owner, state, record)) { hide(owner, state); return; }
  if (record.night !== (owner._buildingNight === true)) apply(owner, state);
  dt = Math.max(0, finite(dt, 0)); record.clock = (record.clock + dt) % PERIOD;
  record.fadeElapsed = Math.min(FADE, record.fadeElapsed + dt);
  var progress = record.fadeElapsed / FADE, eased = progress * progress * (3 - 2 * progress);
  record.blend = record.from + (record.to - record.from) * eased;
  paint(owner, state, record);
}
function setNight(owner, night) {
  if (!owner) return;
  owner._buildingNight = !!night;
  if (owner._buildingAppearance) apply(owner, owner._buildingAppearance);
  syncOwner(owner);
}
function disposeOwner(owner){var state=owner&&owner._buildingManualLights;if(state){dispose(owner,state);delete owner._buildingManualLights;}}
function hideOwner(owner){if(owner&&owner._buildingManualLights)hide(owner,owner._buildingManualLights);}
function syncOwner(owner){
  var row=owner&&owner.buildInfo&&owner.buildInfo.cfg,T=require("BuildingNightlight");
  if(!row||!T.emitters(row).length){disposeOwner(owner);return;}
  var state=owner._buildingManualLights;if(!state)state=owner._buildingManualLights={node:owner.node,manual:true};apply(owner,state);
}
function updateOwner(owner,dt){syncOwner(owner);if(owner._buildingManualLights)update(owner,owner._buildingManualLights,dt);}
exports.apply = apply;
exports.update = update;
exports.setNight = setNight;
exports.hide = hide;
exports.dispose = dispose;
exports.config = config;
exports.syncOwner=syncOwner;exports.updateOwner=updateOwner;exports.hideOwner=hideOwner;exports.disposeOwner=disposeOwner;
