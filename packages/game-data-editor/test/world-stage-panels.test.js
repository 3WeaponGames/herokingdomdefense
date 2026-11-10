'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),Panels=require('../worlds/stage-panels');
const clone=value=>JSON.parse(JSON.stringify(value));
class Element{
 constructor(tag,text,cls){this.tagName=tag;this.className=cls||'';this.children=[];this.dataset={};this.value='';this._text=text||'';}
 appendChild(child){this.children.push(child);child.parentNode=this;return child;}
 setAttribute(name,value){if(!this.attributes)this.attributes={};this.attributes[name]=String(value);}
 set textContent(value){this._text=value;this.children=[];}
 get textContent(){return this._text+this.children.map(child=>child.textContent).join('');}
}
function fixture(){
 const stage={id:'A-7',level:7,variant:'A',mapId:'Map07',hero:{x:0,y:0},buildings:[],spawns:[{id:1,name:'Spawn 1',enabled:true,x:0,y:100}],graphs:[{id:'one',name:'First path',entry:'start',spawnIds:[1],nodes:[{id:'start',x:0,y:100},{id:'goal',x:0,y:0,goal:true}],edges:[{id:'link',from:'start',to:'goal',weight:1}]},{id:'two',name:'Other path',entry:'goal',spawnIds:[1],nodes:[{id:'goal',x:1,y:0,goal:true}],edges:[]}],config:{Level:7,WaveCfg:[{id:7,Wave:1,SpawnTimeline:[{id:'a',unitId:3,spawnId:1,count:1,startSeconds:1,intervalSeconds:1,routeGraphId:'one',future:{keep:1}},{id:'b',unitId:3,spawnId:1,count:1,startSeconds:2,intervalSeconds:1,routeGraphId:'two'},{id:'c',unitId:3,spawnId:1,count:1,startSeconds:3,intervalSeconds:1},{id:'d',unitId:3,spawnId:1,count:1,startSeconds:4,intervalSeconds:1,routeGraphId:null}]},{id:7,Wave:2,RefreshSoldierKind:['1#3,1'],future:{keep:true}}],future:{keep:[1,2]}}};
 const el=(tag,text,cls)=>new Element(tag,text,cls),state={snap:{value:stage,issues:[]},catalog:{interval:.5,stages:[{id:'A-7',variant:'A',level:7,name:'7. Desert',mapId:'Map07',waves:2}],maps:[{id:'Map07',name:'Fire map'}],units:[{id:3,name:'Unit'}]},variant:'A',wave:0,selection:[],previewHall:3,showBlockers:true,snapGrid:0,spawn:1,graph:'one',radius:18,gate:'closed'},noop=()=>{};let edits=0;
 const context={state,el,button(parent,text,handler,active){const button=el('button',text,active?'active':'');button.onclick=handler;parent.appendChild(button);return button;},field(parent,name,value,change,choices){const input=el('input');input.choices=choices;input.value=value;input.fieldName=name;input.change=change;parent.appendChild(input);return input;},select(parent){const input=el('select');parent.appendChild(input);return input;},section(parent,text){parent.appendChild(el('h3',text));},note(parent,text){parent.appendChild(el('p',text));},edit(change){edits++;const draft=clone(state.snap.value);change(draft);state.snap.value=draft;},render:noop,draw:noop,top:el('div'),tabs:el('div'),left:el('div'),right:el('div'),buildingPalette:noop,buildingInspector:noop};
 for(const name of ['load','fit','startPreview','closePreview','replaceStage','action','refresh','discard','save','cancelDrag','prepareImages','editMap','jsonField','patchSelected','remove','newPath','insertPathNode','removePathNode','navigation','modal','copyWave'])context[name]=noop;
 return{state,context,panels:Panels.create(context),edits:()=>edits};
}
function descendants(element){return element.children.flatMap(child=>[child,...descendants(child)]);}
test('rendering every contextual stage tab makes no draft changes or edit requests',()=>{
 const f=fixture(),before=JSON.stringify(f.state.snap.value);for(const tab of ['Stage','Buildings','Spawns','Paths','Waves']){f.state.tab=tab;f.panels.top();f.panels.tabs();f.panels.left();f.panels.right();assert.equal(JSON.stringify(f.state.snap.value),before,tab);}assert.equal(f.edits(),0);
});
test('explicit Delete path clears only matching timed route overrides and preserves all other wave data',()=>{
 const f=fixture(),before=clone(f.state.snap.value);f.state.tab='Paths';f.panels.right();const remove=descendants(f.context.right).find(element=>element.tagName==='button'&&element.textContent==='Delete path');assert(remove);remove.onclick();
 const expected=clone(before);expected.graphs=expected.graphs.filter(graph=>graph.id!=='one');expected.config.WaveCfg[0].SpawnTimeline[0].routeGraphId=null;assert.deepEqual(f.state.snap.value,expected);assert.deepEqual(before.config.WaveCfg[0].SpawnTimeline[0].future,{keep:1});assert(!Object.prototype.hasOwnProperty.call(f.state.snap.value.config.WaveCfg[0].SpawnTimeline[2],'routeGraphId'));assert(!Object.prototype.hasOwnProperty.call(f.state.snap.value.config.WaveCfg[1],'SpawnTimeline'));assert.equal(f.edits(),1);assert.equal(f.state.graph,null);assert.deepEqual(f.state.selection,[]);
});
test('detail expansion survives field edits only within the same stage, wave and group context',()=>{
 const f=fixture();f.state.tab='Waves';f.panels.right();const timing=()=>descendants(f.context.right).find(element=>element.tagName==='details'&&element.children[0].textContent.startsWith('Timing & route'));
 const first=timing();assert.equal(first.open,false);first.isConnected=true;first.open=true;first.ontoggle();
 f.context.right.textContent='';f.state.snap.value.config.WaveCfg[0].SpawnTimeline[0].count=2;f.panels.right();assert.equal(timing().open,true);
 // A queued toggle from a detached old element cannot overwrite current state.
 first.isConnected=false;first.open=false;first.ontoggle();f.context.right.textContent='';f.panels.right();assert.equal(timing().open,true);
 f.context.right.textContent='';f.state.wave=1;f.panels.right();assert.equal(timing().open,false);
 f.context.right.textContent='';f.state.wave=0;f.state.snap.value.id='A-8';f.panels.right();assert.equal(timing().open,false);assert.equal(f.edits(),0);
});
test('selected connection retains editable building conditions without changing graph or edge metadata',()=>{
 const f=fixture();f.state.tab='Paths';f.state.selection=['edge:link'];f.state.snap.value.buildings=[{id:1,name:'Hall',enabled:true},{id:2,name:'Tower',enabled:true}];f.state.snap.value.graphs[0].edges[0].future={keep:1};f.state.snap.value.graphs[0].edges[0].requiresAnyBuilding=[1];const before=clone(f.state.snap.value);f.panels.right();
 const connection=descendants(f.context.right).find(element=>element.tagName==='details'&&element.children[0].textContent==='Selected connection');assert(connection.open);const tower=descendants(connection).find(element=>element.fieldName==='Tower');assert(tower);tower.change(true);const expected=clone(before);expected.graphs[0].edges[0].requiresAnyBuilding=[1,2];assert.deepEqual(f.state.snap.value,expected);
 f.context.right.textContent='';f.panels.right();const next=descendants(f.context.right).find(element=>element.tagName==='details'&&element.children[0].textContent==='Selected connection');descendants(next).find(element=>element.fieldName==='Hall').change(false);assert.deepEqual(f.state.snap.value.graphs[0].edges[0].requiresAnyBuilding,[2]);assert.deepEqual(f.state.snap.value.graphs[0].edges[0].future,{keep:1});
});
test('blocker legend appears on spatial tabs only while blockers are visible',()=>{
 const f=fixture();for(const tab of ['Stage','Buildings','Spawns','Paths','Waves'])for(const visible of [false,true]){f.state.tab=tab;f.state.showBlockers=visible;f.context.tabs.textContent='';f.panels.tabs();const legend=descendants(f.context.tabs).find(element=>element.className==='world-blocker-legend');assert.equal(!!legend,visible&&tab!=='Waves');if(legend)assert.deepEqual(legend.children.map(element=>[element.className,element.textContent]),[['world-map-blocker-key','Map'],['world-building-blocker-key','Buildings']]);}assert.equal(f.edits(),0);
});
test('friendly legacy path labels compress spawn ranges without changing custom names or authored data',()=>{
 const f=fixture(),stage=f.state.snap.value;stage.buildings=[{id:2,name:'East Gate'}];Object.assign(stage.graphs[0],{name:'Path1_2_3',legacy:true,spawnIds:[3,1,2]});Object.assign(stage.graphs[1],{name:'Path1_2_3',legacy:true,spawnIds:[1,2,3],requiresAnyBuilding:[2,99]});const before=JSON.stringify(stage);
 assert.equal(Panels.spawnRanges([9,2,1,3,5,7,8,8]),'1–3, 5, 7–9');assert.equal(Panels.pathTitle(stage,stage.graphs[0]),'Spawns 1–3 · Route 1');assert.equal(Panels.pathTitle(stage,stage.graphs[1]),'Spawns 1–3 · Route 2');assert.equal(Panels.pathSubtitle(stage,stage.graphs[0]),'2 points · Always available');assert.equal(Panels.pathSubtitle(stage,stage.graphs[1]),'1 point · Requires: East Gate or Building 99');
 assert.equal(Panels.pathTitle(stage,{name:'My custom route',legacy:true}),'My custom route');assert.equal(Panels.pathTitle(stage,{name:'Path7_8_9',legacy:false}),'Path7_8_9');assert.equal(JSON.stringify(stage),before);
 f.state.tab='Paths';f.panels.left();f.panels.right();assert.equal(JSON.stringify(stage),before);assert.equal(f.edits(),0);assert(descendants(f.context.left).some(element=>element.tagName==='strong'&&element.textContent==='Spawns 1–3 · Route 1'));const name=descendants(f.context.right).find(element=>element.fieldName==='Name');assert.equal(name.value,'Path1_2_3');
});


