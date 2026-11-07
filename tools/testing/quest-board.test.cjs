'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),Core=require('../../assets/_script/QuestBoardCore'),{harness,config,clone}=require('./persistence-harness.cjs');
const get=id=>config.TaskCfg.find(row=>row.ID===id),context={stage:1,wave:0};
test('migration preserves the active quest and issues only three slots; completed unclaimed quests never generate replacements',()=>{
 const data={taskInfo:{id:11,type:10,num:50,stage:1,legacy:'kept'}};Core.initialize(data,get);assert.deepEqual(data.quests.map(q=>q.id),[11,12,13]);assert.equal(data.quests[0].legacy,'kept');const before=JSON.stringify(data);
 for(let i=0;i<20;i++)Core.refresh(data,get,context);assert.equal(JSON.stringify(data),before);assert.equal(data.quests.length,3);
});
test('claiming two completed slots issues exactly two new quests and preserves the remaining slot and progress',()=>{
 const data={quests:[{id:11,type:10,num:50,stage:1},{id:12,type:2,num:0,stage:1},{id:19,type:10,num:17,stage:0}],questCursor:20};
 assert(Core.claim(data,11,get));assert.deepEqual(data.quests.map(q=>q.id),[20,12,19]);assert.equal(data.quests[2].num,17);assert(!Core.claim(data,11,get));assert(Core.claim(data,12,get));assert.deepEqual(data.quests.map(q=>q.id),[20,21,19]);
});
test('type-specific monster kills count only their assigned role, while generic monster quests count every enemy death',()=>{
 const data={taskInfo:{id:1,type:2,num:0,stage:0}};Core.initialize(data,get);const fighter=data.quests[1];assert.equal(fighter.type,11);assert.equal(fighter.definition.UnitType,'fighter');data.quests[2]={id:19,type:10,num:0,stage:0};
 Core.record(data,10,3,false,'skirmisher');Core.refresh(data,get,context);assert.equal(fighter.num,0);assert.equal(data.quests[2].num,3);
 Core.record(data,10,5,false,'fighter');Core.refresh(data,get,context);assert.equal(fighter.stage,1);assert.equal(data.quests[2].num,8);Core.record(data,10,100,false,'fighter');assert.equal(fighter.num,5);assert.equal(data.quests.length,3);
 const legacy={taskInfo:{id:2,type:10,num:17,stage:0}};Core.initialize(legacy,get);assert.equal(legacy.quests[0].type,10);assert.equal(Core.definition(legacy.quests[0],get).Argument[0],30,'existing generic progress does not become five role kills');
});
test('quest claims, rewards and replacements persist together and stale duplicate claims cannot award again',()=>{
 const h=harness(),p=h.player,m=p.missionData;p.udata.data.maxStage=3;p.udata.data.maxOrder=5;
 m.data.quests=[{id:11,type:10,num:50,stage:1},{id:12,type:2,num:0,stage:1},{id:19,type:10,num:0,stage:0}];m.data.questCursor=20;m.data.taskInfo=m.data.quests[0];m.saveData();const gold=p.udata.getGoldNum();
 const claim=id=>p.claimRewards([{id:get(id).Award[0],num:get(id).Award[1]}],1,null,()=>m.claimQuest(id),()=>m.getQuests().some(q=>q.id===id&&q.stage===1));
 assert(claim(11));assert(claim(12));assert.equal(claim(11),null);assert.equal(p.udata.getGoldNum(),gold+get(11).Award[1]+get(12).Award[1]);assert.deepEqual(Array.from(m.getQuests(),q=>q.id),[20,21,19]);assert.equal(m.getQuests().find(q=>q.id===19).num,0);
 const reboot=harness(h.persist());reboot.player.restorePendingRewards();assert.deepEqual(Array.from(reboot.player.missionData.getQuests(),q=>q.id),[20,21,19]);assert.equal(reboot.player.udata.getGoldNum(),p.udata.getGoldNum());
});
test('authored kill-quest wording uses monsters and only the six current roles, preserving original IDs and rewards',()=>{
 const entries=require('../../assets/resources/localization/catalog.json').entries,types=config.GameTools.unitTypes,roles=new Set();
 for(const cfg of config.TaskCfg){const en=entries[cfg.MissionDescribe.slice(6,-2)].en;assert(!/enemy soldiers?|defeat.*(?:cavalry|infantry|archer|crossbow)/i.test(en));if(cfg.RoleQuest){roles.add(cfg.RoleQuest.unitType);assert(types[cfg.RoleQuest.unitType]);assert.equal(cfg.RoleQuest.count,5);assert(!/brawler|cavalry/i.test(entries[cfg.RoleQuest.description.slice(6,-2)].en));}}
 assert.equal(roles.size,6);
});
