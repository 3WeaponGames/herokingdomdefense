'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),zlib=require('node:zlib'),vm=require('node:vm'),http=require('node:http'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'../..'),Frames=require('./png-frames.cjs'),Builder=require('./build-library.cjs');
function temporary(t){const directory=fs.mkdtempSync(path.join(os.tmpdir(),'hkd-projectile-pipeline-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));return directory;}
function png(width,height,type,rows,transparency){
  function chunk(name,data){const header=Buffer.alloc(8),crc=Buffer.alloc(4);header.writeUInt32BE(data.length);header.write(name,4);let checksum=0xffffffff;for(const byte of Buffer.concat([header.subarray(4),data])){checksum^=byte;for(let bit=0;bit<8;bit++)checksum=(checksum>>>1)^((checksum&1)?0xedb88320:0);}crc.writeUInt32BE((checksum^0xffffffff)>>>0);return Buffer.concat([header,data,crc]);}
  const header=Buffer.alloc(13);header.writeUInt32BE(width);header.writeUInt32BE(height,4);header[8]=8;header[9]=type;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),...(transparency?[chunk('tRNS',transparency)]:[]),chunk('IDAT',zlib.deflateSync(Buffer.from(rows))),chunk('IEND',Buffer.alloc(0))]);
}
test('atlas inspection rejects invalid grids and truncated pixels instead of calibrating corrupt imports',t=>{
  const file=path.join(temporary(t),'atlas.png'),grid={frames:2,columns:2,cell:1};
  fs.writeFileSync(file,png(2,1,6,[0,255,0,0,255,0,0,0,0]));
  assert.deepEqual(Frames.visibleFrames(file,grid),[0]);
  for(const invalid of [{...grid,cell:0},{...grid,frames:3},{...grid,columns:3},{...grid,frames:1.5}])assert.throws(()=>Frames.inspectFrames(file,invalid),/grid/);
  fs.writeFileSync(file,png(2,1,6,[0,255,0,0,255]));assert.throws(()=>Frames.inspectFrames(file,grid),/Truncated.*pixels/);
  const broken=png(2,1,6,[0,255,0,0,255,0,0,0,0]);fs.writeFileSync(file,broken.subarray(0,broken.length-2));assert.throws(()=>Frames.inspectFrames(file,grid),/Truncated.*chunk/);
});
test('atlas inspection honors RGB and grayscale color-key transparency when detecting blank cells',t=>{
  const file=path.join(temporary(t),'atlas.png'),grid={frames:2,columns:2,cell:1};
  fs.writeFileSync(file,png(2,1,2,[0,20,30,40,50,60,70],Buffer.from([0,20,0,30,0,40])));
  assert.deepEqual(Frames.visibleFrames(file,grid),[1]);
  fs.writeFileSync(file,png(2,1,0,[0,42,200],Buffer.from([0,42])));
  assert.deepEqual(Frames.visibleFrames(file,grid),[1]);
});
test('library extraction preserves authored zero trail opacity and particle motion settings',t=>{
  const read=fs.readFileSync,file=path.join(root,'assets/gad_prefabs/bullets/PBT_Bullet_7.prefab');
  const prefab=JSON.parse(read(file,'utf8')),particle=prefab.find(value=>value.__type__==='cc.ParticleSystem'),trail=prefab.find(value=>value.__type__==='cc.MotionStreak');
  Object.assign(particle,{_positionType:2,gravity:{x:12,y:-80},duration:.25,radialAccelVar:15,tangentialAccelVar:7});trail._color.a=0;
  t.mock.method(fs,'readFileSync',function(source,...args){if(path.resolve(String(source))===file){const text=JSON.stringify(prefab);return args[0]?text:Buffer.from(text);}return read.call(this,source,...args);});
  const asset=Builder.library(root).assets.find(value=>value.id==='wall:7'),emitter=asset.visualLayers.find(value=>value.kind==='particles');
  assert.equal(asset.visualLayers.find(value=>value.kind==='trail').opacity,0);
  assert.equal(emitter.positionType,2);assert.deepEqual(emitter.gravity,{x:12,y:-80});assert.equal(emitter.duration,.25);assert.equal(emitter.radialAccelVar,15);assert.equal(emitter.tangentialAccelVar,7);
});
test('library rebuild accepts BOM JSON and preserves catalog bytes and future fields without publishing',t=>{
  const read=fs.readFileSync,file=path.join(root,'assets/resources/projectiles/catalog.json'),parts=path.join(root,'assets/resources/character-parts/catalog.json'),catalog=JSON.parse(read(file,'utf8'));
  catalog.futureAudit={retained:true};catalog.assignments.hero={flight:catalog.assets[0].id,futureSetting:7};let before='\uFEFF'+JSON.stringify(catalog,null,2)+'\n';
  t.mock.method(fs,'readFileSync',function(source,...args){const resolved=path.resolve(String(source));if(resolved===file)return args[0]?before:Buffer.from(before);const value=read.call(this,source,...args);return resolved===parts?'\uFEFF'+value:value;});
  let published;const module={exports:{}},localRequire=require('node:module').createRequire(path.join(__dirname,'build-library.cjs'));
  const source=read(path.join(__dirname,'build-library.cjs'),'utf8');
  vm.runInNewContext(source,{module,exports:module.exports,__dirname,console,require(name){if(name==='../../packages/hkd-characters/lib/asset-transaction')return{commit(project,files,guards){published={project,files,guards};return{saved:false};}};return localRequire(name);}});
  assert.equal(module.exports.build(root).saved,false);assert.equal(published.project,root);
  assert.equal(published.files.get('assets/resources/projectiles/catalog.json'),before,'a BOM-prefixed no-change catalog remains byte-identical');
  assert.deepEqual(published.guards[0][1],Buffer.from(before));
  catalog.assets[0].name='Stale generated title';before='\uFEFF'+JSON.stringify(catalog,null,2)+'\n';module.exports.build(root);
  const changed=published.files.get('assets/resources/projectiles/catalog.json');assert(changed.startsWith('\uFEFF'),'changed generated metadata retains the leading BOM');
  const next=JSON.parse(changed.slice(1));assert.notEqual(next.assets[0].name,'Stale generated title');assert.deepEqual(next.futureAudit,{retained:true});assert.deepEqual(next.assignments.hero,catalog.assignments.hero);
});
function engineVerifier(t,prefabRecords,spawn){
  const directory=temporary(t),servers=[],source=fs.readFileSync(path.join(__dirname,'verify-engine.cjs'),'utf8');
  const fakeFs={mkdirSync(){},existsSync(){return false;},cpSync(){},copyFileSync(){},readdirSync(){return[];},openSync(){return 17;},closeSync(){},writeFileSync(){},readFileSync(file){return String(file).endsWith('.meta')?'\uFEFF{"uuid":"00000000-0000-0000-0000-000000000000"}':String(file).endsWith('catalog.json')?'\uFEFF{"assets":[],"assignments":{}}':'';}};
  const sandbox={module:{exports:{}},__dirname,console,process:{env:{HKD_INTERNAL_BUNDLE:'fixture',HKD_ARTIFACT_DIR:directory},argv:['node','verify','--native-only']},setTimeout,clearTimeout,require(name){if(name==='node:fs')return fakeFs;if(name==='node:http')return{createServer(callback){const server=http.createServer(callback);servers.push(server);return server;}};if(name==='node:child_process')return{spawn};if(name==='./engine-prefab-records.cjs')return{records:()=>prefabRecords};return require(name);}};
  vm.runInNewContext(source+'\nmodule.exports=main;',sandbox);
  t.after(async()=>{await Promise.all(servers.filter(server=>server.listening).map(server=>new Promise(resolve=>server.close(resolve))));});
  return{run:sandbox.module.exports,servers};
}
test('engine verifier validates required prefab inputs before opening its local server',async t=>{
  const verifier=engineVerifier(t,{missing:['missing-texture'],modules:{}},()=>{throw Error('must not launch');});
  await assert.rejects(verifier.run(),/Missing actual projectile prefab assets/);assert.equal(verifier.servers.length,0);
});
test('engine verifier handles a missing simulator executable and closes its local server',async t=>{
  const {EventEmitter}=require('node:events');let process;
  const verifier=engineVerifier(t,{missing:[],modules:{}},()=>{process=new EventEmitter();process.exitCode=null;process.kill=()=>{process.exitCode=1;};setTimeout(()=>process.emit('error',Error('Missing simulator fixture')),0);return process;});
  await assert.rejects(verifier.run(),/Missing simulator fixture/);assert(verifier.servers.every(server=>!server.listening));assert.equal(process.exitCode,1);
});
test('draft verification host decodes Unicode JSON across Buffer chunk boundaries and closes on startup failure',async t=>{
  const servers=[],directory=temporary(t),payload={label:'Ice \u{1f9ca} arrow'},raw=Buffer.from(JSON.stringify(payload)),source=fs.readFileSync(path.join(__dirname,'verify-editors.cjs'),'utf8');let received;
  const fakeHttp={createServer(handler){const server={handler,listening:false,once(){return this;},removeListener(){return this;},listen(port,host,callback){this.listening=true;callback();},address(){return{port:1234};},close(callback){this.listening=false;callback();}};servers.push(server);return server;}};
  class Store{change(request){received=request;return{ok:true};}}
  const playwright={chromium:{async launch(){let status=200,response;const request={url:'/api/change',async *[Symbol.asyncIterator](){for(const byte of raw)yield Buffer.from([byte]);}},result={setHeader(){},writeHead(value){status=value;return this;},end(value){response=value;}};await servers[0].handler(request,result);assert.equal(status,200,response);assert.equal(JSON.parse(response).ok,true);throw Error('Fixture startup ends after its draft request');}}};
  const module={exports:{}},localRequire=require('node:module').createRequire(path.join(__dirname,'verify-editors.cjs'));
  vm.runInNewContext(source+'\nmodule.exports=main;',{module,exports:module.exports,__dirname,console,Buffer,URL,process:{env:{HKD_ARTIFACT_DIR:directory,PLAYWRIGHT_MODULE:'fixture-playwright'},argv:[]},require(name){if(name==='node:http')return fakeHttp;if(name==='../../packages/game-data-editor/lib/store')return{Store,files:{}};if(name==='../../packages/game-data-editor/lib/assets')return{index:()=>({images:[]})};if(name==='./serve-editor.cjs')return{createServer:()=>fakeHttp.createServer(()=>{})};if(name==='fixture-playwright')return playwright;return localRequire(name);}});
  await assert.rejects(module.exports(),/Fixture startup ends/);assert.equal(received.label,payload.label);assert(servers.every(server=>!server.listening));
});
const python=process.env.PYTHON||(process.platform==='win32'?'python':'python3'),pythonAvailable=spawnSync(python,['-B','-c','import PIL,yaml'],{encoding:'utf8'}).status===0;
test('Toon import rejects unsafe and duplicate manifests, malformed grids and non-fresh bake destinations',{skip:!pythonAvailable},()=>{
  const code=String.raw`
import copy,io,json,runpy,tempfile
from pathlib import Path
from PIL import Image
root=Path.cwd()
importer=runpy.run_path(str(root/'tools/projectiles/import-toon.py'))
preparer=runpy.run_path(str(root/'tools/projectiles/prepare-toon.py'))
clips=[]
for role in ('Projectile','Flash','Hit'):
    for number in range(1,16):
        name=f'{role} {number}'+(' Fixture' if role=='Projectile' else '')
        clips.append(dict(name=name,file=name.replace(' ','-').lower()+'.png',frames=2,columns=2,cell=8,fps=24,loop=role=='Projectile'))
def reject(function):
    try:function()
    except (ValueError,OSError):return
    raise AssertionError('Invalid import was accepted')
with tempfile.TemporaryDirectory(prefix='hkd-toon-audit-') as directory:
    source=Path(directory)
    importer['validate_clips'](source,clips)
    bad=copy.deepcopy(clips);bad[-1]=copy.deepcopy(bad[0]);reject(lambda:importer['validate_clips'](source,bad))
    for file in ('../outside.png',r'..\outside.png','C:outside.png'):
        bad=copy.deepcopy(clips);bad[0]['file']=file;reject(lambda:importer['validate_clips'](source,bad))
    bad=copy.deepcopy(clips);bad[0]['fps']=0;reject(lambda:importer['validate_clips'](source,bad))
    reject(lambda:importer['normalize'](Image.new('RGBA',(8,8)),clips[0]))
    image=Image.new('RGBA',(16,8));image.putpixel((4,4),(100,50,25,128))
    result=Image.open(io.BytesIO(importer['normalize'](image,clips[0])));assert result.size==image.size
    bake=source/'existing';bake.mkdir();(bake/'important.txt').write_text('keep')
    reject(lambda:preparer['prepare'](source/'unused.unitypackage',bake));assert (bake/'important.txt').read_text()=='keep'
    for name in (r'Assets/..\outside.png','Assets/file:stream.png'):
        preparer['prepare'].__globals__['unpack']=lambda unused:{name:dict(asset=b'unsafe')}
        destination=source/'fresh'
        reject(lambda:preparer['prepare'](source/'unused.unitypackage',destination));assert not destination.exists()
print('validated')
`;
  const result=spawnSync(python,['-B','-c',code],{cwd:root,encoding:'utf8',env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'}});
  assert.equal(result.status,0,result.stderr);assert.equal(result.stdout.trim(),'validated');
});
