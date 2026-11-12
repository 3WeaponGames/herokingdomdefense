'use strict';
const path=require('path');
const id='Hero/Cape/lv_blue',region='part_cloak_royal_blue';
function apply(rig,asset){
  for(const skin of rig.skins)if(/(?:^|_)lv_blue$/.test(skin.name))for(const attachment of Object.values(skin.attachments['Rider/Body/Cape']||{}))Object.assign(attachment,{path:region,width:asset.width,height:asset.height});
  return rig;
}
function icons(catalog,asset){
  for(const name of Object.keys(catalog[5]||{}))if(/(?:^|_)lv_blue$/.test(name))catalog[5][name]={id:asset.id,resource:asset.resource,width:asset.width,height:asset.height};
}
function page(files,base,asset,textureUuid){
  const relative=path.posix.relative(path.posix.dirname(base),asset.image),atlas=files.get(base+'.atlas').toString().trimEnd();
  // Creator's Spine importer resolves page basenames beside the atlas.
  if(relative.includes('/'))throw Error('Keep the cloak texture beside its Spine atlas.');
  // Reference the editable PNG directly, so Photoshop color changes do not
  // require repacking the other cloak textures.
  const entry='\n\n'+relative+'\nsize: '+asset.width+','+asset.height+'\nformat: RGBA8888\nfilter: Linear,Linear\nrepeat: none\n'+region+'\n  rotate: false\n  xy: 0, 0\n  size: '+asset.width+', '+asset.height+'\n  orig: '+asset.width+', '+asset.height+'\n  offset: 0, 0\n  index: -1\n';
  if(!atlas.includes('\n'+region+'\n'))files.set(base+'.atlas',atlas+entry);
  const meta=JSON.parse(files.get(base+'.json.meta'));meta.textures=[...new Set(meta.textures.concat(textureUuid))];files.set(base+'.json.meta',JSON.stringify(meta,null,2)+'\n');
}
module.exports={id,apply,icons,page};
