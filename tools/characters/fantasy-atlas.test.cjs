'use strict';
const assert=require('node:assert/strict'),path=require('node:path'),cp=require('node:child_process'),{test}=require('node:test');
const root=path.resolve(__dirname,'../..'),python=process.env.PYTHON||(process.platform==='win32'?'python':'python3');
const setup=String.raw`
import sys,io,json,struct,hashlib,tempfile
from pathlib import Path
from PIL import Image,PngImagePlugin
sys.path.insert(0,'tools/characters')
import import_fantasy as m
import fantasy_atlas as a
def sha(raw):return hashlib.sha256(raw).hexdigest()
def png(image,profile=False):
 output=io.BytesIO();info=PngImagePlugin.PngInfo()
 if profile:
  info.add(b'gAMA',struct.pack('>I',45455));info.add(b'cHRM',struct.pack('>8I',31270,32900,64000,33000,30000,60000,15000,6000))
 image.save(output,format='PNG',pnginfo=info,**({'icc_profile':b'original-fixture-profile-payload'} if profile else {}));return output.getvalue()
def tree(folder):return {file.relative_to(folder).as_posix():sha(file.read_bytes()) for file in sorted(folder.rglob('*')) if file.is_file()}
def fixture(base):
 project=base/'project';artifacts=base/'artifacts';target='assets/resources/unit-library/fantasy-monsters'
 def write(relative,data):
  file=project/relative;file.parent.mkdir(parents=True,exist_ok=True);file.write_bytes(data if isinstance(data,bytes) else json.dumps(data,indent=2).encode());return file
 image=Image.frombytes('RGBA',(2100,64),bytes((x*7+y*11+c*31)%256 for y in range(64) for x in range(2100) for c in range(4)));original=png(image,True)
 canonical=target+'/Atlases/sheet_sheet.png';native=target+'/Units/sheet_sheet.png'
 for relative,ident in [(canonical,'original-page'),(native,'native-page')]:
  write(relative,original);write(relative+'.meta',{'uuid':ident,'importer':'texture','width':2100,'height':64,'filterMode':'nearest','premultiplyAlpha':False,'genMipmaps':False,'future':{'keep':7},'subMetas':{'sheet_sheet':{'uuid':ident+'-frame','importer':'sprite-frame','rawTextureUuid':ident,'width':2100,'height':64,'rawWidth':2100,'rawHeight':64,'trimX':0,'trimY':0,'trimType':'none','future':8}}})
 parts=[];atlas='\nsheet_sheet.png\nsize: 2100,64\nformat: RGBA8888\nfilter: Linear,Linear\nrepeat: none\npma: false\nfuturePage: retained\n'
 for name,x,width in [('a',5,32),('b',80,16)]:
  cut=image.crop((x,7,x+width,31));raw=png(cut);relative=target+'/Parts/sheet/'+name+'.png';write(relative,raw);write(relative+'.meta',{'uuid':'part-'+name,'importer':'texture','futurePart':True})
  parts.append({'id':'fantasy-monsters/'+name,'guid':name,'name':name,'image':relative,'resource':relative[len('assets/resources/'):-4],'sheet':'sheet','width':width,'height':24,'rect':{'x':x,'y':33,'width':width,'height':24},'pivot':{'x':.3,'y':.7},'pixelsPerUnit':100,'sha256':sha(raw),'futurePart':9})
  atlas+='u_'+name+'\n  rotate: false\n  xy: '+str(x)+', 7\n  size: '+str(width)+', 24\n  orig: '+str(width)+', 24\n  offset: 0, 0\n  index: 7\n  futureRegion: retained\n'
 units=[]
 for name in ['Unit','Variant']:
  relative=target+'/Units/'+name+'.json';rig={'skeleton':{'spine':'3.8.99','width':32,'height':24},'bones':[{'name':'root'}],'slots':[{'name':'body','bone':'root','attachment':'normal'}],'skins':[{'name':'default','attachments':{'body':{'normal':{'path':'u_a','width':32,'height':24},'angry':{'path':'u_b','width':16,'height':24}}}},{'name':'outfit','attachments':{'body':{'normal':{'path':'u_b','width':16,'height':24}}}}],'events':{'attack':{}},'animations':{'attack':{'events':[{'time':.2,'name':'attack'}],'slots':{'body':{'attachment':[{'time':0,'name':'normal'},{'time':.2,'name':'angry'}]}}}},'_fantasy':{'expressions':[{'slot':'body','states':['normal','angry']}],'effects':{'style':'fire','future':True}},'futureRig':True}
  write(relative,rig);write(relative+'.meta',{'uuid':'unit-'+name,'importer':'spine','textures':['native-page'],'scale':.5,'futureMeta':11});write(relative[:-5]+'.atlas',atlas.encode());write(relative[:-5]+'.atlas.meta',{'uuid':'atlas-'+name,'futureAtlas':True})
  if name=='Unit':units.append({'id':'fantasy-monsters/Unit','skeleton':relative,'uuid':'unit-'+name,'futureUnit':True})
 managed={file.relative_to(project).as_posix():sha(file.read_bytes()) for file in (project/target).rglob('*') if file.is_file() and not file.name.endswith('.meta')}
 write(target+'/catalog.json',{'version':1,'units':units,'parts':parts,'source':{'package':'original','sha256':'original-source','futureSource':True},'conversion':{'futureConversion':True},'importedFiles':managed,'futureCatalog':True})
 return project,artifacts,target,original,parts
`;
function run(code,fixture=false){
  const body=fixture?'with tempfile.TemporaryDirectory(prefix="hkd-fantasy-atlas-") as temp:\n base=Path(temp).resolve();assert base.is_relative_to(Path(tempfile.gettempdir()).resolve())\n'+code.split('\n').map(line=>' '+line).join('\n'):code;
  const result=cp.spawnSync(python,['-B','-c',setup+'\n'+body],{cwd:root,encoding:'utf8',maxBuffer:1024*1024,env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'}});
  assert.equal(result.status,0,result.stderr);return result.stdout;
}

test('compact Fantasy pages preserve full RGBA, all extrusion corners and exact ICC/gamma/chromaticity payloads',()=>{
  run(String.raw`
image=Image.frombytes('RGBA',(64,64),bytes((x*7+y*11+c*31)%256 for y in range(64) for x in range(64) for c in range(4)));original=png(image,True)
images={name:{'width':w,'height':h,'image':image.crop((x,y,x+w,y+h)),'rect':{'x':x,'y':64-y-h}} for name,x,y,w,h in [('a',3,7,8,6),('b',22,17,7,9)]}
pages,positions,layout=a.packed_pages(images,original);assert layout=='repacked';assert len(pages)==1
assert a.color_chunks(pages[0][0])==a.color_chunks(original);assert any(kind==b'iCCP' for kind,data in a.color_chunks(original))
assert Image.open(io.BytesIO(pages[0][0])).info['icc_profile']==Image.open(io.BytesIO(original)).info['icc_profile']
assert a.compact_layout(images)==a.compact_layout(dict(reversed(list(images.items()))))
for name,(index,x,y) in positions.items():
 page=Image.open(io.BytesIO(pages[index][0]));source=images[name]['image'];w,h=source.size;assert page.crop((x,y,x+w,y+h)).tobytes()==source.tobytes()
 for dx in [-2,-1,0,w-1,w,w+1]:
  for dy in [-2,-1,0,h-1,h,h+1]:assert page.getpixel((x+dx,y+dy))==source.getpixel((max(0,min(w-1,dx)),max(0,min(h-1,dy))))
print('pixels-and-color-profile-pass')`);
});

test('legal tightly touching source cells remain byte exact and indivisible oversized sprites are never resampled',()=>{
  run(String.raw`
image=Image.new('RGBA',(16,8),(4,77,19,1));original=png(image,True);images={str(x):{'width':8,'height':8,'image':image.crop((x,0,x+8,8)),'rect':{'x':x,'y':0}} for x in [0,8]}
pages,positions,layout=a.packed_pages(images,original);assert layout=='retained';assert pages==[(original,16,8)]
try:a.compact_layout({'large':{'width':2045,'height':1}});raise AssertionError('Oversized region was resampled')
except ValueError:pass
print('retained-source-pass')`);
});

test('Fantasy repacking archives original sheets, preserves variant rigs/metadata, and repeats without writes',()=>{
  run(String.raw`
project,artifacts,target,original,parts=fixture(base);before=tree(project);catalog_before=json.loads((project/target/'catalog.json').read_text())
report=m.repack_atlases(project,artifacts,['fantasy-monsters'],True);assert report['backup'] is None;assert tree(project)==before;assert not artifacts.exists()
report=m.repack_atlases(project,artifacts,['fantasy-monsters']);assert report['units']==2;assert report['repacked']==1
catalog=json.loads((project/target/'catalog.json').read_text());assert catalog['parts']==catalog_before['parts'];assert catalog['units']==catalog_before['units'];assert catalog['source']==catalog_before['source'];assert catalog['conversion']['futureConversion'];assert catalog['futureCatalog']
record=catalog['sourceSheets'][0];assert record['layout']=='repacked';assert (project/record['image']).read_bytes()==original;assert record['originalUuid']=='original-page';assert record['originalNativeUuid']=='native-page'
runtime=(project/target/'Units/sheet_sheet.png').read_bytes();assert a.color_chunks(runtime)==a.color_chunks(original)
assert runtime==(project/target/'Atlases/sheet_sheet.png').read_bytes();assert max(Image.open(io.BytesIO(runtime)).size)<=2048
for relative,hash in before.items():
 if '/Parts/' in relative or relative.endswith('.json') and not relative.endswith('catalog.json') or relative.endswith('.atlas.meta') or relative.endswith('.json.meta'):assert tree(project)[relative]==hash,relative
for name in ['Unit','Variant']:
 atlas=(project/target/'Units'/(name+'.atlas')).read_text();assert 'futurePage: retained' in atlas and 'futureRegion: retained' in atlas and 'index: 7' in atlas
after=tree(project);stamp=(project/target/'catalog.json').stat().st_mtime_ns;count=len(list(artifacts.iterdir()))
again=m.repack_atlases(project,artifacts,['fantasy-monsters']);assert again['files']==0 and again['backup'] is None;assert tree(project)==after;assert (project/target/'catalog.json').stat().st_mtime_ns==stamp;assert len(list(artifacts.iterdir()))==count
print('archive-and-idempotence-pass')`,true);
});

test('edited archived art and concurrent unit additions remain untouched and block stale Fantasy publication',()=>{
  run(String.raw`
project,artifacts,target,original,parts=fixture(base);m.repack_atlases(project,artifacts,['fantasy-monsters'])
catalog=json.loads((project/target/'catalog.json').read_text());archive=project/catalog['sourceSheets'][0]['image'];archive.write_bytes(archive.read_bytes()+b'external edit');before=tree(project)
try:m.repack_atlases(project,artifacts,['fantasy-monsters']);raise AssertionError('Edited source archive was overwritten')
except ValueError as error:assert 'edited' in str(error)
assert tree(project)==before
archive.write_bytes(original);catalog['conversion'].pop('atlasPacking');(project/target/'catalog.json').write_text(json.dumps(catalog));tx=m.Transaction(project,artifacts);m.plan_repack_atlases(tx,['fantasy-monsters']);assert tx.plan;added=project/target/'Units/NewVariant.json';added.write_bytes(b'concurrent user variant');before=tree(project)
try:tx.commit();raise AssertionError('New variant was missed')
except ValueError as error:assert 'Concurrent change in directory' in str(error)
assert tree(project)==before
print('concurrent-art-preserved-pass')`,true);
});

test('fresh Fantasy imports cap pages and identical source content preserves authored registered fixes and variants',()=>{
  run(String.raw`
import copy
source,unused,target,original,source_parts=fixture(base/'source');project=base/'fresh-project';artifacts=base/'import-artifacts';package=base/'fixture.unitypackage';package.write_bytes(b'licensed archive fixture')
prototype=json.loads((source/target/'Units/Unit.json').read_text());prototype['slots'][0]['attachment']='u_a'
prototype['skins']=[{'name':'default','attachments':{'body':{'u_a':{'path':'u_a','width':32,'height':24},'u_b':{'path':'u_b','width':16,'height':24}}}}]
for frame in prototype['animations']['attack']['slots']['body']['attachment']:frame['name']='u_a' if frame['name']=='normal' else 'u_b'
images={part['guid']:{'image':Image.open(source/part['image']).convert('RGBA'),'width':part['width'],'height':part['height'],'pivot':part['pivot'],'ppu':100,'region':'u_'+part['guid'],'spriteName':part['name'],'sheet':'sheet','rect':part['rect'],'fileId':part['guid'],'source':'Assets/sheet.png'} for part in source_parts}
prefab={'name':'Assets/FantasyMonsters/Monsters/Family/Unit/Unit.prefab','guid':'prefab','asset':b'sheet'}
entries={prefab['name']:prefab,'Assets/sheet.png':{'name':'Assets/sheet.png','guid':'sheet','asset':original}}
m.unpack=lambda file:entries;m.slices=lambda entries,needed:(images,{}, {'sheet':{'asset':original,'width':2100,'height':64}})
m.prepare=lambda *args:(prefab,{'attack':{'m_Events':[{'functionName':'Event','data':'Attack','time':.2}]}},'Assets/Controller.controller',[],[])
m.convert_prefab=lambda *args,**kwargs:copy.deepcopy(prototype)
m.fantasy_effects.texture_images=lambda *args:{};m.fantasy_effects.augment=lambda *args:None
first=m.import_pack(project,package,'fantasy-monsters',artifacts);assert first['units']==1
unit=project/target/'Units/Unit.json';unit_bytes=unit.read_bytes();catalog_file=project/target/'catalog.json';catalog=json.loads(catalog_file.read_text())
authored=json.loads(unit_bytes)
for skin in authored['skins']:skin['attachments']['body']['sprite_a']['path']='u_b'
authored['bones'].extend([{'name':'__fx/authored-ambient','parent':'root'},{'name':'__fx/authored-emitter','parent':'root'}]);authored['slots'].extend([{'name':'__fx/authored-ambient','bone':'__fx/authored-ambient'},{'name':'__fx/authored-emitter','bone':'__fx/authored-emitter'}]);authored['authoredFXOrder']=['ambient','emitter'];unit.write_text(json.dumps(authored,indent=3));unit_bytes=unit.read_bytes()
original_dependency=base/'original-dependency.unitypackage';original_dependency.write_bytes(b'licensed dependency fixture');dependency=base/'renamed-dependency.unitypackage';dependency.write_bytes(original_dependency.read_bytes())
catalog['futureCatalog']=True;catalog['source']['futureSource']=True;catalog['source']['dependencies']=[{'package':original_dependency.name,'sha256':sha(original_dependency.read_bytes()),'futureDependency':True}];catalog['conversion']['futureConversion']=True;catalog['units'][0]['futureUnit']=8;catalog['units'][0]['bones']=len(authored['bones']);catalog['parts'][0]['futurePart']=9;authored_records=copy.deepcopy(catalog['units']);authored_parts=copy.deepcopy(catalog['parts']);catalog_file.write_text(json.dumps(catalog))
variant=project/target/'Units/UserVariant.json';custom=json.loads(unit_bytes);custom['futureRig']='preserved';custom['animations']['attack']['events'][0]['time']=.17;variant.write_text(json.dumps(custom));variant_bytes=variant.read_bytes()
variant_meta=variant.with_suffix('.json.meta');variant_meta.write_text(json.dumps({'uuid':'user-variant','importer':'spine','textures':json.loads(unit.with_suffix('.json.meta').read_text())['textures'],'futureVariantMeta':True}));meta_bytes=variant_meta.read_bytes()
variant.with_suffix('.atlas').write_bytes(unit.with_suffix('.atlas').read_bytes());variant.with_suffix('.atlas.meta').write_text(json.dumps({'uuid':'user-variant-atlas'}))
second=m.import_pack(project,package,'fantasy-monsters',artifacts,dependency);assert unit.read_bytes()==unit_bytes;assert variant.read_bytes()==variant_bytes;assert variant_meta.read_bytes()==meta_bytes
catalog=json.loads(catalog_file.read_text());assert catalog['futureCatalog'] and catalog['source']['futureSource'] and catalog['conversion']['futureConversion'];assert catalog['units'][0]['futureUnit']==8;assert catalog['parts'][0]['futurePart']==9
assert catalog['units']==authored_records and catalog['parts']==authored_parts
assert catalog['source']['package']==package.name and catalog['source']['sha256']==sha(package.read_bytes())
assert catalog['source']['dependencies']==[{'package':dependency.name,'sha256':sha(dependency.read_bytes()),'futureDependency':True}]
for file in (project/target/'Units').glob('*.png'):assert max(Image.open(file).size)<=2048
before=tree(project);count=len(list(artifacts.iterdir()));third=m.import_pack(project,package,'fantasy-monsters',artifacts,dependency);assert third['files']==0 and third['backup'] is None;assert tree(project)==before;assert len(list(artifacts.iterdir()))==count
package.write_bytes(b'updated licensed archive fixture');m.import_pack(project,package,'fantasy-monsters',artifacts,dependency);assert 'authoredFXOrder' not in json.loads(unit.read_text());assert variant.read_bytes()==variant_bytes
new_authored=json.loads(unit.read_text());new_authored['authoredFixAfterUpdate']=True;unit.write_text(json.dumps(new_authored));catalog=json.loads(catalog_file.read_text());catalog['source']['dependencies'][0].pop('sha256');catalog_file.write_text(json.dumps(catalog));before=tree(project)
try:m.import_pack(project,package,'fantasy-monsters',artifacts,dependency);raise AssertionError('A missing dependency hash incorrectly matched the source identity')
except ValueError as error:assert 'edited' in str(error)
assert tree(project)==before and 'authoredFixAfterUpdate' in json.loads(unit.read_text())
print('fresh-and-variant-import-pass')`,true);
});

test('same-name input edits during publication roll back owned atlas outputs while preserving external bytes',()=>{
  run(String.raw`
project,artifacts,target,original,parts=fixture(base);before=tree(project);variant=project/target/'Units/Variant.json';relative=variant.relative_to(project).as_posix();tx=m.Transaction(project,artifacts);m.plan_repack_atlases(tx,['fantasy-monsters']);publish=tx._publish;changed=False
def collide(source,destination,previous,copy_only=False):
 global changed
 publish(source,destination,previous,copy_only)
 if not changed:
  changed=True;variant.write_bytes(b'concurrent authored rig content')
tx._publish=collide
try:tx.commit();raise AssertionError('A same-name variant edit was missed')
except ValueError as error:assert 'Concurrent change after publication' in str(error)
assert variant.read_bytes()==b'concurrent authored rig content';after=tree(project)
assert {name:value for name,value in after.items() if name!=relative}=={name:value for name,value in before.items() if name!=relative}
journal=json.loads(next(artifacts.glob('*/transaction.json')).read_text());assert journal['status']=='rolled-back';assert not journal.get('conflicts')
print('same-name-input-preserved-pass')`,true);
});
