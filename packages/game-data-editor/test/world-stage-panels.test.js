'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),Panels=require('../worlds/stage-panels');
const clone=value=>JSON.parse(JSON.stringify(value));
class Element{
 constructor(tag,text,cls){this.tagName=tag;this.className=cls||'';this.children=[];this.dataset={};this.value='';this._text=text||'';this.classList={add:(...names)=>{this.className=Array.from(new Set(this.className.split(/\s+/).filter(Boolean).concat(names))).join(' ');},remove:(...names)=>{this.className=this.className.split(/\s+/).filter(name=>!names.includes(name)).join(' ');},contains:name=>this.className.split(/\s+/).includes(name)};}
 appendChild(child){this.children.push(child);child.parentNode=this;return child;}
 setAttribute(name,value){if(!this.attributes)this.attributes={};this.attributes[name]=String(value);}
 set textContent(value){this._text=value;this.children=[];}
 get textContent(){return this._text+this.children.map(child=>child.textContent).join('');}
 getBoundingClientRect(){return {top:0,height:100};}
 contains(node){return node===this||this.children.some(child=>child.contains(node));}
}
function fixture(queueEdit=change=>change()){
 const stage={id:'A-7',level:7,variant:'A',mapId:'Map07',hero:{x:0,y:0},buildings:[],spawns:[{id:1,name:'Spawn 1',enabled:true,x:0,y:100}],graphs:[{id:'one',name:'First path',entry:'start',spawnIds:[1],nodes:[{id:'start',x:0,y:100},{id:'goal',x:0,y:0,goal:true}],edges:[{id:'link',from:'start',to:'goal',weight:1}]},{id:'two',name:'Other path',entry:'goal',spawnIds:[1],nodes:[{id:'goal',x:1,y:0,goal:true}],edges:[]}],config:{Level:7,WaveCfg:[{id:7,Wave:1,SpawnTimeline:[{id:'a',unitId:3,spawnId:1,count:1,startSeconds:1,intervalSeconds:1,routeGraphId:'one',future:{keep:1}},{id:'b',unitId:3,spawnId:1,count:1,startSeconds:2,intervalSeconds:1,routeGraphId:'two'},{id:'c',unitId:3,spawnId:1,count:1,startSeconds:3,intervalSeconds:1},{id:'d',unitId:3,spawnId:1,count:1,startSeconds:4,intervalSeconds:1,routeGraphId:null}]},{id:7,Wave:2,RefreshSoldierKind:['1#3,1'],future:{keep:true}}],future:{keep:[1,2]}}};
 const el=(tag,text,cls)=>new Element(tag,text,cls),state={snap:{value:stage,issues:[]},catalog:{interval:.5,stages:[{id:'A-7',variant:'A',level:7,name:'7. Desert',mapId:'Map07',waves:2}],maps:[{id:'Map07',name:'Fire map'}],units:[{id:3,name:'Unit'}]},variant:'A',wave:0,selection:[],previewHall:3,showBlockers:true,snapGrid:0,spawn:1,graph:'one',radius:18,gate:'closed'},noop=()=>{};let edits=0;
 const context={state,el,button(parent,text,handler,active){const button=el('button',text,active?'active':'');button.onclick=handler;parent.appendChild(button);return button;},field(parent,name,value,change,choices){const input=el('input');input.choices=choices;input.value=value;input.fieldName=name;input.change=change;if(typeof value==='boolean')input.checked=value;parent.appendChild(input);return input;},select(parent){const input=el('select');parent.appendChild(input);return input;},section(parent,text){parent.appendChild(el('h3',text));},note(parent,text){parent.appendChild(el('p',text));},edit(change){return queueEdit(()=>{edits++;const draft=clone(state.snap.value);change(draft);state.snap.value=draft;});},render:noop,draw:noop,top:el('div'),tabs:el('div'),left:el('div'),right:el('div'),buildingPalette:noop,buildingInspector:noop};
 for(const name of ['load','fit','startPreview','closePreview','replaceStage','action','refresh','discard','save','cancelDrag','prepareImages','editMap','jsonField','patchSelected','remove','newPath','insertPathNode','removePathNode','navigation','modal'])context[name]=noop;
 context.createWaveModelGallery=()=>({watch:noop,clear:noop,destroy:noop});
 context.unitPicker=(dialog,spec)=>{dialog.appendChild(spec.controls);const search=el('input',undefined,'world-unit-picker-search'),grid=el('div',undefined,'world-unit-picker');search.value='';dialog.appendChild(search);dialog.appendChild(grid);const render=()=>{grid.textContent='';for(const unit of spec.units.filter(unit=>require('../worlds/unit-catalog').matches(unit,search.value))){const b=context.button(grid,require('../worlds/unit-catalog').name(unit),()=>{if(spec.selected.has(unit.id))spec.selected.delete(unit.id);else spec.selected.add(unit.id);render();},spec.selected.has(unit.id));b.dataset.unitId=unit.id;b.setAttribute('aria-pressed',String(spec.selected.has(unit.id)));}};search.oninput=render;render();};
 return{state,context,panels:Panels.create(context),edits:()=>edits};
}
function descendants(element){return element.children.flatMap(child=>[child,...descendants(child)]);}
function dragEvent(clientY=10){return {clientY,preventDefault(){this.prevented=true;},stopPropagation(){},dataTransfer:{setData(){}}};}

test('wave cards render full models for shared units and stage-only profiles',()=>{
 const f=fixture(),stage=f.state.snap.value,base=f.state.catalog.units[0],localId=1000000000;
 f.state.tab='Waves';
 base.iconUrl='file:///head-portrait.png';
 stage.config.EnemyProfiles={[localId]:{baseId:base.id,name:'Custom',stats:{}}};
 const entries=stage.config.WaveCfg[0].SpawnTimeline;
 entries[1].unitId=localId;
 entries[2].unitId=999999;
 entries.length=3;
 const pristine=clone(stage),events=[];
 f.context.createWaveModelGallery=()=>{
  events.push('create');
  return {watch(model,image,status,id){
   assert(model.classList.contains('world-wave-unit-model'));
   assert.deepEqual(model.children,[image,status]);
   assert.equal(image.src,undefined);
   events.push(id);
  },clear(){events.push('clear');},destroy(){events.push('destroy');}};
 };
 const redraw=()=>{f.context.right.textContent='';f.panels.right();};
 redraw();
 assert.deepEqual(events,['create',base.id,base.id]);
 redraw();
 assert.deepEqual(events.slice(3),['clear',base.id,base.id]);
 f.state.tab='Buildings';redraw();
 assert.equal(events.at(-1),'destroy');
 assert.deepEqual(stage,pristine);
 assert.equal(f.edits(),0);
});

test('the Spawns sidebar moves points into and out of groups and updates the generated name',()=>{
 const f=fixture();f.state.tab='Spawns';
 const stage=f.state.snap.value;
 stage.spawns.push({id:2,name:'Spawn 2'},{id:3,name:'Spawn 3'});
 stage.spawnGroups=[{id:'north',spawnIds:[1,2]}];
 const before=clone(stage.spawns),nodes=()=>descendants(f.context.left);
 const list=id=>nodes().find(node=>node.dataset.spawnGroupId===id);
 const spawn=id=>nodes().find(node=>node.dataset.spawnId===String(id));
 function move(id,group){
  spawn(id).ondragstart(dragEvent());
  const over=dragEvent();list(group).ondragover(over);
  assert(over.prevented);
  assert(list(group).classList.contains('world-spawn-group-drop'));
  list(group).ondrop(dragEvent());f.panels.left();
 }
 f.panels.left();
 assert(list('north').textContent.startsWith('Spawn group 1 (1, 2)'));
 move(3,'north');
 assert(list('north').textContent.startsWith('Spawn group 1 (1, 2, 3)'));
 move(3,'');
 assert(list('north').textContent.startsWith('Spawn group 1 (1, 2)'));
 assert.equal(spawn(3).parentNode,list(''));
 assert.deepEqual(f.state.snap.value.spawns,before);
 assert.equal(f.edits(),2);
 for(const tab of ['Stage','Buildings','Paths','Waves']){
  f.state.tab=tab;f.panels.left();
  assert(!nodes().some(node=>node.classList.contains('world-spawn-group-list')));
 }
});

