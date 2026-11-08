'use strict';
// Explicit, deterministic authoring command. Preview mode writes only artifacts.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http'),crypto=require('node:crypto');
const {spawn}=require('node:child_process');
const root=path.resolve(__dirname,'../..');
const digest=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function inside(base,file){const rel=path.relative(path.resolve(base),path.resolve(file));return rel!==''&&!rel.startsWith('..'+path.sep)&&rel!=='..'&&!path.isAbsolute(rel);}
function browserPath(){return process.env.HKD_MAP_BROWSER||['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Google/Chrome/Application/chrome.exe','/usr/bin/chromium','/usr/bin/google-chrome','/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].find(file=>fs.existsSync(file));}
function ensureAssetFolder(directory){if(fs.existsSync(directory))return;ensureAssetFolder(path.dirname(directory));const meta=directory+'.meta';if(!fs.existsSync(meta))fs.writeFileSync(meta,JSON.stringify({ver:'1.1.3',uuid:crypto.randomUUID(),importer:'folder',isBundle:false,bundleName:'',priority:1,compressionType:{},optimizeHotUpdate:{},inlineSpriteFrames:{},isRemoteBundle:{},subMetas:{}},null,2)+'\n');fs.mkdirSync(directory);}
function textureMeta(file,width,height){
 const metaFile=file+'.meta',old=fs.existsSync(metaFile)?JSON.parse(fs.readFileSync(metaFile,'utf8')):{},name=path.basename(file,'.png');
 const uuid=old.uuid||crypto.randomUUID(),frame=(old.subMetas&&old.subMetas[name])||{};
 return {...old,ver:'2.3.7',uuid,importer:'texture',type:'sprite',wrapMode:'clamp',filterMode:'bilinear',premultiplyAlpha:false,genMipmaps:false,packable:false,width,height,platformSettings:old.platformSettings||{},subMetas:{...old.subMetas,[name]:{...frame,ver:'1.0.6',uuid:frame.uuid||crypto.randomUUID(),importer:'sprite-frame',rawTextureUuid:uuid,trimType:'custom',trimThreshold:1,rotated:false,offsetX:0,offsetY:0,trimX:0,trimY:0,width,height,rawWidth:width,rawHeight:height,borderTop:0,borderBottom:0,borderLeft:0,borderRight:0,subMetas:frame.subMetas||{}}}};
}
async function bake(recipeFile,options={}){
 recipeFile=path.resolve(recipeFile);const recipe=JSON.parse(fs.readFileSync(recipeFile,'utf8')),base=path.dirname(recipeFile),images={};
 Object.entries(recipe.images).forEach(([key,rel])=>{const file=path.resolve(base,rel);if(!inside(base,file))throw Error('Source leaves recipe folder: '+rel);if(!fs.existsSync(file))throw Error('Missing source: '+rel);images[key]=file;});
 if(recipe.width%2||recipe.height%2||recipe.owners.length!==9)throw Error('Recipe needs even dimensions and nine terrain owners');
 const output=path.resolve(root,recipe.output);if(!inside(path.join(root,'assets'),output))throw Error('Production output must stay under assets');
 const artifacts=path.resolve(options.artifacts||process.env.HKD_ARTIFACT_DIR||path.join(os.homedir(),'Documents','Codex Artifacts','HeroKingdomDefense','map-bakes'));fs.mkdirSync(artifacts,{recursive:true});
 if(inside(root,artifacts))throw Error('Disposable artifacts must stay outside the project');
 const before={};if(fs.existsSync(output))for(const file of fs.readdirSync(output).filter(name=>name.endsWith('.png')))before[file]=digest(fs.readFileSync(path.join(output,file)));
 const thumbOutput=recipe.thumbnail&&path.resolve(root,recipe.thumbnail.output);
 if(thumbOutput&&!inside(path.join(root,'assets'),thumbOutput))throw Error('Thumbnail output must stay under assets');
 const thumbBefore=thumbOutput&&fs.existsSync(thumbOutput)?digest(fs.readFileSync(thumbOutput)):null;
 const spec={...recipe,images:Object.fromEntries(Object.keys(images).map(key=>[key,key]))};
 const renderer=fs.readFileSync(path.join(__dirname,'bake-renderer.js'),'utf8');
 const server=http.createServer((req,res)=>{const route=new URL(req.url,'http://localhost').pathname;if(route==='/'){res.setHeader('content-type','text/html');res.end('<!doctype html><meta charset="utf-8"><script>'+renderer+'</script><script>window.bakeReady=true;</script>');return;}const key=decodeURIComponent(route.replace(/^\/input\//,''));if(images[key]){res.setHeader('content-type','image/png');fs.createReadStream(images[key]).pipe(res);}else res.writeHead(404).end();});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const executable=options.browser||browserPath();if(!executable){server.close();throw Error('Set HKD_MAP_BROWSER to a Chromium browser executable.');}
 const profile=path.join(os.tmpdir(),'hkd-map-bake-'+process.pid+'-'+Date.now()),log=fs.openSync(path.join(artifacts,'bake-browser.log'),'a');
 const processBrowser=spawn(executable,['--headless=new','--mute-audio','--no-first-run','--no-default-browser-check','--disable-background-networking','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{windowsHide:true,stdio:['ignore',log,log]});fs.closeSync(log);
 let error,ws,send;processBrowser.on('error',e=>{error=e;});
 try{
  const active=path.join(profile,'DevToolsActivePort');for(let i=0;i<100&&!fs.existsSync(active);i++){if(error)throw error;await sleep(100);}if(!fs.existsSync(active))throw Error('Muted bake browser did not start');
  const port=fs.readFileSync(active,'utf8').split(/\r?\n/)[0],targets=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json(),target=targets.find(t=>t.type==='page');
  ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});let id=0;const pending=new Map();
  ws.onmessage=event=>{const message=JSON.parse(event.data);if(message.id&&pending.has(message.id)){const item=pending.get(message.id);pending.delete(message.id);clearTimeout(item.timer);message.error?item.reject(Error(JSON.stringify(message.error))):item.resolve(message.result);}};
  send=(method,params={})=>new Promise((resolve,reject)=>{const token=++id,timer=setTimeout(()=>{pending.delete(token);reject(Error('Timed out: '+method));},45000);pending.set(token,{resolve,reject,timer});ws.send(JSON.stringify({id:token,method,params}));});
  const evaluate=async expression=>{const reply=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(reply.exceptionDetails)throw Error(JSON.stringify(reply.exceptionDetails));return reply.result.value;};
  await send('Page.enable');await send('Runtime.enable');await send('Page.navigate',{url:'http://127.0.0.1:'+server.address().port+'/'});
  for(let i=0;i<100;i++){if(await evaluate('window.bakeReady===true'))break;await sleep(50);}
  const result=await evaluate('window.bakeMap('+JSON.stringify(spec)+')'),files=[];
  const destination=options.write?output:path.join(artifacts,'preview-bake');if(options.write)ensureAssetFolder(destination);else fs.mkdirSync(destination,{recursive:true});
  for(const image of result.files){
   if(!/^stage07-[a-z0-9-]+\.png$/.test(image.name)||image.width>2048||image.height>2048)throw Error('Invalid baked texture: '+image.name);
   const file=path.join(destination,image.name),bytes=Buffer.from(image.png.split(',')[1],'base64');
   if(options.write&&fs.existsSync(file)&&digest(fs.readFileSync(file))!==before[image.name])throw Error('Concurrent image edit; bake cancelled: '+image.name);
   let meta;if(options.write){meta=textureMeta(file,image.width,image.height);if(fs.existsSync(file)&&digest(fs.readFileSync(file))!==digest(bytes)){const backup=path.join(artifacts,'bake-backups',Date.now()+'-'+image.name);fs.mkdirSync(path.dirname(backup),{recursive:true});fs.copyFileSync(file,backup);}if(!fs.existsSync(file+'.meta')||JSON.stringify(JSON.parse(fs.readFileSync(file+'.meta')))!==JSON.stringify(meta))fs.writeFileSync(file+'.meta',JSON.stringify(meta,null,2)+'\n');}
   if(!fs.existsSync(file)||digest(fs.readFileSync(file))!==digest(bytes))fs.writeFileSync(file,bytes);const {png,...info}=image;
   files.push({...info,path:path.relative(root,file).split(path.sep).join('/'),sha256:digest(bytes),bytes:bytes.length,...(meta?{textureUuid:meta.uuid,frameUuid:meta.subMetas[path.basename(file,'.png')].uuid}:{})});
  }
  fs.writeFileSync(path.join(artifacts,'stage07-terrain-preview.png'),Buffer.from(result.preview.split(',')[1],'base64'));
  let thumbnail=null;
  if(result.thumbnail){
   const file=options.write?thumbOutput:path.join(artifacts,'stage07-thumbnail-preview.png'),bytes=Buffer.from(result.thumbnail.split(',')[1],'base64');
   if(options.write&&((fs.existsSync(file)?digest(fs.readFileSync(file)):null)!==thumbBefore))throw Error('Concurrent thumbnail edit; bake cancelled');
   let meta;if(options.write){ensureAssetFolder(path.dirname(file));meta=textureMeta(file,recipe.thumbnail.width,recipe.thumbnail.height);if(!fs.existsSync(file+'.meta')||JSON.stringify(JSON.parse(fs.readFileSync(file+'.meta')))!==JSON.stringify(meta))fs.writeFileSync(file+'.meta',JSON.stringify(meta,null,2)+'\n');}
   if(!fs.existsSync(file)||digest(fs.readFileSync(file))!==digest(bytes))fs.writeFileSync(file,bytes);thumbnail={path:path.relative(root,file),sha256:digest(bytes),...(meta?{frameUuid:meta.subMetas[path.basename(file,'.png')].uuid}:{})};
  }
  const report={recipe:path.relative(root,recipeFile),write:!!options.write,files,thumbnail,props:result.props,atlas:result.atlas,textureMiB:files.reduce((sum,f)=>sum+f.width*f.height*4,0)/1048576};
  fs.writeFileSync(path.join(artifacts,'bake-report.json'),JSON.stringify(report,null,2)+'\n');
  await send('Browser.close').catch(()=>{});return report;
 }finally{
  if(ws)ws.close();for(let i=0;i<30&&processBrowser.exitCode===null;i++)await sleep(100);if(processBrowser.exitCode===null)processBrowser.kill();
  server.closeAllConnections();await new Promise(resolve=>server.close(resolve));
  if(!inside(os.tmpdir(),profile)||!path.basename(profile).startsWith('hkd-map-bake-'))throw Error('Unsafe temporary profile path');
  try{fs.rmSync(profile,{recursive:true,force:true,maxRetries:3,retryDelay:150});}catch(_){}
 }
}
module.exports={bake,inside,textureMeta};
if(require.main===module){const args=process.argv.slice(2),recipe=args.find(arg=>!arg.startsWith('--'));if(!recipe)throw Error('Usage: node tools/maps/bake-map.cjs tools/maps/stage07/recipe.json [--write]');bake(recipe,{write:args.includes('--write')}).then(report=>console.log(JSON.stringify({files:report.files.length,props:report.props,textureMiB:Number(report.textureMiB.toFixed(2)),write:report.write}))).catch(error=>{console.error(error.stack);process.exitCode=1;});}
