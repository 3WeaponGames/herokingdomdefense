'use strict';
// Export portraits from the supplied monster rigs, including separately drawn
// eyes and mouths. This never edits the source sprites, models or player data.
const fs=require('node:fs'),path=require('node:path'),url=require('node:url');
const Library=require('../../packages/hkd-characters/lib/unit-library'),Units=require('../../packages/game-data-editor/lib/unit-assets');
const PNG=require('../../packages/hkd-characters/lib/png-atlas'),Bake=require('../../packages/hkd-characters/lib/native-bake'),Tx=require('../../packages/hkd-characters/lib/asset-transaction');
const selections={
  wolf:['monster1/Wolf_Gray',/\/Head$/,1],bear:['monster1/Bear_Grizzly',/\/Head$/,1],
  'carnivorous-plant':['monster2/Plant_Nepenthes',/\/Mouth$/,1],buffalo:['monster1/Buffalo_Wild',/\/Head$/,1],
  turtle:['monster1/Turtle_Alligator',/\/(?:Body|Eye)$/,1],wizard:['monster2/Alien_Wizard',/\/(?:Body|Mouth)$/,.5],
  'iron-golem':['monster2/Golem_Iron',/\/(?:Body|Eye|Eye2)$/,1],ghost:['monster2/Ghost_Pirate',/\/Body$/,.68],
  vampire:['monster2/Alien_Vampire',/\/Body$/,.58],scorpion:['monster2/Scorpion_Stone',/\/Body$/,1,.72],
  'tree-golem':['monster2/Golem_Tree',/\/(?:Body|Eye|Eye2)$/,1],skeleton:['monster2/Skeleton_Warlord',/\/Head$/,1]
};
function portrait(root,selection,read=fs.readFileSync,decoded=new Map()){
  const spine=require(Units.enginePath()),layer=Library.describe(root,selection[0],true).layers[0];
  const atlas=new spine.TextureAtlas(layer.atlas,name=>{const file=url.fileURLToPath(layer.pages[name]);if(!decoded.has(file))decoded.set(file,PNG.decode(read(file)));return new spine.FakeTexture(decoded.get(file));});
  const data=new spine.SkeletonJson(new spine.AtlasAttachmentLoader(atlas)).readSkeletonData(layer.json),s=new spine.Skeleton(data);
  s.setSkinByName(layer.skin||'default');s.setToSetupPose();data.findAnimation('idle').apply(s,0,0,false,null,1,spine.MixBlend.replace,spine.MixDirection.mixIn);s.updateWorldTransform();
  const pieces=[];let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
  for(const slot of s.drawOrder){const a=slot.getAttachment();if(!selection[1].test(slot.data.name)||slot.color.a<=0||!(a instanceof spine.RegionAttachment))continue;
    const v=[];a.computeWorldVertices(slot.bone,v,0,2);for(let i=0;i<v.length;i+=2){minX=Math.min(minX,v[i]);minY=Math.min(minY,v[i+1]);maxX=Math.max(maxX,v[i]);maxY=Math.max(maxY,v[i+1]);}
    pieces.push({v,uv:a.uvs,image:a.region.texture.getImage(),color:{r:slot.color.r*a.color.r,g:slot.color.g*a.color.g,b:slot.color.b*a.color.b,a:slot.color.a*a.color.a}});
  }
  if(!pieces.length)throw Error('No head artwork: '+selection[0]);
  minY=maxY-(maxY-minY)*selection[2];if(selection[3])maxX=minX+(maxX-minX)*selection[3];const scale=112/Math.max(maxX-minX,maxY-minY),cx=(minX+maxX)/2,cy=(minY+maxY)/2,result={width:128,height:128,rgba:Buffer.alloc(128*128*4)};
  for(let y=0;y<128;y++)for(let x=0;x<128;x++){
    const wx=(x+.5-64)/scale+cx,wy=(64-y-.5)/scale+cy;if(wy<minY||wy>maxY||wx<minX||wx>maxX)continue;
    for(const {v,uv,image,color}of pieces){const ax=v[2]-v[0],ay=v[3]-v[1],bx=v[6]-v[0],by=v[7]-v[1],det=ax*by-ay*bx;
      if(Math.abs(det)<1e-8)continue;const px=wx-v[0],py=wy-v[1],u=(px*by-py*bx)/det,w=(ax*py-ay*px)/det;if(u<0||w<0||u>1||w>1)continue;
      const tx=Math.max(0,Math.min(image.width-1,Math.floor((uv[0]+u*(uv[2]-uv[0])+w*(uv[6]-uv[0]))*image.width))),ty=Math.max(0,Math.min(image.height-1,Math.floor((uv[1]+u*(uv[3]-uv[1])+w*(uv[7]-uv[1]))*image.height)));
      const at=(ty*image.width+tx)*4,to=(y*128+x)*4,alpha=image.rgba[at+3]/255*color.a,old=result.rgba[to+3]/255,total=alpha+old*(1-alpha);if(!total)continue;
      for(let k=0;k<3;k++)result.rgba[to+k]=Math.round((image.rgba[at+k]*[color.r,color.g,color.b][k]*alpha+result.rgba[to+k]*old*(1-alpha))/total);result.rgba[to+3]=Math.round(total*255);
    }
  }
  return result;
}
function generate(root){
  const files=new Map(),reads=new Map(),read=file=>{file=path.resolve(file);if(!reads.has(file))reads.set(file,fs.readFileSync(file));return reads.get(file);};
  for(const [name,selection]of Object.entries(selections)){
    const relative='assets/resources/icons/enemy-heads/'+name+'.png',image=portrait(root,selection,read);files.set(relative,PNG.encode(image));
    const meta=relative+'.meta',existing=path.resolve(root,meta);files.set(meta,fs.existsSync(existing)?read(existing):JSON.stringify(Bake.textureMeta(relative,128,128),null,2)+'\n');
  }
  for(const file of files.keys()){const absolute=path.resolve(root,file);if(!reads.has(absolute))reads.set(absolute,fs.existsSync(absolute)?fs.readFileSync(absolute):null);}
  return Tx.commit(root,files,reads,'assets/resources/icons/enemy-heads/wolf.png');
}
module.exports={selections,portrait,generate};
if(require.main===module)console.log(generate(path.resolve(__dirname,'../..')));
