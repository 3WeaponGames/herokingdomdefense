"""Prepare only the workbook's selected Unity prefab dependencies for silent baking.

Raw packages and the disposable Unity project must stay outside the game repo.
Package C# scripts, assemblies and audio are never imported or executed.
"""
import argparse,copy,gc,hashlib,json,re,shutil,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'tools/characters'))
from unity_monsters import unpack

# Source render-pipeline shaders are replaced by our capture shader. Importing
# their incompatible HDRP/URP graphs would require unrelated render packages.
ALLOWED={'.prefab','.mat','.png','.tga','.jpg','.jpeg','.psd','.tif','.tiff','.fbx','.obj','.mesh','.asset','.anim','.controller'}
GUID=re.compile(rb'guid:\s*([0-9a-fA-F]{32})')
def expanded(spec):
    clips=copy.deepcopy(spec['clips']);beam=spec['beam']
    for part in beam['parts']:
        for phase in beam['phases']:
            clips.append({**{k:v for k,v in beam.items() if k not in ('parts','phases')},**part,**phase,
                          'id':'mystic-beam-'+part['id']+'-'+phase['phase'],'name':'Toon Laser Beam '+part['id'].title()+' '+phase['phase'].title()+' (Mystic)',
                          'part':part['id'],'group':'mystic-beam-'+part['id'],'preserveTimeline':True})
    for clip in clips:clip.setdefault('cell',128);clip.setdefault('columns',16);clip.setdefault('pitch',0)
    return clips
def prepare(source,output):
    output=output.resolve()
    if output.is_relative_to(ROOT.resolve()):raise ValueError('The Unity bake project must stay outside the repository')
    if (output/'Assets').exists():raise ValueError('Choose a fresh bake directory; existing work is preserved')
    spec=json.loads((Path(__file__).with_name('effects.json')).read_text());clips=expanded(spec);provenance=[];written={}
    for package in dict.fromkeys(c['package'] for c in clips):
        package_file=source/package;data=unpack(package_file);by_guid={a['guid']:a for a in data.values()};wanted=[c['prefab'] for c in clips if c['package']==package]
        for name in wanted:
            if name not in data:raise ValueError('Missing requested prefab: '+name)
        queue=list(dict.fromkeys(wanted));seen=set();skipped=set()
        while queue:
            name=queue.pop()
            if name in seen:continue
            seen.add(name);item=data[name];suffix=Path(name).suffix.lower()
            if suffix not in ALLOWED:skipped.add(name);continue
            target=(output/name).resolve()
            if not target.is_relative_to(output/'Assets'):raise ValueError('Unsafe package target: '+name)
            raw=item['asset'];sha=hashlib.sha256(raw).hexdigest()
            if name in written and written[name]!=sha:raise ValueError('Conflicting shared dependency: '+name)
            if name not in written:
                target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(raw)
                if 'asset.meta' in item:Path(str(target)+'.meta').write_bytes(item['asset.meta'])
                written[name]=sha
            if suffix not in ('.png','.jpg','.jpeg','.tga','.tif','.tiff','.psd','.fbx'):
                for guid in GUID.findall(raw):
                    dependency=by_guid.get(guid.decode().lower())
                    if dependency:queue.append(dependency['name'])
            if suffix in ('.shader','.cginc','.hlsl'):
                for include in re.findall(rb'#include\s+"([^"]+)"',raw):
                    include=include.decode();relative=(Path(name).parent/include).as_posix()
                    if relative in data:queue.append(relative)
                    else:
                        matches=[p for p in data if p.endswith('/'+include)]
                        if len(matches)==1:queue.append(matches[0])
        provenance.append({'package':package,'sha256':hashlib.sha256(package_file.read_bytes()).hexdigest(),'dependencies':len(seen),'excluded':sorted(skipped)})
        print(package+': '+str(len(seen))+' dependency references',flush=True);del data,by_guid;gc.collect()
    editor=output/'Assets/Editor';editor.mkdir(parents=True,exist_ok=True)
    for name in ('SkillVfxBaker.cs','SkillVfxBake.shader'):shutil.copyfile(Path(__file__).with_name(name),editor/name)
    settings=output/'ProjectSettings';settings.mkdir(exist_ok=True)
    (settings/'ProjectVersion.txt').write_text('m_EditorVersion: 6000.6.0f1\n')
    (settings/'AudioManager.asset').write_text('%YAML 1.1\n%TAG !u! tag:unity3d.com,2011:\n--- !u!11 &1\nAudioManager:\n  m_ObjectHideFlags: 0\n  serializedVersion: 2\n  m_Volume: 0\n  m_DisableAudio: 1\n')
    packages=output/'Packages';packages.mkdir(exist_ok=True)
    (packages/'manifest.json').write_text(json.dumps({'dependencies':{'com.unity.modules.particlesystem':'1.0.0','com.unity.modules.physics':'1.0.0','com.unity.modules.imageconversion':'1.0.0','com.unity.modules.audio':'1.0.0','com.unity.modules.animation':'1.0.0'}}))
    (output/'jobs.json').write_text(json.dumps({'clips':clips},indent=2))
    (output/'source.json').write_text(json.dumps({'workbookSha256':hashlib.sha256((ROOT/spec['workbook']).read_bytes()).hexdigest(),'packages':provenance,'files':written,'scriptsExecuted':False,'audioImported':False},indent=2))
    return output
if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('packages',type=Path);parser.add_argument('output',type=Path);args=parser.parse_args();print(prepare(args.packages,args.output))