test('removing one spawn association clears only that spawn’s matching overrides and default reference',()=>{
 const f=fixture(),stage=f.state.snap.value;stage.spawns.push({id:2,name:'Spawn 2',enabled:true,x:10,y:100,graphId:'one'});stage.spawns[0].graphId='one';stage.graphs[0].spawnIds=[1,2];stage.config.WaveCfg[0].SpawnTimeline[1].spawnId=2;stage.config.WaveCfg[0].SpawnTimeline[1].routeGraphId='one';const before=clone(stage);f.state.tab='Paths';f.panels.right();descendants(f.context.right).find(element=>element.fieldName==='Spawn 1').change(false);
 const expected=clone(before);expected.graphs[0].spawnIds=[2];expected.spawns[0].graphId=null;expected.config.WaveCfg[0].SpawnTimeline[0].routeGraphId=null;assert.deepEqual(f.state.snap.value,expected);assert.equal(f.edits(),1);
});

test('Delete path also clears a matching default graph reference without inventing references on other spawns',()=>{
 const f=fixture();f.state.snap.value.spawns[0].graphId='one';f.state.snap.value.spawns.push({id:2,name:'Spawn 2',x:0,y:0});f.state.tab='Paths';f.panels.right();descendants(f.context.right).find(element=>element.tagName==='button'&&element.textContent==='Delete path').onclick();assert.equal(f.state.snap.value.spawns[0].graphId,null);assert(!Object.hasOwn(f.state.snap.value.spawns[1],'graphId'));
});

