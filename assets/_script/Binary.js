Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.protoToJson = exports.registerProtoMap = exports.registerProto = exports.decode = exports.encode = exports.Type = exports.singleArray = undefined;
var i = function () {
  function t(t) {
    this.buffer = null;
    this.view = null;
    this.index = 0;
    this.buffer = new ArrayBuffer(t);
    this.view = new DataView(this.buffer);
    this.index = 0;
  }
  t.prototype.setInt8 = function (t) {
    c(t) || (t = 0);
    return this.view.setInt8(this.index++, t);
  };
  t.prototype.setUint8 = function (t) {
    c(t) || (t = 0);
    return this.view.setUint8(this.index++, t);
  };
  t.prototype.setInt16 = function (t) {
    c(t) || (t = 0);
    var e = this.view.setInt16(this.index, t);
    this.index += 2;
    return e;
  };
  t.prototype.setUint16 = function (t) {
    c(t) || (t = 0);
    var e = this.view.setUint16(this.index, t);
    this.index += 2;
    return e;
  };
  t.prototype.setInt32 = function (t) {
    c(t) || (t = 0);
    var e = this.view.setInt32(this.index, t);
    this.index += 4;
    return e;
  };
  t.prototype.setUint32 = function (t) {
    c(t) || (t = 0);
    var e = this.view.setUint32(this.index, t);
    this.index += 4;
    return e;
  };
  t.prototype.setFloat32 = function (t) {
    c(t) || (t = 0);
    var e = this.view.setFloat32(this.index, t);
    this.index += 4;
    return e;
  };
  t.prototype.setFloat64 = function (t) {
    c(t) || (t = 0);
    var e = this.view.setFloat64(this.index, t);
    this.index += 8;
    return e;
  };
  t.prototype.setBoolean = function (t) {
    return this.setUint8(t ? 1 : 0);
  };
  t.prototype.setString = function (t, e) {
    undefined === e && (e = 1);
    l(t) || (t = "");
    this.setUint16(t.length);
    if (4 == e) {
      var n = 0;
      for (var i = t.length; n < i; n++) {
        this.setUint32(t.charCodeAt(n));
      }
    } else if (2 == e) {
      n = 0;
      for (i = t.length; n < i; n++) {
        this.setUint16(t.charCodeAt(n));
      }
    } else {
      n = 0;
      for (i = t.length; n < i; n++) {
        this.setUint8(t.charCodeAt(n));
      }
    }
  };
  t.prototype.setString8 = function (t) {
    this.setString(t, 1);
  };
  t.prototype.setString16 = function (t) {
    this.setString(t, 2);
  };
  t.prototype.setString32 = function (t) {
    this.setString(t, 4);
  };
  t.prototype.setArray = function (t, e) {
    undefined === e && (e = 1);
    if (r(t) && !h(t)) {
      return this.setString(JSON.stringify(t), e);
    } else {
      return this.setString("", e);
    }
  };
  t.prototype.setArray8 = function (t) {
    return this.setArray(t, 1);
  };
  t.prototype.setArray16 = function (t) {
    return this.setArray(t, 2);
  };
  t.prototype.setArray32 = function (t) {
    return this.setArray(t, 4);
  };
  t.prototype.setObject = function (t, e) {
    undefined === e && (e = 1);
    if (s(t) && !h(t)) {
      return this.setString(JSON.stringify(t), e);
    } else {
      return this.setString("", e);
    }
  };
  t.prototype.setObject8 = function (t) {
    return this.setObject(t, 1);
  };
  t.prototype.setObject16 = function (t) {
    return this.setObject(t, 2);
  };
  t.prototype.setObject32 = function (t) {
    return this.setObject(t, 4);
  };
  t.prototype.getBuffer = function () {
    return this.buffer;
  };
  return t;
}();
var a = function () {
  function t(t) {
    this.view = null;
    this.index = 0;
    this.view = new DataView(t);
    this.index = 0;
  }
  t.prototype.getInt8 = function () {
    return this.view.getInt8(this.index++);
  };
  t.prototype.getUint8 = function () {
    return this.view.getUint8(this.index++);
  };
  t.prototype.getInt16 = function () {
    var t = this.view.getInt16(this.index);
    this.index += 2;
    return t;
  };
  t.prototype.getUint16 = function () {
    var t = this.view.getUint16(this.index);
    this.index += 2;
    return t;
  };
  t.prototype.getInt32 = function () {
    var t = this.view.getInt32(this.index);
    this.index += 4;
    return t;
  };
  t.prototype.getUint32 = function () {
    var t = this.view.getUint32(this.index);
    this.index += 4;
    return t;
  };
  t.prototype.getFloat32 = function () {
    var t = this.view.getFloat32(this.index);
    this.index += 4;
    return t;
  };
  t.prototype.getFloat64 = function () {
    var t = this.view.getFloat64(this.index);
    this.index += 8;
    return t;
  };
  t.prototype.getBoolean = function () {
    return !!this.getUint8();
  };
  t.prototype.getString = function (t) {
    undefined === t && (t = 1);
    var e = this.getUint16();
    var n = "";
    if (4 == t) {
      for (var i = 0; i < e; i++) {
        n += String.fromCharCode(this.getUint32());
      }
    } else if (2 == t) {
      for (i = 0; i < e; i++) {
        n += String.fromCharCode(this.getUint16());
      }
    } else {
      for (i = 0; i < e; i++) {
        n += String.fromCharCode(this.getUint8());
      }
    }
    return n;
  };
  t.prototype.getString8 = function () {
    return this.getString(1);
  };
  t.prototype.getString16 = function () {
    return this.getString(2);
  };
  t.prototype.getString32 = function () {
    return this.getString(4);
  };
  t.prototype.getArray = function (t) {
    undefined === t && (t = 1);
    var e = this.getString(t);
    if (e) {
      return JSON.parse(e);
    } else {
      return [];
    }
  };
  t.prototype.getArray8 = function () {
    return this.getArray(1);
  };
  t.prototype.getArray16 = function () {
    return this.getArray(2);
  };
  t.prototype.getArray32 = function () {
    return this.getArray(4);
  };
  t.prototype.getObject = function (t) {
    undefined === t && (t = 1);
    var e = this.getString(t);
    if (e) {
      return JSON.parse(e);
    } else {
      return {};
    }
  };
  t.prototype.getObject8 = function () {
    return this.getObject(1);
  };
  t.prototype.getObject16 = function () {
    return this.getObject(2);
  };
  t.prototype.getObject32 = function () {
    return this.getObject(4);
  };
  return t;
}();
var o = function (t) {
  return Object.prototype.toString.call(t).slice(8, -1).toLowerCase();
};
var r = function (t) {
  return "array" === o(t);
};
var s = function (t) {
  return "object" === o(t);
};
var l = function (t) {
  return "string" === o(t);
};
var c = function (t) {
  return "number" === o(t);
};
function h(t) {
  if (r(t)) {
    return !t.length;
  }
  if (s(t)) {
    for (var e in t) {
      return false;
    }
  }
  return true;
}
function g(t, e) {
  if (t === e) {
    return 0;
  }
  var n = Math.max(t.length, e.length);
  var i = 0;
  var a = 0;
  for (var o = 0; i < n; i++) {
    if (t.length <= i) {
      return -1;
    }
    if (e.length <= i) {
      return 1;
    }
    if ((a = t.charCodeAt(i)) > (o = e.charCodeAt(i))) {
      return 1;
    }
    if (a < o) {
      return -1;
    }
  }
  return 0;
}
function u(t) {
  if (s(t)) {
    var e = 0;
    var n = [];
    for (var i in t) {
      for (e = n.length - 1; e >= 0 && !(g(i, n[e]) >= 0); e--) {
        ;
      }
      if (e === n.length - 1) {
        n.push(i);
      } else {
        n.splice(e + 1, 0, i);
      }
    }
    return n;
  }
  if (r(t)) {
    return t.map(function (t, e) {
      return e;
    });
  } else {
    return [];
  }
}
function d(t) {
  if (r(t) || s(t)) {
    return t;
  } else {
    return b[t] || t;
  }
}
var p = "SingleArray";
function f(t) {
  return l(t) && 0 === t.indexOf(p);
}
function m(t) {
  var e = t.slice(p.length + 1, -1);
  return JSON.parse(e);
}
function y(t, e) {
  e = d(e);
  var n = 0;
  if (s(e)) {
    s(t) || (t = {});
    for (var i in e) {
      n += y(t[i], e[i]);
    }
  } else if (r(e)) {
    r(t) || (t = []);
    e.forEach(function (e, i) {
      n += y(t[i], e);
    });
  } else if (f(e)) {
    n += 2;
    r(t) || (t = []);
    e = d(m(e));
    t.forEach(function (t) {
      n += y(t, e);
    });
  } else {
    if (!I[e]) {
      throw new Error("'proto' is bad");
    }
    var a = I[e];
    if (0 === e.indexOf("String")) {
      n += 2;
      l(t) && (n += t.length * a);
    } else if (0 === e.indexOf("Object") || 0 === e.indexOf("Array")) {
      n += 2;
      h(t) || (n += JSON.stringify(t).length * a);
    } else {
      n += a;
    }
  }
  return n;
}
function v(t, e, n) {
  n = d(n);
  if (s(n)) {
    s(e) || (e = {});
    u(n).forEach(function (i) {
      v(t, e[i], n[i]);
    });
  } else if (r(n)) {
    r(e) || (e = []);
    n.forEach(function (n, i) {
      v(t, e[i], n);
    });
  } else if (f(n)) {
    r(e) || (e = []);
    t.setUint16(e.length);
    n = d(m(n));
    e.forEach(function (e) {
      v(t, e, n);
    });
  } else {
    t["set" + n](e);
  }
}
function _(t, e) {
  e = d(e);
  if (s(e)) {
    var n = {};
    u(e).forEach(function (i) {
      n[i] = _(t, e[i]);
    });
    return n;
  }
  if (r(e)) {
    return e.map(function (e) {
      return _(t, e);
    });
  }
  if (f(e)) {
    var i = [];
    var a = t.getUint16();
    e = d(m(e));
    for (var o = 0; o < a; o++) {
      i.push(_(t, e));
    }
    return i;
  }
  return t["get" + e]();
}
exports.singleArray = function (t) {
  return p + "(" + JSON.stringify(t) + ")";
};
var I = {
  Int8: 1,
  Uint8: 1,
  Int16: 2,
  Uint16: 2,
  Int32: 4,
  Uint32: 4,
  Float32: 4,
  Float64: 8,
  BigInt64: 8,
  BigUint64: 8,
  Boolean: 1,
  String8: 1,
  String16: 2,
  String32: 4,
  Array8: 1,
  Array16: 2,
  Array32: 4,
  Object8: 1,
  Object16: 2,
  Object32: 4
};
exports.Type = {
  Int8: "Int8",
  Uint8: "Uint8",
  Uint8Clamped: "Uint8",
  Int16: "Int16",
  Uint16: "Uint16",
  Int32: "Int32",
  Uint32: "Uint32",
  Float32: "Float32",
  Float64: "Float64",
  BigInt64: "BigInt64",
  BigUint64: "BigUint64",
  Boolean: "Boolean",
  String: "String8",
  String8: "String8",
  String16: "String16",
  String32: "String32",
  Array: "Array8",
  Array8: "Array8",
  Array16: "Array16",
  Array32: "Array32",
  Object: "Object8",
  Object8: "Object8",
  Object16: "Object16",
  Object32: "Object32"
};
exports.encode = function (t, e) {
  var n = b[e];
  if (n) {
    var a = y(t, n);
    var o = new i(a + 2);
    o.setUint16(Number(e));
    v(o, t, n);
    return o.getBuffer();
  }
  throw new Error("encode error: 'id' is bad");
};
exports.decode = function (t) {
  var e = new a(t);
  var n = e.getUint16();
  var i = b[n];
  if (i) {
    return _(e, i);
  }
  throw new Error("decode error: 'buffer' is bad");
};
var b = {};
exports.registerProto = function (t, e) {
  "string" == typeof t && (t = Number(t));
  if (!(c(t) && Math.floor(t) === t && t >= 0 && t <= 65535) || exports.Type[t]) {
    throw new Error("registerProto error: 'id' is bad");
  }
  b[t] = e;
};
exports.registerProtoMap = function (t) {
  if (!s(t)) {
    throw new Error("registerProtoMap error: 'protoMap' is bad");
  }
  for (var e in t) {
    exports.registerProto(e, t[e]);
  }
};
exports.protoToJson = function () {
  return JSON.stringify(b);
};