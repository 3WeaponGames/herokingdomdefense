"""Deterministic 2D attack particles and native ports of the supplied emitters.

Particles are ordinary Spine regions/bones. They use the animation's clock,
including native playback speed, cancellation and pause; no combat RNG is used.
"""
import copy
import hashlib
import io
import math
import random

from PIL import Image, ImageDraw
from unity_monsters import documents, sample

VERSION=1
AMBIENT='__fx_ambient'
PALETTES={'fire':'ff9b50','frost':'9deaff','venom':'a2e84f','arcane':'cb9bff','holy':'ffe18c','metal':'b8e1f2','earth':'d6b393'}


def texture_images(images,sheets):
    sheet_id=hashlib.md5(b'hkd-fantasy-particles-v1').hexdigest()
    page=Image.new('RGBA',(160,32));result={}
    for index,name in enumerate(['spark','chip','drop','flame','mote']):
        sprite=Image.new('RGBA',(32,32));draw=ImageDraw.Draw(sprite)
        if name=='spark':draw.polygon([(16,1),(20,12),(30,16),(20,20),(16,31),(12,20),(1,16),(12,12)],fill='white',outline='#342f38',width=2)
        elif name=='chip':draw.polygon([(5,10),(22,5),(28,19),(19,28),(7,24)],fill='white',outline='#342f38',width=2)
        elif name=='drop':draw.polygon([(16,2),(7,13),(4,20),(7,27),(16,30),(25,27),(28,20),(24,12)],fill='white',outline='#342f38',width=2)
        elif name=='flame':draw.polygon([(16,1),(20,11),(26,6),(29,20),(25,28),(16,31),(6,27),(3,19),(10,9),(11,18)],fill='white',outline='#342f38',width=2)
        else:
            # The source emitter references an external Unity particle material.
            # A neutral circular billboard retains its authored color/alpha.
            draw.ellipse((4,4,28,28),fill='white')
        page.paste(sprite,(index*32,0));guid=hashlib.md5(('hkd-fantasy-fx:'+name).encode()).hexdigest();result[name]=guid
        images[guid]=dict(image=sprite,width=32,height=32,pivot=dict(x=.5,y=.5),ppu=100,region='u_'+guid,spriteName='FX_'+name,sheet=sheet_id,rect=dict(x=index*32,y=0,width=32,height=32),fileId='generated:'+name,source='generated/fantasy-particles',generated=True)
    buffer=io.BytesIO();page.save(buffer,format='PNG');sheets[sheet_id]=dict(asset=buffer.getvalue(),width=160,height=32)
    return result


def style(model):
    name=model['id'].split('/')[-1].lower();family=model['family']
    if family=='Dragons':
        return next((value for key,value in [('ice','frost'),('emerald','venom'),('green','venom'),('golden','holy'),('black','arcane'),('purple','arcane'),('mechanical','metal'),('grey','metal')] if key in name),'fire')
    if any(key in name for key in ['ice','winter','frost','crystal']):return 'frost'
    if any(key in name for key in ['mossqueen','bugqueen','greenparasite','greenscorpion','cavecaterpillar']):return 'venom'
    if any(key in name for key in ['volcano','demon','fire']):return 'fire'
    if any(key in name for key in ['mechanical','dreadnought','juggernaut','punisher']):return 'metal'
    if 'evil' in name or 'dark' in name:return 'arcane'
    return 'earth'


def matrices(rig):
    result={}
    for bone in rig['bones']:
        angle=math.radians(bone.get('rotation',0));a=math.cos(angle)*bone.get('scaleX',1);b=math.sin(angle)*bone.get('scaleX',1);c=-math.sin(angle)*bone.get('scaleY',1);d=math.cos(angle)*bone.get('scaleY',1);x=bone.get('x',0);y=bone.get('y',0)
        if bone.get('parent'):
            pa,pb,pc,pd,px,py=result[bone['parent']];a,b,c,d,x,y=pa*a+pc*b,pb*a+pd*b,pa*c+pc*d,pb*c+pd*d,pa*x+pc*y+px,pb*x+pd*y+py
        result[bone['name']]=(a,b,c,d,x,y)
    return result


def duration(clip):
    if isinstance(clip,dict):return max([float(clip.get('time',0))]+[duration(value) for value in clip.values() if isinstance(value,(list,dict))])
    return max([0]+[duration(value) for value in clip if isinstance(value,(list,dict))])


def particle(rig,textures,name,parent,shape,scale=1):
    bone='__fx/'+name;slot=bone
    rig['bones'].append(dict(name=bone,parent=parent))
    rig['slots'].append(dict(name=slot,bone=bone,attachment='particle',color='ffffff00'))
    attachment=dict(path='u_'+textures[shape],width=32,height=32,scaleX=scale,scaleY=scale)
    for skin in rig['skins']:skin['attachments'][slot]={'particle':copy.deepcopy(attachment)}
    return bone,slot


