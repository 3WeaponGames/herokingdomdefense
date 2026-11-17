"""Convert the original CFXR procedural snow particle to a continuous 2D emitter.

No Unity code is executed. The exact source glow equation becomes a small PNG;
source emitter values and their provenance remain in SnowWeatherProfile.
"""
import argparse, hashlib, io, json, math, re, sys
from pathlib import Path
sys.dont_write_bytecode = True
from PIL import Image
ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT/'tools/characters'))
from import_units import Transaction, asset_uuid, texture_meta

PREFIX = 'Assets/JMO Assets/Cartoon FX Remaster'
BASE = PREFIX + '/CFXR Prefabs/Nature/CFXR4 Snow Falling.prefab'
VARIANTS = {
    'weather-snow-light': PREFIX + '/CFXR Prefabs/Nature/Variants/CFXR4 Snow Falling (Light).prefab',
    'weather-snow-dense': PREFIX + '/CFXR Prefabs/Nature/Variants/CFXR4 Snow Falling (Dense).prefab',
}
MATERIAL = PREFIX + '/CFXR Assets/Graphics/cfxr proc glow soft p4 add.mat'
SHADER = PREFIX + '/CFXR Assets/Shaders/CFXR_PASSES.cginc'

def glow(size, power, lower, upper, limit):
    image = Image.new('RGBA', (size, size)); values = []
    for y in range(size):
        for x in range(size):
            u, v = (x+.5)/size-.5, (y+.5)/size-.5
            value = max(0, 1-4*(u*u+v*v)) ** power
            alpha = max(0, min(1, min(limit, max(0, lower+(upper-lower)*value))*min(1, value*30)))
            values.append((255,255,255,round(alpha*255)))
    image.putdata(values); out = io.BytesIO(); image.save(out, format='PNG'); return out.getvalue()

def block(text, name, indent):
    marker = ' '*indent + name + ':\n'; start = text.index(marker)+len(marker)
    match = re.search(r'^ {0,'+str(indent)+r'}\S', text[start:], re.M)
    return text[start:start+match.start()] if match else text[start:]

def number(text, name):
    match = re.search(r'^\s*'+re.escape(name)+r':\s*([-+\deE.]+)\s*$', text, re.M)
    if not match: raise ValueError('Missing source scalar '+name)
    return float(match.group(1))

def overrides(text):
    return {key: float(value) for key,value in re.findall(r'propertyPath: ([\w.]+)\s+value: ([-+\deE.]+)', text)}

def run(source, backups):
    source = source.resolve(); base = (source/BASE).read_text(encoding='utf-8-sig')
    material = (source/MATERIAL).read_text(encoding='utf-8-sig'); shader = (source/SHADER).read_text(encoding='utf-8-sig')
    if '_CFXR_GLOW_POW_P4' not in material or 'glow = pow(glow, 4)' not in shader or 'dot(uvm, uvm) * 4' not in shader:
        raise ValueError('The original procedural snow shader changed')
    floats = dict((key,float(value)) for key,value in re.findall(r'- (_\w+): ([-+\deE.]+)', material))
    particle = block(base, 'InitialModule', 2)
    lifetime = block(particle, 'startLifetime', 4); size = block(particle, 'startSize', 4); speed = block(particle, 'startSpeed', 4)
    color = block(particle, 'startColor', 4); max_color = re.search(r'maxColor: \{r: ([-+\deE.]+),', color)
    base_profile = dict(lifeMin=number(lifetime,'minScalar'),lifeMax=number(lifetime,'scalar'),
                        sizeMin=number(size,'minScalar'),sizeMax=number(size,'scalar'),
                        fallSpeed=number(speed,'scalar'),shapeWidth=10,color=float(max_color.group(1)))
    if base_profile['lifeMin']<=0 or base_profile['lifeMax']<base_profile['lifeMin'] or base_profile['fallSpeed']<=0:
        raise ValueError('Unsupported snow emitter lifetime/speed')
    profiles = {}; sources = [BASE,MATERIAL,SHADER]
    for ident,file in VARIANTS.items():
        variant = (source/file).read_text(encoding='utf-8-sig'); values = overrides(variant)
        profiles[ident] = dict(rate=values['EmissionModule.rateOverTime.scalar'],
                              driftMin=min(values['VelocityModule.x.scalar'],values['VelocityModule.x.minScalar']),
                              driftMax=max(values['VelocityModule.x.scalar'],values['VelocityModule.x.minScalar']))
        sources.append(file)
    raw = glow(128,4,floats['_GlowMin'],floats['_GlowMax'],floats['_MaxValue'])
    relative = 'assets/resources/vfx/weather/snowflake.png'
    profile = dict(version=1, resource='vfx/weather/snowflake',uuid=asset_uuid(relative+'#sprite'),
                   width=128,height=128,sha256=hashlib.sha256(raw).hexdigest(),base=base_profile,profiles=profiles,
                   source=dict(package='Cartoon FX 4 Remaster R 1.5.1.unitypackage',
                               files=[dict(path=file,sha256=hashlib.sha256((source/file).read_bytes()).hexdigest()) for file in sources],
                               conversion='Original P4 procedural glow; continuous 2D gravity particles with source lifetime, size, emission and drift envelope.'))
    tx = Transaction(ROOT,backups); tx.stage(relative,raw); tx.json(relative+'.meta',texture_meta(relative,128,128))
    script = 'assets/_script/SnowWeatherProfile.js'
    tx.stage(script,b'"use strict";\n// Generated from the original CFXR snow material and emitters.\nmodule.exports = '+json.dumps(profile,ensure_ascii=False,indent=2).encode()+b';\n')
    tx.json(script+'.meta',dict(ver='1.1.0',uuid=asset_uuid(script),importer='javascript',isPlugin=False,loadPluginInWeb=True,loadPluginInNative=True,loadPluginInEditor=False,subMetas={}))
    result=dict(profile=profile,transaction=tx.commit());print(json.dumps(result,indent=2));return result

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('source',type=Path);parser.add_argument('backups',type=Path)
    args=parser.parse_args();run(args.source,args.backups)
