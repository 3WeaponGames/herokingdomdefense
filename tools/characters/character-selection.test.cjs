'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{createRequire}=require('node:module');
const assert=require('node:assert/strict'),{test}=require('node:test');
const file=path.resolve(__dirname,'../../packages/hkd-characters/client.js'),source=fs.readFileSync(file,'utf8'),clone=value=>JSON.parse(JSON.stringify(value));
function descendants(node){return node.children.flatMap(child=>[child,...descendants(child)]);}
class Element{
  constructor(tag){this.tagName=tag;this.children=[];this.style={};this.attributes={};this.value='';this.textContent='';this.className='';this.classList={toggle:(name,on)=>{const names=new Set(this.className.split(' ').filter(Boolean));if(on)names.add(name);else names.delete(name);this.className=[...names].join(' ');},add:name=>this.classList.toggle(name,true),remove:name=>this.classList.toggle(name,false)};}
  appendChild(child){this.children.push(child);child.parentNode=this;return child;}
  insertBefore(child,before){this.children.splice(this.children.indexOf(before),0,child);child.parentNode=this;return child;}
  remove(){if(this.parentNode)this.parentNode.children.splice(this.parentNode.children.indexOf(this),1);}
  set innerHTML(value){assert.equal(value,'');this.children=[];}
  setAttribute(name,value){this.attributes[name]=String(value);}
  hasAttribute(name){return Object.hasOwn(this.attributes,name);}
  get options(){return this.children;}
  get parentElement(){return this.parentNode;}
  querySelectorAll(selector){return descendants(this).filter(node=>selector.split(',').some(part=>{
    if(part.startsWith('.'))return node.className.split(' ').includes(part.slice(1));
    const match=/^(\w+)?(?:\[([^=]+)="([^"]*)"\])?$/.exec(part);
    return match&&(!match[1]||node.tagName===match[1])&&(!match[2]||node.attributes[match[2]]===match[3]);
  }));}
  querySelector(selector){return this.querySelectorAll(selector)[0]||null;}
  addEventListener(){} removeEventListener(){} focus(){} hasPointerCapture(){return false;}
  getBoundingClientRect(){return{left:0,top:0,width:540,height:650};}
  contains(node){return node===this||descendants(this).includes(node);}
}
async function fixture(t,{missingLevel=false,itemMode=false,initialFocus,deferLoad=false}={}){
  const root=new Element('div'),calls=[],units=itemMode?
    [{type:'item',id:'2:tier:lv1',key:'2:tier:lv1',name:'Tier 1',group:'Helmet',slot:2,skin:'lv1',legacyKeys:['2:1']},{type:'item',id:'2:tier:lv2',key:'2:tier:lv2',name:'Tier 2',group:'Helmet',slot:2,skin:'lv2',legacyKeys:['2:11']}]:
    [{type:'ally',id:'90001',key:'ally:90001:default',name:'Royal Guard',group:'Allies',levels:[1,2,3]},
     {type:'ally',id:'90002',key:'ally:90002:default',name:'Heavy Infantry',group:'Allies',levels:[1,2,3]},
     {type:'ally',id:'90003',key:'ally:90003:default',name:'Single Level',group:'Allies',levels:[1]},
     {type:'enemy',id:'90001',key:'enemy:90001:default',name:'Enemy',group:'Enemies'}];
  const make=(name,id,level)=>({name,base:{type:itemMode?'item':'ally',id,...(level?{level}:{})},parts:[{id:'helmet',sprite:'helmet',layer:'model',slot:'head',bone:'root',x:7,y:3,scaleX:1,scaleY:1,rotation:0,opacity:1,order:0,hideSlots:[]}],models:{model:{x:4}},future:{keep:true}});
  const data=itemMode?{version:1,profiles:{helmet:make('Fitted helmet','2:tier:lv1')},assignments:{'2:tier:lv1':'helmet'}}:
    {version:1,profiles:{guard3:make('Royal Guard · Level 3','90001',3),guard:make('Royal Guard','90001'),heavy:make('Heavy Infantry','90002'),heavy3:make('Heavy Infantry · Level 3','90002',3)},assignments:{'ally:90001:default':'guard','ally:90001:level:3':'guard3','ally:90002:default':'heavy',...(!missingLevel?{'ally:90002:level:3':'heavy3'}:{})}};
  const initial=clone(data),snapshot={version:1,data:clone(data),savedData:clone(data),parts:[{id:'helmet',name:'Helmet',category:'Helmet',image:'helmet.png',thumbnail:'helmet.png'}],units,sources:[]};
  if(initialFocus)snapshot.focus=clone(initialFocus);let finishLoad;const pendingLoad=deferLoad?new Promise(resolve=>{finishLoad=()=>resolve(clone(snapshot));}):null;
  const rig={defaultLayer:'model',layers:[{uuid:'model',name:'Body',x:0,y:0,scaleX:1,scaleY:1,skins:['default'],animations:['idle'],json:{bones:[{name:'root'}],slots:[{name:'head',bone:'root'}]}}]};
  const context={module:{exports:{}},require:createRequire(file),document:{createElement:tag=>new Element(tag)},Image:class{constructor(){this.width=this.height=32;}set src(_value){Promise.resolve().then(()=>this.onload());}},requestAnimationFrame:()=>1,cancelAnimationFrame(){}};
  vm.runInNewContext(source,context,{filename:file});
  const client=context.module.exports.mount(root,{kind:itemMode?'items':'characters',ipc:async(name,request)=>{
    calls.push({name,request:clone(request||{})});if(name==='load')return pendingLoad||clone(snapshot);if(name==='describe')return clone(rig);
    if(name==='change'){snapshot.data=clone(request.data);return{version:2,canUndo:true};}
    throw Error('Unexpected editor command '+name);
  },image:value=>value,runtime:()=>({FakeTexture:class{}}),core:{restore(){},isFacialSlot:()=>false,skinTint:()=>null},renderer:{createLayers:async()=>[],destroyCanvas(){}}});
  t.after(()=>client.destroy());
  const flush=async()=>{await new Promise(resolve=>setImmediate(resolve));const status=root.querySelector('.status');assert(!status.className.split(' ').includes('error'),status.textContent);};await flush();
  const field=(label,parent=root)=>descendants(parent).find(n=>n.attributes['aria-label']===label);
  const button=text=>descendants(root).find(n=>n.tagName==='button'&&n.textContent===text);
  const choose=async(key)=>{if(itemMode){const input=field('Equipment tier');input.value=key;input.onchange();}else{const unit=units.find(unit=>unit.key===key);await button(unit.group+' · '+unit.name).onclick();}await flush();};
  const level=async(value)=>{const input=field('Level');input.value=String(value);input.onchange();await flush();};
  return{root,calls,initial,snapshot,client,field,choose,level,button,flush,finishLoad};
}
test('one character list selects independent appearances without base selectors, Saved looks, duplicates or activation switches',async t=>{
  const f=await fixture(t);assert.equal(f.client.getState().selected,'guard3');
  assert.equal(f.field('Base character'),undefined);assert.equal(f.field('Base model'),undefined);assert.equal(f.button('Duplicate'),undefined);
  assert(!descendants(f.root).some(node=>node.textContent==='Saved looks'||node.textContent==='Use this look for this unit'));
  await f.choose('ally:90002:default');assert.equal(f.client.getState().selected,'heavy');await f.level(3);assert.equal(f.client.getState().selected,'heavy3');
  assert.equal(f.field('Character name').value,'Heavy Infantry · Level 3');assert.equal(f.field('Level').value,3);
  await f.choose('ally:90001:default');await f.level(3);assert.equal(f.client.getState().selected,'guard3');
  await f.button('Allies · Heavy Infantry').onclick();await f.flush();assert.equal(f.client.getState().selected,'heavy');
  assert.equal(f.field('Character name').value,'Heavy Infantry');assert.equal(f.client.getState().dirty,false);
  assert.deepEqual(f.snapshot.data,f.initial);assert(!f.calls.some(call=>call.name==='change'||call.name==='save'));
});
test('browsing unconfigured levels stays read-only; editing directly creates exactly one assigned level appearance',async t=>{
  const f=await fixture(t,{missingLevel:true});await f.choose('ally:90002:default');await f.level(3);
  assert.equal(f.client.getState().selected,'');assert.equal(f.button('Customize level 3'),undefined);assert.equal(f.field('Level').value,3);assert(f.field('Character name'));
  assert.equal(f.client.getState().dirty,false);assert(!f.calls.some(call=>call.name==='change'));
  const size=f.field('Character size');size.value='1.1';size.onchange();await f.flush();const id=f.client.getState().selected;
  assert(id);assert.equal(f.snapshot.data.assignments['ally:90002:level:3'],id);assert.equal(f.snapshot.data.profiles[id].scale,1.1);
  size.value='1.2';size.onchange();await f.flush();assert.equal(f.client.getState().selected,id);assert.equal(Object.keys(f.snapshot.data.profiles).length,Object.keys(f.initial.profiles).length+1);
  assert.deepEqual(f.snapshot.data.profiles.heavy,f.initial.profiles.heavy);await f.choose('ally:90001:default');await f.choose('ally:90002:default');await f.level(3);assert.equal(f.client.getState().selected,id);
  await f.choose('ally:90003:default');assert.equal(f.field('Level').value,0);assert.equal(f.button('Edit this character'),undefined);
  await f.button('Allies · Royal Guard').onclick();await f.flush();await f.choose('enemy:90001:default');
  assert.equal(f.field('Level'),undefined);assert.equal(f.button('Edit this character'),undefined);assert(!f.calls.some(call=>call.name==='save'));
});
test('unsaved equipment and names survive switching between units and their levels',async t=>{
  const f=await fixture(t),name=f.field('Character name');name.value='My unsaved guard';name.oninput();name.onchange();await f.flush();
  const staged=clone(f.snapshot.data);await f.choose('ally:90002:default');await f.choose('ally:90001:default');await f.level(3);
  assert.equal(f.field('Character name').value,'My unsaved guard');assert.deepEqual(f.snapshot.data,staged);
  assert.deepEqual(f.snapshot.data.profiles.guard3.parts,f.initial.profiles.guard3.parts);assert.deepEqual(f.snapshot.data.assignments,f.initial.assignments);
  assert.equal(f.calls.filter(call=>call.name==='change').length,1);assert(!f.calls.some(call=>call.name==='save'));
});
test('creation adds independent named Maker and finished-model characters to the same list and supports their levels',async t=>{
  const f=await fixture(t);await f.button('New character').onclick();const dialog=descendants(f.root).find(node=>node.attributes.role==='dialog');
  f.field('Character name',dialog).value='Silver Knight';await f.button('Create character').onclick();await f.flush();const id=f.client.getState().selected;
  assert(f.snapshot.data.characters[id]);assert.equal(f.snapshot.data.profiles[id].base.source,'character-maker/Character');assert(f.button('Created · Silver Knight'));assert.equal(f.field('Level').value,0);
  await f.level(2);f.field('Character name').value='Silver Knight · Level 2';f.field('Character name').onchange();await f.flush();assert(f.snapshot.data.characters[id].levels[2]);
  await f.button('New character').onclick();const second=descendants(f.root).find(node=>node.attributes.role==='dialog'),kind=f.field('Starting model',second);kind.value='finished';kind.onchange();f.field('Unit model',second).value='ally:90002:default';f.field('Character name',second).value='Finished Knight';
  await f.button('Create character').onclick();await f.flush();const finished=f.snapshot.data.profiles[f.client.getState().selected];assert.equal(finished.base.currentModel,true);assert.equal(finished.base.id,'90002');assert.equal(finished.base.source,undefined);assert(f.button('Created · Finished Knight'));
  assert.deepEqual(f.snapshot.data.profiles.guard3,f.initial.profiles.guard3);assert.deepEqual(f.snapshot.data.profiles.heavy,f.initial.profiles.heavy);assert(!f.calls.some(call=>call.name==='save'));
  await f.button('Delete character').onclick();await f.flush();assert.equal(f.button('Created · Finished Knight'),undefined);assert(f.button('Created · Silver Knight'));
});
test('shared item editor retains its explicit equipment-tier editing behavior',async t=>{
  const f=await fixture(t,{itemMode:true});await f.choose('2:tier:lv2');
  assert.equal(f.client.getState().selected,'');assert.deepEqual(f.snapshot.data,f.initial);assert(!f.calls.some(call=>call.name==='change'));
  await f.choose('2:tier:lv1');assert.equal(f.client.getState().selected,'helmet');
  const name=f.field('Item name');name.value='My tier helmet';name.onchange();await f.flush();
  assert.equal(f.snapshot.data.profiles.helmet.name,'My tier helmet');assert.equal(f.snapshot.data.profiles.helmet.base.id,'2:tier:lv1');
  assert.equal(f.snapshot.data.assignments['2:tier:lv1'],'helmet');assert.equal(f.snapshot.data.assignments['2:tier:lv2'],undefined);
  assert.deepEqual(f.snapshot.data.profiles.helmet.parts,f.initial.profiles.helmet.parts);assert(f.client.getState().dirty);
  assert.equal(f.calls.filter(call=>call.name==='change').length,1);assert(!f.calls.some(call=>call.name==='save'));
});

