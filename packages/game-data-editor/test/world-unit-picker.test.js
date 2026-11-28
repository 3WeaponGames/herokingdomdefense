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
  {id:90001,name:'Wolf',modelKey:'wolf'}];
 const s=stage();s.config.WaveCfg[0].SpawnTimeline[0].unitId=101685;
 const before=clone(s),mount=require('../worlds/unit-picker').unitField;
 const apply=id=>{chosen.push(id);W.editGroup(s,0,'original',{unitId:id},.5);};
 mount(c,node(),units,101685,apply,()=>{},()=>{});
 assert.deepEqual(buttons.map(button=>button.textContent),['Switch','Profiles…','Unit Editor']);
 assert.equal(fields.Profile.value,'101685');
 assert.deepEqual(fields.Profile.children.map(option=>option.textContent),['Default (Bruiser)','Fighter','Bruiser']);
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

test('saved units expose exactly six fighting profiles per parent without Campaign or Normal profile labels',()=>{
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
 for(const group of groups){assert.equal(group.units.length,6);const baseId=Number(group.key.split(':')[1]);assert.equal(Catalog.firstProfile(group.units).id,profiles.families[baseId].defaultProfileId??baseId);assert.equal(new Set(group.units.map(Catalog.profileLabel)).size,6);assert(group.units.every(unit=>unit.profileKind==='Fighting type'));}
 const namesIn=kingdom=>groups.filter(group=>group.units[0].kingdom===kingdom).map(group=>{
  assert(group.units.every(unit=>unit.kingdom===kingdom&&unit.name===group.units[0].name));
  return group.units[0].name;
 }).sort();
 assert.deepEqual(namesIn('sun-tomb'),[
  'Black Plague','Brass Scarab','Carrion Bird','Larva Leech','Purple Scorpion','Relic Cantor',
  'Shrouded Revenant','Sun-Tomb Regent','Worm Lightning','Worm Poison'
 ]);
 assert.deepEqual(namesIn('plant'),[
  'Carapace Green','Conch Snail','Flower Mantis','Flower Tulip','Fungus Rock','Iron Fly','Iron Golem',
  'Mushroom Walker','Pitcher Plant','Red Plant','Spiky Plant','Stone Scorpion','Stump Walker','Tree Golem'
 ]);
 assert(rows.filter(unit=>unit.kingdom==='plant').every(unit=>Catalog.matches(unit,'nature kingdom deep forest')));
 assert.deepEqual(groups.filter(group=>group.units[0].kingdom==='plant'&&group.units[0].enemyClass==='boss').map(group=>group.units[0].name),['Iron Fly']);
 assert(!rows.some(unit=>unit.name==='Thorn Warden'||unit.name==='Evilmass Dagger'));
 assert.deepEqual(namesIn('skeleton'),[
  'Corsair Wraith','Drowned Octopus','Grave Goby','Pumpkin Steel','Reaper Death','Skeleton Rhino',
  'Skeleton Soldier','Skeleton Warlord','Skeleton Warrior','Skull Bat'
 ]);
 assert.deepEqual(groups.filter(group=>group.units[0].kingdom==='skeleton'&&group.units[0].enemyClass==='boss').map(group=>group.units[0].name),['Skeleton Warlord']);
 assert.deepEqual(namesIn('orc'),[
  'Orc Crimson Guard','Orc Shaman','Orc Siege Chief','Orc Smasher Berserker','Orc Smasher Red',
  'Orc Smasher Warlord','Orc Sword Butcher','Orc Sword Rookie','Orc Sword Veteran','Orc War Beast','Orc War Raptor','Orc Wyvern'
 ]);
 assert.deepEqual(namesIn('vampire'),[
  'Blood Ant','Blood Beetle','Crimson Vampire Lord','Crypt Ghoul','Feral Ghoul','Reaper Blood',
  'Scarbrow Vampire','Vampire','Wing Demon Vampire'
 ]);
 assert.deepEqual(namesIn('demon'),[
  'Black Goat','Cinderhorn Demon','Crimson Regent','Demon Wolf','Devil Bee','Hellgate Behemoth',
  'Horn Rabbit Demon','Pyre Executioner','Raptor Swamp','Toad Giant','Venom Spider','Wing Demon Eye'
 ]);
 assert(!rows.some(unit=>unit.name==='Skeleton Bat'||unit.name==='Fire Raptor'));
 const kingdomLabels=new Map(Kingdoms.options(rows).map(({value,label})=>[value,label]));
 assert.equal(kingdomLabels.get('skeleton'),'Undead Kingdom · Snow');
 assert.equal(kingdomLabels.get('demon'),'Demon Kingdom · Fire');
 assert.equal(kingdomLabels.get('vampire'),'Vampire Kingdom · Ice');
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
  assert.equal(profiles.length,6);
  assert(profiles.every(unit=>unit.customUnit&&unit.assetPack==='monster1'));
 }
 const snails=catalog.units.filter(unit=>unit.name==='Blue Snail');
 assert.equal(snails.length,6);
 assert(snails.every(unit=>!unit.customUnit&&unit.assetPack==='monster1'));
 const documents=clone(service.docs),model=service.unitPreview({id:91001});assert(model.layers.length&&model.layers[0].json&&model.layers[0].atlas&&model.runtimePath);assert.deepEqual(model.shared,[]);assert.equal(service.version,1);assert.deepEqual(service.docs,documents);assert(fs.readFileSync(file).equals(before));assert.throws(()=>service.unitPreview({id:90011}),/spawnable/);
});
