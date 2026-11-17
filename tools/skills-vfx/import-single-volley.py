"""Keep the final three native arrows, cropped from source time 1.44 to 2.0.

Original triple-volley artwork remains selectable. The derived skeleton shares
the original PNG pages and is verified against the selected original poses.
"""
import argparse, bisect, copy, hashlib, json, math, subprocess, sys, time
from pathlib import Path
sys.dont_write_bytecode = True
ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'tools/characters'))
from import_units import Transaction, asset_uuid, encoded
from authored_paths import sample, deformation

START,END=1.44,2.0
ID='skirmisher-single-volley'
SOURCE='assets/resources/vfx/hero-skills/skirmisher-triple-volley/skirmisher-triple-volley.json'
TARGET='assets/resources/vfx/hero-skills/skirmisher-triple-volley/'+ID+'.json'

def color_at(keys, at):
    index=max(0,bisect.bisect_right([k.get('time',0) for k in keys],at)-1)
    left=keys[index]; right=keys[min(index+1,len(keys)-1)]
    if left.get('curve') not in (None,'stepped'):raise ValueError('New curved color timeline needs verified slicing')
    span=right.get('time',0)-left.get('time',0)
    amount=0 if not span or left.get('curve')=='stepped' else max(0,min(1,(at-left.get('time',0))/span))
    a=bytes.fromhex(left['color']);b=bytes.fromhex(right['color'])
    return ''.join(f'{round(x+(y-x)*amount):02x}' for x,y in zip(a,b))

def crop(data):
    paths=sample(data); last=[row for row in paths['trajectories'] if row['volley']==2]
    if len(last)!=3:raise ValueError('Expected one final three-arrow set')
    animation=data['animations']['animation']; selected={row['slot'] for row in last}
    flashes={slot for slot,timeline in animation['slots'].items() if 'fashe' in slot and next((k.get('time',0) for k in timeline['attachment'] if k.get('name')),0)>1.4}
    if len(flashes)!=2:raise ValueError('The final two release flash layers changed')
    selected.update(flashes)
    if animation.get('bones') or any(row.get('offset',0) for key in animation.get('drawOrder',[]) for row in key.get('offsets',[])):
        raise ValueError('Source draw-order/bones require explicit slicing support')
    result=copy.deepcopy(data); result['slots']=[row for row in result['slots'] if row['name'] in selected]
    for skin in result['skins']:skin['attachments']={slot:values for slot,values in skin['attachments'].items() if slot in selected}
    sliced=dict(slots={},deform={})
    for slot in sorted(selected):
        original=animation['slots'][slot];track={}
        for name,keys in original.items():
            if name=='attachment':
                prior=[key for key in keys if key.get('time',0)<=START]
                first=copy.deepcopy(prior[-1]) if prior else dict(name=None)
            elif name=='color':first=dict(color=color_at(keys,START))
            else:raise ValueError('Unexpected slot timeline '+name)
            first['time']=0;track[name]=[first]+[dict(copy.deepcopy(key),time=max(0,key.get('time',0)-START)) for key in keys if START<key.get('time',0)<=END]
        sliced['slots'][slot]=track
    for skin,slots in animation.get('deform',{}).items():
        target=sliced['deform'][skin]={}
        for slot,attachments in slots.items():
            if slot not in selected:continue
            target[slot]={}
            skin_data=next(row for row in data['skins'] if row['name']==skin)['attachments']
            for attachment,keys in attachments.items():
                size=len(skin_data[slot][attachment]['vertices'])
                first=dict(time=0,vertices=deformation(keys,START,size))
                target[slot][attachment]=[first]+[dict(copy.deepcopy(key),time=max(0,key.get('time',0)-START)) for key in keys if START<key.get('time',0)<=END]
    # The terminal invisible pose makes the original .56-second tail explicit.
    for track in sliced['slots'].values():
        if track['attachment'][-1].get('time',0)<END-START:track['attachment'].append(dict(time=END-START,name=None))
    result['animations']={'single_volley':sliced}
    result['skeleton']['name']=data['skeleton'].get('name','')+'_single_volley'
    return result,paths,sorted(selected),[row['slot'] for row in last]

def run(backups,node='node'):
    tx=Transaction(ROOT,backups);raw=tx.read(SOURCE);source=json.loads(raw);derived,paths,selected,arrows=crop(source)
    output=backups.resolve()/('single-volley-'+str(time.time_ns()));output.mkdir(parents=True)
    prepared=output/(ID+'.json');prepared.write_bytes(encoded(derived))
    subprocess.run([node,str(Path(__file__).with_name('verify-single-volley.cjs')),str(ROOT/SOURCE),str(prepared),str(output/'verification.json')],check=True)
    tx.stage(TARGET,prepared.read_bytes())
    old_meta=json.loads(tx.read(SOURCE+'.meta'));tx.json(TARGET+'.meta',dict(old_meta,uuid=asset_uuid(TARGET)))
    atlas=SOURCE[:-5]+'.atlas';target_atlas=TARGET[:-5]+'.atlas'
    tx.stage(target_atlas,tx.read(atlas));tx.json(target_atlas+'.meta',dict(ver='1.0.3',uuid=asset_uuid(target_atlas),importer='asset',subMetas={}))
    nativefile='tools/skills-vfx/native-clips.json';native=json.loads(tx.read(nativefile));old=next(row for row in native if row['id']=='skirmisher-triple-volley')
    old['textureSet']='skirmisher-atx117'
    clip=copy.deepcopy(old);clip.update(id=ID,name='Single three-arrow volley',group=ID,resource='vfx/hero-skills/skirmisher-triple-volley/'+ID,
        uuid=asset_uuid(TARGET),animation='single_volley',duration=END-START,frames=round((END-START)*120),trimStart=0,
        trajectory='skirmisher-atx117-single',sourceRelease=paths['firingTimes'][-1]-START,sourceEnd=END-START,
        sourceSha256=hashlib.sha256(prepared.read_bytes()).hexdigest(),source=dict(old['source'],cropStart=START,cropEnd=END,
            originalResource=old['resource'],originalSha256=hashlib.sha256(raw).hexdigest(),arrowSlots=arrows,selectedSlots=selected))
    native=[row for row in native if row['id']!=ID]+[clip];tx.json(nativefile,native)
    catalogfile='assets/resources/vfx/hero-skills/catalog.json';catalog=json.loads(tx.read(catalogfile))
    next(row for row in catalog['clips'] if row['id']=='skirmisher-triple-volley')['textureSet']='skirmisher-atx117'
    catalog['clips']=[row for row in catalog['clips'] if row['id']!=ID]+[clip];catalog['presets']['skirmisher']['cast']=ID
    tx.json(catalogfile,catalog)
    tx.stage('assets/_script/HeroSkillVFXCatalog.js',b'"use strict";\n// Generated skill VFX catalog, including measured blank-frame source trims.\nmodule.exports = '+json.dumps(catalog,ensure_ascii=False,indent=2).encode()+b';\n')
    result=dict(clip=clip,verification=str(output/'verification.json'),transaction=tx.commit());print(json.dumps(result,indent=2));return result

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('backups',type=Path);parser.add_argument('--node',default='node')
    args=parser.parse_args();run(args.backups,args.node)
