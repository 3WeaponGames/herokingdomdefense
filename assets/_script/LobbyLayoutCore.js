"use strict";
function measure(bounds, points) {
  var width = bounds.right - bounds.left, center = (bounds.left + bounds.right) / 2;
  var barWidth = Math.min(850, width - 40), count = points < 360 ? 3 : 4;
  var arrows = count < 5 ? 38 : 0, viewport = barWidth - arrows * 2 - 12;
  var buttonWidth = Math.min(341, (barWidth - 22) / 2), buttonScale = buttonWidth / 341;
  var buttonY = bounds.footer + 40 + 73 * buttonScale;
  var stageTop = bounds.top - 330, stageBottom = buttonY + 73 * buttonScale + 66;
  var stageScale = Math.min(1.13, Math.max(.1, (stageTop - stageBottom) / 720));
  var large = Math.max(0, Math.min(1, (points - 600) / 250));
  var titleScale = Math.max(1, Math.min(1 + .4 * large, (width - 36 * width / points) / (620 * stageScale)));
  var previewScale = Math.max(1, Math.min(1 + .65 * large, width * .64 / (394 * stageScale)));
  return { center: center, barWidth: barWidth, barY: bounds.top - 196, barHeight: 184, count: count,
    viewport: viewport, cell: viewport / count, arrows: arrows, buttonWidth: buttonWidth,
    buttonScale: buttonScale, buttonY: buttonY, buttonLeft: center - (buttonWidth + 22) / 2,
    buttonRight: center + (buttonWidth + 22) / 2, stageScale: stageScale,
    titleScale: titleScale, previewScale: previewScale, stageArrowPadding: 16 * width / points,
    stageY: (stageTop + stageBottom) / 2 - 90 * stageScale };
}
function hiddenRewards(items, offset, width, cell) {
  var left = false, right = false;
  items.forEach(function (ready, index) { if (ready) { if (index * cell < offset - .5) left = true; if ((index + 1) * cell > offset + width + .5) right = true; } });
  return { left: left, right: right };
}
exports.measure = measure;
exports.hiddenRewards = hiddenRewards;
