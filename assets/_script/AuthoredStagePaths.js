"use strict";
cc.Class({
  extends: cc.Component,
  properties: { graphs: '', spawns: '' },
  onLoad: function () { this._graphs = JSON.parse(this.graphs || '[]'); this._graphSource = this.graphs; },
  spawnSpec: function (id) {
    if (this._spawnSource !== this.spawns || !this._spawnById) {
      var spawns = JSON.parse(this.spawns || '[]'), byId = Object.create(null);
      if (!Array.isArray(spawns)) throw Error('Authored spawns must be an array.');
      spawns.forEach(function (spawn) { if (spawn) { var key = typeof spawn.id + ':' + spawn.id; if (!Object.prototype.hasOwnProperty.call(byId, key)) byId[key] = spawn; } });
      this._spawnById = byId; this._spawnSource = this.spawns;
    }
    return this._spawnById[typeof id + ':' + id];
  },
  resolve: function (spawnId, built, override) {
    if (this._graphSource !== this.graphs || !this._graphs) { this._graphs = JSON.parse(this.graphs || '[]'); this._graphSource = this.graphs; }
    var plan = require('AuthoredSpawnPlan'), path = plan.route(this._graphs, spawnId, built, override), nodes = [], children = this.node.children;
    // Cocos child lookup is linear. Share one name index across route resolutions
    // while keeping live references, so native point moves still take effect.
    var rebuild = function () {
      var byName = Object.create(null); (children || []).forEach(function (node) { if (!Object.prototype.hasOwnProperty.call(byName, node.name)) byName[node.name] = node; }); return byName;
    };
    if (children && (this._routeChildren !== children || this._routeChildCount !== children.length)) { this._routeNodes = rebuild(); this._routeChildren = children; this._routeChildCount = children.length; }
    for (var i = 0; i < path.length; i++) {
      var name = plan.pointName(path[i].graphId, path[i].nodeId), node = children && this._routeNodes[name];
      if (children && (!node || node.name !== name || node.parent !== undefined && node.parent !== this.node || cc.isValid && !cc.isValid(node))) { this._routeNodes = rebuild(); node = this._routeNodes[name]; }
      if (!children) node = this.node.getChildByName(name);
      // Dropping a missing marker would silently bypass its required route.
      if (!node || node.name !== undefined && node.name !== name || node.parent !== undefined && node.parent !== this.node || cc.isValid && !cc.isValid(node)) return [];
      nodes.push(node);
    }
    if (path[0] && path[0].spread !== undefined) nodes.routeSpread = path[0].spread; return nodes;
  }
});
