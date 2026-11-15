'use strict';
// Browser-check the authoring panels without connecting to an editor scene.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..'),{Store,files}=require('../../packages/game-data-editor/lib/store');
const out=path.resolve(process.env.HKD_ARTIFACT_DIR||path.join(require('node:os').homedir(),'Documents/Codex Artifacts/HeroKingdomDefense/projectile-editor-tests'));
async function main(){
  if(out===root||out.startsWith(root+path.sep))throw Error('Keep screenshots and reports outside the project');fs.mkdirSync(out,{recursive:true});
  const protectedFiles=[...Object.values(files),'assets/resources/hero-items/catalog.json','assets/resources/projectiles/catalog.json'],hash=file=>crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex'),before=protectedFiles.map(hash);
  const store=new Store(root,{backupRoot:path.join(out,'unused-backups')}),assets=require('../../packages/game-data-editor/lib/assets').index(root);
  for(const image of assets.images)image.url='/asset/'+image.path.split('/').map(encodeURIComponent).join('/');
  const panelPath=path.join(root,'packages/game-data-editor/panel'),template=fs.readFileSync(path.join(panelPath,'panel.html'),'utf8'),css=fs.readFileSync(path.join(panelPath,'panel.css'),'utf8');
  const schema=fs.readFileSync(path.join(root,'packages/game-data-editor/lib/schema.js'),'utf8'),panel=fs.readFileSync(path.join(panelPath,'index.js'),'utf8');
  const unitRecords=fs.readFileSync(path.join(root,'packages/game-data-editor/lib/unit-records.js'),'utf8'),mapCatalog=fs.readFileSync(path.join(root,'packages/game-data-editor/lib/map-catalog.js'),'utf8');
  const iconPicker=fs.readFileSync(path.join(panelPath,'icon-picker.js'),'utf8');
  const generic=http.createServer(async(req,res)=>{try{
    const route=decodeURIComponent(new URL(req.url,'http://localhost').pathname),kind=route.slice(1);
    if(['relics','equipment','talents','perks'].includes(kind)){
      res.setHeader('Content-Type','text/html');res.end('<!doctype html><html><head><meta charset="utf-8"><style>html,body{height:100%;margin:0;background:#1b2029;color:#ddd;font:13px Arial,sans-serif}#root{height:100vh}</style><style>'+css+'</style></head><body>'+template+'<script>var __dirname="panel",module={exports:{}};'+
        'function require(name){if(name==="fs")return {readFileSync:function(file){return file.endsWith("panel.html")?'+JSON.stringify(template)+':'+JSON.stringify(css)+';}};if(name==="path")return {join:function(){return Array.prototype.join.call(arguments,"/");}};if(name==="../lib/schema")return window.schema;if(name==="../lib/unit-records"||name==="./unit-records")return window.UnitRecords;if(name==="../lib/map-catalog"||name==="./map-catalog")return window.MapCatalog;if(name==="./icon-picker")return window.IconPicker;if(name==="../buildings/client")return {style:""};throw Error("Preview dependency intentionally absent: "+name);}'+
        '(function(module,exports){'+unitRecords+'})(module,module.exports);window.UnitRecords=module.exports;module={exports:{}};'+
        '(function(module,exports){'+mapCatalog+'})(module,module.exports);window.MapCatalog=module.exports;module={exports:{}};'+
        '(function(module,exports){'+iconPicker+'})(module,module.exports);window.IconPicker=module.exports;module={exports:{}};'+
        '(function(module,exports){'+schema+'})(module,module.exports);window.schema=module.exports;module={exports:{}};'+
        'var Editor={Ipc:{sendToMain:function(channel){var args=Array.prototype.slice.call(arguments,1),cb=args.pop();fetch("/api/"+channel.split(":")[1],{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(args[0]||{})}).then(function(r){return r.json();}).then(function(result){cb(result.error||null,result);},function(e){cb(e.message);});}},Panel:{extend:function(def){var ids=def.$;def.$={};for(var key in ids){def.$[key]=document.querySelector(ids[key]);def["$"+key]=def.$[key];}window.panel=def;def.ready();return def;}}};'+
        '(function(module,exports){'+panel+'})(module,module.exports);module.exports.create('+JSON.stringify(kind)+');</script></body></html>');return;
    }
    if(route.startsWith('/api/')){const chunks=[];let bytes=0;for await(const chunk of req){bytes+=chunk.length;if(bytes>8*1024*1024)throw Error('Request too large');chunks.push(chunk);}const request=JSON.parse(Buffer.concat(chunks).toString('utf8')||'{}'),name=route.slice(5);let result;if(name==='asset-index')result=assets;else if(name==='load')result=store.snapshot();else if(['change','discard'].includes(name))result=store[name](request);else throw Error('This verification host permits drafts only');res.setHeader('Content-Type','application/json');res.end(JSON.stringify(result));return;}
    if(route.startsWith('/asset/assets/')){const file=path.resolve(root,route.slice(7));if(!file.startsWith(path.join(root,'assets')+path.sep)||!file.endsWith('.png'))throw Error('Unknown icon');res.setHeader('Content-Type','image/png');res.end(fs.readFileSync(file));return;}
    res.writeHead(404).end();
  }catch(error){res.writeHead(400,{'Content-Type':'application/json'}).end(JSON.stringify({error:error.message}));}});
  const projectiles=require('./serve-editor.cjs').createServer(root,{});
  let browser;const results=[];
  try{
    await Promise.all([generic,projectiles].map(server=>new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',()=>{server.removeListener('error',reject);resolve();});})));
    const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright-core');
    browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--mute-audio']});
    const page=await browser.newPage({viewport:{width:1560,height:960}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto('http://127.0.0.1:'+projectiles.address().port);await page.getByText('Current data · browsing makes no changes',{exact:true}).waitFor({timeout:30000});
    const projectileCatalog=JSON.parse(fs.readFileSync(path.join(root,'assets/resources/projectiles/catalog.json'),'utf8').replace(/^\uFEFF/,''));
    assert.equal(await page.locator('.projectile-grid button').count(),projectileCatalog.sets.length);
    assert.equal(await page.locator('.projectile-play-controls button').count(),4);
    await page.locator('[data-projectile="toon:projectile-5-arrow"]').click();await page.getByText('Unsaved projectile drafts',{exact:true}).waitFor();assert(!await page.getByRole('button',{name:'Save',exact:true}).isDisabled());
    await page.screenshot({path:path.join(out,'projectiles-editor.png')});results.push('Projectiles: library, animated preview and assignment drafts work without saving');
    await page.locator('[data-asset="hero-skin:lv1"]').click();await page.locator('[data-playback-mode="flight"]').click();await page.waitForFunction(()=>{const c=document.querySelector('aside:last-child>canvas'),pixels=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let count=0;for(let i=0;i<pixels.length;i+=4)if(pixels[i]>80||pixels[i+1]>80||pixels[i+2]>80)count++;return count>100;});
    results.push('Original animated hero projectile preview renders');
    const unitPicker=page.getByLabel('Ranged unit');await unitPicker.selectOption('tower:2:4');
    assert.equal(await page.getByLabel('Flight speed · units / second').count(),0);
    const delay=page.getByLabel('Launch delay · seconds',{exact:true});await delay.fill('0.7');await delay.blur();await page.getByText('Unsaved projectile drafts',{exact:true}).waitFor();
    await page.locator('[data-projectile="toon:projectile-5-arrow"]').click();
    const trailPicker=page.getByLabel('Projectile trail',{exact:true}),trailId=projectileCatalog.trails[0].id;
    if(!await page.getByLabel('Enable trail').isChecked())await page.getByLabel('Enable trail').check();await trailPicker.selectOption(trailId);await page.getByText('Trail shown during Play all.',{exact:true}).waitFor();
    await unitPicker.selectOption('hero');assert.equal(await page.locator('[data-projectile="hero-skin:lv1"]').getAttribute('aria-pressed'),'true','hero selection survives unit switches');
    await unitPicker.selectOption('tower:2:4');assert.equal(await delay.inputValue(),'0.7');assert.equal(await trailPicker.inputValue(),trailId);assert.equal(await page.locator('[data-projectile="toon:projectile-5-arrow"]').getAttribute('aria-pressed'),'true');
    let savedDraft;
    await page.route('**/api/save',async route=>{const base=new URL(route.request().url()).origin,response=await fetch(base+'/api/load',{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:'{}'});savedDraft=await response.json();await route.fulfill({json:{...savedDraft,dirty:false,result:{saved:true,files:[]}}});});
    await page.getByRole('button',{name:'Save',exact:true}).click();await page.getByText('Saved projectile, launch delay and trail. Reload the game preview to apply.',{exact:true}).waitFor();
    assert.equal(savedDraft.data.assignments.hero.set,'hero-skin:lv1');assert.equal(savedDraft.data.assignments['tower:2:4'].set,'toon:projectile-5-arrow');assert.equal(savedDraft.data.assignments['tower:2:4'].trail,trailId);assert.equal(savedDraft.timings['tower:2:4'],.7);
    assert.deepEqual(protectedFiles.map(hash),before);await page.screenshot({path:path.join(out,'projectile-assignment-editor.png')});results.push('Projectile, delay and trail drafts survive unit switches and are submitted together on Save; disk data is unchanged');await page.close();
    const projectileBase='http://127.0.0.1:'+projectiles.address().port;
    async function draftApi(method,request){const response=await fetch(projectileBase+'/api/'+method,{method:'POST',headers:{Origin:projectileBase,'Content-Type':'application/json'},body:JSON.stringify(request||{})});const value=await response.json();if(!response.ok)throw Error(value.error);return value;}
    async function freshProjectilePage(){const state=await draftApi('load');await draftApi('discard',{version:state.version});const p=await browser.newPage({viewport:{width:1560,height:960}});p.on('pageerror',error=>errors.push('Projectile draft transaction: '+error.message));await p.goto(projectileBase);await p.getByText('Current data · browsing makes no changes',{exact:true}).waitFor();return p;}
    {
      const initial=await draftApi('load');await draftApi('discard',{version:initial.version});
      const p=await browser.newPage({viewport:{width:1560,height:960}});p.on('pageerror',error=>errors.push('Projectile loading: '+error.message));
      await p.addInitScript(()=>{
        const OriginalImage=window.Image;window.__projectileImages=[];window.Image=class extends OriginalImage{constructor(...args){super(...args);window.__projectileImages.push(this);}};
        const prototype=CanvasRenderingContext2D.prototype,fillRect=prototype.fillRect,fillText=prototype.fillText;
        window.__projectileLoading=true;window.__projectileFrames=0;
        prototype.fillRect=function(x,y,w,h){if(this.canvas.getAttribute('aria-label')==='Projectile combat preview'&&x===0&&y===0&&w===720&&h===420){window.__projectileLoading=false;window.__projectileFrames++;}return fillRect.apply(this,arguments);};
        prototype.fillText=function(text){if(this.canvas.getAttribute('aria-label')==='Projectile combat preview'&&/^Loading preview units/.test(text))window.__projectileLoading=true;return fillText.apply(this,arguments);};
      });
      let releaseOldTarget,oldTargetArrived;const held=new Promise(resolve=>releaseOldTarget=resolve),arrived=new Promise(resolve=>oldTargetArrived=resolve);let targets=0;
      await p.route('**/api/describe-unit',async route=>{if(route.request().postDataJSON().key==='preview-target'&&++targets===1){oldTargetArrived();await held;}await route.continue();});
      try{
        await p.goto(projectileBase);let targetTimer;try{await Promise.race([arrived,new Promise((resolve,reject)=>{targetTimer=setTimeout(()=>reject(Error('Timed out waiting for initial preview target request')),15000);})]);}finally{clearTimeout(targetTimer);}await p.getByText('Current data · browsing makes no changes',{exact:true}).waitFor();
        await p.getByRole('button',{name:'Reload',exact:true}).click();await p.waitForFunction(()=>window.__projectileFrames>2&&!window.__projectileLoading);
        releaseOldTarget();await p.waitForLoadState('networkidle');const frame=await p.evaluate(()=>window.__projectileFrames);await p.waitForFunction(previous=>window.__projectileFrames>previous+2,frame);assert.equal(await p.evaluate(()=>window.__projectileLoading),false,'a retired target load cannot clear the fresh target after Reload');
        await p.evaluate(()=>{
          window.__libraryRebuilds=0;const grid=document.querySelector('.projectile-grid'),observer=new MutationObserver(changes=>{for(const change of changes)if(change.removedNodes.length)window.__libraryRebuilds++;});observer.observe(grid,{childList:true});
          for(const image of window.__projectileImages)if(image.complete&&image.naturalWidth&&image.onload)image.onload();
          window.__stopLibraryObserver=()=>observer.disconnect();
        });
        await p.waitForFunction(()=>window.__libraryRebuilds>0);await p.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
        assert.equal(await p.evaluate(()=>window.__libraryRebuilds),1,'simultaneous artwork completions rebuild the library once per frame');await p.evaluate(()=>window.__stopLibraryObserver());
        results.push('Reload ignores retired target loads; artwork completions batch into one library rebuild per frame');
      }finally{releaseOldTarget();await p.close();}
    }
    const draftChoices={hero:'toon:projectile-5-arrow','tower:2:4':'toon:projectile-14-ice'};
    async function prepareTransactionDrafts(p){
      for(const [index,[key,id]]of Object.entries(draftChoices).entries()){await p.getByLabel('Ranged unit',{exact:true}).selectOption(key);await p.locator('[data-projectile="'+id+'"]').click();const enabled=p.getByLabel('Enable trail',{exact:true});if(!await enabled.isChecked())await enabled.check();await p.getByLabel('Projectile trail',{exact:true}).selectOption(projectileCatalog.trails[index].id);}
      await p.getByLabel('Ranged unit',{exact:true}).selectOption('hero');
    }
    async function retainedTransactionDrafts(p){
      for(const [index,[key,id]]of Object.entries(draftChoices).entries()){await p.getByLabel('Ranged unit',{exact:true}).selectOption(key);assert.equal(await p.locator('[data-projectile="'+id+'"]').getAttribute('aria-pressed'),'true',key+' retained projectile draft');assert.equal(await p.getByLabel('Projectile trail',{exact:true}).inputValue(),projectileCatalog.trails[index].id,key+' retained trail draft');assert(!await p.getByRole('button',{name:'Save',exact:true}).isDisabled());}
    }
    async function assertTransactionLocked(p){
      for(const label of ['Ranged unit','Launch delay · seconds','Enable trail','Projectile trail'])assert(await p.getByLabel(label,{exact:true}).isDisabled(),label+' locked during IPC');
      assert(await p.getByRole('button',{name:'Save',exact:true}).isDisabled());assert(await p.locator('.projectile-grid button').evaluateAll(buttons=>buttons.every(button=>button.disabled)),'library choices locked during IPC');
      await p.locator('[data-projectile="toon:projectile-14-ice"]').evaluate(button=>button.click());assert.equal(await p.locator('[data-projectile="toon:projectile-5-arrow"]').getAttribute('aria-pressed'),'true','a disabled library click cannot replace the submitted projectile');
    }
    async function gateTransaction(p,method,failure){
      let release,arrive;const released=new Promise(resolve=>release=resolve),arrived=new Promise(resolve=>arrive=resolve);
      await p.route('**/api/'+method,async route=>{arrive();await released;if(failure)await route.fulfill({status:409,json:{error:failure}});else{const state=await draftApi('load');await route.fulfill({json:{...state,dirty:false,result:{saved:true,files:[]}}});}});
      return{release,async wait(){let timer;try{await Promise.race([arrived,new Promise((resolve,reject)=>{timer=setTimeout(()=>reject(Error('Timed out waiting for '+method+' IPC')),15000);})]);}finally{clearTimeout(timer);}}};
    }
    {
      const p=await freshProjectilePage();await prepareTransactionDrafts(p);const gate=await gateTransaction(p,'save');
      try{await p.getByRole('button',{name:'Save',exact:true}).click();await gate.wait();await assertTransactionLocked(p);}finally{gate.release();}
      await p.getByText('Saved projectile, launch delay and trail. Reload the game preview to apply.',{exact:true}).waitFor();await p.locator('[data-projectile="toon:projectile-14-ice"]').click();assert.equal(await p.locator('[data-projectile="toon:projectile-14-ice"]').getAttribute('aria-pressed'),'true');assert(!await p.getByRole('button',{name:'Save',exact:true}).isDisabled(),'new edits remain available after the completed save');await p.close();
      results.push('Delayed Save locks every assignment control until acknowledgment, then accepts new drafts');
    }
    for(const operation of [{name:'Save',method:'save'},{name:'Discard drafts',method:'discard'},{name:'Reset projectile & trail',method:'change'}]){
      const p=await freshProjectilePage();await prepareTransactionDrafts(p);const message='Injected '+operation.method+' revision conflict',gate=await gateTransaction(p,operation.method,message);if(operation.method==='discard')p.once('dialog',dialog=>dialog.accept());
      try{await p.getByRole('button',{name:operation.name,exact:true}).click();await gate.wait();await assertTransactionLocked(p);}finally{gate.release();}
      await p.getByText(message,{exact:true}).waitFor();await retainedTransactionDrafts(p);await p.close();results.push(operation.name+': rejected IPC retains every unit’s projectile and trail drafts');
    }
    async function reloadProjectilePage(p){await p.getByRole('button',{name:'Reload',exact:true}).click();await p.waitForFunction(()=>Array.from(document.querySelectorAll('header button')).find(button=>button.textContent==='Reload').disabled===false);}
    {
      const p=await freshProjectilePage(),state=await draftApi('load'),flightOnly=projectileCatalog.sets.find(set=>set.category==='Imported arrows');
      state.data.assignments.hero={flight:flightOnly.flight,launch:'toon:flash-5',impact:'toon:hit-5'};await draftApi('change',{version:state.version,data:state.data,timings:state.timings});await reloadProjectilePage(p);
      assert(!await p.locator('[data-playback-mode="launch"]').isDisabled(),'saved custom launch is playable on a flight-only library set');assert(!await p.locator('[data-playback-mode="impact"]').isDisabled(),'saved custom impact is playable on a flight-only library set');await p.locator('[data-playback-mode="launch"]').click();
      const next=await draftApi('load');next.data.assignments.hero={set:'toon:projectile-5-arrow',flight:'toon:projectile-5-arrow',launch:'',impact:''};await draftApi('change',{version:next.version,data:next.data,timings:next.timings});await reloadProjectilePage(p);
      assert(await p.locator('[data-playback-mode="launch"]').isDisabled(),'explicit empty launch suppresses paired default');assert(await p.locator('[data-playback-mode="impact"]').isDisabled(),'explicit empty impact suppresses paired default');assert.equal(await p.locator('[data-playback-mode="flight"]').getAttribute('aria-pressed'),'true','an unavailable active mode returns to flight after Reload');
      await p.route('**/api/load',async route=>{const state=await draftApi('load'),legacy={flight:'missing:legacy-flight',launch:'missing:legacy-launch',impact:'missing:legacy-impact'};state.data.assignments.hero=legacy;state.units.find(unit=>unit.key==='hero').effectiveAssignment=legacy;await route.fulfill({json:state});});await reloadProjectilePage(p);assert(await p.locator('[data-playback-mode="launch"]').isDisabled(),'missing saved launch is unavailable');assert(await p.locator('[data-playback-mode="impact"]').isDisabled(),'missing saved impact is unavailable');assert(!await p.locator('[data-playback-mode="flight"]').isDisabled(),'missing saved flight retains the unit default preview');await p.locator('[data-projectile="toon:projectile-5-arrow"]').click();await p.locator('[data-playback-mode="impact"]').click();await p.getByRole('button',{name:'Reset projectile & trail',exact:true}).click();await p.waitForFunction(()=>document.querySelector('.projectile-play-controls button:last-child').disabled===false);assert.equal(await p.locator('[data-playback-mode="flight"]').getAttribute('aria-pressed'),'true','Reset returns unavailable active impact mode to flight');assert(await p.locator('[data-playback-mode="impact"]').isDisabled());await p.close();
      results.push('Saved custom and explicitly empty effect roles control button availability; Reload replaces unavailable modes with flight');
    }
    {
      const p=await freshProjectilePage();assert(await p.getByRole('button',{name:'Save',exact:true}).isDisabled());await p.getByLabel('Launch delay · seconds',{exact:true}).fill('0.73');assert(!await p.getByRole('button',{name:'Save',exact:true}).isDisabled(),'typing a valid delay enables Save before blur');
      await p.getByLabel('Ranged unit',{exact:true}).evaluate(select=>{select.value='ally:90003';select.dispatchEvent(new Event('change'));});await p.getByLabel('Launch delay · seconds',{exact:true}).fill('0.41');let captured;
      await p.route('**/api/save',async route=>{captured=await draftApi('load');await route.fulfill({json:{...captured,dirty:false,result:{saved:true,files:[]}}});});await p.getByRole('button',{name:'Save',exact:true}).evaluate(button=>button.click());await p.getByText('Saved projectile, launch delay and trail. Reload the game preview to apply.',{exact:true}).waitFor();assert.equal(captured.timings.hero,.73);assert.equal(captured.timings['ally:90003'],.41);await p.close();
      results.push('Unblurred numeric launch-delay edits enable Save and commit every unit’s timing draft');
    }
    {
      const p=await freshProjectilePage();await p.locator('[data-projectile="toon:projectile-5-arrow"]').click();let saves=0;await p.route('**/api/save',async route=>{saves++;await route.fulfill({status:409,json:{error:'Invalid delay must not reach Save'}});});await p.getByLabel('Launch delay · seconds',{exact:true}).fill('11');assert(await p.getByRole('button',{name:'Save',exact:true}).isDisabled(),'invalid input blocks even a valid projectile draft');await p.getByRole('button',{name:'Save',exact:true}).evaluate(button=>button.click());assert.equal(saves,0);
      await p.getByLabel('Ranged unit',{exact:true}).selectOption('tower:2:4');assert(await p.getByRole('button',{name:'Save',exact:true}).isDisabled(),'invalid timing on another unit still blocks Save');await p.getByLabel('Ranged unit',{exact:true}).selectOption('hero');assert.equal(await p.getByLabel('Launch delay · seconds',{exact:true}).inputValue(),'11','invalid numeric draft remains visible after unit switching');await p.getByRole('button',{name:'Reset launch delay',exact:true}).click();await p.waitForFunction(()=>document.querySelector('input[type=number]').value!=='11');assert.equal(await p.getByLabel('Launch delay · seconds',{exact:true}).getAttribute('aria-invalid'),'false');assert(!await p.getByRole('button',{name:'Save',exact:true}).isDisabled(),'Reset removes only invalid timing and preserves selected projectile');await p.close();
      results.push('Invalid timing blocks all saves, remains visible across unit switches and resets without losing the projectile draft');
    }
    {
      const p=await freshProjectilePage(),message='Injected timing revision conflict';await p.route('**/api/change',route=>route.fulfill({status:409,json:{error:message}}));await p.getByLabel('Launch delay · seconds',{exact:true}).fill('0.65');await p.getByLabel('Launch delay · seconds',{exact:true}).blur();await p.getByText(message,{exact:true}).waitFor();await reloadProjectilePage(p);assert.equal(await p.getByLabel('Launch delay · seconds',{exact:true}).inputValue(),'0.65','Reload retains rejected local timing draft');await p.unroute('**/api/change');let captured;await p.route('**/api/save',async route=>{captured=await draftApi('load');await route.fulfill({json:{...captured,dirty:false,result:{saved:true,files:[]}}});});await p.getByRole('button',{name:'Save',exact:true}).click();await p.getByText('Saved projectile, launch delay and trail. Reload the game preview to apply.',{exact:true}).waitFor();assert.equal(captured.timings.hero,.65);await p.close();
      results.push('Rejected numeric timing edits survive Reload and can be saved after the conflict is resolved');
    }
    {
      const p=await freshProjectilePage();let arrive,release;const arrived=new Promise(resolve=>arrive=resolve),released=new Promise(resolve=>release=resolve);let changes=0;
      await p.route('**/api/change',async route=>{if(++changes===1){arrive();await released;}await route.continue();});const response=p.waitForResponse(response=>response.url().endsWith('/api/change')&&response.status()===200);
      await p.getByLabel('Launch delay · seconds',{exact:true}).fill('0.69');await p.getByLabel('Launch delay · seconds',{exact:true}).blur();await arrived;
      try{await p.getByLabel('Ranged unit',{exact:true}).selectOption('tower:2:4');await p.getByLabel('Launch delay · seconds',{exact:true}).fill('0.4');await p.getByLabel('Launch delay · seconds',{exact:true}).evaluate(input=>window.__timingFocus=input);}finally{release();}
      await response;await p.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));assert(await p.getByLabel('Launch delay · seconds',{exact:true}).evaluate(input=>input===window.__timingFocus&&document.activeElement===input),'a late previous-unit response keeps the currently edited input and focus');await p.getByLabel('Launch delay · seconds',{exact:true}).press('End');await p.keyboard.type('2');assert.equal(await p.getByLabel('Launch delay · seconds',{exact:true}).inputValue(),'0.42');const enabled=p.getByLabel('Enable trail',{exact:true}),wasChecked=await enabled.isChecked();await enabled.click();assert.equal(await enabled.isChecked(),!wasChecked,'a deferred timing refresh does not swallow the first trail click');await p.waitForFunction(async()=>{const response=await fetch('/api/load',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'}),state=await response.json();return state.timings.hero===.69&&state.timings['tower:2:4']===.42;});const baseline=(await draftApi('load')).units.find(unit=>unit.key==='tower:2:4').defaultDelay;await p.getByRole('button',{name:'Reset launch delay',exact:true}).click();await p.waitForFunction(value=>Number(document.querySelector('input[type=number]').value)===value,baseline);assert.equal(await p.getByLabel('Enable trail',{exact:true}).isChecked(),!wasChecked,'Reset preserves the first-click trail edit');await p.close();
      results.push('Late timing replies preserve focus, continued typing and first-click trail/Reset actions, while each delay stays on its original unit');
    }
    {
      const p=await freshProjectilePage(),message='Injected Reload revision conflict';await p.locator('[data-projectile="toon:projectile-14-ice"]').click();await p.locator('[data-playback-mode="impact"]').click();await p.route('**/api/load',route=>route.fulfill({status:409,json:{error:message}}));await p.getByRole('button',{name:'Reload',exact:true}).click();await p.getByText(message,{exact:true}).waitFor();assert.equal(await p.locator('[data-projectile="toon:projectile-14-ice"]').getAttribute('aria-pressed'),'true');assert.equal(await p.locator('[data-playback-mode="impact"]').getAttribute('aria-pressed'),'true');await p.locator('[data-projectile="toon:projectile-5-arrow"]').click();await p.getByRole('button',{name:'Reload',exact:true}).click();await p.getByText(message,{exact:true}).waitFor();assert.equal(await p.locator('[data-projectile="toon:projectile-5-arrow"]').getAttribute('aria-pressed'),'true');assert(!await p.getByRole('button',{name:'Save',exact:true}).isDisabled());await p.close();
      results.push('Rejected Reload retains selection/playback drafts and repeated identical errors remain visible');
    }
    {
      const state=await draftApi('load');await draftApi('discard',{version:state.version});const p=await browser.newPage({viewport:{width:1560,height:960}});p.on('pageerror',error=>errors.push('Projectile artwork recovery: '+error.message));const asset=projectileCatalog.assets.find(asset=>asset.sourcePart),route='**/asset/'+asset.image.split('/').map(encodeURIComponent).join('/');let attempts=0;
      await p.route(route,request=>{attempts++;return attempts===1?request.fulfill({status:404,body:'Injected missing artwork'}):request.continue();});await p.goto(projectileBase,{waitUntil:'networkidle'});assert.equal(attempts,1);const thumbnail=p.locator('[data-projectile="'+asset.id+'"] canvas');const painted=node=>{const pixels=node.getContext('2d').getImageData(0,0,node.width,node.height).data;for(let i=3;i<pixels.length;i+=4)if(pixels[i])return true;return false;};assert.equal(await thumbnail.evaluate(painted),false);await reloadProjectilePage(p);await p.waitForFunction(id=>{const node=document.querySelector('[data-projectile="'+id+'"] canvas');const pixels=node.getContext('2d').getImageData(0,0,node.width,node.height).data;return pixels.some((value,index)=>index%4===3&&value>0);},asset.id);assert(attempts>=2,'Reload retries the repaired artwork');await p.close();
      results.push('Reload clears failed image caches and renders repaired projectile artwork');
    }
    for(const kind of process.argv.includes('--projectiles-only')?[]:['relics','equipment','talents','perks']){
      const p=await browser.newPage({viewport:{width:1560,height:960}});p.on('pageerror',e=>errors.push(kind+': '+e.message));await p.goto('http://127.0.0.1:'+generic.address().port+'/'+kind);
      try{await p.locator('#detail h2').waitFor({timeout:30000});await p.waitForFunction(()=>window.panel._assets.images.length>0);}catch(error){fs.writeFileSync(path.join(out,kind+'-failure.json'),JSON.stringify({errors,body:await p.locator('body').innerText()},null,2));throw error;}
      if(kind==='relics')assert.equal(await p.locator('.gt-record').count(),JSON.parse(fs.readFileSync(path.join(root,files.A),'utf8').replace(/^\uFEFF/,'')).TreasureCfg.length);
      const picker=p.getByRole('button',{name:'Choose icon…',exact:true}).first(),draftBefore=await p.evaluate(()=>JSON.stringify(window.panel._snapshot.changes));await picker.click();
      assert.equal(await p.locator('.gt-icon-choice').count(),0,'the first page contains folders, not a flat icon grid');
      await p.getByRole('button',{name:'2D Minimal Icon Pack folder',exact:true}).waitFor();assert(await p.getByRole('button',{name:'← Back',exact:true}).isDisabled());
      if(kind==='relics'){
        await p.locator('.gt-dialog').screenshot({path:path.join(out,'icon-picker-packs.png')});
        await p.setViewportSize({width:680,height:700});const bounds=await p.locator('.gt-dialog').boundingBox();assert(bounds.x>=0&&bounds.y>=0&&bounds.x+bounds.width<=680&&bounds.y+bounds.height<=700);assert(await p.locator('.gt-icon-browser').evaluate(n=>n.scrollWidth<=n.clientWidth+1),'folder labels and breadcrumbs fit narrow panels');await p.screenshot({path:path.join(out,'icon-picker-packs-narrow.png')});await p.setViewportSize({width:1560,height:960});
        await p.getByRole('button',{name:'2D Minimal Icon Pack folder',exact:true}).click();await p.getByRole('button',{name:'Economy folder',exact:true}).click();assert.equal(await p.locator('.gt-icon-choice').count(),118);await p.evaluate(()=>window.panel._iconPicker.setImages(window.panel._assets.images));assert.equal(await p.locator('.gt-icon-choice').count(),118,'an asynchronously refreshed index preserves the current folder');await p.locator('.gt-dialog').screenshot({path:path.join(out,'icon-picker-economy.png')});
        await p.getByRole('button',{name:'← Back',exact:true}).click();assert.equal(await p.locator('.gt-icon-choice').count(),0);await p.locator('.gt-icon-breadcrumbs').getByRole('button',{name:'All packs',exact:true}).click();
        await p.getByRole('button',{name:'Minimal Hero Equipment folder',exact:true}).click();await p.getByRole('button',{name:'Armor folder',exact:true}).click();assert.equal(await p.locator('.gt-icon-choice').count(),20);
        await p.locator('.gt-icon-breadcrumbs').getByRole('button',{name:'All packs',exact:true}).click();await p.getByRole('button',{name:'GUI Pro Kit folder',exact:true}).click();await p.getByRole('button',{name:'Pictograms folder',exact:true}).click();assert.equal(await p.locator('.gt-icon-choice').count(),120);await p.getByRole('button',{name:'Show more (200 remaining)',exact:true}).click();assert.equal(await p.locator('.gt-icon-choice').count(),240);await p.getByRole('button',{name:'← Back',exact:true}).click();await p.getByRole('button',{name:'Pictograms folder',exact:true}).click();assert.equal(await p.locator('.gt-icon-choice').count(),120,'pagination resets when returning to a folder');
        assert.equal(await p.evaluate(()=>JSON.stringify(window.panel._snapshot.changes)),draftBefore,'folder navigation never edits drafts');await p.keyboard.press('Escape');assert(await p.locator('#modal').isHidden());assert(await p.evaluate(()=>document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}))),'closing the picker removes its keyboard listener');await picker.click();assert.equal(await p.locator('.gt-icon-choice').count(),0,'reopening starts on the packs page');await p.getByRole('button',{name:'Cancel',exact:true}).click();assert.equal(await p.evaluate(()=>JSON.stringify(window.panel._snapshot.changes)),draftBefore);await picker.click();results.push('Icon folders: pack/category navigation, pagination, Back, Escape and Cancel preserve drafts');
      }
      await p.getByPlaceholder('Search names or folders').fill('FA_Consumable_Arrow_009');await p.locator('.gt-icon-choice').first().click();
      await p.waitForFunction(()=>window.panel._snapshot.dirty);const draft=await p.evaluate(()=>window.panel._snapshot.changes);assert(draft.some(x=>typeof x.after==='string'&&x.after.includes('@icon/')));
      await p.screenshot({path:path.join(out,kind+'-icons-editor.png')});results.push(kind+': icon selection produces a draft with a usable resource reference');
      const afterSelection=await p.evaluate(()=>({version:window.panel._snapshot.version,changes:JSON.stringify(window.panel._snapshot.changes)}));await p.getByRole('button',{name:'Choose icon…',exact:true}).first().click();await p.getByPlaceholder('Search names or folders').fill('FA_Consumable_Arrow_009');await p.locator('.gt-icon-choice[aria-pressed=true]').click();assert.deepEqual(await p.evaluate(()=>({version:window.panel._snapshot.version,changes:JSON.stringify(window.panel._snapshot.changes)})),afterSelection,'selecting the current icon performs no edit');
      store.discard({version:store.version});await p.close();
    }
    assert.deepEqual(protectedFiles.map(hash),before);assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'editor-results.json'),JSON.stringify({ok:true,checks:results,pageErrors:errors,protectedFilesUnchanged:true},null,2));console.log(results.join('\n'));
  }catch(error){if(browser){const pages=browser.contexts().flatMap(context=>context.pages()),details=[];for(const [index,page]of pages.entries()){details.push({url:page.url(),body:await page.locator('body').innerText().catch(()=>'<unavailable>')});await page.screenshot({path:path.join(out,'failure-'+index+'.png')}).catch(()=>{});}fs.writeFileSync(path.join(out,'editor-failure.json'),JSON.stringify({error:error.stack,pages:details},null,2));}throw error;}finally{try{if(browser)await browser.close();}finally{await Promise.all([new Promise(r=>generic.close(r)),new Promise(r=>projectiles.close(r))]);}}
}
if(require.main===module)main().catch(error=>{console.error(error.stack);process.exitCode=1;});
