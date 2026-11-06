'use strict';
const fs=require('fs'),path=require('path');
function el(tag,text,parent,cls){const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;if(parent)parent.appendChild(n);return n;}
function clear(n){while(n.firstChild)n.removeChild(n.firstChild);}
function idOf(row){return row.id!==undefined?row.id:row.ID!==undefined?row.ID:row.enumValue;}
function nameOf(row){return String(row.name||row.Name||row.label||row.EquipName||idOf(row));}
function list(value){return Array.isArray(value)?value:Object.keys(value||{}).map(id=>Object.assign({id},value[id]));}
function integer(value,min,max){const n=Number(value);if(!Number.isInteger(n)||n<min||n>max)throw Error('Enter a whole number between '+min+' and '+max+'.');return n;}
function mount(container,api){
  const root=el('div',undefined,container,'hkd-testing'),style=el('style',undefined,root);style.textContent=fs.readFileSync(path.join(__dirname,'style.css'),'utf8');
  let snapshot=null,disposed=false,busy=false,poll=null,catalogSignature='',lastMessage='';const commandButtons=[];
  const session=el('section',undefined,root,'test-session'),sessionTop=el('div',undefined,session,'test-session-top'),sessionHeading=el('div',undefined,sessionTop);
  el('h2','Managed test player',sessionHeading);el('span','ISOLATED PLAYER · MUTED',sessionTop,'test-managed');
  const target=el('div','Checking the project-owned test profile…',session,'test-target'),sessionStatus=el('p','No game is started by opening this panel.',session,'test-session-status');
  const sessionActions=el('div',undefined,session,'test-actions');
  const start=button(sessionActions,'Start muted test game',()=>run('start'),'primary',false),refresh=button(sessionActions,'Refresh player',()=>readStatus(true),undefined,false),close=button(sessionActions,'Close test game',()=>run('close'),undefined,false);
  el('p','Buttons below apply immediately to this test player. They do not edit game balance tables or use the configuration Save button. The test profile persists between sessions.',session,'test-note');
  const message=el('div','Opening this panel only reads status. Start the managed test game when you want to test grants or progression.',root,'test-message');
  const grid=el('div',undefined,root,'test-grid');

  const currencies=card('Gold, gems & resources'),currencyValues=el('div',undefined,currencies,'test-values');
  const quick=el('div',undefined,currencies,'test-actions');
  const gold=button(quick,'+99,999 Gold',()=>run('grant',{itemId:2001,amount:99999}),'primary');
  const gems=button(quick,'+99,999 Gems',()=>run('grant',{itemId:2002,amount:99999}),'primary');
  const grantFields=el('div',undefined,currencies,'test-fields'),itemSelect=selectField(grantFields,'Item / resource'),amount=numberField(grantFields,'Amount to add',99999,1,999999);
  const itemActions=el('div',undefined,currencies,'test-actions'),grant=button(itemActions,'Grant selected item',()=>{try{return run('grant',{itemId:Number(itemSelect.value),amount:integer(amount.value,1,999999)});}catch(e){show(e.message,true);}});
  const grantAll=button(itemActions,'Grant all supported items',()=>{try{return reviewBulk('Grant all supported items','Add '+integer(amount.value,1,999999)+' of every supported item in this test profile.',()=>run('grant-all',{amount:integer(amount.value,1,999999)}));}catch(e){show(e.message,true);}});
  const itemHelp=el('p','Only supported player resources are offered. Runtime-only values cannot be granted as persistent items.',currencies,'test-note');
  itemSelect.onchange=()=>{const item=catalog('goods').find(r=>String(idOf(r))===itemSelect.value);itemHelp.textContent=item&&(item.help||item.description)||'Adds the selected amount through this project’s managed test-player command.';};

  const equipment=card('Equipment levels'),equipmentCurrent=el('div','Start the test game to read equipment levels.',equipment,'test-current'),equipmentFields=el('div',undefined,equipment,'test-fields'),equipmentSelect=selectField(equipmentFields,'Equipment'),equipmentLevel=numberField(equipmentFields,'Player level',1,1,9999);
  const equipActions=el('div',undefined,equipment,'test-actions');button(equipActions,'Set selected level',()=>{try{return run('equipment',{id:Number(equipmentSelect.value),level:integer(equipmentLevel.value,1,equipmentMax())});}catch(e){show(e.message,true);}});
  const maxSelected=button(equipActions,'Max selected',()=>run('equipment',{id:Number(equipmentSelect.value),level:equipmentMax()}));
  const maxAll=button(equipActions,'Max all equipment',()=>reviewBulk('Max all equipment','Set every equipment category to its currently configured maximum level for this test player.',()=>run('equipment-all',{level:'max'})));
  el('p','Changes the test player’s owned levels. Equipment stat values and upgrade costs remain unchanged.',equipment,'test-note');
  equipmentSelect.onchange=()=>{equipmentLevel.max=equipmentMax();const owned=ownedEquipment(equipmentSelect.value);equipmentLevel.value=owned===undefined?1:owned;};

  const talents=card('Talents'),talentCurrent=el('div','Start the test game to read talents.',talents,'test-current'),talentFields=el('div',undefined,talents,'test-fields'),talentSelect=selectField(talentFields,'Progression record');
  const talentActions=el('div',undefined,talents,'test-actions');
  const giveTalent=button(talentActions,'Unlock selected',()=>run('talent',{id:Number(talentSelect.value),enabled:true}));
  const removeTalent=button(talentActions,'Remove selected',()=>run('talent',{id:Number(talentSelect.value),enabled:false}));
  const allTalents=button(talentActions,'Unlock all talents',()=>reviewBulk('Unlock all talents','Unlock every configured talent record, including all branches, while preserving talents already owned by this test player.',()=>run('talents-all',{enabled:true})));
  const talentHelp=el('p','Changes player ownership, not talent values or progression costs.',talents,'test-note');

  const progress=card('Stage progression'),progressCurrent=el('div','Start the test game to read stage progress.',progress,'test-current'),progressFields=el('div',undefined,progress,'test-fields'),stage=selectField(progressFields,'Stage'),wave=selectField(progressFields,'Best completed wave');
  const progressActions=el('div',undefined,progress,'test-actions');const unlock=button(progressActions,'Set test progression',()=>run('unlock',{stage:Number(stage.value),wave:Number(wave.value)}));
  el('p','Unlock progression up to the selected stage and completed wave. Wave 0 starts that stage fresh. Return home first; reducing progress requires a reset.',progress,'test-note');
  stage.onchange=populateWaves;

  const inventory=card('Current test-player inventory','wide'),inventoryView=el('div',undefined,inventory,'test-inventory');
  const resetCard=card('Reset test player to the beginning','wide danger');
  el('p','Reset clears this managed test player’s progress, currencies, equipment, talents, rewards and tutorial state. The backend creates a backup before clearing its saved data. It does not reset any separately opened Browser or Simulator player.',resetCard,'test-note');
  const resetActions=el('div',undefined,resetCard,'test-actions'),reset=button(resetActions,'Review full test-player reset',()=>openReset(),'danger');
  const resetConfirm=el('div',undefined,resetCard,'test-confirm');resetConfirm.hidden=true;
  const resetTarget=el('p','',resetConfirm);el('p','To confirm, type RESET TEST PLAYER below.',resetConfirm);
  const resetInput=el('input',undefined,resetConfirm);resetInput.type='text';resetInput.placeholder='RESET TEST PLAYER';resetInput.autocomplete='off';
  const resetButtons=el('div',undefined,resetConfirm,'test-actions');const resetCancel=button(resetButtons,'Cancel',()=>{resetConfirm.hidden=true;resetInput.value='';},undefined,false);
  const resetNow=button(resetButtons,'Back up and reset test player',()=>{if(resetInput.value!=='RESET TEST PLAYER')return;resetConfirm.hidden=true;resetInput.value='';return run('reset',{confirm:'RESET MANAGED TEST PLAYER'});},'danger',false);resetNow.disabled=true;
  resetInput.oninput=()=>resetNow.disabled=busy||!writable()||resetInput.value!=='RESET TEST PLAYER';

  const bulkConfirm=el('div',undefined,root,'test-confirm');bulkConfirm.hidden=true;let bulkAction=null;
  const bulkTitle=el('h3','',bulkConfirm),bulkDescription=el('p','',bulkConfirm),bulkActions=el('div',undefined,bulkConfirm,'test-actions');
  button(bulkActions,'Cancel',()=>{bulkConfirm.hidden=true;bulkAction=null;},undefined,false);
  const bulkApply=button(bulkActions,'Apply to test player',()=>{const action=bulkAction;bulkConfirm.hidden=true;bulkAction=null;if(action&&writable())action();},'primary',false);

  function card(title,classes){const c=el('section',undefined,grid,'test-card'+(classes?' '+classes:''));el('h3',title,c);return c;}
  function button(parent,text,action,classes,write){const b=el('button',text,parent,classes);b.type='button';b.onclick=action;if(write!==false)commandButtons.push(b);return b;}
  function field(parent,label){const l=el('label',undefined,parent,'test-field');el('span',label,l);return l;}
  function numberField(parent,label,value,min,max){const n=el('input',undefined,field(parent,label));n.type='number';n.step=1;n.min=min;n.max=max;n.value=value;return n;}
  function selectField(parent,label){return el('select',undefined,field(parent,label));}
  function options(select,items){const before=select.value;clear(select);items.forEach(item=>{const option=el('option',item.label,select);option.value=String(item.value);});if(items.some(i=>String(i.value)===before))select.value=before;else if(items.length)select.value=String(items[0].value);}
  function catalog(name){return list(snapshot&&snapshot.catalog&&snapshot.catalog[name]);}
  function writable(){return !!(snapshot&&snapshot.running&&snapshot.ready&&snapshot.target&&snapshot.target.managed===true&&snapshot.testMode!==false&&(!snapshot.state||snapshot.state.testMode!==false));}
  function capability(name){const caps=snapshot&&snapshot.capabilities;return caps?caps[name]!==false:true;}
  function show(text,error){lastMessage=text;message.textContent=text;message.className='test-message'+(error?' error':'');}
  function targetText(){const t=snapshot&&snapshot.target||{};return (t.project||'HeroKingdomDefense')+' · '+(t.profile||'managed test profile');}
  function equipmentMax(){const selected=catalog('equipment').find(r=>String(idOf(r))===equipmentSelect.value);return Math.max(1,Number(selected&&(selected.maxLevel||(selected.levelInfo||[]).length))||1);}
  function ownedEquipment(id){const values=snapshot&&snapshot.state&&snapshot.state.equipment;if(Array.isArray(values)){const match=values.find(r=>String(idOf(r))===String(id));return match&&(match.level!==undefined?match.level:match.Level);}if(values&&values[id]!==undefined){const value=values[id];return typeof value==='object'?value.level:value;}return undefined;}
  function populateWaves(){const selected=catalog('stages').find(s=>String(s.stage!==undefined?s.stage:idOf(s))===stage.value);let count=selected&&(selected.waves||selected.waveCount||(selected.WaveCfg||[]).length)||1;count=Array.isArray(count)?count.length:Number(count);options(wave,[{value:0,label:'0 · No waves completed'}].concat(Array.from({length:Math.max(1,count)},(_,i)=>({value:i+1,label:'Wave '+(i+1)}))));}
  function updateCatalog(){
    const signature=JSON.stringify(snapshot&&snapshot.catalog||{});if(signature===catalogSignature)return;catalogSignature=signature;
    const goods=catalog('goods').filter(r=>r.supported!==false);options(itemSelect,goods.map(r=>({value:idOf(r),label:nameOf(r)+' · '+idOf(r)})));
    options(equipmentSelect,catalog('equipment').map(r=>({value:idOf(r),label:nameOf(r)})));equipmentLevel.max=equipmentMax();
    options(talentSelect,catalog('talents').map(r=>({value:idOf(r),label:(r.level?'Level '+r.level+' · ':'')+nameOf(r)+' · #'+idOf(r)})));
    options(stage,catalog('stages').map(r=>({value:r.stage!==undefined?r.stage:idOf(r),label:nameOf(r)})));populateWaves();
    itemHelp.textContent=goods.length?'Items use their existing caps and conversion rules. Battle-only silver requires an active battle and is skipped by bulk grants outside battle.':'No grantable items are available until the test game is ready.';
  }
  function controls(){
    const canWrite=writable()&&!busy;
    commandButtons.forEach(b=>b.disabled=!canWrite);
    start.disabled=busy||!!(snapshot&&snapshot.running&&writable());close.disabled=busy||!(snapshot&&snapshot.running);refresh.disabled=busy;
    start.textContent=snapshot&&snapshot.running?(writable()?'Test game ready':snapshot.ready?'Enable test controls':'Retry / show test game'):'Start muted test game';
    [itemSelect,amount,equipmentSelect,equipmentLevel,talentSelect,stage,wave].forEach(input=>input.disabled=!canWrite);
    grant.disabled=grant.disabled||!itemSelect.value;gold.disabled=gold.disabled||!catalog('goods').some(r=>Number(idOf(r))===2001&&r.supported!==false);gems.disabled=gems.disabled||!catalog('goods').some(r=>Number(idOf(r))===2002&&r.supported!==false);
    grantAll.hidden=!capability('grantAll');maxAll.hidden=!capability('equipmentAll');allTalents.hidden=!capability('talentsAll');
    giveTalent.disabled=giveTalent.disabled||!talentSelect.value||!capability('talent');removeTalent.disabled=removeTalent.disabled||!talentSelect.value||!capability('talentRemove');removeTalent.hidden=!capability('talentRemove');allTalents.disabled=allTalents.disabled||!capability('talentsAll');
    maxSelected.disabled=maxSelected.disabled||!equipmentSelect.value;unlock.disabled=unlock.disabled||!capability('unlock');reset.disabled=reset.disabled||!capability('reset');
    resetNow.disabled=busy||!writable()||resetInput.value!=='RESET TEST PLAYER';bulkApply.disabled=busy||!writable();resetCancel.disabled=busy;
    if(!capability('talent'))talentHelp.textContent='Talent ownership editing is not available for this runtime state.';
  }
  function readState(){
    clear(currencyValues);const state=snapshot&&snapshot.state||{},currency=state.currencies||{};
    const display=[['Gold',currency.gold!==undefined?currency.gold:currency.goldNum],['Gems',currency.gems!==undefined?currency.gems:currency.diamonds!==undefined?currency.diamonds:currency.diamondNum],['Stamina',currency.stamina!==undefined?currency.stamina:currency.powerNum]];
    display.forEach(pair=>{const box=el('div',undefined,currencyValues,'test-value');el('strong',pair[1]===undefined?'—':Number(pair[1]).toLocaleString(),box);el('span',pair[0],box);});
    const equipmentRows=catalog('equipment').map(r=>{const level=ownedEquipment(idOf(r));return nameOf(r)+': '+(level===undefined?'—':level);});equipmentCurrent.textContent=equipmentRows.length?equipmentRows.join(' · '):'No equipment snapshot available.';
    const ts=state.talents;talentCurrent.textContent=Array.isArray(ts)?ts.filter(t=>t.isLock===true||t.unlocked===true).length+' unlocked talent records':ts&&typeof ts==='object'?Object.keys(ts).length+' talent records':'No talent snapshot available.';
    const progression=state.progression||state.progress||state;
    progressCurrent.textContent=progression.maxStage!==undefined?'Highest stage '+progression.maxStage+' · wave '+(progression.maxWave!==undefined?progression.maxWave:progression.maxOrder||0)+' · selected stage '+(progression.currentStage!==undefined?progression.currentStage:progression.curStage||1):'No progression snapshot available.';
    clear(inventoryView);const rows=[];
    Object.keys(currency).forEach(key=>rows.push({name:key,value:currency[key]}));
    list(state.items).forEach(item=>rows.push({name:nameOf(item),value:item.amount!==undefined?item.amount:item.count!==undefined?item.count:item.num!==undefined?item.num:0}));
    list(state.relics||state.treasures).forEach(item=>{const definition=catalog('relics').find(r=>String(idOf(r))===String(idOf(item)))||catalog('goods').find(r=>String(r.relicId)===String(idOf(item)));rows.push({name:definition?nameOf(definition):nameOf(item),value:item.level!==undefined?'Level '+item.level+(item.frame!==undefined?' · '+item.frame+' fragments':''):item.count!==undefined?item.count:displayValue(item)});});
    if(!rows.length)el('p','Start the test game, then refresh to inspect the managed player.',inventoryView,'test-note');
    else {const table=el('table',undefined,inventoryView,'test-table'),head=el('tr',undefined,table);el('th','Resource / item',head);el('th','Current value',head);rows.forEach(row=>{const tr=el('tr',undefined,table);el('td',row.name,tr);el('td',typeof row.value==='number'?row.value.toLocaleString():String(row.value),tr);});}
  }
  function displayValue(value){if(value===undefined)return '—';if(typeof value!=='object')return String(value);return Object.keys(value).map(k=>k+': '+value[k]).join(', ');}
  function apply(next){if(disposed)return;snapshot=next||{};target.textContent='Target: '+targetText();sessionStatus.textContent=snapshot.running?(snapshot.ready?(writable()?'Test game ready · all player commands target this managed profile.':'The managed game is running with Test Mode disabled. Enable test controls before granting items or changing progression.'):snapshot.message||'Managed test game is starting…'):'Test game is closed. Starting it resumes this managed profile; it does not reuse another Browser or Simulator player.';updateCatalog();readState();controls();if(snapshot.message&&!lastMessage)show(snapshot.message,false);schedule();}
  function schedule(){if(poll)clearTimeout(poll);poll=null;if(!disposed&&snapshot&&snapshot.running)poll=setTimeout(()=>readStatus(false),snapshot.ready?4000:1200);}
  async function readStatus(manual){if(disposed||busy)return;try{const result=await api.ipc('testing',{action:'status'});apply(result);if(manual)show('Read the current managed test player. No grants or reset were performed.',false);}catch(error){if(snapshot)snapshot=Object.assign({},snapshot,{ready:false});sessionStatus.textContent='Unable to verify the managed test player. Commands are disabled until status is available.';controls();show(error.message,true);if(snapshot&&snapshot.running)schedule();}}
  async function run(action,values){
    if(disposed||busy)return;if(['start','close'].indexOf(action)<0&&!writable()){show('Start the managed test game and wait until it is ready before changing the test player.',true);return;}
    busy=true;if(poll)clearTimeout(poll);poll=null;controls();show(action==='start'?'Starting the managed test game with audio muted…':'Applying '+action+' to the managed test player…',false);
    try{
      const result=await api.ipc('testing',Object.assign({action},values||{}));
      if(disposed)return;
      const status=result&&result.running!==undefined?result:await api.ipc('testing',{action:'status'});
      busy=false;apply(status);
      const detail=result&&result.result||result||{},backup=detail.backup||result&&result.backup;
      const skipped=detail.skipped||result&&result.skipped;
      show((detail.message||result&&result.message||'Completed '+action+' for the managed test player.')+(skipped&&skipped.length?'\nSkipped: '+skipped.map(x=>typeof x==='object'?nameOf(x)+(x.reason?' ('+x.reason+')':''):String(x)).join(', '):'')+(backup?'\nBackup: '+backup:''),false);
      if(action==='reset'){resetConfirm.hidden=true;resetInput.value='';bulkConfirm.hidden=true;}
    }catch(error){if(disposed)return;busy=false;controls();show(error.message,true);schedule();}
  }
  function reviewBulk(title,description,action){if(!writable()||busy)return;bulkTitle.textContent=title;bulkDescription.textContent=description+'\nTarget: '+targetText();bulkAction=action;bulkConfirm.hidden=false;bulkConfirm.scrollIntoView({block:'nearest'});controls();}
  function openReset(){if(!writable()||busy)return;resetTarget.textContent='Reset target: '+targetText()+'. A backup is created before saved data is cleared.';resetInput.value='';resetConfirm.hidden=false;resetNow.disabled=true;resetConfirm.scrollIntoView({block:'nearest'});resetInput.focus();}
  readStatus(false);
  return {update(next){if(next&&next.running!==undefined)apply(next);},destroy(){disposed=true;if(poll)clearTimeout(poll);poll=null;root.remove();}};
}
module.exports={mount,integer,idOf,nameOf};
