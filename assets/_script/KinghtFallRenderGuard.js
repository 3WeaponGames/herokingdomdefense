"use strict";

// Creator 2.4.13's web Spine assembler skips its transform-depth increment
// when the runtime skeleton is absent, but still decrements in postFillBuffers.
// The resulting -1 suppresses later Sprite world-vertex updates when a moving
// parent brings the depth back to zero. Keep the normal paired render scope.
function install(Skeleton, engine) {
  if (!engine || engine.ENGINE_VERSION !== "2.4.13" || engine.sys && engine.sys.isNative) return false;
  var Assembler = Skeleton && Skeleton.__assembler__, prototype = Assembler && Assembler.prototype;
  if (!prototype || typeof prototype.fillBuffers !== "function" || typeof prototype.postFillBuffers !== "function") return false;
  var fill = prototype.fillBuffers;
  if (fill._kingdomEmptySkeletonGuard) return true;
  var guarded = function (component, renderer) {
    if (component._skeleton) return fill.apply(this, arguments);
    var depth = renderer.worldMatDirty;
    var result = fill.apply(this, arguments);
    // Also tolerate an assembler that already balances the empty path.
    if (renderer.worldMatDirty === depth) renderer.worldMatDirty++;
    return result;
  };
  guarded._kingdomEmptySkeletonGuard = true;
  prototype.fillBuffers = guarded;
  return true;
}

exports.install = install;
