"use strict";

// Optional global defense for a fighting type. Missing settings retain the
// original damage; reading a setting never seeds or repairs authored data.
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
exports.valid = valid;
exports.multiplier = multiplier;
