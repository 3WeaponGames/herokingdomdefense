'use strict';
const Profiles=require('../lib/unit-profiles'),Catalog=require('../worlds/unit-catalog'),Popup=require('./profile-client'),Fighting=require('../lib/fighting-profiles');
function state(panel){return {A:panel._data('A'),overrides:panel._data('overrides'),catalog:panel._data('catalog')};}
function looks(panel){const root=panel._snapshot&&panel._snapshot.root;return root?Profiles.characters(root):null;}
function list(panel,rows){
 const data=state(panel),all=Catalog.rows(Object.assign({},data.A,{GameTools:data.overrides}),data.catalog,null,looks(panel)),units=new Map(all.map(unit=>[unit.id,unit])),grouped=new Map(),result=[];
 for(const row of rows){const unit=row.unitType==='enemy'&&units.get(Number(row.unitID));if(!unit){result.push(row);continue;}const key=unit.modelKey;if(!grouped.has(key))grouped.set(key,[]);grouped.get(key).push(row);}
 for(const members of grouped.values())result.push(members.find(row=>row.key===panel._selected)||members.find(row=>units.get(Number(row.unitID)).defaultProfile)||members.find(row=>row.record.MonsterSource)||members[0]);return result;
}
function open(panel,id,action){
 if(panel._profilePopup)panel._profilePopup.close();
 panel._profilePopup=Popup.open(panel.$root,{id,action,ipc:panel._profileIpc,onChange:next=>{panel._selected='enemy:'+next.id;return panel._load(false);},onSaved:()=>panel._load(false),onClose:()=>{const active=panel._profilePopup;panel._profilePopup=null;if(active)panel._selected='enemy:'+active.id;if(!panel._closed)return panel._load(false);}});return panel._profilePopup;
}
function bar(panel,row,create){
 if(row.unitType!=='enemy'||!row.record.prefab||[90011,90012].includes(Number(row.unitID)))return;
 const data=state(panel),{group,baseId}=Profiles.family(data,row.unitID,looks(panel)),entries=Profiles.metadata(data).entries||{},fixed=Fighting.familyFor(data.overrides,baseId),wrap=create('div');wrap.className='gt-unit-profiles';panel.$detail.appendChild(wrap);
 const label=create('label'),caption=create('span'),select=create('select');caption.textContent='Profile';label.appendChild(caption);label.appendChild(select);select.setAttribute('aria-label','Unit profile');wrap.appendChild(label);
 const members=fixed?Fighting.rolesFor(fixed).map(role=>group.units.find(unit=>unit.id===fixed.profiles[role])):group.units;
 for(const unit of members){if(unit.archived&&unit.id!==Number(row.unitID))continue;const option=create('option');option.value=String(unit.id);option.textContent=fixed?Catalog.profileLabel(unit)+(unit.defaultProfile?' · Default':''):unit.id===baseId?'Default':entries[unit.id]&&entries[unit.id].name||Catalog.profileLabel(unit);select.appendChild(option);}select.value=String(row.unitID);
 if(fixed)select.title='Choose the unit’s default fighting profile. Save to use it in new wave groups.';
 select.onchange=()=>{
  const id=Number(select.value),key='enemy:'+id;
  if(!fixed){panel._selectRow(key);return;}
  return panel._change(()=>{
   const settings=panel._data('overrides'),family=Fighting.familyFor(settings,baseId);
   if(!family||!Object.values(family.profiles).includes(id))throw Error('Choose a fighting profile for this unit.');
   if(Fighting.defaultProfileId(settings,baseId)===id)return [];
   const edit={doc:'overrides',path:['unitProfiles','families',String(baseId),'defaultProfileId']};
   return [id===baseId?{...edit,remove:true}:{...edit,value:id}];
  },{skipEmpty:true}).then(()=>{if(panel._selected===row.key)panel._selectRow(key);},()=>{select.value=String(row.unitID);});
 };
 for(const [title,action]of [['Manage profiles',null],['Add','add'],['Duplicate','duplicate'],['Rename','rename'],['Remove','remove']]){if(fixed&&action)continue;const button=create('button');button.textContent=title;button.disabled=['rename','remove'].includes(action)&&Number(row.unitID)===baseId;button.onclick=()=>open(panel,Number(row.unitID),action);wrap.appendChild(button);}
}
module.exports={list,bar,open};
