'use strict';
const legacyFace=stage=>({wqyl_bb:90001,wqyl_zbb:90002,wqyl_gb:90003,wqyl_qb:90004}[stage.config.EnemyAni]||90001);
function create(c){
 const stage=()=>c.state.snap.value;let library=null;
 function guard(id,field,previous){if(c.state.closed||stage().id!==id||stage().config[field]!==previous)throw Error('The stage card changed. Close this dialog and review the current stage.');}
 async function browse(importNow){
  const stageId=stage().id;library=await c.ipc('world-stage-thumbnails');if(c.state.closed||stage().id!==stageId)return;
  const previous=stage().config.StageThumbnail;let selected=previous||'',active=true,draw,importImage;
  c.modal('Stage thumbnails',dialog=>{
   c.note(dialog,'Choose from the shared thumbnail folder. Imports stay in the draft until you save the stage.');
   const controls=c.el('div',undefined,'world-actions');dialog.appendChild(controls);
   c.button(controls,'Open thumbnail folder',()=>c.ipc('world-stage-thumbnail-folder'));
   c.button(controls,'Use map thumbnail',()=>{selected='';draw();});
   const grid=c.el('div',undefined,'world-stage-thumbnails');dialog.appendChild(grid);
   draw=()=>{grid.textContent='';for(const entry of library.entries){const button=c.button(grid,'',()=>{selected=entry.resource;draw();},selected===entry.resource),image=c.el('img'),name=c.el('span',entry.name);image.src=entry.url;image.alt=entry.name;button.appendChild(image);button.appendChild(name);button.setAttribute('aria-pressed',String(selected===entry.resource));}if(!selected)c.note(grid,'The stage uses its map’s automatic thumbnail.');};
   importImage=async()=>{
    const file=await c.ipc('world-stage-thumbnail-pick');if(!file||!active||stage().id!==stageId)return;
    const result=await c.ipc('world-stage-thumbnail-import',{version:c.state.snap.version,file});if(!c.state.closed)c.state.snap.version=Math.max(c.state.snap.version,result.version);
    if(!active||c.state.closed||stage().id!==stageId)return;library.entries=library.entries.filter(entry=>entry.resource!==result.entry.resource).concat([result.entry]);selected=result.entry.resource;draw();
   };
   c.button(controls,'Import PNG…',()=>importImage().catch(error=>c.note(dialog,error.message,true)));draw();if(importNow)Promise.resolve().then(importImage).catch(error=>{if(active)c.note(dialog,error.message,true);});return()=>{active=false;};
  },()=>c.edit(s=>{guard(stageId,'StageThumbnail',previous);if(selected)s.config.StageThumbnail=selected;else delete s.config.StageThumbnail;},true),'Use thumbnail');
 }
 function face(){
  const stageId=stage().id,previous=stage().config.StageFaceUnit,selected=new Set([previous||legacyFace(stage())]);
  c.modal('Choose the stage face unit',dialog=>c.unitPicker(dialog,{units:c.state.catalog.units,selected,controls:c.el('div'),initialUnitId:Array.from(selected)[0],single:true}),()=>{if(selected.size!==1)throw Error('Choose one unit.');return c.edit(s=>{guard(stageId,'StageFaceUnit',previous);s.config.StageFaceUnit=Array.from(selected)[0];},true);},'Use unit');
 }
 function render(parent){
  const current=stage(),cfg=current.config,unit=c.state.catalog.units.find(unit=>unit.id===(cfg.StageFaceUnit||legacyFace(current)));
  c.section(parent,'Stage card');
  const selected=library&&library.entries.find(entry=>entry.resource===cfg.StageThumbnail);
  if(selected){const image=c.el('img',undefined,'world-stage-thumbnail-preview');image.src=selected.url;image.alt='Selected stage thumbnail';parent.appendChild(image);}
  c.note(parent,cfg.StageThumbnail?'Thumbnail: '+(selected?selected.name:cfg.StageThumbnail):'Thumbnail: map default');
  const actions=c.el('div',undefined,'world-actions');parent.appendChild(actions);c.button(actions,'Browse thumbnails…',()=>browse(false));c.button(actions,'Import thumbnail…',()=>browse(true));
  c.note(parent,'Face unit: '+(unit?unit.name:cfg.StageFaceUnit||'Original stage unit'));c.button(parent,'Choose face unit…',face);
  if(cfg.StageFaceUnit!==undefined)c.button(parent,'Use original face unit',()=>c.edit(s=>{delete s.config.StageFaceUnit;},true));
 }
 return{render,browse,face};
}
module.exports={create,legacyFace};
