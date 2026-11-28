'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),os=require('node:os');
const W=require('../worlds/wave-editor'),Catalog=require('../worlds/unit-catalog'),{Service}=require('../worlds/service');
const Kingdoms=require('../lib/unit-kingdoms');
const clone=value=>JSON.parse(JSON.stringify(value));
function stage(){return{spawns:[{id:1,enabled:true},{id:2,enabled:true}],graphs:[{id:'route',spawnIds:[1]}],config:{WaveCfg:[{id:7,Wave:1,FutureWave:{keep:true},SpawnTimeline:[{id:'original',unitId:3,spawnId:1,count:7,startSeconds:3.5,intervalSeconds:.75,routeGraphId:'route',future:{keep:[1,2]}},{id:'other',unitId:4,spawnId:2,count:1,startSeconds:1,intervalSeconds:1}]}]}};}
const settings={spawnId:1,count:7,startSeconds:3.5,intervalSeconds:.75};
test('multi-selection adds each chosen model exactly once and rejects the entire batch on an invalid choice',()=>{
 const s=stage(),before=clone(s);W.chooseGroups(s,0,[5,6,5],settings,.5);assert.deepEqual(s.config.WaveCfg[0].SpawnTimeline.slice(0,2),before.config.WaveCfg[0].SpawnTimeline);assert.deepEqual(s.config.WaveCfg[0].SpawnTimeline.slice(2).map(row=>row.unitId),[5,6]);
 for(const bad of [[],[5,-1]]){const current=clone(s);assert.throws(()=>W.chooseGroups(s,0,bad,settings,.5),/Select at least|valid unit/);assert.deepEqual(s,current);}
});
test('Switch replaces the original group in place and additional choices inherit settings while preserving source metadata',()=>{
 const s=stage(),before=clone(s);W.chooseGroups(s,0,[5,6],settings,.5,'original');const rows=s.config.WaveCfg[0].SpawnTimeline;
 assert.deepEqual(rows[0],Object.assign({},before.config.WaveCfg[0].SpawnTimeline[0],{unitId:5}));assert.deepEqual(rows[1],before.config.WaveCfg[0].SpawnTimeline[1]);assert.equal(rows[2].unitId,6);for(const key of Object.keys(settings))assert.equal(rows[2][key],settings[key]);assert.equal(rows[2].routeGraphId,'route');assert.deepEqual(s.config.WaveCfg[0].FutureWave,{keep:true});
});
test('keeping the initial selection adds other models and leaves the original intact; unchanged Switch preserves even legacy format',()=>{
 const s=stage(),before=clone(s);W.chooseGroups(s,0,[6,3],settings,.5,'original');assert.deepEqual(s.config.WaveCfg[0].SpawnTimeline[0],before.config.WaveCfg[0].SpawnTimeline[0]);assert.equal(s.config.WaveCfg[0].SpawnTimeline[2].unitId,6);
 for(const wave of [before.config.WaveCfg[0],{id:7,Wave:1,RefreshSoldierKind:['1#3,2'],future:{keep:true}}]){const legacy=stage();legacy.config.WaveCfg=[clone(wave)];const entry=W.entries(wave,.5)[0],snapshot=clone(legacy);W.chooseGroups(legacy,0,[entry.unitId],{count:entry.count,spawnId:entry.spawnId,startSeconds:entry.startSeconds,intervalSeconds:entry.intervalSeconds},.5,entry.id);assert.deepEqual(legacy,snapshot);}
});
test('Switch clears only an unrelated route when the spawn changes, including on added groups',()=>{
 const s=stage();W.chooseGroups(s,0,[5,6],Object.assign({},settings,{spawnId:2}),.5,'original');const rows=s.config.WaveCfg[0].SpawnTimeline;assert.equal(rows[0].routeGraphId,null);assert(!rows[2].routeGraphId);assert.deepEqual(rows[0].future,{keep:[1,2]});
});
test('the wave row puts the Units default first and applies its exact profile to the draft',()=>{
 const node=text=>({
  children:[],get textContent(){return text;},set textContent(value){text=value;this.children.length=0;},
  appendChild(child){this.children.push(child);},setAttribute(){}
 });
 const buttons=[],fields={},opened=[],chosen=[];
 const c={el:(_tag,text)=>node(text),button(parent,title,action){const n=node(title);n.onclick=action;parent.appendChild(n);buttons.push(n);return n;},
  field(parent,title,value,action,choices){const n=node(title);n.value=String(value);n.onchange=next=>action(typeof value==='number'?Number(next):next);
   for(const choice of choices)n.appendChild(Object.assign(node(choice.label),{value:String(choice.value)}));fields[title]=n;parent.appendChild(n);return n;},
  openUnitEditor:id=>opened.push(id)};
 const units=[{id:101685,name:'Abyssal Slime',modelKey:'slime',unitType:'fighter',unitTypeName:'Fighter',fightingProfile:true},
  {id:91157,name:'Abyssal Slime',modelKey:'slime',unitType:'bruiser',unitTypeName:'Bruiser',fightingProfile:true,defaultProfile:true},
  {id:101845,name:'Abyssal Slime',modelKey:'slime',unitType:'wrecker',unitTypeName:'Wrecker',fightingProfile:true},
  {id:90001,name:'Wolf',modelKey:'wolf'}];
 const s=stage();s.config.WaveCfg[0].SpawnTimeline[0].unitId=101685;
 const before=clone(s),mount=require('../worlds/unit-picker').unitField;
 const apply=id=>{chosen.push(id);W.editGroup(s,0,'original',{unitId:id},.5);};
 mount(c,node(),units,101685,apply,()=>{},()=>{});
 assert.deepEqual(buttons.map(button=>button.textContent),['Switch','Profiles…','Unit Editor']);
 assert.equal(fields.Profile.value,'101685');
 assert.deepEqual(fields.Profile.children.map(option=>option.textContent),['Default (Bruiser)','Fighter','Bruiser','Wrecker']);
 assert.deepEqual(s,before);
 fields.Profile.onchange('default');buttons[2].onclick();
 const expected=clone(before);expected.config.WaveCfg[0].SpawnTimeline[0].unitId=91157;
 assert.deepEqual(s,expected);
 fields.Profile.onchange('default');
 fields.Profile.onchange('101685');buttons[2].onclick();
 fields.Unit.onchange('wolf');assert(!fields.Profile.children.some(option=>option.value==='default'));
 fields.Unit.onchange('slime');assert.equal(fields.Profile.value,'default');
 assert.deepEqual(chosen,[91157,101685,90001,91157]);
 assert.deepEqual(opened,[91157,101685]);
 const updated=units.map(unit=>({...unit,defaultProfile:unit.id===101685}));
 mount(c,node(),updated,91157,apply,()=>{},()=>{});
 assert.equal(fields.Profile.children[0].textContent,'Default (Fighter)');
 assert.equal(fields.Profile.value,'91157');
 assert.deepEqual(s,expected);
 fields.Profile.onchange('default');assert.deepEqual(s,before);
});
test('catalog resolves descriptions and filters, including the source asset pack of campaign appearances, without changing config',()=>{
 const config={SoldierCfg:{3:{Name:'[[loc:name]]',Guide:{description:'[[loc:description]]'},prefab:'model',MonsterPack:'monster2'},4:{Name:'Campaign',prefab:'campaign',AppearanceSourceUnit:3},90011:{Name:'Boss form',prefab:'model'}},GameTools:{unitTypes:{mystic:{name:'Mystic'}},unitTypeAssignments:{'enemy:3:default':'mystic'}}},before=clone(config),rows=Catalog.rows(config,{entries:{name:{en:'Acolyte'},description:{en:'Heals nearby allies with radiant spells.'}}});
 assert.equal(rows.length,2);assert.equal(rows[0].description,'Heals nearby allies with radiant spells.');assert.equal(rows[0].unitType,'mystic');assert.equal(rows[1].assetPack,'monster2');assert(Catalog.matches(rows[0],'radiant heals'));assert(!Catalog.matches(rows[0],'radiant archer'));assert.deepEqual(config,before);
});

