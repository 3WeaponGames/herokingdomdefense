'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const temporaryProject = require('./owned-temp');
const Maps = require('../lib/map-assets');
const root = path.resolve(__dirname, '../../..');
const clone = value => JSON.parse(JSON.stringify(value));
let passed = 0;
function test(name, fn) { fn(); passed++; console.log('ok - ' + name); }
const documents = {};
[['A', 'KinghtFallConfig'], ['B', 'KinghtFallConfigB'], ['D', 'KinghtFallConfigD']].forEach(pair => { documents[pair[0]] = { data: JSON.parse(fs.readFileSync(path.join(root, 'assets', pair[1], 'GameJsonCfg.json'))) }; });
const hashes = {};
Maps.IDS.forEach(id => { const file = path.join(root, Maps.fileFor(id)); hashes[file] = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'); });
test('runtime maps are inspected without mutations and retain their exact assets', () => {
    Maps.IDS.forEach(id => {
        const source = Maps.loadMap(root, id), before = JSON.stringify(source.data), model = Maps.model(source.data);
        assert(model.nodes.length > 400); assert(model.owners.length > 20); assert(model.colliders.length > 100);
        assert(model.nodes.some(node => node.kind === 'spawn')); assert(model.nodes.some(node => node.kind === 'hero'));
        assert(model.owners.some(node => node.slot === 1));
        assert.deepStrictEqual(Maps.issuesFor(source.data, id, documents).filter(issue => issue.severity === 'error'), []);
        assert.strictEqual(JSON.stringify(source.data), before);
    });
});
test('only allowlisted runtime map paths can be opened', () => {
    assert.throws(() => Maps.loadMap(root, '../../project'), /Unknown runtime map/);
    assert.throws(() => Maps.fileFor('Map1'), /Unknown runtime map/);
});
test('map index resolves actual artwork and shared A/B/D stage usages', () => {
    const index = Maps.loadIndex(root, documents);
    assert.strictEqual(index.length, Maps.IDS.length);
    index.forEach(map => {
        const frames=new Set(Maps.loadMap(root,map.id).data.filter(Boolean).map(component=>component._spriteFrame&&component._spriteFrame.__uuid__).filter(Boolean));
        // Creator's built-in white sprite has no project texture metadata.
        frames.delete('a23235d1-15db-4b95-8439-a2e005bfff91');
        assert(frames.size>0);assert.deepStrictEqual(Object.keys(map.images).sort(),Array.from(frames).sort());
        assert(map.stages.some(stage => stage.variant === 'A'));
        assert(map.stages.some(stage => stage.variant === 'B'));
        assert(map.stages.some(stage => stage.variant === 'D'));
        Object.keys(map.images).forEach(id => assert(/^file:\/\//.test(map.images[id].url)));
    });
});
test('sprite-atlas frame metadata resolves its PNG texture and exact crop',()=>{
    const temporary=temporaryProject('hkd-map-atlas-index-'),frame='generated-frame',texture='generated-texture';
    function write(file,data){const target=path.join(temporary,file);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,JSON.stringify(data));}
    Maps.IDS.forEach(id=>write(Maps.fileFor(id),[{__type__:'cc.Sprite',_spriteFrame:{__uuid__:frame}}]));
    const image=path.join(temporary,'assets/Atlas/terrain.png');fs.mkdirSync(path.dirname(image),{recursive:true});fs.writeFileSync(image,'required atlas fixture');
    write('assets/Atlas/terrain.png.meta',{uuid:texture,importer:'texture',type:'raw',width:256,height:128,subMetas:{}});
    write('assets/Atlas/terrain.plist.meta',{uuid:'atlas-uuid',importer:'sprite-atlas',rawTextureUuid:texture,subMetas:{cliff:{uuid:frame,importer:'sprite-frame',rawTextureUuid:texture,trimX:4,trimY:7,width:11,height:13,rawWidth:15,rawHeight:17,offsetX:2,offsetY:-3}}});
    const index=Maps.loadIndex(temporary,{});index.forEach(map=>{const actual=map.images[frame];assert(actual);assert.strictEqual(require('url').fileURLToPath(actual.url),image);assert.deepStrictEqual([actual.x,actual.y,actual.width,actual.height,actual.rawWidth,actual.rawHeight,actual.offsetX,actual.offsetY,actual.textureWidth,actual.textureHeight],[4,7,11,13,15,17,2,-3,256,128]);});
});

test('local transform edits preserve rotation, scale, and all unrelated fields', () => {
    const source = Maps.loadMap(root, 'Map01').data, model = Maps.model(source), node = model.owners[0], before = clone(source);
    const edit = Maps.trsEdit(source, node.id, { x: 123.456 }, 'map:Map01');
    assert.strictEqual(edit.value.array[0], 123.456);
    assert.deepStrictEqual(edit.value.array.slice(1), node.source._trs.array.slice(1));
    assert.deepStrictEqual(source, before);
    assert.throws(() => Maps.trsEdit(source, node.id, { x: Infinity }, 'map:Map01'), /finite/);
});
test('world dragging correctly converts through translated rotated scaled parents', () => {
    const source = Maps.loadMap(root, 'Map01').data, model = Maps.model(source), node = model.owners[0];
    const parent = node.parent; source[parent]._trs = { array: [50, 80, 0, 0, 0, Math.sin(Math.PI / 4), Math.cos(Math.PI / 4), 2, 3, 1] };
    const child = node.children[0], info = Maps.model(source), initial = info.byId[child].position;
    const target = { x: initial.x + 77, y: initial.y - 31 }, edit = Maps.moveEdit(source, child, target, 'map:Map01');
    source[child]._trs = edit.value;
    const after = Maps.model(source).byId[child].position;
    assert(Math.abs(after.x - target.x) < 1e-8); assert(Math.abs(after.y - target.y) < 1e-8);
});
test('physics preview uses registered owners and ignores sensors/disabled bodies', () => {
    const source = Maps.loadMap(root, 'Map01').data, initial = Maps.model(source), collider = initial.colliders.find(c => c.active && c.registered);
    source[collider.id].sensor = true;
    assert.strictEqual(Maps.model(source).colliders.find(c => c.id === collider.id).active, false);
    delete source[collider.id].sensor;
    source[collider.id]._enabled = false;
    assert.strictEqual(Maps.model(source).colliders.find(c => c.id === collider.id).active, false);
    source[collider.id]._enabled = true;
    const body = source[source[collider.node]._components.find(ref => source[ref.__id__].__type__ === 'cc.RigidBody').__id__];
    body._active = false;
    assert.strictEqual(Maps.model(source).colliders.find(c => c.id === collider.id).active, false);
});
test('collision offsets and conservative circles match navigation geometry', () => {
    assert.deepStrictEqual(Maps.colliderPoints({ points: [{ x: 1, y: 2 }], _offset: { x: 3, y: 4 } }), [{ x: 4, y: 6 }]);
    const circle = Maps.colliderPoints({ _radius: 10 }); assert.strictEqual(circle.length, 16);
    assert(circle.every(point => Math.hypot(point.x, point.y) > 10));
    assert.deepStrictEqual(Maps.colliderPoints({ _size: { width: 4, height: 6 } })[0], { x: -2, y: -3 });
});
test('duplicating an obstacle remaps subtree references and does not mutate the original', () => {
    const source = Maps.loadMap(root, 'Map01').data, before = JSON.stringify(source), original = Maps.model(source).owners.find(node => node.kind === 'obstacle');
    const result = Maps.duplicateObstacle(source, original.id, 'map:Map01'), next = clone(source);
    result.edits.forEach(edit => { if (edit.path.length === 1) next[edit.path[0]] = clone(edit.value); else next[edit.path[0]][edit.path[1]] = clone(edit.value); });
    const info = Maps.model(next), node = info.byId[result.nodeId];
    assert.strictEqual(JSON.stringify(source), before);
    assert.strictEqual(node.kind, 'obstacle'); assert.strictEqual(node.parent, original.parent);
    assert(node.children.every(id => id >= source.length));
    assert(node.components.every(component => component.id >= source.length));
    assert.strictEqual(next[node.ownerComponent].node.__id__, node.id);
    assert.deepStrictEqual(Maps.issuesFor(next, 'Map01', documents).filter(issue => issue.severity === 'error'), []);
    assert.throws(() => Maps.duplicateObstacle(source, info.owners.find(n => n.kind === 'building').id, 'map:Map01'), /Only an obstacle/);
});
test('removing an obstacle is an inactive draft with stable serialized indices', () => {
    const source = Maps.loadMap(root, 'Map01').data, info = Maps.model(source), obstacle = info.owners.find(n => n.kind === 'obstacle'), length = source.length;
    source[obstacle.id]._active = false; const next = Maps.model(source);
    assert.strictEqual(source.length, length); assert(next.colliders.filter(c => c.owner === obstacle.id).every(c => !c.active));
    assert.deepStrictEqual(Maps.issuesFor(source, 'Map01', documents).filter(issue => issue.severity === 'error'), []);
});
test('validation catches broken references, geometry, spawn lanes, and stage slots', () => {
    const source = Maps.loadMap(root, 'Map01').data, info = Maps.model(source), collider = info.colliders[0], docs = clone(documents);
    source[collider.id].points = [{ x: 0, y: 0 }, { x: 1, y: 1 }];
    source[info.owners[0].id]._children.push({ __id__: source.length + 30 });
    delete docs.A.data.LevelCfg[0].WaveCfg[0].SpawnTimeline;
    docs.A.data.LevelCfg[0].WaveCfg[0].RefreshSoldierKind = ['999#90001,5'];
    docs.A.data.LevelCfg[0].HomeLevel1Unlock.push([1, 999]);
    const issues = Maps.issuesFor(source, 'Map01', docs);
    assert(issues.some(i => /Broken prefab reference/.test(i.message))); assert(issues.some(i => /three finite/.test(i.message)));
    assert(issues.some(i => /spawn lane 999/.test(i.message))); assert(issues.some(i => /building slot 999/.test(i.message)));
});
test('map lane validation follows active timed schedules and ignores retained legacy queues', () => {
    const source = Maps.loadMap(root, 'Map01').data, docs = clone(documents), wave = docs.A.data.LevelCfg[0].WaveCfg[0];
    wave.RefreshSoldierKind = ['999#90001,5'];
    assert(!Maps.issuesFor(source, 'Map01', docs).some(i => /spawn lane 999/.test(i.message)));
    wave.SpawnTimeline[0].spawnId = 999;
    const before = JSON.stringify({source,docs}), issues = Maps.issuesFor(source, 'Map01', docs), invalid = issues.find(i => /spawn lane 999/.test(i.message));
    assert(invalid);assert.deepStrictEqual(invalid.path, ['LevelCfg',0,'WaveCfg',0,'SpawnTimeline',0]);
    assert.strictEqual(JSON.stringify({source,docs}), before);
});
test('route checks reuse the game planner and leave prefab bytes untouched', () => {
    const source = Maps.loadMap(root, 'Map01').data, info = Maps.model(source), start = info.nodes.find(n => n.kind === 'hero').position;
    const result = Maps.routeTest(root, source, start, { x: start.x + 5, y: start.y + 5 }, 0, false);
    assert(result.polygons > 0); assert(result.note.indexOf('Authored') >= 0);
});
test('obstacle cloning works through shared draft Store, undo, and explicit save', () => {
    const Store = require('../lib/store').Store;
    const temporary = temporaryProject('hkd-map-test-');
    const paths = ['assets/KinghtFallConfig/GameJsonCfg.json', 'assets/KinghtFallConfigB/GameJsonCfg.json', 'assets/KinghtFallConfigD/GameJsonCfg.json', 'assets/resources/localization/catalog.json', Maps.fileFor('Map01')];
    paths.forEach(file => { fs.mkdirSync(path.dirname(path.join(temporary, file)), { recursive: true }); fs.copyFileSync(path.join(root, file), path.join(temporary, file)); });
    const store = new Store(temporary), original = fs.readFileSync(path.join(temporary, Maps.fileFor('Map01')), 'utf8');
    store.addMap('Map01');
    const source = store.snapshot().documents['map:Map01'].data, obstacle = Maps.model(source).owners.find(node => node.kind === 'obstacle');
    const result = Maps.duplicateObstacle(source, obstacle.id, 'map:Map01');
    store.change({ version: store.version, edits: result.edits });
    assert.strictEqual(fs.readFileSync(path.join(temporary, Maps.fileFor('Map01')), 'utf8'), original);
    assert.strictEqual(Maps.model(store.snapshot().documents['map:Map01'].data).byId[result.nodeId].kind, 'obstacle');
    store.undo({ version: store.version }); assert.strictEqual(store.snapshot().dirty, false);
    store.redo({ version: store.version }); assert.strictEqual(store.snapshot().dirty, true);
    const saved = store.save({ version: store.version }); assert.deepStrictEqual(saved.result.files, [Maps.fileFor('Map01')]);
    const after = JSON.parse(fs.readFileSync(path.join(temporary, Maps.fileFor('Map01')), 'utf8'));
    assert(Maps.model(after).byId[result.nodeId]);
    const before = JSON.parse(original); before.forEach((record, index) => {
        if (index === obstacle.parent) { const next = clone(after[index]); next._children.pop(); assert.deepStrictEqual(next, record); }
        else assert.deepStrictEqual(after[index], record);
    });
});
test('all test operations left live map files byte-identical', () => {
    Object.keys(hashes).forEach(file => assert.strictEqual(crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'), hashes[file]));
});
console.log(passed + ' map editor tests passed.');
