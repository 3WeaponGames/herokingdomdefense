'use strict';
const fs = require('fs'), path = require('path');
const Spine = require('../preview/spine-renderer');
const style = fs.readFileSync(path.join(__dirname, 'style.css'), 'utf8');
const clone = value => JSON.parse(JSON.stringify(value));
const stable = value => JSON.stringify(value, (_key, item) => item && typeof item === 'object' && !Array.isArray(item) ? Object.keys(item).sort().reduce((out, key) => {out[key] = item[key]; return out;}, {}) : item);
const node = (tag, text, cls) => {const item = document.createElement(tag); if (text !== undefined) item.textContent = text; if (cls) item.className = cls; return item;};
const faces = ['NW', 'NE', 'SW', 'SE'], states = ['closed', 'inward', 'outward'];
const names = {closed: 'Closed', inward: 'Open inward', outward: 'Open outward'};

function mount(parent, options) {
  options = options || {};
  if (typeof options.ipc !== 'function') throw Error('Wall adjustments require editor IPC.');
  const renderer = options.renderer || Spine, raf = options.requestAnimationFrame || requestAnimationFrame, caf = options.cancelAnimationFrame || cancelAnimationFrame;
  const state = {data: null, baseline: null, revision: null, selection: {tier: 1, face: 'NW', state: 'closed'}, night: false, selected: null,
    preview: null, pieces: [], layers: [], spine: null, loading: true, saving: false, editing: false, closed: false,
    dirty: false, undo: [], redo: [], invalid: new Set(), zoom: 1, pan: {x: 0, y: 0}, camera: null, bounds: null, refit: true, drag: null,
    pending: Promise.resolve(), previewPending: Promise.resolve(), error: '', message: '', rendererReady: false};
  const host = node('section', undefined, 'wall-adjustments'); host.tabIndex = 0; parent.appendChild(host);
  const header = node('header', undefined, 'wall-header'), actions = node('div', undefined, 'wall-actions');
  header.appendChild(node('h2', 'Wall adjustments')); header.appendChild(actions); host.appendChild(header);
  const scope = node('div', 'Changes apply to this tier / facing / state only. Save updates the shared original wall script used by the game and stage editor.', 'wall-scope'); host.appendChild(scope);
  const controls = node('div', undefined, 'wall-view-controls'); host.appendChild(controls);
  const workspace = node('div', undefined, 'wall-workspace'); host.appendChild(workspace);
  const hierarchy = node('aside', undefined, 'wall-hierarchy'); hierarchy.appendChild(node('div', 'Pieces', 'wall-section-title')); hierarchy.appendChild(node('p', 'Front to back · drag rows to reorder.', 'wall-note'));
  const list = node('div', undefined, 'wall-piece-list'); list.setAttribute('role', 'listbox'); list.setAttribute('aria-label', 'Wall piece hierarchy'); hierarchy.appendChild(list); workspace.appendChild(hierarchy);
  const viewport = node('div', undefined, 'wall-canvas-wrap'), canvas = node('canvas'); canvas.tabIndex = 0; canvas.setAttribute('aria-label', 'Wall artwork preview'); viewport.appendChild(canvas);
  viewport.appendChild(node('div', 'Drag a piece · middle-drag or Space-drag to pan · wheel to zoom · arrows nudge · Shift = 5', 'wall-canvas-hint'));
  const loading = node('div', 'Loading wall artwork…', 'wall-canvas-loading'); viewport.appendChild(loading); workspace.appendChild(viewport);
  const inspector = node('aside', undefined, 'wall-inspector'), selectedName = node('h3', 'Select a piece'); inspector.appendChild(selectedName); workspace.appendChild(inspector);
  const footer = node('footer', undefined, 'wall-status'), badge = node('span', 'Saved', 'wall-draft-badge'), status = node('span', '', 'wall-status-message'); footer.appendChild(badge); footer.appendChild(status); host.appendChild(footer);
  const buttons = {}, fields = {};
  let frame = null, previewSequence = 0, draggingRow = null, spaceDown = false, observer;
  const button = (container, text, action, key, cls) => {const item = node('button', text, cls); item.type = 'button'; item.onclick = action; if (key) buttons[key] = item; container.appendChild(item); return item;};
  const select = (label, choices, key) => {const wrap = node('label'), item = node('select'); wrap.appendChild(node('span', label)); item.setAttribute('aria-label', label); for (const choice of choices) {const option = node('option', typeof choice === 'object' ? choice.label : String(choice)); option.value = String(typeof choice === 'object' ? choice.value : choice); item.appendChild(option);} wrap.appendChild(item); controls.appendChild(wrap); fields[key] = item; return item;};
  select('Tier', [1, 2, 3], 'tier'); select('Facing', faces, 'face'); select('Pose', states.map(value => ({value, label: names[value]})), 'state');
  for (const key of ['tier', 'face', 'state']) fields[key].onchange = () => changeView(key, key === 'tier' ? Number(fields[key].value) : fields[key].value);
  const nightLabel = node('label'), nightInput = node('input'); nightInput.type = 'checkbox'; nightInput.setAttribute('aria-label', 'Night lighting'); nightInput.title = 'Lighting preview only · uses the same saved pose'; nightLabel.appendChild(nightInput); nightLabel.appendChild(node('span', 'Night lighting')); controls.appendChild(nightLabel); fields.night = nightInput;
  nightInput.onchange = () => {if (state.saving || state.editing || state.drag || draggingRow) {toolbar(); return;} state.night = !!nightInput.checked; return preview();};
  button(controls, '−', () => zoomAt(.8), 'zoomOut').setAttribute('aria-label', 'Zoom out');
  button(controls, '+', () => zoomAt(1.25), 'zoomIn').setAttribute('aria-label', 'Zoom in');
  button(controls, 'Fit preview', fit, 'fit');
  button(actions, 'Undo', undo, 'undo'); button(actions, 'Redo', redo, 'redo'); button(actions, 'Reload', reload, 'reload');
  button(actions, 'Discard', discard, 'discard'); button(actions, 'Save', save, 'save', 'wall-primary');
  for (const axis of ['x', 'y']) {const wrap = node('label'), input = node('input'); wrap.appendChild(node('span', 'Offset ' + axis.toUpperCase())); input.type = 'number'; input.step = '.25'; input.setAttribute('aria-label', 'Offset ' + axis.toUpperCase()); wrap.appendChild(input); inspector.appendChild(wrap); fields[axis] = input; input.onchange = () => numeric(axis);}
  const ordering = node('div', undefined, 'wall-actions'); inspector.appendChild(ordering);
  button(ordering, 'Bring forward', () => reorder('forward'), 'forward'); button(ordering, 'Send backward', () => reorder('backward'), 'backward');
  button(ordering, 'Bring to front', () => reorder('front'), 'front'); button(ordering, 'Send to back', () => reorder('back'), 'back');
  const resetActions = node('div', undefined, 'wall-actions'); inspector.appendChild(resetActions);
  button(resetActions, 'Reset piece', () => edit({type: 'reset-piece', id: state.selected}), 'resetPiece');
  button(resetActions, 'Reset pose', () => edit({type: 'reset-pose'}), 'resetPose');
  inspector.appendChild(node('p', 'Offsets use game units: +X right, +Y up. Original artwork keeps its size and angle. Reset restores placement and depth for this view.', 'wall-note'));

  function selected() {return state.pieces.find(piece => piece.id === state.selected);}
  function offset(piece) {return piece && piece.offset || {x: 0, y: 0};}
  function busy() {return state.loading || state.saving || state.editing;}
  function message(text, error) {state.message = text || ''; state.error = error ? text : ''; toolbar();}
  function toolbar() {
    if (state.closed) return;
    state.dirty = !!state.data && stable(state.data) !== stable(state.baseline);
    badge.textContent = state.dirty ? 'Unsaved changes' : 'Saved'; badge.className = 'wall-draft-badge' + (state.dirty ? ' dirty' : '');
    status.textContent = state.error || state.message || (state.dirty ? 'Draft only · Save to update the shared original script.' : 'Shared original wall script · no unsaved changes.');
    footer.className = 'wall-status' + (state.error ? ' error' : '');
    buttons.save.disabled = !state.dirty || busy() || state.invalid.size > 0 || !!state.drag;
    buttons.discard.disabled = !state.dirty || state.saving || state.editing;
    buttons.reload.disabled = state.saving || state.editing;
    buttons.undo.disabled = !state.undo.length || busy(); buttons.redo.disabled = !state.redo.length || busy();
    for (const key of ['tier', 'face', 'state']) {fields[key].value = String(state.selection[key]); fields[key].disabled = state.saving || state.editing || !!state.drag || !!draggingRow;}
    fields.night.checked = state.night; fields.night.disabled = state.saving || state.editing || !!state.drag || !!draggingRow;
    const piece = selected(), canEdit = !!piece && !busy() && !state.drag;
    selectedName.textContent = piece ? piece.label || piece.name || piece.id : 'Select a piece';
    for (const axis of ['x', 'y']) {if (!state.invalid.has(axis)) fields[axis].value = piece ? String(Number(offset(piece)[axis] || 0)) : ''; fields[axis].disabled = !canEdit;}
    const index = state.pieces.findIndex(value => value.id === state.selected);
    for (const key of ['forward', 'front']) buttons[key].disabled = !canEdit || index === state.pieces.length - 1;
    for (const key of ['backward', 'back']) buttons[key].disabled = !canEdit || index <= 0;
    buttons.resetPiece.disabled = !canEdit; buttons.resetPose.disabled = busy() || !state.preview;
    loading.hidden = !state.loading; loading.textContent = state.rendererReady ? 'Updating wall artwork…' : 'Loading wall artwork…';
  }
  function rows() {
    list.textContent = '';
    state.pieces.slice().reverse().forEach((piece, index) => {
      const row = node('button', undefined, 'wall-piece-row' + (piece.id === state.selected ? ' selected' : '')); row.type = 'button'; row.draggable = true;
      row.setAttribute('data-piece-id', piece.id); row.setAttribute('role', 'option'); row.setAttribute('aria-selected', String(piece.id === state.selected));
      row.appendChild(node('span', String(index + 1), 'wall-piece-index')); row.appendChild(node('span', piece.label || piece.name || piece.id, 'wall-piece-name'));
      if (piece.modified || Number(offset(piece).x) || Number(offset(piece).y)) row.appendChild(node('span', '•', 'wall-piece-edited'));
      row.onclick = () => choose(piece.id);
      row.ondragstart = event => {if (busy()) {event.preventDefault(); return;} draggingRow = piece.id; if (event.dataTransfer) {event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', piece.id);} row.classList.add('dragging'); toolbar();};
      row.ondragover = event => {if (draggingRow && draggingRow !== piece.id) {event.preventDefault(); row.classList.add('drop-target');}};
      row.ondragleave = () => row.classList.remove('drop-target');
      row.ondragend = () => {draggingRow = null; rows(); toolbar();};
      row.ondrop = event => {event.preventDefault(); row.classList.remove('drop-target'); const id = draggingRow; draggingRow = null; if (!id || id === piece.id) {toolbar(); return;} const front = state.pieces.map(value => value.id).reverse().filter(value => value !== id); front.splice(front.indexOf(piece.id), 0, id); const order = front.reverse(); if (order.every((value, index) => value === state.pieces[index].id)) {rows(); toolbar(); return;} edit({type: 'reorder', order});};
      list.appendChild(row);
    });
  }
  function choose(id) {if (state.drag) return; state.selected = state.pieces.some(piece => piece.id === id) ? id : null; state.invalid.clear(); rows(); toolbar(); draw();}
  async function showPreview(payload, sequence) {
    if (state.closed || sequence !== previewSequence) return;
    const descriptions = payload.descriptions || payload.record && payload.record.skeletons || [];
    if (!descriptions.length) throw Error('The wall preview has no artwork.');
    const spine = options.runtime || require(payload.runtimePath || payload.runtime);
    const layers = await renderer.createLayers(spine, descriptions);
    if (state.closed || sequence !== previewSequence) return;
    for (const layer of layers) {const animation = layer.description.animation || 'idle', clip = layer.data.findAnimation(animation), time = layer.description.poseTime === 'end' && clip ? clip.duration : 0; renderer.seek(spine, [layer], animation, time, false);}
    state.preview = payload; state.pieces = payload.pieces || []; state.spine = spine; state.layers = layers; state.rendererReady = true;
    if (state.refit || !state.bounds) {state.bounds = renderer.bounds(spine, layers); state.refit = false;}
    if (!state.pieces.some(piece => piece.id === state.selected)) state.selected = null;
    state.loading = false; state.error = ''; rows(); toolbar(); draw();
  }
  function preview() {
    if (state.closed || !state.data) return Promise.resolve();
    const sequence = ++previewSequence, selection = clone(state.selection), data = clone(state.data); state.loading = true; toolbar();
    const operation = Promise.resolve(options.ipc('wall-adjustments-preview', {...selection, data, night: state.night})).then(payload => showPreview(payload, sequence)).catch(error => {if (!state.closed && sequence === previewSequence) {state.loading = false; message(error.message, true);}});
    state.previewPending = operation; return operation;
  }
  async function load() {
    const sequence = ++previewSequence; state.loading = true; toolbar();
    try {
      const snapshot = await options.ipc('wall-adjustments-load'); if (state.closed || sequence !== previewSequence) return;
      if (!snapshot || !snapshot.data || !snapshot.revision) throw Error('The shared wall adjustment source could not be loaded.');
      state.revision = snapshot.revision; state.data = clone(snapshot.data); state.baseline = clone(snapshot.data); state.undo = []; state.redo = []; state.invalid.clear(); state.error = ''; state.message = ''; state.refit = true;
      if (snapshot.selection && !state.preview) for (const key of ['tier', 'face', 'state']) if (snapshot.selection[key] !== undefined) state.selection[key] = snapshot.selection[key];
      if (snapshot.preview && !state.night) await showPreview(snapshot.preview, sequence); else await preview();
    } catch (error) {if (!state.closed && sequence === previewSequence) {state.loading = false; message(error.message, true);}}
  }
  function changeView(key, value) {if (state.saving || state.editing || state.drag) return; state.selection = {...state.selection, [key]: value}; state.selected = null; state.invalid.clear(); state.zoom = 1; state.pan = {x: 0, y: 0}; state.refit = true; return preview();}
  function edit(operation, view) {
    if (state.closed || !state.data || state.saving || state.drag) return Promise.resolve();
    const selection = clone(view || state.selection); state.editing = true; toolbar();
    state.pending = state.pending.catch(() => {}).then(async () => {
      if (state.closed) return; const before = clone(state.data); state.editing = true; toolbar();
      try {
        const payload = await options.ipc('wall-adjustments-preview', {...selection, data: clone(state.data), edit: operation, night: state.night}); if (state.closed) return;
        if (!payload || !payload.data) throw Error('The wall edit did not return a validated draft.');
        if (stable(payload.data) !== stable(state.data)) {state.undo.push(before); if (state.undo.length > 100) state.undo.shift(); state.redo = []; state.data = clone(payload.data);}
        state.error = ''; state.message = ''; state.editing = false;
        if (stable(selection) === stable(state.selection)) {const sequence = ++previewSequence; state.loading = true; await showPreview(payload, sequence);} else await preview();
      } catch (error) {if (!state.closed) {state.editing = false; state.loading = false; message(error.message, true);}}
      finally {state.editing = false; toolbar();}
    });
    return state.pending;
  }
  function numeric(axis) {const piece = selected(); if (!piece || busy()) return; const text = fields[axis].value.trim(), value = Number(text); if (!text || !Number.isFinite(value)) {state.invalid.add(axis); message('Enter a finite offset number.', true); return;} state.invalid.delete(axis); const next = {...offset(piece), [axis]: value}; return edit({type: 'move', id: piece.id, x: Number(next.x) || 0, y: Number(next.y) || 0});}
  function reorder(direction) {if (!selected() || busy()) return; const order = state.pieces.map(piece => piece.id), from = order.indexOf(state.selected), target = direction === 'front' ? order.length - 1 : direction === 'back' ? 0 : from + (direction === 'forward' ? 1 : -1); if (target < 0 || target >= order.length || target === from) return; const id = order.splice(from, 1)[0]; order.splice(target, 0, id); return edit({type: 'reorder', order});}
  function history(from, to) {if (busy() || !from.length || state.drag) return; to.push(clone(state.data)); state.data = from.pop(); state.invalid.clear(); state.error = ''; state.message = ''; return preview();}
  function undo() {return history(state.undo, state.redo);}
  function redo() {return history(state.redo, state.undo);}
  async function save() {
    if (!state.dirty || busy() || state.invalid.size || state.drag) return;
    state.saving = true; toolbar();
    try {const snapshot = await options.ipc('wall-adjustments-save', {revision: state.revision, data: clone(state.data)}); if (state.closed) return; state.revision = snapshot.revision; state.data = clone(snapshot.data); state.baseline = clone(snapshot.data); state.undo = []; state.redo = []; state.error = ''; state.message = snapshot.result && snapshot.result.saved ? 'Saved to the shared original wall script.' : 'Already saved · no files written.'; if (snapshot.result && snapshot.result.warning) state.message += ' ' + snapshot.result.warning; state.saving = false; await preview();}
    catch (error) {if (!state.closed) message(error.message + ' Your draft is retained.', true);}
    finally {state.saving = false; toolbar();}
  }
  function reload() {if (state.dirty) {message('Your draft is retained. Use Discard to reload the saved source.', true); return Promise.resolve();} return load();}
  function discard() {if (state.saving || state.editing) return Promise.resolve(); cancelDrag(); return load();}

  function fit() {state.zoom = 1; state.pan = {x: 0, y: 0}; if (state.rendererReady) state.bounds = renderer.bounds(state.spine, state.layers); draw();}
  function dimensions() {const rect = viewport.getBoundingClientRect(); return {width: Math.max(1, rect.width || viewport.clientWidth || 700), height: Math.max(1, rect.height || viewport.clientHeight || 500)};}
  function camera() {const size = dimensions(), bounds = state.bounds || renderer.bounds(state.spine, state.layers), scale = Math.max(.001, Math.min((size.width - 40) / Math.max(1, bounds.width), (size.height - 40) / Math.max(1, bounds.height))) * state.zoom; return {...size, scale, cx: (bounds.minX + bounds.maxX) / 2, cy: (bounds.minY + bounds.maxY) / 2, pan: {...state.pan}};}
  function world(event) {const rect = canvas.getBoundingClientRect(), c = state.camera || camera(); return {x: (event.clientX - rect.left - c.width / 2 - state.pan.x) / c.scale + c.cx, y: -(event.clientY - rect.top - c.height / 2 - state.pan.y) / c.scale + c.cy};}
  function pieceSlots(piece) {return piece.slots || (piece.slot ? [piece.slot] : []);}
  function slotRecords(piece) {const result = []; for (const layer of state.layers) for (const name of pieceSlots(piece)) {const slot = layer.skeleton.findSlot(name); if (slot && slot.getAttachment()) result.push({layer, slot, attachment: slot.getAttachment()});} return result;}
  function hit(event) {if (!state.rendererReady || state.loading) return null; const found = renderer.hitTest(state.spine, state.layers, world(event)); if (!found) return null; return state.pieces.find(piece => pieceSlots(piece).includes(found.slot)) || null;}
  function draw() {if (frame !== null || state.closed) return; frame = raf(() => {frame = null; if (state.closed || !state.rendererReady) return; const c = camera(), ratio = Math.max(1, Math.min(2, window.devicePixelRatio || 1)); state.camera = c; canvas.width = Math.round(c.width * ratio); canvas.height = Math.round(c.height * ratio); const ctx = canvas.getContext('2d'); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.setTransform(ratio * c.scale, 0, 0, -ratio * c.scale, ratio * (c.width / 2 + state.pan.x - c.cx * c.scale), ratio * (c.height / 2 + state.pan.y + c.cy * c.scale)); renderer.drawWorld(state.spine, ctx, state.layers); const piece = selected(); if (piece) {ctx.strokeStyle = '#ffd16b'; ctx.lineWidth = 1.5 / c.scale; ctx.setLineDash([5 / c.scale, 3 / c.scale]); for (const layer of state.layers) for (const g of renderer.geometry(state.spine, layer).filter(g => pieceSlots(piece).includes(g.slot))) {const points = []; for (let i = 0; i < g.vertices.length; i += 2) points.push(renderer.transformPoint(layer.description, g.vertices[i], g.vertices[i + 1])); if (!points.length) continue; const xs = points.map(p => p.x), ys = points.map(p => p.y); ctx.strokeRect(Math.min(...xs), Math.min(...ys), Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));} ctx.setLineDash([]);}});}
  function zoomAt(factor, event) {if (!state.rendererReady || state.drag) return; const before = event ? world(event) : null; state.zoom = Math.max(.2, Math.min(8, state.zoom * factor)); if (before && state.camera) {const next = camera(), rect = canvas.getBoundingClientRect(); state.pan.x = event.clientX - rect.left - next.width / 2 - (before.x - next.cx) * next.scale; state.pan.y = event.clientY - rect.top - next.height / 2 + (before.y - next.cy) * next.scale;} draw();}
  function localDelta(record, start, end) {const a = renderer.inversePoint(record.layer.description, start.x, start.y), b = renderer.inversePoint(record.layer.description, end.x, end.y), bone = record.slot.bone, dx = b.x - a.x, dy = b.y - a.y, det = bone.a * bone.d - bone.b * bone.c; if (Math.abs(det) < 1e-8) throw Error('This piece cannot move in its current pose.'); return {x: (bone.d * dx - bone.b * dy) / det / 2, y: (-bone.c * dx + bone.a * dy) / det / 2};}
  function moveVisual(drag, delta) {for (const record of drag.records) {const a = record.attachment; if (record.vertices) {for (let i = 0; i < a.vertices.length; i += 2) {a.vertices[i] = record.vertices[i] + delta.x * 2; a.vertices[i + 1] = record.vertices[i + 1] + delta.y * 2;}} else {a.x = record.x + delta.x * 2; a.y = record.y + delta.y * 2; if (a.updateOffset) a.updateOffset();}} draw();}
  function cancelDrag() {const drag = state.drag; if (!drag) return; if (drag.kind === 'piece') moveVisual(drag, {x: 0, y: 0}); else state.pan = {...drag.pan}; state.drag = null; if (canvas.hasPointerCapture && canvas.hasPointerCapture(drag.pointerId)) canvas.releasePointerCapture(drag.pointerId); toolbar(); draw();}
  canvas.onpointerdown = event => {if (busy() || !state.rendererReady || state.drag || ![0, 1].includes(event.button)) return; event.preventDefault(); canvas.focus(); const piece = event.button === 0 && !spaceDown && !event.altKey ? hit(event) : null; if (piece) {choose(piece.id); const records = slotRecords(piece).map(record => ({...record, x: record.attachment.x || 0, y: record.attachment.y || 0, vertices: record.attachment.vertices ? Array.from(record.attachment.vertices) : null})); if (!records.length) return; state.drag = {kind: 'piece', pointerId: event.pointerId, start: world(event), records, id: piece.id, offset: {...offset(piece)}, delta: {x: 0, y: 0}, selection: clone(state.selection)};} else state.drag = {kind: 'pan', pointerId: event.pointerId, x: event.clientX, y: event.clientY, pan: {...state.pan}}; if (canvas.setPointerCapture) canvas.setPointerCapture(event.pointerId); toolbar();};
  canvas.onpointermove = event => {const drag = state.drag; if (!drag) {canvas.style.cursor = spaceDown ? 'grab' : hit(event) ? 'move' : 'grab'; return;} if (drag.kind === 'pan') {state.pan = {x: drag.pan.x + event.clientX - drag.x, y: drag.pan.y + event.clientY - drag.y}; draw(); return;} try {const point = world(event), visual = localDelta(drag.records[0], drag.start, point); drag.delta = {x: Math.round((point.x - drag.start.x) * 100) / 100, y: Math.round((point.y - drag.start.y) * 100) / 100}; moveVisual(drag, visual); fields.x.value = String((Number(drag.offset.x) || 0) + drag.delta.x); fields.y.value = String((Number(drag.offset.y) || 0) + drag.delta.y);} catch (error) {cancelDrag(); message(error.message, true);}};
  canvas.onpointerup = event => {const drag = state.drag; if (!drag) return; if (canvas.hasPointerCapture && canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId); state.drag = null; toolbar(); if (drag.kind === 'piece') {moveVisual(drag, {x: 0, y: 0}); if (drag.delta.x || drag.delta.y) return edit({type: 'move', id: drag.id, x: (Number(drag.offset.x) || 0) + drag.delta.x, y: (Number(drag.offset.y) || 0) + drag.delta.y}, drag.selection);} draw();};
  canvas.onpointercancel = cancelDrag; canvas.onwheel = event => {event.preventDefault(); zoomAt(Math.exp(-event.deltaY * .001), event);};
  host.onkeydown = event => {if (['INPUT', 'SELECT', 'TEXTAREA'].includes(String(event.target && event.target.tagName).toUpperCase())) return; if (event.code === 'Space' || event.key === ' ') {spaceDown = true; event.preventDefault(); return;} if (event.key === 'Escape') {cancelDrag(); return;} if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {event.preventDefault(); return event.shiftKey ? redo() : undo();} const directions = {ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1]}, direction = directions[event.key], piece = selected(); if (direction && piece && !busy()) {event.preventDefault(); const step = event.shiftKey ? 5 : 1, current = offset(piece); return edit({type: 'move', id: piece.id, x: (Number(current.x) || 0) + direction[0] * step, y: (Number(current.y) || 0) + direction[1] * step});} if (event.key.toLowerCase() === 'f') {event.preventDefault(); fit();}};
  host.onkeyup = event => {if (event.code === 'Space' || event.key === ' ') spaceDown = false;}; host.onblur = () => {spaceDown = false;};
  const resize = () => draw(); window.addEventListener('resize', resize);
  if (typeof ResizeObserver !== 'undefined') {observer = new ResizeObserver(resize); observer.observe(viewport);}
  toolbar();
  const ready = load(); state.pending = ready;
  return {ready, whenIdle: async () => {await state.pending; await state.previewPending;}, focus() {canvas.focus();}, hasDraft: () => state.dirty,
    destroy() {if (state.closed) return; cancelDrag(); state.closed = true; previewSequence++; if (frame !== null) caf(frame); if (observer) observer.disconnect(); window.removeEventListener('resize', resize); host.onkeydown = host.onkeyup = host.onblur = null; canvas.onpointerdown = canvas.onpointermove = canvas.onpointerup = canvas.onpointercancel = canvas.onwheel = null; state.layers = []; state.preview = null; canvas.width = canvas.height = 1; host.remove();},
    _state: state, _elements: {host, canvas, viewport, list, inspector, buttons, fields, status, badge}, _preview: preview};
}
module.exports = {mount, style};