test('enemy classes distinguish profiles of one model without changing combat roles, stats or saved records',()=>{
 const config={SoldierCfg:{1:{ID:1,Name:'Slime',prefab:'slime',MonsterSource:'monster1/Slime',Health:40,AttackDamage:10},2:{ID:2,Name:'Slime',prefab:'slime-elite',AppearanceSourceUnit:1,Health:60,AttackDamage:15},3:{ID:3,Name:'Slime',prefab:'slime-boss',AppearanceSourceUnit:1,Health:200,AttackDamage:30},90010:{ID:90010,Name:'Legacy boss',prefab:'boss'},91001:{ID:91001,Name:'Boss model',prefab:'dragon',MonsterPack:'fantasy-bosses'}},GameTools:{unitTypes:{fighter:{name:'Fighter'}},unitTypeAssignments:{'enemy:2:default':'fighter'},enemyClasses:{'enemy:2:default':'elite','enemy:3:default':'boss'}}},before=clone(config),rows=Catalog.rows(config,{entries:{}}),byId=id=>rows.find(unit=>unit.id===id);
 assert.deepEqual(rows.map(unit=>[unit.id,unit.enemyClass,unit.enemyClassName]),[[1,'normal','Normal'],[2,'elite','Elite'],[3,'boss','Boss'],[90010,'boss','Boss'],[91001,'normal','Normal']]);
 assert.deepEqual(Catalog.groups(rows).find(group=>group.units.some(unit=>unit.id===1)).units.map(unit=>unit.id),[1,2,3]);
 assert.equal(byId(2).unitType,'fighter');assert.equal(byId(2).health,60);assert.equal(byId(2).damage,15);assert(Catalog.matches(byId(2),'slime elite'));assert(!Catalog.matches(byId(1),'slime elite'));
 const labels=Catalog.optionLabels(rows);assert(labels.get(1).includes('Normal'));assert(labels.get(2).includes('Elite'));assert(labels.get(3).includes('Boss'));assert.equal(new Set(labels.values()).size,rows.length);
 assert.deepEqual(config,before);assert(!Object.hasOwn(config.GameTools.enemyClasses,'enemy:1:default'));
});

