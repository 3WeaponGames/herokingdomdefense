'use strict';
// Explicit integration verification, not part of the ordinary Node-only suite.
// Uses real Creator rendering/bindings with isolated stage-preview resources.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),cp=require('node:child_process'),os=require('node:os'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../..');
const engine=process.env.COCOS_CREATOR_ROOT||'C:/ProgramData/cocos/editors/Creator/2.4.13';
const slash=file=>file.replace(/\\/g,'/');
const read=file=>JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));

async function stageMonsterSmoke(input){
  var report={ok:false,engine:cc.ENGINE_VERSION,native:cc.sys.isNative,muted:true,modelCount:input.models.length,switches:0,skinCalls:0,invalidSkinCalls:0,resetObservations:0,checks:[],errors:[],methodSha256:input.methodSha256};
  function check(value,message){if(!value)throw Error(message);report.checks.push(message);}
  function skins(data){var rows=data&&data.skeletonJson&&data.skeletonJson.skins;return Array.isArray(rows)?rows.map(function(row){return row.name;}):Object.keys(rows||{});}
  function delay(ms){return new Promise(function(resolve){setTimeout(resolve,ms);});}
  var originalSetSkin=sp.Skeleton.prototype.setSkin;
  sp.Skeleton.prototype.setSkin=function(name){
    // Never use findSkin('') or deliberately enter a native assertion while
    // diagnosing. Validate against the same actual JSON before forwarding.
    if(typeof name!=='string'||!name||skins(this.skeletonData).indexOf(name)<0){report.invalidSkinCalls++;throw Error('Blocked unsafe skin call: '+JSON.stringify(name));}
    report.skinCalls++;return originalSetSkin.call(this,name);
  };
  var originalDataDescriptor=Object.getOwnPropertyDescriptor(sp.Skeleton.prototype,'skeletonData');
  if(!originalDataDescriptor||!originalDataDescriptor.get||!originalDataDescriptor.set)throw Error('Expected the real Creator skeletonData property');
  Object.defineProperty(sp.Skeleton.prototype,'skeletonData',{configurable:true,enumerable:originalDataDescriptor.enumerable,get:originalDataDescriptor.get,set:function(data){
    originalDataDescriptor.set.call(this,data);
    if(data&&this.defaultSkin==='')report.resetObservations++;
  }});
  try{
    var models={};
    for(var description of input.models){
      var data=new sp.SkeletonData();data._uuid='stage-skin-smoke:'+description.uuid;data.name=description.name;
      data.skeletonJson=description.json;data.atlasText=description.atlas;data.textureNames=description.pages.map(function(page){return page.name;});data.textures=[];
      for(var page of description.pages){
        var texture=await new Promise(function(resolve,reject){cc.assetManager.loadRemote(input.base+'/asset/'+page.image.split('/').map(encodeURIComponent).join('/'),{ext:'.png'},function(error,result){if(error)reject(error);else resolve(result);});});
        data.textures.push(texture);
      }
      models[description.prefab]={defaultSkin:description.defaultSkin,skeletonData:data};
      check(skins(data).indexOf(description.defaultSkin)>=0,description.name+' has its authored default skin');
    }
    var scene=new cc.Scene(),cameraNode=new cc.Node('stage-preview-camera');cameraNode.parent=scene;cameraNode.z=1000;
    var camera=cameraNode.addComponent(cc.Camera);camera.ortho=true;camera.orthoSize=110;camera.nearClip=.1;camera.farClip=2000;camera.backgroundColor=cc.color(24,32,42,255);camera.clearFlags=cc.Camera.ClearFlags.COLOR|cc.Camera.ClearFlags.DEPTH|cc.Camera.ClearFlags.STENCIL;
    var detail=new cc.Node('stage-info');detail.parent=scene;
    var node=new cc.Node('spAni');node.parent=detail;node.setPosition(0,-40);
    var renderer=node.addComponent(sp.Skeleton);renderer.defaultSkin='hong';
    cc.director.runSceneImmediate(scene);
    var jobs=[],manager={data:input.config,getSoldierCfgById:function(id){return input.config.SoldierCfg[id];}};
    var load=new Function('cc','sp','$z1KinghtFallDataMgr','$z1KinghtFallConfig','return ('+input.method+');')(cc,sp,{KinghtFallDataMgr:{getInstance:function(){return manager;}}},{KinghtFallBundelName:{Enemy:'fixture-enemies'}});
    var home={ndLevelInfo:detail,loadPrefab:function(bundle,name,done){jobs.push({name:name,done:done});}};
    function finish(job){var source=models[job.name];if(!source)throw Error('Unexpected prefab '+job.name);job.done({data:{getComponentInChildren:function(){return source;}}});}
    function select(stage){load.call(home,stage);finish(jobs.shift());report.switches++;var expected=manager.getSoldierCfgById({wqyl_bb:90001,wqyl_zbb:90002,wqyl_gb:90003,wqyl_qb:90004}[stage.EnemyAni]||90001);
      if(renderer.skeletonData!==models[expected.prefab].skeletonData||!renderer.defaultSkin||skins(renderer.skeletonData).indexOf(renderer.defaultSkin)<0||!node.active||renderer.animation!=='idle')throw Error('Incorrect active stage preview for '+stage.Level);
    }
    for(var variant of input.variants){
      for(var repetition=0;repetition<3;repetition++){
        for(var stage of variant.stages)select(stage);
        for(var stage of variant.stages.slice().reverse())select(stage);
      }
      check(true,variant.name+': all '+variant.stages.length+' stages switch forward and backward three times');
      // Deliver old requests after a newer one, matching rapid button presses.
      load.call(home,variant.stages[0]);load.call(home,variant.stages[1]);load.call(home,variant.stages[2]);
      var first=jobs.shift(),second=jobs.shift(),latest=jobs.shift();finish(latest);var current=renderer.skeletonData,skinCount=report.skinCalls;finish(second);finish(first);
      check(renderer.skeletonData===current&&report.skinCalls===skinCount,variant.name+': late prior loads leave the latest stage untouched');
    }
    check(report.invalidSkinCalls===0,'No empty or unknown skin was forwarded to Browser or native bindings');
    check(report.resetObservations>100,'Real Creator property reset occurred repeatedly during data swaps');
    check(report.skinCalls>=report.switches,'Successful switches explicitly restore a valid skin after data reset');
    await delay(150);camera.render();
    var capture=new cc.RenderTexture();capture.initWithSize(512,320);camera.targetTexture=capture;camera.render(scene);var pixels=capture.readPixels(),painted=0;
    if(pixels)for(var i=0;i<pixels.length;i+=4)if(pixels[i]>65||pixels[i+1]>65||pixels[i+2]>65)painted++;
    check(painted>500,'The real renderer draws the stage monster after repeated switches');report.paintedPixels=painted;camera.targetTexture=null;capture.destroy();report.ok=true;
  }catch(error){report.errors.push({message:String(error),stack:error.stack});}
  finally{sp.Skeleton.prototype.setSkin=originalSetSkin;Object.defineProperty(sp.Skeleton.prototype,'skeletonData',originalDataDescriptor);}
  return report;
}

