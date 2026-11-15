'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const root=path.resolve(__dirname,'../..');
test('isolated engine fixtures index all eighteen exact wall prefabs and their imported UUID dependencies',()=>{
  const records=require('./engine-prefab-records.cjs').records(root);assert.equal(Object.keys(records.prefabs).length,18);
  for(const [resource,data]of Object.entries(records.prefabs))assert.deepEqual(data,JSON.parse(fs.readFileSync(path.join(root,'assets/gad_prefabs',resource+'.prefab'),'utf8')));
  const list=Object.values(records.assets);assert(list.some(asset=>asset.kind==='sprite-frame'));assert(list.some(asset=>asset.kind==='texture'));assert.equal(list.filter(asset=>asset.kind==='animation').length,3);assert(list.some(asset=>asset.kind==='particle'));
  assert.deepEqual(records.missing,[],'every shipped prefab dependency is available');
  assert.equal(records.assets['eca5d2f2-8ef6-41c2-bbe6-f9c79d09c432'].kind,'builtin-material');
  let corrected=0;for(const data of Object.values(records.prefabs))for(const component of data)if(component.__type__==='cc.ParticleSystem'&&component._file===null){assert.equal(component._custom,true);assert(component._spriteFrame&&records.assets[component._spriteFrame.__uuid__],'custom emitter retains its imported art');assert(component.emissionRate>0);corrected++;}assert.equal(corrected,16,'only obsolete custom plist references were cleared');
  assert(records.modules.GAD_BulletEffect.source.includes('resetSystem'));assert.equal(records.modules.GAD_BulletEffect.uuid,'71927e38-7d63-44bc-a50e-b9da3a871187');
});
test('engine records accept BOM-prefixed prefab, animation and metadata JSON without changing resource records',t=>{
  const Records=require('./engine-prefab-records.cjs'),before=Records.records(root),read=fs.readFileSync;
  t.mock.method(fs,'readFileSync',function(file,...args){const value=read.call(this,file,...args);return args[0]==='utf8'&&/\.(?:meta|anim|prefab|mtl)$/.test(String(file))?'\uFEFF'+value:value;});
  assert.deepEqual(Records.records(root),before);
});
