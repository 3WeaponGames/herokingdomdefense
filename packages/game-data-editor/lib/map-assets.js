'use strict';

// Read-only prefab inspection and draft edit helpers. This module never writes an asset.
const fs = require('fs');
const path = require('path');
const url = require('url');
const crypto = require('crypto');
const Catalog = require('./map-catalog');
const IDS = Catalog.IDS;
const OBSTACLE = '18fdaVPwQRBIrhl5kY8QMeg';
const PHYSICS = ['cc.PhysicsPolygonCollider', 'cc.PhysicsBoxCollider', 'cc.PhysicsCircleCollider'];
const identity = [1, 0, 0, 1, 0, 0];
const copy = value => JSON.parse(JSON.stringify(value));
const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
const valueOf = document => document && own(document, 'data') ? document.data : document;
function fileFor(id) {
    if (IDS.indexOf(id) < 0) throw new Error('Unknown runtime map: ' + id);
    return 'assets/KinghtFallIconMap/' + id + '.prefab';
}
function read(root, file) { return JSON.parse(fs.readFileSync(path.join(root, file), 'utf8').replace(/^\uFEFF/, '')); }
function loadMap(root, id) { const file = fileFor(id); return { path: file, data: read(root, file) }; }
function stagesFor(id, documents) {
    const result = [];
    ['A', 'B', 'D'].forEach(variant => {
        const data = valueOf(documents && documents[variant]);
        (data && data.LevelCfg || []).forEach(stage => {
            if (stage.prefab === id) result.push({ variant, level: stage.Level, name: stage.Name });
        });
    });
    return result;
}
function assetIndex(root, wanted) {
    const textures = {}, frames = {}, result = {};
    function walk(directory) {
        fs.readdirSync(directory, { withFileTypes: true }).forEach(entry => {
            const file = path.join(directory, entry.name);
            if (entry.isDirectory()) return walk(file);
            const textureMeta = /\.(png|jpe?g|webp)\.meta$/i.test(entry.name);
            if (!textureMeta && !/\.plist\.meta$/i.test(entry.name)) return;
            let meta;
            try { meta = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (_) { return; }
            if (textureMeta && meta.uuid) textures[meta.uuid] = { file: file.slice(0, -5), width: meta.width, height: meta.height };
            Object.keys(meta.subMetas || {}).forEach(key => {
                const frame = meta.subMetas[key];
                if (frame.uuid && (!wanted || wanted.has(frame.uuid))) frames[frame.uuid] = frame;
            });
        });
    }
    walk(path.join(root, 'assets'));
    Object.keys(frames).forEach(id => {
        const frame = frames[id], texture = textures[frame.rawTextureUuid], file = texture && texture.file;
        if (!file || !fs.existsSync(file)) return;
        result[id] = { url: url.pathToFileURL(file).href, x: frame.trimX || 0, y: frame.trimY || 0,
            width: frame.width, height: frame.height, rawWidth: frame.rawWidth, rawHeight: frame.rawHeight,
            offsetX: frame.offsetX || 0, offsetY: frame.offsetY || 0, rotated: !!frame.rotated, textureWidth: texture.width || 0, textureHeight: texture.height || 0 };
    });
    return result;
}
function indexSources(root, documents, extraFrames) {
    const wanted = new Set(extraFrames || []), maps = IDS.map(id => {
        const data = loadMap(root, id).data;
        data.forEach(component => { if (component && component._spriteFrame) wanted.add(component._spriteFrame.__uuid__); });
        return { id, name: Catalog.maps[id].name, path: fileFor(id), stages: stagesFor(id, documents), data };
    });
    const images = assetIndex(root, wanted);
    const entries = maps.map(map => {
        const used = {};
        map.data.forEach(component => { const id = component && component._spriteFrame && component._spriteFrame.__uuid__; if (id && images[id]) used[id] = images[id]; });
        return { id: map.id, name: map.name, path: map.path, stages: map.stages, images: used };
    });
    return { maps: entries, images };
}
function loadIndex(root, documents) { return indexSources(root, documents).maps; }
function multiply(a, b) {
    return [a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1],
        a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3],
        a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5]];
}
function inverse(m) {
    const d = m[0] * m[3] - m[1] * m[2];
    if (!Number.isFinite(d) || Math.abs(d) < 1e-12) throw new Error('A map node has zero scale.');
    return [m[3] / d, -m[1] / d, -m[2] / d, m[0] / d, (m[2] * m[5] - m[3] * m[4]) / d, (m[1] * m[4] - m[0] * m[5]) / d];
}
function point(m, p) { return { x: m[0] * p.x + m[2] * p.y + m[4], y: m[1] * p.x + m[3] * p.y + m[5] }; }
function transform(node) {
    const trs = node._trs && node._trs.array || [0, 0, 0, 0, 0, 0, 1, 1, 1, 1];
    const x = trs[0], y = trs[1], sx = trs[7], sy = trs[8];
    const angle = 2 * Math.atan2(trs[5], trs[6]), cosine = Math.cos(angle), sine = Math.sin(angle);
    return [cosine * sx, sine * sx, -sine * sy, cosine * sy, x, y];
}
function reference(ref) { return ref && Number.isInteger(ref.__id__) ? ref.__id__ : null; }
function components(data, node) { return (node._components || []).map(reference).filter(id => id !== null).map(id => ({ id, value: data[id] })).filter(item => item.value); }
function colliderPoints(collider) {
    const offset = collider._offset || collider.offset || { x: 0, y: 0 };
    let points = collider.points;
    const size = collider._size || collider.size;
    const radius = collider._radius === undefined ? collider.radius : collider._radius;
    if (!points && size) points = [{ x: -size.width / 2, y: -size.height / 2 }, { x: size.width / 2, y: -size.height / 2 }, { x: size.width / 2, y: size.height / 2 }, { x: -size.width / 2, y: size.height / 2 }];
    if (!points && radius) {
        points = [];
        for (let i = 0; i < 16; i++) points.push({ x: Math.cos(i * Math.PI / 8) * radius / Math.cos(Math.PI / 16), y: Math.sin(i * Math.PI / 8) * radius / Math.cos(Math.PI / 16) });
    }
    return (points || []).map(p => ({ x: p.x + (offset.x || 0), y: p.y + (offset.y || 0) }));
}
function model(data) {
    if (!Array.isArray(data)) throw new Error('Expected a serialized Cocos prefab.');
    const rootId = data[0] && reference(data[0].data), nodes = [], byId = {}, roots = {}, visiting = new Set();
    data.forEach((node, id) => { if (node && node.__type__ === 'cc.Node') {
        const entry = { id, name: node._name || 'Node', parent: reference(node._parent), children: (node._children || []).map(reference),
            width: node._contentSize && node._contentSize.width || 0, height: node._contentSize && node._contentSize.height || 0,
            anchor: node._anchorPoint || { x: 0.5, y: 0.5 }, source: node, components: components(data, node), kind: 'scenery' };
        nodes.push(entry); byId[id] = entry;
    } });
    function visit(node) {
        if (node.matrix) return;
        if (visiting.has(node.id)) throw new Error('Map hierarchy contains a cycle.');
        visiting.add(node.id);
        const parent = byId[node.parent];
        if (parent) visit(parent);
        node.matrix = multiply(parent ? parent.matrix : identity, transform(node.source));
        node.active = node.source._active !== false && (!parent || parent.active);
        node.path = (parent ? parent.path + '/' : '') + node.name;
        node.layer = parent && parent.id !== rootId ? parent.layer : node.name;
        visiting.delete(node.id);
    }
    nodes.forEach(visit);
    (byId[rootId] ? byId[rootId].children : []).forEach(id => { if (byId[id]) roots[byId[id].name] = id; });
    const main = byId[roots.ndMain], mainInverse = main ? inverse(main.matrix) : identity;
    const registered = new Set(), owners = [];
    function addTree(id, owner) {
        const node = byId[id]; if (!node || registered.has(id)) return;
        registered.add(id); node.owner = owner;
        node.children.forEach(child => addTree(child, owner));
    }
    (main ? main.children : []).forEach(id => {
        const node = byId[id]; if (!node) return;
        const obstacle = node.components.find(c => c.value.__type__ === OBSTACLE);
        const building = node.components.find(c => Number.isInteger(c.value.ID) && c.value.ndAniMain);
        if (obstacle || building) {
            node.kind = obstacle ? 'obstacle' : 'building'; node.ownerComponent = (obstacle || building).id;
            node.slot = building && building.value.ID;
            owners.push(node); addTree(id, node.id);
            (building && building.value.ndAniOther || []).forEach(ref => {
                const part = data[reference(ref)]; addTree(part && part.__type__ === 'cc.Node' ? reference(ref) : part && reference(part.node), node.id);
            });
        }
    });
    const colliders = [], sprites = [], routes = [];
    nodes.forEach(node => {
        node.world = multiply(mainInverse, node.matrix); node.position = point(node.world, { x: 0, y: 0 });
        if (/^ndEnemy\d+$/.test(node.name) && node.parent === roots.ndPath) { node.kind = 'spawn'; node.lane = Number(node.name.slice(7)); }
        if (node.name === 'ndStar' && node.parent === roots.ndPath) node.kind = 'hero';
        if (node.parent === rootId) node.kind = 'layer';
        const rigid = node.components.find(c => c.value.__type__ === 'cc.RigidBody');
        node.components.forEach(component => {
            const value = component.value;
            if (PHYSICS.indexOf(value.__type__) >= 0) {
                const sensor = !!(value.sensor || value._sensor), enabled = value._enabled !== false;
                const active = node.active && enabled && !sensor && (!rigid || rigid.value._active !== false && rigid.value._enabled !== false);
                colliders.push({ id: component.id, node: node.id, type: value.__type__, active, enabled, sensor,
                    registered: registered.has(node.id), owner: node.owner, points: colliderPoints(value).map(p => point(node.world, p)), source: value });
            }
            if (value.__type__ === 'cc.Sprite' && value._spriteFrame) sprites.push({ id: component.id, node: node.id, frame: value._spriteFrame.__uuid__, enabled: value._enabled !== false });
            if (Array.isArray(value.ndLockList) && !value.ndAniMain && (value.ndBuildList || []).every(Number.isInteger)) {
                node.kind = 'route'; routes.push({ id: component.id, node: node.id, active: node.active, lanes: value.ndLockList, buildings: value.ndBuildList || [], points: node.children.filter(id => byId[id]).map(id => point(multiply(mainInverse, byId[id].matrix), { x: 0, y: 0 })) });
            }
        });
    });
    const bg = byId[roots.ndBg], width = bg && bg.width || 1500, height = bg && bg.height || 2668;
    return { root: rootId, roots, nodes, byId, owners, colliders, sprites, routes,
        bounds: { minX: -width / 2, minY: -height / 2, maxX: width / 2, maxY: height / 2 } };
}
function trsEdit(data, nodeId, values, doc) {
    const node = data[nodeId]; if (!node || node.__type__ !== 'cc.Node') throw new Error('Select a map node first.');
    const trs = copy(node._trs || { ctor: 'Float64Array', array: [0, 0, 0, 0, 0, 0, 1, 1, 1, 1], __type__: 'TypedArray' });
    ['x', 'y', 'scaleX', 'scaleY', 'angle'].forEach(key => { if (values[key] !== undefined && !Number.isFinite(values[key])) throw new Error('Transform values must be finite.'); });
    if (values.x !== undefined) trs.array[0] = values.x;
    if (values.y !== undefined) trs.array[1] = values.y;
    if (values.scaleX !== undefined) trs.array[7] = values.scaleX;
    if (values.scaleY !== undefined) trs.array[8] = values.scaleY;
    if (values.angle !== undefined) { const half = values.angle * Math.PI / 360; trs.array[3] = 0; trs.array[4] = 0; trs.array[5] = Math.sin(half); trs.array[6] = Math.cos(half); }
    return { doc, path: [nodeId, '_trs'], value: trs };
}
function moveEdit(data, nodeId, worldPosition, doc) {
    const info = model(data), node = info.byId[nodeId], parent = info.byId[node.parent];
    const local = parent ? point(inverse(parent.world), worldPosition) : worldPosition;
    return trsEdit(data, nodeId, local, doc);
}
function moveObjectEdits(data, nodeId, worldPosition, doc) {
    const info = model(data), node = info.byId[nodeId];
    if (!node) throw new Error('Select a map node first.');
    const roots = new Set([nodeId]);
    if (node.kind === 'building') {
        const component = data[node.ownerComponent];
        const layers = new Set([info.roots.ndMain, info.roots.ndDown, info.roots.ndUI, info.roots.ndTrack]);
        function add(ref) {
            let id = reference(ref), value = data[id];
            if (value && value.__type__ !== 'cc.Node') id = reference(value.node);
            let part = info.byId[id];
            while (part && !layers.has(part.parent)) part = info.byId[part.parent];
            if (part && !layers.has(part.id)) roots.add(part.id);
        }
        ['ndLockList', 'ndAniOther', 'ndAniDown', 'ndAniEffect'].forEach(key => {
            const refs = component[key]; (Array.isArray(refs) ? refs : [refs]).filter(Boolean).forEach(add);
        });
        // Mill fields are separate floor sprites in the authored prefabs.
        info.nodes.filter(n => n.parent === info.roots.ndDown && n.name === node.slot + '-td').forEach(n => roots.add(n.id));
    }
    const delta = { x: worldPosition.x - node.position.x, y: worldPosition.y - node.position.y };
    return Array.from(roots).map(id => {
        const p = info.byId[id].position;
        return moveEdit(data, id, { x: p.x + delta.x, y: p.y + delta.y }, doc);
    });
}
function duplicateObstacle(data, nodeId, doc) {
    const info = model(data), original = info.byId[nodeId];
    if (!original || original.kind !== 'obstacle') throw new Error('Only an obstacle owner can be duplicated. Select it in the Obstacles list.');
    const ids = new Set();
    function collect(id) {
        const node = data[id]; if (!node || ids.has(id)) return;
        ids.add(id);
        (node._components || []).forEach(ref => ids.add(reference(ref)));
        if (node._prefab) ids.add(reference(node._prefab));
        (node._children || []).forEach(ref => collect(reference(ref)));
    }
    collect(nodeId);
    const ordered = Array.from(ids).filter(id => id !== null).sort((a, b) => a - b), mapping = {};
    ordered.forEach((id, index) => { mapping[id] = data.length + index; });
    function remap(value) {
        if (!value || typeof value !== 'object') return value;
        if (Array.isArray(value)) return value.map(remap);
        const out = {};
        Object.keys(value).forEach(key => { out[key] = key === '__id__' && own(mapping, value[key]) ? mapping[value[key]] : remap(value[key]); });
        return out;
    }
    const cloned = ordered.map(id => {
        const value = remap(data[id]);
        if (value.__type__ === 'cc.PrefabInfo') value.fileId = crypto.randomBytes(16).toString('hex');
        if (value.__type__ === 'cc.Node') delete value._id;
        return value;
    });
    const clone = cloned[ordered.indexOf(nodeId)];
    clone._name = original.name + ' Copy'; clone._active = true;
    clone._trs = copy(clone._trs || { ctor: 'Float64Array', array: [0, 0, 0, 0, 0, 0, 1, 1, 1, 1], __type__: 'TypedArray' });
    clone._trs.array[0] += 60; clone._trs.array[1] += 60;
    const children = copy(data[original.parent]._children || []);
    children.push({ __id__: mapping[nodeId] });
    // Append instead of replacing the document root: every existing serialized
    // ID remains stable, and the shared Store can apply the batch atomically.
    const edits = cloned.map((value, index) => ({ doc, path: [data.length + index], value }));
    edits.push({ doc, path: [original.parent, '_children'], value: children });
    return { edits, nodeId: mapping[nodeId] };
}
function issuesFor(data, id, documents) {
    const issues = [], doc = 'map:' + id;
    function issue(path, message) { issues.push({ severity: 'error', doc, path, message }); }
    if (!Array.isArray(data)) { issue([], 'Map must be a Cocos prefab array.'); return issues; }
    data.forEach((value, index) => {
        function walk(item, at) {
            if (!item || typeof item !== 'object') return;
            if (own(item, '__id__') && (!Number.isInteger(item.__id__) || !data[item.__id__])) issue(at, 'Broken prefab reference.');
            Object.keys(item).forEach(key => walk(item[key], at.concat(key)));
        }
        walk(value, [index]);
    });
    let info;
    try { info = model(data); } catch (error) { issue([], error.message); return issues; }
    ['ndBg', 'ndDown', 'ndPath', 'ndTrack', 'ndMain', 'ndUI'].forEach(name => { if (info.roots[name] === undefined) issue([], 'Required map layer is missing: ' + name); });
    if (!info.nodes.some(node => node.kind === 'hero')) issue([], 'Hero start ndPath/ndStar is missing.');
    const lanes = new Set(), slots = new Set();
    info.nodes.forEach(node => {
        if (node.kind === 'spawn') { if (lanes.has(node.lane)) issue([node.id, '_name'], 'Duplicate spawn lane ' + node.lane); lanes.add(node.lane); }
        if (node.kind === 'building') { if (slots.has(node.slot)) issue([node.ownerComponent, 'ID'], 'Duplicate building slot ' + node.slot); slots.add(node.slot); }
        const trs = node.source._trs && node.source._trs.array;
        if (trs && (trs.length !== 10 || !trs.every(Number.isFinite))) issue([node.id, '_trs'], 'Transform must contain ten finite values.');
        if (trs && (!trs[7] || !trs[8])) issue([node.id, '_trs'], 'Map transforms cannot have zero scale.');
    });
    if (!slots.has(1)) issue([], 'Castle building slot 1 is missing.');
    info.colliders.forEach(collider => {
        const points = colliderPoints(collider.source);
        if (points.length < 3 || points.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.y))) issue([collider.id], 'Physics shape needs at least three finite points.');
        let area = 0;
        for (let i = 0; i < points.length; i++) { const a = points[i], b = points[(i + 1) % points.length]; area += a.x * b.y - b.x * a.y; }
        if (Math.abs(area) < 0.001) issue([collider.id], 'Physics shape cannot have zero area.');
    });
    info.routes.forEach(route => {
        Array.from(new Set(route.lanes)).forEach(lane => { if (!lanes.has(lane)) issues.push({ severity: route.active ? 'error' : 'warning', doc, path: [route.id, 'ndLockList'], message: 'Route references missing spawn lane ' + lane + (route.active ? '' : ' (inactive route)') }); });
        Array.from(new Set(route.buildings)).forEach(slot => { if (!slots.has(slot)) issues.push({ severity: route.active ? 'error' : 'warning', doc, path: [route.id, 'ndBuildList'], message: 'Route references missing building slot ' + slot + (route.active ? '' : ' (inactive route)') }); });
    });
    ['A', 'B', 'D'].forEach(variant => {
        const cfg = valueOf(documents && documents[variant]);
        (cfg && cfg.LevelCfg || []).forEach((stage, si) => {
            if (stage.prefab !== id) return;
            ['HomeLevel1Unlock', 'HomeLevel2Unlock', 'HomeLevel3Unlock'].forEach(key => {
                (stage[key] || []).forEach((pair, pi) => { if (!slots.has(pair[1])) issues.push({ severity: 'error', doc: variant, path: ['LevelCfg', si, key, pi], message: id + ' has no building slot ' + pair[1] }); });
            });
            (stage.WaveCfg || []).forEach((wave, wi) => (wave.RefreshSoldierKind || []).forEach((group, gi) => {
                const lane = Number(String(group).split('#')[0]);
                if (!lanes.has(lane)) issues.push({ severity: 'error', doc: variant, path: ['LevelCfg', si, 'WaveCfg', wi, 'RefreshSoldierKind', gi], message: id + ' has no spawn lane ' + lane });
            }));
        });
    });
    return issues;
}
function validate(documents, changes, root) {
    let result = [];
    IDS.forEach(id => {
        const document = documents['map:' + id];
        let data = valueOf(document);
        if (!data && root) data = loadMap(root, id).data;
        if (data) result = result.concat(issuesFor(data, id, documents));
    });
    return result;
}
function routeTest(root, data, start, goal, radius, includeBuildings) {
    const info = model(data), Grid = require(path.join(root, 'assets/_script/NavigationGrid.js')).NavigationGrid;
    const polygons = info.colliders.filter(c => c.active && c.registered && (includeBuildings || info.byId[c.owner] && info.byId[c.owner].kind === 'obstacle')).map(c => c.points);
    const grid = new Grid(polygons, info.bounds, 20);
    const pathResult = grid.findPath(start, goal, radius);
    return { path: pathResult, polygons: polygons.length, bounds: info.bounds, note: 'Authored collision state. Battle upgrades can enable different building shapes.' };
}
module.exports = { IDS, OBSTACLE, loadMap, loadIndex, indexSources, stagesFor, model, transform, multiply, inverse, point, colliderPoints,
    trsEdit, moveEdit, moveObjectEdits, duplicateObstacle, validate, issuesFor, routeTest, fileFor };
