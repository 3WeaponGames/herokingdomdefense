'use strict';
// Current catalog coverage is portable. Historical immutability is a separate,
// optional check, only claimed when an explicit hash inventory is given.
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const root = path.resolve(__dirname, '../..');
function option(name, fallback) {
  const at = process.argv.indexOf(name);
  if (at < 0) return fallback;
  if (!process.argv[at + 1] || process.argv[at + 1].startsWith('--')) throw Error('Missing path for ' + name);
  return path.resolve(root, process.argv[at + 1]);
}
const catalog = JSON.parse(fs.readFileSync(option('--catalog', path.join(root, 'assets/resources/localization/catalog.json')), 'utf8'));
const reportFile = option('--report', path.join(root, 'local/audit/art-coverage.json'));
const baselineFile = option('--baseline', null);
const bindings = [...Object.entries(catalog.images || {}), ...Object.entries(catalog.spineImages || {})];
const templates = catalog.artTemplates || {};
const missingRuntimeBindings = [], sourceMissing = [], generatedMissing = [], originalChanges = [];
for (const [uuid, binding] of bindings) {
  if (binding.pending || !binding.template || !templates[binding.template]) missingRuntimeBindings.push(uuid);
  if (binding.source && !fs.existsSync(path.join(root, binding.source))) sourceMissing.push(binding.source);
}
for (const [id, template] of Object.entries(templates)) {
  if (template.pending || !bindings.some(([, b]) => b.template === id)) missingRuntimeBindings.push(id);
  for (const source of [template.source, template.sourceOriginal].filter(Boolean)) {
    if (!fs.existsSync(path.join(root, source))) sourceMissing.push(source);
  }
  for (const locale of catalog.languages) {
    const file = `assets/resources/localization/generated/${locale.code}/${id}.png`;
    if (!fs.existsSync(path.join(root, file))) generatedMissing.push(file);
  }
}
let baselineImages = null;
if (baselineFile) {
  const inventory = JSON.parse(fs.readFileSync(baselineFile, 'utf8'));
  baselineImages = inventory.length;
  for (const item of inventory) {
    const file = path.join(root, item.path);
    if (!fs.existsSync(file) || crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex') !== item.sha256) originalChanges.push(item.path);
  }
}
const report = { templates: Object.keys(templates).length, spriteBindings: Object.keys(catalog.images || {}).length,
  spineBindings: Object.keys(catalog.spineImages || {}).length, sourceMissing: [...new Set(sourceMissing)],
  missingRuntimeBindings, generatedMissing, originalChanges, baselineImages,
  historicalBaseline: baselineFile || 'Not supplied; historical image preservation was not checked.' };
fs.mkdirSync(path.dirname(reportFile), { recursive: true });
fs.writeFileSync(reportFile, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
if (sourceMissing.length || missingRuntimeBindings.length || generatedMissing.length || originalChanges.length) process.exitCode = 1;
