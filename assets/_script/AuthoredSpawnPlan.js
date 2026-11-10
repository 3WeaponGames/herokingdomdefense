"use strict";
// Optional authored schedules and DAG routes. Legacy queues use their original code.
function Timeline(entries) {
  this.elapsed = 0;
  this.entries = (entries || []).map(function (entry, index) {
    if (!entry || !Number.isSafeInteger(entry.count) || entry.count < 0 || typeof entry.startSeconds !== 'number' || !isFinite(entry.startSeconds) || entry.startSeconds < 0 || typeof entry.intervalSeconds !== 'number' || !isFinite(entry.intervalSeconds) || entry.intervalSeconds < 0 || entry.count > 1 && entry.intervalSeconds === 0 || entry.count > 0 && !isFinite(entry.startSeconds + (entry.count - 1) * entry.intervalSeconds)) throw Error('Invalid authored spawn timing or count.');
    return { spawnId: entry.spawnId, unitId: entry.unitId, count: entry.count, next: entry.startSeconds, interval: entry.intervalSeconds, routeGraphId: entry.routeGraphId || null, order: index };
  });
  this._due = this.entries.filter(function (entry) { return entry.count > 0; }).sort(timelineOrder);
}
function timelineOrder(a, b) { return a.next - b.next || a.order - b.order; }
function insertDue(heap, entry) {
  var index = heap.length; heap.push(entry);
  while (index) { var parent = (index - 1) >> 1; if (timelineOrder(heap[parent], entry) <= 0) break; heap[index] = heap[parent]; index = parent; } heap[index] = entry;
}
function removeDue(heap) {
  var first = heap[0], last = heap.pop(); if (!heap.length) return first;
  var index = 0; while (index * 2 + 1 < heap.length) { var child = index * 2 + 1; if (child + 1 < heap.length && timelineOrder(heap[child + 1], heap[child]) < 0) child++; if (timelineOrder(last, heap[child]) <= 0) break; heap[index] = heap[child]; index = child; } heap[index] = last; return first;
}
Timeline.prototype.pending = function () { return this._due.length > 0; };
Timeline.prototype.queue = function () {
  var result = {};
  this.entries.filter(function (entry) { return entry.count > 0; }).slice().sort(function (a, b) { return a.next - b.next; }).forEach(function (entry) { (result[entry.spawnId] || (result[entry.spawnId] = [])).push({ id: entry.unitId, num: entry.count }); });
  return result;
};
Timeline.prototype.advance = function (dt, emit) {
  if (typeof dt !== 'number' || !(dt >= 0) || !isFinite(dt)) return;
  this.elapsed += dt;
  // Keep chronological order across groups, with stable input-order ties. Bound
  // extreme catch-up work; overdue enemies remain queued for subsequent frames.
  for (var emitted = 0; emitted < 256 && this._due.length && this._due[0].next <= this.elapsed + 1e-8; emitted++) {
    var entry = removeDue(this._due);
    // Consume/requeue before emitting: synchronous deaths see the full backlog.
    entry.count--; entry.next += entry.interval;
    if (entry.count > 0) insertDue(this._due, entry);
    emit(entry.unitId, entry.spawnId, entry.routeGraphId);
  }
};
function allowed(conditions, built) { return conditions === undefined || conditions === null || Array.isArray(conditions) && (!conditions.length || conditions.some(function (id) { return built.indexOf(id) >= 0; })); }
function positive(item) { return item.weight === undefined || typeof item.weight === 'number' && isFinite(item.weight) && item.weight > 0; }
function choose(items, random) {
  var total = items.reduce(function (sum, item) { return sum + (item.weight === undefined ? 1 : item.weight); }, 0), scale = 1;
  if (!isFinite(total)) { scale = items.reduce(function (max, item) { return Math.max(max, item.weight === undefined ? 1 : item.weight); }, 0); total = items.reduce(function (sum, item) { return sum + (item.weight === undefined ? 1 : item.weight) / scale; }, 0); }
  var value = random() * total; for (var i = 0; i < items.length; i++) { value -= (items[i].weight === undefined ? 1 : items[i].weight) / scale; if (value < 0) return items[i]; } return items[items.length - 1];
}
function route(graphs, spawnId, built, override, random) {
  random = random || Math.random;
  graphs = Array.isArray(graphs) ? graphs : []; built = Array.isArray(built) ? built : [];
  var candidates = graphs.filter(function (g) { return g && typeof g.id === 'string' && g.id.trim() && typeof g.entry === 'string' && Array.isArray(g.spawnIds) && Array.isArray(g.nodes) && Array.isArray(g.edges) && positive(g) && g.spawnIds.indexOf(spawnId) >= 0 && allowed(g.requiresAnyBuilding, built); });
  var eligible = candidates.filter(function (g) { return !override || g.id === override; });
  if (!eligible.length && override) eligible = candidates;
  if (!eligible.length) return [];
  var graph = choose(eligible, random), nodes = Object.create(null), outgoingByNode = Object.create(null), path = [], current = graph.entry, seen = Object.create(null);
  for (var i = 0; i < graph.nodes.length; i++) { var node = graph.nodes[i]; if (!node || typeof node.id !== 'string' || !node.id.trim() || nodes[node.id] || typeof node.x !== 'number' || !isFinite(node.x) || typeof node.y !== 'number' || !isFinite(node.y)) return []; nodes[node.id] = node; }
  for (var j = 0; j < graph.edges.length; j++) { var edge = graph.edges[j]; if (!edge || typeof edge.from !== 'string' || typeof edge.to !== 'string' || !nodes[edge.from] || !nodes[edge.to]) return []; if (typeof edge.weight === 'number' && isFinite(edge.weight) && edge.weight > 0 && allowed(edge.requiresAnyBuilding, built)) (outgoingByNode[edge.from] || (outgoingByNode[edge.from] = [])).push(edge); }
  while (nodes[current] && !seen[current]) {
    seen[current] = true; var point={ graphId: graph.id, nodeId: current, x: nodes[current].x, y: nodes[current].y };if(graph.spread!==undefined)point.spread=graph.spread;path.push(point);
    if (nodes[current].goal) break;
    var outgoing = outgoingByNode[current] || [];
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
