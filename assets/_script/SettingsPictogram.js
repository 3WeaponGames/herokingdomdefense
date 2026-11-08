"use strict";

// Each visible pictogram owns its frame while a Settings/Pause panel is alive.
exports.SettingsPictogram = cc.Class({
  extends: cc.Component,
  setResource: function (resource) {
    if (this._disposed || this._resource === resource && (this._frame && this._loadedResource === resource || this._loading)) return;
    this._resource = resource;
    var generation = this._generation = (this._generation || 0) + 1, owner = this;
    if (!cc.resources || !cc.resources.load) return;
    this._loading = true;
    cc.resources.load(resource, cc.SpriteFrame, function (error, frame) {
      if (owner._disposed || generation !== owner._generation || !cc.isValid(owner, true) || !cc.isValid(owner.node, true)) return;
      owner._loading = false;
      if (error || !frame) return;
      frame.addRef();
      var previous = owner._frame;
      owner._frame = frame;
      owner._loadedResource = resource;
      owner.node.getComponent(cc.Sprite).spriteFrame = frame;
      if (previous) previous.decRef();
    });
  },
  onDestroy: function () {
    this._disposed = true;
    this._generation = (this._generation || 0) + 1;
    this.node.getComponent(cc.Sprite).spriteFrame = null;
    if (this._frame) this._frame.decRef();
    this._frame = null;
  }
});
