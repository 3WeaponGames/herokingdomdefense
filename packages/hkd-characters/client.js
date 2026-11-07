'use strict';
function mount(host,api){
  const itemMode=api.kind==='items';
  const el=(tag,text,parent,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;if(parent)parent.appendChild(n);return n;};
  const root=el('section',undefined,host,'character-editor');
  const header=el('header',undefined,root),heading=el('div',undefined,header);el('h1',itemMode?'Items':'Characters',heading);el('p',itemMode?'Fit hero gear. Keep current upgrades. Add new items when ready.':'Build a look. Fit the parts. Bring it into battle.',heading,'muted');
  const tools=el('div',undefined,header,'toolbar');
  const button=(parent,text,fn,cls)=>{const b=el('button',text,parent,cls);b.type='button';b.onclick=()=>{if(busy)return;return Promise.resolve().then(fn).catch(error=>message(error.message,true));};return b;};
  const newButton=button(tools,itemMode?'New item':'New character',createProfile),cloneButton=button(tools,'Duplicate',duplicateProfile),discardButton=button(tools,'Discard changes',discard),saveButton=button(tools,itemMode?'Save items':'Save characters',save,'primary');
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
  const original=canvasCard('Original',false),current=canvasCard('Current look',true);
  const playback=el('div',undefined,main,'playback'),transport=el('div',undefined,playback,'row wrap');
  const play=button(transport,'Pause',()=>{playing=!playing;play.textContent=playing?'Pause':'Play';last=0;});
  button(transport,'◀ Frame',()=>step(-1));button(transport,'Frame ▶',()=>step(1));
  const animation=el('select',undefined,transport);animation.setAttribute('aria-label','Preview animation');
  const speed=el('select',undefined,transport);for(const n of [.25,.5,1,2]){const o=el('option',n+'×',speed);o.value=n;}speed.value=1;speed.setAttribute('aria-label','Animation speed');
  const facing=button(transport,'Face left',()=>{direction*=-1;facing.textContent=direction===1?'Face left':'Face right';draw();});
  const zoom=el('select',undefined,transport);for(const n of [.5,.75,1,1.5,2]){const o=el('option',Math.round(n*100)+'%',zoom);o.value=n;}zoom.value=1;zoom.setAttribute('aria-label','Preview zoom');zoom.onchange=draw;
  const options=el('div',undefined,playback,'row wrap');
  function check(parent,text,value,fn){const label=el('label',undefined,parent,'check-row'),input=el('input',undefined,label);input.type='checkbox';input.checked=value;el('span',text,label);input.onchange=()=>fn(input.checked);return input;}
  check(options,'Compare original',true,value=>{original.box.hidden=!value;});const bonesToggle=check(options,'Show anchor bones',false,draw);
  button(options,'Fit preview',()=>{fitBounds(true);draw();});
  const position=el('span','0.000 s',options,'time'),scrub=el('input',undefined,playback,'timeline');scrub.type='range';scrub.min=0;scrub.max=1;scrub.step='any';scrub.value=0;scrub.setAttribute('aria-label','Animation position');
  el('p','Select a fitted part to drag it in the preview. Parts follow the existing animation bones.',main,'help');
  const footer=el('footer',undefined,root),status=el('span','Loading character library…',footer,'status'),saveState=el('span','',footer);
  let data=null,saved=null,version=0,parts=[],units=[],assets={},selected='',virtual=null,selectedPart='',selectedAsset='',selectedModel='',rig=null,spine=null,layers=[],baseLayers=[],states=[],fittingKey='',poseBounds=null,token=0,disposed=false,playing=true,time=0,duration=1,last=0,raf=null,direction=1,limit=60,drag=null,stages=Promise.resolve(),lastSent='',stageError=null,busy=false;
  const images=new Map();let fittingRetryAfter=0;
  const clone=v=>JSON.parse(JSON.stringify(v));
  const profile=()=>data&&(data.profiles[selected]||virtual);
  const part=()=>profile()&&profile().parts.find(p=>p.id===selectedPart);
  const unitFor=p=>units.find(u=>u.type===p.base.type&&u.id===String(p.base.id));
  function message(text,error){status.textContent=text;status.classList.toggle('error',!!error);}
  function dirty(){const changed=JSON.stringify(data)!==JSON.stringify(saved);saveState.textContent=changed?'● Unsaved draft':'All changes saved';saveButton.disabled=busy||!changed;discardButton.disabled=busy||!changed;return changed;}
  function setBusy(value){busy=value;root.querySelectorAll('input,select,button').forEach(control=>{control.disabled=value;});dirty();}
  function stage(){
    if(!data)return stages;const value=JSON.stringify(data);if(value===lastSent)return stages;lastSent=value;const draft=clone(data);
    // Validation can fail for an intermediate draft. A corrected draft must
    // retry against the last accepted revision; conflicts still fail server-side.
    stages=stages.then(async()=>{const result=await api.ipc('change',{version,data:draft});version=result.version;stageError=null;}).catch(error=>{stageError=error;if(lastSent===value)lastSent='';message(error.message+' Your local draft is still open.',true);});return stages;
  }
  function changed(refresh){fittingKey='';dirty();if(refresh)renderInspector();draw();stage();}
  function unique(prefix,collection){let id=prefix,index=2;while(Object.prototype.hasOwnProperty.call(collection,id))id=prefix+'-'+index++;return id;}
  function createProfile(){if(!data)return;const id=unique(itemMode?'new-item':'new-character',data.profiles);const base=profile()?clone(profile().base):(itemMode?{type:'item',id:units[0].id}:{type:'ally',id:'90001'});data.profiles[id]={name:itemMode?'New item':'New character',base,scale:1,parts:[]};selectProfile(id);changed();}
  function duplicateProfile(){if(!profile())return;const id=unique((selected||'character')+'-copy',data.profiles);data.profiles[id]=clone(profile());data.profiles[id].name+=' copy';selectProfile(id);changed();}
  function removeProfile(){if(!profile())return;const id=selected;Object.keys(data.assignments).forEach(k=>{if(data.assignments[k]===id)delete data.assignments[k];});delete data.profiles[id];selectProfile(Object.keys(data.profiles)[0]||'');changed();}
  async function save(){
    if(!data||busy)return;setBusy(true);try{await stage();await stages;if(stageError)throw stageError;const result=await api.ipc('save',{version});version=result.version;saved=clone(result.savedData);message(result.result.warning||(result.result.saved?(itemMode?'Items saved. Assigned gear appears at the selected equipment tier.':'Characters saved. New and reloaded game sessions use these looks.'):'No changes to save.'));}finally{setBusy(false);}
  }
  function acceptDraft(result){version=result.version;data=clone(result.data);saved=clone(result.savedData);stageError=null;lastSent=JSON.stringify(data);selectProfile(data.profiles[selected]?selected:Object.keys(data.profiles)[0]||'');dirty();}
  async function discard(){if(!data||busy)return;setBusy(true);try{await stages;acceptDraft(await api.ipc('discard',{version}));message('Unsaved changes discarded.');}finally{setBusy(false);}}
  async function reloadDraft(){if(!data||busy)return;setBusy(true);try{await stages;acceptDraft(await api.ipc('load'));message('Latest shared draft loaded. Changes still require Save.');}finally{setBusy(false);}}
  function renderLooks(){
    unitList.innerHTML='';for(const unit of units.filter(u=>!unitFilter.value||u.group===unitFilter.value)){const b=button(unitList,unit.group+' · '+unit.name,()=>selectUnit(unit));const p=profile();b.classList.toggle('selected',!!p&&p.base.type===unit.type&&String(p.base.id)===unit.id);if(data.assignments[unit.key])el('span',' · Custom',b,'assigned');}
    looks.innerHTML='';if(!Object.keys(data.profiles).length)el('p',itemMode?'Create your first item.':'Create your first character look.',looks,'empty');for(const [id,p]of Object.entries(data.profiles)){const b=button(looks,p.name,()=>selectProfile(id));b.classList.toggle('selected',id===selected);if(Object.values(data.assignments).includes(id))el('span',' · In game',b,'assigned');}
  }
  unitFilter.onchange=renderLooks;
  async function selectUnit(unit){if(data.assignments[unit.key])return selectProfile(data.assignments[unit.key]);selected='';virtual={name:unit.name,base:{type:unit.type,id:unit.id},scale:1,parts:[]};selectedPart=selectedAsset='';renderLooks();renderInspector();renderAssets();await loadRig();}
  function editOriginal(){if(!virtual)return;const p=clone(virtual),id=unique(p.base.type+'-'+p.base.id.replace(/:/g,'-'),data.profiles),key=unitFor(p).key;data.profiles[id]=p;data.assignments[key]=id;selectProfile(id);changed();}
  async function selectProfile(id){virtual=null;selected=id;selectedPart=profile()&&profile().parts[0]?profile().parts[0].id:'';selectedAsset=part()?part().sprite:'';renderLooks();renderInspector();renderAssets();await loadRig();}
  function field(parent,label,value,onChange,options){const wrap=el('label',undefined,parent,'field');el('span',label,wrap);const input=el(options?'select':'input',undefined,wrap);if(options){for(const item of options){const option=el('option',item.label===undefined?item.value:item.label,input);option.value=item.value;}}else input.type='text';input.value=value===undefined?'':value;input.setAttribute('aria-label',label);input.disabled=busy;input.onchange=()=>{if(!busy)onChange(input.value);};return input;}
  function number(parent,label,key,value,step,min,max,after){const valid=n=>Number.isFinite(n)&&n>=min&&n<=max&&(key!=='order'||Number.isInteger(n))&&(!['scaleX','scaleY'].includes(key)||Math.abs(n)>=.01);const input=field(parent,label,value,v=>{if(!part())return;const n=Number(v);if(!valid(n)){input.value=part()[key];return;}part()[key]=n;if(after)after(n);changed();});input.type='number';input.step=step;input.min=min;input.max=max;input.oninput=()=>{if(!part()||input.value==='')return;const n=Number(input.value);if(!valid(n))return;part()[key]=n;fittingKey='';dirty();draw();};return input;}
  function modelInspector(p){
    if(!rig)return;const section=el('details',undefined,inspector,'model-settings');section.open=itemMode;el('summary','Adjust original model',section);
    if(!rig.layers.some(l=>l.uuid===selectedModel))selectedModel=rig.defaultLayer||rig.layers[0].uuid;
    field(section,'Original model layer',selectedModel,v=>{selectedModel=v;renderInspector();},rig.layers.map(l=>({value:l.uuid,label:l.name})));
    const layer=rig.layers.find(l=>l.uuid===selectedModel);
    field(section,'Original model skin',p.skins&&p.skins[layer.uuid]||'',v=>{p.skins=p.skins||{};if(v)p.skins[layer.uuid]=v;else delete p.skins[layer.uuid];changed();},[{value:'',label:'Original skin'},...layer.skins.map(s=>({value:s,label:s}))]);
    const grid=el('div',undefined,section,'grid-2'),model=p.models&&p.models[layer.uuid]||{};
    for(const [key,label,initial,min,max,step]of [['x','Model X',0,-4096,4096,.1],['y','Model Y',0,-4096,4096,.1],['scaleX','Model scale X',1,.01,20,.05],['scaleY','Model scale Y',1,.01,20,.05],['rotation','Model rotation',0,-3600,3600,1],['opacity','Model opacity',1,0,1,.05]]){
      const apply=value=>{const n=Number(value);if(value===''||!Number.isFinite(n)||n<min||n>max)return false;p.models=p.models||{};p.models[layer.uuid]=p.models[layer.uuid]||{};p.models[layer.uuid][key]=n;dirty();draw();return true;};
      const input=field(grid,label,model[key]===undefined?initial:model[key],value=>{if(!apply(value))input.value=(p.models&&p.models[layer.uuid]||{})[key]===undefined?initial:p.models[layer.uuid][key];stage();});input.type='number';input.min=min;input.max=max;input.step=step;input.oninput=()=>apply(input.value);
    }
    button(section,'Reset original model',()=>{if(p.models)delete p.models[layer.uuid];if(p.skins)delete p.skins[layer.uuid];changed(true);});
  }
  function renderInspector(){
    inspector.innerHTML='';const p=profile();if(!p){el('p','Create a character to start fitting parts.',inspector,'empty');return;}
    if(virtual){el('h2',p.name,inspector);el('p',itemMode?'Current equipment appearance':'Original appearance',inspector,'muted');button(inspector,itemMode?'Edit this item':'Edit this character',editOriginal,'primary wide');el('p',itemMode?'Browse freely. Create a draft to adjust this item or fit new parts.':'Browse freely. Create an appearance draft to adjust this character or fit new parts.',inspector,'help');return;}
    el('h2',itemMode?'ITEM':'CHARACTER',inspector);const nameInput=field(inspector,itemMode?'Item name':'Character name',p.name,v=>{p.name=v.trim()||p.name;renderLooks();previewName.textContent=p.name;changed();});nameInput.oninput=()=>{if(!nameInput.value.trim()||nameInput.value.length>100)return;p.name=nameInput.value;renderLooks();previewName.textContent=p.name;dirty();};
    field(inspector,itemMode?'Equipment tier':'Base character',(unitFor(p)||{}).key,v=>{const unit=units.find(u=>u.key===v);p.base={type:unit.type,id:unit.id};p.parts=[];p.skins={};p.models={};selectedPart='';Object.keys(data.assignments).forEach(k=>{if(data.assignments[k]===selected)delete data.assignments[k];});changed();renderLooks();renderInspector();loadRig();},units.map(u=>({value:u.key,label:u.group+' · '+u.name+' '+(u.id==='hero'?'':u.id)})));
    const size=field(inspector,'Character size',p.scale===undefined?1:p.scale,v=>{const n=Number(v);if(!Number.isFinite(n)||n<.1||n>4){size.value=p.scale||1;return;}p.scale=n;changed();});size.type='number';size.min=.1;size.max=4;size.step=.05;if(itemMode)size.parentElement.hidden=true;
    check(inspector,itemMode?'Use this item at this tier':'Use this look for this unit',data.assignments[(unitFor(p)||{}).key]===selected,value=>{const key=unitFor(p).key;if(value)data.assignments[key]=selected;else if(data.assignments[key]===selected)delete data.assignments[key];renderLooks();changed();});
    el('p',itemMode?'Uses the selected tier’s existing stats, upgrade cost and unlocks.':'Appearance only. Combat stats and attack timing stay in the Units tool.',inspector,'help');if(itemMode)button(inspector,'Edit stats and upgrades',()=>api.openEquipment?api.openEquipment():message('Open Tools → Hero Kingdom Defense → Equipment in Creator.'));
    modelInspector(p);
    const rows=el('div',undefined,inspector,'part-list');p.parts.forEach(item=>{const b=button(rows,'',()=>{selectedPart=item.id;selectedAsset=item.sprite;renderInspector();renderAssets();draw();});b.classList.toggle('selected',item.id===selectedPart);const image=el('img',undefined,b);image.src=api.image(assets[item.sprite].thumbnail);el('span',item.id,b);});
    const add=el('div',undefined,inspector,'row');button(add,'Add selected part',addPart);button(add,'Remove part',()=>{if(!part())return;p.parts.splice(p.parts.indexOf(part()),1);selectedPart=(p.parts[0]&&p.parts[0].id)||'';changed(true);});
    const currentPart=part();if(!currentPart){el('p','Choose a part in the library, then Add selected part.',inspector,'help');button(inspector,itemMode?'Delete item':'Delete character',removeProfile,'danger');return;}
    el('div',undefined,inspector,'divider');el('h2','FIT SELECTED PART',inspector);
    const a=assets[currentPart.sprite],assetBox=el('div',undefined,inspector,'selected-asset'),img=el('img',undefined,assetBox);img.src=api.image(a.thumbnail);el('span',a.name,assetBox);
    button(inspector,'Use library selection',()=>{if(!assets[selectedAsset])return;currentPart.sprite=selectedAsset;changed(true);});
    if(!rig)return;
    field(inspector,'Model layer',currentPart.layer,v=>{const l=rig.layers.find(l=>l.uuid===v);currentPart.layer=v;currentPart.slot=l.json.slots[0].name;currentPart.bone=l.json.bones[0].name;currentPart.hideSlots=[];changed(true);},rig.layers.map(l=>({value:l.uuid,label:l.name})));
    const layer=rig.layers.find(l=>l.uuid===currentPart.layer);if(!layer)return;
    field(inspector,'Replace slot',currentPart.slot,v=>{currentPart.slot=v;currentPart.hideSlots=currentPart.hideSlots.filter(s=>s!==v);changed(true);},layer.json.slots.map(s=>({value:s.name,label:s.name+' · '+s.bone})));
    field(inspector,'Anchor bone',currentPart.bone,v=>{currentPart.bone=v;changed();},layer.json.bones.map(b=>({value:b.name,label:b.name})));
    field(inspector,'Base skin',p.skins&&p.skins[layer.uuid]||'',v=>{p.skins=p.skins||{};if(v)p.skins[layer.uuid]=v;else delete p.skins[layer.uuid];changed();},[{value:'',label:'Original skin'},...layer.skins.map(s=>({value:s,label:s}))]);
    const positions=el('div',undefined,inspector,'grid-2');number(positions,'Offset X','x',currentPart.x,.1,-4096,4096);number(positions,'Offset Y','y',currentPart.y,.1,-4096,4096);
    const scales=el('div',undefined,inspector,'grid-2');number(scales,'Scale X','scaleX',currentPart.scaleX,.05,-20,20);number(scales,'Scale Y','scaleY',currentPart.scaleY,.05,-20,20);
    const angles=el('div',undefined,inspector,'grid-2');number(angles,'Rotation','rotation',currentPart.rotation,1,-3600,3600);number(angles,'Opacity','opacity',currentPart.opacity,.05,0,1);
    number(inspector,'Draw order offset','order',currentPart.order,1,-layer.json.slots.length,layer.json.slots.length);
    const fit=el('div',undefined,inspector,'row wrap');button(fit,'Fit to slot',fitPart);button(fit,'Flip X',()=>{currentPart.scaleX*=-1;changed(true);});button(fit,'Flip Y',()=>{currentPart.scaleY*=-1;changed(true);});
    el('h3','Hide original pieces',inspector);const hides=el('div',undefined,inspector,'slot-hides');for(const slot of layer.json.slots.filter(s=>s.name!==currentPart.slot&&!p.parts.some(other=>other!==currentPart&&other.layer===layer.uuid&&other.slot===s.name)))check(hides,slot.name,currentPart.hideSlots.includes(slot.name),value=>{currentPart.hideSlots=value?currentPart.hideSlots.concat(slot.name):currentPart.hideSlots.filter(s=>s!==slot.name);changed();});
    el('p','Use a free slot to add a piece, or replace an existing piece. Draw order moves it in front or behind other parts.',inspector,'help');button(inspector,itemMode?'Delete item':'Delete character',removeProfile,'danger');
  }
  function renderAssets(){
    const filter=search.value.trim().toLowerCase(),selectedCategory=category.value;
    const found=parts.filter(p=>(!selectedCategory||p.category===selectedCategory)&&(!filter||(p.name+' '+p.id).toLowerCase().includes(filter)));
    count.textContent=found.length+' parts · '+(selectedAsset?assets[selectedAsset].name:'select a part');gallery.innerHTML='';
    for(const asset of found.slice(0,limit)){const b=button(gallery,'',()=>{selectedAsset=asset.id;renderAssets();});b.className='asset-tile'+(selectedAsset===asset.id?' selected':'');b.title=asset.name;b.setAttribute('aria-label',asset.name);const image=el('img',undefined,b);image.loading='lazy';image.src=api.image(asset.thumbnail);image.alt=asset.name;}
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
    const layer=rig.layers.find(l=>l.uuid===rig.defaultLayer)||rig.layers[0],used=new Set(p.parts.filter(v=>v.layer===layer.uuid).map(v=>v.slot));
    const shown=baseLayers.find(l=>l.description.uuid===layer.uuid);let candidates=layer.json.slots.filter(s=>!used.has(s.name));if(shown)candidates=candidates.sort((a,b)=>slotScore(shown.skeleton.findSlot(b.name),asset.category)-slotScore(shown.skeleton.findSlot(a.name),asset.category));const available=candidates[0];if(!available)throw Error('Every slot on this model is already used.');
    const id=unique(asset.category.split('/').pop().toLowerCase(),Object.fromEntries(p.parts.map(v=>[v.id,true])));
    p.parts.push({id,sprite:asset.id,layer:layer.uuid,slot:available.name,bone:shown?anchorFor(shown.skeleton.findSlot(available.name)):available.bone,x:0,y:0,rotation:0,scaleX:1,scaleY:1,opacity:1,order:0,hideSlots:[]});selectedPart=id;changed(true);fitPart();
  }
  function imageFor(asset){const source=api.image(asset.image);if(!images.has(source)){const promise=new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(Error('Cannot load part '+asset.name));img.src=source;}).catch(error=>{if(images.get(source)===promise)images.delete(source);throw error;});images.set(source,promise);}return images.get(source);}
  async function loadRig(){
    const p=profile(),serial=++token;states.forEach(api.core.restore);states=[];layers=baseLayers=[];rig=null;selectedModel='';fittingRetryAfter=0;if(!p)return;message('Loading '+p.name+'…');previewName.textContent=p.name;
    try{const description=await api.ipc('describe',p.base);if(serial!==token||disposed)return;rig=description;spine=api.runtime(description);
      const result=await Promise.all([api.renderer.createLayers(spine,description.layers),api.renderer.createLayers(spine,description.layers)]);if(serial!==token||disposed)return;
      layers=result[0];baseLayers=result[1];fittingKey='';states=[];animation.innerHTML='';const names=[...new Set([].concat.apply([],description.layers.map(l=>l.animations)))];for(const name of names){const option=el('option',name,animation);option.value=name;}animation.value=names.includes('idle')?'idle':names[0];time=0;updateDuration();fitBounds();renderInspector();draw();message('Ready · '+parts.length+' imported parts. Changes remain drafts until Save.');
    }catch(error){if(serial===token)message(error.message,true);}
  }
  function updateDuration(){duration=Math.max(1/30,...layers.map(l=>(l.data.findAnimation(animation.value)||{}).duration||0));scrub.max=duration;time=Math.min(time,duration);}
  function scaleLayers(list,multiplier,models){for(const layer of list){const source=rig.layers.find(l=>l.uuid===layer.description.uuid),m=models&&models[source.uuid]||{};layer.description={...source,x:source.x+(m.x||0),y:source.y+(m.y||0),rotation:m.rotation||0,opacity:m.opacity===undefined?1:m.opacity,scaleX:source.scaleX*multiplier*(m.scaleX===undefined?1:m.scaleX),scaleY:source.scaleY*multiplier*(m.scaleY===undefined?1:m.scaleY)};}}
  function fitBounds(includeCurrent){if(!spine||!layers.length)return;api.renderer.seek(spine,baseLayers,'idle',0,false);let b=api.renderer.bounds(spine,baseLayers);if(includeCurrent){const c=api.renderer.bounds(spine,layers);b={minX:Math.min(b.minX,c.minX),minY:Math.min(b.minY,c.minY),maxX:Math.max(b.maxX,c.maxX),maxY:Math.max(b.maxY,c.maxY)};b.width=b.maxX-b.minX;b.height=b.maxY-b.minY;}poseBounds={...b,minX:b.minX-12,minY:b.minY-3,maxX:b.maxX+12,maxY:b.maxY+18,width:b.width+24,height:b.height+21};}
  function prepareFitting(){
    const p=profile();if(!p||!layers.length||Date.now()<fittingRetryAfter)return;
    const signature=JSON.stringify([p.parts,p.skins||{}]);if(signature===fittingKey)return;
    const serial=token,sprites=[...new Set(p.parts.map(v=>v.sprite))];
    fittingKey=signature;
    Promise.all(sprites.map(async id=>[id,await imageFor(assets[id])])).then(loaded=>{if(disposed||serial!==token||signature!==fittingKey)return;
      states.forEach(api.core.restore);const textures=Object.fromEntries(loaded.map(([id,img])=>[id,new spine.FakeTexture(img)]));
      states=layers.map(l=>api.core.prepare(spine,l.skeleton,p.parts.filter(v=>v.layer===l.description.uuid),assets,textures));draw();
    }).catch(error=>{if(!disposed&&serial===token&&signature===fittingKey){fittingKey='';fittingRetryAfter=Date.now()+1000;message(error.message,true);}});
  }
  function draw(){
    if(disposed||!layers.length||!profile())return;
    try{
      const p=profile();scaleLayers(layers,p.scale||1,p.models);scaleLayers(baseLayers,1);
      for(const layer of layers){const skin=p.skins&&p.skins[layer.description.uuid]||rig.layers.find(l=>l.uuid===layer.description.uuid).skin;if(layer.data.findSkin(skin)&&(layer.skeleton.skin||{}).name!==skin)layer.skeleton.setSkinByName(skin);}
      states.forEach(api.core.restore);api.renderer.seek(spine,layers,animation.value,time,true);api.renderer.seek(spine,baseLayers,animation.value,time,true);prepareFitting();states.forEach(api.core.apply);
      const options={width:540,height:650,bounds:poseBounds,zoom:Number(zoom.value),facing:direction};
      if(!original.box.hidden)api.renderer.drawCanvas(spine,original.canvas,baseLayers,options);api.renderer.drawCanvas(spine,current.canvas,layers,options);drawHandles();position.textContent=time.toFixed(3)+' s';scrub.value=time;
    }catch(error){message(error.message,true);}
  }
  function projectPoint(layer,point){const box=poseBounds,scale=Math.min((540-32)/box.width,(650-24)/box.height)*Number(zoom.value),p=api.renderer.transformPoint(layer.description,point.x,point.y);return {x:(p.x-(box.minX+box.maxX)/2)*scale*direction+270,y:650-12+box.minY*scale-p.y*scale};}
  function localPoint(layer,bone,screen){const box=poseBounds,s=Math.min(508/box.width,626/box.height)*Number(zoom.value),at=api.renderer.inversePoint(layer.description,(screen.x-270)/(s*direction)+(box.minX+box.maxX)/2,(650-12+box.minY*s-screen.y)/s),p=new spine.Vector2(at.x,at.y);bone.worldToLocal(p);return p;}
  function drawHandles(){
    const ctx=current.handles.getContext('2d');ctx.clearRect(0,0,540,650);const selectedPartObject=part();
    if(bonesToggle.checked)for(const layer of layers)for(const bone of layer.skeleton.bones){const p=projectPoint(layer,{x:bone.worldX,y:bone.worldY});ctx.fillStyle=selectedPartObject&&bone.data.name===selectedPartObject.bone?'#ffcf74':'#8cadd5';ctx.beginPath();ctx.arc(p.x,p.y,selectedPartObject&&bone.data.name===selectedPartObject.bone?4:2.5,0,Math.PI*2);ctx.fill();if(selectedPartObject&&bone.data.name===selectedPartObject.bone){ctx.font='13px Arial';ctx.fillText(bone.data.name,p.x+7,p.y-5);}}
    if(!selectedPartObject)return;const layer=layers.find(l=>l.description.uuid===selectedPartObject.layer),slot=layer&&layer.skeleton.findSlot(selectedPartObject.slot),attachment=slot&&slot.getAttachment();if(!(attachment instanceof spine.RegionAttachment)||!attachment._characterBone)return;
    const vertices=[];attachment.computeWorldVertices(slot.bone,vertices,0,2);ctx.strokeStyle='#ffcf74';ctx.lineWidth=1.5;ctx.setLineDash([6,4]);ctx.beginPath();for(let i=0;i<8;i+=2){const p=projectPoint(layer,{x:vertices[i],y:vertices[i+1]});i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y);}ctx.closePath();ctx.stroke();ctx.setLineDash([]);
  }
  function screenPoint(event){const box=current.handles.getBoundingClientRect();return {x:(event.clientX-box.left)*540/box.width,y:(event.clientY-box.top)*650/box.height};}
  current.handles.onpointerdown=event=>{if(busy||!part()||!layers.length)return;const p=part(),layer=layers.find(l=>l.description.uuid===p.layer),bone=layer.skeleton.findBone(p.bone);drag={pointer:event.pointerId,layer,bone,start:localPoint(layer,bone,screenPoint(event)),x:p.x,y:p.y};current.handles.setPointerCapture(event.pointerId);};
  current.handles.onpointermove=event=>{if(!drag||!part())return;const at=localPoint(drag.layer,drag.bone,screenPoint(event));part().x=Math.max(-4096,Math.min(4096,Math.round((drag.x+at.x-drag.start.x)*10)/10));part().y=Math.max(-4096,Math.min(4096,Math.round((drag.y+at.y-drag.start.y)*10)/10));fittingKey='';draw();dirty();};
  current.handles.onpointerup=()=>{if(!drag)return;drag=null;renderInspector();stage();};current.handles.onpointercancel=()=>{drag=null;renderInspector();stage();};
  function fitPart(){
    const p=part();if(!p||!layers.length)return;const layer=baseLayers.find(l=>l.description.uuid===p.layer),slot=layer.skeleton.findSlot(p.slot),attachment=slot.getAttachment(),bone=layer.skeleton.findBone(p.bone),asset=assets[p.sprite];if(!attachment){message('This slot is empty. Choose an anchor and adjust the offsets to add a piece.');return;}
    const v=[];if(attachment instanceof spine.RegionAttachment)attachment.computeWorldVertices(slot.bone,v,0,2);else if(attachment instanceof spine.MeshAttachment)attachment.computeWorldVertices(slot,0,attachment.worldVerticesLength,v,0,2);else return;
    const xs=v.filter((_,i)=>i%2===0),ys=v.filter((_,i)=>i%2),minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys),center=new spine.Vector2((minX+maxX)/2,(minY+maxY)/2);bone.worldToLocal(center);
    p.x=center.x;p.y=center.y;p.rotation=-Math.atan2(bone.c,bone.a)*180/Math.PI;p.scaleX=Math.max(.01,Math.min(20,(maxX-minX)/asset.width/Math.max(.001,Math.hypot(bone.a,bone.c))));p.scaleY=Math.max(.01,Math.min(20,(maxY-minY)/asset.height/Math.max(.001,Math.hypot(bone.b,bone.d))));changed(true);
  }
  function step(amount){playing=false;play.textContent='Play';time=Math.max(0,Math.min(duration,time+amount/30));draw();}
  animation.onchange=()=>{time=0;updateDuration();draw();};scrub.oninput=()=>{playing=false;play.textContent='Play';time=Number(scrub.value);draw();};
  function frame(now){if(disposed)return;if(playing&&layers.length){if(last)time=(time+(now-last)/1000*Number(speed.value))%duration;draw();}last=now;raf=requestAnimationFrame(frame);}
  api.ipc('load').then(result=>{if(disposed)return;data=clone(result.data);saved=clone(result.savedData);version=result.version;parts=result.parts;units=result.units;assets=Object.fromEntries(parts.map(p=>[p.id,p]));lastSent=JSON.stringify(data);const all=el('option','All categories',category);all.value='';for(const name of [...new Set(parts.map(p=>p.category))].sort()){const option=el('option',name,category);option.value=name;}unitFilter.innerHTML='';for(const group of [itemMode?'All equipment':'All characters',...new Set(units.map(u=>u.group))]){const option=el('option',group,unitFilter);option.value=group.startsWith('All ')?'':group;}if(Object.keys(data.profiles).length)selectProfile(Object.keys(data.profiles)[0]);else if(units.length)selectUnit(units[0]);dirty();raf=requestAnimationFrame(frame);}).catch(error=>message(error.message,true));
  return {destroy(){disposed=true;token++;if(raf!==null)cancelAnimationFrame(raf);states.forEach(api.core.restore);api.renderer.destroyCanvas(original.canvas);api.renderer.destroyCanvas(current.canvas);root.remove();},getState(){return{selected,selectedPart,dirty:data?dirty():false,loaded:!!layers.length,silent:true};}};
}
module.exports={mount};
