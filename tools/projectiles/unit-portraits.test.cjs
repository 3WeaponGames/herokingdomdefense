'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../..'),{ProjectilesService}=require('../../packages/hkd-projectiles/service');
test('every ranged picker entry resolves its configured imported portrait without writing gameplay data',()=>{
  const protectedFiles=['assets/KinghtFallConfig/GameJsonCfg.json','assets/resources/projectiles/catalog.json'],before=protectedFiles.map(file=>fs.readFileSync(path.join(root,file))),service=new ProjectilesService(root),snapshot=service.load();
  const cfg=service.config();assert.equal(snapshot.units.length,3+Object.values(cfg.SoldierCfg).filter(row=>row.AttackType===2).length+Object.values(cfg.AllyCfg).filter(row=>row.AttackType===2).length+cfg.BuildEnum[1].levelList.length+cfg.BuildEnum[2].levelList.length+cfg.BuildEnum[5].levelList.filter(row=>row.MillDefense&&row.MillDefense.kind==='scarecrow').length);assert.deepEqual(snapshot.units.filter(unit=>unit.key.startsWith('tower:5:')).map(unit=>[unit.key,unit.speed]),[['tower:5:2',450],['tower:5:3',450],['tower:5:4',450]]);
  for(const unit of snapshot.units){assert.equal(typeof unit.portrait,'string',unit.key+' has a portrait');assert(unit.portrait.startsWith('assets/'));assert(fs.existsSync(path.join(root,unit.portrait)),unit.key);assert(fs.existsSync(path.join(root,unit.portrait+'.meta')),unit.key+' retains imported metadata');}
  assert.equal(snapshot.units.find(unit=>unit.key==='enemy:90003').portrait,'assets/resources/icons/enemy-heads/carnivorous-plant.png');
  assert.equal(snapshot.units.find(unit=>unit.key==='enemy:94001').portrait,'assets/resources/icons/monster-roster/fantasy-bosses/blackdragon.png');
  assert.equal(snapshot.units.find(unit=>unit.key==='tower:2:7').portrait,'assets/KinghtFallIconBuild/painted-sniper-1.png');
  assert.equal(service.save({version:service.version}).result.saved,false);
  protectedFiles.forEach((file,index)=>assert.deepEqual(fs.readFileSync(path.join(root,file)),before[index]));
});
test('an unavailable configured portrait remains a read-only initials fallback',()=>{
  const service=new ProjectilesService(root),before=JSON.stringify(service.data),unit=service.units().find(unit=>unit.key==='enemy:90003');
  service.configData.SoldierCfg[90003].loadIcon='@icon/icons/no-such-profile-portrait';service.portraits.clear();
  assert.equal(service.portrait(unit),null);assert.equal(service.portrait(unit),null,'missing artwork uses the cached fallback');assert.equal(JSON.stringify(service.data),before);
});
