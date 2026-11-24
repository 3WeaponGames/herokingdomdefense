'use strict';
// Contextual authoring UI. All content changes go through the shared draft API.
const Waves=require('./wave-editor'),Paths=require('./path-editor'),Stats=require('./wave-stats'),Model=require('./model'),StageCards=require('./stage-cards-client'),StageProfiles=require('./stage-profile-editor');
const Names=require('./stage-names'),CardOrder=require('./stage-card-order'),CardDrag=require('./stage-card-drag');
const WaveOverview=require('./wave-overview');
const WaveBalance=require('./wave-balance-panel'),SpawnGroups=require('./spawn-groups'),SpawnGroupsPanel=require('./spawn-groups-panel');
const TaskPosition=require('../../../assets/_script/StageTaskPosition');
const STAGE_SECTIONS=[
 {value:'buildings',label:'Buildings',description:'All buildings and special offers, including unlock settings and appearance.'},
 {value:'spawns',label:'Spawn points',description:'Enemy spawn points, the hero start and the Tasks position.'},
 {value:'paths',label:'Paths',description:'Every path, point and connection.'},
 {value:'waves',label:'Waves',description:'All waves, including enemies, timing, settings and rewards.'},
 {value:'settings',label:'Map and stage settings',description:'The map choice and other stage settings. The current stage keeps its number and name.'}
];
const cleanName=value=>String(value||'').replace(/^\s*(?:Stage\s+)?\d+(?:[.)]\s*|\s*[—–:-]\s*)/i,'').trim();
const spawnRanges=Names.spawnRanges,pathTitle=Names.pathName;
const isWaveRow=wave=>wave&&typeof wave==='object'&&!Array.isArray(wave);
const waveLabel=(wave,index)=>'Wave '+(wave&&wave.Wave||index+1);
function pathSubtitle(stage,graph){const required=graph.requiresAnyBuilding||[],condition=Model.legacyUnavailable(graph)?'Unavailable legacy route':!Array.isArray(required)?'Invalid building conditions':required.length?'Requires: '+required.map(id=>{const building=stage.buildings.find(building=>building.id===id);return building?building.name:'Building '+id;}).join(' or '):'Always available';return graph.nodes.length+(graph.nodes.length===1?' point · ':' points · ')+condition;}
function create(c){
 const {state,el,button,field,select,note,section,edit,render,draw}=c;
 const waveOverview=WaveOverview.create(el);
 const stage=()=>state.snap.value,catalog=()=>state.catalog,unitRows=()=>StageProfiles.rows(stage().config,catalog().units),summary=wave=>Waves.summary(wave,catalog().interval),wave=()=>stage().config.WaveCfg[state.wave],stageCards=StageCards.create(c);
 function draggable(list,rows,items,options={}){
  CardDrag.bind(list,rows,{stage,items,edit,cancelDrag:c.cancelDrag,...options,
   busy:()=>!!(state.closed||state.loading||state.snap.busy||options.busy?.())});
 }
 state.stageSearch='';state.waveSpawnFilter='all';state.showFirstUpgradeCards=false;
 const expanded=state.stageDetails||(state.stageDetails=Object.create(null));
 // Tokens are editor-only: wave rows deliberately retain their authored format.
 // A queued handler may compose our own edits, but never follow a shifted row.
 const waveTargets=new Map();
 function rememberWave(target,fingerprint){target.known.add(fingerprint);while(target.known.size>8)target.known.delete(target.known.values().next().value);}
 function waveTarget(index){const stageId=stage().id,key=stageId+'\u0000'+index,row=stage().config.WaveCfg&&stage().config.WaveCfg[index],fingerprint=JSON.stringify(row);let target=waveTargets.get(key);if(!target||!target.known.has(fingerprint)){target={key,stageId,index,latest:fingerprint,known:new Set([fingerprint]),pending:0};waveTargets.set(key,target);}else if(!target.pending)target.latest=fingerprint;return target;}
 function invalidateWaves(stageId,start){for(const [key,target]of waveTargets)if(target.stageId===stageId&&target.index>=start)waveTargets.delete(key);}
 function waveEdit(target,mutate,strict){
  target.pending++;
  const settle=()=>{target.pending--;if(!target.pending&&stage().id===target.stageId&&waveTargets.get(target.key)===target){target.latest=JSON.stringify(stage().config.WaveCfg&&stage().config.WaveCfg[target.index]);rememberWave(target,target.latest);}};
  try{const result=edit(s=>{const list=s.config&&s.config.WaveCfg,row=Array.isArray(list)&&list[target.index];if(s.id!==target.stageId||waveTargets.get(target.key)!==target||JSON.stringify(row)!==target.latest)throw Error('This wave changed or moved while the edit was waiting. Select the latest wave and try again.');mutate(s,target.index,row);if(waveTargets.get(target.key)===target){target.latest=JSON.stringify(s.config.WaveCfg[target.index]);rememberWave(target,target.latest);}},strict);if(result&&typeof result.then==='function')return result.finally(settle);settle();return result;}catch(error){settle();throw error;}
 }
 function unitName(unit){const name=unit&&unit.name;return(typeof name==='string'||typeof name==='number')&&String(name).trim()?String(name):'Unit '+(unit&&unit.id);}
 const detailContext=key=>stage().id+'\u0000'+state.tab+'\u0000'+key;
 function details(title,key,defaultOpen,onToggle){
  const context=detailContext(key),panel=el('details',undefined,'world-stage-details');
  const remembered=()=>expanded[context]??!!defaultOpen;
  panel.open=remembered();
  panel.appendChild(el('summary',title));
  panel.ontoggle=()=>{
   if(!panel.isConnected||panel.open===remembered())return;
   expanded[context]=panel.open;
   onToggle?.();
  };
  return panel;
 }
 const title=row=>'Stage '+row.level+' — '+cleanName(row.id===stage().id?currentName():row.name);
 function rowForCurrent(){return (catalog().stages||[]).find(row=>row.id===stage().id)||stage();}
 function currentName(){const name=stage().config.Name;return typeof name==='string'&&!/^\[\[loc:/.test(name)?name:state.snap.stageName||rowForCurrent().name;}
 function stageButton(parent,row){const b=button(parent,'',()=>{c.cancelDrag();return c.load('stage:'+row.id);},row.id===stage().id);b.className+=' world-stage-card';b.dataset.stageId=row.id;b.setAttribute('aria-current',String(row.id===stage().id));b.appendChild(el('strong',title(row)));b.appendChild(el('small',(row.waves||0)+' waves · '+((catalog().maps.find(m=>m.id===row.mapId)||{}).name||row.mapId)+(row.dirty?' · Draft':'')));return b;}
 function top(){
  const parent=c.top;parent.textContent='';const main=el('div',undefined,'world-stage-primary'),label=el('label',undefined,'world-stage-picker');label.appendChild(el('span','Stage'));const picker=select(label,stage().id,catalog().stages.map(row=>({value:row.id,label:title(row)})),id=>c.load('stage:'+id));picker.setAttribute('aria-label','Stage');main.appendChild(label);
  if(state.tab==='Waves'){
   const row=stage().config.WaveCfg?.[state.wave];
   main.classList.add('world-stage-primary-overview');
   waveOverview.render(main,{key:stage().id+'\u0000'+state.wave,label:waveLabel(row,state.wave),wave:row,units:unitRows(),interval:catalog().interval});
  }
  parent.appendChild(main);
  const actions=el('div',undefined,'world-stage-header-actions');parent.appendChild(actions);button(actions,'Fit map',c.fit);button(actions,state.previewBusy?'Preparing preview…':'Preview draft',c.startPreview).disabled=!!state.previewBusy;if(state.previewOpen)button(actions,'Close preview',c.closePreview);
  const replace=button(actions,'Replace stage',c.replaceStage);replace.disabled=!catalog().stages.some(row=>row.id!==stage().id);replace.title='Choose a source stage and the sections to replace in this draft. Undo restores it; Save applies it.';
  actions.appendChild(el('span',undefined,'world-spacer'));const undo=button(actions,'Undo',()=>c.action('undo'));undo.disabled=!state.snap.canUndo;undo.title='Undo (Ctrl+Z)';const redo=button(actions,'Redo',()=>c.action('redo'));redo.disabled=!state.snap.canRedo;redo.title='Redo (Ctrl+Shift+Z)';button(actions,'Refresh',c.refresh);button(actions,'Discard',c.discard).disabled=!state.snap.dirty;const save=button(actions,'Save',c.save,state.snap.dirty);save.dataset.action='save';save.disabled=!state.snap.dirty;save.onmousedown=event=>{if(event.button===0)event.preventDefault();};
 }
 function tabs(){
  for(const name of ['Stage','Buildings','Spawns','Paths','Waves']){const tab=button(c.tabs,name,()=>{c.cancelDrag();state.tab=name;state.tool='select';state.selection=[];state.connect=null;render();},state.tab===name);tab.setAttribute('aria-pressed',String(state.tab===name));}
  const tools=el('div',undefined,'world-stage-tab-tools');c.tabs.appendChild(tools);
  if(state.tab!=='Waves')button(tools,'Select / move',()=>{state.tool='select';render();},state.tool==='select');
  if(state.tab==='Buildings')button(tools,'Place building',()=>{state.tool='building';render();},state.tool==='building');
  if(state.tab==='Spawns'){
   button(tools,'Add spawn',()=>{state.tool='spawn';render();},state.tool==='spawn');
   button(tools,'Spawn groups',()=>{c.cancelDrag();state.selection=[];state.tool='select';render();});
  }
  if(state.tab==='Paths'){button(tools,'Add point',()=>{state.tool='node';render();},state.tool==='node');button(tools,'Connect points',()=>{state.tool='connect';state.connect=null;render();},state.tool==='connect');}
  if(['Stage','Buildings'].includes(state.tab)){
   field(tools,'Hall preview',state.previewHall,value=>{state.previewHall=value;c.prepareImages();draw();},[1,2,3,4]);
   const level=field(tools,'Building preview',state.previewBuildingLevel,value=>{state.previewBuildingLevel=value;render();},[1,2,3,4]);
   level.setAttribute('aria-label','Preview building level');
   level.title='Show buildings at this level or their highest available upgrade.';
  }
  if(state.tab==='Buildings'){
   const cards=field(tools,'First-upgrade cards',state.showFirstUpgradeCards,value=>{state.showFirstUpgradeCards=value;c.prepareImages();draw();});
   cards.title='Show the in-game name cards for the building plots available at this hall level.';
  }
  if(state.tab!=='Waves'){field(tools,'Blockers',state.showBlockers,value=>{state.showBlockers=value;render();});field(tools,'Snap',state.snapGrid,value=>state.snapGrid=Math.max(0,value));}
  if(state.tab!=='Waves'&&state.showBlockers){const legend=el('span',undefined,'world-blocker-legend');legend.appendChild(el('span','Map','world-map-blocker-key'));legend.appendChild(el('span','Buildings','world-building-blocker-key'));tools.appendChild(legend);}
 }
 function left(){
  const parent=c.left;parent.textContent='';
  if(state.tab==='Stage'){
   section(parent,'Stages');const search=el('input');search.type='search';search.placeholder='Find a stage…';search.setAttribute('aria-label','Find a stage');search.value=state.stageSearch;parent.appendChild(search);const rows=el('div',undefined,'world-stage-list');parent.appendChild(rows);for(const row of catalog().stages)stageButton(rows,row);const filter=()=>{state.stageSearch=search.value;for(const row of rows.children)row.hidden=!row.textContent.toLowerCase().includes(search.value.toLowerCase());};search.oninput=filter;filter();return;
  }
  if(state.tab==='Buildings'){
   section(parent,'Placed buildings');note(parent,'Drag cards to rearrange them.');const rows=el('div',undefined,'world-building-list'),cards=[];parent.appendChild(rows);for(const b of CardOrder.ordered(stage().buildings)){const item=button(rows,b.name+(b.enabled===false?' · Disabled':''),()=>{c.cancelDrag();state.tool='select';state.selection=['building:'+b.id];render();},state.selection.includes('building:'+b.id));item.dataset.buildingId=b.id;item.setAttribute('aria-current',String(state.selection[0]==='building:'+b.id));item.setAttribute('aria-pressed',String(state.selection.includes('building:'+b.id)));cards.push({id:b.id,node:item});}draggable(rows,cards,s=>s.buildings);
   const offers=stage().specials||[];
   if(offers.length){
    section(parent,'Recruit and merchant offers');
    const list=el('div',undefined,'world-building-list'),offerCards=[];
    parent.appendChild(list);
    for(const offer of CardOrder.ordered(offers)){
     const label=Names.offerName(offer)+(offer.enabled===false?' · Disabled':'');
     const item=button(list,label,()=>{c.cancelDrag();state.tool='select';state.selection=['special:'+offer.id];render();},state.selection.includes('special:'+offer.id));
     item.dataset.specialId=offer.id;
     item.setAttribute('aria-current',String(state.selection[0]==='special:'+offer.id));
     item.setAttribute('aria-pressed',String(state.selection.includes('special:'+offer.id)));
     offerCards.push({id:offer.id,node:item});
    }
    draggable(list,offerCards,s=>s.specials||[]);
   }
   section(parent,'Add a building');note(parent,'Choose a type, then click the map to place it.');c.buildingPalette(parent);return;
  }
  if(state.tab==='Waves'){
   section(parent,'Waves');const waves=stage().config.WaveCfg;if(!Array.isArray(waves)||!waves.length){note(parent,'This stage needs a valid list of waves.',true);button(parent,'Repair waves JSON…',()=>c.jsonField('WaveCfg'));return;}const rows=el('div',undefined,'world-wave-list');parent.appendChild(rows);waves.forEach((w,index)=>{let count,error;try{count=summary(w);}catch(problem){error=problem;}const b=button(rows,'',()=>{c.cancelDrag();state.wave=index;state.waveSpawnFilter='all';state.selection=[];render();},state.wave===index);b.dataset.waveIndex=index;b.setAttribute('aria-current',String(state.wave===index));b.appendChild(el('strong','Wave '+(w&&w.Wave||index+1)));b.appendChild(el('small',error?'Invalid schedule':count.units+' units · '+count.spawnIds.length+' spawn points'));b.appendChild(el('small',Stats.multipliers(w),'world-wave-multipliers'));if(error)b.title=error.message;});
   const actions=el('div',undefined,'world-actions');parent.appendChild(actions);const target=waveTarget(state.wave);button(actions,'Add wave',()=>{c.cancelDrag();return waveEdit(target,(s,index)=>{state.wave=Waves.addWave(s,index);state.waveSpawnFilter='all';});});button(actions,'Duplicate wave',()=>{c.cancelDrag();return waveEdit(target,(s,index)=>{state.wave=Waves.duplicateWave(s,index);state.waveSpawnFilter='all';});});button(actions,'Remove wave',()=>{c.cancelDrag();return waveEdit(target,(s,index)=>{invalidateWaves(s.id,index);state.wave=Waves.removeWave(s,index);state.waveSpawnFilter='all';});}).disabled=stage().config.WaveCfg.length<=1;return;
  }
  if(state.tab==='Paths'){
   section(parent,'Paths');note(parent,'Choose a route to edit its points on the map. Drag cards to rearrange them.');const rows=el('div',undefined,'world-path-list'),cards=[];parent.appendChild(rows);for(const graph of CardOrder.ordered(stage().graphs)){const b=button(rows,'',()=>{c.cancelDrag();state.graph=graph.id;state.spawn=(stage().spawns.find(spawn=>spawn.enabled!==false&&graph.spawnIds.includes(spawn.id))||{}).id||null;state.selection=[];state.tool='select';render();},state.graph===graph.id);b.dataset.graphId=graph.id;b.setAttribute('aria-current',String(state.graph===graph.id));b.appendChild(el('strong',pathTitle(stage(),graph)));b.appendChild(el('small',pathSubtitle(stage(),graph)));cards.push({id:graph.id,node:b});}draggable(rows,cards,s=>s.graphs);button(parent,'New path',()=>{c.cancelDrag();return c.newPath();});return;
  }
  section(parent,'Spawn points');SpawnGroupsPanel.sidebar(parent,c,stage());
  button(parent,'Add spawn on map',()=>{state.tool='spawn';render();});button(parent,'Hero start',()=>{c.cancelDrag();state.selection=['hero'];state.tool='select';render();},state.selection.includes('hero'));
  const tasks=button(parent,'Tasks position',()=>{c.cancelDrag();state.selection=['tasks-position'];state.tool='tasks-position';render();},state.selection.includes('tasks-position'));
  tasks.title='Click the map to place the Royal Advisor';
 }
 function stageInspector(){
  section(c.right,title(rowForCurrent()));
  const identity=el('label'),number=el('output','Stage '+stage().level);identity.appendChild(el('span','Stage number'));number.setAttribute('aria-label','Stage number');identity.appendChild(number);c.right.appendChild(identity);
  const stageId=stage().id,originalName=stage().config.Name,initialName=cleanName(currentName());
  const name=field(c.right,'Stage name',initialName,value=>edit(s=>{
   const next=cleanName(value);if(!next)throw Error('Enter a stage name.');
   if(s.id!==stageId)throw Error('The stage changed. Select its name again.');
   if(next===initialName||s.config.Name===s.level+'. '+next)return;
   if(s.config.Name!==originalName)throw Error('The stage name changed. Review the current name and try again.');
   s.config.Name=s.level+'. '+next;
  }));name.setAttribute('aria-label','Stage name');name.placeholder='Enter a stage name';
  const stats=el('div',undefined,'world-stage-summary');for(const value of [stage().buildings.filter(b=>b.enabled!==false).length+' buildings',stage().spawns.filter(s=>s.enabled!==false).length+' spawn points',stage().graphs.length+' paths',Array.isArray(stage().config.WaveCfg)?stage().config.WaveCfg.length+' waves':'Invalid wave list'])stats.appendChild(el('span',value));c.right.appendChild(stats);
  const waves=stage().config.WaveCfg;if(Array.isArray(waves)&&waves.length){section(c.right,'Enemy scaling by wave');const table=el('table',undefined,'world-stage-wave-overview');table.setAttribute('aria-label','Enemy scaling by wave');const head=el('thead'),header=el('tr');for(const label of ['Wave','Units','HP ×','Damage ×']){const cell=el('th',label);cell.setAttribute('scope','col');header.appendChild(cell);}head.appendChild(header);table.appendChild(head);const body=el('tbody');waves.forEach((w,index)=>{const row=el('tr');row.dataset.waveIndex=index;const name=el('td');button(name,String(w&&w.Wave||index+1),()=>{c.cancelDrag();state.tab='Waves';state.wave=index;state.waveSpawnFilter='all';state.selection=[];render();}).setAttribute('aria-label','Inspect Wave '+(w&&w.Wave||index+1));row.appendChild(name);let count;try{count=summary(w).units;}catch(_){count=null;}for(const value of [Stats.format(count),Stats.factor(w&&w.HealthCoefficient),Stats.factor(w&&w.AttackCoefficient)])row.appendChild(el('td',value));body.appendChild(row);});table.appendChild(body);c.right.appendChild(table);note(c.right,'Select a wave to see each enemy’s HP and damage. Values are per unit, before battle buffs.');}
  stageCards.render(c.right);
  section(c.right,'Environment');
  const mapId=stage().mapId,maps=catalog().maps.map(m=>({value:m.id,label:m.name}));
  const available=maps.some(m=>m.value===mapId);
  if(!available)maps.unshift({value:mapId,label:state.map?.name||mapId});
  field(c.right,'Map',mapId,value=>edit(s=>s.mapId=value),maps);
  field(c.right,'Biome',stage().config.EnvironmentBiomeOverride===true?stage().config.EnvironmentBiome:'map',value=>edit(s=>{if(s.id!==stageId)throw Error('The stage changed. Select its biome again.');if(value==='map'){delete s.config.EnvironmentBiomeOverride;const map=catalog().maps.find(map=>map.id===s.mapId)||(state.map?.id===s.mapId?state.map:null);if(map&&Model.BIOMES.includes(map.biome))s.config.EnvironmentBiome=map.biome;return;}if(!Model.BIOMES.includes(value))throw Error('Choose a valid stage biome.');s.config.EnvironmentBiome=value;s.config.EnvironmentBiomeOverride=true;}),[{value:'map',label:'Use map biome'}].concat(Model.BIOMES.map(value=>({value,label:value.split('-').map(word=>word[0].toUpperCase()+word.slice(1)).join(' ')}))));
  if(available)button(c.right,'Edit this map',c.editMap);
  note(c.right,'Maps contain the shared scenery. The stage biome sets its music, movement sounds and loading art. Buildings, spawns, paths and waves belong to this stage.');
   const advanced=details('Stage settings','stage-settings');c.right.appendChild(advanced);const labels={InGameCoefficient:'Battle reward multiplier',GoldSupplyCoefficient:'Gold multiplier',ConversionCoefficient:'Conversion multiplier',EquipLevelCap:'Equipment level cap',Challenge:'Challenge ID'};for(const key of Object.keys(stage().config).filter(key=>typeof stage().config[key]==='number'&&key!=='Level'&&key!=='StageFaceUnit'))field(advanced,labels[key]||key,valueOrZero(stage().config[key]),value=>edit(s=>s.config[key]=value));button(advanced,'Challenge rewards…',()=>c.jsonField('ChallengeReward'));
 }
 function valueOrZero(value){return value===undefined?0:value;}
 function battleTasksInspector(){
  const data=catalog().battleTasks;
  if(!data)return;
  const current=stage(),stageId=current.id,key=current.level===1?1:2,tasks=current.config.BattleTasks;
  const source=data.defaults[key]||[],random=data.random[key],count=random?data.count[key]??source.length:source.length;
  const definitions=data.definitions,rewards=data.rewards;
  const validCount=value=>Number.isSafeInteger(value)&&value>0;
  const survival=id=>typeof id==='string'&&id.startsWith('survive-');
  function assignTask(row,definition){
   const next={...row,taskId:definition.id};
   if(definition.counted){
    if(row.taskId!==definition.id||!validCount(row.count))next.count=definition.defaultCount??(survival(definition.id)?1:10);
   }else delete next.count;
   return next;
  }
  const parent=el('div',undefined,'world-battle-tasks');
  c.right.appendChild(parent);section(parent,'Battle tasks');
  let expected=JSON.stringify(tasks);
  const order=Array.isArray(tasks)?tasks.map((_row,index)=>index):[];
  const changed=()=>Error('The task list changed. Review it before editing again.');
  // Follow a row across reorder actions from the same render. Its index is
  // editor-only since the same task can be assigned to more than one slot.
  const change=update=>edit(s=>{
   if(s.id!==stageId||JSON.stringify(s.config.BattleTasks)!==expected)throw changed();
   update(s.config);expected=JSON.stringify(s.config.BattleTasks);
  });
  const changeRow=(index,update)=>change(config=>{
   const at=order.indexOf(index),rows=config.BattleTasks;
   if(at<0||!Array.isArray(rows))throw changed();
   update(rows,at);
  });
  if(tasks===undefined){
   if(!source.length)note(parent,'This stage has no default tasks.');
   else if(random)note(parent,'The game chooses '+count+' tasks at random from the default pool. Rewards follow their assigned slots.');
   else note(parent,'The game uses the default tasks in order.');
   button(parent,'Customize tasks',()=>change(config=>{config.BattleTasks=source.slice(0,count).map(row=>({...row}));}));
   if(source.length){
    const pool=details(random?'Default task pool':'Default tasks','battle-tasks-defaults');
    parent.appendChild(pool);
    if(random)note(pool,'Customization starts with the first '+Math.min(count,source.length)+' tasks in this list.');
    const list=el('ul',undefined,'world-battle-task-defaults');pool.appendChild(list);
    for(const row of random?source:source.slice(0,count)){
     const task=definitions.find(item=>item.id===row.taskId),reward=rewards.find(item=>item.id===row.rewardId);
     list.appendChild(el('li',(task?task.label:'Task '+row.taskId)+(random?'':' · '+row.amount+' '+(reward?reward.label:'reward '+row.rewardId))));
    }
   }
   return;
  }
  const actions=el('div',undefined,'world-actions');parent.appendChild(actions);
  button(actions,'Use default tasks',()=>change(config=>{delete config.BattleTasks;}));
  if(!Array.isArray(tasks)){
   note(parent,'The saved battle tasks are invalid. Use default tasks to reset them.',true);
   return;
  }
  const add=button(actions,'Add task',()=>change(config=>{
   const rows=config.BattleTasks;
   if(!Array.isArray(rows))throw changed();
   const definition=definitions.find(item=>!rows.some(row=>row&&row.taskId===item.id))||definitions[0];
   if(!definition||!rewards.length)throw Error('Task and reward choices are unavailable.');
   const award=source[Math.min(rows.length,source.length-1)];
   rows.push(assignTask({rewardId:award?award.rewardId:rewards[0].id,amount:award?award.amount:1},definition));
   order.push(Symbol());
  }));
  add.disabled=!definitions.length||!rewards.length;
  if(!tasks.length){
   note(parent,'Battle tasks are disabled for this stage. Add a task to enable them.');
   return;
  }
  note(parent,'Tasks appear in this order. The stage reward multiplier applies to persistent rewards. Battle silver uses the base amount.');
  function choices(items,value,label){
   const options=items.map(item=>({value:String(item.id),label:item.label}));
   if(!options.some(item=>item.value===value))options.unshift({value,label:value===''?'Choose '+label:'Unavailable '+label+' '+value});
   return options;
  }
  tasks.forEach((value,index)=>{
   const row=isWaveRow(value)?value:{},card=el('div',undefined,'world-battle-task-card');
   const slot='Task '+(index+1);
   card.dataset.entryId='battle-task-'+index;
   card.setAttribute('role','group');card.setAttribute('aria-label',slot);
   card.appendChild(el('strong',slot));parent.appendChild(card);
   const update=(property,next)=>changeRow(index,(rows,at)=>{rows[at]={...(isWaveRow(rows[at])?rows[at]:{}),[property]:next};});
   for(const [property,label,items] of [['taskId','Task',definitions],['rewardId','Reward',rewards]]){
    const id=row[property],selected=Number.isSafeInteger(id)||property==='taskId'&&typeof id==='string'?String(id):'';
    const labelLower=label.toLowerCase(),options=choices(items,selected,labelLower);
    const picker=field(card,label,selected,next=>changeRow(index,(rows,at)=>{
     const choice=items.find(item=>String(item.id)===String(next));
     if(!choice)throw Error('Choose an available '+labelLower+'.');
     const current=isWaveRow(rows[at])?rows[at]:{};
     rows[at]=property==='taskId'?assignTask(current,choice):{...current,rewardId:choice.id};
    }),options);
    picker.setAttribute('aria-label',slot+' '+labelLower);
    picker.title=(options.find(option=>option.value===selected)||{}).label||'';
   }
   const definition=definitions.find(item=>item.id===row.taskId);
   if(definition&&definition.counted){
    const required=field(card,'Count',numericValue(row.count),next=>changeRow(index,(rows,at)=>{
     if(rows[at].taskId!==row.taskId)throw changed();
     if(!validCount(next))throw Error('Enter a whole count of at least 1.');
     rows[at]={...rows[at],count:next};
    }));
    required.min='1';required.step='1';required.setAttribute('aria-label',slot+' count');
    note(card,survival(row.taskId)
     ? 'Once active, this task counts consecutive waves with the listed structures built and none destroyed. Losing one of those structures resets the streak.'
     : 'Only final blows from the listed source count while this task is active.');
   }
   const amount=field(card,'Base amount',numericValue(row.amount),next=>{
    if(Number.isSafeInteger(next)&&next>=0)return update('amount',next);
    return change(()=>{throw Error('Enter a whole reward amount of zero or greater.');});
   });
   amount.min='0';amount.step='1';amount.setAttribute('aria-label',slot+' base amount');
   const buttons=el('div',undefined,'world-actions');card.appendChild(buttons);
   for(const [direction,offset] of [['Move up',-1],['Move down',1]]){
    const move=button(buttons,direction,()=>changeRow(index,(rows,at)=>{
     const to=at+offset;
     if(to<0||to>=rows.length)return;
     [rows[at],rows[to]]=[rows[to],rows[at]];
     [order[at],order[to]]=[order[to],order[at]];
    }));
    move.disabled=index+offset<0||index+offset>=tasks.length;
    move.setAttribute('aria-label',direction+' '+slot.toLowerCase());
   }
   button(buttons,'Remove',()=>changeRow(index,(rows,at)=>{
    rows.splice(at,1);order.splice(at,1);
   })).setAttribute('aria-label','Remove '+slot.toLowerCase());
  });
 }
 function spawnInspector(){
  const id=state.selection.find(value=>value==='hero'||value==='tasks-position'||value.startsWith('spawn:'));
  if(id==='tasks-position'){
   section(c.right,'Tasks position');
   note(c.right,state.tool==='tasks-position'?'Click the map to place the Royal Advisor. Escape cancels placement.':'Drag the marker or edit its coordinates to move the Royal Advisor.');
   const position=TaskPosition.resolve(stage().tasksPosition,stage().hero,state.map&&state.map.size);
   field(c.right,'X',position.x,value=>c.patchSelected('x',value));
   field(c.right,'Y',position.y,value=>c.patchSelected('y',value));
   battleTasksInspector();
   return;
  }
  const spawn=id==='hero'?stage().hero:stage().spawns.find(s=>'spawn:'+s.id===id);
  section(c.right,id==='hero'?'Hero start':'Spawn point');
  if(!spawn){
   note(c.right,'Select a spawn on the left or click its marker on the map.');
   SpawnGroupsPanel.render(c.right,c,stage());
   return;
  }
  if(id!=='hero'){
   field(c.right,'Name',spawn.name==null?'':String(spawn.name),value=>c.patchSelected('name',value));
   field(c.right,'Enabled',spawn.enabled!==false,value=>c.patchSelected('enabled',value));
   SpawnGroupsPanel.assignment(c.right,c,stage(),spawn);
   const radius=field(c.right,'Spawn radius',numericValue(spawn.radius||0),value=>{
    if(!Number.isFinite(value)||value<0||value>1500)throw Error('Choose a radius from 0 to 1500.');
    return c.patchSelected('radius',value);
   });
   radius.min='0';radius.max='1500';radius.step='0.1';
   if(c.spawnRadiusScrubber)c.spawnRadiusScrubber(radius);
   note(c.right,'Drag the Spawn radius label or circle handle to resize. Ctrl + wheel: ±10. The circle stays inside the map. Enemies appear inside it and can move out of blocked terrain. Radius 0 keeps a point spawn.');
  }
  for(const key of ['x','y'])field(c.right,key.toUpperCase(),spawn[key],value=>c.patchSelected(key,value));
  if(id==='hero')return;

  const stageId=stage().id,timing=details('Default timing','spawn:'+spawn.id+':timing',true);
  const defaults=Waves.spawnTiming(spawn,catalog().interval);
  const editTiming=change=>edit(draft=>{
   if(draft.id!==stageId)throw Error('Select the current spawn before changing its timing.');
   change(draft);
  });
  const changeTiming=(key,value)=>editTiming(draft=>Waves.setSpawnTiming(draft,spawn.id,key,value));
  c.right.appendChild(timing);
  timingEntry(timing,'Starts at (s)',defaults.startSeconds,value=>changeTiming('startSeconds',value));
  timingEntry(timing,'Interval (s)',defaults.intervalSeconds,value=>changeTiming('intervalSeconds',value),()=>true);
  button(timing,'Apply to all wave groups',()=>editTiming(draft=>Waves.applySpawnDefaults(draft,spawn.id,catalog().interval)))
   .title='Apply to Auto rows using this spawn in every wave of the stage.';
  note(timing,'Auto rows can follow spawn defaults. Manual rows use their own timing.');
  section(c.right,'Routes using this spawn');
  for(const graph of stage().graphs.filter(g=>g.spawnIds.includes(spawn.id)))button(c.right,pathTitle(stage(),graph),()=>{
   c.cancelDrag();state.tab='Paths';state.graph=graph.id;state.spawn=spawn.id;state.selection=[];render();
  });
  button(c.right,'Delete spawn',c.remove);
  note(c.right,'Use Waves to choose which enemies enter here.');
 }
 function sameCondition(a,b){return a===b||!!a&&!!b&&typeof a==='object'&&typeof b==='object'&&JSON.stringify(a)===JSON.stringify(b);}
 function eachTimedGroup(s,visit){for(const wave of Array.isArray(s.config.WaveCfg)?s.config.WaveCfg:[])if(wave&&Array.isArray(wave.SpawnTimeline))for(const entry of wave.SpawnTimeline)if(entry&&typeof entry==='object'&&!Array.isArray(entry))visit(entry);}
 function conditionFields(parent,value,change){
  if(value!==undefined&&value!==null&&!Array.isArray(value)){note(parent,'The saved building conditions are not a list. Clear them explicitly to repair this route.',true);button(parent,'Clear invalid conditions',()=>change(current=>{if(JSON.stringify(current)!==JSON.stringify(value))throw Error('Building conditions changed. Reopen this route before clearing them.');return [];}));return;}
  const ids=value||[],known=stage().buildings,options=known.concat(Array.from(new Set(ids)).filter(id=>!known.some(building=>building.id===id)).map(id=>({id,name:'Missing building '+id})));
  for(const building of options)field(parent,building.name,ids.includes(building.id),enabled=>change(current=>{if(current!==undefined&&current!==null&&!Array.isArray(current))throw Error('Building conditions changed. Reopen this route before editing them.');const latest=current||[];return enabled?(latest.some(id=>sameCondition(id,building.id))?latest:latest.concat(building.id)):latest.filter(id=>!sameCondition(id,building.id));}));
 }
 function pathInspector(){
  const graph=stage().graphs.find(g=>g.id===state.graph);section(c.right,graph?pathTitle(stage(),graph):'Path');if(!graph){note(c.right,'Choose a path on the left, or create a new one.');return;}
  field(c.right,'Name',pathTitle(stage(),graph),value=>edit(s=>{const route=s.graphs.find(g=>g.id===graph.id);route.name=value;route.nameFromSpawns=value===Names.generatedPathName(s,route);}));section(c.right,'Used by spawn points');const spawns=el('div',undefined,'world-path-spawns');c.right.appendChild(spawns);for(const spawn of stage().spawns)field(spawns,spawn.name,graph.spawnIds.includes(spawn.id),value=>edit(s=>{const route=s.graphs.find(g=>g.id===graph.id);route.spawnIds=value?Array.from(new Set(route.spawnIds.concat(spawn.id))):route.spawnIds.filter(id=>id!==spawn.id);if(!value){eachTimedGroup(s,entry=>{if(entry.spawnId===spawn.id&&entry.routeGraphId===graph.id)entry.routeGraphId=null;});const point=s.spawns.find(point=>point.id===spawn.id);if(point&&point.graphId===graph.id)point.graphId=null;}}));
  field(c.right,'Route spread',graph.spread===undefined?'spawn':'custom',value=>edit(s=>{const route=s.graphs.find(g=>g.id===graph.id);if(value==='spawn')delete route.spread;else if(route.spread===undefined)route.spread=60;}),[{value:'spawn',label:'Use spawn radius'},{value:'custom',label:'Custom half-width'}]);
  if(graph.spread!==undefined){const width=field(c.right,'Path half-width',numericValue(graph.spread),value=>{if(!Number.isFinite(value)||value<0||value>1500)throw Error('Choose a width from 0 to 1500.');return edit(s=>s.graphs.find(g=>g.id===graph.id).spread=value);});width.min='0';width.max='1500';}
  note(c.right,'Enemies retain a lane based on their spawn position. Lanes tighten around obstacles and keep the same branches and final goal. Width 0 follows the center line.');
  note(c.right,'Cyan arrows show travel direction. Yellow marks the selected point. Ctrl-click inserts the next point; right-click removes it.');
  const selected=state.selection.find(id=>id.startsWith('node:')),node=selected&&graph.nodes.find(n=>'node:'+n.id===selected);
  section(c.right,'Selected point');if(node){const at=Paths.availability(stage(),graph.id,node.id);field(c.right,'X',numericValue(node.x),value=>c.patchSelected('x',Number(value)));field(c.right,'Y',numericValue(node.y),value=>c.patchSelected('y',Number(value)));field(c.right,'Goal',!!node.goal,value=>c.patchSelected('goal',value));button(c.right,'Use as start',()=>edit(s=>s.graphs.find(g=>g.id===graph.id).entry=node.id));const add=button(c.right,node.goal?'Insert point before goal':'Insert next point',()=>c.insertPathNode(node.id));add.disabled=!at.insert;add.title=at.insertReason||'Ctrl-click this point';const remove=button(c.right,'Remove point',()=>c.removePathNode(node.id));remove.disabled=!at.remove;remove.title=at.removeReason||'Right-click this point';}else note(c.right,'Click a path point to move it or edit it here.');
  const edgeId=state.selection.find(id=>id.startsWith('edge:')),edge=edgeId&&graph.edges.find(e=>'edge:'+e.id===edgeId);if(edge){const options=details('Selected connection','path:'+graph.id+':edge:'+edge.id,true);c.right.appendChild(options);field(options,'Branch weight',numericValue(edge.weight),value=>c.patchSelected('weight',Number(value)));note(options,'Weights matter only when a point has multiple outgoing branches. Equal weights choose branches equally.');note(options,'Available when any selected building exists. Leave all unchecked for an unconditional connection.');conditionFields(options,edge.requiresAnyBuilding,update=>edit(s=>{const connection=s.graphs.find(g=>g.id===graph.id).edges.find(e=>e.id===edge.id);connection.requiresAnyBuilding=update(connection.requiresAnyBuilding);}));}
  const advanced=details('Conditional route','path:'+graph.id+':conditions');c.right.appendChild(advanced);note(advanced,'Leave empty for the normal route. Choose buildings only for an alternate route that becomes available when one exists.');if(Model.legacyUnavailable(graph))note(advanced,'The original all-zero building condition keeps this legacy route unavailable. Its data is retained; change the conditions explicitly to enable it.',true);conditionFields(advanced,graph.requiresAnyBuilding,update=>edit(s=>{const route=s.graphs.find(g=>g.id===graph.id);route.requiresAnyBuilding=update(route.requiresAnyBuilding);}));
  const test=details('Test movement','path:'+graph.id+':movement');c.right.appendChild(test);const previewSpawns=stage().spawns.filter(spawn=>spawn.enabled!==false&&graph.spawnIds.includes(spawn.id));if(!previewSpawns.some(spawn=>spawn.id===state.spawn))state.spawn=previewSpawns.length?previewSpawns[0].id:null;const spawnChoice=field(test,'Preview spawn',state.spawn===null?'':state.spawn,value=>{state.spawn=Number(value);state.nav=null;draw();},previewSpawns.length?previewSpawns.map(spawn=>({value:spawn.id,label:spawn.name})):[{value:'',label:'No enabled assigned spawns'}]);spawnChoice.disabled=!previewSpawns.length;field(test,'Unit radius',state.radius,value=>{state.radius=Math.max(1,value);state.nav=null;draw();});button(test,'Calculate approach',c.navigation).disabled=!previewSpawns.length;note(test,previewSpawns.length?'The calculated approach is yellow. A closed attackable gate is a valid destination.':'Assign this path to an enabled spawn before testing its movement.');button(c.right,'Duplicate path',()=>{c.cancelDrag();return edit(s=>{state.graph=Paths.duplicatePath(s,graph.id);state.selection=[];state.connect=null;state.tool='select';});});button(c.right,'Delete path',()=>edit(s=>{s.graphs=s.graphs.filter(g=>g.id!==graph.id);for(const spawn of s.spawns)if(spawn.graphId===graph.id)spawn.graphId=null;eachTimedGroup(s,entry=>{if(entry.routeGraphId===graph.id)entry.routeGraphId=null;});state.graph=null;state.selection=[];}));
 }
 function numericValue(value){return value===null||value===undefined||value===''?NaN:Number(value);}
 function numericEntry(parent,name,value,onchange,integer){const input=field(parent,name,numericValue(value),next=>onchange(Number(next)));input.min=integer?'1':'0';input.step=integer?'1':'0.1';return input;}
 function timingEntry(parent,name,value,change,positive=()=>false){
  const row=el('div',undefined,'world-timing-row');
  const input=field(row,name,numericValue(value),next=>change(Number(next)));
  input.step='any';input.setAttribute('aria-label',name);
  parent.appendChild(row);
  function stepped(delta){
   const current=numericValue(input.value),adjusted=current+delta;
   if(!Number.isFinite(adjusted)||current===adjusted)return null;
   const next=Math.max(0,Number(adjusted.toPrecision(15)));
   return next===current||positive()&&next<Waves.MIN_SPAWN_INTERVAL?null:next;
  }
  const buttons=[];
  for(const direction of [-1,1]){
   const decrease=direction<0;
   const group=el('div',undefined,'world-timing-buttons '+(decrease?'world-timing-decrease':'world-timing-increase'));
   row.appendChild(group);
   for(const amount of [.5,2,5]){
    const delta=direction*amount;
    const step=button(group,(decrease?'−':'+')+amount,()=>{
     const next=stepped(delta);
     if(next===null)return;
     input.value=String(next);
     refresh();
     return change(next);
    });
    const title=(decrease?'Decrease ':'Increase ')+(name==='Interval (s)'?'interval':'start time')+' by '+amount+' seconds';
    step.type='button';step.title=title;step.setAttribute('aria-label',title);
    step.onmousedown=event=>{if(event.button===0)event.preventDefault();};
    buttons.push({step,delta});
   }
  }
  function refresh(){
   input.min=String(positive()?Waves.MIN_SPAWN_INTERVAL:0);
   for(const {step,delta} of buttons)step.disabled=stepped(delta)===null;
  }
  const oninput=input.oninput;
  input.oninput=()=>{if(oninput)oninput();refresh();};
  refresh();
  return {input,refresh,set(next){
   input.value=String(next);input.dataset.modelValue=input.value;delete input.dataset.invalidNumeric;refresh();
  }};
 }
 function copyWaveButton(parent,waves,target){
  const copy=button(parent,'Copy From…',()=>copyWave(target));
  copy.disabled=!waves.some((row,index)=>index!==target.index&&isWaveRow(row));
  copy.setAttribute('aria-haspopup','dialog');
  if(copy.disabled)copy.title='Add another wave to use as a source.';
 }
 function copyWave(target){
  const {index}=target,waves=stage().config.WaveCfg,version=state.snap.version;
  const original=JSON.stringify(Array.isArray(waves)&&waves[index]);
  const selected=state.tab==='Waves'&&state.wave===index&&stage().id===target.stageId&&waveTargets.get(target.key)===target;
  if(!selected||original!==target.latest)throw Error('Select the destination wave again before copying.');
  const sources=waves.map((row,index)=>({row,index})).filter(choice=>choice.index!==index&&isWaveRow(choice.row));
  const preferred=sources.filter(choice=>choice.index<index).pop()||sources[0];
  if(!preferred)throw Error('Add another wave to use as a source.');
  const fingerprints=new Map(sources.map(({row,index})=>[index,JSON.stringify(row)]));
  c.cancelDrag();
  let picker,groups,paths,multipliers,settings;
  return c.modal('Copy into '+waveLabel(waves[index],index),dialog=>{
   dialog.classList.add('world-wave-copy-dialog');
   picker=field(dialog,'Copy from wave',preferred.index,()=>{},sources.map(({row,index})=>({value:index,label:waveLabel(row,index)})));
   const choices=el('fieldset',undefined,'world-wave-copy-options');dialog.appendChild(choices);
   choices.appendChild(el('legend','Copy options'));
   groups=field(choices,'Unit groups and timing',true,checked=>{paths.disabled=!checked;});
   paths=field(choices,'Copy path overrides',true,()=>{});
   multipliers=field(choices,'Enemy health and attack multipliers',true,()=>{});
   settings=field(choices,'Other wave settings and rewards',true,()=>{});
   note(choices,'Copied groups use their spawn’s default path when path overrides are unchecked.');
   note(dialog,'Checked options replace content in the draft. Use Undo to restore the wave.');
  },()=>{
   const sourceIndex=Number(picker.value),options={groups:groups.checked,paths:paths.checked,multipliers:multipliers.checked,settings:settings.checked};
   if(String(picker.value).trim()===''||!fingerprints.has(sourceIndex))throw Error('Choose a source wave from the list.');
   if(!options.groups&&!options.multipliers&&!options.settings)throw Error('Select at least one option to copy.');
   return waveEdit(target,(draft,index,row)=>{
    const source=JSON.stringify(draft.config.WaveCfg[sourceIndex]);
    if(state.tab!=='Waves'||state.wave!==index||state.snap.version!==version||JSON.stringify(row)!==original||source!==fingerprints.get(sourceIndex))throw Error('The waves changed while the popup was open. Reopen it to review the current waves.');
    if(Waves.copyWaveFrom(draft,sourceIndex,index,options)){
     waveTargets.delete(target.key);
     if(options.groups)state.waveSpawnFilter='all';
    }
   },true);
  },'Copy wave');
 }
 function addUnits(existing,group=[]){
  const occupied=new Set(group.filter(row=>row!==existing).map(row=>String(row.spawnId)));
  const spawns=stage().spawns.filter(spawn=>existing&&spawn.id===existing.spawnId||spawn.enabled!==false&&!occupied.has(String(spawn.id)));if(!spawns.length)throw Error('Add an enabled spawn point in Spawns first.');
  const selected=new Set(existing?[existing.unitId]:[]),index=state.wave,stageId=stage().id,revision=state.snap.version,target=waveTarget(index),baseline=JSON.stringify(wave());
  let count=existing?existing.count:1,spawnId=existing?existing.spawnId:spawns.some(s=>s.id===state.spawn)?state.spawn:spawns[0].id;
  const interval=catalog().interval,units=unitRows().slice();
  const defaults=()=>Waves.spawnTiming(spawns.find(spawn=>spawn.id===spawnId),interval);
  const timing=existing?{startSeconds:existing.startSeconds,intervalSeconds:existing.intervalSeconds}:defaults();
  const inherited=new Set(Object.keys(timing).filter(key=>!existing||Waves.inheritsTiming(existing,key))),timingFields={};
  let customTiming=false;
  const changeTime=key=>value=>{
   if(timing[key]===value)return;
   timing[key]=value;inherited.delete(key);customTiming=true;
  };
  if(existing&&!units.some(unit=>unit.id===existing.unitId))units.unshift({id:existing.unitId,name:'Missing unit: '+existing.unitId});
  c.modal((existing?'Switch units in Wave ':'Add units to Wave ')+wave().Wave,dialog=>{
   const controls=el('div',undefined,'world-wave-picker-settings');
   numericEntry(controls,'Count',count,value=>{count=value;timingFields.intervalSeconds.refresh();},true);
   field(controls,'Spawn',spawnId,value=>{
    spawnId=Number(value);
    const next=defaults();
    for(const key of inherited){timing[key]=next[key];timingFields[key].set(next[key]);}
   },spawns.map(spawn=>({value:spawn.id,label:spawn.name})));
   timingFields.startSeconds=timingEntry(controls,'Starts at (s)',timing.startSeconds,changeTime('startSeconds'));
   timingFields.intervalSeconds=timingEntry(controls,'Interval (s)',timing.intervalSeconds,changeTime('intervalSeconds'),()=>count>1);
   return c.unitPicker(dialog,{units,selected,controls,wave:wave(),initialUnitId:existing&&existing.unitId,manageProfiles:false});
  },()=>{const unitIds=Array.from(selected),settings={spawnId,count,...timing};if(customTiming)settings.editorManualTiming=true;else if(inherited.size)settings.inheritSpawnTiming=Array.from(inherited);return edit(s=>{
   if(s.id!==stageId||state.snap.version!==revision||waveTargets.get(target.key)!==target||JSON.stringify(s.config.WaveCfg[index])!==baseline)throw Error('This wave changed while the dialog was open. Close and reopen the unit chooser.');
   if(!Number.isSafeInteger(settings.count)||settings.count<1)throw Error('Unit count must be a positive whole number.');
   if(unitIds.some(id=>!units.some(unit=>unit.id===id)))throw Error('Choose a unit from the current catalog.');
   return Waves.chooseGroups(s,index,unitIds,settings,catalog().interval,existing?existing.id:undefined);
  },true);},existing?'Apply selection':'Add group');
 }
 function waveUnitCard(parent,w,target,{group,visible},units,sortable,timingSection){
  const entry=visible[0],interval=catalog().interval,unit=units.find(unit=>unit.id===entry.unitId);
  const card=el('div',undefined,'world-wave-unit-card'),heading=el('div',undefined,'world-wave-unit-heading');
  card.dataset.entryId=entry.id;parent.appendChild(card);card.appendChild(heading);
  const name=unit?unitName(unit):'Unit '+entry.unitId;
  const handle=sortable?el('button','⋮⋮','world-wave-drag-handle'):null;
  if(handle){
   handle.type='button';
   handle.setAttribute('aria-label','Reorder '+name);
   heading.appendChild(handle);
  }
  if(unit&&unit.iconUrl){const image=el('img');image.src=unit.iconUrl;image.draggable=false;heading.appendChild(image);}
  heading.appendChild(el('strong',name));
  const remove=button(heading,'Remove',()=>waveEdit(target,(s,index)=>Waves.removeGroup(s,index,entry.id,interval,{allSpawns:true})));
  if(group.length>1){card.classList.add('world-wave-unit-card-multi');remove.title='Remove this unit and all its spawn rows';}
  const change=(row,key,value)=>waveEdit(target,(s,index)=>Waves.editGroup(s,index,row.id,{[key]:value},interval));
  const changeUnit=value=>change(entry,'unitId',Number(value));
  if(c.unitField)c.unitField(card,units,entry.unitId,changeUnit,()=>{
   if(stage().id!==target.stageId||state.wave!==target.index||waveTargets.get(target.key)!==target||JSON.stringify(wave())!==target.latest)throw Error('This wave changed. Select the current group before switching units.');
   return addUnits(entry,group);
  },id=>StageProfiles.open(c,id,(s,customId)=>{
   if(s.id!==target.stageId||state.wave!==target.index||waveTargets.get(target.key)!==target||JSON.stringify(s.config.WaveCfg[target.index])!==target.latest)throw Error('This wave changed. Reopen Custom.');
   if(entry.unitId!==customId)Waves.editGroup(s,target.index,entry.id,{unitId:customId},interval);
  }));
  else{
   const choices=units.map(unit=>({value:unit.id,label:unitName(unit)}));
   if(!choices.some(choice=>String(choice.value)===String(entry.unitId)))choices.unshift({value:entry.unitId,label:'Missing unit: '+entry.unitId});
   field(card,'Unit',entry.unitId,changeUnit,choices);
  }

  const free=new Set(Waves.availableSpawns(stage(),group).map(spawn=>String(spawn.id)));
  const spawns=stage().spawns;
  for(const row of visible){
   const counts=el('div',undefined,'world-wave-counts');card.appendChild(counts);
   if(row!==entry)counts.dataset.entryId=row.id;
   numericEntry(counts,'Count',row.count,value=>change(row,'count',value),true);
   const spawnId=String(row.spawnId),choices=spawns.filter(spawn=>String(spawn.id)===spawnId||free.has(String(spawn.id)))
    .map(spawn=>({value:spawn.id,label:spawn.name+(spawn.enabled===false?' (disabled)':'')}));
   if(!choices.some(choice=>String(choice.value)===spawnId))choices.unshift({value:row.spawnId,label:'Unavailable spawn: '+row.spawnId});
   field(counts,'Spawn',row.spawnId,value=>{state.spawn=Number(value);return change(row,'spawnId',state.spawn);},choices);
   const actions=el('div',undefined,'world-wave-spawn-actions');counts.appendChild(actions);
   if(group.length>1){
    const lane=spawns.find(spawn=>String(spawn.id)===spawnId)?.name||'Spawn '+spawnId;
    const removeSpawn=button(actions,'−',()=>waveEdit(target,(s,index)=>Waves.removeGroup(s,index,row.id,interval)));
    removeSpawn.title='Remove '+lane+' from this unit';removeSpawn.setAttribute('aria-label',removeSpawn.title);
   }
   if(row===entry){
    const add=button(actions,'+',()=>waveEdit(target,(s,index)=>{
     Waves.addSpawn(s,index,entry.id,interval);if(state.wave===index)state.waveSpawnFilter='all';
    }));
    add.disabled=!free.size;
    add.title=free.size?'Add another spawn for this unit':'This unit already uses every enabled spawn point';
    add.setAttribute('aria-label','Add spawn for '+name);
   }
  }

  const resolved=Stats.resolve(unit,w),unitStats=el('div',undefined,'world-wave-unit-stats');
  unitStats.title=Stats.formula(unit,w);unitStats.setAttribute('aria-label','Enemy stats per unit before battle buffs');
  for(const [label,value,base,multiplier,rounded]of [['HP per unit',resolved.health,resolved.baseHealth,resolved.healthMultiplier,false],['Damage per hit',resolved.damage,resolved.baseDamage,resolved.damageMultiplier,true]]){
   const stat=el('div',undefined,'world-unit-stat');stat.appendChild(el('span',label));stat.appendChild(el('strong',Stats.format(value)));
   stat.appendChild(el('small','Base '+Stats.factor(base)+' × '+Stats.factor(multiplier)+(rounded?' · rounded':'')));unitStats.appendChild(stat);
  }
  card.appendChild(unitStats);

  for(const row of visible){
   const lane=spawns.find(spawn=>String(spawn.id)===String(row.spawnId))?.name||'Spawn '+row.spawnId;
   const manual=Waves.isTimingManual(row);
   const title='Timing & route · '+(group.length>1?lane+' · ':'')+row.startSeconds+' s / every '+row.intervalSeconds+' s'+(manual?' · Manual':'');
   const timing=timingSection(title,row.id);card.appendChild(timing);
   if(row!==entry)timing.dataset.entryId=row.id;
   const mode=field(timing,'Timing mode',manual?'manual':'auto',value=>waveEdit(target,(s,index)=>
    Waves.setTimingMode(s,index,row.id,value,interval)),[{value:'auto',label:'Auto'},{value:'manual',label:'Manual (locked)'}]);
   mode.title='Auto rows can be balanced. Editing a start or interval locks the row.';
   const start=timingEntry(timing,'Starts at (s)',row.startSeconds,value=>change(row,'startSeconds',value));
   const gap=timingEntry(timing,'Interval (s)',row.intervalSeconds,value=>change(row,'intervalSeconds',value),()=>row.count>1);
   const timingTitle=key=>Waves.inheritsTiming(row,key)?'Uses the spawn’s default until edited':'Wave timing override';
   start.input.title=timingTitle('startSeconds');gap.input.title=timingTitle('intervalSeconds');
   const routes=[{value:'',label:'Spawn default'}].concat(stage().graphs.filter(graph=>graph.spawnIds.includes(row.spawnId)).map(graph=>({value:graph.id,label:pathTitle(stage(),graph)})));
   if(row.routeGraphId&&!routes.some(choice=>choice.value===row.routeGraphId))routes.push({value:row.routeGraphId,label:'Unavailable route: '+row.routeGraphId});
   field(timing,'Route override',row.routeGraphId||'',value=>change(row,'routeGraphId',value||null),routes);
   const defaults=Waves.spawnTiming(spawns.find(spawn=>spawn.id===row.spawnId),interval);
   if(!Waves.usesSpawnDefaults(row,defaults)){
    button(timing,'Use spawn defaults',()=>waveEdit(target,(s,index)=>
     Waves.editGroup(s,index,row.id,{},interval,{useSpawnDefaults:true}))).title='Use this spawn’s defaults and switch to Auto timing';
   }
  }
  return {id:group[0].id,node:card,handle};
 }
 async function balanceTiming(target){
  const failure=state.editFailures||0,{index}=target;
  await state.pending;
  if(failure!==(state.editFailures||0))throw Error('Correct the last timing edit before opening the balance preview.');
  const current=state.snap?.value;
  if(state.closed||state.active===false||state.loading||current?.id!==target.stageId||state.wave!==index||state.tab!=='Waves'||waveTargets.get(target.key)!==target){
   throw Error('Select the current wave before balancing its timing.');
  }
  const source=current.config.WaveCfg[index],fingerprint=JSON.stringify(source),revision=state.snap.version;
  const unitRevision=state.snap.unitCatalogRevision||0;
  const interval=catalog().interval,defeatSeconds=waveOverview.defeatSeconds,spawnGroups=SpawnGroups.list(current);
  const assertCurrent=(draft=stage())=>{
   if(state.closed||state.active===false||state.loading||draft.id!==target.stageId||state.tab!=='Waves'||state.wave!==index||
     state.snap.version!==revision||(state.snap.unitCatalogRevision||0)!==unitRevision||JSON.stringify(draft.config.WaveCfg?.[index])!==fingerprint||
      waveOverview.defeatSeconds!==defeatSeconds||catalog().interval!==interval||JSON.stringify(SpawnGroups.list(draft))!==JSON.stringify(spawnGroups)){
    throw Error('The wave, unit stats, or timing inputs changed. Reopen Balance wave timing to review the latest values.');
   }
  };
  return WaveBalance.open(c,{label:waveLabel(source,index),wave:source,waveIndex:index,stage:current,units:unitRows(),interval,defeatSeconds,spawnGroups,assertCurrent,
   apply:({limits,changes,manualRows})=>waveEdit(target,(draft,at)=>{
    assertCurrent(draft);
    Waves.applyBalancedTiming(draft,at,changes,interval);
    for(const id of manualRows)Waves.setTimingMode(draft,at,id,'manual',interval);
    const updated=draft.config.WaveCfg[at];
    updated.editorTimingBalance={...updated.editorTimingBalance,...limits};
   },true)
  });
 }
 function waveInspector(){
  const index=state.wave,waves=stage().config.WaveCfg,w=Array.isArray(waves)&&waves[index];
  let total,allEntries;
  try{
   if(!Array.isArray(waves)||!waves.length)throw Error('This stage needs a valid list of waves.');
   total=summary(w);
   allEntries=Waves.entries(w,catalog().interval);
  }catch(error){
   section(c.right,waveLabel(w,index));
   note(c.right,'Cannot read this schedule: '+error.message,true);
   if(isWaveRow(w)){
    copyWaveButton(c.right,waves,waveTarget(index));
    const key=w.SpawnTimeline!==undefined?'SpawnTimeline':'RefreshSoldierKind';
    button(c.right,'Repair schedule JSON…',()=>c.jsonField(key,index));
   }else button(c.right,'Repair waves JSON…',()=>c.jsonField('WaveCfg'));
   return;
  }
  const target=waveTarget(index),parent=el('section',undefined,'world-wave-editor');
  const groups=Waves.unitGroups(allEntries,w.editorUnitOrder),units=unitRows();
  if(state.waveSpawnFilter!=='all'&&!allEntries.some(entry=>String(entry.spawnId)===String(state.waveSpawnFilter)))state.waveSpawnFilter='all';
  c.right.appendChild(parent);
  section(parent,waveLabel(w,index));
  note(parent,total.units+' units · '+groups.length+(groups.length===1?' group':' groups')+' · last spawn at '+Number(total.duration.toFixed(2))+' s');
  const actions=el('div',undefined,'world-wave-actions');parent.appendChild(actions);
  const add=button(actions,'Add units',addUnits,true);add.disabled=!units.length||!stage().spawns.some(spawn=>spawn.enabled!==false);
  copyWaveButton(actions,waves,target);
  const balance=button(actions,'Balance wave timing…',()=>balanceTiming(target));
  balance.classList.add('world-wave-balance-button');balance.disabled=!total.units;
  const scaling=el('div',undefined,'world-wave-scaling');parent.appendChild(scaling);for(const [key,label]of [['HealthCoefficient','Enemy health ×'],['AttackCoefficient','Enemy attack ×']])numericEntry(scaling,label,w[key],value=>waveEdit(target,(s,index,row)=>row[key]=value));note(scaling,'Applied to every enemy in this wave. HP and damage below are per unit, before battle buffs.');
  if(total.spawnIds.length>1)field(parent,'Show spawns',state.waveSpawnFilter,value=>{state.waveSpawnFilter=value;render();},[{value:'all',label:'All spawn points'}].concat(stage().spawns.map(s=>({value:String(s.id),label:s.name}))));
  const filter=state.waveSpawnFilter,interval=catalog().interval;
  const shown=groups.map(group=>({group,visible:Waves.visibleRows(group,filter)})).filter(item=>item.visible.length);
  if(shown.length){
   const list=el('div',undefined,'world-wave-unit-list'),sortable=shown.length>1;
   const isCurrentView=()=>state.tab==='Waves'&&stage().id===target.stageId&&state.wave===index&&state.waveSpawnFilter===filter;
   const timingPanels=new Map(),timingKey=id=>'wave:'+index+':entry:'+id+':timing';
   const anyTimingOpen=()=>allEntries.some(({id})=>timingPanels.get(id)?.open??expanded[detailContext(timingKey(id))]??true);
   const updateTimingButton=()=>{
    timingToggle.textContent=anyTimingOpen()?'Collapse all timing':'Expand all timing';
   };
   const timingToggle=button(parent,'',()=>{
    if(timingToggle.isConnected===false||!isCurrentView())return;
    const open=!anyTimingOpen();
    for(const {id} of allEntries){
     expanded[detailContext(timingKey(id))]=open;
     const panel=timingPanels.get(id);
     if(panel)panel.open=open;
    }
    updateTimingButton();
   });
   timingToggle.classList.add('world-wave-timing-toggle');
   timingToggle.title='Includes groups hidden by the spawn filter.';
   const timingSection=(title,id)=>{
    const panel=details(title,timingKey(id),true,updateTimingButton);
    timingPanels.set(id,panel);
    return panel;
   };
   parent.appendChild(list);
   const cards=shown.map(item=>waveUnitCard(list,w,target,item,units,sortable,timingSection));
   updateTimingButton();
   if(sortable){
    const items=value=>{
     const current=value.config.WaveCfg[index];
     if(current===w)return cards;
     return Waves.unitGroups(Waves.entries(current,interval),current.editorUnitOrder)
      .filter(group=>Waves.visibleRows(group,filter).length)
      .map(group=>({id:group[0].id}));
    };
    draggable(list,cards,items,{
     grid:true,
     busy:()=>list.isConnected===false||!isCurrentView()||stage().config.WaveCfg?.[index]!==w,
     edit:change=>waveEdit(target,value=>{
      if(!isCurrentView())throw Error('The wave or spawn filter changed while the cards were being moved.');
      change(value);
     }),
     move:(value,sourceId,targetId,after)=>Waves.moveGroup(value,index,sourceId,targetId,after,interval,filter)
    });
   }
  }
  if(!groups.length)note(parent,'This wave has no units yet. Use Add units to create its first group.');
  const settings=details('Wave settings & rewards','wave:'+index+':settings');parent.appendChild(settings);for(const [key,label]of [['StartSliver','Starting silver'],['CommerceSliver','Merchant silver']]){const input=numericEntry(settings,label,w[key],value=>waveEdit(target,(s,index,row)=>row[key]=value),true);input.min='0';}button(settings,'Rewards…',()=>c.jsonField('WaveReward',index));button(settings,'Edit schedule JSON…',()=>c.jsonField(w.SpawnTimeline!==undefined?'SpawnTimeline':'RefreshSoldierKind',index));
 }
 function right(){if(state.tab==='Stage')stageInspector();else if(state.tab==='Waves')waveInspector();else if(state.tab==='Paths')pathInspector();else if(state.tab==='Spawns')spawnInspector();else c.buildingInspector();if(state.snap.issues.length){section(c.right,'Validation');state.snap.issues.slice(0,12).forEach(issue=>note(c.right,issue,true));}}
 return {top,tabs,left,right,title};
}
module.exports={create,STAGE_SECTIONS,pathTitle,pathSubtitle,spawnRanges};
