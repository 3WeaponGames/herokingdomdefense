"use strict";
// Only completed work and loader callbacks advance this presentation model.
var active = null;
var phases = {
  language: [0, .05], services: [.05, .10], settings: [.10, .15], player: [.15, .20],
  game: [.20, .30], progress: [.30, .35], characters: [.35, .50], buildings: [.50, .68],
  skills: [.68, .82], enemies: [.82, .84], maps: [.84, .86], scene: [.86, .92],
  lobby: [.92, .98], finishing: [.98, 1]
};
function Session(render) {
  this.render = render; this.value = 0; this.key = "language"; this.jobs = {};
  this.sceneProgress = 0; this.closed = false; this.publish();
}
Session.prototype.publish = function () {
  if (this.closed) return;
  var range = phases[this.key], jobs = this.jobs[this.key] || [], done = 0, finished = 0;
  jobs.forEach(function (job) { done += job.value; if (job.value === 1) finished++; });
  var fraction = this.key === "scene" ? this.sceneProgress : jobs.length ? done / (jobs.length + 1) : 0;
  this.value = Math.max(this.value, range[0] + (range[1] - range[0]) * Math.min(.98, fraction));
  if (this.render) this.render({ value: this.value, phase: this.key, completed: finished, total: jobs.length });
};
Session.prototype.phase = function (key) {
  if (this.closed || !phases[key] || phases[key][0] < phases[this.key][0]) return;
  this.key = key; this.publish();
};
Session.prototype.begin = function () {
  var self = this, key = this.key, job = { value: 0 };
  (this.jobs[key] || (this.jobs[key] = [])).push(job); this.publish();
  function update(value) {
    if (self.closed) return;
    job.value = Math.max(job.value, Math.max(0, Math.min(1, value)));
    if (self.key === key) self.publish();
  }
  return {
    progress: function (completed, total) { if (total > 0) update(completed / total); },
    complete: function () { update(1); },
    cancel: function () { update(1); }
  };
};
Session.prototype.scene = function (completed, total) {
  if (this.closed || !(total > 0)) return;
  this.sceneProgress = Math.max(this.sceneProgress, Math.min(1, completed / total));
  if (this.key === "scene") this.publish();
};
Session.prototype.complete = function () {
  if (this.closed) return;
  this.value = 1;
  if (this.render) this.render({ value: 1, phase: "ready", completed: 0, total: 0 });
};
Session.prototype.close = function () { this.closed = true; if (active === this) active = null; };
exports.create = function (render) { if (active) active.close(); active = new Session(render); return active; };
exports.phase = function (key) { if (active) active.phase(key); };
exports.current = function () { return active; };
exports.Session = Session;
