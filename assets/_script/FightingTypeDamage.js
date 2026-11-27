"use strict";

// Hero damage taken settings and shared fighting-type counter rules.
function valid(value) {
  return !!value && typeof value === "object" && !Array.isArray(value) &&
    (value.mode === "more" || value.mode === "less") &&
    typeof value.percent === "number" && isFinite(value.percent) &&
    value.percent >= (value.mode === "more" ? 0 : 100);
}
function multiplier(value) {
  if (!valid(value)) return 1;
  // More is an added percentage; Less is a percentage divisor. These are
  // intentionally distinct: More 400 = 5x, Less 400 = 1/4x.
  return value.mode === "less" ? 100 / value.percent : 1 + value.percent / 100;
}
function counterType(types, role) {
  var type = types && Object.prototype.hasOwnProperty.call(types, role) && types[role];
  var target = type && type.counterType;
  return typeof target === "string" && Object.prototype.hasOwnProperty.call(types, target) ? target : undefined;
}
exports.valid = valid;
exports.multiplier = multiplier;
exports.counterType = counterType;