def anchor(rig,model):
    if model['family']=='Dragons':
        slot=next(slot for slot in rig['slots'] if slot['name'].endswith('/Head'))
        item=rig['skins'][0]['attachments'][slot['name']][slot['attachment']]
        return slot['bone'],item.get('x',0)-item['width']*.14,item.get('y',0)-item['height']*.10
    candidates=[slot for slot in rig['slots'] if slot.get('attachment') and not slot.get('color','ffffffff').endswith('00') and slot['name'].endswith('/Weapon')]
    if candidates:
        slot=candidates[-1];item=rig['skins'][0]['attachments'][slot['name']][slot['attachment']]
        return slot['bone'],item.get('x',0),item.get('y',0)
    bone=next((bone for bone in rig['bones'] if bone['name'].endswith(('/AnchorWeapon','/WeaponAnchor'))),None)
    return (bone['name'],0,0) if bone else ('__root',0,80)


def add_attacks(model,textures):
    rig=model['rig'];meta=rig['_fantasy'];palette=style(model);tint=PALETTES[palette]
    if 'attack' in model.get('animationAliases',[]):return dict(version=VERSION,style=palette,attacks=[])
    parent,x,y=anchor(rig,model);matrix=matrices(rig)[parent];factor=max(.001,math.sqrt(abs(matrix[0]*matrix[3]-matrix[1]*matrix[2])))
    root='__fx/emitter';rig['bones'].append(dict(name=root,parent=parent,x=x,y=y,scaleX=1/factor,scaleY=1/factor))
    shots=[];count=16 if model['pack']=='fantasy-bosses' else 10
    generator=random.Random(int(hashlib.sha256(model['id'].encode()).hexdigest()[:12],16))
    shape={'fire':'flame','frost':'chip','venom':'drop','arcane':'spark','holy':'spark','metal':'spark','earth':'chip'}[palette]
    pieces=[]
    for index in range(count):pieces.append((*particle(rig,textures,'attack-'+str(index),root,shape),generator.random(),generator.random(),generator.random()))
    for action,clip in rig['animations'].items():
        if action in ['hit',AMBIENT]:continue
        slots=clip.setdefault('slots',{})
        for bone,slot,_,_,_ in pieces:slots[slot]={'color':[dict(time=0,color=tint+'00')]}
        if not action.startswith('attack') and action!='fire':continue
        end=duration(clip);events=[e['time'] for e in clip.get('events',[]) if e['name']=='attack'];at=events[0] if events else end*.5
        life=min(.32,max(.02,end-at-1e-5));shots.append(dict(animation=action,at=at,anchor=parent,count=count,reference='authored attack event' if events else 'saved eventless midpoint'))
        for index,(bone,slot,a,b,c) in enumerate(pieces):
            birth=at+(index/max(1,count-1))*min(.10,life*.4) if model['family']=='Dragons' else at
            particle_life=min(life,end-birth-1e-5)
            reach=rig['skeleton']['height']*(.2+.2*a);angle=math.pi+(b-.5)*(1.2 if palette in ['fire','venom'] else 2.8)
            vx,vy=math.cos(angle)*reach,math.sin(angle)*reach;size=(.12+.16*c)*(1.3 if model['pack']=='fantasy-bosses' else 1)
            times=[birth,birth+particle_life*.15,birth+particle_life*.55,birth+particle_life]
            clip.setdefault('bones',{})[bone]=dict(translate=[dict(time=t,x=round(vx*f,5),y=round(vy*f-12*f*f,5)) for t,f in zip(times,[0,.15,.55,1])],rotate=[dict(time=birth,angle=360*a),dict(time=birth+particle_life,angle=360*a+(c-.5)*200)],scale=[dict(time=0,x=.001,y=.001),dict(time=birth,x=size*.35,y=size*.35),dict(time=times[1],x=size,y=size),dict(time=times[-1],x=.001,y=.001)])
            slots[slot]['color']=[dict(time=0,color=tint+'00'),dict(time=birth,color=tint+'00'),dict(time=times[1],color=tint+'f0'),dict(time=times[2],color=tint+'b0'),dict(time=times[-1],color=tint+'00')]
    result=dict(version=VERSION,style=palette,attacks=shots)
    if model['family']=='Dragons':result['projectile']=dict(flight='fantasy:'+palette+'-flight',launch='fantasy:'+palette+'-impact',impact='fantasy:'+palette+'-impact',size=64)
    return result