test('wave spawn filters recover after a lane disappears or another stage supplies a different lane without data writes',()=>{
 const f=fixture();f.state.tab='Waves';for(const filter of ['2','99']){f.state.waveSpawnFilter=filter;f.context.right.textContent='';const before=JSON.stringify(f.state.snap.value);f.panels.right();assert.equal(f.state.waveSpawnFilter,'all');assert(descendants(f.context.right).some(element=>element.dataset.entryId==='a'));assert.equal(JSON.stringify(f.state.snap.value),before);}assert.equal(f.edits(),0);
 f.state.snap.value.config.WaveCfg[0].SpawnTimeline.forEach(entry=>entry.spawnId=2);f.state.waveSpawnFilter='1';f.context.right.textContent='';f.panels.right();assert.equal(f.state.waveSpawnFilter,'all');assert(descendants(f.context.right).some(element=>element.dataset.entryId==='a'));assert.equal(f.edits(),0);
});

test('Add units keeps invalid submissions in the modal and rejects a concurrently replaced wave before writing',()=>{
 const f=fixture();f.state.tab='Waves';let action,dialog,strictValue;f.context.modal=(title,body,submit)=>{dialog=f.context.el('div');body(dialog);action=submit;};
 const originalEdit=f.context.edit;f.context.edit=(change,strict)=>{strictValue=strict;return originalEdit(change);};const panels=Panels.create(f.context);panels.right();descendants(f.context.right).find(element=>element.tagName==='button'&&element.textContent==='Add units').onclick();
 const count=descendants(dialog).find(element=>element.fieldName==='Count'),before=JSON.stringify(f.state.snap.value);count.change(0);assert.throws(()=>action(),/positive whole/);assert.equal(strictValue,true,'strict draft errors must reach the modal instead of closing it');assert.equal(JSON.stringify(f.state.snap.value),before);
 count.change(3);f.state.snap.value.config.WaveCfg.splice(0,1);const concurrent=JSON.stringify(f.state.snap.value);assert.throws(()=>action(),/wave changed/);assert.equal(JSON.stringify(f.state.snap.value),concurrent);
});

