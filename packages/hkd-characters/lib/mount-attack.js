'use strict';
function duration(animation){let end=0;function visit(value){if(!value||typeof value!=='object')return;if(typeof value.time==='number')end=Math.max(end,value.time);Object.values(value).forEach(visit);}visit(animation);return end;}
function landmarks(animation,maker){
  const tracks=animation&&animation.bones&&(maker?animation.bones['Rider/Mount/Mount']:animation.bones.bone),frames=tracks&&tracks.translate;
  if(!frames||frames.length<3)return null;
  const range=key=>Math.max(...frames.map(frame=>frame[key]||0))-Math.min(...frames.map(frame=>frame[key]||0)),axis=maker||range('x')>range('y')?'x':'y';
  let peak=0;for(let i=1;i<frames.length;i++)if((frames[i][axis]||0)>(frames[peak][axis]||0)+1e-5)peak=i;
  if(!peak||(frames[peak][axis]||0)-(frames[0][axis]||0)<1e-5)return null;
  let windup=0;for(let i=1;i<peak;i++)if(maker?Math.abs((frames[i][axis]||0)-(frames[0][axis]||0))<1e-5:(frames[i][axis]||0)<(frames[windup][axis]||0))windup=i;
  const end=duration(animation),back=frames[windup].time||0,forward=frames[peak].time||0;
  return back>0&&forward>back&&end>forward?{windup:back,peak:forward,end}:null;
}
// Match preparation, forward thrust and recovery to the shared Maker mount
// clip. Slowing only the whole horse clip would leave it out of phase at the
// next loop; each segment is fitted inside the same complete attack cycle.
function synchronize(animation,reference){
  const source=landmarks(animation,false),target=landmarks(reference,true);if(!source||!target)return null;
  if(['windup','peak','end'].every(key=>Math.abs(source[key]-target[key])<1e-6))return{source,target};
  const from=[0,source.windup,source.peak,source.end],to=[0,target.windup,target.peak,target.end];
  function retime(value){if(!value||typeof value!=='object')return;if(typeof value.time==='number'){const time=value.time;let segment=1;while(segment<3&&time>from[segment])segment++;const fraction=(time-from[segment-1])/(from[segment]-from[segment-1]);value.time=Number((to[segment-1]+fraction*(to[segment]-to[segment-1])).toFixed(7));}Object.values(value).forEach(retime);}
  retime(animation);return{source,target};
}
module.exports={synchronize,landmarks};
