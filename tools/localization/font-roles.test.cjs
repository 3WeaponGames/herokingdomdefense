'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const root = path.resolve(__dirname, '../..');
const catalog = JSON.parse(fs.readFileSync(path.join(root, 'assets/resources/localization/catalog.json')));
const policy = require('./font-role-assignments.json');
const role = key => catalog.labelStyles[key]?.en?.fontRole || catalog.fontRoles.en[key] || 'body';
test('Reviewed titles and actions use display; dense information and numbers use body', () => {
  for (const key of ['ui.layout.kinghtfallhomebattlectrl.7','ui.layout.kinghtfallhomebattlectrl.105','ui.layout.kinghtfalluigame.141','ui.layout.kinghtfalluigame.146','ui.layout.kinghtfallhomepersonctrl.198','ui.layout.kinghtfalluinewmodular.35','ui.layout.uiguide.27'])
    assert.equal(role(key), 'display', key);
  for (const key of ['ui.mobile.kinghtfalluigame.241','ui.layout.kinghtfalluigame.201','ui.layout.kinghtfallhomebattlectrl.139','ui.layout.kinghtfallhomepersonctrl.181','ui.layout.kinghtfallhomepersonctrl.138','ui.mobile.kinghtfalluitop.13','ui.mobile.kinghtfalluitop.30','ui.mobile.kinghtfalluitop.43','ui.layout.kinghtfalluisetting.18','ui.layout.kinghtfalluisetting.37','ui.mobile.uiguide.24'])
    assert.equal(role(key), 'body', key);
  const selected = Object.keys(catalog.labelStyles).filter(key => role(key) === 'display').sort();
  assert.deepEqual(selected, policy.displayStyles.slice().sort());
  assert.equal(role('a.new.unassigned.label'), 'body');
  assert.equal(catalog.fonts.zh, undefined);
  for (const key of ['ui.layout.kinghtfallhomebattlectrl.165','ui.layout.kinghtfallhomebattlectrl.180','ui.layout.kinghtfallhomebattlectrl.195','ui.layout.kinghtfallhomebattlectrl.210','ui.layout.kinghtfalluigame.191'])
    assert.equal(role(key), 'body', 'Compact icon captions retain the original font: '+key);
});
test('Artwork uses Lilita for badges and actions while map labels, status words and instructions retain their original font', () => {
  for (const id of ['new_badge','watch_ad','settlement_atlas','level_pass']) for (const region of catalog.artTemplates[id].regions)
    assert.match(region.locales.en.font, /Lilita One\.ttf$/);
  for (const id of ['tile_zc','tile_by','buff_heal','buff_attack_up','relic_02','age_rating']) for (const region of catalog.artTemplates[id].regions)
    assert.doesNotMatch(region.locales?.en?.font || region.font || '', /Lilita/);
  for (const binding of Object.values(catalog.images)) if (binding.readableText)
    assert.equal(binding.readableText.fontRole, binding.template === 'new_badge' ? 'display' : 'body');
  for (const region of catalog.artTemplates.sidebar_guide.regions)
    assert.equal(/Lilita/.test(region.locales?.en?.font || ''), region.key === 'art.sidebar.game');
});
test('The TTF filename matches its internal family so the Win32 simulator selects the actual face', () => {
  const file = path.join(root, 'assets/resources', catalog.fonts.en + '.ttf'), bytes = fs.readFileSync(file);
  assert.equal(bytes.readUInt32BE(0), 0x00010000);
  let offset;
  for (let n=0;n<bytes.readUInt16BE(4);n++) { const p=12+n*16; if (bytes.toString('ascii',p,p+4)==='name') offset=bytes.readUInt32BE(p+8); }
  assert.ok(offset);
  const start=offset+bytes.readUInt16BE(offset+4), families=[];
  for (let n=0;n<bytes.readUInt16BE(offset+2);n++) {
    const p=offset+6+n*12;
    if (bytes.readUInt16BE(p)!==3 || bytes.readUInt16BE(p+6)!==1) continue;
    const text=Buffer.from(bytes.subarray(start+bytes.readUInt16BE(p+10),start+bytes.readUInt16BE(p+10)+bytes.readUInt16BE(p+8))).swap16().toString('utf16le');
    families.push(text);
  }
  assert.ok(families.includes(path.basename(file, '.ttf')), 'Win32 derives the selected face from the filename');
  assert.match(fs.readFileSync(path.join(root, 'assets/resources/localization/fonts/LilitaOne-OFL.txt'),'utf8'), /SIL OPEN FONT LICENSE/);
});
test('Authoring validation and CSV round trips preserve roles and reject invalid assignments', () => {
  const Catalog = require('../../packages/localization-editor/lib/catalog');
  Catalog.structure(catalog);
  const merged=Catalog.mergeCSV(catalog,Catalog.toCSV(catalog)).catalog;
  assert.deepEqual(merged.labelStyles,catalog.labelStyles);assert.deepEqual(merged.fonts,catalog.fonts);
  assert.deepEqual(merged.fontRoles,catalog.fontRoles);
  const invalid=Catalog.clone(catalog);invalid.labelStyles['ui.layout.kinghtfalluigame.141'].en.fontRole='unknown';
  assert.throws(()=>Catalog.structure(invalid),/fontRole/);
});
