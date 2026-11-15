'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),Cards=require('../worlds/stage-cards-client');
const clone=value=>JSON.parse(JSON.stringify(value));
class Element{
 constructor(tag,text,cls){this.tagName=tag;this.className=cls||'';this.children=[];this.attributes={};this._text=text||'';}
 appendChild(child){this.children.push(child);return child;}
 setAttribute(name,value){this.attributes[name]=String(value);}
 set textContent(value){this._text=value;this.children=[];}
 get textContent(){return this._text+this.children.map(child=>child.textContent).join('');}
}
const descendants=e=>e.children.flatMap(child=>[child,...descendants(child)]);
function fixture(){
 const state={snap:{version:10,value:{id:'A-1',config:{Map:'legacy-map',EnemyAni:'wqyl_gb',Future:{keep:1}}}},catalog:{units:[{id:90003,name:'Original face'},{id:92039,name:'Fire Lizard'}]}},calls=[],el=(...args)=>new Element(...args),entries=[{resource:'Thumbnails/default-1',name:'Default 1',url:'file:///default-1.png'}];let edits=0,current,picker;
 const c={state,el,section:(p,t)=>p.appendChild(el('h3',t)),note:(p,t)=>p.appendChild(el('p',t)),button(p,t,fn){const b=el('button',t);b.onclick=fn;p.appendChild(b);return b;},modal(title,body,apply,label){const dialog=el('div'),dispose=body(dialog);current={dialog,apply,label,cancel:()=>dispose&&dispose()};},unitPicker(dialog,spec){picker=spec;return()=>{};},edit(fn){const draft=clone(state.snap.value);fn(draft);if(JSON.stringify(draft)!==JSON.stringify(state.snap.value)){edits++;state.snap.version++;state.snap.value=draft;}},async ipc(name,request){calls.push({name,request});if(name==='world-stage-thumbnails')return{folder:'library',entries:entries.slice()};if(name==='world-stage-thumbnail-pick')return'new.png';if(name==='world-stage-thumbnail-import')return{version:state.snap.version+1,entry:{resource:'Thumbnails/new',name:'New',url:'data:image/png;base64,AA=='}};if(name==='world-stage-thumbnail-folder')return true;throw Error(name);}};
 return{state,c,cards:Cards.create(c),calls,edits:()=>edits,dialog:()=>current,picker:()=>picker,click(text){const b=descendants(current.dialog).find(e=>e.tagName==='button'&&e.textContent===text);assert(b,text);return b.onclick();}};
}
test('opening stage-card controls, browsing and cancelling preserve the complete draft',async()=>{
 const f=fixture(),before=clone(f.state.snap.value);f.cards.render(f.c.el('div'));await f.cards.browse(false);assert.equal(f.dialog().label,'Use thumbnail');const item=descendants(f.dialog().dialog).find(e=>e.tagName==='button'&&e.attributes['aria-pressed']==='false');item.onclick();f.dialog().cancel();assert.deepEqual(f.state.snap.value,before);assert.equal(f.edits(),0);assert.deepEqual(f.calls.map(c=>c.name),['world-stage-thumbnails']);
 f.cards.face();assert.equal(f.picker().single,true);assert.equal(f.picker().initialUnitId,90003);f.picker().selected.clear();f.picker().selected.add(92039);f.dialog().cancel();assert.deepEqual(f.state.snap.value,before);assert.equal(f.edits(),0);
});
test('thumbnail import updates only the library revision until an explicit selection is applied',async()=>{
 const f=fixture(),before=clone(f.state.snap.value);await f.cards.browse(false);await f.click('Import PNG…');assert.deepEqual(f.state.snap.value,before);assert.equal(f.edits(),0);assert.equal(f.state.snap.version,11);assert.equal(f.calls.find(c=>c.name==='world-stage-thumbnail-import').request.version,10);f.dialog().apply();assert.equal(f.state.snap.value.config.StageThumbnail,'Thumbnails/new');assert.equal(f.edits(),1);assert.deepEqual(f.state.snap.value.config.Future,{keep:1});
 await f.cards.browse(false);f.click('Use map thumbnail');f.dialog().apply();assert.equal(f.state.snap.value.config.StageThumbnail,undefined);assert.equal(f.state.snap.value.config.Map,'legacy-map');
});
test('choosing one face changes only the face override and can restore the original unit',()=>{
 const f=fixture(),before=clone(f.state.snap.value);f.cards.face();f.picker().selected.clear();f.picker().selected.add(92039);f.dialog().apply();assert.deepEqual(f.state.snap.value,{...before,config:{...before.config,StageFaceUnit:92039}});const parent=f.c.el('div');f.cards.render(parent);assert(parent.textContent.includes('Face unit: Fire Lizard'));descendants(parent).find(e=>e.textContent==='Use original face unit').onclick();assert.deepEqual(f.state.snap.value,before);
});
test('stage switches and competing card changes cannot receive a stale modal selection',async()=>{
 for(const mode of ['switch','compete']){const f=fixture();await f.cards.browse(false);descendants(f.dialog().dialog).find(e=>e.attributes['aria-pressed']==='false').onclick();if(mode==='switch')f.state.snap.value.id='A-2';else f.state.snap.value.config.StageThumbnail='Thumbnails/other';const before=clone(f.state.snap.value);assert.throws(()=>f.dialog().apply(),/stage card changed/);assert.deepEqual(f.state.snap.value,before);}
 const f=fixture();f.cards.face();f.state.snap.value.config.StageFaceUnit=92039;assert.throws(()=>f.dialog().apply(),/stage card changed/);assert.equal(f.edits(),0);
});
test('cancelling while the native file picker is pending prevents importing or applying the late result',async()=>{
 const f=fixture();let pick;const ipc=f.c.ipc;f.c.ipc=(name,q)=>name==='world-stage-thumbnail-pick'?new Promise(resolve=>{pick=resolve;}):ipc(name,q);await f.cards.browse(false);const pending=f.click('Import PNG…');f.dialog().cancel();pick('late.png');await pending;assert.equal(f.calls.filter(c=>c.name==='world-stage-thumbnail-import').length,0);assert.equal(f.edits(),0);
});
