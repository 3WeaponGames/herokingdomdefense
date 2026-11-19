"""Export a verified three-arrow crop to an external directory.

The crop is a source verification aid. It uses the original triple-volley texture pages.
"""
import argparse, bisect, copy, json, subprocess, sys, time
from pathlib import Path
sys.dont_write_bytecode = True
ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'tools/characters'))
from import_units import encoded
from authored_paths import sample, deformation

START,END=1.44,2.0
ID='skirmisher-single-volley'
SOURCE='assets/resources/vfx/hero-skills/skirmisher-triple-volley/skirmisher-triple-volley.json'

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

def run(directory, node='node'):
    directory = directory.resolve()
    if directory.is_relative_to(ROOT):
        raise ValueError('Source verification outputs must stay outside the project')
    original = ROOT / SOURCE
    derived, _, _, _ = crop(json.loads(original.read_bytes()))
    output = directory / ('single-volley-' + str(time.time_ns()))
    output.mkdir(parents=True)
    prepared = output / (ID + '.json')
    prepared.write_bytes(encoded(derived))
    verification = output / 'verification.json'
    tool = Path(__file__).with_name('verify-single-volley.cjs')
    subprocess.run([node, str(tool), str(original), str(prepared), str(verification)], check=True)
    return verification


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('directory', type=Path)
    parser.add_argument('--node', default='node')
    args = parser.parse_args()
    print(run(args.directory, args.node))
