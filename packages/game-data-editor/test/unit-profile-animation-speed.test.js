'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),{createRequire}=require('node:module'),{test}=require('node:test');
class Element{
 constructor(tag){this.tagName=tag;this.children=[];this.dataset={};this.style={};this.attributes={};this._text='';this.disabled=false;this.isConnected=true;}
 appendChild(node){this.children.push(node);node.parentNode=node.parentElement=this;return node;}
 remove(){this.isConnected=false;if(this.parentNode)this.parentNode.children.splice(this.parentNode.children.indexOf(this),1);}
 set textContent(value){this._text=String(value);this.children=[];}get textContent(){return this._text+this.children.map(child=>child.textContent).join('');}
 setAttribute(key,value){this.attributes[key]=String(value);}getAttribute(key){return this.attributes[key];}
 querySelectorAll(selector){const found=[];const visit=node=>{for(const child of node.children){if(child.tagName===selector)found.push(child);visit(child);}};visit(this);return found;}
 querySelector(selector){return this.querySelectorAll(selector)[0]||null;}addEventListener(){}focus(){}select(){}contains(node){return node===this||this.children.some(child=>child.contains(node));}checkValidity(){return true;}
}
function fixture(inherited=false){
 const file=path.join(__dirname,'../units/profile-client.js'),host=new Element('main'),calls=[];let metrics;
 const record={Health:40,AttackDamage:10,AttackInterval:1,AttackRange:60,SearchRange:150,Speed:20,MonsterPack:'fantasy-bosses'};
 const base={id:91001,default:true,name:'Default',record,visual:{},role:'',timing:{},uses:[],speed:1.5};
 const view={model:'Boss',baseId:91001,version:1,dirty:false,changes:[],types:{},documents:{},profiles:[base,{...base,id:100001,default:false,name:'Custom',overrides:inherited?{}:{speed:1.5}}]};
 const context={module:{exports:{}},require:id=>id==='../preview/client'?{mount(_host,api){metrics=api.onAttackMetrics;return{setUnit(){},destroy(){}};}}:createRequire(file)(id),document:{activeElement:null,createElement:tag=>new Element(tag)}};
 vm.runInNewContext(fs.readFileSync(file,'utf8'),context,{filename:file});const panel=context.module.exports.open(host,{id:100001,ipc:async(name,request)=>{calls.push({name,request});return view;}});
 const all=node=>[node,...node.children.flatMap(all)];return{host,panel,calls,metrics:value=>metrics(value),field:()=>all(host).find(node=>node.getAttribute('aria-label')==='Attack animation speed')};
}
for(const inherited of [false,true])test('Units profile attack speed restores '+(inherited?'inherited':'custom')+' controls after a Characters speed reset',async()=>{
 const f=fixture(inherited);try{
  await f.panel.ready;const field=f.field(),reset=field.parentNode.querySelector('button'),note=field.parentNode.parentNode.querySelector('small');assert(field);assert.equal(field.disabled,false);assert.equal(reset.disabled,inherited);
  f.metrics({type:'enemy',id:'100001',unitAnimationSpeed:0,animationSpeed:0,modelAnimationSpeed:.25});assert.equal(field.disabled,true);assert.equal(field.value,0);assert.equal(reset.disabled,true);assert(note.textContent.includes('Characters: 0%'));
  field.value=2;field.onchange();await f.panel.pending();assert.equal(f.calls.filter(call=>call.name==='unit-profile-change').length,0,'disabled legacy controls cannot stage ineffective overrides');
  f.metrics({type:'enemy',id:'100001',animationSpeed:1.5,modelAnimationSpeed:.25});assert.equal(field.disabled,false);assert.equal(field.value,1.5);assert.equal(Number(field.min),.1);assert.equal(reset.disabled,inherited);assert.equal(note.textContent,inherited?'Inherited from Default':'Profile override');
 }finally{f.panel.close();}
});
