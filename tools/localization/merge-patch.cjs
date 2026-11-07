'use strict';
// Apply reviewed, partial localization edits without rebuilding artwork.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Catalog = require('../../packages/localization-editor/lib/catalog');
const JSONDocument = require('../../packages/game-data-editor/lib/json-document');
const allowed = new Set(['entries', 'labelStyles', 'nodeStyles', 'nodePathStyles', 'images', 'spineImages', 'artTemplates']);
const object = value => value && typeof value === 'object' && !Array.isArray(value);

function merge(target, patch) {
  if (!object(patch)) throw new Error('Patch sections must be objects.');
  for (const key of Object.keys(patch)) {
    if (['__proto__', 'constructor', 'prototype'].includes(key)) throw new Error('Unsafe patch key: ' + key);
    const value = patch[key];
    if (object(value)) {
      if (!object(target[key])) target[key] = {};
      merge(target[key], value);
    } else target[key] = value;
  }
}

function applyPatches(root, names) {
  const file = path.join(root, 'assets/resources/localization/catalog.json');
  const original = fs.readFileSync(file, 'utf8');
  const before = Catalog.structure(JSON.parse(original.replace(/^\uFEFF/, '')));
  const catalog = Catalog.clone(before);
  for (const name of names) {
    const patch = JSON.parse(fs.readFileSync(path.resolve(root, name), 'utf8'));
    if (!object(patch)) throw new Error('A localization patch must be an object.');
    for (const section of Object.keys(patch)) {
      if (!allowed.has(section)) throw new Error('Unsupported patch section: ' + section);
      if (!catalog[section]) catalog[section] = {};
      merge(catalog[section], patch[section]);
    }
  }
  Catalog.structure(catalog);
  const unchanged = () => {
    if (fs.readFileSync(file, 'utf8') !== original) throw new Error('The catalog changed during merge. Reload it and retry the patch.');
  };
  unchanged();
  if (JSONDocument.equal(before, catalog)) return { saved: false, noChanges: true };
  const text = JSONDocument.patch(original, before, catalog);
  const stamp = Date.now() + '-' + crypto.randomBytes(6).toString('hex');
  const backupDir = path.join(root, 'local/localization-merge-backup');
  const backup = path.join(backupDir, stamp + '-catalog.json');
  const temporary = file + '.' + stamp + '.tmp';
  fs.mkdirSync(backupDir, { recursive: true });
  fs.writeFileSync(backup, original, { encoding: 'utf8', flag: 'wx' });
  try {
    fs.writeFileSync(temporary, text, { encoding: 'utf8', flag: 'wx' });
    unchanged();
    fs.renameSync(temporary, file);
  } catch (error) {
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
    throw error;
  }
  return { saved: true, backup, revision: Catalog.revision(text) };
}

if (require.main === module) {
  const result = applyPatches(path.resolve(__dirname, '../..'), process.argv.slice(2));
  console.log(result.saved ? 'Localization patch saved; backup: ' + result.backup : 'No localization changes.');
}
module.exports = { applyPatches };