function modelInputs(config){
  const assets=path.join(root,'assets'),index=new Map();
  function walk(folder){for(const entry of fs.readdirSync(folder,{withFileTypes:true})){const file=path.join(folder,entry.name);if(entry.isDirectory())walk(file);else if(entry.name.endsWith('.json.meta')){const meta=read(file);if(meta.importer==='spine')index.set(meta.uuid,file.slice(0,-5));}}}
  walk(path.join(assets,'resources/unit-library/runtime'));walk(path.join(assets,'KinghtFallEnemyAni'));
  return [90001,90002,90003,90004].map(id=>{
    const prefab=config.SoldierCfg[id].prefab,component=read(path.join(assets,'KinghtFallEnemy',prefab+'.prefab')).find(c=>c.__type__==='sp.Skeleton');
    if(!component||!component._N$skeletonData)throw Error('Missing authored stage model for '+id);
    const file=index.get(component._N$skeletonData.__uuid__);if(!file)throw Error('Missing skeleton UUID '+component._N$skeletonData.__uuid__);
    const atlas=fs.readFileSync(file.replace(/\.json$/,'.atlas'),'utf8'),lines=atlas.split(/\r?\n/),pages=[];
    lines.forEach((line,i)=>{if(line.trim()&&(!i||!lines[i-1].trim())&&/^(size|format):/.test((lines[i+1]||'').trim())){const image=path.resolve(path.dirname(file),line.trim());if(!image.startsWith(assets+path.sep))throw Error('Atlas page leaves assets');pages.push({name:line.trim(),image:slash(path.relative(root,image))});}});
    return {prefab,name:path.basename(file),uuid:component._N$skeletonData.__uuid__,defaultSkin:component.defaultSkin,json:read(file),atlas,pages};
  });
}

