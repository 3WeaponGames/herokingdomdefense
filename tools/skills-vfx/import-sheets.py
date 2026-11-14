"""Import the two user-supplied Guardian test sheets into transparent flipbooks.

The originals are white-matted RGB exports. This removes that matte, preserves
enclosed white highlights, and letterboxes each cell without changing proportions.
Originals and publication backups stay outside the project.
"""
import argparse, hashlib, io, json, sys
from pathlib import Path
from PIL import Image, ImageChops, ImageDraw, ImageFilter
import numpy as np

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'tools/characters'))
from import_units import Transaction, asset_uuid, texture_meta

SOURCES = {
    'taunt': ('b0c900eb2ab6272ed2a16eb52469a7acac50629df2c145f34845b8973e1b0ec5', 8, 8),
    'shield': ('21665e8d806aac54a22db7c5b9f2b55b2f5ef006ad095aa01c397028ea23dec6', 7, 7),
}

def unmatte(image, highlight_core=None):
    image = image.convert('RGB')
    channels = image.split()
    minimum = ImageChops.darker(ImageChops.darker(channels[0], channels[1]), channels[2])
    alpha = ImageChops.invert(minimum)
    # Flood only white regions connected to the cell border. Bright details
    # enclosed by the colored emblem remain white rather than becoming holes.
    barrier = alpha.point(lambda n: 255 if n > 30 else 0)
    barrier = barrier.filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.MinFilter(3))
    border = Image.new('L', (image.width + 2, image.height + 2))
    border.paste(barrier, (1, 1)); ImageDraw.floodfill(border, (0, 0), 128)
    inner = border.crop((1, 1, image.width + 1, image.height + 1))
    opacity=np.where(np.asarray(inner)==0,255,np.asarray(alpha)).astype(np.float64)
    if highlight_core:
        # This supplied eye is a white glyph inside a colored circular seal.
        # Preserve its white ink; a color key alone would punch the glyph out.
        x,y,radius=highlight_core;yy,xx=np.ogrid[:image.height,:image.width]
        core=np.clip((radius+8-np.hypot(xx-x,yy-y))/8,0,1)*255
        opacity=np.maximum(opacity,np.rint(core))
    rgb=np.asarray(image,dtype=np.float64)
    foreground=np.rint((rgb-255+opacity[:,:,None])*255/np.maximum(opacity[:,:,None],1))
    rgba=np.dstack((np.clip(foreground,0,255),opacity)).astype(np.uint8)
    return Image.fromarray(rgba)


def cells(path, key):
    expected, columns, rows = SOURCES[key]
    if hashlib.sha256(path.read_bytes()).hexdigest() != expected:
        raise ValueError('The source sheet changed: ' + str(path))
    source = Image.open(path); width, height = source.size
    if width % columns or height % rows: raise ValueError('Non-integral source grid')
    w, h = width // columns, height // rows; size = max(w, h); result = []
    for index in range(columns * rows):
        x, y = index % columns * w, index // columns * h
        cell = Image.new('RGBA', (size, size))
        cell.paste(unmatte(source.crop((x, y, x + w, y + h)), (136,134,34) if key=='taunt' else None), ((size - w) // 2, (size - h) // 2))
        result.append(cell.resize((128, 128), Image.Resampling.LANCZOS))
    return result

def run(taunt, shield, backups):
    tx = Transaction(ROOT, backups); originals = {'taunt': taunt, 'shield': shield}
    images = {key: cells(file, key) for key, file in originals.items()}
    specs = [
        ('guardian-taunt-test', 'Guardian taunt · purple eye', 'taunt', 'once', list(range(60)), 32, False, .632),
        ('guardian-body-shield-start', 'Guardian body shield · appear', 'shield', 'start', list(range(16)), 32, False, .5),
        ('guardian-body-shield-loop', 'Guardian body shield · sustain', 'shield', 'loop', [16,17,18,19,20,21,20,19,18,17], 20, True, .5),
        ('guardian-body-shield-end', 'Guardian body shield · release', 'shield', 'end', list(range(22,42)), 32, False, .5),
    ]
    clips = []
    for ident, name, key, phase, indices, fps, loop, anchor_y in specs:
        atlas = Image.new('RGBA', (1024, ((len(indices)+7)//8)*128))
        for frame, source_index in enumerate(indices): atlas.paste(images[key][source_index], (frame % 8 * 128, frame // 8 * 128))
        buffer = io.BytesIO(); atlas.save(buffer, format='PNG', optimize=True); raw = buffer.getvalue()
        relative = 'assets/resources/vfx/hero-skills/' + ident + '.png'
        tx.stage(relative, raw); tx.json(relative + '.meta', texture_meta(relative, *atlas.size))
        boxes=[images[key][i].getchannel('A').getbbox() for i in indices]; boxes=[b for b in boxes if b]
        bounds=[min(b[0] for b in boxes),min(b[1] for b in boxes),max(b[2] for b in boxes)-1,max(b[3] for b in boxes)-1] if boxes else []
        clips.append(dict(id=ident, name=name, style='guardian', slot=key, phase=phase, group='guardian-body-shield' if key=='shield' else ident,
            loop=loop, frames=len(indices), columns=8, cell=128, fps=fps, anchorX=.5, anchorY=anchor_y, aspect=1,
            alphaBounds=list(bounds) if bounds else [], visibleFrames=sum(bool(images[key][i].getchannel('A').getbbox()) for i in indices),
            kind='flipbook', bundle='resources', resource='vfx/hero-skills/'+ident, uuid=asset_uuid(relative+'#sprite'), sha256=hashlib.sha256(raw).hexdigest(),
            source=dict(kind='user-sheet', file=originals[key].name, sha256=SOURCES[key][0], columns=SOURCES[key][1], rows=SOURCES[key][2], frames=indices)))
    tx.json('tools/skills-vfx/sheet-clips.json', clips)
    relative='assets/resources/vfx/hero-skills/catalog.json'; catalog=json.loads(tx.read(relative))
    catalog['clips']=[c for c in catalog['clips'] if c.get('source',{}).get('kind')!='user-sheet']+clips
    catalog['presets']['guardian'].update(taunt='guardian-taunt-test', shield='guardian-body-shield-loop')
    tx.json(relative,catalog)
    tx.stage('assets/_script/HeroSkillVFXCatalog.js', b'"use strict";\n// Generated VFX atlas metadata; see tools/skills-vfx.\nmodule.exports = '+json.dumps(catalog,ensure_ascii=False,indent=2).encode()+b';\n')
    print(json.dumps({'clips':len(catalog['clips']), 'decodedBytes':sum(c['columns']*c['cell']*((c['frames']+c['columns']-1)//c['columns'])*c['cell']*4 for c in catalog['clips']), 'transaction':tx.commit()},indent=2))

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--taunt',required=True,type=Path);p.add_argument('--shield',required=True,type=Path);p.add_argument('--backups',required=True,type=Path)
    args=p.parse_args();run(args.taunt,args.shield,args.backups)