test('wave timing balance requires a fresh preview and applies one full-wave draft edit',async()=>{
 const f=fixture(),stage=f.state.snap.value,wave=stage.config.WaveCfg[0];
 f.state.tab='Waves';f.state.waveSpawnFilter='1';
 stage.spawns.push({id:2,name:'Spawn 2',enabled:true});
 for(const row of wave.SpawnTimeline)row.startSeconds=0;
 wave.SpawnTimeline[0].editorManualTiming=true;
 wave.SpawnTimeline[1].spawnId=2;
 wave.HealthCoefficient=1;wave.AttackCoefficient=1;
 Object.assign(f.state.catalog.units[0],{health:10,damage:2});
 let modal,apply;
 f.context.modal=(title,body,commit)=>{
  modal={dialog:f.context.el('div'),applyButton:f.context.el('button')};
  body(modal.dialog);apply=commit;return modal;
 };
 const before=clone(stage);
 f.panels.right();
 await descendants(f.context.right).find(node=>node.classList.contains('world-wave-balance-button')).onclick();
 const dialog=()=>descendants(modal.dialog),field=name=>dialog().find(node=>node.tagName==='label'&&node.children[0].textContent===name).children[1];
 const cap=field('Max enemies alive'),deadline=field('Last spawn by (s)'),pushes=field('Push count');
 const preview=dialog().find(node=>node.textContent==='Preview changes');
 assert.equal(cap.value,'5');assert.equal(deadline.value,'');assert(modal.applyButton.disabled);
 assert(dialog().find(node=>node.textContent==='Use suggested cap (5)').disabled);
 assert.equal(pushes.value,'3');
 assert.equal(field('Push 3 peak (s)').parentNode.hidden,false);
 assert.equal(field('Push 4 peak (s)').parentNode.hidden,true);
 pushes.value='2';pushes.onchange();
 assert.equal(field('Push 3 peak (s)').parentNode.hidden,true);
 field('Push 1 peak (s)').value='2';
 cap.value='2';deadline.value='3';await preview.onclick();
 assert.match(modal.dialog.textContent,/at least 4 s/);
 assert.match(modal.dialog.textContent,/Peak enemies alive4 at 0 s/);
 assert(modal.applyButton.disabled);
 deadline.value='8';deadline.oninput();await preview.onclick();
 assert(!modal.applyButton.disabled);
 const stats=dialog().find(node=>node.classList.contains('world-wave-balance-metrics'));
 assert.match(stats.textContent,/Peak enemies alive4 at 0 s[12] at/);
 assert.match(stats.textContent,/Distinct pushes/);
 assert.match(stats.textContent,/Push 2 peak/);
 assert.deepEqual(f.state.snap.value,before);assert.equal(f.edits(),0);
 deadline.value='7';deadline.oninput();
 await assert.rejects(apply(),/Preview these settings/);
 await preview.onclick();await apply();
 const saved=f.state.snap.value.config.WaveCfg[0];
 assert.deepEqual(saved.editorTimingBalance,{peakCap:2,lastSpawnLimit:7,defeatSeconds:2,pushPeaks:[2,null]});
 assert.deepEqual(saved.SpawnTimeline[0],wave.SpawnTimeline[0]);
 assert.equal(f.edits(),1);
 const measured=require('../worlds/wave-pressure').build(saved,f.state.catalog.units,.5);
 assert(measured.peaks.units.value<=2);assert(measured.duration<=7);

 f.context.right.textContent='';f.panels.right();
 await descendants(f.context.right).find(node=>node.classList.contains('world-wave-balance-button')).onclick();
 const savedCap=field('Max enemies alive'),suggested=dialog().find(node=>node.textContent==='Use suggested cap (5)');
 assert.equal(savedCap.value,'2');assert.equal(suggested.disabled,false);
 assert.equal(field('Push count').value,'2');
 assert.equal(field('Push 1 peak (s)').value,'2');
 assert.equal(field('Push 2 peak (s)').value,'');
 assert.equal(field('Push 2 peak (s)').placeholder,'7');
 suggested.onclick();
 assert.equal(savedCap.value,'5');assert(suggested.disabled);
 assert.equal(field('Last spawn by (s)').value,'7');assert(modal.applyButton.disabled);
 assert.equal(saved.editorTimingBalance.peakCap,2);assert.equal(f.edits(),1);
});

test('pins group starts and applies hand-edited proposal values as Manual timings in one draft',async()=>{
 const f=fixture(),stage=f.state.snap.value,wave=stage.config.WaveCfg[0];
 f.state.tab='Waves';
 stage.spawns.push({id:2,name:'Spawn 2'},{id:3,name:'Spawn 3'});
 stage.spawnGroups=[{id:'north',spawnIds:[1]},{id:'south',spawnIds:[2]},{id:'east',spawnIds:[3]}];
 Object.assign(wave.SpawnTimeline[0],{startSeconds:0,editorManualTiming:true});
 wave.SpawnTimeline.splice(3,1);
 Object.assign(wave.SpawnTimeline[1],{spawnId:2,count:2});
 Object.assign(wave.SpawnTimeline[2],{spawnId:3,count:2});
 let modal,commit;
 f.context.modal=(title,body,apply)=>{
  modal={dialog:f.context.el('div'),applyButton:f.context.el('button')};
  body(modal.dialog);commit=apply;return modal;
 };
 const reopen=async()=>{
  f.context.right.textContent='';f.panels.right();
  await descendants(f.context.right).find(node=>node.classList.contains('world-wave-balance-button')).onclick();
 };
 const nodes=()=>descendants(modal.dialog);
 const field=name=>nodes().find(node=>node.tagName==='label'&&node.children[0].textContent===name).children[1];
 await reopen();
 assert.equal(field('Spawn group 2 (2)').placeholder,'Auto');
 for(const [i,time] of ['0','5','20'].entries())field('Spawn group '+(i+1)+' ('+(i+1)+')').value=time;
 const count=field('Push count');count.value='2';count.onchange();
 field('Last spawn by (s)').value='24';
 await nodes().find(node=>node.textContent==='Preview changes').onclick();
 const input=(spawn,kind)=>nodes().find(node=>node.attributes?.['aria-label']==='Unit at Spawn '+spawn+' · proposed '+kind+' (s)');
 assert.equal(input(1,'start'),undefined);
 const start=input(2,'start'),gap=input(2,'interval');
 assert.equal(start.value,'5');
 assert.equal(input(3,'start').value,'20');
 assert(!modal.applyButton.disabled);
 start.value='4.5';start.oninput();
 assert(modal.applyButton.disabled);
 assert.match(modal.dialog.textContent,/pinned spawn-group start/);
 assert.equal(f.edits(),0);
 start.value='5';start.oninput();
 const wanted=gap.value==='1.5'?2:1.5;
 gap.value=String(wanted);gap.oninput();
 assert(!modal.applyButton.disabled);
 assert.equal(f.edits(),0);
 await commit();
 const saved=f.state.snap.value.config.WaveCfg[0];
 assert.deepEqual(saved.editorTimingBalance.groupStarts,{north:0,south:5,east:20});
 assert.deepEqual(saved.SpawnTimeline[0],wave.SpawnTimeline[0]);
 assert.equal(saved.SpawnTimeline[1].startSeconds,5);
 assert.equal(saved.SpawnTimeline[1].intervalSeconds,wanted);
 assert.equal(saved.SpawnTimeline[1].editorManualTiming,true);
 assert.equal(saved.SpawnTimeline[2].editorManualTiming,undefined);
 assert.equal(f.edits(),1);
 await reopen();
 assert.equal(field('Spawn group 2 (2)').value,'5');
 assert.equal(field('Spawn group 3 (3)').value,'20');
});

test('Balance wave defaults to the current count and applies an edited count and aligned boss in one draft operation',async()=>{
 const f=fixture(),wave=f.state.snap.value.config.WaveCfg[0];
 f.state.tab='Waves';
 f.state.catalog.waveCountTargets=[9,12];
 f.state.catalog.units.push({id:4,name:'Elite',enemyClass:'elite'},{id:5,name:'Boss',enemyClass:'boss'});
 wave.SpawnTimeline[0].editorManualTiming=true;
 wave.SpawnTimeline[2].unitId=4;
 wave.SpawnTimeline[3].unitId=5;
 wave.editorTimingBalance={totalUnits:12};
 let modal;
 f.context.modal=(title,body,apply)=>{
  modal={dialog:f.context.el('div'),applyButton:f.context.el('button'),apply};
  body(modal.dialog);return modal;
 };
 async function reopen(){
  f.context.right.textContent='';f.panels.right();
  await descendants(f.context.right).find(node=>node.classList.contains('world-wave-balance-button')).onclick();
 }
 const nodes=()=>descendants(modal.dialog);
 const select=name=>nodes().find(node=>node.tagName==='label'&&node.children[0].textContent===name).children[1];
 const preview=()=>nodes().find(node=>node.textContent==='Preview changes').onclick();
 const before=clone(f.state.snap.value);
 await reopen();
 assert.equal(select('Target unit count').value,'4');
 assert.match(modal.dialog.textContent,/The default target is the current count/);
 await preview();
 assert.match(modal.dialog.textContent,/Total units44/);
 assert.match(modal.dialog.textContent,/Starts with the last regular spawn/);
 nodes().find(node=>node.textContent==='Use suggested total (9)').onclick();
 await preview();
 assert.match(modal.dialog.textContent,/Total units49/);
 assert.match(modal.dialog.textContent,/6Current 1/);
 assert.deepEqual(f.state.snap.value,before);
 assert.equal(f.edits(),0);

 const input=select('Target unit count');
 input.value='2';input.oninput();
 await assert.rejects(modal.apply(),/Preview these settings/);
 await preview();
 assert.match(modal.dialog.textContent,/at least 4 units/);
 input.value='6';input.oninput();
 await preview();
 assert.match(modal.dialog.textContent,/Total units46/);
 assert(!modal.applyButton.disabled);
 await modal.apply();
 const saved=f.state.snap.value.config.WaveCfg[0];
 assert.equal(saved.editorTimingBalance.totalUnits,6);
 assert.deepEqual(saved.SpawnTimeline.map(row=>row.count),[1,3,1,1]);
 assert.deepEqual(saved.SpawnTimeline[0],wave.SpawnTimeline[0]);
 const regular=saved.SpawnTimeline.slice(0,-1);
 assert.equal(saved.SpawnTimeline[3].startSeconds,Math.max(...regular.map(row=>row.startSeconds+(row.count-1)*row.intervalSeconds)));
 assert.equal(f.edits(),1);

 await reopen();
 const target=select('Target unit count');
 assert.equal(target.value,'6');
 const suggested=nodes().find(node=>node.textContent==='Use suggested total (9)');
 assert(!suggested.disabled);
 suggested.onclick();
 assert.equal(target.value,'9');
 target.value='';target.oninput();
 await preview();
 assert.match(modal.dialog.textContent,/Total units66/);
 assert.equal(f.edits(),1);
 await reopen();
 assert.equal(select('Target unit count').value,'6');
});

async function openStageBalance(f){
 let modal;
 f.state.tab='Waves';
 f.context.modal=(title,body,apply)=>{
  modal={dialog:f.context.el('div'),applyButton:f.context.el('button'),apply};
  body(modal.dialog);return modal;
 };
 f.panels.left();
 await descendants(f.context.left).find(node=>node.textContent==='Balance All Waves…').onclick();
 const nodes=()=>descendants(modal.dialog);
 const inputs=nodes().filter(node=>node.tagName==='input');
 assert.equal(inputs.length,1);
 return {
  ...modal,percentage:inputs[0],
  preview:()=>nodes().find(node=>node.tagName==='button'&&node.textContent==='Preview changes').onclick(),
  row:name=>nodes().find(node=>node.tagName==='tr'&&node.children[0].textContent===name).children.map(cell=>cell.textContent)
 };
}

