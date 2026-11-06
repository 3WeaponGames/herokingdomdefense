"""Precisely remove baked captions from sibling localization source assets.

Authorized code cleanup: originals remain untouched. Each pixel change is bounded
by a saved mask, and outside-mask RGBA bytes are verified identical.
"""
from pathlib import Path
import hashlib,json
from PIL import Image,ImageDraw,ImageFont
import numpy as np,cv2
ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'assets/resources/localization/neutral'; OUT.mkdir(parents=True,exist_ok=True)
AUDIT=ROOT/'local/localization-art-audit/composite-cleanup'; AUDIT.mkdir(parents=True,exist_ok=True)
records=[]
def load(rel):
    p=ROOT/rel;return p,np.array(Image.open(p).convert('RGBA'))
def rectmask(a,rects):
    m=np.zeros(a.shape[:2],np.uint8)
    for x,y,w,h in rects:m[y:y+h,x:x+w]=255
    return m
def save(name,src,a,b,m,method):
    outside=m==0;changed=np.any(a!=b,axis=2)
    assert np.array_equal(a[outside],b[outside]),name
    Image.fromarray(b).save(OUT/(name+'.png'));Image.fromarray(m).save(AUDIT/(name+'-mask.png'))
    records.append(dict(name=name,source=src.relative_to(ROOT).as_posix(),output=(OUT/(name+'.png')).relative_to(ROOT).as_posix(),size=[a.shape[1],a.shape[0]],method=method,sourceSHA256=hashlib.sha256(src.read_bytes()).hexdigest(),maskPixels=int((m>0).sum()),changedPixels=int(changed.sum()),outsideMaskChangedPixels=int(changed[outside].sum()),outsideMaskSHA256Before=hashlib.sha256(a[outside].tobytes()).hexdigest(),outsideMaskSHA256After=hashlib.sha256(b[outside].tobytes()).hexdigest()))

src,a=load('assets/KinghtFallPrefabs/_res/textures/KinghtFallUIPassport/wg_txz_ct.png')
m=rectmask(a,[(91,194,232,55)]);b=a.copy();b[m>0]=a[220,75]
save('pass',src,a,b,m,'Exact flat ribbon paint sampled from original')

atlas_src,atlas=load('assets/KinghtFallPrefabs/_res/Skeleton/KinghtFallUISignIn/wqyl_day7.png')
plate=np.array(Image.fromarray(atlas).crop((2,2,194,516)).transpose(Image.Transpose.ROTATE_270))
src,a=load('assets/KinghtFallPrefabs/_res/textures/KinghtFallUISignIn/wg_qd_d7.png')
m=rectmask(a,[(48,56,326,94)]);b=a.copy();b[m>0]=plate[m>0]
save('day7',src,a,b,m,'Original clean banner attachment, rotated from same authored Spine atlas')
m=rectmask(atlas,[(196,199,87,317)]);b=atlas.copy();b[m>0]=0
save('day7_atlas',atlas_src,atlas,b,m,'Only separate text attachment cleared; other atlas regions byte-identical')

# The glyph pigments differ from their parchment. Dilated chroma masks remove
# both the glyphs and antialiasing without touching scroll borders or highlights.
specs=[('02',(44,38,36,46),'red'),('04',(49,30,37,59),'light'),('06',(45,39,34,44),'yellow'),('08',(43,37,38,46),'brown'),('09',(42,37,39,47),'white')]
for suffix,rect,kind in specs:
    src,a=load('assets/KinghtFallIconGood/zb_'+suffix+'.png');rgb=a[:,:,:3];r,g,bl=rgb[:,:,0],rgb[:,:,1],rgb[:,:,2]
    if kind=='red':sel=(r>160)&(g<130)&(bl<100)
    elif kind=='light':sel=(r>180)&(g>140)&(bl>110)
    elif kind=='yellow':sel=(r>220)&(g>180)&(bl<150)
    elif kind=='brown':sel=(r<120)&(g<65)&(bl<45)
    else:sel=(r>170)&(g>215)&(bl>215)
    bounds=rectmask(a,[rect]);m=np.zeros(bounds.shape,np.uint8)
    pts=cv2.findNonZero((sel&(bounds>0)).astype(np.uint8));cv2.fillConvexPoly(m,cv2.convexHull(pts),255)
    m=cv2.dilate(m,np.ones((5,5),np.uint8));m[bounds==0]=0
    b=a.copy();repaired=cv2.inpaint(rgb,m,3,cv2.INPAINT_NS);b[m>0,:3]=repaired[m>0]
    save('relic_'+suffix,src,a,b,m,'Glyph pigment mask with one-pixel fringe; local parchment interpolation')

for name,rel,rect in [('age_rating','assets/load/8.png',(18,203,166,39)),('feedback_icon','assets/prefabs/_res/textures/KinghtFallHomeBattleCtrl/fk.png',(4,72,83,18))]:
    src,a=load(rel);m=rectmask(a,[rect]);b=a.copy();b[m>0]=[255,255,255,255]
    save(name,src,a,b,m,'Flat white caption field only; icon and border preserved')

src,a=load('assets/KinghtFallUISideBoard/wg_cbl_cbl.png');b=a.copy();m=np.zeros(a.shape[:2],np.uint8)
# Captions outside the screenshot are on transparency.
for x,y,w,h in [(0,0,400,37),(0,203,440,35),(0,536,330,37)]:
    m[y:y+h,x:x+w]=255;b[y:y+h,x:x+w]=0
# Screenshot labels; only glyph masks are inpainted, maintaining each background.
for x,y,w,h,dark in [(72,116,342,30,False),(42,270,87,33,True),(335,271,65,32,True),(58,352,69,27,True),(339,355,39,24,True),(54,485,101,24,True),(176,485,94,24,True),(300,485,110,24,True)]:
    bounds=rectmask(a,[(x,y,w,h)]);rgb=a[:,:,:3]
    sel=(rgb.max(2)<180) if dark else (rgb.min(2)>180)
    glyph=cv2.dilate((sel&(bounds>0)).astype(np.uint8)*255,np.ones((3,3),np.uint8));glyph[bounds==0]=0
    repair=cv2.inpaint(rgb,glyph,3,cv2.INPAINT_NS);b[glyph>0,:3]=repair[glyph>0];m[glyph>0]=255
save('sidebar_guide',src,a,b,m,'Caption alpha cleanup and individual embedded screenshot glyph masks')

(AUDIT/'pixel-audit.json').write_text(json.dumps(records,ensure_ascii=False,indent=2)+'\n','utf-8')
sheet=Image.new('RGB',(1100,len(records)*190),'#9aa4a4');d=ImageDraw.Draw(sheet);font=ImageFont.truetype('C:/Windows/Fonts/arial.ttf',14)
for i,r in enumerate(records):
    for j,key in enumerate(['source','output']):
        im=Image.open(ROOT/r[key]).convert('RGBA');im.thumbnail((520,160));sheet.paste(im,(j*550,i*190+22),im)
    d.text((4,i*190+2),r['name']+' original / neutral',font=font,fill='#000000')
sheet.save(AUDIT/'before-after.png')
print(json.dumps(dict(outputs=len(records),outsideMaskChangedPixels=sum(r['outsideMaskChangedPixels'] for r in records))))
