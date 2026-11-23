'use strict';

const Json = require('./json-document');
const Records = require('./unit-records');
const object = value => !!value && typeof value === 'object' && !Array.isArray(value);
const field = (value, key) => value && Object.prototype.hasOwnProperty.call(value, key) ? value[key] : undefined;

function projectileEdit(config, edit) {
    const [table, entry, id, property, timing] = edit.path;
    if (table === 'timings') {
        const reachable = key => Records.reachable(config, ...key.split(':'));
        if (edit.path.length === 1) {
            return edit.before === undefined && object(edit.after) && Object.keys(edit.after).every(reachable);
        }
        return reachable(entry) && (edit.path.length === 2 ||
            edit.path.length === 3 && (id === 'attack' || id === 'inherit'));
    }
    // Projectiles also mirrors the clock into metadata for managed enemies.
    return table === 'unitProfiles' && entry === 'entries' && property === 'timing' &&
        Records.reachable(config, 'enemy', id, Records.form('enemy', id)) &&
        (edit.path.length === 4 || timing === 'saved' || timing === 'custom');
}

function merge(base, draft, disk, path = []) {
    if (Json.equal(base, draft)) return disk;
    if (Json.equal(base, disk) || Json.equal(draft, disk)) return draft;
    const clock = path[0] === 'timings' && path.length === 2 ||
        path[0] === 'unitProfiles' && path[1] === 'entries' && path[3] === 'timing' && path.length === 4;
    if (clock || !object(draft) || !object(disk) || base !== undefined && !object(base)) {
        throw Error('Projectiles and this draft both changed ' + ['GameTools', ...path].join(' / ') + '. Your drafts are retained.');
    }
    const entries = [];
    for (const key of new Set([...Object.keys(disk), ...Object.keys(draft)])) {
        const value = merge(field(base, key), field(draft, key), field(disk, key), path.concat(key));
        if (value !== undefined) entries.push([key, value]);
    }
    return Object.fromEntries(entries);
}

// Build a save candidate from the latest disk text. The live draft and history
// stay intact through conflict checks, validation and the guarded transaction.
function documents(source, overrides, published) {
    const { GameTools: previous, ...before } = source.original;
    const { GameTools: latest, ...after } = published.data;
    if (!Json.equal(before, after) || !object(latest) || previous !== undefined && !object(previous)) return null;
    const changes = Json.diff(previous || { version: 1 }, latest);
    if (!changes.length || !changes.every(edit => projectileEdit(published.data, edit))) return null;

    // For legacy files the empty override tables exist only in the editor.
    const draft = previous ? overrides.data : Object.fromEntries(Object.entries(overrides.data)
        .filter(([key, value]) => !Json.equal(value, field(overrides.original, key))));
    const data = merge(previous || {}, draft, latest);
    return {
        A: { ...published, data: { ...source.data, GameTools: latest } },
        overrides: { ...overrides, original: latest, data, revision: published.revision }
    };
}

module.exports = { documents };
