"""Build read-only contact sheets for localization artwork review."""
import json, hashlib
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'local/localization-art-audit'
OUT.mkdir(parents=True, exist_ok=True)
files = sorted([p for p in (ROOT/'assets').rglob('*') if p.suffix.lower() in ('.png','.jpg','.jpeg')])
font = ImageFont.truetype('C:/Windows/Fonts/arial.ttf', 13)
rows=[]
for i,p in enumerate(files):
    im=Image.open(p)
    meta=json.loads(Path(str(p)+'.meta').read_text('utf-8-sig'))
    rows.append({'index':i,'path':p.relative_to(ROOT).as_posix(),'size':list(im.size),'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'frames':{k:v.get('uuid') for k,v in meta.get('subMetas',{}).items()}})
for page in range((len(files)+47)//48):
    sheet=Image.new('RGB',(1200,1600),'#ddd8cf'); draw=ImageDraw.Draw(sheet)
    for j in range(48):
        i=page*48+j
        if i>=len(files): break
        x=(j%6)*200; y=(j//6)*200
        im=Image.open(files[i]).convert('RGBA'); im.thumbnail((190,151))
        sheet.paste(im,(x+(200-im.width)//2,y+(155-im.height)//2),im)
        draw.text((x+3,y+156),f'{i}: {files[i].name[:26]}',fill='#111',font=font)
        draw.text((x+3,y+173),files[i].parent.name[:26],fill='#333',font=font)
    sheet.save(OUT/f'sheet-{page:02}.jpg',quality=92)
(OUT/'inventory.json').write_text(json.dumps(rows,ensure_ascii=False,indent=2),'utf-8')
print(json.dumps({'images':len(files),'sheets':(len(files)+47)//48,'output':str(OUT)}))
