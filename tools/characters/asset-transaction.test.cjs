'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),vm=require('node:vm'),assert=require('node:assert/strict'),{test}=require('node:test');
const source=fs.readFileSync(path.resolve(__dirname,'../../packages/hkd-characters/lib/asset-transaction.js'),'utf8');
function fixture(t,onCopy){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'hkd-cross-volume-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const target=path.join(root,'catalog.json');fs.writeFileSync(target,'original');
  const calls=[];
  const mock=Object.assign({},fs,{
    renameSync(from,to){calls.push([from,to]);if(path.basename(path.dirname(from))==='staged')throw Object.assign(Error('different volume'),{code:'EXDEV'});return fs.renameSync(from,to);},
    copyFileSync(from,to,flags){fs.copyFileSync(from,to,flags);if(onCopy)onCopy(target);}
  });
  const module={exports:{}};
  vm.runInNewContext(source,{module,Buffer,require:name=>name==='fs'?mock:require(name)});
  return{root,target,calls,commit:module.exports.commit};
}
test('an explicit save publishes across volumes atomically and leaves no temporary asset siblings',t=>{
  const f=fixture(t),result=f.commit(f.root,new Map([['catalog.json','saved']]),new Map([[f.target,Buffer.from('original')]]),'catalog.json');
  assert.equal(fs.readFileSync(f.target,'utf8'),'saved');assert.equal(fs.readFileSync(path.resolve(f.root,result.backup),'utf8'),'original');
  const published=f.calls.at(-1);assert.equal(path.dirname(published[0]),path.dirname(published[1]));
  assert.deepEqual(fs.readdirSync(f.root),['catalog.json']);assert.equal(JSON.parse(fs.readFileSync(path.join(result.transaction,'transaction.json'))).status,'complete');
});
test('a concurrent edit during the cross-volume copy is retained and the unpublished temporary file is removed',t=>{
  const f=fixture(t,target=>fs.writeFileSync(target,'external'));
  assert.throws(()=>f.commit(f.root,new Map([['catalog.json','saved']]),new Map([[f.target,Buffer.from('original')]]),'catalog.json'),/Another editor changed/);
  assert.equal(fs.readFileSync(f.target,'utf8'),'external');assert.deepEqual(fs.readdirSync(f.root),['catalog.json']);assert.equal(f.calls.length,1);
});
