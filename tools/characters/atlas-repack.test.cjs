'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),cp=require('node:child_process'),crypto=require('node:crypto'),{test}=require('node:test');
const root=path.resolve(__dirname,'../..'),PNG=require('../../packages/hkd-characters/lib/png-atlas');
const python=process.env.PYTHON||(process.platform==='win32'?'python':'python3');
const available=cp.spawnSync(python,['-c','from PIL import Image'],{encoding:'utf8'}).status===0;
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex'),parse=file=>JSON.parse(fs.readFileSync(file,'utf8'));
function fixture(t){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hkd-lossless-atlas-')),project=path.join(dir,'project'),artifacts=path.join(dir,'artifacts'),base='assets/resources/unit-library/monster1';
 t.after(()=>{const resolved=path.resolve(dir);if(path.dirname(resolved)!==path.resolve(os.tmpdir())||!path.basename(resolved).startsWith('hkd-lossless-atlas-'))throw Error('Unexpected atlas fixture cleanup target');fs.rmSync(resolved,{recursive:true,force:true});});
 const write=(name,value)=>{const file=path.join(project,name);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,Buffer.isBuffer(value)||typeof value==='string'?value:JSON.stringify(value));return file;};
 const parts=[],images={},positions={a:[2,2],b:[12,2],bg:[22,2]},canvas={width:64,height:64,rgba:Buffer.alloc(64*64*4)};
 for(const [guid,width,height]of [['a',2,3],['b',3,2],['bg',4,4]]){
  const rgba=Buffer.from(Array.from({length:width*height*4},(_,i)=>i%4===3?[0,64,127,255][(i>>2)%4]:(i*31+17)%256));
  const png=PNG.encode({width,height,rgba}),image=base+'/Sprites/ResourcesData/Sprites/'+guid+'.png';write(image,png);write(image+'.meta',{uuid:'sprite-'+guid,importer:'texture',future:true});
  parts.push({id:'monster1/ResourcesData/Sprites/'+guid,guid,name:guid,image,resource:image.slice('assets/resources/'.length,-4),width,height,pixelsPerUnit:100,pivot:{x:.5,y:.5},sha256:hash(png),futurePart:true});
  images[guid]={png,width,height,rgba};const [x,y]=positions[guid];for(let dy=0;dy<height;dy++)rgba.copy(canvas.rgba,((y+dy)*64+x)*4,dy*width*4,(dy+1)*width*4);
 }
 const page=base+'/Atlases/monster1-0.png',sibling=base+'/Units/monster1-0.png',bytes=PNG.encode(canvas);
 for(const [name,uuid]of [[page,'source-page'],[sibling,'native-page']]){write(name,bytes);write(name+'.meta',{uuid,importer:'texture',type:'sprite',width:64,height:64,filterMode:'nearest',future:{keep:7},subMetas:{'monster1-0':{uuid:uuid+'-frame',importer:'sprite-frame',rawTextureUuid:uuid,width:64,height:64,rawWidth:64,rawHeight:64,trimX:0,trimY:0,trimType:'none',futureChild:8}}});}
 let atlas='\nmonster1-0.png\nsize: 64,64\nformat: RGBA8888\nfilter: Nearest,Nearest\nrepeat: none\npma: false\n';
 for(const [guid,info]of Object.entries(images)){const [x,y]=positions[guid];atlas+='u_'+guid+'\n  rotate: false\n  xy: '+x+', '+y+'\n  size: '+info.width+', '+info.height+'\n  orig: '+info.width+', '+info.height+'\n  offset: 0, 0\n  index: 7\n  future: retained\n';}
 const units=[],rigs={};for(const [name,guid]of [['Wolf','a'],['Variant','b']]){
  const skeleton=base+'/Units/'+name+'.json',rig={skeleton:{spine:'3.8.99'},bones:[{name:'root'}],slots:[{name:'body',bone:'root'}],skins:[{name:'default',attachments:{body:{['u_'+guid]:{path:'u_'+guid,width:images[guid].width,height:images[guid].height}}}}],events:{attack:{}},animations:{attack:{events:[{time:.37,name:'attack'}]}},futureRig:{keep:true}};
  write(skeleton,rig);write(skeleton+'.meta',{uuid:'unit-'+name,importer:'spine',textures:['native-page'],scale:.75,futureMeta:9});write(skeleton.slice(0,-5)+'.atlas',atlas);write(skeleton.slice(0,-5)+'.atlas.meta',{uuid:'atlas-'+name,futureAtlas:true});rigs[name]=rig;
  if(name==='Wolf')units.push({id:'monster1/Wolf',skeleton,uuid:'unit-Wolf',resource:skeleton.slice('assets/resources/'.length,-5),futureUnit:true});
 }
 const managed={};for(const file of [page,sibling,...parts.map(part=>part.image),...['Wolf','Variant'].flatMap(name=>[base+'/Units/'+name+'.json',base+'/Units/'+name+'.atlas'])])managed[file]=hash(fs.readFileSync(path.join(project,file)));
 write(base+'/catalog.json',{version:1,source:{package:'original',futureSource:1},units,parts,conversion:{futureConversion:true},importedFiles:managed,futureCatalog:11});
 return{dir,project,artifacts,base,write,parts,rigs,atlas,page,sibling,images};
}
function run(f,code='print(json.dumps(m.repack_atlases(project,artifacts,["monster1"])))'){
 const setup='import sys,json,io,types,importlib.util\nfrom pathlib import Path\nfrom PIL import Image\nspec=importlib.util.spec_from_file_location("hkd_import_units",'+JSON.stringify(path.join(root,'tools/characters/import_units.py'))+')\nm=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)\nproject=Path('+JSON.stringify(f.project)+');artifacts=Path('+JSON.stringify(f.artifacts)+')\n';
 return cp.spawnSync(python,['-c',setup+code],{encoding:'utf8',maxBuffer:1024*1024,env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'}});
}
function tree(dir){const rows={};function walk(folder){for(const item of fs.readdirSync(folder,{withFileTypes:true})){const file=path.join(folder,item.name);if(item.isDirectory())walk(file);else rows[path.relative(dir,file)]=hash(fs.readFileSync(file));}}walk(dir);return rows;}

test('repack preserves all variant rigs, UUIDs, metadata and exact pixels, omits only unreferenced runtime art, and repeats without writes',{skip:!available},t=>{
 const f=fixture(t),before=tree(f.project),catalogBefore=parse(path.join(f.project,f.base+'/catalog.json'));
 let result=run(f,'print(json.dumps(m.repack_atlases(project,artifacts,["monster1"],True)))');assert.equal(result.status,0,result.stderr);assert.deepEqual(tree(f.project),before);assert(!fs.existsSync(f.artifacts));
 result=run(f);assert.equal(result.status,0,result.stderr);const report=JSON.parse(result.stdout);assert.equal(report.units,2);assert.equal(report.retainedRegions,2);assert.equal(report.omittedRegions,1);assert(report.backup.startsWith(f.artifacts));
 const after=tree(f.project);for(const file of Object.keys(before))if(/(?:Sprites[\\/]|\.json$|\.atlas\.meta$)/.test(file)&&!file.endsWith('catalog.json'))assert.equal(after[file],before[file],file+' is untouched');
 const catalog=parse(path.join(f.project,f.base+'/catalog.json'));assert.deepEqual(catalog.parts,catalogBefore.parts);assert.deepEqual(catalog.units,catalogBefore.units);assert.deepEqual(catalog.source,catalogBefore.source);assert.equal(catalog.futureCatalog,11);assert(catalog.conversion.futureConversion);
 for(const name of ['Wolf','Variant']){const file=path.join(f.project,f.base,'Units',name),text=fs.readFileSync(file+'.atlas','utf8');assert(text.includes('u_a\n'));assert(text.includes('u_b\n'));assert(!text.includes('u_bg\n'));assert(text.includes('filter: Nearest,Nearest\n'));assert(text.includes('pma: false\n'));assert(text.includes('  future: retained\n'));const meta=parse(file+'.json.meta');assert.equal(meta.uuid,'unit-'+name);assert.equal(meta.scale,.75);assert.equal(meta.futureMeta,9);assert.deepEqual(meta.textures,['native-page']);}
 for(const [relative,uuid]of [[f.page,'source-page'],[f.sibling,'native-page']]){const meta=parse(path.join(f.project,relative+'.meta'));assert.equal(meta.uuid,uuid);assert.equal(meta.future.keep,7);assert.equal(meta.subMetas['monster1-0'].futureChild,8);assert.equal(meta.subMetas['monster1-0'].uuid,uuid+'-frame');assert.equal(meta.filterMode,'nearest');assert(meta.width<=2048&&meta.height<=2048);}
 const stamp=fs.statSync(path.join(f.project,f.base+'/catalog.json')).mtimeMs,count=fs.readdirSync(f.artifacts).length;
 result=run(f);assert.equal(result.status,0,result.stderr);assert.equal(JSON.parse(result.stdout).files,0);assert.equal(JSON.parse(result.stdout).backup,null);assert.equal(fs.readdirSync(f.artifacts).length,count);assert.equal(fs.statSync(path.join(f.project,f.base+'/catalog.json')).mtimeMs,stamp);assert.deepEqual(tree(f.project),after);
});

test('repack rejects edited source artwork and modified native pages before publication',{skip:!available},t=>{
 for(const kind of ['sprite','sibling']){const f=fixture(t),file=path.join(f.project,kind==='sprite'?f.parts[0].image:f.sibling);fs.appendFileSync(file,'external edit');const before=tree(f.project),result=run(f);assert.notEqual(result.status,0,kind);assert.match(result.stderr,/changed|edited/);assert.deepEqual(tree(f.project),before);assert(!fs.existsSync(f.artifacts));}
});

test('concurrent variant edits after planning are retained and prevent every atlas publication',{skip:!available},t=>{
 const f=fixture(t),before=tree(f.project),variant=f.base+'/Units/Variant.json';
 const result=run(f,'tx=m.Transaction(project,artifacts);m.plan_repack_atlases(tx,["monster1"]);(project/'+JSON.stringify(variant)+').write_bytes(b"concurrent variant")\ntry: tx.commit();raise AssertionError("stale publication accepted")\nexcept ValueError as error: print(str(error))');
 assert.equal(result.status,0,result.stderr);assert.match(result.stdout,/Concurrent change/);assert.equal(fs.readFileSync(path.join(f.project,variant),'utf8'),'concurrent variant');const after=tree(f.project);for(const file of Object.keys(before))if(file!==variant.replace(/\//g,path.sep))assert.equal(after[file],before[file],file);
});

test('new variants appearing after planning are retained and reject the stale region union',{skip:!available},t=>{
 const f=fixture(t),before=tree(f.project),added=f.base+'/Units/NewVariant.json';
 const result=run(f,'tx=m.Transaction(project,artifacts);m.plan_repack_atlases(tx,["monster1"]);(project/'+JSON.stringify(added)+').write_bytes(b"new external variant")\ntry: tx.commit();raise AssertionError("new variant was missed")\nexcept ValueError as error: print(str(error))');
 assert.equal(result.status,0,result.stderr);assert.match(result.stdout,/Concurrent change in directory/);assert.equal(fs.readFileSync(path.join(f.project,added),'utf8'),'new external variant');const after=tree(f.project);for(const file of Object.keys(before))assert.equal(after[file],before[file],file);
});

test('variants added during publication survive while owned atlas changes roll back',{skip:!available},t=>{
 const f=fixture(t),before=tree(f.project),added=f.base+'/Units/NewVariant.json';
 const result=run(f,'tx=m.Transaction(project,artifacts);m.plan_repack_atlases(tx,["monster1"]);publish=tx._publish;added=False\ndef collide(source,target,before,copy_only=False):\n global added\n publish(source,target,before,copy_only)\n if not added:\n  added=True;(project/'+JSON.stringify(added)+').write_bytes(b"new external variant")\ntx._publish=collide\ntry: tx.commit();raise AssertionError("new variant was missed")\nexcept ValueError as error: print(str(error))');
 assert.equal(result.status,0,result.stderr);assert.match(result.stdout,/Concurrent change in directory/);assert.equal(fs.readFileSync(path.join(f.project,added),'utf8'),'new external variant');const after=tree(f.project);for(const file of Object.keys(before))assert.equal(after[file],before[file],file);
});

test('all skin formats preserve attachment name overrides and mesh regions while ignoring non-image attachments',{skip:!available},t=>{
 const f=fixture(t),result=run(f,'slots={"body":{"alias":{"name":"u_a"},"mesh":{"type":"weightedmesh","path":"u_b"},"clip":{"type":"clipping"},"box":{"type":"boundingbox"}}}\nassert m.attachment_regions({"skins":{"default":slots}})=={"u_a","u_b"}\nassert m.attachment_regions({"skins":[{"name":"default","attachments":slots}]})=={"u_a","u_b"}\nprint("skin-reference-pass")');
 assert.equal(result.status,0,result.stderr);assert.match(result.stdout,/skin-reference-pass/);
});

test('future package imports keep outside-catalog variants and exclude unused art without deleting source sprites',{skip:!available},t=>{
 const f=fixture(t),variant=fs.readFileSync(path.join(f.project,f.base+'/Units/Variant.json'));const packageFile=path.join(f.dir,'fixture.unitypackage');fs.writeFileSync(packageFile,'fixture');
 const code='u=types.ModuleType("unity_monsters");sys.modules["unity_monsters"]=u\nentries={}\n'+
  'for guid in ["a","b","bg"]:\n name="Assets/X/EnemyMonster 1/ResourcesData/Sprites/"+guid+".png";entries[name]={"guid":guid,"asset":(project/'+JSON.stringify(f.base+'/Sprites/ResourcesData/Sprites/')+'/(guid+".png")).read_bytes()}\n'+
  'entries["Assets/X/EnemyMonster 1/Prefabs/Wolf.prefab"]={"name":"Assets/X/EnemyMonster 1/Prefabs/Wolf.prefab"}\nu.unpack=lambda file:entries\n'+
  'def info(item):\n image=Image.open(io.BytesIO(item["asset"])).convert("RGBA");return {"width":image.width,"height":image.height,"image":image,"pivot":{"x":.5,"y":.5},"ppu":100,"region":"u_"+item["guid"]}\n'+
  'u.image_info=info;u.convert_prefab=lambda *args,**kwargs:json.loads('+JSON.stringify(JSON.stringify(f.rigs.Wolf))+')\n'+
  'print(json.dumps(m.import_pack(project,Path('+JSON.stringify(packageFile)+'),"monster1",artifacts)))';
 const result=run(f,code);assert.equal(result.status,0,result.stderr);assert.deepEqual(fs.readFileSync(path.join(f.project,f.base+'/Units/Variant.json')),variant);
 const catalog=parse(path.join(f.project,f.base+'/catalog.json'));assert.equal(catalog.source.package,'fixture.unitypackage');assert.equal(catalog.source.sha256,hash(fs.readFileSync(packageFile)),'Retained variants cannot replace the original Unity package identity');assert.equal(catalog.source.futureSource,1);assert.equal(catalog.futureCatalog,11);assert(catalog.conversion.futureConversion);
 const atlas=fs.readFileSync(path.join(f.project,f.base+'/Units/Variant.atlas'),'utf8');assert(atlas.includes('u_b\n'));assert(!atlas.includes('u_bg\n'));for(const part of f.parts)assert.equal(hash(fs.readFileSync(path.join(f.project,part.image))),part.sha256);assert.equal(parse(path.join(f.project,f.base+'/Units/Variant.json.meta')).uuid,'unit-Variant');
});

test('Python packer enforces its 2048 default, splits pages losslessly and copies transparent edge RGB exactly',{skip:!available},t=>{
 const f=fixture(t),result=run(f,'import inspect\nassert inspect.signature(m.atlas_pages).parameters["maximum"].default==2048\nsprite=Image.new("RGBA",(20,20),(239,127,41,0));images={k:{"width":20,"height":20,"image":sprite} for k in ["a","b"]}\npages,positions=m.atlas_pages(images,32);assert len(pages)==2\nfor png,width,height in pages:\n image=Image.open(io.BytesIO(png));assert width<=32 and height<=32;assert image.getpixel((0,2))==(239,127,41,0);assert image.getpixel((2,0))==(239,127,41,0)\ntry: m.atlas_pages(images,4096);raise AssertionError("oversize cap accepted")\nexcept ValueError: pass\ntry: m.atlas_pages({"huge":{"width":2045,"height":1,"image":sprite}});raise AssertionError("oversize sprite accepted")\nexcept ValueError: pass\nprint("pixel-and-cap-pass")');
 assert.equal(result.status,0,result.stderr);assert.match(result.stdout,/pixel-and-cap-pass/);
});
