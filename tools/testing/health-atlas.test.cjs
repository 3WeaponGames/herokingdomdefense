'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),test=require('node:test');
const root=process.env.HKD_TEST_PROJECT_ROOT||path.resolve(__dirname,'../..'),PNG=require(path.join(root,'packages/hkd-characters/lib/png-atlas'));
const {build,main}=require(process.env.HKD_HEALTH_ATLAS_BUILDER||path.join(root,'tools/art/build-health-atlas.cjs'));
const prefix='assets/resources/gui-pro/health/',read=file=>JSON.parse(fs.readFileSync(path.join(root,file),'utf8'));
const names=['frame','fill-blue','fill-green','fill-red'];
function sample(image,u,v){
  const px=u*image.width-.5,py=v*image.height-.5,x=Math.floor(px),y=Math.floor(py),fx=px-x,fy=py-y,out=[0,0,0,0];
  for(let iy=0;iy<2;iy++)for(let ix=0;ix<2;ix++){const cx=Math.max(0,Math.min(image.width-1,x+ix)),cy=Math.max(0,Math.min(image.height-1,y+iy)),weight=(ix?fx:1-fx)*(iy?fy:1-fy),at=(cy*image.width+cx)*4;for(let c=0;c<4;c++)out[c]+=image.rgba[at+c]*weight;}
  return out;
}

test('authored health atlas copies every source RGBA byte and its clamped sampling border without resizing or trimming',()=>{
  const packed=PNG.decode(fs.readFileSync(path.join(root,prefix+'health-atlas.png'))),metadata=read(prefix+'health-atlas.plist.meta');
  assert.equal(Object.keys(metadata.subMetas).length,4);assert(packed.width<=2048&&packed.height<=2048);
  for(const name of names){
    const source=PNG.decode(fs.readFileSync(path.join(root,prefix+name+'.png'))),frame=metadata.subMetas[name],x=frame.trimX,y=frame.trimY;
    assert.equal(frame.width,source.width);assert.equal(frame.height,source.height);assert.equal(frame.rawWidth,source.width);assert.equal(frame.rawHeight,source.height);assert.equal(frame.offsetX,0);assert.equal(frame.offsetY,0);assert.equal(frame.rotated,false);
    assert(PNG.crop(packed,x,y,source.width,source.height,false).rgba.equals(source.rgba));
    for(let dy=-2;dy<source.height+2;dy++)for(let dx=-2;dx<source.width+2;dx++){const sx=Math.max(0,Math.min(source.width-1,dx)),sy=Math.max(0,Math.min(source.height-1,dy)),from=(sy*source.width+sx)*4,to=((y+dy)*packed.width+x+dx)*4;assert(packed.rgba.subarray(to,to+4).equals(source.rgba.subarray(from,from+4)));}
  }
});

test('all native health frames share one bilinear texture and retain exact nine-slice border metadata and sampling',()=>{
  const packed=PNG.decode(fs.readFileSync(path.join(root,prefix+'health-atlas.png'))),texture=read(prefix+'health-atlas.png.meta'),metadata=read(prefix+'health-atlas.plist.meta');let probes=0;
  assert.equal(metadata.rawTextureUuid,texture.uuid);assert.equal(texture.type,'raw');assert.equal(texture.filterMode,'bilinear');assert.equal(texture.wrapMode,'clamp');assert.equal(texture.premultiplyAlpha,false);assert.equal(texture.genMipmaps,false);
  for(const name of names){
    const source=PNG.decode(fs.readFileSync(path.join(root,prefix+name+'.png'))),old=Object.values(read(prefix+name+'.png.meta').subMetas)[0],frame=metadata.subMetas[name];
    assert.equal(frame.rawTextureUuid,texture.uuid);assert.notEqual(frame.uuid,old.uuid);
    for(const key of ['width','height','rawWidth','rawHeight','offsetX','offsetY','borderTop','borderBottom','borderLeft','borderRight'])assert.equal(frame[key],old[key]);
    const xs=[0,old.borderLeft/source.width,1-old.borderRight/source.width,1],ys=[0,old.borderTop/source.height,1-old.borderBottom/source.height,1];
    for(let i=0;i<200;i++){xs.push((i*.61803398875)%1);ys.push((i*.41421356237)%1);}
    for(let i=0;i<xs.length;i++){const a=sample(source,xs[i],ys[i]),b=sample(packed,(frame.trimX+xs[i]*source.width)/packed.width,(frame.trimY+ys[i]*source.height)/packed.height);for(let c=0;c<4;c++)assert(Math.abs(a[c]-b[c])<1e-9);probes++;}
  }
  assert.equal(probes,816);
});

