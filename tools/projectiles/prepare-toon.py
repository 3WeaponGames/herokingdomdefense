"""Prepare an isolated, silent Unity bake project; never run package scripts.

Usage: python tools/projectiles/prepare-toon.py <unitypackage> <external-folder>
The authored particle materials are captured as transparent 2D sprites for Cocos.
"""
import hashlib
import json
import re
from pathlib import Path
import shutil
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'characters'))
from unity_monsters import unpack

def capture_shader(raw, name):
    """Keep the vendor's Built-in shading, with deterministic RGBA capture.

    Source shaders target an opaque framebuffer (ColorMask RGB). The separate
    alpha blend records coverage for a straight-alpha PNG after unpremultiply.
    Soft depth fade and screen refraction have no 2D background to sample.
    """
    text=raw.decode('utf-8-sig').split('/*ASEBEGIN',1)[0]
    text=re.sub(r'Shader\s+"[^"]+"', 'Shader "Hidden/HKD/'+name+'"',text,count=1)
    text=text.replace('ColorMask RGB','ColorMask RGBA')
    text=re.sub(r'(?m)^(\s*)Blend SrcAlpha OneMinusSrcAlpha\s*$',r'\1Blend SrcAlpha OneMinusSrcAlpha, One OneMinusSrcAlpha',text)
    if name=='Blend_CenterGlow':
        # Shader Graph's shared center-glow material family stores its blend
        # mode per material: 10=alpha, 1=additive. Keep that authored choice.
        text=re.sub(r'(Properties\s*\{)',r'\1\n\t\t_DstBlend("Destination blend", Float) = 10',text,count=1)
        text=text.replace('Blend SrcAlpha OneMinusSrcAlpha, One OneMinusSrcAlpha','Blend One [_DstBlend], One OneMinusSrcAlpha')
        # One * (RGB * alpha) preserves the source RGB blend exactly. Additive
        # black contributes no light, so it must not become opaque black in a
        # standard RGBA sprite. This coverage approximation affects additive
        # layers only; regular alpha materials keep their authored coverage.
        hook='fixed4 col = appendResult87;'
        if hook not in text:raise ValueError('Unsupported center-glow shader fragment')
        text=text.replace(hook,hook+'\n\t\t\t\t\tcol.rgb *= col.a;\n\t\t\t\t\tif (_DstBlend < 1.5) col.a = saturate(max(col.r, max(col.g, col.b)));',1)
        text=text.replace('uniform float _Emission;','uniform float _Emission;\n\t\t\t\tuniform float _DstBlend;')
    text=re.sub(r'\b_Time\b','_HKDCaptureTime',text)
    text=text.replace('CGPROGRAM','CGPROGRAM\n\t\t\t\tfloat4 _HKDCaptureTime;')
    return text

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
    for name in ('Blend_CenterGlow','Blend_TwoSides','DissolveNoise'):
        entry=next((item for path,item in entries.items() if path.endswith('/'+name+'.shader')),None)
        if entry is None:raise ValueError('Missing authored capture shader: '+name)
        (editor/(name+'.shader')).write_text(capture_shader(entry['asset'],name),encoding='utf-8')
    (editor/'InvisibleDistortion.shader').write_text('Shader "Hidden/HKD/InvisibleDistortion" { SubShader { Tags { "Queue"="Transparent" } Pass { ZWrite Off ColorMask 0 } } }\n',encoding='utf-8')
    settings=output/'ProjectSettings';settings.mkdir(exist_ok=True)
    (settings/'ProjectVersion.txt').write_text('m_EditorVersion: 6000.6.0f1\n')
    (settings/'AudioManager.asset').write_text('%YAML 1.1\n%TAG !u! tag:unity3d.com,2011:\n--- !u!11 &1\nAudioManager:\n  m_ObjectHideFlags: 0\n  serializedVersion: 2\n  m_Volume: 0\n  m_DisableAudio: 1\n')
    packages=output/'Packages';packages.mkdir(exist_ok=True)
    (packages/'manifest.json').write_text(json.dumps({'dependencies':{'com.unity.modules.particlesystem':'1.0.0','com.unity.modules.physics':'1.0.0','com.unity.modules.imageconversion':'1.0.0'}}))
    (output/'source.json').write_text(json.dumps({'package':source.name,'sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'conversion':'Alpha-framed, 2x supersampled unlit 2D particle flipbooks using authored Built-in noise, masks, emission, UV animation and Fresnel. Pure additive clips retain additive blending; mixed clips use a normal-alpha approximation. HDR bloom and screen-space refraction are not reproduced.'},indent=2))
    print(output)

if __name__=='__main__':prepare(Path(sys.argv[1]),Path(sys.argv[2]))
