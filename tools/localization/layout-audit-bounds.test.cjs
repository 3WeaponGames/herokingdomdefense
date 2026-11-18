'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),cp=require('node:child_process');
const root=path.resolve(__dirname,'../..');
test('layout audit accepts explicit natural unwrapped width and rejects invalid or wrapped zero bounds',t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hkd-layout-audit-'));
  t.after(()=>{assert.equal(path.dirname(path.resolve(dir)),path.resolve(os.tmpdir()));assert(path.basename(dir).startsWith('hkd-layout-audit-'));fs.rmSync(dir,{recursive:true,force:true});});
  const catalog=JSON.parse(fs.readFileSync(path.join(root,'assets/resources/localization/catalog.json'),'utf8')),input=path.join(dir,'catalog.json'),report=path.join(dir,'report.json');
  function add(key,options){catalog.entries[key]={en:'Layout check',zh:'布局检查'};catalog.labelStyles[key]={en:options};}
  function run(){fs.writeFileSync(input,JSON.stringify(catalog));const result=cp.spawnSync(process.execPath,['tools/localization/audit-project.cjs','--catalog',input,'--report',report],{cwd:root,encoding:'utf8',env:{...process.env,HKD_ARTIFACT_DIR:dir},windowsHide:true,maxBuffer:4*1024*1024});assert.ifError(result.error);return{status:result.status,report:JSON.parse(fs.readFileSync(report,'utf8'))};}
  add('audit.natural.width',{width:0,wrap:false,maxLines:1});const valid=run();assert.equal(valid.status,0,JSON.stringify(valid.report.errors));assert.equal(valid.report.summary.errorCount,0);
  for(const [key,options]of Object.entries({negative:{width:-1},wrapped:{width:0,wrap:true},missing:{wrap:false},height:{width:100,height:0}}))add('audit.invalid.'+key,options);
  const invalid=run();assert.equal(invalid.status,1);assert.equal(invalid.report.errors.length,4);assert(invalid.report.errors.every(e=>e.type==='invalid-layout-bounds'));
});
