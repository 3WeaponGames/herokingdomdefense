'use strict';
const {ItemsService}=require('./service');let service;
function current(){const root=Editor.Project&&Editor.Project.path||Editor.projectPath;if(!service||service.root!==require('path').resolve(root))service=new ItemsService(root);return service;}
function reply(event,fn){try{event.reply(null,fn());}catch(error){event.reply(error.message);}}
module.exports={load(){},unload(){if(service&&service.snapshot().dirty)Editor.warn('Unsaved item drafts were not applied.');service=null;},messages:{
  open(){Editor.Panel.open('hkd-items');},load(event){reply(event,()=>current().load());},change(event,request){reply(event,()=>current().change(request));},discard(event,request){reply(event,()=>current().discard(request));},describe(event,request){reply(event,()=>current().describe(request));},
  save(event,request){reply(event,()=>{const result=current().save(request);if(result.result.saved)try{Editor.assetdb.refresh('db://assets/resources/hero-items/catalog.json',error=>{if(error)Editor.warn('Items saved; refresh the asset import: '+error.message);});}catch(error){result.result.warning='Saved on disk; refresh the Items catalog in Creator: '+error.message;}return result;});},
  equipment(){Editor.Panel.open('hkd-equipment');}
}};
