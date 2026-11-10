'use strict';
// Explicit conversion; never called when an editor panel opens.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const L=require('../../packages/game-data-editor/worlds/legacy'),Maps=require('../../packages/game-data-editor/lib/map-assets'),Purchase=require('../../packages/game-data-editor/worlds/purchase-field'),Doc=require('../../packages/game-data-editor/lib/json-document');
function plan(root){
 const documents=new Map(),originals={},converted=[];
 function read(file){if(!documents.has(file)){const bytes=fs.readFileSync(path.join(root,file)),text=bytes.toString('utf8'),before=JSON.parse(text.replace(/^\uFEFF/,''));documents.set(file,{text,before,value:JSON.parse(JSON.stringify(before))});originals[file]=L.hash(bytes);}return documents.get(file);}
 function files(folder,extension){const result=[];function walk(dir){if(!fs.existsSync(dir))return;for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,entry.name);if(entry.isDirectory())walk(file);else if(entry.name.endsWith(extension))result.push(path.relative(root,file).split(path.sep).join('/'));}}walk(path.join(root,folder));return result;}
 const prefabs=files('assets/KinghtFallIconMap','.prefab'),authoring=files('authoring/worlds','.json');
 function source(data,label){let info=Maps.model(data);for(const owner of info.owners.filter(node=>node.kind==='building')){const component=data[owner.ownerComponent];if(!component.ndAniMain||!(component.ndLockList||[]).length)continue;const first=info.byId[component.ndLockList[0].__id__];if(!first)throw Error('Missing purchase field in '+label);const side=Purchase.valid(component.purchaseSide)?Purchase.side(component.purchaseSide):first.position.x<owner.position.x?'flip':'default',building={kind:1,purchaseSide:side,purchaseOffset:component.purchaseOffset||{x:0,y:0},template:{node:owner.id,roots:L.family(data,info,owner)}};
   if(!Purchase.valid(component.purchaseSide)&&first.position.y>owner.position.y){const dx=first.position.x-owner.position.x,dy=first.position.y-owner.position.y,distance=Math.hypot(dx,dy);building.purchaseOffset={x:dx-(side==='flip'?-1:1)*Math.SQRT1_2*distance,y:dy+Math.SQRT1_2*distance};}
   const next=Purchase.project(data,building);if(next!==data){for(let i=0;i<next.length;i++)data[i]=next[i];converted.push({source:label,id:component.ID,side});info=Maps.model(data);}
  }}
 function snapshots(value,label){if(Array.isArray(value)){if(value[0]&&value[0].__type__==='cc.Prefab'){source(value,label);return;}value.forEach((v,i)=>snapshots(v,label+'/'+i));}else if(value&&typeof value==='object')for(const key of Object.keys(value))snapshots(value[key],label+'/'+key);}
 for(const file of prefabs)source(read(file).value,file);
 for(const file of authoring)snapshots(read(file).value,file);
 for(const file of authoring){const doc=read(file).value;for(const building of doc.buildings||[]){if(!building.template)continue;const prefab=building.template.prefab,raw=doc.templates&&doc.templates[prefab]||read('assets/KinghtFallIconMap/'+prefab+'.prefab').value,owner=Maps.model(raw).byId[building.template.node],component=owner&&raw[owner.ownerComponent];if(component&&Purchase.valid(component.purchaseSide)){building.purchaseSide=Purchase.side(building.purchaseSide||component.purchaseSide);if(!building.purchaseOffset&&component.purchaseOffset&&(component.purchaseOffset.x||component.purchaseOffset.y))building.purchaseOffset={x:component.purchaseOffset.x,y:component.purchaseOffset.y};}}}
 const revisions=new Map();for(const file of prefabs){const doc=read(file);if(!Doc.equal(doc.before,doc.value))revisions.set(originals[file],L.hash(Buffer.from(Doc.patch(doc.text,doc.before,doc.value))));}
 function references(value){if(!value||typeof value!=='object')return;if(revisions.has(value.revision))value.revision=revisions.get(value.revision);Object.values(value).forEach(references);}
 for(const file of authoring)references(read(file).value);
 const writes=[];for(const [file,doc]of documents)if(!Doc.equal(doc.before,doc.value))writes.push({file,bytes:Buffer.from(Doc.patch(doc.text,doc.before,doc.value))});return {writes,originals,converted};
}
function run(root,options={}){const p=plan(root),summary={files:p.writes.map(w=>w.file),convertedBuildings:p.converted.length,written:false};if(options.write){const service=new(require('../../packages/game-data-editor/worlds/service').Service)(root,{artifacts:options.artifacts||path.join(os.homedir(),'Documents','Codex Artifacts','HeroKingdomDefense','purchase-field-conversion')}),result=service.commit(p.writes,p.originals);summary.written=!!result.saved;summary.backup=result.backup;}return summary;}
module.exports={plan,run};
if(require.main===module){const args=process.argv.slice(2),at=args.indexOf('--artifacts');console.log(JSON.stringify(run(path.resolve(__dirname,'../..'),{write:args.includes('--write'),artifacts:at>=0?path.resolve(args[at+1]):undefined}),null,2));}
