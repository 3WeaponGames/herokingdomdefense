'use strict';
const assert=require('node:assert/strict'),{test}=require('node:test'),{fixture}=require('./client-harness.cjs');
const units=[{type:'item',id:'2:tier:lv1',key:'2:tier:lv1',name:'Tier 1',group:'Helmet',slot:2,legacyKeys:['2:1','2:2']},{type:'item',id:'2:tier:lv2',key:'2:tier:lv2',name:'Tier 2',group:'Helmet',slot:2,legacyKeys:['2:3']}];
const equipped={id:'helmet',sprite:'helmet',layer:'rider',slot:'Rider/Helmet',bone:'Rider',x:0,y:0,rotation:0,scaleX:1,scaleY:1,opacity:1,order:0,hideSlots:[]};
function setup(options={}){return fixture({kind:'items',units,initial:{version:1,profiles:{},assignments:{}},parts:[{id:'helmet',name:'Current helmet',category:'Helmet',image:'helmet.png',thumbnail:'helmet.png',width:32,height:32},{id:'other',name:'Other helmet',category:'Helmet',image:'other.png',thumbnail:'other.png',width:32,height:32}],describe(_request,description){description.defaultLayer='rider';description.layers[1].json.slots[0].bone='Rider';description.currentItem={parts:[equipped]};return description;},...options});}
function shortcut(f,key){const root=f.host.querySelector('.character-editor'),event={key,ctrlKey:true,target:root,preventDefault(){this.prevented=true;},stopPropagation(){}};root.listeners.keydown(event);return event;}
test('Items shows current parts in Fit immediately, tier browsing is read-only and replacing a part stages one whole tier',async()=>{
 const f=setup();await f.settle();assert(f.host.textContent.includes('FIT SELECTED PART'));assert(f.host.textContent.includes('Current helmet'));assert.equal(f.calls.changes.length,0);assert.equal(f.button('Edit this item'),undefined);
 const tier=f.byLabel('Equipment tier');tier.value=units[1].key;tier.onchange();await f.settle();assert.equal(f.calls.changes.length,0,'Tier selection never creates a draft');
 const other=f.host.querySelectorAll('.asset-tile').find(button=>button.title==='Other helmet');assert(other);other.click();await f.settle();assert(shortcut(f,'a').prevented);await f.settle();
 assert.equal(f.calls.changes.length,1);const draft=f.calls.changes[0],id=draft.assignments[units[1].key];assert(id);assert.equal(draft.profiles[id].parts[0].sprite,'other');assert.equal(draft.assignments[units[0].key],undefined);assert.equal(f.calls.saves,0);f.close();
});
test('editing an inherited legacy item creates a tier draft and preserves old level assignments',async()=>{
 const initial={version:1,profiles:{old:{name:'Old helmet',base:{type:'item',id:'2:2'},parts:[equipped]}},assignments:{'2:2':'old'}};const f=setup({initial});await f.settle();
 const field=f.byLabel('Part tint');field.value='#80c0ff';field.onchange();await f.settle();const draft=f.calls.changes.at(-1);assert.equal(draft.assignments['2:2'],'old');assert.equal(draft.profiles.old.parts[0].tint,undefined);assert.equal(draft.profiles[draft.assignments[units[0].key]].parts[0].tint,'#80c0ff');assert.equal(f.calls.saves,0);f.close();
});

test('adding or replacing a style sub-item snaps to its horse socket and replaces the old hand item in one draft edit',async()=>{
 const Sockets=require('../../packages/hkd-characters/lib/hero-sub-items');
 for(const style of ['fighter','vanguard','bruiser']){
  const key='3:tier:lv1:'+style,unit={type:'item',id:key,key,name:'Tier 1',group:style,slot:3,style},parts=[{id:'HandLeft/Sub_Item/Old',name:'Old charm',category:'HandLeft/Sub_Item',image:'old.png',thumbnail:'old.png',width:68,height:64},{id:'HandLeft/Sub_Item/New',name:'New charm',category:'HandLeft/Sub_Item',image:'new.png',thumbnail:'new.png',width:68,height:64}],old={id:'charm',sprite:parts[0].id,layer:'rider',slot:'Rider/HandLeft/Sub_Item',bone:'Rider',x:99,y:-80,rotation:10,scaleX:1,scaleY:1,opacity:1,order:0,hideSlots:[]};
  const f=fixture({kind:'items',units:[unit],parts,initial:{version:1,profiles:{},assignments:{}},describe(_request,description){description.item=unit;description.defaultLayer='horse';description.layers[0].heroStyle=style;description.layers[0].json=Sockets.ensure({bones:[{name:'root',scaleX:.5,scaleY:.5},{name:'horse_s_3',parent:'root'},{name:'horse_s_7',parent:'root'}],slots:[],skins:[]});description.layers[1].json.slots=[{name:old.slot,bone:'Rider'}];description.currentItem={parts:[old]};return description;}});await f.settle();assert.equal(f.calls.changes.length,0);
  f.host.querySelectorAll('.asset-tile').find(button=>button.title==='New charm').click();shortcut(f,'a');await f.settle();const draft=f.calls.changes.at(-1),profile=draft.profiles[draft.assignments[key]];assert.equal(profile.parts.length,1);const part=profile.parts[0];assert.equal(part.layer,'horse');assert.equal(part.slot,Sockets.target(style).name);assert.equal(part.bone,part.slot);assert.equal(part.sprite,parts[1].id);assert.equal(part.x,0);assert.equal(part.y,0);assert.equal(part.forceVisible,true);assert.equal(f.calls.saves,0);f.close();
 }
});
