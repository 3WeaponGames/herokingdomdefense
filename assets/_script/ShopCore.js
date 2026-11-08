"use strict";

// Shop stock is independent of the legacy relic draw/pity record. These helpers
// only return drafts; the runtime commits them with the existing reward journal.
var MAX_INTEGER = 9007199254740991;
var TIERS = [
  { name: "legendary", quality: 1, count: 2 },
  { name: "rare", quality: 3, count: 4 },
  { name: "common", quality: 4, count: 6 }
];
var REFRESH_COSTS = [0, 10, 20, 30, 40, 50, 75, 100, 125, 150];

function fail(message) { throw new Error("Invalid shop: " + message); }
function integer(value, minimum) {
  return typeof value === "number" && isFinite(value) && Math.floor(value) === value && value >= minimum && value <= MAX_INTEGER;
}
function object(value) { return !!value && typeof value === "object" && !Array.isArray(value); }
function clone(value) { return JSON.parse(JSON.stringify(value)); }
function date(now) {
  var value = now instanceof Date ? now.getTime() : now;
  if (typeof value !== "number" || !isFinite(value)) fail("invalid clock");
  var result = new Date(value), year = result.getFullYear();
  if (!isFinite(result.getTime()) || year < 1970 || year > 9999) fail("invalid clock");
  return result;
}
function pad(value) { return value < 10 ? "0" + value : String(value); }
function localDay(now) {
  var value = date(now);
  return value.getFullYear() + "-" + pad(value.getMonth() + 1) + "-" + pad(value.getDate());
}
function nextMidnight(now) {
  var value = date(now);
  // Construct the next local calendar day: adding 24h is wrong at DST changes.
  return new Date(value.getFullYear(), value.getMonth(), value.getDate() + 1).getTime();
}
function validDay(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  var parts = value.split("-").map(Number), result = new Date(parts[0], parts[1] - 1, parts[2]);
  return parts[0] >= 1970 && parts[0] <= 9999 && result.getFullYear() === parts[0] && result.getMonth() === parts[1] - 1 && result.getDate() === parts[2];
}
function schema() {
  var rows = [];
  TIERS.forEach(function (tier) {
    for (var index = 0; index < tier.count; index++) rows.push({ slotId: tier.name + ":" + index, quality: tier.quality });
  });
  return rows;
}
function relics(catalog) {
  if (!object(catalog) || !Array.isArray(catalog.relics)) fail("missing relic catalog");
  var lookup = Object.create(null);
  catalog.relics.forEach(function (entry) {
    if (!object(entry) || !integer(entry.relicId, 1) || !integer(entry.goodId, 1) || !integer(entry.quality, 1) || entry.quality > 4 || lookup[entry.relicId]) fail("invalid relic catalog");
    lookup[entry.relicId] = entry;
  });
  TIERS.forEach(function (tier) {
    if (catalog.relics.filter(function (entry) { return entry.quality === tier.quality; }).length < tier.count) fail("not enough " + tier.name + " relics");
  });
  return lookup;
}
function validate(state, catalog) {
  if (!object(state) || state.version !== 1 || !validDay(state.day) || !integer(state.revision, 1) || !integer(state.generation, 1) ||
      !integer(state.refreshCount, 0) || state.refreshCount > REFRESH_COSTS.length || typeof state.dailyClaimed !== "boolean" || !Array.isArray(state.slots) || state.slots.length !== 12) fail("malformed saved state");
  var lookup = catalog ? relics(catalog) : null, expected = schema(), seen = Object.create(null);
  state.slots.forEach(function (slot, index) {
    var shape = expected[index];
    if (!object(slot) || slot.slotId !== shape.slotId || slot.quality !== shape.quality || !integer(slot.relicId, 1) || typeof slot.bought !== "boolean" || seen[slot.relicId]) fail("malformed relic slot");
    if (lookup && (!lookup[slot.relicId] || lookup[slot.relicId].quality !== slot.quality)) fail("saved relic is no longer in its authored tier");
    seen[slot.relicId] = true;
  });
  return state;
}
function increment(value) { if (!integer(value, 1) || value >= MAX_INTEGER) fail("revision exhausted"); return value + 1; }
function random(rng) {
  var value = rng();
  if (typeof value !== "number" || !isFinite(value) || value < 0 || value >= 1) fail("random source must return a number in [0, 1)");
  return value;
}
function shuffle(values, rng) {
  var result = values.slice();
  for (var index = result.length - 1; index > 0; index--) {
    var swap = Math.floor(random(rng) * (index + 1)), value = result[index]; result[index] = result[swap]; result[swap] = value;
  }
  return result;
}
function stock(catalog, rng, previous) {
  relics(catalog);
  rng = rng || Math.random;
  if (typeof rng !== "function") fail("missing random source");
  var rows = [], previousSlots = previous ? previous.slots : [];
  TIERS.forEach(function (tier) {
    var pool = catalog.relics.filter(function (entry) { return entry.quality === tier.quality; }), offset = rows.length;
    var candidates = [], assigned = [], matched = Object.create(null);
    for (var index = 0; index < tier.count; index++) {
      var old = previousSlots[offset + index];
      candidates.push(shuffle(pool, rng).filter(function (entry) { return !old || pool.length === 1 || entry.relicId !== old.relicId; }));
    }
    // A greedy draw can strand the last slot with its old relic. A small
    // matching pass guarantees distinct stock and a different relic per slot.
    function assign(index, visited) {
      for (var at = 0; at < candidates[index].length; at++) {
        var entry = candidates[index][at], id = entry.relicId;
        if (visited[id]) continue;
        visited[id] = true;
        if (matched[id] === undefined || assign(matched[id], visited)) {
          matched[id] = index; assigned[index] = entry; return true;
        }
      }
      return false;
    }
    for (var slot = 0; slot < tier.count; slot++) if (!assign(slot, Object.create(null))) fail("cannot rotate " + tier.name + " stock");
    assigned.forEach(function (entry, index) {
      var row = previousSlots[offset + index] ? clone(previousSlots[offset + index]) : {};
      row.slotId = tier.name + ":" + index; row.relicId = entry.relicId; row.quality = tier.quality; row.bought = false;
      rows.push(row);
    });
  });
  return rows;
}
function createState(catalog, now, rng, previous) {
  var day = localDay(now);
  if (previous !== undefined && previous !== null) {
    validate(previous, catalog);
    if (day <= previous.day) return previous;
  }
  var result = previous ? clone(previous) : {};
  result.version = 1; result.day = day;
  result.revision = previous ? increment(previous.revision) : 1;
  result.generation = previous ? increment(previous.generation) : 1;
  result.refreshCount = 0; result.dailyClaimed = false;
  result.slots = stock(catalog, rng, previous);
  return validate(result, catalog);
}
function refreshCost(state) { validate(state); return state.refreshCount < REFRESH_COSTS.length ? REFRESH_COSTS[state.refreshCount] : null; }
function roll(state, catalog, now, rng, manual) {
  validate(state, catalog);
  var day = localDay(now);
  if (day < state.day) return state;
  if (!manual) return day > state.day ? createState(catalog, now, rng, state) : state;
  if (day !== state.day) fail("refresh requires current daily stock");
  if (refreshCost(state) === null) fail("daily refresh limit reached");
  var result = clone(state);
  result.revision = increment(state.revision); result.generation = increment(state.generation); result.refreshCount++;
  result.slots = stock(catalog, rng, state);
  return validate(result, catalog);
}
function claim(state) {
  validate(state);
  if (state.dailyClaimed) fail("daily deal already claimed");
  var result = clone(state); result.dailyClaimed = true; result.revision = increment(state.revision); return result;
}
function buyRelic(state, slotId) {
  validate(state);
  var index = state.slots.map(function (slot) { return slot.slotId; }).indexOf(slotId);
  if (index < 0) fail("unknown relic slot");
  if (state.slots[index].bought) fail("relic slot already bought");
  var result = clone(state); result.slots[index].bought = true; result.revision = increment(state.revision); return result;
}

exports.localDay = localDay;
exports.nextMidnight = nextMidnight;
exports.validate = validate;
exports.createState = createState;
exports.roll = roll;
exports.claim = claim;
exports.buyRelic = buyRelic;
exports.refreshCost = refreshCost;
exports.clone = clone;
exports.refreshCosts = REFRESH_COSTS.slice();
