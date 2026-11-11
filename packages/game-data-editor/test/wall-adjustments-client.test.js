'use strict';
// Real client event handlers with a deterministic DOM and detached artwork.
// Native rendering is verified separately; no scene, game or audio is started.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const {createRequire} = require('node:module');
const ActualRenderer = require('../preview/spine-renderer');
const clone = value => JSON.parse(JSON.stringify(value));
const file = path.resolve(__dirname, '../walls/client.js');
const IDS = ['wall/gateway/left', 'door/far', 'door/near', 'wall/gateway/right'];
const labels = ['Far pillar', 'Far door', 'Near door', 'Near pillar'];
const base = {'wall/gateway/left': {x: -70, y: 0}, 'door/far': {x: -25, y: 0}, 'door/near': {x: 25, y: 0}, 'wall/gateway/right': {x: 70, y: 0}};
const key = selection => `${selection.tier}/${selection.face}/${selection.state}`;

class Element {
  constructor(tag) {this.tagName = tag.toUpperCase(); this.children = []; this.style = {}; this.attributes = {}; this.value = ''; this.className = ''; this._text = ''; this.captured = new Set(); this.width = 700; this.height = 500; this.clientWidth = 700; this.clientHeight = 500; this.classList = {add: name => {this.className = [...new Set(this.className.split(' ').filter(Boolean).concat(name))].join(' ');}, remove: name => {this.className = this.className.split(' ').filter(value => value !== name).join(' ');}};}
  set textContent(value) {for (const c of this.children) c.parentNode = null; this.children = []; this._text = String(value);}
  get textContent() {return this._text + this.children.map(c => c.textContent).join('');}
  appendChild(child) {this.children.push(child); child.parentNode = this; return child;}
  removeChild(child) {this.children.splice(this.children.indexOf(child), 1); child.parentNode = null;}
  remove() {if (this.parentNode) this.parentNode.removeChild(this);}
  setAttribute(name, value) {this.attributes[name] = String(value);}
  getAttribute(name) {return this.attributes[name];}
  focus() {this.focused = true;}
  getBoundingClientRect() {return {left: 0, top: 0, x: 0, y: 0, width: 700, height: 500};}
  setPointerCapture(id) {this.captured.add(id);}
  hasPointerCapture(id) {return this.captured.has(id);}
  releasePointerCapture(id) {this.captured.delete(id);}
  getContext() {return {setTransform() {}, clearRect() {}, setLineDash() {}, strokeRect() {}};}
}
function all(parent, predicate) {const result = []; for (const child of parent.children) {if (predicate(child)) result.push(child); result.push(...all(child, predicate));} return result;}
function row(client, id) {return all(client._elements.list, element => element.getAttribute('data-piece-id') === id)[0];}
function event(values) {return {button: 0, pointerId: 7, preventDefault() {this.prevented = true;}, ...values};}
const wait = () => new Promise(resolve => setTimeout(resolve, 5));

