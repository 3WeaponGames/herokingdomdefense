'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'../..'),config=require('../../assets/KinghtFallConfig/GameJsonCfg.json'),catalog=require('../../assets/resources/localization/catalog.json');
const styles=[['skirmisher','Skirmisher','游击手'],['fighter','Fighter','斗士'],['vanguard','Vanguard','先锋'],['mystic','Mystic','秘术师'],['bruiser','Bruiser','猛攻者'],['guardian','Guardian','守卫']],stats=[['damage','Damage','伤害','伤害'],['speed','Attack speed','攻速','攻击速度'],['health','Health','血量','血量']];
test('all eighteen hero-style talents preserve exact English copy through localization tokens and translate every placeholder',()=>{
  const before=JSON.stringify([config,catalog]),sandbox={exports:{},Map,Set};vm.runInNewContext(fs.readFileSync(path.join(root,'assets/_script/LanguageMgr.js'),'utf8'),sandbox);const manager=new sandbox.exports.LanguageMgr();manager.setCatalog(catalog);
  for(const [statIndex,[stat,enStat,zhTitle,zhStat]]of stats.entries())for(const [styleIndex,[style,enRole,zhRole]]of styles.entries()){
    const id=101001+statIndex*6+styleIndex,row=config.TalentCfg[id];assert.equal(row.enumKey,'Hero_'+style+'_'+stat);assert.equal(catalog.entries['enemyGuide.role.'+style].zh,zhRole,'Use the existing role terminology');
    const expected={Name:{en:enRole+' · '+enStat,zh:zhRole+' · '+zhTitle},Describe:{en:enRole+' '+enStat.toLowerCase()+' +{0}. Applies only while '+enRole+' is equipped.',zh:zhRole+zhStat+'提高 {0}。仅在使用'+zhRole+'时生效。'}};
    for(const field of ['Name','Describe']){const key='data.talentcfg.'+id+'.'+field.toLowerCase(),entry=catalog.entries[key];assert.equal(row[field],'[[loc:'+key+']]');assert(entry,key);for(const language of ['en','zh']){assert.equal(entry[language],expected[field][language]);assert.deepEqual(entry[language].match(/\{\w+\}/g)||[],field==='Describe'?['{0}']:[]);manager.setCurrentLanguage(language);assert.equal(manager.T(row[field]),expected[field][language]);assert.equal(manager.T(row[field],['5%']),expected[field][language].replace('{0}','5%'));}}
  }
  assert.equal(Object.keys(manager._missing).length,0);assert.equal(JSON.stringify([config,catalog]),before,'Localization reads never rewrite talent data or catalog values');
});
