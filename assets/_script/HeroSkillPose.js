"use strict";
// Pure presentation geometry shared by gameplay and the Skills preview.
// Aim rotates the weapon branch around its hand; rider and mount stay upright.
var aimed = new WeakMap();
function value(object,key,fallback){
  if(!object)return fallback;var getter="get"+key.charAt(0).toUpperCase()+key.slice(1),result=typeof object[getter]==="function"?object[getter]():object[key];
  return typeof result==="number"&&isFinite(result)?result:fallback;
}
function write(object,key,next){var setter="set"+key.charAt(0).toUpperCase()+key.slice(1);if(typeof object[setter]==="function")object[setter](next);else object[key]=next;}
function commitWorld(target){
  if(!target)return;
  // Creator's real-time browser Skeleton.updateWorldTransform() is a cache-only
  // API. The underlying Spine skeleton must commit its newly applied bones.
  var native=target._nativeSkeleton,skeleton=target._skeleton;
  if(native&&typeof native.updateWorldTransform==="function")native.updateWorldTransform();
  else if(skeleton&&typeof skeleton.updateWorldTransform==="function")skeleton.updateWorldTransform();
  else if(typeof target.updateWorldTransform==="function")target.updateWorldTransform();
}
function removeAim(target){
  var record=target&&aimed.get(target);if(!record)return;
  // A skin may replace the whole native rig. Never touch a retained Bone
  // wrapper after that skeleton asset has been disposed/replaced.
  var bone=record.identity===(target.skeletonData||target.data)&&target.findBone&&target.findBone("Rider/HandRight");
  if(bone&&Math.abs(value(bone,"rotation",record.applied)-record.applied)<1e-6)write(bone,"rotation",record.base);
  aimed.delete(target);
}
function applyAim(target,direction,mirrorX,options){
  if(!target||!target.findBone)return false;
  if(options&&options.fresh)aimed.delete(target);else removeAim(target);
  var x=direction&&direction.x,y=direction&&direction.y;
  if(typeof x!=="number"||typeof y!=="number"||!isFinite(x)||!isFinite(y)||Math.hypot(x,y)<1e-8)return false;
  var bone=target.findBone("Rider/HandRight");if(!bone)return false;
  var delta=Math.atan2(y,x*(mirrorX<0?-1:1))*180/Math.PI-(options&&value(options,"referenceAngle",0)||0);
  // Uncalibrated horizontal facing already supplies the authored pose.
  if(Math.abs(delta)<1e-8)return false;
  var base=value(bone,"rotation",0);write(bone,"rotation",base+delta);aimed.set(target,{base:base,applied:base+delta,identity:target.skeletonData||target.data});
  commitWorld(target);
  return true;
}
function localVertices(attachment){
  var offset=attachment&&(attachment.offset||typeof attachment.getOffset==="function"&&attachment.getOffset());
  if(offset&&offset.length>=8)return Array.prototype.slice.call(offset,0,8);
  var width=value(attachment,"width",0),height=value(attachment,"height",0);if(!(width>0&&height>0))return null;
  var x=value(attachment,"x",0),y=value(attachment,"y",0),sx=value(attachment,"scaleX",1),sy=value(attachment,"scaleY",1),r=value(attachment,"rotation",0)*Math.PI/180,c=Math.cos(r),s=Math.sin(r),out=[];
  [[-1,-1],[-1,1],[1,1],[1,-1]].forEach(function(corner){var px=corner[0]*width*sx/2,py=corner[1]*height*sy/2;out.push(x+px*c-py*s,y+px*s+py*c);});return out;
}
function arrowTip(target,direction,mirrorX){
  if(!target||!target.findBone)return null;
  var name="Rider/HandRight/Bow/Arrow",bone=target.findBone(name);if(!bone)return null;
  var slot=target.findSlot&&target.findSlot(name),attachment=slot&&(typeof slot.getAttachment==="function"?slot.getAttachment():slot.attachment),vertices=localVertices(attachment),x=value(bone,"worldX",0),y=value(bone,"worldY",0);
  if(!vertices)return{x:x,y:y};
  var a=value(bone,"a",NaN),b=value(bone,"b",NaN),c=value(bone,"c",NaN),d=value(bone,"d",NaN);if(!isFinite(a+b+c+d))return{x:x,y:y};
  var dx=direction&&direction.x,dy=direction&&direction.y;if(!(typeof dx==="number"&&typeof dy==="number"&&isFinite(dx+dy))){dx=1;dy=0;}dx*=mirrorX<0?-1:1;
  var length=Math.hypot(dx,dy)||1;dx/=length;dy/=length;
  var points=[],max=-Infinity;for(var i=0;i<vertices.length;i+=2){var p={x:x+vertices[i]*a+vertices[i+1]*b,y:y+vertices[i]*c+vertices[i+1]*d};p.projection=p.x*dx+p.y*dy;max=Math.max(max,p.projection);points.push(p);}
  var edge=points.filter(function(p){return max-p.projection<.1;});return{x:edge.reduce(function(n,p){return n+p.x;},0)/edge.length,y:edge.reduce(function(n,p){return n+p.y;},0)/edge.length};
}
function fraction(key,t){
  if(key.curve==="stepped")return 0;if(!Array.isArray(key.curve))return t;
  var p=key.curve,lo=0,hi=1,u=t;
  function bezier(a,b,x){var inv=1-x;return 3*inv*inv*x*a+3*inv*x*x*b+x*x*x;}
  for(var n=0;n<14;n++){u=(lo+hi)/2;if(bezier(p[0],p[2],u)<t)lo=u;else hi=u;}
  return bezier(p[1],p[3],u);
}
function sample(frames,time,key,fallback){
  if(!frames||!frames.length||time<(frames[0].time||0))return fallback;
  var before=frames[0],after=null;for(var i=1;i<frames.length;i++){if((frames[i].time||0)>time){after=frames[i];break;}before=frames[i];}
  var a=typeof before[key]==="number"?before[key]:fallback;if(!after)return a;
  var b=typeof after[key]==="number"?after[key]:fallback,span=(after.time||0)-(before.time||0),t=span>0?fraction(before,(time-(before.time||0))/span):0;return a+(b-a)*t;
}
// A release may occur between rendered frames. Sample its authored marker
// directly from JSON without advancing live tracks or firing callbacks twice.
function boneMatrixAt(json,animation,time,boneName,handRotation){
  var clip=json&&json.animations&&json.animations[animation],bones=json&&json.bones;if(!clip||!bones)return null;
  var byName=Object.create(null),world=Object.create(null);bones.forEach(function(bone){byName[bone.name]=bone;});
  function matrix(name){
    if(world[name])return world[name];var data=byName[name];if(!data||data.transform&&data.transform!=="normal")return null;
    var t=clip.bones&&clip.bones[name]||{},x=(data.x||0)+sample(t.translate,time,"x",0),y=(data.y||0)+sample(t.translate,time,"y",0),rotation=(data.rotation||0)+sample(t.rotate,time,"angle",0),sx=(data.scaleX===undefined?1:data.scaleX)*sample(t.scale,time,"x",1),sy=(data.scaleY===undefined?1:data.scaleY)*sample(t.scale,time,"y",1),shearX=(data.shearX||0)+sample(t.shear,time,"x",0),shearY=(data.shearY||0)+sample(t.shear,time,"y",0);
    if(name==="Rider/HandRight")rotation+=handRotation||0;
    var rx=(rotation+shearX)*Math.PI/180,ry=(rotation+90+shearY)*Math.PI/180,m={a:Math.cos(rx)*sx,b:Math.cos(ry)*sy,c:Math.sin(rx)*sx,d:Math.sin(ry)*sy,x:x,y:y};
    if(data.parent){var p=matrix(data.parent);if(!p)return null;m={a:p.a*m.a+p.b*m.c,b:p.a*m.b+p.b*m.d,c:p.c*m.a+p.d*m.c,d:p.c*m.b+p.d*m.d,x:p.x+p.a*x+p.b*y,y:p.y+p.c*x+p.d*y};}world[name]=m;return m;
  }
  return matrix(boneName);
}
function arrowAttachment(target){var slot=target&&target.findSlot&&target.findSlot("Rider/HandRight/Bow/Arrow");return slot&&(typeof slot.getAttachment==="function"?slot.getAttachment():slot.attachment);}
function arrowAimAngle(target,json,animation,time){
  var matrix=boneMatrixAt(json,animation,time,"Rider/HandRight/Bow/Arrow",0),attachment=arrowAttachment(target);if(!matrix||!attachment)return 0;
  // The arrow's source art points along attachment +X. Include its fitted
  // rotation/scale rather than assuming the bone or sprite is horizontal.
  var angle=value(attachment,"rotation",0)*Math.PI/180,scale=value(attachment,"scaleX",1),x=Math.cos(angle)*scale,y=Math.sin(angle)*scale;
  return Math.atan2(matrix.c*x+matrix.d*y,matrix.a*x+matrix.b*y)*180/Math.PI;
}
function arrowTipAt(target,json,animation,time,direction,mirrorX,options){
  var rotation=direction?Math.atan2(direction.y,direction.x*(mirrorX<0?-1:1))*180/Math.PI-(options&&value(options,"referenceAngle",0)||0):0;
  var m=boneMatrixAt(json,animation,time,"Rider/HandRight/Bow/Arrow",rotation);if(!m)return arrowTip(target,direction,mirrorX);
  var attachment=arrowAttachment(target),vertices=localVertices(attachment);if(!vertices)return{x:m.x,y:m.y};
  var fakeBone={worldX:m.x,worldY:m.y,a:m.a,b:m.b,c:m.c,d:m.d};
  return arrowTip({findBone:function(){return fakeBone;},findSlot:function(){return{attachment:attachment};}},direction,mirrorX);
}
exports.value=value;exports.commitWorld=commitWorld;exports.applyAim=applyAim;exports.removeAim=removeAim;exports.arrowTip=arrowTip;exports.arrowTipAt=arrowTipAt;exports.arrowAimAngle=arrowAimAngle;