async function main(){
  const outputRoot=path.resolve(process.env.HKD_ARTIFACT_DIR||path.join(os.homedir(),'Documents/Codex Artifacts/HeroKingdomDefense/2026-11-07-stage-spine'));
  if(outputRoot===root||outputRoot.startsWith(root+path.sep))throw Error('Keep verification artifacts outside the repository');
  const out=path.join(outputRoot,'engine-'+Date.now());fs.mkdirSync(out,{recursive:true});
  const source=process.env.HKD_INTERNAL_BUNDLE||path.join(os.homedir(),'Documents/Codex Artifacts/HeroKingdomDefense/2026-11-07-projectiles/engine-final/internal'),internal=path.join(out,'internal');fs.cpSync(source,internal,{recursive:true});
  for(const name of ['config','index']){const extension=name==='config'?'.json':'.js';if(!fs.existsSync(path.join(internal,name+extension))){const match=fs.readdirSync(internal).find(f=>f.startsWith(name+'.')&&f.endsWith(extension));if(!match)throw Error('Missing exported internal '+name);fs.copyFileSync(path.join(internal,match),path.join(internal,name+extension));}}
  const sourceFile=path.join(root,'assets/_script/KinghtFallHomeBattleCtrl.js'),sourceText=fs.readFileSync(sourceFile,'utf8').replace(/\r\n/g,'\n'),start=sourceText.indexOf('_ctor.prototype.loadStageMonster = function '),begin=sourceText.indexOf('function ',start),end=sourceText.indexOf('\n  };',begin);
  if(start<0||begin<0||end<0)throw Error('Cannot locate the actual loadStageMonster function');
  const method=sourceText.slice(begin,end+4).replace(/;\s*$/,''),config=read(path.join(root,'assets/KinghtFallConfig/GameJsonCfg.json'));
  const input={config,models:modelInputs(config),variants:['A','B','D'].map(name=>({name,stages:read(path.join(root,'assets/KinghtFallConfig'+(name==='A'?'':name)+'/GameJsonCfg.json')).LevelCfg})),method,methodSha256:crypto.createHash('sha256').update(method).digest('hex')};
  let base;
  const server=http.createServer((req,res)=>{try{
    const route=decodeURIComponent(new URL(req.url,'http://localhost').pathname);let file;
    if(route==='/'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><meta charset="utf-8"><body style="margin:0"><canvas id="GameCanvas" width="512" height="320"></canvas><script src="/engine.js"></script><script src="/boot.js"></script>');return;}
    if(route==='/boot.js'){res.setHeader('Content-Type','application/javascript');res.end(boot(false));return;}
    if(route==='/engine.js')file=path.join(engine,'resources/engine/bin/cocos2d-js-for-preview.js');
    else if(route.startsWith('/internal/')){file=path.resolve(internal,route.slice(10));if(!file.startsWith(internal+path.sep))throw Error('Invalid internal resource');}
    else if(route.startsWith('/asset/assets/')){file=path.resolve(root,route.slice(7));if(!file.startsWith(path.join(root,'assets')+path.sep)||!file.endsWith('.png'))throw Error('Invalid atlas page');}
    if(!file)throw Error('Unknown route');res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':file.endsWith('.png')?'image/png':'application/json');res.end(fs.readFileSync(file));
  }catch(error){res.writeHead(404).end(String(error));}});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));base='http://127.0.0.1:'+server.address().port;input.base=base;
  function boot(native){return (native?'jsb.AudioEngine.stopAll();jsb.AudioEngine.play2d=function(){return -1;};if(!jsb.fileUtils)require('+JSON.stringify(slash(path.join(engine,'resources/builtin/jsb-adapter/bin/jsb-builtin.js')))+');require('+JSON.stringify(slash(path.join(engine,'resources/engine/bin/cocos2d-jsb-for-preview.js')))+');require('+JSON.stringify(slash(path.join(engine,'resources/builtin/jsb-adapter/bin/jsb-engine.js')))+');\n':'')+
    'cc.audioEngine.play=function(){return -1;};cc.audioEngine.playMusic=function(){return -1;};cc.audioEngine.playEffect=function(){return -1;};cc.assetManager.init({});\n'+stageMonsterSmoke.toString()+'\n'+
    'function finish(result){'+(native?'jsb.fileUtils.writeStringToFile(JSON.stringify(result,null,2),'+JSON.stringify(slash(path.join(out,'native-result.json')))+');':'window.__stageReport=result;')+'}\n'+
    'cc.assetManager.loadBundle('+JSON.stringify(base+'/internal')+',function(error){if(error){finish({ok:false,errors:[String(error)]});return;}cc.game.run({id:"GameCanvas",debugMode:1,frameRate:30,renderMode:2,groupList:["default"],collisionMatrix:[[false]]},function(){cc.view.setDesignResolutionSize(512,320,cc.ResolutionPolicy.SHOW_ALL);stageMonsterSmoke('+JSON.stringify(input)+').then(finish,function(error){finish({ok:false,errors:[String(error),error.stack]});});});});';}
  let browser,sim;try{
    const {chromium}=require(process.env.PLAYWRIGHT_MODULE||path.join(os.homedir(),'Documents/Codex Artifacts/HeroKingdomDefense/cleanup-2026-11-07/local/gear-concepts-20261107/browser/node_modules/playwright-core'));
    browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--mute-audio','--autoplay-policy=user-gesture-required']});const page=await browser.newPage({viewport:{width:512,height:320}}),errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.goto(base);await page.waitForFunction(()=>window.__stageReport,{timeout:180000});const web=await page.evaluate(()=>window.__stageReport);web.pageErrors=errors;fs.writeFileSync(path.join(out,'browser-result.json'),JSON.stringify(web,null,2));await page.screenshot({path:path.join(out,'browser-stage-preview.png')});console.log('Browser',JSON.stringify(web));await browser.close();browser=null;
    if(!web.ok||errors.length)throw Error('Browser regression failed; native run was not started');
    const native=path.join(out,'native');fs.mkdirSync(path.join(native,'writable/gamecaches'),{recursive:true});fs.mkdirSync(path.join(native,'jsb-adapter'),{recursive:true});fs.writeFileSync(path.join(native,'writable/gamecaches/cacheList.json'),JSON.stringify({files:{},version:'1.1'}));fs.copyFileSync(path.join(engine,'resources/builtin/jsb-adapter/bin/jsb-builtin.js'),path.join(native,'jsb-adapter/jsb-builtin.js'));fs.writeFileSync(path.join(native,'main.js'),boot(true));fs.writeFileSync(path.join(native,'config.json'),JSON.stringify({init_cfg:{isLandscape:true,isWindowTop:false,waitForConnect:false,name:'Muted stage skin verification',width:512,height:320,entry:'main.js'}}));
    const logfile=fs.openSync(path.join(out,'native.stdout.log'),'w');sim=cp.spawn(path.join(engine,'resources/cocos2d-x/simulator/win32/simulator.exe'),['-workdir',native,'-writable-path',path.join(native,'writable'),'-entry','main.js','-resolution','512x320','-position','-20000,-20000','-console','disable','-write-debug-log',path.join(out,'native.log')],{cwd:native,windowsHide:true,stdio:['ignore',logfile,logfile]});fs.closeSync(logfile);
    const result=path.join(out,'native-result.json');for(let i=0;i<1800&&!fs.existsSync(result);i++){if(sim.exitCode!==null)throw Error('Simulator exited '+sim.exitCode+' without a report');await new Promise(resolve=>setTimeout(resolve,100));}if(!fs.existsSync(result))throw Error('Simulator verification timed out');const nativeResult=read(result);console.log('Simulator',JSON.stringify(nativeResult));if(!nativeResult.ok)throw Error('Native stage verification failed');console.log('Artifacts:',out);
  }finally{if(browser)await browser.close();if(sim&&sim.exitCode===null)sim.kill();await new Promise(resolve=>server.close(resolve));}
}
if(require.main===module)main().catch(error=>{console.error(error.stack);process.exitCode=1;});
module.exports={modelInputs,stageMonsterSmoke};
