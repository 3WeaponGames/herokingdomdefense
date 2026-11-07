'use strict';
const {ProjectilesService}=require('./service');let service;
function current(){const root=Editor.Project&&Editor.Project.path||Editor.projectPath;if(!service||service.root!==require('path').resolve(root))service=new ProjectilesService(root);return service;}
function reply(event,fn){Promise.resolve().then(fn).then(value=>event.reply(null,value),error=>event.reply(error.message));}
const messages={open(){Editor.Panel.open('hkd-projectiles');},items(){Editor.Panel.open('hkd-items');}};
for(const name of ['load','change','discard','describe'])messages[name]=(event,request)=>reply(event,()=>current()[name](request));
messages.save=(event,request)=>reply(event,async()=>{const result=current().save(request);if(result.result.saved)try{await require('../hkd-characters/lib/import-refresh').refresh(Editor,result.result.files);}catch(error){result.result.warning='Saved on disk; Creator needs an asset refresh: '+error.message;}return result;});
module.exports={load(){},unload(){if(service&&service.snapshot().dirty)Editor.warn('Unsaved projectile drafts were not applied.');service=null;},messages};
