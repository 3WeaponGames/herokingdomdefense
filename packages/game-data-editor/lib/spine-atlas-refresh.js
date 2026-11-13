'use strict';
// SpineMeta reads a sibling atlas but Creator 2.x does not record that file as
// an import dependency. Refresh only stale derived imports; never rewrite art,
// skeleton source, scenes, drafts or player data.
const fs = require('fs');
const path = require('path');

function sources(root) {
    const directory = path.join(root, 'assets/KinghtFallIconMap/com/Ani'), result = [];
    function visit(dir) {
        if (!fs.existsSync(dir)) return;
        for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
            const file = path.join(dir, entry.name);
            if (entry.isDirectory()) visit(file);
            else if (entry.name.endsWith('.json') && fs.existsSync(file + '.meta')) {
                const atlas = file.slice(0, -5) + '.atlas';
                if (!fs.existsSync(atlas)) continue;
                const meta = JSON.parse(fs.readFileSync(file + '.meta', 'utf8'));
                if (meta.importer === 'spine') result.push({file, atlas, uuid: meta.uuid});
            }
        }
    }
    visit(directory);
    return result;
}

function inspect(root, item) {
    const text = fs.readFileSync(item.atlas, 'utf8');
    const json = JSON.parse(fs.readFileSync(item.file, 'utf8'));
    const pages = text.split(/\r\n|\r|\n/).map(line => line.trim()).filter(line => line.endsWith('.png'));
    if (!pages.length || pages.some(name => path.basename(name) !== name)) throw Error('Invalid sibling atlas pages: ' + item.atlas);
    const textures = pages.map(name => JSON.parse(fs.readFileSync(path.join(path.dirname(item.atlas), name + '.meta'), 'utf8')).uuid);
    const library = path.join(root, 'library/imports', item.uuid.slice(0, 2), item.uuid + '.json');
    if (!fs.existsSync(library)) return {stale: true, pages};
    const cached = JSON.parse(fs.readFileSync(library, 'utf8'));
    return {pages, stale: cached._atlasText !== text || JSON.stringify(cached._skeletonJson) !== JSON.stringify(json) ||
        JSON.stringify(cached.textureNames) !== JSON.stringify(pages) ||
        JSON.stringify((cached.textures || []).map(texture => texture.__uuid__)) !== JSON.stringify(textures)};
}

function install(Editor, root, options = {}) {
    const db = Editor && Editor.assetdb;
    if (!db || typeof db.refresh !== 'function' || typeof db.clearImports !== 'function' || typeof db.urlToUuid !== 'function') return () => {};
    root = path.resolve(root);
    let active = true;
    const timers = new Map(), busy = new Set(), pending = new Set(), watchers = [];
    const delay = options.delay === undefined ? 350 : options.delay;
    const warn = error => {if (active && Editor.warn) Editor.warn('[Building art imports] ' + (error.message || error));};
    const url = file => 'db://' + path.relative(root, file).split(path.sep).join('/');
    function schedule(item, wait = delay) {
        if (!active) return;
        clearTimeout(timers.get(item.file));
        const timer = setTimeout(() => {timers.delete(item.file);check(item);}, wait);
        if (timer.unref) timer.unref();
        timers.set(item.file, timer);
    }
    function refresh(file) {
        return new Promise((resolve, reject) => db.refresh(url(file), error => error ? reject(error) : resolve()));
    }
    async function check(item) {
        if (!active) return;
        if (busy.has(item.file)) {pending.add(item.file);return;}
        busy.add(item.file);
        try {
            const state = inspect(root, item);
            if (!state.stale) return;
            // Package load precedes AssetDB mounting. Retry readiness without
            // touching source timestamps or clearing an unregistered asset.
            if (db.urlToUuid(url(item.file)) !== item.uuid) {schedule(item, 1000);return;}
            for (const page of state.pages) {
                if (!active) return;
                await refresh(path.join(path.dirname(item.atlas), page));
            }
            if (!active) return;
            await new Promise((resolve, reject) => db.clearImports(url(item.file), error => error ? reject(error) : resolve()));
            if (!active) return;
            await refresh(item.file);
            if (active && inspect(root, item).stale) throw Error('Creator still has stale Spine data for ' + path.relative(root, item.file));
        } catch (error) {warn(error);}
        finally {
            busy.delete(item.file);
            if (pending.delete(item.file)) schedule(item);
        }
    }
    let entries;
    try {entries = sources(root);} catch (error) {warn(error);return () => {active = false;};}
    const directories = new Map();
    for (const item of entries) {
        schedule(item);
        const dir = path.dirname(item.file);
        if (!directories.has(dir)) directories.set(dir, []);
        directories.get(dir).push(item);
    }
    for (const [dir, items] of directories) {
        try {
            const watcher = (options.watch || fs.watch)(dir, {persistent: false}, (_event, filename) => {
                if (!active || !filename) return;
                const changed = String(filename);
                for (const item of items) if (changed === path.basename(item.atlas) || changed === path.basename(item.file) || changed === path.basename(item.file) + '.meta') schedule(item);
            });
            watcher.on('error', warn);watchers.push(watcher);
        } catch (error) {warn(error);}
    }
    return function restore() {
        active = false;
        for (const timer of timers.values()) clearTimeout(timer);
        timers.clear();pending.clear();
        for (const watcher of watchers) watcher.close();
    };
}

module.exports = {sources, inspect, install};
