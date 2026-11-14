"""Publish the workbook's silent particle captures as immutable Creator sprites.

Usage: python tools/skills-vfx/import-bake.py <external Unity project> <external backups>
Reimport preserves stable UUIDs and uses revision-checked atomic publication.
"""
import argparse,hashlib,json,math,re,sys
from pathlib import Path
from PIL import Image
ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'tools/characters'))
from import_units import Transaction,asset_uuid,texture_meta

def capture_rows(bake):
    """Reject incomplete or mismatched captures before staging production assets."""
    rows=json.loads((bake/'Baked/clips.json').read_text())['clips']
    jobs=json.loads((bake/'jobs.json').read_text())['clips']
    source=json.loads((bake/'source.json').read_text())
    spec=json.loads(Path(__file__).with_name('effects.json').read_text())
    expected={row['id'] for row in spec['clips']}
    expected.update('mystic-beam-'+part['id']+'-'+phase['phase'] for part in spec['beam']['parts'] for phase in spec['beam']['phases'])
    def index(values):
        result={}
        if not isinstance(values,list):raise ValueError('Invalid capture manifest')
        for row in values:
            ident=row.get('id') if isinstance(row,dict) else None
            if not isinstance(ident,str) or not re.fullmatch(r'[a-z0-9]+(?:-[a-z0-9]+)*',ident) or ident in result:raise ValueError('Invalid or duplicate clip ID')
            result[ident]=row
        if result.keys()!=expected:raise ValueError('Incomplete capture manifest')
        return result
    planned=index(jobs);index(rows)
    if not isinstance(source.get('workbookSha256'),str) or not re.fullmatch(r'[a-f0-9]{64}',source['workbookSha256']):raise ValueError('Invalid workbook provenance')
    defaults={'frames':64,'fps':48,'columns':16,'cell':128,'loop':False,'style':'','slot':'','phase':'','package':'','prefab':''}
    for row in rows:
        ident=row['id'];job=planned[ident]
        if row.get('file')!=ident+'.png':raise ValueError('Invalid capture filename: '+ident)
        for key,default in defaults.items():
            if row.get(key,default)!=job.get(key,default):raise ValueError('Capture does not match job '+ident+': '+key)
        for key,maximum in (('frames',4096),('fps',240),('columns',256),('cell',4096)):
            value=row.get(key)
            if type(value) is not int or not 1<=value<=maximum:raise ValueError('Invalid capture layout: '+ident)
        if type(row.get('loop')) is not bool:raise ValueError('Invalid capture loop: '+ident)
        if row['columns']*row['cell']>2048 or ((row['frames']+row['columns']-1)//row['columns'])*row['cell']>2048:raise ValueError('Capture exceeds atlas size: '+ident)
        for key in ('anchorX','anchorY','startX','startY','endX','endY','aspect'):
            value=row.get(key)
            if not isinstance(value,(int,float)) or isinstance(value,bool) or not math.isfinite(value):raise ValueError('Invalid capture pivot: '+ident)
        if row['aspect']<=0:raise ValueError('Invalid capture aspect: '+ident)
        visible=row.get('visibleFrames');bounds=row.get('alphaBounds')
        if type(visible) is not int or not 0<=visible<=row['frames'] or not visible and row.get('phase')!='start':raise ValueError('Empty or invalid capture: '+ident)
        if not isinstance(bounds,list) or len(bounds)!=4 or any(type(value) is not int for value in bounds):raise ValueError('Invalid capture bounds: '+ident)
        if visible and not (0<=bounds[0]<=bounds[2]<row['cell'] and 0<=bounds[1]<=bounds[3]<row['cell']):raise ValueError('Invalid capture bounds: '+ident)
    return rows,source

def run(bake,artifacts):
    rows,source=capture_rows(bake);tx=Transaction(ROOT,artifacts);clips=[]
    base='assets/resources/vfx/hero-skills'
    for folder in ('assets/resources/vfx',base):tx.folder(folder)
    for row in rows:
        image=bake/'Baked'/row['file'];relative=base+'/'+row['file'];raw=image.read_bytes()
        with Image.open(image) as im:
            width,height=im.size
            if im.mode!='RGBA' or width!=row['columns']*row['cell'] or height!=((row['frames']+row['columns']-1)//row['columns'])*row['cell']:raise ValueError('Invalid atlas '+row['id'])
            im.verify()
        meta=texture_meta(relative,width,height);existing=tx.read(relative+'.meta')
        if existing is not None and json.loads(existing)!=meta:raise ValueError('Preserve authored metadata before reimport: '+relative)
        tx.stage(relative,raw);tx.json(relative+'.meta',meta)
        fields=('id','name','style','slot','phase','group','part','loop','frames','columns','cell','fps','anchorX','anchorY','startX','startY','endX','endY','aspect','alphaBounds','visibleFrames')
        clip={k:row[k] for k in fields if k in row}
        clip.update(kind='flipbook',bundle='resources',resource='vfx/hero-skills/'+row['id'],uuid=asset_uuid(relative+'#sprite'),sha256=hashlib.sha256(raw).hexdigest(),source={'package':row['package'],'prefab':row['prefab']})
        clips.append(clip)
    catalog={'version':1,'workbookSha256':source['workbookSha256'],'clips':clips,'presets':{'fighter':{'passive':'fighter-windup'},'vanguard':{'passive':'vanguard-momentum'},'bruiser':{'passive':'bruiser-blood-aura'},'mystic':{'beam':'mystic-beam-body-loop','mark':'mystic-mark-loop'},'guardian':{'buff':'guardian-runic-shield'}}}
    custom=ROOT/'tools/skills-vfx/sheet-clips.json'
    if custom.exists():
        catalog['clips'].extend(json.loads(custom.read_text()))
        catalog['presets']['guardian'].update(taunt='guardian-taunt-test',shield='guardian-body-shield-loop')
    tx.json(base+'/catalog.json',catalog)
    tx.json(base+'/catalog.json.meta',{'ver':'1.2.7','uuid':asset_uuid(base+'/catalog.json'),'importer':'json','subMetas':{}})
    script='assets/_script/HeroSkillVFXCatalog.js'
    tx.stage(script,b'"use strict";\n// Generated by tools/skills-vfx/import-bake.py; stable source and atlas metadata.\nmodule.exports = '+json.dumps(catalog,ensure_ascii=False,indent=2).encode()+b';\n')
    tx.json(script+'.meta',{'ver':'1.1.0','uuid':asset_uuid(script),'importer':'javascript','isPlugin':False,'loadPluginInWeb':True,'loadPluginInNative':True,'loadPluginInEditor':False,'subMetas':{}})
    print(json.dumps({'clips':len(clips),'transaction':tx.commit()},indent=2))
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('bake',type=Path);p.add_argument('artifacts',type=Path);a=p.parse_args();run(a.bake,a.artifacts)