test('stage balance scales current totals and applies the whole populated stage in one draft',async()=>{
 const f=fixture(),stage=f.state.snap.value,[first,legacy]=stage.config.WaveCfg;
 f.state.catalog.waveCountTargets=[10,20,25];
 stage.spawns.push({id:2,name:'East',enabled:true});
 stage.spawnGroups=[{id:'east',spawnIds:[2]}];
 first.SpawnTimeline[0].editorManualTiming=true;
 first.SpawnTimeline[1].spawnId=2;
 first.editorTimingBalance={peakCap:4,defeatSeconds:.5,lastSpawnLimit:15,pushPeaks:[4,null],groupStarts:{east:3},future:'keep'};
 const empty={id:7,Wave:3,SpawnTimeline:[],future:{keep:true}};
 stage.config.WaveCfg.push(empty);
 const before=clone(stage),review=await openStageBalance(f);
 assert.equal(review.percentage.value,'100');
 assert(review.applyButton.disabled);
 await review.preview();
 assert.deepEqual(review.row('Wave 1').slice(1,4),['4','4','4']);
 assert.deepEqual(review.row('Wave 2').slice(1,4),['1','1','1']);
 review.percentage.value='80';review.percentage.oninput();
 await review.preview();
 assert.deepEqual(review.row('Wave 1').slice(1,4),['4','3','4']);
 assert.deepEqual(review.row('Wave 2').slice(1,4),['1','1','1']);
 review.percentage.value='250';review.percentage.oninput();
 await assert.rejects(review.apply(),/Preview this percentage/);
 await review.preview();
 assert.deepEqual(review.row('Wave 1').slice(1,4),['4','10','10']);
 assert.deepEqual(review.row('Wave 2').slice(1,4),['1','3','3']);
 assert.match(review.row('Wave 3').at(-1),/Add units/);
 assert(!review.applyButton.disabled);
 assert.deepEqual(f.state.snap.value,before);
 assert.equal(f.edits(),0);

 await review.apply();
 const [firstDraft,secondDraft,emptyDraft]=f.state.snap.value.config.WaveCfg;
 assert.equal(f.edits(),1);
 assert.deepEqual(firstDraft.SpawnTimeline[0],first.SpawnTimeline[0]);
 assert.equal(firstDraft.SpawnTimeline[1].startSeconds,3);
 assert.deepEqual(firstDraft.editorTimingBalance,{...first.editorTimingBalance,totalUnits:10});
 assert.deepEqual(secondDraft.RefreshSoldierKind,legacy.RefreshSoldierKind);
 assert.equal(secondDraft.editorTimingBalance.totalUnits,3);
 assert.deepEqual(emptyDraft,empty);
 const Pressure=require('../worlds/wave-pressure');
 const measured=Pressure.build(firstDraft,[],.5,.5);
 assert.equal(measured.totals.units,10);
 assert(measured.peaks.units.value<=4 && measured.duration<=15);
 assert.equal(Pressure.build(secondDraft,[],.5).totals.units,3);
});

test('stage balance refuses a partial or stale proposal',async()=>{
 const f=fixture(),stage=f.state.snap.value;
 f.state.catalog.waveCountTargets=[10,20];
 stage.config.WaveCfg[1].editorTimingBalance={peakCap:1,lastSpawnLimit:1,defeatSeconds:1,pushPeaks:[null]};
 const before=clone(stage),review=await openStageBalance(f);
 review.percentage.value='0';review.percentage.oninput();await review.preview();
 assert.match(review.dialog.textContent,/positive whole percentage/);
 review.percentage.value='2000';review.percentage.oninput();await review.preview();
 assert.match(review.row('Wave 2').at(-1),/Blocked.*at least 19 s/);
 assert(review.applyButton.disabled);
 await assert.rejects(review.apply(),/Preview this percentage/);
 review.percentage.value='10';review.percentage.oninput();await review.preview();
 assert(!review.applyButton.disabled);
 assert.deepEqual(review.row('Wave 1').slice(1,4),['4','1','4']);
 assert.match(review.row('Wave 1').at(-1),/at least one/);
 f.state.snap.unitCatalogRevision=1;
 await assert.rejects(review.apply(),/balance inputs changed/);
 assert.deepEqual(f.state.snap.value,before);
 assert.equal(f.edits(),0);
});

test('stage balance leaves the draft untouched when every wave is empty or already fits',async()=>{
 const f=fixture(),stage=f.state.snap.value;
 f.state.catalog.waveCountTargets=[10,20];
 for(const row of stage.config.WaveCfg[0].SpawnTimeline)row.editorManualTiming=true;
 stage.config.WaveCfg[1].RefreshSoldierKind=[];
 const before=clone(stage),review=await openStageBalance(f);
 await review.preview();
 assert.deepEqual(review.row('Wave 1').slice(1,4),['4','4','4']);
 assert.match(review.row('Wave 2').at(-1),/Add units/);
 assert(review.applyButton.disabled);
 review.percentage.value='200';review.percentage.oninput();await review.preview();
 assert.deepEqual(review.row('Wave 1').slice(1,4),['4','8','4']);
 assert.match(review.row('Wave 1').at(-1),/All counts are fixed/);
 assert(review.applyButton.disabled);
 assert.deepEqual(f.state.snap.value,before);
 assert.equal(f.edits(),0);
});

test('balance waits for a queued timing edit and rejects a stale unit catalog review',async()=>{
 let release;
 const gate=new Promise(resolve=>{release=resolve;}),f=fixture(change=>gate.then(change));
 f.state.tab='Waves';f.state.snap.unitCatalogRevision=1;
 let review;
 f.context.modal=(title,body,apply)=>{
  review={dialog:f.context.el('div'),applyButton:f.context.el('button'),apply};
  body(review.dialog);return review;
 };
 f.panels.right();
 const nodes=descendants(f.context.right);
 f.state.pending=nodes.find(node=>node.fieldName==='Starts at (s)').change(9);
 const opening=nodes.find(node=>node.classList.contains('world-wave-balance-button')).onclick();
 await Promise.resolve();assert.equal(review,undefined);
 release();await opening;
 const elements=descendants(review.dialog);
 elements.find(node=>node.tagName==='label'&&node.children[0].textContent==='Max enemies alive').children[1].value='3';
 elements.find(node=>node.tagName==='label'&&node.children[0].textContent==='Last spawn by (s)').children[1].value='9';
 const preview=elements.find(node=>node.textContent==='Preview changes');
 await preview.onclick();
 assert.match(review.dialog.textContent,/Last spawn9 s9 s/);
 assert(!review.applyButton.disabled);
 assert.equal(f.state.snap.value.config.WaveCfg[0].SpawnTimeline[0].editorManualTiming,true);

 f.state.snap.unitCatalogRevision++;
 await assert.rejects(review.apply(),/unit stats.*changed/);
 await preview.onclick();
 assert.match(review.dialog.textContent,/unit stats.*changed/);
 assert(review.applyButton.disabled);
 assert.equal(f.edits(),1);
});

test('balance plans with the enemy mix below the count cap and previews the unit factors',async()=>{
 const f=fixture(),wave=f.state.snap.value.config.WaveCfg[0];
 f.state.tab='Waves';
 wave.HealthCoefficient=1;wave.AttackCoefficient=1;
 f.state.catalog.units=[
  {id:3,name:'Shield',unitType:'guardian',health:120,damage:4,attackRate:1,attack:{delivery:'melee',pattern:'single'}},
  {id:5,name:'Wyrm',unitType:'mystic',flight:true,health:75,damage:16,attackRate:1,attack:{delivery:'ranged',pattern:'splash',splashRadius:90}},
  {id:6,name:'Ogre',unitType:'bruiser',enemyClass:'boss',health:360,damage:32,attackRate:1,attack:{delivery:'melee',pattern:'splash'}},
  {id:7,name:'Bow',unitType:'skirmisher',health:45,damage:6,attackRate:1,attack:{delivery:'ranged',pattern:'single'}}
 ];
 const [shield,wyrm,ogre,bow]=wave.SpawnTimeline;
 Object.assign(shield,{count:3,startSeconds:0,intervalSeconds:.5});
 Object.assign(wyrm,{unitId:5,count:2,startSeconds:0,intervalSeconds:.5});
 Object.assign(ogre,{unitId:6,startSeconds:0});
 Object.assign(bow,{unitId:7,startSeconds:6,editorManualTiming:true});
 let modal,commit;
 f.context.modal=(title,body,apply)=>{
  modal={dialog:f.context.el('div'),applyButton:f.context.el('button')};
  body(modal.dialog);commit=apply;return modal;
 };
 f.panels.right();
 await descendants(f.context.right).find(node=>node.classList.contains('world-wave-balance-button')).onclick();
 const nodes=descendants(modal.dialog);
 nodes.find(node=>node.tagName==='label'&&node.children[0].textContent==='Last spawn by (s)').children[1].value='6';
 await nodes.find(node=>node.textContent==='Preview changes').onclick();
 assert.match(modal.dialog.textContent,/Peak weighted threat/);
 assert.match(modal.dialog.textContent,/Peak spawn burst/);
 assert(descendants(modal.dialog).some(node=>node.classList.contains('world-wave-balance-traits')&&/Guardian|Flight|Boss/.test(node.textContent)));
 assert.equal(f.edits(),0);
 assert.equal(modal.applyButton.disabled,false);
 await commit();
 const projected=f.state.snap.value.config.WaveCfg[0];
 assert.deepEqual(projected.SpawnTimeline.find(row=>row.id===bow.id),bow);
 assert(projected.SpawnTimeline.some((row,index)=>row.startSeconds!==wave.SpawnTimeline[index].startSeconds||row.intervalSeconds!==wave.SpawnTimeline[index].intervalSeconds));
 assert.equal(f.edits(),1);
});

test('wave overview restores each reviewed defeat rate and reports a breached saved limit',()=>{
 const f=fixture(),[first,second]=f.state.snap.value.config.WaveCfg;
 f.state.tab='Waves';
 first.editorTimingBalance={peakCap:1,lastSpawnLimit:3,defeatSeconds:.75};
 for(const row of first.SpawnTimeline)row.startSeconds=4;
 second.editorTimingBalance={peakCap:50,lastSpawnLimit:null,defeatSeconds:1.25};
 const rate=()=>descendants(f.context.top).find(node=>node.attributes?.['aria-label']==='Seconds per defeat');
 f.panels.top();assert.equal(rate().value,'0.75');
 assert.match(f.context.top.textContent,/Peak 4 \/ 1 enemies · Last spawn 4 s \/ 3 s/);
 f.state.wave=1;f.panels.top();assert.equal(rate().value,'1.25');
 f.state.wave=0;f.panels.top();assert.equal(rate().value,'0.75');assert.equal(f.edits(),0);
});

