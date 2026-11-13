"use strict";

// Pure pose geometry shared by the game and the read-only building preview.
function finite(value, fallback) { return typeof value === "number" && isFinite(value) ? value : fallback; }
function positive(value, fallback) { return Math.max(1, finite(value, fallback)); }
function normalize(angle) { return ((angle + 180) % 360 + 360) % 360 - 180; }
function views(weapon) {
  var result = { side: weapon };
  ["north", "northeast", "southeast", "south"].forEach(function (name) {
    var view = weapon && weapon.views && weapon.views[name];
    if (view && typeof view.sprite === "string" && view.sprite) result[name] = view;
  });
  return result;
}
function pose(weapon, targetAngle, size) {
  size = typeof size === "number" && isFinite(size) && size >= .05 && size <= 10 ? size : 1;
  var available = views(weapon), name = "side", flip = 1, targeted = typeof targetAngle === "number" && isFinite(targetAngle);
  var radians = targeted ? targetAngle * Math.PI / 180 : 0;
  var eight = available.north && available.northeast && available.southeast && available.south;
  if (eight) {
    // Five authored views mirror into eight fixed headings. Keep the authored
    // perspective intact; these weapons never rotate between sprite changes.
    var sector = targeted ? (Math.round(normalize(targetAngle) / 45) + 8) % 8 : 1;
    name = ["side", "northeast", "north", "northeast", "side", "southeast", "south", "southeast"][sector];
    flip = sector >= 3 && sector <= 5 ? -1 : 1;
  } else if (targeted && available.southeast) {
    // The base image is northeast. North/south each own a 45-degree sector;
    // the two diagonal perspectives share the remaining upper/lower halves.
    var angle = normalize(targetAngle);
    if (angle >= 67.5 && angle <= 112.5 && available.north) name = "north";
    else if (angle >= -112.5 && angle <= -67.5 && available.south) name = "south";
    else if (angle < 0 && angle > -180) name = "southeast";
  } else if (targeted && Math.abs(Math.sin(radians)) > Math.abs(Math.cos(radians)) + .000001) {
    var facing = Math.sin(radians) > 0 ? "north" : "south";
    if (available[facing]) name = facing;
  }
  if (!eight && (name === "side" || name === "southeast") && targeted && Math.cos(radians) < 0) flip = -1;
  var view = available[name];
  function value(key, fallback) { return finite(view[key], finite(weapon[key], fallback)); }
  var mx = value("muzzleX", 90), my = value("muzzleY", 0);
  var authored = typeof view.referenceAngle === "number" && isFinite(view.referenceAngle);
  if (!authored && mx * mx + my * my < .000001) { mx = 1; my = 0; }
  var sourceAngle = authored ? view.referenceAngle : Math.atan2(my, mx) * 180 / Math.PI;
  var aimX = Math.cos(sourceAngle * Math.PI / 180), aimY = Math.sin(sourceAngle * Math.PI / 180);
  if (Math.abs(aimX) < 1e-10) aimX = 0;
  if (Math.abs(aimY) < 1e-10) aimY = 0;
  var reference = authored ? normalize(flip < 0 ? 180 - sourceAngle : sourceAngle) : Math.atan2(my, flip * mx) * 180 / Math.PI;
  var facing = name === "side" ? flip < 0 ? "west" : "east" : name;
  if (available.southeast) facing = targeted ? ["east", "northeast", "north", "northwest", "west", "southwest", "south", "southeast"][(Math.round(normalize(targetAngle) / 45) + 8) % 8] : "northeast";
  return { view: name, facing: facing,
    sprite: view.sprite, width: positive(value("width", 120), 120)*size, height: positive(value("height", 80), 80)*size,
    pivotX: value("pivotX", .5), pivotY: value("pivotY", .5), x: finite(weapon.offsetX, 0), y: finite(weapon.offsetY, 150),
    muzzleX: mx*size, muzzleY: my*size, flipX: flip, angle: targeted && !eight ? normalize(targetAngle - reference) : 0, reference: reference,
    aimX: aimX, aimY: aimY,
    emptySprite: typeof view.emptySprite === "string" && view.emptySprite ? view.emptySprite : null };
}
exports.views = views;
exports.pose = pose;
