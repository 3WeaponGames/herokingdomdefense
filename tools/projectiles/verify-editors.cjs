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
  const generic=http.createServer(async(req,res)=>{try{
    const route=decodeURIComponent(new URL(req.url,'http://localhost').pathname),kind=route.slice(1);
    if(['relics','equipment','talents','perks'].includes(kind)){
      res.setHeader('Content-Type','text/html');res.end('<!doctype html><html><head><meta charset="utf-8"><style>html,body{height:100%;margin:0;background:#1b2029;color:#ddd}#root{height:100vh}</style><style>'+css+'</style></head><body>'+template+'<script>var __dirname="panel",module={exports:{}};'+
        'function require(name){if(name==="fs")return {readFileSync:function(file){return file.endsWith("panel.html")?'+JSON.stringify(template)+':'+JSON.stringify(css)+';}};if(name==="path")return {join:function(){return Array.prototype.join.call(arguments,"/");}};if(name==="../lib/schema")return window.schema;if(name==="../buildings/client")return {style:""};throw Error("Preview dependency intentionally absent: "+name);}'+
        '(function(module,exports){'+schema+'})(module,module.exports);window.schema=module.exports;module={exports:{}};'+
        'var Editor={Ipc:{sendToMain:function(channel){var args=Array.prototype.slice.call(arguments,1),cb=args.pop();fetch("/api/"+channel.split(":")[1],{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(args[0]||{})}).then(function(r){return r.json();}).then(function(result){cb(result.error||null,result);},function(e){cb(e.message);});}},Panel:{extend:function(def){var ids=def.$;def.$={};for(var key in ids){def.$[key]=document.querySelector(ids[key]);def["$"+key]=def.$[key];}window.panel=def;def.ready();return def;}}};'+
        '(function(module,exports){'+panel+'})(module,module.exports);module.exports.create('+JSON.stringify(kind)+');</script></body></html>');return;
    }
    if(route.startsWith('/api/')){let body='';for await(const chunk of req){body+=chunk;if(body.length>8*1024*1024)throw Error('Request too large');}const request=JSON.parse(body||'{}'),name=route.slice(5);let result;if(name==='asset-index')result=assets;else if(name==='load')result=store.snapshot();else if(['change','discard'].includes(name))result=store[name](request);else throw Error('This verification host permits drafts only');res.setHeader('Content-Type','application/json');res.end(JSON.stringify(result));return;}
    if(route.startsWith('/asset/assets/')){const file=path.resolve(root,route.slice(7));if(!file.startsWith(path.join(root,'assets')+path.sep)||!file.endsWith('.png'))throw Error('Unknown icon');res.setHeader('Content-Type','image/png');res.end(fs.readFileSync(file));return;}
    res.writeHead(404).end();
  }catch(error){res.writeHead(400,{'Content-Type':'application/json'}).end(JSON.stringify({error:error.message}));}});
  const projectiles=require('./serve-editor.cjs').createServer(root,{});await Promise.all([new Promise(r=>generic.listen(0,'127.0.0.1',r)),new Promise(r=>projectiles.listen(0,'127.0.0.1',r))]);
  const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright-core');let browser;const results=[];
  try{
    browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--mute-audio']});
    const page=await browser.newPage({viewport:{width:1560,height:960}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto('http://127.0.0.1:'+projectiles.address().port);await page.getByText('Current data · browsing makes no changes',{exact:true}).waitFor({timeout:30000});
    assert.equal(await page.locator('.projectile-grid button').count(),JSON.parse(fs.readFileSync(path.join(root,'assets/resources/projectiles/catalog.json'),'utf8')).assets.length);
    await page.getByRole('button',{name:'Projectile 5 arrow Toon / flight',exact:true}).click();await page.getByRole('button',{name:'Use as flight',exact:true}).click();await page.getByText('Unsaved visual drafts',{exact:true}).waitFor();assert(!await page.getByRole('button',{name:'Save',exact:true}).isDisabled());
    await page.screenshot({path:path.join(out,'projectiles-editor.png')});results.push('Projectiles: library, animated preview and assignment drafts work without saving');
    await page.locator('[data-asset="hero-skin:lv1"]').click();await page.waitForFunction(()=>{const c=document.querySelector('aside:last-child>canvas'),pixels=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let count=0;for(let i=0;i<pixels.length;i+=4)if(pixels[i]>80||pixels[i+1]>80||pixels[i+2]>80)count++;return count>100;});
    results.push('Original animated hero projectile preview renders');await page.close();
    for(const kind of ['relics','equipment','talents','perks']){
      const p=await browser.newPage({viewport:{width:1560,height:960}});p.on('pageerror',e=>errors.push(kind+': '+e.message));await p.goto('http://127.0.0.1:'+generic.address().port+'/'+kind);
      try{await p.locator('#detail h2').waitFor({timeout:30000});await p.waitForFunction(()=>window.panel._assets.images.length>0);}catch(error){fs.writeFileSync(path.join(out,kind+'-failure.json'),JSON.stringify({errors,body:await p.locator('body').innerText()},null,2));throw error;}
      if(kind==='relics')assert.equal(await p.locator('.gt-record').count(),27);
      const picker=p.getByRole('button',{name:'Choose icon…',exact:true}).first();await picker.click();await p.getByPlaceholder('Search names or folders').fill('FA_Consumable_Arrow_009');await p.locator('.gt-icon-choice').first().click();
      await p.waitForFunction(()=>window.panel._snapshot.dirty);const draft=await p.evaluate(()=>window.panel._snapshot.changes);assert(draft.some(x=>typeof x.after==='string'&&x.after.includes('@icon/')));
      await p.screenshot({path:path.join(out,kind+'-icons-editor.png')});results.push(kind+': icon selection produces a draft with a usable resource reference');
      store.discard({version:store.version});await p.close();
    }
    assert.deepEqual(protectedFiles.map(hash),before);assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'editor-results.json'),JSON.stringify({ok:true,checks:results,pageErrors:errors,protectedFilesUnchanged:true},null,2));console.log(results.join('\n'));
  }finally{if(browser)await browser.close();await Promise.all([new Promise(r=>generic.close(r)),new Promise(r=>projectiles.close(r))]);}
}
if(require.main===module)main().catch(error=>{console.error(error.stack);process.exitCode=1;});
