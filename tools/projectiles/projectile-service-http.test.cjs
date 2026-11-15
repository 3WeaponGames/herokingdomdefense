'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http');
const root=path.resolve(__dirname,'../..'),{createServer}=require('../characters/serve-editor.cjs');

async function fixture(t){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hkd-projectile-http-'));
  for(const relative of ['assets/resources/projectiles/catalog.json','assets/resources/localization/catalog.json','assets/KinghtFallConfig/GameJsonCfg.json']){const target=path.join(dir,relative);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(path.join(root,relative),target);}
  const server=createServer(dir,{kind:'projectiles'});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(async()=>{await new Promise(resolve=>server.close(resolve));fs.rmSync(dir,{recursive:true,force:true});});
  const origin='http://127.0.0.1:'+server.address().port;
  return{dir,origin,post(method,body,split){return new Promise((resolve,reject)=>{
    const bytes=Buffer.from(JSON.stringify(body)),request=http.request(origin+'/api/'+method,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json','Content-Length':bytes.length}},response=>{let text='';response.setEncoding('utf8');response.on('data',chunk=>text+=chunk);response.on('end',()=>resolve({status:response.statusCode,data:JSON.parse(text)}));});
    request.on('error',reject);request.on('socket',socket=>socket.setNoDelay(true));
    if(split){request.write(bytes.subarray(0,split));setTimeout(()=>request.end(bytes.subarray(split)),30);}else request.end(bytes);
  });}};
}

test('projectile HTTP changes preserve Unicode split across incoming network chunks and remain drafts',async t=>{
  const f=await fixture(t),file=path.join(f.dir,'assets/resources/projectiles/catalog.json'),before=fs.readFileSync(file),loaded=await f.post('load',{});
  assert.equal(loaded.status,200);const snapshot=loaded.data,label='测试骑士 🏹';snapshot.data.futureLabel=label;
  const body={version:snapshot.version,data:snapshot.data,timings:snapshot.timings},encoded=Buffer.from(JSON.stringify(body)),split=encoded.indexOf(Buffer.from(label))+1;
  const changed=await f.post('change',body,split);assert.equal(changed.status,200);assert.equal(changed.data.data.futureLabel,label);assert.equal(changed.data.dirty,true);
  assert.deepEqual(fs.readFileSync(file),before,'HTTP changes never publish until explicit Save');
});

test('projectile HTTP assets stay inside assets and mutations require the local editor origin',async t=>{
  const f=await fixture(t),image=Buffer.from('audit-image'),secret=path.join(f.dir,'private.png');fs.writeFileSync(path.join(f.dir,'assets/allowed.png'),image);fs.writeFileSync(secret,'private');
  const get=route=>new Promise((resolve,reject)=>http.get(f.origin+route,response=>{const chunks=[];response.on('data',chunk=>chunks.push(chunk));response.on('end',()=>resolve({status:response.statusCode,body:Buffer.concat(chunks)}));}).on('error',reject));
  const valid=await get('/asset/assets/allowed.png');assert.equal(valid.status,200);assert.deepEqual(valid.body,image);
  for(const relative of ['../private.png','private.png','assets/../private.png','assets\\..\\private.png','assets-neighbor/private.png']){
    const result=await get('/asset/'+encodeURIComponent(relative));assert.equal(result.status,400,relative);assert(!result.body.includes(Buffer.from('"private"')));
  }
  const result=await new Promise((resolve,reject)=>{const req=http.request(f.origin+'/api/save',{method:'POST',headers:{Origin:'https://example.invalid','Content-Type':'application/json'}},response=>{response.resume();response.on('end',()=>resolve(response.statusCode));});req.on('error',reject);req.end('{}');});
  assert.equal(result,400);assert.equal(fs.readFileSync(secret,'utf8'),'private');
});
