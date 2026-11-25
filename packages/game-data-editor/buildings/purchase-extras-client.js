'use strict';
const Maps=require('../lib/map-assets'),Offset=require('../../../assets/_script/BuildingModelOffset');
const clone=x=>JSON.parse(JSON.stringify(x)),same=(a,b)=>a&&b&&a.x===b.x&&a.y===b.y;
function mount(parent,api,view){
 const state=api.state||{},make=(tag,text,where=parent)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;where.appendChild(e);return e;};
 let data,model=Offset.value(api.row),original=clone(model),modelBase=clone(model),drag=null,closed=false,busy=false,refs={},referenceImages={},serial=0,spawn=null,adUnit=null,showAds=state.showAds!==false,showSpawns=!!state.showSpawns,showCard=!!state.showUnbuiltPad,card=null,cardBase=null;
 const referenceTiers=new Set(state.referenceTiers||[]),selection=new Set(state.selection||[]),modelInputs={};
 make('small','Click any building, pad, card or marker to drag it. Ctrl-click adds or removes items; Shift-drag selects items inside a rectangle. Ctrl+Shift-drag adds a rectangle. Drag any selected item to move the selection.');
 const selectionLabel=make('small','No items selected');selectionLabel.setAttribute('aria-live','polite');
 for(const axis of ['x','y']){const label=make('label','Building '+axis.toUpperCase()+' offset'),input=make('input',undefined,label);input.type='number';input.step='any';input.min='-10000';input.max='10000';input.setAttribute('aria-label','Building '+axis.toUpperCase()+' offset');input.value=model[axis];modelInputs[axis]=input;input.onchange=()=>{if(busy||!data){sync();return;}const next=Object.assign({},model,{[axis]:input.value.trim()?Number(input.value):NaN});if(!Offset.valid(next)){sync();view.message('Enter a building offset between -10,000 and 10,000.',true);return;}model=next;view.draw();commitModel();};}
 const allLabel=make('label');allLabel.className='bld-pad-check';const allToggle=make('input',undefined,allLabel);allToggle.type='checkbox';allToggle.checked=!!state.applyAllTiers;allToggle.setAttribute('aria-label','Apply drag to all tiers');make('span','Apply to all tiers',allLabel);allToggle.onchange=()=>{state.applyAllTiers=allToggle.checked;};
 const cardLabel=make('label');cardLabel.className='bld-pad-check';const cardToggle=make('input',undefined,cardLabel);cardToggle.type='checkbox';cardToggle.checked=showCard;cardToggle.setAttribute('aria-label','Show unbuilt name card');make('span','Show unbuilt name card',cardLabel);cardToggle.onchange=()=>{cancel();showCard=state.showUnbuiltPad=cardToggle.checked;if(showCard){selection.clear();selection.add('card');view.fit();}else selection.delete('card');syncSelection();view.draw();};
 make('small','The name card stays visible when changing buildings. Selecting it fades the building to 50%; the card stays fully visible. Its position is shared by this building type.');
 for(const [text,onlyCurrent]of [['Set all to tier 1 position',false],['Refresh to tier 1',true]]){const button=make('button',text);button.type='button';button.onclick=async()=>{if(busy||!data)return;cancel();busy=true;button.disabled=true;try{await api.onAlign({onlyCurrent});if(!closed)await view.reload();}catch(e){if(!closed)view.message(e.message,true);}finally{busy=false;if(!closed)button.disabled=false;}};}
 make('small','Tier-one alignment includes the building, ground pad, squad spawn and AD marker. The name card is already shared. Ground pads keep following tier one until moved manually.');
 const tiers=make('div');tiers.className='bld-pad-reference-tiers';make('strong','Reference tiers - 50% opacity',tiers);
 const spawnLabel=make('label');spawnLabel.className='bld-pad-check';const spawnToggle=make('input',undefined,spawnLabel);spawnToggle.type='checkbox';spawnToggle.setAttribute('aria-label','Show squad spawn point');spawnToggle.checked=showSpawns;make('span','Show squad spawn point',spawnLabel);
 const spawnHelp=make('small','Set one spawn origin for the squad. When it is inside the barracks, troops appear on the side facing their destination. Moving this point replaces individual spawn slots.');spawnToggle.onchange=()=>{cancel();showSpawns=state.showSpawns=spawnToggle.checked;if(!showSpawns)selection.delete('spawn');syncSelection();view.draw();};
 const adLabel=make('label');adLabel.className='bld-pad-check';const adToggle=make('input',undefined,adLabel);adToggle.type='checkbox';adToggle.checked=showAds;adToggle.setAttribute('aria-label','Show ad unit');make('span','Show ad unit',adLabel);adToggle.onchange=()=>{cancel();showAds=state.showAds=adToggle.checked;if(!showAds)selection.delete('ad');syncSelection();view.draw();};
 function sync(){for(const k of ['x','y'])modelInputs[k].value=String(model[k]);}
 function syncSelection(){state.selection=Array.from(selection);selectionLabel.textContent=selection.size?selection.size+' selected - drag any selected item':'No items selected';}
 // Geometry stays based on the prepared record; draft acknowledgements must
 // not reset the displacement or cause a preview reload.
 function delta(){return Offset.vector(data.modelMatrix,{x:model.x-modelBase.x,y:model.y-modelBase.y});}
 function record(source){return data?Offset.record(source,delta()):source;}
 function compose(d){const source=d.records[d.settings.southwest?'southwest':'southeast'],v=Maps.point(d.offsetMatrix,d.settings);return Object.assign({},source,{sprites:source.sprites.map((s,i)=>{if(!source.purchaseField.sprites[i])return s;const m=s.matrix.slice();m[4]+=v.x;m[5]+=v.y;return Object.assign({},s,{matrix:m});})});}
 async function references(){
  const generation=++serial,next={},images={};await Promise.all((data.tiers||[]).filter(t=>referenceTiers.has(t.index)&&t.position!==api.request.levelIndex).map(async t=>{const d=await api.ipc('building-purchase-preview',Object.assign({},api.request,{levelIndex:t.position,expectedIndex:undefined,variant:data.variant}));next[t.index]=compose(d);Object.assign(images,d.images);}));
  if(closed||generation!==serial)return;refs=next;referenceImages=images;await view.prepare(Object.values(refs),referenceImages);if(!closed)view.draw();
 }
 async function setData(result){
  data=result;model=clone(result.modelOffset||{x:0,y:0});original=clone(model);modelBase=clone(model);spawn=result.spawnAnchor&&clone(result.spawnAnchor);card=result.unbuiltPad&&clone(result.unbuiltPad.position);cardBase=card&&clone(card);cardLabel.hidden=!card;adUnit=result.adUnit&&clone(result.adUnit);adLabel.hidden=!adUnit;sync();tiers.textContent='';make('strong','Reference tiers - 50% opacity',tiers);
  if(!card)selection.delete('card');if(!showSpawns||!spawn)selection.delete('spawn');if(!showAds||!adUnit)selection.delete('ad');syncSelection();
  for(const t of result.tiers||[]){const label=make('label',undefined,tiers);label.className='bld-pad-check';const input=make('input',undefined,label);input.type='checkbox';input.checked=referenceTiers.has(t.index);input.disabled=t.position===api.request.levelIndex;input.setAttribute('aria-label','Show tier '+t.level+' reference'+((result.tiers||[]).filter(p=>p.level===t.level).length>1?' '+t.index:''));make('span','Show tier '+t.level+(input.disabled?' - editing':''),label);input.onchange=()=>{if(input.checked)referenceTiers.add(t.index);else referenceTiers.delete(t.index);state.referenceTiers=Array.from(referenceTiers);references().catch(e=>{if(!closed)view.message(e.message,true);});};}
  spawnLabel.hidden=spawnHelp.hidden=!spawn;await references();
 }
 function spawnPoint(p){const q=Maps.point(data.spawnMatrix,p),v=delta();return{x:q.x+v.x,y:q.y+v.y};}
 function markers(){return (showSpawns&&spawn?[{id:'spawn',label:'S',point:spawn}]:[]).concat(showAds&&adUnit?[{id:'ad',label:'AD',point:adUnit}]:[]);}
 function cardRecord(){if(!data||!card)return null;const v=Maps.point(data.unbuiltPad.matrix,{x:card.x-cardBase.x,y:card.y-cardBase.y});return Offset.record(data.unbuiltPad.record,v);}
 function objects(){
  if(!data)return[];const r=view.record(),flags=r.purchaseField.sprites,body={origin:r.origin,sprites:r.sprites.filter((_s,i)=>!flags[i]),skeletons:r.skeletons},pad={origin:r.origin,sprites:r.sprites.filter((_s,i)=>flags[i]),skeletons:[]},result=[];
  if(showCard&&card){const record=cardRecord();result.push({id:'card',record,bounds:view.bounds(record)});}
  for(const m of markers()){const p=spawnPoint(m.point),radius=13/view.scale();result.push(Object.assign({},m,{bounds:{minX:p.x-radius,maxX:p.x+radius,minY:p.y-radius,maxY:p.y+radius},center:p}));}
  result.push({id:'building',record:body,bounds:view.bounds(body)},{id:'pad',record:pad,bounds:view.bounds(pad)});return result.filter(o=>o.bounds);
 }
 function pick(p){return objects().find(o=>o.center?Math.hypot(p.x-o.center.x,p.y-o.center.y)*view.scale()<=13:view.hit(o.record,p));}
 function snapshot(){return{model:clone(model),card:card&&clone(card),spawn:spawn&&clone(spawn),ad:adUnit&&clone(adUnit),pad:clone(view.pad())};}
 function restore(s){model=clone(s.model);card=s.card&&clone(s.card);spawn=s.spawn&&clone(s.spawn);adUnit=s.ad&&clone(s.ad);view.setPad(clone(s.pad));sync();view.draw();}
 function down(e,p){
  if(closed||busy||!data||e.button!==0)return false;const multi=e.ctrlKey||e.metaKey;
  if(e.shiftKey){e.preventDefault();drag={id:e.pointerId,marquee:true,start:p,end:p,previous:Array.from(selection),additive:multi};if(!multi)selection.clear();view.capture(e.pointerId);syncSelection();view.draw();return true;}
  const object=pick(p);if(!object){if(!multi){selection.clear();syncSelection();view.draw();}return false;}
  e.preventDefault();const toggleOff=multi&&selection.has(object.id);if(!multi&&!selection.has(object.id))selection.clear();selection.add(object.id);syncSelection();
  drag={id:e.pointerId,start:p,before:snapshot(),toggleOff:toggleOff&&object.id};view.capture(e.pointerId);view.draw();return true;
 }
 function translated(before,matrix,shift){if(Math.hypot(shift.x,shift.y)<1e-9)return clone(before);const m=matrix.slice();m[4]=m[5]=0;const v=Maps.point(Maps.inverse(m),shift);return Object.assign({},before,{x:Math.round((before.x+v.x)*100)/100,y:Math.round((before.y+v.y)*100)/100});}
 function move(e,p){
  if(!drag)return false;if(e.pointerId!==drag.id)return true;
  if(drag.marquee){drag.end=p;selection.clear();if(drag.additive)drag.previous.forEach(id=>selection.add(id));const box={minX:Math.min(drag.start.x,p.x),maxX:Math.max(drag.start.x,p.x),minY:Math.min(drag.start.y,p.y),maxY:Math.max(drag.start.y,p.y)};for(const o of objects()){const b=o.center?{minX:o.center.x,maxX:o.center.x,minY:o.center.y,maxY:o.center.y}:o.bounds;if(b.minX>=box.minX&&b.maxX<=box.maxX&&b.minY>=box.minY&&b.maxY<=box.maxY)selection.add(o.id);}syncSelection();view.draw();return true;}
  const before=drag.before,factor=e.altKey?.1:1,shift={x:(p.x-drag.start.x)*factor,y:(p.y-drag.start.y)*factor},next=clone(before);
  if(selection.has('building'))next.model=translated(before.model,data.modelMatrix,shift);
  if(selection.has('pad'))next.pad=translated(before.pad,data.offsetMatrix,shift);
  if(selection.has('card'))next.card=translated(before.card,data.unbuiltPad.matrix,shift);
  // The squad area and AD marker are children of the building. Moving their
  // selected parent already moves them once; do not apply that shift twice.
  if(!selection.has('building')){if(selection.has('spawn'))next.spawn=translated(before.spawn,data.spawnMatrix,shift);if(selection.has('ad'))next.ad=translated(before.ad,data.spawnMatrix,shift);}
  if([next.model,next.card,next.spawn,next.ad,next.pad].filter(Boolean).every(Offset.valid))restore(next);return true;
 }
 function changes(before){const next={};for(const [key,value]of [['model',model],['card',card],['spawn',spawn],['ad',adUnit],['pad',view.pad()]])if(value&&!same(value,before[key]))next[key]={x:value.x,y:value.y,...(key==='pad'?{southwest:value.southwest}:{})};return next;}
 function up(e){
  if(!drag)return false;if(e&&e.pointerId!==undefined&&e.pointerId!==drag.id)return true;const old=drag;drag=null;view.release(old.id);if(old.marquee){view.draw();return true;}const edits=changes(old.before);
  if(!Object.keys(edits).length){if(old.toggleOff){selection.delete(old.toggleOff);syncSelection();view.draw();}return true;}
  busy=true;const all=allToggle.checked;Promise.resolve().then(()=>api.onPositionsCommit(edits,all)).then(()=>{if(!closed){original=clone(model);view.acknowledge(edits);view.message('Position draft updated. Save changes to apply it to gameplay.');if(all&&referenceTiers.size)references().catch(e=>{if(!closed)view.message(e.message,true);});}}).catch(e=>{if(!closed){restore(old.before);view.message(e.message,true);}}).finally(()=>{busy=false;});return true;
 }
 async function commitModel(){if(busy||same(model,original))return;busy=true;try{await api.onModelCommit(clone(model),allToggle.checked);if(!closed)original=clone(model);}catch(e){if(!closed){model=clone(original);sync();view.draw();view.message(e.message,true);}}finally{busy=false;}}
 function cancel(){if(!drag)return;const old=drag;drag=null;if(old.marquee){selection.clear();old.previous.forEach(id=>selection.add(id));syncSelection();}else restore(old.before);view.release(old.id);view.draw();}
 function drawCard(g,render){if(showCard&&card)render(cardRecord());}
 function drawReferences(g,render){g.save();g.globalAlpha=.5;for(const r of Object.values(refs))render(Object.assign({},r,{sprites:r.sprites.map(s=>Object.assign({},s,{color:Object.assign({},s.color,{a:((s.color&&s.color.a)===undefined?255:s.color.a)*.5})}))}));g.restore();}
 function drawSpawns(g){if(!data)return;const z=view.scale();for(const m of markers()){const p=spawnPoint(m.point),active=selection.has(m.id);g.save();g.translate(p.x,p.y);if(active){g.beginPath();g.arc(0,0,15/z,0,Math.PI*2);g.strokeStyle='#fff2a1';g.lineWidth=2/z;g.stroke();}g.beginPath();g.arc(0,0,11/z,0,Math.PI*2);g.fillStyle=m.id==='ad'?'#dfc5ff':active?'#ffd15c':'#bdedff';g.fill();g.strokeStyle='#203746';g.lineWidth=1.5/z;g.stroke();g.scale(1,-1);g.font='bold '+(12/z)+'px Segoe UI';g.textAlign='center';g.textBaseline='middle';g.fillStyle='#203746';g.fillText(m.label,0,0);g.restore();}}
 function drawSelection(g){
  if(!data)return;const z=view.scale();g.save();g.strokeStyle='#99eeff';g.lineWidth=1.5/z;g.setLineDash([5/z,3/z]);for(const o of objects())if(selection.has(o.id)&&!o.center){const b=o.bounds,pad=3/z;g.strokeRect(b.minX-pad,b.minY-pad,b.maxX-b.minX+2*pad,b.maxY-b.minY+2*pad);}
  if(drag&&drag.marquee){const a=drag.start,b=drag.end;g.beginPath();g.rect(a.x,a.y,b.x-a.x,b.y-a.y);g.fillStyle='#62dbff24';g.fill();g.stroke();}g.restore();
 }
 return{setData,record,down,move,up,cancel,drawReferences,drawSpawns,drawSelection,drawCard,editingCard:()=>showCard&&selection.has('card'),hit:p=>!!pick(p),isDragging:()=>!!drag,allTiers:()=>allToggle.checked,points:()=>data?markers().map(m=>spawnPoint(m.point)):[],references:()=>Object.values(refs).concat(showCard&&card?[cardRecord()]:[]),stats:()=>({model:clone(model),unbuiltPad:card&&clone(card),cardRecord:showCard&&card?cardRecord():null,showUnbuiltPad:showCard,editingCard:showCard&&selection.has('card'),selection:Array.from(selection),objects:objects().map(o=>({id:o.id,bounds:o.bounds,center:o.center})),spawnAnchor:spawn&&Object.assign({},spawn,spawnPoint(spawn)),adUnit:adUnit&&Object.assign({},adUnit,spawnPoint(adUnit)),references:Object.keys(refs)}),destroy(){cancel();closed=true;serial++;}};
}
module.exports={mount};