test('disabled offers remain selectable and navigating content lists cancels a pending drag without writing data',()=>{
 const f=fixture();let cancelled=0;f.context.cancelDrag=()=>{cancelled++;};f.state.snap.value.specials=[{id:'recruit:hidden',name:'Hidden recruit',enabled:false,x:0,y:0}];const before=JSON.stringify(f.state.snap.value);f.state.tab='Buildings';f.panels.left();descendants(f.context.left).find(element=>element.dataset.specialId==='recruit:hidden').onclick();assert.deepEqual(f.state.selection,['special:recruit:hidden']);assert.equal(f.state.tool,'select');assert.equal(cancelled,1);
 f.context.left.textContent='';f.state.tab='Paths';f.panels.left();descendants(f.context.left).find(element=>element.dataset.graphId==='one').onclick();assert.equal(cancelled,2);
 f.context.left.textContent='';f.state.tab='Spawns';f.panels.left();descendants(f.context.left).find(element=>element.tagName==='button'&&element.textContent==='Spawn 1').onclick();assert.equal(cancelled,3);
 f.context.left.textContent='';f.state.tab='Waves';f.panels.left();descendants(f.context.left).find(element=>element.dataset.waveIndex===0).onclick();assert.equal(cancelled,4);assert.equal(JSON.stringify(f.state.snap.value),before);assert.equal(f.edits(),0);
});


test('stage navigation and unit choice expose their selected states accessibly without content writes',()=>{
 const f=fixture();f.state.tab='Paths';f.panels.tabs();for(const tab of ['Stage','Buildings','Spawns','Paths','Waves'])assert.equal(descendants(f.context.tabs).find(e=>e.tagName==='button'&&e.textContent===tab).attributes['aria-pressed'],String(tab==='Paths'));
 f.panels.left();for(const id of ['one','two'])assert.equal(descendants(f.context.left).find(e=>e.dataset.graphId===id).attributes['aria-current'],String(id==='one'));
 f.context.left.textContent='';f.state.tab='Stage';f.panels.left();assert.equal(descendants(f.context.left).find(e=>e.dataset.stageId==='A-7').attributes['aria-current'],'true');
 f.context.left.textContent='';f.state.tab='Waves';f.panels.left();assert.equal(descendants(f.context.left).find(e=>e.dataset.waveIndex===0).attributes['aria-current'],'true');assert.equal(descendants(f.context.left).find(e=>e.dataset.waveIndex===1).attributes['aria-current'],'false');
 f.state.catalog.units.push({id:4,name:'Other unit'});let dialog;f.context.modal=(title,body)=>{dialog=f.context.el('div');body(dialog);};f.panels.right();descendants(f.context.right).find(e=>e.tagName==='button'&&e.textContent==='Add units').onclick();let choices=()=>descendants(dialog).filter(e=>e.dataset.unitId);assert.equal(choices().find(e=>e.dataset.unitId===3).attributes['aria-pressed'],'true');choices().find(e=>e.dataset.unitId===4).onclick();assert.equal(choices().find(e=>e.dataset.unitId===3).attributes['aria-pressed'],'false');assert.equal(choices().find(e=>e.dataset.unitId===4).attributes['aria-pressed'],'true');assert.equal(f.edits(),0);
});

test('malformed wave schedules stay browsable and offer an explicit JSON repair without draft writes',()=>{
 for(const [wave,key]of [[null,'WaveCfg'],[42,'WaveCfg'],[[],'WaveCfg'],[{Wave:1,SpawnTimeline:null},'SpawnTimeline'],[{Wave:1,SpawnTimeline:[null]},'SpawnTimeline'],[{Wave:1,RefreshSoldierKind:[null]},'RefreshSoldierKind']]){
  const f=fixture();f.state.tab='Waves';f.state.snap.value.config.WaveCfg=[wave];let repair;f.context.jsonField=(...args)=>repair=args;const before=JSON.stringify(f.state.snap.value);f.panels.left();f.panels.right();assert(descendants(f.context.left).some(e=>e.tagName==='small'&&e.textContent==='Invalid schedule'));assert(f.context.right.textContent.includes('Cannot read this schedule:'));const button=descendants(f.context.right).find(e=>e.tagName==='button'&&e.textContent.startsWith('Repair'));button.onclick();assert.deepEqual(repair,key==='WaveCfg'?['WaveCfg']:[key,0]);assert.equal(JSON.stringify(f.state.snap.value),before);assert.equal(f.edits(),0);
 }
 for(const value of [null,{},[]]){const f=fixture();f.state.tab='Waves';f.state.snap.value.config.WaveCfg=value;let repair;f.context.jsonField=(...args)=>repair=args;const before=JSON.stringify(f.state.snap.value);f.panels.left();f.panels.right();descendants(f.context.right).find(e=>e.tagName==='button').onclick();assert.deepEqual(repair,['WaveCfg']);assert.equal(JSON.stringify(f.state.snap.value),before);assert.equal(f.edits(),0);}
});

