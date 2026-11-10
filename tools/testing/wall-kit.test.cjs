'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const Kit=require('../../assets/_script/WallKit'),Facing=require('../../assets/_script/GateFacing'),fixture=require('./building-spine-fit.fixture.json').wallKit;
const {decode}=require('../../packages/hkd-characters/lib/png-atlas');
const root=path.resolve(__dirname,'../..'),dir='assets/KinghtFallIconMap/com/Ani/cq/cq1/';
const bytes=f=>fs.readFileSync(path.join(root,f)),read=f=>JSON.parse(bytes(f).toString('utf8').replace(/^\uFEFF/,''));
const sha=v=>crypto.createHash('sha256').update(v).digest('hex'),K=Math.tan(Math.PI/6),close=(a,b)=>assert(Math.abs(a-b)<1e-6,a+' vs '+b);
function canonical(v){if(typeof v==='number')return Math.round(v*1e6)/1e6;if(Array.isArray(v))return v.map(canonical);if(v&&typeof v==='object')return Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])]));return v;}
function regions(){const all={};let name;for(const l of bytes(dir+'cq1.atlas').toString('utf8').split(/\r?\n/)){if(!l.trim())continue;if(!/^\s/.test(l)&&!l.includes(':')){name=l.endsWith('.png')?null:l.trim();if(name)all[name]={};}else if(name&&l.includes(':')){const at=l.indexOf(':'),key=l.slice(0,at).trim();if(['xy','size'].includes(key))all[name][key]=l.slice(at+1).split(',').map(Number);}}return all;}

test('wall tiers use exact pack 2/4/7 pixels and separate generated gate surfaces',()=>{
 const atlas=regions(),page=decode(bytes(dir+fixture.page));assert.deepEqual(fixture.packTiers,[2,4,7]);
 for(const r of fixture.regions){const a=atlas[r.region];assert(a);assert.deepEqual(a.size,r.size);const[x,y]=a.xy,[w,h]=a.size,rows=[];for(let row=0;row<h;row++)rows.push(page.rgba.subarray(((y+row)*page.width+x)*4,((y+row)*page.width+x+w)*4));assert.equal(sha(Buffer.concat(rows)),r.pixels,r.region+' must retain its selected source pixels');}
 assert.equal(fixture.regions.filter(r=>r.native).length,12);assert.equal(fixture.regions.filter(r=>!r.native).length,6);
 const meta=read(dir+'cq1.json.meta'),texture=read(dir+fixture.page+'.meta');assert.equal(meta.textures[1],texture.uuid);assert.equal(texture.premultiplyAlpha,false);assert.equal(texture.packable,false);
 for(const file of ['assets/KinghtFallConfig/GameJsonCfg.json','assets/configs/GameJsonCfg.json']){const wall=read(file).BuildEnum['6'];for(const row of wall.levelList){assert.equal(row.Skin,'cq-rts-'+row.index);row.Skin={1:'cq-1',2:'cq-2-1',3:'cq-2-2'}[row.index];}assert.equal(sha(JSON.stringify(canonical(wall))),fixture.gameplay,'Only visual bindings may change: no rebalance or progression rewrite');}
});

test('all three new gate tiers retain fixed hinges, upright artwork, outward motion and reversible closed poses',()=>{
 const source=read(dir+'cq1.json'),north=Facing.mirrorJson(source);
 for(const skinName of fixture.aliases)for(const slot of ['rts_wall_leaf_left','rts_wall_leaf_right']){
  const skin=source.skins.find(s=>s.name===skinName),name=Object.keys(skin.attachments[slot])[0],a=skin.attachments[slot][name],left=slot.endsWith('left'),hinges=left?[4,6]:[0,2];
  assert.equal(north.skins.find(s=>s.name===skinName).attachments[slot][name].path,a.path.replace('_sw_','_nw_'));
  for(const json of [source,north])for(const animation of ['open','open_night','shut','shut_night']){
   const frames=json.animations[animation].deform[skinName][slot][name];
   for(const f of frames){const v=a.vertices.map((n,i)=>n+(f.vertices[i]||0));for(const i of hinges){close(v[i],a.vertices[i]);close(v[i+1],a.vertices[i+1]);}close(v[0],v[2]);close(v[4],v[6]);close(v[1]-v[3],a.vertices[1]-a.vertices[3]);}
   if(animation.startsWith('shut'))frames.at(-1).vertices.forEach(n=>close(n,0));
  }
  const center=v=>({x:(v[0]+v[2]+v[4]+v[6])/4,y:(v[1]+v[3]+v[5]+v[7])/4}),rest=center(a.vertices);
  for(const face of ['SW','SE','NW','NE']){const json=Facing.reverse(face)?north:source,f=json.animations.open.deform[skinName][slot][name].at(-1),p=center(a.vertices.map((n,i)=>n+(f.vertices[i]||0))),normal=Facing.normal(face),dx=(p.x-rest.x)*(Facing.mirrorX(face)?-1:1),dy=p.y-rest.y;assert(dx*normal.x+dy*normal.y>1,'The leaf opens outward for '+face);}
 }
});