def add_ambient(model,prefab,textures):
    docs=documents(prefab['asset']);systems=[value for kind,value in docs.values() if kind==198 and value.get('playOnAwake') and value.get('looping')]
    if not systems:return
    if len(systems)!=1:raise ValueError('Unsupported multiple source emitters in '+prefab['name'])
    source=systems[0];rig=model['rig'];parent=next(bone['name'] for bone in rig['bones'] if bone['name'].endswith('/Particles'))
    if source['ShapeModule']['type']!=10:raise ValueError('Unsupported source particle shape')
    initial=source['InitialModule'];period=source['lengthInSec'];maximum=min(32,initial['maxNumParticles']);rate=source['EmissionModule']['rateOverTime']['scalar'];color=initial['startColor']['maxColor'];rgb=''.join(f'{round(color[channel]*255):02x}' for channel in ['r','g','b'])
    life_min,life_max=initial['startLifetime']['minScalar'],initial['startLifetime']['scalar'];speed=initial['startSpeed']['scalar']*100;radius=source['ShapeModule']['radius']['value']*100;gravity=-981*initial['gravityModifier']['scalar']
    size_min,size_max=initial['startSize']['minScalar']*100,initial['startSize']['scalar']*100
    gradient=source['ColorModule']['gradient']['maxGradient'];alpha=sorted([(gradient['atime'+str(i)]/65535,gradient['key'+str(i)]['a']) for i in range(gradient['m_NumAlphaKeys'])])
    def opacity(age):
        for (a,av),(b,bv) in zip(alpha,alpha[1:]):
            if age<=b:return av+(bv-av)*max(0,(age-a)/(b-a))
        return alpha[-1][1]
    clip=dict(bones={},slots={});generator=random.Random(314159)
    if math.ceil(rate*period)>128:raise ValueError('Source emitter exceeds the native particle budget')
    plan=[]
    for index in range(math.ceil(rate*period)):
        birth=index/rate;life=generator.uniform(life_min,life_max);candidate=plan+[(birth,life)]
        # Unity drops births when maxParticles is reached. Check the cyclic
        # steady state too, so the baked loop has no seam or population spike.
        if all(sum((time-start)%period<end for start,end in candidate)<=maximum for time,_ in candidate):plan.append((birth,life))
    for index,(birth,life) in enumerate(plan):
        bone,slot=particle(rig,textures,'ambient-'+str(index),parent,'mote');angle=generator.random()*math.tau;distance=radius*math.sqrt(generator.random());x=math.cos(angle)*distance;y=math.sin(angle)*distance;size=generator.uniform(size_min,size_max)/32
        samples=sorted(set([0,period]+[round(birth+k*period+life*f,7) for k in [-1,0] for f in [i/30 for i in range(31)] if 0<=birth+k*period+life*f<=period]))
        positions=[];scales=[];colors=[]
        for time in samples:
            age=(time-birth)%period;f=min(1,age/life);active=age<life
            positions.append(dict(time=time,x=x+math.cos(angle)*speed*age,y=y+math.sin(angle)*speed*age+gravity*age*age/2))
            value=sample(source['SizeModule']['curve']['maxCurve']['m_Curve'],f)*size if active else .001
            scales.append(dict(time=time,x=value,y=value));colors.append(dict(time=time,color=rgb+f'{round(max(0,min(1,opacity(f) if active else 0))*255):02x}'))
        clip['bones'][bone]=dict(translate=positions,scale=scales);clip['slots'][slot]=dict(color=colors)
        for action,animation in rig['animations'].items():
            if action!='hit':animation.setdefault('slots',{})[slot]=dict(color=[dict(time=0,color=rgb+'00')])
    rig['animations'][AMBIENT]=clip
    rig['_fantasy']['effects'].update(ambientAnimation=AMBIENT,ambientSlots=list(clip['slots']),sourceEmitter=dict(shape='circle',duration=period,rate=rate,maxParticles=maximum,lifetime=[life_min,life_max],color=color,source=prefab['name']))


def augment(model,prefab,images,sheets,textures):
    model['rig']['_fantasy']['effects']=add_attacks(model,textures)
    add_ambient(model,prefab,textures)


def projectile_sheets():
    """Finite native flipbooks for the existing projectile presentation system."""
    result=[];cell=96;frames=16;columns=4
    for style_name,tint in PALETTES.items():
        rgb=tuple(bytes.fromhex(tint))
        for action in ['flight','impact']:
            page=Image.new('RGBA',(cell*columns,cell*4))
            for index in range(frames):
                picture=Image.new('RGBA',(cell,cell));draw=ImageDraw.Draw(picture);phase=index/frames
                if action=='flight':
                    for n in range(5):
                        x=60-n*9;y=48+math.sin(phase*math.tau+n)*3;radius=11-n*1.5;draw.ellipse((x-radius,y-radius,x+radius,y+radius),fill=rgb+(max(0,255-n*45),),outline=(42,35,45,max(0,255-n*45)),width=2)
                    draw.ellipse((53,41,66,54),fill=(255,250,220,255))
                else:
                    rng=random.Random(90210)
                    for n in range(14):
                        angle=rng.random()*math.tau;distance=(10+rng.random()*30)*phase;x=48+math.cos(angle)*distance;y=48+math.sin(angle)*distance;radius=(2+rng.random()*5)*math.sin(math.pi*min(1,phase*1.1));alpha=round(255*(1-phase)**1.3)
                        draw.ellipse((x-radius,y-radius,x+radius,y+radius),fill=rgb+(alpha,),outline=(42,35,45,alpha),width=1)
                page.paste(picture,(index%columns*cell,index//columns*cell))
            buffer=io.BytesIO();page.save(buffer,format='PNG');result.append((style_name,action,buffer.getvalue(),dict(cell=cell,columns=columns,frames=frames,fps=32,size=64)))
    return result
