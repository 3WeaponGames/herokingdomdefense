'use strict';
const {SkillService}=require('./service');let service;
function current(){const root=Editor.Project&&Editor.Project.path||Editor.projectPath;if(!service||service.root!==require('path').resolve(root))service=new SkillService(root);return service;}
function reply(event,fn){Promise.resolve().then(fn).then(result=>event.reply(null,result),error=>event.reply(error.message));}
const messages={open(){Editor.Panel.open('hkd-skills');}};
for(const method of ['load','change','reset','undo','redo','discard','describe'])messages[method]=function(event,request){reply(event,()=>current()[method](request));};
messages.save=function(event,request){reply(event,async()=>{const store=current(),snapshot=store.save(request);if(snapshot.result.saved){try{await require('../hkd-characters/lib/import-refresh').refresh(Editor,snapshot.result.files);}catch(error){snapshot.result.warning='Saved on disk; refresh Skills game data in Creator: '+error.message;}if(Editor.Ipc&&Editor.Ipc.sendToAll)Editor.Ipc.sendToAll('hkd-skills:published',{revision:store.revision});}return snapshot;});};
module.exports={load(){},unload(){if(service&&service.dirty())Editor.warn('Unsaved Skills drafts were not applied.');service=null;},messages};