test('the Waves roster shows standard profiles and Wreckers with their kingdoms',()=>{
 const root=path.resolve(__dirname,'../../..'),config=JSON.parse(fs.readFileSync(path.join(root,'assets/KinghtFallConfig/GameJsonCfg.json'))),before=clone(config),localization=JSON.parse(fs.readFileSync(path.join(root,'assets/resources/localization/catalog.json'))),characters=JSON.parse(fs.readFileSync(path.join(root,'assets/resources/characters/catalog.json'))),rows=Catalog.rows(config,localization,null,characters),groups=Catalog.groups(rows);
 const profiles=config.GameTools.unitProfiles;
 assert.equal(groups.length,Object.keys(profiles.families).filter(id=>!profiles.aliases[id]).length);
 assert.equal(new Set(groups.map(group=>group.units[0].name.toLowerCase())).size,groups.length);
 const pirates=groups.filter(group=>group.units[0].name==='Corsair Wraith');
 assert.equal(pirates.length,1);assert(pirates[0].units.some(unit=>unit.id===91081));
 const scorpions=groups.filter(group=>group.units[0].name==='Stone Scorpion');
 assert.equal(scorpions.length,1);assert(scorpions[0].units.some(unit=>unit.id===91090));
 for(const [role,id] of Object.entries(profiles.families[90010].profiles)){
  assert.equal(profiles.aliases[id],profiles.families[91090].profiles[role]);
  assert(!rows.some(unit=>unit.id===id));
 }
 for(const group of groups){const baseId=Number(group.key.split(':')[1]),family=profiles.families[baseId];assert.equal(group.units.length,Object.keys(family.profiles).length);assert.equal(Catalog.firstProfile(group.units).id,family.defaultProfileId??baseId);assert.equal(new Set(group.units.map(Catalog.profileLabel)).size,group.units.length);assert(group.units.every(unit=>unit.profileKind==='Fighting type'));}
 const wreckers=rows.filter(unit=>unit.unitType==='wrecker');
 const wreckerAttacks={
  slime:['Ram Slime','melee','single','castle'],
  'sun-tomb':['Green Cactus','melee','single','buildings-first'],
  plant:['Spiky Plant','ranged','splash','buildings-first'],
  skeleton:['Grave Goby','ranged','single','castle'],
  orc:['Rhino Armor','melee','splash','castle'],
  ice:['Winter Iron','melee','splash','buildings-first'],
  demon:['Hellgate Behemoth','melee','splash','castle']
 };
 assert.deepEqual(wreckers.map(unit=>unit.kingdom).sort(),Kingdoms.CHOICES.map(choice=>choice.value).filter(value=>value!=='unassigned').sort());
 for(const unit of wreckers){
  assert.equal(unit.defaultProfile,true);
  assert.equal(unit.flight,false);
  const targeting=config.SoldierCfg[unit.id].EnemyTargeting.mode;
  assert.deepEqual([unit.name,unit.attack.delivery,unit.attack.pattern,targeting],wreckerAttacks[unit.kingdom]);
  assert(config.LevelCfg.slice(0,14).some(stage=>stage.WaveCfg.some(wave=>wave.SpawnTimeline?.some(row=>row.unitId===unit.id))),unit.name);
 }
 const namesIn=kingdom=>groups.filter(group=>group.units[0].kingdom===kingdom).map(group=>{
  assert(group.units.every(unit=>unit.kingdom===kingdom&&unit.name===group.units[0].name));
  return group.units[0].name;
 }).sort();
 assert.deepEqual(namesIn('sun-tomb'),[
  'Black Plague','Blood Beetle','Carrion Bird','Evilmass Knight','Green Cactus','Larva Knight','Plague Doctor','Purple Scorpion',
  'Worm Lightning','Worm Poison'
 ]);
 assert.deepEqual(namesIn('plant'),[
  'Flower Daisy','Flower Mantis','Fungus Rock','Hornet Bee','Iron Fly','Iron Golem',
  'Mushroom Walker','Pitcher Plant','Pumpkin Orange','Spiky Plant','Stump Walker'
 ]);
 assert(rows.filter(unit=>unit.kingdom==='plant').every(unit=>Catalog.matches(unit,'nature kingdom deep forest')));
 const natureGroups=groups.filter(group=>Catalog.firstProfile(group.units).kingdom==='plant');
 const natureBosses=natureGroups.map(group=>Catalog.firstProfile(group.units)).filter(unit=>unit.enemyClass==='boss');
 assert.deepEqual(natureBosses.map(unit=>unit.name).sort(),['Iron Golem','Stump Walker']);
 assert(natureGroups.find(group=>group.units[0].name==='Iron Fly').units.every(unit=>unit.enemyClass==='elite'));
 assert(!rows.some(unit=>unit.name==='Thorn Warden'||unit.name==='Evilmass Dagger'||unit.name==='Shrouded Revenant'));
 assert.deepEqual(namesIn('skeleton'),[
  'Corsair Wraith','Drowned Octopus','Grave Goby','Grizzly Bear','Larva Leech','Reaper Death',
  'Skeleton Soldier','Skeleton Warlord','Venom Spider','Wing Demon Vampire'
 ]);
 assert(rows.some(unit=>unit.name==='Crimson Vampire Lord'&&unit.kingdom==='unassigned'));
 assert.deepEqual(groups.filter(group=>group.units[0].kingdom==='skeleton'&&group.units[0].enemyClass==='boss').map(group=>group.units[0].name),['Skeleton Warlord']);
 assert.deepEqual(namesIn('orc'),[
  'Orc Shaman','Orc Smasher Berserker','Orc Smasher Red',
  'Orc Sword Butcher','Orc Sword Rookie','Orc Sword Veteran','Orc War Toad','Orc Wyvern','Raptor Swamp','Rhino Armor'
 ]);
 for(const name of ['Skeleton Bird','Skeleton Haunt','Skeleton Rhino','Skeleton King','Glacier Yeti','Feral Ghoul',
  'Crypt Ghoul','Scarbrow Vampire','Orc War Raptor','Orc War Beast','Hellforge Colossus','Blood Ant']){
  assert(!rows.some(unit=>unit.name===name),name+' was retired');
 }
 const orcGroups=groups.filter(group=>group.units[0].kingdom==='orc');
 assert.deepEqual(orcGroups.filter(group=>group.units.every(unit=>unit.enemyClass==='boss')).map(group=>group.units[0].name),['Orc Smasher Red']);
 assert(orcGroups.find(group=>group.units[0].name==='Orc Sword Butcher').units.every(unit=>unit.enemyClass==='elite'));
 assert(!rows.some(unit=>unit.name==='Orc Siege Chief'||unit.name==='Orc Crimson Guard'));
 assert.deepEqual(namesIn('ice'),[
  'Ice Beetle','Ice Jellyfish','Ice Octopus','Orc Smasher Warlord','Skeleton Warrior',
  'Snow Crab','Snow Fairy','Winter Iron','Winter Snow','Wizard'
 ]);
 for(const name of ['Polar Bear','Snow Bird','Snow Cactus','Winter Ice'])assert(namesIn('unassigned').includes(name),name);
 assert.deepEqual(groups.filter(group=>group.units[0].kingdom==='sun-tomb'&&group.units[0].enemyClass==='boss').map(group=>group.units[0].name),['Plague Doctor']);
 assert.deepEqual(namesIn('demon'),[
  'Black Goat','Carapace Iron','Crimson Regent','Demon Wolf','Devil Bee','Fire Lizard','Hellgate Behemoth',
  'Horn Rabbit Demon','Horse Nightmare','Pyre Executioner','Wing Demon Eye'
 ]);
 const spider=groups.find(group=>group.units[0].name==='Venom Spider');
 assert.equal(Catalog.firstProfile(spider.units).enemyClass,'elite');
 assert.equal(Catalog.firstProfile(spider.units).unitType,'mystic');
 assert(!rows.some(unit=>unit.name==='Relic Cantor'));
 const nightmare=groups.find(group=>group.units[0].name==='Horse Nightmare');
 assert.equal(Catalog.firstProfile(nightmare.units).unitType,'vanguard');
 assert(!rows.some(unit=>unit.name==='Skeleton Bat'||unit.name==='Fire Raptor'));
 const rabbit=groups.find(group=>group.units[0].name==='Horn Rabbit Demon');
 assert(rabbit.units.every(unit=>unit.enemyClass==='elite'));
 assert.equal(Catalog.firstProfile(rabbit.units).unitType,'bruiser');
 assert(!rows.some(unit=>unit.name==='Cinderhorn Demon'));
 const kingdomLabels=new Map(Kingdoms.options(rows).map(({value,label})=>[value,label]));
 assert.equal(kingdomLabels.get('skeleton'),'Undead Kingdom · Snow');
 assert.equal(kingdomLabels.get('demon'),'Demon Kingdom · Fire');
 assert.equal(kingdomLabels.get('ice'),'Ice Kingdom · Ice');
 assert.deepEqual(groups.filter(group=>group.units[0].kingdom==='ice'&&group.units[0].enemyClass==='boss').map(group=>group.units[0].name),['Orc Smasher Warlord']);
 assert(!Kingdoms.CHOICES.some(choice=>choice.value==='vampire'));
 const slimes=groups.map(group=>group.units[0].name).filter(name=>/\bslime\b/i.test(name)).sort();
 assert(slimes.includes('Flying Slime'));assert.deepEqual(namesIn('slime'),slimes);
 for(const [id,name,pack] of [[91010,'Carrion Bird','monster1'],[91071,'Black Plague','monster2']]){
  for(const profileId of Object.values(profiles.families[id].profiles)){
   const unit=rows.find(unit=>unit.id===profileId),token=config.SoldierCfg[profileId].Name.slice(6,-2);
   assert.equal(unit.name,name);assert.equal(unit.assetPack,pack);assert.equal(localization.entries[token].en,name);
   assert(Catalog.matches(unit,'desert '+name));
  }
 }
 const slime=groups.find(group=>group.units.some(unit=>unit.id===91157)),defaultSlime=Catalog.firstProfile(slime.units);
 assert.equal(defaultSlime.unitType,'bruiser');
 const draft=stage(),fighter=slime.units.find(unit=>unit.unitType==='fighter');
 W.chooseGroups(draft,0,[defaultSlime.id],settings,.5);
 const added=draft.config.WaveCfg[0].SpawnTimeline.at(-1);assert.equal(added.unitId,91157);
 W.editGroup(draft,0,added.id,{unitId:fighter.id},.5);
 W.chooseGroups(draft,0,[defaultSlime.id],settings,.5);
 assert.deepEqual(draft.config.WaveCfg[0].SpawnTimeline.slice(-2).map(unit=>unit.unitId),[fighter.id,91157]);
 assert.deepEqual(config,before);
});

