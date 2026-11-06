'use strict';
// Merge reviewed localization patches without rebuilding or replacing unrelated panel edits.
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '../..');
const file = path.join(root, 'assets/resources/localization/catalog.json');
const catalog = JSON.parse(fs.readFileSync(file, 'utf8'));
const allowed = ['entries', 'labelStyles', 'nodeStyles', 'nodePathStyles', 'images', 'spineImages', 'artTemplates'];
for (const name of process.argv.slice(2)) {
  const patch = JSON.parse(fs.readFileSync(path.resolve(root, name), 'utf8'));
  for (const section of Object.keys(patch)) {
    if (!allowed.includes(section)) throw new Error('Unsupported patch section: ' + section);
    catalog[section] = catalog[section] || {};
    Object.assign(catalog[section], patch[section]);
    console.log(name + ': ' + section + ' ' + Object.keys(patch[section]).length);
  }
}
fs.mkdirSync(path.join(root, 'local/localization-merge-backup'), {recursive:true});
fs.copyFileSync(file, path.join(root, 'local/localization-merge-backup', Date.now() + '-catalog.json'));
fs.writeFileSync(file, JSON.stringify(catalog, null, 2) + '\n');
