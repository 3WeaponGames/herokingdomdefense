'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../..'),config=require('../../assets/KinghtFallConfig/GameJsonCfg.json');
const Settings=require('../../assets/_script/HeroSkillSettings'),Sounds=require('../../assets/_script/BattleSoundCatalog');
function audio(resource){
 const base=path.join(root,'assets/KinghtFallAudio',resource),directory=path.dirname(base),name=path.basename(base);
 const files=fs.readdirSync(directory).filter(file=>file.startsWith(name+'.')&&!file.endsWith('.meta'));
 assert.equal(files.length,1,'Each resource must resolve to one audio asset: '+resource);
 const file=path.join(directory,files[0]);assert(['.ogg','.mp3'].includes(path.extname(file)),'The Windows native decoder cannot read '+file);
 const bytes=fs.readFileSync(file);assert(bytes.length>128);if(file.endsWith('.ogg')){assert.equal(bytes.toString('ascii',0,4),'OggS');assert(bytes.subarray(0,64).includes(Buffer.from('vorbis')));}
 return JSON.parse(fs.readFileSync(file+'.meta','utf8'));
}
test('all six saved hero skills and the Mystic channel reference native-compatible audio with their original UUIDs',()=>{
 const before=JSON.stringify(config);let skills=0,channels=0;
 for(const style of Settings.styles){const settings=Settings.effective(style.id,config);assert(settings.audio.cast.clip,style.id+' has no cast sound');skills++;
  for(const [phase,cue]of Object.entries(settings.audio)){if(!cue.clip)continue;assert.equal(cue.bundle,'KinghtFallAudio');assert.equal(audio(cue.path).uuid,cue.clip,style.id+' '+phase+' reference changed');if(phase==='channel')channels++;}
 }
 assert.equal(skills,6);assert.equal(channels,1);assert.equal(JSON.stringify(config),before,'Inspecting skills must never rewrite saved settings');
});
test('every battle sound resource uses a format supported by the Windows simulator',()=>{
 for(const effect of Object.values(Sounds.effects))audio(effect.path);
});
