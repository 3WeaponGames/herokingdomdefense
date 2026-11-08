'use strict';
// Explicitly sync baked artwork bounds without moving authored object roots.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../..'),Maps=require('../../packages/game-data-editor/lib/map-assets');
const Doc=require('../../packages/game-data-editor/lib/json-document'),{inside}=require('./bake-map.cjs');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
function sync(recipeFile,reportFile,write){
 const recipe=JSON.parse(fs.readFileSync(recipeFile)),report=JSON.parse(fs.readFileSync(reportFile));
 const relative=Maps.fileFor(recipe.map),file=path.join(root,relative),text=fs.readFileSync(file,'utf8'),before=JSON.parse(text),data=structuredClone(before);
 if(!report.write)throw Error('Use a production bake report');
 const model=Maps.model(data);
 for(const image of report.files.filter(f=>f.role==='obstacle')){
  const asset=path.resolve(root,image.path),owner=recipe.owners.find(o=>o.id===image.owner),node=model.byId[image.owner];
  if(!inside(path.join(root,recipe.output),asset)||hash(fs.readFileSync(asset))!==image.sha256)throw Error('Stale or invalid bake report: '+image.path);
  if(!owner||!owner.origin||!node)throw Error('Missing authored object origin');
  const art=node.children.find(id=>data[id]._name==='Baked artwork'),ground=node.children.find(id=>data[id]._name==='Ground point');
  if(art===undefined||ground===undefined)throw Error('Missing baked children for '+owner.key);
  const sprite=data[art]._components.map(r=>data[r.__id__]).find(c=>c.__type__==='cc.Sprite');
  if(!sprite||sprite._spriteFrame.__uuid__!==image.frameUuid)throw Error('Unexpected artwork frame '+owner.key);
  data[art]._contentSize.width=image.width;data[art]._contentSize.height=image.height;
  for(const [id,point]of [[art,image.center],[ground,image.ground]]){data[id]._trs.array[0]=point.x-owner.origin.x;data[id]._trs.array[1]=point.y-owner.origin.y;}
 }
 const changes=Doc.diff(before,data);if(write&&changes.length){
  const artifacts=path.resolve(path.dirname(reportFile));if(inside(root,artifacts))throw Error('Backups must stay outside the project');
  const backup=path.join(artifacts,'bake-backups',Date.now()+'-'+recipe.map+'.prefab');fs.mkdirSync(path.dirname(backup),{recursive:true});fs.writeFileSync(backup,text);
  if(hash(fs.readFileSync(file,'utf8'))!==hash(text))throw Error('Concurrent prefab edit; sync cancelled');
  fs.writeFileSync(file,Doc.patch(text,before,data));
 }
 return {map:recipe.map,changes:changes.length,written:!!write&&changes.length>0};
}
module.exports={sync};
if(require.main===module){const args=process.argv.slice(2);if(args.length<2)throw Error('Usage: node tools/maps/sync-prefab.cjs <recipe> <external-bake-report> [--write]');console.log(JSON.stringify(sync(path.resolve(args[0]),path.resolve(args[1]),args.includes('--write'))));}
