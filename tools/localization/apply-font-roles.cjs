'use strict';
// Apply the reviewed display/body assignments without changing copy or layout.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const policy = require('./font-role-assignments.json');
const display = new Set(policy.displayStyles);
const backup = path.join(root, 'local/font-role-verification/before');
function update(relative, edit) {
  const file = path.join(root, relative), original = fs.readFileSync(file, 'utf8');
  const data = JSON.parse(original); edit(data);
  const next = JSON.stringify(data, null, 2) + '\n';
  if (next === original) return;
  if (fs.readFileSync(file, 'utf8') !== original) throw Error('Concurrent edit: ' + relative);
  const saved = path.join(backup, relative); fs.mkdirSync(path.dirname(saved), {recursive: true});
  if (!fs.existsSync(saved)) fs.writeFileSync(saved, original);
  fs.writeFileSync(file, next);
}
function artwork(data) {
  for (const [id, template] of Object.entries(data.artTemplates || {})) {
    for (const region of template.regions) {
      const isDisplay = policy.displayArtwork.includes(id) || (policy.displayArtworkRegions[id] || []).includes(region.key);
      if (isDisplay) {
        region.locales = region.locales || {};
        region.locales.en = Object.assign({}, region.locales.en, {font: 'assets/resources/localization/fonts/Lilita One.ttf'});
      } else if (region.locales && region.locales.en && /Lilita/.test(region.locales.en.font || '')) {
        delete region.locales.en.font;
        if (!Object.keys(region.locales.en).length) delete region.locales.en;
        if (!Object.keys(region.locales).length) delete region.locales;
      }
    }
  }
}
for (const relative of ['assets/resources/localization/catalog.json', 'tools/localization/layout-entries.json', 'tools/localization/mobile-text-layout-patch.json', 'tools/localization/home-stage-title-layout-patch.json']) {
  update(relative, data => {
    // Keep role defaults separate from layout snapshots so later width/size
    // patches cannot replace the reviewed font assignments.
    for (const styles of Object.values(data.labelStyles || {})) if (styles.en) delete styles.en.fontRole;
    for (const binding of Object.values(data.images || {})) if (binding.readableText)
      binding.readableText.fontRole = policy.displayArtwork.includes(binding.template) ? 'display' : 'body';
    if (relative.endsWith('catalog.json')) {
      for (const key of display) if (!data.labelStyles[key]) throw Error('Unknown display style: ' + key);
      data.fontRoles = data.fontRoles || {};
      data.fontRoles.en = Object.fromEntries([...display].map(key => [key, 'display']));
      data.fonts.en = 'localization/fonts/Lilita One';
      artwork(data);
    }
  });
}
for (const relative of ['tools/localization/art-entries.json', 'tools/localization/root-art-entries.json']) update(relative, artwork);
console.log('Assigned ' + display.size + ' display styles; all other labels retain their original font.');
