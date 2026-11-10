'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {Service,fingerprint}=require('../worlds/service'),L=require('../worlds/legacy');

function fixture(t){
 const base=fs.mkdtempSync(path.join(os.tmpdir(),'hkd-delete-transaction-')),root=path.join(base,'project'),artifacts=path.join(base,'artifacts');fs.mkdirSync(root);
 t.after(()=>{assert.equal(path.dirname(path.resolve(base)),path.resolve(os.tmpdir()));fs.rmSync(base,{recursive:true,force:true});});
 const service=new Service(root,{artifacts});service.snapshot=key=>({key,version:service.version});
 const write=(file,value)=>{const target=path.join(root,file);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,value);return target;};
 return {base,root,artifacts,service,write};
}
function journal(folder){return JSON.parse(fs.readFileSync(path.join(folder,'journal.json'),'utf8'));}

test('world transactions: image deletion, metadata deletion, manifest update and new runtime artwork commit together',t=>{
 const f=fixture(t),image='authoring/images/obsolete.png',meta=image+'.meta',manifest='authoring/library.json',runtime='assets/generated/ground.png';
 const original=Buffer.from([0,255,128,3]),a=f.write(image,original),b=f.write(meta,'metadata'),c=f.write(manifest,'old manifest'),originals={[image]:fingerprint(a),[meta]:fingerprint(b),[manifest]:fingerprint(c),[runtime]:null};
 const result=f.service.commit([{file:manifest,bytes:Buffer.from('new manifest')},{file:image,bytes:null},{file:meta,bytes:null},{file:runtime,bytes:Buffer.from('runtime artwork')}],originals);
 assert(result.saved);assert.deepEqual(new Set(result.files),new Set([manifest,image,meta,runtime]));assert(!fs.existsSync(a));assert(!fs.existsSync(b));assert.equal(fs.readFileSync(c,'utf8'),'new manifest');assert.equal(fs.readFileSync(path.join(f.root,runtime),'utf8'),'runtime artwork');
 const record=journal(result.backup);assert.equal(record.status,'committed');assert.equal(record.files.find(x=>x.file===image).after,null);assert.equal(record.files.find(x=>x.file===meta).after,null);assert.deepEqual(fs.readFileSync(path.join(result.backup,image)),original);assert.equal(f.service.recoveries().length,0);
});

test('world transactions: deleting an already absent file and writing identical bytes performs no writes',t=>{
 const f=fixture(t),file='authoring/kept.txt',absolute=f.write(file,'unchanged'),missing='authoring/missing.png';
 assert.deepEqual(f.service.commit([{file:missing,bytes:null},{file,bytes:Buffer.from('unchanged')}],{[missing]:null,[file]:fingerprint(absolute)}),{saved:false,files:[]});assert(!fs.existsSync(f.artifacts));
});

test('world transactions: stale delete revisions and unguarded targets cannot overwrite a changed source',t=>{
 const f=fixture(t),file='authoring/image.png',absolute=f.write(file,'original'),before=fingerprint(absolute);fs.writeFileSync(absolute,'concurrent artwork');
 assert.throws(()=>f.service.commit([{file,bytes:null}],{[file]:before}),/Concurrent change/);assert.equal(fs.readFileSync(absolute,'utf8'),'concurrent artwork');
 assert.throws(()=>f.service.commit([{file,bytes:null}],{}),/Missing revision guard/);assert(!fs.existsSync(f.artifacts));
});

test('world transactions: failure after a deletion restores exact binary and empty source files',t=>{
 const f=fixture(t),image='authoring/image.png',empty='authoring/empty.png',output='assets/generated/ground.png',original=Buffer.from([1,0,128,255]),a=f.write(image,original),b=f.write(empty,Buffer.alloc(0)),c=f.write(output,'before');
 const move=fs.renameSync;fs.renameSync=function(from,to){if(to===c)throw Error('runtime update failed');return move.apply(this,arguments);};
 try{assert.throws(()=>f.service.commit([{file:image,bytes:null},{file:empty,bytes:null},{file:output,bytes:Buffer.from('after')}],{[image]:fingerprint(a),[empty]:fingerprint(b),[output]:fingerprint(c)}),/runtime update failed/);}finally{fs.renameSync=move;}
 assert.deepEqual(fs.readFileSync(a),original);assert.equal(fs.readFileSync(b).length,0);assert.equal(fs.readFileSync(c,'utf8'),'before');const directories=fs.readdirSync(path.join(f.artifacts,'saves'));assert.equal(directories.length,1);assert.equal(journal(path.join(f.artifacts,'saves',directories[0])).status,'rolled-back');assert.equal(f.service.recoveries().length,0);
});

