'use strict';
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const {test} = require('node:test');
const root = path.resolve(__dirname, '../..');
const packs = ['monster1', 'monster2'];
const json = file => JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const identities = {
  monster1: {Atlases: 'c5a4f407-50b0-5ca8-b0a3-28af4930ab71', Units: '90652fdc-2f2c-5057-b84f-1e7635001c06'},
  monster2: {Atlases: '5f92a7a9-2f70-5ebb-a3ce-b6e18dcef0c9', Units: '5478d15d-016e-536f-9bab-92da826fc3e1'}
};
function atlas(text) {
  const pages = [], regions = new Map(), lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);
  let page, region;
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index], value = line.trim();
    if (!value) { region = null; continue; }
    if (!line.includes(':')) {
      if (!index || !lines[index - 1].trim()) {
        page = {name: value}; pages.push(page); region = null;
      } else {
        assert(page, 'Atlas regions require a page');
        assert(!regions.has(value), 'Atlas region names must be unique: ' + value);
        region = {page: page.name}; regions.set(value, region);
      }
    } else {
      const colon = line.indexOf(':'), key = line.slice(0, colon).trim(), data = line.slice(colon + 1).trim();
      if (region) region[key] = data;
      else if (page) page[key] = data;
    }
  }
  return {pages, regions};
}
function dimensions(file) {
  const bytes = fs.readFileSync(file);
  assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', file + ' is PNG');
  return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];
}

test('optimized Monster 1/2 pages fit 2048 and every variant preserves native sibling references', () => {
  let skeletons = 0;
  for (const pack of packs) {
    const base = path.join(root, 'assets/resources/unit-library', pack), catalog = json(path.join(base, 'catalog.json'));
    for (const directory of ['Atlases', 'Units']) {
      assert.equal(json(path.join(base, directory, pack + '-0.png.meta')).uuid, identities[pack][directory], 'Published page-zero texture UUID is stable');
    }
    const seen = new Set(), texts = new Map();
    for (const name of fs.readdirSync(path.join(base, 'Units')).filter(name => name.endsWith('.json'))) {
      const skeleton = path.join(base, 'Units', name), text = fs.readFileSync(skeleton.replace(/\.json$/, '.atlas'), 'utf8');
      if (!texts.has(text)) texts.set(text, atlas(text));
      const parsed = texts.get(text), expectedTextures = [];
      assert(parsed.pages.length > 1, pack + ' splits its former 4096 page without resampling');
      for (const page of parsed.pages) {
        assert.equal(page.name, path.basename(page.name), 'Native Creator resolves sibling page basenames');
        const sibling = path.join(base, 'Units', page.name), source = path.join(base, 'Atlases', page.name);
        const meta = json(sibling + '.meta'), sourceMeta = json(source + '.meta');
        expectedTextures.push(meta.uuid);
        if (seen.has(page.name)) continue;
        seen.add(page.name);
        const [width, height] = dimensions(sibling);
        assert(width <= 2048 && height <= 2048, sibling + ' exceeds the texture cap');
        assert.deepEqual(page.size.split(',').map(Number), [width, height], 'Atlas dimensions match its PNG');
        assert.deepEqual([meta.width, meta.height], [width, height]);
        assert.deepEqual([sourceMeta.width, sourceMeta.height], [width, height]);
        assert.notEqual(meta.uuid, sourceMeta.uuid, 'Native sibling and authoring page keep distinct identifiers');
        assert.deepEqual(fs.readFileSync(sibling), fs.readFileSync(source), 'Native sibling preserves exact packed bytes');
        for (const [file, value] of [[sibling, meta], [source, sourceMeta]]) {
          for (const frame of Object.values(value.subMetas || {})) {
            if (frame.importer === 'sprite-frame') assert.equal(frame.rawTextureUuid, value.uuid, file + ' frame texture link');
          }
          const relative = path.relative(root, file).replace(/\\/g, '/');
          assert.equal(catalog.importedFiles[relative], hash(fs.readFileSync(file)), 'Catalog tracks the packed page content');
        }
      }
      const metadata = json(skeleton + '.meta');
      assert.deepEqual(metadata.textures, expectedTextures, name + ' references every declared native page in order');
      const row = catalog.units.find(unit => path.resolve(root, unit.skeleton) === skeleton);
      if (row) assert.equal(metadata.uuid, row.uuid, 'Catalogued unit identity stays unchanged');
      skeletons++;
    }
    assert(seen.size > 1, pack + ' has multiple native pages');
    for (const part of catalog.parts) assert.equal(hash(fs.readFileSync(path.join(root, part.image))), part.sha256, 'Original authoring sprite is preserved: ' + part.id);
  }
  assert(skeletons >= 227, 'Includes the variant skeletons outside the two 50-unit source catalogs');
});

