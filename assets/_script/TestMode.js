"use strict";

// Development-only state; the reward adapter and limit guards consume this API.
// Deliberately has no dependency on SdkMgr, platform adapters, or player data.
var LanguageMgr = require("LanguageMgr").LanguageMgr;
var STORAGE_KEY = "project-cocos.test-mode";
var BADGE_KEY = "testing.modeBadge";

function TestMode() {
  this._initialized = false;
  this._enabled = false;
  this._f8Down = false;
  this._badge = null;
  this._gameplayTarget = null;
  this._held = {};
  this._movement = {};
  this._actions = {};
}

TestMode.getInstance = function () {
  if (!TestMode.instance) TestMode.instance = new TestMode();
  return TestMode.instance;
};

TestMode.prototype.isAvailable = function () {
  if (typeof CC_EDITOR !== "undefined" && CC_EDITOR) return false;
  return !!((typeof CC_PREVIEW !== "undefined" && CC_PREVIEW) ||
    (typeof CC_DEBUG !== "undefined" && CC_DEBUG));
};

TestMode.prototype.init = function () {
  if (this._initialized) return this;
  this._initialized = true;
  // A release build neither reads nor writes the development preference.
  if (!this.isAvailable()) return this;
  try { this._enabled = cc.sys.localStorage.getItem(STORAGE_KEY) === "1"; }
  catch (error) { this._enabled = false; }
  this._installHotkey();
  if (cc.director && cc.Director) cc.director.on(cc.Director.EVENT_AFTER_SCENE_LAUNCH, this._refreshBadge, this);
  if (cc.game && cc.game.on && cc.game.EVENT_HIDE) cc.game.on(cc.game.EVENT_HIDE, this._releaseKey, this);
  this._refreshBadge();
  return this;
};

TestMode.prototype.isEnabled = function () {
  this.init();
  return this.isAvailable() && this._enabled;
};

TestMode.prototype.shouldBypassAdLimits = function () { return this.isEnabled(); };

TestMode.prototype.setEnabled = function (enabled) {
  this.init();
  if (!this.isAvailable()) return false;
  this._enabled = !!enabled;
  this.clearGameplayInput();
  try { cc.sys.localStorage.setItem(STORAGE_KEY, this._enabled ? "1" : "0"); }
  catch (error) { /* Session testing still works when local storage is unavailable. */ }
  this._refreshBadge();
  return this._enabled;
};

TestMode.prototype.toggle = function () { return this.setEnabled(!this.isEnabled()); };

TestMode.prototype._isF8 = function (event) {
  return !!event && (event.code === "F8" || event.key === "F8" || event.keyCode === 119);
};

TestMode.prototype._isEditing = function (event) {
  function editable(element) {
    if (!element) return false;
    var tag = String(element.tagName || "").toLowerCase();
    return element.isContentEditable || tag === "input" || tag === "textarea" || tag === "select";
  }
  var elements = [event && event.target];
  if (typeof document !== "undefined") elements.push(document.activeElement);
  if (event && typeof event.composedPath === "function") elements = elements.concat(event.composedPath());
  if (elements.some(editable)) return true;
  // Covers native Cocos EditBox focus, where there may be no HTML input.
  var scene = cc.director && cc.director.getScene();
  if (scene && cc.EditBox && scene.getComponentsInChildren) {
    // Native Scene has no component array; query its normal child Nodes.
    return (scene.children || [scene]).some(function (root) {
      return root.getComponentsInChildren && root.getComponentsInChildren(cc.EditBox).some(function (box) {
        return cc.isValid(box) && box.isFocused && box.isFocused();
      });
    });
  }
  return false;
};

TestMode.prototype._keyDown = function (event) {
  if (!event || !this.isAvailable()) return;
  if (this._isF8(event)) {
    if (this._f8Down) return;
    this._f8Down = true;
    // Latch ignored presses too: moving focus while holding F8 must not toggle.
    if (event.repeat || event.isComposing || event.ctrlKey || event.altKey || event.metaKey || event.shiftKey || this._isEditing(event)) return;
    if (event.preventDefault) event.preventDefault();
    this.toggle();
    return;
  }
  var key = this._gameplayKey(event);
  if (!key || this._held[key]) return;
  this._held[key] = true;
  if (!this._enabled || !this._hasGameplayTarget() || event.repeat || event.isComposing ||
      event.ctrlKey || event.altKey || event.metaKey || event.shiftKey || this._isEditing(event)) return;
  if (event.preventDefault) event.preventDefault();
  if (key.length === 1) this._movement[key] = true;
  else this._actions[key] = true;
};

TestMode.prototype._keyUp = function (event) {
  if (this._isF8(event)) this._f8Down = false;
  var key = this._gameplayKey(event);
  if (key) { delete this._held[key]; delete this._movement[key]; }
};

TestMode.prototype._releaseKey = function () { this._f8Down = false; this.clearGameplayInput(); };

