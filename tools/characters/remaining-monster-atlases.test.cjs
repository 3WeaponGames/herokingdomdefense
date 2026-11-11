'use strict';
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const {test} = require('node:test');
const root = path.resolve(__dirname, '../..');
const packs = ['monster3', 'fantasy-monsters', 'fantasy-bosses'];
const json = file => JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
const hash = data => crypto.createHash('sha256').update(data).digest('hex');
function pngSize(file) {
  const handle = fs.openSync(file, 'r'), bytes = Buffer.alloc(24);
  try {
    assert.equal(fs.readSync(handle, bytes, 0, bytes.length, 0), bytes.length, 'PNG header is complete');
    assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];
  } finally { fs.closeSync(handle); }
}
function files(directory) {
  return fs.readdirSync(directory, {withFileTypes: true}).flatMap(entry => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? files(file) : [file];
  });
}
function pages(text) {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/), result = [];
  for (let index = 0; index < lines.length; index++) {
    if (lines[index].trim() && (!index || !lines[index - 1].trim()) && /^(size|format):/.test((lines[index + 1] || '').trim())) {
      const page = {name: lines[index].trim()};
      for (let row = index + 1; row < lines.length && lines[row].includes(':') && !/^\s/.test(lines[row]); row++) {
        const colon = lines[row].indexOf(':');
        page[lines[row].slice(0, colon)] = lines[row].slice(colon + 1).trim();
      }
      result.push(page);
    }
  }
  return result;
}

test('Monster 3 and both Fantasy packs have capped native pages and complete variant texture bindings', () => {
  let rigs = 0, pageCount = 0;
  for (const pack of packs) {
    const base = path.join(root, 'assets/resources/unit-library', pack), catalog = json(path.join(base, 'catalog.json'));
    for (const file of files(base).filter(file => file.endsWith('.png'))) {
      const [width, height] = pngSize(file);
      assert(width <= 2048 && height <= 2048, 'Runtime image exceeds 2048: ' + path.relative(root, file));
    }
    const checked = new Set();
    for (const file of fs.readdirSync(path.join(base, 'Units')).filter(file => file.endsWith('.json'))) {
      const skeleton = path.join(base, 'Units', file), atlas = skeleton.replace(/\.json$/, '.atlas');
      const declared = pages(fs.readFileSync(atlas, 'utf8')), textures = [];
      assert(declared.length, file + ' declares its native atlas pages');
      for (const page of declared) {
        assert.equal(page.name, path.basename(page.name), 'Creator resolves native sibling page basenames');
        const sibling = path.join(base, 'Units', page.name), canonical = path.join(base, 'Atlases', page.name);
        const metadata = json(sibling + '.meta'), sourceMetadata = json(canonical + '.meta');
        textures.push(metadata.uuid);
        if (checked.has(page.name)) continue;
        checked.add(page.name); pageCount++;
        const dimensions = pngSize(sibling);
        assert.deepEqual(page.size.split(',').map(Number), dimensions, 'Declared atlas dimensions match the texture');
        assert.deepEqual([metadata.width, metadata.height], dimensions);
        assert.deepEqual([sourceMetadata.width, sourceMetadata.height], dimensions);
        for (const value of [metadata, sourceMetadata]) {
          assert.equal(value.genMipmaps, false, 'NPOT runtime pages do not enable unsupported mipmaps');
          assert.equal(value.wrapMode, 'clamp', 'NPOT pages keep clamp sampling');
          assert.equal(value.premultiplyAlpha, false, 'Packed pixels retain their authored straight-alpha convention');
        }
        assert.notEqual(metadata.uuid, sourceMetadata.uuid, 'Native sibling pages retain distinct asset identities');
        assert.deepEqual(fs.readFileSync(sibling), fs.readFileSync(canonical), 'Both import paths preserve the same exact packed pixels');
        for (const image of [sibling, canonical]) {
          const relative = path.relative(root, image).replace(/\\/g, '/');
          assert.equal(catalog.importedFiles[relative], hash(fs.readFileSync(image)), 'Manifest includes the current page content');
        }
      }
      const metadata = json(skeleton + '.meta'), row = catalog.units.find(row => path.resolve(root, row.skeleton) === skeleton);
      assert.deepEqual(metadata.textures, textures, file + ' native texture array matches atlas page order');
      if (row) assert.equal(metadata.uuid, row.uuid, 'Published source model identifiers remain stable');
      rigs++;
    }
  }
  assert(rigs >= 216, 'Covers every shipped skeleton, including variants outside catalog.units');
  assert(pageCount > 3, 'Exercises shared and multi-page layouts');
});

