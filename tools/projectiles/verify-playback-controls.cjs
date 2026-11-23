'use strict';
// Exercise actual pointer/keyboard events inside Creator-style Shadow DOM.
// This render-only host never starts gameplay and Save is blocked.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..');
async function main(){
  const out=path.resolve(process.env.HKD_ARTIFACT_DIR||path.join(os.homedir(),'Documents/Codex Artifacts/HeroKingdomDefense/projectile-playback-controls'));
  if(out===root||out.startsWith(root+path.sep))throw Error('Keep playback diagnostics outside the project.');fs.mkdirSync(out,{recursive:true});
  const files=['assets/KinghtFallConfig/GameJsonCfg.json','assets/resources/projectiles/catalog.json'],hashes=()=>Object.fromEntries(files.map(file=>[file,crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex')]));
  const report={before:hashes(),checks:[],pageErrors:[],requestErrors:[]},server=require('./serve-editor.cjs').createServer(root,{});let browser,page,saves=0;
  try{
    await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',()=>{server.removeListener('error',reject);resolve();});});
    const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright-core');browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--mute-audio']});
    async function hostPage(shadowMode){
      const p=await browser.newPage({viewport:{width:1560,height:960}});p.on('pageerror',error=>report.pageErrors.push(error.message));p.on('response',response=>{if(response.status()>=400&&!response.url().endsWith('/favicon.ico'))report.requestErrors.push(response.url());});
      await p.route('**/api/save',route=>{saves++;return route.fulfill({status:403,json:{error:'Save is blocked in playback verification.'}});});
      await p.route('**/app.js',async route=>{
        const response=await route.fetch();let source=await response.text();assert(source.includes('.mount(document.getElementById("characters"),'));
        source=source.replace('.mount(document.getElementById("characters"),','.mount(window.__projectileRoot,');
        const host=shadowMode==='nested-closed'?'var outer=host.attachShadow({mode:"closed"});outer.innerHTML="<div style=height:100vh></div>";window.__projectileOuter=outer;host=outer.querySelector("div");':'';
        source='var host=document.getElementById("characters");'+host+'var shadow=host.attachShadow({mode:'+JSON.stringify(shadowMode==='nested-closed'?'closed':shadowMode)+'});shadow.innerHTML="<link rel=stylesheet href=/style.css><div style=height:100vh></div>";window.__projectileRoot=shadow.querySelector("div");'+source.replace('window.addEventListener("pagehide"','window.__projectileApp=app;window.addEventListener("pagehide"');
        await route.fulfill({response,body:source});
      });return p;
    }
    page=await hostPage('open');
    await page.goto('http://127.0.0.1:'+server.address().port);await page.getByText('Current data · browsing makes no changes',{exact:true}).waitFor();
    const native=page.getByLabel('Ranged unit',{exact:true}),trigger=page.getByRole('combobox',{name:'Choose unit',exact:true}),search=page.getByLabel('Search unit names',{exact:true}),canvas=page.getByLabel('Projectile combat preview',{exact:true});
    async function frames(count=3){await page.evaluate(count=>new Promise(resolve=>{function frame(){if(--count<=0)resolve();else requestAnimationFrame(frame);}requestAnimationFrame(frame);}),count);}
    async function choose(key){await trigger.click();await search.fill(key);await page.locator('.projectile-unit-option[data-unit="'+key+'"]').click();await page.waitForFunction(key=>window.__projectileRoot.querySelector('.projectile-unit-native').value===key,key,{timeout:3000});assert.equal(await trigger.getAttribute('aria-expanded'),'false');}
    await choose('tower:2:4');assert((await trigger.innerText()).includes('Cannon'));await choose('hero');
    report.checks.push('Actual pointer clicks swap units inside a shadow-root panel without the outside handler swallowing the selection.');
    const unitKeys=await native.locator('option').evaluateAll(options=>options.map(option=>option.value));
    for(const key of unitKeys)await choose(key);await choose('hero');report.checks.push('Every '+unitKeys.length+' ranged picker entry is selectable through real portrait-option pointer clicks.');
    await trigger.click();await search.fill('tower:2:');await search.press('ArrowDown');await search.press('Enter');assert((await native.inputValue()).startsWith('tower:2:'));await choose('hero');
    await page.locator('[data-projectile="toon:projectile-5-arrow"]').click();const delay=page.getByLabel('Launch delay · seconds',{exact:true});await delay.fill('0.63');await delay.blur();await page.getByText('Unsaved projectile drafts',{exact:true}).waitFor();
    const enabled=page.getByLabel('Enable trail',{exact:true});if(!await enabled.isChecked())await enabled.check();const trail=page.getByLabel('Projectile trail',{exact:true}),trailId=await trail.locator('option').nth(1).getAttribute('value');await trail.selectOption(trailId);await choose('tower:2:4');await choose('hero');
    assert.equal(await delay.inputValue(),'0.63');assert.equal(await trail.inputValue(),trailId);assert.equal(await page.locator('[data-projectile="toon:projectile-5-arrow"]').getAttribute('aria-pressed'),'true');
    report.checks.push('Pointer and keyboard swaps retain per-unit projectile, launch-delay and trail drafts.');
    const mode=key=>page.locator('[data-playback-mode="'+key+'"]');
    const pixels=()=>canvas.evaluate(element=>element.toDataURL());
    await mode('flight').click();assert.equal(await mode('flight').innerText(),'Pause flight');await page.waitForLoadState('networkidle');await frames(4);
    await mode('flight').click();assert.equal(await mode('flight').innerText(),'Play flight');await frames();const held=await pixels();await frames(12);assert.equal(await pixels(),held,'paused flight holds the exact rendered frame');
    await mode('flight').click();assert.equal(await mode('flight').innerText(),'Pause flight');await page.waitForFunction(previous=>window.__projectileRoot.querySelector('canvas[aria-label="Projectile combat preview"]').toDataURL()!==previous,held);
    report.checks.push('The active playback button pauses and resumes the current frame, with Pause/Play labels.');
    await canvas.focus();await page.keyboard.press('Space');assert.equal(await mode('flight').innerText(),'Play flight');await frames();const spaceHeld=await pixels();await frames(10);assert.equal(await pixels(),spaceHeld,'Space pauses the animation clock');
    await page.keyboard.press('Space');assert.equal(await mode('flight').innerText(),'Pause flight');await page.waitForFunction(previous=>window.__projectileRoot.querySelector('canvas[aria-label="Projectile combat preview"]').toDataURL()!==previous,spaceHeld);
    await page.keyboard.down('Space');assert.equal(await mode('flight').innerText(),'Play flight');await canvas.dispatchEvent('keydown',{key:' ',code:'Space',repeat:true,bubbles:true,composed:true});assert.equal(await mode('flight').innerText(),'Play flight','key repeats cannot toggle playback repeatedly');await page.keyboard.up('Space');
    await mode('all').click();assert.equal(await mode('all').innerText(),'Pause all');await page.waitForLoadState('networkidle');await frames(5);await mode('all').focus();await page.keyboard.press('Space');assert.equal(await mode('all').innerText(),'Play all','Space on a playback button toggles once');await frames();const allHeld=await pixels();await frames(10);assert.equal(await pixels(),allHeld,'Play all freezes shooter, projectile and target together');
    report.checks.push('Space toggles selected playback once per press and freezes the complete combat preview.');
    await mode('all').click();const running=await mode('all').innerText();
    const librarySearch=page.getByPlaceholder('Search projectiles…');await librarySearch.fill('');await librarySearch.press('Space');assert.equal(await mode('all').innerText(),running);assert.equal(await librarySearch.inputValue(),' ');await librarySearch.fill('');
    await trigger.click();await search.fill('hero');await search.press('Space');assert.equal(await mode('all').innerText(),running);await search.press('Escape');
    await trail.focus();await trail.press('Space');assert.equal(await mode('all').innerText(),running);await page.keyboard.press('Escape');
    await delay.focus();await delay.dispatchEvent('keydown',{key:' ',code:'Space',bubbles:true,composed:true});assert.equal(await mode('all').innerText(),running);
    await canvas.focus();await canvas.dispatchEvent('keydown',{key:' ',code:'Space',ctrlKey:true,bubbles:true,composed:true});assert.equal(await mode('all').innerText(),running);
    await page.evaluate(()=>{const input=document.createElement('input');input.id='outside-projectile-editor';document.body.appendChild(input);input.focus();});await page.keyboard.press('Space');assert.equal(await mode('all').innerText(),running);await page.evaluate(()=>document.getElementById('outside-projectile-editor').remove());
    await page.evaluate(()=>{const input=document.createElement('div');input.contentEditable='true';input.id='projectile-editable-test';window.__projectileRoot.appendChild(input);input.focus();});await page.keyboard.press('Space');assert.equal(await mode('all').innerText(),running);await page.evaluate(()=>window.__projectileRoot.querySelector('#projectile-editable-test').remove());
    assert.equal(saves,0);report.checks.push('Space leaves text entry, selectors, editable content, modifier shortcuts and other panels untouched; it never saves.');
    await canvas.focus();await page.screenshot({path:path.join(out,'shadow-playback-editor.png')});await page.evaluate(()=>window.__projectileApp.destroy());await page.keyboard.press('Space');await frames();assert.equal(await page.locator('.projectile-tool canvas').count(),0);
    await page.close();page=await hostPage('nested-closed');
    let releaseActor,actorArrived;const heldActor=new Promise(resolve=>releaseActor=resolve),arrived=new Promise(resolve=>actorArrived=resolve);
    await page.route('**/api/describe-unit',async route=>{if(route.request().postDataJSON().key==='tower:2:7'){actorArrived();await heldActor;}await route.continue();});
    try{
      await page.goto('http://127.0.0.1:'+server.address().port);await page.waitForFunction(()=>window.__projectileRoot&&window.__projectileRoot.querySelector('.projectile-unit-native').options.length>1);
      const handle=async selector=>(await page.evaluateHandle(selector=>window.__projectileRoot.querySelector(selector),selector)).asElement();
      const closedTrigger=await handle('.projectile-unit-trigger'),closedSearch=await handle('.projectile-unit-popup input');await closedTrigger.click();await closedSearch.fill('tower:2:7');await(await handle('[data-unit="tower:2:7"]')).click();
      assert.equal(await page.evaluate(()=>window.__projectileRoot.querySelector('.projectile-unit-native').value),'tower:2:7');assert.equal(await closedTrigger.getAttribute('aria-expanded'),'false');
      let timer;try{await Promise.race([arrived,new Promise((resolve,reject)=>{timer=setTimeout(()=>reject(Error('Timed out waiting for held closed-shadow actor')),15000);})]);}finally{clearTimeout(timer);}
      const closedDelay=await handle('input[type=number]');await closedDelay.fill('0.44');releaseActor();await page.waitForLoadState('networkidle');await frames(4);
      assert.equal(await closedDelay.evaluate(element=>element.isConnected&&element===window.__projectileRoot.querySelector('input[type=number]')),true,'a late actor response retains the focused closed-shadow timing field');assert.equal(await closedDelay.inputValue(),'0.44');
      const closedCanvas=await handle('canvas[aria-label="Projectile combat preview"]');await closedCanvas.focus();await page.keyboard.press('Space');assert.equal(await(await handle('[data-playback-mode="all"]')).innerText(),'Play all');
      let releaseLateActor,lateActorArrived;const lateActorHeld=new Promise(resolve=>releaseLateActor=resolve),lateArrived=new Promise(resolve=>lateActorArrived=resolve);
      await page.route('**/api/describe-unit',async route=>{if(route.request().postDataJSON().key==='tower:2:8'){lateActorArrived();await lateActorHeld;}await route.continue();});
      try{
        await closedTrigger.click();await closedSearch.fill('tower:2:8');await(await handle('.projectile-unit-option[data-unit="tower:2:8"]')).click();
        let lateTimer;try{await Promise.race([lateArrived,new Promise((resolve,reject)=>{lateTimer=setTimeout(()=>reject(Error('Timed out waiting for paused-preview actor')),15000);})]);}finally{clearTimeout(lateTimer);}
        await(await handle('[data-projectile="toon:projectile-14-ice"]')).click();const flightControl=await handle('[data-playback-mode="flight"]');await flightControl.click();
        await page.waitForFunction(()=>{const c=window.__projectileRoot.querySelector('canvas[aria-label="Projectile combat preview"]'),data=c.getContext('2d').getImageData(240,90,240,200).data;let count=0;for(let i=0;i<data.length;i+=4)if(data[i]>50||data[i+1]>70||data[i+2]>90)count++;return count>5;});
        const initialFlight=await closedCanvas.evaluate(element=>element.toDataURL());await page.waitForFunction(previous=>window.__projectileRoot.querySelector('canvas[aria-label="Projectile combat preview"]').toDataURL()!==previous,initialFlight);await flightControl.click();await frames();const lateHeld=await closedCanvas.evaluate(element=>element.toDataURL());
        releaseLateActor();await page.waitForLoadState('networkidle');await frames(8);assert.equal(await closedCanvas.evaluate(element=>element.toDataURL())===lateHeld,true,'a late actor load cannot rewind the paused flight animation');
        report.checks.push('A delayed actor response cannot rewind a paused preview clock.');
      }finally{releaseLateActor();}
      await closedTrigger.click();await page.evaluate(()=>{const outside=document.createElement('button');outside.id='outside-inner-shadow';outside.textContent='Outer panel control';window.__projectileOuter.appendChild(outside);});await(await page.evaluateHandle(()=>window.__projectileOuter.querySelector('#outside-inner-shadow'))).asElement().click();assert.equal(await closedTrigger.getAttribute('aria-expanded'),'false','pointers in an ancestor closed shadow root still close the picker');
      await closedTrigger.click();await page.evaluate(()=>{const outside=document.createElement('button');outside.id='outside-shadow';outside.textContent='Outside editor';document.body.appendChild(outside);});await page.locator('#outside-shadow').click();assert.equal(await closedTrigger.getAttribute('aria-expanded'),'false','outside document pointers still close a closed-shadow picker');
      await page.screenshot({path:path.join(out,'closed-shadow-playback-editor.png')});await page.evaluate(()=>window.__projectileApp.destroy());await page.keyboard.press('Space');report.checks.push('Nested closed shadow roots also support real clicks, Space, focused draft retention during late actor loads, ancestor/document outside clicks and teardown.');
    }finally{releaseActor();}
    await page.close();page=await hostPage('open');
    const fixtureImage=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=c.height=2;const data=new Uint8ClampedArray(16);for(let i=0;i<data.length;i+=4)data.set([80,20,10,128],i);c.getContext('2d').putImageData(new ImageData(data,2,2),0,0);return c.toDataURL().split(',')[1];});
    await page.route('**/asset/__projectile_blend_fixture.png',route=>route.fulfill({contentType:'image/png',body:Buffer.from(fixtureImage,'base64')}));
    await page.route('**/api/load',async route=>{const response=await route.fetch(),snapshot=await response.json();for(const additive of [true,false]){const id='verify:blend-'+(additive?'additive':'normal');snapshot.data.assets.push({id,name:id,category:'Verifier',role:'flight',kind:'flipbook',image:'__projectile_blend_fixture.png',cell:2,columns:1,frames:1,fps:1,size:48,additive});snapshot.data.sets.push({id,name:id,category:'Verifier',flight:id});}snapshot.data.assignments.hero={...snapshot.data.assignments.hero,trail:false};await route.fulfill({response,json:snapshot});});
    await page.goto('http://127.0.0.1:'+server.address().port);await page.locator('[data-projectile="verify:blend-additive"]').waitFor();
    function pixelNear(actual,expected,label){for(let i=0;i<4;i++)assert(Math.abs(actual[i]-expected[i])<=1,label+': expected '+expected.join(',')+', received '+actual.join(','));}
    const flightCanvas=page.getByLabel('Projectile combat preview',{exact:true});
    const previewSample=()=>flightCanvas.evaluate(c=>{
      const x=Math.floor(c.width/2),column=c.getContext('2d').getImageData(x,0,1,Math.floor(c.height/2)).data;
      for(let i=4;i<column.length;i+=4)if(column[i]!==column[0]||column[i+1]!==column[1]||column[i+2]!==column[2]){
        const bounds=c.getBoundingClientRect(),y=i/4+2;
        return {color:Array.from(column.slice(y*4,y*4+4)),position:{x:(x+.5)*bounds.width/c.width,y:(y+.5)*bounds.height/c.height}};
      }
      throw Error('Expected stationary artwork above the preview ground.');
    });
    await page.locator('[data-projectile="verify:blend-additive"]').click();await page.locator('[data-playback-mode="flight"]').click();
    await page.waitForFunction(()=>{const c=window.__projectileRoot.querySelector('[data-projectile="verify:blend-additive"] canvas');return c.getContext('2d').getImageData(60,36,1,1).data[3]>0;});await frames(4);
    pixelNear((await previewSample()).color,[60,42,48,255],'Additive preview composites against its opaque backdrop');
    pixelNear(await page.locator('[data-projectile="verify:blend-additive"] canvas').evaluate(c=>Array.from(c.getContext('2d').getImageData(60,36,1,1).data)),[63,43,50,255],'Additive thumbnail paints its backdrop before lighter blending');
    await page.locator('[data-projectile="verify:blend-normal"]').click();await frames(4);pixelNear((await previewSample()).color,[50,26,26,255],'Normal artwork restores source-over after an additive effect');
    pixelNear(await page.locator('[data-projectile="verify:blend-normal"] canvas').evaluate(c=>Array.from(c.getContext('2d').getImageData(60,36,1,1).data)),[80,20,10,128],'Normal thumbnails retain their alpha');
    const defaultTrail=page.getByLabel('Projectile trail',{exact:true});
    assert.equal(await defaultTrail.locator('option').first().textContent(),'Tower arrow trail (default)');
    await page.getByLabel('Enable trail',{exact:true}).check();
    assert.equal(await defaultTrail.inputValue(),'trail:bb4d9c1e-b926-4023-9f10-a49134339dcd');
    await page.locator('[data-projectile="verify:blend-additive"]').click();
    const eyedropper=page.getByRole('button',{name:'Pick from artwork',exact:true}),hex=page.getByLabel('Trail color hex',{exact:true});
    const normalArt=page.locator('[data-projectile="verify:blend-normal"] canvas');
    const expectedColor=await normalArt.evaluate(c=>'#'+Array.from(c.getContext('2d').getImageData(60,36,1,1).data).slice(0,3).map(v=>v.toString(16).padStart(2,'0')).join(''));
    await eyedropper.click();assert.equal(await eyedropper.getAttribute('aria-pressed'),'true');
    await normalArt.click();assert.equal(await hex.inputValue(),expectedColor);
    assert.equal(await eyedropper.getAttribute('aria-pressed'),'false');
    assert.equal(await page.locator('[data-projectile="verify:blend-additive"]').getAttribute('aria-pressed'),'true','sampling never changes the selected projectile');
    await eyedropper.click();await page.keyboard.press('Escape');assert.equal(await eyedropper.getAttribute('aria-pressed'),'false');
    assert.equal(await hex.inputValue(),expectedColor);
    await eyedropper.click();
    const preview=await previewSample();
    await flightCanvas.click({position:preview.position});
    assert.equal(await hex.inputValue(),'#'+preview.color.slice(0,3).map(v=>v.toString(16).padStart(2,'0')).join(''));
    await page.getByLabel('Trail color',{exact:true}).evaluate(input=>{input.value='#12ab34';input.dispatchEvent(new Event('change',{bubbles:true}));});
    assert.equal(await hex.inputValue(),'#12ab34');
    assert.equal(await page.getByLabel('Trail green',{exact:true}).inputValue(),String(0xab));
    report.checks.push('Tower Arrow is the standard trail. The eyedropper samples thumbnail colors without switching projectiles, and the palette commits its final color to RGB and hex.');
    await page.evaluate(()=>window.__projectileApp.destroy());assert.equal(saves,0);report.checks.push('Pure additive flipbooks and their opaque thumbnails use additive blending; normal artwork retains alpha and restores source-over.');
    report.after=hashes();assert.deepEqual(report.before,report.after);assert.deepEqual(report.pageErrors,[]);assert.deepEqual(report.requestErrors,[]);report.ok=true;console.log(report.checks.join('\n'));
  }catch(error){report.failure=error.stack;if(page)await page.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});throw error;}
  finally{try{fs.writeFileSync(path.join(out,'playback-controls-results.json'),JSON.stringify(report,null,2));}finally{try{if(browser)await browser.close();}finally{await new Promise(resolve=>server.close(resolve));}}}
}
if(require.main===module)main().catch(error=>{console.error(error.stack);process.exitCode=1;});
module.exports={main};
