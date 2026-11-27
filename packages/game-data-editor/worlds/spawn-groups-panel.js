'use strict';
const Groups=require('./spawn-groups');

function change(c,stage,mutate){
 return c.edit(draft=>{
  if(draft.id!==stage.id)throw Error('Select the current stage before editing spawn groups.');
  mutate(draft);
 });
}
function transfer(c,stage,spawnId,fromGroupId,toGroupId){
 if(c.editStageCards)return c.editStageCards({type:'spawn-group',stageId:stage.id,spawnId,fromGroupId,toGroupId});
 return change(c,stage,draft=>{
  if((Groups.list(draft).find(group=>group.spawnIds.includes(spawnId))?.id||'')!==fromGroupId){
   throw Error('This spawn group changed while you were dragging. Try again.');
  }
  Groups.assign(draft,spawnId,toGroupId);
 });
}

function assignment(parent,c,stage,spawn){
 const groups=Groups.list(stage);
 const assigned=groups.find(group=>group.spawnIds.includes(spawn.id));
 const choices=[{value:'',label:'Ungrouped'},...groups.map((group,index)=>({value:group.id,label:Groups.label(group,index)}))];
 const input=c.field(parent,'Spawn group',assigned?.id||'',value=>transfer(c,stage,spawn.id,assigned?.id||'',value),choices);
 input.disabled=groups.length===0;
}

function sidebar(parent,c,stage){
 const {state,el,button}=c,groups=Groups.list(stage);
 const owner=new Map(groups.flatMap(group=>group.spawnIds.map(id=>[id,group.id])));
 const lists=groups.map((group,index)=>({id:group.id,title:Groups.label(group,index),spawns:stage.spawns.filter(spawn=>owner.get(spawn.id)===group.id)}));
 lists.push({id:'',title:'Ungrouped',spawns:stage.spawns.filter(spawn=>!owner.has(spawn.id))});
 let drag=null,highlight=null;
 function clearHighlight(){if(highlight)highlight.classList.remove('world-spawn-group-drop');highlight=null;}
 function end(){drag=null;clearHighlight();}
 const current=()=>state.tab==='Spawns'&&!state.closed&&!state.loading&&!state.snap.busy&&(c.stageLayout?.()||state.snap.value).id===stage.id;

 for(const {id,title,spawns} of lists){
  const list=el('div',undefined,'world-spawn-list');
  if(groups.length){
   list.classList.add('world-spawn-group-list');list.dataset.spawnGroupId=id;
   list.appendChild(el('strong',title));
   if(!spawns.length)list.appendChild(el('small','Drop spawn points here'));
   const accepts=()=>drag&&drag.groupId!==id&&list.isConnected!==false&&current();
   list.ondragover=event=>{
    if(!accepts())return;
    event.preventDefault();event.stopPropagation();
    if(event.dataTransfer)event.dataTransfer.dropEffect='move';
    if(highlight!==list){clearHighlight();highlight=list;list.classList.add('world-spawn-group-drop');}
   };
   list.ondragleave=event=>{if(highlight===list&&!list.contains(event.relatedTarget))clearHighlight();};
   list.ondrop=event=>{
    if(!accepts())return;
    event.preventDefault();event.stopPropagation();
    const {spawnId,groupId}=drag;end();
    return transfer(c,stage,spawnId,groupId,id);
   };
  }
  for(const spawn of spawns){
   const selected=state.selection.includes('spawn:'+spawn.id);
   const item=button(list,spawn.name+(spawn.enabled===false?' · Disabled':''),()=>{
    c.cancelDrag();state.spawn=spawn.id;state.selection=['spawn:'+spawn.id];state.tool='select';c.render();
   },selected);
   item.setAttribute('aria-current',String(state.selection[0]==='spawn:'+spawn.id));
   item.setAttribute('aria-pressed',String(selected));
   item.dataset.spawnId=String(spawn.id);item.draggable=groups.length>0;
   if(!groups.length)continue;
   item.title='Drag to another spawn group or to Ungrouped';
   item.ondragstart=event=>{
    if(item.isConnected===false||!current()){event.preventDefault();return;}
    c.cancelDrag();clearHighlight();
    drag={spawnId:spawn.id,groupId:id};
    if(event.dataTransfer){event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('text/plain',String(spawn.id));}
    event.stopPropagation();
   };
   item.ondragend=end;
  }
  parent.appendChild(list);
 }
}

function render(parent,c,stage){
 const {el,button,field,note,section}=c;
 const groups=Groups.list(stage);
 section(parent,'Spawn groups');
 note(parent,'Drag spawn points between lists. Group order sets which Auto spawns can open first.');
 for(const [index,group] of groups.entries()){
  const title=Groups.label(group,index),card=el('section',undefined,'world-spawn-group');
  card.appendChild(el('strong',title));
  const actions=el('div',undefined,'world-spawn-group-actions');
  for(const [direction,caption] of [[-1,'Move up'],[1,'Move down']]){
   const move=button(actions,caption,()=>change(c,stage,draft=>{
    const current=Groups.list(draft).findIndex(item=>item.id===group.id);
    if(current<0)throw Error('This spawn group no longer exists.');
    Groups.move(draft,group.id,current+direction);
   }));
   move.disabled=index+direction<0||index+direction>=groups.length;
   move.setAttribute('aria-label',caption+' '+title);
  }
  button(actions,'Remove group',()=>change(c,stage,draft=>Groups.remove(draft,group.id))).title='Ungroup the spawn points in this group';
  card.appendChild(actions);

  if(group.spawnIds.length){
   const members=el('div',undefined,'world-spawn-group-members');
   for(const id of group.spawnIds){
    const name=stage.spawns.find(spawn=>spawn.id===id)?.name||'Spawn '+id;
    const remove=button(members,name+' ×',()=>transfer(c,stage,id,group.id,''));
    remove.setAttribute('aria-label','Remove '+name+' from '+title);
   }
   card.appendChild(members);
  }
  const available=stage.spawns.filter(spawn=>!group.spawnIds.includes(spawn.id));
  if(available.length){
   const choices=[{value:'',label:'Choose spawn point…'},...available.map(spawn=>{
    const owner=groups.findIndex(item=>item.spawnIds.includes(spawn.id));
    return {value:String(spawn.id),label:spawn.name+(owner<0?'':' · Move from group '+(owner+1))};
   })];
   field(card,'Add spawn','',value=>{
    if(value!==''){
     const id=Number(value),owner=groups.find(item=>item.spawnIds.includes(id));
     return transfer(c,stage,id,owner?.id||'',group.id);
    }
   },choices).setAttribute('aria-label','Add spawn to '+title);
  }
  parent.appendChild(card);
 }
 button(parent,'Add spawn group',()=>change(c,stage,draft=>Groups.add(draft)),true);
}

module.exports={assignment,render,sidebar};
