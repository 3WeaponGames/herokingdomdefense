"use strict";

// Presentation-only, base-local opening lights for layered buildings.
// Retained authored sprites follow the existing night fade and breathing loop.
var GLOW = "ui/stage-stars/glow", FADE = .5, PERIOD = 2;
function valid(value) { return !!value && (!cc.isValid || cc.isValid(value, true)); }
function finite(value, fallback) { return typeof value === "number" && isFinite(value) ? value : fallback; }
function clamp(value, low, high) { return Math.max(low, Math.min(high, value)); }
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
function spriteLight(light) {
  return light && typeof light.sprite === "string" && light.sprite &&
    finite(light.width, 0) > 0 && finite(light.height, 0) > 0;
}
function config(owner) {
  var appearance = owner && owner.buildInfo && owner.buildInfo.cfg && owner.buildInfo.cfg.Appearance;
  var lights = appearance && appearance.lighting;
  if (!Array.isArray(lights)) return [];
  return lights.filter(function (light) {
    return light && (spriteLight(light) ||
      Array.isArray(light.points) && light.points.length >= 3 && light.points.every(function (point) {
      return point && typeof point.x === "number" && isFinite(point.x) && typeof point.y === "number" && isFinite(point.y);
    }));
  }).map(function (light) {
    var result = { color: typeof light.color === "string" ? light.color : "#FFE89A", opacity: clamp(finite(light.opacity, 235), 0, 255) };
    if (spriteLight(light)) {
      result.sprite = light.sprite; result.width = light.width; result.height = light.height;
      result.offsetX = finite(light.offsetX, 0); result.offsetY = finite(light.offsetY, 0);
    } else result.points = light.points.map(function (point) { return { x: point.x, y: point.y }; });
    function glowConfig(value) {
      var glow = value === true ? {} : value;
      var xs = result.points ? result.points.map(function (point) { return point.x; }) : [result.offsetX - result.width / 2, result.offsetX + result.width / 2];
      var ys = result.points ? result.points.map(function (point) { return point.y; }) : [result.offsetY, result.offsetY + result.height];
      var left = Math.min.apply(Math, xs), right = Math.max.apply(Math, xs), bottom = Math.min.apply(Math, ys), top = Math.max.apply(Math, ys);
      return { x: finite(glow.x, (left + right) / 2), y: finite(glow.y, (bottom + top) / 2),
        width: Math.max(1, finite(glow.width, (right - left) * 3)), height: Math.max(1, finite(glow.height, (top - bottom) * 3)),
        angle: finite(glow.angle, 0), shearX: finite(glow.shearX, 0), shearY: finite(glow.shearY, 0),
        color: typeof glow.color === "string" ? glow.color : "#FFC85B", opacity: clamp(finite(glow.opacity, 100), 0, 255),
        pulse: clamp(finite(glow.pulse, .08), 0, 1), sprite: typeof glow.sprite === "string" && glow.sprite ? glow.sprite : GLOW };
    }
    if (light.glow) result.glow = glowConfig(light.glow);
    if (Array.isArray(light.glows)) result.glows = light.glows.filter(function (glow) { return glow && typeof glow === "object"; }).map(glowConfig);
    return result;
  });
}
function live(owner, state, record) {
  return valid(owner) && valid(owner.node) && owner.enabled !== false && owner.node.activeInHierarchy !== false && !owner.isDestroyed &&
    owner._buildingAppearance === state && state._buildingLighting === record && valid(state.node) && state.node.active &&
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
      resource.sprites.forEach(function (sprite) { sprite.spriteFrame = frame; });
      // Loading never activates a light. Its phase/fade alone controls visibility.
    });
  });
}
function build(owner, state, lights, layoutSignature) {
  var node = new cc.Node("BuildingNightLights"); node.parent = state.node; node.group = owner.node.group; node.zIndex = 1;
  node.active = false; node.opacity = 0;
  var night = tint(owner), nightColor = night ? { r: parseInt(night.slice(1, 3), 16), g: parseInt(night.slice(3, 5), 16), b: parseInt(night.slice(5, 7), 16) } : null;
  var weapon = valid(state.weaponNode) ? state.weaponNode : null;
  var record = state._buildingLighting = { node: node, parent: state.node, signature: layoutSignature, entries: [], resources: {}, tint: nightColor, dayColor: colorValue(state.node.color), weapon: weapon, weaponDayColor: weapon ? colorValue(weapon.color) : null,
    generation: 0, night: null, blend: 0, from: 0, to: 0, fadeElapsed: 0, clock: 0 };
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
      // Authored transforms project the retained native window fan outward.
      // They are constant; the existing night loop changes only its opacity.
      var adjustment=owner.buildInfo.cfg.Nightlight?require("BuildingNightlight").value(owner.buildInfo.cfg,"sprite:"+index+":"+at):{x:0,y:0,angle:0,scaleX:1,scaleY:1,flipX:false,flipY:false};
      glow.setPosition(settings.x+adjustment.x,settings.y+adjustment.y);
      glow.angle = settings.angle+adjustment.angle; glow.skewX = settings.shearX; glow.skewY = settings.shearY;
      glow.scaleX=adjustment.scaleX*(adjustment.flipX?-1:1);glow.scaleY=adjustment.scaleY*(adjustment.flipY?-1:1);
      var sprite = glow.addComponent(cc.Sprite); sprite.sizeMode = cc.Sprite.SizeMode.CUSTOM; sprite.trim = false;
      entry.glows.push({ node: glow, sprite: sprite, config: settings });
      if (!at) { entry.glow = glow; entry.sprite = sprite; }
      resource(settings.sprite, sprite);
    });
    if(light.opacity<=0){record.entries.push(entry);return;}
    var window = entry.window = new cc.Node("LitWindow" + index); window.parent = node; window.group = node.group; window.zIndex = 1; window.opacity = light.opacity;
    if (light.sprite) {
      window.setAnchorPoint(.5, 0); window.setPosition(light.offsetX, light.offsetY);
      window.setContentSize(light.width, light.height); window.color = cc.color(light.color);
      var mask = entry.maskSprite = window.addComponent(cc.Sprite); mask.sizeMode = cc.Sprite.SizeMode.CUSTOM; mask.trim = false;
      resource(light.sprite, mask);
    } else {
      var graphics = window.addComponent(cc.Graphics); graphics.fillColor = cc.color(light.color);
      light.points.forEach(function (point, at) { if (at) graphics.lineTo(point.x, point.y); else graphics.moveTo(point.x, point.y); });
      graphics.close(); graphics.fill();
    }
    record.entries.push(entry);
  });
  return record;
}
function apply(owner, state) {
  if (!state) return;
  var lights = config(owner), record = state._buildingLighting;
  if (!lights.length && !tint(owner)) { dispose(owner, state); return; }
  if (!valid(owner) || !valid(owner.node) || owner.enabled === false || owner.isDestroyed || !valid(state.node) || !state.node.active ||
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
}
exports.apply = apply;
exports.update = update;
exports.setNight = setNight;
exports.hide = hide;
exports.dispose = dispose;
exports.config = config;
