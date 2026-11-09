'use strict';
const fs=require('fs'),path=require('path'),url=require('url'),Units=require('../../game-data-editor/lib/unit-assets'),Library=require('./unit-library');
const clone=v=>JSON.parse(JSON.stringify(v));
function duration(animation){let last=0;function visit(value){if(!value||typeof value!=='object')return;if(typeof value.time==='number')last=Math.max(last,value.time);Object.values(value).forEach(visit);}visit(animation);return last;}
function alignAnimations(horse,rider){
  const original=horse.json.animations,animations={};
  for(const [name,target]of Object.entries(rider.json.animations)){
    const move=/^(move|walk|run)$/.test(name),attack=/attack|skill/.test(name),death=/^(die|dead)/.test(name);
    const source=original[name]||original[move?'move':attack?'attack':death?'wqyl_lead_die':'idle']||original.idle;
    if(!source)continue;const clip=clone(source),from=duration(source),to=duration(target),factor=from>0&&to>0?to/from:1;
    function retime(value){if(!value||typeof value!=='object')return;if(typeof value.time==='number')value.time=Number((value.time*factor).toFixed(7));Object.values(value).forEach(retime);}retime(clip);delete clip.events;animations[name]=clip;
  }
  horse.json.animations=animations;horse.animations=Object.keys(animations);
}
// The original horses share head/body weighted meshes. Keep every vertex,
// weight, UV and deform value, and partition only their triangle lists so the
// head can cover the far hand without putting the whole horse over the rider.
function splitHead(json){
  const headBones=new Set(['horse_s_5']);for(const bone of json.bones)if(headBones.has(bone.parent))headBones.add(bone.name);
  const foreground=[];
  for(const slot of json.slots.slice()){
    const records=[];
    for(const skin of json.skins)for(const [name,attachment]of Object.entries(skin.attachments[slot.name]||{})){
      if(attachment.type==='mesh'&&attachment.uvs&&attachment.triangles){
        const weights=[];
        if(attachment.vertices.length===attachment.uvs.length)for(let i=0;i<attachment.uvs.length;i+=2)weights.push(headBones.has(slot.bone)?1:0);
        else for(let i=0;i<attachment.vertices.length;){const count=attachment.vertices[i++];let head=0,total=0;for(let j=0;j<count;j++,i+=4){const weight=attachment.vertices[i+3];total+=weight;if(headBones.has(json.bones[attachment.vertices[i]].name))head+=weight;}weights.push(total?head/total:0);}
        const front=[],back=[];for(let i=0;i<attachment.triangles.length;i+=3){const triangle=attachment.triangles.slice(i,i+3);((weights[triangle[0]]+weights[triangle[1]]+weights[triangle[2]])/3>=.5?front:back).push(...triangle);}
        records.push({skin,name,attachment,front,back});
      }else records.push({skin,name,attachment,front:headBones.has(slot.bone)?true:false,back:!headBones.has(slot.bone)});
    }
    if(!records.some(r=>r.front===true||r.front.length))continue;
    if(records.every(r=>r.back===false||Array.isArray(r.back)&&!r.back.length)){foreground.push(slot.name);continue;}
    let name=slot.name+'__mount_head';while(json.slots.some(s=>s.name===name))name+='_';
    json.slots.push({...clone(slot),name});foreground.push(name);(json._mountHeadSources||(json._mountHeadSources={}))[name]=slot.name;
    for(const record of records){
      if(record.front===false||Array.isArray(record.front)&&!record.front.length)continue;
      const copy=clone(record.attachment);copy.path=copy.path||copy.name||record.name;
      if(Array.isArray(record.front)){copy.triangles=record.front;record.attachment.triangles=record.back;}
      else record.attachment.color=(record.attachment.color||'ffffffff').slice(0,6)+'00';
      (record.skin.attachments[name]||(record.skin.attachments[name]={}))[record.name]=copy;
    }
    for(const clip of Object.values(json.animations)){
      if(clip.slots&&clip.slots[slot.name])clip.slots[name]=clone(clip.slots[slot.name]);
      for(const skin of Object.values(clip.deform||{}))if(skin[slot.name])skin[name]=clone(skin[slot.name]);
    }
  }
  return foreground;
}
function describe(root,base,noRuntime){
  const result=Library.describe(root,base.source,noRuntime);
  if(!base.mount)return result;
  if(!['legacy-cavalry','hero-horse'].includes(base.mount))throw Error('Choose an existing horse.');
  let horse;
  if(base.mount==='hero-horse')horse=Units.describe(root,{type:'hero',id:'hero',noRuntime:true}).layers.find(l=>l.name==='wqyl_lead_ma');
  else{
    const file=path.join(root,'assets/KinghtFallEnemyAni/wqyl_qb/wqyl_qb.json'),json=JSON.parse(fs.readFileSync(file));
    // Keep the original weighted horse meshes, IK and leg animation. Remove
    // every human/weapon attachment from every skin, rather than covering it.
    const keep=new Set();
    for(const skin of json.skins)for(const [slot,attachments]of Object.entries(skin.attachments))for(const attachment of Object.values(attachments)){
      const bones=[];
      if(attachment.vertices&&attachment.uvs&&attachment.vertices.length!==attachment.uvs.length)for(let i=0;i<attachment.vertices.length;){const count=attachment.vertices[i++];for(let j=0;j<count;j++){bones.push(json.bones[attachment.vertices[i]].name);i+=4;}}
      if(bones.length&&bones.every(name=>name.startsWith('horse_'))||/_19$/.test(attachment.name||Object.keys(attachments)[0]))keep.add(slot);
    }
    for(const skin of json.skins)for(const slot of Object.keys(skin.attachments))if(!keep.has(slot))delete skin.attachments[slot];
    json.slots=json.slots.filter(s=>keep.has(s.name));
    const atlas=fs.readFileSync(file.replace('.json','.atlas'),'utf8'),pages={};
    atlas.split(/\r?\n/).forEach((line,i,lines)=>{if(line.trim()&&(!i||!lines[i-1].trim())&&/\.png$/i.test(line.trim()))pages[line.trim()]=url.pathToFileURL(path.join(path.dirname(file),line.trim())).href;});
    horse={name:'Original cavalry horse',uuid:'d65efc08-b43e-54a9-a753-214538694c40',source:path.relative(root,file).replace(/\\/g,'/'),json,atlas,pages,skin:'lan',skins:json.skins.map(s=>s.name),animations:Object.keys(json.animations),x:0,y:0,scaleX:1,scaleY:1};
  }
  horse=clone(horse);horse.mount=true;horse.name=base.mount==='hero-horse'?'Hero horse':horse.name;
  horse.foregroundSlots=splitHead(horse.json);
  const rider=result.layers[0];rider.x=-10;rider.y=46;rider.scaleX=rider.scaleY=.6;
  alignAnimations(horse,rider);
  const shadow=rider.json.slots.find(s=>s.name==='Rider/Shadow');if(shadow)shadow.color='ffffff00';
  for(const clip of Object.values(rider.json.animations))if(clip.slots)delete clip.slots['Rider/Shadow'];
  rider.followMount={layer:horse.uuid,bone:'bone2'};
  result.layers=[horse,rider];result.fitHeight=150;return result;
}
// Namespace complete Spine layers, including weighted mesh bone indices and
// deform timelines. No flattening of animated horses into static pictures.
function merge(layers){
  const output={skeleton:clone(layers[0].rig.skeleton),bones:[],slots:[],skins:[{name:'default',attachments:{}}],events:{},animations:{}},pictures={};
  layers.forEach(({rig,pictures:images},index)=>{
    const prefix='layer'+index+'/',rename=name=>prefix+name,offset=output.bones.length,slotNames=new Set(rig.slots.map(s=>s.name));
    rig.bones.forEach(b=>output.bones.push(Object.assign({},b,{name:rename(b.name)},b.parent?{parent:rename(b.parent)}:{})));
    rig.slots.forEach(s=>output.slots.push(Object.assign({},s,{name:rename(s.name),bone:rename(s.bone)},s.attachment?{attachment:rename(s.attachment)}:{})));
    for(const kind of ['ik','transform','path'])for(const c of rig[kind]||[]){const next=clone(c);next.name=rename(c.name);next.target=rename(c.target);next.bones=c.bones.map(rename);if(kind==='path')next.target=rename(c.target);(output[kind]||(output[kind]=[])).push(next);}
    const skin=rig.skins[0];for(const [slot,variants]of Object.entries(skin.attachments)){
      const target=output.skins[0].attachments[rename(slot)]={};
      for(const [name,source]of Object.entries(variants)){
        const a=clone(source);if(a.path||(!a.type||a.type==='region'||a.type==='mesh'))a.path=rename(a.path||a.name||name);if(a.name)a.name=rename(a.name);if(a.parent)a.parent=rename(a.parent);if(a.skin)a.skin='default';if(a.end)a.end=rename(a.end);
        if(a.vertices&&a.uvs&&a.vertices.length!==a.uvs.length)for(let i=0;i<a.vertices.length;){const count=a.vertices[i++];for(let j=0;j<count;j++){a.vertices[i]+=offset;i+=4;}}
        target[rename(name)]=a;
      }
    }
    for(const [name,image]of Object.entries(images))pictures[rename(name)]=image;
    Object.assign(output.events,rig.events||{});
    for(const [name,source]of Object.entries(rig.animations)){
      const animation=output.animations[name]||(output.animations[name]={});
      for(const kind of ['bones','slots','ik','transform','paths'])if(source[kind]){const target=animation[kind]||(animation[kind]={});for(const [key,value]of Object.entries(source[kind]))if(kind!=='slots'||slotNames.has(key)){target[rename(key)]=clone(value);if(kind==='slots'&&value.attachment)target[rename(key)].attachment.forEach(frame=>{if(frame.name)frame.name=rename(frame.name);});}}
      if(source.deform){const target=animation.deform||(animation.deform={default:{}});for(const skin of Object.values(source.deform))for(const [slot,attachments]of Object.entries(skin))if(slotNames.has(slot)){target.default[rename(slot)]={};for(const [attachment,frames]of Object.entries(attachments))target.default[rename(slot)][rename(attachment)]=clone(frames);}}
      // Each layer retains its own draw order; global rider/horse order stays fixed.
      if(source.drawOrder){const target=animation.drawOrder||(animation.drawOrder=[]);for(const frame of source.drawOrder){let out=target.find(f=>f.time===frame.time);if(!out){out={time:frame.time,offsets:[]};target.push(out);}out.offsets.push(...(frame.offsets||[]).filter(o=>slotNames.has(o.slot)).map(o=>({slot:rename(o.slot),offset:o.offset})));}target.sort((a,b)=>a.time-b.time);}
      if(source.events&&index===layers.length-1)animation.events=clone(source.events);
    }
  });
  // Spine constraint order is global across merged skeletons.
  let order=0;for(const kind of ['ik','transform','path'])for(const c of output[kind]||[])c.order=order++;
  return{rig:output,pictures};
}
function bindRider(root,merged,description){
  const spine=require(Units.enginePath());
  // Bounds and UVs do not affect the saddle transform; the final atlas is
  // packed later. Use a tiny placeholder atlas only to resolve bone matrices.
  const rig=merged.rig,copy=clone(rig);copy.slots=[];copy.skins=[{name:'default',attachments:{}}];copy.animations={};
  const data=new spine.SkeletonJson(new spine.AtlasAttachmentLoader(new spine.TextureAtlas('',()=>null))).readSkeletonData(copy),skeleton=new spine.Skeleton(data);skeleton.updateWorldTransform();
  description.layers.forEach((layer,index)=>{if(!layer.followMount)return;const mountIndex=description.layers.findIndex(l=>l.uuid===layer.followMount.layer),saddle=skeleton.findBone('layer'+mountIndex+'/'+layer.followMount.bone),name='layer'+index+'/__game_fit',bone=rig.bones.find(b=>b.name===name);if(!saddle||!bone)throw Error('Missing horse saddle anchor.');
    const determinant=saddle.a*saddle.d-saddle.b*saddle.c,ia=saddle.d/determinant,ib=-saddle.b/determinant,ic=-saddle.c/determinant,id=saddle.a/determinant;
    const x=bone.x-saddle.worldX,y=bone.y-saddle.worldY,angle=(bone.rotation||0)*Math.PI/180,cos=Math.cos(angle),sin=Math.sin(angle),sx=bone.scaleX,sy=bone.scaleY;
    const a=(ia*cos+ib*sin)*sx,b=(ic*cos+id*sin)*sx,c=(-ia*sin+ib*cos)*sy,d=(-ic*sin+id*cos)*sy,rotation=Math.atan2(b,a)*180/Math.PI;
    Object.assign(bone,{parent:saddle.data.name,x:ia*x+ib*y,y:ic*x+id*y,rotation,scaleX:Math.hypot(a,b),scaleY:Math.hypot(c,d),shearY:Math.atan2(d,c)*180/Math.PI-rotation-90});
  });
}
// Interleave complete render groups while leaving bones, attachments, events
// and animation times intact. Re-express any animated draw order against the
// new setup order, rather than keeping offsets tied to the old slot indices.
function orderMounted(rig,description){
  const ranks=new Map(),headOrder=new Map();let active=false;
  description.layers.forEach((rider,index)=>{
    if(!rider.followMount)return;const mountIndex=description.layers.findIndex(l=>l.uuid===rider.followMount.layer),horse=description.layers[mountIndex];if(!horse||!horse.foregroundSlots||!horse.foregroundSlots.length)return;
    active=true;const front=new Set(horse.foregroundSlots);horse.foregroundSlots.forEach((slot,i)=>headOrder.set('layer'+mountIndex+'/'+slot,i));
    horse.json.slots.forEach(slot=>ranks.set('layer'+mountIndex+'/'+slot.name,front.has(slot.name)?3:0));
    rider.json.slots.forEach(slot=>ranks.set('layer'+index+'/'+slot.name,/^Rider\/HandRight\//.test(slot.name)?4:/^Rider\/HandLeft\//.test(slot.name)?2:1));
  });
  if(!active)return;
  const setup=rig.slots.slice(),sorted=list=>list.slice().sort((a,b)=>(ranks.get(a.name)||0)-(ranks.get(b.name)||0)||(ranks.get(a.name)===3?headOrder.get(a.name)-headOrder.get(b.name):0));
  const next=sorted(setup),indices=new Map(next.map((slot,i)=>[slot.name,i]));
  for(const animation of Object.values(rig.animations))for(const frame of animation.drawOrder||[]){
    const order=new Array(setup.length).fill(-1),unchanged=[];let original=0;
    for(const offset of frame.offsets||[]){const at=setup.findIndex(slot=>slot.name===offset.slot);while(original<at)unchanged.push(original++);order[original+offset.offset]=original++;}
    while(original<setup.length)unchanged.push(original++);for(let i=order.length-1;i>=0;i--)if(order[i]===-1)order[i]=unchanged.pop();
    const target=sorted(order.map(i=>setup[i])),positions=new Map(target.map((slot,i)=>[slot.name,i]));
    frame.offsets=next.map(slot=>({slot:slot.name,offset:positions.get(slot.name)-indices.get(slot.name)})).filter(o=>o.offset);
  }
  rig.slots=next;
}
module.exports={describe,merge,bindRider,splitHead,orderMounted,alignAnimations,duration};
