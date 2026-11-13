"use strict";

// Creator 2.4's native contact dispatcher assumes both collider bodies still
// exist. A retired fixture must not interrupt Step: Box2D then stays locked
// and every later body transform fails. Keep live contacts on the engine path.
exports.install = function () {
  if (!cc.sys || !cc.sys.isNative || !cc.PhysicsContact) return;
  var prototype = cc.PhysicsContact.prototype, emit = prototype && prototype.emit;
  if (typeof emit !== "function" || emit._hkdRetiredFixtureGuard) return;
  function guardedEmit(type) {
    var a = this.colliderA, b = this.colliderB;
    if (!a || !b || !a.body || !b.body) {
      guardedEmit._retiredFixtureSkips++;
      // EndContact still returns to the manager, which owns contact pooling.
      // Other retired contacts must not leave an invisible solid obstruction.
      if (type !== "end-contact" && this._b2contact && this.setEnabled) this.setEnabled(false);
      return;
    }
    return emit.apply(this, arguments);
  }
  guardedEmit._hkdRetiredFixtureGuard = true;
  guardedEmit._retiredFixtureSkips = 0;
  prototype.emit = guardedEmit;
};
