'use strict';
// Read-only building composition. This describes assets and authored geometry;
// it never instantiates gameplay components, loads a scene, or writes a draft.
const fs=require('fs'),path=require('path'),url=require('url');
const M=require('./model'),L=require('./legacy'),Maps=require('../lib/map-assets'),Units=require('../lib/unit-assets'),Assets=require('../lib/asset-validation'),Navigation=require('./navigation'),WeaponPose=require('../../../assets/_script/BuildingWeaponPose'),GateSource=require('./gate-facing'),GateFacing=require('../../../assets/_script/GateFacing'),Purchase=require('./purchase-field'),WallRun=require('./wall-run');
const NAMES={1:'Main Hall',2:'Tower',3:'Barracks',4:'House',5:'Mill',6:'Wall / Gate'},files=new Map(),descriptions=new WeakMap();
const clone=M.clone,number=(v,f)=>typeof v==='number'&&Number.isFinite(v)?v:f,positive=(v,f)=>Math.max(1,number(v,f));
const WallData=require('../walls/service');
function revision(file,dependencies){const stat=fs.statSync(file),value=stat.mtimeMs+':'+stat.ctimeMs+':'+stat.size;if(dependencies)dependencies.set(file,value);return value;}
function unchanged(dependencies){if(!dependencies)return false;try{for(const [file,value]of dependencies)if(revision(file)!==value)return false;return true;}catch(_){return false;}}
function read(file,json,dependencies){const version=revision(file,dependencies),old=files.get(file);if(old&&old.revision===version)return old.value;const text=fs.readFileSync(file,'utf8'),value=json?JSON.parse(text.replace(/^\uFEFF/,'')):text;files.set(file,{revision:version,value});return value;}
function reference(data,ref){const value=ref&&data[ref.__id__];return value&&value.__type__==='cc.Node'?ref.__id__:value&&value.node&&value.node.__id__;}
function multiply(a,b){return [a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5]];}
function rowFor(config,building,hall){
 const definition=config.BuildEnum&&config.BuildEnum[building.kind],rows=definition&&definition.levelList||[];
 if(Number.isInteger(building.previewBranch))return {row:rows.find(row=>row.index===building.previewBranch)};
 let row=rows[0];
 if(building.kind===1)row=rows.find(row=>row.level===hall);
 else if(definition&&Array.isArray(definition.InitialChoices))row=definition.InitialChoices.map(index=>rows.find(row=>row.index===index&&row.level===1)).find(Boolean);
 return {index:row&&row.index,row};
}
function sprite(info,s,ground){const n=info.byId[s.node];return {frame:s.frame,matrix:n.world.slice(),width:n.width,height:n.height,anchor:clone(n.anchor),color:clone(n.source._color||{r:255,g:255,b:255,a:255}),active:true,ground:!!ground};}
function skeleton(root,component,info,assetIndex,skin,ground,cache,dependencies){
 const uuid=component._N$skeletonData&&component._N$skeletonData.__uuid__,file=assetIndex.uuids[uuid];
 if(!file||!file.toLowerCase().endsWith('.json'))throw Error('Missing building model '+uuid);
 let asset=cache.get(file);if(!asset){const json=read(file,true,dependencies),atlasFile=file.replace(/\.json$/i,'.atlas'),atlas=read(atlasFile,false,dependencies),pages={},pageVersions=[],lines=atlas.split(/\r?\n/);for(let i=0;i<lines.length;i++)if(lines[i].trim()&&(i===0||!lines[i-1].trim())&&lines[i+1]&&/^(size|format):/.test(lines[i+1].trim())){const name=lines[i].trim(),texture=path.resolve(path.dirname(file),name);if(path.dirname(texture)!==path.dirname(file)||!fs.existsSync(texture))throw Error('Missing building atlas page '+name);const version=revision(texture,dependencies),page=url.pathToFileURL(texture);page.searchParams.set('hkd-building',version);pages[name]=page.href;pageVersions.push([name,version]);}asset={uuid,source:path.relative(root,file).split(path.sep).join('/'),json,atlas,pages,revision:L.hash(JSON.stringify([json,atlas,pageVersions]))};cache.set(file,asset);}
 const node=info.byId[component.node.__id__];
 return Object.assign({},asset,{name:node.name,skin:skin||component.defaultSkin||'default',animation:'idle',matrix:node.world.slice(),ground:!!ground,x:0,y:0,scaleX:1,scaleY:1,rotation:0});
}
function artwork(root,resource,images,dependencies){const imported=Assets.imported(root,'resources',resource,'sprite'),meta=imported.meta,id='building-preview-'+L.hash(imported.file).slice(0,24);revision(imported.file,dependencies);revision(imported.file+'.meta',dependencies);if(!images[id])images[id]={url:url.pathToFileURL(imported.file).href,x:0,y:0,width:meta.width,height:meta.height,sha256:L.hash(fs.readFileSync(imported.file))};return id;}
function appearanceSprites(root,appearance,owner,images,dependencies){
 const base={frame:artwork(root,appearance.sprite,images,dependencies),matrix:multiply(owner.world,[1,0,0,1,number(appearance.offsetX,0),number(appearance.offsetY,0)]),width:positive(appearance.width,160),height:positive(appearance.height,200),anchor:{x:.5,y:0},active:true,ground:false},sprites=[base],weapon=appearance.weapon;
 if(weapon&&typeof weapon.sprite==='string'&&weapon.sprite){const p=WeaponPose.pose(weapon,null),a=p.angle*Math.PI/180,c=Math.cos(a),s=Math.sin(a);sprites.push({frame:artwork(root,p.sprite,images,dependencies),matrix:multiply(owner.world,[c*p.flipX,s*p.flipX,-s,c,p.x,p.y]),width:p.width,height:p.height,anchor:{x:p.pivotX,y:p.pivotY},active:true,ground:false});}
 return sprites;
}
function describe(service,stage){
 const index=service.index(),config=service.previewConfig?service.previewConfig(stage.variant||'A'):index.documents[stage.variant||'A']&&index.documents[stage.variant||'A'].BuildEnum?index.documents[stage.variant||'A']:index.documents.A,buildings={},images={},errors=[],sourceModels=new Map(),assetCache=new Map(),sources=new Map(),dependencies=new Map();let assetIndex=null,needsRuntime=false;
 let wallAdjustments=null;
 if((stage.buildings||[]).some(building=>building.kind===6))try{wallAdjustments=WallData.readSource(service.root);revision(wallAdjustments.file,dependencies);}catch(error){if(error.code!=='ENOENT')errors.push(error.message);wallAdjustments={data:{version:1,poses:{}},revision:error.code==='ENOENT'?'missing':'unavailable'};}
 // Placement moves and wave edits do not change the source composition. Keep
 // one result per service while checking embedded template contents and config
 // rows. Referenced artwork is checked with cheap file stamps before reuse,
 // so live texture/model replacement does not require editing or saving a draft.
 for(const building of stage.buildings||[]){const id=building.template.prefab;if(!sources.has(id)){try{const data=stage.templates&&stage.templates[id]||service.source(id);sources.set(id,{data,revision:L.hash(JSON.stringify(data))});}catch(error){sources.set(id,{data:null,revision:'missing'});errors.push(error.message);}}}
 const signature=JSON.stringify([(stage.buildings||[]).map(b=>[b.id,b.kind,b.previewBranch,b.wallFacing,b.wallRotation,b.wallOpening,b.wallRun,b.purchaseSide,b.purchaseOffset,b.purchaseOverride,b.placementVariant,b.angle,b.template,sources.get(b.template.prefab).revision]),config.BuildEnum,wallAdjustments&&wallAdjustments.revision]),previous=descriptions.get(service);
 if(previous&&previous.index===index&&previous.signature===signature&&unchanged(previous.dependencies))return previous.value;
 for(const authoredBuilding of stage.buildings||[]){
  const building=Purchase.withDefaults(authoredBuilding,config,1,sources.get(authoredBuilding.template.prefab).data);
  const result=buildings[building.id]={name:NAMES[building.kind]||'Building',levels:{}},rawSource=sources.get(building.template.prefab).data;if(!rawSource)continue;let source;try{source=GateSource.project(rawSource,building,service.root);try{source=Purchase.project(source,building);}catch(error){errors.push(error.message);}}catch(error){errors.push(error.message);continue;}let info=sourceModels.get(source);if(!info){try{info=Maps.model(source);sourceModels.set(source,info);}catch(error){errors.push(error.message);continue;}}
  const owner=info.byId[building.template.node];if(!owner){errors.push('A building source was removed. Refresh its template.');continue;}
  const controller=owner.components.find(c=>c.value.ndAniMain&&Number.isInteger(c.value.ID));if(!controller)errors.push('A building controller is missing from its template.');const component=controller?controller.value:{},effectiveFace=GateFacing.valid(building.wallFacing)?building.wallFacing:component.wallFacing,origin=clone(owner.position),plateId=reference(source,(component.ndLockList||[])[0]),plate=info.byId[plateId],ids=new Set(),excluded=new Set();
  if(building.kind===6)try{result.wallFacing=GateSource.facing(rawSource,building);}catch(error){errors.push(error.message);}
  for(const root of building.template.roots)L.descendants(source,root,ids);
  for(const key of ['ndLockList','ndMove','ndHp','ndEffect','ndShot','ndCoin','ndVideoSoldier','ndPro','ndBotnNodeList','ndAniEffect']){const refs=Array.isArray(component[key])?component[key]:[component[key]];for(const ref of refs){const id=reference(source,ref);if(id!==undefined)L.descendants(source,id,excluded);}}
  const moving=new Set();if(building.kind===6)for(const key of ['ndAniMain','ndAniDown','ndAniOther','ndAniEffect','ndEffect','ndMove'])for(const ref of Array.isArray(component[key])?component[key]:[component[key]]){const id=reference(source,ref);if(id!==undefined&&id!==owner.id)L.descendants(source,id,moving);}
  const nativeSpecs=controller?info.sprites.filter(s=>ids.has(s.node)&&!excluded.has(s.node)&&s.enabled&&info.byId[s.node].active):[],native=nativeSpecs.map(s=>sprite(info,s,info.byId[s.node].layer==='ndDown'));
  const plateSprites=plate?info.sprites.filter(s=>s.node===plateId&&s.enabled).map(s=>sprite(info,s,true)):[];
  const trigger=plate&&plate.components.find(c=>c.value.__type__==='cc.PolygonCollider');
  const trs=plate&&plate.source._trs&&plate.source._trs.array,step=trigger?(trigger.value.points||[]).map(p=>{const x=p.x/(trs?trs[7]:1),y=p.y/(trs?trs[8]:1),m=plate.world;return {x:m[0]*x+m[2]*y+m[4]-origin.x,y:m[1]*x+m[3]*y+m[5]-origin.y};}):null;
  for(const hall of [1,2,3]){
   const chosen=rowFor(config,building,hall),row=chosen.row,look=row&&row.Appearance,level={origin:clone(origin),sprites:plateSprites.concat(native),skeletons:[],blockers:Navigation.buildingPolygons(service,stage,Object.assign({},building,{x:0,y:0,scale:1,angle:0}),hall,'closed',config,sourceModels),step:step&&clone(step)};
   if(building.kind===6)level.wallOpening=GateFacing.validOpening(component.wallOpening)?component.wallOpening:'outward';
   if(plate)level.purchaseField={angle:Purchase.angle(building.purchaseSide||component.purchaseSide),center:{x:plate.position.x-origin.x,y:plate.position.y-origin.y},offset:clone(Purchase.offset(building.purchaseOffset?building:component)),sprites:plateSprites.map(()=>true).concat(nativeSpecs.map(()=>false))};
   const perLevel=Purchase.withDefaults(authoredBuilding,config,hall,rawSource);
   if(plate&&JSON.stringify([perLevel.purchaseSide,perLevel.purchaseOffset])!==JSON.stringify([building.purchaseSide,building.purchaseOffset])){
    const projected=Purchase.project(GateSource.project(rawSource,perLevel,service.root),perLevel),model=Maps.model(projected),p=model.byId[plateId],trigger=p.components.find(c=>c.value.__type__==='cc.PolygonCollider'),trs=p.source._trs.array;
    level.sprites=model.sprites.filter(s=>s.node===plateId&&s.enabled).map(s=>sprite(model,s,true)).concat(native);
    level.step=trigger?trigger.value.points.map(q=>{const v=Maps.point(p.world,{x:q.x/trs[7],y:q.y/trs[8]});return {x:v.x-origin.x,y:v.y-origin.y};}):null;
    level.purchaseField={angle:Purchase.angle(perLevel.purchaseSide),center:{x:p.position.x-origin.x,y:p.position.y-origin.y},offset:clone(Purchase.offset(perLevel)),sprites:plateSprites.map(()=>true).concat(nativeSpecs.map(()=>false))};
   }
   if(building.kind===6){level.openBlockers=Navigation.buildingPolygons(service,stage,Object.assign({},building,{x:0,y:0,scale:1,angle:0}),hall,'open',config,sourceModels);const flags=gate=>Navigation.buildingColliderData(service,stage,building,hall,gate,config,sourceModels).colliders.map(c=>moving.has(c.node)||c.node===owner.id&&c.type==='cc.PhysicsPolygonCollider');level.rotationPreview={angle:number(component.wallRotation,0),sprites:plateSprites.map(()=>false).concat(nativeSpecs.map(s=>moving.has(s.node))),skeletons:[],blockers:flags('closed'),openBlockers:flags('open')};}
   if(look&&typeof look.sprite==='string'&&look.sprite){try{const renderedOwner=building.kind===6&&component.wallRotation?Object.assign({},owner,{world:Maps.multiply(GateSource.around(origin,component.wallRotation),owner.world)}):owner;const additions=appearanceSprites(service.root,look,renderedOwner,images,dependencies);level.sprites=level.sprites.concat(additions);if(level.rotationPreview)level.rotationPreview.sprites.push(...additions.map(()=>true));if(level.purchaseField)level.purchaseField.sprites.push(...additions.map(()=>false));}catch(error){errors.push(error.message);}}
   else{
    const refs=[{ref:component.ndAniDown,ground:true},{ref:component.ndAniMain,ground:false}].concat((component.ndAniOther||[]).map(ref=>({ref,ground:false})));
    for(const part of refs){const value=part.ref&&source[part.ref.__id__];if(!value||value.__type__!=='sp.Skeleton')continue;try{if(!assetIndex)assetIndex=Units.index(service.root);let description=skeleton(service.root,value,info,assetIndex,row&&row.Skin,part.ground,assetCache,dependencies);if(building.kind===6&&!description.json.wallKit&&!description.json.wallGate&&GateFacing.valid(effectiveFace)&&GateFacing.reverse(effectiveFace)&&(part.ref===component.ndAniDown||part.ref===component.ndAniMain)){description=Object.assign({},description,{json:GateFacing.mirrorJson(description.json),revision:description.revision+':reverse-gate'});}level.skeletons.push(description);if(level.rotationPreview)level.rotationPreview.skeletons.push(moving.has(reference(source,part.ref)));needsRuntime=true;}catch(error){errors.push(error.message);}}
   }
   if(building.kind===6)try{WallRun.fitRecord(level,component,effectiveFace,{adjustmentsData:wallAdjustments&&wallAdjustments.data,adjustmentRevision:wallAdjustments&&wallAdjustments.revision});}catch(error){errors.push(error.message);}
   result.levels[hall]=level;
  }
 }
 let runtimePath=null;if(needsRuntime)try{runtimePath=Units.enginePath();}catch(error){errors.push(error.message);}
 const value={revision:L.hash(JSON.stringify([signature,Array.from(dependencies)])),runtimePath,buildings,images,errors:Array.from(new Set(errors))};if(!errors.length)descriptions.set(service,{index,signature,dependencies,value});return value;
}
module.exports={describe};
