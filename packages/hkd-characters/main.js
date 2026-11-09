'use strict';
const {Service}=require('./lib/service');
let service;
function project(){return Editor.Project&&Editor.Project.path||Editor.projectPath;}
function current(){const root=project();if(!service||service.root!==require('path').resolve(root))service=new Service(root);return service;}
function reply(event,fn){Promise.resolve().then(fn).then(result=>event.reply(null,result),error=>event.reply(error.message));}
module.exports={load(){},unload(){if(service&&service.snapshot().dirty)Editor.warn('Unsaved character drafts were not applied.');service=null;},messages:{
  open(){Editor.Panel.open('hkd-characters');},
  load(event){reply(event,()=>current().load());},
  change(event,request){reply(event,()=>current().change(request));},
  undo(event,request){reply(event,()=>current().undo(request));},
  redo(event,request){reply(event,()=>current().redo(request));},
  discard(event,request){reply(event,()=>current().discard(request));},
  describe(event,request){reply(event,()=>current().describe(request));},
  save(event,request){reply(event,async()=>{const store=current(),result=store.save(request);if(result.result.saved){try{await require('./lib/import-refresh').refresh(Editor,result.result.files);}catch(error){result.result.warning='Saved on disk; refresh the character assets in Creator: '+error.message;}if(Editor.Ipc&&typeof Editor.Ipc.sendToAll==='function')Editor.Ipc.sendToAll('hkd-characters:published',{revision:store.revision});}return Object.assign(store.snapshot(),{result:result.result});});}
}};
