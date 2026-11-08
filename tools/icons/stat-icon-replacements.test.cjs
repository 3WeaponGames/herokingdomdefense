'use strict';
const fs=require('node:fs'),path=require('node:path');
const assert=require('node:assert/strict'),{test}=require('node:test');
const Bindings=require('./stat-icon-replacements.cjs');
const JSONDocument=require('../../packages/game-data-editor/lib/json-document');
const root=path.resolve(__dirname,'../..');
const read=file=>JSON.parse(fs.readFileSync(path.join(root,file),'utf8'));
test('talent and battle-perk migration changes only artwork fields and preserves unknown data',()=>{
  const source=read('assets/KinghtFallConfig/GameJsonCfg.json');
  source.unknown={keep:[false,'legacy']};source.TalentCfg['100001'].futureSetting={untouched:true};
  const before=JSON.stringify(source),next=Bindings.mainConfig(source),changes=JSONDocument.diff(source,next);
  assert.equal(JSON.stringify(source),before,'planning cannot change its input');
  assert.equal(Object.keys(Bindings.talents).length,27);assert.equal(Object.keys(Bindings.perks).length,57);
  assert(changes.every(change=>change.path.at(-1)==='Image'&&['TalentCfg','BuffCfg'].includes(change.path[0])));
  assert.deepEqual(next.unknown,source.unknown);assert.deepEqual(next.TalentCfg['100001'].futureSetting,{untouched:true});
  for(const [id,name]of Object.entries(Bindings.talents))assert.equal(next.TalentCfg[id].Image,Bindings.reference(name));
  for(const [id,name]of Object.entries(Bindings.perks))assert.equal(next.BuffCfg.find(row=>String(row.ID)===id).Image,Bindings.reference(name));
  assert.deepEqual(Bindings.mainConfig(next),next,'repeated migration produces no new changes');
});
test('shared legacy filenames are replaced according to each effect rather than their old image alias',()=>{
  const main=Bindings.mainConfig(read('assets/KinghtFallConfig/GameJsonCfg.json'));
  assert.equal(main.TalentCfg['100002'].Image,Bindings.reference('soldier-attack-speed'));
  const perks=Object.fromEntries(main.BuffCfg.map(row=>[row.ID,row]));
  assert.equal(perks[50012].Image,Bindings.reference('tower-construction'));
  assert.equal(perks[50039].Image,Bindings.reference('tower-health'));
  assert.notEqual(perks[50012].Image,perks[50039].Image);
  const wall=Bindings.wallConfig(read('assets/gad_configs/GameJsonCfg.json'));
  assert.equal(wall.buffTypeCfg.find(row=>row.buffType==='ATKplus').buffIcon,Bindings.reference('attack-damage'));
  for(const type of ['speedPlus','speedSub','speedMultiply','speedDivision'])assert.equal(wall.buffTypeCfg.find(row=>row.buffType===type).buffIcon,Bindings.reference('attack-speed'),'Wall Defense speed changes firing cooldown, not movement');
});
test('Wall Defense replaces its twelve icon-bearing rows while preserving omitted fields and every gameplay value',()=>{
  const source=read('assets/gad_configs/GameJsonCfg.json'),before=JSON.stringify(source),next=Bindings.wallConfig(source);
  const rows=next.buffTypeCfg.filter(row=>Object.hasOwn(Bindings.wallDefense,row.buffType));assert.equal(rows.length,12);
  for(const row of rows)assert.equal(row.buffIcon,Bindings.reference(Bindings.wallDefense[row.buffType]));
  for(const type of ['levelPlus','levelSub'])assert(!Object.hasOwn(next.buffTypeCfg.find(row=>row.buffType===type),'buffIcon'));
  assert(JSONDocument.diff(source,next).every(change=>change.path[0]==='buffTypeCfg'&&change.path.at(-1)==='buffIcon'));
  assert.equal(JSON.stringify(source),before);
});
test('artwork bindings remain reversible through minimal JSON token patches',()=>{
  for(const [file,apply]of [['assets/KinghtFallConfig/GameJsonCfg.json',Bindings.mainConfig],['assets/gad_configs/GameJsonCfg.json',Bindings.wallConfig]]){
    const text=fs.readFileSync(path.join(root,file),'utf8'),before=JSON.parse(text),after=apply(before),patched=JSONDocument.patch(text,before,after);
    assert.deepEqual(JSON.parse(patched),after);
    assert.equal(JSONDocument.patch(patched,after,before),text,'all unrelated whitespace and authored tokens survive');
  }
});
