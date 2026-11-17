"use strict";
// Pixel-to-world placement shared by Cocos and the Skills canvas preview.
var Catalog=require("./HeroSkillVFXCatalog"),Settings=require("./HeroSkillSettings"),Projectile=require("./HeroSkillProjectile");
function clipFor(id){return Catalog.clips.filter(function(clip){return clip.uuid===id||clip.id===id;})[0]||null;}
function phaseClips(slot,selected,phase){
  if(!selected)return [null];
  if(slot==="beam"&&selected.slot==="beam"&&selected.id.indexOf("mystic-beam-")===0)return Catalog.clips.filter(function(clip){return clip.id.indexOf("mystic-beam-")===0&&clip.phase===phase;});
  if((slot==="mark"||slot==="shield"||slot==="physicalShield")&&selected.slot===slot){var found=Catalog.clips.filter(function(clip){return clip.group===selected.group&&clip.phase===phase;});if(found.length)return found;}
  return [selected];
}
function duration(clip){return clip?clip.duration||clip.frames/clip.fps:1;}
function nativeClock(style,slot){return slot==="cast"&&(style==="skirmisher"||style==="vanguard");}
function sourceRange(clip){var full=duration(clip),start=Math.max(0,clip&&clip.trimStart||0,clip&&clip.sourceStart||0),end=clip&&typeof clip.sourceEnd==='number'&&isFinite(clip.sourceEnd)?Math.min(full,clip.sourceEnd):full;return{start:start,end:Math.max(start+.001,end)};}
function visibleDuration(clip,style,slot){if(nativeClock(style,slot))return Math.max(.001,duration(clip));var range=sourceRange(clip);return Math.max(.001,range.end-range.start);}
function sourceTime(clip,age,loop,style,slot){if(!clip||nativeClock(style,slot))return age;var range=sourceRange(clip),span=range.end-range.start,time=Math.max(0,age);return range.start+(loop?time%span:Math.min(span,time));}
function playbackRate(visual,slot,style){
  // Native arrow and spear use shared source-clock remapping. Volley playback
  // changes only Skirmisher art; Vanguard duration also retimes its contacts.
  if(slot==="cast"&&(style==="skirmisher"||style==="vanguard"))return 1;
  return Settings.playbackRate(visual&&visual[slot+"PlaybackRate"]);
}
function frameVisual(visual,slot,clip){var result=Settings.resourceVisual(visual,slot+"Resource");if(clip){var wrapped={};Settings.applyClip(wrapped,"resource",clip);Object.assign(result,wrapped);}return result;}
function entities(frame,visual,context){
  context=context||{};var result=[],hero=context.hero||{x:0,y:0};
  (frame.entities||[]).forEach(function(entity){
    var slot=entity.slot,resource=visual[slot+"Resource"];if(!resource)return;
    phaseClips(slot,clipFor(resource),entity.phase).forEach(function(clip){
      var v=frameVisual(visual,slot,clip),rate=playbackRate(visual,slot,entity.style||context.style),style=entity.style||context.style,base={key:entity.key+":"+(clip?clip.id:resource),slot:slot,clip:clip,visual:v,age:entity.age*rate,loop:!clip||clip.loop,scale:entity.scale,scaleX:v.scaleX===undefined?1:v.scaleX,scaleY:v.scaleY===undefined?1:v.scaleY,opacity:entity.opacity,angle:v.rotation||0,x:hero.x+(v.offsetX||0),y:hero.y+(v.offsetY||0),anchorX:clip?clip.anchorX:.5,anchorY:clip?clip.anchorY:.5,behind:(slot==="passive"||slot==="buff")&&style!=="fighter"&&style!=="vanguard"};
      if(v.flipX)base.scaleX*=-1;if(v.flipY)base.scaleY*=-1;
      if(style==="bruiser"&&slot==="passive")base.behind=false;
      if(clip&&clip.referenceCell&&clip.cell)base.scale=(base.scale===undefined?1:base.scale)*clip.referenceCell/clip.cell;
      if(entity.phase==="start"&&typeof entity.progress==="number")base.age=Math.min(.999999,entity.progress)*visibleDuration(clip,entity.style||context.style,slot);
      if(entity.phase==="end")base.age=Math.min(.999999,entity.progress||0)*visibleDuration(clip,entity.style||context.style,slot);
      base.age=sourceTime(clip,base.age,base.loop,entity.style||context.style,slot);
      if(slot==="beam"){
        if(!entity.from||!entity.to)return;var from=entity.from,to=entity.to,dx=to.x-from.x,dy=to.y-from.y,length=Math.hypot(dx,dy);if(length<.01)return;
        var part=clip&&clip.part||"body";base.x=(part==="target"?to:from).x+(v.offsetX||0);base.y=(part==="target"?to:from).y+(v.offsetY||0);
        if(part==="body"){
          var cell=clip?clip.cell:128,sx=clip?clip.startX:.0,sy=clip?clip.startY:.5,ex=clip?clip.endX:1,ey=clip?clip.endY:.5,span=Math.max(1,Math.hypot(ex-sx,ey-sy)*cell);
          base.anchorX=sx;base.anchorY=sy;base.scaleX=length/span/Math.max(.01,v.scale||1)*(v.scaleX===undefined?1:v.scaleX);base.scaleY=(visual.beamWidth||24)/cell*(v.scaleY===undefined?1:v.scaleY);var beamBasis=Projectile.facingTransform({x:dx,y:dy},-Math.atan2(ey-sy,ex-sx)*180/Math.PI+(v.rotation||0),base.scaleX,base.scaleY);base.angle=beamBasis.angle;base.scaleX=beamBasis.scaleX;base.scaleY=beamBasis.scaleY;
        }
      }else if(slot==="cast"||slot==="castSecondary"){
        var center=entity.origin||entity.target;if(!center)return;
        var direction=entity.direction||{x:1,y:0},offset=style==='vanguard'?Projectile.facingOffset(direction,{x:v.offsetX,y:v.offsetY}):{x:v.offsetX||0,y:v.offsetY||0};
        base.x=center.x+offset.x;base.y=center.y+offset.y;
        var correction=clip&&typeof clip.forwardX==='number'?Math.atan2(clip.forwardY*(v.scaleY===undefined?1:v.scaleY),clip.forwardX*(v.scaleX===undefined?1:v.scaleX))*180/Math.PI:0;
        if(entity.style!=="mystic"){var castBasis=Projectile.facingTransform(direction,(v.rotation||0)-correction,base.scaleX,base.scaleY);base.angle=castBasis.angle;base.scaleX=castBasis.scaleX;base.scaleY=castBasis.scaleY;base.mirrored=castBasis.mirrored;}
        if(style==='vanguard'){var offsetBasis=Projectile.facingTransform(direction,0,1,1),oa=offsetBasis.angle*Math.PI/180;base.offsetAxes={x:{x:Math.cos(oa),y:Math.sin(oa)},y:{x:-Math.sin(oa)*offsetBasis.scaleY,y:Math.cos(oa)*offsetBasis.scaleY}};}
        if(entity.style!=="skirmisher"&&entity.radius>0){var extent=clip&&clip.kind==="spine"?Math.max(clip.width,clip.height):clip?clip.cell:128;base.scale=entity.radius*2/Math.max(1,extent);}
        if(clip&&/^skirmisher-atx117(?:-single)?$/.test(clip.trajectory||'')){
          var radians=base.angle*Math.PI/180,px=(clip.originX||0)*(v.scale||1)*base.scaleX,py=(clip.originY||0)*(v.scale||1)*base.scaleY;
          base.x-=px*Math.cos(radians)-py*Math.sin(radians);base.y-=px*Math.sin(radians)+py*Math.cos(radians);
        }
        if(clip&&typeof clip.sourcePivotX==='number'&&typeof clip.sourcePivotY==='number'){
          base.pivotX=base.x;base.pivotY=base.y;var pivotAngle=base.angle*Math.PI/180,pivotScale=(v.scale||1)*(base.scale===undefined?1:base.scale),pivotX=clip.sourcePivotX*pivotScale*base.scaleX,pivotY=clip.sourcePivotY*pivotScale*base.scaleY;
          base.x-=pivotX*Math.cos(pivotAngle)-pivotY*Math.sin(pivotAngle);base.y-=pivotX*Math.sin(pivotAngle)+pivotY*Math.cos(pivotAngle);
        }
        if(clip&&clip.kind==="spine"){delete base.anchorX;delete base.anchorY;}
      }else if(slot==="shield"||slot==="physicalShield"||slot==="defense"||slot==="buff"&&context.style!=="vanguard"&&context.style!=="fighter"){
        var body=context.heroBody||{x:hero.x,y:hero.y+80};base.x=body.x+(v.offsetX||0);base.y=body.y+(v.offsetY||0);
      }else if(slot==="mark"||slot==="taunt"||slot==="channelHit"||slot==="presence"){
        if(!entity.target)return;base.x=entity.target.x+(v.offsetX||0);base.y=entity.target.y+(v.offsetY||0);
        // Gold Aura was exported around its ground emitter. Center its sheet
        // on the torso attachment so the whole buff does not float overhead.
        if(slot==="presence"&&clip&&clip.id==="guardian-gold-presence")base.anchorY=.5;
      }
      // Body, ground and overhead effects have no travel direction. Mirror
      // around their own attachment origin while retaining world-space offsets.
      if(context.facing<0&&!((slot==="cast"||slot==="castSecondary")&&entity.style!=="mystic")&&!(slot==="beam"&&(!clip||!clip.part||clip.part==="body"))){base.scaleX*=-1;base.angle*=-1;base.mirrored=true;}
      // Native exports may use a remote origin. Center the painted envelope
      // at the authored attachment without modifying any source bones/meshes.
      var centered=clip&&clip.kind==='spine'&&!clip.trajectory&&typeof clip.sourceCenterX==='number'&&typeof clip.sourceCenterY==='number',editablePivot=style==="bruiser"&&(slot==="cast"||slot==="castSecondary");
      if(centered||editablePivot){
        // Transform the chosen source point with the exact signed artwork
        // basis, then place it on the captured hit origin. A world-space
        // translation here would orbit away from the indicator when aiming.
        base.pivotX=base.x;base.pivotY=base.y;var radians=base.angle*Math.PI/180,scale=(v.scale||1)*(base.scale===undefined?1:base.scale),px=((centered?clip.sourceCenterX:0)+(editablePivot?v.pivotX||0:0))*scale*base.scaleX,py=((centered?clip.sourceCenterY:0)+(editablePivot?v.pivotY||0:0))*scale*base.scaleY;
        base.x-=px*Math.cos(radians)-py*Math.sin(radians);base.y-=px*Math.sin(radians)+py*Math.cos(radians);
      }
      result.push(base);
    });
  });return result;
}
exports.entities=entities;exports.clipFor=clipFor;exports.phaseClips=phaseClips;
exports.playbackRate=playbackRate;

exports.visibleDuration=visibleDuration;exports.sourceTime=sourceTime;exports.sourceRange=sourceRange;
