'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),vm=require('node:vm'),{createRequire}=require('node:module');
const script=path.join(__dirname,'audit-project.cjs'),root=path.resolve(__dirname,'../..');
function audit(data){
  const catalog={languages:[{code:'en'},{code:'zh'}],entries:{'fixture.title':{en:'Title',zh:'标题'}},labelStyles:{'fixture.title':{en:{width:100},zh:{width:100}}}},before=JSON.stringify(data),processMock={argv:['node',script,'--report',path.join(os.tmpdir(),'hkd-localization-audit-fixture.json')]};let report,writes=0;
  const io={readdirSync(){return[{name:'fixture.prefab',isDirectory:()=>false}];},readFileSync(file){if(String(file).endsWith('catalog.json'))return JSON.stringify(catalog);if(String(file).endsWith('.meta'))return JSON.stringify({uuid:'fixture-prefab'});assert.equal(path.resolve(file),path.join(root,'assets/fixture.prefab'));return JSON.stringify(data);},mkdirSync(){},writeFileSync(file,text){writes++;assert.equal(path.basename(file),'hkd-localization-audit-fixture.json');report=JSON.parse(text);}};
  vm.runInNewContext(fs.readFileSync(script,'utf8'),{__dirname,process:processMock,console:{log(){}},require:name=>name==='fs'?io:createRequire(script)(name)},{filename:script});
  assert.equal(JSON.stringify(data),before,'Audit leaves serialized slots untouched');assert.equal(writes,1,'Audit only writes its report');return{report,exitCode:processMock.exitCode||0};
}
test('localization audit skips null serialized slots while inspecting every surviving text component',()=>{
  const result=audit([null,{__type__:'cc.Node',_contentSize:{width:100}},null,{__type__:'cc.Label',node:{__id__:1},_string:'[[loc:fixture.title]]'},null]);
  assert.equal(result.exitCode,0);assert.deepEqual(result.report.errors,[]);assert.equal(result.report.counts.serializedTextFields,1);assert.equal(result.report.counts.styledLabels,1);
});
test('null node and placeholder slots preserve label inspection and report invalid text geometry without crashing',()=>{
  const result=audit([null,{__type__:'cc.Label',node:{__id__:0},_string:'[[loc:fixture.title]]'},{__type__:'cc.RichText',node:{__id__:0},_string:'[[loc:fixture.title]]'},{__type__:'cc.EditBox',_N$placeholderLabel:{__id__:0}}]);
  assert.equal(result.exitCode,1);assert.equal(result.report.counts.styledLabels,1);assert.deepEqual(result.report.errors.map(error=>error.type),['unbounded-richtext','invalid-placeholder-label']);
});
