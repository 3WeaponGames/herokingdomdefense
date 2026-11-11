'use strict';
const fs = require('fs');
const path = require('path');
const { isDeepStrictEqual } = require('util');

// Creator 2.4 rewrites metadata even when its serialized bytes are unchanged.
// Windows can reject that truncate while an importer still holds the file.
// Keep Creator's in-memory registrations, without reopening unchanged files.
// Import tools may use different whitespace or key order for the same JSON.
function install(metaModule, assetsRoot, io = fs) {
    const original = metaModule.save;
    const root = path.resolve(assetsRoot) + path.sep;
    function save(db, file, meta) {
        if (typeof file === 'string' && path.extname(file) === '.meta' &&
            path.resolve(file).toLowerCase().startsWith(root.toLowerCase())) {
            let existing;
            try { existing = io.readFileSync(file, 'utf8'); } catch (_) { /* Let Creator report read/write failures. */ }
            let unchanged = false;
            if (existing !== undefined) {
                const serialized = JSON.stringify(meta.serialize(), null, 2);
                unchanged = existing === serialized;
                if (!unchanged) {
                    try {
                        unchanged = isDeepStrictEqual(JSON.parse(existing.replace(/^\uFEFF/, '')), JSON.parse(serialized));
                    } catch (_) { /* Invalid JSON must still follow Creator's save/error path. */ }
                }
            }
            if (unchanged) {
                db._uuid2meta[meta.uuid] = meta;
                const children = meta.getSubMetas();
                if (children) for (const key in children) {
                    const child = children[key];
                    db._uuid2meta[child.uuid] = child;
                }
                return;
            }
        }
        return original.apply(this, arguments);
    }
    metaModule.save = save;
    return () => { if (metaModule.save === save) metaModule.save = original; };
}

module.exports = { install };
