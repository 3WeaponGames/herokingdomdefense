'use strict';
// Read-only building composition. This describes assets and authored geometry;
// it never instantiates gameplay components, loads a scene, or writes a draft.
const fs=require('fs'),path=require('path'),url=require('url');
const M=require('./model'),L=require('./legacy'),Maps=require('../lib/map-assets'),Units=require('../lib/unit-assets'),Assets=require('../lib/asset-validation'),Navigation=require('./navigation'),WeaponPose=require('../../../assets/_script/BuildingWeaponPose'),GateSource=require('./gate-facing'),GateFacing=require('../../../assets/_script/GateFacing');
const NAMES={1:'Main Hall',2:'Tower',3:'Barracks',4:'House',5:'Mill',6:'Wall / Gate'},files=new Map(),descriptions=new WeakMap();
const clone=M.clone,number=(v,f)=>typeof v==='number'&&Number.isFinite(v)?v:f,positive=(v,f)=>Math.max(1,number(v,f));
function read(file,json){const stat=fs.statSync(file),revision=stat.mtimeMs+':'+stat.ctimeMs+':'+stat.size,old=files.get(file);if(old&&old.revision===revision)return old.value;const text=fs.readFileSync(file,'utf8'),value=json?JSON.parse(text.replace(/^\uFEFF/,'')):text;files.set(file,{revision,value});return value;}
function reference(data,ref){const value=ref&&data[ref.__id__];return value&&value.__type__==='cc.Node'?ref.__id__:value&&value.node&&value.node.__id__;}
function multiply(a,b){return [a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5]];}
function rowFor(config,building,hall){const definition=config.BuildEnum&&config.BuildEnum[building.kind],rows=definition&&definition.levelList||[];let index=1;if(building.kind===1){const at=rows.findIndex(row=>row.level===hall);index=at<0?hall:at+1;}else if(definition&&Array.isArray(definition.InitialChoices)){const first=definition.InitialChoices.find(v=>Number.isInteger(v)&&v>0&&rows[v-1]&&rows[v-1].level===1);if(first!==undefined)index=first;}return {index,row:rows[index-1]};}
function sprite(info,s,ground){const n=info.byId[s.node];return {frame:s.frame,matrix:n.world.slice(),width:n.width,height:n.height,anchor:clone(n.anchor),color:clone(n.source._color||{r:255,g:255,b:255,a:255}),active:true,ground:!!ground};}
function skeleton(root,component,info,assetIndex,skin,ground,cache){
 const uuid=component._N$skeletonData&&component._N$skeletonData.__uuid__,file=assetIndex.uuids[uuid];
 if(!file||!file.toLowerCase().endsWith('.json'))throw Error('Missing building model '+uuid);
 let asset=cache.get(file);if(!asset){const json=read(file,true),atlasFile=file.replace(/\.json$/i,'.atlas'),atlas=read(atlasFile,false),pages={},pageVersions=[],lines=atlas.split(/\r?\n/);for(let i=0;i<lines.length;i++)if(lines[i].trim()&&(i===0||!lines[i-1].trim())&&lines[i+1]&&/^(size|format):/.test(lines[i+1].trim())){const name=lines[i].trim(),texture=path.resolve(path.dirname(file),name);if(path.dirname(texture)!==path.dirname(file)||!fs.existsSync(texture))throw Error('Missing building atlas page '+name);const stat=fs.statSync(texture),version=stat.mtimeMs+':'+stat.ctimeMs+':'+stat.size,page=url.pathToFileURL(texture);page.searchParams.set('hkd-building',version);pages[name]=page.href;pageVersions.push([name,version]);}asset={uuid,source:path.relative(root,file).split(path.sep).join('/'),json,atlas,pages,revision:L.hash(JSON.stringify([json,atlas,pageVersions]))};cache.set(file,asset);}
 const node=info.byId[component.node.__id__];
 return Object.assign({},asset,{name:node.name,skin:skin||component.defaultSkin||'default',animation:'idle',matrix:node.world.slice(),ground:!!ground,x:0,y:0,scaleX:1,scaleY:1,rotation:0});
}
function artwork(root,resource,images){const imported=Assets.imported(root,'resources',resource,'sprite'),meta=imported.meta,id='building-preview-'+L.hash(imported.file).slice(0,24);if(!images[id])images[id]={url:url.pathToFileURL(imported.file).href,x:0,y:0,width:meta.width,height:meta.height,sha256:L.hash(fs.readFileSync(imported.file))};return id;}
function appearanceSprites(root,appearance,owner,images){
 const base={frame:artwork(root,appearance.sprite,images),matrix:multiply(owner.world,[1,0,0,1,number(appearance.offsetX,0),number(appearance.offsetY,0)]),width:positive(appearance.width,160),height:positive(appearance.height,200),anchor:{x:.5,y:0},active:true,ground:false},sprites=[base],weapon=appearance.weapon;
 if(weapon&&typeof weapon.sprite==='string'&&weapon.sprite){const p=WeaponPose.pose(weapon,null),a=p.angle*Math.PI/180,c=Math.cos(a),s=Math.sin(a);sprites.push({frame:artwork(root,p.sprite,images),matrix:multiply(owner.world,[c*p.flipX,s*p.flipX,-s,c,p.x,p.y]),width:p.width,height:p.height,anchor:{x:p.pivotX,y:p.pivotY},active:true,ground:false});}
 return sprites;
}
function describe(service,stage){
 const index=service.index(),config=index.documents[stage.variant||'A']&&index.documents[stage.variant||'A'].BuildEnum?index.documents[stage.variant||'A']:index.documents.A,buildings={},images={},errors=[],sourceModels=new Map(),assetCache=new Map(),sources=new Map();let assetIndex=null,needsRuntime=false;
 // Placement moves and wave edits do not change the source composition. Keep
 // one result per service while checking embedded template contents and config
 // rows, so drafts and refreshes can never reuse stale authored geometry.
 for(const building of stage.buildings||[]){const id=building.template.prefab;if(!sources.has(id)){try{const data=stage.templates&&stage.templates[id]||service.source(id);sources.set(id,{data,revision:L.hash(JSON.stringify(data))});}catch(error){sources.set(id,{data:null,revision:'missing'});errors.push(error.message);}}}
 const signature=JSON.stringify([(stage.buildings||[]).map(b=>[b.id,b.kind,b.wallFacing,b.template,sources.get(b.template.prefab).revision]),config.BuildEnum]),previous=descriptions.get(service);
 if(previous&&previous.index===index&&previous.signature===signature)return previous.value;
 for(const building of stage.buildings||[]){
  const result=buildings[building.id]={name:NAMES[building.kind]||'Building',levels:{}},rawSource=sources.get(building.template.prefab).data;if(!rawSource)continue;let source;try{source=GateSource.project(rawSource,building);}catch(error){errors.push(error.message);continue;}let info=sourceModels.get(source);if(!info){try{info=Maps.model(source);sourceModels.set(source,info);}catch(error){errors.push(error.message);continue;}}
  const owner=info.byId[building.template.node];if(!owner){errors.push('A building source was removed. Refresh its template.');continue;}
  const controller=owner.components.find(c=>c.value.ndAniMain&&Number.isInteger(c.value.ID));if(!controller)errors.push('A building controller is missing from its template.');const component=controller?controller.value:{},origin=clone(owner.position),plateId=reference(source,(component.ndLockList||[])[0]),plate=info.byId[plateId],ids=new Set(),excluded=new Set();
  for(const root of building.template.roots)L.descendants(source,root,ids);
  for(const key of ['ndLockList','ndMove','ndHp','ndEffect','ndShot','ndCoin','ndVideoSoldier','ndPro','ndBotnNodeList','ndAniEffect']){const refs=Array.isArray(component[key])?component[key]:[component[key]];for(const ref of refs){const id=reference(source,ref);if(id!==undefined)L.descendants(source,id,excluded);}}
  const native=controller?info.sprites.filter(s=>ids.has(s.node)&&!excluded.has(s.node)&&s.enabled&&info.byId[s.node].active).map(s=>sprite(info,s,info.byId[s.node].layer==='ndDown')):[];
  const plateSprites=plate?info.sprites.filter(s=>s.node===plateId&&s.enabled).map(s=>sprite(info,s,true)):[];
  const trigger=plate&&plate.components.find(c=>c.value.__type__==='cc.PolygonCollider');
  const trs=plate&&plate.source._trs&&plate.source._trs.array,step=trigger?(trigger.value.points||[]).map(p=>{const x=p.x/(trs?trs[7]:1),y=p.y/(trs?trs[8]:1),m=plate.world;return {x:m[0]*x+m[2]*y+m[4]-origin.x,y:m[1]*x+m[3]*y+m[5]-origin.y};}):null;
  for(const hall of [1,2,3]){
   const chosen=rowFor(config,building,hall),row=chosen.row,look=row&&row.Appearance,level={origin:clone(origin),sprites:plateSprites.concat(native),skeletons:[],blockers:Navigation.buildingPolygons(service,stage,Object.assign({},building,{x:0,y:0,scale:1,angle:0}),hall,'closed',config,sourceModels),step:step&&clone(step)};
   if(building.kind===6)level.openBlockers=Navigation.buildingPolygons(service,stage,Object.assign({},building,{x:0,y:0,scale:1,angle:0}),hall,'open',config,sourceModels);
   if(look&&typeof look.sprite==='string'&&look.sprite){try{level.sprites=level.sprites.concat(appearanceSprites(service.root,look,owner,images));}catch(error){errors.push(error.message);}}
   else{
    const refs=[{ref:component.ndAniDown,ground:true},{ref:component.ndAniMain,ground:false}].concat((component.ndAniOther||[]).map(ref=>({ref,ground:false})));
    for(const part of refs){const value=part.ref&&source[part.ref.__id__];if(!value||value.__type__!=='sp.Skeleton')continue;try{if(!assetIndex)assetIndex=Units.index(service.root);let description=skeleton(service.root,value,info,assetIndex,row&&row.Skin,part.ground,assetCache);if(building.kind===6&&GateFacing.valid(building.wallFacing)&&GateFacing.reverse(building.wallFacing)&&(part.ref===component.ndAniDown||part.ref===component.ndAniMain)){description=Object.assign({},description,{json:GateFacing.mirrorJson(description.json),revision:description.revision+':reverse-gate'});}level.skeletons.push(description);needsRuntime=true;}catch(error){errors.push(error.message);}}
   }
   result.levels[hall]=level;
  }
 }
 let runtimePath=null;if(needsRuntime)try{runtimePath=Units.enginePath();}catch(error){errors.push(error.message);}
 const value={runtimePath,buildings,images,errors:Array.from(new Set(errors))};if(!errors.length)descriptions.set(service,{index,signature,value});return value;
}
module.exports={describe};
