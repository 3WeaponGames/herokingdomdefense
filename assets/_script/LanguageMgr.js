/* Central table-driven localization. Serialized text uses [[loc:key]]. */
"use strict";
var TOKEN = /\[\[loc:([a-zA-Z0-9_.-]+)\]\]/g;
var FORMAT_TOKEN = /\[\[fmt:([^\]]+)\]\]/g;
var STORAGE_KEY = "project-cocos.language";
function LanguageMgr() {
  this.catalog = { defaultLanguage: "en", languages: [], entries: {}, images: {} };
  this.currentLan = "en";
  this.ready = false;
  this._callbacks = [];
  this._listeners = [];
  this._rendered = new Map();
  this._labels = new Set();
  this._sprites = new Set();
  this._missing = {};
  this._fontCache = {};
  this.install();
}
LanguageMgr.getInstance = function () {
  if (!LanguageMgr.instance) LanguageMgr.instance = new LanguageMgr();
  return LanguageMgr.instance;
};
LanguageMgr.prototype.init = function (done) {
  if (this.ready) { if (done) done(null); return; }
  if (done) this._callbacks.push(done);
  if (this._loading) return;
  this._loading = true;
  var self = this;
  cc.resources.load("localization/catalog", cc.JsonAsset, function (error, asset) {
    self._loading = false;
    if (!error) self.setCatalog(asset.json);
    else cc.error("Localization catalog could not be loaded", error);
    self._callbacks.splice(0).forEach(function (callback) { callback(error); });
  });
};
LanguageMgr.prototype.setCatalog = function (catalog) {
  this.catalog = catalog;
  this._rendered.clear();
  this._missing = {};
  var saved = null;
  try { saved = cc.sys.localStorage.getItem(STORAGE_KEY); } catch (error) { /* Storage can be disabled. */ }
  this.currentLan = this.hasLanguage(saved) ? saved : catalog.defaultLanguage;
  this.ready = true;
  this.refresh();
};
LanguageMgr.prototype.hasLanguage = function (code) {
  return this.catalog.languages.some(function (language) { return language.code === code; });
};
LanguageMgr.prototype.getLanguages = function () { return this.catalog.languages.slice(); };
LanguageMgr.prototype.getCurrentLanguage = function () { return this.currentLan; };
LanguageMgr.prototype.setCurrentLanguage = function (code) {
  if (!this.hasLanguage(code)) return false;
  this.currentLan = code;
  try { cc.sys.localStorage.setItem(STORAGE_KEY, code); } catch (error) { /* Session switching still works. */ }
  this.refresh();
  this._listeners.slice().forEach(function (listener) { listener.fn.call(listener.target, code); });
  return true;
};
LanguageMgr.prototype.onChange = function (fn, target) {
  this.offChange(fn, target);
  this._listeners.push({ fn: fn, target: target });
};
LanguageMgr.prototype.offChange = function (fn, target) {
  this._listeners = this._listeners.filter(function (item) { return item.fn !== fn || item.target !== target; });
};
LanguageMgr.prototype._entry = function (key, language) {
  var entry = this.catalog.entries[key];
  if (!entry) { this._missing[key] = true; return "[[loc:" + key + "]]"; }
  var value = entry[language || this.currentLan];
  if (typeof value !== "string" || !value.trim()) {
    this._missing[key + ":" + (language || this.currentLan)] = true;
    value = entry[this.catalog.defaultLanguage];
  }
  return typeof value === "string" ? value : "[[loc:" + key + "]]";
};
LanguageMgr.prototype._resolve = function (text, language, depth) {
  var self = this;
  text = text == null ? "" : String(text);
  if ((depth || 0) > 8) return text;
  text = text.replace(FORMAT_TOKEN, function (token, encoded) {
    var recipe = self._decodeRecipe(encoded);
    return recipe ? self._render(recipe, language, (depth || 0) + 1) : token;
  });
  if (Object.prototype.hasOwnProperty.call(this.catalog.entries, text)) text = "[[loc:" + text + "]]";
  return text.replace(TOKEN, function (token, key) {
    var value = self._entry(key, language);
    return value === token ? value : self._resolve(value, language, (depth || 0) + 1);
  });
};
LanguageMgr.prototype._render = function (recipe, language, depth) {
  var self = this;
  if ((depth || 0) > 8) return "";
  if (recipe.number !== undefined) return this._numberText(recipe.number, language);
  var text = this._resolve(recipe.template, language, depth);
  var parameters = recipe.params;
  if (parameters) text = text.replace(/\{([\w]+)\}/g, function (token, key) {
    if (!Object.prototype.hasOwnProperty.call(parameters, key)) return token;
    var value = parameters[key];
    return value && value.__localizedRecipe ? self._render(value.__localizedRecipe, language, (depth || 0) + 1) : self._resolve(value, language, (depth || 0) + 1);
  });
  return text;
};
LanguageMgr.prototype._remember = function (text, recipe) {
  if (this._rendered.size > 5000) this._rendered.clear();
  if (this._isLocalized(recipe)) this._rendered.set(text, recipe);
  return text;
};
LanguageMgr.prototype._recipe = function (value) {
  var text = value == null ? "" : String(value);
  var encoded = /^\[\[fmt:([^\]]+)\]\]$/.exec(text);
  if (encoded) {
    var decoded = this._decodeRecipe(encoded[1]);
    if (decoded) return decoded;
  }
  if (text.indexOf("[[loc:") !== -1 || this.catalog.entries[text]) return { template: text };
  return this._rendered.get(text) || { template: text };
};
LanguageMgr.prototype._decodeRecipe = function (encoded) {
  try {
    var recipe = JSON.parse(decodeURIComponent(encoded));
    if (recipe && typeof recipe.template === "string" && (!recipe.params || typeof recipe.params === "object")) return recipe;
  } catch (error) { /* A literal player string must never crash the renderer. */ }
  return null;
};
LanguageMgr.prototype._isLocalized = function (recipe) {
  if (recipe.number !== undefined || /\[\[(?:loc|fmt):/.test(recipe.template) || this.catalog.entries[recipe.template]) return true;
  return !!recipe.params && Object.keys(recipe.params).some(function (key) {
    var value = recipe.params[key];
    return value && (value.__localizedRecipe || typeof value === "string" && /\[\[(?:loc|fmt):/.test(value));
  });
};
LanguageMgr.prototype.token = function (value) {
  var text = value == null ? "" : String(value);
  if (/\[\[(?:loc|fmt):/.test(text)) return text;
  if (this.catalog.entries[text]) return "[[loc:" + text + "]]";
  var recipe = this._rendered.get(text);
  return recipe ? "[[fmt:" + encodeURIComponent(JSON.stringify(recipe)) + "]]" : text;
};
LanguageMgr.prototype.t = function (key, params) {
  var recipe = { template: key == null ? "" : String(key), params: params };
  return this._remember(this._render(recipe), recipe);
};
LanguageMgr.prototype.T = function (key, params) { return this.t(key, params); };
LanguageMgr.prototype.format = function (template, params) {
  var recipe = this._formatRecipe(template, params);
  return this._remember(this._render(recipe), recipe);
};
LanguageMgr.prototype.formatToken = function (template, params) {
  var recipe = this._formatRecipe(template, params);
  return this._isLocalized(recipe) ? "[[fmt:" + encodeURIComponent(JSON.stringify(recipe)) + "]]" : this._render(recipe);
};
LanguageMgr.prototype._formatRecipe = function (template, params) {
  var self = this;
  var source = this._recipe(template);
  var values = {};
  Object.keys(params || {}).forEach(function (key) {
    var value = params[key];
    var known = self._rendered.get(String(value));
    values[key] = known ? { __localizedRecipe: known } : value;
  });
  return { template: source.template, params: values };
};
LanguageMgr.prototype.getImgstr = function (path) { return path; };
LanguageMgr.prototype.preloadArtwork = function (done) {
  if (this._spineArtwork) this._spineArtwork.preload(done);
  else if (done) done([]);
};
LanguageMgr.prototype.formatNumber = function (number) {
  var recipe = { template: "", number: Number(number) };
  return this._remember(this._render(recipe), recipe);
};
LanguageMgr.prototype._numberText = function (number, language) {
  var units = this.catalog.numberFormats && this.catalog.numberFormats[language || this.currentLan];
  if (!units) return String(number);
  var index = 0, value = Number(number), step = units.base || 1000;
  while (Math.abs(value) >= step && index < units.suffixes.length - 1) { value /= step; index++; }
  return (index ? value.toFixed(2).replace(/\.?0+$/, "") : String(value)) + this._resolve(units.suffixes[index], language);
};
LanguageMgr.prototype.bindLabel = function (label, key, params) {
  label._localizedRecipe = { template: key, params: params };
  this._labels.add(label);
  this.refreshLabel(label);
};
LanguageMgr.prototype._ownsLabel = function (label) {
  var node = label && label.node;
  if (!node || node._localizationGenerated || node.name === "RICHTEXT_CHILD" && cc.PrivateNode && node instanceof cc.PrivateNode) return false;
  // EditBox placeholders are UI copy; its text label contains user input.
  if (cc.EditBox) for (var current = node; current; current = current.parent) {
    if (cc.Scene && current instanceof cc.Scene) break;
    var input = current.getComponent && current.getComponent(cc.EditBox);
    if (input && input.textLabel === label) return false;
  }
  return true;
};
LanguageMgr.prototype.refreshLabel = function (label) {
  if (!label || !cc.isValid(label) || !label.node || !cc.isValid(label.node)) { this._labels.delete(label); return; }
  if (!this._ownsLabel(label)) { this._labels.delete(label); return; }
  var recipe = label._localizedRecipe || this._recipe(label.string);
  label._localizedRecipe = recipe;
  var value = this._remember(this._render(recipe), recipe);
  this._applyLabelStyle(label, recipe);
  label._localizationWriting = true;
  try { label.string = value; } finally { label._localizationWriting = false; }
};
LanguageMgr.prototype.refresh = function () {
  var self = this;
  if (typeof cc === "undefined") return;
  this._labels.forEach(function (label) { self.refreshLabel(label); });
  this._sprites.forEach(function (sprite) {
    if (!cc.isValid(sprite)) self._sprites.delete(sprite); else self.refreshSprite(sprite);
  });
  var scene = cc.director && cc.director.getScene();
  if (scene) this.refreshTree(scene);
  if (this._spineArtwork) this._spineArtwork.refresh();
};
LanguageMgr.prototype.refreshTree = function (node) {
  var self = this;
  if (!node || !cc.isValid(node)) return;
  if (cc.Scene && node instanceof cc.Scene) {
    node.children.slice().forEach(function (child) { self.refreshTree(child); });
    return;
  }
  var label = node.getComponent(cc.Label) || node.getComponent(cc.RichText);
  if (label && this._ownsLabel(label)) {
    if (!label._localizedRecipe) label._localizedRecipe = this._recipe(label.string);
    this._applyLabelStyle(label, label._localizedRecipe);
    if (this._isLocalized(label._localizedRecipe) || label._localizedStyleKey) {
      this._labels.add(label); this.refreshLabel(label);
    }
  }
  var sprite = node.getComponent(cc.Sprite);
  if (sprite) this.refreshSprite(sprite);
  node.children.slice().forEach(function (child) { self.refreshTree(child); });
};
LanguageMgr.prototype._applyLabelStyle = function (label, recipe) {
  if (!this.ready || !label.node) return;
  var node = label.node;
  var nodeStyles = this.catalog.nodeStyles || {};
  var fileId = node._prefab && node._prefab.fileId;
  var prefab = node._prefab && node._prefab.asset;
  var assetUuid = prefab && prefab._uuid;
  var key = fileId && ((assetUuid && nodeStyles[assetUuid + ":" + fileId]) || nodeStyles[fileId]);
  if (!key) key = label._localizedStyleKey;
  if (!key && this.catalog.nodePathStyles) {
    var parts = [], current = node;
    while (current) {
      parts.unshift(current.name);
      key = this.catalog.nodePathStyles[parts.join("/")];
      if (key) break;
      current = current.parent;
    }
  }
  if (!key) {
    var match = /\[\[loc:([\w.-]+)\]\]/.exec(recipe.template);
    key = match ? match[1] : recipe.template;
  }
  var styles = this.catalog.labelStyles && this.catalog.labelStyles[key];
  if (!styles) return;
  label._localizedStyleKey = key;
  if (!label._localizedBaseStyle) label._localizedBaseStyle = {
    width: node.width, height: node.height, x: node.x, y: node.y,
    fontSize: label.fontSize, lineHeight: label.lineHeight,
    overflow: label.overflow, wrap: label.enableWrapText, maxWidth: label.maxWidth,
    horizontalAlign: label.horizontalAlign
  };
  var original = label._localizedBaseStyle;
  var style = styles[this.currentLan] || {};
  var rich = cc.RichText && label instanceof cc.RichText;
  label.fontSize = style.fontSize === undefined ? original.fontSize : style.fontSize;
  label.lineHeight = style.lineHeight === undefined ? original.lineHeight : style.lineHeight;
  label.horizontalAlign = style.horizontalAlign === undefined ? original.horizontalAlign : style.horizontalAlign;
  if (rich) label.maxWidth = style.width === undefined ? original.maxWidth : style.width;
  else {
    label.overflow = style.overflow ? cc.Label.Overflow[style.overflow] : original.overflow;
    label.enableWrapText = style.wrap === undefined ? original.wrap : style.wrap;
    var height = style.height === undefined ? original.height : style.height;
    if (style.maxLines && style.wrap) height = Math.min(height, label.lineHeight * style.maxLines + label.fontSize * 0.3);
    node.setContentSize(style.width === undefined ? original.width : style.width, height);
  }
  if (style.x !== undefined || style.y !== undefined || label._localizedPositionOverride) {
    node.setPosition(style.x === undefined ? original.x : style.x, style.y === undefined ? original.y : style.y);
    label._localizedPositionOverride = style.x !== undefined || style.y !== undefined;
  }
};
LanguageMgr.prototype.getAudit = function () {
  return { language: this.currentLan, ready: this.ready, entries: Object.keys(this.catalog.entries).length,
    missing: Object.keys(this._missing), trackedLabels: this._labels.size, trackedImages: this._sprites.size };
};
LanguageMgr.prototype.install = function () {
  if (typeof cc === "undefined" || typeof CC_EDITOR !== "undefined" && CC_EDITOR) return;
  var self = this;
  if (typeof sp !== "undefined" && sp.Skeleton) {
    this._spineArtwork = require("LocalizedArtwork").LocalizedArtwork;
    this._spineArtwork.install(this);
  }
  function patchLabel(Type) {
    if (!Type || Object.prototype.hasOwnProperty.call(Type.prototype, "_localizationInstalled")) return;
    var prototype = Type.prototype;
    var descriptor = Object.getOwnPropertyDescriptor(prototype, "string");
    if (!descriptor || !descriptor.set) return;
    Object.defineProperty(prototype, "_localizationInstalled", { value: true });
    Object.defineProperty(prototype, "string", { configurable: true, enumerable: descriptor.enumerable,
      get: descriptor.get, set: function (value) {
        if (this._localizationWriting) return descriptor.set.call(this, value);
        if (!self._ownsLabel(this)) { self._labels.delete(this); delete this._localizedRecipe; return descriptor.set.call(this, value); }
        var recipe = self._recipe(value);
        this._localizedRecipe = recipe;
        self._applyLabelStyle(this, recipe);
        if (self._isLocalized(recipe) || this._localizedStyleKey) self._labels.add(this);
        else self._labels.delete(this);
        return descriptor.set.call(this, self._render(recipe));
      }
    });
    var onEnable = prototype.onEnable;
    prototype.onEnable = function () {
      if (self._ownsLabel(this)) this.string = this._localizedRecipe ? self._remember(self._render(this._localizedRecipe), this._localizedRecipe) : this.string;
      if (onEnable) onEnable.apply(this, arguments);
    };
    var onDestroy = prototype.onDestroy;
    prototype.onDestroy = function () {
      self._labels.delete(this);
      if (onDestroy) onDestroy.apply(this, arguments);
    };
  }
  patchLabel(cc.Label);
  patchLabel(cc.RichText);
  if (cc.instantiate && cc.Node && !cc.instantiate._localizationInstalled) {
    var instantiate = cc.instantiate;
    var localizedInstantiate = function (source) {
      var clone = instantiate.apply(this, arguments);
      // Prefab assets retain serialized tokens. Cloning a live Node instead
      // copies rendered strings/frames, so carry their original bindings too.
      if (source instanceof cc.Node && clone instanceof cc.Node) self._copyNodeBindings(source, clone);
      return clone;
    };
    Object.keys(instantiate).forEach(function (key) { localizedInstantiate[key] = instantiate[key]; });
    localizedInstantiate._localizationInstalled = true;
    cc.instantiate = localizedInstantiate;
  }
  if (cc.Sprite && !cc.Sprite.prototype._localizationInstalled) {
    var prototype = cc.Sprite.prototype;
    var descriptor = Object.getOwnPropertyDescriptor(prototype, "spriteFrame");
    Object.defineProperty(prototype, "_localizationInstalled", { value: true });
    if (descriptor && descriptor.set) Object.defineProperty(prototype, "spriteFrame", {
      configurable: true, enumerable: descriptor.enumerable, get: descriptor.get,
      set: function (value) {
        descriptor.set.call(this, value);
        if (!this._localizationWriting) { this._localizedOriginalFrame = value; self.refreshSprite(this); }
      }
    });
    var onEnable = prototype.onEnable;
    prototype.onEnable = function () { if (onEnable) onEnable.apply(this, arguments); self.refreshSprite(this); };
    var onDestroy = prototype.onDestroy;
    prototype.onDestroy = function () {
      self._sprites.delete(this);
      this._localizedRequest = (this._localizedRequest || 0) + 1;
      if (onDestroy) onDestroy.apply(this, arguments);
    };
  }
  if (cc.director) cc.director.on(cc.Director.EVENT_AFTER_SCENE_LAUNCH, function () { self.refresh(); });
};
LanguageMgr.prototype._copyNodeBindings = function (source, clone) {
  if (source._localizationGenerated) clone._localizationGenerated = true;
  var self = this;
  [cc.Label, cc.RichText].forEach(function (Type) {
    if (!Type) return;
    var label = source.getComponent(Type), copy = clone.getComponent(Type);
    if (!label || !copy) return;
    if (label._localizedBaseStyle) copy._localizedBaseStyle = Object.assign({}, label._localizedBaseStyle);
    if (label._localizedStyleKey) copy._localizedStyleKey = label._localizedStyleKey;
    if (label._localizedRecipe) {
      copy._localizedRecipe = JSON.parse(JSON.stringify(label._localizedRecipe));
      if (self._isLocalized(copy._localizedRecipe) || copy._localizedStyleKey) { self._labels.add(copy); self.refreshLabel(copy); }
    }
  });
  var sprite = source.getComponent(cc.Sprite), image = clone.getComponent(cc.Sprite);
  if (sprite && image && sprite._localizedOriginalFrame) {
    image._localizedOriginalFrame = sprite._localizedOriginalFrame;
    this.refreshSprite(image);
  }
  (source.children || []).forEach(function (child, index) { if (clone.children[index]) self._copyNodeBindings(child, clone.children[index]); });
};
// Artwork retains the original transform. Unverified source fonts stay pending.
LanguageMgr.prototype.refreshSprite = function (sprite) {
  if (!this.ready || !sprite || !sprite.node || !cc.isValid(sprite) || !cc.isValid(sprite.node) || sprite._localizationWriting) return;
  var frame = sprite._localizedOriginalFrame || sprite.spriteFrame;
  var uuid = frame && frame._uuid;
  var binding = uuid && this.catalog.images[uuid];
  var request = sprite._localizedRequest = (sprite._localizedRequest || 0) + 1;
  if (!binding) { this._sprites.delete(sprite); if (sprite._localizedOverlay) sprite._localizedOverlay.active = false; return; }
  this._sprites.add(sprite);
  sprite._localizedOriginalFrame = frame;
  var originalText = binding.preserveOriginal && binding.preserveOriginal[this.currentLan];
  var preserve = originalText === true || typeof originalText === "string" && originalText === this._entry(binding.key, this.currentLan);
  if (originalText && typeof originalText === "object") preserve = Object.keys(originalText).every(function (key) {
    return this._entry(key, this.currentLan) === originalText[key];
  }, this);
  var template = binding.template && this.catalog.artTemplates && this.catalog.artTemplates[binding.template];
  // Template drafts have no production texture yet. Keep their original art
  // when preview recompiles instead of hiding it under a generic text overlay.
  if (binding.pending || template && template.pending || binding.template && !binding.artwork || preserve || binding.preserveOriginal === true && this.currentLan === "zh") {
    if (sprite._localizedOverlay) sprite._localizedOverlay.active = false;
    this._setFrame(sprite, frame); return;
  }
  var replacement = binding.artwork && binding.artwork[this.currentLan];
  // Adding a catalog language rebuilds all ready templates. Their generated
  // resource paths are deterministic; no manual artwork-map edit is required.
  if (!replacement && binding.artwork && template && (!template.languages || template.languages.indexOf(this.currentLan) !== -1)) {
    replacement = "localization/generated/" + this.currentLan + "/" + binding.template;
  }
  if (replacement) {
    if (sprite._localizedOverlay) sprite._localizedOverlay.active = false;
    var self = this, language = this.currentLan;
    var loaded = function (error, asset) {
      if (!cc.isValid(sprite) || !sprite.node || !cc.isValid(sprite.node) || self.currentLan !== language || sprite._localizedOriginalFrame !== frame || sprite._localizedRequest !== request) return;
      if (!error && !asset) error = new Error("The artwork loader returned no SpriteFrame.");
      if (!error && typeof cc.SpriteFrame === "function" && !(asset instanceof cc.SpriteFrame)) error = new Error("Localized artwork must be a SpriteFrame.");
      if (error) {
        self._setFrame(sprite, frame);
        if (!self._missing["artwork:" + replacement] && cc.warn) cc.warn("Localized artwork failed to load: " + replacement, error);
        self._missing["artwork:" + replacement] = true;
      } else {
        delete self._missing["artwork:" + replacement];
        self._setFrame(sprite, asset);
      }
    };
    try {
      if (replacement.indexOf("localization/") === 0) cc.resources.load(replacement, cc.SpriteFrame, loaded);
      else cc.assetManager.loadAny(replacement, loaded);
    } catch (error) { loaded(error); }
    return;
  }
  if (binding.template) {
    // A locale excluded from a template's build list keeps its source artwork.
    if (sprite._localizedOverlay) sprite._localizedOverlay.active = false;
    this._setFrame(sprite, frame);
    return;
  }
  if (binding.key) this._drawTextImage(sprite, frame, binding);
};
LanguageMgr.prototype._setFrame = function (sprite, frame) {
  if (!sprite || !sprite.node || !cc.isValid(sprite) || !cc.isValid(sprite.node)) return;
  var width = sprite.node.width, height = sprite.node.height;
  sprite._localizationWriting = true;
  try {
    sprite.spriteFrame = frame;
    if (sprite.node.setContentSize) sprite.node.setContentSize(width, height);
  } finally { sprite._localizationWriting = false; }
};
LanguageMgr.prototype._drawTextImage = function (sprite, frame, binding) {
  var node = sprite.node;
  var width = node.width, height = node.height;
  var rect = binding.rect || { x: 0, y: 0, width: width, height: height };
  var overlay = sprite._localizedOverlay;
  if (!overlay || !cc.isValid(overlay)) {
    overlay = new cc.Node("LocalizedArtwork");
    overlay._localizationGenerated = true;
    node.addChild(overlay);
    sprite._localizedOverlay = overlay;
  }
  overlay.active = true;
  overlay.setPosition(rect.x || 0, rect.y || 0);
  overlay.setContentSize(rect.width || width, rect.height || height);
  overlay.angle = binding.angle || 0;
  overlay.color = cc.color(binding.color || "#ffffff");
  if (binding.mode !== "overlay") this._setFrame(sprite, null); else this._setFrame(sprite, frame);
  var label = overlay.getComponent(cc.Label) || overlay.addComponent(cc.Label);
  label.useSystemFont = !binding.font;
  label.fontFamily = binding.fontFamily || "Arial";
  label.fontSize = binding.fontSize || 30;
  label.lineHeight = binding.lineHeight || label.fontSize;
  label.isBold = !!binding.bold;
  label.isItalic = !!binding.italic;
  label.horizontalAlign = binding.horizontalAlign == null ? cc.Label.HorizontalAlign.CENTER : binding.horizontalAlign;
  label.verticalAlign = cc.Label.VerticalAlign.CENTER;
  label.overflow = cc.Label.Overflow.SHRINK;
  label.enableWrapText = binding.wrap !== false;
  label.string = this.t(binding.key);
  var outline = overlay.getComponent(cc.LabelOutline);
  if (binding.outlineWidth) {
    outline = outline || overlay.addComponent(cc.LabelOutline);
    outline.color = cc.color(binding.outlineColor || "#000000"); outline.width = binding.outlineWidth;
  } else if (outline) outline.enabled = false;
  if (binding.font) {
    var self = this;
    if (this._fontCache[binding.font]) label.font = this._fontCache[binding.font];
    else cc.assetManager.loadAny(binding.font, function (error, font) {
      if (!error) { self._fontCache[binding.font] = font; if (cc.isValid(label)) label.font = font; }
    });
  }
};
exports.LanguageMgr = LanguageMgr;
