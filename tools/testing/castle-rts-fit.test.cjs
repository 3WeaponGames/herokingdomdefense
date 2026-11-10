'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {decode}=require('../../packages/hkd-characters/lib/png-atlas');
const root=path.resolve(__dirname,'../..'),fit=require('./building-spine-fit.fixture.json').castleRts;
const dir='assets/KinghtFallIconMap/com/Ani/cb/';
const bytes=file=>fs.readFileSync(path.join(root,file));
const read=file=>JSON.parse(bytes(file).toString('utf8').replace(/^\uFEFF/,''));
const sha=v=>crypto.createHash('sha256').update(v).digest('hex');
function canonical(v){
  if(typeof v==='number')return Math.round(v*1e6)/1e6;
  if(Array.isArray(v))return v.map(canonical);
  if(v&&typeof v==='object')return Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])]));
  return v;
}
function regions(){
  const result={};let name;
  for(const line of bytes(dir+'cb.atlas').toString('utf8').split(/\r?\n/)){
    if(!line.trim())continue;
    if(!/^\s/.test(line)&&!line.includes(':')){name=line.endsWith('.png')?null:line.trim();if(name)result[name]={};}
    else if(name&&line.includes(':')){const at=line.indexOf(':'),key=line.slice(0,at).trim();if(['xy','size','orig'].includes(key))result[name][key]=line.slice(at+1).split(',').map(Number);}
  }
  return result;
}

test('castle replacements use native pack tiers 1/4/7 without stretching or moving the footprint',()=>{
  const json=read(dir+'cb.json'),atlas=regions(),page=decode(bytes(dir+fit.page));
  function pixels(region){
    const [x,y]=region.xy,[w,h]=region.size,rows=[];
    for(let row=0;row<h;row++)rows.push(page.rgba.subarray(((y+row)*page.width+x)*4,((y+row)*page.width+x+w)*4));
    return Buffer.concat(rows);
  }
  assert.deepEqual(fit.aliases.map(a=>a.packTier),[1,4,7]);
  assert.equal(sha(bytes(dir+'cb.png')),fit.sourceTextureSha256,'Keep all original atlas pixels and effects');
  for(const alias of fit.aliases){
    const skin=json.skins.find(s=>s.name===alias.alias);assert(skin);
    const body=skin.attachments[alias.slot][alias.slot],old=json.skins.find(s=>s.name===alias.skin).attachments[alias.slot][alias.slot];
    const xs=old.vertices.filter((_,i)=>i%2===0),ys=old.vertices.filter((_,i)=>i%2===1);
    assert.equal(body.width,Math.max(...xs)-Math.min(...xs));assert.equal(body.x,(Math.min(...xs)+Math.max(...xs))/2);
    assert(Math.abs(body.y-body.height/2-Math.min(...ys))<.000001,'Keep authored ground contact');
    assert.equal(body.path,alias.region);assert.deepEqual(atlas[body.path].orig,alias.sourceSize);
    assert(Math.abs(body.width/body.height-alias.sourceSize[0]/alias.sourceSize[1])<.000001,'Preserve source proportions');
    assert.equal(sha(pixels(atlas[body.path])),alias.sourcePixels,'Use the selected native pixels without repainting');
    assert.deepEqual(Object.keys(skin.attachments).sort(),(alias.packTier===1?[alias.slot]:[alias.slot,...fit.slots]).sort(),'No obsolete flags or windows remain');
    if(alias.packTier>1)assert.deepEqual(skin.attachments.rts_castle_windows.rts_castle_windows,{...body,path:alias.region+'_lights'});
    for(const a of Object.values(json.animations))assert.equal(a.deform?.[alias.alias],undefined,'No sliding window deformation');
  }
  for(const frame of fit.frames){assert.deepEqual(atlas[frame.region].orig,frame.size);assert.equal(sha(pixels(atlas[frame.region])),frame.pixels,'Keep each cloth source frame intact');}
  const meta=read(dir+'cb.json.meta'),texture=read(dir+fit.page+'.meta');
  assert.equal(meta.textures[1],texture.uuid);assert.deepEqual([page.width,page.height],[texture.width,texture.height]);
  assert.equal(texture.premultiplyAlpha,false);assert.equal(texture.packable,false);assert.equal(texture.wrapMode,'clamp');assert.equal(texture.filterMode,'bilinear');
});

test('source flag hoists, night lighting and destruction follow the existing castle motion',()=>{
  const json=read(dir+'cb.json');
  for(const slot of fit.slots)assert.equal(json.slots.find(s=>s.name===slot).bone,'bone3','New layers inherit construction motion');
  for(const alias of fit.aliases.filter(a=>a.packTier>1)){
    const skin=json.skins.find(s=>s.name===alias.alias),body=skin.attachments[alias.slot][alias.slot];
    const [sourceX,sourceY]=alias.flagSourceXY,scale=body.width/alias.sourceSize[0];
    assert.equal(Object.keys(skin.attachments.rts_castle_flag).length,15);
    for(const frame of Object.values(skin.attachments.rts_castle_flag)){
      assert(Math.abs((frame.x-frame.width/2)-(body.x-body.width/2+sourceX*scale))<.000001,'Cloth stays on its pole');
      assert(Math.abs((frame.y+frame.height/2)-(body.y+body.height/2-sourceY*scale))<.000001,'Cloth top stays at the hoist');
      assert(Math.abs(frame.width/frame.height-59/38)<.000001);
    }
  }
  function duration(v){return v&&typeof v==='object'?Math.max(v.time||0,...Object.values(v).map(duration)):0;}
  for(const [name,a]of Object.entries(json.animations)){
    assert.equal(duration(a),fit.durations[name],name+' duration stays unchanged');
    if(name==='destroy')for(const slot of fit.slots)assert.deepEqual(a.slots[slot].attachment,[{time:.1667,name:null}]);
    else{
      const frames=a.slots.rts_castle_flag.attachment;
      assert.equal(frames[0].time,0);assert(frames.every(k=>fit.frames.some(f=>f.region===k.name)));
      if(name.startsWith('idle'))assert.equal(new Set(frames.map(k=>k.name)).size,15,'All source frames animate');
    }
  }
  assert.equal(json.animations.idle.slots.rts_castle_windows.color[0].color,'ffffff00');
  assert.deepEqual(json.animations.Fade_in.slots.rts_castle_windows,json.animations.Fade_in.slots.cc_1_1);
  assert.equal(json.animations.idle_night.slots.rts_castle_flag.color[0].color,'a7a7a7ff');
  const aliases=new Set(fit.aliases.map(a=>a.alias));
  for(const skin of json.skins.filter(s=>!aliases.has(s.name)))for(const slot of fit.slots)assert.equal(skin.attachments[slot],undefined,'No RTS layers leak into original skins');
});

test('both castle configurations retain every gameplay field after visual rebinding',()=>{
  for(const file of ['assets/KinghtFallConfig/GameJsonCfg.json','assets/configs/GameJsonCfg.json']){
    const castle=read(file).BuildEnum['1'];assert.equal(castle.levelList.length,3);
    for(const alias of fit.aliases){const row=castle.levelList.find(r=>r.level===Number(alias.alias.slice(-1)));assert.equal(row.Skin,alias.alias);row.Skin=alias.skin;}
    assert.equal(sha(JSON.stringify(canonical(castle))),fit.gameplay,'Keep stats, Zoom, IDs, costs, progression, timing and unknown fields');
  }
});