function backend() {
  let saved = {version: 1, poses: {}, FutureData: {keep: ['exact']}}, revision = 'revision-1', writes = 0;
  const calls = [], delayed = new Map(); let conflict = false, warning = '';
  function preview(request) {
    const selection = {tier: request.tier, face: request.face, state: request.state}, data = clone(request.data), poseKey = key(selection);
    const edit = request.edit;
    if (edit) {
      const pose = data.poses[poseKey] || (data.poses[poseKey] = {offsets: {}});
      if (edit.type === 'move') {if (!IDS.includes(edit.id) || !Number.isFinite(edit.x) || !Number.isFinite(edit.y)) throw Error('Invalid move'); if (edit.x || edit.y) pose.offsets[edit.id] = {x: edit.x, y: edit.y}; else delete pose.offsets[edit.id];}
      else if (edit.type === 'reorder') {assert.deepEqual(edit.order.slice().sort(), IDS.slice().sort()); pose.order = edit.order.slice();}
      else if (edit.type === 'reset-piece') delete pose.offsets[edit.id];
      else if (edit.type === 'reset-pose') delete data.poses[poseKey];
      else throw Error('Unknown edit');
      if (data.poses[poseKey] && !Object.keys(pose.offsets).length && !pose.order) delete data.poses[poseKey];
    }
    const pose = data.poses[poseKey] || {}, order = pose.order || IDS, sign = ['NW', 'SE'].includes(selection.face) ? -1 : 1;
    const pieces = order.map(id => ({id, label: labels[IDS.indexOf(id)], slots: ['slot:' + id], offset: clone((pose.offsets || {})[id] || {x: 0, y: 0}), position: {...base[id]}}));
    const description = {x: 0, y: 0, scaleX: sign, scaleY: 1, rotation: 0, animation: (selection.state === 'closed' ? 'idle' : 'open_' + selection.state) + (request.night ? '_night' : ''), pieces};
    return {data, selection, pieces, descriptions: [description], runtimePath: 'not-a-runtime', sourceRevision: 'preview-only-revision'};
  }
  async function ipc(name, request) {
    calls.push({name, request: clone(request || {})});
    if (name === 'wall-adjustments-load') {const selection = {tier: 1, face: 'NW', state: 'closed'}; return {revision, data: clone(saved), selection, preview: preview({...selection, data: saved})};}
    if (name === 'wall-adjustments-preview') {if (delayed.has(String(request.tier))) return new Promise(resolve => delayed.get(String(request.tier)).push(() => resolve(preview(request)))); return preview(request);}
    if (name === 'wall-adjustments-save') {if (conflict || request.revision !== revision) throw Error('Shared source changed'); const same = JSON.stringify(saved) === JSON.stringify(request.data); if (!same) {saved = clone(request.data); writes++; revision = 'revision-' + (writes + 1);} return {revision, data: clone(saved), result: {saved: !same, files: same ? [] : ['shared-script'], warning}};}
    throw Error('Unexpected IPC: ' + name);
  }
  return {ipc, calls, delayed, get saved() {return saved;}, get writes() {return writes;}, set conflict(value) {conflict = value;}, set warning(value) {warning = value;}};
}

function renderer() {
  const value = {...ActualRenderer};
  value.createLayers = async (_spine, descriptions) => descriptions.map(description => {
    const slots = description.pieces.map(piece => {
      const p = base[piece.id], x = p.x + piece.offset.x / description.scaleX, y = p.y + piece.offset.y;
      const attachment = {x: x * 2, y: y * 2, width: 24, height: 24, updateOffset() {}};
      return {data: {name: piece.slots[0]}, bone: {a: .5, b: 0, c: 0, d: .5}, getAttachment: () => attachment};
    });
    return {description, data: {findAnimation: () => ({duration: .3333})}, skeleton: {slots, findSlot: name => slots.find(slot => slot.data.name === name)}};
  });
  value.seek = () => {};
  value.geometry = (_spine, layer) => layer.skeleton.slots.map(slot => {const a = slot.getAttachment(), x = a.x / 2, y = a.y / 2; return {slot: slot.data.name, vertices: [x - 6, y - 6, x - 6, y + 6, x + 6, y + 6, x + 6, y - 6]};});
  value.bounds = (spine, layers) => {const points = layers.flatMap(layer => value.geometry(spine, layer).flatMap(g => Array.from({length: g.vertices.length / 2}, (_, i) => value.transformPoint(layer.description, g.vertices[i * 2], g.vertices[i * 2 + 1])))); const xs = points.map(p => p.x), ys = points.map(p => p.y), minX = Math.min(...xs) - 5, maxX = Math.max(...xs) + 5, minY = Math.min(...ys) - 5, maxY = Math.max(...ys) + 5; return {minX, maxX, minY, maxY, width: maxX - minX, height: maxY - minY};};
  value.hitTest = (spine, layers, point) => {for (const layer of layers.slice().reverse()) for (const g of value.geometry(spine, layer).reverse()) {const a = value.transformPoint(layer.description, g.vertices[0], g.vertices[1]), b = value.transformPoint(layer.description, g.vertices[4], g.vertices[5]); if (point.x >= Math.min(a.x, b.x) && point.x <= Math.max(a.x, b.x) && point.y >= Math.min(a.y, b.y) && point.y <= Math.max(a.y, b.y)) return {layer, slot: g.slot};} return null;};
  value.drawWorld = () => {};
  return value;
}

