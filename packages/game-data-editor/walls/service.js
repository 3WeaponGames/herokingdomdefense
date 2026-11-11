'use strict';
// Shared visual wall data only. Reads and detached previews never save a scene,
// configuration, player state, recovery draft, or imported artwork.
const fs = require('fs'), path = require('path'), os = require('os'), crypto = require('crypto'), url = require('url');
const JSONDoc = require('../lib/json-document');
const FILE = 'assets/_script/WallAdjustmentData.js';
const TIERS = [1, 2, 3], FACES = ['NW', 'SW', 'NE', 'SE'], STATES = ['closed', 'inward', 'outward'];
const clone = value => JSON.parse(JSON.stringify(value)), sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const object = value => value && typeof value === 'object' && !Array.isArray(value);
const put = (target, key, value) => Object.defineProperty(target, key, {value, enumerable: true, configurable: true, writable: true});
function within(root, file) {const r = path.resolve(root).toLowerCase(), f = path.resolve(file).toLowerCase(); return f === r || f.startsWith(r + path.sep);}
function resolved(file) {let at = path.resolve(file), tail = []; while (!fs.existsSync(at)) {tail.unshift(path.basename(at)); const next = path.dirname(at); if (next === at) break; at = next;} return path.join(fs.realpathSync(at), ...tail);}
function sourceFile(root) {
  const file = path.resolve(root, FILE);
  if (!within(fs.realpathSync(root), resolved(file))) throw Error('Wall adjustment data must remain in this project.');
  if (fs.existsSync(file) && !fs.lstatSync(file).isFile()) throw Error('Wall adjustment data must be an ordinary source file.');
  return file;
}
function jsonValue(value) {
  const seen = new Set();
  function visit(v) {
    if (v === null || typeof v === 'string' || typeof v === 'boolean' || typeof v === 'number' && Number.isFinite(v)) return;
    if (!v || typeof v !== 'object' || seen.has(v) || !Array.isArray(v) && Object.getPrototypeOf(v) !== Object.prototype && Object.getPrototypeOf(v) !== null) throw Error('Wall adjustment data must contain finite JSON values.');
    seen.add(v); for (const key of Object.keys(v)) visit(v[key]); seen.delete(v);
  }
  visit(value); return clone(value);
}
function literal(text) {
  // Do not execute a source module merely to open an authoring panel.
  const prefix = /^(?:\uFEFF)?(?:(?:\s+)|(?:\/\/[^\r\n]*(?:\r?\n|$))|(?:\/\*[\s\S]*?\*\/)|(?:(?:'use strict'|"use strict")\s*;))*module\.exports\s*=\s*/.exec(text);
  if (!prefix) throw Error('WallAdjustmentData.js must export one literal JSON object.');
  const start = prefix[0].length; if (text[start] !== '{') throw Error('WallAdjustmentData.js must export a JSON object.');
  let depth = 0, string = false, escape = false, end = -1;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (string) {if (escape) escape = false; else if (c === '\\') escape = true; else if (c === '"') string = false; continue;}
    if (c === '"') string = true; else if (c === '{' || c === '[') depth++; else if (c === '}' || c === ']') {depth--; if (!depth) {end = i + 1; break;}}
  }
  if (end < 0 || !/^\s*;?\s*(?:(?:\/\/[^\r\n]*(?:\r?\n|$)|\/\*[\s\S]*?\*\/)\s*)*$/.test(text.slice(end))) throw Error('Unexpected executable content in WallAdjustmentData.js.');
  const json = text.slice(start, end), data = JSON.parse(json);
  if (!object(data)) throw Error('Wall adjustment data must be an object.');
  return {prefix: text.slice(0, start), json, suffix: text.slice(end), data};
}
function readSource(root) {
  const file = sourceFile(root), bytes = fs.readFileSync(file), document = literal(bytes.toString('utf8'));
  return {...document, file, text: bytes.toString('utf8'), bytes, revision: sha(bytes)};
}
function selection(request) {
  request = request || {}; const value = {tier: request.tier === undefined ? 1 : request.tier, face: request.face === undefined ? 'NW' : request.face, state: request.state === undefined ? 'closed' : request.state, night: request.night === true};
  if (request.night !== undefined && typeof request.night !== 'boolean') throw Error('Night lighting is a read-only preview option.');
  if (!TIERS.includes(value.tier) || !FACES.includes(value.face) || !STATES.includes(value.state)) throw Error('Choose a wall tier, diagonal facing and gate pose.');
  return value;
}
function retainUnknown(before, after) {
  const result = clone(after);
  function fields(old, next, known) {const out = object(next) ? clone(next) : {}; for (const key of Object.keys(old || {})) if (!known.includes(key) && !own(out, key)) put(out, key, clone(old[key])); return out;}
  const root = fields(before, result, ['version', 'poses']);
  if (!object(root.poses)) return root;
  for (const [key, pose] of Object.entries(before.poses || {})) {
    if (!/^[123]\/(NW|SW|NE|SE)\/(closed|inward|outward)$/.test(key)) {if (!own(root.poses, key)) put(root.poses, key, clone(pose)); continue;}
    const next = fields(pose, root.poses[key], ['pieces', 'order']), pieces = object(next.pieces) ? next.pieces : {};
    for (const [id, piece] of Object.entries(pose.pieces || {})) {const retained = fields(piece, pieces[id], ['x', 'y']); if (Object.keys(retained).length) put(pieces, id, retained);}
    if (Object.keys(pieces).length) next.pieces = pieces;
    if (Object.keys(next).length) put(root.poses, key, next);
  }
  return root;
}
function fingerprint(file) {return fs.existsSync(file) ? sha(fs.readFileSync(file)) : null;}
function artifacts(root, requested) {
  const file = path.resolve(requested || path.join(os.homedir(), 'Documents', 'Codex Artifacts', 'HeroKingdomDefense', '2026-11-11-wall-adjustments', sha(path.resolve(root).toLowerCase()).slice(0, 16)));
  if (within(root, file) || within(fs.realpathSync(root), resolved(file))) throw Error('Wall adjustment backups must stay outside the project.');
  return file;
}
const assetCache = new Map();
function assets(root) {
  const folder = path.join(root, 'assets/KinghtFallIconMap/com/Ani/cq/cq1'), file = path.join(folder, 'cq1.json'), atlasFile = path.join(folder, 'cq1.atlas');
  const stamp = f => {const s = fs.statSync(f); return s.mtimeMs + ':' + s.ctimeMs + ':' + s.size;};
  const signature = stamp(file) + ':' + stamp(atlasFile), previous = assetCache.get(folder);
  let value;
  if (previous && previous.signature === signature) value = previous;
  else {value = {signature, json: JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')), atlas: fs.readFileSync(atlasFile, 'utf8')}; assetCache.set(folder, value); if (assetCache.size > 8) assetCache.delete(assetCache.keys().next().value);}
  const pages = {}, versions = [], lines = value.atlas.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) if (lines[i].trim() && (i === 0 || !lines[i - 1].trim()) && lines[i + 1] && /^(size|format):/.test(lines[i + 1].trim())) {
    const name = lines[i].trim(); if (path.basename(name) !== name) throw Error('Wall atlas pages must remain beside their source atlas.');
    const page = path.join(folder, name), revision = stamp(page), uri = url.pathToFileURL(page); uri.searchParams.set('wall-art', revision); pages[name] = uri.href; versions.push([name, revision]);
  }
  return {...value, file, pages, revision: sha(JSON.stringify([signature, versions]))};
}
class Service {
  constructor(root, options) {this.root = path.resolve(root); this.options = options || {}; this.artifacts = artifacts(this.root, this.options.artifacts);}
  helper() {return this.options.helper || require(path.join(this.root, 'assets/_script/WallAdjustments.js'));}
  validate(value) {const data = jsonValue(value); this.helper().validate(data); return data;}
  load(request) {
    const source = readSource(this.root), data = this.validate(source.data), chosen = selection(request), snapshot = {revision: source.revision, data, selection: chosen, tiers: TIERS.slice(), faces: FACES.slice(), states: STATES.slice(), source: FILE};
    if (!request || request.preview !== false) snapshot.preview = this.preview({...chosen, data});
    return snapshot;
  }
  preview(request) {
    request = request || {}; const source = readSource(this.root), chosen = selection(request), helper = this.helper();
    let data = this.validate(request.data === undefined ? source.data : request.data);
    if (request.edit !== undefined) data = this.validate(helper.edit(data, chosen, jsonValue(request.edit)));
    if (this.options.preview) return {...this.options.preview(data, chosen), data: clone(data), sourceRevision: source.revision, selection: chosen};
    const Kit = require(path.join(this.root, 'assets/_script/WallKit.js')), Facing = require(path.join(this.root, 'assets/_script/GateFacing.js')), Units = require('../lib/unit-assets');
    const original = assets(this.root), layout = clone(original.json.wallKit.layout), mirrorX = Facing.mirrorX(chosen.face);
    let json = Kit.install(original.json, layout, undefined, {mirrorX, tier: chosen.tier, face: chosen.face, adjustmentsData: data});
    if (Facing.reverse(chosen.face)) json = Facing.mirrorJson(json);
    json = helper.apply(json, layout, {...chosen, data, forceSplitClosed: true}); Kit.updateBounds(json);
    const view = helper.describe(json, layout, {...chosen, data}), sign = mirrorX ? -1 : 1, revision = sha(JSON.stringify([original.revision, data, chosen]));
    const animation = chosen.state === 'closed' ? (chosen.night ? 'idle_night' : 'idle') : Facing.animation(json, chosen.night ? 'open_night' : 'open', chosen.state);
    const description = {uuid: 'wall-adjustment-preview', source: path.relative(this.root, original.file).replace(/\\/g, '/'), name: 'Wall / Gate', json, atlas: original.atlas, pages: original.pages,
      skin: Kit.skins[chosen.tier - 1], animation, poseTime: 'end', revision, matrix: [sign, 0, 0, 1, 0, 0], x: 0, y: 0, scaleX: sign, scaleY: 1, rotation: 0};
    const header = json.skeleton, bounds = {x: sign < 0 ? -(header.x + header.width) : header.x, y: header.y, width: header.width, height: header.height};
    return {sourceRevision: source.revision, data: clone(data), selection: chosen, record: {origin: {x: 0, y: 0}, sprites: [], skeletons: [description]}, descriptions: [description], runtimePath: Units.enginePath(), ...view, bounds};
  }
  save(request) {
    request = request || {}; const current = readSource(this.root);
    if (typeof request.revision !== 'string' || request.revision !== current.revision) throw Error('Wall adjustments changed on disk. Reload before saving; your draft is retained.');
    const data = this.validate(retainUnknown(current.data, this.validate(request.data)));
    if (JSONDoc.equal(current.data, data)) return {revision: current.revision, data: clone(current.data), result: {saved: false, noChanges: true, files: []}};
    const text = current.prefix + JSONDoc.patch(current.json, current.data, data) + current.suffix;
    this.validate(literal(text).data); const bytes = Buffer.from(text), after = sha(bytes), directory = path.join(this.artifacts, 'saves', new Date().toISOString().replace(/[:.]/g, '-') + '-' + crypto.randomBytes(5).toString('hex'));
    if (fingerprint(current.file) !== current.revision) throw Error('Wall adjustments changed while preparing the save. Your draft is retained.');
    fs.mkdirSync(directory, {recursive: true}); const backup = path.join(directory, 'before-WallAdjustmentData.js'), staged = path.join(directory, 'staged-WallAdjustmentData.js'), journalFile = path.join(directory, 'journal.json');
    fs.writeFileSync(backup, current.bytes, {flag: 'wx'}); fs.writeFileSync(staged, bytes, {flag: 'wx'});
    const journal = {status: 'prepared', target: current.file, before: current.revision, after, backup}; fs.writeFileSync(journalFile, JSON.stringify(journal, null, 2) + '\n', {flag: 'wx'});
    if (this.options.beforeCommit) this.options.beforeCommit(current.file);
    if (fingerprint(current.file) !== current.revision) throw Error('Wall adjustments changed before commit. Your draft and external backup are retained.');
    // An external backup folder can be on another volume. Copy the verified
    // payload to a unique adjacent transaction file, then atomically replace
    // only the authored module on its own filesystem.
    const localTemp = current.file + '.hkd-save-' + process.pid + '-' + crypto.randomBytes(6).toString('hex') + '.tmp', warnings = [];
    let committed = false;
    try {
      fs.copyFileSync(staged, localTemp, fs.constants.COPYFILE_EXCL);
      if (fingerprint(localTemp) !== after) throw Error('Wall adjustment staging verification failed.');
      if (fingerprint(current.file) !== current.revision) throw Error('Wall adjustments changed before commit. Your draft and external backup are retained.');
      fs.renameSync(localTemp, current.file); committed = true;
      if (fingerprint(current.file) !== after) warnings.push('Saved, but the source changed immediately afterward. Reload before editing again.');
    } finally {
      if (fs.existsSync(localTemp)) try {fs.unlinkSync(localTemp);} catch (error) {if (!committed) throw error; warnings.push('Saved, but an adjacent transaction file could not be removed: ' + error.message);}
    }
    journal.status = 'committed';
    try {fs.writeFileSync(journalFile, JSON.stringify(journal, null, 2) + '\n');} catch (error) {warnings.push('Saved, but the external backup journal could not be updated: ' + error.message);}
    // Update consumers that already hold the runtime helper, then ensure a later
    // direct require of the authored literal also reads the committed revision.
    try {const helper = this.helper(); helper.setData(clone(data)); delete require.cache[require.resolve(current.file)];} catch (error) {warnings.push('Saved, but an open preview cache could not be refreshed. Reload the panel: ' + error.message);}
    return {revision: after, data: clone(data), result: {saved: true, files: [FILE], backup: directory, ...(warnings.length ? {warning: warnings.join(' ')} : {})}};
  }
}
module.exports = {Service, FILE, readSource, literal, retainUnknown, load: (root, request) => new Service(root).load(request), preview: (root, request) => new Service(root).preview(request), save: (root, request) => new Service(root).save(request)};
