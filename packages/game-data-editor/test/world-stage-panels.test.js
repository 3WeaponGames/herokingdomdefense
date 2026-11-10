'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),Panels=require('../worlds/stage-panels');
const clone=value=>JSON.parse(JSON.stringify(value));
class Element{
 constructor(tag,text,cls){this.tagName=tag;this.className=cls||'';this.children=[];this.dataset={};this._text=text||'';}
 appendChild(child){this.children.push(child);child.parentNode=this;return child;}
 setAttribute(){}
 set textContent(value){this._text=value;this.children=[];}
 get textContent(){return this._text+this.children.map(child=>child.textContent).join('');}
}
function fixture(){
 const stage={id:'A-7',level:7,variant:'A',mapId:'Map07',hero:{x:0,y:0},buildings:[],spawns:[{id:1,name:'Spawn 1',enabled:true,x:0,y:100}],graphs:[{id:'one',name:'First path',entry:'start',spawnIds:[1],nodes:[{id:'start',x:0,y:100},{id:'goal',x:0,y:0,goal:true}],edges:[{id:'link',from:'start',to:'goal',weight:1}]},{id:'two',name:'Other path',entry:'goal',spawnIds:[1],nodes:[{id:'goal',x:1,y:0,goal:true}],edges:[]}],config:{Level:7,WaveCfg:[{id:7,Wave:1,SpawnTimeline:[{id:'a',unitId:3,spawnId:1,count:1,startSeconds:1,intervalSeconds:1,routeGraphId:'one',future:{keep:1}},{id:'b',unitId:3,spawnId:1,count:1,startSeconds:2,intervalSeconds:1,routeGraphId:'two'},{id:'c',unitId:3,spawnId:1,count:1,startSeconds:3,intervalSeconds:1},{id:'d',unitId:3,spawnId:1,count:1,startSeconds:4,intervalSeconds:1,routeGraphId:null}]},{id:7,Wave:2,RefreshSoldierKind:['1#3,1'],future:{keep:true}}],future:{keep:[1,2]}}};
 const el=(tag,text,cls)=>new Element(tag,text,cls),state={snap:{value:stage,issues:[]},catalog:{interval:.5,stages:[{id:'A-7',variant:'A',level:7,name:'7. Desert',mapId:'Map07',waves:2}],maps:[{id:'Map07',name:'Fire map'}],units:[{id:3,name:'Unit'}]},variant:'A',wave:0,selection:[],previewHall:3,showBlockers:true,snapGrid:0,spawn:1,graph:'one',radius:18,gate:'closed'},noop=()=>{};let edits=0;
 const context={state,el,button(parent,text,handler,active){const button=el('button',text,active?'active':'');button.onclick=handler;parent.appendChild(button);return button;},field(parent,name,value,change){const input=el('input');input.value=value;input.fieldName=name;input.change=change;parent.appendChild(input);return input;},select(parent){const input=el('select');parent.appendChild(input);return input;},section(parent,text){parent.appendChild(el('h3',text));},note(parent,text){parent.appendChild(el('p',text));},edit(change){edits++;const draft=clone(state.snap.value);change(draft);state.snap.value=draft;},render:noop,draw:noop,top:el('div'),tabs:el('div'),left:el('div'),right:el('div'),buildingPalette:noop,buildingInspector:noop};
 for(const name of ['load','fit','startPreview','closePreview','clipboard','action','refresh','discard','save','cancelDrag','prepareImages','editMap','jsonField','patchSelected','remove','newPath','insertPathNode','removePathNode','navigation','modal','copyWave'])context[name]=noop;
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
