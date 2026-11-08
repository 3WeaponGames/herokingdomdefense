'use strict';
const fs=require('fs'),path=require('path'),url=require('url'),crypto=require('crypto'),M=require('./model'),B=require('./blockers');
const clone=M.clone,hash=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),same=(a,b)=>JSON.stringify(a)===JSON.stringify(b),previews=new WeakMap();
function requestPrecision(request){let value=request.precision;if(value===undefined)value=request.detail===undefined?0:{precise:100,balanced:80,light:60}[request.detail];if(!Number.isInteger(value)||value<0||value>100)throw Error('Outline precision must be an integer from 0 to 100.');return value;}
function spec(service,request){
 if(!request||typeof request.key!=='string'||!request.key.startsWith('map:'))throw Error('Automatic blockers belong to Maps.');
 service.expect(request.version);if(!['paint','erase'].includes(request.op))throw Error('Choose Auto Paint or Auto Erase.');const precision=requestPrecision(request);
 if(!Array.isArray(request.layerIds)||!request.layerIds.length||request.layerIds.some(id=>typeof id!=='string'))throw Error('Select at least one object layer.');const map=service.doc(request.key).data,ids=Array.from(new Set(request.layerIds)),layers=ids.map(id=>{const layer=map.layers.find(l=>l.id===id);if(!layer)throw Error('A selected object layer was removed. Select the layers again.');return clone(layer);}),wanted=new Set();
 for(const layer of layers)for(const object of layer.objects||[]){if(object.legacy){for(const sprite of object.legacy.sprites||[])if(sprite.active!==false&&(!sprite.color||sprite.color.a===undefined||sprite.color.a>0))wanted.add(sprite.frame);}else if(object.opacity===undefined||object.opacity>0)wanted.add(object.assetId);}
 const library=service.index().library||[],sources=Object.assign({},service.images,map.images||{});for(const asset of library)sources[asset.id]=asset;const images={},revisions=new Map();
 for(const id of wanted){const image=sources[id];if(!image||!image.url)throw Error('Missing source artwork '+id+'. Restore or reimport the image before generating blockers.');images[id]=clone(image);let source;try{source=new URL(image.url);}catch(_){throw Error('Invalid source image '+id+'.');}if(source.protocol==='file:'){const file=url.fileURLToPath(source);if(!fs.existsSync(file))throw Error('A source image is missing. Restore it before generating blockers.');if(!revisions.has(file))revisions.set(file,hash(file));}else if(source.protocol!=='data:')throw Error('Automatic blockers require local or imported source images.');}
 const mask=clone(M.mapBlockerRegions(map));if(B.issues(mask).length)throw Error('The current blocker mask is invalid. Restore a valid map draft before generating outlines.');
 return {value:{layers,images,mask,op:request.op,precision},revisions};
}
async function renderElectron(value,artifacts){
 const electron=require('electron'),BrowserWindow=electron.BrowserWindow||(electron.remote&&electron.remote.BrowserWindow);if(!BrowserWindow)throw Error('Automatic artwork tracing requires Cocos Creator.');
 const win=new BrowserWindow({show:false,width:64,height:64,webPreferences:{nodeIntegration:false,contextIsolation:false,webSecurity:false,backgroundThrottling:false}});let timer;
 try{win.webContents.setAudioMuted(true);const scripts=['alpha-contours.js','roads.js','paint.js','vendor/polygon-clipping.js','auto-blocker-raster.js'].map(file=>fs.readFileSync(path.join(__dirname,file),'utf8'));fs.mkdirSync(artifacts,{recursive:true});const file=path.join(artifacts,'auto-blockers-'+Date.now()+'-'+crypto.randomBytes(4).toString('hex')+'.html');fs.writeFileSync(file,'<!doctype html><meta charset="utf-8">'+scripts.map(s=>'<script>'+s+'</script>').join(''));
  // One deadline covers startup as well as execution: a stalled navigation
  // must release its hidden renderer just like a stalled trace.
  return await Promise.race([(async()=>{await win.loadURL(url.pathToFileURL(file).href);return win.webContents.executeJavaScript('AutoBlockerRaster.render('+JSON.stringify(value)+')');})(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Automatic tracing took too long. Choose fewer layers or lower outline precision.')),120000);})]);
 }finally{clearTimeout(timer);if(!win.isDestroyed())win.destroy();}
}
async function generate(service,request){
 const prepared=spec(service,request),signature=crypto.createHash('sha256').update(JSON.stringify({key:request.key,version:request.version,value:prepared.value,revisions:Array.from(prepared.revisions)})).digest('hex'),cached=previews.get(service);
 let result,reused=false;if(cached&&cached.signature===signature){result=cached.result;reused=true;}else{const render=service.options&&service.options.autoBlockerRender||renderElectron;result=await render(prepared.value,service.artifacts);}
 service.expect(request.version);
 for(const [file,revision]of prepared.revisions)if(!fs.existsSync(file)||hash(file)!==revision)throw Error('Source artwork changed during tracing. Your map draft is preserved; generate the outlines again.');
 if(!result||!Array.isArray(result.mask)||B.issues(result.mask).length)throw Error('The generated blocker outline is invalid. Choose lower precision or fewer layers.');
 if(!reused)previews.set(service,{signature,result:clone(result)});
 return {prepared,result,stats:Object.assign({},result.stats,{op:request.op,precision:prepared.value.precision,layers:prepared.value.layers.length,reusedPreview:reused})};
}
async function preview(service,request){const generated=await generate(service,request);return {key:request.key,version:service.version,mask:clone(generated.result.mask),stats:generated.stats};}
async function apply(service,request){
 const generated=await generate(service,request),changed=!same(generated.result.mask,generated.prepared.value.mask);
 if(changed){const value=clone(service.doc(request.key).data);value.blockerMask=clone(generated.result.mask);service.change({key:request.key,version:request.version,value});previews.delete(service);}
 const snap=service.snapshot(request.key);snap.result={autoBlockers:Object.assign({},generated.stats,{changed}),saved:false,files:[]};return snap;
}
module.exports={spec,preview,apply,renderElectron,requestPrecision};