test('every beta stage spawns its kingdom’s required roles and ordinary melee appears in every wave',()=>{
 const config=require('../../../assets/KinghtFallConfig/GameJsonCfg.json');
 const {GameTools:settings,SoldierCfg:units}=config;
 const Fighting=require('../lib/fighting-profiles'),Classes=require('../lib/enemy-classes');
 const {recordTraits}=require('../worlds/wave-threat');
 const StageProfiles=require('../../../assets/_script/EnemyStageProfiles');
 const rotation=['slime','sun-tomb','plant','skeleton','orc','ice','demon'];
 const families=settings.unitProfiles.families;
 const castleProfiles={
  slime:families[91154].profiles.wrecker,'sun-tomb':91010,plant:families[91110].profiles.vanguard,
  skeleton:families[91028].profiles.wrecker,orc:families[91136].profiles.wrecker,
  ice:families[91073].profiles.vanguard,demon:families[91186].profiles.wrecker
 };
 function ordinary(unit,delivery){
  return unit.enemyClass==='normal'&&unit.attack.delivery===delivery&&unit.attack.pattern==='single'&&unit.attack.damage>0&&
   !unit.skills.length&&!Object.keys(unit.attack.onHit||{}).length&&unit.target==='nearest';
 }
 for(const stage of config.LevelCfg.filter(stage=>stage.Level<=14)){
  const label='Stage '+stage.Level,kingdom=rotation[Math.floor((stage.Level-1)/2)];
  const runtime=StageProfiles.records(stage,units,settings),roster=new Map();
  const waves=stage.WaveCfg.map(wave=>new Set(wave.SpawnTimeline.map(row=>row.unitId)));
  for(const id of new Set(waves.flatMap(wave=>[...wave]))){
   const unit=runtime[id],baseId=unit.ProfileBaseID||id;
   assert.equal(Kingdoms.resolve(baseId,units,settings),kingdom,label+' unit '+id);
   roster.set(id,{
    id,baseId,health:unit.Health,target:unit.EnemyTargeting?.mode||'nearest',
    role:unit.FightingType||Fighting.roleOf(settings,baseId),enemyClass:Classes.resolve(settings,baseId),
    ...recordTraits(unit,id)
   });
  }
  const members=[...roster.values()];
  const fodder=members.find(unit=>!unit.flight&&ordinary(unit,'melee')&&waves.every(wave=>wave.has(unit.id)));
  assert(fodder,label+' needs ordinary melee in every wave');
  assert(members.some(unit=>!unit.flight&&unit.role==='vanguard'&&unit.target==='hero'&&unit.attack.damage>0),label+' needs a ground Vanguard hero targeter');
  const castle=members.filter(unit=>unit.target==='castle'&&unit.attack.damage>0);
  assert.deepEqual(castle.map(unit=>unit.baseId),[castleProfiles[kingdom]],label+' castle assignment');
  assert(members.some(unit=>!unit.flight&&unit.role==='wrecker'&&['buildings-first','castle'].includes(unit.target)&&unit.attack.damage>0),label+' needs a ground Wrecker');
  assert(members.some(unit=>ordinary(unit,'ranged')),label+' needs an ordinary ranged unit');
  assert(members.some(unit=>unit.attack.pattern==='splash'&&unit.attack.damage>0),label+' needs a splash attack');
  assert(members.some(unit=>!unit.flight&&unit.role==='guardian'&&unit.attack.delivery==='melee'&&unit.health>fodder.health),label+' needs a tank');
  assert(members.some(unit=>unit.flight),label+' needs a flying unit');
  const elites=new Set(members.filter(unit=>unit.enemyClass==='elite').map(unit=>settings.unitProfiles.entries[unit.baseId]?.baseId||unit.baseId));
  assert(kingdom==='slime'||elites.size>=2,label+' needs two distinct elites');
  if(kingdom==='ice'){
   assert.deepEqual(elites,new Set([91052,91147]),label+' should field Wizard and Winter Iron as the Ice elites');
   const tank=members.find(unit=>unit.baseId===families[91007].profiles.guardian);
   assert(tank&&tank.health>fodder.health,label+' should field Ice Beetle as the Guardian tank');
  }
  assert([...waves.at(-1)].some(id=>roster.get(id).enemyClass==='boss'),label+' needs a final-wave boss');
  assert(waves.slice(0,-1).every(wave=>[...wave].every(id=>roster.get(id).enemyClass!=='boss')),label+' has a boss before the final wave');
 }
});

