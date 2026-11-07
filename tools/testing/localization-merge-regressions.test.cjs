'use strict';
const assert=require('node:assert/strict'),test=require('node:test');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),vm=require('node:vm');
const {createRequire}=require('node:module');
const tool=path.resolve(__dirname,'../localization/merge-patch.cjs'),nativeRequire=createRequire(tool);
function fixture(t,hook) {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'hkd-localization-merge-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const file=path.join(root,'assets/resources/localization/catalog.json');fs.mkdirSync(path.dirname(file),{recursive:true});
  const catalog={version:1,languages:[{code:'en',nameKey:'language.en'},{code:'zh',nameKey:'language.zh'}],defaultLanguage:'en',
    entries:{hello:{en:'Hello',zh:'你好',context:'Keep context',future:{enabled:true}}},
    labelStyles:{'ui.button':{en:{fontSize:20,outlineWidth:2,future:{enabled:true}},zh:{fontSize:24}}},
    images:{banner:{key:'hello',rect:{x:1,y:2,width:30,height:40},future:12}},unknown:{scientific:100}};
  const original='\uFEFF'+JSON.stringify(catalog,null,'\t').replace('"scientific": 100','"scientific": 1e2').replaceAll('\n','\r\n')+'\r\n';
  fs.writeFileSync(file,original);
  const writes=[],wrapped=new Proxy(fs,{get(target,key){const value=target[key];
    if(['mkdirSync','writeFileSync','copyFileSync','renameSync','unlinkSync'].includes(key))return(...args)=>{
      writes.push({operation:key,file:String(args[0])});const result=value(...args);if(hook)hook(key,args,{root,file,original});return result;
    };
    if(key==='readFileSync')return(...args)=>{const result=value(...args);if(hook)hook(key,args,{root,file,original});return result;};
    return value;
  }});
  const module={exports:{}},localRequire=id=>id==='fs'?wrapped:nativeRequire(id);
  vm.runInNewContext(fs.readFileSync(tool,'utf8'),{require:localRequire,module,exports:module.exports,__dirname:path.dirname(tool),console,process},{filename:tool});
  function patch(data,name='patch.json'){fs.writeFileSync(path.join(root,name),typeof data==='string'?data:JSON.stringify(data));return name;}
  return {root,file,original,catalog,writes,patch,apply:names=>module.exports.applyPatches(root,names),read:()=>JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''))};
}
test('Partial localization patches preserve other locales, context, future fields and untouched bytes',t=>{
  const f=fixture(t);const result=f.apply([f.patch({entries:{hello:{en:'Hi'}},labelStyles:{'ui.button':{en:{fontSize:22}}},images:{banner:{rect:{x:5}}}})]);
  assert(result.saved);const value=f.read();assert.deepEqual(value.entries.hello,{...f.catalog.entries.hello,en:'Hi'});
  assert.deepEqual(value.labelStyles['ui.button'],{...f.catalog.labelStyles['ui.button'],en:{...f.catalog.labelStyles['ui.button'].en,fontSize:22}});
  assert.deepEqual(value.images.banner,{...f.catalog.images.banner,rect:{x:5,y:2,width:30,height:40}});
  assert.equal(fs.readFileSync(result.backup,'utf8'),f.original);
  const saved=fs.readFileSync(f.file,'utf8');assert(saved.startsWith('\uFEFF'));assert(saved.includes('"scientific": 1e2'));assert(saved.includes('\r\n'));
});
test('Missing, empty, and semantically unchanged patches perform no writes or backups',t=>{
  const f=fixture(t);
  for(const names of [[],[f.patch({},'empty.json')],[f.patch({entries:{hello:{en:'Hello',future:{enabled:true}}}},'same.json')]]){
    const result=f.apply(names);assert.equal(result.saved,false);assert.equal(f.writes.length,0);assert.equal(fs.readFileSync(f.file,'utf8'),f.original);
  }
  assert.equal(fs.existsSync(path.join(f.root,'local')),false);
});
test('Invalid patch sections, translation types and prototype keys are rejected without writes',t=>{
  const f=fixture(t);
  for(const patch of [{entries:{hello:{en:12}}},{timings:{}},{entries:[]},' {"entries":{"hello":{"__proto__":{"polluted":true}}}}']){
    assert.throws(()=>f.apply([f.patch(patch)]));assert.equal(f.writes.length,0);assert.equal(fs.readFileSync(f.file,'utf8'),f.original);
  }
  assert.equal({}.polluted,undefined);
});
test('Concurrent catalog change while patches are read aborts before any backup/write',t=>{
  let changed=false;const f=fixture(t,(op,args,{file,original})=>{
    if(op==='readFileSync'&&String(args[0]).endsWith('patch.json')&&!changed){changed=true;fs.writeFileSync(file,original.replace('Hello','External'));}
  });
  assert.throws(()=>f.apply([f.patch({entries:{hello:{en:'Mine'}}})]),/changed during merge/);
  assert.equal(f.read().entries.hello.en,'External');assert.equal(f.writes.length,0);
});
test('Concurrent catalog change after temporary write remains untouched and temporary output is removed',t=>{
  let changed=false;const f=fixture(t,(op,args,{file,original})=>{
    if(op==='writeFileSync'&&String(args[0]).endsWith('.tmp')&&!changed){changed=true;fs.writeFileSync(file,original.replace('Hello','External'));}
  });
  assert.throws(()=>f.apply([f.patch({entries:{hello:{en:'Mine'}}})]),/changed during merge/);
  assert.equal(f.read().entries.hello.en,'External');assert(!fs.readdirSync(path.dirname(f.file)).some(x=>x.endsWith('.tmp')));
  assert.equal(f.writes.filter(x=>x.operation==='renameSync').length,0);
});