test('wave count and timing fields select all on click and commit once on Enter',()=>{
 const f=fixture(),calls=[];
 f.state.tab='Waves';
 const field=f.context.field;
 f.context.field=(parent,label,value,change,choices)=>{
  const input=field(parent,label,value,change,choices);
  if(!choices&&typeof value==='number'){
   input.value=input.dataset.modelValue=String(value);
   input.onchange=()=>change(Number(input.value));
   input.select=()=>{input.selected=input.value;};
  }
  return input;
 };
 f.context.editWave=(index,change)=>{
  calls.push(index);
  const next=clone(f.state.snap.value);
  change(next);f.state.snap.value=next;
  panels.refreshWave(index);
 };
 const panels=Panels.create(f.context);
 panels.right();
 const card=descendants(f.context.right).find(node=>node.dataset.entryId==='a');
 const nodes=()=>descendants(card);
 const count=nodes().find(node=>node.fieldName==='Count'),start=nodes().find(node=>node.fieldName==='Starts at (s)');
 const enter=input=>{let prevented=false;input.onkeydown({key:'Enter',preventDefault(){prevented=true;}});assert(prevented);};
 start.onclick();assert.equal(start.selected,'1');
 start.value='8.5';enter(start);start.onchange();
 assert.match(card.textContent,/8.5 s \/ every 1 s · Manual/);
 assert.equal(nodes().find(node=>node.fieldName==='Starts at (s)'),start);
 count.onfocus();assert.equal(count.selected,'1');
 count.value='7';enter(count);count.onchange();
 assert.deepEqual(calls,[0,0]);
 assert.equal(nodes().find(node=>node.fieldName==='Count'),count);
 assert.deepEqual(f.state.snap.value.config.WaveCfg[0].SpawnTimeline[0],
  {id:'a',unitId:3,spawnId:1,count:7,startSeconds:8.5,intervalSeconds:1,routeGraphId:'one',future:{keep:1},editorManualTiming:true});
});

test('spawn and wave timing fields have three step sizes on each side and timing overrides lock their row',()=>{
 const f=fixture(),stage=f.state.snap.value,spawn=stage.spawns[0],wave=stage.config.WaveCfg[0];
 spawn.defaultTiming={startSeconds:1.25,intervalSeconds:.75};
 Object.assign(wave.SpawnTimeline[0],{count:2,...spawn.defaultTiming,inheritSpawnTiming:['startSeconds','intervalSeconds']});
 const redraw=()=>{f.context.right.textContent='';f.panels.right();};
 const find=(predicate,parent=f.context.right)=>descendants(parent).find(predicate);
 const step=(caption,parent)=>find(node=>node.attributes?.['aria-label']===caption,parent);
 const lane=()=>f.state.snap.value.config.WaveCfg[0].SpawnTimeline[0];
 const defaults=()=>f.state.snap.value.spawns[0].defaultTiming;
 f.state.tab='Spawns';f.state.selection=['spawn:1'];redraw();
 const section=find(node=>node.tagName==='details'&&node.children[0].textContent==='Default timing');
 assert(section.open);assert.equal(f.edits(),0);
 const startRow=find(node=>node.classList.contains('world-timing-row'),section);
 for(const [side,labels] of [['decrease',['−0.5','−2','−5']],['increase',['+0.5','+2','+5']]]){
  assert.deepEqual(find(node=>node.classList.contains('world-timing-'+side),startRow).children.map(node=>node.textContent),labels);
 }
 step('Increase start time by 0.5 seconds',section).onclick();
 assert.equal(defaults().startSeconds,1.75);assert.equal(lane().startSeconds,1.75);
 step('Increase start time by 2 seconds',section).onclick();
 assert.equal(lane().startSeconds,3.75);
 step('Increase start time by 5 seconds',section).onclick();
 assert.equal(lane().startSeconds,8.75);
 step('Decrease start time by 5 seconds',section).onclick();
 step('Decrease start time by 2 seconds',section).onclick();
 assert.equal(lane().startSeconds,1.75);
 step('Decrease interval by 0.5 seconds',section).onclick();
 assert.equal(defaults().intervalSeconds,.25);assert.equal(lane().intervalSeconds,.25);
 assert(step('Decrease interval by 0.5 seconds',section).disabled);

 f.state.tab='Waves';redraw();
 const card=find(node=>node.dataset.entryId==='a');
 step('Decrease start time by 0.5 seconds',card).onclick();
 assert.equal(lane().startSeconds,1.25);
 assert.equal(lane().editorManualTiming,true);
 assert(!Object.hasOwn(lane(),'inheritSpawnTiming'));
 assert.equal(defaults().startSeconds,1.75);
 step('Increase interval by 5 seconds',card).onclick();
 assert.equal(lane().intervalSeconds,5.25);
 step('Decrease interval by 2 seconds',card).onclick();
 assert.equal(lane().intervalSeconds,3.25);
 assert(!Object.hasOwn(lane(),'inheritSpawnTiming'));
 redraw();
 const updatedCard=find(node=>node.dataset.entryId==='a');
 const reset=find(node=>node.tagName==='button'&&node.textContent==='Use spawn defaults',updatedCard);
 reset.onclick();
 assert.deepEqual([lane().startSeconds,lane().intervalSeconds],[1.75,.25]);
 assert.deepEqual(lane().inheritSpawnTiming,['startSeconds','intervalSeconds']);
 assert(!Object.hasOwn(lane(),'editorManualTiming'));
});

test('the wave unit chooser updates inherited start and interval when its spawn changes',()=>{
 const f=fixture(),stage=f.state.snap.value;
 stage.spawns[0].defaultTiming={startSeconds:2,intervalSeconds:1};
 stage.spawns.push({id:2,name:'Spawn 2',enabled:true,defaultTiming:{startSeconds:4,intervalSeconds:1.5}});
 let chooser,apply;
 f.context.unitPicker=(dialog,spec)=>{chooser=spec;};
 f.context.modal=(title,body,action)=>{body(f.context.el('div'));apply=action;};
 f.state.tab='Waves';f.panels.right();
 descendants(f.context.right).find(node=>node.tagName==='button'&&node.textContent==='Add units').onclick();
 const field=label=>descendants(chooser.controls).find(node=>node.fieldName===label);
 assert.deepEqual([field('Starts at (s)').value,field('Interval (s)').value],[2,1]);
 field('Starts at (s)').value='2.25';field('Starts at (s)').change(2.25);
 field('Spawn').change('2');
 assert.deepEqual([field('Starts at (s)').value,field('Interval (s)').value],['2.25','1.5']);
 chooser.selected.add(3);apply();
 const entry=f.state.snap.value.config.WaveCfg[0].SpawnTimeline.at(-1);
 assert.deepEqual([entry.spawnId,entry.startSeconds,entry.intervalSeconds],[2,2.25,1.5]);
 assert.equal(entry.editorManualTiming,true);
 assert(!Object.hasOwn(entry,'inheritSpawnTiming'));
});

test('the spawn inspector applies defaults to every wave using the selected spawn in one draft edit',()=>{
 const f=fixture(),stage=f.state.snap.value;
 stage.spawns[0].defaultTiming={startSeconds:2,intervalSeconds:1.5};
 stage.spawns.push({id:2,name:'Spawn 2',enabled:true});
 stage.config.WaveCfg[0].SpawnTimeline[1].spawnId=2;
 const other=clone(stage.config.WaveCfg[0].SpawnTimeline[1]);
 f.state.tab='Spawns';f.state.selection=['spawn:1'];f.panels.right();
 const timing=descendants(f.context.right).find(node=>node.tagName==='details'&&node.children[0].textContent==='Default timing');
 const apply=timing.children.find(node=>node.tagName==='button'&&node.textContent==='Apply to all wave groups');
 assert(apply);assert.equal(f.edits(),0);
 apply.onclick();
 assert.equal(f.edits(),1);
 const waves=f.state.snap.value.config.WaveCfg;
 assert.deepEqual(waves[0].SpawnTimeline[1],other);
 for(const wave of waves)for(const row of wave.SpawnTimeline.filter(row=>row.spawnId===1)){
  assert.deepEqual([row.startSeconds,row.intervalSeconds],[2,1.5]);
  assert.deepEqual(row.inheritSpawnTiming,['startSeconds','intervalSeconds']);
 }
 assert.deepEqual(waves[1].RefreshSoldierKind,['1#3,1']);
});

test('Tasks position follows Hero start and entering placement leaves the stage draft untouched',()=>{
 const f=fixture();f.state.tab='Spawns';const before=clone(f.state.snap.value);
 f.panels.left();
 const buttons=descendants(f.context.left).filter(node=>node.tagName==='button');
 const hero=buttons.findIndex(node=>node.textContent==='Hero start');
 assert.equal(buttons[hero+1].textContent,'Tasks position');
 buttons[hero+1].onclick();assert.deepEqual(f.state.selection,['tasks-position']);assert.equal(f.state.tool,'tasks-position');
 f.panels.right();
 const fields=descendants(f.context.right);
 assert(fields.some(node=>node.textContent.includes('Click the map to place the Royal Advisor.')));
 assert(fields.some(node=>node.fieldName==='X'&&node.value===144));
 assert(fields.some(node=>node.fieldName==='Y'&&node.value===44));
 assert.equal(f.edits(),0);assert.deepEqual(f.state.snap.value,before);
});

function battleTaskFixture(level=7){
 const f=fixture(),stage=f.state.snap.value;
 stage.level=level;stage.id='A-'+level;stage.config.Level=level;stage.tasksPosition={x:32,y:-12};
 f.state.tab='Spawns';f.state.selection=['tasks-position'];f.state.tool='select';
 const first={taskId:4,rewardId:8,amount:3},second={taskId:5,rewardId:9,amount:30},third={taskId:6,rewardId:9,amount:50};
 f.state.catalog.battleTasks={
  definitions:[
   {id:4,label:'Upgrade a tower'},{id:5,label:'Build a mill'},{id:6,label:'Train a squad'},
   {id:'kill-hero',label:'Defeat enemies with the hero',counted:true,defaultCount:10},
   {id:'survive-wall',label:'Keep walls intact',counted:true,defaultCount:1},
  ],
  rewards:[{id:8,label:'Battle silver'},{id:9,label:'Gold'}],
  defaults:{1:[second,first],2:[first,second,third]},
  count:{1:2,2:2},random:{1:false,2:true},
 };
 const redraw=()=>{f.context.right.textContent='';f.panels.right();};
 const button=(label,parent=f.context.right)=>descendants(parent).find(node=>node.tagName==='button'&&node.textContent===label);
 const cards=()=>descendants(f.context.right).filter(node=>node.classList.contains('world-battle-task-card'));
 const input=(card,label)=>descendants(card).find(node=>node.fieldName===label);
 const rows=()=>f.state.snap.value.config.BattleTasks;
 redraw();
 return {...f,redraw,button,cards,input,rows};
}

