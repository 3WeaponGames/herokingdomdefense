"""Import Fantasy Monsters' sliced, layered Unity rigs without running Unity code.

Source sheets, pivots, expression events and compatible outfit parts are kept.
Backups, diagnostics and previews belong outside the project.
"""
import argparse
import copy
import hashlib
import io
import json
from pathlib import Path
import re

import yaml
from PIL import Image
from import_units import Transaction, asset_uuid, digest, texture_meta, _planned_read
from unity_monsters import unpack, documents, asset_meta, convert_prefab
import fantasy_effects
import fantasy_atlas


def key(guid, file_id):
    return hashlib.md5((guid+':'+str(file_id)).encode()).hexdigest()


def slices(entries,needed):
    images, references, sheets = {}, {}, {}
    for name, entry in entries.items():
        if not name.lower().endswith('.png') or entry['guid'] not in needed:
            continue
        meta=asset_meta(entry).get('TextureImporter', {}); image=Image.open(io.BytesIO(entry['asset'])).convert('RGBA')
        sheets[entry['guid']]=dict(entry, width=image.width, height=image.height)
        names={str(next(iter(row['first'].values()))):row['second'] for row in meta.get('internalIDToNameTable', [])}
        ids={value:ident for ident,value in names.items()}
        ids.update({value:str(ident) for ident,value in meta.get('fileIDToRecycleName', {}).items()})
        sprites=meta.get('spriteSheet', {}).get('sprites', []) if meta.get('spriteMode')==2 else []
        if not sprites:
            sprites=[dict(name=Path(name).stem, internalID=21300000, rect=dict(x=0,y=0,width=image.width,height=image.height), pivot=meta.get('spritePivot',dict(x=.5,y=.5)), alignment=9)]
        for sprite in sprites:
            ident=str(sprite.get('internalID') or ids.get(sprite['name']) or '')
            if not ident:
                raise ValueError('Missing Unity sprite file ID: '+name+'/'+sprite['name'])
            rect={axis:int(round(sprite['rect'][axis])) for axis in ['x','y','width','height']}
            x,y,w,h=[rect[axis] for axis in ['x','y','width','height']]
            if min(x,y,w,h)<0 or not w or not h or x+w>image.width or y+h>image.height:
                raise ValueError('Sprite rectangle leaves its source sheet: '+name+'/'+sprite['name'])
            alignment=sprite.get('alignment',0); pivots=[(.5,.5),(0,1),(.5,1),(1,1),(0,.5),(1,.5),(0,0),(.5,0),(1,0)]
            pivot=sprite.get('pivot',dict(x=.5,y=.5)) if alignment==9 else dict(zip(('x','y'),pivots[alignment]))
            sprite_key=key(entry['guid'],ident); references[(entry['guid'],ident)]=sprite_key
            images[sprite_key]=dict(image=image.crop((x,image.height-y-h,x+w,image.height-y)),width=w,height=h,pivot=pivot,ppu=meta.get('spritePixelsToUnits',100),region='u_'+sprite_key,
                spriteName=sprite['name'],sheet=entry['guid'],rect=rect,fileId=ident,source=name)
    return images,references,sheets


def replace_refs(value,references):
    if isinstance(value,dict):
        ref=references.get((value.get('guid'),str(value.get('fileID'))))
        if ref:
            value.update(guid=ref,fileID=21300000)
        for child in value.values(): replace_refs(child,references)
    elif isinstance(value,(list,tuple)):
        for child in value: replace_refs(child,references)


def encode_documents(docs):
    dumper=getattr(yaml,'CSafeDumper',yaml.SafeDumper)
    return ('%YAML 1.1\n%TAG !u! tag:unity3d.com,2011:\n'+''.join('--- !u!'+str(kind)+' &'+str(ident)+'\n'+yaml.dump({'Asset':value},Dumper=dumper,sort_keys=False) for ident,(kind,value) in docs.items())).encode()


