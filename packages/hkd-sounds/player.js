'use strict';
const MODES = ['once', 'loop', 'next'];
class Player {
  constructor(options) {
    this.options = options; this.items = []; this.id = null; this.media = null; this.generation = 0; this.intent = 0;
    this.mode = 'once'; this.volume = .65; this.status = 'empty'; this.error = ''; this.time = 0; this.duration = 0; this.closed = false;
  }
  item() { return this.items.find(item => item.id === this.id) || null; }
  snapshot() { return { item: this.item(), index: this.items.findIndex(item => item.id === this.id), count: this.items.length,
    mode: this.mode, volume: this.volume, status: this.status, time: this.time, duration: this.duration, error: this.error }; }
  emit() { if (!this.closed && this.options.onChange) this.options.onChange(this.snapshot()); }
  release() {
    this.generation++; this.intent++;
    if (!this.media) return;
    const media = this.media; this.media = null;
    ['loadedmetadata', 'durationchange', 'timeupdate', 'ended', 'error', 'playing', 'pause'].forEach(name => { media['on' + name] = null; });
    media.pause(); media.removeAttribute('src'); media.load();
  }
  setItems(items) {
    this.items = items.slice();
    if (!this.item()) this.select(items[0] && items[0].id, false); else this.emit();
  }
  select(id, play) {
    if (this.closed) return;
    const item = this.items.find(row => row.id === id);
    if (!item) { this.release(); this.id = null; this.status = 'empty'; this.time = this.duration = 0; this.error = ''; this.emit(); return; }
    if (this.id !== item.id) {
      this.release(); this.id = item.id; this.status = 'ready'; this.time = 0; this.duration = item.duration || 0; this.error = '';
    }
    this.emit(); if (play) return this.play();
  }
  ensure() {
    if (this.media) return this.media;
    const item = this.item(); if (!item) return null;
    const media = this.options.createAudio(), generation = this.generation;
    this.media = media; media.preload = 'none'; media.volume = this.volume; media.loop = this.mode === 'loop';
    const current = () => !this.closed && this.media === media && this.generation === generation;
    const update = () => { if (!current()) return; this.time = Number(media.currentTime) || 0; if (Number.isFinite(media.duration) && media.duration > 0) this.duration = media.duration; this.emit(); };
    media.onloadedmetadata = media.ondurationchange = media.ontimeupdate = update;
    media.onended = () => {
      if (!current() || !['playing', 'loading'].includes(this.status)) return;
      this.intent++;
      this.status = 'ended'; this.time = this.duration;
      if (this.mode === 'loop') { media.currentTime = 0; this.play(); }
      else if (this.mode === 'next' && this.items.findIndex(row => row.id === this.id) < this.items.length - 1) this.step(1);
      else this.emit();
    };
    media.onerror = () => {
      if (!current() || !['playing', 'loading'].includes(this.status)) return; this.intent++; media.pause(); this.status = 'error';
      this.error = 'This clip could not be played. Try another sound or refresh the library.'; this.emit();
    };
    media.src = this.options.url(item);
    return media;
  }
  play() {
    if (this.closed || !this.item()) return Promise.resolve(false);
    if (this.status === 'error') this.release();
    const media = this.ensure(), generation = this.generation, intent = ++this.intent;
    if (this.status === 'ended' || media.ended) media.currentTime = 0;
    this.status = 'loading'; this.error = ''; this.emit();
    const current = () => !this.closed && this.media === media && this.generation === generation && this.intent === intent;
    let result;
    try { result = media.play(); } catch (error) { result = Promise.reject(error); }
    return Promise.resolve(result).then(() => {
      if (!current()) return false;
      this.status = 'playing'; this.emit(); return true;
    }, error => {
      if (!current()) return false;
      this.status = 'error'; this.error = error && error.name === 'NotAllowedError' ? 'Press Play to allow audio playback.' : 'Cannot play this clip: ' + (error && error.message || 'audio unavailable');
      this.emit(); return false;
    });
  }
  pause() {
    this.intent++;
    if (!this.media || !['playing', 'loading'].includes(this.status)) return;
    this.media.pause(); this.status = 'paused'; this.emit();
  }
  toggle() { return ['playing', 'loading'].includes(this.status) ? this.pause() : this.play(); }
  stop() { this.intent++; if (this.media) { this.media.pause(); try { this.media.currentTime = 0; } catch (_) {} } this.time = 0; this.status = this.item() ? 'ready' : 'empty'; this.emit(); }
  step(delta) {
    const index = this.items.findIndex(item => item.id === this.id), next = index + delta;
    if (next < 0 || next >= this.items.length) return false;
    return this.select(this.items[next].id, true);
  }
  cycleMode() { this.mode = MODES[(MODES.indexOf(this.mode) + 1) % MODES.length]; if (this.media) this.media.loop = this.mode === 'loop'; this.emit(); }
  setVolume(value) { if (!Number.isFinite(value)) return; this.volume = Math.max(0, Math.min(1, value)); if (this.media) this.media.volume = this.volume; this.emit(); }
  seek(value) { if (!this.media || !Number.isFinite(value) || !this.duration) return; try { this.media.currentTime = Math.max(0, Math.min(this.duration, value)); this.time = this.media.currentTime; this.emit(); } catch (_) {} }
  destroy() { this.closed = true; this.release(); this.items = []; }
}
module.exports = { Player, MODES };