test('Tasks position previews inherited task settings and customizes only the active stage draft',()=>{
 for(const level of [1,7]){
  const f=battleTaskFixture(level),before=clone(f.state.snap.value),original=clone(f.state.catalog.battleTasks);
  assert.equal(f.rows(),undefined);
  assert.match(f.context.right.textContent,level===1?/default tasks in order/:/chooses 2 tasks at random/);
  assert.equal(f.edits(),0);
  f.button('Customize tasks').onclick();
  const expected=clone(before);expected.config.BattleTasks=original.defaults[level===1?1:2].slice(0,2);
  assert.deepEqual(f.state.snap.value,expected);
  f.redraw();assert.equal(f.cards().length,2);
  assert.match(f.context.right.textContent,/stage reward multiplier applies to persistent rewards/);
  assert.equal(f.input(f.context.right,'X').value,32);assert.equal(f.input(f.context.right,'Y').value,-12);
  assert.deepEqual(f.state.catalog.battleTasks,original);
 }
});

test('custom tasks allow repeated task definitions, reward choices, order changes and an empty list',()=>{
 const f=battleTaskFixture(),original=clone(f.state.snap.value);
 f.button('Customize tasks').onclick();f.redraw();
 const first=f.cards()[0],second=f.cards()[1];
 f.input(second,'Task').change(4);
 f.input(first,'Reward').change(9);
 f.input(first,'Base amount').change(0);
 assert.throws(()=>f.input(first,'Base amount').change(-1),/whole reward amount/);
 assert.throws(()=>f.input(first,'Base amount').change(1.5),/whole reward amount/);
 assert.throws(()=>f.input(first,'Reward').change(999),/available reward/);
 f.button('Move down',first).onclick();
 f.input(first,'Base amount').change(12);
 assert.deepEqual(f.rows(),[{taskId:4,rewardId:9,amount:30},{taskId:4,rewardId:9,amount:12}]);
 f.button('Add task').onclick();
 assert.deepEqual(f.rows()[2],{taskId:5,rewardId:9,amount:50});
 f.redraw();const rendered=f.cards();
 for(const card of rendered)f.button('Remove',card).onclick();
 assert.deepEqual(f.rows(),[]);
 f.redraw();assert.match(f.context.right.textContent,/Battle tasks are disabled/);
 f.button('Use default tasks').onclick();
 assert.deepEqual(f.state.snap.value,original);
});

test('task controls cannot overwrite a competing draft update',()=>{
 const f=battleTaskFixture();
 f.button('Customize tasks').onclick();f.redraw();
 const current=f.input(f.cards()[0],'Base amount');
 f.state.snap.value.config.BattleTasks[0].amount=500;
 assert.throws(()=>current.change(72),/task list changed/);
 assert.equal(f.rows()[0].amount,500);
});

test('the Task picker switches between building tasks and counted objectives with the correct defaults and help',()=>{
 const f=battleTaskFixture(),original=clone(f.state.snap.value);
 f.button('Customize tasks').onclick();f.redraw();
 let [card]=f.cards(),picker=f.input(card,'Task');
 assert.deepEqual(picker.choices.map(choice=>choice.value),['4','5','6','kill-hero','survive-wall']);
 assert.equal(f.input(card,'Count'),undefined);
 picker.change('kill-hero');f.redraw();
 [card]=f.cards();
 assert.deepEqual(f.rows()[0],{taskId:'kill-hero',rewardId:8,amount:3,count:10});
 const required=f.input(card,'Count');
 assert.deepEqual([required.value,required.min,required.step],[10,'1','1']);
 assert.match(card.textContent,/Only final blows from the listed source count while this task is active/);
 for(const invalid of [0,-1,1.5,Number.MAX_SAFE_INTEGER+1]){
  assert.throws(()=>required.change(invalid),/whole count of at least 1/);
 }
 required.change(13);
 f.button('Move down',card).onclick();
 required.change(16);
 assert.equal(f.rows()[1].count,16);
 f.input(card,'Task').change('survive-wall');
 assert.throws(()=>required.change(17),/task list changed/);
 f.redraw();card=f.cards()[1];
 assert.deepEqual(f.rows()[1],{taskId:'survive-wall',rewardId:8,amount:3,count:1});
 assert.match(card.textContent,/consecutive waves.*none destroyed.*resets the streak/);
 f.input(card,'Count').change(3);
 f.input(card,'Task').change('4');f.redraw();
 assert.deepEqual(f.rows()[1],{taskId:4,rewardId:8,amount:3});
 assert.equal(f.input(f.cards()[1],'Count'),undefined);
 const draft=clone(f.state.snap.value);delete draft.config.BattleTasks;
 assert.deepEqual(draft,original);
});

test('Add task initializes Count when the next available objective needs it',()=>{
 const f=battleTaskFixture();
 f.button('Customize tasks').onclick();f.redraw();
 f.button('Add task').onclick();f.button('Add task').onclick();f.button('Add task').onclick();
 assert.deepEqual(f.rows().slice(-2).map(row=>[row.taskId,row.count]),[['kill-hero',10],['survive-wall',1]]);
});

test('stage identity renders a static number and a separate name without rewriting a localized title',()=>{
 const f=fixture();f.state.tab='Stage';f.state.snap.value.config.Name='[[loc:stage.desert]]';f.state.snap.stageName='7. Desert';const before=clone(f.state.snap.value);f.panels.right();
 const rows=descendants(f.context.right),number=rows.find(row=>row.tagName==='output'&&row.attributes['aria-label']==='Stage number'),name=rows.find(row=>row.fieldName==='Stage name');
 assert.equal(number.textContent,'Stage 7');assert.equal(number.children.length,0);assert.equal(number.onchange,undefined);assert(!rows.some(row=>['Level','Stage number'].includes(row.fieldName)));assert.equal(name.value,'Desert');assert.equal(f.edits(),0);assert.deepEqual(f.state.snap.value,before);
 name.change('Desert');assert.deepEqual(f.state.snap.value,before,'an unchanged name preserves the original localization token');
});

test('renaming a stage keeps its fixed number and updates its title while preserving all other content',()=>{
 const f=fixture();f.state.tab='Stage';f.state.snap.value.config.Name='[[loc:stage.desert]]';f.state.snap.stageName='7. Desert';const before=clone(f.state.snap.value);f.panels.right();
 descendants(f.context.right).find(row=>row.fieldName==='Stage name').change(' 99. Lantern Crossing ');
 const expected=clone(before);expected.config.Name='7. Lantern Crossing';assert.deepEqual(f.state.snap.value,expected);
 f.context.right.textContent='';f.panels.right();assert(descendants(f.context.right).some(row=>row.tagName==='h3'&&row.textContent==='Stage 7 — Lantern Crossing'));assert.equal(descendants(f.context.right).find(row=>row.fieldName==='Stage name').value,'Lantern Crossing');
 f.panels.left();assert(descendants(f.context.left).some(row=>row.tagName==='strong'&&row.textContent==='Stage 7 — Lantern Crossing'));
});

test('stage names reject blank values and stale controls without overwriting another title',()=>{
 const f=fixture();f.state.tab='Stage';f.state.snap.value.config.Name='7. Desert';f.panels.right();const input=descendants(f.context.right).find(row=>row.fieldName==='Stage name'),before=clone(f.state.snap.value);
 assert.throws(()=>input.change('   '),/Enter a stage name/);assert.deepEqual(f.state.snap.value,before);
 f.state.snap.value.config.Name='7. Changed elsewhere';const concurrent=clone(f.state.snap.value);assert.throws(()=>input.change('Meadow'),/stage name changed/);assert.deepEqual(f.state.snap.value,concurrent);
});

test('a stage biome choice edits only its draft metadata and can return to the shared map biome',()=>{
 const f=fixture();f.state.tab='Stage';f.state.catalog.maps[0].biome='lava';const before=clone(f.state.snap.value);f.panels.right();
 const input=descendants(f.context.right).find(row=>row.fieldName==='Biome');assert.equal(input.value,'map');assert.equal(f.edits(),0);
 input.change('snow');const expected=clone(before);expected.config.EnvironmentBiome='snow';expected.config.EnvironmentBiomeOverride=true;assert.deepEqual(f.state.snap.value,expected);
 input.change('map');delete expected.config.EnvironmentBiomeOverride;expected.config.EnvironmentBiome='lava';assert.deepEqual(f.state.snap.value,expected);
 assert.throws(()=>input.change('unknown'),/valid stage biome/);f.state.snap.value.id='A-8';assert.throws(()=>input.change('ice'),/stage changed/);
});

test('path cards drag in the draft without changing routing order or the selected path',()=>{
 const f=fixture(),before=clone(f.state.snap.value);f.state.tab='Paths';f.panels.left();
 const rows=descendants(f.context.left).filter(element=>element.dataset.graphId);
 assert(rows.every(row=>row.draggable));rows[1].ondragstart(dragEvent());rows[0].ondragover(dragEvent());rows[0].ondrop(dragEvent());
 assert.equal(f.edits(),1);assert.equal(f.state.graph,'one');
 assert.deepEqual(f.state.snap.value.graphs.map(graph=>graph.id),['one','two']);
 assert.deepEqual(require('../worlds/stage-card-order').ordered(f.state.snap.value.graphs).map(graph=>graph.id),['two','one']);
 assert.deepEqual(f.state.snap.value.graphs.map(({editorOrder,...graph})=>graph),before.graphs);
 assert.deepEqual(f.state.snap.value.config,before.config);
 f.panels.left();assert.deepEqual(descendants(f.context.left).filter(element=>element.dataset.graphId).map(row=>row.dataset.graphId),['two','one']);
});

