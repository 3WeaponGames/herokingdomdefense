"use strict";

var radius = 11, spacing = 26, clearance = 4;
var badges = [
  { id: "poison", rim: "#84bf56", draw: skull },
  { id: "burn", rim: "#e68c45", draw: flame },
  { id: "bleed", rim: "#e76882", draw: drop },
  { id: "slow", rim: "#69b9ff", draw: slow }
];

function skull(g, x) {
  g.fillColor = cc.color("#a2ef65");
  g.moveTo(x - 4, -4);
  g.bezierCurveTo(x - 9, -2, x - 7, 7, x, 7);
  g.bezierCurveTo(x + 7, 7, x + 9, -2, x + 4, -4);
  g.lineTo(x + 3.5, -6.5);
  g.lineTo(x - 3.5, -6.5);
  g.close();
  g.fill();
  g.fillColor = cc.color("#253321");
  g.ellipse(x - 2.7, .3, 1.9, 1.6);
  g.ellipse(x + 2.7, .3, 1.9, 1.6);
  g.circle(x, -2.8, .9);
  g.fill();
}

function flame(g, x) {
  g.fillColor = cc.color("#ff8a41");
  g.moveTo(x + 1, 8);
  g.bezierCurveTo(x + 2, 4, x + 7, 2, x + 7, -1);
  g.bezierCurveTo(x + 7, -5, x + 4, -7.5, x, -7.5);
  g.bezierCurveTo(x - 7, -7.5, x - 9, -1, x - 4, 3);
  g.bezierCurveTo(x - 4, 0, x - 2, 1, x - 2, 3);
  g.bezierCurveTo(x - 2, 5, x + 1, 5.5, x + 1, 8);
  g.close();
  g.fill();
  g.fillColor = cc.color("#ffdc79");
  g.moveTo(x + 1, 2);
  g.bezierCurveTo(x + 1.5, -.5, x + 4, -1, x + 4, -3.5);
  g.bezierCurveTo(x + 4, -7, x - 4, -7, x - 4, -3.5);
  g.bezierCurveTo(x - 4, -1.5, x, -.5, x + 1, 2);
  g.close();
  g.fill();
}

function drop(g, x) {
  g.fillColor = cc.color("#f65372");
  g.moveTo(x, 8);
  g.bezierCurveTo(x + 2.5, 4, x + 6, .8, x + 6, -2.5);
  g.bezierCurveTo(x + 6, -9, x - 6, -9, x - 6, -2.5);
  g.bezierCurveTo(x - 6, .8, x - 2.5, 4, x, 8);
  g.close();
  g.fill();
  g.fillColor = cc.color("#ffc1ca");
  g.ellipse(x - 2.5, -1.7, 1.15, 2.25);
  g.fill();
}

function slow(g, x) {
  g.strokeColor = cc.color("#98ddff");
  g.lineWidth = 2.4;
  for (var y of [3.5, -2]) {
    g.moveTo(x - 5, y + 1.5);
    g.lineTo(x, y - 2);
    g.lineTo(x + 5, y + 1.5);
    g.stroke();
  }
}

function draw(graphics, signature, count) {
  graphics.clear();
  var x = (1 - count) * spacing / 2;
  for (var index = 0; index < badges.length; index++) {
    if (!(signature & 1 << index)) continue;
    var badge = badges[index];
    graphics.fillColor = cc.color("#1c2029");
    graphics.strokeColor = cc.color(badge.rim);
    graphics.lineWidth = 1.5;
    graphics.circle(x, 0, radius);
    graphics.fill();
    graphics.stroke();
    badge.draw(graphics, x);
    x += spacing;
  }
}

function point(node, overlay, x, y) {
  return overlay.convertToNodeSpaceAR(node.convertToWorldSpaceAR(cc.v2(x, y)));
}

function healthBarTop(actor, overlay) {
  var health = actor.hpctrl || actor.ctrHp, bar = health && health.node;
  if (cc.isValid(bar, true) && bar.parent) {
    return point(bar, overlay, (.5 - bar.anchorX) * bar.width, (1 - bar.anchorY) * bar.height);
  }
  var marker = actor.ndHp;
  if (cc.isValid(marker, true) && marker.parent) return point(marker, overlay, 0, 5);
  return point(actor.node, overlay, 0, 60);
}

