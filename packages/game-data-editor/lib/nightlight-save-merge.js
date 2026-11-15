'use strict';
const fs = require('fs'), crypto = require('crypto'), Json = require('./json-document');
const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
const hash = text => crypto.createHash('sha256').update(text).digest('hex');
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

// Reconcile only authored building lights, at explicit Save. Never refresh the
// live store: a conflict or later validation/write failure must retain history.
function documents(store) {
    const d = store.documents.A, overrides = store.documents.overrides;
    if (!d || !overrides || !Json.equal(overrides.original, overrides.data)) return null;
    const edits = Json.diff(d.original, d.data);
    if (!edits.length || !edits.every(edit => {
        const p = edit.path;
        return p.length >= 5 && p[0] === 'BuildEnum' && p[2] === 'levelList' && p[4] === 'Nightlight';
    })) return null;
    const text = fs.readFileSync(store.absolute(d.path), 'utf8'), revision = hash(text);
    if (revision === d.revision) return null;
    const latest = JSON.parse(text.replace(/^\uFEFF/, '')), data = clone(latest), seen = new Set();
    for (const edit of edits) {
        const categoryId = edit.path[1], rowIndex = edit.path[3], key = JSON.stringify([categoryId, rowIndex]);
        if (seen.has(key)) continue;
        seen.add(key);
        const beforeCategory = d.original.BuildEnum[categoryId];
        const category = latest.BuildEnum && latest.BuildEnum[categoryId];
        const before = beforeCategory && beforeCategory.levelList && beforeCategory.levelList[rowIndex];
        const after = category && category.levelList && category.levelList[rowIndex];
        const draft = d.data.BuildEnum[categoryId].levelList[rowIndex];
        const location = 'BuildEnum/' + categoryId + '/levelList/' + rowIndex + '/Nightlight';
        if (!before || !after || !own(before, 'index') ||
            !['enumValue', 'enumKey'].every(k => Json.equal(beforeCategory[k], category[k])) ||
            !['ID', 'index', 'level', 'Skin'].every(k => Json.equal(before[k], after[k]))) {
            throw Error(location + ': the building level changed outside these panels. Save cancelled; your drafts are retained.');
        }
        if (!Json.equal(before.Nightlight, after.Nightlight) && !Json.equal(draft.Nightlight, after.Nightlight)) {
            throw Error(location + ': these lights changed outside these panels. Save cancelled; your drafts are retained.');
        }
        const target = data.BuildEnum[categoryId].levelList[rowIndex];
        if (own(draft, 'Nightlight')) target.Nightlight = clone(draft.Nightlight);
        else delete target.Nightlight;
    }
    const result = Object.assign({}, store.documents);
    result.A = Object.assign({}, d, {original: clone(latest), data, text, revision});
    const original = latest.GameTools === undefined ? {version: 1, timings: {}, parameters: {}, perks: {}} : clone(latest.GameTools);
    result.overrides = Object.assign({}, overrides, {original, data: clone(original), revision});
    return result;
}
module.exports = {documents};
