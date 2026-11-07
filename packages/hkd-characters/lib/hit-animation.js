'use strict';
const clone=value=>JSON.parse(JSON.stringify(value));
function duration(value){let result=0;function visit(v){if(!v||typeof v!=='object')return;if(typeof v.time==='number')result=Math.max(result,v.time);Object.values(v).forEach(visit);}visit(value);return result;}
function reaction(rig){
  const authored=rig.animations.hit;
  // Monster packs supply both the recoiling pose and alternating colored /
  // translucent white Hit sprites. Keep these frames at their authored speed.
  if(authored&&(rig.slots||[]).some(s=>/(?:^|\/)Hit(?:_2)?$/.test(s.name))){const hit=clone(authored);delete hit.events;return hit;}
  // Character Maker calls this pose "stun". Compress it into a brief damage
  // reaction, then flash the actual equipped pieces using Spine two-color tint.
  const hit=clone(authored||{}),from=duration(hit),length=.24;
  function retime(v){if(!v||typeof v!=='object')return;if(typeof v.time==='number')v.time=from?Number((v.time*length/from).toFixed(7)):v.time;Object.values(v).forEach(retime);}retime(hit);delete hit.events;
  hit.slots=hit.slots||{};
  for(const slot of rig.slots||[]){
    if(/(?:^|\/)(?:Shadow|Dead)$/.test(slot.name))continue;
    slot.dark='000000';
    const channel=hit.slots[slot.name]||(hit.slots[slot.name]={}),colors=channel.color||[{time:0,color:slot.color||'ffffffff'}];
    const times=[...new Set([0,.035,.12,length,...colors.map(f=>f.time||0)])].sort((a,b)=>a-b);
    const light=time=>{let previous=colors[0];for(const next of colors){if((next.time||0)>time){const ratio=previous.curve==='stepped'?0:(time-(previous.time||0))/((next.time||0)-(previous.time||0));return [0,2,4,6].map(at=>Math.round(parseInt(previous.color.slice(at,at+2),16)*(1-ratio)+parseInt(next.color.slice(at,at+2),16)*ratio).toString(16).padStart(2,'0')).join('');}previous=next;}return previous.color;};
    channel.twoColor=times.map(time=>{const strength=time<=.035?.65:time>=.12?0:.65*(.12-time)/.085;const value=Math.round(strength*255).toString(16).padStart(2,'0');return{time,light:light(time),dark:value.repeat(3)};});
    delete channel.color;
  }
  return hit;
}
module.exports={reaction,duration};
