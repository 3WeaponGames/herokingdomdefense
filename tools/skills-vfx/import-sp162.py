"""Publish the data-only Guardian SP162 effect after binary/JSON pose validation.

First run prepare-sp162.cjs SOURCE EXTERNAL_STAGING, then this importer with
EXTERNAL_STAGING EXTERNAL_BACKUPS. No Unity code or game settings are executed.
"""
import argparse, hashlib, json, math, re, sys
from pathlib import Path
sys.dont_write_bytecode = True
from PIL import Image
ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'tools/characters'))
from import_units import Transaction, asset_uuid, texture_meta

IDS = {'guardian-sp162-gold-shield'}
BASE = 'assets/resources/vfx/hero-skills'

def digest(raw):
    return hashlib.sha256(raw).hexdigest()

def run(staging, backups, project=ROOT):
    staging = Path(staging).resolve(); project = Path(project).resolve()
    if staging.is_relative_to(project):
        raise ValueError('Prepared data must remain outside the project')
    manifest = json.loads((staging / 'manifest.json').read_bytes())
    rows = manifest.get('clips', [])
    if len(rows) != len(IDS) or {row.get('id') for row in rows} != IDS:
        raise ValueError('Expected the verified Guardian SP162 effect')
    tx = Transaction(project, Path(backups)); clips = []
    for row in rows:
        ident = row['id']; folder = staging / ident
        if folder.is_symlink(): raise ValueError('Symlinked staged asset')
        report = row.get('verification', {})
        if report.get('maxError') != 0 or report.get('samples', 0) < 100:
            raise ValueError('Missing exact source-pose verification: ' + ident)
        resource = 'vfx/hero-skills/' + ident + '/' + ident
        if row.get('resource') != resource or row.get('animation') != 'play':
            raise ValueError('Unexpected SP162 resource')
        for key in ('duration', 'width', 'height', 'decodedBytes'):
            if not isinstance(row.get(key), (int, float)) or not math.isfinite(row[key]) or row[key] <= 0:
                raise ValueError('Invalid SP162 bounds/duration: ' + ident)
        relative = BASE + '/' + ident; tx.folder(relative)
        jsonfile = relative + '/' + ident + '.json'; atlasfile = relative + '/' + ident + '.atlas'
        raw = (folder / (ident + '.json')).read_bytes()
        if digest(raw) != row['jsonSha256']: raise ValueError('Prepared JSON changed')
        data = json.loads(raw)
        if not data.get('skeleton', {}).get('spine', '').startswith('3.8.') or 'play' not in data.get('animations', {}):
            raise ValueError('Unsupported converted Spine data')
        source = Path(row['source']['directory'])
        name = row['source']['skeleton']
        if not re.fullmatch(r'\d+_[a-z0-9_]+', name): raise ValueError('Invalid source skeleton')
        source_binary = (source / (name + '.skel.bytes')).read_bytes()
        if digest(source_binary) != row['source']['binarySha256']:
            raise ValueError('Original binary changed after verification')
        # Tiny original binary fixtures make the exact round-trip pose tests
        # independent of the external Unity authoring directory.
        tx.stage('tools/skills-vfx/fixtures/sp162/' + name + '.skel.bytes', source_binary)
        atlas = (folder / (ident + '.atlas')).read_bytes()
        if digest(atlas) != row['source']['atlasSha256']:
            raise ValueError('Prepared atlas changed')
        textures = []; decoded = 0
        for page in row['pages']:
            filename = page['file']
            if Path(filename).name != filename or not filename.endswith('.png'):
                raise ValueError('External atlas page')
            raw_page = (folder / filename).read_bytes()
            if digest(raw_page) != page['sha256'] or raw_page != (source / filename).read_bytes():
                raise ValueError('Original texture changed')
            with Image.open(folder / filename) as image:
                w, h = image.size
                if (w, h) != (page['width'], page['height']) or image.mode != 'RGBA':
                    raise ValueError('Invalid original PNG page')
            imagefile = relative + '/' + filename
            tx.stage(imagefile, raw_page); tx.json(imagefile + '.meta', texture_meta(imagefile, w, h))
            textures.append(asset_uuid(imagefile)); decoded += w * h * 4
        if decoded != row['decodedBytes']: raise ValueError('Decoded texture budget changed')
        tx.stage(jsonfile, raw); tx.stage(atlasfile, atlas)
        tx.json(jsonfile + '.meta', dict(ver='1.2.5', uuid=asset_uuid(jsonfile), importer='spine', textures=textures, scale=1, subMetas={}))
        tx.json(atlasfile + '.meta', dict(ver='1.0.3', uuid=asset_uuid(atlasfile), importer='asset', subMetas={}))
        clip = {key: value for key, value in row.items() if key not in ('pages', 'verification', 'jsonSha256')}
        clip['uuid'] = asset_uuid(jsonfile); clips.append(clip)
    nativefile = 'tools/skills-vfx/native-clips.json'
    native = json.loads(tx.read(nativefile) or b'[]')
    native = [row for row in native if row.get('id') not in IDS] + clips
    if len({row['id'] for row in native}) != len(native): raise ValueError('Duplicate native VFX IDs')
    tx.json(nativefile, native)
    catalogfile = BASE + '/catalog.json'; catalog = json.loads(tx.read(catalogfile))
    catalog['clips'] = [row for row in catalog['clips'] if row.get('id') not in IDS] + clips
    guardian = catalog['presets']['guardian']
    for key in ('buff', 'defense', 'shield'): guardian.pop(key, None)
    guardian['physicalShield'] = 'guardian-sp162-gold-shield'
    tx.json(catalogfile, catalog)
    tx.stage('assets/_script/HeroSkillVFXCatalog.js', b'"use strict";\n// Generated skill VFX catalog, including measured blank-frame source trims.\nmodule.exports = ' + json.dumps(catalog, ensure_ascii=False, indent=2).encode() + b';\n')
    receipt = tx.commit()
    result = dict(clips=[dict(id=row['id'], uuid=row['uuid'], resource=row['resource'],
                             duration=row['duration'], trimStart=row['trimStart']) for row in clips],
                  decodedBytes=sum(row['decodedBytes'] for row in clips), transaction=receipt)
    print(json.dumps(result, indent=2)); return result

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('staging', type=Path); parser.add_argument('backups', type=Path)
    args = parser.parse_args(); run(args.staging, args.backups)
