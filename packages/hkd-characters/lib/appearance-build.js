'use strict';
// Compile only on explicit Save. Changes to a saved hero also rebuild the
// derived item layers that include that hero's parts, in one revision-checked
// transaction; unsaved drafts in either panel are never read or published.
const fs=require('fs'),path=require('path'),Hero=require('./hero-bake'),Units=require('./native-bake'),Document=require('../../game-data-editor/lib/json-document');
const characterFile='assets/resources/characters/catalog.json',itemFile='assets/resources/hero-items/catalog.json';
const advisorId='character-retired-king',advisorPortrait='characters/retired-king-portrait';
function active(data){const id=data&&data.assignments&&data.assignments['hero:hero:default'];return id&&data.profiles[id]||null;}
function plan(root,data,assets,original,kind){
  const files=new Map(),reads=new Map();
  function merge(result){for(const [file,bytes]of result.files)files.set(file,bytes);for(const [file,bytes]of result.reads)reads.set(file,bytes);return result.data;}
  function read(relative){const file=path.join(root,relative);if(!fs.existsSync(file))return null;const bytes=fs.readFileSync(file),text=bytes.toString('utf8');reads.set(file,bytes);return {text,data:JSON.parse(text.replace(/^\uFEFF/,''))};}
  let updated;
  if(kind==='items'){
    const characters=read(characterFile);updated=merge(Hero.plan(root,data,assets,original,{heroBase:active(characters&&characters.data)}));
  }else{
    updated=merge(Units.plan(root,data,assets,original));updated=merge(Hero.plan(root,updated,assets,original,{kind:'characters'}));
    const advisor=updated.profiles[advisorId];
    if(advisor&&!Document.equal(advisor,original?.profiles?.[advisorId])){
      const readAsset=file=>{
        file=path.resolve(file);
        if(!reads.has(file))reads.set(file,fs.readFileSync(file));
        return reads.get(file);
      };
      const description=advisor.base.model
        ?require('./current-model').describe(root,advisor.base,true,readAsset)
        :!advisor.base.source
          ?require('../../game-data-editor/lib/unit-assets').describe(root,{type:advisor.base.type,id:advisor.base.id,noRuntime:true})
          :undefined;
      // The guide prefab, fighting-style lesson and battle HUD share this rig.
      const result=Units.bake(root,advisor,advisorId,null,new Map(assets.map(part=>[part.id,part])),readAsset,{description,portrait:advisorPortrait});
      for(const [file,bytes]of result.files)files.set(file,bytes);
    }
    if(Hero.stamp(active(original))!==Hero.stamp(active(updated))){
      const items=read(itemFile);
      if(items){const rebuilt=merge(Hero.plan(root,items.data,assets,items.data,{heroBase:active(updated)}));if(!Document.equal(items.data,rebuilt))files.set(itemFile,Document.patch(items.text,items.data,rebuilt));}
    }
  }
  return {data:updated,files,reads};
}
module.exports={plan};
