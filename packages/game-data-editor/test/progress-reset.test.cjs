'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),vm=require('node:vm'),{DatabaseSync}=require('node:sqlite');
const {operate}=require('../progress-reset/native-save.cjs');
const project=path.resolve(__dirname,'../../..'),roots=[];
function fixture(){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'hkd-progress-reset-'));roots.push(root);
  const file=path.join(root,'jsb.sqlite'),backupRoot=path.join(root,'backups'),db=new DatabaseSync(file);
  db.exec('CREATE TABLE data(key TEXT PRIMARY KEY,value TEXT)');
  const values=[['KinghtFall:KinghtFall#UserData','encrypted user bytes'],['KinghtFall:KinghtFall#GuideData','tutorial state'],['KinghtFall:KinghtFall#UserData.rewardJournal','pending reward'],['KinghtFall:gad_udata','wall defense'],['KinghtFall:future','unknown future player field'],['MUSICVOLUME','0.25'],['project-cocos.language','zh'],['igame_openId','identity'],['other-project:save','untouched']];
  values.forEach(row=>db.prepare('INSERT INTO data VALUES (?,?)').run(...row));db.close();
  const request={file,backupRoot,prefixes:['KinghtFall:']};
  return {root,file,values,request,inspect:()=>operate({...request,action:'inspect'}),rows(){const db=new DatabaseSync(file,{readOnly:true});try{return db.prepare('SELECT key,value FROM data ORDER BY key').all().map(r=>[r.key,r.value]);}finally{db.close();}}};
}
test.afterEach(()=>{for(const root of roots.splice(0)){const relative=path.relative(os.tmpdir(),fs.realpathSync(root));assert(relative.startsWith('hkd-progress-reset-')&&!relative.includes('..'));fs.rmSync(root,{recursive:true,force:true});}});
test('Simulator inspection performs no writes or backup and menu opening only opens the reset panel',()=>{
  const f=fixture(),before=fs.readFileSync(f.file),status=f.inspect();assert.equal(status.records,5);assert.equal(status.total,9);assert.deepEqual(fs.readFileSync(f.file),before);assert(!fs.existsSync(f.request.backupRoot));
  const source=fs.readFileSync(path.join(__dirname,'../main.js'),'utf8'),unit={exports:{}},calls=[];
  vm.runInNewContext(source,{module:unit,require:name=>name==='path'?path:name==='./lib/store'?{Store:class{constructor(){throw Error('Must not load authoring data');}}}:require(name),Editor:{Panel:{open:name=>calls.push(name)}}});
  unit.exports.messages['open-progress-reset']();assert.deepEqual(calls,['hkd-progress-reset']);
  assert.equal(require('../package.json')['main-menu']['Tools/Battle/Reset All Progress'].message,'game-data-editor:open-progress-reset');
});
test('Simulator reset backs up every exact record, removes all game progress and keeps settings/identity/other data',()=>{
  const f=fixture(),status=f.inspect(),result=operate({...f.request,action:'reset',revision:status.revision,confirm:'RESET'});
  assert.equal(result.removed,5);const backup=JSON.parse(fs.readFileSync(result.backup,'utf8'));
  assert.deepEqual(backup.storage,f.values.slice().sort((a,b)=>a[0]<b[0]?-1:1));
  assert.deepEqual(f.rows(),backup.storage.filter(row=>!row[0].startsWith('KinghtFall:')));
  assert.equal(f.inspect().records,0);
});
test('stale review, incorrect confirmation and a failed backup preserve Simulator progress',()=>{
  for(const kind of ['stale','confirmation','backup']){
    const f=fixture(),status=f.inspect(),before=f.rows();let request={...f.request,action:'reset',revision:status.revision,confirm:'RESET'};
    if(kind==='stale')request.revision='old';if(kind==='confirmation')request.confirm='';if(kind==='backup'){fs.writeFileSync(f.request.backupRoot,'disk unavailable');}
    assert.throws(()=>operate(request));assert.deepEqual(f.rows(),before,kind);
  }
});
test('an empty Simulator reset creates no backup, and unknown databases are rejected',()=>{
  const f=fixture(),db=new DatabaseSync(f.file);db.exec("DELETE FROM data WHERE key LIKE 'KinghtFall:%'");db.close();
  const status=f.inspect(),result=operate({...f.request,action:'reset',revision:status.revision,confirm:'RESET'});assert.equal(result.removed,0);assert(!fs.existsSync(f.request.backupRoot));
  assert.throws(()=>operate({...f.request,file:path.join(f.root,'other.sqlite'),action:'inspect'}));
});
test('the Browser bridge validates origin/token, verifies backups before completion, and stores them outside the project',async()=>{
  const f=fixture(),source=fs.readFileSync(path.join(__dirname,'../progress-reset/service.js'),'utf8'),unit={exports:{}},opened=[];
  const fakeOS={...os,homedir:()=>f.root};
  vm.runInNewContext(source,{module:unit,__dirname:path.join(__dirname,'../progress-reset'),Buffer,process,setTimeout,clearTimeout,require:name=>name==='os'?fakeOS:name==='electron'?{shell:{openExternal:url=>opened.push(url)}}:require(name)});
  const service=unit.exports,Editor={PreviewServer:{_previewPort:7456}};
  try{
    const status=await service.handle(Editor,project,{action:'status'});assert.equal(opened.length,0);assert(!fs.existsSync(status.backupRoot));
    const result=await service.handle(Editor,project,{action:'open-browser',hostname:'localhost'}),url=new URL(result.url),endpoint=url.searchParams.get('hkd-reset-bridge'),token=url.searchParams.get('hkd-reset-progress');
    assert.equal(opened.length,1);assert.equal(url.origin,'http://localhost:7456');
    const request={action:'backup',token,origin:url.origin,prefixes:['KinghtFall:'],storage:f.values};
    const send=(body,origin=url.origin)=>fetch(endpoint,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(body)});
    assert.equal((await send(request,'http://malicious.example')).status,403);assert.equal((await send({...request,token:'invalid'})).status,400);
    const saved=await (await send(request)).json();assert(saved.backup.startsWith(f.root));assert(!saved.backup.startsWith(project));
    assert.deepEqual(JSON.parse(fs.readFileSync(saved.backup,'utf8')).storage,f.values);
    assert.equal((await send({...request,storage:[['different','player']]})).status,400);
    assert.equal((await send({action:'complete',token,removed:5})).status,200);
    assert.equal((await service.handle(Editor,project,{action:'status'})).browser.removed,5);
    assert.equal((await send(request)).status,400);
  }finally{service.shutdown();}
});
