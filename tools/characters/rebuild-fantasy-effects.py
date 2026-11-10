"""Rebuild only generated attack particles, preserving source rigs and ambient ports."""
import argparse
import copy
import json
from pathlib import Path

from import_units import Transaction, digest, encoded
import fantasy_effects


def rebuild(project,artifacts):
    tx=Transaction(project,artifacts);textures=fantasy_effects.texture_images({},{})
    for pack in ['fantasy-bosses','fantasy-monsters']:
        catalog_file='assets/resources/unit-library/'+pack+'/catalog.json';catalog=json.loads(tx.read(catalog_file));tx.managed.update(catalog['importedFiles'])
        for unit in catalog['units']:
            file=unit['skeleton'];raw=tx.read(file)
            if digest(raw)!=catalog['importedFiles'].get(file):raise ValueError('Imported model was edited: '+file)
            rig=json.loads(raw);old=copy.deepcopy(rig['_fantasy'].get('effects',{}))
            if not old:raise ValueError('Import Fantasy effects before rebuilding them.')
            generated=lambda name:name=='__fx/emitter' or name.startswith('__fx/attack-')
            rig['bones']=[bone for bone in rig['bones'] if not generated(bone['name'])];rig['slots']=[slot for slot in rig['slots'] if not generated(slot['name'])]
            for skin in rig['skins']:
                for name in list(skin['attachments']):
                    if generated(name):del skin['attachments'][name]
            for clip in rig['animations'].values():
                for key in ['bones','slots']:
                    for name in list(clip.get(key,{})):
                        if generated(name):del clip[key][name]
            effect=fantasy_effects.add_attacks(dict(unit,rig=rig),textures)
            rig['_fantasy']['effects']=dict(old,**effect);tx.json(file,rig);catalog['importedFiles'][file]=digest(encoded(rig));unit['bones']=len(rig['bones']);unit['slots']=len(rig['slots'])
        tx.json(catalog_file,catalog)
    return dict(files=len(tx.plan),backup=tx.commit())


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--project',type=Path,default=Path(__file__).resolve().parents[2]);parser.add_argument('--artifacts',type=Path,required=True);args=parser.parse_args();print(json.dumps(rebuild(args.project,args.artifacts),indent=2))