async function fixture() {
  const api = backend(), parent = new Element('main'), listeners = new Map(), render = renderer();
  const context = vm.createContext({document: {createElement: tag => new Element(tag)}, window: {devicePixelRatio: 1, addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener: name => listeners.delete(name)}, setTimeout, clearTimeout, console});
  const module = {exports: {}}, local = createRequire(file), wrapper = vm.runInContext('(function(require,module,exports,__dirname){\n' + fs.readFileSync(file, 'utf8') + '\n})', context, {filename: file});
  wrapper(local, module, module.exports, path.dirname(file));
  const client = module.exports.mount(parent, {ipc: api.ipc, renderer: render, runtime: {}, requestAnimationFrame: cb => setTimeout(cb, 0), cancelAnimationFrame: clearTimeout});
  await client.ready; await wait();
  return {client, api, parent, listeners, render, async settle() {await client.whenIdle(); await wait();}, async select(keyName, v) {const input = client._elements.fields[keyName]; input.value = String(v); await input.onchange(); await this.settle();}, async number(axis, v) {const input = client._elements.fields[axis]; input.value = String(v); await input.onchange(); await this.settle();}};
}
function screen(client, point) {const c = client._state.camera; return {clientX: c.width / 2 + c.pan.x + (point.x - c.cx) * c.scale, clientY: c.height / 2 + c.pan.y - (point.y - c.cy) * c.scale};}
function center(f, id) {const layer = f.client._state.layers[0], slot = layer.skeleton.findSlot('slot:' + id), a = slot.getAttachment(); return f.render.transformPoint(layer.description, a.x / 2, a.y / 2);}

test('wall panel browsing retains all drafts, selects each closed door side and never saves implicitly', async () => {
  const f = await fixture(), {client, api} = f, initial = clone(api.saved);
  assert.equal(client.hasDraft(), false); assert.equal(client._elements.buttons.save.disabled, true);
  assert(row(client, 'door/near') && row(client, 'door/far'), 'Both sides can be selected while closed');
  row(client, 'door/near').onclick(); await f.number('x', 4.25);
  assert.equal(client.hasDraft(), true); assert.equal(client._elements.buttons.save.disabled, false); assert.match(client._elements.badge.textContent, /Unsaved/);
  assert.equal(client._state.revision, 'revision-1', 'Read-only preview revisions cannot replace the loaded Save revision');
  for (const [name, value] of [['tier', 3], ['face', 'SE'], ['state', 'outward'], ['tier', 1], ['face', 'NW'], ['state', 'closed']]) await f.select(name, value);
  row(client, 'door/near').onclick(); assert.equal(client._elements.fields.x.value, '4.25');
  assert.deepEqual(api.saved, initial); assert.equal(api.writes, 0); assert(!api.calls.some(call => call.name.endsWith('-save')));
  await client._elements.buttons.undo.onclick(); await f.settle(); assert.equal(client.hasDraft(), false);
  await client._elements.buttons.redo.onclick(); await f.settle(); assert.equal(client.hasDraft(), true);
  api.warning = 'Source committed; refresh the imported cache.';
  await client._elements.buttons.save.onclick(); await f.settle(); assert.equal(api.writes, 1); assert.equal(client.hasDraft(), false); assert.equal(client._state.revision, 'revision-2'); assert.match(client._elements.status.textContent, /Source committed/); assert.equal(client._state.error, '', 'A post-commit warning is a completed Save, not an unsaved conflict');
  await client._elements.buttons.save.onclick(); assert.equal(api.writes, 1); assert.equal(api.calls.filter(call => call.name.endsWith('-save')).length, 1, 'No-op Save has no IPC');
  client.destroy(); assert.equal(f.parent.children.length, 0); assert.equal(f.listeners.size, 0);
});

test('numeric validation, hierarchy order, resets, conflict and discard are explicit draft operations', async () => {
  const f = await fixture(), {client, api} = f;
  row(client, 'door/near').onclick(); await f.number('x', 3);
  await f.number('y', 'bad'); assert.equal(client._elements.buttons.save.disabled, true); assert.match(client._elements.status.textContent, /finite/);
  await f.number('y', -2); assert.equal(client._elements.buttons.save.disabled, false);
  await client._elements.buttons.front.onclick(); await f.settle(); assert.equal(client._state.pieces.at(-1).id, 'door/near'); assert.equal(client._elements.list.children[0].getAttribute('data-piece-id'), 'door/near');
  await client._elements.buttons.resetPiece.onclick(); await f.settle(); assert.equal(client._elements.fields.x.value, '0'); assert.equal(client._state.pieces.at(-1).id, 'door/near', 'Reset piece retains explicit hierarchy order');
  await client._elements.buttons.resetPose.onclick(); await f.settle(); assert.equal(client.hasDraft(), false);
  row(client, 'door/far').onclick(); await f.number('y', 5); api.conflict = true;
  await client._elements.buttons.save.onclick(); assert.equal(client.hasDraft(), true); assert.equal(api.writes, 0); assert.match(client._elements.status.textContent, /draft is retained/);
  await client._elements.buttons.reload.onclick(); assert.equal(client.hasDraft(), true, 'Reload does not silently discard a dirty draft');
  await client._elements.buttons.discard.onclick(); await f.settle(); assert.equal(client.hasDraft(), false); assert.deepEqual(api.saved.FutureData, {keep: ['exact']});
  client.destroy();
});

