'use strict';
// Creator's generic serializer removes double-underscore dictionary keys.
// Spine JSON is opaque source data: those keys can be real slot/timeline names.
const installations = new WeakMap();

function install(assetdb, getSkeletonData) {
    const previous = installations.get(assetdb);
    if (previous && assetdb.saveAssetToLibrary === previous.save) return previous.restore;
    if (previous) previous.restore();
    const original = assetdb.saveAssetToLibrary;
    if (typeof original !== 'function') throw new TypeError('Creator asset library save is unavailable');
    let active = true;
    function save(uuid, asset) {
        const Type = active && getSkeletonData();
        if (typeof Type === 'function' && asset instanceof Type && typeof asset.serialize === 'function') {
            const raw = asset.skeletonJson;
            if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
                // Serialize outer asset fields once using Creator's normal
                // machinery, retaining its texture UUIDs/native references.
                let serialized = asset.serialize();
                const data = JSON.parse(serialized), record = Array.isArray(data) ? data[0] : data;
                if (record && record.__type__ === 'sp.SkeletonData') {
                    record._skeletonJson = raw;
                    serialized = JSON.stringify(data);
                }
                const args = Array.prototype.slice.call(arguments);
                args[1] = serialized;
                return original.apply(this, args);
            }
        }
        return original.apply(this, arguments);
    }
    function restore() {
        active = false;
        if (assetdb.saveAssetToLibrary === save) assetdb.saveAssetToLibrary = original;
        if (installations.get(assetdb) === entry) installations.delete(assetdb);
    }
    const entry = {save, restore};
    assetdb.saveAssetToLibrary = save;
    installations.set(assetdb, entry);
    return restore;
}

module.exports = {install};
