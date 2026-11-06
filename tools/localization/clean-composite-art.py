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
specs=[('02',(44,38,36,46),'red'),('04',(49,30,37,59),'light'),('06',(45,39,34,44),'yellow'),('08',(43,37,38,46),'brown'),('09',(45,40,33,40),'white')]
for suffix,rect,kind in specs:
    src,a=load('assets/KinghtFallIconGood/zb_'+suffix+'.png');rgb=a[:,:,:3];r,g,bl=rgb[:,:,0],rgb[:,:,1],rgb[:,:,2]
    if kind=='red':sel=(r>160)&(g<145)&(bl>20)&(bl<130)
    elif kind=='light':sel=(r>180)&(g>140)&(bl>110)
    elif kind=='yellow':sel=(r>220)&(g>180)&(bl<150)
    elif kind=='brown':sel=(r>20)&(r<145)&(g<80)&(bl<60)
    else:sel=(r>170)&(g>215)&(bl>215)
    bounds=rectmask(a,[rect]);m=np.zeros(bounds.shape,np.uint8)
    if suffix=='08':
        bounds[:]=0;cv2.fillPoly(bounds,[np.array([(54,31),(82,41),(68,84),(43,74),(49,48)],np.int32)],255)
    if suffix=='09':
        # The cyan border is one large connected component; the white glyph is
        # several small interior components. Never include the border in repair.
        count,labels,stats,centers=cv2.connectedComponentsWithStats(sel.astype(np.uint8))
        selected=np.zeros(sel.shape,np.uint8)
        for label in range(1,count):
            x,y,w,h,area=stats[label];cx,cy=centers[label]
            if w<40 and h<45 and 43<cx<80 and 39<cy<84:selected[labels==label]=255
        m=selected
    else:m=(sel&(bounds>0)).astype(np.uint8)*255
    m=cv2.dilate(m,np.ones((5,5),np.uint8));m[bounds==0]=0
    if suffix=='02':m[(g>215)&(bl>145)]=0
    if suffix=='06':m[(g>180)&(bl>170)]=0
    if suffix=='08':m[(r>210)&(g>160)]=0
    if suffix=='09':
        for label in range(1,count):
            if stats[label][2]>=40 or stats[label][3]>=45:m[labels==label]=0
        # Two detached blue outline pixels sit just outside the white glyph's
        # component bounds. Include their tiny neighborhoods, retaining cyan rim.
        for px,py in [(78,58),(44,78)]:
            for dy in range(-1,2):
                for dx in range(-1,2):
                    if r[py+dy,px+dx]<80 and g[py+dy,px+dx]<190:m[py+dy,px+dx]=255
    # Fit the smooth local paper paint from untouched neighboring surface pixels.
    # This keeps the original highlight/gradient; only the pigment stroke mask
    # changes, avoiding rectangular fills and preserving the inner paper border.
    if suffix=='02':paper=(r>240)&(g>160)&(g<225)&(bl>35)&(bl<170)
    elif suffix=='04':paper=(r>40)&(r<125)&(g>20)&(g<100)&(bl>10)&(bl<85)
    elif suffix=='06':paper=(r>235)&(g>45)&(g<165)&(bl>20)&(bl<130)
    elif suffix=='08':paper=(r>150)&(r<210)&(g>80)&(g<135)&(bl>50)&(bl<100)
    else:paper=(r>15)&(r<65)&(g>105)&(g<180)&(bl>165)&(bl<245)
    near=cv2.dilate(bounds,np.ones((9,9),np.uint8))>0
    samples=paper&near&(m==0)&(a[:,:,3]>240)
    yy,xx=np.indices(m.shape);sx=(xx-64)/32;sy=(yy-64)/32
    design=np.stack([np.ones(sx.shape),sx,sy,sx*sx,sx*sy,sy*sy],axis=2)
    coefficients=np.linalg.lstsq(design[samples],rgb[samples].astype(float),rcond=None)[0]
    paint=design@coefficients
    paint=np.clip(paint,np.percentile(rgb[samples],2,axis=0),np.percentile(rgb[samples],98,axis=0)).astype(np.uint8)
    b=a.copy();b[m>0,:3]=paint[m>0]
    save('relic_'+suffix,src,a,b,m,'Pigment stroke mask and fitted original local parchment gradient; border excluded')

for name,rel,rect in [('age_rating','assets/load/8.png',(18,203,166,39)),('feedback_icon','assets/prefabs/_res/textures/KinghtFallHomeBattleCtrl/fk.png',(4,72,83,18))]:
    src,a=load(rel);m=rectmask(a,[rect]);b=a.copy();b[m>0]=[255,255,255,255]
    save(name,src,a,b,m,'Flat white caption field only; icon and border preserved')

src,a=load('assets/KinghtFallUISideBoard/wg_cbl_cbl.png');b=a.copy();m=np.zeros(a.shape[:2],np.uint8)
# Captions outside the screenshot are on transparency.
for x,y,w,h in [(0,0,400,37),(0,203,440,35),(0,536,330,37)]:
    m[y:y+h,x:x+w]=255;b[y:y+h,x:x+w]=0
# Screenshot caption fields have plain backgrounds. Continue each measured row's
# edge colors through the lettering field, including antialiasing fringes.
for x,y,w,h in [(72,114,345,38),(42,270,87,33),(335,271,65,32),(58,352,69,27),(339,355,39,24),(54,485,101,24),(176,485,94,24),(300,485,110,24)]:
    for row in range(y,y+h):
        samples=np.concatenate((a[row,x-4:x,:3],a[row,x+w:x+w+4,:3]),axis=0)
        paint=np.median(samples,axis=0).astype(np.uint8)
        if x==54 and y==485:paint=np.array([255,255,255],np.uint8)
        b[row,x:x+w,:3]=paint
    m[y:y+h,x:x+w]=255
save('sidebar_guide',src,a,b,m,'Caption alpha cleanup and measured screenshot background row reconstruction')

(AUDIT/'pixel-audit.json').write_text(json.dumps(records,ensure_ascii=False,indent=2)+'\n','utf-8')
sheet=Image.new('RGB',(1100,len(records)*190),'#9aa4a4');d=ImageDraw.Draw(sheet);font=ImageFont.truetype('C:/Windows/Fonts/arial.ttf',14)
for i,r in enumerate(records):
    for j,key in enumerate(['source','output']):
        im=Image.open(ROOT/r[key]).convert('RGBA');im.thumbnail((520,160));sheet.paste(im,(j*550,i*190+22),im)
    d.text((4,i*190+2),r['name']+' original / neutral',font=font,fill='#000000')
sheet.save(AUDIT/'before-after.png')
print(json.dumps(dict(outputs=len(records),outsideMaskChangedPixels=sum(r['outsideMaskChangedPixels'] for r in records))))
