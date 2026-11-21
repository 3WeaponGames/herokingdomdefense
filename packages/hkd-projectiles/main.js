'use strict';
const {ProjectilesService}=require('./service');let service,pendingFocus=null,focusSequence=0;
function current(){const root=Editor.Project&&Editor.Project.path||Editor.projectPath;if(!service||service.root!==require('path').resolve(root)){service=new ProjectilesService(root);pendingFocus=null;}return service;}
function reply(event,fn){Promise.resolve().then(fn).then(value=>event.reply(null,value),error=>event.reply(error.message));}
const messages={open(){Editor.Panel.open('hkd-projectiles');},items(){Editor.Panel.open('hkd-items');}};
function takeFocus(){const value=pendingFocus;pendingFocus=null;return value;}
messages.focus=(event,request)=>reply(event,async()=>{
  const target={key:current().focusUnit(request&&request.key),sequence:++focusSequence};
  pendingFocus=target;
  try{await Editor.Panel.open('hkd-projectiles');}
  catch(error){if(pendingFocus===target)pendingFocus=null;throw error;}
  if(Editor.Ipc&&typeof Editor.Ipc.sendToAll==='function')Editor.Ipc.sendToAll('hkd-projectiles:focus-available',{sequence:target.sequence});
  return {focused:true,target};
});
messages['take-focus']=event=>reply(event,()=>{current();return takeFocus();});
messages.load=event=>reply(event,()=>{const result=current().load(),focus=takeFocus();return focus?{...result,focus}:result;});
for(const name of ['change','discard','describe'])messages[name]=(event,request)=>reply(event,()=>current()[name](request));
messages['describe-unit']=(event,request)=>reply(event,()=>current().describeUnit(request));
messages.save=(event,request)=>reply(event,async()=>{const result=current().save(request);if(result.result.saved)try{await require('../hkd-characters/lib/import-refresh').refresh(Editor,result.result.files);}catch(error){result.result.warning='Saved on disk; Creator needs an asset refresh: '+error.message;}return result;});
module.exports={load(){},unload(){if(service&&service.snapshot().dirty)Editor.warn('Unsaved projectile drafts were not applied.');service=null;pendingFocus=null;},messages};
