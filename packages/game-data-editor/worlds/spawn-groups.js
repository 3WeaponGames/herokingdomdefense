'use strict';

// Optional stage authoring metadata. Its array order controls balance priority.
const validGroup=group=>group&&typeof group.id==='string'&&group.id.trim()&&Array.isArray(group.spawnIds);
const list=stage=>Array.isArray(stage.spawnGroups)?stage.spawnGroups.filter(validGroup):[];
const label=(group,index)=>'Spawn group '+(index+1)+' ('+(group.spawnIds.join(', ')||'empty')+')';

function editable(stage){
 const groups=stage.spawnGroups;
 if(groups===undefined)return [];
 if(!Array.isArray(groups)||!groups.every(validGroup)||new Set(groups.map(group=>group.id)).size!==groups.length){
  throw Error('Spawn groups need unique IDs and member lists before editing.');
 }
 return groups;
}

function add(stage){
 const groups=editable(stage),ids=new Set(groups.map(group=>group.id));
 let index=1;
 while(ids.has('spawn-group-'+index))index++;
 const group={id:'spawn-group-'+index,spawnIds:[]};
 groups.push(group);
 stage.spawnGroups=groups;
 return group;
}

function detach(stage,spawnId){
 let changed=false;
 for(const group of list(stage)){
  if(!group.spawnIds.includes(spawnId))continue;
  group.spawnIds=group.spawnIds.filter(id=>id!==spawnId);
  changed=true;
 }
 return changed;
}

function assign(stage,spawnId,groupId){
 if(!stage.spawns.some(spawn=>spawn.id===spawnId))throw Error('Choose an existing spawn point.');
 const groups=editable(stage),target=groupId==null||groupId===''?null:groups.find(group=>group.id===groupId);
 if(target===undefined)throw Error('Choose an existing spawn group.');
 const previous=groups.filter(group=>group.spawnIds.includes(spawnId));
 if(previous.length===1&&previous[0]===target&&target.spawnIds.filter(id=>id===spawnId).length===1)return false;
 const changed=detach(stage,spawnId);
 if(target)target.spawnIds=target.spawnIds.concat(spawnId).sort((a,b)=>a-b);
 return changed||!!target;
}

function move(stage,groupId,index){
 const groups=editable(stage),previous=groups.findIndex(group=>group.id===groupId);
 if(previous<0)throw Error('Choose an existing spawn group.');
 if(!Number.isInteger(index)||index<0||index>=groups.length)throw Error('Choose a position in the spawn group list.');
 if(previous===index)return false;
 const [group]=groups.splice(previous,1);
 groups.splice(index,0,group);
 return true;
}

function remove(stage,groupId){
 const groups=editable(stage),index=groups.findIndex(group=>group.id===groupId);
 if(index<0)throw Error('Choose an existing spawn group.');
 groups.splice(index,1);
 if(!groups.length)delete stage.spawnGroups;
}

function validate(stage){
 const groups=stage.spawnGroups;
 if(groups===undefined)return [];
 if(!Array.isArray(groups))return ['Spawn groups must be an ordered list.'];
 const issues=[],groupIds=new Set(),members=new Set();
 const spawnIds=new Set((Array.isArray(stage.spawns)?stage.spawns:[]).map(spawn=>spawn?.id));
 for(const [index,group] of groups.entries()){
  const name='Spawn group '+(index+1);
  if(!validGroup(group)){issues.push(name+' needs an ID and a list of spawn points.');continue;}
  if(groupIds.has(group.id))issues.push(name+' has a duplicate group ID.');
  groupIds.add(group.id);
  for(const id of group.spawnIds){
   if(!Number.isSafeInteger(id)||id<1||!spawnIds.has(id)){issues.push(name+' references an unknown spawn point.');continue;}
   if(members.has(id))issues.push('Spawn '+id+' must appear only once across spawn groups.');
   members.add(id);
  }
 }
 return Array.from(new Set(issues));
}

module.exports={list,label,add,assign,move,remove,detach,validate};
