"use strict";

// The existing gate opens toward SW. Horizontal mirroring supplies SE; the
// opposite two faces reflect only its animated ground motion, keeping every
// closed plank, upright post, texture, bone and construction animation intact.
var SLOPE = Math.tan(Math.PI / 6);
function valid(value) { return value === "NE" || value === "NW" || value === "SE" || value === "SW"; }
function mirrorX(value) { return value === "NW" || value === "SE"; }
function reverse(value) { return value === "NE" || value === "NW"; }
function validOpening(value) { return value === "outward" || value === "inward"; }
// Legacy skeletons have only the original open/shut tracks. Select a directional
// track only when it actually exists, so old scripted calls keep their behavior.
function animation(json, name, opening, isOpen) {
  var direction=opening==="inward"?"inward":"outward",selected;
  if(name==="Fade_in"&&isOpen)selected="Fade_in_open_"+direction;
  else if(/^(open|shut)(?:_night)?$/.test(name)){var night=/_night$/.test(name),base=name.replace(/_night$/,"");selected=base+"_"+direction+(night?"_night":"");}
  else return name;
  return json&&json.animations&&json.animations[selected]?selected:name;
}
function normal(value) {
  if (!valid(value)) return null;
  return { x: value === "NW" || value === "SW" ? -1 : 1, y: value === "NE" || value === "NW" ? SLOPE : -SLOPE };
}
function reflected(x, y, slope) { slope=slope||SLOPE;return { x: -y / slope, y: -x * slope }; }
function leaf(name) { return /^(men1_[23]|men3_[23]|men2_mu_[12])$/.test(name); }
function mesh(value, label) {
  if (!value || value.type !== "mesh" || !Array.isArray(value.uvs) || !Array.isArray(value.vertices) ||
      value.vertices.length !== value.uvs.length || value.vertices.length % 2 || !Array.isArray(value.triangles) ||
      value.vertices.some(function (n) { return typeof n !== "number" || !isFinite(n); })) {
    throw new Error("Gate facing needs an unweighted leaf mesh: " + label);
  }
  return value;
}
// Alternate open attachments use a different triangulation and vertex count.
// Locate the same material point in the closed mesh's texture coordinates.
// Tiny authoring differences at the UV boundary use the nearest triangle's
// affine continuation instead of clamping and shortening the gate leaf.
function closedPoint(value, u, v) {
  var best = null, penalty = Infinity;
  for (var i = 0; i < value.triangles.length; i += 3) {
    var a = value.triangles[i] * 2, b = value.triangles[i + 1] * 2, c = value.triangles[i + 2] * 2;
    var ax = value.uvs[a], ay = value.uvs[a + 1], bx = value.uvs[b], by = value.uvs[b + 1], cx = value.uvs[c], cy = value.uvs[c + 1];
    var determinant = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
    if (Math.abs(determinant) < .000000000001) continue;
    var wa = ((by - cy) * (u - cx) + (cx - bx) * (v - cy)) / determinant;
    var wb = ((cy - ay) * (u - cx) + (ax - cx) * (v - cy)) / determinant, wc = 1 - wa - wb;
    var score = Math.max(0, -wa) + Math.max(0, -wb) + Math.max(0, -wc);
    if (score < penalty) {
      penalty = score;
      best = { x: wa * value.vertices[a] + wb * value.vertices[b] + wc * value.vertices[c],
        y: wa * value.vertices[a + 1] + wb * value.vertices[b + 1] + wc * value.vertices[c + 1] };
      if (score < .000000001) break;
    }
  }
  if (!best) throw new Error("Gate leaf has no usable texture triangles.");
  return best;
}
function mirrorJson(json) {
  if (!json || !Array.isArray(json.skins)) return json;
  if(json.wallGate&&json.wallGate.style==="matched")return json;
  if(json.wallKit&&json.wallKit.gateStyle==="matched"){
    var matched=require("./WallDoor").reverse(json);require("./WallKit").updateBounds(matched);return matched;
  }
  var targets = {}, found = false;
  json.skins.forEach(function (skin) {
    Object.keys(skin.attachments || {}).forEach(function (slot) {
      Object.keys(skin.attachments[slot]).forEach(function (name) {
        if (!leaf(name)) return;
        found = true;
        var original = mesh(skin.attachments[slot][name], skin.name + "/" + slot), alternate = /^(men1_[23]|men3_[23])_2$/.test(slot);
        var primarySlot = alternate ? slot.slice(0, -1) + "1" : slot;
        var primary = mesh(skin.attachments[primarySlot] && skin.attachments[primarySlot][name], skin.name + "/" + primarySlot);
        var nativeGate=/^cq-rts-/.test(skin.name)&&(json.wallGate||json.wallKit&&json.wallKit.gateStyle==="original");
        targets[skin.name + "/" + slot + "/" + name] = { original: original, primary: primary, alternate: alternate,slope:nativeGate?require("./WallAssembly").axis.slope:SLOPE };
      });
    });
  });
  if (!found) return json; // Fixed wings and unrelated skeletons are untouched.
  var result = JSON.parse(JSON.stringify(json));
  result.skins.forEach(function (skin) {
    Object.keys(skin.attachments || {}).forEach(function (slot) {
      Object.keys(skin.attachments[slot]).forEach(function (name) {
        var target = targets[skin.name + "/" + slot + "/" + name];
        if (!target) return;
        var value = skin.attachments[slot][name];
        // The modular kit supplies both gate surfaces. Keep its PNG walls and
        // posts intact while selecting the matching opposite moving surface.
        if (typeof value.path === "string") value.path = value.path.replace(/^rts_gate_(sw|nw)_/, function (_, face) { return "rts_gate_" + (face === "sw" ? "nw" : "sw") + "_"; });
        if (!target.alternate) return;
        for (var i = 0; i < value.vertices.length; i += 2) {
          var rest = closedPoint(target.primary, value.uvs[i], value.uvs[i + 1]);
          var move = reflected(target.original.vertices[i] - rest.x, target.original.vertices[i + 1] - rest.y,target.slope);
          value.vertices[i] = rest.x + move.x; value.vertices[i + 1] = rest.y + move.y;
        }
      });
    });
  });
  Object.keys(result.animations || {}).forEach(function (animation) {
    var deform = result.animations[animation].deform || {};
    Object.keys(deform).forEach(function (skin) {
      Object.keys(deform[skin]).forEach(function (slot) {
        Object.keys(deform[skin][slot]).forEach(function (name) {
          var target = targets[skin + "/" + slot + "/" + name];
          if (!target) return;
          deform[skin][slot][name].forEach(function (frame) {
            if (!frame.vertices) return;
            var length = target.original.vertices.length, offset = frame.offset || 0, deltas = Array(length).fill(0);
            if (!Number.isInteger(offset) || offset < 0 || offset + frame.vertices.length > length) throw new Error("Invalid gate leaf deformation range.");
            frame.vertices.forEach(function (n, i) { if (typeof n !== "number" || !isFinite(n)) throw new Error("Gate leaf deformation needs finite coordinates."); deltas[offset + i] = n; });
            for (var i = 0; i < length; i += 2) { var move = reflected(deltas[i], deltas[i + 1],target.slope); deltas[i] = move.x; deltas[i + 1] = move.y; }
            frame.vertices = deltas; delete frame.offset;
          });
        });
      });
    });
  });
  if(result.wallGate||result.wallKit&&result.wallKit.gateStyle==="original")require("./WallKit").updateBounds(result);
  return result;
}
exports.valid = valid;
exports.mirrorX = mirrorX;
exports.reverse = reverse;
exports.validOpening = validOpening;
exports.animation = animation;
exports.normal = normal;
exports.mirrorJson = mirrorJson;