test('appearance grouping resolves references and safely stops at cyclic or missing source records',()=>{
 const config={SoldierCfg:{1:{Name:'One',prefab:'one',MonsterSource:'monster1/One'},2:{Name:'Two',prefab:'two',AppearanceSourceUnit:1},3:{Name:'Three',prefab:'three',AppearanceSourceUnit:2},4:{Name:'Cycle A',prefab:'four',AppearanceSourceUnit:5},5:{Name:'Cycle B',prefab:'five',AppearanceSourceUnit:4},6:{Name:'Missing',prefab:'six',AppearanceSourceUnit:99}}},before=clone(config),rows=Catalog.rows(config,{entries:{}}),models=Catalog.groups(rows);
 assert.deepEqual(models.find(group=>group.key==='source:monster1/One').units.map(unit=>unit.id),[1,2,3]);assert.equal(models.length,4);assert.deepEqual(config,before);
});

test('saved character appearances take precedence over legacy models and do not mutate either source',()=>{
 const config={SoldierCfg:{1:{Name:'Legacy',prefab:'old'},2:{Name:'Imported',prefab:'new',MonsterSource:'monster2/Shared',MonsterPack:'monster2'},3:{Name:'Unrelated',prefab:'third'},90010:{Name:'Boss',prefab:'boss'}},GameTools:{}},characters={assignments:{'enemy:1:default':'saved','enemy:3:default':'missing','enemy:90010:1':'boss'},profiles:{saved:{base:{appearance:'monster2/Shared',currentModel:true}},boss:{base:{source:'monster2/Shared'}}}},before=clone({config,characters}),rows=Catalog.rows(config,{entries:{}},null,characters);
 assert.deepEqual(Catalog.groups(rows).find(group=>group.key==='source:monster2/Shared').units.map(unit=>unit.id),[1,2,90010]);assert.equal(rows.find(unit=>unit.id===1).assetPack,'monster2');assert.equal(rows.find(unit=>unit.id===3).modelKey,'prefab:third');assert.deepEqual({config,characters},before);
});
test('the complete saved catalog exposes every spawnable unit and read-only model descriptions without creating drafts',()=>{
 const root=path.resolve(__dirname,'../../..'),file=path.join(root,'assets/KinghtFallConfig/GameJsonCfg.json'),before=fs.readFileSync(file),service=new Service(root,{artifacts:path.join(os.tmpdir(),'hkd-picker-readonly-'+process.pid)}),catalog=service.catalog(),config=JSON.parse(before);
 assert.equal(catalog.units.length,Object.values(config.SoldierCfg).filter(unit=>unit.prefab&&![90011,90012].includes(Number(unit.ID))&&!config.GameTools.unitProfiles.aliases[unit.ID]).length);assert(catalog.units.every(unit=>typeof unit.description==='string'&&unit.unitType&&unit.assetPack));assert.equal(catalog.units.find(unit=>unit.id===91001).assetPack,'monster1');
 for(const name of ['Ironclad Slime','Ram Slime','Quake Slime','Prism Slime King']){
  const profiles=catalog.units.filter(unit=>unit.name===name);
  assert.equal(profiles.length,name==='Ram Slime'?7:6);
  assert(profiles.every(unit=>unit.customUnit&&unit.assetPack==='monster1'));
 }
 const snails=catalog.units.filter(unit=>unit.name==='Blue Snail');
 assert.equal(snails.length,6);
 assert(snails.every(unit=>!unit.customUnit&&unit.assetPack==='monster1'));
 const documents=clone(service.docs),model=service.unitPreview({id:91001});assert(model.layers.length&&model.layers[0].json&&model.layers[0].atlas&&model.runtimePath);assert.deepEqual(model.shared,[]);assert.equal(service.version,1);assert.deepEqual(service.docs,documents);assert(fs.readFileSync(file).equals(before));assert.throws(()=>service.unitPreview({id:90011}),/spawnable/);
});
