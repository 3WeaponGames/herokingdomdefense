'use strict';
const {ItemsService}=require('./service');let service;
function current(){const root=Editor.Project&&Editor.Project.path||Editor.projectPath;if(!service||service.root!==require('path').resolve(root))service=new ItemsService(root);return service;}
function reply(event,fn){Promise.resolve().then(fn).then(result=>event.reply(null,result),error=>event.reply(error.message));}
module.exports={load(){},unload(){if(service&&service.snapshot().dirty)Editor.warn('Unsaved item drafts were not applied.');service=null;},messages:{
  open(){Editor.Panel.open('hkd-items');},load(event){reply(event,()=>current().load());},change(event,request){reply(event,()=>current().change(request));},undo(event,request){reply(event,()=>current().undo(request));},redo(event,request){reply(event,()=>current().redo(request));},discard(event,request){reply(event,()=>current().discard(request));},describe(event,request){reply(event,()=>current().describe(request));},
  save(event,request){reply(event,async()=>{const store=current(),result=store.save(request);if(result.result.saved)try{await require('../hkd-characters/lib/import-refresh').refresh(Editor,result.result.files);}catch(error){result.result.warning='Saved on disk; refresh the Items catalog in Creator: '+error.message;}return Object.assign(store.snapshot(),{result:result.result});});},
  equipment(){Editor.Panel.open('hkd-equipment');}
}};
