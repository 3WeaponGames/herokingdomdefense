'use strict';
// Isolated, muted editor renderer only. No game scene, player data, or project saves.
const fs=require('fs'),path=require('path'),url=require('url');
const M=require('../worlds/model'),Client=require('../worlds/client'),Paint=require('../worlds/paint');
async function verify(){
 const checks=[],assert=(ok,name)=>{if(!ok)throw Error(name);checks.push(name);},rootPath=path.resolve(__dirname,'../../..'),manifest=JSON.parse(fs.readFileSync(path.join(rootPath,'authoring/worlds/library/manifest.json'),'utf8'));
 const shadow=Object.assign({},manifest.assets.find(a=>a.id==='shadow-tree-overlay'));assert(!!shadow.id,'production shadow is registered');shadow.url=url.pathToFileURL(path.join(rootPath,shadow.file)).href;
 const swatch=Paint.canvas(24,24);swatch.getContext('2d').fillRect(0,0,24,24);const base={width:24,height:24,anchor:{x:.5,y:.5},biomes:M.BIOMES.slice(),depth:'ground',url:swatch.toDataURL()};
 const library=[shadow,Object.assign({},base,{id:'after-shadow',name:'Later imported image',category:'custom'}),Object.assign({},base,{id:'field',name:'Field',category:'field'})];
 let map=M.createMap('shadow-ui','Shadow placement','forest'),version=1,changes=0,saves=0;map.size={width:600,height:700};map.playable=M.clone(map.size);const original=M.clone(map),collections={groups:[],favorites:[],dirty:false,canUndo:false,canRedo:false};
 const snapshot=()=>({key:'map:'+map.id,version,value:M.clone(map),dirty:changes>0,canUndo:false,canRedo:false,issues:[],affected:[],collections});
 async function ipc(name,q){if(name==='world-catalog')return {version,maps:[map],library,images:{},collections,recovery:false};if(name==='world-load')return snapshot();if(name==='world-save'){saves++;throw Error('Shadow audit forbids saves');}if(name==='world-change'){assert(q.version===version,'placement uses current draft revision');map=M.clone(q.value);version++;changes++;return snapshot();}throw Error('Shadow audit forbids '+name);}
 const host=document.createElement('div');host.style.cssText='width:1250px;height:850px';document.body.appendChild(host);const client=Client.mount(host,{kind:'maps',ipc,preferenceKey:'shadow-overlay-audit-'+Date.now()}),state=client._state;
 const pause=ms=>new Promise(r=>setTimeout(r,ms)),settle=async()=>{await state.pending;await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));};
 try{
  for(let i=0;i<100&&!state.snap;i++)await pause(10);assert(!!state.snap,'editor draft loads');await settle();
  const root=host.querySelector('.world-tool'),left=root.querySelector('.world-side'),canvas=root.querySelector('canvas');canvas.setPointerCapture=()=>{};
  const click=async text=>{const b=Array.from(root.querySelectorAll('button')).find(b=>b.textContent===text);assert(!!b,'button exists: '+text);await b.onclick();await settle();};
  const changeBiome=async biome=>{const s=left.querySelector('select');s.value=biome;await s.onchange();await settle();};
  const choose=async()=>{const b=left.querySelector('[data-asset="'+shadow.id+'"]');assert(!!b,'shadow palette card exists');await b.onclick();await settle();};
  for(const tab of ['Ground','Objects']){
   if(tab==='Objects')await click('Objects');
   for(const biome of M.BIOMES){await changeBiome(biome);const cards=Array.from(left.querySelectorAll('[data-asset]'));assert(cards[cards.length-1].dataset.asset===shadow.id,tab+' / '+biome+' shows the shadow last');}
   await choose();assert(state.tool===(tab==='Ground'?'ground-image':'place'),tab+' selects individual manual placement');
  }
  assert(changes===0&&saves===0&&JSON.stringify(map)===JSON.stringify(original),'opening and browsing shadow assets never writes maps or progress');
  const image=new Image();await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=reject;image.src=shadow.url;});
  const record=Object.assign({},shadow,{image}),images={[shadow.id]:record},c=Paint.canvas(shadow.width,shadow.height),g=c.getContext('2d');g.setTransform(1,0,0,-1,shadow.width/2,shadow.height/2);
  Paint.object(g,{id:'sample',assetId:shadow.id,x:0,y:0,scale:1,angle:0,opacity:1},{transform:{}},images);
  const pixels=g.getImageData(0,0,c.width,c.height).data;let max=0;for(let i=3;i<pixels.length;i+=4)max=Math.max(max,pixels[i]);assert(max===26,'actual canvas renderer preserves alpha26 without multiplying opacity twice');
  await click('Ground');await choose();const bounds=canvas.getBoundingClientRect(),event={clientX:bounds.left+canvas.width/2+state.pan.x,clientY:bounds.top+canvas.height/2+state.pan.y,button:0,pointerId:8};canvas.onpointerdown(event);canvas.onpointerup();await settle();
  assert(M.groundLayers(map).reduce((n,l)=>n+(l.images||[]).filter(o=>o.assetId===shadow.id).length,0)===1,'Ground click places exactly one shadow image');assert(M.groundLayers(map).every(l=>!(l.strokes||[]).length),'Ground manual placement does not tile or paint the shadow');
  await click('Objects');await choose();canvas.onpointerdown(Object.assign({},event,{clientX:event.clientX+100}));canvas.onpointerup();await settle();
  const objects=map.layers.flatMap(l=>l.objects.filter(o=>o.assetId===shadow.id).map(o=>({layer:l,object:o})));assert(objects.length===1&&M.isGroundObject(objects[0].layer,objects[0].object),'Object click places one ground-depth shadow');
  assert(M.blockerPolygons(map).length===0&&saves===0,'manual shadows stay visual-only and all changes remain unsaved drafts');return {checks,ownedDocumentWrites:0};
 }finally{client.destroy();host.remove();}
}
module.exports={verify};
