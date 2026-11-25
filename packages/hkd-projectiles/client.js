'use strict';
const CombatPreview=require('./combat-preview');
const Looks=require('../../assets/_script/ProjectileLooks');
const ProjectileVisuals=require('./projectile-visuals');
const standardTrailId='trail:bb4d9c1e-b926-4023-9f10-a49134339dcd'; // Tower arrow trail
let unitPickerSerial=0;

// Imported projectile variants share a small number of atlases. Their static
// library thumbnails never construct a rig; only selected previews enter this
// bounded cache. Legacy cards retain their existing animated previews.
function createSpineCache(api,options){
  options=options||{};const legacy=new Map(),resources=new Map(),bindings=new Map(),limit=options.limit||8;let generation=0,closed=false;
  const key=asset=>[asset.bundle||'resources',asset.resource||asset.uuid||asset.id,asset.skin||''].join('|');
  function current(record,map,id){return !closed&&record.generation===generation&&map.get(id)===record;}
  function bind(asset,record){
    if(!record||!record.entry)return null;
    let entry=bindings.get(asset.id);if(!entry||entry.base!==record.entry){const bounds=asset.previewBounds;entry={...record.entry,base:record.entry,bounds:bounds&&['minX','minY','maxX','maxY','width','height'].every(field=>Number.isFinite(bounds[field]))?bounds:record.entry.bounds};bindings.set(asset.id,entry);}
    // Different variants may have different authored forward directions even
    // though the immutable JSON, atlas and runtime are shared.
    for(const layer of entry.layers)layer.description.rotation=asset.rotation||0;
    return entry;
  }
  function trim(){while(resources.size>limit){const id=resources.keys().next().value,record=resources.get(id);resources.delete(id);for(const [assetId,entry]of bindings)if(entry.base===record.entry)bindings.delete(assetId);}}
  function get(asset){
    if(!asset||closed)return null;const map=asset.thumbnail?resources:legacy,id=asset.thumbnail?key(asset):asset.id,record=map.get(id);
    if(record&&asset.thumbnail){map.delete(id);map.set(id,record);}return bind(asset,record);
  }
  function load(asset){
    if(!asset||closed)return Promise.resolve(null);const map=asset.thumbnail?resources:legacy,id=asset.thumbnail?key(asset):asset.id,existing=map.get(id);
    if(existing){if(asset.thumbnail){map.delete(id);map.set(id,existing);}return existing.promise.then(()=>get(asset));}
    const record={generation,entry:null,promise:null};map.set(id,record);if(asset.thumbnail)trim();
    record.promise=(async()=>{try{
      const data=await api.ipc('describe',{id:asset.id});if(!current(record,map,id))return null;
      const runtime=api.runtime(data),layers=await api.renderer.createLayers(runtime,data.layers);if(!current(record,map,id))return null;
      for(const layer of layers)layer.description.rotation=asset.rotation||0;
      api.renderer.seek(runtime,layers,asset.animation,0,true);record.entry={runtime,layers,bounds:api.renderer.bounds(runtime,layers)};
      if(options.onChange)options.onChange();return bind(asset,record);
    }catch(error){if(current(record,map,id)&&options.onError)options.onError(error);return null;}})();return record.promise;
  }
  function invalidate(){generation++;legacy.clear();resources.clear();bindings.clear();}
  return{get,load,invalidate,status(){return{resources:resources.size,legacy:legacy.size,bindings:bindings.size};},destroy(){closed=true;invalidate();}};
}

function artworkColor(surface, clientX, clientY){
  const bounds=surface.getBoundingClientRect();
  if(!bounds.width||!bounds.height)return null;
  const x=Math.floor((clientX-bounds.left)*surface.width/bounds.width);
  const y=Math.floor((clientY-bounds.top)*surface.height/bounds.height);
  if(x<0||y<0||x>=surface.width||y>=surface.height)return null;
  const [r,g,b,alpha]=surface.getContext('2d').getImageData(x,y,1,1).data;
  return alpha?'#'+[r,g,b].map(channel=>channel.toString(16).padStart(2,'0')).join(''):null;
}

