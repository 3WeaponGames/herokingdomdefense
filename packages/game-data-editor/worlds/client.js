'use strict';
const fs=require('fs'),path=require('path'),M=require('./model'),Paint=require('./paint'),Renderer=require('./renderer'),BuildingRenderer=require('./building-renderer'),Dock=require('./dock'),Selection=require('./selection'),Gizmos=require('./gizmos'),Budget=require('./budget'),Blockers=require('./blockers'),Terrain=require('./terrain'),ImageRegistry=require('./image-registry'),Picking=require('./picking'),StagePanels=require('./stage-panels'),PathEditor=require('./path-editor'),WaveEditor=require('./wave-editor');
const clone=M.clone,el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
const option=(value,text)=>{const o=el('option',text);o.value=String(value);return o;};
function mount(container,options){
 const stageMode=options.kind==='stages',state={closed:false,catalog:null,snap:null,map:null,tab:stageMode?'Stage':'Ground',tool:'select',selection:[],layerSelection:false,layer:'grass-detail',asset:null,biome:'all',category:'all',query:'',min:1,max:1,size:120,shape:'round',soft:false,hardness:.7,opacity:1,eraseTarget:'layer',ground:'roads',zoom:1,pan:{x:0,y:0},images:{},pending:Promise.resolve(),drag:null,wave:0,spawn:null,graph:null,buildingAsset:null,buildingVariant:null,buildingPlacements:[],showBlockers:true,snapGrid:0,variant:'A',level:1,previewHall:3,gate:'closed',radius:18,nav:null,layerSearch:'',expanded:{},layerLimits:{},solo:null,textureScale:1,paintMode:'texture',edgeScale:1,edgeSmoothing:.6,edgeStyle:'textured',roadFamily:null,roadPreferences:{},brushCursor:null,autoBlockerMode:null,autoBlockerLayers:null,autoBlockerBusy:false,autoBlockerPrecision:0,autoBlockerPreview:null,autoBlockerPreviewSignature:null,lassoPoints:[],lassoHover:null,lassoOp:'paint',brushEdgeTolerance:1};
 const root=el('div',undefined,'world-tool'),style=el('style');style.textContent=fs.readFileSync(path.join(__dirname,'style.css'),'utf8');root.appendChild(style);const top=el('div',undefined,'world-top'),tabs=el('div',undefined,'world-tabs'),main=el('div',undefined,'world-main'),left=el('aside',undefined,'world-side'),rail=el('nav',undefined,'world-toolrail'),view=el('div',undefined,'world-view'),right=el('aside',undefined,'world-inspector'),dock=el('aside',undefined,'world-dock'),layersPane=el('section',undefined,'world-layers'),bottom=el('div',undefined,'world-timeline'),status=el('div','Loading…','world-status'),canvas=el('canvas'),hint=el('div','Wheel: zoom · Middle/right drag: pan · Shift: multiple selection · Delete: remove','world-hint');canvas.tabIndex=0;view.appendChild(canvas);view.appendChild(hint);main.appendChild(left);main.appendChild(rail);main.appendChild(view);if(stageMode)main.appendChild(right);else{dock.appendChild(right);dock.appendChild(layersPane);main.appendChild(dock);}[top,tabs,main,bottom,status].forEach(n=>root.appendChild(n));container.appendChild(root);bottom.hidden=true;root.classList.toggle('world-stages',stageMode);const ctx=canvas.getContext('2d'),renderer=Renderer.create();let frame=null,resizeTimer=null,loadSerial=0,paletteUI=null,orderCache=null,activeDialog=null,dialogSerial=0,pendingShared=false,sharedScheduled=false,frozenBlockers=null,mapRequestSerial=0,changeTimer=null,deferredRender=false,pendingFit=false;const previewOwner='world-panel-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2),picking=Picking.create(),pictures=ImageRegistry.create({lookup:id=>state.catalog&&(assetTable()[id]||state.catalog.images[id]||state.extraImages&&state.extraImages[id]),onLoad:()=>{state.groupPreview=null;draw();},onError:(id,error)=>message(error.message,true)});state.images=pictures.records;canvas.setAttribute('aria-label','Map canvas');
 const placementBar=stageMode?null:el('section',undefined,'world-stage-preview');let placementRequestSerial=0;
 state.placementStage=null;state.placementSnap=null;state.placementLoading=false;state.placementFootprints=true;
 if(placementBar){placementBar.setAttribute('aria-label','Stage placement previews');root.insertBefore(placementBar,tabs);}
const layerHeading=el('h3'),layerSearch=el('input'),layerList=el('div',undefined,'world-layer-list'),layerActions=el('div',undefined,'world-actions'),soloExit=el('button','Exit Solo');
 let splitters=null;
 if(!stageMode){root.classList.add('world-map');layerSearch.type='search';layerSearch.placeholder='Find layer or object…';layerSearch.setAttribute('aria-label','Find layer or object');layerSearch.oninput=()=>{state.layerSearch=layerSearch.value;renderLayerPane();};soloExit.onclick=()=>setSolo(null);soloExit.hidden=true;layersPane.appendChild(layerHeading);layersPane.appendChild(layerActions);layersPane.appendChild(layerSearch);layersPane.appendChild(soloExit);layersPane.appendChild(layerList);splitters=Dock.attach({main,left,dock,inspector:right,layers:layersPane,onResize:draw,key:options.preferenceKey||'hkd-world-dock-v3'});}
 function message(text,error){if(state.closed)return;status.textContent=text;status.className='world-status'+(error?' error':'');status.setAttribute('aria-live',error?'assertive':'polite');}
 function button(parent,text,action,active){const b=el('button',text,active?'active':'');b.onclick=()=>Promise.resolve().then(action).catch(e=>message(e.message,true));parent.appendChild(b);return b;}

 const toolIcons={select:'M5 3L5 20L10 15L14 22L17 20L13 13L20 12Z',pan:'M8 12V5C8 3 11 3 11 5V10V3C11 1 14 1 14 3V10V5C14 3 17 3 17 5V11V8C17 6 20 6 20 8V15C20 20 17 22 13 22H12C9 22 8 20 6 17L3 12C2 10 4 8 6 10L8 12',paint:'M14 3L21 10L11 20L4 20L4 13ZM4 20L3 22',erase:'M14 3L22 11L12 21H6L2 17ZM7 12L15 20',delete:'M4 6H20M9 3H15M6 6L7 22H17L18 6M10 10V18M14 10V18','ground-image':'M3 3H21V21H3ZM3 17L9 11L14 16L17 13L21 17M7 7H9',place:'M12 2V22M2 12H22M6 6L18 18M18 6L6 18',block:'M3 3H21V21H3ZM3 3L21 21M3 21L21 3',unblock:'M3 3H21V21H3M3 3L21 21', 'image-erase':'M14 3L22 11L12 21H6L2 17ZM7 12L15 20','image-restore':'M4 10C4 4 12 1 18 5L21 8M21 2V8H15M4 14C4 20 12 23 18 19',polygon:'M3 4L20 2L17 16L7 22L3 4M1 2H5V6H1ZM18 0H22V4H18ZM15 14H19V18H15ZM5 20H9V24H5Z',layer:'M2 7L12 2L22 7L12 12ZM2 12L12 17L22 12M2 17L12 22L22 17'};
 function toolButton(tool,title,action){const b=button(rail,'',action,state.tool===tool||state.tool==='group'&&(tool==='place'||tool==='ground-image'));b.className+=' world-icon';b.title=title;b.setAttribute('aria-label',title);b.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="'+(toolIcons[tool]||toolIcons.place)+'"/></svg>';return b;}
 function select(parent,value,choices,onchange){const input=el('select');choices.forEach(c=>input.appendChild(option(typeof c==='object'?c.value:c,typeof c==='object'?c.label:c)));input.value=String(value);input.onchange=()=>onchange(input.value);parent.appendChild(input);return input;}
 function field(parent,name,value,change,choices){const label=el('label');label.appendChild(el('span',name));let input;if(choices)input=select(label,value,choices,v=>change(typeof value==='number'?Number(v):v));else{input=el('input');input.type=typeof value==='boolean'?'checkbox':typeof value==='number'?'number':'text';if(input.type==='checkbox')input.checked=value;else{input.value=value==null?'':value;if(input.type==='number')input.step='any';}input.dataset.modelValue=String(input.type==='checkbox'?input.checked:input.value);input.onchange=()=>{const v=input.type==='checkbox'?input.checked:input.type==='number'?Number(input.value):input.value;if(input.type==='number'&&(!Number.isFinite(v)||/scale/i.test(name)&&v<=0)){input.value=value;message(/scale/i.test(name)?'Scale must be greater than zero.':'Enter a finite number.',true);return;}change(v);};label.appendChild(input);}parent.appendChild(label);return input;}

 function slider(parent,name,value,change,commit){const row=el('label');row.appendChild(el('span',name));const range=el('input');range.type='range';range.min=0;range.max=100;range.step=1;range.value=Math.round(value*100);const output=el('small',range.value+'%');range.oninput=()=>{output.textContent=range.value+'%';if(!commit)change(Number(range.value)/100);};range.onchange=()=>change(Number(range.value)/100);row.appendChild(range);row.appendChild(output);parent.appendChild(row);return range;}
 function editableImage(map,id){const ground=M.groundImage(map,id);if(ground)return {object:ground.object,layer:ground.layer,ground:true};for(const layer of map.layers){const object=layer.objects.find(o=>o.id===id);if(object&&!object.legacy)return {object,layer};}return null;}
 function editablePlacement(map,id){const ground=M.groundImage(map,id);if(ground)return ground;for(const layer of map.layers){const object=layer.objects.find(o=>o.id===id);if(object)return {object,layer};}return null;}
 function cancelDrag(){
 const d=state.drag;state.drag=null;
 if(d&&d.pan)state.pan=clone(d.before);
 else if(d&&d.before){state.snap.value=d.before;if(!stageMode)state.map=d.before;}
 draw();flushShared();
}
 function previewMap(map,d){if(d.maskId){const found=editablePlacement(map,d.maskId);if(!found)return map;const object=Object.assign({},found.object,{mask:(found.object.mask||[]).slice()}),layer=Object.assign({},found.layer);let next;if(M.groundImage(map,d.maskId)){layer.images=layer.images.map(o=>o.id===object.id?object:o);next=Object.assign({},map,{ground:Object.assign({},map.ground)});if(M.fixedGround.includes(layer.id))next.ground[layer.id]=layer;else next.ground.custom=next.ground.custom.map(l=>l.id===layer.id?layer:l);}else{layer.objects=layer.objects.map(o=>o.id===object.id?object:o);next=Object.assign({},map,{layers:map.layers.map(l=>l.id===layer.id?layer:l)});}maskStroke(next,d.maskId,d.stroke);return next;}if(!['block','unblock'].includes(d.tool)){const layer=M.groundLayer(map,d.target),stroke=clone(d.stroke);if(stroke.mode==='road'||stroke.op==='erase')stroke.preview=true;stroke.points=stroke.points.map(p=>M.toLocal(layer.transform,p));stroke.size/=(layer.transform&&layer.transform.scale||1);const next=Object.assign({},map,{ground:Object.assign({},map.ground)}),copy=Object.assign({},layer,{strokes:(layer.strokes||[]).concat(stroke)});if(M.fixedGround.includes(d.target))next.ground[d.target]=copy;else next.ground.custom=next.ground.custom.map(l=>l.id===d.target?copy:l);return next;}const count=d.stroke.points.length,last=d.stroke.points[count-1],key=count+':'+last.x+':'+last.y;if(d.blockerPreviewKey===key)return d.blockerPreview;const incremental=!d.line&&d.blockerPreviewRaw,stroke=Object.assign({},d.stroke,{edgeTolerance:0,points:incremental?d.stroke.points.slice(Math.max(0,d.blockerPreviewCount-1)):d.stroke.points});d.blockerPreviewRaw=M.previewBlockerStroke(incremental?d.blockerPreviewRaw:map,d.target,stroke);d.blockerPreview=d.stroke.edgeTolerance&&Array.isArray(d.blockerPreviewRaw.blockerMask)?Object.assign({},d.blockerPreviewRaw,{blockerMask:Blockers.simplifyMask(d.blockerPreviewRaw.blockerMask,d.stroke.edgeTolerance)}):d.blockerPreviewRaw;d.blockerPreviewCount=count;d.blockerPreviewKey=key;return d.blockerPreview;}
 function maskStroke(map,id,stroke){const found=editableImage(map,id);if(!found)throw Error('Select a placed image first.');const o=found.object,l=found.layer,local=clone(stroke);local.points=local.points.map(p=>{const q=M.toLocal(o,M.toLocal(l.transform,p));if(o.flipX)q.x*=-1;return q;});local.size/=(l.transform&&l.transform.scale||1)*(o.scale||1);if(!o.mask)o.mask=[];o.mask.push(local);}

 function renameLayer(id,ground){const layer=ground?M.groundLayers(values()).find(l=>l.id===id):M.layerOf(values(),id);let input;modal('Rename layer',d=>{input=field(d,'Name',layer.name||id,()=>{});},()=>edit(m=>{const name=input.value.trim();if(!name)throw Error('Enter a layer name.');(ground?M.groundLayer(m,id):M.layerOf(m,id)).name=name;},true));}
 function layerDrag(row,id,ground){row.draggable=true;row.title='Drag to reorder. Ctrl+click the name to select its contents and expand.';row.ondragstart=e=>{e.dataTransfer.setData('application/x-hkd-layer',JSON.stringify({id,ground}));e.dataTransfer.effectAllowed='move';};row.ondragover=e=>{e.preventDefault();row.classList.add('world-layer-drop');};row.ondragleave=()=>row.classList.remove('world-layer-drop');row.ondrop=e=>{e.preventDefault();row.classList.remove('world-layer-drop');const raw=e.dataTransfer.getData('application/x-hkd-layer');if(!raw)return;const data=JSON.parse(raw);if(data.ground!==ground||data.id===id)return;const front=e.clientY<row.getBoundingClientRect().top+row.getBoundingClientRect().height/2;edit(m=>{const list=ground?groundLayers(m):m.layers;if(!list.some(l=>l.id===data.id)||!list.some(l=>l.id===id))return;if(ground){const order=m.ground.order||(m.ground.order=M.fixedGround.slice());order.splice(order.indexOf(data.id),1);const at=order.indexOf(id)+(front?1:0);order.splice(Math.max(1,at),0,data.id);}else{const from=m.layers.findIndex(l=>l.id===data.id),layer=m.layers.splice(from,1)[0],at=m.layers.findIndex(l=>l.id===id)+(front?1:0);m.layers.splice(Math.max(0,at),0,layer);}});};const rename=button(row,'✎',()=>renameLayer(id,ground));rename.title='Rename layer';rename.setAttribute('aria-label','Rename layer');}
 function layerToggle(row,layer,ground,key){const on=!!layer[key],label=key==='hidden'?(on?'Show layer':'Hide layer'):(on?'Unlock layer':'Lock layer'),b=button(row,'',()=>edit(m=>{const l=ground?M.groundLayer(m,layer.id):M.layerOf(m,layer.id);l[key]=!l[key];}));b.className='world-layer-action';b.title=label;b.setAttribute('aria-label',label);b.innerHTML=key==='hidden'?'<svg viewBox="0 0 24 24"><path d="M2 12Q12 0 22 12Q12 24 2 12Z"/><circle cx="12" cy="12" r="3"/>'+(on?'<path d="M3 3L21 21"/>':'')+'</svg>':'<svg viewBox="0 0 24 24"><rect x="5" y="10" width="14" height="11" rx="2"/><path d="'+(on?'M8 10V6A4 4 0 0 1 16 6V10':'M8 10V6A4 4 0 0 1 16 6')+'"/></svg>';return b;}
 function roadContext(){return state.biome==='all'?state.map&&state.map.biome:state.biome;}
 function pairedRoad(asset){const library=state.catalog&&state.catalog.library||[];return Terrain.roadPair(asset||library.find(a=>a.id===state.asset),library,roadContext());}
 function rememberRoadSettings(){if(stageMode||state.tab!=='Ground'||state.tool!=='paint'||state.paintMode!=='road'||!state.roadFamily)return;state.roadPreferences[state.roadFamily]={width:state.size,edgeScale:state.edgeScale,edgeSmoothing:state.edgeSmoothing,edgeStyle:state.edgeStyle};}
 function configureRoad(asset){if(stageMode||state.paintMode!=='road')return;const library=state.catalog&&state.catalog.library||[],source=asset||library.find(a=>a.id===state.asset),pair=pairedRoad(source);if(!pair)return;const family=pair.surface.id;if(state.roadFamily===family)return;const defaults=Terrain.roadDefaults(source,library,roadContext()),settings=Object.assign({},defaults,state.roadPreferences[family]||{});state.roadFamily=family;state.size=Math.max(5,Math.min(1500,settings.width));state.edgeScale=settings.edgeScale;state.edgeSmoothing=settings.edgeSmoothing;state.edgeStyle=settings.edgeStyle;state.edgeExterior=defaults.edgeExterior;}
 function assetTable(){return state.assetTable||(state.assetTable=Object.fromEntries(state.catalog.library.map(a=>[a.id,a])));}
 function focusBounds(bounds){if(!bounds){fit();return;}const width=Math.max(70,bounds.maxX-bounds.minX+70),height=Math.max(70,bounds.maxY-bounds.minY+70);state.zoom=Math.max(.04,Math.min(4,view.clientWidth/width,view.clientHeight/height));state.pan={x:-(bounds.minX+bounds.maxX)/2*state.zoom,y:(bounds.minY+bounds.maxY)/2*state.zoom};draw();}
 function focusObjects(ids){focusBounds(Selection.bounds(values(),ids,assetTable()));}
 function selectListed(found,event){
 state.layerSelection=false;
 if(event&&(event.shiftKey||event.ctrlKey||event.metaKey))state.selection=state.selection.includes(found.object.id)?state.selection.filter(id=>id!==found.object.id):state.selection.concat(found.object.id);
 else state.selection=[found.object.id];
 if(found.ground)state.ground=found.layer.id;else state.layer=found.layer.id;if(state.solo)state.solo={id:found.layer.id,ground:!!found.ground};
 state.tool='select';renderRight();renderLayerPane();draw();canvas.focus({preventScroll:true});
}
 function setSolo(solo){state.solo=solo;if(solo){if(solo.ground)state.ground=solo.id;else state.layer=solo.id;const map=Selection.soloMap(values(),solo);state.selection=state.selection.filter(id=>{const found=Selection.entry(map,id);return found&&!found.layer.hidden&&(!found.ground||found.layer.opacity!==0);});}state.layerSelection=false;render();}
 function renderLayerPane(){if(stageMode||!state.snap||state.tab==='Blockers')return;const keepLayerFocus=state.layerSelection&&document.activeElement&&document.activeElement.tagName==='BUTTON'&&layersPane.contains(document.activeElement);layerHeading.textContent=state.tab==='Ground'?'Ground layers':'Object layers';layerActions.textContent='';const ground=state.tab==='Ground',list=ground?groundLayers(values()):values().layers,query=(state.layerSearch||'').trim().toLowerCase();soloExit.hidden=!state.solo;layerSearch.value=state.layerSearch||'';
 button(layerActions,ground?'+ Ground layer':'+ Layer',()=>edit(m=>{if(ground){const next=M.createGroundLayer(m,null,state.ground);Object.assign(m,next);state.ground=m.ground.custom[m.ground.custom.length-1].id;state.expanded['g:'+state.ground]=true;}else{const next=M.createLayer(m);Object.assign(m,next);state.layer=m.layers[m.layers.length-1].id;state.expanded['o:'+state.layer]=true;}state.layerSearch='';state.selection=[];state.layerSelection=true;}));
 const selectedLayer=list.find(l=>l.id===(ground?state.ground:state.layer)),deleteLayer=button(layerActions,'Delete layer',deleteSelectedLayer);deleteLayer.disabled=!selectedLayer||!!selectedLayer.locked;deleteLayer.title=selectedLayer&&selectedLayer.locked?'Unlock this layer before deleting it.':'Delete the selected layer and its contents (Del / Ctrl+D). Undo restores them together.';
 layerList.textContent='';let visible=0;for(const layer of list.slice().reverse()){const objects=ground?layer.images||[]:layer.objects||[],layerMatch=(layer.name||layer.id).toLowerCase().includes(query),matches=objects.filter(o=>layerMatch||(o.name||'').toLowerCase().includes(query));if(query&&!layerMatch&&!matches.length)continue;visible++;const group=el('div',undefined,'world-layer-group'),row=el('div',undefined,'world-row world-layer'),id=(ground?'g:':'o:')+layer.id;row.dataset.layer=layer.id;
 const label=button(row,layer.name||layer.id,()=>{},(ground?state.ground:state.layer)===layer.id);label.classList.add('world-layer-name');label.onclick=event=>selectParent(layer,ground,event);label.title=(layer.name||layer.id)+' · Select all contents · Ctrl+click to expand';const expand=button(row,state.expanded[id]||query?'▾':'▸',()=>{state.expanded[id]=!state.expanded[id];renderLayerPane();});expand.className='world-expander';expand.setAttribute('aria-label','Expand '+(layer.name||layer.id));expand.setAttribute('aria-expanded',String(!!(state.expanded[id]||query)));row.insertBefore(expand,label);row.appendChild(el('span',String(objects.length),'world-count'));layerDrag(row,layer.id,ground);layerToggle(row,layer,ground,'hidden');layerToggle(row,layer,ground,'locked');
 const solo=button(row,'S',()=>{if(layer.hidden){message('Show this layer before using Solo.',true);return;}setSolo(state.solo&&state.solo.id===layer.id&&state.solo.ground===ground?null:{id:layer.id,ground});},!!(state.solo&&state.solo.id===layer.id&&state.solo.ground===ground));solo.className+=' world-small-action world-solo';solo.title='Solo this layer in the editor; ground stays visible';solo.setAttribute('aria-label','Solo '+(layer.name||layer.id));const focus=button(row,'⊙',()=>focusObjects(objects.map(o=>o.id)));focus.className='world-small-action';focus.title='Focus layer';focus.setAttribute('aria-label','Focus layer '+(layer.name||layer.id));group.appendChild(row);
 if(state.expanded[id]||query){const children=el('div',undefined,'world-object-list'),limit=state.layerLimits[id]||100;for(const o of matches.slice(0,limit)){const item=el('div',undefined,'world-object-row');item.dataset.object=o.id;const a=assetTable()[o.assetId];if(a){const image=el('img');image.src=pictures.url(a.url,a.sha256);image.loading='lazy';image.draggable=false;item.appendChild(image);}const name=button(item,o.name||o.id,()=>{},state.selection.includes(o.id));name.className+=' world-object-name';name.onclick=e=>selectListed({object:o,layer,ground},e);name.title=o.name||o.id;const focus=button(item,'⊙',()=>focusObjects([o.id]));focus.className='world-small-action';focus.setAttribute('aria-label','Focus object '+(o.name||o.id));children.appendChild(item);}if(matches.length>limit)button(children,'Show more ('+(matches.length-limit)+')',()=>{state.layerLimits[id]=limit+100;renderLayerPane();});if(!objects.length)note(children,ground&&layer.id==='foundation'&&values().legacyGround?'Original floor tiles are edited together in this foundation.':'This layer is empty.');group.appendChild(children);}layerList.appendChild(group);}
 if(!visible)note(layerList,'No matching layers or objects.');if(keepLayerFocus){const row=Array.from(layerList.querySelectorAll('[data-layer]')).find(n=>n.dataset.layer===(ground?state.ground:state.layer));if(row)row.querySelector('.world-layer-name').focus({preventScroll:true});}}


 const note=(parent,text,warning)=>parent.appendChild(el('p',text,warning?'world-note world-warn':'world-note'));
 function section(parent,title){parent.appendChild(el('h3',title));return parent;}
 function modal(title,body,action,label){
 const context=currentContext(),previous=document.activeElement,overlay=el('div',undefined,'world-modal'),dialog=el('div'),heading=el('h3',title),errorBox=el('p',undefined,'world-note world-warn');
 const parent=activeDialog;let busy=false;
 dialog.setAttribute('role','dialog');dialog.setAttribute('aria-modal','true');dialog.tabIndex=-1;heading.id='world-dialog-'+(++dialogSerial);dialog.setAttribute('aria-labelledby',heading.id);
 dialog.appendChild(heading);overlay.appendChild(dialog);root.appendChild(overlay);
 const close=()=>{if(busy)return;overlay.remove();if(activeDialog&&activeDialog.overlay===overlay)activeDialog=parent&&parent.overlay.isConnected?parent:null;if(previous&&previous.isConnected)previous.focus({preventScroll:true});};
 activeDialog={overlay,close};body(dialog);errorBox.hidden=true;errorBox.setAttribute('role','alert');dialog.appendChild(errorBox);
 const actions=el('div',undefined,'world-actions');dialog.appendChild(actions);
 const cancel=button(actions,action?'Cancel':'Close',close);
 if(action)button(actions,label||'Apply to draft',async()=>{
  if(busy)return;
  if(!isCurrent(context)){errorBox.hidden=false;errorBox.textContent='The document changed. Close this dialog and review the current document.';return;}
  busy=true;const buttons=Array.from(actions.querySelectorAll('button'));buttons.forEach(b=>b.disabled=true);errorBox.hidden=true;
  try{await action(dialog);busy=false;close();}
  catch(error){if(!state.closed){errorBox.hidden=false;errorBox.textContent=error.message||String(error);message(errorBox.textContent,true);}}
  finally{busy=false;buttons.forEach(b=>b.disabled=false);}
 },true);
 overlay.addEventListener('keydown',event=>{
  if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close();return;}
  if(event.key!=='Tab')return;
  const list=Array.from(dialog.querySelectorAll('button,input,select,textarea,[tabindex]')).filter(n=>!n.disabled&&n.tabIndex>=0&&n.getClientRects().length);
  if(!list.length){event.preventDefault();dialog.focus();return;}
  const at=list.indexOf(document.activeElement),next=event.shiftKey?(at<=0?list.length-1:at-1):(at<0||at===list.length-1?0:at+1);
  event.preventDefault();list[next].focus();
 });
 const focus=dialog.querySelector('input:not([disabled]),select:not([disabled]),textarea:not([disabled]),button:not([disabled])');(focus||dialog).focus({preventScroll:true});
 return {dialog,close};
}

 function currentContext(){return {key:currentKey(),serial:loadSerial};}
 function isCurrent(context){return !state.closed&&context.key===currentKey()&&context.serial===loadSerial;}
 function flushShared(){if(pendingShared&&!state.closed&&!state.drag&&!state.loading){pendingShared=false;changed();}}
 function setMap(map){state.map=map;frozenBlockers=map?(M.hasGlobalBlockers(map)?map.blockerMask:M.mapBlockerRegions(map)):null;}
 function mapView(map){return !M.hasGlobalBlockers(map)&&frozenBlockers?Object.assign({},map,{blockerMask:frozenBlockers}):map;}
 function syncCatalog(catalog,force){
  if(state.closed||!catalog)return;
  const before=state.catalog&&JSON.stringify((state.catalog.library||[]).map(a=>[a.id,a.name,a.url,a.sha256,a.width,a.height]));
  state.catalog=catalog;state.catalog.images=state.catalog.images||{};state.assetTable=null;state.groupPreview=null;
  const after=JSON.stringify((catalog.library||[]).map(a=>[a.id,a.name,a.url,a.sha256,a.width,a.height]));
  if(paletteUI&&(force||before!==after))paletteUI.key=null;
  if(force){pictures.clear();renderer.clear();buildingRenderer.clear();Paint.clearMasks();picking.clear();state.groupPreview=null;}
 }
 async function refreshWorld(){
  const key=currentKey();return enqueue(async()=>{
   if(state.closed||currentKey()!==key)return;
   const snap=await options.ipc('world-refresh',{key,version:state.snap.version}),catalog=await options.ipc('world-catalog');
   const placement=await readPlacementUpdate(catalog,snap.value.id);
   if(state.closed||currentKey()!==key)return;
   syncCatalog(catalog,true);if(stageMode)state.buildingPlacements=await options.ipc('world-building-placements');if(stageMode)setMap((await options.ipc('world-load',{key:'map:'+snap.value.mapId})).value);
   applyPlacementUpdate(placement);apply(snap);
  },true);
 }
 async function startPreview(){
  const context=currentContext();state.previewBusy=true;renderTop();message('Baking a muted isolated draft preview…');
  try{
   await state.pending;if(!isCurrent(context))return;
   const result=await options.ipc('world-preview',{key:context.key,version:state.snap.version,owner:previewOwner});
   if(!isCurrent(context)){await options.ipc('world-preview-close',{owner:previewOwner});return;}
   state.previewOpen=true;message(result.message);
  }finally{state.previewBusy=false;if(!state.closed)renderTop();}
 }
 async function closePreview(){await options.ipc('world-preview-close',{owner:previewOwner});state.previewOpen=false;if(!state.closed)renderTop();}


 function stageHit(p){const radius=15/state.zoom,s=values();{if(state.tab==='Paths'){const g=s.graphs.find(g=>g.id===state.graph);if(g){for(const n of g.nodes)if(Math.hypot(n.x-p.x,n.y-p.y)<radius)return 'node:'+n.id;for(const e of g.edges){const a=g.nodes.find(n=>n.id===e.from),b=g.nodes.find(n=>n.id===e.to);if(a&&b){const dx=b.x-a.x,dy=b.y-a.y,length=dx*dx+dy*dy,t=length?Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/length)):0;if(Math.hypot(a.x+t*dx-p.x,a.y+t*dy-p.y)<8/state.zoom)return 'edge:'+e.id;}}}}if(['Spawns','Paths','Waves'].includes(state.tab)){if(Math.hypot(s.hero.x-p.x,s.hero.y-p.y)<radius)return 'hero';for(const spawn of s.spawns)if(Math.hypot(spawn.x-p.x,spawn.y-p.y)<radius)return 'spawn:'+spawn.id;}for(const b of visibleBuildings().slice().sort((a,b)=>a.y-b.y)){const record=stageRecord(b);if(buildingRenderer.hit(b,record,p,state.images,state.snap.buildingPreview&&state.snap.buildingPreview.runtimePath)||!record&&Math.hypot(b.x-p.x,b.y-p.y)<Math.max(radius,85*(b.scale||1)))return 'building:'+b.id;}for(const b of s.specials.slice().reverse())if(b.enabled!==false&&Math.hypot(b.x-p.x,b.y-p.y)<Math.max(radius,85*(b.scale||1)))return 'special:'+b.id;return null;}}
 function editableSelection(ids){
  const map=Selection.soloMap(values(),state.solo);
  for(const id of ids){const found=editablePlacement(map,id);if(found)M.assertEditable(found.layer);}
 }
 function sweepDelete(d,p){
  const map=Selection.soloMap(d.working,state.solo),removed=new Set(),assets=assetTable();
  for(const item of decorationOrder(map).slice().reverse())if(picking.segment(item.o,item.layer,d.last,p,assets,state.images))removed.add(item.o.id);
  if(removed.size){
   for(const layer of d.working.layers)layer.objects=layer.objects.filter(o=>!removed.has(o.id));
   state.snap.value=d.working;state.map=d.working;state.selection=state.selection.filter(id=>!removed.has(id));draw();
  }
  d.last=p;
 }
 function editorKey(event){
  if(state.closed||event.defaultPrevented)return;
  const editing=event.target&&(event.target.closest('input,textarea,select')||event.target.isContentEditable);
  if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='d'){event.preventDefault();event.stopPropagation();if(!activeDialog&&!editing&&!state.loading&&!state.drag)remove();return;}
  if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='s'){
   event.preventDefault();event.stopPropagation();if(!activeDialog&&!state.drag)save();return;
  }
  if(activeDialog||editing)return;
  if((event.ctrlKey||event.metaKey)&&['z','y'].includes(event.key.toLowerCase())){event.preventDefault();event.stopPropagation();if(!state.loading&&!state.drag)action(event.key.toLowerCase()==='y'||event.shiftKey?'redo':'undo').catch(error=>message(error.message,true));return;}
  if(event.target!==canvas)canvas.onkeydown(event);
 }
 function captureFocus(){
  const input=document.activeElement;if(!input||!root.contains(input)||input.closest('.world-modal'))return null;
  const region=input.closest('.world-inspector,.world-side,.world-top,.world-tabs'),label=input.closest('label');
  if(!region||!label)return null;
  const name=label.querySelector('span');if(!name)return null;
  const controls=Array.from(region.querySelectorAll('label')).filter(l=>l.querySelector('span')&&l.querySelector('span').textContent===name.textContent);
  let selection=null;try{selection=[input.selectionStart,input.selectionEnd];}catch(_){}
  return {context:focusContext(),region:region.className,name:name.textContent,index:controls.indexOf(label),tag:input.tagName,type:input.type,value:input.value,pending:input.tagName==='INPUT'&&input.type!=='checkbox'&&input.dataset.modelValue!==undefined&&input.value!==input.dataset.modelValue,selection};
 }
 function focusContext(){return JSON.stringify([currentKey(),state.tab,state.tool,state.selection,state.ground,state.layer]);}
 function restoreFocus(saved){
  if(!saved||saved.context!==focusContext()||activeDialog||state.closed)return;
  const region=Array.from(root.querySelectorAll('.world-inspector,.world-side,.world-top,.world-tabs')).find(n=>n.className===saved.region);if(!region)return;
  const labels=Array.from(region.querySelectorAll('label')).filter(l=>l.querySelector('span')&&l.querySelector('span').textContent===saved.name),label=labels[saved.index],input=label&&label.querySelector(saved.tag.toLowerCase());
  if(!input||input.disabled)return;
  if(saved.pending)input.value=saved.value;
  input.focus({preventScroll:true});if(saved.selection&&saved.selection[0]!==null&&input.setSelectionRange)try{input.setSelectionRange(saved.selection[0],saved.selection[1]);}catch(_){}
 }


 function groundLayers(map){return M.groundLayers(map).filter(l=>l.id!=='foundation');}
 function activeLayer(map,ground){return (ground?groundLayers(map):map.layers).find(l=>l.id===(ground?state.ground:state.layer));}
 function selectParent(layer,ground,event){cancelDrag();if(ground)state.ground=layer.id;else state.layer=layer.id;if(state.solo)state.solo={id:layer.id,ground};state.selection=(ground?layer.images||[]:layer.objects||[]).map(o=>o.id);state.layerSelection=true;state.tool='select';state.groupRequest=(state.groupRequest||0)+1;state.groupId=null;state.groupData=null;state.groupPreview=null;if(event&&(event.ctrlKey||event.metaKey))state.expanded[(ground?'g:':'o:')+layer.id]=true;render();}
 function dragLayer(point,pointerId){const ground=state.tab==='Ground',layer=activeLayer(values(),ground);if(!layer){message('Add a '+(ground?'ground':'object')+' layer first.',true);return;}try{M.assertEditable(layer);}catch(error){message(error.message,true);return;}state.drag={layer:layer.id,groundLayer:ground,start:point,before:clone(values()),pointerId};}
 function transformLayer(d){const original=d.groundLayer?M.groundLayer(d.before,d.layer):M.layerOf(d.before,d.layer),layer=d.groundLayer?M.groundLayer(d.working,d.layer):M.layerOf(d.working,d.layer),t=Object.assign({x:0,y:0,scale:1,angle:0},original.transform),g=d.gizmo,r=g.rotation*Math.PI/180,x=(t.x-g.pivot.x)*g.scale,y=(t.y-g.pivot.y)*g.scale;layer.transform=Object.assign({},original.transform,{x:g.pivot.x+x*Math.cos(r)-y*Math.sin(r),y:g.pivot.y+x*Math.sin(r)+y*Math.cos(r),scale:t.scale*g.scale,angle:t.angle+g.rotation});}

 function currentKey(){return state.snap&&state.snap.key;}
 function placementSnapshot(){return stageMode?state.snap:state.placementSnap&&state.placementSnap.value.id===state.placementStage&&state.placementSnap.value.mapId===state.map.id?state.placementSnap:null;}
 function placementStage(){const snapshot=placementSnapshot();return snapshot&&snapshot.value;}
 function mapStages(){return (state.catalog&&state.catalog.stages||[]).filter(stage=>state.map&&stage.mapId===state.map.id);}
 function clearPlacementPreview(){placementRequestSerial++;state.placementStage=null;state.placementSnap=null;state.placementLoading=false;state.extraImages={};buildingRenderer.clear();}
 async function readPlacementUpdate(catalog,mapId){
  if(stageMode||!state.placementStage)return null;
  const id=state.placementStage,serial=placementRequestSerial,used=(catalog.stages||[]).some(stage=>stage.id===id&&stage.mapId===mapId);
  return {id,serial,snapshot:used?await options.ipc('world-load',{key:'stage:'+id}):null};
 }
 function applyPlacementUpdate(update){
  if(!update||update.serial!==placementRequestSerial||update.id!==state.placementStage)return;
  if(!update.snapshot||update.snapshot.value.mapId!==state.map.id){clearPlacementPreview();return;}
  state.placementSnap=update.snapshot;state.placementLoading=false;
 }
 async function showPlacements(id){
  if(stageMode||state.closed||state.loading)return;
  if(id&&!mapStages().some(stage=>stage.id===id))return;
  const context=currentContext(),serial=++placementRequestSerial;
  if(!id){clearPlacementPreview();renderPlacementStages();prepareImages();draw();return;}
  if(state.placementStage!==id)state.placementSnap=null;
  state.placementStage=id;state.placementLoading=true;renderPlacementStages();prepareImages();draw();
  try{
   await state.pending;
   if(!isCurrent(context)||serial!==placementRequestSerial)return;
   const snapshot=await options.ipc('world-load',{key:'stage:'+id});
   if(!isCurrent(context)||serial!==placementRequestSerial)return;
   if(snapshot.value.mapId!==state.map.id){const catalog=await options.ipc('world-catalog');if(!isCurrent(context)||serial!==placementRequestSerial)return;clearPlacementPreview();syncCatalog(catalog);renderPlacementStages();prepareImages();draw();message('That stage now uses another map. The map draft is unchanged.');}
   else state.placementSnap=snapshot;
  }catch(error){if(isCurrent(context)&&serial===placementRequestSerial){state.placementSnap=null;message(error.message,true);}}
  finally{if(isCurrent(context)&&serial===placementRequestSerial){state.placementLoading=false;renderPlacementStages();prepareImages();draw();}}
 }
 function renderPlacementStages(){
  if(!placementBar||!state.snap||state.closed)return;
  const stages=mapStages();if(state.placementStage&&!stages.some(stage=>stage.id===state.placementStage))clearPlacementPreview();
  placementBar.textContent='';const heading=el('div',undefined,'world-stage-preview-heading');heading.appendChild(el('strong','Stages using this map'));heading.appendChild(el('span',state.placementLoading?'Loading placements…':state.placementStage?'Read-only building preview':'Choose a stage to show its buildings','world-small'));placementBar.appendChild(heading);
  const links=el('div',undefined,'world-stage-preview-links');links.setAttribute('role','group');links.setAttribute('aria-label','Stages using this map');placementBar.appendChild(links);
  const hide=button(links,'Environment only',()=>showPlacements(null),!state.placementStage);hide.setAttribute('aria-pressed',String(!state.placementStage));
  for(const stage of stages){const name=/^\s*\d+[.)]\s*/.test(stage.name)?stage.name:stage.level+'. '+stage.name,b=button(links,(stage.variant==='A'?'Default':'Alternate '+stage.variant)+' · '+name+(stage.dirty?' *':''),()=>showPlacements(stage.id),stage.id===state.placementStage);b.dataset.stageId=stage.id;b.setAttribute('aria-pressed',String(stage.id===state.placementStage));b.title=stage.dirty?'Includes unsaved stage edits. Previewing does not save them.':'Show this stage’s buildings without editing the stage.';}
  if(!stages.length)links.appendChild(el('span','No stages currently use this map.','world-small'));
  if(state.placementStage){const controls=el('div',undefined,'world-stage-preview-controls');field(controls,'Hall level',state.previewHall,v=>{state.previewHall=v;prepareImages();draw();},[1,2,3]);field(controls,'Construction footprints',state.placementFootprints,v=>{state.placementFootprints=v;draw();});placementBar.appendChild(controls);}
 }
 function values(){return state.snap.value;}
 async function load(key){
 if(state.closed)return;
 const serial=++loadSerial;state.loading=true;rememberRoadSettings();state.roadFamily=null;state.groupRequest=(state.groupRequest||0)+1;cancelDrag();
 if(!stageMode)clearPlacementPreview();
 try{
  await state.pending;
  if(state.closed||serial!==loadSerial)return;
  const snap=await options.ipc('world-load',{key}),map=key.startsWith('map:')?snap.value:(await options.ipc('world-load',{key:'map:'+snap.value.mapId})).value;
  if(state.closed||serial!==loadSerial)return;
  renderer.clear();Paint.clearMasks();pictures.clear();picking.clear();state.assetTable=null;state.solo=null;state.autoBlockerMode=null;state.autoBlockerLayers=null;state.autoBlockerPreview=null;state.autoBlockerPreviewSignature=null;state.lassoPoints=[];state.lassoHover=null;state.layerSearch='';
  state.snap=snap;setMap(map);state.selection=[];state.layerSelection=false;state.nav=null;state.groupId=null;state.groupData=null;state.groupPreview=null;
  if(!stageMode){state.biome=state.map.biome;configureRoad();}
  else{state.variant=snap.value.variant;state.spawn=snap.value.spawns[0]&&snap.value.spawns[0].id;state.graph=null;}
  state.loading=false;render();fit();
 }catch(error){if(!state.closed&&serial===loadSerial){state.loading=false;render();message(error.message,true);}}
 finally{if(serial===loadSerial){state.loading=false;flushShared();}}
}
 function enqueue(action,strict,followCurrent){
 const context=currentContext(),operation=state.pending.catch(()=>{}).then(()=>{if(state.closed)return;if(!followCurrent&&context.key&&currentKey()!==context.key)throw Error('The document changed before this action. Try again in the current document.');return action();});
 state.pending=operation.catch(async error=>{
  if(state.closed)return;
  message(error.message,true);
  if(!context.key||currentKey()!==context.key)return;
  try{
   const snap=await options.ipc('world-load',{key:context.key});if(state.closed||currentKey()!==context.key)return;
   if(stageMode){const map=await options.ipc('world-load',{key:'map:'+snap.value.mapId});if(state.closed||currentKey()!==context.key)return;setMap(map.value);}
   apply(snap);message(error.message,true);
  }catch(_){}
 });
 return strict?operation:state.pending;
}
 function edit(fn,strict){
 const key=currentKey();
 return enqueue(async()=>{
  if(state.closed||currentKey()!==key)throw Error('The document changed before this edit. Select the object again.');
  const before=values(),value=clone(before);fn(value);
  if(JSON.stringify(value)===JSON.stringify(before)){render();return state.snap;}
  if(!stageMode&&!M.hasGlobalBlockers(before)&&!M.hasGlobalBlockers(value))value.blockerMask=clone(M.mapBlockerRegions(before));
  const snap=await options.ipc('world-change',{key,version:state.snap.version,value});apply(snap);return snap;
 },strict);
}
 function apply(s,allowSwitch){
 if(state.closed||!s)return;
 if(state.snap&&!allowSwitch&&s.key!==currentKey())return;
 if(state.snap&&s.version<state.snap.version)return;
 if(!stageMode&&state.snap&&s.key!==currentKey())clearPlacementPreview();
 state.snap=s;
 if(s.value&&s.value.images)Object.assign(state.catalog.images,s.value.images);
 if(s.result&&s.result.placedGroup){state.selection=s.result.selection;state.layer=s.result.layerId;state.expanded['o:'+state.layer]=true;state.solo=null;state.brushCursor=null;state.tool='group';}
 if(!stageMode)setMap(s.value);
 state.nav=null;render();
 if(s.result)message(s.result.autoBlockers?(s.result.autoBlockers.changed?'Auto '+(s.result.autoBlockers.op==='erase'?'erased':'painted')+' artwork outline from '+s.result.autoBlockers.layers+' layers in the draft · '+s.result.autoBlockers.verticesAfter+' vertices. Save to apply.':'The selected artwork makes no change to the blocker mask.'):s.result.placedGroup?'Placed group in a new layer. Save applies it to the game.':s.result.warning||(s.result.recovered?'Interrupted save recovered. Review restored sources and remaining drafts.':s.result.saved?'Saved. '+s.result.files.length+' files updated. Backup: '+s.result.backup:'No changes; no files written.'),!!s.result.warning);
}
 async function action(name){
 const key=currentKey();return enqueue(async()=>{
  if(state.closed||currentKey()!==key)return;
  const snap=await options.ipc('world-'+name,{key,version:state.snap.version});
  if(name==='discard'||name==='recover')syncCatalog(await options.ipc('world-catalog'),true);
  apply(snap,name==='discard');return snap;
 },true);
}
 function changed(){
 if(state.closed||!currentKey())return;
 if(state.drag||state.loading){pendingShared=true;return;}
 if(sharedScheduled)return;
 sharedScheduled=true;
 enqueue(async()=>{
  sharedScheduled=false;if(state.closed)return;
  const context=currentContext(),snap=await options.ipc('world-load',{key:context.key});if(!isCurrent(context))return;
  if(snap.version===state.snap.version)return;
  const catalog=await options.ipc('world-catalog');if(!isCurrent(context))return;
  let map;if(stageMode)map=(await options.ipc('world-load',{key:'map:'+snap.value.mapId})).value;
  const placement=await readPlacementUpdate(catalog,snap.value.id);
  if(!isCurrent(context))return;syncCatalog(catalog);if(map)setMap(map);applyPlacementUpdate(placement);apply(snap);
 },false,true);
}
 function save(){
 if(!state.snap.dirty){message('No changes; no files written.');return;}
 const key=currentKey();
 modal('Save '+(stageMode?'stage layout':'shared map'),dialog=>{
  note(dialog,'Changes remain in the draft until you press Save.');
  if(state.snap.affected.length)note(dialog,'Updates the environment for linked stages: '+state.snap.affected.join(', '));
  if(!stageMode)budgetDetails(dialog);
  if(state.snap.issues.length)note(dialog,state.snap.issues.join('\n'),true);else note(dialog,'Validation passed. Baking and a revision-checked save will run now.');
 },async()=>{
  if(currentKey()!==key)throw Error('The document changed. Review it before saving.');
  if(state.snap.issues.length)throw Error('Resolve validation issues first.');
  message('Baking and saving…');
  return enqueue(async()=>{
   if(state.closed||currentKey()!==key)throw Error('The document changed before Save.');
   const snap=await options.ipc('world-save',{key,version:state.snap.version});
   if(state.closed||currentKey()!==key)return;
   syncCatalog(await options.ipc('world-catalog'),true);apply(snap);return snap;
  },true);
 },'Save');
}
 function renderTop(){if(stageMode){stagePanels.top();return;}renderPlacementStages();top.textContent='';select(top,values().id,state.catalog.maps.map(m=>({value:m.id,label:m.name})),id=>load('map:'+id));button(top,'New',()=>newMap());button(top,'Duplicate',()=>newMap(values().id));button(top,'Fit',fit);button(top,state.previewBusy?'Preparing preview…':'Preview draft',startPreview).disabled=!!state.previewBusy;if(state.previewOpen)button(top,'Close preview',closePreview);field(top,'Snap',state.snapGrid,v=>state.snapGrid=Math.max(0,v));top.appendChild(el('span',undefined,'world-spacer'));button(top,'Undo',()=>action('undo')).disabled=!state.snap.canUndo;button(top,'Redo',()=>action('redo')).disabled=!state.snap.canRedo;button(top,'Refresh',refreshWorld);button(top,'Discard',discard).disabled=!state.snap.dirty;if(state.catalog.recovery)button(top,'Recovery…',()=>modal('Recover authoring data',d=>note(d,'Recover interrupted saves before restoring unsaved drafts. Conflicting external changes are preserved.'),()=>action('recover'),'Recover'));button(top,'Save',save,state.snap.dirty).disabled=!state.snap.dirty;}
 function discard(){modal('Discard this draft?',d=>note(d,'This discards only '+currentKey()+'. Other panel drafts are retained.'),()=>action('discard'),'Discard');}
 function clipboard(mode){return enqueue(async()=>{const key=currentKey(),snapshot=await options.ipc('world-'+mode+'-stage',{key,version:state.snap.version});if(state.closed||currentKey()!==key)return;if(mode==='paste')syncCatalog(await options.ipc('world-catalog'),true);apply(snapshot);message(mode==='copy'?'Copied whole stage. Select another stage and use Paste stage.':'Pasted whole stage into the draft. Undo restores it; Save applies it.');},true);}
 function newPath(){return edit(stage=>{const spawn=stage.spawns.find(p=>p.id===state.spawn)||stage.spawns.find(p=>p.enabled!==false);if(!spawn)throw Error('Add a spawn in the Spawns tab first.');const base=M.newSpawn(Object.assign({},stage,{nextSpawn:stage.nextSpawn}),spawn),graph=base.graphs[base.graphs.length-1];graph.id='path-'+Date.now();graph.spawnIds=[spawn.id];graph.name='New approach';stage.graphs.push(graph);state.graph=graph.id;state.spawn=spawn.id;state.selection=[];});}
 function insertPathNode(id){const graph=state.graph;return edit(stage=>{state.selection=['node:'+PathEditor.insertNode(stage,graph,id)];});}
 function removePathNode(id){const graph=state.graph;return edit(stage=>{const next=PathEditor.removeNode(stage,graph,id);state.selection=next?['node:'+next]:[];});}
 function newMap(copy){
 let name,biome;modal(copy?'Duplicate map':'New map',d=>{name=field(d,'Name',copy?values().name+' copy':'New map',()=>{});biome=select(d,state.biome==='all'?'forest':state.biome,M.BIOMES,()=>{});},()=>enqueue(async()=>{
  const snap=await options.ipc('world-create',{version:state.snap.version,name:name.value,biome:biome.value,copy});
  if(state.closed)return;syncCatalog(await options.ipc('world-catalog'),true);state.solo=null;state.selection=[];state.groupRequest=(state.groupRequest||0)+1;apply(snap,true);fit();
 },true));
}
 function renderTabs(){tabs.textContent='';rail.textContent='';rail.hidden=stageMode;if(stageMode){stagePanels.tabs();return;}const names=stageMode?['Stage','Buildings','Spawns','Paths','Waves']:['Ground','Decoration','Blockers'];for(const name of names)button(tabs,name==='Decoration'?'Objects':name,()=>{rememberRoadSettings();state.roadFamily=null;cancelDrag();state.groupRequest=(state.groupRequest||0)+1;state.tab=name;state.layerSelection=false;if(name==='Decoration'){if(['field','roads'].includes(state.category))state.category='all';if(!Terrain.objectAsset(state.catalog.library.find(a=>a.id===state.asset)))state.asset=null;}if(name==='Ground'){if(!['all','field','roads','custom'].includes(state.category))state.category='all';if(!Terrain.groundAsset(state.catalog.library.find(a=>a.id===state.asset)))state.asset=null;}state.tool=name==='Blockers'?'pan':'select';if(name==='Ground')configureRoad();if(name==='Blockers')state.showBlockers=true;state.selection=[];state.layerSearch='';state.solo=null;state.groupId=null;state.groupData=null;state.groupPreview=null;render();},state.tab===name);if(!stageMode){(state.tab==='Blockers'?['pan','block','unblock','polygon']:['select','pan','layer',...(state.tab==='Ground'?['paint','erase','ground-image','delete']:['place','image-erase','image-restore','delete'])]).forEach(tool=>toolButton(tool,{select:'Select / move (V)',pan:'Hand / pan (H)',layer:'Move whole layer',paint:'Paint (B)',erase:'Soft Eraser (E)', 'ground-image':'Place image', 'image-erase':'Soft Eraser', 'image-restore':'Restore mask',delete:'Delete Object (Del / Ctrl+D)',place:'Place one (T)',block:'Paint blocker (R)',unblock:'Erase blocker (E)',polygon:'Polygon Lasso (L)'}[tool],()=>{rememberRoadSettings();if(tool!=='paint')state.roadFamily=null;cancelDrag();state.groupRequest=(state.groupRequest||0)+1;state.tool=tool;if(tool==='paint'&&state.tab==='Ground')configureRoad();state.autoBlockerMode=null;state.lassoPoints=[];state.lassoHover=null;if(['block','unblock'].includes(tool))state.showBlockers=true;if(tool==='erase'&&M.groundImage(values(),state.selection[0]))state.eraseTarget='image';render();}));}else{button(tabs,'Select / move',()=>{state.tool='select';render();},state.tool==='select');if(state.tab==='Buildings')button(tabs,'Place building',()=>{state.tool='building';render();},state.tool==='building');if(['Spawns','Paths'].includes(state.tab))button(tabs,'Add spawn',()=>{state.tool='spawn';render();},state.tool==='spawn');if(state.tab==='Paths'){button(tabs,'Add node',()=>{state.tool='node';render();},state.tool==='node');button(tabs,'Connect nodes',()=>{state.tool='connect';state.connect=null;render();},state.tool==='connect');}field(tabs,'Hall preview',state.previewHall,v=>{state.previewHall=v;prepareImages();draw();},[1,2,3]);}if(state.tab!=='Blockers')field(tabs,'Blockers',state.showBlockers,v=>{state.showBlockers=v;renderTabs();draw();});if(stageMode&&state.showBlockers){const legend=el('span',undefined,'world-blocker-legend');legend.appendChild(el('span','Map','world-map-blocker-key'));legend.appendChild(el('span','Buildings','world-building-blocker-key'));tabs.appendChild(legend);}}
 function palette(){if(!paletteUI){const query=el('input');query.type='search';query.placeholder='Find asset…';query.oninput=()=>{state.query=query.value;renderPalette();};const holder=el('div'),biome=select(holder,state.biome,['all'].concat(M.BIOMES),v=>{rememberRoadSettings();state.biome=v;configureRoad();renderPalette();renderRight();prepareImages();draw();}),category=select(holder,state.category,['all','field','roads','grass','trees','bushes','rocks','cliffs','water','details','custom'],v=>{state.category=v;renderPalette();}),filters=el('div',undefined,'world-actions'),all=button(filters,'All assets',()=>{state.favoriteOnly=false;renderPalette();}),favorites=button(filters,'★ Favorites',()=>{state.favoriteOnly=true;renderPalette();}),grid=el('div',undefined,'world-grid');grid.id='world-palette';paletteUI={query,biome,category,filters,all,favorites,grid,key:null,scroll:{},tab:null};}if(paletteUI.tab)paletteUI.scroll[paletteUI.tab]=paletteUI.grid.scrollTop;const scroll=paletteUI.scroll[state.tab]||0;paletteUI.tab=state.tab;paletteUI.query.value=state.query;paletteUI.biome.value=state.biome;const categories=state.tab==='Ground'?['all','field','roads','custom']:['all','grass','trees','bushes','rocks','cliffs','water','details','custom'];if(!categories.includes(state.category))state.category='all';paletteUI.category.textContent='';for(const value of categories)paletteUI.category.appendChild(option(value,value));paletteUI.category.value=state.category;[paletteUI.query,paletteUI.biome,paletteUI.category,paletteUI.filters].forEach(n=>{if(n.parentNode!==left)left.appendChild(n);});if(state.tab!=='Ground')renderLibraryShelf();else if(state.libraryShelf)state.libraryShelf.details.remove();if(paletteUI.grid.parentNode!==left)left.appendChild(paletteUI.grid);renderPalette();paletteUI.grid.scrollTop=scroll;}
 function renderPalette(){if(!paletteUI)return;const grid=paletteUI.grid,favorites=new Set(collections().favorites),signature=JSON.stringify([state.biome,state.category,state.query,state.tab,!!state.favoriteOnly,state.favoriteOnly?Array.from(favorites):null,state.catalog.library.map(a=>[a.id,a.name,a.url])]);paletteUI.all.classList.toggle('active',!state.favoriteOnly);paletteUI.favorites.classList.toggle('active',!!state.favoriteOnly);const stars=()=>{for(const b of grid.querySelectorAll('[data-asset]'))b.classList.toggle('active',b.dataset.asset===state.asset&&!state.groupId);for(const b of grid.querySelectorAll('[data-favorite]')){const on=favorites.has(b.dataset.favorite);b.textContent=on?'★':'☆';b.setAttribute('aria-pressed',String(on));b.title=on?'Remove from Favorites':'Add to Favorites';}};if(signature===paletteUI.key){stars();return;}paletteUI.key=signature;grid.textContent='';const assets=state.catalog.library.filter(a=>(state.tab==='Ground'?Terrain.groundAsset(a):Terrain.objectAsset(a))&&(!state.favoriteOnly||favorites.has(a.id))&&(state.biome==='all'||a.biomes.includes(state.biome))&&(state.category==='all'||state.category===a.category)&&a.name.toLowerCase().includes(state.query.toLowerCase()));for(const a of assets){const card=el('div',undefined,'world-asset-card'),b=button(card,'',()=>{state.groupRequest=(state.groupRequest||0)+1;state.groupId=null;state.groupData=null;state.groupPreview=null;rememberRoadSettings();state.asset=a.id;if(state.tab==='Ground')state.paintMode=Terrain.isRoad(a)&&pairedRoad(a)?'road':'texture';state.tool=state.tab==='Ground'?(state.tool==='ground-image'?'ground-image':'paint'):'place';if(state.tab==='Ground'&&state.paintMode==='road')configureRoad(a);else state.roadFamily=null;render();},state.asset===a.id);b.className+=' world-asset';b.dataset.asset=a.id;const img=el('img');img.src=pictures.url(a.url,a.sha256);img.loading='lazy';b.appendChild(img);b.appendChild(el('span',a.name));b.title=a.name+' · '+a.width+' × '+a.height+' · '+a.category;const star=button(card,'☆',()=>enqueue(async()=>apply(await options.ipc('world-favorite',{key:currentKey(),version:state.snap.version,assetId:a.id}))));star.className='world-favorite';star.dataset.favorite=a.id;star.setAttribute('aria-label','Favorite '+a.name);grid.appendChild(card);}stars();if(!assets.length)note(grid,state.favoriteOnly?'Mark assets with ☆ to add them to Favorites.':'No matching assets.');}
 function drawThumbnail(target,sprites,origin){const c=el('canvas');c.width=140;c.height=130;const g=c.getContext('2d');target.appendChild(c);const paint=()=>{const list=sprites||[];if(!list.length)return;const bounds={minX:Infinity,minY:Infinity,maxX:-Infinity,maxY:-Infinity};for(const s of list){const x=s.matrix[4],y=s.matrix[5],w=s.width*Math.hypot(s.matrix[0],s.matrix[1]),h=s.height*Math.hypot(s.matrix[2],s.matrix[3]);bounds.minX=Math.min(bounds.minX,x-w/2);bounds.maxX=Math.max(bounds.maxX,x+w/2);bounds.minY=Math.min(bounds.minY,y-h/2);bounds.maxY=Math.max(bounds.maxY,y+h/2);}const scale=Math.min(130/(bounds.maxX-bounds.minX),120/(bounds.maxY-bounds.minY));g.clearRect(0,0,c.width,c.height);g.setTransform(scale,0,0,-scale,70-(bounds.minX+bounds.maxX)/2*scale,65+(bounds.minY+bounds.maxY)/2*scale);Paint.sprites(g,list,state.images);};sprites.forEach(s=>ensureImage(s.frame,paint));paint();}
 function renderLeft(){if(stageMode){stagePanels.left();return;}if(state.tab!=='Blockers')palette();else{if(paletteUI&&paletteUI.tab){paletteUI.scroll[paletteUI.tab]=paletteUI.grid.scrollTop;paletteUI.tab=null;}left.textContent='';}}
 function buildingPalette(parent){const grid=el('div',undefined,'world-grid');parent.appendChild(grid);for(const b of (state.buildings||[]).filter(b=>!b.special)){const item=button(grid,'',()=>{state.buildingAsset=b.catalogId;state.buildingVariant=null;state.tool='building';state.selection=[];render();},state.buildingAsset===b.catalogId);item.className+=' world-asset';if(!b.special&&state.catalog.buildingLooks[b.kind]&&state.catalog.buildingLooks[b.kind].image){const img=el('img');img.src=state.catalog.buildingLooks[b.kind].image;img.loading='lazy';item.appendChild(img);}else drawThumbnail(item,b.sprites);item.title=b.name;item.appendChild(el('span',b.name));}}
 function decorationOrder(map){if(orderCache&&orderCache.layers===map.layers&&!(state.drag&&state.drag.working))return orderCache.list;const list=[];map.layers.forEach((layer,index)=>{if(layer.hidden)return;for(const o of layer.objects){const ground=!o.legacy&&M.isGroundObject(layer,o),foot=o.ground||{x:0,y:0},local=M.toWorld(o,{x:o.flipX?-foot.x:foot.x,y:foot.y});list.push({o,layer,index,ground,y:M.toWorld(layer.transform,local).y});}});list.sort((a,b)=>a.ground!==b.ground?(a.ground?-1:1):a.ground?a.index-b.index:(a.o.buildingOverlap==='front')!==(b.o.buildingOverlap==='front')?(a.o.buildingOverlap==='front'?1:-1):b.y-a.y||a.index-b.index);orderCache={layers:map.layers,list};return list;}
 function selectedObject(){if(!stageMode&&state.layerSelection)return null;const id=state.selection[0];if(!id)return null;if(!stageMode){const ground=M.groundImage(values(),id);if(ground)return {object:ground.object,groundLayer:ground.layer,layer:ground.layer};for(const layer of values().layers){const object=layer.objects.find(o=>o.id===id);if(object)return {object,layer};}return null;}const [kind,key]=id.split(':');if(kind==='hero')return {object:values().hero,kind};if(kind==='spawn')return {object:values().spawns.find(x=>x.id===Number(key)),kind};if(kind==='building')return {object:values().buildings.find(x=>x.id===Number(key)),kind};if(kind==='special')return {object:values().specials.find(x=>x.id===key),kind};if(kind==='node'){const g=values().graphs.find(g=>g.id===state.graph);return {object:g&&g.nodes.find(n=>n.id===key),kind,graph:g};}if(kind==='edge'){const g=values().graphs.find(g=>g.id===state.graph);return {object:g&&g.edges.find(e=>e.id===key),kind,graph:g};}return null;}
 function patchSelected(name,value){const ids=state.selection.slice();return edit(v=>{if(!stageMode){for(const id of ids){const found=editablePlacement(v,id);if(found)M.assertEditable(found.layer);}for(const l of v.layers)for(const o of l.objects)if(ids.includes(o.id))o[name]=value;for(const l of M.groundLayers(v))for(const o of l.images||[])if(ids.includes(o.id))o[name]=value;}else for(const id of ids){const [kind,key]=id.split(':');const o=kind==='hero'?v.hero:kind==='spawn'?v.spawns.find(x=>x.id===Number(key)):kind==='building'?v.buildings.find(x=>x.id===Number(key)):kind==='special'?v.specials.find(x=>x.id===key):kind==='node'?(v.graphs.find(g=>g.id===state.graph)||{nodes:[]}).nodes.find(n=>n.id===key):(v.graphs.find(g=>g.id===state.graph)||{edges:[]}).edges.find(n=>n.id===key);if(o)o[name]=value;}});}

 function collections(){return state.snap&&state.snap.collections||state.catalog&&state.catalog.collections||{groups:[],favorites:[],dirty:false};}
 function libraryCommand(action,data){const key=currentKey();return enqueue(async()=>{if(currentKey()!==key)throw Error('Select the source map again.');const snap=await options.ipc('world-library-action',Object.assign({key,version:state.snap.version,action},data));apply(snap);if(action==='capture'){state.libraryOpen=true;renderLeft();message('Group added to the library draft. Use Save library to keep it with this project.');}},true);}
 function captureGroup(whole){let name,source;const ids=state.selection.slice(),layerId=state.layer;modal('Create reusable scenery group',d=>{name=field(d,'Name',(M.layerOf(values(),layerId).name||'Scenery')+' group',()=>{});source=field(d,'Source',whole?'layer':'selection',()=>{},[{value:'selection',label:'Selected objects'},{value:'layer',label:'Whole current layer'}]);note(d,'Saves scenery independently of the map-wide collision mask. Placed copies can be edited independently.');},()=>libraryCommand('capture',{name:name.value,ids,layerId:source.value==='layer'?layerId:null,includeBlockers:false}),'Create group draft');}
 function saveLibrary(){modal('Save reusable group library',d=>{note(d,'Saves groups and their required source images with this project. Map placements and player progress are unchanged.');},()=>enqueue(async()=>{const snap=await options.ipc('world-library-save',{key:currentKey(),version:state.snap.version});syncCatalog(await options.ipc('world-catalog'));apply(snap);},true),'Save library');}
 function manageGroup(group){modal('Saved group',d=>{let name=field(d,'Name',group.name,()=>{});button(d,'Rename in library draft',async()=>{await libraryCommand('rename',{id:group.id,name:name.value});});button(d,'Delete from library draft',()=>modal('Delete saved group?',x=>note(x,'Placed copies stay on their maps. Library Undo can restore this entry.'),()=>libraryCommand('delete',{id:group.id}),'Delete group'));});}
 async function chooseGroup(id){
 const request=state.groupRequest=(state.groupRequest||0)+1,context=currentContext(),tab=state.tab,tool=state.tool;
 const result=await options.ipc('world-group-get',{id});
 if(!isCurrent(context)||request!==state.groupRequest||tab!==state.tab||tool!==state.tool)return;
 state.groupId=id;state.groupData=result.group;state.groupPreview=null;state.groupScale=1;state.groupAngle=0;Object.assign(state.catalog.images,result.images);state.selection=[];state.tool='group';render();
}
 function groupPreview(){if(!state.groupData)return null;const group=state.groupData,ids=new Set();for(const o of group.objects)if(o.legacy)for(const s of o.legacy.sprites)ids.add(s.frame);else ids.add(o.assetId);const ready=Array.from(ids).map(id=>{const i=state.images[id]&&state.images[id].image;return id+':'+(i&&i.complete&&i.naturalWidth||0);}).join('|'),key=group.id+ready;if(state.groupPreview&&state.groupPreview.key===key)return state.groupPreview;const b=group.bounds,w=Math.max(1,b.maxX-b.minX),h=Math.max(1,b.maxY-b.minY),scale=Math.min(1,384/w,384/h),c=Paint.canvas(Math.max(1,Math.ceil(w*scale)),Math.max(1,Math.ceil(h*scale))),g=c.getContext('2d');g.setTransform(scale,0,0,-scale,-b.minX*scale,b.maxY*scale);const objects=group.objects.slice().sort((a,b)=>a.depth!==b.depth?(a.depth==='ground'?-1:1):b.y-a.y);for(const o of objects)Paint.object(g,o,{transform:{x:0,y:0,scale:1,angle:0}},state.images);state.groupPreview={key,canvas:c,bounds:b};return state.groupPreview;}
 function drawGroupGhost(){if(stageMode||state.tool!=='group'||!state.groupData||!state.brushCursor)return;const preview=groupPreview(),p=snapped(state.brushCursor);ctx.save();ctx.translate(p.x,p.y);ctx.rotate((state.groupAngle||0)*Math.PI/180);ctx.scale(state.groupScale||1,state.groupScale||1);ctx.globalAlpha=.55;if(preview){const b=preview.bounds;ctx.translate(b.minX,b.maxY);ctx.scale((b.maxX-b.minX)/preview.canvas.width,-(b.maxY-b.minY)/preview.canvas.height);ctx.drawImage(preview.canvas,0,0);}ctx.restore();}
 function renderLibraryShelf(){if(!state.libraryShelf){const details=el('details',undefined,'world-library-shelf'),heading=el('summary'),body=el('div');details.appendChild(heading);details.appendChild(body);details.ontoggle=()=>state.libraryOpen=details.open;state.libraryShelf={details,heading,body};}const ui=state.libraryShelf,info=collections();ui.details.open=!!state.libraryOpen;ui.heading.textContent='Saved groups · '+info.groups.length+(info.dirty?' · draft':'');ui.body.textContent='';if(info.dirty||info.canUndo||info.canRedo){const actions=el('div',undefined,'world-actions');if(info.dirty){button(actions,'Save library',saveLibrary);button(actions,'Discard library',()=>modal('Discard library draft?',d=>note(d,'Map drafts are preserved.'),()=>libraryCommand('discard'),'Discard'));}if(info.canUndo)button(actions,'Undo library',()=>libraryCommand('undo'));if(info.canRedo)button(actions,'Redo library',()=>libraryCommand('redo'));ui.body.appendChild(actions);}if(state.tab==='Decoration'){if(state.selection.length&&!state.layerSelection)button(ui.body,'Save selection as group…',()=>captureGroup(false));else{const layer=activeLayer(values(),false);if(layer&&layer.objects.length)button(ui.body,'Save layer as group…',()=>captureGroup(true));}for(const group of info.groups){const row=el('div',undefined,'world-group-row'),main=button(row,'',()=>chooseGroup(group.id),state.groupId===group.id);main.className+=' world-group-card';main.dataset.group=group.id;const asset=state.catalog.library.find(a=>a.id===group.assetId)||state.catalog.images[group.frame];if(asset){const img=el('img');img.src=pictures.url(asset.url,asset.sha256);img.loading='lazy';main.appendChild(img);}main.appendChild(el('span',group.name));main.appendChild(el('small',group.objects+' objects'+(group.blockers?' · blockers':'')));const settings=button(row,'⋯',()=>manageGroup(group));settings.setAttribute('aria-label','Manage group '+group.name);ui.body.appendChild(row);}if(!info.groups.length)note(ui.body,'Save selected scenery or a whole layer here, then place it on another map.');}else note(ui.body,'Open Objects to save or place scenery groups.');if(ui.details.parentNode!==left||ui.details.nextSibling!==paletteUI.grid)left.insertBefore(ui.details,paletteUI.grid.parentNode===left?paletteUI.grid:null);}
 function mapBudget(){return Budget.estimate(values(),assetTable(),Object.assign({},state.catalog.images,values().images||{}));}
 function budgetDetails(parent){const value=mapBudget();note(parent,Budget.describe(value));note(parent,value.groundTextures+' baked ground textures · '+value.atlasPages+' object atlas pages · '+value.legacyTextures+' existing scenery textures.');for(const warning of value.warnings)note(parent,warning,true);note(parent,'Uncompressed map texture estimate. Units, buildings, UI, driver overhead and platform compression are separate.');return value;}
 function showBudget(){modal('Map cost estimate',budgetDetails);}
 function mapLayerControls(ground){const id=ground?state.ground:state.layer,layer=(ground?groundLayers(values()):values().layers).find(l=>l.id===id);if(!layer){section(right,'No '+(ground?'ground':'object')+' layer');note(right,'Use '+(ground?'+ Ground layer':'+ Layer')+' in the Layers panel to add a layer.');return;}const change=fn=>edit(m=>{const next=ground?M.groundLayer(m,id):M.layerOf(m,id);M.assertEditable(next);fn(next,m);});section(right,'Selected '+(ground?'ground':'decoration')+' layer');field(right,'Name',layer.name||id,v=>change(l=>l.name=v));const t=layer.transform||{x:0,y:0,scale:1,angle:0};for(const key of ['x','y','scale','angle'])field(right,'Layer '+key,t[key],v=>change(l=>{if(!l.transform)l.transform={x:0,y:0,scale:1,angle:0};l.transform[key]=v;}));if(ground){slider(right,'Layer opacity',layer.opacity===undefined?1:layer.opacity,v=>change(l=>l.opacity=v),true);field(right,'Blend',layer.blend||'source-over',v=>change(l=>l.blend=v),['source-over','multiply','overlay','screen']);}else field(right,'Depth',layer.depth,v=>change(l=>l.depth=v),['auto','ground']);if(state.layerSelection)note(right,(ground?layer.images||[]:layer.objects||[]).length+' objects selected. Drag to move the whole layer.');const actions=el('div',undefined,'world-actions');right.appendChild(actions);for(const delta of [-1,1])button(actions,delta<0?'Layer down':'Layer up',()=>{if(ground)return edit(m=>{const order=m.ground.order||(m.ground.order=M.fixedGround.slice()),at=order.indexOf(id),to=Math.max(1,Math.min(order.length-1,at+delta));order.splice(at,1);order.splice(to,0,id);});return reorderLayer(delta);});button(actions,'Duplicate layer',()=>edit(m=>{if(ground){const next=M.createGroundLayer(m,(layer.name||id)+' copy',id),copy=next.ground.custom[next.ground.custom.length-1],newId=copy.id;Object.assign(copy,clone(layer),{id:newId,name:(layer.name||id)+' copy'});for(const o of copy.images||[])o.id='ground-image-'+next.nextObject++;Object.assign(m,next);state.ground=newId;}else{const copy=clone(M.layerOf(m,id));copy.id='layer-'+m.nextLayer++;copy.pinned=false;copy.name+=' copy';copy.transform=Object.assign({x:0,y:0,scale:1,angle:0},copy.transform);copy.transform.x+=30;for(const o of copy.objects)o.id='object-'+m.nextObject++;m.layers.push(copy);state.layer=copy.id;}state.selection=[];state.layerSelection=true;}));const remove=button(actions,'Delete layer',deleteSelectedLayer);remove.disabled=!!layer.locked;remove.title='Delete this layer and its contents (Del / Ctrl+D).';}

 function mapSettings(){modal('Map settings',d=>{field(d,'Name',values().name,v=>edit(m=>m.name=v));field(d,'Biome',values().biome,v=>edit(m=>m.biome=v),M.BIOMES);for(const key of ['width','height'])field(d,'Artwork '+key,values().size[key],v=>edit(m=>m.size[key]=Math.round(v)));for(const key of ['width','height'])field(d,'Playable '+key,values().playable[key],v=>edit(m=>m.playable[key]=Math.round(v)));note(d,'These settings remain a draft until Save.');});}
 function mapImageControls(selected){if(!selected||!selected.object)return;if(selected.layer&&(selected.layer.hidden||selected.layer.locked)){note(right,'Show and unlock this layer to edit its objects.');return;}const o=selected.object;section(right,o.name||'Selected image');field(right,'Name',o.name,v=>patchSelected('name',v));for(const key of ['x','y','scale','angle','flipX'])if(o[key]!==undefined)field(right,key==='scale'?'Image scale':key,o[key],v=>patchSelected(key,v));if(o.assetId){slider(right,'Image opacity',o.opacity===undefined?1:o.opacity,v=>patchSelected('opacity',v),true);if((o.mask||[]).length)button(right,'Clear mask',()=>patchSelected('mask',[]));}if(!selected.groundLayer){field(right,'Building overlap',o.buildingOverlap||'behind',v=>patchSelected('buildingOverlap',v),[{value:'behind',label:'Behind buildings'},{value:'front',label:'In front of buildings'}]);if(!o.legacy)field(right,'Depth',o.depth,v=>patchSelected('depth',v),['world','ground']);field(right,'Layer',selected.layer.id,v=>edit(m=>Object.assign(m,M.moveObjectToLayer(m,o.id,v))),values().layers.map(l=>({value:l.id,label:l.name})));if(!o.legacy)for(const key of ['x','y'])field(right,'Ground '+key,(o.ground||{})[key]||0,v=>patchSelected('ground',Object.assign({},o.ground,{[key]:v})));}button(right,'Duplicate object',duplicate);button(right,'Delete entire object',remove);}
 function cancelPolygon(){state.lassoPoints=[];state.lassoHover=null;renderRight();draw();}
 function finishPolygon(){if(state.lassoCommitting)return Promise.resolve();const points=(state.lassoPoints||[]).map(p=>({x:p.x,y:p.y})),op=state.lassoOp||'paint';if(points.length<3){message('Place at least three polygon points first.',true);return Promise.resolve();}state.lassoCommitting=true;renderRight();return enqueue(async()=>{const value=M.polygonBlockers(values(),points,op),snap=await options.ipc('world-change',{key:currentKey(),version:state.snap.version,value});state.lassoPoints=[];state.lassoHover=null;apply(snap);},true).catch(e=>message(e.message,true)).finally(()=>{state.lassoCommitting=false;if(!state.closed)renderRight();});}
 function drawPolygon(){if(stageMode||state.tool!=='polygon'||!(state.lassoPoints||[]).length)return;const points=state.lassoPoints.slice();if(state.lassoHover)points.push(state.lassoHover);ctx.save();ctx.lineWidth=1.5/state.zoom;ctx.strokeStyle='#ffd166';ctx.fillStyle='#ffd16625';ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));if(points.length>2){ctx.closePath();ctx.fill();}ctx.stroke();for(const p of state.lassoPoints){ctx.fillStyle='#ffe9ad';ctx.beginPath();ctx.arc(p.x,p.y,3.5/state.zoom,0,Math.PI*2);ctx.fill();ctx.stroke();}ctx.restore();}
 function renderAutoBlockers(){if(!state.autoBlockerMode)section(right,'Automatic blockers');const actions=el('div',undefined,'world-actions');right.appendChild(actions);for(const op of ['paint','erase']){const b=button(actions,op==='paint'?'Auto Paint Blocker':'Auto Erase Blocker',()=>{state.autoBlockerMode=op;state.tool='pan';state.lassoPoints=[];state.lassoHover=null;if(!state.autoBlockerLayers)state.autoBlockerLayers=values().layers.filter(l=>!l.hidden&&(l.objects||[]).length).map(l=>l.id);render();},state.autoBlockerMode===op);b.disabled=!!state.autoBlockerBusy;}if(!state.autoBlockerMode)return;const layers=values().layers,chosen=new Set(state.autoBlockerLayers||[]),eligible=layers.filter(l=>(l.objects||[]).length);note(right,'Choose object layers. Transparency and image masks are respected; low precision approximates the edge.');const controls=el('div',undefined,'world-actions');right.appendChild(controls);button(controls,'Select all',()=>{state.autoBlockerLayers=eligible.map(l=>l.id);state.autoBlockerPreview=null;renderRight();draw();}).disabled=!!state.autoBlockerBusy;button(controls,'Clear selection',()=>{state.autoBlockerLayers=[];state.autoBlockerPreview=null;renderRight();draw();}).disabled=!!state.autoBlockerBusy;const list=el('div',undefined,'world-auto-blocker-list');list.setAttribute('aria-label','Object layers for automatic blockers');right.appendChild(list);for(const layer of layers){const row=el('label'),text=el('span',(layer.name||layer.id)+' · '+(layer.objects||[]).length+' objects'+(layer.hidden?' (hidden)':'')),box=el('input');box.type='checkbox';box.checked=chosen.has(layer.id);box.disabled=!!state.autoBlockerBusy||!(layer.objects||[]).length;box.dataset.autoBlockerLayer=layer.id;box.onchange=()=>{const ids=new Set(state.autoBlockerLayers||[]);if(box.checked)ids.add(layer.id);else ids.delete(layer.id);state.autoBlockerLayers=Array.from(ids);state.autoBlockerPreview=null;renderRight();draw();};row.appendChild(box);row.appendChild(text);list.appendChild(row);}slider(right,'Outline precision',(state.autoBlockerPrecision===undefined?0:state.autoBlockerPrecision)/100,v=>{state.autoBlockerPrecision=Math.round(v*100);state.autoBlockerPreview=null;draw();}).disabled=!!state.autoBlockerBusy;note(right,'0 = simplest. 100 = exact pixel edges. Higher precision costs more CPU. Selected hidden layers are included.');const count=eligible.filter(l=>chosen.has(l.id)).length;note(right,count+' layer'+(count===1?'':'s')+' selected');const autoActions=el('div',undefined,'world-auto-apply');right.appendChild(autoActions);const preview=button(autoActions,state.autoBlockerBusy?'Generating preview…':'Preview outline',()=>applyAutoBlockers(true));preview.disabled=!!state.autoBlockerBusy||!count;if(state.autoBlockerPreview&&state.autoBlockerPreviewSignature===autoBlockerSignature())note(right,'Preview only · '+(state.autoBlockerPreviewStats&&state.autoBlockerPreviewStats.verticesAfter||0)+' outline vertices. Apply to keep it in the draft.');const go=button(autoActions,state.autoBlockerBusy?'Generating outlines…':state.autoBlockerMode==='paint'?'Apply Auto Paint to draft':'Apply Auto Erase to draft',()=>applyAutoBlockers(false),true);go.disabled=!!state.autoBlockerBusy||!count;note(right,'Apply is undoable; Save updates the game. Auto Paint adds blockers. Undo before changing an applied outline’s precision.');}
 function autoBlockerSignature(){return JSON.stringify([currentKey(),state.snap&&state.snap.version,state.autoBlockerMode,(state.autoBlockerLayers||[]).slice().sort(),state.autoBlockerPrecision===undefined?0:state.autoBlockerPrecision]);}
 function applyAutoBlockers(previewOnly){const key=currentKey(),op=state.autoBlockerMode,layerIds=(state.autoBlockerLayers||[]).slice(),precision=state.autoBlockerPrecision===undefined?0:state.autoBlockerPrecision;if(state.autoBlockerBusy||!layerIds.length)return;state.autoBlockerBusy=true;renderRight();message('Tracing selected artwork…');return enqueue(async()=>{if(currentKey()!==key)throw Error('Select the source map again before generating blockers.');const version=state.snap.version,signature=autoBlockerSignature(),result=await options.ipc(previewOnly?'world-auto-blockers-preview':'world-auto-blockers',{key,version,op,layerIds,precision});if(previewOnly){if(currentKey()!==key||state.snap.version!==version)throw Error('The map changed while tracing. Generate a new preview.');state.autoBlockerPreview=result.mask;state.autoBlockerPreviewSignature=signature;state.autoBlockerPreviewStats=result.stats;draw();message('Outline preview only. Apply to draft when you are satisfied.');}else{state.autoBlockerPreview=null;apply(result);}},true).finally(()=>{state.autoBlockerBusy=false;if(!state.closed)renderRight();});}

 function renderMapInspector(){const tool=state.tool,ground=state.tab==='Ground',selected=selectedObject();section(right,!stageMode&&state.tab==='Blockers'&&state.autoBlockerMode?(state.autoBlockerMode==='paint'?'Auto Paint Blocker':'Auto Erase Blocker'):{select:'Selection',pan:'Hand / Pan',paint:'Paint',erase:'Soft Eraser','image-erase':'Soft Eraser','image-restore':'Restore mask','ground-image':'Place whole image',place:'Place decoration',block:'Path blocker brush',unblock:'Blocker eraser',delete:'Delete Object',layer:'Move Layer',polygon:'Polygon Lasso'}[tool]||'Tool');
 if(!stageMode&&state.tab==='Blockers'){note(right,'One fixed map-wide blocker layer, independent of Ground and Objects.');if(state.autoBlockerMode){renderAutoBlockers();return;}if(tool==='polygon'){field(right,'Operation',state.lassoOp||'paint',v=>{state.lassoOp=v;draw();},[{value:'paint',label:'Add blockers'},{value:'erase',label:'Remove blockers'}]);note(right,(state.lassoPoints||[]).length+' points placed');button(right,'Finish polygon',finishPolygon).disabled=!!state.lassoCommitting||(state.lassoPoints||[]).length<3;button(right,'Remove last point',()=>{state.lassoPoints.pop();renderRight();draw();}).disabled=!(state.lassoPoints||[]).length;button(right,'Cancel polygon',cancelPolygon).disabled=!(state.lassoPoints||[]).length;note(right,'Click to place corners. Enter, double-click or click the first point to finish. Backspace removes a point; Escape cancels.');}else if(tool==='pan'){note(right,'Drag to pan. Wheel to zoom. R paints blockers; E erases.');field(right,'Zoom',state.zoom,v=>{state.zoom=Math.max(.04,Math.min(4,v));draw();});button(right,'Fit entire map',fit);}else{field(right,'Brush size',state.size,v=>state.size=Math.max(.25,Math.min(1500,v)));field(right,'Shape',state.shape,v=>state.shape=v,['round','square']);field(right,'Edge detail',state.brushEdgeTolerance===undefined?1:state.brushEdgeTolerance,v=>state.brushEdgeTolerance=v,[{value:0,label:'Precise'},{value:1,label:'Balanced'},{value:3,label:'Light'}]);note(right,'Light straightens small bends and uses fewer corners. Precise follows the brush more closely.');note(right,'Paint or erase one map-wide collision mask. This mask stays in place when scenery moves.');note(right,'Existing collision areas are included. Edits remain a draft until Save.');}renderAutoBlockers();return;}
 if(['select','layer','paint','erase','ground-image','place','image-erase','image-restore','delete'].includes(tool)&&!activeLayer(values(),ground)){mapLayerControls(ground);button(right,'Upload image…',importImage);return;}if(tool==='group'){const group=state.groupData;if(group){note(right,group.name+' · '+group.objects.length+' objects');field(right,'Group scale',state.groupScale||1,v=>{state.groupScale=v;draw();});field(right,'Group rotation',state.groupAngle||0,v=>{state.groupAngle=v;draw();});note(right,'Click to place the group in a new movable layer.');button(right,'Back to selection',()=>{state.tool='select';state.groupId=null;state.groupData=null;state.groupPreview=null;render();});}return;}if(tool==='pan'){note(right,'Drag to pan. Wheel to zoom. Middle or right drag also pans from any tool.');field(right,'Zoom',state.zoom,v=>{state.zoom=Math.max(.04,Math.min(4,v));draw();});button(right,'Fit entire map',fit);return;}
 if(tool==='paint'||tool==='erase'||tool==='image-erase'||tool==='image-restore'||tool==='block'||tool==='unblock'){const asset=state.catalog.library.find(a=>a.id===state.asset),pair=ground&&tool==='paint'&&pairedRoad(asset),road=!!pair&&state.paintMode==='road';if(pair)field(right,'Paint mode',state.paintMode,v=>{rememberRoadSettings();state.paintMode=v;if(v==='road')configureRoad(asset);else state.roadFamily=null;renderRight();prepareImages();draw();},[{value:'texture',label:'Texture brush'},{value:'road',label:'Curved road'}]);field(right,road?'Road width':'Brush size',state.size,v=>state.size=Math.max(['block','unblock'].includes(tool)?.25:5,Math.min(1500,v)));if(!road)field(right,'Shape',state.shape,v=>state.shape=v,['round','square']);if(road){field(right,'Edge style',state.edgeStyle,v=>{state.edgeStyle=v;renderRight();},[{value:'textured',label:'Road up texture'},{value:'clean',label:'Clean edge'}]);field(right,'Edge scale',state.edgeScale,v=>state.edgeScale=Math.max(.05,Math.min(8,v)));slider(right,state.edgeStyle==='textured'?'Bend smoothing':'Edge smoothing',state.edgeSmoothing,v=>state.edgeSmoothing=v);note(right,state.edgeStyle==='textured'?'Keeps the original Road up texture. Bend smoothing adjusts curves and joins.':'Smooths the texture into a clean edge.');note(right,'Road width and Edge scale are independent. Settings apply to new strokes.');note(right,'Surface: '+pair.surface.name+' · Edge: '+pair.edge.name);note(right,'Draw a road; edges follow bends and overlapping strokes join. Shift-drag draws a straight road. Erase on this ground layer to trim it.');}if(tool==='paint')field(right,'Texture tiling',state.textureScale,v=>state.textureScale=Math.max(.05,Math.min(64,v)));if(!['block','unblock'].includes(tool)){if(!road)slider(right,'Hardness',state.hardness,v=>state.hardness=v);slider(right,'Opacity',state.opacity,v=>state.opacity=v);}if(ground&&['paint','erase'].includes(tool)){field(right,'Ground layer',state.ground,v=>{state.ground=v;render();},groundLayers(values()).map(l=>({value:l.id,label:l.name||l.id})));if(tool==='erase')field(right,'Erase target',state.eraseTarget,v=>{state.eraseTarget=v;renderRight();}, [{value:'layer',label:'Selected layer'},{value:'image',label:'Selected image mask'}]);if(tool==='paint'){const asset=state.catalog.library.find(a=>a.id===state.asset);note(right,asset?'Texture: '+asset.name:'Choose a texture in the library.');if(!road)button(right,'Fill selected layer',()=>edit(m=>{if(!state.asset)throw Error('Choose a texture.');Object.assign(m,M.stroke(m,state.ground,{size:Math.max(m.size.width,m.size.height)*2,shape:'square',op:'paint',assetId:state.asset,textureScale:state.textureScale,opacity:state.opacity,hardness:1,points:[{x:0,y:0}]}));}));button(right,'Clear selected paint',()=>edit(m=>{const layer=M.groundLayer(m,state.ground);M.assertEditable(layer);layer.strokes=[];}));}}if(['image-erase','image-restore'].includes(tool)||tool==='erase'&&state.eraseTarget==='image')note(right,selected?'Image mask: '+selected.object.name:'Select a placed image with the selection tool first.');return;}
 if(tool==='delete'){note(right,'Click a placed object to remove the entire placement. Soft Eraser edits masks separately. Undo restores deleted objects.');if(selected)button(right,'Delete selected object',remove);return;}
 if(tool==='ground-image'||tool==='place'){const asset=state.catalog.library.find(a=>a.id===state.asset);note(right,asset?'Selected: '+asset.name:'Choose an image or asset in the library.');button(right,'Upload image…',importImage);if(tool==='place'){field(right,'Minimum scale',state.min,v=>state.min=v);field(right,'Maximum scale',state.max,v=>state.max=v);note(right,'A new random scale is stored with each click.');}else{field(right,'Placement scale',state.imageScale||1,v=>state.imageScale=v);field(right,'Ground layer',state.ground,v=>{state.ground=v;render();},groundLayers(values()).map(l=>({value:l.id,label:l.name||l.id})));}mapImageControls(selected);return;}
 if(tool==='layer'){mapLayerControls(ground);note(right,'Drag in the map to move this whole layer. Its artwork and image masks stay together. Map blockers stay fixed.');return;}
 if(selected)mapImageControls(selected);else mapLayerControls(ground);button(right,'Upload image…',importImage);button(right,'Map settings…',mapSettings);button(right,'Map cost…',showBudget);if(values().id==='Map07'&&!values().sourcePiecesRecovered)button(right,'Recover 95 original Stage 7 props',()=>modal('Recover Stage 7 source pieces',d=>note(d,'Restores separate source props and clean cliff chunks in this draft. Save or discard other map changes first.'),async()=>{const snap=await options.ipc('world-recover-stage07',{key:currentKey(),version:state.snap.version});state.catalog=await options.ipc('world-catalog');apply(snap);},'Recover to draft'));if(state.snap.issues.length){section(right,'Validation');state.snap.issues.slice(0,8).forEach(i=>note(right,i,true));}}
 function renderRight(){if(changeTimer!==null){deferredRender=true;return;}const savedFocus=captureFocus();try{right.textContent='';if(stageMode)stagePanels.right();else renderMapInspector();}finally{restoreFocus(savedFocus);}}
 function renderBuildingInspector(){ const selected=stageMode&&state.tool==='building'?null:selectedObject();if(selected&&selected.object){const o=selected.object;section(right,state.selection.length>1?state.selection.length+' selected':o.name||'Selected '+(selected.kind||'object'));if(o.name!==undefined)field(right,'Name',o.name,v=>patchSelected('name',v));if(selected.kind!=='edge'){for(const key of ['x','y'])field(right,key.toUpperCase(),o[key],v=>patchSelected(key,v));for(const key of ['scale','angle','flipX'])if(o[key]!==undefined)field(right,key,o[key],v=>patchSelected(key,v));}
 if(!stageMode&&!selected.groundLayer){field(right,'Depth',o.depth,v=>patchSelected('depth',v),['world','ground']);field(right,'Layer',selected.layer.id,v=>edit(m=>Object.assign(m,M.moveObjectToLayer(m,o.id,v))),values().layers.map(l=>({value:l.id,label:l.name})));for(const key of ['x','y'])field(right,'Ground point '+key,(o.ground||{})[key]||0,v=>patchSelected('ground',Object.assign({},o.ground,{[key]:v})));if(o.legacy)note(right,'Original baked chunk. Its artwork and exact collision shapes move together.');}
 if(!stageMode&&o.assetId){slider(right,'Image opacity',o.opacity===undefined?1:o.opacity,v=>patchSelected('opacity',v),true);button(right,'Clear image mask',()=>patchSelected('mask',[]));note(right,'Scale, rotation and masks stay with this image. Delete Object removes the entire placement.');}if(selected.kind==='building'){field(right,'Purchase field side',o.purchaseSide||'authored',value=>edit(stage=>{for(const id of state.selection){const b=stage.buildings.find(b=>'building:'+b.id===id);if(b){if(value==='authored')delete b.purchaseSide;else b.purchaseSide=value;}}}),[{value:'authored',label:'Authored placement'},{value:'southwest',label:'Southwest ↙'},{value:'southeast',label:'Southeast ↘'}]);if(o.kind===6){const wallRotation=field(right,'Wall rotation',o.wallRotation||0,v=>patchSelected('wallRotation',v));wallRotation.step='1';wallRotation.title='Rotate the wall and gate without rotating the purchase field.';note(right,'Wall rotation adjusts the wall and its built collision shapes. The purchase field stays in place.');const faces=[{value:'NE',label:'Northeast ↗'},{value:'NW',label:'Northwest ↖'},{value:'SE',label:'Southeast ↘'},{value:'SW',label:'Southwest ↙'}];if(!o.wallFacing)faces.unshift({value:'legacy',label:'Legacy authored'});field(right,'Wall facing',o.wallFacing||'legacy',v=>edit(stage=>{for(const id of state.selection){const b=stage.buildings.find(b=>'building:'+b.id===id&&b.kind===6);if(b){if(v==='legacy')delete b.wallFacing;else b.wallFacing=v;}}}),faces);note(right,'Facing points outside. Doors open outward and the construction step stays inside.');}if(o.kind!==1)field(right,'Available at hall level',o.unlock,v=>patchSelected('unlock',v),[1,2,3]);field(right,'Enabled',o.enabled,v=>patchSelected('enabled',v));note(right,'Availability unlocks construction; it does not build or upgrade automatically.');}
 if(selected.kind==='spawn'){field(right,'Enabled',o.enabled,v=>patchSelected('enabled',v));state.spawn=o.id;}
 if(selected.kind==='node'){field(right,'Goal node',!!o.goal,v=>patchSelected('goal',v));button(right,'Use as route start',()=>edit(s=>s.graphs.find(g=>g.id===state.graph).entry=o.id));}
 if(selected.kind==='edge'){button(right,'Insert midpoint node',()=>edit(s=>{const g=s.graphs.find(g=>g.id===state.graph),e=g.edges.find(e=>e.id===o.id),a=g.nodes.find(n=>n.id===e.from),b=g.nodes.find(n=>n.id===e.to),id='node-'+Date.now();g.nodes.push({id,x:(a.x+b.x)/2,y:(a.y+b.y)/2,goal:false});const destination=e.to;e.to=id;g.edges.push({id:'edge-'+Date.now(),from:id,to:destination,weight:1});state.selection=['node:'+id];}));field(right,'Branch weight',o.weight,v=>patchSelected('weight',v));field(right,'Requires any building IDs',(o.requiresAnyBuilding||[]).join(','),v=>patchSelected('requiresAnyBuilding',v.split(',').filter(Boolean).map(Number)));note(right,'Weights are relative at this junction. Keep an unconditional branch available.');}
 if(selected.kind!=='hero'){const buttons=el('div',undefined,'world-actions');right.appendChild(buttons);button(buttons,'Duplicate',duplicate).disabled=['node','edge'].includes(selected.kind);button(buttons,'Delete',remove).disabled=selected.kind==='building'&&o.kind===1;}}
 if(state.tab==='Buildings'){const choice=state.tool==='building'&&buildingChoice();if(choice){section(right,'Place '+choice.placement.name);const card=state.buildingPlacements.find(c=>c.catalogId===state.buildingAsset);if(card.variants.length>1)field(right,'Wall facing',choice.id,value=>{state.buildingVariant=value;prepareImages();renderRight();draw();},card.variants.map(v=>({value:v.id,label:v.label})));if(choice.placement.kind===6)note(right,'The facing arrow points outside. Doors open outward; the construction step stays inside. Allies can pass from either side.');for(const issue of choice.preview.errors||[])note(right,issue,true);}field(right,'Gate state',state.gate,changeGatePreview,[{value:'closed',label:'Closed'},{value:'open',label:'Open for allies'}]);note(right,'Models and construction steps preview the placement. Red: map blockers. Orange: building blockers. Open gates admit allies; enemies still attack the gate.');for(const issue of state.snap.buildingPreview&&state.snap.buildingPreview.errors||[])note(right,issue,true);}}
 function reorderLayer(delta){return edit(m=>{const at=m.layers.findIndex(l=>l.id===state.layer);if(at<0)return;const to=Math.max(0,Math.min(m.layers.length-1,at+delta)),layer=m.layers.splice(at,1)[0];m.layers.splice(to,0,layer);});}
 function importImage(){
 const context=currentContext(),tab=state.tab,tool=state.tool,assetId=state.asset,input=el('input');input.type='file';input.accept='.png,.jpg,.jpeg';
 input.onchange=async()=>{
  const file=input.files[0];if(!file||!isCurrent(context))return;
  try{
   if(file.size>40*1024*1024)throw Error('Choose an image smaller than 40 MB.');
   const image=new Image();
   await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=()=>reject(Error('This image could not be opened. Choose a valid PNG or JPEG.'));image.src=require('url').pathToFileURL(file.path).href;});
   if(!isCurrent(context)||tab!==state.tab)return;
   await enqueue(async()=>{
    if(!isCurrent(context)||tab!==state.tab)return;
    const result=await options.ipc('world-import',{version:state.snap.version,file:file.path,width:image.naturalWidth,height:image.naturalHeight});
    if(state.closed)return;
    state.snap.version=Math.max(state.snap.version,result.version);const at=state.catalog.library.findIndex(a=>a.id===result.asset.id);if(at<0)state.catalog.library.push(result.asset);else state.catalog.library[at]=result.asset;
    state.assetTable=null;if(isCurrent(context)&&tab===state.tab&&tool===state.tool&&assetId===state.asset){state.asset=result.asset.id;state.category='custom';state.tool=tab==='Ground'?'ground-image':'place';state.groupRequest=(state.groupRequest||0)+1;}render();
   },true);
  }catch(error){if(isCurrent(context))message(error.message,true);}
 };input.click();
}

 function jsonField(key,wave){let input;modal('Edit '+key,d=>{input=el('textarea');input.value=JSON.stringify(wave===undefined?values().config[key]:values().config.WaveCfg[wave][key],null,2);d.appendChild(input);},()=>{const value=JSON.parse(input.value);return edit(s=>{if(wave===undefined)s.config[key]=value;else s.config.WaveCfg[wave][key]=value;});});}


 function renderTimeline(){bottom.textContent='';bottom.hidden=true;}
 function copyWave(){let source;const index=state.wave;modal('Copy unit groups from wave',dialog=>{source=select(dialog,0,values().config.WaveCfg.map((wave,i)=>({value:i,label:'Wave '+wave.Wave})),()=>{});},()=>edit(stage=>{const from=stage.config.WaveCfg[Number(source.value)],to=stage.config.WaveCfg[index];if(!from||!to)throw Error('Select a valid wave.');to.SpawnTimeline=WaveEditor.entries(from,state.catalog.interval);}));}
 function duplicate(){
 const selected=selectedObject(),ids=state.selection.slice();if(!selected||!selected.object)return;
 return edit(value=>{
  if(!stageMode){const result=M.duplicateObjects(value,ids);Object.assign(value,result.map);state.selection=result.ids;}
  else if(selected.kind==='spawn'){Object.assign(value,M.newSpawn(value,{x:selected.object.x+40,y:selected.object.y-40}));state.spawn=value.spawns[value.spawns.length-1].id;state.selection=['spawn:'+state.spawn];}
  else{const copy=clone(selected.object);if(selected.kind==='building'){if(copy.kind===1)throw Error('A stage has one main hall.');copy.id=value.nextBuilding++;value.buildings.push(copy);}else{copy.id='offer-'+value.nextSpecial++;value.specials.push(copy);}copy.x+=30;copy.y-=30;state.selection=[selected.kind+':'+copy.id];}
 });
}
 function deleteSelectedLayer(){if(stageMode||state.tab==='Blockers')return;const ground=state.tab==='Ground',id=ground?state.ground:state.layer,layer=(ground?groundLayers(values()):values().layers).find(l=>l.id===id);if(!layer)return;if(layer.locked){message('Unlock this layer before deleting it.',true);return;}return edit(m=>{const list=ground?groundLayers(m):m.layers,at=list.findIndex(l=>l.id===id);Object.assign(m,ground?M.removeGroundLayer(m,id):M.removeLayer(m,id));const next=ground?groundLayers(m):m.layers,selected=next[Math.max(0,Math.min(next.length-1,at-1))];if(ground)state.ground=selected&&selected.id||null;else state.layer=selected&&selected.id||null;if(state.solo&&state.solo.id===id&&!!state.solo.ground===ground)state.solo=null;state.selection=[];state.layerSelection=false;});}
 function remove(){
 if(!stageMode&&state.layerSelection)return deleteSelectedLayer();const selected=selectedObject();if(!selected)return;
 const ids=state.selection.slice(),graphId=state.graph;
 return edit(value=>{
  if(!stageMode){
   for(const id of ids){const found=editablePlacement(value,id);if(found)M.assertEditable(found.layer);}
   Object.assign(value,M.removeObjects(value,ids));for(const layer of M.groundLayers(value))M.groundLayer(value,layer.id).images=(layer.images||[]).filter(o=>!ids.includes(o.id));
  }else for(const id of ids){
   const [kind,key]=id.split(':');
   if(kind==='building'){const b=value.buildings.find(x=>x.id===Number(key));if(b&&b.kind===1)throw Error('The main hall cannot be removed.');value.buildings=value.buildings.filter(x=>x.id!==Number(key));}
   else if(kind==='special')value.specials=value.specials.filter(x=>x.id!==key);
   else if(kind==='spawn')Object.assign(value,M.removeSpawn(value,Number(key)));
   else if(kind==='node')PathEditor.removeNode(value,graphId,key);
   else if(kind==='edge'){const graph=value.graphs.find(x=>x.id===graphId);graph.edges=graph.edges.filter(e=>e.id!==key);}
  }
  state.selection=[];
 });
}
 const buildingRenderer=BuildingRenderer.create({onLoad:draw,onError:error=>message(error.message,true)});
 const stagePanels=stageMode?StagePanels.create({state,el,button,field,select,note,section,edit,render,draw,top,tabs,left,right,load,fit,startPreview,closePreview,clipboard,action,refresh:refreshWorld,discard,save,cancelDrag,prepareImages,buildingPalette,editMap:()=>options.ipc('world-focus-map',{id:values().mapId}),jsonField,patchSelected,remove,newPath,insertPathNode,removePathNode,navigation,modal,copyWave,buildingInspector:renderBuildingInspector}):null;
 function gateRecord(record,kind){if(!record||kind!==6||state.gate!=='open')return record;return Object.assign({},record,{blockers:record.openBlockers||record.blockers,skeletons:(record.skeletons||[]).map(d=>Object.assign({},d,{animation:'open',poseTime:'end'}))});}
 function stageRecord(b){const snapshot=placementSnapshot(),preview=snapshot&&snapshot.buildingPreview,entry=preview&&preview.buildings[b.id];return gateRecord(entry&&entry.levels[state.previewHall],b.kind);}
 function buildingChoice(){const card=(state.buildingPlacements||[]).find(c=>c.catalogId===state.buildingAsset);return card&&(card.variants.find(v=>v.id===state.buildingVariant)||card.variants[0]);}
 function buildingRuntime(){const snapshot=placementSnapshot(),choice=stageMode&&buildingChoice();return snapshot&&snapshot.buildingPreview&&snapshot.buildingPreview.runtimePath||choice&&choice.preview.runtimePath;}
 function ghostBuilding(){const choice=buildingChoice();if(!stageMode||state.tool!=='building'||!choice||!state.brushCursor)return null;const p=snapped(state.brushCursor);return {building:Object.assign({},choice.placement,p,{scale:1,angle:0}),record:gateRecord(choice.preview.levels[state.previewHall],choice.placement.kind)};}
 function changeGatePreview(value){state.gate=value;state.nav=null;prepareImages();renderTabs();draw();}
 function visibleBuildings(){const stage=placementStage();return (stage&&stage.buildings||[]).filter(b=>b.enabled!==false&&(b.unlock||1)<=state.previewHall);}
 function ensureImage(id,onload){return pictures.ensure(id,onload);}
 function prepareImages(){
 if(!state.map||!state.catalog||state.closed)return;
 const map=Selection.soloMap(state.map,stageMode?null:state.solo),wanted=new Set(),add=id=>{if(id)wanted.add(id);},sprite=s=>{if(s.active!==false&&(!s.color||s.color.a===undefined||s.color.a>0))add(s.frame);},object=o=>{if(o.opacity===0)return;if(o.legacy)(o.legacy.sprites||[]).forEach(sprite);else add(o.assetId);};
 if(state.asset)add(state.asset);
 if(state.tab==='Ground'&&state.tool==='paint'&&state.paintMode==='road'){const pair=pairedRoad();if(pair){add(pair.surface.id);add(pair.edge.id);}}
 if(state.tool==='group'&&state.groupData)state.groupData.objects.forEach(object);
 for(const layer of map.layers)if(!layer.hidden)for(const o of layer.objects)object(o);
 for(const layer of M.groundLayers(map))if(!layer.hidden&&layer.opacity!==0){
  if(layer.id==='foundation'&&map.legacyGround)(map.legacyGround.sprites||[]).forEach(sprite);
  add(layer.baseAsset);for(const tile of layer.tiles||[])object(tile);for(const stroke of layer.strokes||[])for(const id of Terrain.strokeAssets(stroke))add(id);for(const o of layer.images||[])object(o);
 }
 const placement=placementSnapshot();
 if(placement){
  const preview=placement.buildingPreview,records=visibleBuildings().map(stageRecord).filter(Boolean);
  const choice=stageMode&&state.tool==='building'&&buildingChoice();state.extraImages=Object.assign({},preview&&preview.images||{},choice&&choice.preview.images||{});if(choice){const record=gateRecord(choice.preview.levels[state.previewHall],choice.placement.kind);if(record)records.push(record);}
  for(const record of records)(record.sprites||[]).forEach(sprite);
  for(const offer of (placement.value.specials||[]).filter(b=>b.enabled!==false))(offer.sprites||[]).forEach(sprite);
  buildingRenderer.prepare(records,buildingRuntime());
 }else{state.extraImages={};buildingRenderer.prepare([],null);}
 pictures.retain(wanted);for(const id of wanted)ensureImage(id);
}
 function render(){if(state.closed||!state.snap)return;if(changeTimer!==null){deferredRender=true;return;}root.classList.toggle('world-blocker-mode',!stageMode&&state.tab==='Blockers');hint.textContent=(!stageMode&&state.tab==='Blockers'?(state.tool==='polygon'?'Click: add point · Enter/double-click: finish · Backspace: remove point · Esc: cancel · Wheel: zoom':'Wheel: zoom · Drag: pan · R: paint blocker · E: erase blocker · L: polygon lasso · Shift + Scroll: resize brush'):'Wheel: zoom · Middle/right drag: pan · Shift: multiple selection · Del / Ctrl+D: delete'+(!stageMode&&state.tool==='paint'?' · Shift-drag: straight stroke':'')+(!stageMode&&brushTool()?' · Shift + Scroll: resize brush':''));if(!stageMode&&state.tab==='Decoration'&&state.tool==='place')hint.textContent='Left: place · Right drag: delete objects · Middle/Alt drag: pan · T: Place one';if(!stageMode){if(state.groupId&&!collections().groups.some(g=>g.id===state.groupId)){state.groupId=null;state.groupData=null;state.groupPreview=null;if(state.tool==='group')state.tool='select';}if(!groundLayers(values()).some(l=>l.id===state.ground))state.ground=(groundLayers(values())[0]||{}).id||null;if(!values().layers.some(l=>l.id===state.layer))state.layer=values().layers[0]&&values().layers[0].id||null;if(state.layerSelection){const layer=activeLayer(values(),state.tab==='Ground');state.selection=layer?(state.tab==='Ground'?layer.images||[]:layer.objects||[]).map(o=>o.id):[];}state.selection=state.selection.filter(id=>M.groundImage(values(),id)||values().layers.some(l=>l.objects.some(o=>o.id===id)));if(state.solo&&!(state.tab==='Ground'?state.ground:state.layer))state.solo=null;if(state.solo){const ground=state.tab==='Ground';state.solo={id:ground?state.ground:state.layer,ground};const map=Selection.soloMap(values(),state.solo);state.selection=state.selection.filter(id=>{const found=Selection.entry(map,id);return found&&!found.layer.hidden&&(!found.ground||found.layer.opacity!==0);});}}else{if(!values().spawns.some(p=>p.id===state.spawn))state.spawn=values().spawns[0]&&values().spawns[0].id;if(!values().graphs.some(g=>g.id===state.graph))state.graph=(values().graphs.find(g=>g.spawnIds.includes(state.spawn))||values().graphs[0]||{}).id;state.wave=Math.max(0,Math.min(state.wave,values().config.WaveCfg.length-1));state.selection=state.selection.filter(id=>{const old=state.selection;state.selection=[id];const hit=selectedObject();state.selection=old;return !!(hit&&hit.object);});}if(stageMode&&state.map.id!==values().mapId){const id=values().mapId,serial=++mapRequestSerial,context=currentContext();options.ipc('world-load',{key:'map:'+id}).then(s=>{if(!isCurrent(context)||serial!==mapRequestSerial||values().mapId!==id)return;setMap(s.value);renderer.clear();pictures.clear();render();fit();}).catch(e=>{if(isCurrent(context)&&serial===mapRequestSerial)message(e.message,true);});return;}const focused=captureFocus();renderTop();renderTabs();renderLeft();renderRight();renderLayerPane();renderTimeline();prepareImages();draw();restoreFocus(focused);message((state.snap.dirty?'Unsaved draft':'Saved data')+' · '+(stageMode?'Stage layout':'Shared environment')+' · '+state.snap.issues.length+' validation issue(s)'+(collections().dirty?' · Library draft unsaved':''));}
 function fit(){if(!state.map)return;const width=view.clientWidth,height=view.clientHeight;if(width<=0||height<=0){pendingFit=true;return;}pendingFit=false;state.zoom=Math.min(width/state.map.size.width,height/state.map.size.height)*.94;state.pan={x:0,y:0};draw();}
 function transform(){return [state.zoom,0,0,-state.zoom,canvas.width/2+state.pan.x,canvas.height/2+state.pan.y];}
 function screen(event){const r=canvas.getBoundingClientRect();return {x:event.clientX-r.left,y:event.clientY-r.top};}
 function world(p){return {x:(p.x-canvas.width/2-state.pan.x)/state.zoom,y:-(p.y-canvas.height/2-state.pan.y)/state.zoom};}
 function snapped(p){const grid=state.snapGrid;return grid?{x:Math.round(p.x/grid)*grid,y:Math.round(p.y/grid)*grid}:p;}
 function circle(p,color,label,radius){ctx.fillStyle=color;ctx.strokeStyle='#101010';ctx.lineWidth=1/state.zoom;ctx.beginPath();ctx.arc(p.x,p.y,radius||6/state.zoom,0,Math.PI*2);ctx.fill();ctx.stroke();if(label){ctx.save();ctx.translate(p.x+8/state.zoom,p.y);ctx.scale(1/state.zoom,-1/state.zoom);ctx.font='11px Arial';ctx.fillStyle='#fff';ctx.strokeStyle='#111';ctx.lineWidth=3;ctx.strokeText(label,0,0);ctx.fillText(label,0,0);ctx.restore();}}
 function draw(){if(frame!==null||state.closed)return;frame=requestAnimationFrame(()=>{frame=null;if(!state.map)return;const w=view.clientWidth,h=view.clientHeight;if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,w,h);ctx.setTransform.apply(ctx,transform());let map=mapView(state.map);if(!stageMode&&state.autoBlockerMode&&state.autoBlockerPreview&&state.autoBlockerPreviewSignature===autoBlockerSignature())map=Object.assign({},map,{blockerMask:state.autoBlockerPreview});if(!stageMode&&state.drag&&state.drag.stroke)map=previewMap(map,state.drag);if(!stageMode)map=Selection.soloMap(map,state.solo);ctx.fillStyle='#4d5549';ctx.fillRect(-map.size.width/2,-map.size.height/2,map.size.width,map.size.height);ctx.save();ctx.beginPath();ctx.rect(-map.size.width/2,-map.size.height/2,map.size.width,map.size.height);ctx.clip();renderer.draw(ctx,map,state.images,state.drag&&state.drag.stroke&&!state.drag.maskId?{target:state.drag.target}:null);const objects=decorationOrder(map).filter(v=>!v.ground);if(placementSnapshot())drawStageArtwork(map,objects);else renderer.drawObjects(ctx,map,state.images,objects);if(!stageMode)for(const id of state.selection.slice(0,30))drawSelection(map,id);if(state.showBlockers){ctx.fillStyle='#db575750';ctx.strokeStyle='#f07b7b';ctx.lineWidth=1/state.zoom;for(const shape of renderer.blockers(map)){ctx.beginPath();for(const ring of shape.rings){ring.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.closePath();}ctx.fill('evenodd');ctx.stroke();}}
 if(stageMode){drawStage();drawBuildingGhost();}else if(placementSnapshot())drawMapPlacementFootprints();ctx.restore();ctx.strokeStyle='#a5a5a5';ctx.lineWidth=1/state.zoom;ctx.strokeRect(-map.size.width/2,-map.size.height/2,map.size.width,map.size.height);ctx.setLineDash([5/state.zoom,5/state.zoom]);ctx.strokeStyle='#68b083';ctx.strokeRect(-map.playable.width/2,-map.playable.height/2,map.playable.width,map.playable.height);ctx.setLineDash([]);if(state.drag&&state.drag.box){const a=state.drag.start,b=state.drag.current;ctx.fillStyle='#8bbde52a';ctx.strokeStyle='#8bbde5';ctx.lineWidth=1/state.zoom;ctx.fillRect(a.x,a.y,b.x-a.x,b.y-a.y);ctx.strokeRect(a.x,a.y,b.x-a.x,b.y-a.y);}if(!stageMode){const g=state.drag&&state.drag.gizmo;Gizmos.draw(ctx,g?g.geometry:gizmoGeometry(),state.zoom,g);drawBrush();drawGroupGhost();drawPolygon();}});}
 function drawSelection(map,id){const found=editablePlacement(map,id);if(!found)return;const o=found.object,l=found.layer,asset=state.catalog.library.find(a=>a.id===o.assetId);if(asset){const a=asset.anchor||{x:.5,y:0},points=[[-a.x*asset.width,-a.y*asset.height],[(1-a.x)*asset.width,-a.y*asset.height],[(1-a.x)*asset.width,(1-a.y)*asset.height],[-a.x*asset.width,(1-a.y)*asset.height]].map(p=>M.toWorld(l.transform,M.toWorld(o,{x:o.flipX?-p[0]:p[0],y:p[1]})));ctx.strokeStyle='#8dccff';ctx.lineWidth=1/state.zoom;ctx.setLineDash([4/state.zoom,3/state.zoom]);polygon(points);ctx.stroke();ctx.setLineDash([]);}const foot=o.ground||{x:0,y:0};circle(M.toWorld(l.transform,M.toWorld(o,{x:o.flipX?-foot.x:foot.x,y:foot.y})),'#ffc85e',o.name);}
 function brushTool(){return ['paint','erase','image-erase','image-restore','block','unblock'].includes(state.tool);}
 function drawBrush(){if(stageMode||!state.brushCursor||!brushTool()||state.tab!=='Blockers'&&!activeLayer(values(),state.tab==='Ground'))return;const road=state.tab==='Ground'&&state.tool==='paint'&&state.paintMode==='road'&&!!pairedRoad(),p=state.brushCursor,r=state.size/2;ctx.save();ctx.translate(p.x,p.y);let angle=0;if(state.tool==='paint'||state.tool==='erase'&&state.eraseTarget==='layer')angle=(M.groundLayer(values(),state.ground).transform||{}).angle||0;else if(['image-erase','image-restore'].includes(state.tool)||state.eraseTarget==='image'){const f=editableImage(values(),state.selection[0]);if(f)angle=(f.layer.transform&&f.layer.transform.angle||0)+(f.object.angle||0);}ctx.rotate(angle*Math.PI/180);ctx.lineWidth=1/state.zoom;ctx.strokeStyle='#ffffff';ctx.shadowColor='#000';ctx.shadowBlur=2;const shape=radius=>{ctx.beginPath();if(!road&&state.shape==='square')ctx.rect(-radius,-radius,radius*2,radius*2);else ctx.arc(0,0,radius,0,Math.PI*2);ctx.stroke();};shape(r);if(!road&&!['block','unblock'].includes(state.tool)&&state.hardness>0&&state.hardness<1){ctx.setLineDash([3/state.zoom,3/state.zoom]);ctx.globalAlpha=.7;shape(r*state.hardness);}ctx.restore();}
 function gizmoGeometry(){return !stageMode&&state.tool==='select'?Gizmos.geometry(Selection.soloMap(values(),state.solo),state.selection,assetTable(),state.zoom):null;}
 function refreshTransformFields(){const chosen=selectedObject(),layer=state.layerSelection&&activeLayer(values(),state.tab==='Ground'),object=layer?layer.transform||{x:0,y:0,scale:1,angle:0}:chosen&&chosen.object;if(!object)return;for(const label of right.querySelectorAll('label')){const text=label.querySelector('span'),input=label.querySelector('input');if(!text||!input)continue;const key=layer?{'Layer scale':'scale','Layer angle':'angle','Layer x':'x','Layer y':'y'}[text.textContent]:{'Image scale':'scale',angle:'angle',x:'x',y:'y'}[text.textContent];if(key&&document.activeElement!==input)input.value=object[key];}}
 function polygon(points){ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.closePath();}
 function drawStageArtwork(map,objects){
  const parts=visibleBuildings().flatMap(b=>buildingRenderer.parts(b,stageRecord(b)));
  for(const part of parts.filter(p=>p.ground))buildingRenderer.draw(ctx,part,state.images,buildingRuntime());
  for(const object of objects.filter(part=>part.o.buildingOverlap!=='front'))Paint.object(ctx,object.o,object.layer,state.images);
  const ordered=parts.filter(p=>!p.ground);
  for(const offer of placementStage().specials||[])if(offer.enabled!==false)ordered.push({y:offer.y,offer});
  for(const part of ordered.sort((a,b)=>b.y-a.y)){
   if(part.offer){const b=part.offer;ctx.save();Paint.apply(ctx,Paint.matrix(b));Paint.sprites(ctx,b.sprites||[],state.images,b.origin||b);ctx.restore();}
   else buildingRenderer.draw(ctx,part,state.images,buildingRuntime());
  }
  for(const object of objects.filter(part=>part.o.buildingOverlap==='front'))Paint.object(ctx,object.o,object.layer,state.images);
 }
 function drawMapPlacementFootprints(){
  if(!state.placementFootprints)return;
  ctx.strokeStyle='#ffe18acc';ctx.fillStyle='#ffe18a16';ctx.lineWidth=1.5/state.zoom;ctx.setLineDash([5/state.zoom,3/state.zoom]);
  for(const building of visibleBuildings()){const record=stageRecord(building);if(record&&record.step&&record.step.length){polygon(record.step.map(point=>M.toWorld(building,point)));ctx.fill();ctx.stroke();}}
  ctx.setLineDash([]);
 }
 function drawGateFacing(building){
  const faces={NE:{x:1,y:Math.tan(Math.PI/6)},NW:{x:-1,y:Math.tan(Math.PI/6)},SE:{x:1,y:-Math.tan(Math.PI/6)},SW:{x:-1,y:-Math.tan(Math.PI/6)}},n=building.kind===6&&faces[building.wallFacing];if(!n)return;
  const start=M.toWorld(building,{x:0,y:0}),end=M.toWorld(building,{x:n.x*100,y:n.y*100}),dx=end.x-start.x,dy=end.y-start.y,length=Math.hypot(dx,dy),size=8/state.zoom,ux=dx/length,uy=dy/length;
  ctx.save();ctx.strokeStyle='#66e1eb';ctx.lineWidth=2/state.zoom;ctx.setLineDash([]);ctx.beginPath();ctx.moveTo(start.x,start.y);ctx.lineTo(end.x,end.y);ctx.moveTo(end.x-ux*size-uy*size*.6,end.y-uy*size+ux*size*.6);ctx.lineTo(end.x,end.y);ctx.lineTo(end.x-ux*size+uy*size*.6,end.y-uy*size-ux*size*.6);ctx.stroke();ctx.restore();
 }
 function drawBuildingGhost(){
  const ghost=ghostBuilding();if(!ghost||!ghost.record)return;const b=ghost.building,r=ghost.record,parts=buildingRenderer.parts(b,r);
  ctx.save();ctx.globalAlpha=.65;for(const part of parts.filter(p=>p.ground).concat(parts.filter(p=>!p.ground).sort((a,b)=>b.y-a.y)))buildingRenderer.draw(ctx,part,state.images,buildingRuntime());ctx.restore();
  if(state.showBlockers){ctx.fillStyle='#ff991f55';ctx.strokeStyle='#ffac3d';ctx.lineWidth=1.5/state.zoom;for(const shape of r.blockers||[]){polygon(shape.map(p=>M.toWorld(b,p)));ctx.fill();ctx.stroke();}}
  if(r.step&&r.step.length){ctx.strokeStyle='#ffe18a';ctx.lineWidth=2/state.zoom;ctx.setLineDash([4/state.zoom,3/state.zoom]);polygon(r.step.map(p=>M.toWorld(b,p)));ctx.stroke();ctx.setLineDash([]);}drawGateFacing(b);
 }
 function drawStage(){const stage=values();
  if(state.showBlockers){ctx.fillStyle='#ff991f55';ctx.strokeStyle='#ffac3d';ctx.lineWidth=1.5/state.zoom;for(const building of visibleBuildings()){const record=stageRecord(building);for(const shape of record&&record.blockers||[]){polygon(shape.map(p=>M.toWorld(building,p)));ctx.fill();ctx.stroke();}}}
  for(const building of visibleBuildings())if(state.selection.includes('building:'+building.id)){const record=stageRecord(building);ctx.strokeStyle='#ffe18a';ctx.lineWidth=2/state.zoom;ctx.setLineDash([4/state.zoom,3/state.zoom]);if(record&&record.step&&record.step.length){polygon(record.step.map(p=>M.toWorld(building,p)));ctx.stroke();}else{ctx.beginPath();ctx.arc(building.x,building.y,12/state.zoom,0,Math.PI*2);ctx.stroke();}ctx.setLineDash([]);drawGateFacing(building);}
  if(['Spawns','Paths','Waves'].includes(state.tab)){
   const selected=stage.graphs.find(graph=>graph.id===state.graph),wave=stage.config.WaveCfg[state.wave],entries=state.tab==='Waves'&&wave?WaveEditor.entries(wave,state.catalog.interval):[];
   const markers=[];for(const spawn of stage.spawns){if(state.tab==='Paths'&&selected&&!selected.spawnIds.includes(spawn.id))continue;const total=entries.filter(e=>e.spawnId===spawn.id).reduce((n,e)=>n+e.count,0);if(state.tab==='Waves'&&!total)continue;markers.push({point:spawn,color:spawn.enabled===false?'#777':spawn.id===state.spawn?'#ffd66d':'#76bfe7',label:spawn.name+(state.tab==='Waves'?' · '+total+' units':'')});}drawStageMarkers(markers);
   if(state.tab==='Spawns')circle(stage.hero,'#d6a2ed','Hero start');
   if(state.tab==='Paths'&&selected){
    const nodes=new Map(selected.nodes.map(node=>[node.id,node]));ctx.strokeStyle='#71d6df';ctx.lineWidth=2.5/state.zoom;
    for(const edge of selected.edges){ctx.strokeStyle='#71d6df';const a=nodes.get(edge.from),b=nodes.get(edge.to);if(!a||!b)continue;ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();const dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy);if(length*state.zoom>30){const x=a.x+dx*.58,y=a.y+dy*.58,ux=dx/length,uy=dy/length,size=9/state.zoom;ctx.beginPath();ctx.moveTo(x-ux*size-uy*size*.55,y-uy*size+ux*size*.55);ctx.lineTo(x,y);ctx.lineTo(x-ux*size+uy*size*.55,y-uy*size-ux*size*.55);ctx.stroke();}}
    for(const node of selected.nodes){circle(node,node.goal?'#9bd47c':'#6ed5dc',node.id===selected.entry?'Start':node.goal?'Goal':'');if(state.selection.includes('node:'+node.id)){ctx.strokeStyle='#ffda45';ctx.lineWidth=3/state.zoom;ctx.beginPath();ctx.arc(node.x,node.y,12/state.zoom,0,Math.PI*2);ctx.stroke();}}
   }
   if(state.tab==='Paths'&&state.nav){ctx.strokeStyle='#f0cf55';ctx.lineWidth=3/state.zoom;ctx.beginPath();state.nav.points.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.stroke();}
  }
 }
 function drawStageMarkers(markers){
  for(const marker of markers)circle(marker.point,marker.color,'');
  const tx=canvas.width/2+state.pan.x,ty=canvas.height/2+state.pan.y,toScreen=p=>({x:tx+p.x*state.zoom,y:ty-p.y*state.zoom}),screenMarkers=markers.map(marker=>Object.assign({},marker,{screen:toScreen(marker.point)})),used=[];
  const x0=Math.max(2,tx-state.map.size.width/2*state.zoom+2),x1=Math.min(canvas.width-2,tx+state.map.size.width/2*state.zoom-2),y0=Math.max(2,ty-state.map.size.height/2*state.zoom+2),y1=Math.min(canvas.height-2,ty+state.map.size.height/2*state.zoom-2);
  ctx.save();ctx.setTransform(1,0,0,1,0,0);ctx.font='11px Arial';ctx.lineWidth=1;
  const overlap=(a,b)=>a.x<b.x+b.w+3&&a.x+a.w+3>b.x&&a.y<b.y+b.h+3&&a.y+a.h+3>b.y;
  for(const marker of screenMarkers){const p=marker.screen;if(p.x<x0-8||p.x>x1+8||p.y<y0-8||p.y>y1+8)continue;const width=ctx.measureText(marker.label).width+10,height=18,candidates=[];
   for(const dy of [-9,13,-31,35,-53,57,-75,79])for(const side of [1,-1])candidates.push({x:Math.max(x0,Math.min(x1-width,p.x+(side===1?11:-width-11))),y:Math.max(y0,Math.min(y1-height,p.y+dy)),w:width,h:height});
   let box=candidates.find(box=>!used.some(other=>overlap(box,other))&&!screenMarkers.some(other=>overlap(box,{x:other.screen.x-6,y:other.screen.y-6,w:12,h:12})));if(!box)box=candidates.reduce((best,box)=>used.filter(other=>overlap(box,other)).length<used.filter(other=>overlap(best,other)).length?box:best,candidates[0]);used.push(box);
   ctx.strokeStyle=marker.color;ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(Math.max(box.x,Math.min(box.x+width,p.x)),Math.max(box.y,Math.min(box.y+height,p.y)));ctx.stroke();ctx.fillStyle='#202930e8';ctx.fillRect(box.x,box.y,width,height);ctx.fillStyle='#f1f5f8';ctx.fillText(marker.label,box.x+5,box.y+12);
  }
  ctx.restore();
 }

 function hit(p){
 if(stageMode)return stageHit(p);
 const map=Selection.soloMap(state.map,state.solo),assets=assetTable();
 if(state.tab==='Ground'){
  for(const layer of groundLayers(map).slice().reverse())if(layer.opacity!==0)for(const object of (layer.images||[]).slice().reverse())if(picking.hit(object,layer,p,assets,state.images))return object.id;
 }else for(const item of decorationOrder(map).slice().reverse())if(picking.hit(item.o,item.layer,p,assets,state.images))return item.o.id;
 return null;
}
 // Let Chromium finish its native focus transition before replacing form controls.
 root.addEventListener('change',()=>{if(changeTimer!==null)clearTimeout(changeTimer);changeTimer=setTimeout(()=>{changeTimer=null;if(deferredRender){deferredRender=false;render();}},0);},true);
 root.addEventListener('keydown',editorKey);root.addEventListener('keydown',e=>{if(activeDialog||state.closed||stageMode||e.defaultPrevented||e.key!=='Delete'||e.ctrlKey||e.metaKey||state.drag||state.tab==='Blockers')return;const target=e.target;if(target&&(target.closest('input,textarea,select')||target.isContentEditable))return;if(state.selection.length||state.layerSelection){e.preventDefault();remove();}});
 canvas.ondblclick=e=>{if(!stageMode&&state.tool==='polygon'&&(state.lassoPoints||[]).length>=3){e.preventDefault();finishPolygon();}};canvas.oncontextmenu=e=>e.preventDefault();canvas.onwheel=e=>{e.preventDefault();if(state.drag||activeDialog||state.loading)return;if(!stageMode&&e.shiftKey&&brushTool()){if(state.drag)return;const delta=e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?100:1),minimum=['block','unblock'].includes(state.tool)?.25:5;state.size=Math.max(minimum,Math.min(1500,Number((state.size*Math.exp(Math.max(-.5,Math.min(.5,-delta*.002)))).toFixed(2))));state.brushCursor=world(screen(e));renderRight();draw();return;}const p=screen(e),before=world(p);state.zoom=Math.max(.04,Math.min(4,state.zoom*Math.exp(-e.deltaY*.001)));state.pan.x=p.x-canvas.width/2-before.x*state.zoom;state.pan.y=p.y-canvas.height/2+before.y*state.zoom;draw();};
 canvas.onpointerdown=event=>{
 if(state.closed||state.loading||activeDialog||event.isPrimary===false||state.drag)return;
 canvas.focus({preventScroll:true});const screenPoint=screen(event),raw=world(screenPoint),point=['block','unblock','polygon'].includes(state.tool)?raw:snapped(raw);
 if(stageMode&&state.tab==='Paths'&&!event.altKey&&(event.button===2||event.button===0&&(event.ctrlKey||event.metaKey))){const target=stageHit(raw);if(target&&target.startsWith('node:')){event.preventDefault();const id=target.slice(5);(event.button===2?removePathNode(id):insertPathNode(id));return;}}
 try{canvas.setPointerCapture(event.pointerId);}catch(_){}
 if(event.altKey||event.button===1||state.tool==='pan'||event.button!==0&&!(event.button===2&&!stageMode&&state.tab==='Decoration'&&state.tool==='place')){
  state.drag={pan:true,start:screenPoint,before:clone(state.pan),pointerId:event.pointerId};return;
 }
 if(event.button===2){
  const before=clone(values()),working=clone(before);state.drag={deleteObjects:true,before,working,last:raw,pointerId:event.pointerId};sweepDelete(state.drag,raw);return;
 }
 if(!stageMode&&state.tool==='polygon'){
  if(state.lassoCommitting)return;const points=state.lassoPoints||(state.lassoPoints=[]);
  if(points.length>=3&&(event.detail>=2||Math.hypot(point.x-points[0].x,point.y-points[0].y)<=10/state.zoom)){finishPolygon();return;}
  const last=points[points.length-1];if(!last||Math.hypot(point.x-last.x,point.y-last.y)>.001)points.push(point);state.lassoHover=null;renderRight();draw();return;
 }
 if(!stageMode&&state.tool==='group'){
  if(!state.groupData)return;const key=currentKey(),id=state.groupId,scale=state.groupScale||1,angle=state.groupAngle||0;
  enqueue(async()=>{if(state.closed||currentKey()!==key)return;apply(await options.ipc('world-group-place',{key,version:state.snap.version,id,position:point,scale,angle}));});return;
 }
 if(!stageMode&&state.tool==='select'){
  const geometry=gizmoGeometry(),handle=Gizmos.hit(geometry,raw,state.zoom);if(handle){state.drag={before:clone(values()),ids:state.selection.slice(),gizmo:Gizmos.begin(geometry,handle,raw),pointerId:event.pointerId};if(state.layerSelection){const layer=activeLayer(values(),state.tab==='Ground');if(layer){state.drag.layer=layer.id;state.drag.groundLayer=state.tab==='Ground';}}draw();return;}
 }
 if(!stageMode&&state.tool==='ground-image'){
  if(!activeLayer(values(),true)){message('Add a ground layer first.',true);return;}const layer=state.ground,asset=state.catalog.library.find(a=>a.id===state.asset),scale=state.imageScale||1;
  edit(map=>{const placed=M.placeGroundImage(map,layer,asset,point);placed.object.scale=scale;Object.assign(map,placed.map);state.layerSelection=false;state.selection=[placed.object.id];});return;
 }
 if(!stageMode&&(['image-erase','image-restore'].includes(state.tool)||state.tool==='erase'&&state.eraseTarget==='image')){
  const found=editableImage(values(),state.selection[0]);if(!found){message('Select a placed image before editing its mask.',true);return;}
  try{editableSelection([found.object.id]);}catch(error){message(error.message,true);return;}
  state.drag={maskId:found.object.id,line:!!event.shiftKey,startPoint:point,pointerId:event.pointerId,stroke:{points:[point],size:state.size,shape:state.shape,hardness:state.hardness,opacity:state.opacity,op:state.tool==='image-restore'?'paint':'erase'}};draw();return;
 }
 if(!stageMode&&['paint','erase','block','unblock'].includes(state.tool)){
  const blocker=['block','unblock'].includes(state.tool);if(state.tool==='paint'&&!state.asset){message('Select an asset first.',true);return;}
  const target=blocker?M.MAP_BLOCKERS:state.ground;
  if(!blocker)try{M.assertEditable(M.groundLayer(values(),target));}catch(error){message(error.message,true);return;}
  state.drag={target,tool:state.tool,line:!!event.shiftKey,startPoint:point,pointerId:event.pointerId,stroke:{points:[point],size:state.size,shape:state.shape,hardness:state.hardness,opacity:state.opacity,assetId:state.asset,textureScale:state.textureScale,edgeTolerance:blocker?(state.brushEdgeTolerance===undefined?1:state.brushEdgeTolerance):undefined,op:['erase','unblock'].includes(state.tool)?'erase':'paint'}};
  if(!blocker&&state.tool==='paint'){
   const asset=state.catalog.library.find(a=>a.id===state.asset);if(!Terrain.groundAsset(asset)){state.drag=null;message('Choose a Field, Road or Road up texture.',true);return;}
   const pair=pairedRoad(asset);if(state.paintMode==='road'&&pair)Object.assign(state.drag.stroke,{mode:'road',assetId:pair.surface.id,edgeAssetId:pair.edge.id,edgeScale:state.edgeScale,edgeSmoothing:state.edgeSmoothing,edgeStyle:state.edgeStyle,edgeWidthMode:'fixed',edgeExterior:state.edgeExterior,shape:'round',hardness:1});
  }draw();return;
 }
 if(!stageMode&&state.tool==='place'){
  if(!activeLayer(values(),false)){message('Add an object layer first.',true);return;}const layer=state.layer,asset=state.catalog.library.find(a=>a.id===state.asset),min=state.min,max=state.max;
  edit(map=>{const placed=M.place(map,layer,asset,point,min,max);Object.assign(map,placed.map);state.layerSelection=false;state.selection=[placed.object.id];});return;
 }
 const e=event,p=point;
if(stageMode&&state.tool==='building'){const choice=buildingChoice(),asset=choice&&choice.placement;if(!asset){message('Choose a building.',true);return;}edit(s=>{if(asset.kind===1&&!asset.special&&s.buildings.some(b=>b.kind===1))throw Error('Select and move the existing main hall.');const copy=clone(asset);copy.origin={x:copy.x,y:copy.y};copy.x=p.x;copy.y=p.y;copy.enabled=true;copy.unlock=1;if(copy.special){copy.id='offer-'+s.nextSpecial++;s.specials.push(copy);state.selection=['special:'+copy.id];}else{copy.id=s.nextBuilding++;s.buildings.push(copy);state.selection=['building:'+copy.id];}});return;}
if(stageMode&&state.tool==='spawn'){edit(s=>{Object.assign(s,M.newSpawn(s,p));state.spawn=s.spawns[s.spawns.length-1].id;state.graph=s.graphs[s.graphs.length-1].id;state.selection=['spawn:'+state.spawn];});return;}
if(stageMode&&state.tool==='node'){edit(s=>{const g=s.graphs.find(g=>g.id===state.graph);if(!g)throw Error('Select a path first.');const id='node-'+Date.now();g.nodes.push({id,x:p.x,y:p.y,goal:false});state.selection=['node:'+id];});return;}
 const target=hit(point);
 if(!stageMode&&state.tool==='delete'){if(target){state.layerSelection=false;state.selection=[target];remove();}return;}
 if(stageMode&&state.tool==='connect'){if(!target||!target.startsWith('node:'))return;const node=target.slice(5);if(!state.connect){state.connect=node;message('Select the destination node.');}else{const from=state.connect;state.connect=null;edit(s=>{if(from===node)throw Error('A node cannot connect to itself.');const g=s.graphs.find(g=>g.id===state.graph);g.edges.push({id:'edge-'+Date.now(),from,to:node,weight:1});g.nodes.find(n=>n.id===from).goal=false;});}return;}
 if(!stageMode&&(state.tool==='layer'||state.tool==='select'&&state.layerSelection&&(state.selection.includes(target)||!state.selection.length))){dragLayer(point,event.pointerId);return;}
 if(target){
  state.layerSelection=false;
  if(!stageMode){const found=Selection.entry(values(),target);if(found){if(found.ground)state.ground=found.layer.id;else state.layer=found.layer.id;state.expanded[(found.ground?'g:':'o:')+found.layer.id]=true;}}
  if(event.shiftKey)state.selection=state.selection.includes(target)?state.selection.filter(id=>id!==target):state.selection.concat(target);else if(!state.selection.includes(target))state.selection=[target];
  if(!stageMode)try{editableSelection(state.selection);}catch(error){message(error.message,true);renderRight();renderLayerPane();draw();return;}
  if(target.startsWith('spawn:')){state.spawn=Number(target.slice(6));state.graph=(values().graphs.find(g=>g.spawnIds.includes(state.spawn))||{}).id;}
  state.drag={start:point,before:clone(values()),ids:state.selection.slice(),pointerId:event.pointerId};renderRight();renderLayerPane();draw();
 }else{state.layerSelection=false;if(!event.shiftKey)state.selection=[];state.drag={box:true,start:point,current:point,pointerId:event.pointerId};renderRight();draw();}
};
 canvas.onpointermove=event=>{
 if(state.closed||state.loading||activeDialog)return;
 const d=state.drag,raw=world(screen(event)),point=d&&['block','unblock'].includes(d.tool)?raw:snapped(raw);
 if(d&&event.pointerId!==undefined&&d.pointerId!==undefined&&event.pointerId!==d.pointerId)return;
 if(!d){
  if(!stageMode&&state.tool==='polygon'){state.lassoHover=raw;canvas.style.cursor='crosshair';draw();return;}
  if(stageMode&&state.tool==='building'||!stageMode&&(brushTool()||state.tool==='group')){state.brushCursor=raw;canvas.style.cursor='crosshair';draw();}
  else{state.brushCursor=null;const handle=Gizmos.hit(gizmoGeometry(),raw,state.zoom);canvas.style.cursor=handle?(handle.kind==='rotate'?'crosshair':handle.corner%2?'nesw-resize':'nwse-resize'):state.tool==='pan'?'grab':'default';}
  return;
 }
 if(d.deleteObjects){sweepDelete(d,raw);return;}
 if(d.gizmo){if(!d.working)d.working=clone(d.before);Gizmos.update(d.gizmo,raw,!!event.shiftKey);if(d.layer)transformLayer(d);else Selection.transformInto(d.working,d.before,d.ids,d.gizmo.pivot,d.gizmo.scale,d.gizmo.rotation);state.snap.value=d.working;if(!stageMode)state.map=d.working;refreshTransformFields();draw();return;}
 if(d.pan){const p=screen(event);state.pan={x:d.before.x+p.x-d.start.x,y:d.before.y+p.y-d.start.y};draw();return;}
 if(d.stroke){
  state.brushCursor=raw;if(d.line){d.stroke.points=[d.startPoint,point];draw();return;}
  const last=d.stroke.points[d.stroke.points.length-1];if(Math.hypot(point.x-last.x,point.y-last.y)>=(['block','unblock'].includes(d.tool)?Math.max(.02,Math.min(.5,d.stroke.size/64)):Math.max(1,d.stroke.size/32))){d.stroke.points.push(point);draw();}return;
 }
 if(d.box){d.current=point;draw();return;}
 const dx=point.x-d.start.x,dy=point.y-d.start.y;if(!d.working)d.working=clone(d.before);state.snap.value=d.working;if(!stageMode)state.map=d.working;
 if(d.layer){const layer=d.groundLayer?M.groundLayer(values(),d.layer):M.layerOf(values(),d.layer),original=d.groundLayer?M.groundLayer(d.before,d.layer):M.layerOf(d.before,d.layer);if(!layer.transform)layer.transform={x:0,y:0,scale:1,angle:0};layer.transform.x=(original.transform&&original.transform.x||0)+dx;layer.transform.y=(original.transform&&original.transform.y||0)+dy;}
 else if(!stageMode)for(const id of d.ids){const found=editablePlacement(d.working,id),before=editablePlacement(d.before,id);if(!found||!before)continue;const old=M.toWorld(before.layer.transform,before.object),next=M.toLocal(found.layer.transform,{x:old.x+dx,y:old.y+dy});found.object.x=next.x;found.object.y=next.y;}
 else for(const id of d.ids){const oldSelection=state.selection;state.selection=[id];const selected=selectedObject();state.selection=oldSelection;if(selected&&selected.object&&selected.kind!=='edge'){if(!d.starts)d.starts={};if(!d.starts[id])d.starts[id]={x:selected.object.x,y:selected.object.y};selected.object.x=d.starts[id].x+dx;selected.object.y=d.starts[id].y+dy;}}
 draw();
};
 canvas.onpointerup=event=>{
 const d=state.drag;if(!d)return;if(event&&event.pointerId!==undefined&&d.pointerId!==undefined&&event.pointerId!==d.pointerId)return;
 state.drag=null;
 if(d.pan){flushShared();return;}
 if(d.stroke&&d.maskId){edit(map=>maskStroke(map,d.maskId,d.stroke));flushShared();return;}
 if(d.stroke){edit(map=>Object.assign(map,M.stroke(map,d.target,d.stroke)));flushShared();return;}
 if(d.box){
  if(!stageMode){const a=d.start,b=d.current,map=Selection.soloMap(values(),state.solo),ids=new Set(state.selection);
   for(const layer of state.tab==='Ground'?groundLayers(map).map(l=>Object.assign({},l,{objects:l.images||[]})):map.layers)if(!layer.locked&&!layer.hidden&&(state.tab!=='Ground'||layer.opacity!==0))for(const object of layer.objects){if(object.opacity===0)continue;const p=M.toWorld(layer.transform,object);if(p.x>=Math.min(a.x,b.x)&&p.x<=Math.max(a.x,b.x)&&p.y>=Math.min(a.y,b.y)&&p.y<=Math.max(a.y,b.y))ids.add(object.id);}
   state.selection=Array.from(ids);
  }renderRight();renderLayerPane();draw();flushShared();return;
 }
 const value=clone(values());state.snap.value=d.before;if(!stageMode)state.map=d.before;
 if(JSON.stringify(value)!==JSON.stringify(d.before))edit(map=>Object.assign(map,value));else render();flushShared();
};canvas.onpointercancel=cancelDrag;canvas.onlostpointercapture=()=>{if(state.drag)cancelDrag();};canvas.onkeydown=event=>{
 if(state.closed||activeDialog||state.loading)return;
 if(state.drag){if(event.key==='Escape'){event.preventDefault();cancelDrag();}return;}
 if(!stageMode&&state.tool==='polygon'&&!event.ctrlKey&&!event.metaKey){
  if(event.key==='Escape'){event.preventDefault();cancelPolygon();return;}
  if(event.key==='Backspace'||event.key==='Delete'){event.preventDefault();state.lassoPoints.pop();renderRight();draw();return;}
  if(event.key==='Enter'){event.preventDefault();finishPolygon();return;}
 }
 if(!stageMode&&!event.ctrlKey&&!event.metaKey){
  const shortcuts=state.tab==='Blockers'?{h:'pan',r:'block',e:'unblock',l:'polygon'}:{v:'select',h:'pan',b:state.tab==='Ground'?'paint':'place',e:state.tab==='Ground'?'erase':'image-erase',d:'delete',p:state.tab==='Ground'?'ground-image':'place'};
  if(state.tab==='Decoration')shortcuts.t='place';const shortcut=shortcuts[event.key.toLowerCase()];
  if(shortcut){event.preventDefault();rememberRoadSettings();state.groupRequest=(state.groupRequest||0)+1;if(shortcut!=='paint')state.roadFamily=null;state.tool=shortcut;if(shortcut==='paint'&&state.tab==='Ground')configureRoad();state.autoBlockerMode=null;state.lassoPoints=[];state.lassoHover=null;if(shortcut==='erase'&&M.groundImage(values(),state.selection[0]))state.eraseTarget='image';render();return;}
 }
 if(event.key==='Delete'||event.key==='Backspace'){event.preventDefault();remove();}
 // Undo/redo is handled by the panel listener, including non-canvas focus.
 if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='d'){event.preventDefault();if(event.stopPropagation)event.stopPropagation();remove();}
};
 async function navigation(){const spawn=values().spawns.find(s=>s.id===state.spawn);if(!spawn)throw Error('Select a spawn');const result=await options.ipc('world-navigation',{key:currentKey(),spawnId:spawn.id,graphId:state.graph,radius:state.radius,hall:state.previewHall,gate:state.gate});state.nav=result;draw();message(result.message);}
 canvas.onpointerleave=()=>{state.brushCursor=null;state.lassoHover=null;draw();};
 function resize(){clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>{if(pendingFit)fit();else draw();},50);}window.addEventListener('resize',resize);const observer=typeof ResizeObserver==='function'?new ResizeObserver(resize):null;if(observer)observer.observe(view);
 (async()=>{state.catalog=await options.ipc('world-catalog');if(stageMode){state.buildings=await options.ipc('world-buildings');state.buildingPlacements=await options.ipc('world-building-placements');}await load(stageMode?'stage:A-1':'map:'+(options.mapId||state.catalog.maps[0].id));if(state.catalog.recovery)modal('Recover unsaved world drafts?',d=>note(d,'An external recovery copy exists. Recover restores interrupted saves first, then unsaved drafts. Concurrent changes stop recovery before they can be overwritten.'),()=>action('recover'),'Recover drafts');})().catch(e=>message(e.message,true));
 return {changed,focusMap:mapId=>!stageMode?load('map:'+mapId):Promise.resolve(),destroy(){if(state.closed)return;const preview=state.previewOpen||state.previewBusy;state.closed=true;loadSerial++;placementRequestSerial++;state.groupRequest=(state.groupRequest||0)+1;cancelDrag();renderer.clear();buildingRenderer.destroy();Paint.clearMasks();picking.clear();pictures.destroy();if(preview)try{Promise.resolve(options.ipc('world-preview-close',{owner:previewOwner})).catch(()=>{});}catch(_){}if(splitters)splitters.destroy();state.groupData=null;state.groupPreview=null;state.libraryShelf=null;activeDialog=null;orderCache=null;paletteUI=null;if(observer)observer.disconnect();window.removeEventListener('resize',resize);clearTimeout(resizeTimer);clearTimeout(changeTimer);if(frame!==null)cancelAnimationFrame(frame);root.remove();},_state:state,_renderer:renderer,_buildingRenderer:buildingRenderer};
}
module.exports={mount};
// Tool controls are intentionally contextual; navigation never exposes paint settings.
