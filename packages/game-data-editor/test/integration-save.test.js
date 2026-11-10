'use strict';
const fs=require('fs'),path=require('path'),assert=require('assert');
const temporary=require('./owned-temp');
const root=path.resolve(__dirname,'../../..'),Store=require('../lib/store').Store,Files=require('../lib/store').files,Hash=require('../lib/store').hash;
const schema=require('../lib/schema'),maps=require('../lib/map-assets'),assets=require('../lib/asset-validation');
const temp=temporary('hkd-panels-save-'),original={};
const paths=Object.values(Files).concat(['assets/KinghtFallIconMap/Map01.prefab']);
paths.forEach(p=>{const source=fs.readFileSync(path.join(root,p));original[p]=Hash(source);fs.mkdirSync(path.dirname(path.join(temp,p)),{recursive:true});fs.writeFileSync(path.join(temp,p),source);});
const s=new Store(temp,{validators:[schema.validate,(d,c)=>maps.validate(d,c,root),(d,c)=>assets.validate(root,d,c)]});s.addMap('Map01');
const before=s.snapshot(),a=before.documents.A.data,perk=a.BuffCfg.findIndex(p=>p.ID===50053),talent=a.TalentLevelCfg.findIndex(t=>Array.isArray(t.EffectNumber)&&t.EffectNumber.length);
const edits=[
 {doc:'A',path:['LevelCfg',0,'WaveCfg',0,'SpawnTimeline',0,'count'],value:a.LevelCfg[0].WaveCfg[0].SpawnTimeline[0].count+1},
 {doc:'B',path:['LevelCfg',0,'WaveCfg',0,'StartSliver'],value:before.documents.B.data.LevelCfg[0].WaveCfg[0].StartSliver+1},
 {doc:'A',path:['BuffCfg',perk,'Pamer',0],value:.15},
 {doc:'A',path:['BuildEnum','1','levelList',0,'Hp'],value:a.BuildEnum['1'].levelList[0].Hp+1},
 {doc:'A',path:['EquipCfg',0,'levelInfo',0,'Parameters'],value:a.EquipCfg[0].levelInfo[0].Parameters+1},
 {doc:'A',path:['TalentLevelCfg',talent,'EffectNumber',0],value:a.TalentLevelCfg[talent].EffectNumber[0]+.01},
 {doc:'A',path:['SoldierCfg','90001','Health'],value:a.SoldierCfg['90001'].Health+1},
 {doc:'A',path:['ParameterCfg','60018','Value'],value:'0.45'},
 {doc:'overrides',path:['timings','enemy:90001:default'],value:{attack:.25}},
 {doc:'overrides',path:['parameters','buildStandTime'],value:1.25}
];
const node=maps.model(before.documents['map:Map01'].data).nodes.find(n=>n.kind==='obstacle');
edits.push(maps.moveEdit(before.documents['map:Map01'].data,node.id,{x:node.position.x+1,y:node.position.y},'map:Map01'));
s.change({version:s.version,edits});const errors=s.snapshot().issues.filter(i=>i.severity==='error');assert.deepStrictEqual(errors,[]);
paths.forEach(p=>assert.equal(Hash(fs.readFileSync(path.join(temp,p))),original[p],'draft wrote '+p));
const saved=s.save({version:s.version});assert(saved.result.saved);assert.deepStrictEqual(saved.result.files.sort(),['assets/KinghtFallConfig/GameJsonCfg.json','assets/KinghtFallConfigB/GameJsonCfg.json','assets/KinghtFallIconMap/Map01.prefab'].sort());
const reloaded=new Store(temp);assert.equal(reloaded.snapshot().dirty,false);assert.equal(reloaded.documents.A.data.LevelCfg[0].WaveCfg[0].SpawnTimeline[0].count,a.LevelCfg[0].WaveCfg[0].SpawnTimeline[0].count+1);assert.deepStrictEqual(reloaded.documents.A.data.LevelCfg[0].WaveCfg[0].RefreshSoldierKind,a.LevelCfg[0].WaveCfg[0].RefreshSoldierKind);assert.equal(reloaded.documents.A.data.BuffCfg[perk].Pamer[0],.15);assert.equal(reloaded.documents.A.data.GameTools.timings['enemy:90001:default'].attack,.25);assert.equal(reloaded.documents.A.data.ParameterCfg['60018'].Value,'0.45');
assert.equal(Hash(fs.readFileSync(path.join(temp,Files.D))),original[Files.D]);assert.equal(Hash(fs.readFileSync(path.join(temp,Files.catalog))),original[Files.catalog]);
const bytes=fs.readFileSync(path.join(temp,Files.A),'utf8');reloaded.save({version:reloaded.version});assert.equal(fs.readFileSync(path.join(temp,Files.A),'utf8'),bytes);
paths.forEach(p=>assert.equal(Hash(fs.readFileSync(path.join(root,p))),original[p],'live project was modified '+p));
console.log('PASS integrated saves for stages, variants, perks, buildings, equipment, talents, units, settings, scoped timing and maps on a temporary project; live data unchanged.');
