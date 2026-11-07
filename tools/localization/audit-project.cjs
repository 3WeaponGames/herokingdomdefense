'use strict';
// Offline localization audit. Optional --catalog and --report paths validate a candidate without importing it.
const fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.resolve(__dirname, '../..');
const assetRoot = path.join(root, 'assets');
function option(name, fallback) {
  const at = process.argv.indexOf(name);
  if (at < 0) return fallback;
  if (!process.argv[at + 1] || process.argv[at + 1].startsWith('--')) throw new Error('Missing path for ' + name);
  return path.resolve(root, process.argv[at + 1]);
}
const catalogFile = option('--catalog', path.join(assetRoot, 'resources/localization/catalog.json'));
const backup = option('--baseline', null);
const reportFile = option('--report', require('../testing/artifact-paths.cjs').reportPath('audit', 'localization.json'));
const catalog = JSON.parse(fs.readFileSync(catalogFile, 'utf8'));
const token = /\[\[loc:([\w.-]+)\]\]/g;
const displayField = /^(name|describe|levelupdescribe|equipname|missiondescribe|gift_name|buffword|buffdes|bufflabel|buffvalue|description|title|text|label|content)$/i;
const report = { date: new Date().toISOString(), errors: [], warnings: [], counts: { entries: Object.keys(catalog.entries).length, tokenReferences: 0, scriptFiles: 0, serializedTextFields: 0, styledLabels: 0, richTextBlocks: 0, editBoxes: 0, configTextFields: 0, numericGameplayValues: 0, unchangedGameplayStrings: 0 }, exemptions: [
  'Pure numeric values and punctuation (+, -, %, /, :, parentheses) are language-neutral display data.',
  'Inspector captions, diagnostic logs, analytics descriptions, SDK status identifiers and geographic identity-validation data are not player-facing copy.',
  'Legacy configsB/D TextCfg tables remain unchanged reference data; LanguageMgr uses resources/localization/catalog instead.',
  'Spine attachment/slot names and atlas resource paths identify artwork, not rendered text. Their visual lettering is covered by artwork bindings and visual review.',
  'Player-authored names and entered gift codes or feedback are user content and must not be translated.',
  'The removed top disclaimer and numeric ItemHp sample Label remain in the catalog but are inactive or overwritten at runtime.'
] };
function error(type, source, detail) { report.errors.push({ type, source, detail }); }
function walk(dir) { return fs.readdirSync(dir, {withFileTypes:true}).flatMap(e => e.isDirectory() ? walk(path.join(dir,e.name)) : [path.join(dir,e.name)]); }
function relative(f) { return path.relative(root,f).replace(/\\/g,'/'); }
function tokens(s, source) { if(source.endsWith('.js')) s=s.replace(/\/\*[\s\S]*?\*\//g,'').replace(/^\s*\/\/.*$/gm,''); for (const m of s.matchAll(token)) { report.counts.tokenReferences++; if (!catalog.entries[m[1]]) error('missing-key',source,m[1]); } }
function meaningful(s) { return /[A-Za-z\u3400-\u9fff]/.test(s.replace(token,'').replace(/<[^>]*>/g,'').replace(/\{[^}]*\}/g,'')); }
function textCheck(s, source) { if (typeof s !== 'string' || !s) return; tokens(s,source); if (meaningful(s)) error('raw-display-text',source,s); }
function getStyleKey(node, data, component, assetUuid) {
  const info = data[node._prefab && node._prefab.__id__];
  const fileId = info && info.fileId;
  const nodes = catalog.nodeStyles || {};
  const sourceKey = /\[\[loc:([\w.-]+)\]\]/.exec(component._string || component._N$string || '');
  return nodes[assetUuid + ':' + fileId] || nodes[fileId] || (sourceKey && sourceKey[1]);
}
for (const [key, entry] of Object.entries(catalog.entries)) {
  for (const language of catalog.languages) if (typeof entry[language.code] !== 'string' || !entry[language.code].trim()) error('missing-translation',key,language.code);
  if (key !== 'language.zh' && /[\u3400-\u9fff]/.test(entry.en || '')) error('chinese-in-english',key,entry.en);
  for (const re of [/\{\w+\}/g, /<[^>]+>/g]) {
    // Font size is locale-specific presentation, while tag structure and placeholders must be preserved.
    const normalize = value => value.replace(/^<size=\d+(?:\.\d+)?>$/, '<size>');
    const zh = (entry.zh.match(re)||[]).map(normalize).sort(), en = (entry.en.match(re)||[]).map(normalize).sort();
    if (JSON.stringify(zh)!==JSON.stringify(en)) error('placeholder-or-markup-mismatch',key,{zh,en});
  }
}
for (const file of walk(assetRoot)) {
  const rel = relative(file);
  if (/\.(js|json|prefab|fire)$/.test(file) && !rel.endsWith('/catalog.json')) tokens(fs.readFileSync(file,'utf8'),rel);
  if (/\.(prefab|fire)$/.test(file)) {
    const data = JSON.parse(fs.readFileSync(file,'utf8'));
    const uuid = JSON.parse(fs.readFileSync(file+'.meta','utf8')).uuid;
    data.forEach((component, index) => {
      if (!['cc.Label','cc.RichText','cc.EditBox'].includes(component.__type__)) return;
      const node = data[component.node && component.node.__id__];
      if (component.__type__ === 'cc.EditBox') {
        report.counts.editBoxes++;
        // Creator 2.4 stores the actual placeholder in a linked cc.Label.
        const reference = component._N$placeholderLabel;
        if (reference && (!data[reference.__id__] || data[reference.__id__].__type__ !== 'cc.Label')) error('invalid-placeholder-label',rel+':'+index,reference);
      }
      let hasText = false;
      for (const [key,value] of Object.entries(component)) if (/^(?:_N\$)?(?:_?string|placeholder)$/.test(key) && typeof value === 'string') { textCheck(value,rel+':'+index+'.'+key); report.counts.serializedTextFields++; hasText ||= /\[\[loc:/.test(value); }
      if (hasText && component.__type__ === 'cc.Label') {
        const key = getStyleKey(node,data,component,uuid);
        if (!catalog.labelStyles || !catalog.labelStyles[key]) error('missing-label-layout',rel+':'+index,key);
        else report.counts.styledLabels++;
      }
      if (hasText && component.__type__ === 'cc.RichText') {
        report.counts.richTextBlocks++;
        const width = component._N$maxWidth || component._maxWidth || node && node._contentSize && node._contentSize.width;
        if (!(width > 0)) error('unbounded-richtext',rel+':'+index,'No maxWidth or node width');
      }
    });
  }
  if (path.basename(file) === 'GameJsonCfg.json') {
    const data = JSON.parse(fs.readFileSync(file,'utf8'));
    function inspect(o, at) { if (!o || typeof o !== 'object') return; for (const [key,value] of Object.entries(o)) { if (key==='TextCfg') continue; const p=at.concat(key); if (typeof value==='string' && displayField.test(key) && meaningful(value)) error('raw-config-copy',rel+':'+p.join('.'),value); if (typeof value==='string' && displayField.test(key) && value.includes('[[loc:')) report.counts.configTextFields++; if (value && typeof value==='object') inspect(value,p); } }
    inspect(data,[]);
    const originalFile = backup && path.join(backup,path.relative(assetRoot,file));
    if (originalFile && fs.existsSync(originalFile)) {
      const original = JSON.parse(fs.readFileSync(originalFile,'utf8'));
      function compare(a,b,at) {
        if (typeof a === 'number' || typeof a === 'boolean' || a===null) { report.counts.numericGameplayValues++; if(a!==b)error('gameplay-value-changed',rel+':'+at.join('.'),{before:a,after:b}); return; }
        if (typeof a === 'string') {
          if(a===b){report.counts.unchangedGameplayStrings++;return;}
          const m=typeof b==='string'&&/^\[\[loc:([\w.-]+)\]\]$/.exec(b);
          if(!m||!catalog.entries[m[1]]||catalog.entries[m[1]].zh!==a)error('gameplay-string-changed',rel+':'+at.join('.'),{before:a,after:b});return;
        }
        if (!b || typeof b!=='object') { error('gameplay-structure-changed',rel+':'+at.join('.'),null);return; }
        if(Array.isArray(a)&&a.length!==b.length)error('gameplay-array-length-changed',rel+':'+at.join('.'),[a.length,b.length]);
        for(const key of Object.keys(a))compare(a[key],b[key],at.concat(key));
        for(const key of Object.keys(b))if(!Object.hasOwn(a,key)&&!['buffLabel','buffValue'].includes(key))error('unexpected-gameplay-field',rel+':'+at.concat(key).join('.'),b[key]);
      }
      compare(original,data,[]);
    } else if (backup) error('missing-baseline-file',rel,originalFile);
  }
  if (file.endsWith('.js')) {
    report.counts.scriptFiles++;
    const source=fs.readFileSync(file,'utf8');
    try{new vm.Script(source,{filename:rel})}catch(e){error('syntax-error',rel,e.message)}
    for(const m of source.matchAll(/\.(?:t|T|token)\(\s*["']([a-zA-Z][\w.-]*)["']/g)) if(!catalog.entries[m[1]]) error('missing-key',rel,m[1]);
    // Literal text directly assigned to Cocos strings or native modal fields is always reviewable.
    const lines=source.split(/\r?\n/);
    lines.forEach((line,index)=>{
      if(/\/\/|console\.|\.error\(|\.debug\(|\.info\(|\.iLog\(|LogMgr/.test(line))return;
      const assignment=/\.string\s*=\s*(["'](?:[^"'\\]|\\.)*["'])/.exec(line);
      const native=/^\s*(?:title|content|msg|placeholder|confirmText|cancelText)\s*:\s*(["'](?:[^"'\\]|\\.)*["'])/.exec(line);
      for(const match of [assignment,native])if(match){let value;try{value=vm.runInNewContext(match[1])}catch{return}if(meaningful(value))error('raw-script-display-copy',rel+':'+(index+1),value)}
    });
  }
}
for (const [key,style] of Object.entries(catalog.labelStyles||{})) { if(!catalog.entries[key])error('layout-key-missing',key,null); for(const [language,options]of Object.entries(style)) if(!(options.width>0)||options.height!==undefined&&!(options.height>0))error('invalid-layout-bounds',key+':'+language,options); }
for (const [uuid,binding] of Object.entries(catalog.images||{})) { if(binding.key&&!catalog.entries[binding.key])error('artwork-key-missing',uuid,binding.key); if(binding.pending)report.warnings.push({type:'pending-artwork',source:uuid,key:binding.key}); }
report.summary={passed:report.errors.length===0,errorCount:report.errors.length,warningCount:report.warnings.length};
report.historicalBaseline=backup||'Not supplied; historical gameplay-value preservation was not checked.';
fs.mkdirSync(path.dirname(reportFile),{recursive:true});
fs.writeFileSync(reportFile,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({summary:report.summary,counts:report.counts,errors:report.errors,warnings:report.warnings.slice(0,15)},null,2));
if(report.errors.length)process.exitCode=1;