test('explicit wave field edits can repair numeric strings while displayed values remain untouched until changed',()=>{
 const f=fixture();f.state.tab='Waves';const entry=f.state.snap.value.config.WaveCfg[0].SpawnTimeline[0];Object.assign(entry,{count:'1',unitId:'3',spawnId:'1'});f.state.waveSpawnFilter='1';const before=JSON.stringify(f.state.snap.value);f.panels.right();assert.equal(JSON.stringify(f.state.snap.value),before);const card=descendants(f.context.right).find(e=>e.dataset.entryId==='a');assert(card);const count=descendants(card).find(e=>e.fieldName==='Count');assert.equal(count.value,1);const unit=descendants(card).find(e=>e.fieldName==='Unit'),spawn=descendants(card).find(e=>e.fieldName==='Spawn');assert(unit&&spawn);assert.equal(f.edits(),0);
 // Each normally invalid group needs all three invalid values fixed together;
 // the schedule JSON action remains available for that explicit repair.
 assert(descendants(f.context.right).some(e=>e.tagName==='button'&&e.textContent==='Edit schedule JSON…'));
 const one=fixture();one.state.tab='Waves';one.state.snap.value.config.WaveCfg[0].SpawnTimeline[0].count='1';one.panels.right();descendants(one.context.right).find(e=>e.dataset.entryId==='a').children.flatMap(e=>[e,...descendants(e)]).find(e=>e.fieldName==='Count').change('2');assert.equal(one.state.snap.value.config.WaveCfg[0].SpawnTimeline[0].count,2);
});


test('missing path condition references remain visible and only explicit unchecking repairs them',()=>{
 const f=fixture();f.state.tab='Paths';f.state.selection=['edge:link'];const graph=f.state.snap.value.graphs[0];graph.requiresAnyBuilding=[99];graph.edges[0].requiresAnyBuilding=[98];graph.edges[0].future={keep:true};const before=clone(f.state.snap.value);f.panels.left();f.panels.right();assert.equal(JSON.stringify(f.state.snap.value),JSON.stringify(before));assert.equal(f.edits(),0);descendants(f.context.right).find(e=>e.fieldName==='Missing building 98').change(false);assert.deepEqual(f.state.snap.value.graphs[0].edges[0].requiresAnyBuilding,[]);assert.deepEqual(f.state.snap.value.graphs[0].requiresAnyBuilding,[99]);assert.deepEqual(f.state.snap.value.graphs[0].edges[0].future,{keep:true});
 f.context.right.textContent='';f.panels.right();descendants(f.context.right).find(e=>e.fieldName==='Missing building 99').change(false);assert.deepEqual(f.state.snap.value.graphs[0].requiresAnyBuilding,[]);
 const invalid=fixture();invalid.state.tab='Paths';invalid.state.snap.value.graphs[0].requiresAnyBuilding='bad';invalid.panels.left();invalid.panels.right();assert(invalid.context.left.textContent.includes('Invalid building conditions'));assert.equal(invalid.edits(),0);descendants(invalid.context.right).find(e=>e.tagName==='button'&&e.textContent==='Clear invalid conditions').onclick();assert.deepEqual(invalid.state.snap.value.graphs[0].requiresAnyBuilding,[]);
});

test('unavailable wave references display their actual current values until an explicit repair',()=>{
 const f=fixture();f.state.tab='Waves';const entry=f.state.snap.value.config.WaveCfg[0].SpawnTimeline[0];Object.assign(entry,{unitId:99,spawnId:99,routeGraphId:'missing'});const before=JSON.stringify(f.state.snap.value);f.panels.right();const card=descendants(f.context.right).find(e=>e.dataset.entryId==='a');for(const [name,label]of [['Unit','Missing unit: 99'],['Spawn','Unavailable spawn: 99'],['Route override','Unavailable route: missing']])assert(descendants(card).find(e=>e.fieldName===name).choices.some(choice=>choice.label===label));assert.equal(JSON.stringify(f.state.snap.value),before);assert.equal(f.edits(),0);
 const repair=fixture();repair.state.tab='Waves';repair.state.snap.value.config.WaveCfg[0].SpawnTimeline[0].routeGraphId='missing';repair.panels.right();const target=descendants(repair.context.right).find(e=>e.dataset.entryId==='a');descendants(target).find(e=>e.fieldName==='Route override').change('');assert.equal(repair.state.snap.value.config.WaveCfg[0].SpawnTimeline[0].routeGraphId,null);
});


