'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),test=require('node:test');
const root=path.resolve(__dirname,'../..'),cfg=require('../../assets/KinghtFallConfig/GameJsonCfg.json'),catalog=require('../../assets/resources/localization/catalog.json');
test('the six selected roles cover every independent ally and enemy with individual names and portraits',()=>{
 assert.deepEqual(Object.values(cfg.GameTools.unitTypes).map(t=>t.name).sort(),['Fighter','Skirmisher','Vanguard','Mystic','Bruiser','Guardian'].sort());
 assert.equal(Object.keys(cfg.AllyCfg).length,4);assert.equal(Object.keys(cfg.SoldierCfg).length,12);
 for(const [id,ally]of Object.entries(cfg.AllyCfg)){assert.notEqual(ally,cfg.SoldierCfg[id]);assert.notEqual(ally.Name,cfg.SoldierCfg[id].Name);assert(!ally.loadIcon.startsWith('@icon/icons/enemy-heads/'));}
 const names=new Set();for(const [id,enemy]of Object.entries(cfg.SoldierCfg)){const token=/\[\[loc:(.+)\]\]/.exec(enemy.Name)[1];names.add(catalog.entries[token].en);assert.match(enemy.loadIcon,/^@icon\/icons\/enemy-heads\//);assert(fs.existsSync(path.join(root,'assets/resources',enemy.loadIcon.slice(6)+'.png')));}
 assert.equal(names.size,12);
 for(const unit of Object.values(cfg.SoldierCfg).concat(Object.values(cfg.AllyCfg))){assert.equal(typeof unit.CounterType,'string');assert(!unit.CounterType||cfg.GameTools.unitTypes[unit.CounterType]);}
});
test('runtime ally lookup returns its own record while legacy data without a split retains its original lookup',()=>{
 const context={exports:{},require:()=>({})};vm.runInNewContext(fs.readFileSync(path.join(root,'assets/_script/KinghtFallDataMgr.js'),'utf8'),context);const mgr=new context.exports.KinghtFallDataMgr();mgr.data=structuredClone(cfg);
 const ally=mgr.getSoldierCfgById(90001,'ally'),enemy=mgr.getSoldierCfgById(90001);assert.notEqual(ally,enemy);const hp=enemy.Health;ally.Health+=123;assert.equal(enemy.Health,hp);assert.equal(mgr.getSoldierCfgById(90001,'enemy'),enemy);delete mgr.data.AllyCfg;assert.equal(mgr.getSoldierCfgById(90001,'ally'),enemy);
});
test('counter bonuses match the target role across different unit IDs, with separate sides, boss forms and legacy fallback',()=>{
 const settings={unitTypeAssignments:{'enemy:90001:default':'fighter','enemy:90002:default':'fighter','enemy:90003:default':'skirmisher','ally:90001:default':'guardian','enemy:90011:2':'guardian'}};
 const context={exports:{},require:id=>{assert.equal(id,'KinghtFallDataMgr');return{KinghtFallDataMgr:{getInstance:()=>({data:{GameTools:settings}})}};}};vm.runInNewContext(fs.readFileSync(path.join(root,'assets/_script/GameToolsOverrides.js'),'utf8'),context);const counters=context.exports.counters,source={cfg:{CounterType:'fighter',Suppressed:90003}},enemy=id=>({cfg:{ID:id},navigationTeam:'enemy'});
 assert(counters(source,enemy(90001)));assert(counters(source,enemy(90002)));assert(!counters(source,enemy(90003)));assert(!counters(source,{cfg:{ID:90001},navigationTeam:'friendly'}));
 source.cfg.CounterType='guardian';assert(counters(source,{cfg:{ID:90011},spIdx:1,navigationTeam:'enemy'}));assert(!counters(source,{cfg:{ID:90011},spIdx:0,navigationTeam:'enemy'}));
 source.cfg.CounterType='';assert(!counters(source,enemy(90003)));delete source.cfg.CounterType;assert(counters(source,enemy(90003)));assert(!counters(source,enemy(90002)));assert(!counters(source,{}));
});