def prepare(prefab,entries,references):
    docs=documents(prefab['asset']); by_guid={entry['guid']:entry for entry in entries.values()}
    game_objects={ident:value for ident,(kind,value) in docs.items() if kind==1}
    transforms={ident:value for ident,(kind,value) in docs.items() if kind==4}
    paths={}
    def path(ident):
        if ident in paths:return paths[ident]
        transform=transforms[ident]; parent=transform['m_Father']['fileID']; name=game_objects[transform['m_GameObject']['fileID']]['m_Name']
        result=(path(parent)+'/'+name).strip('/') if parent else ''
        paths[ident]=result;return result
    for ident in transforms:path(ident)
    object_paths={t['m_GameObject']['fileID']:paths[ident] for ident,t in transforms.items()}
    animator=next(value for kind,value in docs.values() if kind==95); prefix=object_paths[animator['m_GameObject']['fileID']]
    renderers={ident:value for ident,(kind,value) in docs.items() if kind==212}
    def relative(renderer):
        value=object_paths[renderer['m_GameObject']['fileID']]
        return value[len(prefix)+1:] if prefix and value.startswith(prefix+'/') else value
    controller=by_guid[animator['m_Controller']['guid']]
    states={value['m_Name']:value.get('m_Motion',{}).get('guid') for kind,value in documents(controller['asset']).values() if kind==1102}
    choices={'idle':['Idle','Ready'],'move':['Walk','Run'],'attack':['Attack','Fire','Shot','Open'],'die':['Death','Death 0'],'attack_alt':['AttackAlt'],'run':['Run']}
    clips={}; seen=set()
    for action,names in choices.items():
        source=next((states[name] for name in names if states.get(name)),None)
        if not source or action=='run' and source in seen:continue
        clips[action]=copy.deepcopy(next(iter(documents(by_guid[source]['asset']).values()))[1]);seen.add(source)
    # Stationary chests/turrets have no walking clip in the source controller.
    # Their authored idle remains visible while the game moves the unit node.
    aliases=[]
    for action in ['move','attack']:
        if action not in clips and 'idle' in clips:clips[action]=copy.deepcopy(clips['idle']);aliases.append(action)
    for action in ['idle','move','attack','die']:
        if action not in clips:raise ValueError('Missing '+action+' in '+prefab['name'])
    head_groups=[]
    for kind,behaviour in docs.values():
        if kind!=114:continue
        for field in ['Head','Jaw','Wheel']:
            sprites=behaviour.get(field+'Sprites',[])
            target=behaviour.get(field,{}).get('fileID')
            targets=behaviour.get('Wheels',[]) if field=='Wheel' else [dict(fileID=target)]
            for target_ref in targets:
                renderer=renderers.get(target_ref.get('fileID'))
                if sprites and renderer:
                    event_name='SetWheels' if field=='Wheel' else 'SetHead'
                    animated=any(event.get('functionName')==event_name for clip in clips.values() for event in clip.get('m_Events',[]))
                    # MeatBug has a dormant, miswired Head field pointing at a
                    # moustache. With no expression events and no matching setup
                    # sprite, that field is not a usable expression control.
                    setup=renderer.get('m_Sprite',{})
                    matches=any(sprite.get('guid')==setup.get('guid') and sprite.get('fileID')==setup.get('fileID') for sprite in sprites)
                    if matches or animated:head_groups.append((field,relative(renderer),sprites))
    for action,clip in clips.items():
        clip.setdefault('m_PPtrCurves',[])
        for field,target,sprites in head_groups:
            frames=[dict(time=0,value=copy.deepcopy(sprites[0]))]
            for event in clip.get('m_Events',[]):
                if event.get('functionName')!=('SetWheels' if field=='Wheel' else 'SetHead'):continue
                index=event.get('intParameter',0)
                if 0<=index<len(sprites):frames.append(dict(time=event['time'],value=copy.deepcopy(sprites[index])))
            # A time-zero death expression replaces the normal time-zero key.
            frames=list({round(frame['time'],7):frame for frame in frames}.values())
            clip['m_PPtrCurves'].append(dict(path=target,attribute='m_Sprite',curve=sorted(frames,key=lambda f:f['time'])))
        replace_refs(clip,references)
    clips['hit']=dict(m_Name='Hit',m_AnimationClipSettings=dict(m_StopTime=.16),m_FloatCurves=[],m_PPtrCurves=[])
    replace_refs(docs,references)
    for renderer in renderers.values():
        # BossRef is the publisher's scene-authoring silhouette, not a body
        # part. Its external guide sprite is intentionally absent in both packs.
        if game_objects[renderer['m_GameObject']['fileID']]['m_Name']=='BossRef':
            renderer['m_Sprite']={'fileID':0};renderer['m_Enabled']=0
    item=dict(prefab,asset=encode_documents(docs))
    expressions=[]
    for field,target,sprites in head_groups:
        full=(prefix+'/'+target).strip('/') if prefix else target
        expressions.append(dict(field=field,slot=full,states=[],refs=copy.deepcopy(sprites)))
    return item,clips,controller['name'],expressions,aliases


