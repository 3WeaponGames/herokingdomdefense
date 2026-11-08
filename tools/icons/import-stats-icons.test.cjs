'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const assert=require('node:assert/strict'),{test}=require('node:test');
const temporary=require('../../packages/game-data-editor/test/owned-temp');
const Importer=require('./import-stats-icons.cjs'),Bake=require('../../packages/hkd-characters/lib/native-bake');
const PNG=require('../../packages/hkd-characters/lib/png-atlas');
const Tx=require('../../packages/hkd-characters/lib/asset-transaction');
function image(width=128,height=128,opaque=false){
  const rgba=Buffer.alloc(width*height*4);for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(opaque||x>16&&x<width-16&&y>16&&y<height-16){const at=(y*width+x)*4;rgba[at]=220;rgba[at+1]=60;rgba[at+2]=80;rgba[at+3]=255;}
  return PNG.encode({width,height,rgba});
}
function fixture(){
  const directory=temporary('hkd-stat-icons-'),root=path.join(directory,'project'),source=path.join(directory,'prepared');
  fs.mkdirSync(root);fs.mkdirSync(source);
  const catalog=Array.from({length:80},(_,i)=>({number:i+1,id:'icon-'+(i+1),meaning:'Meaning '+(i+1),subject:'Cartoon subject '+(i+1)}));
  const bytes=image();for(const icon of catalog)fs.writeFileSync(path.join(source,icon.id+'.png'),bytes);
  const write=(relative,bytes)=>{const file=path.join(root,relative);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,bytes);};
  return{directory,root,source,catalog,bytes,write};
}
test('planning imports exactly 80 individual transparent RGBA sprites with deterministic UUIDs and resource references without writes',()=>{
  const f=fixture(),plan=Importer.plan(f.root,f.source,f.catalog);
  assert.equal(plan.count,80);assert.equal(plan.files.size,162);assert.equal(plan.registry.resolution,128);
  assert.deepEqual(fs.readdirSync(f.root),[],'previewing a plan does not create production files');
  const uuids=new Set();
  for(const icon of plan.registry.icons){
    assert.equal(icon.reference,'@icon/Stats Icons/'+icon.id);assert.equal(icon.meaning,'Meaning '+icon.number);
    assert(plan.files.get(icon.image).equals(f.bytes));const meta=JSON.parse(plan.files.get(icon.image+'.meta'));
    const frame=Object.values(meta.subMetas)[0];assert.equal(frame.rawTextureUuid,meta.uuid);assert.equal(frame.trimType,'none');
    for(const id of [meta.uuid,frame.uuid]){assert(!uuids.has(id));uuids.add(id);}
    assert(plan.reads.get(path.join(f.source,icon.id+'.png')).equals(f.bytes));
  }
  const again=Importer.plan(f.root,f.source,f.catalog);assert.equal(again.files.get(Importer.manifest),plan.files.get(Importer.manifest));
});
test('existing metadata UUIDs, folder settings and catalog mappings are preserved byte-for-byte',()=>{
  const f=fixture(),relative=Importer.target+'/icon-1.png';
  f.write(relative,f.bytes);
  const meta=Bake.textureMeta(relative,128,128);meta.uuid='existing-texture';meta.subMetas['icon-1'].uuid='existing-frame';meta.subMetas['icon-1'].rawTextureUuid=meta.uuid;meta.platformSettings={custom:{preserved:true}};
  const bytes=JSON.stringify(meta,null,4)+'\r\n';f.write(relative+'.meta',bytes);
  const folder=JSON.stringify({importer:'folder',isBundle:false,uuid:'existing-folder',unknown:'keep'});f.write(Importer.target+'.meta',folder);
  f.write(Importer.manifest,JSON.stringify({version:1,replacements:{talents:{100001:'icon-1'}},icons:[{id:'icon-1',unknown:{preserved:true}}]}));
  const plan=Importer.plan(f.root,f.source,f.catalog);
  assert.equal(plan.files.get(relative+'.meta').toString(),bytes);assert.equal(plan.files.get(Importer.target+'.meta').toString(),folder);
  assert.deepEqual(plan.registry.replacements,{talents:{100001:'icon-1'}});assert.deepEqual(plan.registry.icons[0].unknown,{preserved:true});
  f.write(relative,image(128,128,true));assert.throws(()=>Importer.plan(f.root,f.source,f.catalog),/changed locally/);
});
test('incomplete, unsafe, duplicate, wrong-size and opaque icon packs fail without production writes',()=>{
  const f=fixture();
  assert.throws(()=>Importer.plan(f.root,f.source,f.catalog.slice(1)),/exactly 80/);
  const duplicate=f.catalog.map(record=>({...record}));duplicate[1].id=duplicate[0].id;assert.throws(()=>Importer.plan(f.root,f.source,duplicate),/unique/);
  const unsafe=f.catalog.map(record=>({...record}));unsafe[0].id='../outside';assert.throws(()=>Importer.plan(f.root,f.source,unsafe),/safe/);
  const numbers=f.catalog.map(record=>({...record}));numbers[1].number=1;assert.throws(()=>Importer.plan(f.root,f.source,numbers),/numbers/);
  fs.writeFileSync(path.join(f.source,'icon-1.png'),image(64,64));assert.throws(()=>Importer.plan(f.root,f.source,f.catalog),/128/);
  fs.writeFileSync(path.join(f.source,'icon-1.png'),image(128,128,true));assert.throws(()=>Importer.plan(f.root,f.source,f.catalog),/transparent/);
  fs.writeFileSync(path.join(f.source,'icon-1.png'),f.bytes);fs.writeFileSync(path.join(f.source,'unexpected.png'),f.bytes);
  assert.throws(()=>Importer.plan(f.root,f.source,f.catalog),/exactly/);assert.deepEqual(fs.readdirSync(f.root),[]);
});
test('import commits through external backups, detects stale plans and repeats with zero writes',()=>{
  const f=fixture(),oldHome=os.homedir;os.homedir=()=>f.directory;
  try{
    const first=Importer.importPack(f.root,f.source,f.catalog);assert.equal(first.files.length,162);assert(first.transaction.startsWith(f.directory+path.sep));
    assert(!first.transaction.startsWith(f.root+path.sep));assert(fs.existsSync(path.join(first.transaction,'transaction.json')));
    const target=path.join(f.root,Importer.target,'icon-1.png'),meta=target+'.meta',before=fs.readFileSync(meta);
    const again=Importer.importPack(f.root,f.source,f.catalog);assert.deepEqual(again.files,[]);assert.equal(again.backup,null);assert(fs.readFileSync(meta).equals(before));
    const plan=Importer.plan(f.root,f.source,f.catalog);plan.files.set(Importer.manifest,plan.files.get(Importer.manifest)+' ');
    fs.appendFileSync(target,Buffer.from('concurrent edit'));
    assert.throws(()=>Tx.commit(f.root,plan.files,plan.reads,Importer.manifest),/Another editor changed/);
    assert(fs.readFileSync(target).subarray(-15).equals(Buffer.from('concurrent edit')),'concurrent artwork is not reverted');
  }finally{os.homedir=oldHome;}
});
