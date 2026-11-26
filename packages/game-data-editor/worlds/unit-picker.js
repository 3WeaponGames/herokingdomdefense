'use strict';
const Catalog=require('./unit-catalog'),Gallery=require('./unit-model-gallery'),Stats=require('./wave-stats'),Classes=require('../lib/enemy-classes');
const {custom}=require('../../hkd-characters/lib/unit-packs');
const Kingdoms=require('../lib/unit-kingdoms');
const collection=unit=>unit.customUnit?custom:{id:unit.assetPack||'untyped',label:unit.assetPackName||'Unassigned'};
function mount(dialog,options){
 const {el,button,field,units,selected,controls,ipc}=options;dialog.classList.add('world-unit-dialog');
 const toolbar=el('div',undefined,'world-unit-picker-toolbar'),search=el('input',undefined,'world-unit-picker-search');search.type='search';search.placeholder='Search name, kingdom or description…';search.setAttribute('aria-label','Search units by name, kingdom, or description');toolbar.appendChild(search);
 const filters=el('div',undefined,'world-unit-picker-filters');toolbar.appendChild(filters);
 const choices=(entries,label)=>[{value:'all',label}].concat(Array.from(new Map(entries),([value,label])=>({value,label})).sort((a,b)=>a.label.localeCompare(b.label)));
 const packs=units.map(unit=>{const pack=collection(unit);return [pack.id,pack.label];});
 const types=units.map(unit=>[unit.unitType||'untyped',unit.unitTypeName||'Unassigned']);
 let type='all',pack='all',enemyClass='all',kingdom='all';
 field(filters,'Enemy class',enemyClass,value=>{enemyClass=value;filter();},[{value:'all',label:'All enemy classes'}].concat(Classes.CHOICES));
 field(filters,'Fighting type',type,value=>{type=value;filter();},choices(types,'All fighting types'));
 field(filters,'Asset pack',pack,value=>{pack=value;filter();},choices(packs,'All asset packs'));
 field(filters,'Kingdom',kingdom,value=>{kingdom=value;filter();},Kingdoms.options(units));
 const expand=button(toolbar,'Expand',()=>{const expanded=dialog.classList.toggle('expanded');expand.textContent=expanded?'Restore':'Expand';expand.setAttribute('aria-pressed',String(expanded));});expand.title='Expand the chooser to fill the editor';expand.setAttribute('aria-pressed','false');dialog.appendChild(toolbar);
 controls.classList.add('world-unit-picker-fields');dialog.appendChild(controls);
 const scaling=options.wave?el('div',Stats.multipliers(options.wave)+' · Per unit, before battle buffs.','world-unit-picker-scaling'):null;if(scaling)dialog.appendChild(scaling);
 const summary=el('div',undefined,'world-unit-picker-summary');summary.setAttribute('role','status');summary.setAttribute('aria-live','polite');dialog.appendChild(summary);
 const scroll=el('div',undefined,'world-unit-picker-scroll'),grid=el('div',undefined,'world-unit-picker');grid.setAttribute('role','group');grid.setAttribute('aria-label','Unit models');scroll.appendChild(grid);dialog.appendChild(scroll);
 const empty=el('p','No units match your search and filters.','world-unit-picker-empty');empty.hidden=true;scroll.appendChild(empty);
 const gallery=Gallery.create(scroll,id=>ipc('world-unit-preview',{id}),options.initialUnitId),cards=[],models=Catalog.groups(units);let disposed=false,initialFrame=null;
 function selection(){for(const record of cards){const {unit,card,members,entry}=record,on=selected.has(unit.id),chosen=members.filter(member=>selected.has(member.id));card.classList.toggle('active',on);card.setAttribute('aria-pressed',String(on));entry.dataset.selectedIds=JSON.stringify(chosen.map(member=>member.id));const other=chosen.filter(member=>member.id!==unit.id).length;record.other.hidden=!other;record.other.textContent=other+' other profile'+(other===1?'':'s')+' selected';if(record.select)for(const option of record.select.options){const member=members.find(member=>String(member.id)===option.value);option.textContent=(selected.has(member.id)?'✓ ':'')+record.labels.get(member.id);}}const visible=cards.filter(({entry})=>!entry.hidden).length;summary.textContent=selected.size+' selected · '+visible+' of '+models.length+' models · '+units.length+' profiles · '+(options.single?'Click a model to choose one unit.':'Click a model to select or deselect.')+' Drag the lower-right corner to resize.';}
 function show(record,unit){
  const changed=record.unit.id!==unit.id,enemyClass=Catalog.enemyClass(unit),className=Classes.label(enemyClass);
  const affiliation=Kingdoms.info(unit.kingdom),kingdomLabel=affiliation?.biome?affiliation.label:'';
  record.unit=unit;record.card.dataset.unitId=unit.id;record.card.dataset.enemyClass=enemyClass;
  record.card.setAttribute('aria-label',[Catalog.name(unit),className,kingdomLabel].filter(Boolean).join(' · '));
  record.card.title=[Catalog.name(unit)+' · '+unit.id,Catalog.profileLabel(unit),options.wave&&Stats.formula(unit,options.wave),unit.description,unit.assetPackName,kingdomLabel].filter(Boolean).join('\n');
  record.name.textContent=Catalog.name(unit);record.kingdom.textContent=kingdomLabel;record.kingdom.hidden=!kingdomLabel;
  record.classBadge.textContent=className;record.classBadge.dataset.enemyClass=enemyClass;record.image.alt=Catalog.name(unit)+' model';
  if(record.stats){record.stats.textContent=[unit.unitTypeName,options.wave?Stats.describe(unit,options.wave):Catalog.profileStats(unit)].filter(Boolean).join(' · ');record.stats.title=options.wave?Stats.formula(unit,options.wave):'Base unit stats';}
  if(changed)gallery.setUnit(record.card,unit.baseProfileId||unit.id);
 }
 function filter(){
  for(const record of cards){
   const available=record.members.filter(unit=>
    (!unit.archived||selected.has(unit.id))&&Catalog.matches(unit,search.value)&&
    (enemyClass==='all'||Catalog.enemyClass(unit)===enemyClass)&&
    (type==='all'||(unit.unitType||'untyped')===type)&&
    (pack==='all'||collection(unit).id===pack)&&
    (kingdom==='all'||unit.kingdom===kingdom));
   record.available=available;
   record.entry.hidden=record.card.hidden=!available.length;
   if(!available.length)continue;
   const unit=available.find(unit=>unit.id===record.preferredId)||available.find(unit=>selected.has(unit.id))||Catalog.firstProfile(available);
   show(record,unit);
   if(record.select){
    record.select.textContent='';
    for(const member of available){
     const option=el('option',record.labels.get(member.id));
     option.value=String(member.id);option.title=Catalog.profileLabel(member)+' · '+member.id;
     record.select.appendChild(option);
    }
    record.select.value=String(unit.id);record.select.disabled=available.length===1;
   }
  }
  empty.hidden=cards.some(({entry})=>!entry.hidden);selection();scroll.scrollTop=0;
 }
 for(const group of models){const members=group.units,initial=members.find(unit=>unit.id===options.initialUnitId)||members.find(unit=>selected.has(unit.id)),unit=initial||Catalog.firstProfile(members),entry=el('div',undefined,'world-unit-entry');entry.dataset.modelKey=group.key;entry.dataset.memberIds=JSON.stringify(members.map(unit=>unit.id));grid.appendChild(entry);const record={entry,members,unit,preferredId:initial&&initial.id,available:members};
  const card=button(entry,'',()=>{const id=record.unit.id;if(options.single){selected.clear();selected.add(id);}else if(selected.has(id))selected.delete(id);else selected.add(id);selection();const error=dialog.querySelector('[role="alert"]');if(error)error.hidden=true;});card.className='world-unit-choice';record.card=card;
  const model=el('span',undefined,'world-unit-model'),image=el('img'),status=el('small','Loading model…','world-unit-model-status');image.draggable=false;model.appendChild(image);model.appendChild(status);card.appendChild(model);record.image=image;record.name=el('span',undefined,'world-unit-model-name');card.appendChild(record.name);record.kingdom=el('small',undefined,'world-unit-kingdom');card.appendChild(record.kingdom);record.classBadge=el('span',undefined,'world-unit-enemy-class');card.appendChild(record.classBadge);const check=el('span','✓','world-unit-model-selected');check.setAttribute('aria-hidden','true');card.appendChild(check);
  if(members.length>1){record.labels=new Map();const counts=new Map();for(const member of members){const label=Catalog.profileLabel(member);counts.set(label,(counts.get(label)||0)+1);}for(const member of members){const label=Catalog.profileLabel(member);record.labels.set(member.id,label+(counts.get(label)>1?' · '+member.id:''));}record.select=field(entry,'Profile',unit.id,value=>{const next=record.available.find(member=>member.id===Number(value));if(!next)return;const replace=selected.has(record.unit.id);if(replace){selected.delete(record.unit.id);selected.add(next.id);}record.preferredId=next.id;show(record,next);selection();},[]);record.select.setAttribute('aria-label',Catalog.name(unit)+' profile');}
  if(options.wave||members.length>1){record.stats=el('small',undefined,'world-unit-profile-stats');entry.appendChild(record.stats);}
  record.other=el('small',undefined,'world-unit-other-selected');record.other.hidden=true;entry.appendChild(record.other);cards.push(record);show(record,unit);gallery.watch(card,image,status,unit.baseProfileId||unit.id);
  if(options.manageProfiles){const manage=button(entry,'Profiles…',()=>options.manageProfiles(record.unit.id,units=>dispose.reload(units),profileId=>{if(!units.some(unit=>unit.id===profileId))throw Error('Save this profile before selecting it.');if(options.single)selected.clear();else if(selected.has(record.unit.id))selected.delete(record.unit.id);selected.add(profileId);dispose.reload(units.slice());}));manage.className='world-unit-manage-profiles';manage.setAttribute('aria-label','Manage profiles for '+Catalog.name(unit));}
 }
 search.oninput=filter;filter();initialFrame=requestAnimationFrame(()=>{initialFrame=null;if(disposed)return;const current=cards.find(({members})=>members.some(unit=>unit.id===options.initialUnitId));if(current)current.entry.scrollIntoView({block:'center'});search.focus({preventScroll:true});});
 let replacement=null;
 const dispose=()=>{disposed=true;if(initialFrame!==null)cancelAnimationFrame(initialFrame);gallery.destroy();if(replacement)replacement();};
 dispose.reload=next=>{if(replacement)return replacement.reload(next);if(disposed)return;gallery.destroy();if(initialFrame!==null)cancelAnimationFrame(initialFrame);const marker=el('span');dialog.insertBefore(marker,toolbar);for(const element of [toolbar,scaling,summary,scroll])if(element)element.remove();units.splice(0,units.length,...next);replacement=mount(dialog,options);for(const element of [dialog.querySelector('.world-unit-picker-toolbar'),controls,dialog.querySelector('.world-unit-picker-scaling'),dialog.querySelector('.world-unit-picker-summary'),dialog.querySelector('.world-unit-picker-scroll')])if(element)dialog.insertBefore(element,marker);marker.remove();};
 return dispose;
}
function unitField(c,parent,units,id,change,switchUnit,profileAction){
 units=units.filter(unit=>!unit.archived||unit.id===id);
 if(!units.some(unit=>unit.id===id))units=[{id,name:'Missing unit: '+id}].concat(units);
 const groups=Catalog.groups(units),groupOf=value=>groups.find(group=>group.units.some(unit=>unit.id===Number(value)));let current=Number(id),group=groupOf(current);
 const row=c.el('div',undefined,'world-wave-unit-select');parent.appendChild(row);const toolbar=c.el('div',undefined,'world-wave-unit-search');row.appendChild(toolbar);const search=c.el('input',undefined,'world-unit-select-search');search.type='search';search.placeholder='Search units…';search.setAttribute('aria-label','Search units by name, kingdom, or description');toolbar.appendChild(search);
 c.button(toolbar,'Switch',switchUnit).title='Choose models and keep this group’s count, spawn and timing';if(profileAction||c.manageProfiles)c.button(toolbar,'Profiles…',()=>(profileAction||c.manageProfiles)(current,undefined,profileId=>change(Number(profileId))));
 if(c.openUnitEditor)c.button(toolbar,'Unit Editor',()=>{
  const unit=units.find(member=>member.id===current);
  return c.openUnitEditor(unit.baseProfileId||current);
 }).title='Open this unit’s shared profile in Units';
 const fields=c.el('div',undefined,'world-wave-unit-fields world-wave-unit-options');row.appendChild(fields);
 const ordered=members=>members.slice().sort((a,b)=>a.fightingProfile&&b.fightingProfile?['fighter','guardian','vanguard','skirmisher','bruiser','mystic'].indexOf(a.unitType)-['fighter','guardian','vanguard','skirmisher','bruiser','mystic'].indexOf(b.unitType):0);
 const defaultProfile=()=>group.units.find(unit=>unit.defaultProfile&&!unit.archived);
 const profileValue=()=>current===defaultProfile()?.id?'default':String(current);
 const profileChoices=()=>{
  const choices=ordered(group.units).map(unit=>({value:String(unit.id),label:Catalog.profileLabel(unit)}));
  const preferred=defaultProfile();
  if(preferred)choices.unshift({value:'default',label:'Default ('+Catalog.profileLabel(preferred)+')'});
  return choices;
 };
 const options=()=>groups.filter(item=>item===group||item.units.some(unit=>Catalog.matches(unit,search.value))).map(item=>({value:item.key,label:Catalog.name(item.units[0])}));
 const input=c.field(fields,'Unit',group.key,value=>{
  const next=groups.find(item=>item.key===value);if(!next||next===group)return;
  group=next;current=Catalog.firstProfile(group.units).id;
  profile.textContent='';
  for(const choice of profileChoices()){const option=c.el('option',choice.label);option.value=choice.value;profile.appendChild(option);}
  profile.value=profileValue();
  return change(current);
 },options());input.setAttribute('aria-label','Unit');
 const profile=c.field(fields,'Profile',profileValue(),value=>{
  const id=value==='default'?defaultProfile()?.id:Number(value);
  if(id===current||!group.units.some(unit=>unit.id===id))return;
  current=id;
  return change(current);
 },profileChoices());profile.setAttribute('aria-label','Profile');
 search.oninput=()=>{input.textContent='';for(const choice of options()){const option=c.el('option',choice.label);option.value=choice.value;input.appendChild(option);}input.value=group.key;};return input;
}
module.exports={mount,unitField};
