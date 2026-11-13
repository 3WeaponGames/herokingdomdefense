'use strict';
// The approved paint layers are additive, except the explicitly restored
// economy body/farm attachments. Reverse those deltas before older source
// contracts run; never rebaseline an original skeleton or ignore a timeline.
const assert=require('node:assert/strict'),crypto=require('node:crypto');
const fixture=require('./painted-building-integration.fixture.json');
const clone=value=>JSON.parse(JSON.stringify(value));
function canonical(value){
  if(typeof value==='number')return Math.round(value*1e6)/1e6;
  if(Array.isArray(value))return value.map(canonical);
  if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])]));
  return value;
}
const sha=value=>crypto.createHash('sha256').update(value).digest('hex'),hash=value=>sha(JSON.stringify(canonical(value)));
function withoutPainted(asset,value){
  const contract=fixture.rigs[asset];if(!contract)return clone(value);
  const json=require("./mill-field-contract.cjs").withoutDefense(asset,clone(value));
  assert.equal(hash(json.skeleton),contract.currentHeader,asset+' reviewed culling header');
  json.skeleton=clone(contract.originalHeader);
  for(const [field,added]of [['bones',contract.newBones],['slots',contract.newSlots],['skins',contract.newSkins]]){
    for(const item of added){const actual=json[field].find(v=>v.name===item.name);assert(actual,asset+' missing approved '+field+'/'+item.name);assert.equal(hash(actual),item.hash,asset+' changed approved '+field+'/'+item.name);}
    const names=new Set(added.map(v=>v.name));json[field]=json[field].filter(v=>!names.has(v.name));
  }
  for(const item of contract.attachmentRestores){
    const attachments=json.skins.find(v=>v.name===item.skin)?.attachments[item.slot];assert(attachments,item.skin+'/'+item.slot);
    assert.equal(hash(attachments[item.name]),item.current,asset+' reviewed attachment transform/path guard');attachments[item.name]=clone(item.original);
  }
  for(const item of contract.animationChannels){
    const channel=json.animations[item.clip]?.[item.channel];assert(channel,asset+' missing approved channel');
    assert.equal(hash(channel[item.name]),item.hash,asset+'/'+item.clip+'/'+item.channel+'/'+item.name+' approved animation guard');delete channel[item.name];
    if(!Object.keys(channel).length&&!contract.originalAnimationChannels[item.clip].includes(item.channel))delete json.animations[item.clip][item.channel];
  }
  assert.equal(hash(json),contract.beforeSkeleton,asset+' native skeleton must equal its pre-paint semantic baseline after only reviewed additions are reversed');
  return json;
}
function withoutPaintedMetadata(asset,value){
  const contract=fixture.rigs[asset];if(!contract)return clone(value);const result=clone(value);
  require("./mill-field-contract.cjs").metadata(asset,result);
  assert.deepEqual(result.textures,[...contract.originalTextures,...contract.pages.map(v=>v.uuid)],asset+' binds exactly its original and approved appended atlas pages');
  result.textures=result.textures.slice(0,contract.originalTextures.length);
  assert.equal(hash(result),contract.originalJsonMetadata,asset+' retains original UUID and all non-texture metadata');return result;
}
function withoutPaintedAtlas(asset,text){
  const contract=fixture.rigs[asset];if(!contract)return text;const normalized=require('./mill-field-contract.cjs').atlas(asset,text.replace(/\r\n/g,'\n'));
  const marker='\n'+contract.pages[0].name+'\n',index=normalized.indexOf(marker);assert(index>=0,asset+' missing approved appended page');
  const prefix=normalized.slice(0,index).trim(),append=normalized.slice(index).trim();
  assert.deepEqual(append.split('\n').filter(v=>/^[^\s]+\.png$/.test(v)),contract.pages.map(v=>v.name),asset+' no unknown appended pages');
  assert.equal(sha(append),contract.appendedAtlas,asset+' approved atlas region layout guard');assert.equal(sha(prefix),contract.beforeAtlas,asset+' original atlas byte layout');return prefix;
}
function legacyRead(file,value){
  const normalized=String(file).replace(/\\/g,'/'),match=normalized.match(/(?:^|\/)assets\/KinghtFallIconMap\/com\/Ani\/(cb|by|mf|td|mz)\/\1\.json(\.meta)?$/);
  return match?(match[2]?withoutPaintedMetadata(match[1],value):withoutPainted(match[1],value)):value;
}
function assertConfig(file,config){
  const contract=fixture.config[file];assert(contract,'documented config '+file);
  assert.deepEqual(Object.keys(config.BuildEnum),Object.keys(contract.originalFamilies),'original building enum identities');
  for(const[id,header]of Object.entries(contract.originalFamilies)){
    const family=config.BuildEnum[id],{levelList,...actualHeader}=family;assert.deepEqual(actualHeader,header,'family '+id+' original unknown/header fields');
    const expected=contract.families[id];if(!expected)continue;
    assert.equal(levelList.length,expected.originalRows.length+expected.addedRows.length,'exact authorized tier count');
    assert.equal(new Set(levelList.map(v=>v.index)).size,levelList.length,'unique original and appended indices');
    for(const row of expected.originalRows){
      const actual=levelList.find(v=>v.index===row.index);assert(actual,'original row '+id+'/'+row.index);
      const values=clone(actual);for(const key of ['Skin','Icon','Appearance','BranchBuild'])delete values[key];
      assert.deepEqual(values,row.values,'original stats, costs, colliders, routes, timing and unknown row fields '+id+'/'+row.index);
      assert.deepEqual(actual.BranchBuild||null,row.branch,'explicit authorized tier route');
      assert.equal(actual.Skin,row.visual.Skin);assert.equal(actual.Icon,row.visual.Icon);
      if(row.visual.Appearance)assert.equal(hash(actual.Appearance),row.visual.Appearance,'approved tower appearance/immutable weapon mapping');else assert.equal(actual.Appearance,undefined,'native animated families cannot acquire a static replacement');
    }
    for(const row of expected.addedRows)assert.deepEqual(levelList.find(v=>v.index===row.index),row,'authorized fourth-tier progression and visual bindings');
  }
}
module.exports={fixture,canonical,hash,sha,clone,withoutPainted,withoutPaintedMetadata,withoutPaintedAtlas,legacyRead,assertConfig};