test('Save exposes its pending-input action and preserves focused controls until the explicit save handler commits them',()=>{
 const f=fixture();f.panels.top();const save=descendants(f.context.top).find(e=>e.dataset.action==='save');assert(save);let prevented=0;save.onmousedown({button:0,preventDefault(){prevented++;}});assert.equal(prevented,1);save.onmousedown({button:1,preventDefault(){prevented++;}});assert.equal(prevented,1);assert.equal(f.edits(),0);
});


test('rapid condition toggles compose against the latest queued draft instead of replacing another pending edit',()=>{
 for(const target of ['graph','edge']){
  const f=fixture(),pending=[];f.state.tab='Paths';f.state.snap.value.buildings=[{id:1,name:'Hall'},{id:2,name:'Tower'},{id:3,name:'Mill'}];const graph=f.state.snap.value.graphs[0];graph.requiresAnyBuilding=[1];graph.edges[0].requiresAnyBuilding=[1];if(target==='edge')f.state.selection=['edge:link'];f.context.edit=change=>pending.push(change);const panels=Panels.create(f.context);panels.right();const section=target==='edge'?descendants(f.context.right).find(e=>e.tagName==='details'&&e.children[0].textContent==='Selected connection'):descendants(f.context.right).find(e=>e.tagName==='details'&&e.children[0].textContent==='Conditional route');descendants(section).find(e=>e.fieldName==='Tower').change(true);descendants(section).find(e=>e.fieldName==='Mill').change(true);assert.equal(pending.length,2);for(const change of pending){const draft=clone(f.state.snap.value);change(draft);f.state.snap.value=draft;}assert.deepEqual(target==='edge'?f.state.snap.value.graphs[0].edges[0].requiresAnyBuilding:f.state.snap.value.graphs[0].requiresAnyBuilding,[1,2,3]);
 }
});

function queuedFixture(){
 const f=fixture(),jobs=[];f.state.tab='Waves';
 f.context.edit=change=>new Promise((resolve,reject)=>jobs.push({change,resolve,reject}));
 const panels=Panels.create(f.context);
 const begin=()=>{const job=jobs.shift();assert(job,'Expected a queued edit');const draft=clone(f.state.snap.value);try{job.change(draft);return()=>{f.state.snap.value=draft;job.resolve();};}catch(error){job.reject(error);return()=>{};}};
 const flush=async()=>{begin()();await Promise.resolve();await Promise.resolve();};
 const render=()=>{f.context.left.textContent='';f.context.right.textContent='';panels.left();panels.right();};
 const button=text=>descendants(f.context.left).find(e=>e.tagName==='button'&&e.textContent===text);
 const card=id=>descendants(f.context.right).find(e=>e.dataset.entryId===id);
 const field=(id,name)=>descendants(card(id)).find(e=>e.fieldName===name);
 render();return{...f,panels,jobs,begin,flush,render,button,field};
}

test('queued wave actions retain the clicked source after another wave is selected',async()=>{
 for(const action of ['Add wave','Duplicate wave','Remove wave']){
  const f=queuedFixture();f.state.snap.value.config.WaveCfg[0].sourceMarker='first';f.state.snap.value.config.WaveCfg[1].sourceMarker='second';f.render();const before=clone(f.state.snap.value),promise=f.button(action).onclick();
  descendants(f.context.left).find(e=>e.dataset.waveIndex===1).onclick();assert.equal(f.state.wave,1);await f.flush();await promise;
  const list=f.state.snap.value.config.WaveCfg;
  if(action==='Remove wave'){assert.equal(list.length,1);assert.equal(list[0].sourceMarker,'second');assert.equal(list[0].Wave,1);}
  else{assert.equal(list.length,3);assert.equal(list[2].sourceMarker,'first');assert.equal(list[2].Wave,3);assert.equal(list[2].id,7);if(action==='Add wave')assert.deepEqual(list[2].SpawnTimeline,[]);else assert.deepEqual(list[2].SpawnTimeline,before.config.WaveCfg[0].SpawnTimeline);}
 }
});

test('queued wave fields compose sibling edits even while an older snapshot is still rendered',async()=>{
 const f=queuedFixture(),first=f.field('a','Count').change(3),publish=f.begin();
 // The queue has prepared the first write, but IPC has not published it yet.
 f.render();const second=f.field('a','Starts at (s)').change(6),third=f.field('b','Count').change(4);publish();await first;await f.flush();await second;await f.flush();await third;
 const groups=f.state.snap.value.config.WaveCfg[0].SpawnTimeline;assert.equal(groups[0].count,3);assert.equal(groups[0].startSeconds,6);assert.equal(groups[1].count,4);assert.deepEqual(groups[0].future,{keep:1});
});

