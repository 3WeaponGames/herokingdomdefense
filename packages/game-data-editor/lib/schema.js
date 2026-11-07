'use strict';

// Editing metadata. Storage keys and runtime identifiers intentionally stay unchanged.
const own = (o, k) => Object.prototype.hasOwnProperty.call(o || {}, k);
const unwrap = value => value && own(value, 'data') ? value.data : value;
const clone = value => JSON.parse(JSON.stringify(value));
const LABELS = {
  Name:'Name', name:'Name', Describe:'Description', LevelUpDescribe:'Upgrade description',
  Level:'Stage / progression level', Wave:'Wave number', Map:'Home map image', EnemyAni:'Home enemy animation', prefab:'Model / prefab',
  InGameCoefficient:'Battle coefficient',GoldSupplyCoefficient:'Gold supply coefficient',ConversionCoefficient:'Silver conversion coefficient',
  EquipLevelCap:'Equipment level cap', HealthCoefficient:'Enemy HP multiplier',AttackCoefficient:'Enemy attack multiplier',
  StartSliver:'Starting silver',CommerceSliver:'Silver from reward ad',WaveReward:'Wave rewards',Challenge:'Challenges',ChallengeReward:'Challenge rewards',
  HomeLevel1Unlock:'Castle level 1 — building unlocks',HomeLevel2Unlock:'Castle level 2 — building unlocks',HomeLevel3Unlock:'Castle level 3 — building unlocks',
  Quality:'Rarity',Weight:'Selection weight',Image:'Icon',Icon:'Icon',icon:'Icon',sprBg:'Icon background',goodID:'Goods reference',Talent:'Effect implementation',param:'Effect values',PieceCost:'Fragments required',Conversion:'Conversion reward',Unlock:'Unlock requirement',Pamer:'Effect values',isPerecentage:'Display as percentage',
  lockCose:'Unlock cost (silver)',index:'Branch index',level:'Building level',BuildSliverCost:'Upgrade cost (silver)',VedioCount:'Reward ads required',vedioCount:'Reward ads required',
  Zoom:'Preview scale',Skin:'Model skin',Hp:'HP',BranchBuild:'Next upgrade branches',Excursion:'Icon offset',Data:'Special properties',
  EffectType:'Effect type',EquipName:'Equipment name',Parameters:'Stat value',GoldCost:'Gold cost',EquipBottom:'Icon background',EquipSkin:'Hero skin',
  AttackType:'Attack behavior',Health:'HP',AttackDamage:'Attack damage',AttackInterval:'Attacks per second',AttackRange:'Attack range',
  SearchRange:'Additional search range',Speed:'Movement speed',BuildingCross:'Building collision rule',Suppressed:'Countered unit',DeathAni:'Death duration (seconds)',AttackPriority:'Target priority',loadIcon:'Battle icon',
  kindID:'Talent effect',EffectNumber:'Effect values',vaulePercentage:'Display as percentage',Value:'Value',
  MissionNumber:'Missions per battle',MissionType:'Mission selection mode',MissionID:'Mission pool / sequence',Award:'Mission rewards',
  enumValue:'Runtime ID',enumKey:'Behavior identifier',ID:'Record ID',id:'Category ID',
  StaminaLimit:'Maximum stamina',StaminaRecover:'Stamina recovery interval (seconds)',GoldSupply:'Gold reward amount',DiamondSupply:'Diamond reward amount',
  StaminaSupply:'Stamina reward amounts',StaminaBuy:'Stamina purchase cost',SidebarGoldSupply:'Sidebar gold reward',ButtonUnlock:'Menu unlock stage / wave',
  AddDesktop:'Desktop shortcut reward',StaminaCost:'Battle stamina cost',ReviveTime:'Revival delay (seconds)',CriticalDamage:'Critical damage multiplier',
  InvincibleTime:'Revival invulnerability (seconds)',RestrainedArms:'Counter damage multiplier',RefreshInterval:'Spawn interval (seconds)',
  BackToReady:'Return delay (seconds)',unlockDefense:'Defense mode unlock stage',cdTimeDefense:'Defense mode cooldown (seconds)'
};
const EQUIPMENT = ['Body • HP','Head • HP regeneration','Arrow • Damage','Bow • Attack range','Gloves • Attack rate','Mount • Movement speed'];
const RARITIES = ['Common','Rare','Epic','Legendary'];
const BUILDINGS = {1:'Castle Keep',2:'Arrow Tower',3:'Barracks',4:'House',5:'Mill',6:'Wall'};
// Map01–Map04 have lock/interaction nodes only for these authored levels.
const BUILDING_LEVEL_CAP = {1:3,2:2,3:3,4:2,5:2,6:2};
const PERK_LABELS = {
  50001:['Targets per attack'],50002:['Soldier HP bonus','Soldier attack bonus'],50003:['Kills required','Silver reward'],50004:['Silver each day'],
  50005:['Invincibility duration (seconds)'],50006:['Enemy attack reduction'],50007:['House silver bonus'],50008:['Hero HP recovered'],50009:['Silver cost reduction'],
  50010:['Silver reward'],50011:['Buildings to upgrade'],50012:['Towers to construct'],50013:['Attack bonus','Attack speed bonus'],50014:['Critical chance bonus'],
  50015:['Movement speed reduction'],50016:['Hero HP recovered'],50017:['Soldier attack bonus'],50018:['Attack speed bonus'],50019:['Hero attack bonus'],
  50020:['Soldier attack bonus'],50021:['Movement speed bonus'],50022:['HP regeneration bonus'],50023:['Soldier capacity bonus'],
  50024:['Effect parameter (reserved)'],50025:['Melee enemy HP reduction'],50026:['Silver production bonus'],50027:['Hero attack bonus'],
  50028:['Attack speed bonus'],50029:['Silver reward'],50030:['Attack range bonus'],50031:['Soldier movement bonus'],50032:['Soldier HP bonus'],
  50033:['Ranged enemy attack reduction'],50034:['Castle attack bonus'],50035:['Movement speed bonus'],50036:['HP regeneration bonus'],50037:['Critical chance bonus'],
  50038:['Melee enemy HP reduction'],50039:['Tower HP bonus'],50040:['Hero HP bonus'],50041:['Hero attack bonus','Attack range reduction'],
  50042:['Attack speed bonus','Attack reduction'],50043:['Soldier attack bonus'],50044:['Attack speed bonus','Movement reduction'],50045:['Range bonus','HP reduction'],
  50046:['Tower damage bonus','Building HP reduction'],50047:['House silver cost reduction','Barracks silver cost increase'],50048:['Wall HP bonus','Castle HP reduction'],
  50049:['Hero attack bonus'],50050:['Attack speed bonus'],50051:['Attack range bonus'],50052:['Soldier movement bonus'],50053:['Soldier HP bonus'],
  50054:['Castle attack bonus'],50055:['Tower HP bonus'],50056:['Ranged enemy attack reduction'],50057:['Soldier HP bonus','Soldier attack bonus']
};
const UNIT_DATA = {
  90006:['Movement speed bonus','Effect duration (seconds)','Effect radius','Maximum targets'],
  90007:['Splash damage','Splash radius','Maximum splash targets'],
  90009:['HP restored (%)','Healing radius','Maximum healing targets'],
  90010:['Spell behavior','Spell interval (seconds)','Next form unit'],
  90011:['Spell behavior','Spell interval (seconds)','Next form unit'],
  90012:['Spell behavior','Spell interval (seconds)','Movement reduction (%)','Effect radius','Maximum targets','Effect duration (seconds)']
};
function human(key) { return LABELS[key] || String(key).replace(/([a-z])([A-Z])/g,'$1 $2').replace(/_/g,' '); }
function token(text) { const m = /^\[\[loc:([^\]]+)\]\]$/.exec(String(text || '')); return m ? m[1] : null; }
function resolve(text, catalog, language) {
  return String(text === undefined ? '' : text).replace(/\[\[loc:([^\]]+)\]\]/g, (_,key) => {
    const entry = catalog && catalog.entries && catalog.entries[key];
    return entry && (entry[language || 'en'] || entry.en || entry.zh) || key;
  });
}
function parseSpawn(text) {
  if (typeof text !== 'string' || !/^\d+#(?:-1|\d+),\d+(;(?:-1|\d+),\d+)*$/.test(text)) throw new Error('Use a lane and ordered unit/count groups.');
  const split=text.split('#');
  return {lane:Number(split[0]),groups:split[1].split(';').map(group => {const parts=group.split(',');return {unit:Number(parts[0]),count:Number(parts[1])};})};
}
function encodeSpawn(row) { return String(row.lane)+'#'+row.groups.map(g=>g.unit+','+g.count).join(';'); }
function formatEffect(row, catalog, language, valuesKey, flagsKey) {
  const values=row[valuesKey || 'Pamer'] || [],flags=row[flagsKey || 'isPerecentage'] || [];
  return resolve(row.Describe || row.LevelUpDescribe || '',catalog,language).replace(/\{(\d+)\}/g,(_,n)=>{
    const value=values[Number(n)];
    return value === undefined ? '{'+n+'}' : flags[n] ? String(Math.ceil(value * 100))+'%' : String(value);
  });
}
function descriptor(key, context) {
  context=context || {};
  const result={label:human(key)};
  if (['ID','id','enumValue','enumKey','index','EffectType','AttackType'].indexOf(key)>=0) result.readOnly=true;
  if (['isPerecentage','vaulePercentage'].indexOf(key)>=0) result.readOnly=true;
  if (key==='AttackPriority') {result.readOnly=true;result.help='Legacy authored metadata. Current runtime selects the nearest eligible target and does not read this array.';}
  if (key==='Quality') result.options=RARITIES.map((label,i)=>({value:i+1,label}));
  if (key==='BuildingCross') result.options=[{value:0,label:'Ignore building obstruction'},{value:1,label:'Respect building obstruction'}];
  if (key==='AttackInterval') {result.min=0.000001;result.help='Runtime attack rate: higher values attack more frequently. Animation playback speed is separate.';}
  if (['Health','Hp','Zoom'].indexOf(key)>=0) result.min=0.000001;
  if (['Weight','AttackDamage','AttackRange','SearchRange','Speed','DeathAni','GoldCost','lockCose','BuildSliverCost','VedioCount','vedioCount','StartSliver','CommerceSliver','EquipLevelCap','MissionNumber','MissionType'].indexOf(key)>=0) result.min=0;
  if(context.table==='BuildEnum'){
    if(key==='level'){result.min=1;result.integer=true;if(own(BUILDING_LEVEL_CAP,context.id))result.max=BUILDING_LEVEL_CAP[context.id];result.help='Progression level used by castle unlocks. Stay within this building’s authored map interaction levels; branch index remains the stable reference.';}
    if(['lockCose','BuildSliverCost','VedioCount'].indexOf(key)>=0)result.integer=true;
    if(key==='BuildSliverCost'){result.label='Next purchase cost (silver)';result.help='Charged while upgrading from this branch. The destination also uses this value to choose silver or reward-ad presentation.';}
    if(key==='VedioCount'){result.label='Legacy reward-ad count';result.readOnly=true;result.help='Preserved authored metadata. The current upgrade dialog does not read this count.';}
    if(key==='Zoom'){result.label='Upgrade card icon scale';result.help='Scale of the icon in the upgrade choice dialog. The building’s map model uses its authored skin.';}
    if(key==='Excursion')result.label='Upgrade card icon offset';
  }
  if (/Coefficient$/.test(key)) result.min=0;
  if (key==='Parameters' && context.equipment) result.label=EQUIPMENT[context.equipment-1].split(' • ')[1];
  if (key==='Level' && context.table==='LevelCfg' || key==='Wave' || key==='Level' && context.table==='EquipCfg') result.readOnly=true;
  if (['Image','Icon','icon','sprBg','Map','loadIcon','EquipBottom'].indexOf(key)>=0) {
    result.asset='images';
    result.bundle=key==='Map'?'KinghtFallIconMap':key==='loadIcon'?'KinghtFallEnemy':key==='EquipBottom'||key==='icon'||key==='sprBg'?'KinghtFallIconGood':context.table==='BuffCfg'?'KinghtFallIconBuff':context.table==='BuildEnum'?'KinghtFallIconBuild':context.table==='EquipCfg'?'KinghtFallIconCharacter':context.table==='TalentCfg'?'KinghtFallIconTalent':null;
  }
  if(['goodID','Talent','itemID','type'].indexOf(key)>=0&&context.table==='TreasureCfg')result.readOnly=true;
  if(key==='Level'&&context.table==='TreasureCfg')result.readOnly=true;
  if (key==='prefab') result.asset='prefabs';
  if (key==='EnemyAni') result.asset='animations';
  return result;
}
function dataDescriptor(context, index) {
  let label='Parameter '+(index+1), percent=false, readOnly=false, min=0, integer=false, help;
  if(context.table==='BuildEnum') {
    const id=Number(context.id);
    const list=(id===1||id===2)?['Attack damage','Attacks per second','Attack range']:id===3?['Soldier capacity','Soldier type','Respawn time (seconds)']:(id===4||id===5)?['Silver per wave','Reserved property']:[];
    label=list[index] || label;
    if ((id===4||id===5)&&index>0 || id===6){readOnly=true;help='Preserved authored metadata; this building does not use this property.';}
    if((id===1||id===2)&&index===1){min=0.000001;help='Runtime attack rate: higher values attack more frequently.';}
    if(id===3&&index===0){integer=true;help='Base roster size before perks and bonus soldiers.';}
    if(id===3&&index===1){integer=true;help='Choose an implemented allied unit. Its base stats are shared with the Units panel and matching enemies.';}
    if(id===3&&index===2){min=0.000001;help='Delay before one dead soldier returns.';}
  } else if(context.table==='SoldierCfg') {
    label=(UNIT_DATA[context.id] || [])[index] || label;
    percent=Number(context.id)===90006&&index===0 || Number(context.id)===90009&&index===0 || Number(context.id)===90012&&index===2;
    if ([90010,90011,90012].indexOf(Number(context.id))>=0 && index===0) readOnly=true;
  }
  return {label,percent,readOnly,min,integer,help};
}
function validate(documents, changes) {
  const docs={};Object.keys(documents || {}).forEach(k=>docs[k]=unwrap(documents[k]));
  const issues=[],base=docs.A || {},catalog=docs.catalog || {entries:{}},units=base.SoldierCfg || {},talents=base.TalentCfg || {};
  function touched(doc,path) {
    if(!changes) return true;
    return changes.some(change=>{
      if(change.doc===doc) {
        const p=change.path || [];
        if(p.slice(0,Math.min(p.length,path.length)).every((key,i)=>String(key)===String(path[i]))) return true;
      }
      if(doc==='A'&&path[0]==='BuildEnum')return change.doc==='catalog'||change.doc==='A'&&(change.path||[])[0]==='SoldierCfg'&&path[path.length-2]==='Data'&&path[path.length-1]===1;
      return doc!=='catalog'&&((change.doc==='A'&&['SoldierCfg','BuildEnum','TalentCfg','EquipCfg','GoodsCfg'].indexOf((change.path||[])[0])>=0)||['A','B','D'].indexOf(change.doc)>=0&&(change.path||[])[0]==='LevelCfg'||change.doc==='catalog');
    });
  }
  function issue(doc,path,message,severity) {issues.push({severity:severity || (touched(doc,path)?'error':'warning'),doc,path,message});}
  function number(doc,path,value,min,integer) {if(typeof value!=='number'||!Number.isFinite(value)||value<min||(integer&&!Number.isInteger(value)))issue(doc,path,(integer?'Whole number':'Number')+' must be '+(min===0?'zero or greater':min+' or greater')+'.');}
  function checkTokens(value,doc,path) {
    if(typeof value==='string') {const key=token(value);if(key&&!own(catalog.entries,key))issue(doc,path,'Missing translation: '+key);}
    else if(value&&typeof value==='object')Object.keys(value).forEach(k=>checkTokens(value[k],doc,path.concat(Array.isArray(value)?Number(k):k)));
  }
  function rewards(value,doc,path) {(value||[]).forEach((reward,i)=>{if(!Array.isArray(reward)||reward.length!==2) return issue(doc,path.concat(i),'Reward must contain a goods ID and amount.');number(doc,path.concat(i,1),reward[1],0,true);if(!base.GoodsCfg || !base.GoodsCfg[reward[0]])issue(doc,path.concat(i,0),'Unknown reward item '+reward[0]+'.');});}
  ['A','B','D'].forEach(doc=>{
    const data=docs[doc]; if(!data)return;
    checkTokens(data,doc,[]);
    (data.LevelCfg || []).forEach((stage,index)=>{
      const p=['LevelCfg',index];
      if(stage.Level!==index+1)issue(doc,p.concat('Level'),'Stage IDs must remain contiguous and match their array position.');
      if(!/^Map0[1-4]$/.test(stage.prefab || ''))issue(doc,p.concat('prefab'),'Choose one of the currently authored playable maps (Map01–Map04).');
      ['InGameCoefficient','GoldSupplyCoefficient','ConversionCoefficient','EquipLevelCap'].forEach(k=>number(doc,p.concat(k),stage[k],0,k==='EquipLevelCap'));
      if(!Array.isArray(stage.WaveCfg)||!stage.WaveCfg.length)return issue(doc,p.concat('WaveCfg'),'A stage requires at least one wave.');
      stage.WaveCfg.forEach((wave,wi)=>{
        const w=p.concat('WaveCfg',wi);
        if(wave.Wave!==wi+1||wave.id!==stage.Level)issue(doc,w,'Wave number and stage ID must match their position.');
        ['HealthCoefficient','AttackCoefficient','StartSliver','CommerceSliver'].forEach(k=>number(doc,w.concat(k),wave[k],0,/Sliver/.test(k)));
        const lanes=new Set();let total=0;
        (wave.RefreshSoldierKind||[]).forEach((encoded,si)=>{
          const s=w.concat('RefreshSoldierKind',si);let parsed;
          try {parsed=parseSpawn(encoded);} catch(e){issue(doc,s,e.message);return;}
          const maxLane={Map01:9,Map02:12,Map03:12,Map04:15}[stage.prefab]||0;
          if(parsed.lane<1||parsed.lane>maxLane)issue(doc,s,'Spawn lane must identify an authored lane (1–'+maxLane+').');
          if(lanes.has(parsed.lane))issue(doc,s,'Duplicate spawn lane '+parsed.lane+' would overwrite an earlier group.');lanes.add(parsed.lane);
          parsed.groups.forEach(g=>{if(g.unit!==-1&&(!units[g.unit]||!units[g.unit].prefab))issue(doc,s,'Unit '+g.unit+' cannot spawn directly (missing unit or prefab).');if(!Number.isInteger(g.count)||g.count<=0)issue(doc,s,'Unit quantity must be a positive whole number.');if(g.unit!==-1)total+=g.count;});
        });
        if(total<=0)issue(doc,w.concat('RefreshSoldierKind'),'A wave requires at least one spawning unit.');
        rewards(wave.WaveReward,doc,w.concat('WaveReward'));
      });
      ['HomeLevel1Unlock','HomeLevel2Unlock','HomeLevel3Unlock'].forEach(key=>(stage[key]||[]).forEach((row,i)=>{
        if(!Array.isArray(row)||row.length!==2||!BUILDINGS[row[0]]||!Number.isInteger(row[1])||row[1]<1)issue(doc,p.concat(key,i),'Choose a valid building type and positive map slot ID.');
      }));
      if((stage.Challenge||[]).length!==(stage.ChallengeReward||[]).length)issue(doc,p.concat('ChallengeReward'),'Each challenge needs its matching reward list.');
      (stage.Challenge||[]).forEach((v,i)=>{if([1,2,3].indexOf(v)<0)issue(doc,p.concat('Challenge',i),'Choose an existing challenge (1: clear, 2: hero survives, 3: castle unharmed).');});
      (stage.ChallengeReward||[]).forEach((r,i)=>rewards(r,doc,p.concat('ChallengeReward',i)));
    });
  });
  (base.BuffCfg||[]).forEach((perk,i)=>{
    const p=['BuffCfg',i];number('A',p.concat('Quality'),perk.Quality,1,true);if(perk.Quality>4)issue('A',p.concat('Quality'),'Rarity must be Common, Rare, Epic or Legendary.');
    number('A',p.concat('Weight'),perk.Weight,0,false);
    if(perk.Unlock&&!talents[perk.Unlock])issue('A',p.concat('Unlock'),'Unknown talent prerequisite.');
    if(!Array.isArray(perk.Pamer)||perk.Pamer.length!==(perk.isPerecentage||[]).length)issue('A',p.concat('Pamer'),'Effect values must match the existing parameter display flags.');
    (perk.Pamer||[]).forEach((v,j)=>number('A',p.concat('Pamer',j),v,0,false));
  });
  for(let rarity=1;rarity<=4;rarity++){
    const available=(base.BuffCfg||[]).filter(p=>p.Quality===rarity&&!p.Unlock&&p.Weight>0);
    if(!available.length)issue('A',['BuffCfg'],'Rarity '+RARITIES[rarity-1]+' needs a positive-weight perk available without a talent prerequisite.');
  }
  Object.keys(units).forEach(id=>{
    const unit=units[id],p=['SoldierCfg',id];
    if(unit.ID!==Number(id))issue('A',p.concat('ID'),'Unit ID must match its table key.');
    ['Health','AttackInterval'].forEach(k=>number('A',p.concat(k),unit[k],Number.MIN_VALUE,false));
    ['AttackDamage','AttackRange','SearchRange','Speed','DeathAni'].forEach(k=>{if(own(unit,k))number('A',p.concat(k),unit[k],0,false);});
    if(unit.Suppressed&&!units[unit.Suppressed])issue('A',p.concat('Suppressed'),'Countered unit does not exist.');
    (unit.AttackPriority||[]).forEach((v,i)=>{if([1,2,3,4].indexOf(v)<0)issue('A',p.concat('AttackPriority',i),'Unknown target priority.');});
    (unit.Data||[]).forEach((v,i)=>number('A',p.concat('Data',i),v,0,false));
    if((id==='90010'||id==='90011')&&(!unit.Data||!units[unit.Data[2]]))issue('A',p.concat('Data',2),'Next boss form must exist.');
  });
  Object.keys(base.BuildEnum||{}).filter(id=>id!=='0').forEach(id=>{
    const building=base.BuildEnum[id],p=['BuildEnum',id],levels=building.levelList;
    number('A',p.concat('lockCose'),building.lockCose,0,true);
    if(!Array.isArray(levels)||!levels.length){issue('A',p.concat('levelList'),'A building requires at least one authored branch.');return;}
    const graph={};levels.forEach((level,i)=>{
      const q=p.concat('levelList',i);if(level.index!==i+1||level.ID!==Number(id))issue('A',q,'Building branch index and owner ID must match their position.');
      number('A',q.concat('level'),level.level,1,true);
      if(own(BUILDING_LEVEL_CAP,id)&&level.level>BUILDING_LEVEL_CAP[id])issue('A',q.concat('level'),'This building has authored map interaction nodes only through level '+BUILDING_LEVEL_CAP[id]+'.');
      ['Hp','Zoom'].forEach(k=>number('A',q.concat(k),level[k],Number.MIN_VALUE,false));
      ['BuildSliverCost','VedioCount'].forEach(k=>{if(own(level,k))number('A',q.concat(k),level[k],0,true);});
      graph[level.index]=Array.isArray(level.BranchBuild)?level.BranchBuild:[];
      if(own(level,'BranchBuild')&&(!Array.isArray(level.BranchBuild)||!level.BranchBuild.length))issue('A',q.concat('BranchBuild'),'Choose a nonempty upgrade branch list, or remove the connection for a final branch.');
      if(graph[level.index].length&&!own(level,'BuildSliverCost'))issue('A',q.concat('BranchBuild'),'An upgrade connection needs a next purchase cost on this branch.');
      graph[level.index].forEach((next,j)=>{if(!Number.isInteger(next)||next<1||next>levels.length)issue('A',q.concat('BranchBuild',j),'Upgrade branch does not exist.');else if(graph[level.index].indexOf(next)!==j)issue('A',q.concat('BranchBuild',j),'An upgrade branch cannot be connected twice.');});
      const expected=id==='1'||id==='2'||id==='3'?3:id==='4'||id==='5'?1:0;
      if(expected&&(!Array.isArray(level.Data)||level.Data.length<expected))issue('A',q.concat('Data'),'Building properties are missing required runtime values.');
      if(Array.isArray(level.Data))level.Data.forEach((v,j)=>{const d=dataDescriptor({table:'BuildEnum',id},j);number('A',q.concat('Data',j),v,d.min,d.integer);});
      if(id==='3'&&Array.isArray(level.Data)&&(!units[level.Data[1]]||!units[level.Data[1]].prefab||level.Data[1]<90001||level.Data[1]>90004))issue('A',q.concat('Data',1),'Barracks unit must have an authored allied prefab (90001–90004).');
    });
    const visiting=new Set(),done=new Set();function visit(n){if(visiting.has(n))return true;if(done.has(n))return false;visiting.add(n);if((graph[n]||[]).some(visit))return true;visiting.delete(n);done.add(n);return false;}
    if(Object.keys(graph).some(k=>visit(Number(k))))issue('A',p.concat('levelList'),'Upgrade branches contain a cycle.');
  });
  (base.TreasureCfg||[]).forEach((relic,i)=>{
    const p=['TreasureCfg',i],good=base.GoodsCfg&&base.GoodsCfg[relic.goodID];
    if(relic.ID!==120001+i)issue('A',p.concat('ID'),'Relic IDs must retain their existing order.');
    if(!good||good.itemID!==relic.ID)issue('A',p.concat('goodID'),'Relic must retain its matching goods reference.');
    if(!['1','2','3','4','5','7','8','9','10','11'].includes(relic.Talent))issue('A',p.concat('Talent'),'Choose an implemented relic effect.');
    if(!Number.isInteger(relic.Quality)||relic.Quality<1||relic.Quality>4)issue('A',p.concat('Quality'),'Choose an authored rarity.');
    if(!Array.isArray(relic.Conversion)||relic.Conversion.length!==2||!base.GoodsCfg[relic.Conversion[0]])issue('A',p.concat('Conversion'),'Conversion needs an existing goods ID and amount.');else number('A',p.concat('Conversion',1),relic.Conversion[1],0,true);
    (relic.levelInfo||[]).forEach((level,li)=>{const q=p.concat('levelInfo',li);if(level.id!==relic.ID||level.Level!==li+1)issue('A',q,'Relic level and owner ID must match their position.');for(const field of ['GoldCost','PieceCost'])if(own(level,field))number('A',q.concat(field),level[field],0,true);if(!Array.isArray(level.param))issue('A',q.concat('param'),'Relic effect values must retain their array format.');(level.param||[]).forEach((v,j)=>number('A',q.concat('param',j),v,0,false));});
  });
  (base.EquipCfg||[]).forEach((equipment,i)=>{
    const p=['EquipCfg',i];if(equipment.id!==i+1)issue('A',p.concat('id'),'Equipment IDs must retain their existing order.');
    (equipment.levelInfo||[]).forEach((level,li)=>{const q=p.concat('levelInfo',li);if(level.Level!==li+1||level.ID!==equipment.id)issue('A',q,'Equipment level and owner ID must match their position.');number('A',q.concat('Parameters'),level.Parameters,0,false);number('A',q.concat('GoldCost'),level.GoldCost,0,true);});
    if(equipment.Unlock){['A','B','D'].forEach(variant=>{const stage=docs[variant]&&docs[variant].LevelCfg&&docs[variant].LevelCfg[equipment.Unlock[0]-1];if(!stage||equipment.Unlock[1]<1||equipment.Unlock[1]>stage.WaveCfg.length)issue('A',p.concat('Unlock'),'Equipment unlock must reference an existing stage/wave in variant '+variant+'.');});}
  });
  let lastLevel=0;
  (base.TalentLevelCfg||[]).forEach((level,i)=>{
    const p=['TalentLevelCfg',i];if(level.ID!==i+1)issue('A',p.concat('ID'),'Talent record IDs must retain their existing order.');
    if(!Number.isInteger(level.Level)||level.Level<lastLevel||level.Level>lastLevel+1)issue('A',p.concat('Level'),'Talent rows must stay ordered with no skipped progression levels.');lastLevel=level.Level;
    if(!talents[level.kindID])issue('A',p.concat('kindID'),'Talent effect does not exist.');number('A',p.concat('GoldCost'),level.GoldCost,0,true);
    if(level.vedioCount!==undefined)number('A',p.concat('vedioCount'),level.vedioCount,0,true);
    if(level.EffectNumber&&(level.EffectNumber.length!==(level.vaulePercentage||[]).length))issue('A',p.concat('EffectNumber'),'Talent values must match percentage display flags.');
    (level.EffectNumber||[]).forEach((v,j)=>number('A',p.concat('EffectNumber',j),v,0,false));
  });
  Object.keys(base.ParameterCfg||{}).forEach(id=>{
    const row=base.ParameterCfg[id],p=['ParameterCfg',id,'Value'];
    if(typeof row.Value!=='string'){issue('A',p,'Shared settings retain their string storage type.');return;}
    const scalar=value=>value.trim()!==''&&Number.isFinite(Number(value))&&Number(value)>=0;
    const pair=text=>text.split(',').length===2&&text.split(',').every(scalar);
    if(row.enumKey==='StaminaSupply'){
      if(!pair(row.Value))issue('A',p,'Stamina supply needs two non-negative amounts separated by a comma.');
    }else if(row.enumKey==='AddDesktop'){
      const values=row.Value.split(',');
      if(!pair(row.Value)||!values.every(v=>Number.isInteger(Number(v)))||!base.GoodsCfg||!base.GoodsCfg[Number(values[0])])issue('A',p,'Desktop reward needs an existing goods ID and a non-negative whole amount.');
    }else if(row.enumKey==='ButtonUnlock'){
      // -1 is the authored always-hidden stage sentinel; future stage numbers
      // are intentional locks, so do not normalize them to existing campaigns.
      if(!row.Value.split(';').every(text=>{const v=text.split(',');return v.length===2&&v.every(x=>x.trim()!==''&&Number.isInteger(Number(x)))&&(Number(v[0])===-1||Number(v[0])>=1)&&Number(v[1])>=0;}))issue('A',p,'Unlock entries need a positive stage (or -1) and non-negative whole wave.');
    }else if(!scalar(row.Value))issue('A',p,'Enter a non-negative number.');
    if(row.enumKey==='RefreshInterval'&&Number(row.Value)<=0)issue('A',p,'Spawn interval must be greater than zero.');
  });
  (base.InGameTaskCfg||[]).forEach((row,i)=>{const p=['InGameTaskCfg',i];number('A',p.concat('MissionNumber'),row.MissionNumber,1,true);if(!row.MissionID||row.MissionID.length<row.MissionNumber)issue('A',p.concat('MissionID'),'Mission pool must contain at least the mission count.');if(!row.Award||row.Award.length<row.MissionNumber)issue('A',p.concat('Award'),'Every selected mission needs a reward slot.');(row.MissionID||[]).forEach((v,j)=>{if(!base.InGameTaskEnum[v])issue('A',p.concat('MissionID',j),'Mission type does not exist.');});rewards(row.Award,'A',p.concat('Award'));});
  if(docs.catalog&&docs.catalog.entries){
    Object.keys(docs.catalog.entries).forEach(key=>{
      const entry=docs.catalog.entries[key],texts=Object.keys(entry).filter(k=>k!=='context'&&typeof entry[k]==='string');
      const reference=(entry.zh||entry.en||'').match(/\{\d+\}/g)||[];
      texts.forEach(lang=>{const matches=(entry[lang].match(/\{\d+\}/g)||[]).sort();if(matches.join('|')!==reference.slice().sort().join('|'))issue('catalog',['entries',key,lang],'Keep the same numbered placeholders in every language.');});
    });
    // Reuse the project's translation checks so edits here follow the same rules
    // as the existing Translation Tables editor (tokens, rich tags and bindings).
    try {
      const catalogTools=require('../../localization-editor/lib/catalog');
      catalogTools.validate(docs.catalog).forEach(finding=>issue('catalog',['entries',finding.key,finding.language||'en'],finding.message));
    } catch(error) { issue('catalog',[],'Translation catalog validation failed: '+error.message); }
  }
  const overrides=docs.overrides||base.GameTools;
  if(overrides){
    if(overrides.version!==1)issue('overrides',['version'],'Unsupported override format.');
    if(overrides.visuals!==undefined&&(!overrides.visuals||typeof overrides.visuals!=='object'||Array.isArray(overrides.visuals)))issue('overrides',['visuals'],'Model facing must be a unit table.');
    Object.keys(overrides.visuals||{}).forEach(key=>{const item=overrides.visuals[key],parts=key.split(':'),type=parts[0],id=Number(parts[1]),form=type==='enemy'&&id>=90010?String(id-90009):'default';if(parts.length!==3||!['enemy','ally'].includes(type)||!units[id]||type==='ally'&&(id<90001||id>90004)||parts[2]!==form)issue('overrides',['visuals',key],'Model facing must identify an allied troop or enemy form.');if(!item||item.mirrorX!==undefined&&typeof item.mirrorX!=='boolean')issue('overrides',['visuals',key],'Mirror model must be enabled or disabled.');});
    for(const [key,item]of Object.entries(overrides.visuals||{}))if(item&&typeof item==='object'){
      for(const [field,min,max]of [['x',-4096,4096],['y',-4096,4096],['scaleX',.01,20],['scaleY',.01,20],['rotation',-3600,3600]])if(item[field]!==undefined&&(typeof item[field]!=='number'||!Number.isFinite(item[field])||item[field]<min||item[field]>max))issue('overrides',['visuals',key,field],'Choose a valid model transform.');
      if(item.tint!==undefined&&!/^#[0-9a-f]{6}$/i.test(item.tint))issue('overrides',['visuals',key,'tint'],'Choose a valid model tint.');
    }
    const unitTypes=overrides.unitTypes||{};
    if(overrides.unitTypes!==undefined&&(!overrides.unitTypes||typeof overrides.unitTypes!=='object'||Array.isArray(overrides.unitTypes)))issue('overrides',['unitTypes'],'Unit types must be a type table.');
    Object.keys(unitTypes).forEach(id=>{const type=unitTypes[id],p=['unitTypes',id];if(!/^[a-z][a-z0-9_-]{0,63}$/.test(id)||!type||typeof type!=='object'){issue('overrides',p,'Use a stable lowercase type identifier.');return;}if(typeof type.name!=='string'||!type.name.trim()||type.name.length>100)issue('overrides',p.concat('name'),'Give this type a name.');if(typeof type.icon!=='string'||!type.icon.trim())issue('overrides',p.concat('icon'),'Choose a pictogram for this type.');if(type.tint!==undefined&&!/^#[0-9a-f]{6}$/i.test(type.tint))issue('overrides',p.concat('tint'),'Choose a valid pictogram tint.');});
    if(overrides.unitTypeAssignments!==undefined&&(!overrides.unitTypeAssignments||typeof overrides.unitTypeAssignments!=='object'||Array.isArray(overrides.unitTypeAssignments)))issue('overrides',['unitTypeAssignments'],'Unit type assignments must be a unit table.');
    Object.keys(overrides.unitTypeAssignments||{}).forEach(key=>{const parts=key.split(':'),id=Number(parts[1]),side=parts[0],form=side==='enemy'&&id>=90010?String(id-90009):'default';if(parts.length!==3||!['enemy','ally'].includes(side)||!units[id]||side==='ally'&&(id<90001||id>90004)||parts[2]!==form)issue('overrides',['unitTypeAssignments',key],'Choose a reachable troop or enemy form.');if(!own(unitTypes,overrides.unitTypeAssignments[key]))issue('overrides',['unitTypeAssignments',key],'Choose an existing unit type.');});
    Object.keys(overrides.parameters||{}).forEach(key=>{if(key==='buildStandTime')number('overrides',['parameters',key],overrides.parameters[key],0.001,false);else issue('overrides',['parameters',key],'Unknown runtime parameter override.');});
    ['timings','timingDefaults'].forEach(group=>{
      if(overrides[group]!==undefined&&(!overrides[group]||typeof overrides[group]!=='object'||Array.isArray(overrides[group]))){issue('overrides',[group],'Attack timings must be a unit timing table.');return;}
      Object.keys(overrides[group]||{}).forEach(key=>{const item=overrides[group][key],parts=key.split(':');if(parts.length!==3||['hero','enemy','ally'].indexOf(parts[0])<0)issue('overrides',[group,key],'Timing must identify a unit, attack side and form.');if(parts[0]!=='hero'&&!units[parts[1]])issue('overrides',[group,key],'Timing unit does not exist.');if(!item||typeof item.attack!=='number'||!Number.isFinite(item.attack)||item.attack<0||item.attack>10)issue('overrides',[group,key],'Attack time must be between 0 and 10 seconds.');});
    });
    const perks=overrides.perks||{};
    Object.keys(perks).forEach(id=>{if(!(base.BuffCfg||[]).some(p=>String(p.ID)===id))issue('overrides',['perks',id],'Perk does not exist.');if(!perks[id]||typeof perks[id].enabled!=='boolean')issue('overrides',['perks',id],'Perk override requires an enabled switch.');});
    if(Object.keys(perks).length){
      const available=(base.BuffCfg||[]).filter(p=>p.Weight>0&&!p.Unlock&&(!perks[p.ID]||perks[p.ID].enabled!==false));
      if(available.length<3)issue('overrides',['perks'],'Keep at least three positive-weight perks available without a talent requirement.');
      [2,3].forEach(quality=>{if(!available.some(p=>p.Quality>=quality))issue('overrides',['perks'],'Keep an ungated positive-weight perk for guaranteed '+SchemaRarity(quality)+' or higher rerolls.');});
      issue('overrides',['perks'],'Availability changes alter perk pools. Acquired perks and Claim All can exhaust a rarity later in a battle.','warning');
    }
  }
  return issues;
}
function SchemaRarity(quality){return RARITIES[quality-1];}
module.exports={LABELS,EQUIPMENT,RARITIES,BUILDINGS,PERK_LABELS,UNIT_DATA,human,token,resolve,parseSpawn,encodeSpawn,formatEffect,descriptor,dataDescriptor,validate,clone,unwrap};
