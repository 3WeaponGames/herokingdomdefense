"""Prepare an isolated, silent Unity bake project; never run package scripts.

Usage: python tools/projectiles/prepare-toon.py <unitypackage> <external-folder>
The 3D particle materials are adapted to transparent unlit sprites for Cocos.
"""
import hashlib
import json
from pathlib import Path
import shutil
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'characters'))
from unity_monsters import unpack

def prepare(source, output):
    output=output.resolve()
    if output.is_relative_to(Path(__file__).resolve().parents[2]):
        raise ValueError('Bake project must be outside the repository')
    if output.exists() and any(output.iterdir()):
        raise ValueError('Use a fresh bake folder; existing work is never replaced')
    entries=unpack(source)
    seen=set()
    for name in entries:
        # Unity pathnames use '/' even on Windows. A backslash or colon can
        # otherwise escape the bake directory or create an alternate stream.
        if any(character in name for character in '\\:<>"|?*') or any(ord(character)<32 for character in name) or any(part.endswith(('.', ' ')) for part in name.split('/')):
            raise ValueError('Unsafe Unity asset path: '+name)
        if name.casefold() in seen:raise ValueError('Duplicate Unity asset path on Windows: '+name)
        seen.add(name.casefold())
        if not (output/name).resolve().is_relative_to(output):
            raise ValueError('Unity asset leaves bake directory: '+name)
    for name,item in entries.items():
        if Path(name).suffix.lower() not in ('.prefab','.png','.mat','.fbx'):
            continue
        target=output/name;target.parent.mkdir(parents=True,exist_ok=True)
        target.write_bytes(item['asset'])
        if 'asset.meta' in item:Path(str(target)+'.meta').write_bytes(item['asset.meta'])
    editor=output/'Assets/Editor';editor.mkdir(parents=True,exist_ok=True)
    for name in ('ToonBaker.cs','ParticleBake.shader'):shutil.copyfile(Path(__file__).parent/name,editor/name)
    settings=output/'ProjectSettings';settings.mkdir(exist_ok=True)
    (settings/'ProjectVersion.txt').write_text('m_EditorVersion: 6000.6.0f1\n')
    (settings/'AudioManager.asset').write_text('%YAML 1.1\n%TAG !u! tag:unity3d.com,2011:\n--- !u!11 &1\nAudioManager:\n  m_ObjectHideFlags: 0\n  m_Volume: 0\n  m_DisableAudio: 1\n')
    packages=output/'Packages';packages.mkdir(exist_ok=True)
    (packages/'manifest.json').write_text(json.dumps({'dependencies':{'com.unity.modules.particlesystem':'1.0.0','com.unity.modules.physics':'1.0.0','com.unity.modules.imageconversion':'1.0.0'}}))
    (output/'source.json').write_text(json.dumps({'package':source.name,'sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'conversion':'Unlit 2D particle flipbooks; Unity shader graph distortion/lighting are not reproduced.'},indent=2))
    print(output)

if __name__=='__main__':prepare(Path(sys.argv[1]),Path(sys.argv[2]))
