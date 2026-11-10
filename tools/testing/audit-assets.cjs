const fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.resolve(__dirname, '../..');
function walk(dir) { return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]); }
const files = walk(path.join(root, 'assets')), ids = new Map(), duplicates = [], missingRefs = [], brokenFiles = [], syntaxErrors = [];
const rel = file => path.relative(root, file).replace(/\\/g, '/');
const builtinIds = new Set(require('./cocos-2.4.13-builtin-uuids.json').uuids);
for (const file of files.filter(f => f.endsWith('.meta'))) {
  let data; try { data = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')); } catch (error) { brokenFiles.push({ file: rel(file), error: error.message }); continue; }
  function visit(value) { if (!value || typeof value !== 'object') return;
    if (value.uuid) { const old = ids.get(value.uuid); if (old && old !== file) duplicates.push({ uuid: value.uuid, files: [rel(old), rel(file)] }); ids.set(value.uuid, file); }
    Object.values(value).forEach(v => { if (v && typeof v === 'object') visit(v); });
  } visit(data);
}
const scripts = new Set(files.filter(f => f.endsWith('.js')).map(f => path.basename(f, '.js'))), imports = [];
for (const file of files.filter(f => f.endsWith('.js'))) {
  const text = fs.readFileSync(file, 'utf8');
  try { new vm.Script(text, { filename: file }); } catch (error) { syntaxErrors.push({ file: rel(file), error: error.message }); }
  for (const match of text.matchAll(/require\(["']([^"']+)["']\)/g)) if (!scripts.has(match[1])) imports.push({ file: rel(file), module: match[1] });
}
let serialized = 0;
for (const file of files.filter(f => /\.(prefab|fire)$/.test(f))) {
  serialized++;
  try { const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (Array.isArray(data)) data.forEach((value, index) => {
      if (value === null) brokenFiles.push({ file: rel(file), at: 'root.' + index, error: 'Null serialized object slot can stall Cocos Creator 2.4 imports; use an empty object to reserve the index.' });
    });
    function visit(value, at) { if (!value || typeof value !== 'object') return;
      if (value.__uuid__ && !ids.has(value.__uuid__) && !builtinIds.has(value.__uuid__)) missingRefs.push({ file: rel(file), at, uuid: value.__uuid__ });
      if (value.__id__ !== undefined && (!Number.isInteger(value.__id__) || !data[value.__id__])) brokenFiles.push({ file: rel(file), at, invalidIndex: value.__id__ });
      Object.entries(value).forEach(([key, child]) => { if (child && typeof child === 'object') visit(child, at + '.' + key); });
    } visit(data, 'root');
  } catch (error) { brokenFiles.push({ file: rel(file), error: error.message }); }
}
const catalog = JSON.parse(fs.readFileSync(path.join(root, 'assets/resources/localization/catalog.json')));
const templates = Object.entries(catalog.artTemplates || {}), missingArt = [];
for (const [id, template] of templates) {
  if (template.source && !fs.existsSync(path.join(root, template.source))) missingArt.push({ id, source: template.source });
  for (const locale of template.languages || catalog.languages.map(language => language.code)) { const file = path.join(root, 'assets/resources/localization/generated', locale, id + '.png'); if (!fs.existsSync(file)) missingArt.push({ id, locale, file: rel(file) }); }
}
const config = JSON.parse(fs.readFileSync(path.join(root, 'assets/KinghtFallConfig/GameJsonCfg.json')));
const out = { assetFiles: files.length, scripts: scripts.size, serialized, syntaxErrors, duplicateUuids: duplicates, brokenFiles, unresolvedImports: imports, unresolvedSerializedRefs: missingRefs,
  artwork: { templates: templates.length, spriteBindings: Object.keys(catalog.images || {}).length, spineBindings: Object.keys(catalog.spineImages || {}).length, missingArt },
  config: { stages: config.LevelCfg.length, waves: config.LevelCfg.reduce((s, r) => s + r.WaveCfg.length, 0), unlocks: config.ParameterCfg[60008], gifts: config.GiftCfg },
  startSceneExists: ids.has(JSON.parse(fs.readFileSync(path.join(root, 'settings/builder.json'))).startScene) };
const reportFile = require('./artifact-paths.cjs').reportPath('audit', 'assets.json');
fs.mkdirSync(path.dirname(reportFile), { recursive: true });
fs.writeFileSync(reportFile, JSON.stringify(out, null, 2) + '\n');
console.log(JSON.stringify({ ...out, unresolvedSerializedRefs: { count: missingRefs.length, uuids: [...new Set(missingRefs.map(r => r.uuid))] } }, null, 2));

if (syntaxErrors.length || duplicates.length || brokenFiles.length || imports.length || missingRefs.length || missingArt.length || !out.startSceneExists) process.exitCode = 1;
