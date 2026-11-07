'use strict';
// Actual compiler preparation and audit script; file availability/reports are
// inert so these tests cannot write game assets or launch an artwork renderer.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{createRequire}=require('node:module');
const root=path.resolve(__dirname,'../..'),file=path.join(__dirname,'audit-art-coverage.cjs'),Art=require('../../packages/localization-editor/lib/art-compiler');
function catalog(languages){
  const value={version:1,defaultLanguage:'en',languages:[{code:'en',nameKey:'language.en'},{code:'zh',nameKey:'language.zh'}],entries:{title:{en:'Title',zh:'标题'},'language.en':{en:'English',zh:'英语'},'language.zh':{en:'Chinese',zh:'中文'}},images:{source:{key:'title',template:'title',artwork:{en:'localization/generated/en/title'}}},artTemplates:{title:{width:10,height:10,regions:[{key:'title',rect:{x:0,y:0,width:10,height:10}}]}}};
  if(languages!==undefined)value.artTemplates.title.languages=languages;return value;
}
function audit(value,available,assetMode){
  const before=JSON.stringify(value),prepared=Art.prepare(value,root),script=assetMode?path.join(root,'tools/testing/audit-assets.cjs'):file;let report,writes=0;const processMock={argv:['node',script,'--catalog','local/fixture.json','--report','local/fixture-report.json']};
  const io={readFileSync(name){if(String(name).endsWith('fixture.meta'))return JSON.stringify({uuid:'fixture-scene'});if(String(name).endsWith('builder.json'))return JSON.stringify({startScene:'fixture-scene'});if(String(name).endsWith('GameJsonCfg.json'))return JSON.stringify({LevelCfg:[],ParameterCfg:{},GiftCfg:[]});return JSON.stringify(value);},readdirSync(){return[{name:'fixture.meta',isDirectory:()=>false}];},existsSync:name=>available.some(locale=>path.normalize(name).endsWith(path.normalize('generated/'+locale+'/title.png'))),mkdirSync(){},writeFileSync(name,text){writes++;assert.equal(path.basename(name),assetMode?'assets.json':'fixture-report.json');report=JSON.parse(text);}};
  vm.runInNewContext(fs.readFileSync(script,'utf8'),{__dirname:path.dirname(script),process:processMock,console:{log(){}},require:name=>name==='fs'?io:createRequire(script)(name)},{filename:script});
  assert.equal(JSON.stringify(value),before);assert.equal(writes,1,'only diagnostic report is written');return {report,prepared,exitCode:processMock.exitCode||0};
}
test('both artwork audits respect explicit locales accepted by the compiler and original-image fallback',()=>{
  for(const assetMode of [false,true]){const result=audit(catalog(['en']),['en'],assetMode);assert.deepEqual(result.prepared.templates.title.languages,['en']);assert.equal(result.exitCode,0);assert.deepEqual(assetMode?result.report.artwork.missingArt:result.report.generatedMissing,[]);}
});
test('artwork coverage still fails missing outputs for selected locales and defaults to every catalog locale',()=>{
  for(const assetMode of [false,true]){for(const selection of [undefined,['en','zh']]){const result=audit(catalog(selection),['en'],assetMode);assert.equal(result.exitCode,1);assert.equal(assetMode?result.report.artwork.missingArt[0].file:result.report.generatedMissing[0],'assets/resources/localization/generated/zh/title.png');}
    assert.equal(audit(catalog(),['en','zh'],assetMode).exitCode,0);assert.equal(audit(catalog(['en']),[],assetMode).exitCode,1);}
});
test('an explicitly empty locale list requires no generated output and leaves the source bindings intact',()=>{
  const value=catalog([]);value.images.source.artwork={};for(const assetMode of [false,true]){const result=audit(value,[],assetMode);assert.deepEqual(result.prepared.templates.title.languages,[]);assert.equal(result.exitCode,0);}
});
test('both audits require output for a newly configured locale when no template restriction is present',()=>{
  const value=catalog();value.languages.push({code:'fr',nameKey:'language.fr'});value.entries['language.fr']={en:'French',zh:'法语',fr:'Français'};value.entries.title.fr='Titre';
  for(const assetMode of [false,true]){assert.equal(audit(value,['en','zh'],assetMode).exitCode,1);assert.equal(audit(value,['en','zh','fr'],assetMode).exitCode,0);}
});
