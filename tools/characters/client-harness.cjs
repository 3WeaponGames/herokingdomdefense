'use strict';
// Minimal DOM and renderer doubles for exercising the actual authoring client.
// No Creator scene, game, audio, browser, or disk publication is started.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{createRequire}=require('node:module');
const file=path.resolve(__dirname,'../../packages/hkd-characters/client.js'),clone=value=>JSON.parse(JSON.stringify(value));
const flush=()=>new Promise(resolve=>setImmediate(resolve));
class Element{
 constructor(tag){this.tagName=tag.toUpperCase();this.children=[];this.style={};this.attributes={};this.value='';this.className='';this._text='';this.listeners={};this.classList={toggle:(name,on)=>{const list=new Set(this.className.split(/\s+/).filter(Boolean));if(on)list.add(name);else list.delete(name);this.className=[...list].join(' ');},add:name=>this.classList.toggle(name,true),remove:name=>this.classList.toggle(name,false)};}
 appendChild(child){this.children.push(child);child.parentElement=child.parentNode=this;return child;}
 insertBefore(child,before){this.children.splice(this.children.indexOf(before),0,child);child.parentElement=child.parentNode=this;return child;}
 remove(){if(this.parentElement)this.parentElement.children.splice(this.parentElement.children.indexOf(this),1);}
 set textContent(value){this._text=String(value);this.children=[];}get textContent(){return this._text+this.children.map(child=>child.textContent).join('');}
 set innerHTML(value){if(value!=='')throw Error('Only empty DOM replacement is supported');this._text='';this.children=[];}
 setAttribute(name,value){this.attributes[name]=String(value);}getAttribute(name){return this.attributes[name]??null;}hasAttribute(name){return name in this.attributes;}
 querySelectorAll(selector){const found=[],matches=node=>selector.split(',').some(part=>{part=part.trim();const attr=/^\[([^=\]]+)(?:="([^"]*)")?\]$/.exec(part);if(attr)return node.hasAttribute(attr[1])&&(attr[2]===undefined||node.getAttribute(attr[1])===attr[2]);if(part.startsWith('.'))return part.slice(1).split('.').every(name=>node.className.split(' ').includes(name));return node.tagName.toLowerCase()===part;});function visit(node){for(const child of node.children){if(matches(child))found.push(child);visit(child);}}visit(this);return found;}
 querySelector(selector){return this.querySelectorAll(selector)[0]||null;}get options(){return this.children;}
 contains(node){return node===this||this.children.some(child=>child.contains(node));}
 addEventListener(name,fn){this.listeners[name]=fn;}removeEventListener(name){delete this.listeners[name];}
 focus(){if(this.ownerDocument)this.ownerDocument.activeElement=this;}blur(){}scrollIntoView(){}setPointerCapture(){}releasePointerCapture(){}hasPointerCapture(){return false;}
 click(){return this.onclick&&this.onclick();}
 getBoundingClientRect(){return{left:0,top:0,width:540,height:650};}get clientHeight(){return 650;}
 getContext(){return new Proxy({},{get:()=>()=>{}});}
}
function fixture(options={}){
 const host=new Element('div'),calls={seeks:[],draws:[],changes:[],saves:0},frames=new Map(),pendingImages=[];let frameId=0,version=1;
 const units=options.units||[{type:'ally',id:'90001',key:'ally:90001:default',name:'Guard',group:'Allies',levels:[1,2,3]},{type:'ally',id:'90002',key:'ally:90002:default',name:'Infantry',group:'Allies',levels:[1,2,3]}];
 const part={id:'helmet',sprite:'helmet',layer:'rider',slot:'Rider/Helmet',bone:'Rider',x:0,y:0,rotation:0,scaleX:1,scaleY:1,opacity:1,order:0,hideSlots:[]};
 const initial={version:1,profiles:{guard:{name:'Guard',base:{type:'ally',id:'90001',source:'character-maker/Character'},parts:options.equipment?[part]:[]},infantry:{name:'Infantry',base:{type:'ally',id:'90002',source:'character-maker/Character'},parts:[]}},assignments:{'ally:90001:default':'guard','ally:90002:default':'infantry'}};
 if(options.base)Object.assign(initial.profiles.guard.base,options.base);
 let data=clone(options.initial||initial);const savedData=clone(data),snapshot=()=>({data:clone(data),savedData:clone(savedData),version,canUndo:false,canRedo:false});
 const description={layers:[{uuid:'horse',name:'wqyl_lead_ma',x:0,y:0,scaleX:1,scaleY:1,skin:'default',skins:['default'],animations:['idle','attack','die'],json:{bones:[],slots:[]}},{uuid:'rider',name:'Character',x:0,y:0,scaleX:1,scaleY:1,skin:'default',skins:['default'],animations:['idle','attack','die'],json:{bones:[{name:'Rider'}],slots:[{name:'Rider/Helmet',bone:'Rider'}]}}]};
 const parts=options.parts||[{id:'helmet',name:'Helmet',category:'Helmet',sourcePack:'character-maker',image:'helmet.png',thumbnail:'helmet.png',width:32,height:32}];
 const core={restore(){},prepare(_sp,skeleton,equipment){return{skeleton,equipment};},apply(state){state.skeleton.fitted=state.equipment.length;},isFacialSlot:()=>false,skinTint:()=>null};
 const renderer={geometry:()=>[],createLayers:async(_sp,layers)=>layers.map(description=>({description,data:{findAnimation:name=>({duration:name==='die'?1:name==='idle'?1.3333:.8333}),findSkin:()=>true},skeleton:{bones:[],slots:[],color:{set(){}},skin:{name:'default'},findSlot:()=>null,setSkinByName(){}}})),seek(_sp,layers,name,time,loop){calls.seeks.push({name,time,loop});},bounds:()=>({minX:0,minY:0,maxX:100,maxY:100,width:100,height:100}),drawCanvas(_sp,_canvas,layers){calls.draws.push(layers.map(layer=>layer.skeleton.fitted));},destroyCanvas(){}};
 const api={renderer,core,runtime:()=>({FakeTexture:class{},RegionAttachment:class{}}),image:value=>value,async ipc(name,request){
  if(name==='load')return{...snapshot(),parts,units,sources:[]};if(name==='describe')return options.describe?options.describe(request,clone(description)):clone(description);
  if(name==='change'){calls.changes.push(clone(request.data));data=clone(request.data);version++;return snapshot();}
  if(name==='save'){calls.saves++;return{...snapshot(),result:{saved:false,files:[]}};}throw Error('Unexpected operation '+name);
 }};
 class Image{set src(value){this.width=this.height=32;if(options.delayImages)pendingImages.push(()=>this.onload());else queueMicrotask(()=>this.onload());}}
 const document={createElement:tag=>{const node=new Element(tag);node.ownerDocument=document;return node;}};host.ownerDocument=document;
 const context={module:{exports:{}},require:createRequire(file),document,requestAnimationFrame:callback=>{frames.set(++frameId,callback);return frameId;},cancelAnimationFrame:id=>frames.delete(id),Image,queueMicrotask,Date};
 vm.runInNewContext(fs.readFileSync(file,'utf8'),context,{filename:file});const client=context.module.exports.mount(host,api);
 const byLabel=label=>host.querySelector('[aria-label="'+label+'"]'),button=text=>host.querySelectorAll('button').find(b=>b.textContent===text);
 return{host,client,calls,frames,pendingImages,parts,initial,byLabel,button,snapshot,get activeElement(){return document.activeElement;},tick(time){const scheduled=[...frames.values()];frames.clear();scheduled.forEach(callback=>callback(time));},async settle(){for(let i=0;i<4;i++)await flush();},close(){client.destroy();}};
}
module.exports={fixture,flush};
