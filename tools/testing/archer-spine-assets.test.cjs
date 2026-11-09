'use strict';
// A tower repaint must retain the original authored light/FX pixels and Spine motion.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../..'),dir=path.join(root,'assets/KinghtFallIconMap/com/Ani/jt');
const {decode}=require('../../packages/hkd-characters/lib/png-atlas');
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const text=file=>fs.readFileSync(path.join(dir,file),'utf8').replace(/\r\n/g,'\n');
// Source-art identities recorded before replacing the three body regions.
const SOURCE={
  skeleton:'1dc75b35407bdaf4606f7f11febc407c1347e90f60364be414dc7a05494630e0',
  atlas:'4f01667a48ec5491239fa991e26ccfaf88064766aa9c68c910ad854ac13625bd',
  nonBodyPixels:'0ddd62f77ed78e17f81a9a5564067aa1bd7891bcd0719fa09d84b3d31b78714e'
};
const BODIES=[
  {name:'jt_1_3',rotate:false,xy:[189,60],size:[186,207],orig:[188,209],offset:[1,1]},
  {name:'jt_2_3',rotate:true,xy:[377,82],size:[185,208],orig:[187,210],offset:[1,1]},
  {name:'jt_3_3',rotate:false,xy:[2,38],size:[185,229],orig:[187,231],offset:[1,1]}
];
function region(name){
  const lines=text('jt.atlas').split('\n'),at=lines.indexOf(name);assert(at>=0,'Missing original atlas region '+name);const fields={};
  for(let n=at+1;n<lines.length&&/^\s/.test(lines[n]);n++){const split=lines[n].trim().split(':');fields[split[0]]=split.slice(1).join(':').trim();}
  const pair=key=>fields[key].split(',').map(Number);
  return{name,rotate:fields.rotate==='true',xy:pair('xy'),size:pair('size'),orig:pair('orig'),offset:pair('offset')};
}

test('Archer tower keeps the original skeleton, animation, light meshes and atlas mapping',()=>{
  assert.equal(sha(text('jt.json')),SOURCE.skeleton,'Retain the original bones, slots, skins, light deformation, placement, upgrade and destruction animations');
  assert.equal(sha(text('jt.atlas')),SOURCE.atlas,'Retain original light and FX atlas coordinates');
  assert.deepEqual(BODIES.map(body=>region(body.name)),BODIES);
});

test('Archer atlas repaints only its three body rectangles, preserving every original light and FX pixel',()=>{
  const image=decode(fs.readFileSync(path.join(dir,'jt.png')));assert.deepEqual([image.width,image.height],[1159,269]);
  const unchanged=Buffer.from(image.rgba);
  for(const body of BODIES){const [x,y]=body.xy,[width,height]=body.rotate?[body.size[1],body.size[0]]:body.size;
    for(let row=y;row<y+height;row++)unchanged.fill(0,(row*image.width+x)*4,(row*image.width+x+width)*4);
  }
  assert.equal(sha(unchanged),SOURCE.nonBodyPixels,'Original day/night light sprites, their alpha, particles, dust and upgrade/destruction FX must remain byte-exact');
});

test('Archer Cocos asset identities and original native texture sampling stay stable',()=>{
  const png=JSON.parse(text('jt.png.meta')),skeleton=JSON.parse(text('jt.json.meta')),atlas=JSON.parse(text('jt.atlas.meta'));
  assert.equal(png.uuid,'c8393c5f-5c6a-402b-b2ed-4d6b36e7e59b');
  assert.equal(png.subMetas.jt.uuid,'43356a67-4d01-4b7a-ab7d-eaacdb46c80d');
  assert.equal(png.subMetas.jt.rawTextureUuid,png.uuid);
  assert.equal(skeleton.uuid,'dbf73382-efb9-4ac2-b353-7673e89a5827');
  assert.deepEqual(skeleton.textures,[png.uuid]);assert.equal(skeleton.scale,1);
  assert.equal(atlas.uuid,'ea17d578-a501-46f0-ade6-81162b118325');
  assert.deepEqual([png.width,png.height],[1159,269]);assert.equal(png.filterMode,'bilinear');
  assert.equal(png.premultiplyAlpha,false);assert.equal(png.genMipmaps,false);
});