test('building cards support the same drag order and keyboard moves without changing construction identifiers',()=>{
 const f=fixture();f.state.tab='Buildings';f.state.snap.value.buildings=[{id:1,name:'Main Hall 1',kind:1},{id:4,name:'House 1',kind:4},{id:8,name:'Tower 1',kind:2}];f.state.selection=['building:4'];f.panels.left();
 let rows=descendants(f.context.left).filter(element=>element.dataset.buildingId);
 rows[2].ondragstart(dragEvent());rows[0].ondrop(dragEvent());
 assert.deepEqual(f.state.snap.value.buildings.map(building=>building.id),[1,4,8]);assert.deepEqual(f.state.selection,['building:4']);
 f.panels.left();rows=descendants(f.context.left).filter(element=>element.dataset.buildingId);assert.deepEqual(rows.map(row=>row.dataset.buildingId),[8,1,4]);
 rows[1].onkeydown({...dragEvent(),key:'ArrowUp',altKey:true});
 assert.deepEqual(require('../worlds/stage-card-order').ordered(f.state.snap.value.buildings).map(building=>building.id),[1,8,4]);assert.equal(f.edits(),2);
});

test('the Buildings list selects the single Silver offer and keeps other merchant types',()=>{
 const f=fixture();f.state.tab='Buildings';
 f.state.snap.value.specials=[
  {id:'offer-1',kind:0,name:'Silver offer 1'},
  {id:'offer-2',kind:1,name:'Weapon offer'},
  {id:'offer-3',kind:2,name:'Horse offer',enabled:false},
 ];
 const before=clone(f.state.snap.value),cards=()=>descendants(f.context.left).filter(node=>node.dataset.specialId);
 f.panels.left();
 assert.deepEqual(cards().map(card=>card.textContent),['Silver offer','Weapon offer','Horse offer · Disabled']);
 cards()[0].onclick();assert.deepEqual(f.state.selection,['special:offer-1']);
 assert.equal(f.edits(),0);assert.deepEqual(f.state.snap.value,before);
});

test('Silver offer controls preview scheduled waves and edit only the selected offer draft',()=>{
 const f=fixture(),stage=f.state.snap.value,errors=[];
 stage.specials=[{id:'offer-1',kind:0,name:'Silver offer',x:120,y:-135}];
 stage.config.WaveCfg=Array.from({length:10},(_,index)=>({Wave:index+1}));
 const client=require('node:fs').readFileSync(require.resolve('../worlds/client'),'utf8');
 const inspector=client.slice(client.indexOf(' function silverOfferSettings('),client.indexOf(' function renderBuildingInspector('));
 const render=require('node:vm').runInNewContext('('+inspector+')',{
  ...f.context,values:()=>f.state.snap.value,message:value=>errors.push(value),
  SilverOfferSchedule:require('../../../assets/_script/SilverOfferSchedule'),
 });
 const offer=()=>f.state.snap.value.specials[0],controls=()=>descendants(f.context.right).filter(node=>node.fieldName);
 render(offer());
 assert.deepEqual(controls().map(node=>[node.fieldName,node.value]),[['Total offers',2],['First wave',1],['Wave interval',1]]);
 assert.match(f.context.right.textContent,/Appears before waves 1, 2\./);
 assert.equal(f.edits(),0);
 controls()[1].change(4);controls()[2].change(5);controls()[2].change(0);
 assert.equal(f.edits(),2);
 assert.deepEqual(clone(offer()),{...stage.specials[0],silverSchedule:{firstWave:4,interval:5}});
 assert.deepEqual(errors,['Wave interval must be a whole number of at least 1.']);
 f.context.right.textContent='';render(offer());
 assert.match(f.context.right.textContent,/Appears before waves 4, 9\./);
});

test('cancelled drags, busy documents and drops from another stage cannot create an edit',()=>{
 const f=fixture();f.state.tab='Paths';f.panels.left();const rows=descendants(f.context.left).filter(element=>element.dataset.graphId);
 rows[1].ondragstart(dragEvent());rows[1].ondragend();rows[0].ondrop(dragEvent());assert.equal(f.edits(),0);
 rows[1].ondragstart(dragEvent());f.state.snap.value.id='A-8';rows[0].ondrop(dragEvent());assert.equal(f.edits(),0);
 f.state.snap.busy=true;const event=dragEvent();rows[1].ondragstart(event);assert(event.prevented);assert.equal(f.edits(),0);
 assert(rows.every(row=>!row.classList.contains('world-card-drag-source')));
});

test('Duplicate path sits directly above Delete path, retains spawn references and selects the independent copy',()=>{
 const f=fixture(),before=clone(f.state.snap.value);f.state.tab='Paths';f.state.selection=['node:start'];f.panels.right();
 const actions=f.context.right.children.filter(element=>element.tagName==='button'),copyAt=actions.findIndex(element=>element.textContent==='Duplicate path');
 assert(copyAt>=0);assert.equal(actions[copyAt+1].textContent,'Delete path');actions[copyAt].onclick();
 const added=f.state.snap.value.graphs.find(graph=>graph.id===f.state.graph);assert(added);assert.notEqual(added.id,'one');assert.equal(added.name,'Spawn 1 · Route 3');
 assert.deepEqual(added.nodes,before.graphs[0].nodes);assert.deepEqual(added.edges,before.graphs[0].edges);assert.deepEqual(added.spawnIds,[1]);
 assert.deepEqual(f.state.selection,[]);assert.equal(f.state.tool,'select');assert.deepEqual(f.state.snap.value.config,before.config);
 added.nodes[0].x=999;assert.equal(f.state.snap.value.graphs[0].nodes[0].x,before.graphs[0].nodes[0].x);
});
test('rendering every contextual stage tab makes no draft changes or edit requests',()=>{
 const f=fixture(),before=JSON.stringify(f.state.snap.value);for(const tab of ['Stage','Buildings','Spawns','Paths','Waves']){f.state.tab=tab;f.panels.top();f.panels.tabs();f.panels.left();f.panels.right();assert.equal(JSON.stringify(f.state.snap.value),before,tab);}assert.equal(f.edits(),0);
});

test('the Stage and Buildings tabs can change building levels independently of the hall',()=>{
 const f=fixture(),before=clone(f.state.snap.value);f.state.previewBuildingLevel=1;
 const level=()=>descendants(f.context.tabs).find(node=>node.fieldName==='Building preview');
 for(const tab of ['Stage','Buildings']){
  f.context.tabs.textContent='';f.state.tab=tab;f.panels.tabs();
  assert.deepEqual(level().choices,[1,2,3,4]);
  level().change(4);
  assert.equal(f.state.previewBuildingLevel,4);
  assert.equal(f.state.previewHall,3);
 }
 assert.deepEqual(f.state.snap.value,before);
 assert.equal(f.edits(),0);
});

test('first-upgrade cards are a Buildings-only preview toggle and redraw without editing the stage',()=>{
 const f=fixture(),before=clone(f.state.snap.value);
 let prepared=0,drawn=0;
 f.context.prepareImages=()=>prepared++;
 f.context.draw=()=>drawn++;
 const panels=Panels.create(f.context);
 const toggle=()=>descendants(f.context.tabs).find(e=>e.fieldName==='First-upgrade cards');
 f.state.tab='Stage';panels.tabs();assert.equal(toggle(),undefined);
 f.context.tabs.textContent='';f.state.tab='Buildings';panels.tabs();
 assert.equal(toggle().checked,false);toggle().change(true);
 assert.equal(f.state.showFirstUpgradeCards,true);
 f.context.tabs.textContent='';panels.tabs();assert.equal(toggle().checked,true);toggle().change(false);
 assert.equal(f.state.showFirstUpgradeCards,false);
 assert.deepEqual([prepared,drawn,f.edits()],[2,2,0]);
 assert.deepEqual(f.state.snap.value,before);
});

