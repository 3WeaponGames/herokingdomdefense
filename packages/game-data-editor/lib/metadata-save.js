'use strict';
const fs = require('fs');
const path = require('path');

// Creator 2.4 rewrites metadata even when its serialized bytes are unchanged.
// Windows can reject that truncate while an importer still holds the file.
// Keep Creator's in-memory registrations, without reopening unchanged files.
function install(metaModule, assetsRoot, io = fs) {
    const original = metaModule.save;
    const root = path.resolve(assetsRoot) + path.sep;
    function save(db, file, meta) {
        if (typeof file === 'string' && path.extname(file) === '.meta' &&
            path.resolve(file).toLowerCase().startsWith(root.toLowerCase())) {
            let existing;
            try { existing = io.readFileSync(file, 'utf8'); } catch (_) { /* Let Creator report read/write failures. */ }
            if (existing !== undefined && existing === JSON.stringify(meta.serialize(), null, 2)) {
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
