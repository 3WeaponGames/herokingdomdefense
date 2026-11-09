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
}
async function fixture(t,{missingLevel=false,itemMode=false}={}){
  const root=new Element('div'),calls=[],units=itemMode?
    [{type:'item',id:'2:1',key:'2:1',name:'Helmet 1',group:'Helmet'},{type:'item',id:'2:2',key:'2:2',name:'Helmet 2',group:'Helmet'}]:
    [{type:'ally',id:'90001',key:'ally:90001:default',name:'Royal Guard',group:'Allies',levels:[1,2,3]},
     {type:'ally',id:'90002',key:'ally:90002:default',name:'Heavy Infantry',group:'Allies',levels:[1,2,3]},
     {type:'ally',id:'90003',key:'ally:90003:default',name:'Single Level',group:'Allies',levels:[1]},
     {type:'enemy',id:'90001',key:'enemy:90001:default',name:'Enemy',group:'Enemies'}];
  const make=(name,id,level)=>({name,base:{type:itemMode?'item':'ally',id,...(level?{level}:{})},parts:[{id:'helmet',sprite:'helmet',layer:'model',slot:'head',bone:'root',x:7,y:3,scaleX:1,scaleY:1,rotation:0,opacity:1,order:0,hideSlots:[]}],models:{model:{x:4}},future:{keep:true}});
  const data=itemMode?{version:1,profiles:{helmet:make('Fitted helmet','2:1')},assignments:{'2:1':'helmet'}}:
    {version:1,profiles:{guard3:make('Royal Guard · Level 3','90001',3),guard:make('Royal Guard','90001'),heavy:make('Heavy Infantry','90002'),heavy3:make('Heavy Infantry · Level 3','90002',3)},assignments:{'ally:90001:default':'guard','ally:90001:level:3':'guard3','ally:90002:default':'heavy',...(!missingLevel?{'ally:90002:level:3':'heavy3'}:{})}};
  const initial=clone(data),snapshot={version:1,data:clone(data),savedData:clone(data),parts:[{id:'helmet',name:'Helmet',category:'Helmet',thumbnail:'helmet.png'}],units,sources:[]};
  const rig={defaultLayer:'model',layers:[{uuid:'model',name:'Body',x:0,y:0,scaleX:1,scaleY:1,skins:['default'],animations:['idle'],json:{bones:[{name:'root'}],slots:[{name:'head',bone:'root'}]}}]};
  const context={module:{exports:{}},require:createRequire(file),document:{createElement:tag=>new Element(tag)},requestAnimationFrame:()=>1,cancelAnimationFrame(){}};
  vm.runInNewContext(source,context,{filename:file});
  const client=context.module.exports.mount(root,{kind:itemMode?'items':'characters',ipc:async(name,request)=>{
    calls.push({name,request:clone(request||{})});if(name==='load')return clone(snapshot);if(name==='describe')return clone(rig);
    if(name==='change'){snapshot.data=clone(request.data);return{version:2,canUndo:true};}
    throw Error('Unexpected editor command '+name);
  },image:value=>value,runtime:()=>({}),core:{restore(){},isFacialSlot:()=>false,skinTint:()=>null},renderer:{createLayers:async()=>[],destroyCanvas(){}}});
  t.after(()=>client.destroy());
  const flush=async()=>{await new Promise(resolve=>setImmediate(resolve));const status=root.querySelector('.status');assert(!status.className.split(' ').includes('error'),status.textContent);};await flush();
  const field=label=>descendants(root).find(n=>n.attributes['aria-label']===label);
  const choose=async(key)=>{const input=field(itemMode?'Equipment tier':'Base character');assert(input&&!input.disabled,'character selector is available');input.value=key;input.onchange();await flush();};
  const button=text=>descendants(root).find(n=>n.tagName==='button'&&n.textContent===text);
  return{root,calls,initial,snapshot,client,field,choose,button,flush};
}
test('right character selection opens the target unit level without retargeting the current draft or its assignment',async t=>{
  const f=await fixture(t);assert.equal(f.client.getState().selected,'guard3');
  await f.choose('ally:90002:default');assert.equal(f.client.getState().selected,'heavy3');
  assert.equal(f.field('Character name').value,'Heavy Infantry · Level 3');assert.equal(f.field('Level').value,3);
  await f.choose('ally:90001:default');assert.equal(f.client.getState().selected,'guard3');
  await f.button('Allies · Heavy Infantry').onclick();await f.flush();assert.equal(f.client.getState().selected,'heavy');
  assert.equal(f.field('Character name').value,'Heavy Infantry');assert.equal(f.client.getState().dirty,false);
  assert.deepEqual(f.snapshot.data,f.initial);assert(!f.calls.some(call=>call.name==='change'||call.name==='save'));
});
test('unconfigured levels use the target default and keep navigation available; unsupported levels fall back to default',async t=>{
  const f=await fixture(t,{missingLevel:true});await f.choose('ally:90002:default');
  assert.equal(f.client.getState().selected,'');assert(f.button('Customize level 3'));assert.equal(f.field('Level').value,3);
  assert.equal(f.field('Base character').value,'ally:90002:default');
  await f.choose('ally:90001:default');assert.equal(f.client.getState().selected,'guard3');
  await f.choose('ally:90003:default');assert.equal(f.field('Level').value,0);assert(f.button('Edit this character'));
  await f.button('Allies · Royal Guard').onclick();await f.flush();await f.choose('enemy:90001:default');
  assert.equal(f.field('Level'),undefined);assert(f.button('Edit this character'));assert.equal(f.client.getState().dirty,false);
  assert(!f.calls.some(call=>call.name==='change'||call.name==='save'));
});
test('unsaved equipment and names survive switching between units and their levels',async t=>{
  const f=await fixture(t),name=f.field('Character name');name.value='My unsaved guard';name.oninput();name.onchange();await f.flush();
  const staged=clone(f.snapshot.data);await f.choose('ally:90002:default');await f.choose('ally:90001:default');
  assert.equal(f.field('Character name').value,'My unsaved guard');assert.deepEqual(f.snapshot.data,staged);
  assert.deepEqual(f.snapshot.data.profiles.guard3.parts,f.initial.profiles.guard3.parts);assert.deepEqual(f.snapshot.data.assignments,f.initial.assignments);
  assert.equal(f.calls.filter(call=>call.name==='change').length,1);assert(!f.calls.some(call=>call.name==='save'));
});
test('shared item editor retains its explicit equipment-tier editing behavior',async t=>{
  const f=await fixture(t,{itemMode:true});await f.choose('2:2');
  assert.equal(f.client.getState().selected,'helmet');assert.equal(f.snapshot.data.profiles.helmet.base.id,'2:2');
  assert.equal(f.snapshot.data.assignments['2:2'],'helmet');assert.equal(f.snapshot.data.assignments['2:1'],undefined);
  assert.deepEqual(f.snapshot.data.profiles.helmet.parts,f.initial.profiles.helmet.parts);assert(f.client.getState().dirty);
});
