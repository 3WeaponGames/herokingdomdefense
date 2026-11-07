"use strict";

// Small vector icons and stat-row surfaces stay crisp in Browser and Simulator.
// All values and localized captions are separate authored child labels.
cc.Class({
  extends: cc.Component,
  properties: { statType: 1 },
  onLoad: function () {
    var g = this.getComponent(cc.Graphics) || this.addComponent(cc.Graphics);
    var dark = cc.color("#142654");
    g.clear();
    g.fillColor = cc.color("#4775D7");
    g.strokeColor = cc.color("#749BFA");
    g.lineWidth = 2;
    g.roundRect(-this.node.width / 2, -this.node.height / 2, this.node.width, this.node.height, 14);
    g.fill(); g.stroke();
    var x = -this.node.width / 2 + 28;
    function polygon(points, color) {
      g.fillColor = cc.color(color); g.strokeColor = dark; g.lineWidth = 2.5;
      g.moveTo(x + points[0][0], points[0][1]);
      for (var i = 1; i < points.length; i++) g.lineTo(x + points[i][0], points[i][1]);
      g.close(); g.fill(); g.stroke();
    }
    function box(left, bottom, width, height, radius, color) {
      g.fillColor = cc.color(color); g.strokeColor = dark; g.lineWidth = 2;
      g.roundRect(x + left, bottom, width, height, radius); g.fill(); g.stroke();
    }
    switch (this.statType) {
      case 1:
        g.fillColor = cc.color("#FF4664"); g.strokeColor = dark; g.lineWidth = 2.5;
        g.moveTo(x, -15);
        g.bezierCurveTo(x - 28, 1, x - 14, 27, x, 12);
        g.bezierCurveTo(x + 14, 27, x + 28, 1, x, -15);
        g.close(); g.fill(); g.stroke();
        break;
      case 2:
        polygon([[-6,17],[6,17],[6,6],[17,6],[17,-6],[6,-6],[6,-17],[-6,-17],[-6,-6],[-17,-6],[-17,6],[-6,6]], "#71EC37");
        break;
      case 3:
        polygon([[-10,-5],[8,17],[17,19],[16,9],[-3,-12]], "#D5EFFF");
        polygon([[-15,-3],[-10,1],[2,-11],[-2,-16]], "#FFD34D");
        polygon([[-11,-9],[-7,-13],[-13,-20],[-18,-16]], "#B77936");
        break;
      case 4:
        g.strokeColor = dark; g.fillColor = cc.color("#FF5362"); g.lineWidth = 2.5;
        g.circle(x, 0, 15); g.fill(); g.stroke();
        g.fillColor = cc.color("#4775D7"); g.circle(x, 0, 8); g.fill(); g.stroke();
        g.strokeColor = cc.color("#FF8991"); g.lineWidth = 4;
        g.moveTo(x - 20, 0); g.lineTo(x - 10, 0); g.moveTo(x + 10, 0); g.lineTo(x + 20, 0);
        g.moveTo(x, -20); g.lineTo(x, -10); g.moveTo(x, 10); g.lineTo(x, 20); g.stroke();
        g.fillColor = dark; g.circle(x, 0, 3); g.fill();
        break;
      case 5:
        box(-4, 9, 24, 7, 3.5, "#FFD84E");
        box(-15, -3.5, 29, 7, 3.5, "#FFD84E");
        box(-10, -16, 18, 7, 3.5, "#FFD84E");
        break;
      case 6:
        polygon([[-10,17],[6,17],[7,-3],[16,-8],[15,-16],[-17,-16],[-17,-7],[-9,-3]], "#BE8348");
        box(-18, -19, 34, 6, 2, "#FFCE4C");
        polygon([[3,10],[18,15],[15,5],[8,1],[3,3]], "#FFF9EA");
        break;
    }
  }
});
