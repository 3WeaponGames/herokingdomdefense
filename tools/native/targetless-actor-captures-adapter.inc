// Capture the actual Creator methods only after the native assemblers load.
var hkdTargetlessStockData, hkdTargetlessStockColor, hkdTargetlessStockDisable;
var hkdTargetlessLeaf, hkdTargetlessReady = false, hkdTargetlessRenderers = [];

function hkdTargetlessInitialize() {
  if (hkdTargetlessReady) return;
  hkdTargetlessStockData = cc.Assembler.prototype._updateRenderData;
  hkdTargetlessStockColor = cc.RenderComponent.prototype._updateColor;
  hkdTargetlessStockDisable = cc.RenderComponent.prototype.disableRender;
  hkdTargetlessRenderers = [cc.Sprite, cc.Mask, cc.Graphics, cc.Label, cc.MotionStreak, sp.Skeleton].filter(Boolean).map(function (Type) {
    var registry = Type.__assembler__, methods = [cc.Assembler.prototype.updateRenderData];
    function add(Assembler) {
      var method = Assembler && Assembler.prototype && Assembler.prototype.updateRenderData;
      if (typeof method === "function" && methods.indexOf(method) < 0) methods.push(method);
    }
    if (typeof registry === "function") add(registry);
    else if (registry) Object.keys(registry).forEach(function (key) { add(registry[key]); });
    return { type: Type.prototype, validate: Type.prototype._validateRender, data: methods };
  });
  hkdTargetlessLeaf = typeof spine !== "undefined" && spine._hkdTargetlessLeaf;
  hkdTargetlessReady = true;
}

function hkdTargetlessStockComponent(component) {
  if (!component) return null;
  var proto = Object.getPrototypeOf(component);
  for (var i = 0; i < hkdTargetlessRenderers.length; i++) {
    if (hkdTargetlessRenderers[i].type === proto) return hkdTargetlessRenderers[i];
  }
  return null;
}

function hkdTargetlessRequire(request) {
  if (!request.materialize() || !request.materialized) throw Error("Cannot restore the original actor capture target");
}

function hkdTargetlessBeforeValidation(request, component) {
  if (request.materialized) return;
  var stock = hkdTargetlessStockComponent(component);
  if (!stock || component.enabledInHierarchy && component._validateRender !== stock.validate ||
      !component.enabledInHierarchy && component.disableRender !== hkdTargetlessStockDisable) {
    hkdTargetlessRequire(request);
  }
}

function hkdTargetlessBeforeDirty(request, component, assembler, kind) {
  if (request.materialized) return;
  var stock = hkdTargetlessStockComponent(component);
  var method = kind === "data" ? assembler._updateRenderData : component._updateColor;
  if (!method) return;
  if (stock) {
    if (kind === "color" && method === hkdTargetlessStockColor) return;
    if (kind === "data" && assembler._renderComp === component) {
      if (method === hkdTargetlessStockData && stock.data.indexOf(assembler.updateRenderData) >= 0) return;
      if (component.node && component.node._occlusionMask === true &&
          Object.getPrototypeOf(component) === cc.Mask.prototype && typeof method._hkdCarryDirtyMask === "function") return;
    }
  }
  hkdTargetlessRequire(request);
}

var hkdTargetlessAdapter = Object.freeze({
  initialize: hkdTargetlessInitialize,
  beforeValidation: hkdTargetlessBeforeValidation,
  ownsRoute: function (render, renderCamera) {
    return hkdTargetlessReady && render === hkdTargetlessRender && renderCamera === hkdTargetlessRenderCamera &&
      typeof hkdTargetlessLeaf === "function" && spine._hkdTargetlessLeaf === hkdTargetlessLeaf;
  }
});
Object.defineProperty(RenderFlow, "_hkdTargetlessAdapter", { value: hkdTargetlessAdapter });

function hkdTargetlessNativeMatches(request) {
  return typeof hkdTargetlessLeaf === "function" && spine._hkdTargetlessLeaf === hkdTargetlessLeaf &&
    request.run === hkdTargetlessLeaf;
}

function hkdTargetlessEnter(receiver, root, dt, camera) {
  var request = RenderFlow._hkdTargetlessRequest;
  if (!request) return null;
  if (request.entered || receiver !== RenderFlow || root !== request.root || dt !== 0 || camera !== request.nativeCamera) {
    if (!request.materialized) hkdTargetlessRequire(request);
    return null;
  }
  request.entered = true;
  request.validating = true;
  if (!request.materialized && (receiver._nativeFlow !== request.flow || !hkdTargetlessNativeMatches(request))) {
    hkdTargetlessRequire(request);
  }
  return request;
}

function hkdTargetlessDispatch(request, receiver, root, dt, camera) {
  if (!request.materialized && !request.revalidate()) hkdTargetlessRequire(request);
  var result = 0;
  if (!request.materialized && RenderFlow._hkdTargetlessRequest === request && hkdTargetlessNativeMatches(request) &&
      receiver._nativeFlow === request.flow && root === request.root && dt === 0 && camera === request.nativeCamera) {
    result = request.run(receiver._nativeFlow, root._proxy, camera, request.materialize);
  }
  if (result === 0) {
    if (!request.materialized) hkdTargetlessRequire(request);
    receiver._nativeFlow.render(root._proxy, dt, camera);
    result = 1;
  }
  if (result !== 1 && result !== 2 || (result === 1) !== request.materialized) {
    throw Error("Unexpected native actor capture response");
  }
  request.result = result;
}
