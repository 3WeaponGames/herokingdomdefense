"use strict";

// Keep Creator's native touch dragging, inertia, nested-view handling and
// button cancellation. Only wheel input needs interpolation between notches.
exports.install = function () {
  if (typeof CC_EDITOR !== "undefined" && CC_EDITOR || !cc.ScrollView) return;
  var prototype = cc.ScrollView.prototype;
  if (prototype._hkdSmoothScrollInstalled || !prototype._onMouseWheel) return;
  Object.defineProperty(prototype, "_hkdSmoothScrollInstalled", { value: true });
  var wheel = prototype._onMouseWheel, began = prototype._onTouchBegan;
  var enable = prototype.onEnable, disable = prototype.onDisable;
  prototype.onEnable = function () {
    // The shipped vertical lists used very heavy braking. Keep explicitly
    // authored alternatives, including page/adhering lists, intact.
    if (this.vertical && !this.horizontal && this.brake === 0.75) this.brake = 0.45;
    return enable && enable.apply(this, arguments);
  };
  prototype._onTouchBegan = function () {
    this._hkdWheel = null;
    return began && began.apply(this, arguments);
  };
  prototype.onDisable = function () {
    this._hkdWheel = null;
    return disable && disable.apply(this, arguments);
  };
  prototype._onMouseWheel = function (event, captureListeners) {
    if (!this.vertical || this.horizontal || !this.content || !this.inertia ||
        !this.getMaxScrollOffset || !this.enabledInHierarchy ||
        this.hasNestedViewGroup(event, captureListeners)) return wheel.apply(this, arguments);
    var precision = -0.1;
    if (cc.sys.os === cc.sys.OS_WINDOWS && cc.sys.browserType === cc.sys.BROWSER_TYPE_FIREFOX) precision /= 3;
    if (cc.sys.isNative || typeof CC_RUNTIME !== "undefined" && CC_RUNTIME) precision = -7;
    var delta = event.getScrollY() * precision;
    if (!isFinite(delta) || !delta) return;
    var current = this.getScrollOffset(), maximum = this.getMaxScrollOffset();
    var state = this._hkdWheel;
    // Accumulate fast wheel/trackpad input without restarting from an old
    // position. A reversal, touch or programmatic scroll takes over immediately.
    var continuing = state && this.isAutoScrolling() && state.motion === this._autoScrollTargetDelta;
    var start = continuing && delta * state.delta > 0 ? state.target : current.y;
    var target = Math.max(0, Math.min(maximum.y, start + delta));
    if (Math.abs(target - current.y) > 0.01) {
      if (!continuing) this._dispatchEvent("scroll-began");
      this.scrollToOffset(cc.v2(current.x, target), 0.16, true);
      this._hkdWheel = { target: target, delta: delta, motion: this._autoScrollTargetDelta };
    }
    this._stopPropagationIfTargetIsMe(event);
  };
};