function raiseAboveBoosts(actor, overlay, anchor, width) {
  if (!actor._enemyBuffIndicators) return;
  var spans = [];
  for (var effect of actor._enemyBuffIndicators.values()) {
    var icon = effect.node;
    if (!cc.isValid(icon, true) || !icon.activeInHierarchy) continue;
    var right = point(icon, overlay, (1 - icon.anchorX) * icon.width, (1 - icon.anchorY) * icon.height);
    var left = point(icon, overlay, -icon.anchorX * icon.width, -icon.anchorY * icon.height);
    if (Math.min(left.x, right.x) < anchor.x + width / 2 && Math.max(left.x, right.x) > anchor.x - width / 2) {
      spans.push({ bottom: Math.min(left.y, right.y), top: Math.max(left.y, right.y) });
    }
  }
  spans.sort(function (a, b) { return a.bottom - b.bottom; });
  for (var span of spans) {
    if (span.bottom < anchor.y + clearance + radius * 2 && span.top > anchor.y) anchor.y = span.top;
  }
}

function placeBadges(target, overlay, anchor, slowed) {
  var count = target.effects.size + (slowed ? 1 : 0);
  if (!count) {
    if (target.indicator) releaseNode(target.indicator.node);
    target.indicator = null;
    return;
  }
  var indicator = target.indicator;
  if (!indicator || !cc.isValid(indicator.node, true) || indicator.node.parent !== overlay) {
    if (indicator) releaseNode(indicator.node);
    var node = new cc.Node("On-hit effects");
    node.zIndex = 90;
    indicator = target.indicator = { node: node, graphics: node.addComponent(cc.Graphics), signature: 0 };
    node.setParent(overlay);
    if (target.indicator !== indicator || !cc.isValid(node, true) || node.parent !== overlay) return;
  }
  var signature = 0;
  for (var index = 0; index < badges.length; index++) {
    var id = badges[index].id;
    if (id === "slow" ? slowed : target.effects.has(id)) signature |= 1 << index;
  }
  if (indicator.signature !== signature) {
    draw(indicator.graphics, signature, count);
    indicator.signature = signature;
  }
  raiseAboveBoosts(target.entry.actor, overlay, anchor, (count - 1) * spacing + radius * 2);
  var y = anchor.y + radius + clearance;
  if (indicator.node.x !== anchor.x || indicator.node.y !== y) indicator.node.setPosition(anchor.x, y);
}

function placeHealing(target, overlay, anchor, remaining) {
  var node = target.healingIndicator;
  if (!(remaining > 0)) {
    releaseNode(node);
    target.healingIndicator = null;
    return;
  }
  if (!cc.isValid(node, true) || node.parent !== overlay) {
    releaseNode(node);
    node = target.healingIndicator = new cc.Node("Life steal healing");
    node.zIndex = 91;
    var graphics = node.addComponent(cc.Graphics);
    graphics.strokeColor = cc.color("#a4f786");
    graphics.lineWidth = 3;
    for (var cross of [[0, 0, 5], [12, 8, 3], [-6, 12, 2]]) {
      var x = cross[0], y = cross[1], size = cross[2];
      graphics.moveTo(x - size, y);
      graphics.lineTo(x + size, y);
      graphics.moveTo(x, y - size);
      graphics.lineTo(x, y + size);
    }
    graphics.stroke();
    node.setParent(overlay);
    if (target.healingIndicator !== node || !cc.isValid(node, true) || node.parent !== overlay) return;
  }
  node.setPosition(anchor.x + 37, anchor.y - 14 + 18 * (1 - remaining));
  node.opacity = Math.round(255 * Math.min(1, remaining * 2));
}

function place(target, overlay, slowed, healing) {
  if (!cc.Graphics || !cc.isValid(overlay, true)) return;
  var anchor = healthBarTop(target.entry.actor, overlay);
  placeHealing(target, overlay, anchor, healing);
  placeBadges(target, overlay, anchor, slowed);
}

function releaseNode(node) {
  if (!node || !cc.isValid(node, true)) return;
  node.active = false;
  node.destroy();
}
function remove(target) {
  var badges = target.indicator, healing = target.healingIndicator;
  target.indicator = target.healingIndicator = null;
  if (badges) releaseNode(badges.node);
  releaseNode(healing);
}

exports.place = place;
exports.remove = remove;
