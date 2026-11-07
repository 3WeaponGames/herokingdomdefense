'use strict';
// Run explicitly with HKD_INTERNAL_BUNDLE and PLAYWRIGHT_MODULE configured.
// Example paths and verification scope are documented in this tool's README.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),{spawn}=require('node:child_process');
const root=path.resolve(__dirname,'../..'),engine=process.env.COCOS_CREATOR_ROOT||'C:/ProgramData/cocos/editors/Creator/2.4.13';
const out=path.resolve(process.env.HKD_ARTIFACT_DIR||path.join(require('node:os').homedir(),'Documents/Codex Artifacts/HeroKingdomDefense/projectile-engine-tests'));
const read=file=>JSON.parse(fs.readFileSync(file,'utf8'));
async function main(){
  if(out===root||out.startsWith(root+path.sep))throw Error('Test artifacts must be outside the repository');
  const source=process.env.HKD_INTERNAL_BUNDLE;if(!source)throw Error('Set HKD_INTERNAL_BUNDLE to a Creator 2.4 export assets/internal folder. Only built-in renderer resources are used.');
  fs.mkdirSync(out,{recursive:true});if(fs.existsSync(path.join(out,'native-result.json'))||fs.existsSync(path.join(out,'browser-result.json')))throw Error('Use a fresh HKD_ARTIFACT_DIR for each engine verification run.');const internal=path.join(out,'internal');
  fs.cpSync(source,internal,{recursive:true});
  for(const name of ['config','index']){const file=fs.readdirSync(internal).find(f=>new RegExp('^'+name+'(?:\\.[^.]+)?\\.'+(name==='config'?'json':'js')+'$').test(f));if(file&&!fs.existsSync(path.join(internal,name+(name==='config'?'.json':'.js'))))fs.copyFileSync(path.join(internal,file),path.join(internal,name+(name==='config'?'.json':'.js')));}
  const modules={};for(const name of ['ProjectileLooks','HeroItemLooks','KinghtFallBulletBase','KinghtFallBulletPlay','KinghtFallBulletEnemy','KinghtFallBulletSoldier','KinghtFallBulletBuild','KinghtFallBulletEnemy8']){const file=path.join(root,'assets/_script',name+'.js');modules[name]={source:fs.readFileSync(file,'utf8'),uuid:read(file+'.meta').uuid};}
  const smoke=fs.readFileSync(path.join(__dirname,'engine-smoke.js'),'utf8');
  const server=http.createServer((req,res)=>{
    try{const route=decodeURIComponent(new URL(req.url,'http://localhost').pathname);let file;
      if(route==='/'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><html><body style="margin:0;background:#141c28"><canvas id="GameCanvas" width="512" height="320"></canvas><script src="/engine.js"></script><script src="/boot.js"></script></body></html>');return;}
      if(route==='/boot.js'){res.setHeader('Content-Type','application/javascript');res.end(boot(false));return;}
      if(route==='/engine.js')file=path.join(engine,'resources/engine/bin/cocos2d-js-for-preview.js');
      else if(route.startsWith('/internal/')){file=path.resolve(internal,route.slice(10));if(!file.startsWith(internal+path.sep))throw Error('Invalid built-in path');}
      else if(route.startsWith('/asset/assets/')){file=path.resolve(root,route.slice(7));if(!file.startsWith(path.join(root,'assets')+path.sep)||!file.endsWith('.png'))throw Error('Invalid image path');}
      if(!file)throw Error('Unknown test route');res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':file.endsWith('.png')?'image/png':'application/json');res.end(fs.readFileSync(file));
    }catch(error){res.writeHead(404).end(String(error));}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port;
  const input={base,catalog:read(path.join(root,'assets/resources/projectiles/catalog.json')),modules};input.catalog.assignments={};
  function boot(native){return 'var __hkdDone=false;\n'+(native?'jsb.AudioEngine.stopAll();jsb.AudioEngine.play2d=function(){return -1;};if(!jsb.fileUtils)require('+JSON.stringify(path.join(engine,'resources/builtin/jsb-adapter/bin/jsb-builtin.js').replace(/\\/g,'/'))+');require('+JSON.stringify(path.join(engine,'resources/engine/bin/cocos2d-jsb-for-preview.js').replace(/\\/g,'/'))+');require('+JSON.stringify(path.join(engine,'resources/builtin/jsb-adapter/bin/jsb-engine.js').replace(/\\/g,'/'))+');\n':'')+'cc.audioEngine.play=function(){return -1;};cc.audioEngine.playMusic=function(){return -1;};cc.audioEngine.playEffect=function(){return -1;};cc.assetManager.init({});\n'+smoke+'\ncc.assetManager.loadBundle('+JSON.stringify(base+'/internal')+',function(error){if(error){finish({ok:false,errors:[String(error)]});return;}cc.game.run({id:"GameCanvas",debugMode:1,frameRate:60,renderMode:2,groupList:["default"],collisionMatrix:[[false]]},function(){cc.view.setDesignResolutionSize(512,320,cc.ResolutionPolicy.SHOW_ALL);projectileEngineSmoke('+JSON.stringify(input)+').then(finish,function(error){finish({ok:false,errors:[String(error),error.stack]});});});});function finish(report){'+(native?'(jsb.fileUtils||jsb.FileUtils.getInstance()).writeStringToFile(JSON.stringify(report,null,2),'+JSON.stringify(path.join(out,'native-result.json').replace(/\\/g,'/'))+');':'window.__hkdReport=report;')+'__hkdDone=true;}';}
  let browser,sim;
  try{
    let browserResult={ok:true,skipped:true},errors=[];
    if(!process.argv.includes('--native-only')){
    const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright-core');browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--mute-audio','--autoplay-policy=user-gesture-required']});
    const page=await browser.newPage({viewport:{width:512,height:320}});page.on('pageerror',error=>errors.push(error.message));
    await page.goto(base);await page.waitForFunction(()=>window.__hkdReport,{timeout:180000});browserResult=await page.evaluate(()=>window.__hkdReport);browserResult.pageErrors=errors;fs.writeFileSync(path.join(out,'browser-result.json'),JSON.stringify(browserResult,null,2));await page.screenshot({path:path.join(out,'browser-projectiles.png')});console.log('Browser:',browserResult.ok,browserResult.checks&&browserResult.checks.length,browserResult.errors);
    await browser.close();browser=null;
    }
    const native=path.join(out,'native');fs.mkdirSync(path.join(native,'writable/gamecaches'),{recursive:true});fs.writeFileSync(path.join(native,'writable/gamecaches/cacheList.json'),JSON.stringify({files:{},version:'1.1'}));fs.mkdirSync(path.join(native,'jsb-adapter'),{recursive:true});fs.copyFileSync(path.join(engine,'resources/builtin/jsb-adapter/bin/jsb-builtin.js'),path.join(native,'jsb-adapter/jsb-builtin.js'));fs.writeFileSync(path.join(native,'main.js'),boot(true));fs.writeFileSync(path.join(native,'config.json'),JSON.stringify({init_cfg:{isLandscape:true,isWindowTop:false,waitForConnect:false,name:'Muted projectile verification',width:512,height:320,entry:'main.js'}}));
    const logfile=fs.openSync(path.join(out,'native.stdout.log'),'w');
    sim=spawn(path.join(engine,'resources/cocos2d-x/simulator/win32/simulator.exe'),['-workdir',native,'-writable-path',path.join(native,'writable'),'-entry','main.js','-resolution','512x320','-position','-20000,-20000','-console','disable','-write-debug-log',path.join(out,'native.log')],{cwd:native,windowsHide:true,stdio:['ignore',logfile,logfile]});fs.closeSync(logfile);
    const resultFile=path.join(out,'native-result.json');for(let i=0;i<1800&&!fs.existsSync(resultFile);i++){if(sim.exitCode!==null)throw Error('Simulator exited '+sim.exitCode+' before producing its report');await new Promise(resolve=>setTimeout(resolve,100));}
    if(!fs.existsSync(resultFile))throw Error('Simulator verification timed out');const nativeResult=read(resultFile);console.log('Simulator:',nativeResult.ok,nativeResult.checks&&nativeResult.checks.length,nativeResult.errors);if(!browserResult.ok||!nativeResult.ok||errors.length)process.exitCode=1;
  }finally{if(browser)await browser.close();if(sim&&sim.exitCode===null)sim.kill();await new Promise(resolve=>server.close(resolve));}
}
if(require.main===module)main().catch(error=>{console.error(error.stack);process.exitCode=1;});
