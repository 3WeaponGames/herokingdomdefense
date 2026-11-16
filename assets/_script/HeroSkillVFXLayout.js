"use strict";
// Pixel-to-world placement shared by Cocos and the Skills canvas preview.
var Catalog=require("./HeroSkillVFXCatalog"),Settings=require("./HeroSkillSettings");
function clipFor(id){return Catalog.clips.filter(function(clip){return clip.uuid===id||clip.id===id;})[0]||null;}
function phaseClips(slot,selected,phase){
  if(!selected)return [null];
  if(slot==="beam"&&selected.slot==="beam"&&selected.id.indexOf("mystic-beam-")===0)return Catalog.clips.filter(function(clip){return clip.id.indexOf("mystic-beam-")===0&&clip.phase===phase;});
  if((slot==="mark"||slot==="shield"||slot==="physicalShield")&&selected.slot===slot){var found=Catalog.clips.filter(function(clip){return clip.group===selected.group&&clip.phase===phase;});if(found.length)return found;}
  return [selected];
}
function duration(clip){return clip?clip.duration||clip.frames/clip.fps:1;}
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
          base.anchorX=sx;base.anchorY=sy;base.scaleX=length/span/Math.max(.01,v.scale||1)*(v.scaleX===undefined?1:v.scaleX);base.scaleY=(visual.beamWidth||24)/cell*(v.scaleY===undefined?1:v.scaleY);base.angle=Math.atan2(dy,dx)*180/Math.PI-Math.atan2(ey-sy,ex-sx)*180/Math.PI+(v.rotation||0);
        }
      }else if(slot==="cast"){
        var center=entity.origin||entity.target;if(!center)return;
        base.x=center.x+(v.offsetX||0);base.y=center.y+(v.offsetY||0);
        var direction=entity.direction||{x:1,y:0};base.angle+=entity.style==="mystic"?0:Math.atan2(direction.y,direction.x)*180/Math.PI;
        if(entity.style!=="skirmisher"&&entity.radius>0){var extent=clip&&clip.kind==="spine"?Math.max(clip.width,clip.height):clip?clip.cell:128;base.scale=entity.radius*2/Math.max(1,extent);}
        if(clip&&clip.trajectory==="skirmisher-atx117"){
          var radians=base.angle*Math.PI/180,px=(clip.originX||0)*(v.scale||1)*base.scaleX,py=(clip.originY||0)*(v.scale||1)*base.scaleY;
          base.x-=px*Math.cos(radians)-py*Math.sin(radians);base.y-=px*Math.sin(radians)+py*Math.cos(radians);
        }
        if(clip&&clip.kind==="spine"){delete base.anchorX;delete base.anchorY;}
      }else if(slot==="shield"||slot==="physicalShield"||slot==="defense"||slot==="buff"&&context.style!=="vanguard"){
        var body=context.heroBody||{x:hero.x,y:hero.y+80};base.x=body.x+(v.offsetX||0);base.y=body.y+(v.offsetY||0);
      }else if(slot==="mark"||slot==="taunt"||slot==="channelHit"||slot==="presence"){
        if(!entity.target)return;base.x=entity.target.x+(v.offsetX||0);base.y=entity.target.y+(v.offsetY||0);
      }
      result.push(base);
    });
  });return result;
}
exports.entities=entities;exports.clipFor=clipFor;exports.phaseClips=phaseClips;
