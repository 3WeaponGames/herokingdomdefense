'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),test=require('node:test');
const root=path.resolve(__dirname,'../..'),cfg=require('../../assets/KinghtFallConfig/GameJsonCfg.json'),catalog=require('../../assets/resources/localization/catalog.json');
test('the six selected roles cover every independent ally and enemy with individual names and portraits',()=>{
 assert.deepEqual(Object.values(cfg.GameTools.unitTypes).map(t=>t.name).sort(),['Fighter','Skirmisher','Vanguard','Mystic','Bruiser','Guardian'].sort());
 const aliases=Object.values(cfg.SoldierCfg).filter(unit=>unit.CampaignBaseUnit);
 assert.equal(Object.keys(cfg.AllyCfg).length,4);assert.equal(aliases.length,127);assert.equal(Object.keys(cfg.SoldierCfg).length,112+aliases.length);
 for(const [id,ally]of Object.entries(cfg.AllyCfg)){assert.notEqual(ally,cfg.SoldierCfg[id]);assert.notEqual(ally.Name,cfg.SoldierCfg[id].Name);assert(!ally.loadIcon.startsWith('@icon/icons/enemy-heads/'));}
 const legacy=Object.values(cfg.SoldierCfg).filter(unit=>!unit.MonsterSource&&!unit.CampaignBaseUnit), imported=Object.values(cfg.SoldierCfg).filter(unit=>unit.MonsterSource);
 assert.deepEqual(legacy.map(unit=>unit.ID).sort((a,b)=>a-b),Array.from({length:12},(_,i)=>90001+i));
 assert.deepEqual(imported.map(unit=>unit.ID).sort((a,b)=>a-b),Array.from({length:100},(_,i)=>91001+i));
 const name=unit=>catalog.entries[/\[\[loc:(.+)\]\]/.exec(unit.Name)[1]].en;
 assert.deepEqual(legacy.map(name),['Wolf','Bear','Plant Shooter','Buffalo','Alligator Turtle','Wizard','Iron Golem','Pirate Ghost','Vampire','Stone Scorpion','Tree Golem','Skeleton Warlord']);
 assert.equal(new Set(legacy.map(name)).size,12);
 assert.equal(new Set(imported.map(name)).size,100,'Every imported variant has its own display name');
 const sources=['monster1','monster2'].flatMap(pack=>require('../../assets/resources/unit-library/'+pack+'/catalog.json').units.map(unit=>unit.id));
 assert.deepEqual(imported.map(unit=>unit.MonsterSource).sort(),sources.sort(),'Both complete packs are independently selectable');
 for(const [id,enemy]of Object.entries(cfg.SoldierCfg)){
  assert(name(enemy));
  assert.match(enemy.loadIcon,enemy.MonsterSource||enemy.CampaignBaseUnit?/^@icon\/icons\/monster-roster\/(monster1|monster2)\//:/^@icon\/icons\/enemy-heads\//);
  assert(fs.existsSync(path.join(root,'assets/resources',enemy.loadIcon.slice(6)+'.png')));
  if(enemy.MonsterSource){assert.equal(cfg.AllyCfg[id],undefined);assert.equal(enemy.MonsterPack,enemy.MonsterSource.split('/')[0]);}
  const form=Number(id)>=90010&&Number(id)<=90012?Number(id)-90009:'default';
  assert(cfg.GameTools.unitTypes[cfg.GameTools.unitTypeAssignments['enemy:'+id+':'+form]],id+' has an independent combat role');
 }
 for(const unit of Object.values(cfg.SoldierCfg).concat(Object.values(cfg.AllyCfg))){assert.equal(typeof unit.CounterType,'string');assert(!unit.CounterType||cfg.GameTools.unitTypes[unit.CounterType]);}
});

test('campaign appearances map every spawning monster back to an authored legacy combat profile',()=>{
 const legacy=new Set(Array.from({length:12},(_,i)=>90001+i));let waves=0,groups=0;
 for(const stage of Object.values(cfg.LevelCfg))for(const wave of stage.WaveCfg){
  waves++;
  for(const group of wave.RefreshSoldierKind){
   if(!group)continue;
   const [lane,units]=group.split('#');assert(Number(lane)>0);assert(units);
   for(const entry of units.split(';')){
    const [id,count]=entry.split(',').map(Number);groups++;
    // -1 is the authored pause entry consumed by the wave queue.
    const base=cfg.SoldierCfg[id]&&cfg.SoldierCfg[id].CampaignBaseUnit||id;
    assert(id===-1||legacy.has(base),'Stage '+stage.Level+' wave '+wave.Wave+' lost its combat profile '+id);
    if(id!==-1)assert(cfg.SoldierCfg[id]);assert(Number.isFinite(count)&&count>0);
   }
  }
 }
 assert(waves>0&&groups>0);
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