test('Save cannot overtake a just-queued numeric edit and lose the newer draft', async () => {
  const f = await fixture(), {client, api} = f;
  row(client, 'door/near').onclick(); await f.number('x', 2);
  client._elements.fields.y.value = '3'; const pending = client._elements.fields.y.onchange();
  assert.equal(client._elements.buttons.save.disabled, true, 'Queueing an edit immediately disables Save');
  await client._elements.buttons.save.onclick(); await pending; await f.settle();
  assert.equal(api.writes, 0); assert.deepEqual(clone(client._state.pieces.find(piece => piece.id === 'door/near').offset), {x: 2, y: 3});
  await client._elements.buttons.save.onclick(); await f.settle(); assert.equal(api.writes, 1); assert.equal(client.hasDraft(), false);
  client.destroy();
});

test('night lighting is a presentation-only toggle retaining selected pose, offsets, drafts and camera', async () => {
  const f = await fixture(), {client, api} = f;
  row(client, 'door/near').onclick(); await f.number('x', 4);
  const data = clone(client._state.data), selection = clone(client._state.selection), camera = clone(client._state.camera), undo = client._state.undo.length;
  client._elements.fields.night.checked = true; await client._elements.fields.night.onchange(); await f.settle();
  assert.equal(client._state.preview.descriptions[0].animation, 'idle_night'); assert.deepEqual(clone(client._state.data), data); assert.deepEqual(clone(client._state.selection), selection); assert.deepEqual(clone(client._state.camera), camera); assert.equal(client._state.selected, 'door/near'); assert.equal(client._state.undo.length, undo); assert.equal(client.hasDraft(), true); assert.equal(api.writes, 0);
  assert.equal(api.calls.at(-1).request.night, true);
  await client._elements.buttons.discard.onclick(); await f.settle(); assert.equal(client._state.night, true); assert.equal(client._state.preview.descriptions[0].animation, 'idle_night'); assert.equal(client.hasDraft(), false);
  client.destroy();
});

test('canvas drags use selected-face right/up units for all mirrored facings and keep the camera fixed', async () => {
  for (const face of ['NW', 'NE', 'SW', 'SE']) {
    const f = await fixture(), {client, api} = f; await f.select('face', face);
    const canvas = client._elements.canvas, p = center(f, 'door/near'), down = screen(client, p), cameraBefore = clone(client._state.camera), draftBefore = clone(client._state.data);
    canvas.onpointerdown(event(down)); assert.equal(client._state.selected, 'door/near');
    const moved = {clientX: down.clientX + 12 * cameraBefore.scale, clientY: down.clientY - 7 * cameraBefore.scale};
    canvas.onpointermove(event(moved)); await wait();
    assert.equal(client._state.drag.delta.x, 12); assert.equal(client._state.drag.delta.y, 7);
    close(center(f, 'door/near').x - p.x, 12); close(center(f, 'door/near').y - p.y, 7);
    assert.deepEqual(clone(client._state.camera), cameraBefore, 'Live geometry does not recenter/rescale the camera');
    assert.deepEqual(clone(client._state.data), draftBefore, 'Pointer movement is visual only until release');
    canvas.onpointerup(event(moved)); await f.settle();
    assert.equal(client._state.undo.length, 1, 'A drag is one undo step'); assert.equal(api.writes, 0);
    assert.deepEqual(clone(client._state.pieces.find(piece => piece.id === 'door/near').offset), {x: 12, y: 7});
    close(center(f, 'door/near').x - p.x, 12); close(center(f, 'door/near').y - p.y, 7);
    assert.deepEqual(clone(client._state.camera), cameraBefore, 'A validated edit also retains the current camera');
    client.destroy();
  }
});

