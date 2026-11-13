'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), test = require('node:test'), vm = require('node:vm');
const root = path.resolve(__dirname, '../..');

test('main weapon damage caption replaces the old range binding and follows language changes without altering upgrade values', () => {
  const cc = {isValid: value => !!value, Label: class Label {}};
  const languageContext = {exports: {}, cc, CC_EDITOR: true};
  vm.runInNewContext(fs.readFileSync(path.join(root, 'assets/_script/LanguageMgr.js'), 'utf8'), languageContext);
  const LanguageMgr = languageContext.exports.LanguageMgr, language = LanguageMgr.getInstance();
  const catalog = require('../../assets/resources/localization/catalog.json');
  language.setCatalog({defaultLanguage: 'en', languages: catalog.languages, entries: catalog.entries});
  const labels = {};
  for (const name of ['labStat', 'labNum1', 'labNum2']) {
    const label = labels[name] = new cc.Label();
    label.node = {name, getComponent: () => null};
  }
  language.bindLabel(labels.labStat, 'gear.stat.range');
  const source = fs.readFileSync(path.join(root, 'assets/_script/KinghtFallHomePersonCtrl.js'), 'utf8');
  const begin = source.indexOf('  _ctor.prototype.renderWeaponUpgrade = function '), end = source.indexOf('\n  };', begin);
  const method = vm.runInNewContext('(' + source.slice(source.indexOf('function ', begin), end + 4) + ')', {
    cc, require: name => name === 'LanguageMgr' ? {LanguageMgr} : {enabled: () => true, fields: (_config, _type, level) => [level * 2], formatted: String},
    $z1KinghtFallDataMgr: {KinghtFallDataMgr: {getInstance: () => ({data: {}})}},
    $z1KinghtFallPlayerMgr: {KinghtFallPlayerMgr: {getInstance: () => ({getUserData: () => ({getHeroWeapon: () => ({id: 'fighter'}), getPersonLevel: () => 2})})}}
  });
  const row = {type: 4, cfg: {levelInfo: [1, 2, 3]}, ndInfo: {getChildByName: () => ({getChildByName: name => ({getComponent: () => labels[name]})})}};
  method.call({}, row);
  assert.equal(labels.labStat.string, 'Attack Damage');
  assert.equal(labels.labNum1.string, '4'); assert.equal(labels.labNum2.string, '6');
  assert.equal(language.setCurrentLanguage('zh'), true);
  assert.equal(labels.labStat.string, '攻击伤害', 'The original range binding cannot return on a language change');
  assert.equal(labels.labNum1.string, '4'); assert.equal(labels.labNum2.string, '6');
});
