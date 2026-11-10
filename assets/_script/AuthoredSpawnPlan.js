"use strict";
// Optional authored schedules and DAG routes. Legacy queues use their original code.
function Timeline(entries) {
  this.elapsed = 0;
  this.entries = (entries || []).map(function (entry) { return { spawnId: entry.spawnId, unitId: entry.unitId, count: entry.count, next: entry.startSeconds, interval: entry.intervalSeconds, routeGraphId: entry.routeGraphId || null }; });
}
Timeline.prototype.pending = function () { return this.entries.some(function (entry) { return entry.count > 0; }); };
Timeline.prototype.queue = function () {
  var result = {};
  this.entries.filter(function (entry) { return entry.count > 0; }).slice().sort(function (a, b) { return a.next - b.next; }).forEach(function (entry) { (result[entry.spawnId] || (result[entry.spawnId] = [])).push({ id: entry.unitId, num: entry.count }); });
  return result;
};
Timeline.prototype.advance = function (dt, emit) {
  if (!(dt >= 0) || !isFinite(dt)) return;
  this.elapsed += dt;
  for (var i = 0; i < this.entries.length; i++) {
    var entry = this.entries[i];
    while (entry.count > 0 && entry.next <= this.elapsed + 1e-8) {
      // Consume before emitting: synchronous deaths cannot complete a pending wave.
      entry.count--; entry.next += entry.interval;
      emit(entry.unitId, entry.spawnId, entry.routeGraphId);
    }
  }
};
function allowed(conditions, built) { return !conditions || !conditions.length || conditions.some(function (id) { return built.indexOf(id) >= 0; }); }
function choose(items, random) { var total = items.reduce(function (sum, item) { return sum + (item.weight === undefined ? 1 : item.weight); }, 0), value = random() * total; for (var i = 0; i < items.length; i++) { value -= items[i].weight === undefined ? 1 : items[i].weight; if (value < 0) return items[i]; } return items[items.length - 1]; }
function route(graphs, spawnId, built, override, random) {
  random = random || Math.random;
  var eligible = graphs.filter(function (g) { return g.spawnIds.indexOf(spawnId) >= 0 && (!override || g.id === override) && allowed(g.requiresAnyBuilding, built); });
  if (!eligible.length && override) eligible = graphs.filter(function (g) { return g.spawnIds.indexOf(spawnId) >= 0 && allowed(g.requiresAnyBuilding, built); });
  if (!eligible.length) return [];
  var graph = choose(eligible, random), nodes = Object.create(null), path = [], current = graph.entry, seen = Object.create(null);
  graph.nodes.forEach(function (n) { nodes[n.id] = n; });
  while (nodes[current] && !seen[current]) {
    seen[current] = true; path.push({ graphId: graph.id, nodeId: current, x: nodes[current].x, y: nodes[current].y });
    if (nodes[current].goal) break;
    var outgoing = graph.edges.filter(function (edge) { return edge.from === current && edge.weight > 0 && allowed(edge.requiresAnyBuilding, built); });
    if (!outgoing.length) return [];
    current = choose(outgoing, random).to;
  }
  return path.length && nodes[current] && nodes[current].goal ? path : [];
}
function offers(existing, added) {
  if (!existing) return added;
  var list = existing._offers ? existing._offers.concat([added]) : [existing, added], proxy = { _offers: list, node: {}, init: function (level) { list.forEach(function (offer) { offer.init(level); }); }, getInClick: function (pos, dt) { return list.some(function (offer) { return offer.node.active && offer.getInClick(pos, dt); }); } };
  Object.defineProperty(proxy.node, 'active', { get: function () { return list.some(function (offer) { return offer.node.active; }); }, set: function (value) { list.forEach(function (offer) { offer.node.active = value; }); } });
  return proxy;
}
function pointName(graphId, nodeId) { var graph = encodeURIComponent(graphId); return 'point-' + graph.length + '-' + graph + '-' + encodeURIComponent(nodeId); }
exports.Timeline = Timeline; exports.route = route; exports.offers = offers; exports.pointName = pointName;
