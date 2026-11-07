'use strict';
const assert=require('node:assert/strict'),test=require('node:test');
const {LanguageMgr}=require('../../assets/_script/LanguageMgr');
const catalog=require('../../assets/resources/localization/catalog.json');
test('combat numbers abbreviate only from ten thousand and retain signed values and rollover',()=>{
  const language=new LanguageMgr();language.setCatalog(catalog);language.setCurrentLanguage('en');
  for(const [value,expected]of [[0,'0'],[1,'1'],[2000,'2000'],[9999,'9999'],[10000,'10k'],[12345,'12.35k'],[100000,'100k'],[999999,'1mil'],[1000000,'1mil'],[32000000,'32mil'],[1000000000,'1bil'],[-20000,'-20k']])assert.equal(language.formatNumber(value,'battle'),expected,String(value));
  assert.equal(language.formatNumber(1000),'1K');assert.equal(language.formatNumber(1000000),'1M');
});
test('combat formatting survives nested boost recipes and language switches without changing numeric data',()=>{
  const language=new LanguageMgr();language.setCatalog(catalog);language.setCurrentLanguage('en');
  const value=32000000,formatted=language.format('{0}',[language.formatNumber(value,'battle')]),recipe=language._recipe(formatted);
  assert.equal(language._render(recipe,'en'),'32mil');assert.equal(language._render(recipe,'zh'),'3200万');assert.equal(recipe.params[0].__localizedRecipe.number,value);
  const boost=language.format('+{0}',[language.formatNumber(20000,'battle')]);assert.equal(boost,'+20k');
  assert.equal(language._render(language._recipe(boost),'zh'),'+2万');
});
