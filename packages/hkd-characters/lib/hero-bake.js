'use strict';
// Compile fitted hero gear to ordinary Spine data. JSB cannot execute the web
// renderer's custom attachment hook; no native attachment mutation is needed.
const fs=require('fs'),path=require('path'),PNG=require('./png-atlas'),Bake=require('./native-bake'),Placement=require('./placement');
const Units=require('../../game-data-editor/lib/unit-assets'),Document=require('../../game-data-editor/lib/json-document');
const clone=value=>JSON.parse(JSON.stringify(value));
function bake(root,profile,id,description,assets,read){
  const files=new Map(),bakedLayers={};
  for(const layer of description.layers){
    const parts=profile.parts.filter(part=>part.layer===layer.uuid);if(!parts.length)continue;
    const rig=clone(layer.json),slots=new Map(rig.slots.map(slot=>[slot.name,slot])),pictures={},cut=Bake.readAtlas(layer,read),hidden=new Set();
    for(const part of parts){
      const slot=slots.get(part.slot),asset=assets.get(part.sprite);if(!slot||!asset)throw Error('Missing hero equipment '+part.id);
      const name='item_'+part.id; pictures[name]=PNG.decode(read(path.join(root,asset.image)));slot.bone=part.bone;slot.attachment=name;
      for(const skin of rig.skins){skin.attachments[slot.name]={[name]:{path:name,x:part.x,y:part.y,rotation:part.rotation,scaleX:part.scaleX,scaleY:part.scaleY,width:asset.width,height:asset.height,color:(part.tint||'#ffffff').slice(1)+Math.round(part.opacity*255).toString(16).padStart(2,'0')}};}
      (part.hideSlots||[]).forEach(name=>hidden.add(name));
      if(Placement.role(asset)==='Helmet'&&layer.name==='wqyl_lead_tou')for(const other of rig.slots)if(other.name!==slot.name&&/headgear/i.test(other.name))hidden.add(other.name);
      for(const clip of Object.values(rig.animations)){
        if(clip.slots&&clip.slots[slot.name])delete clip.slots[slot.name].attachment;
        if(clip.deform)for(const skin of Object.values(clip.deform))delete skin[slot.name];
      }
      const at=rig.slots.indexOf(slot);if(part.order){rig.slots.splice(at,1);rig.slots.splice(Math.max(0,Math.min(rig.slots.length,at+part.order)),0,slot);}
    }
    for(const name of hidden){delete slots.get(name).attachment;for(const skin of rig.skins)delete skin.attachments[name];for(const clip of Object.values(rig.animations))if(clip.slots&&clip.slots[name])delete clip.slots[name].attachment;}
    for(const skin of rig.skins)for(const variants of Object.values(skin.attachments))for(const [name,attachment]of Object.entries(variants)){
      if(attachment.type==='clipping'||attachment.type==='boundingbox'||attachment.type==='path'||attachment.type==='point')continue;
      const region=attachment.path||name;if(!pictures[region])pictures[region]=cut(region);
    }
    const image=PNG.pack(pictures),base='assets/resources/hero-items/baked/'+id+'_'+layer.name,texture=path.basename(base)+'.png',lines=['',texture,'size: '+image.width+','+image.height,'format: RGBA8888','filter: Linear,Linear','repeat: none'];
    for(const [name,p]of Object.entries(image.positions))lines.push(name,'  rotate: false','  xy: '+p.x+', '+p.y,'  size: '+p.width+', '+p.height,'  orig: '+p.width+', '+p.height,'  offset: 0, 0','  index: -1');
    rig._heroItem=id;rig._originalLayer=layer.uuid;
    files.set(base+'.json',JSON.stringify(rig,null,2)+'\n');files.set(base+'.atlas',lines.join('\n')+'\n');files.set(base+'.png',PNG.encode(image));
    const metadata={'.json':{ver:'1.2.5',uuid:Bake.uuid(base+'.json'),importer:'spine',textures:[Bake.uuid(base+'.png')],scale:1,subMetas:{}},'.atlas':{ver:'1.0.3',uuid:Bake.uuid(base+'.atlas'),importer:'asset',subMetas:{}},'.png':Bake.textureMeta(base+'.png',image.width,image.height)};
    for(const [suffix,value]of Object.entries(metadata))files.set(base+suffix+'.meta',JSON.stringify(value,null,2)+'\n');
    Bake.preserveMetadata(root,files,read);
    bakedLayers[layer.uuid]={resource:base.slice('assets/resources/'.length),uuid:JSON.parse(files.get(base+'.json.meta')).uuid};
  }
  return{files,bakedLayers};
}
function plan(root,data,assets,original){
  const updated=clone(data),files=new Map(),reads=new Map(),read=file=>{file=path.resolve(file);if(!reads.has(file))reads.set(file,fs.readFileSync(file));return reads.get(file);};
  // Small fixture projects without the hero source are still valid catalogs.
  if(!fs.existsSync(path.join(root,'assets/KinghtFallEnemyAni/ndPlay.prefab')))return{data:updated,files,reads};
  for(const id of new Set(Object.values(data.assignments))){
    const profile=updated.profiles[id];if(!profile||original&&Document.equal(profile,original.profiles[id])&&profile.bakedLayers)continue;
    const [slot,level]=profile.base.id.split(':').map(Number),description=Units.describe(root,{type:'hero',id:'hero',heroLevels:{[slot]:level},noRuntime:true}),result=bake(root,profile,id,description,new Map(assets.map(asset=>[asset.id,asset])),read);
    for(const [file,bytes]of result.files)files.set(file,bytes);profile.bakedLayers=result.bakedLayers;
    const icon=assets.find(asset=>profile.parts[0]&&asset.id===profile.parts[0].sprite);if(icon)profile.icon={id:icon.id,resource:icon.resource,width:icon.width,height:icon.height};else delete profile.icon;
  }
  return{data:updated,files,reads};
}
module.exports={bake,plan};
