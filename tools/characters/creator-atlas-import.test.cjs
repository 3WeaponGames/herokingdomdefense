'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const Units = require('../../packages/game-data-editor/lib/unit-assets');

const root = path.resolve(__dirname, '../..');
const runtime = Units.enginePath();
const importerFile = path.resolve(path.dirname(runtime), '../editor/spine-meta.js');
const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));

test('Creator imports all 101 library rigs with their exact sibling texture UUIDs', async () => {
    // Run the installed importer's real postImport path without starting the
    // editor or writing its library cache. Only Editor services are replaced.
    const errors = [];
    const saved = new Map();
    const db = {
        fspathToUuid(file) {
            return fs.existsSync(file + '.meta') ? readJson(file + '.meta').uuid : null;
        },
        saveAssetToLibrary(uuid, asset) { saved.set(uuid, asset); }
    };
    const context = {
        module: { exports: {} },
        JSON,
        console: { log() {}, warn: (...args) => errors.push(args.join(' ')) },
        Editor: {
            metas: { 'custom-asset': class { constructor(assetdb) { this._assetdb = assetdb; } } },
            assetdb: db,
            error: (...args) => errors.push(args.join(' ')),
            serialize: { asAsset: uuid => ({ __uuid__: uuid }) }
        },
        sp: { SkeletonData: class {} },
        require(id) {
            if (id === 'fire-fs') return fs;
            if (id === 'fire-path') return Object.assign({}, path, {
                stripExt: file => file.slice(0, -path.extname(file).length),
                basenameNoExt: file => path.basename(file, path.extname(file))
            });
            if (id === '../lib/spine') return require(runtime);
            throw new Error('Unexpected importer dependency: ' + id);
        }
    };
    vm.runInNewContext(fs.readFileSync(importerFile, 'utf8'), context, { filename: importerFile });
    const SpineMeta = context.module.exports;
    let units = 0;
    for (const pack of ['character-maker', 'monster1', 'monster2']) {
        const catalog = readJson(path.join(root, 'assets/resources/unit-library', pack, 'catalog.json'));
        for (const unit of catalog.units) {
            const file = path.join(root, unit.skeleton);
            const metadata = readJson(file + '.meta');
            assert(SpineMeta.validate(file), unit.id + ': recognized as Spine');
            const meta = new SpineMeta(db);
            meta.uuid = metadata.uuid;
            meta.scale = metadata.scale;
            await new Promise((resolve, reject) => meta.postImport(file, err => err ? reject(err) : resolve()));
            assert.equal(errors.length, 0, unit.id + ': ' + errors.join('\n'));
            const asset = saved.get(unit.uuid);
            assert(asset, unit.id + ': saved under the preserved skeleton UUID');
            assert.equal(asset.scale, metadata.scale, unit.id + ': preserved scale');
            assert.equal(asset.textureNames.length, metadata.textures.length);
            assert(asset.textureNames.length > 0, unit.id + ': imported textures');
            assert.deepEqual(Array.from(asset.textures, entry => entry.__uuid__), metadata.textures);
            assert.deepEqual(asset.skeletonJson, readJson(file));
            assert.equal(asset.atlasText, fs.readFileSync(file.slice(0, -5) + '.atlas', 'utf8'));
            for (const name of asset.textureNames) {
                assert.equal(path.basename(name), name, unit.id + ': portable atlas page name');
                assert(fs.existsSync(path.join(path.dirname(file), name)));
            }
            units++;
        }
    }
    assert.equal(units, 101);
    assert.equal(saved.size, 101);
});