test('hero and unit health prefabs reference every sliced shared-atlas frame with no legacy source texture references',()=>{
  const frames=read(prefix+'health-atlas.plist.meta').subMetas,oldIds=new Set(names.map(name=>Object.values(read(prefix+name+'.png.meta').subMetas)[0].uuid)),counts=new Map(names.map(name=>[frames[name].uuid,0]));
  for(const file of ['assets/KinghtFallEnemy/ItemHp.prefab','assets/KinghtFallPrefabs/game/KinghtFallUIGame.prefab']){
    const rows=read(file);for(const row of rows){const reference=row._spriteFrame&&row._spriteFrame.__uuid__;assert(!oldIds.has(reference));if(counts.has(reference)){counts.set(reference,counts.get(reference)+1);assert.equal(row.__type__,'cc.Sprite');assert.equal(row._type,1);}}
  }
  for(const[name,frame]of Object.entries(frames))assert(counts.get(frame.uuid)>0,name+' has a published prefab reference');
});

test('health atlas generation is deterministic and repeated published builds do not request any prefab or source changes',()=>{
  const a=build(root),b=build(root);assert.equal(a.files.size,4);assert.deepEqual([...a.files.keys()],[...b.files.keys()]);
  for(const[file,value]of a.files){assert.deepEqual(value,b.files.get(file));assert(fs.readFileSync(path.join(root,file)).equals(Buffer.isBuffer(value)?value:Buffer.from(value)),file+' matches the canonical Creator-imported bytes');}
  for(const name of names){assert(!a.files.has(prefix+name+'.png'));assert(!a.files.has(prefix+name+'.png.meta'));}
});

test('publishing all four identical imported atlas files is idempotent and performs no writes',()=>{
  const write=fs.writeFileSync,mkdir=fs.mkdirSync;let writes=0,directories=0,result;
  try{fs.writeFileSync=(...args)=>{writes++;return write(...args);};fs.mkdirSync=(...args)=>{directories++;return mkdir(...args);};result=main(['--out',root]);}
  finally{fs.writeFileSync=write;fs.mkdirSync=mkdir;}
  assert.equal(result.files.length,4);assert.equal(result.writes,0);assert.equal(writes,0);assert.equal(directories,0);
});

test('legacy prefab migration changes only health frame UUID strings and preserves every unrelated byte',()=>{
  const published=build(root),legacy='[ { "future": {"keep":9}, "ids": ['+[...published.replacements.keys()].map(id=>'"'+id+'"').join(',')+'], "unknown": "unchanged" } ]\r\n';
  const result=build(root,(file,...args)=>file.endsWith('.prefab')?legacy:fs.readFileSync(file,...args));
  for(const[file,value]of result.files){if(!file.endsWith('.prefab'))continue;let restored=value;for(const[oldId,newId]of result.replacements)restored=restored.split('"'+newId+'"').join('"'+oldId+'"');assert.equal(restored,legacy);}
  assert.equal([...result.files.keys()].filter(file=>file.endsWith('.prefab')).length,2);
});

test('atlas generation preserves LF or CRLF checkouts and defaults to LF for a new XML destination',()=>{
  const file=path.join(root,prefix+'health-atlas.plist'),normalized=fs.readFileSync(file,'utf8').replace(/\r\n/g,'\n');
  for(const ending of ['\n','\r\n']){
    const expected=normalized.replace(/\n/g,ending),result=build(root,(source,...args)=>source===file?expected:fs.readFileSync(source,...args));
    assert.equal(result.files.get(prefix+'health-atlas.plist'),expected);assert(result.files.get(prefix+'health-atlas.png').equals(fs.readFileSync(path.join(root,prefix+'health-atlas.png'))));
  }
  const fresh=build(root,(source,...args)=>{if(source===file)throw Object.assign(Error('No existing atlas'),{code:'ENOENT'});return fs.readFileSync(source,...args);});
  assert.equal(fresh.files.get(prefix+'health-atlas.plist'),normalized);
  assert.throws(()=>build(root,(source,...args)=>{if(source===file)throw Object.assign(Error('Cannot read existing atlas'),{code:'EACCES'});return fs.readFileSync(source,...args);}),/Cannot read existing atlas/);
});
