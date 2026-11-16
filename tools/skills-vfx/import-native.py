"""Import the plan's exact Spine VFX without resampling their source artwork.

Only JSON/atlas/PNG data is copied from the supplied Unity project. Unity
behaviours, scripts, audio and materials are never imported or executed.
"""
import argparse,hashlib,json,math,re,sys
from pathlib import Path
from PIL import Image
ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'tools/characters'))
from import_units import Transaction,asset_uuid,texture_meta
from authored_paths import sample as sample_arrows,module as paths_module

SOURCES=[
 ('skirmisher-triple-volley','Triple Volley','skirmisher','cast','ATX117','18f5b4af93f6','animation',False),
 ('mystic-charged-burst','Charged Arcane Burst','mystic','cast','ATX117','00ed1b51cd1a','animation',False),
 ('vanguard-spear-barrage','Spear Barrage','vanguard','cast','SP88','1f6b6d966ec2','action',False),
 ('guardian-defense','Defense Appearance','guardian','defense','SP88','c87500849c28','in',False),
 ('guardian-physical-shield-start','Physical Shield Appearance','guardian','physicalShield','SP88','93ec2df89fdc','in',False),
 ('guardian-physical-shield-loop','Physical Shield Sustain','guardian','physicalShield','SP88','93ec2df89fdc','loop',True)
]
def times(value):
 if isinstance(value,dict):
  if 'time' in value:yield value['time']
  for part in value.values():yield from times(part)
 elif isinstance(value,list):
  for part in value:yield from times(part)
def run(source,artifacts):
 tx=Transaction(ROOT,artifacts);clips=[];written=set();base='assets/resources/vfx/hero-skills'
 for folder in ('assets/resources/vfx',base):tx.folder(folder)
 for ident,label,style,slot,pack,folder,animation,loop in SOURCES:
  source_dir=source/pack/'Data'/folder;data=json.loads((source_dir/'effect.json').read_text(encoding='utf-8'))
  if not data.get('skeleton',{}).get('spine','').startswith('3.8.'):raise ValueError('Unsupported Spine version')
  group='guardian-physical-shield' if slot=='physicalShield' else ident
  relative=base+'/'+group
  tx.folder(relative)
  jsonfile=relative+'/'+group+'.json';atlasfile=relative+'/'+group+'.atlas'
  atlas=(source_dir/'effect.atlas.txt').read_text(encoding='utf-8');textures=[];decoded=0
  for page in sorted(source_dir.glob('page_*.png')):
   destination=relative+'/'+page.name;raw=page.read_bytes()
   with Image.open(page) as image:w,h=image.size
   decoded+=w*h*4;tx.stage(destination,raw);tx.json(destination+'.meta',texture_meta(destination,w,h));textures.append(asset_uuid(destination))
  vertices=[]
  for skin in data.get('skins',[]):
   for attachments in skin.get('attachments',{}).values():
    for attachment in attachments.values():
     points=attachment.get('vertices',[])
     if len(points)==len(attachment.get('uvs',[])):vertices.extend(zip(points[::2],points[1::2]))
  if not vertices:raise ValueError('No unweighted source bounds: '+ident)
  left=min(x for x,y in vertices);bottom=min(y for x,y in vertices);width=max(x for x,y in vertices)-left;height=max(y for x,y in vertices)-bottom
  if jsonfile not in written:
   # Required size metadata enables the existing renderer to center and fit
   # these exported data-only skeletons; attachment coordinates stay exact.
   data['skeleton'].update(x=left,y=bottom,width=width,height=height)
   tx.json(jsonfile,data);tx.stage(atlasfile,atlas.encode())
   tx.json(jsonfile+'.meta',dict(ver='1.2.5',uuid=asset_uuid(jsonfile),importer='spine',textures=textures,scale=1,subMetas={}))
   tx.json(atlasfile+'.meta',dict(ver='1.0.3',uuid=asset_uuid(atlasfile),importer='asset',subMetas={}))
   written.add(jsonfile)
  if ident=='skirmisher-triple-volley':
   paths=sample_arrows(data);script='assets/_script/HeroSkillArrowPaths.js';tx.stage(script,paths_module(paths))
   tx.json(script+'.meta',dict(ver='1.1.0',uuid=asset_uuid(script),importer='javascript',isPlugin=False,loadPluginInWeb=True,loadPluginInNative=True,loadPluginInEditor=False,subMetas={}),True)
  duration=max(times(data['animations'][animation]),default=0)
  if not duration>0:raise ValueError('Empty animation: '+ident)
  clips.append(dict(id=ident,name=label,style=style,slot=slot,phase='loop' if loop else 'start' if slot=='physicalShield' else 'once',group=group,loop=loop,frames=round(duration*120),fps=120,kind='spine',bundle='resources',resource='vfx/hero-skills/'+group+'/'+group,uuid=asset_uuid(jsonfile),animation=animation,duration=duration,width=width,height=height,anchorX=-left/width,anchorY=-bottom/height,decodedBytes=decoded,premultipliedAlpha=False,sha256=hashlib.sha256((source_dir/'effect.json').read_bytes()).hexdigest(),source={'directory':str(source_dir),'skeleton':data['skeleton']['name']}))
 for clip in clips:
  if clip['id']=='skirmisher-triple-volley':clip.update(trajectory='skirmisher-atx117',originX=paths['sourceOrigin']['x'],originY=paths['sourceOrigin']['y'],defaultRotation=paths['defaultRotation'],sourceSha256=paths['sourceSha256'])
 tx.json('tools/skills-vfx/native-clips.json',clips)
 print(json.dumps({'clips':len(clips),'transaction':tx.commit()},indent=2))
if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('source',type=Path);parser.add_argument('artifacts',type=Path);args=parser.parse_args();run(args.source,args.artifacts)
