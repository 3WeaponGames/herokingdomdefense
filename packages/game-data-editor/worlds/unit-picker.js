'use strict';
const Catalog=require('./unit-catalog'),Gallery=require('./unit-model-gallery');
function mount(dialog,options){
 const {el,button,field,units,selected,controls,ipc}=options;dialog.classList.add('world-unit-dialog');
 const toolbar=el('div',undefined,'world-unit-picker-toolbar'),search=el('input',undefined,'world-unit-picker-search');search.type='search';search.placeholder='Search names and descriptions…';search.setAttribute('aria-label','Search unit names and descriptions');toolbar.appendChild(search);
 const filters=el('div',undefined,'world-unit-picker-filters');toolbar.appendChild(filters);
 const choices=(key,label)=>[{value:'all',label}].concat(Array.from(new Map(units.map(unit=>[unit[key]||'untyped',unit[key+'Name']||'Unassigned'])),([value,label])=>({value,label})).sort((a,b)=>a.label.localeCompare(b.label)));
 let type='all',pack='all';field(filters,'Unit type',type,value=>{type=value;filter();},choices('unitType','All unit types'));field(filters,'Asset pack',pack,value=>{pack=value;filter();},choices('assetPack','All asset packs'));
 const expand=button(toolbar,'Expand',()=>{const expanded=dialog.classList.toggle('expanded');expand.textContent=expanded?'Restore':'Expand';expand.setAttribute('aria-pressed',String(expanded));});expand.title='Expand the chooser to fill the editor';expand.setAttribute('aria-pressed','false');dialog.appendChild(toolbar);
 controls.classList.add('world-unit-picker-fields');dialog.appendChild(controls);
 const summary=el('div',undefined,'world-unit-picker-summary');summary.setAttribute('role','status');summary.setAttribute('aria-live','polite');dialog.appendChild(summary);
 const scroll=el('div',undefined,'world-unit-picker-scroll'),grid=el('div',undefined,'world-unit-picker');grid.setAttribute('role','group');grid.setAttribute('aria-label','Unit models');scroll.appendChild(grid);dialog.appendChild(scroll);
 const empty=el('p','No units match your search and filters.','world-unit-picker-empty');empty.hidden=true;scroll.appendChild(empty);
 const gallery=Gallery.create(scroll,ipc,options.initialUnitId),cards=[];let disposed=false,initialFrame=null;
 function selection(){for(const {unit,card}of cards){const on=selected.has(unit.id);card.classList.toggle('active',on);card.setAttribute('aria-pressed',String(on));}const visible=cards.filter(({card})=>!card.hidden).length;summary.textContent=selected.size+' selected · '+visible+' of '+units.length+' units · Click a model to select or deselect. Drag the lower-right corner to resize.';}
 function filter(){for(const {unit,card}of cards)card.hidden=!Catalog.matches(unit,search.value)||(type!=='all'&&(unit.unitType||'untyped')!==type)||(pack!=='all'&&(unit.assetPack||'untyped')!==pack);empty.hidden=cards.some(({card})=>!card.hidden);selection();scroll.scrollTop=0;}
 for(const unit of units){const card=button(grid,'',()=>{if(selected.has(unit.id))selected.delete(unit.id);else selected.add(unit.id);selection();const error=dialog.querySelector('[role="alert"]');if(error)error.hidden=true;});card.className='world-unit-choice';card.dataset.unitId=unit.id;card.setAttribute('aria-label',Catalog.name(unit));card.title=[Catalog.name(unit)+' · '+unit.id,unit.description,unit.unitTypeName,unit.assetPackName].filter(Boolean).join('\n');
  const model=el('span',undefined,'world-unit-model'),image=el('img'),status=el('small','Loading model…','world-unit-model-status');image.alt=Catalog.name(unit)+' model';image.draggable=false;model.appendChild(image);model.appendChild(status);card.appendChild(model);card.appendChild(el('span',Catalog.name(unit),'world-unit-model-name'));const check=el('span','✓','world-unit-model-selected');check.setAttribute('aria-hidden','true');card.appendChild(check);cards.push({unit,card});gallery.watch(card,image,status,unit.id);
 }
 search.oninput=filter;selection();initialFrame=requestAnimationFrame(()=>{initialFrame=null;if(disposed)return;const current=cards.find(({unit})=>unit.id===options.initialUnitId);if(current)current.card.scrollIntoView({block:'center'});search.focus({preventScroll:true});});
 return()=>{disposed=true;if(initialFrame!==null)cancelAnimationFrame(initialFrame);gallery.destroy();};
}
function unitField(c,parent,units,id,change,switchUnit){
 const row=c.el('div',undefined,'world-wave-unit-select');parent.appendChild(row);const options=()=>units.map(unit=>({value:unit.id,label:Catalog.name(unit)}));if(!units.some(unit=>unit.id===id))units=[{id,name:'Missing unit: '+id}].concat(units);
 const stack=c.el('div',undefined,'world-wave-unit-options');row.appendChild(stack);const input=c.field(stack,'Unit',id,value=>change(Number(value)),options()),search=c.el('input',undefined,'world-unit-select-search');search.type='search';search.placeholder='Search name or description…';search.setAttribute('aria-label','Search this group’s unit names and descriptions');stack.insertBefore(search,input.parentNode);
 search.oninput=()=>{input.textContent='';for(const unit of units.filter(unit=>unit.id===id||Catalog.matches(unit,search.value))){const option=c.el('option',Catalog.name(unit));option.value=String(unit.id);input.appendChild(option);}input.value=String(id);};
 const button=c.button(row,'Switch',switchUnit);button.title='Choose models and keep this group’s count, spawn and timing';return input;
}
module.exports={mount,unitField};
