"use strict";
cc.Class({
  extends: cc.Component,
  properties: { graphs: '', spawns: '' },
  onLoad: function () { this._graphs = JSON.parse(this.graphs || '[]'); },
  resolve: function (spawnId, built, override) {
    var self = this;
    var path = require('AuthoredSpawnPlan').route(this._graphs || JSON.parse(this.graphs || '[]'), spawnId, built, override);
    return path.map(function (point) { return self.node.getChildByName(require('AuthoredSpawnPlan').pointName(point.graphId, point.nodeId)); }).filter(Boolean);
  }
});