function mount(root,api){
  const el=(tag,text,parent)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(parent)parent.appendChild(n);return n;};
  const button=(text,parent,fn)=>{const n=el('button',text,parent);n.type='button';n.onclick=fn;return n;},clone=value=>JSON.parse(JSON.stringify(value));
  root.innerHTML='';root.className='projectile-tool';
  const header=el('header',undefined,root);el('strong','Projectiles',header);const status=el('span','Loading library…',header),actions=el('div',undefined,header);
  const body=el('main',undefined,root),left=el('aside',undefined,body),center=el('section',undefined,body),right=el('aside',undefined,body);
  left.className='projectile-assignment';center.className='projectile-library';right.className='projectile-preview';
  el('h2','Ranged units',left);
  // Keep the select as a nonvisual integration adapter; the portrait picker
  // dispatches its existing change path and never edits gameplay while browsing.
  const unitSelect=el('select',undefined,left);unitSelect.setAttribute('aria-label','Ranged unit');unitSelect.setAttribute('aria-hidden','true');unitSelect.tabIndex=-1;unitSelect.className='projectile-unit-native';
  const unitPicker=el('div',undefined,left);unitPicker.className='projectile-unit-picker';const unitPickerId='projectile-unit-picker-'+(++unitPickerSerial);
  const unitTrigger=button('',unitPicker,()=>unitPopup.hidden?openUnitPicker():closeUnitPicker(true));unitTrigger.className='projectile-unit-trigger';unitTrigger.setAttribute('role','combobox');unitTrigger.setAttribute('aria-label','Choose unit');unitTrigger.setAttribute('aria-haspopup','listbox');unitTrigger.setAttribute('aria-expanded','false');unitTrigger.setAttribute('aria-controls',unitPickerId);
  const unitPopup=el('div',undefined,unitPicker);unitPopup.className='projectile-unit-popup';unitPopup.hidden=true;
  const unitSearch=el('input',undefined,unitPopup);unitSearch.type='search';unitSearch.placeholder='Search unit names…';unitSearch.setAttribute('aria-label','Search unit names');unitSearch.setAttribute('aria-controls',unitPickerId);unitSearch.autocomplete='off';
  const unitCount=el('small','',unitPopup),unitList=el('div',undefined,unitPopup);unitList.id=unitPickerId;unitList.className='projectile-unit-options';unitList.setAttribute('role','listbox');unitList.setAttribute('aria-label','Unit portraits');
  const fields=el('div',undefined,left);
  el('h2','Projectile library',center);const search=el('input',undefined,center);search.placeholder='Search projectiles…';search.setAttribute('aria-label','Search projectiles');
  const count=el('small','',center),grid=el('div',undefined,center);grid.className='projectile-grid';
  const title=el('h2','Preview',right),stageView=el('div',undefined,right);stageView.className='projectile-stage';
  const canvas=el('canvas',undefined,stageView);canvas.width=420;canvas.height=420;canvas.tabIndex=0;canvas.setAttribute('aria-label','Projectile combat preview');canvas.title='Space pauses or resumes the preview';
  const ctx=canvas.getContext('2d'),controls=el('div',undefined,right);controls.className='projectile-play-controls';
  const description=el('p','',right),phase=el('p','',right);phase.className='projectile-phase';phase.setAttribute('aria-live','off');
  el('p','Choose a projectile, match its launch to the attack animation, then Save. Damage and range are edited in Units. Flight speed is in Units for characters and Buildings for towers.',left).className='projectile-note';
  el('p','Silent, looping preview. Click the active Pause button or press Space to pause and resume.',right).className='projectile-note';
  const launchPanel=el('div',undefined,right);launchPanel.className='projectile-launch';
  el('h3','Launch point',launchPanel);
  const launchFields=el('div',undefined,launchPanel);launchFields.className='projectile-launch-fields';
  const launchInputs=new Map();
  for(const axis of ['X','Y']){
    const label=el('label',undefined,launchFields);el('span',axis+' offset',label);
    const input=el('input',undefined,label);input.type='number';input.step='any';
    input.min=-Looks.launchOffsetLimit;input.max=Looks.launchOffsetLimit;input.disabled=true;
    input.setAttribute('aria-label','Launch offset '+axis);
    launchInputs.set('launchOffset'+axis,input);
  }
  const facingLabel=el('label',undefined,launchFields);el('span','Preview facing',facingLabel);
  const facingSelect=el('select',undefined,facingLabel);facingSelect.disabled=true;
  facingSelect.setAttribute('aria-label','Preview facing');
  el('option','Right',facingSelect).value='1';el('option','Left',facingSelect).value='-1';
  el('small','Offsets are in game units. X mirrors with facing. Positive Y moves up.',launchPanel);
  let snapshot=null,unit='hero',selected=null,selectionTouched=false,trailTouched=false,trailValue;
  let focusSequence=0;
  let colorSampler=null;
  let closed=false,queue=Promise.resolve(),raf=0,libraryRaf=0,age=0,last=0,mode='all',paused=false,actor=null,target=null,actorRequest=0,locked=false,generation=0,deferredAssignments=false;
  const eventScope=root.getRootNode(),eventPath=event=>typeof event.composedPath==='function'?event.composedPath():[event.target];
  const focusedElement=()=>{let focused=eventScope.activeElement||document.activeElement;while(focused&&focused.shadowRoot&&focused.shadowRoot.activeElement)focused=focused.shadowRoot.activeElement;return focused;};
  let visibleUnits=[],activeUnitIndex=0;
  const images=new Map(),playButtons={},pending=new Map(),delayDrafts=new Map(),visualDrafts=new Map();
  const report=(message,error)=>{if(!closed){status.textContent=message;status.className=error?'error':'';}};
  const warn=error=>{const message=error.message||String(error);report(message,true);};
  const spines=createSpineCache(api,{onError:warn,onChange:scheduleLibraryRender});
  const combat=CombatPreview.create(api,{onError:warn});
  const visuals=ProjectileVisuals.create(api,{onError:warn});
  const byId=id=>snapshot&&snapshot.data.assets.find(a=>a.id===id),sets=()=>snapshot.data.sets||snapshot.data.assets.filter(a=>a.role==='flight').map(a=>({id:a.id,name:a.name,category:a.category,flight:a.id}));
  const currentSet=()=>snapshot&&sets().find(s=>s.id===selected),who=()=>snapshot&&snapshot.units.find(u=>u.key===unit),row=()=>snapshot&&snapshot.data.assignments[unit]||{},trails=()=>snapshot&&snapshot.data.trails||[];
  const effectiveRow=()=>who()&&who().effectiveAssignment||row();
  const validScale=value=>Number.isFinite(value)&&value>=.1&&value<=10,validColor=value=>/^#[a-f0-9]{6}$/i.test(value||'');
  function visualValue(field){const draft=visualDrafts.get(unit);return draft&&Object.prototype.hasOwnProperty.call(draft,field)?draft[field]===undefined?(who().inheritedAssignment||{})[field]:draft[field]:effectiveRow()[field];}
  function setVisual(field,value,key){key=key||unit;visualDrafts.set(key,Object.assign({},visualDrafts.get(key),{[field]:value}));age=0;refreshStatus();}
  function invalidVisual(){
    for(const draft of visualDrafts.values()){
      if(Array.from(launchInputs.keys()).some(field=>draft[field]!==undefined&&!Looks.validLaunchOffset(draft[field])))
        return 'Correct launch offsets (−'+Looks.launchOffsetLimit+' to '+Looks.launchOffsetLimit+').';
      if(draft.scale!==undefined&&!validScale(draft.scale)||draft.trailColor!==undefined&&!validColor(draft.trailColor))
        return 'Correct projectile scale (0.1–10×) or trail color (#RRGGBB).';
    }
  }
  function renderLaunchPoint(){
    const person=who();
    for(const [field,input]of launchInputs){
      const value=visualValue(field);
      input.value=value===undefined?0:Number.isFinite(value)?value:'';
      input.setAttribute('aria-invalid',String(value!==undefined&&!Looks.validLaunchOffset(value)));
      input.disabled=false;
    }
    facingSelect.disabled=person.type==='wall';
    if(facingSelect.disabled)facingSelect.value='1';
    resetLaunch.disabled=false;
  }
  function showLaunchPoint(){
    mode='all';age=0;last=0;
    renderSelected();
  }
  for(const [field,input]of launchInputs)input.oninput=()=>{
    const value=input.valueAsNumber, valid=Looks.validLaunchOffset(value);
    const inherited=(who().inheritedAssignment||{})[field];
    const baseline=Looks.validLaunchOffset(inherited)?inherited:0;
    input.setAttribute('aria-invalid',String(!valid));
    setVisual(field,valid&&row()[field]===undefined&&value===baseline?undefined:value);
    showLaunchPoint();
  };
  facingSelect.onchange=showLaunchPoint;
  const resetLaunch=button('Reset launch point',launchPanel,()=>{
    const draft=Object.assign({},visualDrafts.get(unit));
    for(const field of launchInputs.keys())draft[field]=undefined;
    visualDrafts.set(unit,draft);
    renderLaunchPoint();showLaunchPoint();refreshStatus();
  });
  resetLaunch.disabled=true;
  const validDelay=value=>Number.isFinite(value)&&value>=0&&value<=10;
  const effectiveDelay=key=>snapshot.timings&&snapshot.timings[key]!==undefined?snapshot.timings[key]:(snapshot.units.find(person=>person.key===key)||{}).launchDelay||0;
  const invalidDelay=()=>Array.from(delayDrafts).find(([,draft])=>!validDelay(draft.value));
  const pendingTiming=()=>Array.from(delayDrafts).some(([key,draft])=>!validDelay(draft.value)||draft.value!==effectiveDelay(key));
  function previewLook(){
    const person=who();
    if(!person)return null;
    let assignment=effectiveRow();
    if(selectionTouched||trailTouched||visualDrafts.has(unit)){
      const catalog={...snapshot.data,assignments:{...snapshot.data.assignments,[unit]:assignmentForSelection()}};
      assignment={...person.inheritedAssignment,...Looks.select(catalog,unit)};
    }
    return CombatPreview.projectileLook(snapshot.data.assets,person,assignment,actor);
  }
  function storeSelection(){if(selectionTouched||trailTouched||visualDrafts.has(unit))pending.set(unit,{selected,selectionTouched,trailTouched,trailValue});else pending.delete(unit);}
  function assignmentForSelection(key,draft){
    key=key||unit;draft=draft||{selected,selectionTouched,trailTouched,trailValue};
    const result=Object.assign({},snapshot.data.assignments[key]||{}),set=sets().find(s=>s.id===draft.selected);
    if(set&&draft.selectionTouched){result.set=set.id;for(const field of ['flight','launch','impact'])result[field]=set[field]||'';
      for(const field of ['size','rotation','tint']){if(set[field]!==undefined)result[field]=set[field];else if(/^tower:/.test(key)&&snapshot.data.assignments.tower&&snapshot.data.assignments.tower[field]!==undefined)result[field]=field==='size'?(byId(set.flight).size||48):field==='rotation'?0:'#ffffff';else delete result[field];}}
    if(draft.trailTouched){if(draft.trailValue===undefined)delete result.trail;else result.trail=draft.trailValue;}
    for(const [field,value]of Object.entries(visualDrafts.get(key)||{})){if(value===undefined)delete result[field];else result[field]=value;}return result;
  }
  const pendingAssignment=()=>snapshot&&(JSON.stringify(assignmentForSelection())!==JSON.stringify(row())||Array.from(pending).some(([key,draft])=>key!==unit&&JSON.stringify(assignmentForSelection(key,draft))!==JSON.stringify(snapshot.data.assignments[key]||{})));
  function refreshStatus(){if(!snapshot)return;const invalid=invalidDelay(),visual=invalidVisual(),dirty=snapshot.dirty||pendingAssignment()||pendingTiming();save.disabled=!!invalid||!!visual||!dirty;discard.disabled=!dirty;report(invalid?'Correct launch delay for '+(snapshot.units.find(person=>person.key===invalid[0])||{}).name+' (0–10 seconds).':visual||(dirty?'Unsaved projectile drafts':'Current data · browsing makes no changes'),!!invalid||!!visual);lockControls();}
  function apply(value){if(closed)return;snapshot=value;render();if(value.result)report(value.result.warning||(value.result.saved?'Saved projectile settings. Reload the game preview to apply.':'No changes; no files written.'),!!value.result.warning);}
  function run(action){queue=queue.then(()=>{if(!closed)return action();}).catch(warn);return queue;}
  function lockControls(){if(locked)for(const input of root.querySelectorAll('button,input,select'))input.disabled=true;}
  function exclusive(action){if(locked)return;stopColorSampling();locked=true;lockControls();return run(async()=>{try{await action();}finally{locked=false;if(!closed){for(const input of root.querySelectorAll('button,input,select'))input.disabled=false;if(snapshot)apply(snapshot);}}});}
  const save=button('Save',actions,()=>exclusive(async()=>{if(!snapshot)return;if(invalidDelay()||invalidVisual())throw Error('Correct invalid projectile drafts before saving.');storeSelection();if(pendingAssignment()||pendingTiming()){const data=clone(snapshot.data),timings=clone(snapshot.timings||{});for(const [key,draft]of delayDrafts)if(draft.value!==effectiveDelay(key))timings[key]=draft.value;for(const [key,draft]of pending){const next=assignmentForSelection(key,draft);if(Object.keys(next).length)data.assignments[key]=next;else delete data.assignments[key];}snapshot=await api.ipc('change',{version:snapshot.version,data,timings});}const value=await api.ipc('save',{version:snapshot.version});selectionTouched=trailTouched=false;pending.clear();delayDrafts.clear();visualDrafts.clear();apply(value);}));
  const discard=button('Discard drafts',actions,()=>exclusive(async()=>{if(!window.confirm('Discard unsaved projectile settings?'))return;const value=await api.ipc('discard',{version:snapshot.version});selectionTouched=trailTouched=false;pending.clear();delayDrafts.clear();visualDrafts.clear();selected=null;apply(value);}));
  button('Reload',actions,()=>exclusive(async()=>{storeSelection();const value=await api.ipc('load',{});generation++;unitTrigger.dataset.signature='';images.clear();spines.invalidate();visuals.invalidate();combat.invalidate();target=null;if(!selectionTouched)selected=null;apply(value);loadActors();renderSelected();}));save.disabled=discard.disabled=true;
  function togglePlayback(){if(!snapshot||locked)return;paused=!paused;last=0;renderSelected();}
  const playbackLabels={launch:'launch',flight:'flight',impact:'on hit',all:'all'};
  for(const [key,label]of Object.entries(playbackLabels)){const control=playButtons[key]=button('Play '+label,controls,()=>{if(mode===key)togglePlayback();else{mode=key;paused=false;age=0;last=0;renderSelected();}});control.dataset.playbackMode=key;}
  const playbackKeyDown=event=>{
    if(colorSampler&&event.key==='Escape'){event.preventDefault();event.stopPropagation();stopColorSampling();refreshStatus();return;}
    if(event.defaultPrevented||!(event.code==='Space'||event.key===' '||event.key==='Spacebar')||event.ctrlKey||event.metaKey||event.altKey||event.shiftKey||!snapshot||locked)return;
    const target=eventPath(event)[0];if(target&&target.closest&&target.closest('input,select,textarea,[contenteditable]:not([contenteditable="false"]),[role="combobox"],[role="listbox"]'))return;
    event.preventDefault();event.stopPropagation();if(!event.repeat)togglePlayback();
  };root.addEventListener('keydown',playbackKeyDown);
  function stopColorSampling(){
    if(!colorSampler)return;
    colorSampler.button.setAttribute('aria-pressed','false');
    colorSampler=null;
    root.classList.remove('projectile-sampling-color');
  }
  const pickArtworkColor=event=>{
    if(!colorSampler||locked)return;
    const surface=eventPath(event).find(value=>value===canvas||value.tagName==='CANVAS'&&grid.contains(value));
    if(!surface)return;
    event.preventDefault();event.stopPropagation();
    let color;
    try{color=artworkColor(surface,event.clientX,event.clientY);}
    catch(error){report('Could not sample this artwork. Try the combat preview or enter a color directly.',true);return;}
    if(!color){report('Click a visible part of the projectile or preview. Esc cancels.');return;}
    const sampler=colorSampler;
    stopColorSampling();
    sampler.apply(color);
    sampler.button.focus();
  };
  root.addEventListener('click',pickArtworkColor,true);
  const control=(label,input)=>{const wrap=el('label',undefined,fields);el('span',label,wrap);wrap.appendChild(input);return input;};
  function defaultSelection(){const a=effectiveRow(),u=who(),flight=byId(a.flight)?a.flight:u.defaultFlight;return sets().find(s=>s.id===a.set)||sets().find(s=>s.flight===flight)||sets().find(s=>s.category==='Imported arrows')||sets()[0];}
  function loadActors(){const request=++actorRequest,targetGeneration=generation;actor=null;age=0;combat.load(unit).then(value=>{if(!closed&&request===actorRequest){actor=value;if(!paused)age=0;renderAssignments();renderSelected();}}).catch(warn);if(!target)combat.load('preview-target').then(value=>{if(!closed&&targetGeneration===generation)target=value;}).catch(warn);}
  unitSelect.onchange=()=>{closeUnitPicker(false);storeSelection();unit=unitSelect.value;const draft=pending.get(unit);selectionTouched=!!(draft&&draft.selectionTouched);trailTouched=!!(draft&&draft.trailTouched);const initial=defaultSelection();selected=draft&&draft.selected||initial&&initial.id;trailValue=draft?draft.trailValue:row().trail;mode='all';loadActors();render();};search.oninput=renderLibrary;
  function portraitContent(parent,person){
    const thumb=el('span',undefined,parent);thumb.className='projectile-unit-thumb';const words=person.name.replace(/[^a-z0-9 ]/gi,' ').trim().split(/\s+/),fallback=el('span',words.slice(0,2).map(word=>word[0]||'').join('').toUpperCase()||'?',thumb);fallback.className='projectile-unit-initials';fallback.setAttribute('aria-hidden','true');
    if(person.portrait){const portrait=el('img',undefined,thumb);portrait.alt='';portrait.src=api.image(person.portrait);portrait.onload=()=>{fallback.hidden=true;};portrait.onerror=()=>{portrait.remove();fallback.hidden=false;};}
    const text=el('span',undefined,parent);text.className='projectile-unit-text';el('strong',person.name,text);return text;
  }
  function updateActiveUnit(scroll){
    const options=Array.from(unitList.querySelectorAll('[role=option]'));options.forEach((option,index)=>option.classList.toggle('active',index===activeUnitIndex));const active=options[activeUnitIndex];
    for(const input of [unitTrigger,unitSearch])if(active)input.setAttribute('aria-activedescendant',active.id);else input.removeAttribute('aria-activedescendant');
    if(scroll&&active){if(active.offsetTop<unitList.scrollTop)unitList.scrollTop=active.offsetTop;else if(active.offsetTop+active.offsetHeight>unitList.scrollTop+unitList.clientHeight)unitList.scrollTop=active.offsetTop+active.offsetHeight-unitList.clientHeight;}
  }
  function chooseUnit(key){if(locked)return;unitSelect.value=key;unitSelect.onchange();unitTrigger.focus();}
  function renderUnitOptions(){
    if(!snapshot)return;const previous=visibleUnits[activeUnitIndex]&&visibleUnits[activeUnitIndex].key,query=unitSearch.value.trim().toLowerCase();visibleUnits=snapshot.units.filter(person=>(person.name+' '+person.key).toLowerCase().includes(query));unitList.innerHTML='';unitCount.textContent=visibleUnits.length+' / '+snapshot.units.length+' ranged units';
    for(const [index,person]of visibleUnits.entries()){const option=button('',unitList,()=>chooseUnit(person.key));option.className='projectile-unit-option';option.id=unitPickerId+'-'+person.key.replace(/[^a-z0-9_-]/gi,'-');option.dataset.unit=person.key;option.setAttribute('role','option');option.setAttribute('aria-selected',String(person.key===unit));option.tabIndex=-1;portraitContent(option,person);option.onpointermove=()=>{activeUnitIndex=index;updateActiveUnit(false);};}
    if(!visibleUnits.length)el('p','No ranged units match.',unitList);const retained=visibleUnits.findIndex(person=>person.key===previous),selected=visibleUnits.findIndex(person=>person.key===unit);activeUnitIndex=retained>=0?retained:selected>=0?selected:0;updateActiveUnit(false);lockControls();
  }
  function renderUnitPicker(){
    if(!snapshot)return;const person=who(),signature=person.key+'|'+person.name+'|'+person.portrait;if(unitTrigger.dataset.signature!==signature){unitTrigger.innerHTML='';portraitContent(unitTrigger,person);el('span','▾',unitTrigger).className='projectile-unit-chevron';unitTrigger.dataset.signature=signature;unitTrigger.title=person.name;}
    if(!unitPopup.hidden)renderUnitOptions();
  }
  function openUnitPicker(){if(!snapshot||locked)return;unitPopup.hidden=false;unitTrigger.setAttribute('aria-expanded','true');unitSearch.value='';visibleUnits=[];renderUnitOptions();unitSearch.focus();updateActiveUnit(true);}
  function closeUnitPicker(focus){unitPopup.hidden=true;unitTrigger.setAttribute('aria-expanded','false');unitTrigger.removeAttribute('aria-activedescendant');if(focus)unitTrigger.focus();}
  unitSearch.oninput=()=>{activeUnitIndex=0;visibleUnits=[];renderUnitOptions();};
  unitSearch.onkeydown=event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();closeUnitPicker(true);}else if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();activeUnitIndex=Math.max(0,Math.min(visibleUnits.length-1,activeUnitIndex+(event.key==='ArrowDown'?1:-1)));updateActiveUnit(true);}else if(event.key==='Enter'){event.preventDefault();if(visibleUnits[activeUnitIndex])chooseUnit(visibleUnits[activeUnitIndex].key);}};
  unitTrigger.onkeydown=event=>{if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){event.preventDefault();openUnitPicker();if(event.key==='Home')activeUnitIndex=0;else if(event.key==='End')activeUnitIndex=visibleUnits.length-1;updateActiveUnit(true);}else if(event.key==='Escape'){event.preventDefault();closeUnitPicker(false);}};
  unitPicker.onfocusout=event=>{if(!unitPicker.contains(event.relatedTarget))closeUnitPicker(false);};
  // Creator embeds panels in Shadow DOM. A document capture listener sees the
  // host instead of the clicked option, so handle panel pointers in its scope.
  const outsideUnitPicker=event=>{if(!eventPath(event).includes(unitPicker)&&!unitPicker.contains(event.target))closeUnitPicker(false);};
  const pickerPointerListeners=[];let pointerScope=eventScope,childHost=null;
  while(pointerScope){
    const boundary=childHost,listener=event=>{if(!boundary||!eventPath(event).includes(boundary))outsideUnitPicker(event);};
    pointerScope.addEventListener('pointerdown',listener,true);pickerPointerListeners.push({scope:pointerScope,listener});
    childHost=pointerScope.host;pointerScope=childHost&&childHost.getRootNode();
  }
  function setDelay(value,key){key=key||unit;const existing=delayDrafts.get(key),draft=existing&&Object.is(existing.value,value)?existing:{value,text:String(value)};delayDrafts.set(key,draft);refreshStatus();run(async()=>{if(!validDelay(value))throw Error('Launch delay must be between 0 and 10 seconds.');if(value===effectiveDelay(key)){if(delayDrafts.get(key)===draft){delayDrafts.delete(key);refreshStatus();}return;}const timings=clone(snapshot.timings||{});timings[key]=value;const valueSnapshot=await api.ipc('change',{version:snapshot.version,data:snapshot.data,timings});if(delayDrafts.get(key)===draft)delayDrafts.delete(key);apply(valueSnapshot);age=0;});}
  fields.onfocusout=event=>{if(!colorSampler&&deferredAssignments&&event.relatedTarget&&!fields.contains(event.relatedTarget))setTimeout(()=>{if(!closed&&!colorSampler&&deferredAssignments&&!fields.contains(focusedElement()))renderAssignments(true);},0);};
  function renderAssignments(force){
    const focused=focusedElement();if(!force&&!locked&&fields.dataset.unit===unit&&(colorSampler||fields.contains(focused)&&['INPUT','SELECT','BUTTON'].includes(focused.tagName))){deferredAssignments=true;return;}deferredAssignments=false;fields.dataset.unit=unit;
    stopColorSampling();
    fields.innerHTML='';const person=who(),assignment=effectiveRow(),set=currentSet();el('h3','Projectile assignment',fields);el('strong',set?set.name:'Choose a projectile',fields).className='projectile-chosen';el('small',selectionTouched?'Selected · Save to assign':assignment.flight?'Current projectile':'Original unit projectile',fields);
    const scaleUnit=unit,scaleValue=visualValue('scale'),scale=el('input');scale.type='number';scale.min='.1';scale.max='10';scale.step='.05';scale.value=scaleValue===undefined?1:scaleValue;scale.setAttribute('aria-invalid',String(scaleValue!==undefined&&!validScale(scaleValue)));control('Projectile scale',scale);
    const scaleSlider=el('input');scaleSlider.type='range';scaleSlider.min='.1';scaleSlider.max='10';scaleSlider.step='.05';scaleSlider.value=validScale(scaleValue)?scaleValue:1;scaleSlider.className='projectile-delay-slider';scaleSlider.setAttribute('aria-label','Projectile scale slider');fields.appendChild(scaleSlider);
    const scaleHint=el('small','',fields),showScale=value=>{scaleHint.textContent=(validScale(value)?Math.round(value*100)+'% · ':'')+'Flight artwork and trail · saved for this unit only.';};showScale(scaleValue===undefined?1:scaleValue);
    scale.oninput=()=>{const value=scale.valueAsNumber;scale.setAttribute('aria-invalid',String(!validScale(value)));if(validScale(value))scaleSlider.value=value;setVisual('scale',value,scaleUnit);showScale(value);};
    scaleSlider.oninput=()=>{scale.value=scaleSlider.value;scale.setAttribute('aria-invalid','false');setVisual('scale',scaleSlider.valueAsNumber,scaleUnit);showScale(scaleSlider.valueAsNumber);};
    button('Reset scale',fields,()=>{setVisual('scale',undefined,scaleUnit);renderAssignments(true);});
    const fieldUnit=unit,value=effectiveDelay(fieldUnit),draft=delayDrafts.get(fieldUnit);
    const delay=el('input');delay.type='number';delay.min='0';delay.max='10';delay.step='0.01';delay.value=draft?draft.text:value;delay.setAttribute('aria-invalid',String(!!draft&&!validDelay(draft.value)));delay.oninput=()=>{delayDrafts.set(fieldUnit,{value:delay.valueAsNumber,text:delay.value});delay.setAttribute('aria-invalid',String(!validDelay(delay.valueAsNumber)));if(validDelay(delay.valueAsNumber))slider.value=delay.value;age=0;refreshStatus();};delay.onchange=()=>setDelay(delay.valueAsNumber,fieldUnit);control('Launch delay · seconds',delay);
    const slider=el('input');slider.type='range';slider.min='0';slider.max='10';slider.step='0.01';slider.value=draft&&validDelay(draft.value)?draft.value:value;slider.setAttribute('aria-label','Launch delay slider');slider.className='projectile-delay-slider';slider.oninput=()=>{delay.value=slider.value;delay.setAttribute('aria-invalid','false');delayDrafts.set(fieldUnit,{value:slider.valueAsNumber,text:slider.value});age=0;refreshStatus();};slider.onchange=()=>setDelay(slider.valueAsNumber,fieldUnit);fields.appendChild(slider);
    const reference=actor&&actor.description.referenceDelay;if(Number.isFinite(reference))el('small','Animation reference: '+reference.toFixed(2)+' s',fields).className='projectile-reference';
    button('Reset launch delay',fields,()=>{const key=unit;exclusive(async()=>{const timings=clone(snapshot.timings||{});delete timings[key];const value=await api.ipc('change',{version:snapshot.version,data:snapshot.data,timings});delayDrafts.delete(key);apply(value);age=0;});});
    const nativeTrail=(byId(set&&set.flight)||{}).trail||person.defaultTrail||(byId(set&&set.flight)||{}).visualLayers&&byId(set.flight).visualLayers.some(layer=>layer.kind==='trail');
    const standard=trails().find(preset=>preset.id===standardTrailId);
    el('h3','Projectile trail',fields);const choice=trailTouched?trailValue:unit==='hero'?row().trail:assignment.trail,enabled=choice===undefined?!!nativeTrail:choice!==false&&choice!=='none';
    const check=el('input');check.type='checkbox';check.checked=enabled;const toggle=el('label',undefined,fields);toggle.className='projectile-trail-toggle';toggle.appendChild(check);el('span','Enable trail',toggle);
    const trail=el('select');trail.setAttribute('aria-label','Projectile trail');
    if(standard)el('option',standard.name+' (default)',trail).value=standard.id;
    for(const preset of trails())if(preset!==standard)el('option',preset.name,trail).value=preset.id;
    if(nativeTrail||!standard)el('option','Original projectile trail',trail).value='';
    trail.value=enabled?(choice||(!trailTouched&&typeof nativeTrail==='string'?nativeTrail:'')):standard?.id||'';
    trail.disabled=!enabled;
    const trailText=active=>active?trail.value?'Trail shown during Play all.':'Uses the trail from the projectile or unit.':'Trail disabled for this unit.';
    const updateTrail=()=>{
      trailTouched=true;trailValue=check.checked?trail.value||undefined:false;
      trail.disabled=!check.checked;trailHint.textContent=trailText(check.checked);
      if(visualValue('trailColor')===undefined){
        const preset=trails().find(entry=>entry.id===(trail.value||nativeTrail));
        showColor(preset&&preset.color||'#ffffff');
      }
      age=0;refreshStatus();
    };
    check.onchange=()=>{if(check.checked&&!trail.value&&standard)trail.value=standard.id;updateTrail();};
    trail.onchange=updateTrail;fields.appendChild(trail);
    const trailHint=el('small',trailText(enabled),fields);
    const colorUnit=unit,preset=trails().find(t=>t.id===(choice||nativeTrail)),savedColor=visualValue('trailColor'),colorValue=validColor(savedColor)?savedColor:preset&&preset.color||'#ffffff';
    el('h3','Trail color mixer',fields);const colors=el('div',undefined,fields);colors.className='projectile-color-inputs';
    const picker=el('input',undefined,colors);picker.type='color';picker.value=colorValue;picker.setAttribute('aria-label','Trail color');
    const hex=el('input',undefined,colors);hex.type='text';hex.value=savedColor===undefined?colorValue:savedColor;hex.maxLength=7;hex.setAttribute('aria-label','Trail color hex');hex.setAttribute('aria-invalid',String(savedColor!==undefined&&!validColor(savedColor)));
    const channels=[];
    function showColor(value){picker.value=hex.value=value.toLowerCase();hex.setAttribute('aria-invalid','false');channels.forEach((channel,index)=>{channel.input.value=parseInt(value.slice(1+index*2,3+index*2),16);channel.output.textContent=channel.input.value;});}
    function mixColor(value){if(!validColor(value))return;showColor(value);setVisual('trailColor',value.toLowerCase(),colorUnit);}
    const eyedropper=button('Pick from artwork',fields,()=>{
      if(colorSampler){stopColorSampling();refreshStatus();return;}
      colorSampler={button:eyedropper,apply:mixColor};
      eyedropper.setAttribute('aria-pressed','true');
      root.classList.add('projectile-sampling-color');
      report('Click a color in the library or preview. Esc cancels.');
    });
    eyedropper.className='projectile-eyedropper';
    eyedropper.setAttribute('aria-pressed','false');
    for(const [index,name]of ['Red','Green','Blue'].entries()){const line=el('label',undefined,fields);line.className='projectile-color-channel';el('span',name,line);const input=el('input',undefined,line);input.type='range';input.min='0';input.max='255';input.step='1';input.value=parseInt(colorValue.slice(1+index*2,3+index*2),16);input.setAttribute('aria-label','Trail '+name.toLowerCase());const output=el('output',input.value,line);channels.push({input,output});input.oninput=()=>mixColor('#'+channels.map(channel=>Number(channel.input.value).toString(16).padStart(2,'0')).join(''));}
    picker.onchange=picker.oninput=()=>mixColor(picker.value);hex.oninput=()=>{hex.setAttribute('aria-invalid',String(!validColor(hex.value)));if(validColor(hex.value))mixColor(hex.value);else setVisual('trailColor',hex.value,colorUnit);};
    button('Use default trail color',fields,()=>{setVisual('trailColor',undefined,colorUnit);renderAssignments(true);});
    button('Reset projectile & trail',fields,()=>{const key=unit;exclusive(async()=>{
      const data=clone(snapshot.data),next=Object.assign({},data.assignments[key]);
      for(const field of ['set','flight','launch','impact','size','scale','rotation','tint','trail','trailColor'])delete next[field];
      if(Object.keys(next).length)data.assignments[key]=next;else delete data.assignments[key];
      const value=await api.ipc('change',{version:snapshot.version,data,timings:snapshot.timings});pending.delete(key);
      const draft=visualDrafts.get(key);
      if(draft){delete draft.scale;delete draft.trailColor;if(!Object.keys(draft).length)visualDrafts.delete(key);}
      if(unit===key){selectionTouched=trailTouched=false;selected=null;}
      apply(value);age=0;
    });});lockControls();
  }
  // Batch artwork completions so a warm library rebuilds its tiles once per frame.
  function scheduleLibraryRender(){if(!closed&&!libraryRaf)libraryRaf=requestAnimationFrame(()=>{libraryRaf=0;renderLibrary();});}
  function image(asset,thumbnail){const source=asset&&(thumbnail&&asset.thumbnail||asset.image);if(!source)return null;if(!images.has(source)){const n=new Image(),request=generation;images.set(source,n);n.onload=()=>{if(!closed&&request===generation)scheduleLibraryRender();};n.onerror=()=>{if(!closed&&request===generation)warn(Error('Cannot load projectile artwork: '+asset.name));};n.src=api.image(source);}return images.get(source);}
  function spine(asset){return spines.load(asset);}
  function pick(id){selected=id;selectionTouched=true;age=0;if(mode!=='all'&&mode!=='flight'&&!currentSet()[mode])mode='flight';renderAssignments();renderLibrary();renderSelected();refreshStatus();lockControls();}
  function renderLibrary(){
    if(libraryRaf){cancelAnimationFrame(libraryRaf);libraryRaf=0;}if(!snapshot||closed)return;grid.innerHTML='';const query=search.value.trim().toLowerCase(),library=sets().filter(s=>(s.name+' '+s.category).toLowerCase().includes(query));count.textContent=library.length+' / '+sets().length+' projectiles';
    for(const set of library){const card=button('',grid,()=>pick(set.id));card.dataset.asset=card.dataset.projectile=set.id;card.className=set.id===selected?'selected':'';card.setAttribute('aria-pressed',String(set.id===selected));
      const asset=byId(set.flight),thumbnail=el('canvas',undefined,card);thumbnail.width=120;thumbnail.height=72;const source=asset&&(asset.kind!=='spine'||asset.thumbnail)?image(asset,!!asset.thumbnail):null,context=thumbnail.getContext('2d');
      if(asset&&asset.kind==='spine'&&!asset.thumbnail){const entry=spines.get(asset);if(entry){api.renderer.seek(entry.runtime,entry.layers,asset.animation,.1,true);api.renderer.draw(entry.runtime,context,entry.layers,{width:120,height:72,bounds:entry.bounds});}else{spine(asset);context.fillStyle='#a7dcf6';context.font='26px sans-serif';context.textAlign='center';context.fillText('✦',60,44);}}
      else if(source&&source.complete&&source.naturalWidth){if(asset.kind==='flipbook'){const frame=asset.loopFrames&&asset.loopFrames.length?asset.loopFrames[Math.min(5,asset.loopFrames.length-1)]:Math.min(5,asset.frames-1);const side=72*(asset.visualScale||1),pivot=asset.visualPivot||{x:.5,y:.5};context.save();if(asset.additive){context.fillStyle='#17212d';context.fillRect(0,0,120,72);context.globalCompositeOperation='lighter';}context.drawImage(source,frame%asset.columns*asset.cell,Math.floor(frame/asset.columns)*asset.cell,asset.cell,asset.cell,60-side*pivot.x,36-side*pivot.y,side,side);context.restore();}else{const scale=Math.min(110/source.width,64/source.height),w=source.width*scale,h=source.height*scale;context.drawImage(source,(120-w)/2,(72-h)/2,w,h);}}
      el('strong',set.name,card);el('small',set.category,card);el('small',[set.launch&&'Launch','Flight',set.impact&&'Hit'].filter(Boolean).join(' · '),card).className='projectile-roles';}
    if(!library.length)el('p','No projectiles match your search.',grid);lockControls();
  }
  function renderSelected(){const look=previewLook();if(!look)return;const available={all:true,flight:true,launch:look.launch,impact:look.impact||look.nativeImpact};if(!available[mode])mode='flight';const set=currentSet();title.textContent=set?set.name:'Preview';for(const [key,btn]of Object.entries(playButtons)){const playing=key===mode&&!paused;btn.disabled=!available[key];btn.classList.toggle('active',key===mode);btn.setAttribute('aria-pressed',String(key===mode));btn.textContent=(playing?'Pause ':'Play ')+playbackLabels[key];btn.title=btn.disabled?'This projectile has no '+(key==='impact'?'special on-hit':key)+' effect.':playing?'Pause preview (Space)':key===mode?'Resume preview (Space)':'Loop '+playbackLabels[key];}
    description.textContent=mode==='all'?who().name+' → target · In-game scale':mode==='flight'?'Stationary flight · In-game scale':mode==='launch'?'Launch effect · In-game scale':'On-hit effect · In-game scale';for(const role of ['flight','launch','impact']){const asset=look[role];if(asset&&asset.kind==='spine')spine(asset);}}
  function render(){if(!snapshot.units.some(u=>u.key===unit))unit=snapshot.units[0].key;unitSelect.innerHTML='';for(const person of snapshot.units){const option=el('option',person.name,unitSelect);option.value=person.key;}unitSelect.value=unit;renderUnitPicker();if(!selected||!sets().some(s=>s.id===selected)){const set=defaultSelection();selected=set&&set.id;}renderAssignments();renderLaunchPoint();renderLibrary();renderSelected();refreshStatus();lockControls();}
  const off=document.createElement('canvas'),mask=document.createElement('canvas');off.width=off.height=mask.width=mask.height=256;const offContext=off.getContext('2d'),maskContext=mask.getContext('2d');
  function clipDuration(asset){if(!asset)return 0;if(asset.kind==='flipbook')return asset.frames/asset.fps;if(asset.kind==='spine'){const entry=spines.get(asset);if(entry)return Math.max(...entry.layers.map(layer=>{const clip=layer.data.findAnimation(asset.animation);return clip?clip.duration:0;}),.1);}return asset.duration||.5;}
  function draw(asset,x,y,time,options,loop){
    if(!asset||time<0||(!loop&&time>=clipDuration(asset)))return;
    const size=options.size;
    if(visuals.draw(ctx,asset,{x,y,time,size,rotation:options.rotation||0,tint:options.tint,trail:options.trail,trailColor:options.trailColor,trailDescriptor:trails().find(t=>t.id===options.trail),speed:options.previewSpeed||0,heading:options.previewHeading}))return;
    const angle=-((options.rotation||0)+(asset.rotation||0))*Math.PI/180;
    if(asset.kind==='spine'){const entry=spines.get(asset);if(!entry){spine(asset);return;}api.renderer.seek(entry.runtime,entry.layers,asset.animation,time,!!loop);const tint=options.tint||'#ffffff';for(const layer of entry.layers){const color=layer.skeleton.color;if(color&&color.set)color.set(parseInt(tint.slice(1,3),16)/255,parseInt(tint.slice(3,5),16)/255,parseInt(tint.slice(5,7),16)/255,1);}ctx.save();ctx.translate(x,y);ctx.rotate(angle);const scale=Looks.artworkScale(asset,size);ctx.scale(scale,-scale);api.renderer.drawWorld(entry.runtime,ctx,entry.layers);ctx.restore();return;}
    const source=image(asset);if(!source||!source.complete||!source.naturalWidth)return;
    let frame={x:0,y:0,width:source.naturalWidth,height:source.naturalHeight};
    if(asset.kind==='flipbook'){
      const map=loop&&asset.loopFrames,index=Math.floor(time*asset.fps),id=map&&map.length?map[index%map.length]:loop?index%asset.frames:Math.min(asset.frames-1,index);
      frame={x:id%asset.columns*asset.cell,y:Math.floor(id/asset.columns)*asset.cell,width:asset.cell,height:asset.cell};
    }else frame=snapshot.spriteFrames?.[asset.id]||frame;
    const original={width:frame.originalWidth||frame.width,height:frame.originalHeight||frame.height};
    const scale=Looks.artworkScale(asset,size,original),width=original.width*scale,height=original.height*scale,pivot=asset.visualPivot||{x:.5,y:.5};
    ctx.save();if(asset.additive)ctx.globalCompositeOperation='lighter';ctx.translate(x,y);ctx.rotate(angle);
    if(options.tint&&options.tint!=='#ffffff'){
      offContext.clearRect(0,0,256,256);offContext.drawImage(source,frame.x,frame.y,frame.width,frame.height,0,0,256,256);
      maskContext.clearRect(0,0,256,256);maskContext.drawImage(off,0,0);offContext.globalCompositeOperation='multiply';offContext.fillStyle=options.tint;offContext.fillRect(0,0,256,256);offContext.globalCompositeOperation='destination-in';offContext.drawImage(mask,0,0);offContext.globalCompositeOperation='source-over';
      ctx.drawImage(off,-width*pivot.x,-height*pivot.y,width,height);
    }else ctx.drawImage(source,frame.x,frame.y,frame.width,frame.height,-width*pivot.x,-height*pivot.y,width,height);
    ctx.restore();
  }
  function drawTrail(x,y,time,speed,options){
    if(options.trail===false||options.trail==='none'||time<=0)return;
    const person=who(),preset=trails().find(t=>t.id===(options.trail===undefined?person.defaultTrail:options.trail));
    const scale=validScale(options.scale)?options.scale:1, heading=options.previewHeading||0;
    if(preset){visuals.drawTrail(ctx,preset,{x,y,time,size:48*scale,speed,rotation:heading,trailColor:options.trailColor});return;}
    if(!person.defaultTrail&&!person.builtinFlight)return;
    const length=Math.min(time,.16)*speed, radians=heading*Math.PI/180;
    const tailX=x-length*Math.cos(radians),tailY=y-length*Math.sin(radians);
    ctx.save();
    const gradient=ctx.createLinearGradient(tailX,tailY,x,y);
    gradient.addColorStop(0,'transparent');gradient.addColorStop(1,options.trailColor||'#fff1c9');
    ctx.strokeStyle=gradient;ctx.lineWidth=4*scale;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(tailX,tailY);ctx.lineTo(x,y);ctx.stroke();ctx.restore();
  }
  function drawLaunchMarker(point){
    ctx.save();ctx.strokeStyle='#75d1e8';ctx.lineWidth=1.5;
    ctx.beginPath();ctx.arc(point.x,point.y,6,0,Math.PI*2);
    ctx.moveTo(point.x-9,point.y);ctx.lineTo(point.x+9,point.y);
    ctx.moveTo(point.x,point.y-9);ctx.lineTo(point.x,point.y+9);
    ctx.stroke();ctx.restore();
  }
  function drawFlight(look,x,y,time,heading,speed,nativeImpact){
    if(time<0)return;
    const launcher=actor&&actor.launcher||{},sx=launcher.scaleX??1,sy=launcher.scaleY??1;
    ctx.save();ctx.translate(x,y);ctx.rotate(heading*Math.PI/180);ctx.scale(sx,sy);
    if(look.flight)draw(look.flight,0,0,time,{...look.options,size:look.options.size*Looks.visualScale(look.options),
      previewSpeed:speed/Math.max(Math.abs(sx),.001),previewHeading:0},true);
    else combat.drawFlight(ctx,actor,time,nativeImpact);
    ctx.restore();
  }
  function sizeStage(view){
    // Large offsets can scroll beyond the viewport. Cap the backing bitmap
    // while retaining one game unit per CSS pixel.
    const ratio=Math.min(window.devicePixelRatio||1,4096/view.width,4096/view.height);
    const width=Math.ceil(view.width*ratio),height=Math.ceil(view.height*ratio);
    if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height;}
    const cssWidth=view.width+'px',cssHeight=view.height+'px';
    if(canvas.style.width!==cssWidth)canvas.style.width=cssWidth;
    if(canvas.style.height!==cssHeight)canvas.style.height=cssHeight;
    ctx.setTransform(width/view.width,0,0,height/view.height,0,0);
  }
  function tick(now){
    if(closed)return;
    const dt=last?Math.min((now-last)/1000,.1):0;last=now;if(!paused)age+=dt;
    const look=snapshot&&previewLook(),showUnits=mode==='all',launcher=actor&&actor.launcher||{};
    const size=look?look.options.size*Looks.visualScale(look.options)*(look.flight?.visualScale||1)*Math.max(1,Math.abs(launcher.scaleX??1),Math.abs(launcher.scaleY??1)):0;
    const padding=Math.max(24,size*Math.SQRT1_2);
    const person=look&&who();
    const facing=person&&person.type!=='wall'&&facingSelect.value==='-1'?-1:1;
    let marker, launchPoint;
    if(showUnits&&look){
      const draft=delayDrafts.get(unit);
      marker=draft&&validDelay(draft.value)?draft.value:effectiveDelay(unit);
      const muzzle=actor&&combat.muzzle(actor,{facing,animation:actor.attackAnimation,time:marker})||{x:0,y:-30};
      const offset=Looks.launchOffset(look.options,facing);
      launchPoint={x:(muzzle.x+offset.x)*facing,y:muzzle.y-offset.y};
    }
    const view=CombatPreview.stage(stageView.clientWidth||420,showUnits&&actor,showUnits&&target,padding,{facing,launch:launchPoint});
    sizeStage(view);
    const ground=view.shooter.groundY;
    ctx.fillStyle='#14202b';ctx.fillRect(0,0,view.width,view.height);
    ctx.fillStyle='#1d2d38';ctx.fillRect(0,ground,view.width,view.height-ground);
    ctx.strokeStyle='#3a505d';ctx.beginPath();ctx.moveTo(0,ground);ctx.lineTo(view.width,ground);ctx.stroke();
    if(look){
      const {flight,launch,impact,options}=look;
      if(!showUnits){
        const x=view.width/2,y=(ground+padding)/2;
        if(mode==='flight')drawFlight(look,x,y,age,0,0);
        else if(mode==='impact'&&look.nativeImpact)drawFlight(look,x,y,age%1,0,0,true);
        else{const asset=look[mode];draw(asset,x,y,age%(clipDuration(asset)+.45),options,false);}
        phase.textContent=mode==='flight'?'Flight · stationary':mode==='launch'?'Launch':'On hit';
      }else{
        const speed=person.speed>0?person.speed:500,playback=actor?actor.animationSpeed:person.animationSpeed||1;
        const origin=view.launch;
        const aim=view.aim,delta={x:aim.x-origin.x,y:aim.y-origin.y},heading=Math.atan2(delta.y,delta.x)*180/Math.PI;
        const delay=playback===0?Infinity:marker/playback,travel=Math.hypot(delta.x,delta.y)/speed,arrival=delay+travel;
        const attackDuration=actor?combat.duration(actor,actor.attackAnimation)/(playback>0?playback:1):1;
        const period=Math.max((Number.isFinite(arrival)?arrival:0)+Math.max(clipDuration(impact),.55)+.55,attackDuration+.4);
        const time=age%period,hitAge=time-arrival,flightAge=time-delay,attacking=time<attackDuration;
        if(actor)combat.draw(ctx,actor,{...view.shooter,animation:attacking?actor.attackAnimation:actor.idleAnimation,time:(attacking?time:time-attackDuration)*playback,loop:!attacking});
        const reacting=target&&hitAge>=0&&hitAge<combat.duration(target,target.hitAnimation)/1.5;
        if(target)combat.draw(ctx,target,{...view.target,animation:reacting?target.hitAnimation:target.idleAnimation,time:reacting?hitAge*1.5:time,loop:!reacting});
        if(!actor||!target){ctx.fillStyle='#aebdcd';ctx.font='14px system-ui';ctx.textAlign='center';ctx.fillText('Loading preview units…',view.width/2,ground+70);}
        if(actor&&!colorSampler)drawLaunchMarker(origin);
        const effects={...options,rotation:(options.rotation||0)-heading};
        draw(launch,origin.x,origin.y,flightAge,effects,false);
        if(flightAge>=0&&time<arrival){
          const ratio=flightAge/travel,x=origin.x+delta.x*ratio,y=origin.y+delta.y*ratio;
          if(!flight||!flight.visualLayers)drawTrail(x,y,flightAge,speed,{...options,previewHeading:heading});
          drawFlight(look,x,y,flightAge,heading,speed);
        }else if(hitAge>=0){
          combat.defaultHit(ctx,aim.x,aim.y,hitAge,70,actor);
          if(look.nativeImpact&&hitAge<.55)drawFlight(look,aim.x,aim.y,hitAge,heading,0,true);
          draw(impact,aim.x,aim.y,hitAge,effects,false);
        }
        phase.textContent=playback===0?'Animation frozen in Characters':time<delay?'Attack windup':time<arrival?'Launch → flight':hitAge<.55?'Hit':'Ready · repeating';
      }
    }
    if(paused&&snapshot)phase.textContent='Paused · '+phase.textContent;
    raf=requestAnimationFrame(tick);
  }
  function selectFocus(request){
    if(closed||!request||request.sequence<focusSequence||!snapshot.units.some(person=>person.key===request.key))return false;
    focusSequence=request.sequence;
    unitSelect.value=request.key;
    unitSelect.onchange();
    return true;
  }
  function focusUnit(request){
    return run(async()=>{
      if(request.sequence<focusSequence)return;
      const value=await api.ipc('load',{});
      if(closed)return;
      apply(value);
      selectFocus(value.focus&&value.focus.sequence>request.sequence?value.focus:request);
    });
  }
  run(async()=>{const value=await api.ipc('load',{});apply(value);if(!selectFocus(value.focus)&&!closed)loadActors();});raf=requestAnimationFrame(tick);
  return{focusUnit,destroy(){closed=true;stopColorSampling();for(const {scope,listener}of pickerPointerListeners)scope.removeEventListener('pointerdown',listener,true);root.removeEventListener('keydown',playbackKeyDown);root.removeEventListener('click',pickArtworkColor,true);actorRequest++;cancelAnimationFrame(raf);cancelAnimationFrame(libraryRaf);combat.destroy();visuals.destroy();root.innerHTML='';images.clear();spines.destroy();}};
}
module.exports={mount,createSpineCache};
