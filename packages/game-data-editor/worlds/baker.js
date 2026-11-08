'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const Legacy=require('./legacy'),Terrain=require('./terrain');
function plist(image,frames){const escape=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');const keys=frames.map(f=>'<key>'+escape(f.name)+'</key><dict><key>frame</key><string>{{'+f.trimX+','+f.trimY+'},{'+f.width+','+f.height+'}}</string><key>offset</key><string>{0,0}</string><key>rotated</key><false/><key>trimmed</key><true/><key>sourceSize</key><string>{'+f.width+','+f.height+'}</string></dict>').join('');return '<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0"><dict><key>frames</key><dict>'+keys+'</dict><key>metadata</key><dict><key>format</key><integer>2</integer><key>realTextureFileName</key><string>'+escape(image.name)+'.png</string><key>textureFileName</key><string>'+escape(image.name)+'.png</string><key>size</key><string>{'+image.width+','+image.height+'}</string></dict></dict></plist>\n';}
function uuid(key){const h=crypto.createHash('sha256').update('hkd-world-builder-v1:'+key).digest('hex');return h.slice(0,8)+'-'+h.slice(8,12)+'-4'+h.slice(13,16)+'-a'+h.slice(17,20)+'-'+h.slice(20,32);}
function meta(name,w,h,frames,key){const textureUuid=uuid(key+':texture'),subMetas={};for(const frame of frames||[{name,width:w,height:h,trimX:0,trimY:0}])subMetas[frame.name]={ver:'1.0.6',uuid:uuid(key+':'+frame.name),importer:'sprite-frame',rawTextureUuid:textureUuid,trimType:'custom',trimThreshold:1,rotated:false,offsetX:0,offsetY:0,trimX:frame.trimX||0,trimY:frame.trimY||0,width:frame.width,height:frame.height,rawWidth:frame.width,rawHeight:frame.height,borderTop:0,borderBottom:0,borderLeft:0,borderRight:0,subMetas:{}};return {ver:'2.3.7',uuid:textureUuid,importer:'texture',type:'sprite',wrapMode:'clamp',filterMode:'bilinear',premultiplyAlpha:false,genMipmaps:false,packable:false,width:w,height:h,platformSettings:{},subMetas};}
function spec(root,map,library){const images={},wanted=new Set();for(const layer of map.layers)if(!layer.hidden)for(const o of layer.objects){if(o.legacy)o.legacy.sprites.forEach(s=>wanted.add(s.frame));else wanted.add(o.assetId);}if(map.legacyGround)map.legacyGround.sprites.forEach(s=>wanted.add(s.frame));for(const layer of require('./model').groundLayers(map)){if(layer.baseAsset)wanted.add(layer.baseAsset);for(const s of layer.strokes||[])for(const id of Terrain.strokeAssets(s))wanted.add(id);for(const o of layer.images||[])wanted.add(o.assetId);}for(const tile of map.ground.foundation.tiles||[])wanted.add(tile.assetId);for(const a of library)if(wanted.has(a.id))images[a.id]=a;for(const id of Object.keys(map.images||{}))if(wanted.has(id))images[id]=map.images[id];for(const id of wanted)if(!images[id])throw Error('Missing source image '+id+'. Refresh the map sources before saving.');return {map,images};}
async function renderElectron(spec,artifacts){
 const electron=require('electron'),BrowserWindow=electron.BrowserWindow||(electron.remote&&electron.remote.BrowserWindow);
 if(!BrowserWindow)throw Error('Baking requires Cocos Creator.');
 const win=new BrowserWindow({show:false,width:64,height:64,webPreferences:{nodeIntegration:false,contextIsolation:false,webSecurity:false,backgroundThrottling:false}});
 let timer,fail;
 const stopped=new Promise((resolve,reject)=>{fail=reject;}),crashed=()=>fail(Error('The map bake renderer stopped unexpectedly.')),closed=()=>fail(Error('The map bake renderer was closed.'));
 win.webContents.once('render-process-gone',crashed);win.once('closed',closed);
 try{
  win.webContents.setAudioMuted(true);
  const renderer=spec.mode==='stage07-source'?fs.readFileSync(path.join(__dirname,'../../../tools/maps/bake-renderer.js'),'utf8').replace("picture('/input/' + key)",'picture(spec.images[key])'):['alpha-contours.js','roads.js','paint.js'].map(name=>fs.readFileSync(path.join(__dirname,name),'utf8')).join('\n;\n');
  const html='<!doctype html><meta charset="utf-8"><script>'+renderer+'</script>',file=path.join(artifacts,'baker-'+crypto.randomBytes(8).toString('hex')+'.html');
  fs.mkdirSync(artifacts,{recursive:true});fs.writeFileSync(file,html);
  timer=setTimeout(()=>fail(Error('Bake renderer startup timed out')),15000);
  const rendering=(async()=>{
   await win.loadURL(require('url').pathToFileURL(file).href);
   clearTimeout(timer);timer=setTimeout(()=>fail(Error('Map baking timed out. Reduce the map or source image size and retry.')),180000);
   return win.webContents.executeJavaScript((spec.mode==='stage07-source'?'window.bakeMap(':'WorldPaint.bake(')+JSON.stringify(spec)+')');
  })();
  return await Promise.race([rendering,stopped]);
 }finally{
  clearTimeout(timer);win.webContents.removeListener('render-process-gone',crashed);win.removeListener('closed',closed);
  if(!win.isDestroyed())win.destroy();
 }
}
function packageResult(map,result){const writes=[],directory='assets/KinghtFallIconMap/Generated/Maps/'+map.id,framesByAtlas={};for(const id of Object.keys(result.assets))for(const f of result.assets[id].frames){if(!framesByAtlas[f.atlas])framesByAtlas[f.atlas]=[];framesByAtlas[f.atlas].push(f);}for(const image of result.files){if(!/^[a-zA-Z0-9_-]+$/.test(image.name)||image.width>2048||image.height>2048)throw Error('Invalid baked texture');const file=directory+'/'+image.name+'.png',key=map.id+'/'+image.name,m=meta(image.name,image.width,image.height,framesByAtlas[image.name],key);let texture=m;if(framesByAtlas[image.name]){texture=Object.assign({},m,{type:'raw',subMetas:{}});const atlas={ver:'1.2.6',uuid:uuid(key+':atlas'),importer:'sprite-atlas',rawTextureUuid:m.uuid,size:{width:image.width,height:image.height},type:'Texture Packer',subMetas:m.subMetas};writes.push({file:directory+'/'+image.name+'.plist',bytes:Buffer.from(plist(image,framesByAtlas[image.name]))},{file:directory+'/'+image.name+'.plist.meta',bytes:Buffer.from(JSON.stringify(atlas,null,2)+'\n')});}writes.push({file,bytes:Buffer.from(image.png.slice(image.png.indexOf(',')+1),'base64')},{file:file+'.meta',bytes:Buffer.from(JSON.stringify(texture,null,2)+'\n')});for(const g of result.ground)if(g.name===image.name)g.frameUuid=m.subMetas[image.name].uuid;for(const id of Object.keys(result.assets))for(const f of result.assets[id].frames)if(f.atlas===image.name)f.frameUuid=m.subMetas[f.name].uuid;}
 return {writes,ground:result.ground,assets:result.assets,thumbnail:directory+'/thumbnail.png',thumbnailUuid:uuid(map.id+'/thumbnail:thumbnail')};}
async function bake(root,map,library,options){
 const prepared=spec(root,map,library),sources=new Map(),fileURLToPath=require('url').fileURLToPath;
 const revision=file=>fs.existsSync(file)?Legacy.hash(fs.readFileSync(file)):null;
 for(const image of Object.values(prepared.images)){
  if(typeof image.url!=='string'||!/^file:/i.test(image.url))continue;
  const file=fileURLToPath(image.url);
  for(const source of [file,file+'.meta'])if(!sources.has(source))sources.set(source,revision(source));
 }
 const result=await(options.render||renderElectron)(prepared,options.artifacts);
 for(const [file,before]of sources)if(revision(file)!==before)throw Error('Source artwork changed during baking: '+file+'. Your draft is retained; review the source and retry.');
 return packageResult(map,result);
}
module.exports={plist,uuid,meta,spec,renderElectron,packageResult,bake};