const python = process.env.PYTHON || (process.platform === 'win32' ? 'python' : 'python3');
const pillowAvailable = cp.spawnSync(python, ['-c', 'from PIL import Image'], {encoding: 'utf8'}).status === 0;
function runPython(script) {
  const result = cp.spawnSync(python, ['-c', script, root], {
    encoding: 'utf8', maxBuffer: 1024 * 1024, env: {...process.env, PYTHONDONTWRITEBYTECODE: '1'}
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return JSON.parse(result.stdout);
}

test('remaining monster regions preserve exact source pixels, expressions, effects and every skin', {skip: !pillowAvailable}, () => {
  const result = runPython(String.raw`
import hashlib,json,sys
from pathlib import Path
from functools import lru_cache
from PIL import Image
root=Path(sys.argv[1]);regions_checked=0;rigs_checked=0;expressions=0;effects=0;parts_checked=0
boss=json.loads((root/'assets/resources/unit-library/fantasy-bosses/catalog.json').read_text(encoding='utf-8-sig'))
effect_ids={entry['id'] for entry in boss.get('effectAssets',[])}
for pack in ['monster3','fantasy-monsters','fantasy-bosses']:
 base=root/'assets/resources/unit-library'/pack
 catalog=json.loads((base/'catalog.json').read_text(encoding='utf-8-sig'))
 sources={'u_'+part['guid']:part for part in catalog['parts']}
 original_pages={Path(record['originalNativeAsset']).name:record['sha256'] for record in catalog.get('sourceSheets',[])}
 @lru_cache(maxsize=None)
 def retained_page(name):
  return name in original_pages and hashlib.sha256((base/'Units'/name).read_bytes()).hexdigest()==original_pages[name]
 for part in catalog['parts']:
  assert hashlib.sha256((root/part['image']).read_bytes()).hexdigest()==part['sha256'],'source sprite changed: '+part['image']
  parts_checked+=1
 @lru_cache(maxsize=4)
 def image(name):
  with Image.open(base/'Units'/name) as picture:return picture.convert('RGBA')
 checked=set();layouts={}
 for skeleton in sorted((base/'Units').glob('*.json')):
  text=skeleton.with_suffix('.atlas').read_text(encoding='utf-8-sig')
  if text not in layouts:
   regions={};page=None;current=None;lines=text.splitlines()
   for index,line in enumerate(lines):
    value=line.strip()
    if not value:current=None;continue
    if ':' not in line:
     if index==0 or not lines[index-1].strip():page=value;current=None
     else:
      assert value not in regions,'duplicate atlas region: '+value
      current={'page':page};regions[value]=current
    elif current is not None:
     key,value=line.split(':',1);current[key.strip()]=value.strip()
   layouts[text]=regions
  regions=layouts[text]
  for name,region in sorted(regions.items(),key=lambda row:(row[1]['page'],row[0])):
   assert name in sources,'unknown source image: '+name
   part=sources[name];size=tuple(map(int,region['size'].split(',')));xy=tuple(map(int,region['xy'].split(',')))
   identity=(region['page'],name,xy,size)
   if identity in checked:continue
   checked.add(identity)
   with Image.open(root/part['image']) as picture:original=picture.convert('RGBA')
   assert size==original.size==tuple(map(int,region['orig'].split(','))),name+' was resized or trimmed'
   assert tuple(map(int,region['offset'].split(',')))==(0,0),name+' origin changed'
   assert region.get('rotate','false')=='false',name+' orientation changed'
   packed=image(region['page']);x,y=xy;w,h=size
   assert x>=0 and y>=0 and x+w<=packed.width and y+h<=packed.height,name+' image bounds'
   assert packed.crop((x,y,x+w,y+h)).tobytes()==original.tobytes(),name+' source pixels changed'
   # Legal legacy pages may be retained byte for byte when repacking would
   # grow or split them. Only unchanged originals may keep their old padding.
   if not retained_page(region['page']):
    assert x>=2 and y>=2 and x+w+2<=packed.width and y+h+2<=packed.height,name+' padded bounds'
    for distance in [1,2]:
     assert packed.crop((x-distance,y,x-distance+1,y+h)).tobytes()==original.crop((0,0,1,h)).tobytes(),name+' left border'
     assert packed.crop((x+w+distance-1,y,x+w+distance,y+h)).tobytes()==original.crop((w-1,0,w,h)).tobytes(),name+' right border'
     assert packed.crop((x,y-distance,x+w,y-distance+1)).tobytes()==original.crop((0,0,w,1)).tobytes(),name+' top border'
     assert packed.crop((x,y+h+distance-1,x+w,y+h+distance)).tobytes()==original.crop((0,h-1,w,h)).tobytes(),name+' bottom border'
   regions_checked+=1
  rig=json.loads(skeleton.read_text(encoding='utf-8-sig'));skins=rig.get('skins',[])
  if isinstance(skins,dict):skins=[{'attachments':value} for value in skins.values()]
  attachment_keys={}
  for skin in skins:
   for slot,attachments in skin.get('attachments',{}).items():
    attachment_keys.setdefault(slot,set()).update(attachments)
    for name,attachment in attachments.items():
     if attachment.get('type','region') in ['region','mesh','linkedmesh','skinnedmesh','weightedmesh']:
      region=attachment.get('path',attachment.get('name',name));assert region in regions,str(skeleton)+' missing region: '+region
  for animation in rig.get('animations',{}).values():
   for slot,timelines in animation.get('slots',{}).items():
    for frame in timelines.get('attachment',[]):
     if frame.get('name') is not None:assert frame['name'] in attachment_keys.get(slot,set()),str(skeleton)+' missing animated expression: '+frame['name']
  if pack.startswith('fantasy-'):
   model=next((unit for unit in catalog['units'] if root/unit['skeleton']==skeleton),None)
   if model:
    assert rig['_fantasy']['expressions']==model['expressions'],'expression controls changed'
    assert rig['_fantasy']['animationAliases']==model['animationAliases'],'animation aliases changed'
   for expression in rig['_fantasy'].get('expressions',[]):
    for state in expression['states']:
     if state is not None:assert state in attachment_keys.get(expression['slot'],set()),str(skeleton)+' expression state disappeared'
    expressions+=1
   effect=rig['_fantasy'].get('effects',{})
   for animation in effect.get('attacks',[]):assert animation['animation'] in rig['animations'],'effect animation disappeared'
   for role,identifier in effect.get('projectile',{}).items():
    if role in ['flight','launch','impact']:assert identifier in effect_ids,'effect asset disappeared: '+identifier
   effects+=bool(effect)
  rigs_checked+=1
 image.cache_clear()
print(json.dumps({'regions':regions_checked,'rigs':rigs_checked,'parts':parts_checked,'expressions':expressions,'effects':effects}))
`);
  assert(result.rigs >= 216);
  assert(result.parts >= 1695, 'Every original sprite remains available for authoring');
  assert(result.regions >= 1600, 'Compares every distinct packed source region');
  assert(result.expressions > 100, 'Exercises Fantasy expression controls');
  assert(result.effects > 100, 'Exercises the generated Fantasy visual effects');
});

test('Fantasy whole-sheet sources retain exact bytes and slice provenance outside runtime assets', {skip: !pillowAvailable}, () => {
  const result = runPython(String.raw`
import hashlib,json,struct,sys
from pathlib import Path
from functools import lru_cache
from PIL import Image
root=Path(sys.argv[1]);sheets_checked=0;parts_checked=0;profile_pages=0
def profiles(raw):
 result={};offset=8
 while offset+12<=len(raw):
  length=struct.unpack('>I',raw[offset:offset+4])[0];kind=raw[offset+4:offset+8]
  if kind in [b'iCCP',b'sRGB',b'gAMA',b'cHRM',b'cICP',b'mDCV',b'cLLI']:result[kind]=raw[offset+8:offset+8+length]
  offset+=length+12
 return result
for pack in ['fantasy-monsters','fantasy-bosses']:
 base=root/'assets/resources/unit-library'/pack;catalog=json.loads((base/'catalog.json').read_text(encoding='utf-8-sig'))
 records=catalog.get('sourceSheets',[]);assert records,'whole-sheet source provenance is missing: '+pack
 mapping={};source_profiles={}
 for record in records:
  path=record['image'];assert path.startswith('authoring/unit-library/'+pack+'/sheets/'),'source sheet remains in the runtime bundle'
  original=record['originalAsset'];native=record['originalNativeAsset']
  assert original.startswith('assets/resources/unit-library/'+pack+'/Atlases/')
  assert native.startswith('assets/resources/unit-library/'+pack+'/Units/')
  assert Path(original).name==Path(native).name==Path(path).name
  assert hashlib.sha256((root/path).read_bytes()).hexdigest()==record['sha256'],'original whole-sheet bytes changed: '+path
  assert catalog['importedFiles'][path]==record['sha256'],'source sheet hash is absent from the catalog'
  assert record['originalUuid']!=record['originalNativeUuid'],'canonical/native source identities were conflated'
  for image,key in [(original,'originalUuid'),(native,'originalNativeUuid')]:
   if (root/image).exists():assert json.loads((root/(image+'.meta')).read_text(encoding='utf-8-sig'))['uuid']==record[key],'published source page identity changed'
  guid=Path(original).stem.removeprefix('sheet_');mapping[guid]=path;sheets_checked+=1
  source_profiles[Path(original).stem]=profiles((root/path).read_bytes())
 for native in (base/'Units').glob('*.png'):
  source=next((stem for stem in source_profiles if native.stem==stem or native.stem.startswith(stem+'-')),None)
  assert source is not None,'runtime page has no original color-profile provenance: '+str(native)
  assert profiles(native.read_bytes())==source_profiles[source],'ICC/gamma/chromaticity profile changed: '+str(native)
  profile_pages+=1
 @lru_cache(maxsize=4)
 def image(path):
  with Image.open(root/path) as picture:return picture.convert('RGBA')
 for part in sorted(catalog['parts'],key=lambda part:(part['sheet'],part['guid'])):
  assert part['sheet'] in mapping,'source sheet for part is not retained: '+part['id']
  sheet=image(mapping[part['sheet']]);rect=part['rect'];x,y,w,h=[rect[key] for key in ['x','y','width','height']]
  with Image.open(root/part['image']) as picture:original=picture.convert('RGBA')
  assert sheet.crop((x,sheet.height-y-h,x+w,sheet.height-y)).tobytes()==original.tobytes(),'source slice/pivot provenance changed: '+part['id']
  parts_checked+=1
 image.cache_clear()
print(json.dumps({'sheets':sheets_checked,'parts':parts_checked,'profilePages':profile_pages}))
`);
  assert(result.sheets >= 60, 'Preserves every original body/effect sheet');
  assert(result.parts >= 1249, 'Retains exact Unity slice pixels and all generated effect source pixels');
  assert(result.profilePages >= 60, 'Every runtime page retains its original display color profile');
});
