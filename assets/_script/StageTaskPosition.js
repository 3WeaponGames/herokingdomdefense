"use strict";

function offset(value, distance, extent) {
  if (!Number.isFinite(extent)) return value + distance;
  var limit = Math.max(0, extent / 2 - 64);
  var next = value + distance <= limit ? value + distance : value - distance;
  return Math.max(-limit, Math.min(limit, next));
}

function valid(position) {
  return !!position && !Array.isArray(position) && Number.isFinite(position.x) && Number.isFinite(position.y);
}

function resolve(position, hero, size) {
  if (valid(position)) return position;
  hero = valid(hero) ? hero : { x: 0, y: 0 };
  return { x: offset(hero.x, 144, size && size.width), y: offset(hero.y, 44, size && size.height) };
}

exports.marker = "ndTasksPosition";
exports.valid = valid;
exports.resolve = resolve;
