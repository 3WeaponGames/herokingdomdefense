'use strict';
// Real Canvas/DOM regressions. All artwork is synthetic and all state is local;
// this helper cannot save the project, launch gameplay, or touch player data.
const Paint=require('../worlds/paint'),Renderer=require('../worlds/renderer'),M=require('../worlds/model'),Images=require('../worlds/image-registry');
async function verify(){
 const checks=[],assert=(value,label)=>{if(!value)throw Error(label);checks.push(label);},pause=ms=>new Promise(r=>setTimeout(r,ms));
 const tile=(w,h,color)=>{const c=Paint.canvas(w,h),g=c.getContext('2d');g.fillStyle=color;g.fillRect(0,0,w,h);return c;},red=tile(40,20,'#f00'),blue=tile(40,20,'#00f');
 const load=async source=>{const image=new Image();await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=reject;image.src=source.toDataURL();});return image;};
 const pixel=(c,x,y)=>Array.from(c.getContext('2d').getImageData(x===undefined?c.width/2:x,y===undefined?c.height/2:y,1,1).data);
 const output=()=>{const c=Paint.canvas(100,100),g=c.getContext('2d');g.setTransform(1,0,0,-1,50,50);return {c,g};};
 const map=M.createMap('metadata','Metadata','forest');map.size=map.playable={width:100,height:100};
 map.legacyGround={sprites:[{frame:'frame',matrix:[1,0,0,1,0,0],width:100,height:100,anchor:{x:.5,y:.5}}]};
 red.getContext('2d').fillStyle='#00f';red.getContext('2d').fillRect(20,0,20,20);const atlas=await load(red),images={frame:{image:atlas,x:0,y:0,width:20,height:20}},r=Renderer.create(),target=output();
 try{
  r.draw(target.g,map,images);assert(pixel(target.c)[0]===255,'legacy frame starts with its original crop');
  const builds=r.stats().builds;images.frame=Object.assign({},images.frame,{x:20});r.draw(target.g,map,images);
  assert(pixel(target.c)[2]===255&&r.stats().builds===builds+1,'changing atlas crop invalidates the ground cache without changing the image URL');
  const beforePan=r.stats().builds;for(let i=0;i<8;i++){target.g.setTransform(1,0,0,-1,50+i,50);r.draw(target.g,map,images);}
  assert(r.stats().builds===beforePan,'unchanged decoded sources retain ground caches while panning');
  const objectMap=M.createMap('objects','Objects','forest');objectMap.size=objectMap.playable={width:100,height:100};
  const source=await load(tile(20,20,'#f00')),replacement=await load(tile(20,20,'#00f'));
  // A refreshed file can keep its URL and dimensions while decoding new pixels.
  // Shadow only the URL getter to model that case with in-memory PNG fixtures.
  Object.defineProperty(replacement,'src',{get:()=>source.src});
  const object={id:'o',assetId:'a',x:0,y:0,scale:1,angle:0},layer=objectMap.layers[0],records=[{o:object,layer}],art={a:{image:source,width:20,height:20,anchor:{x:.5,y:.5}}},view=output();
  r.drawObjects(view.g,objectMap,art,records);assert(pixel(view.c)[0]===255,'object cache uses its first decoded source');
  const objectBuilds=r.stats().objectsBuilds;art.a=Object.assign({},art.a,{image:replacement});view.g.clearRect(-50,-50,100,100);r.drawObjects(view.g,objectMap,art,records);
  assert(pixel(view.c)[2]===255&&r.stats().objectsBuilds===objectBuilds+1,'a replacement decoded image refreshes scenery even with the same URL and size');
  art.a=Object.assign({},art.a,{anchor:{x:0,y:0}});view.g.clearRect(-50,-50,100,100);r.drawObjects(view.g,objectMap,art,records);assert(pixel(view.c,65,35)[2]===255,'source anchor changes update cached scenery geometry');
  const hidden=M.createMap('hidden','Hidden','forest','late');hidden.size=hidden.playable={width:100,height:100};hidden.ground.foundation.hidden=true;const empty={},h=output();r.draw(h.g,hidden,empty);const hiddenBuilds=r.stats().builds;empty.late={image:source,width:20,height:20};r.draw(h.g,hidden,empty);
  assert(r.stats().builds===hiddenBuilds,'artwork finishing behind a hidden ground layer does not rebuild visible ground');
  hidden.ground.foundation.hidden=false;r.draw(h.g,hidden,empty);assert(pixel(h.c)[0]===255,'showing that layer renders its decoded source normally');
 }finally{r.clear();}
 assert(r.stats().bytes===0,'renderer clear releases all raster surfaces');
 const sources={keep:{url:blue.toDataURL(),width:40,height:20,anchor:{x:.5,y:0}},pending:{url:blue.toDataURL(),width:40,height:20,anchor:{x:.5,y:0}}},events=[],errors=[];
 const registry=Images.create({lookup:id=>sources[id],onLoad:(id,record)=>events.push({id,record}),onError:(id,error)=>errors.push({id,error:error.message})}),stableRecords=registry.records;
 try{
  const old=registry.ensure('pending'),late=old.image.onload;registry.retain(new Set());late();
  assert(!registry.records.pending&&events.length===0,'late load events from a pruned image cannot redraw the panel');
  let callbacks=0;const done=()=>callbacks++,a=registry.ensure('keep',done);registry.ensure('keep',done);
  for(let i=0;i<100&&!a.image.naturalWidth;i++)await pause(5);
  assert(a.image.naturalWidth===40&&callbacks===1&&events.length===1,'a shared pending image loads once and deduplicates its subscriber callback');
  const same=registry.ensure('keep');assert(same===a,'unchanged referenced artwork reuses the decoded image');
  const originalLoad=a.image.onload;sources.keep=Object.assign({},sources.keep,{anchor:{x:0,y:0}});
  const replaced=registry.ensure('keep');originalLoad();
  assert(replaced.image!==a.image&&replaced.anchor.x===0&&registry.records.keep===replaced,'metadata changes replace the decoded image and retain current source geometry');
  assert(events.length===1,'replaced image callbacks cannot notify the current registry');
  const keep=registry.records.keep;registry.ensure('pending');registry.retain(new Set(['keep']));
  assert(registry.records.keep===keep&&!registry.records.pending,'reference pruning keeps visible artwork and removes unused selections');
  const first=registry.url('file:///C:/Assets/Tree%20one.png?x=1#leaf'),again=registry.url('file:///C:/Assets/Tree%20one.png?x=1#leaf');
  registry.clear();
  assert(registry.records===stableRecords&&Object.keys(stableRecords).length===0,'refresh clears decoded images without replacing the shared record table');
  const refreshed=registry.url('file:///C:/Assets/Tree%20one.png?x=1#leaf'),parsed=new URL(refreshed);
  assert(first===again&&first!==refreshed&&parsed.searchParams.get('x')==='1'&&parsed.hash==='#leaf','refresh changes local cache URLs while preserving existing query and fragment data');
  assert(registry.url(sources.keep.url)===sources.keep.url,'inline source image URLs remain unchanged');
  sources.broken={url:'data:image/png;base64,not-a-valid-png',width:20,height:20};const broken=registry.ensure('broken');
  for(let i=0;i<100&&!errors.length;i++)await pause(5);
  assert(errors.length===1&&errors[0].id==='broken','failed artwork reports a single useful error');
  const oldError=broken.image.onerror;assert(registry.ensure('broken')===broken&&errors.length===1,'repeated redraws do not continuously retry a broken source');
  sources.broken=Object.assign({},sources.keep,{maxMaskEdge:-1});const repaired=registry.ensure('broken');oldError();
  for(let i=0;i<100&&!repaired.image.naturalWidth;i++)await pause(5);
  assert(repaired.image.naturalWidth===40&&errors.length===1&&repaired.maxMaskEdge===2048,'a corrected source retries safely and ignores obsolete failure events');
  const current=registry.ensure('keep'),afterClose=current.image.onload,before=events.length;registry.destroy();afterClose();
  assert(!registry.ensure('keep')&&Object.keys(registry.records).length===0&&events.length===before,'destroy releases artwork and ignores subsequent loads or requests');
  assert(errors.length===1,'normal replacement, pruning and closing do not report spurious image failures');
 }finally{registry.destroy();Paint.clearMasks();}
 const fs=require('fs'),path=require('path'),os=require('os'),url=require('url'),crypto=require('crypto'),directory=fs.mkdtempSync(path.join(os.tmpdir(),'hkd-world-image-cache-')),file=path.join(directory,'source.png'),digest=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
 const bytes=color=>Buffer.from(tile(4,4,color).toDataURL().split(',')[1],'base64'),redBytes=bytes('#f00'),blueBytes=bytes('#00f');
 fs.writeFileSync(file,redBytes);let source={url:url.pathToFileURL(file).href,sha256:digest(redBytes),width:4,height:4},loaded,failed;
 const files=Images.create({lookup:()=>source,onLoad:()=>loaded&&loaded(),onError:(_,error)=>failed&&failed(error)});
 async function readVersion(){await new Promise((resolve,reject)=>{loaded=resolve;failed=reject;files.ensure('source');});const c=Paint.canvas(4,4);c.getContext('2d').drawImage(files.records.source.image,0,0);return pixel(c);}
 try{
  assert((await readVersion())[0]===255,'local fixture begins with its original pixels');
  const originalURL=files.records.source.image.src;fs.writeFileSync(file,blueBytes);source=Object.assign({},source,{sha256:digest(blueBytes)});
  assert((await readVersion())[2]===255&&files.records.source.image.src!==originalURL,'changed source bytes bypass the browser file cache when their content hash changes');
  const alias=files.ensure('alias');assert(alias.image.src===files.records.source.image.src,'aliases of the same file and content version share the browser cache URL');
  fs.writeFileSync(file,bytes('#0f0'));files.clear();
  assert((await readVersion())[1]===255,'explicit refresh reloads a local file even before its metadata hash is updated');
 }finally{
  files.destroy();const relative=path.relative(path.resolve(os.tmpdir()),path.resolve(directory));if(!relative.startsWith('hkd-world-image-cache-')||relative.includes(path.sep)||path.isAbsolute(relative))throw Error('Unsafe image fixture cleanup');fs.rmSync(directory,{recursive:true,force:true});
 }
 return {checks};
}
module.exports={verify};
