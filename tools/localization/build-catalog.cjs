'use strict';
// Migration assembly only. After migration, edit the catalog using the editor panel.
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '../..');
const catalog = { version: 1, defaultLanguage: 'en', languages: [{code:'en', nameKey:'language.en'}, {code:'zh', nameKey:'language.zh'}], entries: {}, images: {},
  numberFormats: { en: {base:1000,suffixes:['','K','M','B','T','Qa','Qi']}, zh: {base:10000,suffixes:['','万','亿','兆','京','垓','秭']} } };
for (const source of ['text-entries.json', 'root-entries.json', 'art-entries.json', 'root-art-entries.json', 'layout-entries.json']) {
  const file = path.join(__dirname, source);
  if (!fs.existsSync(file)) continue;
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  for (const section of ['entries','images','artTemplates','spineImages','fonts','labelStyles','nodeStyles','nodePathStyles']) if (data[section]) Object.assign(catalog[section] || (catalog[section] = {}), data[section]);
}
const target = path.join(root, 'assets/resources/localization/catalog.json');
fs.mkdirSync(path.dirname(target), {recursive:true});
fs.writeFileSync(target, JSON.stringify(catalog,null,2)+'\n');
console.log(JSON.stringify({entries:Object.keys(catalog.entries).length,images:Object.keys(catalog.images).length,target}));