function close(a, b) {assert(Math.abs(a - b) < 1e-6, `${a} != ${b}`);}

test('pan, zoom, cancelled gestures and hierarchy drag preserve source until Save', async () => {
  const f = await fixture(), {client, api} = f, canvas = client._elements.canvas, initial = clone(client._state.data);
  const p = screen(client, center(f, 'door/far'));
  canvas.onpointerdown(event(p)); canvas.onpointermove(event({clientX: p.clientX + 50, clientY: p.clientY + 25})); canvas.onpointercancel(); await f.settle();
  assert.deepEqual(clone(client._state.data), initial); assert.equal(client._state.undo.length, 0);
  canvas.onpointerdown(event({button: 1, clientX: 300, clientY: 200})); canvas.onpointermove(event({clientX: 340, clientY: 170})); canvas.onpointerup(event({clientX: 340, clientY: 170})); await wait();
  assert.deepEqual(clone(client._state.pan), {x: 40, y: -30});
  canvas.onwheel(event({clientX: 350, clientY: 250, deltaY: -200})); await wait(); assert(client._state.zoom > 1);
  assert.deepEqual(clone(client._state.data), initial); assert.equal(client._elements.buttons.save.disabled, true);
  row(client, 'door/near').ondragstart(event({dataTransfer: {setData() {}}})); row(client, 'door/far').ondrop(event({})); await f.settle();
  assert.deepEqual(clone(client._state.data), initial); assert.equal(client._elements.buttons.save.disabled, true, 'Dropping into the same hierarchy position creates no override');
  const near = row(client, 'door/near'), far = row(client, 'door/far'); far.ondragstart(event({dataTransfer: {setData() {}}})); near.ondrop(event({})); await f.settle();
  const order = client._state.pieces.map(piece => piece.id); assert.deepEqual(order, ['wall/gateway/left', 'door/near', 'door/far', 'wall/gateway/right'], 'Hierarchy row drop changes the actual front/back order');
  assert.equal(api.writes, 0); client.destroy();
});

test('late preview responses and closing cannot replace a newer view or recreate the panel', async () => {
  const f = await fixture(), {client, api} = f;
  api.delayed.set('2', []); api.delayed.set('3', []);
  client._elements.fields.tier.value = '2'; const old = client._elements.fields.tier.onchange();
  client._elements.fields.tier.value = '3'; const current = client._elements.fields.tier.onchange();
  api.delayed.get('3').shift()(); await current; await wait(); assert.equal(client._state.preview.selection.tier, 3);
  api.delayed.get('2').shift()(); await old; assert.equal(client._state.preview.selection.tier, 3);
  client._elements.fields.tier.value = '2'; const late = client._elements.fields.tier.onchange(); client.destroy(); api.delayed.get('2').shift()(); await late;
  assert.equal(f.parent.children.length, 0); assert.equal(client._state.layers.length, 0); assert.equal(f.listeners.size, 0); assert.equal(api.writes, 0);
});

test('Wall adjustments is a dedicated dockable panel with explicit client cleanup', () => {
  const packageDir = path.resolve(__dirname, '../../hkd-wall-adjustments'), manifest = JSON.parse(fs.readFileSync(path.join(packageDir, 'package.json')));
  assert.equal(manifest.name, 'hkd-wall-adjustments'); assert.equal(manifest.panel.type, 'dockable'); assert.equal(manifest.panel.title, 'Wall adjustments');
  const panelFile = path.resolve(__dirname, '../walls/panel.js'), module = {exports: {}}, calls = [], Client = {style: 'wall-style', mount: (_host, options) => {calls.push(options); return {focus() {calls.push('focus');}, destroy() {calls.push('destroy');}};}};
  const context = vm.createContext({Editor: {Panel: {extend: value => value}, Ipc: {sendToMain() {}}}, Promise, Error});
  const wrap = vm.runInContext('(function(require,module,exports){\n' + fs.readFileSync(panelFile, 'utf8') + '\n})', context, {filename: panelFile}); wrap(() => Client, module, module.exports);
  const panel = module.exports.create(); panel.$host = new Element('main'); panel.ready(); panel.run(); panel.close();
  assert.equal(typeof calls[0].ipc, 'function'); assert.deepEqual(calls.slice(1), ['focus', 'destroy']); assert.equal(panel._wallClient, null);
});
