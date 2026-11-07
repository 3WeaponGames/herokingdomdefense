'use strict';
function mount(root,api){
  const el=(tag,text,parent)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(parent)parent.appendChild(n);return n;};
  root.innerHTML='';root.className='projectile-tool';
  const toolbar=el('header',undefined,root);el('strong','Projectiles',toolbar);const status=el('span','Loading library…',toolbar);
  const actions=el('div',undefined,toolbar),button=(text,fn,parent)=>{const n=el('button',text,parent||actions);n.type='button';n.onclick=fn;return n;};
  const body=el('main',undefined,root),left=el('aside',undefined,body),center=el('section',undefined,body),right=el('aside',undefined,body);
  el('h2','Ranged units',left);const unitSelect=el('select',undefined,left),assignmentFields=el('div',undefined,left);
  el('h2','Projectile library',center);const search=el('input',undefined,center);search.placeholder='Search arrows, Toon effects, originals…';const count=el('small','',center),grid=el('div',undefined,center);grid.className='projectile-grid';
  const title=el('h2','Preview',right),canvas=el('canvas',undefined,right);canvas.width=512;canvas.height=320;
  const ctx=canvas.getContext('2d'),previewControls=el('div',undefined,right),description=el('p','',right),use=el('div',undefined,right);
  const notes=el('p','Silent visual preview. No gameplay scene, player saves or audio is loaded. Damage, flight paths and attack timing stay authored in the game.',right);notes.className='projectile-note';
  let snapshot=null,unit='hero',heroLevel=1,selected=null,closed=false,queue=Promise.resolve(),raf=0,paused=false,age=0,last=0,mode='library',generation=0;
  const images=new Map(),spines=new Map();
  const report=(message,error)=>{status.textContent=message;status.className=error?'error':'';};
  const apply=value=>{if(closed)return;snapshot=value;render();if(value.result)report(value.result.warning||(value.result.saved?'Saved. Reload the game preview to use these visuals.':'No changes; no files written.'),!!value.result.warning);};
  function run(name,payload){queue=queue.then(()=>api.ipc(name,typeof payload==='function'?payload():payload)).then(apply).catch(error=>report(error.message,true));return queue;}
  function change(mutator){run('change',()=>{const data=JSON.parse(JSON.stringify(snapshot.data));mutator(data);return{version:snapshot.version,data};});}
  const save=button('Save',()=>run('save',()=>({version:snapshot.version}))),discard=button('Discard drafts',()=>{if(window.confirm('Discard unsaved projectile changes?'))run('discard',()=>({version:snapshot.version}));});
  button('Reload',()=>run('load',{}));
  const control=(parent,label,node)=>{const wrap=el('label',undefined,parent);el('span',label,wrap);wrap.appendChild(node);return node;};
  button('Preview selected asset',()=>{mode='library';age=0;},previewControls);button('Preview unit mix',()=>{mode='unit';age=0;},previewControls);
  const pause=button('Pause',()=>{paused=!paused;pause.textContent=paused?'Play':'Pause';},previewControls);button('Restart',()=>age=0,previewControls);
  unitSelect.onchange=()=>{unit=unitSelect.value;age=0;renderAssignments();};
  search.oninput=renderLibrary;
  function set(field,value){const key=unit;change(data=>{const row=Object.assign({},data.assignments[key]||{});if(value===''||value===undefined)delete row[field];else row[field]=value;if(Object.keys(row).length)data.assignments[key]=row;else delete data.assignments[key];});}
  function assetSelect(field,label){
    const select=el('select');el('option',field==='flight'?(unit==='hero'?'Follow equipped Arrow item':'Original unit projectile'):'None',select).value='';
    for(const asset of snapshot.data.assets){if(field!=='flight'&&asset.kind!=='flipbook')continue;const option=el('option',asset.name+' · '+asset.category,select);option.value=asset.id;}
    select.value=(snapshot.data.assignments[unit]||{})[field]||'';select.onchange=()=>set(field,select.value);control(assignmentFields,label,select);
  }
  function renderAssignments(){
    assignmentFields.innerHTML='';const row=snapshot.data.assignments[unit]||{},who=snapshot.units.find(u=>u.key===unit);
    el('p','Flight speed: '+who.speed+' (read only)',assignmentFields);
    if(who.previewTiers){const tier=el('select');for(const value of who.previewTiers){const option=el('option','Arrow level '+value.level,tier);option.value=value.level;}tier.value=heroLevel;tier.onchange=()=>{heroLevel=Number(tier.value);mode='unit';age=0;};control(assignmentFields,'Preview equipment tier · no progress changes',tier);}
    assetSelect('flight','Flight artwork');assetSelect('launch','Launch effect');assetSelect('impact','Impact effect');
    for(const [field,label,min,max,defaultValue]of [['size','Visual size',4,512,48],['rotation','Art rotation',-360,360,0]]){const input=el('input');input.type='number';input.min=min;input.max=max;input.value=row[field]===undefined?'':row[field];input.placeholder=String(defaultValue)+' / asset default';input.onchange=()=>{if(input.value==='')set(field,undefined);else if(Number.isFinite(input.valueAsNumber)&&input.valueAsNumber>=min&&input.valueAsNumber<=max)set(field,input.valueAsNumber);else report(label+' must be between '+min+' and '+max,true);};control(assignmentFields,label,input);}
    const tint=el('input');tint.type='color';tint.value=row.tint||'#ffffff';tint.onchange=()=>set('tint',tint.value);control(assignmentFields,'Tint',tint);
    button('Reset this unit to defaults',()=>{const key=unit;change(data=>delete data.assignments[key]);},assignmentFields);
    el('p',unit==='hero'?'Default follows the selected Arrow tier in Items. An explicit flight choice here overrides that item’s projectile art.':'No override preserves the unit’s original projectile.',assignmentFields);
  }
  function image(asset){
    if(!images.has(asset.image)){const n=new Image();n.onload=()=>{if(!closed)renderLibrary();};n.onerror=()=>report('Cannot load '+asset.image,true);n.src=api.image(asset.image);images.set(asset.image,n);}return images.get(asset.image);
  }
  async function spine(asset){
    if(spines.has(asset.id))return;
    spines.set(asset.id,null);const request=generation;
    try{const description=await api.ipc('describe',{id:asset.id});if(closed||request!==generation)return;const runtime=api.runtime(description),layers=await api.renderer.createLayers(runtime,description.layers);if(closed)return;api.renderer.seek(runtime,layers,asset.animation,0,true);spines.set(asset.id,{runtime,layers,bounds:api.renderer.bounds(runtime,layers)});}catch(error){if(!closed)report(error.message,true);}
  }
  function pick(id){selected=id;age=0;mode='library';renderLibrary();renderSelected();}
  function renderLibrary(){
    if(!snapshot)return;grid.innerHTML='';const query=search.value.trim().toLowerCase(),assets=snapshot.data.assets.filter(a=>(a.name+' '+a.category).toLowerCase().includes(query));count.textContent=assets.length+' / '+snapshot.data.assets.length+' assets';
    assets.forEach(asset=>{const b=button('',()=>pick(asset.id),grid);b.className=asset.id===selected?'selected':'';b.title=asset.category;b.dataset.asset=asset.id;
      if(asset.kind!=='spine'){const preview=el('canvas',undefined,b);preview.width=96;preview.height=64;const source=image(asset);if(source.complete&&source.naturalWidth){const context=preview.getContext('2d');if(asset.kind==='flipbook'){const frame=Math.min(5,asset.frames-1);context.drawImage(source,frame%asset.columns*asset.cell,Math.floor(frame/asset.columns)*asset.cell,asset.cell,asset.cell,16,0,64,64);}else{const scale=Math.min(88/source.width,56/source.height),w=source.width*scale,h=source.height*scale;context.drawImage(source,(96-w)/2,(64-h)/2,w,h);}}}
      else el('span','✦ Animated',b);
      el('strong',asset.name,b);el('small',asset.category,b);
    });
  }
  function renderSelected(){
    const asset=snapshot.data.assets.find(a=>a.id===selected);use.innerHTML='';if(!asset)return;
    title.textContent=asset.name;description.textContent=asset.kind==='flipbook'?'Animated 2D effect · '+asset.frames+' frames at '+asset.fps+' fps':asset.kind==='spine'?'Original animated game projectile':'Imported sprite · also available in Items';
    button('Use as flight',()=>set('flight',asset.id),use);if(asset.kind==='flipbook'){button('Use at launch',()=>set('launch',asset.id),use);button('Use at impact',()=>set('impact',asset.id),use);}if(asset.kind==='spine')spine(asset);
  }
  function render(){
    save.disabled=!snapshot.dirty;discard.disabled=!snapshot.dirty;report(snapshot.dirty?'Unsaved visual drafts':'Current data · browsing makes no changes');
    if(!snapshot.units.some(who=>who.key===unit))unit=snapshot.units[0].key;
    unitSelect.innerHTML='';for(const who of snapshot.units){const option=el('option',who.name,unitSelect);option.value=who.key;}unitSelect.value=unit;
    if(!selected)selected=(snapshot.data.assets.find(a=>a.category==='Imported arrows')||snapshot.data.assets[0]).id;
    renderAssignments();renderLibrary();renderSelected();
  }
  const off=document.createElement('canvas');off.width=256;off.height=256;const offContext=off.getContext('2d');
  function draw(asset,x,y,time,options,loop){
    if(!asset)return;const size=(options.size||asset.size||48)*2,rotation=((options.rotation||0)+(asset.rotation||0))*Math.PI/180;
    offContext.clearRect(0,0,256,256);
    if(asset.kind==='spine'){const entry=spines.get(asset.id);if(!entry){spine(asset);return;}api.renderer.seek(entry.runtime,entry.layers,asset.animation,time,true);api.renderer.draw(entry.runtime,offContext,entry.layers,{width:256,height:256,bounds:entry.bounds});}
    else {const source=image(asset);if(!source.complete||!source.naturalWidth)return;if(asset.kind==='flipbook'){const frame=loop?Math.floor(time*asset.fps)%asset.frames:Math.min(asset.frames-1,Math.floor(time*asset.fps));offContext.drawImage(source,frame%asset.columns*asset.cell,Math.floor(frame/asset.columns)*asset.cell,asset.cell,asset.cell,0,0,256,256);}else {const scale=256/Math.max(source.width,source.height),w=source.width*scale,h=source.height*scale;offContext.drawImage(source,(256-w)/2,(256-h)/2,w,h);}}
    if(options.tint&&options.tint!=='#ffffff'){offContext.globalCompositeOperation='source-atop';offContext.fillStyle=options.tint;offContext.globalAlpha=.4;offContext.fillRect(0,0,256,256);offContext.globalAlpha=1;offContext.globalCompositeOperation='source-over';}
    ctx.save();ctx.translate(x,y);ctx.rotate(asset.kind==='spine'?(options.rotation||0)*Math.PI/180:rotation);ctx.drawImage(off,-size/2,-size/2,size,size);ctx.restore();
  }
  function tick(now){
    if(closed)return;const dt=last?Math.min((now-last)/1000,.1):0;last=now;if(!paused)age+=dt;
    ctx.fillStyle='#17212d';ctx.fillRect(0,0,512,320);ctx.strokeStyle='#344150';ctx.beginPath();ctx.moveTo(36,160);ctx.lineTo(476,160);ctx.stroke();
    if(snapshot){const byId=id=>snapshot.data.assets.find(a=>a.id===id),asset=byId(selected),row=snapshot.data.assignments[unit]||{};
      if(mode==='library')draw(asset,256,160,age,{},asset&&asset.role==='flight');
      else {const who=snapshot.units.find(w=>w.key===unit),tier=who.previewTiers&&who.previewTiers.find(t=>t.level===heroLevel),time=age%2,options=Object.assign({},tier&&tier.tint?{tint:tier.tint}:{},row),flight=byId(row.flight||tier&&tier.flight||who.defaultFlight);if(time<.5)draw(byId(row.launch),64,160,time,options,false);if(time<1.2){if(flight)draw(flight,64+time/1.2*384,160,time,options,true);}else draw(byId(row.impact),448,160,time-1.2,options,false);}
    }
    raf=requestAnimationFrame(tick);
  }
  run('load',{});raf=requestAnimationFrame(tick);
  return {destroy(){closed=true;generation++;cancelAnimationFrame(raf);root.innerHTML='';images.clear();spines.clear();}};
}
module.exports={mount};
