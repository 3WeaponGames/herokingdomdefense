'use strict';
const Placement=require('./lib/placement');
const LabelScrub=require('./lib/label-scrub');
const CharacterOptions=require('./lib/character-options');
const Levels=require('./lib/character-levels');
function mount(host,api){
  const itemMode=api.kind==='items';
  const el=(tag,text,parent,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;if(parent)parent.appendChild(n);return n;};
  const root=el('section',undefined,host,'character-editor');
  root.tabIndex=-1;
  const header=el('header',undefined,root),heading=el('div',undefined,header);el('h1',itemMode?'Items':'Characters',heading);el('p',itemMode?'Fit hero gear. Keep current upgrades. Add new items when ready.':'Build a look. Fit the parts. Bring it into battle.',heading,'muted');
  const tools=el('div',undefined,header,'toolbar');
  const button=(parent,text,fn,cls)=>{const b=el('button',text,parent,cls);b.type='button';b.onclick=()=>{if(busy)return;return Promise.resolve().then(fn).catch(error=>message(error.message,true));};return b;};
  const newButton=button(tools,itemMode?'New item':'New character',createProfile),cloneButton=button(tools,'Duplicate',duplicateProfile),discardButton=button(tools,'Discard changes',discard),saveButton=button(tools,itemMode?'Save items':'Save characters',save,'primary');
  saveButton.title=(itemMode?'Save items':'Save characters')+' (Ctrl+S)';saveButton.setAttribute('aria-keyshortcuts','Control+S');
  const undoButton=button(tools,'Undo',()=>travel('undo')),redoButton=button(tools,'Redo',()=>travel('redo'));
  tools.insertBefore(undoButton,discardButton);tools.insertBefore(redoButton,discardButton);
  undoButton.title='Undo (Ctrl+Z)';redoButton.title='Redo (Ctrl+Shift+Z)';
  undoButton.setAttribute('aria-keyshortcuts','Control+z');redoButton.setAttribute('aria-keyshortcuts','Control+Shift+z');
  const reloadButton=button(tools,'Reload latest draft',reloadDraft);reloadButton.title='Replace this window’s draft with the latest shared draft. Does not save or discard another window’s work.';
  const body=el('div',undefined,root,'body'),library=el('aside',undefined,body,'library'),main=el('main',undefined,body),inspector=el('aside',undefined,body,'inspector');
  el('h2',itemMode?'HERO ITEMS':'CHARACTERS',library);const unitFilter=el('select',undefined,library);unitFilter.className='wide';unitFilter.setAttribute('aria-label','Character group');for(const group of ['All characters','Hero','Allies','Enemies']){const option=el('option',group,unitFilter);option.value=group==='All characters'?'':group;}const unitList=el('div',undefined,library,'look-list');unitList.style.marginTop='7px';
  const savedLooks=el('details',undefined,library);el('summary','Saved looks',savedLooks);const looks=el('div',undefined,savedLooks,'look-list');
  el('div',undefined,library,'divider');el('h2','PART LIBRARY',library);
  const search=el('input',undefined,library);search.type='search';search.placeholder='Search 678 parts…';search.setAttribute('aria-label','Search character parts');search.className='wide';
  const category=el('select',undefined,library);category.setAttribute('aria-label','Part category');category.className='wide';category.style.marginTop='7px';
  const count=el('div','',library,'assets-count'),gallery=el('div',undefined,library,'parts-grid');const more=button(library,'Show more parts',()=>{limit+=60;renderAssets();},'more');
  const previewTitle=el('div',undefined,main,'preview-title'),previewName=el('strong','Character preview',previewTitle);el('span','SILENT · PREVIEW ONLY',previewTitle,'badge');
  const previews=el('div',undefined,main,'previews');
  function canvasCard(label,overlay){const box=el('div',undefined,previews,'preview-card');el('span',label,box,'caption');const canvas=el('canvas',undefined,box);canvas.width=540;canvas.height=650;let handles=null;if(overlay){handles=el('canvas',undefined,box,'overlay');handles.width=540;handles.height=650;handles.setAttribute('aria-label','Drag selected character part');}return{box,canvas,handles};}
  const current=canvasCard('Current look',true);
  current.handles.tabIndex=0;
  current.handles.setAttribute('aria-keyshortcuts','Space');current.handles.title='Left drag: move part · Middle drag: pan · Right-click: select · Space: pause/play · Ctrl+wheel: zoom';
  const playback=el('div',undefined,main,'playback'),transport=el('div',undefined,playback,'row wrap');
  const play=button(transport,'Pause',()=>{playing=!playing;play.textContent=playing?'Pause':'Play';last=0;});
  play.title='Pause/play (Space when the preview is focused)';play.setAttribute('aria-keyshortcuts','Space');
  button(transport,'◀ Frame',()=>step(-1));button(transport,'Frame ▶',()=>step(1));
  const animation=el('select',undefined,transport);animation.setAttribute('aria-label','Preview animation');
  const speed=el('select',undefined,transport);for(const n of [.25,.5,1,2]){const o=el('option',n+'×',speed);o.value=n;}speed.value=1;speed.setAttribute('aria-label','Animation speed');
  const facing=button(transport,'Face left',()=>{direction*=-1;facing.textContent=direction===1?'Face left':'Face right';draw();});
  const zoom=el('select',undefined,transport);for(const n of [.25,.5,.75,1,1.5,2,3,4]){const o=el('option',Math.round(n*100)+'%',zoom);o.value=n;}zoom.value=1;zoom.setAttribute('aria-label','Preview zoom');zoom.title='Ctrl+mouse wheel over the preview to zoom';zoom.onchange=draw;
  function previewWheel(event){
    if(!(event.ctrlKey||event.metaKey)||event.altKey||!event.deltaY)return;
    event.preventDefault();event.stopPropagation();
    const delta=event.deltaY*(event.deltaMode===1?16:event.deltaMode===2?current.box.clientHeight:1);
    const value=Number(Math.max(.25,Math.min(4,Number(zoom.value)*Math.exp(-delta*.001))).toFixed(3));
    const previous=zoom.querySelector('[data-wheel-zoom]');if(previous)previous.remove();
    if(!Array.from(zoom.options).some(option=>Number(option.value)===value)){const option=el('option',Math.round(value*100)+'%',zoom);option.value=value;option.setAttribute('data-wheel-zoom','');}
    zoom.value=value;draw();
  }
  current.box.addEventListener('wheel',previewWheel,{passive:false});
  const options=el('div',undefined,playback,'row wrap');
  function check(parent,text,value,fn){const label=el('label',undefined,parent,'check-row'),input=el('input',undefined,label);input.type='checkbox';input.checked=value;el('span',text,label);input.onchange=()=>fn(input.checked);return input;}
  const bonesToggle=check(options,'Show anchor bones',false,draw);
  button(options,'Fit preview',()=>{viewPan={x:0,y:0};zoom.value=1;fitBounds(true);draw();});
  const position=el('span','0.000 s',options,'time'),scrub=el('input',undefined,playback,'timeline');scrub.type='range';scrub.min=0;scrub.max=1;scrub.step='any';scrub.value=0;scrub.setAttribute('aria-label','Animation position');
  el('p','Left drag moves equipment. Middle drag pans the preview. Right-click selects the part or model under the cursor.',main,'help');
  const footer=el('footer',undefined,root),status=el('span','Loading character library…',footer,'status'),saveState=el('span','',footer);
  let data=null,saved=null,version=0,parts=[],units=[],sources=[],assets={},selected='',virtual=null,selectedPart='',selectedAsset='',selectedModel='',rig=null,spine=null,layers=[],baseLayers=[],states=[],fittingKey='',poseBounds=null,token=0,disposed=false,playing=true,time=0,duration=1,last=0,raf=null,direction=1,limit=60,drag=null,stages=Promise.resolve(),lastSent='',stageError=null,busy=false;
  let canUndo=false,canRedo=false,scrubs=[];
  let viewPan={x:0,y:0},renderPan={x:0,y:0},panDrag=null,viewKey='';
  const images=new Map();let fittingRetryAfter=0,viewFitKey='';
  const clone=v=>JSON.parse(JSON.stringify(v));
  const profile=()=>data&&(data.profiles[selected]||virtual);
  const part=()=>!virtual&&profile()&&profile().parts.find(p=>p.id===selectedPart);
  const unitFor=p=>units.find(u=>u.type===p.base.type&&u.id===String(p.base.id));
  const assignmentKey=p=>Levels.key(unitFor(p),p.base.level);
  function message(text,error){status.textContent=text;status.classList.toggle('error',!!error);}
  function dirty(){const current=JSON.stringify(data),changed=current!==JSON.stringify(saved),pending=!!data&&current!==lastSent;saveState.textContent=changed?'● Unsaved draft':'All changes saved';saveButton.disabled=busy||!changed;discardButton.disabled=busy||!changed;undoButton.disabled=busy||!canUndo&&!pending;redoButton.disabled=busy||!canRedo||pending;return changed;}
  function historyState(result){canUndo=!!result.canUndo;canRedo=!!result.canRedo;dirty();}
  function setBusy(value){busy=value;root.querySelectorAll('input,select,button').forEach(control=>{control.disabled=value||control.hasAttribute('data-readonly');});dirty();}
  function stage(){
    if(!data)return stages;const value=JSON.stringify(data);if(value===lastSent)return stages;lastSent=value;const draft=clone(data);
    // Validation can fail for an intermediate draft. A corrected draft must
    // retry against the last accepted revision; conflicts still fail server-side.
    stages=stages.then(async()=>{const result=await api.ipc('change',{version,data:draft});version=result.version;const recovered=!!stageError;stageError=null;historyState(result);if(recovered&&lastSent===value)message('Draft updated. Changes remain unsaved until Save.');}).catch(error=>{stageError=error;if(lastSent===value)lastSent='';message(error.message+' Your local draft is still open.',true);});return stages;
  }
  function activateItem(){const p=profile();if(!itemMode||!p||virtual)return;const key=(unitFor(p)||{}).key;if(key)data.assignments[key]=selected;}
  function changed(refresh){activateItem();fittingKey='';dirty();if(refresh)renderInspector();draw();stage();}
  function unique(prefix,collection){let id=prefix,index=2;while(Object.prototype.hasOwnProperty.call(collection,id))id=prefix+'-'+index++;return id;}
  function createProfile(){if(!data)return;const id=unique(itemMode?'new-item':'new-character',data.profiles);const base=profile()?clone(profile().base):(itemMode?{type:'item',id:units[0].id}:{type:'ally',id:'90001'});data.profiles[id]={name:itemMode?'New item':'New character',base,scale:1,parts:[]};selectProfile(id);changed();}
  function duplicateProfile(){if(!profile())return;const id=unique((selected||'character')+'-copy',data.profiles);data.profiles[id]=clone(profile());data.profiles[id].name+=' copy';selectProfile(id);changed();}
  function removeProfile(){if(!profile())return;const id=selected;Object.keys(data.assignments).forEach(k=>{if(data.assignments[k]===id)delete data.assignments[k];});delete data.profiles[id];selectProfile(Object.keys(data.profiles)[0]||'');changed();}
  async function save(){
    if(!data||busy)return;finishGestures();setBusy(true);try{await stage();await stages;if(stageError)throw stageError;const result=await api.ipc('save',{version});version=result.version;data=clone(result.data);saved=clone(result.savedData);lastSent=JSON.stringify(data);historyState(result);renderInspector();renderLooks();message(result.result.warning||(result.result.saved?(itemMode?'Items saved and applied to the selected equipment tier.':'Characters saved. New and reloaded game sessions use these looks.'):'No changes to save.'));}finally{setBusy(false);}
  }
  async function acceptDraft(result,history){
    const before=data,base=profile()&&clone(profile().base),previousPart=selectedPart;
    version=result.version;data=clone(result.data);saved=clone(result.savedData);stageError=null;lastSent=JSON.stringify(data);historyState(result);
    const touched=history&&Object.keys(data.profiles).filter(id=>JSON.stringify(before.profiles[id])!==JSON.stringify(data.profiles[id]));
    const id=touched&&touched.includes(selected)?selected:touched&&touched[0]|| (data.profiles[selected]?selected:'');
    if(id){const restored=data.profiles[id].parts.find(p=>!(before.profiles[id]&&before.profiles[id].parts.some(old=>old.id===p.id)));await selectProfile(id,restored?restored.id:previousPart);}
    else{const unit=base&&units.find(u=>u.type===base.type&&u.id===String(base.id));if(unit)await selectUnit(unit,base.level);else await selectProfile(Object.keys(data.profiles)[0]||'');}
    dirty();
  }
  async function travel(action){
    if(!data||busy||disposed)return;finishGestures();setBusy(true);
    try{await stage();await stages;if(stageError)throw stageError;if(!(action==='undo'?canUndo:canRedo))return;token++;await acceptDraft(await api.ipc(action,{version}),true);message(action==='undo'?'Edit undone. Changes remain unsaved until Save.':'Edit restored. Changes remain unsaved until Save.');}
    catch(error){fittingKey='';await loadRig();throw error;}
    finally{setBusy(false);}
  }
  async function discard(){if(!data||busy)return;cancelGestures();token++;setBusy(true);try{await stages;await acceptDraft(await api.ipc('discard',{version}));message('Unsaved changes discarded.');}finally{setBusy(false);}}
  async function reloadDraft(){if(!data||busy)return;cancelGestures();token++;setBusy(true);try{await stages;await acceptDraft(await api.ipc('load'));message('Latest shared draft loaded. Changes still require Save.');}finally{setBusy(false);}}
  function editorKey(event){
    if(event.defaultPrevented||event.isComposing||event.altKey)return;
    const key=String(event.key).toLowerCase(),target=event.target,tag=String(target&&target.tagName||'').toLowerCase();
    if((event.code==='Space'||key===' ')&&!event.ctrlKey&&!event.metaKey&&!event.shiftKey&&current.box.contains(target)){
      event.stopPropagation();event.preventDefault();if(!event.repeat&&!busy)play.click();return;
    }
    if(key==='delete'&&!event.ctrlKey&&!event.metaKey&&!event.shiftKey){
      event.stopPropagation();
      if(target&&(target.isContentEditable||tag==='textarea'||tag==='input'&&!['range','color','checkbox','radio','button'].includes(target.type)))return;
      event.preventDefault();
      const remove=inspector.querySelector('[data-action="remove-part"]');
      if(!event.repeat&&remove&&!remove.disabled){remove.click();current.handles.focus({preventScroll:true});}
      return;
    }
    if(event.shiftKey&&!event.ctrlKey&&!event.metaKey&&/^(?:Digit|Numpad)[1-5]$/.test(event.code)){
      event.stopPropagation();
      if(target&&(target.isContentEditable||tag==='textarea'||tag==='input'&&!['range','color','checkbox','radio','button'].includes(target.type)))return;
      event.preventDefault();
      const p=profile(),unit=p&&unitFor(p),levels=Levels.levels(unit),level=Number(event.code.slice(-1));
      if(levels.length<=1||!levels.includes(level))return;
      if(!event.repeat&&!busy&&p.base.level!==level)selectUnit(unit,level).catch(error=>message(error.message,true));
      return;
    }
    if(!(event.ctrlKey||event.metaKey))return;
    if(key==='s'&&!event.shiftKey){
      event.stopPropagation();event.preventDefault();
      if(!event.repeat&&!busy&&!saveButton.disabled){const focus=current.box.contains(target)?current.handles:root;if(target&&typeof target.blur==='function')target.blur();saveButton.click();focus.focus({preventScroll:true});}
      return;
    }
    if(key==='a'&&!event.shiftKey){
      event.stopPropagation();
      // Keep Select All available while editing names, searches and numbers.
      if(target&&(target.isContentEditable||tag==='textarea'||tag==='input'&&!['range','color','checkbox','radio','button'].includes(target.type)))return;
      event.preventDefault();
      const add=inspector.querySelector('[data-action="add-part"]');
      if(!event.repeat&&add&&!add.disabled)add.click();
      return;
    }
    if(key!=='z')return;
    // Native text undo stays inside text fields. Never let this panel's
    // shortcut bubble into Creator's scene history, even with no draft edits.
    event.stopPropagation();
    if(target&&(target.isContentEditable||tag==='textarea'||tag==='input'&&!['number','range','color','checkbox','radio','button'].includes(target.type)))return;
    event.preventDefault();if(!event.repeat)travel(event.shiftKey?'redo':'undo').catch(error=>message(error.message,true));
  }
  root.addEventListener('keydown',editorKey,true);
  function renderLooks(){
    unitList.innerHTML='';for(const unit of units.filter(u=>!unitFilter.value||u.group===unitFilter.value)){const b=button(unitList,unit.group+' · '+unit.name,()=>selectUnit(unit));const p=profile();b.classList.toggle('selected',!!p&&p.base.type===unit.type&&String(p.base.id)===unit.id);if(data.assignments[unit.key]||Levels.levels(unit).some(level=>data.assignments[Levels.key(unit,level)]))el('span',' · Custom',b,'assigned');}
    looks.innerHTML='';if(!Object.keys(data.profiles).length)el('p',itemMode?'Create your first item.':'Create your first character look.',looks,'empty');for(const [id,p]of Object.entries(data.profiles)){const b=button(looks,p.name,()=>selectProfile(id));b.classList.toggle('selected',id===selected);if(Object.values(data.assignments).includes(id))el('span',' · In game',b,'assigned');}
  }
  unitFilter.onchange=renderLooks;
  async function selectUnit(unit,level){
    finishGestures();const exact=data.assignments[Levels.key(unit,level)];if(exact)return selectProfile(exact);
    const inherited=level&&data.profiles[data.assignments[unit.key]];
    selected='';virtual=inherited?clone(inherited):{name:unit.name,base:{type:unit.type,id:unit.id},scale:1,parts:[]};
    if(level){virtual.base.level=level;virtual.name=unit.name+' · Level '+level;}
    selectedPart=selectedAsset='';renderLooks();renderInspector();renderAssets();await loadRig();
  }
  function chooseCharacter(key){const unit=units.find(unit=>unit.key===key);if(!unit)return;const p=profile(),level=p&&p.base.level;return selectUnit(unit,Levels.levels(unit).includes(level)?level:undefined);}
  function editOriginal(){if(!virtual)return;const p=clone(virtual),id=unique(p.base.type+'-'+p.base.id.replace(/:/g,'-')+(p.base.level?'-level-'+p.base.level:''),data.profiles),key=assignmentKey(p);for(const name of ['baked','bakedLayers','bakedVersion','bakedWithHero'])delete p[name];data.profiles[id]=p;data.assignments[key]=id;selectProfile(id);changed();}
  function levelInspector(p){
    const unit=unitFor(p);if(itemMode||!Levels.levels(unit).length)return;
    const fieldLevel=field(inspector,'Level',p.base.level||0,value=>selectUnit(unit,Number(value)||undefined),[{value:0,label:'All levels (default)'},...Levels.levels(unit).map(level=>({value:level,label:'Level '+level}))]);fieldLevel.title='Shift+1 through Shift+5: switch to an available unit level';fieldLevel.setAttribute('aria-keyshortcuts',Levels.levels(unit).filter(level=>level<=5).map(level=>'Shift+'+level).join(' '));
  }
  function selectEquippedPart(id){
    selectedPart=id;const item=part();selectedAsset=item?item.sprite:'';if(!item)return;
    const asset=assets[item.sprite];if(!asset)return;
    const group=CharacterOptions.partCategory(asset),index=parts.filter(candidate=>CharacterOptions.partCategory(candidate)===group).findIndex(candidate=>candidate.id===asset.id);
    if(index<0)return;
    category.value=group;search.value='';limit=Math.max(60,Math.ceil((index+1)/60)*60);
  }
  async function selectProfile(id,preferredPart){finishGestures();virtual=null;selected=id;const p=profile();selectEquippedPart(p&&p.parts.some(part=>part.id===preferredPart)?preferredPart:p&&p.parts[0]?p.parts[0].id:'');renderLooks();renderInspector();renderAssets();await loadRig();}
  function installScrub(label,input,options){const cancel=LabelScrub.install(label,input,options);scrubs.push(cancel);return cancel;}
  function finishGestures(){for(const cancel of scrubs.slice())cancel.commit();finishPreviewDrag();finishPan();}
  function cancelGestures(){for(const cancel of scrubs.slice())cancel();finishPan();if(drag){const previous=drag;drag=null;previous.part.x=previous.x;previous.part.y=previous.y;releaseDrag(previous);}}
  function releaseDrag(previous){if(current.handles.hasPointerCapture(previous.pointer))current.handles.releasePointerCapture(previous.pointer);}
  function finishPreviewDrag(){if(!drag)return;const previous=drag;drag=null;releaseDrag(previous);renderInspector();activateItem();stage();}
  function field(parent,label,value,onChange,options){const wrap=el('label',undefined,parent,'field');el('span',label,wrap);const input=el(options?'select':'input',undefined,wrap);if(options){for(const item of options){const option=el('option',item.label===undefined?item.value:item.label,input);option.value=item.value;}}else input.type='text';input.value=value===undefined?'':value;input.setAttribute('aria-label',label);input.disabled=busy;input.onchange=()=>{if(!busy)onChange(input.value);};return input;}
  function tintField(parent,label,value,apply){const input=field(parent,label,value||'#ffffff',v=>{apply(v);changed();});input.type='color';input.oninput=()=>{apply(input.value);fittingKey='';dirty();draw();};return input;}
  function number(parent,label,key,value,step,min,max,after){
    const isScale=['scaleX','scaleY'].includes(key),valid=n=>Number.isFinite(n)&&n>=min&&n<=max&&(key!=='order'||Number.isInteger(n))&&(!isScale||Math.abs(n)>=.01);
    const apply=n=>{const p=part();if(!p||!valid(n))return false;if(isScale&&p.lockAspect!==false){const other=key==='scaleX'?'scaleY':'scaleX',next=p[other]*Math.abs(n/p[key]);if(Math.abs(next)<.01||Math.abs(next)>20)return false;p[other]=next;const sibling=inspector.querySelector('[aria-label="'+(other==='scaleX'?'Scale X':'Scale Y')+'"]');if(sibling)sibling.value=Number(next.toFixed(5));}p[key]=n;return true;};
    const input=field(parent,label,value,v=>{const n=Number(v);if(!apply(n)){input.value=part()[key];return;}if(after)after(n);changed();});input.type='number';input.step=step;input.min=min;input.max=max;input.oninput=()=>{if(input.value===''||!apply(Number(input.value)))return;fittingKey='';dirty();draw();};installScrub(input.parentElement.querySelector('span'),input,{step,min,max,scale:isScale,integer:key==='order',begin(){const p=part();return{[key]:p[key],...(isScale?{scaleX:p.scaleX,scaleY:p.scaleY}:{})};},cancel(snapshot){Object.assign(part(),snapshot);input.value=snapshot[key];if(isScale){const other=key==='scaleX'?'scaleY':'scaleX',sibling=inspector.querySelector('[aria-label="'+(other==='scaleX'?'Scale X':'Scale Y')+'"]');if(sibling)sibling.value=snapshot[other];}fittingKey='';dirty();draw();},preview(){input.oninput();},commit(){input.onchange();}});return input;
  }
  async function chooseHorse(value){
    const p=profile(),serial=++token,base=clone(p.base);if(value)base.mount=value;else delete base.mount;
    try{
      const next=await api.ipc('describe',base);if(disposed||serial!==token||p!==profile())return;
      const old=rig&&rig.layers.find(l=>l.mount),mount=next.layers.find(l=>l.mount),model=old&&p.models&&p.models[old.uuid];
      if(old){if(p.models)delete p.models[old.uuid];if(p.skins)delete p.skins[old.uuid];p.parts=p.parts.filter(part=>part.layer!==old.uuid);}
      if(mount&&model){p.models=p.models||{};p.models[mount.uuid]=model;}
      p.base=base;if(!p.parts.some(part=>part.id===selectedPart))selectedPart=p.parts[0]&&p.parts[0].id||'';
      changed();await loadRig();
    }catch(error){message(error.message,true);renderInspector();}
  }
  function modelInspector(p){
    if(!rig)return;const section=el('details',undefined,inspector,'model-settings');section.open=itemMode||!!p.base.mount;el('summary',p.base.mount?'Adjust rider & horse':'Adjust original model',section);
    if(!rig.layers.some(l=>l.uuid===selectedModel))selectedModel=rig.defaultLayer||rig.layers[0].uuid;
    field(section,'Original model layer',selectedModel,v=>{selectedModel=v;renderInspector();},rig.layers.map(l=>({value:l.uuid,label:l.name})));
    const layer=rig.layers.find(l=>l.uuid===selectedModel),isCurrent=()=>profile()===p&&rig&&rig.layers.some(l=>l.uuid===layer.uuid);
    field(section,'Original model skin',p.skins&&p.skins[layer.uuid]||'',v=>{if(!isCurrent())return;p.skins=p.skins||{};if(v)p.skins[layer.uuid]=v;else delete p.skins[layer.uuid];changed();},[{value:'',label:'Original skin'},...layer.skins.map(s=>({value:s,label:s}))]);
    const grid=el('div',undefined,section,'grid-2'),model=p.models&&p.models[layer.uuid]||{};
    tintField(section,'Model tint',model.tint,value=>{if(!isCurrent())return;p.models=p.models||{};p.models[layer.uuid]=p.models[layer.uuid]||{};p.models[layer.uuid].tint=value;});
    for(const [key,label,initial,min,max,step]of [['x','Model X',0,-4096,4096,.1],['y','Model Y',0,-4096,4096,.1],['scaleX','Model scale X',1,.01,20,.05],['scaleY','Model scale Y',1,.01,20,.05],['rotation','Model rotation',0,-3600,3600,1],['opacity','Model opacity',1,0,1,.05]]){
      const apply=value=>{const n=Number(value);if(!isCurrent()||value===''||!Number.isFinite(n)||n<min||n>max)return false;p.models=p.models||{};p.models[layer.uuid]=p.models[layer.uuid]||{};p.models[layer.uuid][key]=n;dirty();draw();return true;};
      const input=field(grid,label,model[key]===undefined?initial:model[key],value=>{if(!isCurrent())return;if(!apply(value))input.value=(p.models&&p.models[layer.uuid]||{})[key]===undefined?initial:p.models[layer.uuid][key];activateItem();stage();});input.type='number';input.min=min;input.max=max;input.step=step;input.oninput=()=>apply(input.value);installScrub(input.parentElement.querySelector('span'),input,{step,min,max,scale:key==='scaleX'||key==='scaleY',begin:()=>p.models===undefined?null:clone(p.models),cancel(snapshot){if(!isCurrent())return;if(snapshot===null)delete p.models;else p.models=snapshot;dirty();draw();},preview(){input.oninput();},commit(){input.onchange();}});
    }
    button(section,'Reset original model',()=>{if(p.models)delete p.models[layer.uuid];if(p.skins)delete p.skins[layer.uuid];changed(true);});
  }
  function renderInspector(){
    const previous=scrubs;scrubs=[];for(const cancel of previous)cancel();
    inspector.innerHTML='';const p=profile();if(!p){el('p','Create a character to start fitting parts.',inspector,'empty');return;}
    if(virtual){
      el('h2',p.name,inspector);el('p',p.base.level?'Uses the default appearance':itemMode?'Current equipment appearance':'Original appearance',inspector,'muted');
      if(!itemMode&&p.base.type==='ally'){
        field(inspector,'Base character',(unitFor(p)||{}).key,chooseCharacter,units.map(u=>({value:u.key,label:u.group+' · '+u.name})));
        const modelField=field(inspector,'Base model',p.base.source||'',()=>{},[{value:'',label:'Current unit model'},...CharacterOptions.characterSources(sources,p.base.source).map(source=>({value:source.id,label:source.name}))]);modelField.disabled=true;modelField.setAttribute('data-readonly','');
        levelInspector(p);
      }
      button(inspector,p.base.level?'Customize level '+p.base.level:itemMode?'Edit this item':'Edit this character',editOriginal,'primary wide');el('p',p.base.level?'Create an independent draft from the default look, then fit this level’s equipment. Save characters publishes your changes.':itemMode?'Browse freely. Create a draft to adjust this item or fit new parts.':'Browse freely. Create an appearance draft to adjust this character or fit new parts.',inspector,'help');return;
    }
    el('h2',itemMode?'ITEM':'CHARACTER',inspector);const nameInput=field(inspector,itemMode?'Item name':'Character name',p.name,v=>{p.name=v.trim()||p.name;renderLooks();previewName.textContent=p.name;changed();});nameInput.oninput=()=>{if(!nameInput.value.trim()||nameInput.value.length>100)return;p.name=nameInput.value;renderLooks();previewName.textContent=p.name;dirty();};
    field(inspector,itemMode?'Equipment tier':'Base character',(unitFor(p)||{}).key,itemMode?v=>{const unit=units.find(u=>u.key===v);p.base={type:unit.type,id:unit.id};Object.keys(data.assignments).forEach(k=>{if(data.assignments[k]===selected)delete data.assignments[k];});changed();renderLooks();renderInspector();loadRig();}:chooseCharacter,units.map(u=>({value:u.key,label:u.group+' · '+u.name+' '+(u.id==='hero'?'':u.id)})));
    if(!itemMode&&p.base.type!=='hero'&&(sources.length||p.base.type==='ally'))field(inspector,'Base model',p.base.source||'',value=>{
      if(value)p.base.source=value;else delete p.base.source;
      delete p.base.mount;
      p.parts=[];p.skins={};p.models={};p.faceless=value.startsWith('character-maker/');selectedPart='';
      changed();loadRig();
    },[{value:'',label:'Current unit model'},...CharacterOptions.characterSources(sources,p.base.source).map(source=>({value:source.id,label:(source.pack==='character-maker'?'Character Maker':'Current saved monster')+' · '+source.name}))]);
    levelInspector(p);
    if(!itemMode&&p.base.source&&p.base.source.startsWith('character-maker/'))field(inspector,'Horse',p.base.mount||'',chooseHorse,[{value:'',label:'No horse'},{value:'legacy-cavalry',label:'Original cavalry horse'},{value:'hero-horse',label:'Hero horses (choose a skin below)'}]);
    if(!itemMode&&rig&&rig.layers.some(layer=>layer.json.slots.some(slot=>api.core.isFacialSlot(slot.name)))){
      check(inspector,'Faceless (hide eyes)',!!p.faceless,value=>{p.faceless=value;changed();});
      el('p','Hide only the eyes through every animation. Beards, hair, eyebrows and other parts stay visible.',inspector,'help');
    }
    if(!itemMode&&api.core.skinTint(p)){
      const value=api.core.skinTint(p),presets=CharacterOptions.skinTones.slice();if(!presets.some(preset=>preset.value===value))presets.unshift({value,label:'Custom'});
      let picker;const tone=field(inspector,'Skin tone',value,v=>{p.skinTint=v;if(picker)picker.value=v;changed();},presets);
      picker=tintField(inspector,'Skin tint',value,v=>{p.skinTint=v;if(!presets.some(preset=>preset.value===v)){let custom=Array.from(tone.options).find(option=>option.textContent==='Custom');if(!custom)custom=el('option','Custom',tone);custom.value=v;}tone.value=v;});
      el('p','Colors the exposed head and body only. Armor, weapons, hair and beards keep their own colors.',inspector,'help');
    }
    const size=field(inspector,'Character size',p.scale===undefined?1:p.scale,v=>{const n=Number(v);if(!Number.isFinite(n)||n<.1||n>4){size.value=p.scale||1;return;}p.scale=n;changed();});size.type='number';size.min=.1;size.max=4;size.step=.05;if(itemMode)size.parentElement.hidden=true;
    if(!itemMode)check(inspector,p.base.level?'Use this look for level '+p.base.level:'Use this look for this unit',data.assignments[assignmentKey(p)]===selected,value=>{const key=assignmentKey(p);if(value)data.assignments[key]=selected;else if(data.assignments[key]===selected)delete data.assignments[key];renderLooks();changed();});
    if(p.base.level)button(inspector,'Use default for this level',async()=>{const unit=unitFor(p);delete data.assignments[assignmentKey(p)];changed();await selectUnit(unit,p.base.level);});
    el('p',itemMode?'Saving an edited item applies it to this tier. Existing stats, upgrade cost and unlocks are preserved.':'Appearance only. Combat stats and attack timing stay in the Units tool.',inspector,'help');if(itemMode)button(inspector,'Edit stats and upgrades',()=>api.openEquipment?api.openEquipment():message('Open Tools → Hero Kingdom Defense → Equipment in Creator.'));
    modelInspector(p);
    const rows=el('div',undefined,inspector,'part-list');p.parts.forEach(item=>{const b=button(rows,'',()=>{selectEquippedPart(item.id);renderInspector();renderAssets();draw();const selectedButton=inspector.querySelector('.part-list button.selected');if(selectedButton)selectedButton.focus({preventScroll:true});});b.classList.toggle('selected',item.id===selectedPart);const image=el('img',undefined,b);image.src=api.image(assets[item.sprite].thumbnail);el('span',item.id,b);});
    const add=el('div',undefined,inspector,'row'),addButton=button(add,'Add selected part',addPart);addButton.setAttribute('data-action','add-part');addButton.setAttribute('aria-keyshortcuts','Control+A');addButton.title='Add selected part (Ctrl+A)';
    const removeButton=button(add,'Remove part',()=>{if(!part())return;p.parts.splice(p.parts.indexOf(part()),1);selectedPart=(p.parts[0]&&p.parts[0].id)||'';changed(true);});removeButton.setAttribute('data-action','remove-part');removeButton.setAttribute('aria-keyshortcuts','Delete');removeButton.title='Remove selected part (Delete)';
    const currentPart=part();if(!currentPart){el('p','Choose a part in the library, then Add selected part.',inspector,'help');button(inspector,itemMode?'Delete item':'Delete character',removeProfile,'danger');return;}
    el('div',undefined,inspector,'divider');el('h2','FIT SELECTED PART',inspector);
    const a=assets[currentPart.sprite],assetBox=el('div',undefined,inspector,'selected-asset'),img=el('img',undefined,assetBox);img.src=api.image(a.thumbnail);el('span',a.name,assetBox);
    tintField(inspector,'Part tint',currentPart.tint,value=>{currentPart.tint=value;});
    el('p','Tint multiplies the existing colors and keeps black outlines dark. White resets the tint.',inspector,'help');
    button(inspector,'Use library selection',()=>{if(!assets[selectedAsset])return;currentPart.sprite=selectedAsset;fitPart(false);changed(true);});
    if(!rig)return;
    field(inspector,'Model layer',currentPart.layer,v=>{const l=rig.layers.find(l=>l.uuid===v);currentPart.layer=v;currentPart.slot=l.json.slots[0].name;currentPart.bone=l.json.bones[0].name;currentPart.hideSlots=[];changed(true);},rig.layers.map(l=>({value:l.uuid,label:l.name})));
    const layer=rig.layers.find(l=>l.uuid===currentPart.layer);if(!layer)return;
    field(inspector,'Replace slot',currentPart.slot,v=>{currentPart.slot=v;currentPart.hideSlots=currentPart.hideSlots.filter(s=>s!==v);changed(true);},layer.json.slots.map(s=>({value:s.name,label:s.name+' · '+s.bone})));
    field(inspector,'Anchor bone',currentPart.bone,v=>{currentPart.bone=v;changed();},layer.json.bones.map(b=>({value:b.name,label:b.name})));
    field(inspector,'Base skin',p.skins&&p.skins[layer.uuid]||'',v=>{p.skins=p.skins||{};if(v)p.skins[layer.uuid]=v;else delete p.skins[layer.uuid];changed();},[{value:'',label:'Original skin'},...layer.skins.map(s=>({value:s,label:s}))]);
    const positions=el('div',undefined,inspector,'grid-2');number(positions,'Offset X','x',currentPart.x,.1,-4096,4096);number(positions,'Offset Y','y',currentPart.y,.1,-4096,4096);
    const scales=el('div',undefined,inspector,'grid-2');number(scales,'Scale X','scaleX',currentPart.scaleX,.05,-20,20);number(scales,'Scale Y','scaleY',currentPart.scaleY,.05,-20,20);
    check(inspector,'Keep proportions',currentPart.lockAspect!==false,value=>{currentPart.lockAspect=value;changed();});
    const angles=el('div',undefined,inspector,'grid-2');number(angles,'Rotation','rotation',currentPart.rotation,1,-3600,3600);number(angles,'Opacity','opacity',currentPart.opacity,.05,0,1);
    number(inspector,'Draw order offset','order',currentPart.order,1,-layer.json.slots.length,layer.json.slots.length);
    const fit=el('div',undefined,inspector,'row wrap');button(fit,'Fit to slot',fitPart);button(fit,'Flip X',()=>{currentPart.scaleX*=-1;changed(true);});button(fit,'Flip Y',()=>{currentPart.scaleY*=-1;changed(true);});
    el('h3','Hide original pieces',inspector);const hides=el('div',undefined,inspector,'slot-hides');for(const slot of layer.json.slots.filter(s=>s.name!==currentPart.slot&&!p.parts.some(other=>other!==currentPart&&other.layer===layer.uuid&&other.slot===s.name)))check(hides,slot.name,currentPart.hideSlots.includes(slot.name),value=>{currentPart.hideSlots=value?currentPart.hideSlots.concat(slot.name):currentPart.hideSlots.filter(s=>s!==slot.name);changed();});
    el('p','Use a free slot to add a piece, or replace an existing piece. Draw order moves it in front or behind other parts.',inspector,'help');button(inspector,itemMode?'Delete item':'Delete character',removeProfile,'danger');
  }
  function renderAssets(){
    const filter=search.value.trim().toLowerCase(),selectedCategory=category.value;
    const found=parts.filter(p=>(!selectedCategory||CharacterOptions.partCategory(p)===selectedCategory)&&(!filter||(p.name+' '+p.id).toLowerCase().includes(filter)));
    count.textContent=found.length+' parts · '+(selectedAsset?assets[selectedAsset].name:'select a part');gallery.innerHTML='';
    for(const asset of found.slice(0,limit)){const b=button(gallery,'',()=>{selectedAsset=asset.id;renderAssets();const selectedTile=gallery.querySelector('.asset-tile.selected');if(selectedTile)selectedTile.focus({preventScroll:true});});b.className='asset-tile'+(selectedAsset===asset.id?' selected':'');b.title=asset.name;b.setAttribute('aria-label',asset.name);const image=el('img',undefined,b);image.loading='lazy';image.src=api.image(asset.thumbnail);image.alt=asset.name;}
    more.hidden=found.length<=limit;
  }
  search.oninput=()=>{limit=60;renderAssets();};category.onchange=()=>{limit=60;renderAssets();};
  function slotScore(slot,category){
    const attachment=slot&&slot.getAttachment();if(!attachment)return -1;const v=[];
    if(attachment instanceof spine.RegionAttachment)attachment.computeWorldVertices(slot.bone,v,0,2);else if(attachment instanceof spine.MeshAttachment)attachment.computeWorldVertices(slot,0,attachment.worldVerticesLength,v,0,2);else return -1;
    const xs=v.filter((_,i)=>i%2===0),ys=v.filter((_,i)=>i%2),x=(Math.min(...xs)+Math.max(...xs))/2,w=Math.max(...xs)-Math.min(...xs),h=Math.max(...ys)-Math.min(...ys);
    return w*h*(category==='Helmet'?1/(1+Math.abs(x)/20):category.includes('Hand')?1+Math.abs(x)/20:1);
  }
  function anchorFor(slot){
    const attachment=slot&&slot.getAttachment();if(!attachment||!attachment.bones)return slot.bone.data.name;
    const scores={},bones=attachment.bones,vertices=attachment.vertices;let b=0,v=0;
    while(b<bones.length){const count=bones[b++];for(let i=0;i<count;i++){const id=bones[b++];scores[id]=(scores[id]||0)+vertices[v+2];v+=3;}}
    const id=Object.keys(scores).sort((a,b)=>scores[b]-scores[a])[0];return id===undefined?slot.bone.data.name:slot.bone.skeleton.bones[Number(id)].data.name;
  }
  function addPart(){
    const p=profile(),asset=assets[selectedAsset];if(virtual){message(itemMode?'Click Edit this item to start a draft.':'Click Edit this character to start an appearance draft.');return;}if(!p||!asset||!rig){message('Select a library part first.');return;}
    const layer=Placement.layerFor(rig,asset),used=new Set(p.parts.filter(v=>v.layer===layer.uuid).map(v=>v.slot));
    const shown=baseLayers.find(l=>l.description.uuid===layer.uuid),intended=Placement.socket(layer,asset);
    if(intended&&used.has(intended.name)){const existing=p.parts.find(v=>v.layer===layer.uuid&&v.slot===intended.name);existing.sprite=asset.id;if(Placement.compatible(intended))Object.assign(existing,Placement.intended(asset));selectedPart=existing.id;fitPart(false);changed(true);return;}
    let candidates=layer.json.slots.filter(s=>!used.has(s.name));if(shown)candidates=candidates.sort((a,b)=>slotScore(shown.skeleton.findSlot(b.name),asset.category)-slotScore(shown.skeleton.findSlot(a.name),asset.category));const available=intended||candidates[0];if(!available)throw Error('Every slot on this model is already used.');
    const id=unique(asset.category.split('/').pop().toLowerCase(),Object.fromEntries(p.parts.map(v=>[v.id,true])));
    p.parts.push({id,sprite:asset.id,layer:layer.uuid,slot:available.name,bone:Placement.compatible(intended)?available.bone:shown?anchorFor(shown.skeleton.findSlot(available.name)):available.bone,x:0,y:0,rotation:0,scaleX:1,scaleY:1,opacity:1,order:0,hideSlots:[],forceVisible:!!intended});selectedPart=id;fitPart(false);changed(true);
  }
  function imageFor(asset){const source=api.image(asset.image);if(!images.has(source)){const promise=new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(Error('Cannot load part '+asset.name));img.src=source;}).catch(error=>{if(images.get(source)===promise)images.delete(source);throw error;});images.set(source,promise);}return images.get(source);}
  async function loadRig(){
    const p=profile(),serial=++token;states.forEach(api.core.restore);states=[];layers=baseLayers=[];rig=null;selectedModel='';fittingRetryAfter=0;viewFitKey='';if(!p)return;message('Loading '+p.name+'…');previewName.textContent=p.name;
    const nextViewKey=JSON.stringify(p.base);if(viewKey!==nextViewKey){viewPan={x:0,y:0};viewKey=nextViewKey;}
    try{const description=await api.ipc('describe',p.base);if(serial!==token||disposed)return;rig=description;spine=api.runtime(description);
      const result=await Promise.all([api.renderer.createLayers(spine,description.layers),api.renderer.createLayers(spine,description.layers)]);if(serial!==token||disposed)return;
      layers=result[0];baseLayers=result[1];fittingKey='';states=[];animation.innerHTML='';const names=[...new Set([].concat.apply([],description.layers.map(l=>l.animations)))];for(const name of names){const option=el('option',name,animation);option.value=name;}animation.value=names.includes('idle')?'idle':names[0];time=0;updateDuration();fitBounds();renderInspector();draw();message('Ready · '+parts.length+' imported parts. Changes remain drafts until Save.');
    }catch(error){if(serial===token)message(error.message,true);}
  }
  function updateDuration(){duration=Math.max(1/30,...layers.map(l=>(l.data.findAnimation(animation.value)||{}).duration||0));scrub.max=duration;time=Math.min(time,duration);}
  function scaleLayers(list,multiplier,models){for(const layer of list){const source=rig.layers.find(l=>l.uuid===layer.description.uuid),m=models&&models[source.uuid]||{};layer.description={...source,x:source.x*multiplier+(m.x||0),y:source.y*multiplier+(m.y||0),rotation:m.rotation||0,opacity:m.opacity===undefined?1:m.opacity,scaleX:source.scaleX*multiplier*(m.scaleX===undefined?1:m.scaleX),scaleY:source.scaleY*multiplier*(m.scaleY===undefined?1:m.scaleY)};}}
  function fitBounds(includeCurrent){if(!spine||!layers.length)return;api.renderer.seek(spine,baseLayers,'idle',0,false);let b=api.renderer.bounds(spine,baseLayers);if(includeCurrent){const c=api.renderer.bounds(spine,layers);b={minX:Math.min(b.minX,c.minX),minY:Math.min(b.minY,c.minY),maxX:Math.max(b.maxX,c.maxX),maxY:Math.max(b.maxY,c.maxY)};b.width=b.maxX-b.minX;b.height=b.maxY-b.minY;}poseBounds={...b,minX:b.minX-12,minY:b.minY-3,maxX:b.maxX+12,maxY:b.maxY+18,width:b.width+24,height:b.height+21};}
  function prepareFitting(){
    const p=profile();if(!p||!layers.length||Date.now()<fittingRetryAfter)return;
    const signature=JSON.stringify([p.parts,p.skins||{},!!p.faceless,api.core.skinTint(p)]);if(signature===fittingKey)return;
    const serial=token,sprites=[...new Set(p.parts.map(v=>v.sprite))];
    fittingKey=signature;
    Promise.all(sprites.map(async id=>[id,await imageFor(assets[id])])).then(loaded=>{if(disposed||serial!==token||signature!==fittingKey)return;
      states.forEach(api.core.restore);const textures=Object.fromEntries(loaded.map(([id,img])=>[id,new spine.FakeTexture(img)]));
      states=layers.map(l=>api.core.prepare(spine,l.skeleton,p.parts.filter(v=>v.layer===l.description.uuid),assets,textures,{faceless:!!p.faceless,skinTint:api.core.skinTint(p)}));draw();const shape=JSON.stringify(p.parts.map(part=>[part.id,part.sprite,part.layer]));if(!drag&&shape!==viewFitKey){viewFitKey=shape;fitBounds(true);draw();}
    }).catch(error=>{if(!disposed&&serial===token&&signature===fittingKey){fittingKey='';fittingRetryAfter=Date.now()+1000;message(error.message,true);}});
  }
  function draw(){
    if(disposed||!layers.length||!profile())return;
    try{
      const p=profile();scaleLayers(layers,p.scale||1,p.models);scaleLayers(baseLayers,1);
      for(const layer of layers){const tint=(p.models&&p.models[layer.description.uuid]||{}).tint||'#ffffff';layer.skeleton.color.set(parseInt(tint.slice(1,3),16)/255,parseInt(tint.slice(3,5),16)/255,parseInt(tint.slice(5,7),16)/255,1);}
      for(const layer of layers){const skin=p.skins&&p.skins[layer.description.uuid]||rig.layers.find(l=>l.uuid===layer.description.uuid).skin;if(layer.data.findSkin(skin)&&(layer.skeleton.skin||{}).name!==skin)layer.skeleton.setSkinByName(skin);}
      states.forEach(api.core.restore);api.renderer.seek(spine,layers,animation.value,time,true);api.renderer.seek(spine,baseLayers,animation.value,time,true);prepareFitting();states.forEach(api.core.apply);
      resizeCanvases();
      const options={width:current.canvas.width,height:current.canvas.height,bounds:poseBounds,zoom:Number(zoom.value),facing:direction,panX:renderPan.x,panY:renderPan.y};
      api.renderer.drawCanvas(spine,current.canvas,layers,options);drawHandles();position.textContent=time.toFixed(3)+' s';scrub.value=time;
    }catch(error){message(error.message,true);}
  }
  function resizeCanvases(){const ratio=Math.min(2,typeof devicePixelRatio==='number'?devicePixelRatio:1),rect=current.box.getBoundingClientRect(),width=Math.max(2,Math.round((rect.width-2)*ratio)),height=Math.max(2,Math.round((rect.height-2)*ratio));for(const canvas of [current.canvas,current.handles])if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height;}const screen=current.handles.getBoundingClientRect();renderPan={x:viewPan.x*width/Math.max(1,screen.width),y:viewPan.y*height/Math.max(1,screen.height)};}
  function projectPoint(layer,point){const box=poseBounds,w=current.canvas.width,h=current.canvas.height,scale=Math.min((w-32)/box.width,(h-24)/box.height)*Number(zoom.value),p=api.renderer.transformPoint(layer.description,point.x,point.y);return {x:(p.x-(box.minX+box.maxX)/2)*scale*direction+w/2+renderPan.x,y:h-12+box.minY*scale-p.y*scale+renderPan.y};}
  function worldPoint(screen){const box=poseBounds,w=current.canvas.width,h=current.canvas.height,s=Math.min((w-32)/box.width,(h-24)/box.height)*Number(zoom.value);return{x:(screen.x-w/2-renderPan.x)/(s*direction)+(box.minX+box.maxX)/2,y:(h-12+box.minY*s+renderPan.y-screen.y)/s};}
  function localPoint(layer,bone,screen){const point=worldPoint(screen),at=api.renderer.inversePoint(layer.description,point.x,point.y),p=new spine.Vector2(at.x,at.y);bone.worldToLocal(p);return p;}
  function drawHandles(){
    const ctx=current.handles.getContext('2d');ctx.clearRect(0,0,current.handles.width,current.handles.height);const selectedPartObject=part();
    if(bonesToggle.checked)for(const layer of layers)for(const bone of layer.skeleton.bones){const p=projectPoint(layer,{x:bone.worldX,y:bone.worldY});ctx.fillStyle=selectedPartObject&&bone.data.name===selectedPartObject.bone?'#ffcf74':'#8cadd5';ctx.beginPath();ctx.arc(p.x,p.y,selectedPartObject&&bone.data.name===selectedPartObject.bone?4:2.5,0,Math.PI*2);ctx.fill();if(selectedPartObject&&bone.data.name===selectedPartObject.bone){ctx.font='13px Arial';ctx.fillText(bone.data.name,p.x+7,p.y-5);}}
    if(!selectedPartObject)return;const layer=layers.find(l=>l.description.uuid===selectedPartObject.layer),slot=layer&&layer.skeleton.findSlot(selectedPartObject.slot),attachment=slot&&slot.getAttachment();if(!(attachment instanceof spine.RegionAttachment)||!attachment._characterBone)return;
    const vertices=[];attachment.computeWorldVertices(slot.bone,vertices,0,2);ctx.strokeStyle='#ffcf74';ctx.lineWidth=1.5;ctx.setLineDash([6,4]);ctx.beginPath();for(let i=0;i<8;i+=2){const p=projectPoint(layer,{x:vertices[i],y:vertices[i+1]});i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y);}ctx.closePath();ctx.stroke();ctx.setLineDash([]);
  }
  function screenPoint(event){const box=current.handles.getBoundingClientRect();return {x:(event.clientX-box.left)*current.handles.width/box.width,y:(event.clientY-box.top)*current.handles.height/box.height};}
  function finishPan(){if(!panDrag)return;const previous=panDrag;panDrag=null;current.handles.style.cursor='';releaseDrag(previous);}
  function pickPreview(event){
    if(!layers.length||!poseBounds||virtual)return;finishGestures();
    const hit=api.renderer.hitTest(spine,layers,worldPoint(screenPoint(event)));if(!hit)return;
    const selectedPartObject=profile().parts.find(p=>p.layer===hit.layer.description.uuid&&p.slot===hit.slot);
    selectedModel=hit.layer.description.uuid;if(selectedPartObject)selectEquippedPart(selectedPartObject.id);else selectedPart='';
    renderInspector();renderAssets();draw();
    const model=inspector.querySelector('.model-settings');if(!selectedPartObject&&model){model.open=true;model.scrollIntoView({block:'nearest'});}else{const row=inspector.querySelector('.part-list button.selected');if(row)row.scrollIntoView({block:'nearest'});}
    current.handles.focus({preventScroll:true});
  }
  current.handles.onpointerdown=event=>{
    if(busy)return;current.handles.focus({preventScroll:true});
    if(event.button===2){event.preventDefault();pickPreview(event);return;}
    if(event.button===1){event.preventDefault();if(drag||panDrag)return;panDrag={pointer:event.pointerId,start:{x:event.clientX,y:event.clientY},x:viewPan.x,y:viewPan.y};current.handles.style.cursor='grabbing';current.handles.setPointerCapture(event.pointerId);return;}
    if(event.button!==0||panDrag||drag||!part()||!layers.length)return;
    event.preventDefault();const p=part(),layer=layers.find(l=>l.description.uuid===p.layer),bone=layer.skeleton.findBone(p.bone);drag={pointer:event.pointerId,part:p,layer,bone,start:localPoint(layer,bone,screenPoint(event)),x:p.x,y:p.y};current.handles.setPointerCapture(event.pointerId);
  };
  current.handles.onpointermove=event=>{
    if(panDrag&&event.pointerId===panDrag.pointer){if(!(event.buttons&4)){finishPan();return;}viewPan={x:panDrag.x+event.clientX-panDrag.start.x,y:panDrag.y+event.clientY-panDrag.start.y};draw();return;}
    if(!drag||event.pointerId!==drag.pointer||!part())return;if(!(event.buttons&1)||event.buttons&4){finishPreviewDrag();return;}
    const at=localPoint(drag.layer,drag.bone,screenPoint(event));drag.part.x=Math.max(-4096,Math.min(4096,Math.round((drag.x+at.x-drag.start.x)*10)/10));drag.part.y=Math.max(-4096,Math.min(4096,Math.round((drag.y+at.y-drag.start.y)*10)/10));fittingKey='';draw();dirty();
  };
  function finishPointer(event){if(panDrag&&event.pointerId===panDrag.pointer&&(event.type!=='pointerup'||event.button===1))finishPan();if(drag&&event.pointerId===drag.pointer&&(event.type!=='pointerup'||event.button===0))finishPreviewDrag();}
  current.handles.onpointerup=finishPointer;current.handles.onpointercancel=finishPointer;current.handles.onlostpointercapture=finishPointer;
  current.handles.oncontextmenu=event=>event.preventDefault();current.handles.onauxclick=event=>{if(event.button===1)event.preventDefault();};
  function fitPart(commit){
    const p=part();if(!p||!layers.length)return;const asset=assets[p.sprite],target=Placement.layerFor(rig,asset),socket=Placement.socket(target,asset,profile().skins&&profile().skins[target.uuid]);
    if(socket){p.layer=target.uuid;p.slot=socket.name;p.bone=socket.bone;p.hideSlots=p.hideSlots.filter(name=>target.json.slots.some(slot=>slot.name===name)&&name!==p.slot);if(Placement.role(asset)==='Helmet'&&target.name==='wqyl_lead_tou')p.hideSlots=[...new Set(p.hideSlots.concat(target.json.slots.filter(slot=>/headgear/i.test(slot.name)&&slot.name!==p.slot).map(slot=>slot.name)))];}
    const layer=baseLayers.find(l=>l.description.uuid===p.layer),slot=layer.skeleton.findSlot(p.slot),attachment=slot.getAttachment(),bone=layer.skeleton.findBone(p.bone);
    const intended=Placement.socket(layer.description,asset);if(intended&&intended.name===p.slot&&Placement.compatible(intended)){p.bone=intended.bone;Object.assign(p,Placement.intended(asset));p.forceVisible=true;if(commit!==false)changed(true);return;}
    if(!attachment){message('This slot is empty. Choose an anchor and adjust the offsets to add a piece.');return;}
    const v=[];if(attachment instanceof spine.RegionAttachment)attachment.computeWorldVertices(slot.bone,v,0,2);else if(attachment instanceof spine.MeshAttachment)attachment.computeWorldVertices(slot,0,attachment.worldVerticesLength,v,0,2);else return;
    if(attachment instanceof spine.RegionAttachment&&bone===slot.bone){p.x=attachment.x;p.y=attachment.y;p.rotation=attachment.rotation;const scale=Placement.fitAspect(asset.width,asset.height,attachment.width*Math.abs(attachment.scaleX),attachment.height*Math.abs(attachment.scaleY));p.scaleX=p.scaleY=scale;}
    else{const points=[];for(let i=0;i<v.length;i+=2){const at=new spine.Vector2(v[i],v[i+1]);bone.worldToLocal(at);points.push(at);}const xs=points.map(p=>p.x),ys=points.map(p=>p.y),minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);p.x=(minX+maxX)/2;p.y=(minY+maxY)/2;p.rotation=0;p.scaleX=p.scaleY=Placement.fitAspect(asset.width,asset.height,maxX-minX,maxY-minY);}
    p.lockAspect=true;if(commit!==false)changed(true);
  }
  function step(amount){playing=false;play.textContent='Play';time=Math.max(0,Math.min(duration,time+amount/30));draw();}
  animation.onchange=()=>{time=0;updateDuration();draw();};scrub.oninput=()=>{playing=false;play.textContent='Play';time=Number(scrub.value);draw();};
  function frame(now){if(disposed)return;if(playing&&layers.length){if(last)time=(time+(now-last)/1000*Number(speed.value))%duration;draw();}last=now;raf=requestAnimationFrame(frame);}
  api.ipc('load').then(result=>{if(disposed)return;data=clone(result.data);saved=clone(result.savedData);version=result.version;historyState(result);parts=itemMode?CharacterOptions.libraryParts(result.parts):CharacterOptions.characterParts(result.parts);units=result.units;sources=result.sources||[];search.placeholder='Search '+parts.length+' parts…';assets=Object.fromEntries(result.parts.map(p=>[p.id,p]));lastSent=JSON.stringify(data);const all=el('option','All categories',category);all.value='';for(const name of [...new Set(parts.map(CharacterOptions.partCategory))].sort()){const option=el('option',name,category);option.value=name;}unitFilter.innerHTML='';for(const group of [itemMode?'All equipment':'All characters',...new Set(units.map(u=>u.group))]){const option=el('option',group,unitFilter);option.value=group.startsWith('All ')?'':group;}if(Object.keys(data.profiles).length)selectProfile(Object.keys(data.profiles)[0]);else if(units.length)selectUnit(units[0]);dirty();raf=requestAnimationFrame(frame);}).catch(error=>message(error.message,true));
  return {destroy(){disposed=true;token++;root.removeEventListener('keydown',editorKey,true);current.box.removeEventListener('wheel',previewWheel);cancelGestures();if(raf!==null)cancelAnimationFrame(raf);states.forEach(api.core.restore);api.renderer.destroyCanvas(current.canvas);root.remove();},getState(){return{selected,selectedPart,dirty:data?dirty():false,canUndo,canRedo,busy,loaded:!!layers.length,silent:true};}};
}
module.exports={mount};
