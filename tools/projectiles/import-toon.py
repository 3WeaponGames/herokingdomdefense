"""Import verified Toon flipbooks into production resources, preserving drafts.

python tools/projectiles/import-toon.py <external-unity-bake/Baked> [--project ROOT]
Requires Pillow. The source Unity package and intermediate captures stay outside
the repository. Only runtime atlases and their provenance enter the game.
"""
import argparse
import hashlib
import io
import json
from pathlib import Path
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'characters'))
from import_units import Transaction, asset_uuid, texture_meta, encoded
from PIL import Image

def normalize(sheet,clip):
    # Camera blending stores premultiplied RGB. The game imports straight-alpha
    # PNGs; undo that blend before resampling to avoid dark edges and dim glows.
    sheet=sheet.convert('RGBA');pixels=bytearray(sheet.tobytes())
    for at in range(0,len(pixels),4):
        alpha=pixels[at+3]
        if 0<alpha<255:
            for channel in range(3):pixels[at+channel]=min(255,round(pixels[at+channel]*255/alpha))
    sheet=Image.frombytes('RGBA',sheet.size,bytes(pixels))
    cell=clip['cell'];frames=[];box=None
    for f in range(clip['frames']):
        x=f%clip['columns']*cell;y=f//clip['columns']*cell
        frame=sheet.crop((x,y,x+cell,y+cell)).convert('RGBA');frames.append(frame)
        bounds=frame.getchannel('A').point(lambda a:255 if a>8 else 0).getbbox()
        if bounds:box=bounds if box is None else (min(box[0],bounds[0]),min(box[1],bounds[1]),max(box[2],bounds[2]),max(box[3],bounds[3]))
    if not box:raise ValueError('Empty baked effect: '+clip['name'])
    # A fixed crop/scale for the entire clip keeps its anchor and scale stable.
    margin=3;size=max(box[2]-box[0],box[3]-box[1])+margin*2;cx=(box[0]+box[2])/2;cy=(box[1]+box[3])/2
    crop=(round(cx-size/2),round(cy-size/2),round(cx+size/2),round(cy+size/2))
    output=Image.new('RGBA',sheet.size)
    for f,frame in enumerate(frames):output.paste(frame.crop(crop).resize((cell,cell),Image.Resampling.LANCZOS),(f%clip['columns']*cell,f//clip['columns']*cell))
    raw=io.BytesIO();output.save(raw,format='PNG');return raw.getvalue()

def main():
    parser=argparse.ArgumentParser();parser.add_argument('baked',type=Path);parser.add_argument('--project',type=Path,default=Path(__file__).resolve().parents[2]);args=parser.parse_args()
    source=args.baked.resolve();clips=json.loads((source/'clips.json').read_text())['clips']
    if len(clips)!=45:raise ValueError('Expected all 15 flight, 15 launch and 15 impact effects')
    artifacts=source.parent/'import-transaction';tx=Transaction(args.project,artifacts);assets=[]
    manifest='assets/resources/projectiles/toon/library.json';before=tx.read(manifest)
    previous=json.loads(before.decode('utf-8-sig')) if before else {};tx.managed=previous.get('importedFiles',{})
    tx.folder("assets/resources/projectiles");tx.folder("assets/resources/projectiles/toon")
    for clip in clips:
        target='assets/resources/projectiles/toon/'+clip['file'];sheet=Image.open(source/clip['file']);raw=normalize(sheet,clip)
        # Stage every output before committing; the source project stays intact
        # if a conversion fails or another editor changes an output mid-import.
        tx.stage(target,raw);tx.stage(target+'.meta',encoded(texture_meta(target,sheet.width,sheet.height)))
        role='flight' if clip['loop'] else 'launch' if clip['name'].startswith('Flash ') else 'impact'
        assets.append(dict(id='toon:'+Path(clip['file']).stem,name=clip['name'],category='Toon / '+role,kind='flipbook',role=role,image=target,resource=target[len('assets/resources/'): -4],size=80 if role!='flight' else 56,**{key:clip[key] for key in ('frames','columns','cell','fps','loop')}))
    provenance=json.loads((source.parent/'source.json').read_text());provenance['alpha']='straight'
    imported=dict(previous.get('importedFiles',{}))
    for asset in assets:
        for key in (asset['image'],asset['image']+'.meta'):
            raw=tx.plan[key][1] if key in tx.plan else tx.read(key);imported[key]=hashlib.sha256(raw).hexdigest()
    old_assets={asset['id']:asset for asset in previous.get('assets',[])};known={asset['id'] for asset in assets}
    assets=[dict(old_assets.get(asset['id'],{}),**asset) for asset in assets]+[asset for asset in previous.get('assets',[]) if asset['id'] not in known]
    data=dict(previous,source=dict(previous.get('source',{}),**provenance),assets=assets,importedFiles=imported);tx.stage(manifest,encoded(data))
    tx.stage('assets/resources/projectiles/toon/library.json.meta',encoded(dict(ver='1.2.7',uuid=asset_uuid('projectiles/toon/library'),importer='json',subMetas={})))
    tx.plan=dict(sorted(tx.plan.items(),key=lambda pair:not pair[0].endswith('.meta')))
    print(tx.commit())

if __name__=='__main__':main()