test('old wave field handlers cannot follow a removed row even when its successor has identical content',async()=>{
 const f=queuedFixture();f.state.snap.value.config.WaveCfg[1]={...clone(f.state.snap.value.config.WaveCfg[0]),Wave:2};f.render();
 const remove=f.button('Remove wave').onclick(),edit=f.field('a','Count').change(9),rejected=assert.rejects(edit,/wave changed or moved/);await f.flush();await remove;const afterRemoval=clone(f.state.snap.value);await f.flush();await rejected;assert.deepEqual(f.state.snap.value,afterRemoval);assert.equal(f.state.snap.value.config.WaveCfg[0].SpawnTimeline[0].count,1);
});

test('external wave replacement invalidates pending handlers with reused group IDs, with or without a new render',async()=>{
 for(const rerender of [false,true]){
  const f=queuedFixture(),edit=f.field('a','Count').change(9),rejected=assert.rejects(edit,/wave changed or moved/);const replacement=clone(f.state.snap.value.config.WaveCfg[0]);replacement.Wave=1;replacement.SpawnTimeline[0].count=7;f.state.snap.value.config.WaveCfg[0]=replacement;if(rerender)f.render();const before=clone(f.state.snap.value);await f.flush();await rejected;assert.deepEqual(f.state.snap.value,before);
 }
});

test('a failed queued field can be corrected without publishing partial data or locking its wave target',async()=>{
 const f=queuedFixture(),before=clone(f.state.snap.value),invalid=f.field('a','Count').change(0),rejected=assert.rejects(invalid,/positive whole/);await f.flush();await rejected;assert.deepEqual(f.state.snap.value,before);f.render();const fixed=f.field('a','Count').change(2);await f.flush();await fixed;assert.equal(f.state.snap.value.config.WaveCfg[0].SpawnTimeline[0].count,2);
});

test('movement previews only use enabled spawns assigned to the selected path',()=>{
 const f=fixture();f.state.tab='Paths';f.state.snap.value.spawns.push({id:2,name:'Disabled first',enabled:false},{id:3,name:'Enabled second',enabled:true});f.state.snap.value.graphs[0].spawnIds=[2,3];f.state.spawn=1;const before=JSON.stringify(f.state.snap.value);f.panels.right();const choices=descendants(f.context.right).find(e=>e.fieldName==='Preview spawn');assert.deepEqual(choices.choices,[{value:3,label:'Enabled second'}]);assert.equal(f.state.spawn,3);assert.equal(descendants(f.context.right).find(e=>e.tagName==='button'&&e.textContent==='Calculate approach').disabled,false);assert.equal(JSON.stringify(f.state.snap.value),before);
 f.context.right.textContent='';f.state.snap.value.graphs[0].spawnIds=[];f.panels.right();assert.equal(f.state.spawn,null);assert.equal(descendants(f.context.right).find(e=>e.tagName==='button'&&e.textContent==='Calculate approach').disabled,true);assert(f.context.right.textContent.includes('Assign this path to an enabled spawn'));assert.equal(f.edits(),0);
});

test('malformed catalog names remain searchable and selectable without editing the catalog',()=>{
 const f=fixture();f.state.tab='Waves';f.state.catalog.units=[{id:3,name:null},{id:4,name:42},{id:5,name:{bad:true}},{id:6,name:''}];const before=JSON.stringify(f.state.catalog);let dialog;f.context.modal=(title,body)=>{dialog=f.context.el('div');body(dialog);};f.panels.right();descendants(f.context.right).find(e=>e.tagName==='button'&&e.textContent==='Add units').onclick();const choices=()=>descendants(dialog).filter(e=>e.dataset.unitId);assert.deepEqual(choices().map(e=>e.textContent),['Unit 3','42','Unit 5','Unit 6']);const search=descendants(dialog).find(e=>e.className==='world-unit-picker-search');search.value='unit 5';search.oninput();assert.deepEqual(choices().map(e=>e.textContent),['Unit 5']);assert.equal(JSON.stringify(f.state.catalog),before);assert.equal(f.edits(),0);
});

test('numeric wave settings explicitly repair imported strings without rewriting other values',()=>{
 const f=fixture();f.state.tab='Waves';Object.assign(f.state.snap.value.config.WaveCfg[0],{HealthCoefficient:'1.2',StartSliver:'0'});const before=JSON.stringify(f.state.snap.value);f.panels.right();assert.equal(JSON.stringify(f.state.snap.value),before);descendants(f.context.right).find(e=>e.fieldName==='Enemy health ×').change('2');assert.equal(f.state.snap.value.config.WaveCfg[0].HealthCoefficient,2);assert.equal(f.state.snap.value.config.WaveCfg[0].StartSliver,'0');
});

