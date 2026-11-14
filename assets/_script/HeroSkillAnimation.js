"use strict";
// Gameplay and authoring previews sample the same source pose. Elapsed and
// duration are gameplay seconds; attack-rate buffs never rescale this clock.
function finite(value,fallback){return typeof value==="number"&&isFinite(value)?value:fallback;}
function rapidPose(elapsed,duration,strikes,clip){
  duration=finite(duration,2.5);if(!(duration>0))duration=2.5;
  strikes=Math.max(1,Math.floor(finite(strikes,7)));
  var end=finite(clip&&clip.end,.8333);if(!(end>0))end=.8333;
  var hit=Math.max(0,Math.min(end,finite(clip&&clip.hit,.1667)));
  var raw=Math.max(0,finite(elapsed,0)),time=Math.min(duration,raw),interval=duration/strikes;
  var epsilon=Math.min(1e-9,interval*1e-7),phase=time%interval;
  if(phase<epsilon||interval-phase<epsilon)phase=0;
  var impact=time>epsilon&&phase===0;
  var sample=time<=interval+epsilon?hit*Math.min(1,time/interval):(hit+phase*end/interval)%end;
  if(impact||time===duration)sample=hit;
  return {time:sample,elapsed:time,duration:duration,strikes:strikes,interval:interval,impact:impact||time===duration,finished:raw>duration+epsilon};
}
exports.rapidPose=rapidPose;
