"use strict";
// Pixel-to-world placement shared by Cocos and the Skills canvas preview.
var Catalog=require("./HeroSkillVFXCatalog"),Settings=require("./HeroSkillSettings");
function clipFor(id){return Catalog.clips.filter(function(clip){return clip.uuid===id||clip.id===id;})[0]||null;}
function phaseClips(slot,selected,phase){
  if(!selected)return [null];
  if(slot==="beam"&&selected.slot==="beam")return Catalog.clips.filter(function(clip){return clip.slot==="beam"&&clip.phase===phase;});
  if((slot==="mark"||slot==="shield")&&selected.slot===slot){var found=Catalog.clips.filter(function(clip){return clip.group===selected.group&&clip.phase===phase;});if(found.length)return found;}
  return [selected];
}
function duration(clip){return clip?clip.frames/clip.fps:1;}
function frameVisual(visual,slot,clip){var result=Settings.resourceVisual(visual,slot+"Resource");if(clip){var wrapped={};Settings.applyClip(wrapped,"resource",clip);Object.assign(result,wrapped);}return result;}
function entities(frame,visual,context){
  context=context||{};var result=[],hero=context.hero||{x:0,y:0};
  (frame.entities||[]).forEach(function(entity){
    var slot=entity.slot,resource=visual[slot+"Resource"];if(!resource)return;
    phaseClips(slot,clipFor(resource),entity.phase).forEach(function(clip){
      var v=frameVisual(visual,slot,clip),base={key:entity.key+":"+(clip?clip.id:resource),slot:slot,clip:clip,visual:v,age:entity.age,loop:!clip||clip.loop,scale:entity.scale,scaleX:v.scaleX===undefined?1:v.scaleX,scaleY:v.scaleY===undefined?1:v.scaleY,opacity:entity.opacity,angle:v.rotation||0,x:hero.x+(v.offsetX||0),y:hero.y+(v.offsetY||0),anchorX:clip?clip.anchorX:.5,anchorY:clip?clip.anchorY:.5,behind:slot==="passive"||slot==="buff"};
      if(entity.phase==="start"&&typeof entity.progress==="number")base.age=Math.min(.999999,entity.progress)*duration(clip);
      if(entity.phase==="end")base.age=Math.min(.999999,entity.progress||0)*duration(clip);
      if(slot==="beam"){
        if(!entity.from||!entity.to)return;var from=entity.from,to=entity.to,dx=to.x-from.x,dy=to.y-from.y,length=Math.hypot(dx,dy);if(length<.01)return;
        var part=clip&&clip.part||"body";base.x=(part==="target"?to:from).x+(v.offsetX||0);base.y=(part==="target"?to:from).y+(v.offsetY||0);
        if(part==="body"){
          var cell=clip?clip.cell:128,sx=clip?clip.startX:.0,sy=clip?clip.startY:.5,ex=clip?clip.endX:1,ey=clip?clip.endY:.5,span=Math.max(1,Math.hypot(ex-sx,ey-sy)*cell);
          base.anchorX=sx;base.anchorY=sy;base.scaleX=length/span/Math.max(.01,v.scale||1);base.scaleY=(visual.beamWidth||24)/cell;base.angle=Math.atan2(dy,dx)*180/Math.PI-Math.atan2(ey-sy,ex-sx)*180/Math.PI+(v.rotation||0);
        }
      }else if(slot==="mark"||slot==="taunt"){
        if(!entity.target)return;base.x=entity.target.x+(v.offsetX||0);base.y=entity.target.y+(v.offsetY||0);
      }
      result.push(base);
    });
  });return result;
}
exports.entities=entities;exports.clipFor=clipFor;exports.phaseClips=phaseClips;
