'use strict';
const {Service}=require('./lib/service');
let service;
function project(){return Editor.Project&&Editor.Project.path||Editor.projectPath;}
function current(){const root=project();if(!service||service.root!==require('path').resolve(root))service=new Service(root);return service;}
function reply(event,fn){try{event.reply(null,fn());}catch(error){event.reply(error.message);}}
module.exports={load(){},unload(){if(service&&service.snapshot().dirty)Editor.warn('Unsaved character drafts were not applied.');service=null;},messages:{
  open(){Editor.Panel.open('hkd-characters');},
  load(event){reply(event,()=>current().load());},
  change(event,request){reply(event,()=>current().change(request));},
  discard(event,request){reply(event,()=>current().discard(request));},
  describe(event,request){reply(event,()=>current().describe(request));},
  save(event,request){reply(event,()=>{const result=current().save(request);if(result.result.saved)try{for(const file of result.result.files.filter(file=>!file.endsWith('.meta')))Editor.assetdb.refresh('db://'+file,error=>{if(error)Editor.warn('Characters saved; refresh the asset import: '+error.message);});}catch(error){result.result.warning='Saved on disk; refresh the character assets in Creator: '+error.message;}return result;});}
}};