test('a Units deep link browses the exact level while retaining every unsaved appearance edit',async t=>{
  const f=await fixture(t),name=f.field('Character name');name.value='Unsaved guard';name.oninput();name.onchange();await f.flush();
  const staged=clone(f.snapshot.data),writes=f.calls.filter(call=>call.name==='change').length;
  assert.equal(await f.client.focusUnit({type:'ally',id:'90002',level:3}),true);await f.flush();
  assert.equal(f.client.getState().selected,'heavy3');assert.equal(f.field('Level').value,3);
  await f.client.focusUnit({type:'ally',id:'90001',level:3});await f.flush();assert.equal(f.field('Character name').value,'Unsaved guard');
  assert.deepEqual(f.snapshot.data,staged);assert.equal(f.calls.filter(call=>call.name==='change').length,writes);
  assert.equal(f.calls.filter(call=>call.name==='load').length,1);assert(!f.calls.some(call=>['save','discard'].includes(call.name)));
});

test('deep-link startup and unconfigured levels remain read-only and newer queued requests win',async t=>{
  const f=await fixture(t,{missingLevel:true,deferLoad:true,initialFocus:{type:'ally',id:'90001',level:3,sequence:1}});
  await f.client.focusUnit({type:'ally',id:'90002',level:3,sequence:2});f.finishLoad();await f.flush();
  assert.equal(f.client.getState().selected,'');assert.equal(f.field('Level').value,3);assert.equal(f.field('Character name').value,'Heavy Infantry · Level 3');
  assert.deepEqual(f.snapshot.data,f.initial);assert(!f.calls.some(call=>['change','save','discard'].includes(call.name)));
  assert.equal(await f.client.focusUnit({type:'ally',id:'90001',level:3,sequence:1}),false);assert.equal(f.field('Character name').value,'Heavy Infantry · Level 3');
  const start=await fixture(t,{initialFocus:{type:'ally',id:'90002',level:3,sequence:7}});assert.equal(start.client.getState().selected,'heavy3');assert.deepEqual(start.snapshot.data,start.initial);
});

test('a focus request waits for an open creation dialog and rejects invalid units without changing drafts',async t=>{
  const f=await fixture(t);await f.button('New character').onclick();const dialog=descendants(f.root).find(node=>node.attributes.role==='dialog');f.field('Character name',dialog).value='Unfinished design';
  assert.equal(await f.client.focusUnit({type:'ally',id:'90002',level:3}),false);assert.equal(f.field('Character name',dialog).value,'Unfinished design');assert.equal(f.client.getState().selected,'guard3');
  await f.button('Cancel').onclick();await f.flush();assert.equal(f.client.getState().selected,'heavy3');
  assert.equal(await f.client.focusUnit({type:'ally',id:'90002',level:99}),false);assert.equal(f.client.getState().selected,'heavy3');
  assert.deepEqual(f.snapshot.data,f.initial);await f.client.focusUnit({type:'ally',id:'90001',level:3});await f.flush();assert.equal(f.client.getState().selected,'guard3');
  assert(!f.calls.some(call=>['change','save','discard'].includes(call.name)));
});
