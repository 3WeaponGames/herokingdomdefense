var i;
var cc__extends = __extends;
var cc__decorate = __decorate;
Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.AStarNode = exports.MapCellType = exports.MapCellInfo = undefined;
var r;
var $z1KinghtFallUIGame = require("KinghtFallUIGame");
var cc__decorator = cc._decorator;
var ccp_ccclass = cc__decorator.ccclass;
var ccp_property = cc__decorator.property;
(function (t) {
  t[t.FOUR = 4] = "FOUR";
  t[t.EIGHT = 8] = "EIGHT";
})(r || (r = {}));
var def_KinghtFallGameMap = function (t) {
  function _ctor() {
    var e = null !== t && t.apply(this, arguments) || this;
    e.graphics = null;
    e.cellSize = 30;
    e.sep = "#";
    e.mapData = {};
    e.mType = r.EIGHT;
    return e;
  }
  cc__extends(_ctor, t);
  _ctor.prototype.initMap = function (t) {
    for (var e = -t.width / 2; e < t.width / 2; e += this.cellSize) {
      for (var n = -t.height / 2; n < t.height / 2; n += this.cellSize) {
        var i = Math.floor(n / this.cellSize);
        var a = Math.floor(e / this.cellSize);
        var o = cc.v2(e, n);
        var r = this.node.convertToWorldSpaceAR(o);
        this.mapData["" + i + this.sep + a] = new exp_MapCellInfo(o, r, this.cellSize);
      }
    }
  };
  _ctor.prototype.initBuild = function () {
    for (var t in this.mapData) {
      var e = this.mapData[t];
      if (e.type != u.MONSTER) {
        var n = new cc.Rect(e.wPos.x, e.wPos.y, this.cellSize, this.cellSize);
        e.type = $z1KinghtFallUIGame.default.instance.ctrGame.gameData.isBlocked(n) ? u.WALL : u.EMPTY;
      }
    }
    this.drawMap();
  };
  _ctor.prototype.getCellByPos = function (t) {
    var e = Math.floor(t.y / this.cellSize);
    var n = Math.floor(t.x / this.cellSize);
    return this.mapData["" + e + this.sep + n];
  };
  _ctor.prototype.getCellByWPos = function (t) {
    var e = this.node.convertToNodeSpaceAR(t);
    var n = Math.floor(e.y / this.cellSize);
    var i = Math.floor(e.x / this.cellSize);
    return this.mapData["" + n + this.sep + i];
  };
  _ctor.prototype.getCell = function (t, e) {
    return this.mapData["" + t + this.sep + e];
  };
  _ctor.prototype.drawMap = function () {
    this.graphics.clear();
    for (var t in this.mapData) {
      var e = this.mapData[t];
      var n = undefined;
      switch (e.type) {
        case u.EMPTY:
          n = e.tags.length > 0 ? new cc.Color(0, 0, 0, 100) : new cc.Color(255, 255, 255, 150);
          break;
        case u.WALL:
          n = new cc.Color(255, 0, 0, 150);
          break;
        case u.MONSTER:
          n = new cc.Color(0, 255, 0, 255);
      }
      this.graphics.fillColor = n;
      var i = this.node.convertToNodeSpaceAR(e.wPos);
      this.graphics.fillRect(i.x, i.y, this.cellSize, this.cellSize);
    }
  };
  _ctor.prototype.findPath = function (t, e) {
    var n = new f();
    var i = new Map();
    var a = new Map();
    var nodes = new Map();
    var intern = function (node) {
      var key = node.x + "#" + node.y;
      if (!nodes.has(key)) nodes.set(key, node);
      return nodes.get(key);
    };
    var o = intern(new exp_AStarNode(t.row, t.col));
    n.put(o, 0);
    a.set(o, 0);
    for (var r = 0; n.size > 0;) {
      r++;
      var s = n.get();
      if (s.x === e.row && s.y === e.col) {
        console.log("找到路径", r);
        return this.reconstructPath(i, s);
      }
      var l = 0;
      for (var c = this.getNeighbors(s); l < c.length; l++) {
        var h = intern(c[l]);
        if (this.isWalkable(h)) {
          var g = a.get(s) + (s.x !== h.x && s.y !== h.y ? 1.5 : 1);
          if (!a.has(h) || g < a.get(h)) {
            a.set(h, g);
            var u = g + this.heuristic(h, e);
            n.put(h, u);
            i.set(h, s);
          }
        }
      }
    }
    return [];
  };
  _ctor.prototype.findPath2 = function (t, e) {
    var n = new f();
    var i = new Map();
    var a = new Map();
    var nodes = new Map();
    var intern = function (node) {
      var key = node.x + "#" + node.y;
      if (!nodes.has(key)) nodes.set(key, node);
      return nodes.get(key);
    };
    var o = intern(new exp_AStarNode(t.row, t.col));
    n.put(o, 0);
    a.set(o, 0);
    var r = null;
    for (var s = 1 / 0; n.size > 0;) {
      var l = n.get();
      if (l.x === e.row && l.y === e.col) {
        return this.reconstructPath(i, l);
      }
      var c = 0;
      for (var h = this.getNeighbors(l); c < h.length; c++) {
        var g = intern(h[c]);
        if (this.isWalkable(g)) {
          var u = a.get(l) + 1;
          if (!a.has(g) || u < a.get(g)) {
            a.set(g, u);
            var d = u + this.heuristic(g, e);
            n.put(g, d);
            i.set(g, l);
          }
        }
      }
      var remaining = this.heuristic(l, e);
      if (remaining < s || remaining === s && r && a.get(l) < a.get(r)) {
        s = remaining;
        r = l;
      }
    }
    if (r) {
      return this.reconstructPath(i, r);
    } else {
      return [];
    }
  };
  _ctor.prototype.findPath3 = function (t, e, n) {
    var i = new f();
    var a = new Map();
    var o = new Map();
    var nodes = new Map();
    var intern = function (node) {
      var key = node.x + "#" + node.y;
      if (!nodes.has(key)) nodes.set(key, node);
      return nodes.get(key);
    };
    var r = intern(new exp_AStarNode(t.row, t.col));
    i.put(r, 0);
    o.set(r, 0);
    var s = null;
    var l = 1 / 0;
    for (var c = 0; i.size > 0 && c < n;) {
      c++;
      var h = i.get();
      if (h.x === e.row && h.y === e.col) {
        return this.reconstructPath(a, h);
      }
      var g = 0;
      for (var u = this.getNeighbors(h); g < u.length; g++) {
        var d = intern(u[g]);
        if (this.isWalkable(d)) {
          var m = o.get(h) + 1;
          if (!o.has(d) || m < o.get(d)) {
            o.set(d, m);
            var y = m + this.heuristic(d, e);
            i.put(d, y);
            a.set(d, h);
          }
        }
      }
      var remaining = this.heuristic(h, e);
      if (remaining < l || remaining === l && s && o.get(h) < o.get(s)) {
        l = remaining;
        s = h;
      }
    }
    if (s) {
      return this.reconstructPath(a, s);
    } else {
      return [];
    }
  };
  _ctor.prototype.getNeighbors = function (t) {
    var e = [];
    if (this.mType === r.FOUR) {
      e.push(new exp_AStarNode(t.x - 1, t.y), new exp_AStarNode(t.x + 1, t.y), new exp_AStarNode(t.x, t.y - 1), new exp_AStarNode(t.x, t.y + 1));
    } else {
      e.push(new exp_AStarNode(t.x - 1, t.y - 1), new exp_AStarNode(t.x - 1, t.y + 1), new exp_AStarNode(t.x + 1, t.y - 1), new exp_AStarNode(t.x + 1, t.y + 1), new exp_AStarNode(t.x - 1, t.y), new exp_AStarNode(t.x + 1, t.y), new exp_AStarNode(t.x, t.y - 1), new exp_AStarNode(t.x, t.y + 1));
    }
    return e;
  };
  _ctor.prototype.isWalkable = function (t) {
    var e = this.mapData["" + t.x + this.sep + t.y];
    return e && e.type === u.EMPTY;
  };
  _ctor.prototype.heuristic = function (t, e) {
    return Math.abs(t.x - e.row) + Math.abs(t.y - e.col);
  };
  _ctor.prototype.reconstructPath = function (t, e) {
    for (var n = []; e;) {
      n.push(e);
      e = t.get(e);
    }
    return n.reverse();
  };
  cc__decorate([ccp_property({
    type: cc.Graphics,
    tooltip: "地图绘制"
  })], _ctor.prototype, "graphics", undefined);
  return cc__decorate([ccp_ccclass], _ctor);
}(cc.Component);
exports.default = def_KinghtFallGameMap;
var u;
var exp_MapCellInfo = function () {
  function t(t, e, n) {
    this.pos = new cc.Vec2();
    this.center = new cc.Vec2();
    this.wPos = new cc.Vec2();
    this.monster = [];
    this.tags = [];
    this.pos = t;
    this.center = cc.v2(t.x + n / 2, t.y + n / 2);
    this.wPos = e;
    this.row = Math.floor(t.y / n);
    this.col = Math.floor(t.x / n);
    this.type = u.EMPTY;
  }
  t.prototype.delEnemy = function (t) {
    for (var e = 0; e < this.monster.length; e++) {
      if (this.monster[e] == t) {
        this.monster.splice(e, 1);
        break;
      }
    }
    this.delTag(t);
    if (0 == this.monster.length) {
      this.type = u.EMPTY;
    } else {
      this.type = u.MONSTER;
    }
  };
  t.prototype.addEnemy = function (t) {
    this.monster.push(t);
    this.delTag(t);
    if (0 == this.monster.length) {
      this.type = u.EMPTY;
    } else {
      this.type = u.MONSTER;
    }
  };
  t.prototype.addTag = function (t) {
    this.tags.push(t);
  };
  t.prototype.delTag = function (t) {
    for (var e = 0; e < this.tags.length; e++) {
      if (this.tags[e] == t) {
        this.tags.splice(e, 1);
        e--;
      }
    }
  };
  return t;
}();
exports.MapCellInfo = exp_MapCellInfo;
(function (t) {
  t[t.EMPTY = 0] = "EMPTY";
  t[t.WALL = 1] = "WALL";
  t[t.MONSTER = 2] = "MONSTER";
})(u = exports.MapCellType || (exports.MapCellType = {}));
var exp_AStarNode = function () {
  function t(t, e) {
    this._x = 0;
    this._y = 0;
    this.priority = 0;
    this._x = t;
    this._y = e;
  }
  Object.defineProperty(t.prototype, "x", {
    get: function () {
      return this._x;
    },
    enumerable: false,
    configurable: true
  });
  Object.defineProperty(t.prototype, "y", {
    get: function () {
      return this._y;
    },
    enumerable: false,
    configurable: true
  });
  return t;
}();
exports.AStarNode = exp_AStarNode;
var f = function () {
  function t() {
    this.arr = [];
  }
  t.prototype.put = function (t, e) {
    t.priority = e;
    this.arr.push(t);
    this.arr.sort(function (t, e) {
      return e.priority - t.priority;
    });
  };
  t.prototype.get = function () {
    return this.arr.pop();
  };
  Object.defineProperty(t.prototype, "size", {
    get: function () {
      return this.arr.length;
    },
    enumerable: false,
    configurable: true
  });
  return t;
}();