test('long wall runs retain diagonal ground axes, native post proportions and bounds across all tiers',()=>{
 const original=read(dir+'cq1.json'),before=JSON.stringify(original);
 for(const gate of [false,true])for(const spacing of [1,4]){
  const run={left:3,right:5,gate,start:'post',end:'corner',spacing,FutureField:{keep:1}},snapshot=JSON.stringify(run),r=Kit.layout(run),json=Kit.install(original,r);
  close(r.leftEnd.y-r.left.y,-K*(r.leftEnd.x-r.left.x));close(r.rightEnd.y-r.right.y,-K*(r.rightEnd.x-r.right.x));
  close(r.left.x-r.leftEnd.x,3*60*spacing);assert.equal(JSON.stringify(run),snapshot);assert.equal(JSON.stringify(original),before);
  const frames=json.bones.filter(b=>b.name==='rts_wall_frame');assert.equal(frames.length,1);assert.equal(frames[0].parent,'bone3');
  for(const skin of json.skins.filter(s=>fixture.aliases.includes(s.name))){
   const leaves=Object.keys(skin.attachments).filter(s=>/^rts_wall_leaf_(left|right)$/.test(s));assert.equal(leaves.length,gate?2:0);
   for(const [slot,atts]of Object.entries(skin.attachments).filter(([s])=>s.startsWith('rts_wall_part'))){const a=atts[slot];if(a.type==='mesh'){const h=original.wallKit.sizes[a.path][1]*1.5;for(let i=0;i<3;i++){close(a.vertices[i*2],a.vertices[(i+3)*2]);close(a.vertices[i*2+1]-a.vertices[(i+3)*2+1],h);}const cut=[42,38,39][Number(skin.name.slice(-1))-1];close(a.vertices[4]-a.vertices[2],(original.wallKit.sizes[a.path][0]-cut)*1.5);}}
  }
  assert(json.skeleton.width>original.wallKit.originalHeader.width,'Culling bounds cover the complete extended run');
  assert.deepEqual(Kit.source(json),Kit.source(original),'Original skeleton, effects and clips remain recoverable');
 }
 for(const run of [{left:-1,right:1,gate:true,start:'post',end:'post'},{left:0,right:0,gate:false,start:'post',end:'post'},{left:32,right:32,gate:true,start:'post',end:'post'},{left:1,right:1,gate:true,start:'post',end:'post',spacing:0}])assert(!Kit.validRun(run));
});

test('gate top and end caps form a rigid volume with constant thickness for both opening directions',()=>{
 const base=read(dir+'cq1.json'),source=Kit.install(base,Kit.layout(null)),north=Facing.mirrorJson(source);
 for(const json of [source,north])for(const [level,skinName]of fixture.aliases.entries())for(const side of ['left','right']){
  const skin=json.skins.find(s=>s.name===skinName),slot='rts_wall_leaf_'+side,name=side==='left'?'men1_3':'men1_2';
  for(const face of ['','_back','_top','_end','_shadow'])assert(skin.attachments[slot+face]?.[name],'Each leaf has its face, back, top, end and ground shadow');
  for(const animation of ['open','open_night','shut','shut_night'])for(let frame=0;frame<=20;frame++){
   const posed=suffix=>{const a=skin.attachments[slot+suffix][name],d=json.animations[animation].deform[skinName][slot+suffix][name][frame].vertices;return a.vertices.map((v,i)=>v+d[i]);},front=posed(''),back=posed('_back'),top=posed('_top');
   for(let i=0;i<8;i+=2){const dx=(back[i]-front[i])/2,dy=(back[i+1]-front[i+1])/2,t=(dx-dy/K)/2,n=(-dx-dy/K)/2;close(Math.hypot(t,n),[4,5,6][level]);}
   const ht=side==='left'?6:0,ft=side==='left'?0:6;
   close(top[0],front[ht]);close(top[1],front[ht+1]);close(top[2],front[ft]);close(top[3],front[ft+1]);close(top[4],back[ft]);close(top[5],back[ft+1]);close(top[6],back[ht]);close(top[7],back[ht+1]);
  }
 }
});