test('world transactions: a concurrent recreation during rollback is retained and requires explicit recovery',t=>{
 const f=fixture(t),image='authoring/image.png',output='assets/generated/ground.png',a=f.write(image,'original'),b=f.write(output,'before'),originals={[image]:fingerprint(a),[output]:fingerprint(b)},move=fs.renameSync;
 fs.renameSync=function(from,to){if(to===b){fs.writeFileSync(a,'concurrent recreation');throw Error('runtime update failed');}return move.apply(this,arguments);};
 try{assert.throws(()=>f.service.commit([{file:image,bytes:null},{file:output,bytes:Buffer.from('after')}],originals),/runtime update failed/);}finally{fs.renameSync=move;}
 assert.equal(fs.readFileSync(a,'utf8'),'concurrent recreation');assert.equal(f.service.recoveries()[0].status,'recovery-required');assert.throws(()=>f.service.recoverTransaction({key:'map:test'}),/Concurrent change prevents automatic recovery/);assert.equal(fs.readFileSync(a,'utf8'),'concurrent recreation');
 fs.unlinkSync(a);const recovered=f.service.recoverTransaction({key:'map:test'});assert(recovered.result.recovered);assert.equal(fs.readFileSync(a,'utf8'),'original');assert.equal(fs.readFileSync(b,'utf8'),'before');assert.equal(f.service.recoveries().length,0);
});

test('world transactions: a crash journal containing deletions is read-only until explicit recovery restores its complete baseline',t=>{
 const f=fixture(t),image='authoring/image.png',manifest='authoring/library.json',created='assets/generated/new.png',oldImage=Buffer.from([4,3,2,1]),oldManifest=Buffer.from('old'),newManifest=Buffer.from('new'),newOutput=Buffer.from('created'),folder=path.join(f.artifacts,'saves','interrupted');
 f.write(manifest,newManifest);f.write(created,newOutput);for(const [file,value]of [[image,oldImage],[manifest,oldManifest]]){const target=path.join(folder,file);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,value);}
 const records=[{file:image,before:L.hash(oldImage),after:null},{file:manifest,before:L.hash(oldManifest),after:L.hash(newManifest)},{file:created,before:null,after:L.hash(newOutput)}];fs.writeFileSync(path.join(folder,'journal.json'),JSON.stringify({status:'prepared',files:records}));
 assert.equal(f.service.recoveries().length,1);assert(!fs.existsSync(path.join(f.root,image)),'listing recovery never restores an asset');assert.equal(fs.readFileSync(path.join(f.root,manifest),'utf8'),'new');const version=f.service.version;
 const result=f.service.recoverTransaction({key:'map:test'});assert(result.result.recovered);assert.equal(f.service.version,version+1);assert.deepEqual(fs.readFileSync(path.join(f.root,image)),oldImage);assert.equal(fs.readFileSync(path.join(f.root,manifest),'utf8'),'old');assert(!fs.existsSync(path.join(f.root,created)));assert.equal(journal(folder).status,'rolled-back');
});

test('world transactions: malformed all-null tombstones and duplicate targets are rejected before any project writes',t=>{
 const f=fixture(t),file='authoring/image.png',absolute=f.write(file,'original'),folder=path.join(f.artifacts,'saves','malformed');fs.mkdirSync(folder,{recursive:true});fs.writeFileSync(path.join(folder,'journal.json'),JSON.stringify({status:'prepared',files:[{file,before:null,after:null}]}));
 assert.equal(f.service.recoveries()[0].status,'invalid');assert.throws(()=>f.service.recoverTransaction({key:'map:test'}),/Invalid recovery journal/);assert.equal(fs.readFileSync(absolute,'utf8'),'original');
 assert.throws(()=>f.service.commit([{file,bytes:null},{file,bytes:Buffer.from('replacement')}],{[file]:fingerprint(absolute)}),/Duplicate transaction target/);assert.equal(fs.readFileSync(absolute,'utf8'),'original');
});