const python = process.env.PYTHON || (process.platform === 'win32' ? 'python' : 'python3');
const pillowAvailable = cp.spawnSync(python, ['-c', 'from PIL import Image'], {encoding: 'utf8'}).status === 0;
test('optimized regions preserve every source pixel, extent and attachment across all Monster 1/2 skins', {skip: !pillowAvailable}, () => {
  const script = String.raw`
import hashlib,json,re,sys
from pathlib import Path
from PIL import Image
root=Path(sys.argv[1]); compared=0; skeletons=0; parts=0
for pack in ['monster1','monster2']:
 base=root/'assets/resources/unit-library'/pack
 catalog=json.loads((base/'catalog.json').read_text(encoding='utf-8-sig'))
 sources={'u_'+part['guid']:part for part in catalog['parts']}
 paths=sorted((base/'Units').glob('*.json'))
 text=paths[0].with_suffix('.atlas').read_text(encoding='utf-8-sig')
 regions={}; page=None; current=None
 lines=text.splitlines()
 for index,line in enumerate(lines):
  value=line.strip()
  if not value: current=None; continue
  if ':' not in line:
   if index==0 or not lines[index-1].strip(): page=value; current=None
   else:
    assert value not in regions, 'duplicate region '+value
    current={'page':page}; regions[value]=current
  elif current is not None:
   key,value=line.split(':',1);current[key.strip()]=value.strip()
 images={}
 for name,region in regions.items():
  assert name in sources, 'packed region retains its original source GUID: '+name
  part=sources[name];source=root/part['image']
  assert hashlib.sha256(source.read_bytes()).hexdigest()==part['sha256'], 'source bytes changed: '+str(source)
  with Image.open(source) as original: pixels=original.convert('RGBA')
  size=tuple(map(int,region['size'].split(',')));xy=tuple(map(int,region['xy'].split(',')))
  assert tuple(map(int,region['orig'].split(',')))==pixels.size, name+' original extent'
  assert tuple(map(int,region['offset'].split(',')))==(0,0), name+' untrimmed origin'
  assert size==pixels.size, name+' image was resized or trimmed'
  page=region['page']
  if page not in images:
   with Image.open(base/'Units'/page) as packed: images[page]=packed.convert('RGBA')
  x,y=xy;w,h=size;image=images[page]
  assert region['rotate']=='false', name+' retains its authored orientation'
  assert x>=2 and y>=2 and x+w+2<=image.width and y+h+2<=image.height, name+' padded bounds'
  assert image.crop((x,y,x+w,y+h)).tobytes()==pixels.tobytes(), name+' source pixels changed'
  # Bilinear-filter extrusion must not introduce transparent seams.
  for dx in [1,2]:
   assert image.crop((x-dx,y,x-dx+1,y+h)).tobytes()==pixels.crop((0,0,1,h)).tobytes(),name+' left border'
   assert image.crop((x+w+dx-1,y,x+w+dx,y+h)).tobytes()==pixels.crop((w-1,0,w,h)).tobytes(),name+' right border'
  for dy in [1,2]:
   assert image.crop((x,y-dy,x+w,y-dy+1)).tobytes()==pixels.crop((0,0,w,1)).tobytes(),name+' top border'
   assert image.crop((x,y+h+dy-1,x+w,y+h+dy)).tobytes()==pixels.crop((0,h-1,w,h)).tobytes(),name+' bottom border'
  compared+=1
 for skeleton in paths:
  assert skeleton.with_suffix('.atlas').read_text(encoding='utf-8-sig')==text, 'variants share the complete pack layout'
  rig=json.loads(skeleton.read_text(encoding='utf-8-sig'));skins=rig.get('skins',[])
  if isinstance(skins,dict): skins=[{'attachments':value} for value in skins.values()]
  for skin in skins:
   for slot,attachments in skin.get('attachments',{}).items():
    for key,attachment in attachments.items():
     if attachment.get('type','region') in ['region','mesh','skinnedmesh','weightedmesh']:
      name=attachment.get('path',attachment.get('name',key));assert name in regions,str(skeleton)+' missing '+name
  skeletons+=1
 for name,part in sources.items():
  if part['image'].endswith('/_Common/Sample/BG.png'): assert name not in regions, 'sample background must not occupy runtime atlases'
  assert hashlib.sha256((root/part['image']).read_bytes()).hexdigest()==part['sha256']
  parts+=1
print(json.dumps({'comparedRegions':compared,'skeletons':skeletons,'preservedSourceParts':parts}))
`;
  const result = cp.spawnSync(python, ['-c', script, root], {encoding: 'utf8', maxBuffer: 1024 * 1024, env: {...process.env, PYTHONDONTWRITEBYTECODE: '1'}});
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const report = JSON.parse(result.stdout);
  assert(report.comparedRegions >= 836, 'Every used source region is compared pixel for pixel');
  assert(report.skeletons >= 227, 'Every original and variant skin is checked');
  assert(report.preservedSourceParts >= 838, 'Authoring source images remain available');
});
