'use strict';
// Render prepared, data-only Spine projectiles with Creator's own renderer.
// Publication is a separate revision-checked importer operation. All captures
// and the staging tree stay outside the project; no game or audio is started.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),crypto=require('node:crypto');
const ROOT=path.resolve(__dirname,'../..'),LIBRARY='assets/resources/projectiles/spine/library.json';
const digest=data=>crypto.createHash('sha256').update(data).digest('hex');
function outside(value,label){const result=path.resolve(value);if(result===ROOT||result.startsWith(ROOT+path.sep))throw Error(label+' must be outside the project.');return result;}
function sampleTimes(duration,fps=120){if(!(duration>0&&duration<=30))throw Error('Invalid flight-loop duration');const count=Math.max(2,Math.ceil(duration*fps));return Array.from({length:count},(_,i)=>duration*i/count);}
function frameDifference(a,b){if(a.length!==b.length||a.length%4)throw Error('Mismatched RGBA frames');let delta=0;for(let i=0;i<a.length;i+=4){const aa=a[i+3]/255,ba=b[i+3]/255;delta+=Math.abs(a[i]*aa-b[i]*ba)+Math.abs(a[i+1]*aa-b[i+1]*ba)+Math.abs(a[i+2]*aa-b[i+2]*ba)+Math.abs(a[i+3]-b[i+3]);}return delta/(a.length*255);}
async function bake(stage,artifacts){
  stage=outside(stage,'Staging');artifacts=outside(artifacts,'Artifacts');fs.mkdirSync(artifacts,{recursive:true});
  const file=path.join(stage,LIBRARY),before=fs.readFileSync(file),library=JSON.parse(before),Units=require('../../packages/game-data-editor/lib/unit-assets');
  if(library.assets.length!==67)throw Error('Expected all 67 visible Spine projectile clips');
  const runtime=fs.readFileSync(Units.enginePath(),'utf8'),renderer=fs.readFileSync(path.join(ROOT,'packages/game-data-editor/preview/spine-renderer.js'),'utf8');
  const server=http.createServer((req,res)=>{try{const route=new URL(req.url,'http://127.0.0.1').pathname;let bytes,type='application/javascript';if(route==='/') {type='text/html';bytes='<!doctype html><html><body><script src="/runtime.js"></script><script src="/renderer.js"></script></body></html>';}
    else if(route==='/runtime.js')bytes='(function(){var module={exports:{}};'+runtime+';window.spine=module.exports;})();';
    else if(route==='/renderer.js')bytes='(function(){var module={exports:{}};'+renderer+';window.renderer=module.exports;})();';
    else if(route.startsWith('/asset/')){const target=path.resolve(stage,decodeURIComponent(route.slice(7)));if(!target.startsWith(stage+path.sep)||! /\.(png|json|atlas)$/.test(target))throw Error('Unknown staged asset');bytes=fs.readFileSync(target);type=target.endsWith('.png')?'image/png':target.endsWith('.json')?'application/json':'text/plain';}
    else{res.writeHead(404);res.end();return;}res.writeHead(200,{'Content-Type':type,'Cache-Control':'no-store'});res.end(bytes);
  }catch(error){res.writeHead(400);res.end(error.message);}});
  let browser;const report={started:new Date().toISOString(),preparedLibrarySha256:digest(before),runtimeJsonSha256:{},entries:[],errors:[]};
  for(const asset of library.assets){const relative='assets/'+(asset.bundle||'resources')+'/'+asset.resource+'.json';report.runtimeJsonSha256[relative]=digest(fs.readFileSync(path.join(stage,relative)));}
  try{
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright-core');browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--mute-audio']});
    const page=await browser.newPage();page.on('pageerror',e=>report.errors.push(e.message));await page.goto('http://127.0.0.1:'+server.address().port,{waitUntil:'networkidle'});
    await page.evaluate(()=>{window.__rigs=new Map();});
    for(const asset of library.assets){
      const times=sampleTimes(asset.duration),result=await page.evaluate(async({asset,times})=>{
        const url=p=>'/asset/'+p.split('/').map(encodeURIComponent).join('/');
        const resource='assets/'+(asset.bundle||'resources')+'/'+asset.resource,key=resource+':'+(asset.skin||'');let layers=window.__rigs.get(key);
        if(!layers){const json=await fetch(url(resource+'.json')).then(r=>r.json()),atlas=await fetch(url(resource+'.atlas')).then(r=>r.text()),lines=atlas.split(/\r?\n/),pages={};for(let i=0;i<lines.length;i++)if(lines[i].trim()&&(!i||!lines[i-1].trim())&&/^(size|format):/.test((lines[i+1]||'').trim()))pages[lines[i].trim()]=url(resource.slice(0,resource.lastIndexOf('/')+1)+lines[i].trim());layers=await renderer.createLayers(spine,[{json,atlas,pages,skin:asset.skin,name:asset.id,x:0,y:0,scaleX:1,scaleY:1,rotation:0}]);window.__rigs.set(key,layers);}
        for(const layer of layers)layer.description.rotation=0;
        const clip=layers[0].data.findAnimation(asset.animation);if(!clip||Math.abs(clip.duration-asset.duration)>1e-4)throw Error('Loop duration mismatch '+asset.id);
        let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
        const include=()=>{for(const layer of layers)for(const g of renderer.geometry(spine,layer)){if(g.color.a<=1/255)continue;for(let i=0;i<g.vertices.length;i+=2){const p=renderer.transformPoint(layer.description,g.vertices[i],g.vertices[i+1]);minX=Math.min(minX,p.x);minY=Math.min(minY,p.y);maxX=Math.max(maxX,p.x);maxY=Math.max(maxY,p.y);}}};
        for(const time of times){renderer.seek(spine,layers,asset.animation,time,false);include();}
        if(!Number.isFinite(minX)||maxX<=minX||maxY<=minY)throw Error('No visible geometry '+asset.id);
        const nativeBounds={x:minX,y:minY,width:maxX-minX,height:maxY-minY},nativeWidth=Math.max(nativeBounds.width,nativeBounds.height);for(const layer of layers)layer.description.rotation=asset.rotation||0;
        minX=minY=Infinity;maxX=maxY=-Infinity;for(const time of times){renderer.seek(spine,layers,asset.animation,time,false);include();}
        const bounds={minX,minY,maxX,maxY,width:maxX-minX,height:maxY-minY},canvas=document.createElement('canvas');canvas.width=canvas.height=128;const ctx=canvas.getContext('2d',{willReadFrequently:true}),scale=112/Math.max(bounds.width,bounds.height),cx=(minX+maxX)/2,cy=(minY+maxY)/2;
        function frame(time,loop=true){renderer.seek(spine,layers,asset.animation,time,loop);ctx.clearRect(0,0,128,128);ctx.save();ctx.translate(64,64);ctx.scale(scale,-scale);ctx.translate(-cx,-cy);renderer.drawWorld(spine,ctx,layers);ctx.restore();return ctx.getImageData(0,0,128,128).data;}
        function delta(a,b){let sum=0;for(let i=0;i<a.length;i+=4){const x=a[i+3]/255,y=b[i+3]/255;sum+=Math.abs(a[i]*x-b[i]*y)+Math.abs(a[i+1]*x-b[i+1]*y)+Math.abs(a[i+2]*x-b[i+2]*y)+Math.abs(a[i+3]-b[i+3]);}return sum/(a.length*255);}
        // Warm texture/tint raster caches before measuring the animation. A
        // first-ever Canvas image draw is not a loop-boundary comparison.
        frame(0);frame(0);
        const frames=times.map(t=>new Uint8ClampedArray(frame(t))),energies=frames.map(p=>{let n=0;for(let i=3;i<p.length;i+=4)n+=p[i];return n;}),best=energies.indexOf(Math.max(...energies));
        if(Math.min(...energies)<=0)throw Error('Blank loop frame '+asset.id);
        const steps=frames.slice(1).map((p,i)=>delta(frames[i],p)),seam=delta(frames[frames.length-1],frames[0]),endFrame=new Uint8ClampedArray(frame(asset.duration,false)),startRedraw=new Uint8ClampedArray(frame(0,false)),end=delta(endFrame,frames[0]),redraw=delta(startRedraw,frames[0]),currentEnd=delta(endFrame,startRedraw);
        // Compare inside a source frame, not exactly on a discrete attachment
        // boundary where normal floating-point modulo can select either side.
        const phase=Math.min(asset.duration-1e-6,times[best]+Math.min(1/600,asset.duration/100));
        const phaseFrame=new Uint8ClampedArray(frame(phase,true)),repeat=delta(frame(phase+asset.duration*3,true),phaseFrame);
        frame(times[best]);const thumbnail=canvas.toDataURL('image/png');
        const strip=document.createElement('canvas');strip.width=128*5;strip.height=128;const stripContext=strip.getContext('2d');for(const [i,time]of [asset.duration-2/120,asset.duration-1/120,asset.duration,asset.duration+1/120,asset.duration+2/120].entries()){frame(Math.max(0,time));stripContext.drawImage(canvas,i*128,0);}
        return {width:nativeWidth,height:bounds.height,nativeBounds,previewBounds:bounds,thumbnailTime:times[best],thumbnail,seamStrip:strip.toDataURL('image/png'),metrics:{samples:times.length,minAlphaEnergy:Math.min(...energies),maxAlphaEnergy:Math.max(...energies),seamDifference:seam,maxInternalDifference:Math.max(...steps,0),endpointDifference:end,startRedrawDifference:redraw,currentEndpointDifference:currentEnd,threeCycleDifference:repeat}};
      },{asset,times});
      // Spine's Float32 keyframes can move a closing vertex by a few ULPs.
      // Permit subpixel antialias rounding (0.026/255 mean channel error),
      // while repeated interior poses must still render identically.
      if(result.metrics.currentEndpointDifference>1e-4||result.metrics.threeCycleDifference>1e-6)throw Error('Non-repeating loop '+asset.id+': '+JSON.stringify(result.metrics));
      const thumbnail=Buffer.from(result.thumbnail.split(',')[1],'base64'),target=path.resolve(stage,asset.thumbnail);if(!target.startsWith(stage+path.sep)||!asset.thumbnail.endsWith('.png'))throw Error('Unsafe thumbnail');fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,thumbnail);
      Object.assign(asset,{width:result.width,height:result.height,previewBounds:result.previewBounds,thumbnailTime:result.thumbnailTime,thumbnailSha256:digest(thumbnail)});
      fs.writeFileSync(path.join(artifacts,asset.id.replace(/[^a-z0-9_-]/gi,'_')+'-seam.png'),Buffer.from(result.seamStrip.split(',')[1],'base64'));report.entries.push({id:asset.id,resource:asset.resource,animation:asset.animation,duration:asset.duration,nativeBounds:result.nativeBounds,...result.metrics,thumbnailSha256:asset.thumbnailSha256});
      process.stdout.write('Rendered '+report.entries.length+'/67 '+asset.id+'\n');
    }
    const gallery=await page.evaluate(async assets=>{const cols=8,cell=144,canvas=document.createElement('canvas');canvas.width=cols*cell;canvas.height=Math.ceil(assets.length/cols)*156;const ctx=canvas.getContext('2d');ctx.fillStyle='#192432';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.font='12px sans-serif';ctx.textAlign='center';for(const [i,asset]of assets.entries()){const image=new Image();image.src='/asset/'+asset.thumbnail.split('/').map(encodeURIComponent).join('/');await image.decode();const x=i%cols*cell,y=Math.floor(i/cols)*156;ctx.drawImage(image,x+8,y+4,128,128);ctx.fillStyle='#e7edf6';ctx.fillText(asset.name,x+72,y+148,140);}return canvas.toDataURL('image/png');},library.assets);
    fs.writeFileSync(path.join(artifacts,'spine-projectiles-contact.png'),Buffer.from(gallery.split(',')[1],'base64'));
    if(report.errors.length)throw Error(report.errors.join('\n'));if(!fs.readFileSync(file).equals(before))throw Error('Prepared library changed while rendering');
    for(const [relative,hash]of Object.entries(report.runtimeJsonSha256))if(digest(fs.readFileSync(path.join(stage,relative)))!==hash)throw Error('Prepared skeleton changed while rendering');
    fs.writeFileSync(file,JSON.stringify(library,null,2)+'\n');report.ok=true;
  }finally{report.finished=new Date().toISOString();fs.writeFileSync(path.join(artifacts,'spine-preview-bake.json'),JSON.stringify(report,null,2));try{if(browser)await browser.close();}finally{await new Promise(resolve=>server.close(resolve));}}
  return report;
}
if(require.main===module){const args=process.argv.slice(2),arg=name=>args[args.indexOf(name)+1];if(!args.includes('--stage')||!args.includes('--artifacts'))throw Error('Usage: node bake-spine-previews.cjs --stage <external staging> --artifacts <external captures>');bake(arg('--stage'),arg('--artifacts')).catch(e=>{console.error(e.stack);process.exitCode=1;});}
module.exports={bake,sampleTimes,frameDifference};
