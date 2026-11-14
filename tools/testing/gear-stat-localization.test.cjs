'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), test = require('node:test'), vm = require('node:vm');
const root = path.resolve(__dirname, '../..');

test('all class secondary upgrades keep visible labels after native Label autosizing, including lifesteal and both dual stats',()=>{
 const Stats=require('../../assets/_script/HeroEquipmentStats'),Weapons=require('../../assets/_script/HeroWeapons'),config=require('../../assets/KinghtFallConfig/GameJsonCfg.json');
 class Label{}Label.Overflow={SHRINK:1};Label.HorizontalAlign={LEFT:0};Label.VerticalAlign={CENTER:0};
 class Node{
  constructor(name){this.name=name;this.active=true;this.children=[];this.width=this.height=0;}
  setParent(parent){this.parent=parent;parent.children.push(this);}getChildByName(name){return this.children.find(c=>c.name===name);}
  addComponent(){this.width=this.height=0;this.label=new Label();return this.label;}
  setContentSize(w,h){this.width=w;this.height=h;}setPosition(x,y){this.x=x;this.y=y;}destroyAllChildren(){}removeAllChildren(){this.children=[];}
 }
 const source=fs.readFileSync(path.join(root,'assets/_script/KinghtFallHomePersonCtrl.js'),'utf8'),begin=source.indexOf('  _ctor.prototype.renderWeaponUpgrade = function '),end=source.indexOf('\n  };',begin);
 let style='bruiser',level=1;
 const user={getHeroWeapon:()=>({id:style}),getPersonLevel:()=>level};
 const method=vm.runInNewContext('('+source.slice(source.indexOf('function ',begin),end+4)+')',{cc:{Node,Label,color:v=>v},require:()=>Stats,$z1KinghtFallDataMgr:{KinghtFallDataMgr:{getInstance:()=>({data:config})}},$z1KinghtFallPlayerMgr:{KinghtFallPlayerMgr:{getInstance:()=>({getUserData:()=>user})}}});
 for(const item of Weapons.styles){style=item.id;const layout=new Node('ndLay');for(const name of ['labStat','labNum1','labNum2','ndArr'])new Node(name).setParent(layout);
  const row={type:3,cfg:config.EquipCfg.find(c=>c.id===3),ndInfo:{getChildByName:()=>layout}};
  for(level of [1,2,50]){method.call({},row);const holder=layout.getChildByName('Secondary bonuses'),fields=Stats.fields(config,3,level,style);assert.equal(holder.children.length,fields.length);
   fields.forEach((field,i)=>{const node=holder.children[i];assert(node.width>0&&node.height>0,style+' '+field.key+' collapsed to zero width');assert(node.label.string.includes(field.label+': '+Stats.formatted(field)));assert.equal(node.label.string.includes(' → '),level<50);});
  }
 }
});

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
