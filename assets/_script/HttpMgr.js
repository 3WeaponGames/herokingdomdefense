"use strict";
function HttpMgr() {}
HttpMgr.getInstance = function () { return this.instance || (this.instance = new HttpMgr()); };
function request(method, url, body, json, callback) {
  var xhr, finished = false;
  function finish(ok, text) { if (finished) return; finished = true; if (callback) callback(ok, text); }
  try {
    xhr = new XMLHttpRequest();
    xhr.open(method, url, true); xhr.timeout = 7000;
    xhr.setRequestHeader("Content-Type", json ? "application/json" : "application/x-www-form-urlencoded");
    xhr.onreadystatechange = function () {
      if (xhr.readyState !== 4) return;
      finish(xhr.status >= 200 && xhr.status < (method === "GET" ? 300 : 400), xhr.responseText);
    };
    xhr.onerror = xhr.ontimeout = xhr.onabort = function () { finish(false, ""); };
    xhr.send(body == null ? null : body);
  } catch (error) { if (finished) throw error; finish(false, ""); }
}
function form(data) { return Object.keys(data || {}).map(function (key) { return encodeURIComponent(key) + "=" + encodeURIComponent(data[key]); }).join("&"); }
HttpMgr.prototype.httpGet = function (url, data, callback) {
  var query = form(data); if (query) url += (url.indexOf("?") < 0 ? "?" : "&") + query;
  request("GET", url, null, true, function (ok, text) { if (callback) callback(ok, ok ? text : ""); });
};
HttpMgr.prototype.httpPost = function (data, callback, url, json) {
  var body;
  try { body = data ? json ? JSON.stringify(data) : form(data) : null; }
  catch (error) { if (callback) callback(null); return; }
  request("POST", url, body, json, function (ok, text) { if (callback) callback(ok && HttpMgr.isPass(text) ? text : null); });
};
HttpMgr.isPass = function () { return true; };
exports.HttpMgr = HttpMgr;
