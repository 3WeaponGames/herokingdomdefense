'use strict';
// Explicit content publication, never invoked when opening an editor panel.
const fs=require('node:fs'),path=require('node:path');
const Document=require('../../packages/game-data-editor/lib/json-document');
const Transaction=require('../../packages/hkd-characters/lib/asset-transaction');
function plan(root){
  const relative='assets/resources/projectiles/catalog.json',file=path.join(root,relative),bytes=fs.readFileSync(file),original=JSON.parse(bytes),data=structuredClone(original),reads=new Map([[file,bytes]]),files=new Map();
  const source=path.join(root,'assets/resources/unit-library/fantasy-bosses/catalog.json'),raw=fs.readFileSync(source);reads.set(source,raw);
  const manifest=JSON.parse(raw),updated=structuredClone(manifest);
  updated.effectAssets=(manifest.effectAssets||[]).map(asset=>Object.assign({category:'Fantasy effects / '+asset.id.split('-').pop(),role:asset.id.split('-').pop()},asset));
  for(const asset of updated.effectAssets){
    const index=data.assets.findIndex(entry=>entry.id===asset.id);
    if(index<0)data.assets.push(asset);
    else if(data.assets[index].sourcePack==='fantasy-bosses')data.assets[index]=Object.assign({},data.assets[index],asset);
    else throw Error('Effect identifier is already used: '+asset.id);
  }
  if(!Document.equal(original,data))files.set(relative,Document.patch(bytes.toString('utf8'),original,data));
  if(!Document.equal(manifest,updated))files.set('assets/resources/unit-library/fantasy-bosses/catalog.json',Document.patch(raw.toString('utf8'),manifest,updated));
  return {root,files,reads};
}
function publish(root){const result=plan(root);return Transaction.commit(root,result.files,result.reads,'assets/resources/projectiles/catalog.json');}
module.exports={plan,publish};
if(require.main===module)console.log(JSON.stringify(publish(path.resolve(__dirname,'../..')),null,2));
