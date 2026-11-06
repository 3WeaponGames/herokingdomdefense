"""User-authorized precise cleanup of baked text; original assets stay untouched.

Only the twelve construction tiles and the settlement text regions are handled.
Every pixel outside a recorded lettering mask must remain byte-identical.
Run with Pillow, numpy, opencv-python-headless. No generative image edits.
"""
from pathlib import Path
import json, hashlib
import numpy as np
from PIL import Image, ImageDraw, ImageFont
import cv2

ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'assets/resources/localization/neutral'
AUDIT=ROOT/'local/localization-art-audit/field-cleanup'
OUT.mkdir(parents=True,exist_ok=True);AUDIT.mkdir(parents=True,exist_ok=True)
records=[]
def save_result(name,src,before,after,mask):
    # The mask includes the exact reconstruction region, including stroke pixels.
    assert np.array_equal(before[mask==0],after[mask==0]),name+' modified pixels outside mask'
    # Transparent atlas lettering and text overlapping a tile's edge may change
    # alpha inside the explicit mask; every outside-mask channel remains exact.
    dest=OUT/(name+'.png')
    Image.fromarray(after).save(dest)
    Image.fromarray(mask).save(AUDIT/(name+'-mask.png'))
    changed=np.any(before!=after,axis=2)
    ys,xs=np.where(mask>0)
    records.append({'name':name,'source':src.relative_to(ROOT).as_posix(),'output':dest.relative_to(ROOT).as_posix(),'size':[before.shape[1],before.shape[0]],'sourceSHA256':hashlib.sha256(src.read_bytes()).hexdigest(),'changedPixels':int(changed.sum()),'maskPixels':int((mask>0).sum()),'outsideMaskChangedPixels':int(changed[mask==0].sum()),'outsideMaskSHA256Before':hashlib.sha256(before[mask==0].tobytes()).hexdigest(),'outsideMaskSHA256After':hashlib.sha256(after[mask==0].tobytes()).hexdigest(),'maskBounds':[int(xs.min()),int(ys.min()),int(xs.max()+1),int(ys.max()+1)]})