test('path numeric inputs explicitly repair string coordinates and weights without normalizing their source on read',()=>{
 const f=fixture();f.state.tab='Paths';f.state.selection=['node:start'];Object.assign(f.state.snap.value.graphs[0].nodes[0],{x:'-20',y:null});f.state.snap.value.graphs[0].name=42;const before=JSON.stringify(f.state.snap.value),writes=[];f.context.patchSelected=(key,value)=>writes.push([key,value]);f.panels.right();const fields=descendants(f.context.right),x=fields.find(e=>e.fieldName==='X'),y=fields.find(e=>e.fieldName==='Y'),name=fields.find(e=>e.fieldName==='Name');assert.equal(x.value,-20);assert(Number.isNaN(y.value));assert.equal(name.value,'42');x.change('-12');y.change('7');assert.deepEqual(writes,[['x',-12],['y',7]]);assert.equal(JSON.stringify(f.state.snap.value),before);assert.equal(f.edits(),0);
 f.context.right.textContent='';f.state.selection=['edge:link'];f.state.snap.value.graphs[0].edges[0].weight='2';f.panels.right();const weight=descendants(f.context.right).find(e=>e.fieldName==='Branch weight');assert.equal(weight.value,2);weight.change('4');assert.deepEqual(writes[2],['weight',4]);
});

test('object-shaped missing conditions can be explicitly removed after the draft is cloned',()=>{
 for(const edge of [false,true]){const f=fixture();f.state.tab='Paths';if(edge)f.state.selection=['edge:link'];const route=f.state.snap.value.graphs[0],owner=edge?route.edges[0]:route;owner.requiresAnyBuilding=[{invalid:'id',future:{keep:1}},99];const before=JSON.stringify(f.state.snap.value);f.panels.right();assert.equal(JSON.stringify(f.state.snap.value),before);const choice=descendants(f.context.right).find(e=>e.fieldName==='Missing building [object Object]');assert(choice);choice.change(false);assert.deepEqual((edge?f.state.snap.value.graphs[0].edges[0]:f.state.snap.value.graphs[0]).requiresAnyBuilding,[99]);}
});

test('path reference cleanup preserves unrelated malformed wave data while repairing valid timed groups',()=>{
 for(const action of ['unassign','delete']){
  const f=fixture();f.state.tab='Paths';const list=f.state.snap.value.config.WaveCfg;list.push(null,{id:7,Wave:4,SpawnTimeline:{future:'keep'}},{id:7,Wave:5,SpawnTimeline:[null,{id:'extra',spawnId:1,routeGraphId:'one',future:{keep:true}}]});const malformed=JSON.stringify([list[2],list[3],list[4].SpawnTimeline[0]]);f.panels.right();
  if(action==='delete')descendants(f.context.right).find(e=>e.tagName==='button'&&e.textContent==='Delete path').onclick();else descendants(f.context.right).find(e=>e.fieldName==='Spawn 1').change(false);
  const next=f.state.snap.value.config.WaveCfg;assert.equal(JSON.stringify([next[2],next[3],next[4].SpawnTimeline[0]]),malformed);assert.equal(next[4].SpawnTimeline[1].routeGraphId,null);assert.deepEqual(next[4].SpawnTimeline[1].future,{keep:true});assert.equal(next[0].SpawnTimeline[0].routeGraphId,null);
 }
});

test('every stage tab has one Replace stage action and offers no clipboard buttons',()=>{
 const f=fixture(),calls=[];f.context.replaceStage=()=>calls.push('replace');f.state.catalog.stages.push({id:'A-6',variant:'A',level:6,name:'Source',mapId:'Map07',waves:2});const before=JSON.stringify(f.state.snap.value);
 for(const tab of ['Stage','Buildings','Spawns','Paths','Waves']){f.state.tab=tab;f.panels.top();const actions=descendants(f.context.top).filter(element=>element.tagName==='button'&&element.textContent.startsWith('Replace'));assert.equal(actions.length,1);assert.equal(actions[0].textContent,'Replace stage');assert.equal(actions[0].disabled,false);assert(!descendants(f.context.top).some(element=>['Copy whole stage','Paste stage'].includes(element.textContent)));actions[0].onclick();}
 assert.equal(calls.length,5);assert.equal(JSON.stringify(f.state.snap.value),before);assert.equal(f.edits(),0);
});

test('Replace stage is unavailable without another source and exposes the five explicit section choices',()=>{
 const f=fixture();f.panels.top();assert.equal(descendants(f.context.top).find(element=>element.tagName==='button'&&element.textContent==='Replace stage').disabled,true);
 assert.deepEqual(Panels.STAGE_SECTIONS.map(item=>item.value),['buildings','spawns','paths','waves','settings']);assert.equal(Panels.STAGE_SECTIONS.find(item=>item.value==='settings').label,'Map and stage settings');
});
