'use strict';
const {Service}=require('./lib/service');
const Levels=require('./lib/character-levels');
let service,pendingFocus=null,focusSequence=0;
function project(){return Editor.Project&&Editor.Project.path||Editor.projectPath;}
function current(){const root=project();if(!service||service.root!==require('path').resolve(root)){service=new Service(root);pendingFocus=null;}return service;}
function reply(event,fn){Promise.resolve().then(fn).then(result=>event.reply(null,result),error=>event.reply(error.message));}
function focusTarget(request){
  const unit=request&&current().units().find(unit=>unit.type===request.type&&unit.id===String(request.id));
  if(!unit)throw Error('Choose an existing character unit.');
  const level=request.level===0?undefined:request.level;
  if(level!==undefined&&(!Number.isInteger(level)||!Levels.levels(unit).includes(level)))throw Error('Choose an existing character level.');
  return{type:unit.type,id:unit.id,...(level===undefined?{}:{level}),sequence:++focusSequence};
}
function takeFocus(){current();const target=pendingFocus;pendingFocus=null;return target;}
module.exports={load(){},unload(){if(service&&service.snapshot().dirty)Editor.warn('Unsaved character drafts were not applied.');service=null;pendingFocus=null;},messages:{
  open(){Editor.Panel.open('hkd-characters');},
  focus(event,request){reply(event,async()=>{const target=focusTarget(request);pendingFocus=target;await Editor.Panel.open('hkd-characters');if(Editor.Ipc&&typeof Editor.Ipc.sendToAll==='function')Editor.Ipc.sendToAll('hkd-characters:focus-available',{sequence:target.sequence});return{focused:true,target};});},
  'take-focus'(event){reply(event,takeFocus);},
  load(event){reply(event,()=>{const result=current().load(),focus=takeFocus();return focus?Object.assign(result,{focus}):result;});},
  change(event,request){reply(event,()=>current().change(request));},
  undo(event,request){reply(event,()=>current().undo(request));},
  redo(event,request){reply(event,()=>current().redo(request));},
  discard(event,request){reply(event,()=>current().discard(request));},
  describe(event,request){reply(event,()=>current().describe(request));},
  save(event,request){reply(event,async()=>{const store=current(),result=store.save(request);if(result.result.saved){try{await require('./lib/import-refresh').refresh(Editor,result.result.files);}catch(error){result.result.warning='Saved on disk; refresh the character assets in Creator: '+error.message;}if(Editor.Ipc&&typeof Editor.Ipc.sendToAll==='function')Editor.Ipc.sendToAll('hkd-characters:published',{revision:store.revision});}return Object.assign(store.snapshot(),{result:result.result});});}
}};
