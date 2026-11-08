'use strict';

const Maps = require('../lib/map-assets');
const fs = require('fs');
const path = require('path');
const clone = value => JSON.parse(JSON.stringify(value));
function el(tag, text, className) { const node = document.createElement(tag); if (text !== undefined) node.textContent = text; if (className) node.className = className; return node; }
function option(value, title) { const node = el('option', title); node.value = value; return node; }
function button(text, action) { const node = el('button', text); node.type = 'button'; node.onclick = action; return node; }
function mount(container, options) {
    const state = { snapshot: null, maps: [], map: 'Map01', info: null, selected: null, collider: null, images: {}, zoom: 1, panX: 0, panY: 0,
        filter: 'objects', search: '', showArt: true, showShapes: true, showRoutes: true, showDisabled: false, drag: null, route: null, closed: false };
    const root = el('div', undefined, 'hkd-map');
    const style = el('style'); style.textContent = fs.readFileSync(path.join(__dirname, 'style.css'), 'utf8'); root.appendChild(style);
    const toolbar = el('div', undefined, 'map-toolbar');
    const picker = el('select'); picker.title = 'Playable map';
    const fit = button('Fit map', fitMap), art = check('Artwork', true, value => { state.showArt = value; draw(); }), shapes = check('Physics', true, value => { state.showShapes = value; draw(); }), routes = check('Paths', true, value => { state.showRoutes = value; draw(); }), disabled = check('Disabled shapes', false, value => { state.showDisabled = value; draw(); });
    toolbar.appendChild(picker); toolbar.appendChild(fit);
    toolbar.appendChild(button('Reveal prefab', async () => { try { const result = await options.ipc('open-map', state.map); message(result.message || 'Playable prefab selected in Assets.'); } catch (error) { message(error.message || String(error), true); } }));
    [art, shapes, routes, disabled].forEach(node => toolbar.appendChild(node));
    const usage = el('div', '', 'map-usage'), status = el('div', 'Loading map list…', 'map-status');
    const body = el('div', undefined, 'map-body'), left = el('div', undefined, 'map-left'), middle = el('div', undefined, 'map-middle'), right = el('div', undefined, 'map-right');
    const search = el('input'); search.placeholder = 'Find obstacle, slot, spawn…'; search.type = 'search';
    const filter = el('select'); [['objects', 'Map objects'], ['obstacle', 'Obstacles'], ['building', 'Building slots'], ['spawn', 'Spawn points'], ['route', 'Route paths'], ['scenery', 'Scenery sprites'], ['all', 'All nodes']].forEach(pair => filter.appendChild(option(pair[0], pair[1])));
    const list = el('div', undefined, 'map-list'); left.appendChild(search); left.appendChild(filter); left.appendChild(list);
    const canvas = el('canvas'); canvas.tabIndex = 0; canvas.title = 'Click to select. Drag selected objects to move. Middle/right drag pans. Wheel zooms. Physics vertices can be dragged when a collider is selected.';
    const hint = el('div', 'Drag selected objects or collider vertices. Wheel to zoom • Middle/right drag to pan', 'map-canvas-hint');
    middle.appendChild(canvas); middle.appendChild(hint); body.appendChild(left); body.appendChild(middle); body.appendChild(right);
    root.appendChild(toolbar); root.appendChild(usage); root.appendChild(body); root.appendChild(status); container.appendChild(root);
    const context = canvas.getContext('2d');
    let resizeTimer = null;
    function message(text, error) { status.textContent = text; status.className = 'map-status' + (error ? ' error' : ''); }
    function check(label, value, fn) { const wrapper = el('label', undefined, 'map-check'), input = el('input'); input.type = 'checkbox'; input.checked = value; input.onchange = () => fn(input.checked); wrapper.appendChild(input); wrapper.appendChild(el('span', label)); return wrapper; }
    function doc() { return 'map:' + state.map; }
    function data() { const value = state.snapshot && state.snapshot.documents[doc()]; return value && value.data; }
    function currentIndex() { return state.maps.find(item => item.id === state.map); }
    function update(snapshot) {
        if (state.closed || !snapshot) return;
        state.snapshot = snapshot;
        const source = data();
        if (!source) return;
        try {
            state.info = Maps.model(source);
            if (!state.info.byId[state.selected]) state.selected = null;
            renderList(); renderProperties(); updateUsage(); draw();
        } catch (error) { message(error.message, true); }
    }
    async function commit(edits, text) {
        try {
            const snapshot = options.onChange ? await options.onChange(edits) : await options.ipc('change', { version: state.snapshot.version, edits });
            if (snapshot) update(snapshot);
            state.route = null;
            message(text || 'Map change is a draft. Use Save in the panel toolbar to update the game.');
        } catch (error) { message(error.message || String(error), true); draw(); }
    }
    async function selectMap(id) {
        state.map = id; state.selected = null; state.collider = null; state.route = null; picker.value = id;
        message('Loading ' + id + '…');
        try {
            const snapshot = await options.ipc('load-map', { id });
            if (options.onSnapshot) options.onSnapshot(snapshot);
            update(snapshot); fitMap();
            message('Viewing the playable prefab. Nothing is written until Save.');
        } catch (error) { message(error.message || String(error), true); }
    }
    function updateUsage() {
        const usages = Maps.stagesFor(state.map, state.snapshot.documents);
        usage.textContent = 'Shared map • ' + (usages.length ? usages.map(item => item.variant + ': stage ' + item.level).join(' · ') : 'No stage references') + '. Saved edits affect every stage listed.';
    }
    function eligible(node) {
        if (state.search && (node.path + ' ' + (node.slot || '')).toLowerCase().indexOf(state.search) < 0) return false;
        if (state.filter === 'all') return true;
        if (state.filter === 'objects') return ['obstacle', 'building', 'spawn', 'hero', 'route'].indexOf(node.kind) >= 0;
        if (state.filter === 'scenery') return node.kind === 'scenery' && node.components.some(c => c.value.__type__ === 'cc.Sprite');
        return node.kind === state.filter;
    }
    function label(node) {
        if (node.kind === 'building') return 'Slot ' + node.slot + ' · ' + node.name;
        if (node.kind === 'spawn') return 'Lane ' + node.lane;
        if (node.kind === 'hero') return 'Hero start';
        return node.name;
    }
    function select(id, collider) { state.selected = id; state.collider = collider === undefined ? null : collider; renderList(); renderProperties(); draw(); }
    function renderList() {
        list.textContent = '';
        if (!state.info) return;
        state.info.nodes.filter(eligible).forEach(node => {
            const row = button(label(node), () => select(node.id)); row.className = 'map-list-item' + (node.id === state.selected ? ' selected' : '') + (!node.active ? ' inactive' : ''); row.title = node.path;
            row.appendChild(el('small', node.kind + (!node.active ? ' · inactive' : ''))); list.appendChild(row);
        });
    }
    function field(title, value, callback, settings) {
        settings = settings || {};
        const wrapper = el('label', undefined, 'map-field'); wrapper.appendChild(el('span', title));
        const input = el('input'); input.type = 'number'; input.step = settings.step || 'any'; input.value = value;
        if (settings.min !== undefined) input.min = settings.min;
        input.disabled = !!settings.disabled;
        input.onchange = () => { const number = Number(input.value); if (input.value === '' || !Number.isFinite(number)) { message(title + ' needs a finite number.', true); input.value = value; return; } callback(number); };
        wrapper.appendChild(input); return wrapper;
    }
    function group(title) { const section = el('section', undefined, 'map-section'); section.appendChild(el('h3', title)); right.appendChild(section); return section; }
    function renderProperties() {
        right.textContent = '';
        if (!state.info) return;
        const node = state.info.byId[state.selected];
        if (!node) {
            right.appendChild(el('h3', 'Map workspace'));
            right.appendChild(el('p', 'Select an obstacle, building slot, spawn point, path, or sprite to edit it. Changes remain drafts until Save.'));
            right.appendChild(el('p', 'Green shapes are active navigation obstacles. Dashed shapes are disabled, sensors, or outside registered obstacle owners.'));
            renderRouteTools(); renderDiagnostics(); return;
        }
        right.appendChild(el('h3', label(node))); right.appendChild(el('p', node.path, 'map-node-path'));
        const source = node.source, trs = source._trs && source._trs.array || [0, 0, 0, 0, 0, 0, 1, 1, 1, 1];
        const transform = group('Transform');
        [['Local X', 'x', trs[0]], ['Local Y', 'y', trs[1]], ['Rotation °', 'angle', 360 * Math.atan2(trs[5], trs[6]) / Math.PI], ['Scale X', 'scaleX', trs[7]], ['Scale Y', 'scaleY', trs[8]]].forEach(item => transform.appendChild(field(item[0], item[2], value => { const values = {}; values[item[1]] = value; commit([Maps.trsEdit(data(), node.id, values, doc())]); })));
        if (['obstacle', 'scenery'].indexOf(node.kind) >= 0) transform.appendChild(check('Active', source._active !== false, value => commit([{ doc: doc(), path: [node.id, '_active'], value }])));
        if (node.kind === 'obstacle') {
            const actions = group('Obstacle');
            actions.appendChild(button('Duplicate obstacle', () => { try { const result = Maps.duplicateObstacle(data(), node.id, doc()); state.selected = result.nodeId; commit(result.edits, 'Obstacle copy added to the draft. Drag it into place, then Save.'); } catch (error) { message(error.message, true); } }));
            actions.appendChild(button(source._active === false ? 'Restore obstacle' : 'Remove from map', () => commit([{ doc: doc(), path: [node.id, '_active'], value: source._active === false }], 'Obstacle visibility changed in the draft. Undo or Discard restores it.')));
            actions.appendChild(el('p', 'Removal keeps prefab references intact and disables the obstacle. Duplication includes its scenery, physics, and waypoint children.'));
        }
        const colliders = state.info.colliders.filter(c => c.node === node.id || c.owner === node.id);
        if (colliders.length) {
            const section = group('Physics shapes'), chooser = el('select');
            chooser.appendChild(option('', 'Select a collision shape'));
            colliders.forEach(c => chooser.appendChild(option(c.id, '#' + c.id + ' · ' + c.type.replace('cc.Physics', '').replace('Collider', '') + ' · ' + (c.source.tag || 0) + (c.active ? ' active' : ' inactive'))));
            chooser.value = state.collider === null ? '' : state.collider;
            chooser.onchange = () => { state.collider = chooser.value === '' ? null : Number(chooser.value); renderProperties(); draw(); }; section.appendChild(chooser);
            const collider = colliders.find(c => c.id === state.collider);
            if (collider) renderCollider(section, collider);
        }
        const route = state.info.routes.find(r => r.node === node.id);
        if (route) {
            const section = group('Route points'); section.appendChild(el('p', 'Used by lanes ' + route.lanes.join(', ') + (route.buildings.length ? '; building conditions: ' + route.buildings.join(', ') : '; no building condition') + '. Select a point below to move it.'));
            section.appendChild(el('h4', 'Spawn lanes'));
            state.info.nodes.filter(n => n.kind === 'spawn').forEach(spawn => section.appendChild(check('Lane ' + spawn.lane, route.lanes.indexOf(spawn.lane) >= 0, enabled => {
                const values = route.lanes.filter(value => value !== spawn.lane); if (enabled) values.push(spawn.lane);
                commit([{ doc: doc(), path: [route.id, 'ndLockList'], value: values }]);
            })));
            section.appendChild(el('h4', 'Building conditions'));
            section.appendChild(el('p', 'No selected slots means the route has no building condition.'));
            state.info.owners.filter(n => n.kind === 'building').forEach(building => section.appendChild(check('Slot ' + building.slot, route.buildings.indexOf(building.slot) >= 0, enabled => {
                const values = route.buildings.filter(value => value !== building.slot); if (enabled) values.push(building.slot);
                commit([{ doc: doc(), path: [route.id, 'ndBuildList'], value: values }]);
            })));
            section.appendChild(el('h4', 'Waypoints'));
            node.children.forEach((id, index) => { if (state.info.byId[id]) section.appendChild(button((index + 1) + ' · ' + state.info.byId[id].name, () => select(id))); });
        }
        renderRouteTools(); renderDiagnostics();
    }
    function renderCollider(section, collider) {
        section.appendChild(el('p', collider.registered ? 'Registered navigation owner. Building upgrades may switch the enabled shape by tag.' : 'This shape is outside registered navigation owners. It is not used by the path planner.'));
        section.appendChild(check('Enabled', collider.enabled, value => commit([{ doc: doc(), path: [collider.id, '_enabled'], value }])));
        section.appendChild(check('Sensor (does not block navigation)', collider.sensor, value => commit([{ doc: doc(), path: [collider.id, collider.source._sensor !== undefined ? '_sensor' : 'sensor'], value }])));
        const source = collider.source, offsetKey = source._offset ? '_offset' : source.offset ? 'offset' : '_offset', offset = source[offsetKey] || { __type__: 'cc.Vec2', x: 0, y: 0 };
        ['x', 'y'].forEach(axis => section.appendChild(field('Offset ' + axis.toUpperCase(), offset[axis] || 0, value => { const next = clone(offset); next[axis] = value; commit([{ doc: doc(), path: [collider.id, offsetKey], value: next }]); })));
        if (source.points) {
            section.appendChild(el('p', 'Drag the orange vertex handles, or edit local coordinates below.'));
            const table = el('div', undefined, 'map-points');
            source.points.forEach((point, index) => {
                const row = el('div', undefined, 'map-point-row'); row.appendChild(el('span', String(index + 1)));
                ['x', 'y'].forEach(axis => row.appendChild(field(axis.toUpperCase(), point[axis], value => commit([{ doc: doc(), path: [collider.id, 'points', index, axis], value }]))));
                const remove = button('×', () => { const points = clone(source.points); points.splice(index, 1); commit([{ doc: doc(), path: [collider.id, 'points'], value: points }]); }); remove.title = 'Remove vertex'; remove.disabled = source.points.length <= 3; row.appendChild(remove); table.appendChild(row);
            });
            section.appendChild(table);
            section.appendChild(button('Add vertex on final edge', () => { const points = clone(source.points), a = points[points.length - 1], b = points[0]; points.push({ __type__: 'cc.Vec2', x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }); commit([{ doc: doc(), path: [collider.id, 'points'], value: points }]); }));
        } else if (source._size || source.size) {
            const key = source._size ? '_size' : 'size'; ['width', 'height'].forEach(axis => section.appendChild(field(axis, source[key][axis], value => commit([{ doc: doc(), path: [collider.id, key, axis], value }]), { min: 0.001 })));
        } else {
            const key = source._radius === undefined ? 'radius' : '_radius'; section.appendChild(field('Radius', source[key], value => commit([{ doc: doc(), path: [collider.id, key], value }]), { min: 0.001 }));
        }
    }
    function renderRouteTools() {
        const section = group('Check a route'), from = el('select'), to = el('select'), radius = el('input');
        state.info.nodes.filter(node => node.kind === 'spawn' || node.kind === 'hero').forEach(node => from.appendChild(option(node.id, label(node))));
        state.info.nodes.filter(node => node.kind === 'building' || node.kind === 'hero').forEach(node => to.appendChild(option(node.id, label(node))));
        const hero = state.info.nodes.find(node => node.kind === 'hero'); if (hero) to.value = hero.id;
        radius.type = 'number'; radius.value = '12'; radius.min = '0'; radius.max = '200'; radius.title = 'Unit body radius';
        const include = el('input'); include.type = 'checkbox'; include.checked = true; const includeLabel = el('label', undefined, 'map-check'); includeLabel.appendChild(include); includeLabel.appendChild(el('span', 'Include authored building shapes'));
        section.appendChild(el('label', 'From')); section.appendChild(from); section.appendChild(el('label', 'To')); section.appendChild(to); section.appendChild(el('label', 'Unit body radius')); section.appendChild(radius); section.appendChild(includeLabel);
        section.appendChild(button('Test route', async () => {
            try {
                const start = state.info.byId[Number(from.value)], goal = state.info.byId[Number(to.value)], value = Number(radius.value);
                if (!start || !goal || !Number.isFinite(value) || value < 0 || value > 200) throw new Error('Choose endpoints and a radius between 0 and 200.');
                message('Checking authored physics…');
                const result = await options.ipc('map-route', { id: state.map, start: start.position, goal: goal.position, radius: value, includeBuildings: include.checked });
                state.route = result.path;
                message((result.path ? result.path.reached ? 'Route reaches the target.' : 'Route reaches the closest accessible point.' : 'No route for this radius.') + ' ' + result.note); draw();
            } catch (error) { message(error.message || String(error), true); }
        }));
        section.appendChild(el('p', 'Uses the game’s navigation planner with the authored enabled physics. Battle unlocks and upgrades can change building collision state.'));
    }
    function renderDiagnostics() {
        const issues = Maps.issuesFor(data(), state.map, state.snapshot.documents);
        if (!issues.length) return;
        const section = group('Map checks'); issues.slice(0, 10).forEach(issue => section.appendChild(el('p', issue.message, 'map-error')));
    }
    function size() { return { width: Math.max(100, middle.clientWidth), height: Math.max(200, middle.clientHeight) }; }
    function fitMap() {
        if (!state.info) return;
        const box = size(), bounds = state.info.bounds;
        state.zoom = Math.min((box.width - 40) / (bounds.maxX - bounds.minX), (box.height - 40) / (bounds.maxY - bounds.minY));
        state.panX = box.width / 2; state.panY = box.height / 2; draw();
    }
    function screen(point) { return { x: state.panX + point.x * state.zoom, y: state.panY - point.y * state.zoom }; }
    function world(event) { const rect = canvas.getBoundingClientRect(); return { x: (event.clientX - rect.left - state.panX) / state.zoom, y: -(event.clientY - rect.top - state.panY) / state.zoom }; }
    function imageFor(frame) {
        const metadata = currentIndex() && currentIndex().images[frame]; if (!metadata) return null;
        if (!state.images[frame]) { const image = new Image(); state.images[frame] = image; image.onload = draw; image.src = metadata.url; }
        return state.images[frame].complete && state.images[frame].naturalWidth ? { image: state.images[frame], meta: metadata } : null;
    }
    function draw() {
        if (state.closed || !state.info) return;
        const box = size(), ratio = window.devicePixelRatio || 1;
        if (canvas.width !== Math.round(box.width * ratio) || canvas.height !== Math.round(box.height * ratio)) { canvas.width = Math.round(box.width * ratio); canvas.height = Math.round(box.height * ratio); canvas.style.width = box.width + 'px'; canvas.style.height = box.height + 'px'; }
        context.setTransform(ratio, 0, 0, ratio, 0, 0); context.fillStyle = '#171d27'; context.fillRect(0, 0, box.width, box.height);
        context.save(); context.translate(state.panX, state.panY); context.scale(state.zoom, -state.zoom);
        const bounds = state.info.bounds; context.fillStyle = '#263041'; context.fillRect(bounds.minX, bounds.minY, bounds.maxX - bounds.minX, bounds.maxY - bounds.minY);
        if (state.showArt) state.info.sprites.forEach(sprite => {
            const node = state.info.byId[sprite.node]; if (!node.active || !sprite.enabled) return;
            const picture = imageFor(sprite.frame); if (!picture) return;
            context.save(); context.transform.apply(context, node.world); context.scale(1, -1);
            const w = node.width || picture.meta.width, h = node.height || picture.meta.height;
            context.globalAlpha = (node.source._opacity === undefined ? 255 : node.source._opacity) / 255;
            const meta = picture.meta;
            if (!meta.rotated) context.drawImage(picture.image, meta.x, meta.y, meta.width, meta.height, -w * node.anchor.x, -h * (1 - node.anchor.y), w, h);
            else { context.translate(-w * node.anchor.x, -h * (1 - node.anchor.y)); context.translate(w / 2, h / 2); context.rotate(-Math.PI / 2); context.drawImage(picture.image, meta.x, meta.y, meta.height, meta.width, -h / 2, -w / 2, h, w); }
            context.restore();
        });
        if (state.showShapes) state.info.colliders.forEach(collider => {
            if ((!collider.active || !collider.registered) && !state.showDisabled && collider.id !== state.collider) return;
            const selected = collider.id === state.collider, active = collider.active && collider.registered;
            polygon(collider.points, selected ? '#ffbf62' : active ? '#74e9b1' : '#a1a6b3', selected ? 'rgba(255,177,62,.2)' : active ? 'rgba(68,197,147,.12)' : 'rgba(160,160,160,.06)', !active);
        });
        if (state.showRoutes) state.info.routes.forEach(route => { if (route.points.length && (route.active || state.showDisabled)) line(route.points, route.active ? '#6fc9ff' : '#768091', true); });
        if (state.route && state.route.points) line(state.route.points, '#d49bff', false, 4);
        context.strokeStyle = '#64728c'; context.lineWidth = 1 / state.zoom; context.strokeRect(bounds.minX, bounds.minY, bounds.maxX - bounds.minX, bounds.maxY - bounds.minY);
        context.restore();
        state.info.nodes.filter(node => ['building', 'spawn', 'hero'].indexOf(node.kind) >= 0).forEach(node => {
            const p = screen(node.position), selected = node.id === state.selected; context.fillStyle = node.kind === 'building' ? '#ffd67b' : node.kind === 'hero' ? '#d49bff' : '#75c9ff';
            context.beginPath(); context.arc(p.x, p.y, selected ? 8 : 5, 0, Math.PI * 2); context.fill(); context.strokeStyle = '#152033'; context.lineWidth = 2; context.stroke();
            context.font = '12px sans-serif'; context.fillStyle = '#fff'; context.strokeStyle = '#152033'; context.lineWidth = 3; const text = node.kind === 'building' ? String(node.slot) : node.kind === 'hero' ? 'Hero' : 'L' + node.lane; context.strokeText(text, p.x + 8, p.y - 6); context.fillText(text, p.x + 8, p.y - 6);
        });
        const selected = state.info.byId[state.selected];
        if (selected) {
            const p = screen(selected.position); context.strokeStyle = '#ffbf62'; context.lineWidth = 2; context.beginPath(); context.moveTo(p.x - 10, p.y); context.lineTo(p.x + 10, p.y); context.moveTo(p.x, p.y - 10); context.lineTo(p.x, p.y + 10); context.stroke();
            state.info.colliders.filter(c => c.id === state.collider).forEach(c => c.points.forEach((vertex, i) => { const p = screen(vertex); context.fillStyle = '#ffbf62'; context.fillRect(p.x - 4, p.y - 4, 8, 8); context.font = '11px sans-serif'; context.fillText(String(i + 1), p.x + 5, p.y - 4); }));
        }
        function polygon(points, stroke, fill, dashed) { if (!points.length) return; context.beginPath(); points.forEach((p, i) => i ? context.lineTo(p.x, p.y) : context.moveTo(p.x, p.y)); context.closePath(); context.fillStyle = fill; context.fill(); context.strokeStyle = stroke; context.lineWidth = 1.5 / state.zoom; context.setLineDash(dashed ? [5 / state.zoom, 4 / state.zoom] : []); context.stroke(); context.setLineDash([]); }
        function line(points, color, dashed, width) { if (!points.length) return; context.beginPath(); points.forEach((p, i) => i ? context.lineTo(p.x, p.y) : context.moveTo(p.x, p.y)); context.strokeStyle = color; context.lineWidth = (width || 2) / state.zoom; context.setLineDash(dashed ? [6 / state.zoom, 5 / state.zoom] : []); context.stroke(); context.setLineDash([]); }
    }
    function hit(point) {
        let best = null, score = Infinity;
        state.info.nodes.filter(eligible).filter(node => node.kind !== 'layer').forEach(node => {
            const distance = Math.hypot(node.position.x - point.x, node.position.y - point.y);
            if (distance < 18 / state.zoom && distance < score) { best = node; score = distance; }
        });
        if (best) return best;
        const contains = polygon => {
            let inside = false;
            for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) { const a = polygon[i], b = polygon[j]; if ((a.y > point.y) !== (b.y > point.y) && point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x) inside = !inside; }
            return inside;
        };
        state.info.colliders.filter(c => c.registered && c.active && contains(c.points)).forEach(c => { const node = state.info.byId[c.owner]; if (node && eligible(node)) best = node; });
        if (!best && state.filter === 'scenery') state.info.nodes.filter(eligible).some(node => {
            const local = Maps.point(Maps.inverse(node.world), point); if (local.x >= -node.width * node.anchor.x && local.x <= node.width * (1 - node.anchor.x) && local.y >= -node.height * node.anchor.y && local.y <= node.height * (1 - node.anchor.y)) { best = node; return true; } return false;
        });
        return best;
    }
    canvas.onpointerdown = event => {
        if (!state.info) return;
        canvas.setPointerCapture(event.pointerId);
        if (event.button === 1 || event.button === 2) { state.drag = { type: 'pan', x: event.clientX, y: event.clientY, panX: state.panX, panY: state.panY }; event.preventDefault(); return; }
        const p = world(event), collider = state.info.colliders.find(c => c.id === state.collider);
        if (collider && collider.source.points) {
            const vertex = collider.points.findIndex(v => Math.hypot(v.x - p.x, v.y - p.y) < 9 / state.zoom);
            if (vertex >= 0) { state.drag = { type: 'vertex', collider: collider.id, vertex, node: collider.node, original: clone(data()), moved: false }; return; }
        }
        const node = hit(p);
        if (!node) { select(null); return; }
        if (node.id !== state.selected) { select(node.id); return; }
        state.drag = { type: 'node', node: node.id, start: p, position: node.position, original: clone(data()), moved: false };
    };
    canvas.onpointermove = event => {
        const drag = state.drag; if (!drag) return;
        if (drag.type === 'pan') { state.panX = drag.panX + event.clientX - drag.x; state.panY = drag.panY + event.clientY - drag.y; draw(); return; }
        const p = world(event), draft = clone(drag.original); drag.moved = true;
        if (drag.type === 'node') {
            drag.edits = Maps.moveObjectEdits(drag.original, drag.node, { x: drag.position.x + p.x - drag.start.x, y: drag.position.y + p.y - drag.start.y }, doc());
            drag.edits.forEach(edit => { draft[edit.path[0]]._trs = edit.value; });
        } else {
            const original = Maps.model(drag.original), node = original.byId[drag.node], local = Maps.point(Maps.inverse(node.world), p), source = draft[drag.collider], offset = source._offset || source.offset || { x: 0, y: 0 };
            source.points[drag.vertex].x = local.x - (offset.x || 0); source.points[drag.vertex].y = local.y - (offset.y || 0);
            drag.edit = { doc: doc(), path: [drag.collider, 'points', drag.vertex], value: source.points[drag.vertex] };
        }
        state.info = Maps.model(draft); draw();
    };
    canvas.onpointerup = () => { const drag = state.drag; state.drag = null; if (drag && drag.moved && (drag.edits || drag.edit)) commit(drag.edits || [drag.edit]); };
    canvas.onpointercancel = () => { state.drag = null; if (state.snapshot) update(state.snapshot); };
    canvas.oncontextmenu = event => event.preventDefault();
    canvas.onwheel = event => {
        event.preventDefault(); const p = world(event), rect = canvas.getBoundingClientRect(); state.zoom = Math.max(0.04, Math.min(4, state.zoom * Math.exp(-event.deltaY * 0.001))); state.panX = event.clientX - rect.left - p.x * state.zoom; state.panY = event.clientY - rect.top + p.y * state.zoom; draw();
    };
    search.oninput = () => { state.search = search.value.trim().toLowerCase(); renderList(); };
    filter.onchange = () => { state.filter = filter.value; renderList(); };
    picker.onchange = () => selectMap(picker.value);
    function onResize() { clearTimeout(resizeTimer); resizeTimer = setTimeout(draw, 60); }
    window.addEventListener('resize', onResize);
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(onResize) : null; if (observer) observer.observe(middle);
    options.ipc('map-index').then(index => { if (state.closed) return; state.maps = index; index.forEach(map => picker.appendChild(option(map.id, map.name))); return selectMap(state.map); }).catch(error => message(error.message || String(error), true));
    return { update, destroy() { state.closed = true; clearTimeout(resizeTimer); if (observer) observer.disconnect(); window.removeEventListener('resize', onResize); Object.keys(state.images).forEach(key => { state.images[key].onload = null; }); root.remove(); } };
}
module.exports = { mount };
