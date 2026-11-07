'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),vm=require('node:vm'),zlib=require('node:zlib'),{createRequire}=require('node:module'),assert=require('node:assert/strict'),{test}=require('node:test');
const root=path.resolve(__dirname,'../..'),source=path.join(__dirname,'import-parts.cjs'),parts=require('../../assets/resources/character-parts/catalog.json').parts;
const first=fs.readFileSync(path.join(root,parts[0].image)),second=fs.readFileSync(path.join(root,parts.find(p=>p.width!==parts[0].width||p.height!==parts[0].height).image));
function fixture(t,wrapped){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hkd-import2-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const requireLocal=createRequire(source),c={module:{exports:{}},exports:{},Buffer,process,__dirname,require:id=>id==='node:fs'&&wrapped?wrapped:requireLocal(id)};vm.runInNewContext(fs.readFileSync(source,'utf8'),c);return{dir,api:c.module.exports};}
function archive(dir,rows){const chunks=[];rows.forEach(([name,bytes],index)=>{for(const [suffix,data]of [['pathname',Buffer.from('Assets/Parts Pack Vol.1/'+name)],['asset',bytes]]){const header=Buffer.alloc(512);header.write(index+'/'+suffix);header.write(data.length.toString(8).padStart(11,'0')+'\0',124);chunks.push(header,data,Buffer.alloc((512-data.length%512)%512));}});const file=path.join(dir,'parts.unitypackage');fs.writeFileSync(file,zlib.gzipSync(Buffer.concat([...chunks,Buffer.alloc(1024)])));return file;}
const part='Parts/Test/Part.png',asset=dir=>path.join(dir,'assets/resources/character-parts/'+part),catalog=dir=>path.join(dir,'assets/resources/character-parts/catalog.json');
function tree(dir){if(!fs.existsSync(dir))return{};const out={};for(const item of fs.readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,item.name);if(item.isDirectory())for(const [name,value]of Object.entries(tree(file)))out[item.name+'/'+name]=value;else out[item.name]=fs.readFileSync(file).toString('base64');}return out;}

test('reimport updates dimensions while preserving UUIDs, unknown metadata/catalog fields and no-op bytes',t=>{
  const f=fixture(t),file=archive(f.dir,[[part,first]]);f.api.importParts(f.dir,file);
  const metaFile=asset(f.dir)+'.meta',meta=JSON.parse(fs.readFileSync(metaFile)),frame=meta.subMetas.Part;meta.future={value:7};frame.future='keep';frame.uuid='authored-sprite';meta.uuid='authored-texture';frame.rawTextureUuid=meta.uuid;fs.writeFileSync(metaFile,JSON.stringify(meta,null,2)+'\r\n');
  const old=JSON.parse(fs.readFileSync(catalog(f.dir)));old.future={keep:true};old.parts[0].customTag='kept';old.parts.push({id:'Other/Legacy',custom:true});fs.writeFileSync(catalog(f.dir),JSON.stringify(old,null,2));
  archive(f.dir,[[part,second]]);const imported=f.api.importParts(f.dir,file),updated=JSON.parse(fs.readFileSync(metaFile));assert.equal(updated.uuid,'authored-texture');assert.equal(updated.subMetas.Part.uuid,'authored-sprite');assert.equal(updated.subMetas.Part.rawTextureUuid,'authored-texture');assert.equal(updated.width,second.readUInt32BE(16));assert.equal(updated.height,second.readUInt32BE(20));assert.equal(updated.subMetas.Part.rawWidth,updated.width);assert.equal(updated.subMetas.Part.width,updated.width);assert.equal(updated.future.value,7);assert.equal(updated.subMetas.Part.future,'keep');
  const saved=JSON.parse(fs.readFileSync(catalog(f.dir)));assert(saved.future.keep);assert.equal(saved.parts.find(p=>p.id==='Test/Part').customTag,'kept');assert(saved.parts.some(p=>p.id==='Other/Legacy'));
  assert.equal(JSON.parse(fs.readFileSync(path.join(imported.backup,'transaction.json'))).status,'complete');
  const before=tree(f.dir),again=f.api.importParts(f.dir,file);assert.equal(again.noChanges,true);assert.deepEqual(tree(f.dir),before);
});

test('an invalid later PNG, unsafe path or case collision performs zero import writes',t=>{
  const f=fixture(t);f.api.importParts(f.dir,archive(f.dir,[[part,first]]));
  const assets=tree(path.join(f.dir,'assets')),backups=tree(path.join(f.dir,'local'));
  for(const rows of [[[part,second],['Parts/Test/Bad.png',Buffer.alloc(30)]],[['Parts/../Escape.png',first]],[[part,first],['Parts/Test/PART.PNG',second]]]){
    const file=archive(f.dir,rows);assert.throws(()=>f.api.importParts(f.dir,file),/Invalid PNG|Unsafe|Duplicate/);assert.deepEqual(tree(path.join(f.dir,'assets')),assets);assert.deepEqual(tree(path.join(f.dir,'local')),backups);
  }
});

test('import revision conflict preserves the intervening asset and marks the journal rolled back',t=>{
  let dir,race=false;const wrapped=Object.assign({},fs,{writeFileSync(file,...args){fs.writeFileSync(file,...args);if(race&&String(file).includes(path.join('staged','assets'))){race=false;fs.writeFileSync(asset(dir),Buffer.from('external replacement'));}}});
  const f=fixture(t,wrapped);dir=f.dir;f.api.importParts(dir,archive(dir,[[part,first]]));const beforeMeta=fs.readFileSync(asset(dir)+'.meta');race=true;
  assert.throws(()=>f.api.importParts(dir,archive(dir,[[part,second]])),/changed during import/);assert.equal(fs.readFileSync(asset(dir),'utf8'),'external replacement');assert.deepEqual(fs.readFileSync(asset(dir)+'.meta'),beforeMeta);
  const states=fs.readdirSync(path.join(dir,'local/character-parts-import/backups')).map(name=>JSON.parse(fs.readFileSync(path.join(dir,'local/character-parts-import/backups',name,'transaction.json'))).status);assert(states.includes('rolled-back'));
});

test('failed multi-file commit restores earlier changed bytes from verified originals',t=>{
  let fail=false;const wrapped=Object.assign({},fs,{renameSync(from,to){if(fail&&String(to).endsWith('Part.png.meta')){fail=false;throw Error('simulated rename failure');}return fs.renameSync(from,to);}}),f=fixture(t,wrapped);
  f.api.importParts(f.dir,archive(f.dir,[[part,first]]));const before=tree(path.join(f.dir,'assets'));fail=true;
  assert.throws(()=>f.api.importParts(f.dir,archive(f.dir,[[part,second]])),/simulated rename failure/);assert.deepEqual(tree(path.join(f.dir,'assets')),before);
});

test('an existing symbolic-link destination is rejected before writing import content',t=>{
  let blocked;const wrapped=Object.assign({},fs,{lstatSync(file){if(file===blocked)return{isSymbolicLink:()=>true};return fs.lstatSync(file);}}),f=fixture(t,wrapped);fs.mkdirSync(path.join(f.dir,'assets'),{recursive:true});blocked=path.join(f.dir,'assets');const before=tree(f.dir);
  const file=archive(f.dir,[[part,first]]);assert.throws(()=>f.api.importParts(f.dir,file),/symbolic link/);assert.deepEqual(tree(path.join(f.dir,'assets')),{});assert.equal(fs.existsSync(path.join(f.dir,'local')),false);
});
