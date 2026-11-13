'use strict';
const Maps=require('../lib/map-assets'),Offset=require('../../../assets/_script/BuildingModelOffset');
const clone=x=>JSON.parse(JSON.stringify(x));
function mount(parent,api,view){
 const state=api.state||{},make=(tag,text,where=parent)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;where.appendChild(e);return e;};
 let data,model=Offset.value(api.row),original=clone(model),drag=null,closed=false,busy=false,refs={},referenceImages={},serial=0,spawns=[],showSpawns=!!state.showSpawns,selected=new Set(state.referenceTiers||[]);
 const label=make('label','Drag in preview'),target=make('select',undefined,label);target.setAttribute('aria-label','Ground preview drag target');for(const [id,text]of [['pad','Ground pad'],['building','Building']]){const o=make('option',text,target);o.value=id;}target.value=state.dragTarget||'pad';target.onchange=()=>{cancel();state.dragTarget=target.value;};
 const modelInputs={};for(const axis of ['x','y']){const label=make('label','Building '+axis.toUpperCase()+' offset'),input=make('input',undefined,label);input.type='number';input.step='any';input.min='-10000';input.max='10000';input.setAttribute('aria-label','Building '+axis.toUpperCase()+' offset');input.value=model[axis];modelInputs[axis]=input;input.onchange=()=>{if(busy||!data){sync();return;}const next=Object.assign({},model,{[axis]:input.value.trim()?Number(input.value):NaN});if(!Offset.valid(next)){sync();view.message('Enter a building offset between −10,000 and 10,000.',true);return;}model=next;view.draw();commitModel();};}
 const align=make('button','Set all to tier 1 position');align.type='button';align.onclick=async()=>{if(busy||!data)return;busy=true;align.disabled=true;try{const result=await api.ipc('building-purchase-align-tier-one',api.request);if(!closed)await api.onAlign(result);}catch(e){if(!closed)view.message(e.message,true);}finally{busy=false;if(!closed)align.disabled=false;}};
 const refresh=make('button','Refresh to tier 1');refresh.type='button';refresh.onclick=async()=>{if(busy||!data)return;busy=true;refresh.disabled=true;try{const result=await api.ipc('building-purchase-align-tier-one',Object.assign({},api.request,{onlyCurrent:true}));if(!closed)await api.onAlign(result);}catch(e){if(!closed)view.message(e.message,true);}finally{busy=false;if(!closed)refresh.disabled=false;}};
 make('small','Refresh links this pad to tier 1. It keeps following tier 1 until you move this pad manually.');
 const tiers=make('div');tiers.className='bld-pad-reference-tiers';make('strong','Reference tiers · 50% opacity',tiers);
 const spawnLabel=make('label');spawnLabel.className='bld-pad-check';const spawnToggle=make('input',undefined,spawnLabel);spawnToggle.type='checkbox';spawnToggle.setAttribute('aria-label','Show unit spawns');spawnToggle.checked=showSpawns;make('span','Show unit spawns',spawnLabel);
 const spawnHelp=make('small','Drag numbered spawn markers individually. Unedited units keep their random formation. Edited units use preferred positions and still avoid obstacles.');spawnToggle.onchange=()=>{cancel();showSpawns=state.showSpawns=spawnToggle.checked;view.draw();};
 function sync(){for(const k of ['x','y'])modelInputs[k].value=String(model[k]);}
 function delta(){return Offset.vector(data.modelMatrix,{x:model.x-original.x,y:model.y-original.y});}
 function record(source){return data?Offset.record(source,delta()):source;}
 function compose(d){const source=d.records[d.settings.southwest?'southwest':'southeast'],v=Maps.point(d.offsetMatrix,d.settings);return Object.assign({},source,{sprites:source.sprites.map((s,i)=>{if(!source.purchaseField.sprites[i])return s;const m=s.matrix.slice();m[4]+=v.x;m[5]+=v.y;return Object.assign({},s,{matrix:m});})});}
 async function references(){
  const generation=++serial,next={},images={};await Promise.all((data.tiers||[]).filter(t=>selected.has(t.index)&&t.position!==api.request.levelIndex).map(async t=>{const d=await api.ipc('building-purchase-preview',Object.assign({},api.request,{levelIndex:t.position,variant:data.variant}));next[t.index]=compose(d);Object.assign(images,d.images);}));
  if(closed||generation!==serial)return;refs=next;referenceImages=images;await view.prepare(Object.values(refs),referenceImages);if(!closed){view.fit();view.draw();}
 }
 async function setData(result){
  data=result;model=clone(result.modelOffset||{x:0,y:0});original=clone(model);spawns=clone(result.spawns||[]);sync();tiers.textContent='';make('strong','Reference tiers · 50% opacity',tiers);
  for(const t of result.tiers||[]){const label=make('label',undefined,tiers);label.className='bld-pad-check';const input=make('input',undefined,label);input.type='checkbox';input.checked=selected.has(t.index);input.disabled=t.position===api.request.levelIndex;input.setAttribute('aria-label','Show tier '+t.level+' reference'+((result.tiers||[]).filter(p=>p.level===t.level).length>1?' '+t.index:''));make('span','Show tier '+t.level+(input.disabled?' · editing':''),label);input.onchange=()=>{if(input.checked)selected.add(t.index);else selected.delete(t.index);state.referenceTiers=Array.from(selected);references().catch(e=>{if(!closed)view.message(e.message,true);});};}
  spawnLabel.hidden=spawnHelp.hidden=!spawns.length;await references();
 }
 function spawnPoint(p){const q=Maps.point(data.spawnMatrix,p),v=delta();return{x:q.x+v.x,y:q.y+v.y};}
 function hit(p){if(!showSpawns)return null;const candidates=spawns.map(s=>{const q=spawnPoint(s);return{s,d:Math.hypot(p.x-q.x,p.y-q.y)*view.scale()};}).filter(p=>p.d<=13).sort((a,b)=>a.d-b.d);return candidates.length?candidates[0].s:null;}
 function down(e,p){
  if(closed||busy||!data||e.button!==0)return false;const spawn=hit(p),body=Object.assign({},view.record(),{sprites:view.record().sprites.filter((_s,i)=>!view.record().purchaseField.sprites[i])});
  if(!spawn&&(target.value!=='building'||!view.hit(body,p)))return false;
  e.preventDefault();drag={id:e.pointerId,start:p,before:clone(spawn||model),spawn};view.capture(e.pointerId);return true;
 }
 function move(e,p){
  if(!drag)return false;if(e.pointerId!==drag.id)return true;const matrix=drag.spawn?data.spawnMatrix:data.modelMatrix,v=Maps.point(Maps.inverse([matrix[0],matrix[1],matrix[2],matrix[3],0,0]),{x:p.x-drag.start.x,y:p.y-drag.start.y}),factor=e.altKey?.1:e.shiftKey?10:1,next={x:Math.round((drag.before.x+v.x*factor)*100)/100,y:Math.round((drag.before.y+v.y*factor)*100)/100};
  if(Offset.valid(next)){if(drag.spawn)Object.assign(drag.spawn,next);else model=next;sync();view.draw();}return true;
 }
 async function commitModel(){if(busy||model.x===original.x&&model.y===original.y)return;busy=true;try{await api.onModelCommit(clone(model));if(!closed)original=clone(model);}catch(e){if(!closed){model=clone(original);sync();view.draw();view.message(e.message,true);}}finally{busy=false;}}
 function up(){if(!drag)return false;const old=drag;drag=null;view.release(old.id);if(old.before.x=== (old.spawn?old.spawn:model).x&&old.before.y===(old.spawn?old.spawn:model).y)return true;if(old.spawn){busy=true;Promise.resolve(api.onSpawnsCommit({[old.spawn.slot]:{x:old.spawn.x,y:old.spawn.y}})).catch(e=>{if(!closed){Object.assign(old.spawn,old.before);view.draw();view.message(e.message,true);}}).finally(()=>{busy=false;});}else commitModel();return true;}
 function cancel(){if(!drag)return;const old=drag;drag=null;if(old.spawn)Object.assign(old.spawn,old.before);else model=old.before;sync();view.release(old.id);view.draw();}
 function drawReferences(g,render){g.save();g.globalAlpha=.5;for(const r of Object.values(refs))render(Object.assign({},r,{sprites:r.sprites.map(s=>Object.assign({},s,{color:Object.assign({},s.color,{a:((s.color&&s.color.a)===undefined?255:s.color.a)*.5})}))}));g.restore();}
 function drawSpawns(g){if(!data||!showSpawns)return;const z=view.scale();for(const s of spawns){const p=spawnPoint(s);g.save();g.translate(p.x,p.y);g.beginPath();g.arc(0,0,11/z,0,Math.PI*2);g.fillStyle=s.custom?'#ffe18a':'#bdedff';g.fill();g.strokeStyle='#203746';g.lineWidth=1.5/z;g.stroke();g.scale(1,-1);g.font='bold '+(12/z)+'px Segoe UI';g.textAlign='center';g.textBaseline='middle';g.fillStyle='#203746';g.fillText(String(s.slot),0,0);g.restore();}}
 return{setData,record,down,move,up,cancel,drawReferences,drawSpawns,references:()=>Object.values(refs),stats:()=>({model:clone(model),spawns:spawns.map(s=>Object.assign({},s,spawnPoint(s))),references:Object.keys(refs)}),destroy(){cancel();closed=true;serial++;}};
}
module.exports={mount};
