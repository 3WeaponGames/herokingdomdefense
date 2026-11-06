"""Preserve medal pixels; replace only the separate baked badge captions."""
from pathlib import Path
from PIL import Image
import json, hashlib
root=Path(__file__).resolve().parents[2]
patch={'entries':{},'images':{},'artTemplates':{}}
audit=[]
for name in ['all','all-f','all-r','all-y']:
    original=root/f'assets/imgs/{name}.png'
    im=Image.open(original).convert('RGBA')
    before=im.copy()
    # Only blue caption pixels, including antialiased edges. Gold medal pixels
    # remain intact even where their bounds approach the text region.
    removed=[]
    for y in range(85,im.height):
        for x in range(im.width):
            r,g,b,a=im.getpixel((x,y))
            if a and b>r*1.15 and b>g*1.1:
                im.putpixel((x,y),(0,0,0,0));removed.append((x,y))
    target=f'assets/resources/localization/neutral/tester_{name}.png'
    im.save(root/target)
    changed={(x,y) for y in range(im.height) for x in range(im.width) if before.getpixel((x,y))!=im.getpixel((x,y))}
    assert changed==set(removed)
    template='tester_'+name
    key='art.tester.'+name
    patch['entries'][key]={'en':'Elite\nPlaytester','zh':'超级\n游戏内测员','context':'Tester reward medal caption'}
    patch['artTemplates'][template]={'width':im.width,'height':im.height,'source':target,'sourceOriginal':str(original.relative_to(root)).replace('\\','/'),'pending':False,'regions':[{'key':key,'rect':{'x':8,'y':91,'width':im.width-16,'height':61},'font':'assets/resources/localization/fonts/NotoSansSC-Black.ttf','fontSize':23,'minFontSize':18,'lineHeightRatio':1.08,'padding':0,'color':'#235eaf','outlineWidth':0,'align':'center'}]}
    meta=json.loads(Path(str(original)+'.meta').read_text('utf-8'))
    for frame in meta['subMetas'].values():
        patch['images'][frame['uuid']]={'key':key,'template':template,'source':str(original.relative_to(root)).replace('\\','/'),'artwork':{locale:f'localization/generated/{locale}/{template}' for locale in ['en','zh']}}
    audit.append({'source':str(original.relative_to(root)),'dimensions':im.size,'removedCaptionPixels':len(removed),'outsideMaskChangedPixels':0,'sourceSha256':hashlib.sha256(original.read_bytes()).hexdigest()})
(root/'tools/localization/root-art-entries.json').write_text(json.dumps(patch,ensure_ascii=False,indent=2)+'\n','utf-8')
(root/'local/localization-art-audit/tester-cleanup.json').write_text(json.dumps(audit,indent=2)+'\n','utf-8')
