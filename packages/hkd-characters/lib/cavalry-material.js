'use strict';
const fs=require('fs'),path=require('path'),url=require('url');
const texture='assets/resources/unit-library/mount-textures/cavalry-blue-body.png',page='hkd-cavalry-blue-body.png',region='hkd_cavalry_blue_body';
// Team material for the shared cavalry body: move the cloth's red hue to the
// existing equipment's blue hue. Keep its shading, alpha and every horse,
// mane, outline and cream-trim pixel outside that hue range unchanged.
function blueCloth(image){
  const rgba=Buffer.from(image.rgba);
  for(let i=0;i<rgba.length;i+=4){const r=rgba[i],g=rgba[i+1],b=rgba[i+2],chroma=r-Math.min(g,b),hue=(g-b)/Math.max(1,chroma)/6;
    if(rgba[i+3]&&r>g&&r>b&&chroma>8&&hue>=0&&hue<.052){rgba[i]=b;rgba[i+1]=Math.round(r-chroma*.36);rgba[i+2]=r;}
  }
  return{width:image.width,height:image.height,rgba};
}
function apply(root,horse){
  const file=path.join(root,texture),bytes=fs.readFileSync(file),width=bytes.readUInt32BE(16),height=bytes.readUInt32BE(20);
  horse.pages[page]=url.pathToFileURL(file).href+'?revision='+fs.statSync(file).mtimeMs;
  horse.atlas+='\n\n'+page+'\nsize: '+width+','+height+'\nformat: RGBA8888\nfilter: Linear,Linear\nrepeat: none\n'+region+'\n  rotate: false\n  xy: 0, 0\n  size: '+width+', '+height+'\n  orig: '+width+', '+height+'\n  offset: 0, 0\n  index: -1\n';
  const skin=horse.json.skins.find(skin=>skin.name==='lan');
  for(const attachments of Object.values(skin.attachments))for(const [name,attachment]of Object.entries(attachments))if((attachment.path||attachment.name||name)==='qb_lan_12')attachment.path=region;
}
module.exports={texture,page,region,blueCloth,apply};
