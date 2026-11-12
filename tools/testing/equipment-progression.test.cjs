'use strict';
const assert=require('node:assert/strict'),{test}=require('node:test'),{harness,config,clone}=require('./persistence-harness.cjs');
test('the real account validator migrates legacy equipment and inactive weapon progress once, while fresh accounts use the new levels immediately',()=>{
 const f=harness(),manager=f.modules.KinghtFallDataMgr.KinghtFallDataMgr.getInstance();manager.data=config;
 const User=f.load('KinghtFallUserData').KinghtFallUserData,legacy={...clone(f.player.udata.data),personLevel:[50,50,50,20,20,20],heroWeapon:{selected:'fighter',levels:{fighter:{3:27,4:20},mystic:{3:18,4:10}}},goldNum:54321,future:{keep:'yes'}};delete legacy.equipmentProgressionVersion;
 const writes=f.state.writes,result=f.player.udata.validateSaveRecord(legacy);assert.deepEqual(Array.from(result.personLevel),[50,50,50,25,25,25]);assert.equal(result.heroWeapon.levels.mystic[4],13);assert.equal(result.heroWeapon.levels.mystic[3],18);assert.equal(result.heroWeapon.selected,'fighter');assert.equal(result.goldNum,54321);assert.equal(result.future.keep,'yes');assert.equal(f.state.writes,writes,'Validation does not save progress');
 const once=JSON.stringify(result);f.player.udata.validateSaveRecord(result);assert.equal(JSON.stringify(result),once);
 const empty=f.player.udata.validateSaveRecord({...clone(f.player.udata.data),personLevel:[],heroWeapon:{selected:'fighter',levels:{fighter:'broken',mystic:[]}}});assert.equal(empty.personLevel.length,0);assert.equal(empty.heroWeapon.levels.fighter,undefined);assert.equal(empty.heroWeapon.levels.mystic,undefined);
 const fresh=new User();fresh.createData();fresh.data.personLevel=[1,1,1,10,10,10];assert.equal(fresh.data.equipmentProgressionVersion,config.EquipmentProgression.version);fresh.validateSaveRecord(fresh.data);assert.deepEqual(Array.from(fresh.data.personLevel),[1,1,1,10,10,10]);
 f.player.udata.data=result;f.player.udata.saveData();const reloaded=harness(f.persist());assert.deepEqual(Array.from(reloaded.player.udata.data.personLevel),[50,50,50,25,25,25]);assert.equal(reloaded.player.udata.data.equipmentProgressionVersion,config.EquipmentProgression.version);
});