TestMode.prototype._gameplayKey = function (event) {
  if (!event) return null;
  var codes = { KeyW: 'w', KeyA: 'a', KeyS: 's', KeyD: 'd', KeyR: 'rally', KeyF: 'follow', Escape: 'pause', Space: 'build' };
  var names = { w: 'w', a: 'a', s: 's', d: 'd', r: 'rally', f: 'follow', escape: 'pause', esc: 'pause', ' ': 'build', spacebar: 'build' };
  var numbers = { 87: 'w', 65: 'a', 83: 's', 68: 'd', 82: 'rally', 70: 'follow', 27: 'pause', 32: 'build' };
  return codes[event.code] || names[String(event.key || '').toLowerCase()] || numbers[event.keyCode] || null;
};

TestMode.prototype.clearGameplayInput = function (preserveHeld) {
  if (!preserveHeld) this._held = {};
  this._movement = {}; this._actions = {};
};
TestMode.prototype.setGameplayTarget = function (target) {
  if (this._gameplayTarget !== target) this.clearGameplayInput();
  this._gameplayTarget = target;
};
TestMode.prototype.removeGameplayTarget = function (target) {
  if (this._gameplayTarget === target) { this._gameplayTarget = null; this.clearGameplayInput(); }
};
TestMode.prototype._hasGameplayTarget = function () {
  var target = this._gameplayTarget;
  return target && cc.isValid(target) && target.node && cc.isValid(target.node) &&
    target.node.active !== false && target.node.activeInHierarchy !== false;
};
TestMode.prototype.readGameplayInput = function (target) {
  if (!this.isEnabled() || target !== this._gameplayTarget || !this._hasGameplayTarget()) return null;
  if (this._isEditing()) { this._movement = {}; this._actions = {}; return null; }
  var x = (this._movement.d ? 1 : 0) - (this._movement.a ? 1 : 0);
  var y = (this._movement.w ? 1 : 0) - (this._movement.s ? 1 : 0);
  var length = Math.sqrt(x * x + y * y) || 1;
  var input = { x: x / length, y: y / length, rally: !!this._actions.rally, follow: !!this._actions.follow,
    pause: !!this._actions.pause, build: !!this._actions.build };
  this._actions = {};
  return input;
};

TestMode.prototype._installHotkey = function () {
  var self = this;
  if (typeof window !== "undefined" && window.addEventListener) {
    // GAD_App clears Cocos KEY_UP subscribers on exit. DOM events are independent.
    window.addEventListener("keydown", function (event) { self._keyDown(event); }, true);
    window.addEventListener("keyup", function (event) { self._keyUp(event); }, true);
    window.addEventListener("blur", function () { self._releaseKey(); });
  } else if (cc.systemEvent && cc.SystemEvent && cc.eventManager && cc.EventListener) {
    cc.systemEvent.on(cc.SystemEvent.EventType.KEY_DOWN, this._keyDown, this);
    // Register AFTER the Cocos system listener so its keyboard dispatcher exists.
    // A dedicated release listener survives GAD's blanket systemEvent KEY_UP off.
    this._nativeReleaseListener = cc.EventListener.create({
      event: cc.EventListener.KEYBOARD,
      onKeyReleased: function (code) { self._keyUp({ keyCode: code }); }
    });
    cc.eventManager.addListener(this._nativeReleaseListener, 1);
  }
};

TestMode.prototype._refreshBadge = function () {
  var shown = this.isAvailable() && this._enabled;
  if (!shown) {
    if (this._badge && cc.isValid(this._badge)) this._badge.active = false;
    return;
  }
  if (this._badge && cc.isValid(this._badge)) { this._badge.active = true; return; }
  var canvas = cc.Canvas && cc.Canvas.instance;
  if (!canvas || !canvas.node || !cc.isValid(canvas.node)) return;
  var badge = new cc.Node("DevelopmentTestModeBadge");
  badge.setContentSize(360, 44);
  badge.group = canvas.node.group;
  badge.zIndex = cc.macro.MAX_ZINDEX;
  canvas.node.addChild(badge);
  var graphics = badge.addComponent(cc.Graphics);
  graphics.fillColor = cc.color(32, 26, 11, 235);
  graphics.strokeColor = cc.color("#f2c357");
  graphics.lineWidth = 1;
  graphics.roundRect(-180, -22, 360, 44, 5);
  graphics.fill(); graphics.stroke();
  var text = new cc.Node("Caption");
  badge.addChild(text);
  var label = text.addComponent(cc.Label);
  label.fontSize = 30;
  label.lineHeight = 34;
  label.isBold = true;
  label.horizontalAlign = cc.Label.HorizontalAlign.CENTER;
  label.verticalAlign = cc.Label.VerticalAlign.CENTER;
  label.overflow = cc.Label.Overflow.SHRINK;
  label.enableWrapText = false;
  text.color = cc.color("#ffe19a");
  // Label's default NONE overflow can clear size during creation; restore last.
  text.setContentSize(340, 44);
  LanguageMgr.getInstance().bindLabel(label, BADGE_KEY);
  var widget = badge.addComponent(cc.Widget);
  widget.isAlignTop = true;
  widget.top = 3;
  widget.isAlignHorizontalCenter = true;
  widget.horizontalCenter = 0;
  widget.alignMode = cc.Widget.AlignMode.ALWAYS;
  widget.updateAlignment();
  // No button, touch listener, or BlockInputEvents: this badge never eats input.
  this._badge = badge;
};

exports.TestMode = TestMode;