def plan_repack_atlases(tx, kinds):
    result = dict(packs=0, units=0, sheets=0, repacked=0, retained=0)
    for kind in kinds:
        if kind not in ('fantasy-monsters', 'fantasy-bosses'):
            raise ValueError('Unsupported Fantasy unit pack: ' + kind)
        target = 'assets/resources/unit-library/' + kind
        manifest_file = target + '/catalog.json'
        manifest = json.loads(tx.read(manifest_file).decode('utf-8-sig'))
        tx.managed.update(manifest.get('importedFiles', {}))
        units = fantasy_atlas.existing_units(tx, target, manifest)
        if not units:
            raise ValueError('Fantasy unit pack has no existing skeletons')
        packed = fantasy_atlas.stage_sheets(tx, kind, manifest, manifest['parts'])
        for relative, rig in units:
            atlas, textures = fantasy_atlas.unit_atlas(tx, relative, rig, packed)
            tx.stage(relative[:-5] + '.atlas', atlas)
            meta_file = relative + '.meta'
            meta = json.loads(tx.read(meta_file).decode('utf-8-sig'))
            if meta.get('textures') != textures:
                tx.json(meta_file, dict(meta, textures=textures))
        tx.json(manifest_file, fantasy_atlas.finish_manifest(tx, target, manifest, packed))
        result['packs'] += 1; result['units'] += len(units); result['sheets'] += len(packed['records'])
        result['repacked'] += sum(record['layout'] == 'repacked' for record in packed['records'])
        result['retained'] += sum(record['layout'] == 'retained' for record in packed['records'])
    result['files'] = len(tx.plan)
    return result


def repack_atlases(project, artifacts, kinds=None, dry_run=False):
    tx = Transaction(project, artifacts)
    result = plan_repack_atlases(tx, kinds or ['fantasy-monsters', 'fantasy-bosses'])
    result['backup'] = None if dry_run else tx.commit()
    result['dryRun'] = dry_run
    return result


