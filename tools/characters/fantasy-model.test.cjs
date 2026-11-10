'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const Library=require('../../packages/hkd-characters/lib/unit-library'),Boss=require('../../packages/hkd-characters/lib/boss-model'),Packs=require('../../packages/hkd-characters/lib/unit-packs'),Catalog=require('../../packages/hkd-characters/lib/character-catalog'),Bake=require('../../packages/hkd-characters/lib/native-bake'),{Service}=require('../../packages/hkd-characters/lib/service');
const root=path.resolve(__dirname,'../..'),read=relative=>JSON.parse(fs.readFileSync(path.join(root,relative))),clone=structuredClone;
const sources=Library.load(root).sources.filter(source=>source.pack.startsWith('fantasy-'));
test('all Fantasy models expose only visible authored slots and compatible outfits, including every Golem outfit',()=>{
  assert.equal(sources.length,166);
  for(const source of sources){
    const rig=read(source.skeleton),meta=Boss.metadata(rig);assert.equal(meta.preset,source.id);
    assert(meta.presets.length);assert(Object.keys(meta.slots).length);
    for(const preset of meta.presets){const other=sources.find(source=>source.id===preset.id);assert.equal(other.family,source.family);assert.equal(other.controller,source.controller);}
    for(const [name,slot]of Object.entries(meta.slots)){
      assert(!/Shadow|Anchor|Press|Fireball|Effect/i.test(name));assert(rig.slots.some(slot=>slot.name===name&&slot.attachment));
      for(const variant of slot.variants){const skin=rig.skins.find(skin=>skin.name===variant);assert(skin&&Object.keys(skin.attachments[name]||{}).length,source.id+'/'+name+'/'+variant);}
      const expression=meta.expressions.find(group=>group.slot===name);if(expression)for(const variant of slot.variants){const other=read(sources.find(source=>source.id===source.pack+'/'+variant).skeleton),states=other._fantasy.expressions.find(group=>group.slot===name).states,skin=rig.skins.find(skin=>skin.name===variant);for(let i=0;i<expression.states.length;i++)if(expression.states[i])assert.equal(skin.attachments[name][expression.states[i]].path,other.skins[0].attachments[name][states[i]].path,source.id+'/'+variant+' expression '+i);}
    }
    if(source.pack==='fantasy-bosses'&&source.family==='Golems'){assert.equal(meta.presets.length,6);assert(!Object.keys(meta.slots).some(slot=>/Weapon/.test(slot)),'The disabled placeholder weapon is not an option');}
    if(source.family.startsWith('Titans/'))assert.equal(meta.presets.length,3,'Titan outfits stay with their own species');
  }
});
test('Fantasy colors, transforms, visibility and expression overrides survive baking without changing source animations',()=>{
  const source=sources.find(source=>source.id==='fantasy-bosses/StoneGolem'),original=read(source.skeleton),name='Body/Head',meta=Boss.metadata(original),variant=meta.slots[name].variants.find(name=>name!=='StoneGolem');
  const settings={slots:{[name]:{variant,tint:'#80c0ff',x:3,y:-2,scaleX:1.2,scaleY:.8,rotation:4}}},result=clone(original);Boss.apply(result,settings);
  assert.deepEqual(result.animations,original.animations);const key=original.slots.find(slot=>slot.name===name).attachment,head=result.skins[0].attachments[name][key];
  assert.equal(head.color,'80c0ffff');assert.equal(head.rotation,(original.skins.find(skin=>skin.name===variant).attachments[name][key].rotation||0)+4);
  const hidden=clone(original);Boss.apply(hidden,{slots:{[name]:{visible:false}}});assert(Object.values(hidden.skins[0].attachments[name]).every(attachment=>attachment.color.endsWith('00')));
  const forced=clone(original);Boss.apply(forced,{expression:2});for(const clip of Object.values(forced.animations))assert.deepEqual(clip.slots[name].attachment,[{time:0,name:meta.expressions.find(group=>group.field==='Head').states[2]}]);
  const layer=Library.describe(root,source.id,true).layers[0],contract={height:180,animations:{},events:{}},profile={name:'Test golem',base:{type:'enemy',id:'94001',source:source.id},parts:[],boss:settings};
  const baked=Bake.bake(root,profile,'fantasy-test',contract,new Map(),file=>fs.readFileSync(file)),rig=JSON.parse(baked.files.get('assets/resources/unit-library/runtime/fantasy-test.json'));
  assert.equal(rig.skins[0].attachments[name][key].color,'80c0ffff');assert.equal(JSON.stringify(rig.animations),JSON.stringify(original.animations));assert.deepEqual(read(source.skeleton),original);
});
test('unsupported slots, outfits, expressions and invalid transforms are rejected',()=>{
  const rig=read(sources.find(source=>source.id==='fantasy-bosses/StoneGolem').skeleton);
  for(const settings of [{slots:{wings:{}}},{slots:{Body:{variant:'RedDragon'}}},{slots:{Body:{scaleX:0}}},{slots:{Body:{x:Infinity}}},{slots:{Body:{tint:'red'}}},{expression:99}])assert.throws(()=>Boss.validate(rig,settings));
  assert.throws(()=>Boss.validate({},{slots:{}}));
});
test('package filtering and sorting include created entries without mutating the list or changing profiles',()=>{
  const units=new Service(root).units(),data=read('assets/resources/characters/catalog.json'),before=JSON.stringify(data),listed=Catalog.listed(data,units);
  assert.equal(Packs.list(listed,{pack:'fantasy-bosses'}).length,47);assert.equal(Packs.list(listed,{pack:'fantasy-monsters'}).length,119);assert.equal(Packs.list(listed,{pack:'monster3'}).length,50);
  const ordered=Packs.list(listed,{sort:'package'});for(let i=1;i<ordered.length;i++)assert(Packs.forUnit(ordered[i-1]).label.localeCompare(Packs.forUnit(ordered[i]).label)<=0);
  assert.equal(JSON.stringify(data),before);assert.equal(Packs.forUnit(units.find(unit=>unit.type==='ally')).mode,'maker');
  const boss=units.find(unit=>unit.sourcePack==='fantasy-bosses');assert.equal(Catalog.defaults(boss).source,boss.appearance);
});
test('Fantasy drafts remain unpublished until explicit Save; source changes retain a guarded native contract and no-op Save writes nothing',t=>{
  const folder=fs.mkdtempSync(path.join(os.tmpdir(),'hkd-fantasy-save-'));t.after(()=>fs.rmSync(folder,{recursive:true,force:true}));
  function copy(relative){const target=path.join(folder,relative);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(path.join(root,relative),target);}
  const cfg=read('assets/KinghtFallConfig/GameJsonCfg.json'),source=sources.find(source=>source.id==='fantasy-bosses/StoneGolem'),row=Object.values(cfg.SoldierCfg).find(row=>row.MonsterSource===source.id),layer=Library.describe(root,source.id,true).layers[0];
  const write=(relative,value)=>{const file=path.join(folder,relative);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify(value));};
  for(const file of [source.skeleton,source.skeleton+'.meta',source.skeleton.replace(/\.json$/,'.atlas'),'assets/KinghtFallEnemy/'+row.prefab+'.prefab'])copy(file);
  for(const page of Object.keys(layer.pages)){const relative=path.posix.dirname(source.skeleton)+'/'+page;copy(relative);copy(relative+'.meta');}
  write('assets/KinghtFallConfig/GameJsonCfg.json',{SoldierCfg:{[row.ID]:row},AllyCfg:{},GameTools:{timingDefaults:{approved:{attack:.4}},timings:{custom:{attack:.3}}}});
  write('assets/resources/localization/catalog.json',{entries:{}});write('assets/resources/character-parts/catalog.json',{parts:[]});write('assets/resources/characters/catalog.json',{version:1,profiles:{},assignments:{},future:{keep:1}});write('assets/resources/unit-library/runtime/contracts.json',{enabled:true,units:{}});
  write('assets/resources/unit-library/fantasy-bosses/catalog.json',{units:[source],parts:[]});
  const service=new Service(folder),original=fs.readFileSync(service.file),config=fs.readFileSync(path.join(folder,'assets/KinghtFallConfig/GameJsonCfg.json')),profile={name:'Custom golem',base:{type:'enemy',id:String(row.ID),source:source.id},parts:[],boss:{slots:{Body:{tint:'#80c0ff'}}},future:{keep:true}};
  const data=service.snapshot().data;data.profiles.custom=profile;data.assignments['enemy:'+row.ID+':default']='custom';service.change({version:service.version,data});
  assert.deepEqual(fs.readFileSync(service.file),original);assert(!fs.existsSync(path.join(folder,'assets/resources/unit-library/runtime/default_custom.json')));
  const home=os.homedir;os.homedir=()=>path.join(folder,'backups');try{const result=service.save({version:service.version});assert(result.result.saved);const saved=service.data.profiles.custom,rig=JSON.parse(fs.readFileSync(path.join(folder,'assets/resources',saved.baked.resource+'.json')));assert.equal(rig.skins[0].attachments.Body[rig.slots.find(slot=>slot.name==='Body').attachment].color,'80c0ffff');assert.equal(saved.future.keep,true);const stamp=fs.statSync(service.file).mtimeMs;assert.equal(service.save({version:service.version}).result.saved,false);assert.equal(fs.statSync(service.file).mtimeMs,stamp);}finally{os.homedir=home;}
  assert.deepEqual(fs.readFileSync(path.join(folder,'assets/KinghtFallConfig/GameJsonCfg.json')),config);
});
