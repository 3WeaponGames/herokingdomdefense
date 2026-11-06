'use strict';
const assert = require('node:assert/strict');
const storage = new Map();
class Label {
  constructor() { this.node = {name:'Test',_localizationGenerated:false}; this._string=''; }
  get string() { return this._string; }
  set string(value) { this._string=String(value); }
  onEnable() {}
}
class RichText extends Label {}
// Cocos defines the accessor directly on each component prototype.
Object.defineProperty(RichText.prototype,'string',Object.getOwnPropertyDescriptor(Label.prototype,'string'));
class Sprite {}
global.cc = {Label,RichText,Sprite,sys:{localStorage:{getItem:key=>storage.get(key),setItem:(k,v)=>storage.set(k,v)}},
  isValid:object=>!object.destroyed, director:{on(){},getScene(){return null;}},Director:{EVENT_AFTER_SCENE_LAUNCH:'scene'} };
const Manager = require('../../assets/_script/LanguageMgr.js').LanguageMgr;
const manager = new Manager();
const catalog = {defaultLanguage:'en',languages:[{code:'en'},{code:'zh'}],images:{},entries:{
  title:{en:'Wave {0}',zh:'第{0}波'},gem:{en:'Gems',zh:'钻石'},nested:{en:'Get [[loc:gem]]',zh:'获得[[loc:gem]]'},
  missing:{en:'English fallback',zh:''}
},numberFormats:{en:{base:1000,suffixes:['','K','M']},zh:{base:10000,suffixes:['','万','亿']}}};
manager.setCatalog(catalog);
assert.equal(manager.getCurrentLanguage(),'en');
assert.equal(manager.t('title',[5]),'Wave 5');
assert.equal(manager.t('nested'),'Get Gems');
const label=new Label();label.string='[[loc:gem]]';
const formatted=new Label();formatted.string=manager.format(manager.T('title'),[7]);
const wrapped=new RichText();wrapped.string=manager.format('<b>{0}</b>',[manager.T('gem')]);
const numeric=new Label();numeric.string=manager.formatNumber(12000);
manager.setCurrentLanguage('zh');
assert.equal(label.string,'钻石');assert.equal(formatted.string,'第7波');assert.equal(wrapped.string,'<b>钻石</b>');assert.equal(numeric.string,'1.2万');
assert.equal(storage.get('project-cocos.language'),'zh');
assert.equal(manager.T('missing'),'English fallback');
assert.deepEqual(manager.getAudit().missing,['missing:zh']);
assert.equal(manager.setCurrentLanguage('xx'),false);
manager.setCurrentLanguage('en');assert.equal(formatted.string,'Wave 7');assert.equal(numeric.string,'12K');
label.string='User-supplied player name';manager.setCurrentLanguage('zh');assert.equal(label.string,'User-supplied player name');
formatted.destroyed=true;manager.refresh();assert(!manager._labels.has(formatted));
manager.setCatalog(catalog);assert.equal(manager.getCurrentLanguage(),'zh');
assert.equal(manager.format('{0}', ['$&']), '$&');
assert.equal(manager.t('title'), '第{0}波');
console.log('PASS: English default, persistence, validation/fallback, templates, nested rich text, live labels/numbers, user text, destroyed label cleanup.');
