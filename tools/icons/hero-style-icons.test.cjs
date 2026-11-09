'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{test}=require('node:test'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../..'),PNG=require('../../packages/hkd-characters/lib/png-atlas');
test('each of the eighteen style bonuses uses its own transparent 128px stat icon and an imported stable sprite frame',()=>{
 const cfg=require('../../assets/KinghtFallConfig/GameJsonCfg.json'),registry=require('./stats-icons.catalog.json'),rows=cfg.TalentLevelCfg.filter(row=>row.OptionalBranch),references=new Set(),ids=new Set();assert.equal(rows.length,18);
 for(const row of rows){const definition=cfg.TalentCfg[row.kindID],reference='@icon/Stats Icons/hero-'+row.HeroStyle+'-'+row.HeroStat;assert.equal(definition.Image,reference);assert(!references.has(reference));references.add(reference);
  const record=registry.icons.find(icon=>icon.reference===reference);assert(record);const file=path.join(root,record.image),bytes=fs.readFileSync(file),image=PNG.decode(bytes);assert.equal(image.width,128);assert.equal(image.height,128);assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),record.sha256);
  const alpha=[];for(let i=3;i<image.rgba.length;i+=4)alpha.push(image.rgba[i]);assert(alpha.some(value=>value===0));assert(alpha.some(value=>value>=250));
  const meta=JSON.parse(fs.readFileSync(file+'.meta')),frame=Object.values(meta.subMetas)[0];assert.equal(meta.importer,'texture');assert.equal(meta.type,'sprite');assert.equal(frame.trimType,'none');assert.equal(frame.rawTextureUuid,meta.uuid);assert.equal(frame.width,128);for(const id of [meta.uuid,frame.uuid]){assert(!ids.has(id));ids.add(id);}
 }
});
test('resizing stat artwork retains transparency and premultiplies edge colors instead of producing dark halos',()=>{
 const resize=require('./import-style-icons.cjs').resize,image={width:2,height:2,rgba:Buffer.from([255,0,0,255,0,0,0,0,255,0,0,255,0,0,0,0])};assert.deepEqual([...resize(image,1).rgba],[255,0,0,128]);
});
