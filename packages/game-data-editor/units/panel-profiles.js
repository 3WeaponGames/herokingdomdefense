'use strict';
const Profiles=require('../lib/unit-profiles'),Catalog=require('../worlds/unit-catalog'),Popup=require('./profile-client');
function state(panel){return {A:panel._data('A'),overrides:panel._data('overrides'),catalog:panel._data('catalog')};}
function looks(panel){const root=panel._snapshot&&panel._snapshot.root;return root?Profiles.characters(root):null;}
function list(panel,rows){
 const data=state(panel),all=Catalog.rows(Object.assign({},data.A,{GameTools:data.overrides}),data.catalog,null,looks(panel)),keys=new Map(all.map(unit=>[unit.id,unit.modelKey])),grouped=new Map(),result=[];
 for(const row of rows){if(row.unitType!=='enemy'||!keys.has(Number(row.unitID))){result.push(row);continue;}const key=keys.get(Number(row.unitID));if(!grouped.has(key))grouped.set(key,[]);grouped.get(key).push(row);}
 for(const members of grouped.values())result.push(members.find(row=>row.key===panel._selected)||members.find(row=>row.record.MonsterSource)||members[0]);return result;
}
function open(panel,id,action){
 if(panel._profilePopup)panel._profilePopup.close();
 panel._profilePopup=Popup.open(panel.$root,{id,action,ipc:panel._profileIpc,onChange:next=>{panel._selected='enemy:'+next.id;return panel._load(false);},onSaved:()=>panel._load(false),onClose:()=>{const active=panel._profilePopup;panel._profilePopup=null;if(active)panel._selected='enemy:'+active.id;if(!panel._closed)return panel._load(false);}});return panel._profilePopup;
}
function bar(panel,row,create){
 if(row.unitType!=='enemy'||!row.record.prefab||[90011,90012].includes(Number(row.unitID)))return;
 const data=state(panel),{group,baseId}=Profiles.family(data,row.unitID,looks(panel)),entries=Profiles.metadata(data).entries||{},wrap=create('div');wrap.className='gt-unit-profiles';panel.$detail.appendChild(wrap);
 const label=create('label'),caption=create('span'),select=create('select');caption.textContent='Profile';label.appendChild(caption);label.appendChild(select);select.setAttribute('aria-label','Unit profile');wrap.appendChild(label);
 for(const unit of group.units){if(unit.archived&&unit.id!==Number(row.unitID))continue;const option=create('option');option.value=String(unit.id);option.textContent=unit.id===baseId?'Default':entries[unit.id]&&entries[unit.id].name||Catalog.profileLabel(unit);select.appendChild(option);}select.value=String(row.unitID);
 select.onchange=()=>{panel._selected='enemy:'+select.value;panel._render();};
 for(const [title,action]of [['Manage profiles',null],['Add','add'],['Duplicate','duplicate'],['Rename','rename'],['Remove','remove']]){const button=create('button');button.textContent=title;button.disabled=['rename','remove'].includes(action)&&Number(row.unitID)===baseId;button.onclick=()=>open(panel,Number(row.unitID),action);wrap.appendChild(button);}
}
module.exports={list,bar,open};