def import_pack(project,package,kind,artifacts,dependency=None):
    package_hash=digest(package.read_bytes())
    dependency_hash=digest(dependency.read_bytes()) if dependency else None
    entries=unpack(package)
    if dependency:
        known={entry['guid'] for entry in entries.values()}
        for name,entry in unpack(dependency).items():
            if entry['guid'] not in known and name not in entries:entries[name]=entry
    prefabs=[entry for name,entry in sorted(entries.items()) if name.endswith('.prefab') and ('/Bosses/' if kind=='fantasy-bosses' else '/Monsters/') in name]
    raw=prefabs+[entry for name,entry in entries.items() if name.endswith('.anim')]
    needed={entry['guid'] for name,entry in entries.items() if name.lower().endswith('.png') and any(entry['guid'].encode() in asset['asset'] for asset in raw)}
    images,references,sheets=slices(entries,needed); effect_textures=fantasy_effects.texture_images(images,sheets);tx=Transaction(project,artifacts)
    target='assets/resources/unit-library/'+kind; manifest_file=target+'/catalog.json'; before=tx.read(manifest_file)
    old=json.loads(before.decode('utf-8-sig')) if before else {};tx.managed=old.get('importedFiles',{})
    existing=fantasy_atlas.existing_units(tx,target,old) if before else []
    previous_source=old.get('source',{})
    previous_dependencies=previous_source.get('dependencies') or []
    same_source=(bool(previous_source.get('sha256')) and previous_source['sha256']==package_hash and
                 all(record.get('sha256') for record in previous_dependencies) and
                 {record['sha256'] for record in previous_dependencies}==({dependency_hash} if dependency else set()))
    retained_rigs=dict(existing) if same_source else {}
    tx.folder('assets/resources/unit-library');tx.folder(target)
    for directory in ['Units','Atlases','Parts']:tx.folder(target+'/'+directory)
    models=[]
    for prefab in prefabs:
        item,clips,controller,expressions,aliases=prepare(prefab,entries,references);rig=convert_prefab(item,entries,images,height=180 if kind=='fantasy-bosses' else 120,clips_override=clips)
        for group in expressions:
            group['states']=['sprite_'+images[ref['guid']]['spriteName'] if ref.get('guid') else None for ref in group.pop('refs')]
        rig['events']={}
        for action,clip in clips.items():
            events=[]
            for event in clip.get('m_Events',[]):
                if event.get('functionName')=='Event':
                    name='attack' if event.get('data','').lower() in ['attack','shot','fire'] else (event.get('data') or 'effect').lower()
                    rig['events'][name]={};events.append(dict(time=event['time'],name=name))
            if events:rig['animations'][action]['events']=events
        stem=Path(prefab['name']).stem; category=prefab['name'].split('/Bosses/' if kind=='fantasy-bosses' else '/Monsters/',1)[1].split('/')[:-2]
        if category==['Titans']:category.append(Path(prefab['name']).parent.name)
        family='/'.join(category) or Path(controller).parent.name
        # Stable sprite names keep expression timelines valid across outfits.
        for slot in rig['slots']:
            variants=rig['skins'][0]['attachments'].get(slot['name'],{}); renamed={}
            for region,attachment in variants.items():
                info=images[region[2:]];name='sprite_'+info['spriteName'];renamed[name]=dict(attachment,path=region)
                for animation in rig['animations'].values():
                    for frame in animation.get('slots',{}).get(slot['name'],{}).get('attachment',[]):
                        if frame.get('name')==region:frame['name']=name
                if slot.get('attachment')==region:slot['attachment']=name
            rig['skins'][0]['attachments'][slot['name']]=renamed
        models.append(dict(id=kind+'/'+stem,name=re.sub(r'(?<=[a-z])(?=[A-Z0-9])',' ',stem),pack=kind,source=prefab['name'],skeleton=target+'/Units/'+stem+'.json',resource=target[len('assets/resources/'):]+ '/Units/'+stem,uuid=asset_uuid(target+'/Units/'+stem+'.json'),family=family,controller=controller,rig=rig,expressions=expressions,animationAliases=aliases))
    def supported(slot,rig):
        visible=not slot.get('color','ffffffff').endswith('00') or any(any(frame.get('color','00000000')[-2:]!='00' for frame in clip.get('slots',{}).get(slot['name'],{}).get('color',[])) for clip in rig['animations'].values())
        return slot.get('attachment') and visible and not re.search(r'Shadow|Anchor|Press|Fireball|Effect',slot['name'],re.I)
    def expression(model,slot):
        return next((group for group in model['expressions'] if group['slot']==slot),None)
    def compatible(model,member,slot):
        current,other=expression(model,slot),expression(member,slot)
        if not current:return not other
        if not other:return False
        # Equal state counts and alias patterns let every animated expression
        # map to the chosen outfit, even when the publisher named it differently.
        pattern=lambda group:[None if state is None else group['states'].index(state) for state in group['states']]
        return current['field']==other['field'] and pattern(current)==pattern(other)
    for model in models:model['usable']={slot['name'] for slot in model['rig']['slots'] if supported(slot,model['rig'])}
    used=set();parts=[]
    for model in models:
        members=[m for m in models if m['family']==model['family'] and m['controller']==model['controller']]
        own=model['rig']['skins'][0]['attachments']; slot_info={};skins=[dict(name='default',attachments=copy.deepcopy(own))]
        for member in members:
            attachments={}
            for slot in model['rig']['slots']:
                variants=own.get(slot['name'],{}); other=member['rig']['skins'][0]['attachments'].get(slot['name'],{})
                if not other:continue
                source_default=next((s.get('attachment') for s in member['rig']['slots'] if s['name']==slot['name']),None)
                target_default=slot.get('attachment'); replacements={}
                for name,attachment in variants.items():
                    current_expression,other_expression=expression(model,slot['name']),expression(member,slot['name'])
                    index=current_expression['states'].index(name) if current_expression and name in current_expression['states'] else None
                    candidate=other.get(other_expression['states'][index]) if index is not None and compatible(model,member,slot['name']) else other.get(name) or (other.get(source_default) if name==target_default else None)
                    replacements[name]=copy.deepcopy(candidate or attachment)
                attachments[slot['name']]=replacements
            skins.append(dict(name=member['id'].split('/')[1],attachments=attachments))
        model['rig']['skins']=skins
        for slot in model['rig']['slots']:
            if slot['name'] not in model['usable']:continue
            options=[m['id'].split('/')[1] for m in members if slot['name'] in m['usable'] and compatible(model,m,slot['name'])]
            label=re.sub(r'(?<=[a-z])(?=[A-Z0-9])',' ',slot['name'].split('/')[-1])
            slot_info[slot['name']]=dict(label=label,variants=options)
        model['rig']['_fantasy']=dict(version=1,pack=kind,family=model['family'],preset=model['id'],presets=[dict(id=m['id'],name=m['name']) for m in members],slots=slot_info,expressions=model['expressions'],animationAliases=model['animationAliases'])
        fantasy_effects.augment(model,entries[model['source']],images,sheets,effect_textures)
        for skin in skins:
            for variants in skin['attachments'].values():
                used.update(a['path'][2:] for a in variants.values())
    if retained_rigs:
        # Reimporting identical licensed sources must not reset approved rig
        # fixes, expressions or FX ordering applied after their first import.
        for model in models:
            if model['skeleton'] in retained_rigs:model['rig']=retained_rigs[model['skeleton']]
        used={region[2:] for model in models for region in fantasy_atlas.attachment_regions(model['rig'])}
    prior_parts_by_guid={part['guid']:part for part in old.get('parts',[])}
    for sprite_key in sorted(used):
        if same_source and sprite_key in prior_parts_by_guid:
            parts.append(prior_parts_by_guid[sprite_key]);continue
        if sprite_key not in images:
            if sprite_key in prior_parts_by_guid:continue
            raise ValueError('Preserved Fantasy rig references a missing source sprite: '+sprite_key)
        info=images[sprite_key];relative=target+'/Parts/'+info['sheet']+'/'+re.sub(r'[^a-zA-Z0-9_-]','_',info['spriteName'])+'_'+sprite_key[:8]+'.png'
        tx.folder(str(Path(relative).parent).replace('\\','/'));buffer=io.BytesIO();info['image'].save(buffer,format='PNG');raw=buffer.getvalue();tx.stage(relative,raw);tx.json(relative+'.meta',texture_meta(relative,info['width'],info['height']),True)
        parts.append(dict(id=kind+'/'+sprite_key,name=info['spriteName'],image=relative,resource=relative[len('assets/resources/'):-4],guid=sprite_key,width=info['width'],height=info['height'],pivot=info['pivot'],pixelsPerUnit=info['ppu'],sha256=digest(raw),sheet=info['sheet'],spriteName=info['spriteName'],unityFileId=info['fileId'],rect=info['rect'],**({'generated':True} if info.get('generated') else {})))
    prior_parts={part['id']:part for part in old.get('parts',[])}
    updated_parts={part['id']:dict(prior_parts.get(part['id'],{}),**part) for part in parts}
    if same_source:
        parts=[updated_parts.pop(ident,part) for ident,part in prior_parts.items()]+list(updated_parts.values())
    else:
        parts=list(updated_parts.values())
        parts.extend(part for ident,part in prior_parts.items() if ident not in updated_parts)
    packed=fantasy_atlas.stage_sheets(tx,kind,old,parts,sheets)
    prior_units={unit['id']:unit for unit in old.get('units',[])}
    units=[];generated={model['skeleton'] for model in models}
    for model in models:
        relative=model['skeleton']
        if relative not in retained_rigs:tx.json(relative,model['rig'])
        atlas,textures=fantasy_atlas.unit_atlas(tx,relative,model['rig'],packed)
        tx.stage(relative[:-5]+'.atlas',atlas)
        metadata=tx.json(relative+'.meta',dict(ver='1.2.5',uuid=model['uuid'],importer='spine',textures=textures,scale=1,subMetas={}),True)
        if metadata.get('textures')!=textures:tx.json(relative+'.meta',dict(metadata,textures=textures))
        model['uuid']=metadata['uuid']
        tx.json(relative[:-5]+'.atlas.meta',dict(ver='1.0.3',uuid=asset_uuid(relative[:-5]+'.atlas'),importer='asset',subMetas={}),True)
        if relative in retained_rigs and model['id'] in prior_units:
            units.append(prior_units[model['id']])
        else:
            units.append(dict(prior_units.get(model['id'],{}),**({k:v for k,v in model.items() if k not in ['rig','usable']}|dict(animations=list(model['rig']['animations']),bones=len(model['rig']['bones']),slots=len(model['rig']['slots'])))))
    for relative,rig in existing:
        if relative in generated:continue
        atlas,textures=fantasy_atlas.unit_atlas(tx,relative,rig,packed)
        tx.stage(relative[:-5]+'.atlas',atlas)
        meta_file=relative+'.meta';meta=json.loads(tx.read(meta_file).decode('utf-8-sig'))
        if meta.get('textures')!=textures:tx.json(meta_file,dict(meta,textures=textures))
    units.extend(unit for ident,unit in prior_units.items() if ident not in {item['id'] for item in units})
    effect_assets=copy.deepcopy(old.get('effectAssets',[])) if same_source else []
    if kind=='fantasy-bosses' and not effect_assets:
        tx.folder(target+'/Effects')
        for palette,action,png,settings in fantasy_effects.projectile_sheets():
            relative=target+'/Effects/'+palette+'-'+action+'.png';tx.stage(relative,png);tx.json(relative+'.meta',texture_meta(relative,settings['cell']*settings['columns'],settings['cell']*4),True)
            effect_assets.append(dict(id='fantasy:'+palette+'-'+action,name='Fantasy '+palette+' '+action,category='Fantasy effects / '+action,role=action,kind='flipbook',resource=relative[len('assets/resources/'):-4],bundle='resources',sourcePack=kind,**settings))
    previous_effects={effect['id']:effect for effect in old.get('effectAssets',[])}
    effect_assets=[dict(previous_effects.get(effect['id'],{}),**effect) for effect in effect_assets]
    effect_assets.extend(effect for ident,effect in previous_effects.items() if ident not in {item['id'] for item in effect_assets})
    manifest=dict(old,version=1,source=dict(old.get('source',{}),package=package.name,sha256=package_hash),units=units,parts=parts,effectAssets=effect_assets,conversion=dict(old.get('conversion',{}),runtime='Spine 3.8',sampleRate=60,unityScriptsImported=False,unityMaterialsImported=False,slicedSprites=True,expressionEvents=True,particleEffectsVersion=fantasy_effects.VERSION))
    if dependency:
        prior_dependencies={record['package']:record for record in previous_dependencies}
        by_hash={record.get('sha256'):record for record in previous_dependencies if record.get('sha256')}
        manifest['source']['dependencies']=[dict(prior_dependencies.get(dependency.name,by_hash.get(dependency_hash,{})),package=dependency.name,sha256=dependency_hash)]
    manifest=fantasy_atlas.finish_manifest(tx,target,manifest,packed)
    for relative,_ in existing:
        if relative in retained_rigs or relative not in generated:
            manifest['importedFiles'][relative]=digest(tx.read(relative))
            manifest['importedFiles'][relative[:-5]+'.atlas']=digest(_planned_read(tx,relative[:-5]+'.atlas'))
    if digest(package.read_bytes())!=package_hash or dependency and digest(dependency.read_bytes())!=dependency_hash:
        raise ValueError('Licensed Fantasy source archive changed during import')
    tx.json(manifest_file,manifest);tx.json(manifest_file+'.meta',dict(ver='1.2.7',uuid=asset_uuid(manifest_file),importer='json',subMetas={}),True)
    return dict(kind=kind,units=len(units),parts=len(parts),files=len(tx.plan),backup=tx.commit())


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('package',type=Path,nargs='?');parser.add_argument('--kind',choices=['fantasy-bosses','fantasy-monsters']);parser.add_argument('--dependency',type=Path);parser.add_argument('--project',type=Path,default=Path(__file__).resolve().parents[2]);parser.add_argument('--artifacts',type=Path,required=True)
    parser.add_argument('--repack-atlases',action='store_true',help='Losslessly repack existing Fantasy sheets at 2048px; preserve all rigs and original source sheets')
    parser.add_argument('--dry-run',action='store_true',help='Validate a repack without publishing any changes')
    args=parser.parse_args()
    if args.repack_atlases:
        if args.package or args.dependency:parser.error('Atlas repacking does not take Unity archives')
        result=repack_atlases(args.project,args.artifacts,[args.kind] if args.kind else None,args.dry_run)
    else:
        if not args.package or not args.kind or args.dry_run:parser.error('Import requires a package and --kind; --dry-run is for repacking')
        result=import_pack(args.project,args.package,args.kind,args.artifacts,args.dependency)
    print(json.dumps(result,indent=2))
