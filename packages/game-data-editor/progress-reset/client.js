'use strict';
const fs=require('fs'),path=require('path');
const style=require('../panel/control-theme')(fs.readFileSync(path.join(__dirname,'../testing/style.css'),'utf8'));
function mount(container,api){
  const root=el('div',undefined,container,'hkd-testing');
  el('h2','Reset all progress',root);
  el('p','Start again with the tutorial and Stage 1. Reset clears the selected player’s campaign, saved battles, currencies, equipment, talents, relics and rewards. Maps, buildings, balance tables and unsaved editor drafts are kept.',root,'test-note');
  const message=el('div','Opening this panel reads status only. Choose the player you want to reset.',root,'test-message');
  let disposed=false,busy=false,review=null;
  const controls=[];
  const browser=card('Browser preview');
  el('p','Uses the player saved in your default Browser. Close existing game tabs first. The reset page shows its origin and asks for confirmation before creating a backup and clearing progress.',browser,'test-note');
  const origin=el('select',undefined,browser);option(origin,'localhost','localhost · standard Cocos preview');option(origin,'127.0.0.1','127.0.0.1 · alternate preview');controls.push(origin);
  const browserActions=el('div',undefined,browser,'test-actions');
  button(browserActions,'Open Browser reset page',()=>run(async()=>{const result=await api.ipc('progress-reset',{action:'open-browser',hostname:origin.value});show(result.message);}));
  button(browserActions,'Cancel Browser reset link',()=>run(async()=>{const result=await api.ipc('progress-reset',{action:'cancel-browser'});show(result.message);}));
  const native=card('Simulator player');
  el('p','Close the Simulator before resetting. Select its jsb.sqlite save file; the tool checks the saved player before you confirm. Language and audio preferences are kept.',native,'test-note');
  const select=el('select',undefined,native);select.style.width='100%';select.style.maxWidth='100%';controls.push(select);
  const nativeActions=el('div',undefined,native,'test-actions');
  button(nativeActions,'Choose Simulator save…',()=>run(async()=>{const file=await api.ipc('progress-reset-pick');if(file){option(select,file,file);select.value=file;await inspect();}}));
  button(nativeActions,'Refresh selected player',()=>run(inspect));
  const detail=el('p','Choose the Simulator save file to inspect it.',native,'test-target');
  const confirmation=el('div',undefined,native,'test-confirm');confirmation.hidden=true;
  el('p','Type RESET to clear this Simulator player. A verified backup is created first.',confirmation);
  const input=el('input',undefined,confirmation);input.placeholder='RESET';input.autocomplete='off';controls.push(input);
  const nativeReset=button(confirmation,'Back up and reset Simulator player',()=>run(async()=>{
    if(!review||input.value!=='RESET')return;
    const result=await api.ipc('progress-reset',{action:'reset-native',file:review.file,revision:review.revision,confirm:input.value});
    show(result.message+(result.backup?'\nBackup: '+result.backup:''));input.value='';await inspect();
  }));
  nativeReset.disabled=true;
  input.oninput=()=>nativeReset.disabled=busy||!review||!review.records||input.value!=='RESET';
  select.onchange=()=>{review=null;confirmation.hidden=true;input.value='';nativeReset.disabled=true;detail.textContent='Refresh this player to review its reset.';};
  const managed=card('Managed test player');
  el('p','The Testing panel has its own separate player. Use its existing full reset action when testing in that window.',managed,'test-note');
  button(managed,'Open Testing panel',()=>api.ipc('open-panel','testing'));
  const footer=el('p','',root,'test-note');
  function el(tag,text,parent,cls){const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(cls)node.className=cls;if(parent)parent.appendChild(node);return node;}
  function option(node,value,label){if(Array.from(node.children).some(child=>child.value===value))return;const row=el('option',label,node);row.value=value;}
  function card(title){const node=el('section',undefined,root,'test-card test-gap');el('h3',title,node);return node;}
  function button(parent,label,action){const node=el('button',label,parent);node.type='button';node.onclick=action;controls.push(node);return node;}
  function show(text,error){if(disposed)return;message.textContent=text;message.className='test-message'+(error?' error':'');}
  async function run(action){if(busy||disposed)return;busy=true;controls.forEach(node=>node.disabled=true);try{await action();}catch(error){show(error.message,true);}finally{busy=false;if(!disposed){controls.forEach(node=>node.disabled=false);nativeReset.disabled=!review||!review.records||input.value!=='RESET';}}}
  async function inspect(){
    review=null;confirmation.hidden=true;input.value='';if(!select.value){detail.textContent='Choose a jsb.sqlite file from your Simulator save folder.';return;}
    const result=await api.ipc('progress-reset',{action:'inspect',file:select.value});if(disposed)return;
    review=result;detail.textContent=result.file+'\n'+result.records+' saved progress records. '+(result.records?'Confirm below to start again.':'No saved progression to reset.');confirmation.hidden=!result.records;
  }
  run(async()=>{const result=await api.ipc('progress-reset',{action:'status'});if(disposed)return;(result.files||[]).forEach(file=>option(select,file,file));footer.textContent='Verified backups are stored outside the project: '+result.backupRoot;if(result.browser&&result.browser.message)show(result.browser.message);if(select.value)await inspect();});
  return {destroy(){disposed=true;root.remove();api.ipc('progress-reset',{action:'cancel-browser'}).catch(()=>{});}};
}
module.exports={mount,style};