for base in ['by','cq','fw','jt','mf','zc']:
    for suffix in ['','_']:
        name='tile_'+base+suffix
        src=ROOT/('assets/KinghtFallIconMap/com/Bottom/wg_jzbs_'+base+suffix+'.png')
        original=np.array(Image.open(src).convert('RGBA'))
        # Only the lettering is white: the tile and building silhouettes are olive.
        rgb=original[:,:,:3]
        white=(np.min(rgb,axis=2)>195)&((np.max(rgb,axis=2).astype(int)-np.min(rgb,axis=2))<24)&(original[:,:,3]>128)
        mask=np.zeros(white.shape,dtype=np.uint8)
        points=cv2.findNonZero(white.astype(np.uint8))
        cv2.fillConvexPoly(mask,cv2.convexHull(points),255)
        mask=cv2.dilate(mask,np.ones((7,7),np.uint8))
        # Protect transparency and the tile perimeter; lettering is wholly interior.
        mask[original[:,:,3]==0]=0
        # Reconstruct the flat silhouettes by continuing their observed geometric
        # edges. Diffusion cannot distinguish dark letter outlines from the icon;
        # it produced unacceptable dark islands. These per-family paths replace
        # only the occluded area, never the visible original illustration.
        colors,counts=np.unique(rgb[(mask==0)&(original[:,:,3]==255)].reshape(-1,3),axis=0,return_counts=True)
        palette=colors[np.argsort(counts)[-2:]].astype(np.int32)
        dark=int(np.argmin(palette.sum(axis=1)))
        paths={
          'by':[[(87,14),(100,27),(94,68),(103,68),(103,74),(90,74),(90,81),(82,81),(82,74),(72,74),(72,68),(80,68),(74,26)]],
          'cq':[[(42,56),(53,51),(61,56),(73,49),(65,44),(76,39),(85,44),(97,37),(90,32),(100,27),(134,44),(79,76)]],
          'fw':[[(43,49),(48,44),(55,48),(53,32),(116,33),(110,37),(134,50),(100,70),(87,63),(79,69),(62,61),(55,63),(55,56)]],
          'jt':[[(37,46),(45,41),(53,46),(61,42),(54,38),(59,34),(68,38),(76,34),(69,29),(76,25),(91,33),(92,41),(120,56),(98,68),(65,52),(49,52)]],
          'mf':[[(39,44),(73,44),(73,26),(86,26),(86,44),(119,44),(119,51),(86,51),(86,67),(73,67),(73,51),(39,51)]],
          'zc':[[(63,39),(79,39),(101,51),(110,45),(100,44),(92,41),(109,32),(123,41),(118,45),(130,51),(94,73),(87,69),(78,73),(64,65),(57,67),(52,63),(66,55),(72,57),(76,63),(86,59),(65,47)]]
        }
        holes={'fw':[[(86,56),(99,48),(113,56),(100,64)]], 'jt':[[(76,51),(78,47),(86,46),(96,51),(99,55),(88,62),(78,56)]], 'mf':[[(72,47),(75,44),(83,44),(87,47),(83,50),(75,50)]]}
        silhouette=np.zeros(mask.shape,np.uint8)
        def points(p): return np.array([(170-x,y) if suffix else (x,y) for x,y in p],np.int32)
        for p in paths[base]:cv2.fillPoly(silhouette,[points(p)],255)
        for p in holes.get(base,[]):cv2.fillPoly(silhouette,[points(p)],0)
        after=original.copy();after[mask>0,:3]=palette[1-dark].astype(np.uint8)
        after[(mask>0)&(silhouette>0),:3]=palette[dark].astype(np.uint8)
        # Letter strokes cover part of the outer rim. Reconstruct that rim from
        # this tile's own alpha contour; opposite variants have different corner
        # geometry and cannot supply aligned edge pixels.
        distance=cv2.distanceTransform((original[:,:,3]>0).astype(np.uint8),cv2.DIST_L2,5)
        rim=(mask>0)&(distance<=2.2)&(original[:,:,3]>0)
        after[rim,:3]=0
        save_result(name,src,original,after,mask)

src=ROOT/'assets/KinghtFallPrefabs/_res/Skeleton/KinghtFallUIGameEnd/wqyl_settlement.png'
original=np.array(Image.open(src).convert('RGBA'));after=original.copy();mask=np.zeros(original.shape[:2],dtype=np.uint8)
# These two atlas regions contain only the white outlined title letters.
# Bounds come directly from wqyl_settlement.atlas; all other animation art is retained.
for x,y,w,h in [(1436,82,125,69),(1436,153,127,70)]:
    mask[y:y+h,x:x+w]=255;after[y:y+h,x:x+w]=0
save_result('settlement_atlas',src,original,after,mask)
(AUDIT/'pixel-audit.json').write_text(json.dumps(records,ensure_ascii=False,indent=2)+'\n','utf-8')
# Inspection contact sheet, not a production asset.
sheet=Image.new('RGB',(720,6*150),'#d2d7cf');draw=ImageDraw.Draw(sheet);font=ImageFont.truetype('C:/Windows/Fonts/arial.ttf',12)
for i,r in enumerate(records[:12]):
    x=(i%2)*360;y=(i//2)*150
    for j,key in enumerate(['source','output']):
        im=Image.open(ROOT/r[key]).convert('RGBA');sheet.paste(im,(x+j*175,y+20),im)
    draw.text((x+2,y+122),r['name']+'  original / cleaned',fill='#222222',font=font)
sheet.save(AUDIT/'tiles-before-after.png')
print(json.dumps({'outputs':len(records),'outsideMaskChangedPixels':sum(r['outsideMaskChangedPixels'] for r in records),'audit':str(AUDIT/'pixel-audit.json')}))