test('the stage face uses its model chooser without exposing a second numeric ID control',()=>{
 const f=fixture();f.state.tab='Stage';f.state.snap.value.config.StageFaceUnit=3;f.panels.right();assert(descendants(f.context.right).some(e=>e.tagName==='button'&&e.textContent==='Choose face unit…'));assert(!descendants(f.context.right).some(e=>e.fieldName==='StageFaceUnit'));assert.equal(f.edits(),0);
});
test('explicit Delete path clears only matching timed route overrides and preserves all other wave data',()=>{
 const f=fixture(),before=clone(f.state.snap.value);f.state.tab='Paths';f.panels.right();const remove=descendants(f.context.right).find(element=>element.tagName==='button'&&element.textContent==='Delete path');assert(remove);remove.onclick();
 const expected=clone(before);expected.graphs=expected.graphs.filter(graph=>graph.id!=='one');expected.config.WaveCfg[0].SpawnTimeline[0].routeGraphId=null;assert.deepEqual(f.state.snap.value,expected);assert.deepEqual(before.config.WaveCfg[0].SpawnTimeline[0].future,{keep:1});assert(!Object.prototype.hasOwnProperty.call(f.state.snap.value.config.WaveCfg[0].SpawnTimeline[2],'routeGraphId'));assert(!Object.prototype.hasOwnProperty.call(f.state.snap.value.config.WaveCfg[1],'SpawnTimeline'));assert.equal(f.edits(),1);assert.equal(f.state.graph,null);assert.deepEqual(f.state.selection,[]);
});
test('wave timing opens by default and remembers a collapse only within the same stage, wave and group context',()=>{
 const f=fixture();f.state.tab='Waves';f.panels.right();const timing=()=>descendants(f.context.right).find(element=>element.tagName==='details'&&element.children[0].textContent.startsWith('Timing & route'));
 const first=timing();assert.equal(first.open,true);first.isConnected=true;first.open=false;first.ontoggle();
 f.context.right.textContent='';f.state.snap.value.config.WaveCfg[0].SpawnTimeline[0].count=2;f.panels.right();assert.equal(timing().open,false);
 // A queued toggle from a detached old element cannot overwrite current state.
 first.isConnected=false;first.open=true;first.ontoggle();f.context.right.textContent='';f.panels.right();assert.equal(timing().open,false);
 f.context.right.textContent='';f.state.wave=1;f.panels.right();assert.equal(timing().open,true);
 f.context.right.textContent='';f.state.wave=0;f.panels.right();assert.equal(timing().open,false);
 f.context.right.textContent='';f.state.snap.value.id='A-8';f.panels.right();assert.equal(timing().open,true);assert.equal(f.edits(),0);
});
test('bulk wave timing covers every spawn row, respects manual toggles, and writes no draft changes',()=>{
 const f=fixture(),stage=f.state.snap.value;
 f.state.tab='Waves';
 stage.spawns.push({id:2,name:'Spawn 2',enabled:true});
 const [first,second]=stage.config.WaveCfg[0].SpawnTimeline;
 first.unitGroupId=second.unitGroupId='linked';
 second.spawnId=2;
 const before=clone(stage),nodes=()=>descendants(f.context.right);
 const redraw=()=>{f.context.right.textContent='';f.panels.right();};
 const toggle=()=>nodes().find(node=>node.classList.contains('world-wave-timing-toggle'));
 const timing=()=>nodes().filter(node=>node.tagName==='details'&&node.children[0].textContent.startsWith('Timing & route'));
 const timingStates=()=>timing().map(panel=>panel.open);

 f.state.waveSpawnFilter='1';redraw();
 assert.deepEqual(timingStates(),[true,true,true]);
 assert.equal(toggle().textContent,'Collapse all timing');
 const settings=nodes().find(node=>node.tagName==='details'&&node.children[0].textContent==='Wave settings & rewards');
 settings.open=true;
 toggle().onclick();
 assert.deepEqual(timingStates(),[false,false,false]);
 assert.equal(settings.open,true);
 assert.equal(toggle().textContent,'Expand all timing');

 f.state.waveSpawnFilter='all';redraw();
 assert.deepEqual(timingStates(),[false,false,false,false]);
 const section=timing()[0];
 section.isConnected=true;section.open=true;section.ontoggle();
 assert.equal(toggle().textContent,'Collapse all timing');
 toggle().onclick();
 f.state.wave=1;redraw();
 assert.deepEqual(timingStates(),[true]);
 f.state.wave=0;redraw();
 assert.deepEqual(timingStates(),[false,false,false,false]);
 toggle().onclick();redraw();
 assert.deepEqual(timingStates(),[true,true,true,true]);
 assert.deepEqual(f.state.snap.value,before);
 assert.equal(f.edits(),0);
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
 f.state.tab='Paths';f.panels.left();f.panels.right();assert.equal(JSON.stringify(stage),before);assert.equal(f.edits(),0);assert(descendants(f.context.left).some(element=>element.tagName==='strong'&&element.textContent==='Spawns 1–3 · Route 1'));const name=descendants(f.context.right).find(element=>element.fieldName==='Name');assert.equal(name.value,'Spawns 1–3 · Route 1');
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

test('wave unit grips preview and commit card order in one draft edit',()=>{
 const f=fixture(),before=clone(f.state.snap.value);
 f.state.tab='Waves';
 const redraw=()=>{f.context.right.textContent='';f.panels.right();};
 const cards=()=>descendants(f.context.right).filter(node=>node.classList.contains('world-wave-unit-card'));
 const grip=card=>descendants(card).find(node=>node.classList.contains('world-wave-drag-handle'));
 redraw();
 assert.equal(f.edits(),0);
 const [first,,third]=cards(),handle=grip(third);
 assert.equal(handle.draggable,true);
 assert.equal(handle.attributes['aria-label'],'Reorder Unit');
 assert(!third.draggable);
 const unrelated=dragEvent();
 first.ondrop(unrelated);
 assert(!unrelated.prevented);
 handle.ondragstart(dragEvent());
 const over=dragEvent(10);
 first.ondragover(over);
 assert(over.prevented&&first.classList.contains('world-card-drop-before'));
 assert(third.classList.contains('world-card-drag-source'));
 assert.equal(f.edits(),0);
 first.ondrop(dragEvent(10));
 assert.equal(f.edits(),1);
 const expected=clone(before);
 expected.config.WaveCfg[0].editorUnitOrder=['c','a','b','d'];
 assert.deepEqual(f.state.snap.value,expected);
 redraw();
 assert.deepEqual(cards().map(node=>node.dataset.entryId),['c','a','b','d']);

 const [moved,following]=cards();
 grip(moved).ondragstart(dragEvent());
 grip(moved).ondragend();
 following.ondrop(dragEvent(90));
 assert.equal(f.edits(),1);
 grip(moved).ondragstart(dragEvent());
 f.state.wave=1;
 following.ondrop(dragEvent(90));
 assert.deepEqual(f.state.snap.value,expected);
 assert.equal(f.edits(),1);
 redraw();
 assert.equal(cards().length,1);
 assert.equal(grip(cards()[0]),undefined);
});

test('dropping a unit beside a card inserts it in the correct column order',()=>{
 const f=fixture();f.state.tab='Waves';f.panels.right();
 const cards=descendants(f.context.right).filter(node=>node.classList.contains('world-wave-unit-card'));
 const [first,second,third]=cards;
 cards.forEach((card,index)=>{
  card.getBoundingClientRect=()=>({left:20+(index%2)*291,width:280,top:Math.floor(index/2)*411,height:index===0?400:100});
 });
 const grip=descendants(third).find(node=>node.classList.contains('world-wave-drag-handle'));
 const rightHalf={...dragEvent(10),clientX:250};
 grip.ondragstart(dragEvent());
 first.ondragover(rightHalf);
 assert(first.parentNode.classList.contains('world-card-drag-inline'));
 assert(first.classList.contains('world-card-drop-after'));
 first.ondrop(rightHalf);
 assert.deepEqual(f.state.snap.value.config.WaveCfg[0].editorUnitOrder,['a','c','b','d']);
 assert.equal(f.edits(),1);
});

test('the wave grid accepts release in the blank space below a short card',()=>{
 const f=fixture();f.state.tab='Waves';f.panels.right();
 const cards=descendants(f.context.right).filter(node=>node.classList.contains('world-wave-unit-card'));
 const [first,second,third,fourth]=cards,list=first.parentNode;
 cards.forEach((card,index)=>{
  card.getBoundingClientRect=()=>({left:20+(index%2)*291,width:280,top:Math.floor(index/2)*411,height:index===0?400:100});
 });
 const handle=descendants(fourth).find(node=>node.classList.contains('world-wave-drag-handle'));
 const over={...dragEvent(250),clientX:340},release={...dragEvent(250),clientX:575};
 handle.ondragstart(dragEvent());
 list.ondragover(over);
 assert(over.prevented&&second.classList.contains('world-card-drop-before'));
 list.ondrop(release);
 assert(release.prevented);
 assert.deepEqual(f.state.snap.value.config.WaveCfg[0].editorUnitOrder,['a','b','d','c']);
 assert.equal(f.edits(),1);
});

test('the spawn plus adds an independently editable count to the same unit card',()=>{
 const f=fixture();f.state.tab='Waves';f.state.waveSpawnFilter='6';
 const stage=f.state.snap.value;
 stage.spawns.push({id:6,name:'Spawn 6',enabled:true},{id:7,name:'Spawn 7',enabled:false});
 f.state.catalog.units.push({id:4,name:'Other unit'});
 const entry=stage.config.WaveCfg[0].SpawnTimeline[0];
 Object.assign(entry,{spawnId:6,count:5,routeGraphId:undefined});
 const rows=()=>f.state.snap.value.config.WaveCfg[0].SpawnTimeline;
 const redraw=()=>{f.context.right.textContent='';f.panels.right();};
 const cards=()=>descendants(f.context.right).filter(node=>node.classList.contains('world-wave-unit-card'));
 const card=()=>cards().find(node=>node.dataset.entryId==='a');
 const inputs=name=>descendants(card()).filter(node=>node.fieldName===name);
 const action=(text,root=card())=>descendants(root).find(node=>node.tagName==='button'&&node.textContent===text);

 redraw();assert.equal(cards().length,1);assert.equal(f.edits(),0);
 action('+').onclick();redraw();
 assert.equal(f.edits(),1);assert.equal(f.state.waveSpawnFilter,'all');assert.equal(cards().length,4);
 assert.deepEqual(inputs('Spawn').map(input=>input.value),[6,1]);
 assert.deepEqual(inputs('Spawn').map(input=>input.choices.map(choice=>choice.value)),[[6],[1]]);
 assert(action('+').disabled);assert.equal(inputs('Unit').length,1);

 inputs('Count')[1].change('4');redraw();
 assert.deepEqual(inputs('Count').map(input=>input.value),[5,4]);
 inputs('Unit')[0].change('4');redraw();
 assert.deepEqual(rows().map(({unitId,spawnId,count})=>[unitId,spawnId,count]),[[4,6,5],[3,1,1],[3,1,1],[3,1,1],[4,1,4]]);
 assert.deepEqual(rows()[0].future,{keep:1});
 const additional=rows().at(-1).id;
 action('−',card().children.find(node=>node.dataset.entryId===additional&&node.className==='world-wave-counts')).onclick();
 redraw();assert.equal(cards().length,4);assert.deepEqual(inputs('Count').map(input=>input.value),[5]);
 assert(!rows().some(row=>row.id===additional));
});

test('Add units keeps invalid submissions in the modal and rejects a concurrently replaced wave before writing',()=>{
 const f=fixture();f.state.tab='Waves';let action,dialog,strictValue;f.context.modal=(title,body,submit)=>{dialog=f.context.el('div');body(dialog);action=submit;};
 const originalEdit=f.context.edit;f.context.edit=(change,strict)=>{strictValue=strict;return originalEdit(change);};const panels=Panels.create(f.context);panels.right();descendants(f.context.right).find(element=>element.tagName==='button'&&element.textContent==='Add units').onclick();
 const count=descendants(dialog).find(element=>element.fieldName==='Count'),before=JSON.stringify(f.state.snap.value);count.change(0);assert.throws(()=>action(),/positive whole/);assert.equal(strictValue,true,'strict draft errors must reach the modal instead of closing it');assert.equal(JSON.stringify(f.state.snap.value),before);
 count.change(3);f.state.snap.value.config.WaveCfg.splice(0,1);const concurrent=JSON.stringify(f.state.snap.value);assert.throws(()=>action(),/wave changed/);assert.equal(JSON.stringify(f.state.snap.value),concurrent);
});
test('the unit chooser rejects a newer shared draft revision even when the wave contents are identical',()=>{
 const f=fixture();f.state.tab='Waves';f.state.snap.version=10;let apply,dialog;f.context.modal=(title,body,action)=>{dialog=f.context.el('div');body(dialog);apply=action;};f.panels.right();descendants(f.context.right).find(e=>e.tagName==='button'&&e.textContent==='Add units').onclick();descendants(dialog).find(e=>e.dataset.unitId===3).onclick();const before=clone(f.state.snap.value);f.state.snap.version=11;assert.throws(()=>apply(),/wave changed/);assert.deepEqual(f.state.snap.value,before);
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
 f.state.catalog.units.push({id:4,name:'Other unit'});let dialog;f.context.modal=(title,body)=>{dialog=f.context.el('div');body(dialog);};f.panels.right();descendants(f.context.right).find(e=>e.tagName==='button'&&e.textContent==='Add units').onclick();let choices=()=>descendants(dialog).filter(e=>e.dataset.unitId);assert.equal(choices().find(e=>e.dataset.unitId===3).attributes['aria-pressed'],'false');choices().find(e=>e.dataset.unitId===4).onclick();assert.equal(choices().find(e=>e.dataset.unitId===3).attributes['aria-pressed'],'false');assert.equal(choices().find(e=>e.dataset.unitId===4).attributes['aria-pressed'],'true');assert.equal(f.edits(),0);
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

test('Copy From defaults to the previous wave and leaves the selected wave number in place',()=>{
 const f=fixture();f.state.tab='Waves';f.state.wave=1;
 let dialog,apply;
 f.context.modal=(title,body,action,label)=>{
  assert.equal(title,'Copy into Wave 2');assert.equal(label,'Copy wave');
  dialog=f.context.el('div');body(dialog);apply=action;
 };
 f.panels.right();descendants(f.context.right).find(e=>e.textContent==='Copy From…').onclick();
 const field=name=>descendants(dialog).find(e=>e.fieldName===name);
 assert.equal(field('Copy from wave').value,0);
 assert.deepEqual(field('Copy from wave').choices,[{value:0,label:'Wave 1'}]);
 const groups=field('Unit groups and timing'),paths=field('Copy path overrides');
 assert([groups,paths,field('Enemy health and attack multipliers'),field('Other wave settings and rewards')].every(input=>input.checked));
 groups.change(false);assert(paths.disabled);groups.change(true);assert.equal(paths.disabled,false);
 assert.equal(f.edits(),0);
 const original=clone(f.state.snap.value);apply();
 assert.equal(f.edits(),1);assert.equal(f.state.wave,1);
 assert.deepEqual(f.state.snap.value.config.WaveCfg,[original.config.WaveCfg[0],{...original.config.WaveCfg[0],Wave:2}]);
});

test('a queued copy cannot replace a wave using a source that changed while the popup was open',async()=>{
 const f=queuedFixture();f.state.wave=1;
 let apply;
 f.context.modal=(_title,body,action)=>{body(f.context.el('div'));apply=action;};
 f.render();descendants(f.context.right).find(e=>e.textContent==='Copy From…').onclick();
 const copy=apply(),rejection=assert.rejects(copy,/waves changed/);
 f.state.snap.value.config.WaveCfg[0].SpawnTimeline[0].count=42;
 const before=clone(f.state.snap.value);await f.flush();await rejection;
 assert.deepEqual(f.state.snap.value,before);
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

test('stage overview and wave list expose each wave’s scaling without converting legacy schedules or creating edits',()=>{
 const f=fixture(),waves=f.state.snap.value.config.WaveCfg;
 Object.assign(waves[0],{HealthCoefficient:.9,AttackCoefficient:.7});Object.assign(waves[1],{HealthCoefficient:2.3,AttackCoefficient:2.1});
 const before=JSON.stringify({stage:f.state.snap.value,catalog:f.state.catalog});f.state.tab='Stage';f.panels.right();
 const overview=descendants(f.context.right).find(element=>element.className==='world-stage-wave-overview');assert(overview,'Stage has an overview of its waves');
 const rows=descendants(overview).filter(element=>element.dataset.waveIndex!==undefined);assert.equal(rows.length,2);
 for(const [index,hp,damage]of [[0,'0.9','0.7'],[1,'2.3','2.1']]){const row=rows.find(element=>String(element.dataset.waveIndex)===String(index));assert(row);assert(row.textContent.includes(hp));assert(row.textContent.includes(damage));}
 assert.equal(JSON.stringify({stage:f.state.snap.value,catalog:f.state.catalog}),before);assert.equal(f.edits(),0);
 f.state.tab='Waves';f.panels.left();for(const [index,hp,damage]of [[0,'0.9','0.7'],[1,'2.3','2.1']]){const row=descendants(f.context.left).find(element=>String(element.dataset.waveIndex)===String(index));assert(row.textContent.includes('HP ×'+hp));assert(row.textContent.includes('Damage ×'+damage));}
 assert.equal(JSON.stringify({stage:f.state.snap.value,catalog:f.state.catalog}),before);assert.equal(f.edits(),0);assert(!Object.hasOwn(waves[1],'SpawnTimeline'));
});

test('wave cards recalculate per-unit HP and rounded damage after unit or multiplier changes while counts stay separate',()=>{
 const f=fixture();f.state.tab='Waves';f.state.catalog.units=[{id:3,name:'Slime',health:40,damage:10},{id:4,name:'Guardian',health:60,damage:15}];
 Object.assign(f.state.snap.value.config.WaveCfg[0],{HealthCoefficient:.9,AttackCoefficient:.75});
 const redraw=()=>{f.context.right.textContent='';f.panels.right();},card=()=>descendants(f.context.right).find(element=>element.dataset.entryId==='a'),effective=()=>descendants(card()).filter(element=>element.className==='world-unit-stat').map(element=>descendants(element).find(child=>child.tagName==='strong').textContent);
 const pristine=JSON.stringify({stage:f.state.snap.value,catalog:f.state.catalog});redraw();assert.deepEqual(effective(),['36','8']);assert(card().textContent.includes('HP per unit'));assert(card().textContent.includes('Damage per hit'));assert(card().textContent.includes('Base 40'));assert(card().textContent.includes('Base 10'));assert.equal(JSON.stringify({stage:f.state.snap.value,catalog:f.state.catalog}),pristine);assert.equal(f.edits(),0);
 descendants(card()).find(element=>element.fieldName==='Count').change(7);redraw();assert.deepEqual(effective(),['36','8'],'quantity never multiplies a single unit’s stats');
 descendants(card()).find(element=>element.fieldName==='Unit').change(4);redraw();assert.deepEqual(effective(),['54','11'],'switching units uses that profile’s base stats');
 const scaling=descendants(f.context.right).find(element=>element.className==='world-wave-scaling');assert(scaling,'multipliers are visible above the groups');assert(scaling.textContent.toLowerCase().includes('before battle buffs'));
 descendants(scaling).find(element=>element.fieldName==='Enemy health ×').change(2.5);redraw();assert.deepEqual(effective(),['150','11']);
 const damage=descendants(f.context.right).find(element=>element.fieldName==='Enemy attack ×');damage.change(1.5);redraw();assert.deepEqual(effective(),['150','23']);
 assert.equal(f.state.snap.value.config.WaveCfg[0].SpawnTimeline[0].count,7);assert.deepEqual(f.state.snap.value.config.WaveCfg[0].SpawnTimeline[0].future,{keep:1});assert.equal(f.state.catalog.units[0].health,40);assert.equal(f.edits(),4);
});

test('Add units previews the selected wave’s scaling and opening or cancelling the chooser does not change content',()=>{
 const f=fixture();f.state.tab='Waves';f.state.wave=1;Object.assign(f.state.snap.value.config.WaveCfg[1],{HealthCoefficient:2.3,AttackCoefficient:2.1});let chooser;
 f.context.modal=(title,body)=>body(f.context.el('div'));f.context.unitPicker=(dialog,spec)=>{chooser=spec;};const before=JSON.stringify({stage:f.state.snap.value,catalog:f.state.catalog});f.panels.right();descendants(f.context.right).find(element=>element.tagName==='button'&&element.textContent==='Add units').onclick();
 assert(chooser);assert.equal(chooser.wave.HealthCoefficient,2.3);assert.equal(chooser.wave.AttackCoefficient,2.1);assert.equal(JSON.stringify({stage:f.state.snap.value,catalog:f.state.catalog}),before);assert.equal(f.edits(),0);
});

test('missing units or invalid scaling remain visibly unavailable without inventing zero combat stats',()=>{
 for(const missing of ['unit','multiplier']){const f=fixture();f.state.tab='Waves';f.state.catalog.units=[{id:3,name:'Support',health:40}];Object.assign(f.state.snap.value.config.WaveCfg[0],{HealthCoefficient:1,AttackCoefficient:1});if(missing==='unit')f.state.snap.value.config.WaveCfg[0].SpawnTimeline[0].unitId=99;else delete f.state.snap.value.config.WaveCfg[0].HealthCoefficient;
  const before=JSON.stringify({stage:f.state.snap.value,catalog:f.state.catalog});f.panels.right();const card=descendants(f.context.right).find(element=>element.dataset.entryId==='a'),stats=descendants(card).find(element=>element.className==='world-wave-unit-stats');assert(stats);const values=descendants(stats).filter(element=>element.tagName==='strong').map(element=>element.textContent);assert.deepEqual(values,['—','—']);assert(!stats.textContent.includes('NaN'));assert(!stats.textContent.includes('undefined'));assert.equal(JSON.stringify({stage:f.state.snap.value,catalog:f.state.catalog}),before);assert.equal(f.edits(),0);
 }
});

test('an unavailable legacy path is explained without changing its original zero condition',()=>{
 const f=fixture(),stage=f.state.snap.value,graph=stage.graphs[0];Object.assign(graph,{legacy:true,requiresAnyBuilding:Array(10).fill(0)});const before=JSON.stringify(stage);f.state.tab='Paths';f.panels.left();f.panels.right();
 assert.equal(Panels.pathSubtitle(stage,graph),'2 points · Unavailable legacy route');assert(f.context.right.textContent.includes('all-zero building condition keeps this legacy route unavailable'));
 assert.equal(JSON.stringify(stage),before);assert.equal(f.edits(),0);
});
