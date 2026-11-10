'use strict';
const fs = require('fs'), path = require('path');
const Catalog = require('./catalog'), Document = require('../game-data-editor/lib/json-document');
const clone = value => JSON.parse(JSON.stringify(value)), COLORS = ['green', 'yellow', 'red'];
class SoundService {
  constructor(root, options) {
    this.root = path.resolve(root); this.file = path.join(this.root, 'authoring/audio-review.json'); this.version = 0;
    this.commit = options && options.commit || require('../hkd-characters/lib/asset-transaction').commit;
    this.read(); this.catalog = Catalog.index(this.root);
  }
  disk() { try { return fs.readFileSync(this.file); } catch (error) { if (error.code === 'ENOENT') return null; throw error; } }
  read() {
    this.before = this.disk(); this.text = this.before ? this.before.toString('utf8') : '{\n  "version": 1,\n  "marks": {}\n}\n';
    const data = JSON.parse(this.text.replace(/^\uFEFF/, ''));
    if (data.version !== 1 || !data.marks || typeof data.marks !== 'object' || Array.isArray(data.marks)) throw Error('The saved sound checklist uses an unsupported format.');
    this.original = data; this.data = clone(data); this.version++;
  }
  dirty() { return !Document.equal(this.original, this.data); }
  snapshot(result) { return Object.assign({}, this.catalog, { version: this.version, marks: clone(this.data.marks), dirty: this.dirty(), result: result || null }); }
  load() {
    const disk = this.disk();
    if (!this.dirty() && (disk === null ? this.before !== null : this.before === null || !disk.equals(this.before))) this.read();
    this.catalog = Catalog.index(this.root); return this.snapshot();
  }
  expect(request) { if (!request || request.version !== this.version) throw Error('The checklist changed in another panel. Reload the latest draft before marking sounds.'); }
  mark(request) {
    this.expect(request);
    if (!this.catalog.items.some(item => item.id === request.id)) throw Error('Choose an existing sound.');
    if (request.color !== null && !COLORS.includes(request.color)) throw Error('Choose green, yellow or red.');
    const color = request.color === this.data.marks[request.id] ? null : request.color;
    if (color === null) delete this.data.marks[request.id]; else this.data.marks[request.id] = color;
    this.version++; return this.snapshot();
  }
  discard(request) { this.expect(request); this.read(); return this.snapshot({ discarded: true }); }
  save(request) {
    this.expect(request);
    if (!this.dirty()) return this.snapshot({ saved: false, files: [] });
    const disk = this.disk();
    if (disk === null ? this.before !== null : this.before === null || !disk.equals(this.before)) throw Error('The saved checklist changed on disk. Your draft is intact; reload or discard before saving.');
    const text = Document.patch(this.text, this.original, this.data);
    const result = this.commit(this.root, new Map([['authoring/audio-review.json', text]]), new Map([[this.file, this.before]]), 'authoring/audio-review.json');
    this.read(); return this.snapshot(Object.assign({ saved: true }, result));
  }
  asset(request) {
    const item = this.catalog.items.find(row => row.id === request.id);
    if (!item) throw Error('Choose an existing sound.');
    return item;
  }
}
module.exports = { SoundService, COLORS };
