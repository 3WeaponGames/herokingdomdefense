'use strict';
// Explicit publication plan for existing fitted staves; opening tools never
// runs this migration. Future character/item saves annotate during the bake.
const fs=require('fs'),path=require('path'),URL=require('url'),Bake=require('../../packages/hkd-characters/lib/native-bake'),Tips=require('../../packages/hkd-characters/lib/opaque-tip'),Doc=require('../../packages/game-data-editor/lib/json-document');
function plan(root){
 const folder=path.join(root,'assets/resources/hero-items/baked'),files=new Map(),reads=new Map(),read=file=>{file=path.resolve(file);if(!reads.has(file))reads.set(file,fs.readFileSync(file));return reads.get(file);};
 for(const name of fs.readdirSync(folder).filter(name=>/^item-4-tier-.+-mystic_.+\.json$/.test(name))){
  const full=path.join(folder,name),text=read(full).toString('utf8'),before=JSON.parse(text),next=structuredClone(before),atlas=read(full.replace(/\.json$/,'.atlas')).toString('utf8'),pages={};
  const lines=atlas.split(/\r?\n/);for(let i=0;i<lines.length;i++)if(lines[i].trim()&&(i===0||!lines[i-1].trim())&&/^size:/.test(lines[i+1]||'')){const page=lines[i].trim();if(path.basename(page)!==page)throw Error('Atlas page escapes its directory');pages[page]=URL.pathToFileURL(path.join(folder,page)).href;}
  const cut=Bake.readAtlas({atlas,pages},read),pictures={};
  for(const skin of next.skins||[])for(const [slot,variants]of Object.entries(skin.attachments||{}))if(/(?:^|\/)Staff$/.test(slot))for(const [key,attachment]of Object.entries(variants)){const region=attachment.path||key;if(!pictures[region])pictures[region]=cut(region);}
  Tips.annotate(next,pictures);if(!Doc.equal(before,next))files.set(path.relative(root,full).replace(/\\/g,'/'),Doc.patch(text,before,next));
 }
 return{files,reads};
}
exports.plan=plan;
