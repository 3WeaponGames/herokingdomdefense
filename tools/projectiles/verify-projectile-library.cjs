'use strict';
// Full render-only authoring audit. The game, player saves and audio never load.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..');
const defaultOutput=path.join(os.homedir(),'Documents/Codex Artifacts/HeroKingdomDefense',new Date().toISOString().replace(/[:.]/g,'-')+'-projectile-library');
async function main(){
  const out=path.resolve(process.env.HKD_ARTIFACT_DIR||defaultOutput);if(out===root||out.startsWith(root+path.sep))throw Error('Keep screenshots and diagnostic reports outside the project.');fs.mkdirSync(out,{recursive:true});
  const files=['assets/resources/projectiles/catalog.json','assets/KinghtFallConfig/GameJsonCfg.json'],hashes=()=>Object.fromEntries(files.map(file=>[file,crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex')]));
  const report={started:new Date().toISOString(),before:hashes(),sets:[],units:[],trails:[],pageErrors:[],consoleErrors:[],requestErrors:[]},catalog=JSON.parse(fs.readFileSync(path.join(root,files[0]),'utf8').replace(/^\uFEFF/,''));
  const server=require('./serve-editor.cjs').createServer(root,{});let browser,page;
  try{
    await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',()=>{server.removeListener('error',reject);resolve();});});
    const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright-core');
    // Mute is applied to the entire browser process before any page can load.
    browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--mute-audio']});
    page=await browser.newPage({viewport:{width:1720,height:1050}});page.on('pageerror',error=>report.pageErrors.push(error.message));page.on('console',message=>{if(message.type()==='error')report.consoleErrors.push(message.text());});
    page.on('response',async response=>{if(response.status()>=400&&!response.url().endsWith('/favicon.ico'))report.requestErrors.push({url:response.url(),status:response.status(),body:await response.text().catch(()=>'<unavailable>')});});
    await page.route('**/api/save',route=>route.fulfill({status:403,contentType:'application/json',body:'{"error":"This verification host blocks every save."}'}));
    await page.addInitScript(()=>{
      window.__projectileAudit={draws:0,frames:0,loading:true};const prototype=CanvasRenderingContext2D.prototype,drawImage=prototype.drawImage,fillRect=prototype.fillRect,fillText=prototype.fillText;
      const stage=context=>context.canvas.getAttribute('aria-label')==='Projectile combat preview';
      prototype.drawImage=function(){if(stage(this))window.__projectileAudit.draws++;return drawImage.apply(this,arguments);};
      prototype.fillRect=function(x,y,width,height){if(stage(this)&&x===0&&y===0&&width===720&&height===420){window.__projectileAudit.frames++;window.__projectileAudit.loading=false;}return fillRect.apply(this,arguments);};
      prototype.fillText=function(value){if(stage(this)&&/^Loading preview units/.test(value))window.__projectileAudit.loading=true;return fillText.apply(this,arguments);};
    });
    await page.goto('http://127.0.0.1:'+server.address().port,{waitUntil:'networkidle'});await page.getByText('Current data · browsing makes no changes',{exact:true}).waitFor();
    assert.equal(await page.locator('.projectile-grid button').count(),catalog.sets.length);
    const select=page.getByLabel('Ranged unit',{exact:true}),pick=id=>page.locator('[data-projectile="'+id.replace(/"/g,'\\"')+'"]').click();
    async function play(label,actors){
      const key={'Play launch':'launch','Play flight':'flight','Play on hit':'impact','Play all':'all'}[label],control=page.locator('[data-playback-mode="'+key+'"]');
      const before=await page.evaluate(()=>({...window.__projectileAudit}));if(!(await control.innerText()).startsWith('Pause '))await control.click();
      await page.waitForFunction(({before,actors})=>{const state=window.__projectileAudit;return state.draws>before.draws&&state.frames>before.frames+(actors?2:0)&&(!actors||!state.loading);},{before,actors},{timeout:15000});
    }
    for(const [index,set]of catalog.sets.entries()){
      await pick(set.id);const result={id:set.id,modes:[]};
      for(const [key,label]of [['launch','Play launch'],['flight','Play flight'],['impact','Play on hit'],['all','Play all']]){
        const available=key==='all'||!!set[key];assert.equal(await page.locator('[data-playback-mode="'+key+'"]').isDisabled(),!available,set.id+' '+label+' availability');
        if(available)await play(label,key==='all');result.modes.push({key,available});
      }
      report.sets.push(result);if((index+1)%20===0)console.log('Projectile sets: '+(index+1)+' / '+catalog.sets.length);
    }
    const units=await select.locator('option').evaluateAll(options=>options.map(option=>({key:option.value,name:option.textContent})));
    for(const [index,unit]of units.entries()){
      await select.selectOption(unit.key);await play('Play all',true);const error=await page.evaluate(()=>{const node=document.querySelector('header>.error');return node?node.textContent:null;});assert.equal(error,null,unit.key+' preview error');report.units.push(unit);
      if((index+1)%20===0)console.log('Ranged shooters: '+(index+1)+' / '+units.length);
    }
    await select.selectOption('hero');const example=catalog.sets.find(set=>/^toon:projectile-14-/.test(set.id))||catalog.sets[0];await pick(example.id);
    const enabled=page.getByLabel('Enable trail',{exact:true}),trailSelect=page.getByLabel('Projectile trail',{exact:true});await enabled.uncheck();assert(await trailSelect.isDisabled());await play('Play all',true);report.trails.push({id:false});
    await enabled.check();for(const trail of catalog.trails||[]){await trailSelect.selectOption(trail.id);await play('Play all',true);report.trails.push({id:trail.id});}
    await page.getByLabel('Search projectiles',{exact:true}).fill('Toon');await page.screenshot({path:path.join(out,'projectiles-editor.png')});await page.setViewportSize({width:980,height:820});await page.screenshot({path:path.join(out,'projectiles-editor-narrow.png')});
    report.after=hashes();assert.deepEqual(report.after,report.before,'Browsing and preview retain catalog/config byte for byte');assert.deepEqual(report.pageErrors,[]);assert.deepEqual(report.consoleErrors,[]);assert.deepEqual(report.requestErrors,[]);report.ok=true;
    console.log('Verified '+report.sets.length+' complete projectile sets, '+report.units.length+' ranged shooters, '+(report.trails.length-1)+' trail presets and trails off.');console.log('Report and screenshots: '+out);
  }catch(error){report.failure=error.stack;if(page)await page.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});throw error;}
  finally{try{report.ended=new Date().toISOString();fs.writeFileSync(path.join(out,'projectile-library-results.json'),JSON.stringify(report,null,2));}finally{try{if(browser)await browser.close();}finally{await new Promise(resolve=>server.close(resolve));}}}
}
if(require.main===module)main().catch(error=>{console.error(error.stack);process.exitCode=1;});
module.exports={main};
