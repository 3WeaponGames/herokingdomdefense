"use strict";
// Shared gameplay events and visual source clocks for battle and preview.
// Skirmisher releases all five arrows together. Vanguard's duration retimes
// its five authored contacts without changing the rider attack-speed multiplier.
var THRUSTS=[.4333333333,.5333333333,.5666666667,.6333333333,.8666666667];
var VFXCatalog=require('./HeroSkillVFXCatalog');
function finite(v,f){return typeof v==="number"&&isFinite(v)?v:f;}
function count(v,f){return Math.max(1,Math.min(100,Math.floor(finite(v,f))));}
function skirmisherSchedule(t){return[Math.max(0,finite(t&&t.contactDelay,0))+Math.max(0,finite(t&&t.windup,.2))];}
function vanguardSchedule(t){t=t||{};var n=count(t.strikes,5),duration=Math.max(.001,finite(t.duration,4/3)),result=[];for(var i=0;i<n;i++)result.push(Math.max(0,finite(t.contactDelay,0))+(n===5?THRUSTS[i]*duration/(4/3):duration*(i+1)/n));return result;}
function nextTime(active){return !active?Infinity:active.schedule&&active.emitted<active.schedule.length?active.schedule[active.emitted]:active.duration;}
function mysticRadius(charges,t,heroWidth){
  t=t||{};var width=Math.max(1,finite(heroWidth,100)),base=Math.max(1,finite(t.splashRadius,width)),growth=Math.max(0,finite(t.splashRadiusPerCharge,width*.1));
  return base+Math.max(0,finite(charges,0))*growth;
}
function mysticImpactDelay(t,v){
  t=t||{};v=v||{};var source=Math.max(0,finite(t.explosionTime,.76666665)),clip=VFXCatalog.clips.filter(function(clip){return clip.uuid===v.castResource||clip.id===v.castResource;})[0],start=Math.max(0,finite(clip&&clip.trimStart,0),finite(clip&&clip.sourceStart,0)),rate=finite(v.castPlaybackRate,1);if(rate<.05||rate>4)rate=1;
  return Math.max(0,source-start)/rate;
}
function mysticImpactTime(t,v){return Math.max(0,finite(v&&v.castDelay,0))+Math.max(0,finite(t&&t.contactDelay,0))+mysticImpactDelay(t,v);}
function selectedCast(v){var id=v&&v.castResource;return VFXCatalog.clips.filter(function(clip){return clip.uuid===id||clip.id===id;})[0]||null;}
function usesAuthoredArrows(v){return !!v&&/^skirmisher-atx117(?:-single)?$/.test(v.castTrajectory||'');}
function skirmisherSourceTime(elapsed,t,v){
  t=t||{};v=v||{};var time=elapsed-Math.max(0,finite(v.castDelay,0)),clip=selectedCast(v),rate=Math.max(.05,finite(t.volleyPlayback,1));if(time<0)return time;
  if(!usesAuthoredArrows(v))return time*rate;
  var release=finite(clip&&clip.sourceRelease,v.castTrajectory==='skirmisher-atx117'?2/3:.09333333333333349),start=Math.max(0,finite(clip&&clip.trimStart,0)),windup=Math.max(0,finite(t.windup,.2))+Math.max(0,finite(t.contactDelay,0));
  return windup>0&&time<windup?start+time/windup*(release-start):release+(time-windup)*rate;
}
function skirmisherVFXEnd(t,v){t=t||{};v=v||{};var clip=selectedCast(v),rate=Math.max(.05,finite(t.volleyPlayback,1)),end=finite(clip&&clip.duration,.56),delay=Math.max(0,finite(v.castDelay,0));if(!usesAuthoredArrows(v))return delay+Math.max(.001,end-Math.max(0,finite(clip&&clip.trimStart,0)))/rate;var release=finite(clip&&clip.sourceRelease,v.castTrajectory==='skirmisher-atx117'?2/3:.09333333333333349);return delay+Math.max(0,finite(t.contactDelay,0))+Math.max(0,finite(t.windup,.2))+Math.max(0,end-release)/rate;}
function skirmisherReleaseTime(t,v){return Math.max(0,finite(v&&v.castDelay,0))+Math.max(0,finite(t&&t.contactDelay,0))+Math.max(0,finite(t&&t.windup,.2));}
function vanguardSourceTime(elapsed,t,v){var time=elapsed-Math.max(0,finite(v&&v.castDelay,0)),contact=Math.max(0,finite(t&&t.contactDelay,0)),rate=(4/3)/Math.max(.001,finite(t&&t.duration,4/3)),first=THRUSTS[0],firstAt=contact+first/rate;if(time<0)return time;return time<firstAt?time/Math.max(.000001,firstAt)*first:(time-contact)*rate;}
exports.skirmisherSchedule=skirmisherSchedule;exports.skirmisherSourceTime=skirmisherSourceTime;exports.skirmisherVFXEnd=skirmisherVFXEnd;exports.skirmisherReleaseTime=skirmisherReleaseTime;
exports.vanguardSchedule=vanguardSchedule;exports.vanguardSourceTime=vanguardSourceTime;exports.nextTime=nextTime;exports.mysticRadius=mysticRadius;exports.mysticImpactDelay=mysticImpactDelay;exports.mysticImpactTime=mysticImpactTime;exports.usesAuthoredArrows=usesAuthoredArrows;
