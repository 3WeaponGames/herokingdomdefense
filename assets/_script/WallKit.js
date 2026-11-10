"use strict";

// Native PNG modules are rigid regions on the pack's measured diagonal grid.
// Registered door sprites share the wall frame; legacy gateways remain usable.
var Assembly = require("./WallAssembly"), Door = require("./WallDoor"), K = Assembly.axis.slope, UNIT = Assembly.step.x;
var SKINS = ["cq-rts-1", "cq-rts-2", "cq-rts-3"];
var ORIGINAL_SKINS = ["cq-1", "cq-2-1", "cq-2-2"];
var ORIGINAL_POSTS = [
  {left:{x:-49,y:23.5},right:{x:64.5,y:-42},half:18},
  {left:{x:-49.75,y:24},right:{x:64.75,y:-42.5},half:18.25},
  {left:{x:-31.25,y:19},right:{x:74.25,y:-42},half:33.75}
];
function clone(value) { return JSON.parse(JSON.stringify(value)); }
function isAdded(name) { return typeof name === "string" && name.indexOf("rts_wall_") === 0; }
function validRun(value) {
  return Assembly.valid(value);
}
function layout(run, endpoints) {
  return Assembly.layout(run,endpoints);
}
function chain(a,b,count) {
  return Assembly.chain(a,b,count);
}
function posts(r) {
  return Assembly.pieces(r);
}
function source(json) {
  var result=clone(json);
  if(result.wallKit&&result.wallKit.originalHeader)result.skeleton=clone(result.wallKit.originalHeader);
  else if(result.wallGate&&result.wallGate.originalHeader)result.skeleton=clone(result.wallGate.originalHeader);
  result.bones=result.bones.filter(function(b){return !isAdded(b.name);});
  result.slots=result.slots.filter(function(s){return !isAdded(s.name);});
  result.skins=result.skins.filter(function(s){return SKINS.indexOf(s.name)<0;});
  Object.keys(result.animations).forEach(function(name){
    if(Door.generatedAnimations.indexOf(name)>=0){delete result.animations[name];return;}
    var a=result.animations[name];
    if(a.slots){Object.keys(a.slots).forEach(function(s){if(isAdded(s))delete a.slots[s];});if(!Object.keys(a.slots).length)delete a.slots;}
    if(a.deform){SKINS.forEach(function(s){delete a.deform[s];});if(!Object.keys(a.deform).length)delete a.deform;}
  });
  delete result.wallKit;delete result.wallGate;delete result.wallDoor;return result;
}
// Restore the complete authored gateway: CQ1 owns its left half, CQ2 its right.
// Both retain the original slot switches and deformation curves (including the
// middle tier's sliding panels). Posts translate without stretching; leaves fit
// the selected opening while remaining upright. No source skin is modified.
function fitOriginalGate(json,r,options) {
  var result=clone(json),m=options&&options.frameToLocal||[1,0,0,1,0,0];
  function local(p){return {x:m[0]*p.x+m[2]*p.y+m[4],y:m[1]*p.x+m[3]*p.y+m[5]};}
  function vector(x,y,leaf,sx,shear){if(leaf){y+=shear*x;x*=sx;}return {x:m[0]*x+m[2]*y,y:m[1]*x+m[3]*y};}
  ORIGINAL_SKINS.forEach(function(name,index){
    var original=result.skins.find(function(s){return s.name===name;}),alias=result.skins.find(function(s){return s.name===SKINS[index];});
    if(!original)return;if(!alias){alias={name:SKINS[index],attachments:{}};result.skins.push(alias);}
    var anchors=ORIGINAL_POSTS[index],sockets=r.sockets||{left:0,right:0,depth:0};
    var left={x:r.left.x+sockets.left+sockets.depth,y:r.left.y-K*sockets.left+K*sockets.depth},right={x:r.right.x+sockets.right+sockets.depth,y:r.right.y-K*sockets.right+K*sockets.depth};
    var span=anchors.right.x-anchors.left.x,sx=(right.x-left.x)/span,shear=((right.y-left.y)-(anchors.right.y-anchors.left.y))/span;
    Object.keys(original.attachments).forEach(function(slot){
      var isLeaf=Object.keys(original.attachments[slot]).some(function(n){return /^(men1_[23]|men3_[23]|men2_mu_[12])$/.test(n);}),side=/men[123]_(?:4|3)/.test(slot)||/_2$/.test(slot)&&/^men2_mu/.test(slot)?"left":"right";
      delete alias.attachments[slot];
      if(!r.gate)return;
      var items=alias.attachments[slot]=clone(original.attachments[slot]);
      function fitted(x,y){
        var p={x:(x-5.2)/2,y:(y+156.53)/2};
        if(isLeaf)p={x:left.x+sx*(p.x-anchors.left.x),y:left.y+(p.y-anchors.left.y)+shear*(p.x-anchors.left.x)};
        else p={x:p.x+r[side].x-anchors[side].x,y:p.y+r[side].y-anchors[side].y};
        p=local(p);return {x:p.x*2+5.2,y:p.y*2-156.53};
      }
      Object.keys(items).forEach(function(attachment){var a=items[attachment];if(a.type==="mesh"){if(a.vertices.length!==a.uvs.length)throw Error("Original gate needs unweighted artwork.");for(var i=0;i<a.vertices.length;i+=2){var p=fitted(a.vertices[i],a.vertices[i+1]);a.vertices[i]=p.x;a.vertices[i+1]=p.y;}}else{var p=fitted(a.x||0,a.y||0);a.x=p.x;a.y=p.y;}});
      Object.keys(result.animations).forEach(function(animation){
        var a=result.animations[animation],tracks=a.deform&&a.deform[name]&&a.deform[name][slot];
        if(a.deform&&a.deform[alias.name])delete a.deform[alias.name][slot];
        if(!tracks)return;var target=a.deform[alias.name]||(a.deform[alias.name]={});target[slot]=clone(tracks);
        Object.keys(target[slot]).forEach(function(attachment){var length=original.attachments[slot][attachment].vertices.length;target[slot][attachment].forEach(function(frame){if(!frame.vertices)return;var values=Array(length).fill(0),offset=frame.offset||0;frame.vertices.forEach(function(v,i){values[offset+i]=v;});for(var i=0;i<length;i+=2){var d=vector(values[i],values[i+1],isLeaf,sx,shear);values[i]=d.x;values[i+1]=d.y;}frame.vertices=values;delete frame.offset;});});
      });
    });
    if(!r.gate)Object.keys(result.animations).forEach(function(animation){var d=result.animations[animation].deform;if(d&&d[alias.name])Object.keys(original.attachments).forEach(function(slot){delete d[alias.name][slot];});});
  });
  updateBounds(result);return result;
}
// Matched doors live completely in CQ1. Keep CQ2's original source and effects
// recoverable, but expose empty RTS skins so neither old leaf nor old post can
// fall back into the active matched assembly.
function fitGatePart(json,r,options) {
  if(!json.wallGate||json.wallGate.style!=="matched")return fitOriginalGate(json,r,options);
  var marker=clone(json.wallGate),result=source(json);
  if(!marker.originalHeader)marker.originalHeader=clone(result.skeleton);
  SKINS.forEach(function(name){result.skins.push({name:name,attachments:{}});});
  result.wallGate=marker;return result;
}
function updateBounds(result) {
  var minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity,bones={};
  result.slots.forEach(function(s){bones[s.name]=s.bone;});
  function point(x,y){minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);}
  result.skins.filter(function(s){return SKINS.indexOf(s.name)>=0;}).forEach(function(s){
    Object.keys(s.attachments).forEach(function(slot){Object.keys(s.attachments[slot]).forEach(function(name){
      var a=s.attachments[slot][name];
      var bone3=bones[slot]==="bone3",ox=bone3?-5.2:0,oy=bone3?156.53:0;
      if(a.type==="mesh"){
        for(var i=0;i<a.vertices.length;i+=2)point((a.vertices[i]+ox)/2,(a.vertices[i+1]+oy)/2);
        Object.keys(result.animations).forEach(function(key){var frames=result.animations[key].deform&&result.animations[key].deform[s.name]&&result.animations[key].deform[s.name][slot]&&result.animations[key].deform[s.name][slot][name]||[];frames.forEach(function(f){if(!f.vertices)return;var offset=f.offset||0;for(var k=0;k<a.vertices.length;k+=2)point((a.vertices[k]+ox+(f.vertices[k-offset]||0))/2,(a.vertices[k+1]+oy+(f.vertices[k+1-offset]||0))/2);});});
      }else{point(((a.x||0)-a.width/2+ox)/2,((a.y||0)-a.height/2+oy)/2);point(((a.x||0)+a.width/2+ox)/2,((a.y||0)+a.height/2+oy)/2);}
    });});
  });
  if(!isFinite(minX))return;result.skeleton.x=minX;result.skeleton.y=minY;
  result.skeleton.width=maxX-minX;result.skeleton.height=maxY-minY;
}
function install(json, r, metadata, options) {
  metadata=metadata||json.wallKit;if(!metadata||!metadata.sizes)throw Error("Missing native wall kit textures.");
  var matched=metadata.gateStyle==="matched"||metadata.doors&&metadata.doors.version===2;
  var result=source(json),parts=posts(r),bone="rts_wall_frame";
  // Cancel the authored bone3 setup offset, while inheriting its entire spawn motion.
  result.bones.push({name:bone,parent:"bone3",x:5.2,y:-156.53});
  var bodySlots=parts.map(function(_,i){return "rts_wall_part_"+i;});
  bodySlots.forEach(function(name){result.slots.push({name:name,bone:bone,attachment:name});});
  for(var level=1;level<=3;level++){
    var attachments={},skin=SKINS[level-1];
    parts.forEach(function(p,i){var name=bodySlots[i],a=Assembly.attachment(p,level,metadata.sizes,options);attachments[name]={};attachments[name][name]=a;});
    result.skins.push({name:skin,attachments:attachments});
  }
  if(!matched)result=fitOriginalGate(result,r);
  Object.keys(result.animations).forEach(function(name){
    var a=result.animations[name],slots=a.slots||(a.slots={}),night=name.indexOf("night")>=0;
    bodySlots.forEach(function(slot){
      var track={color:[{color:night?"a7a7a7ff":"ffffffff"}]};
      if(name==="Fade_in")track.color=[{color:"ffffffff",curve:.25,c3:.75},{time:.5,color:"a7a7a7ff"}];
      if(name==="destroy")track.attachment=[{time:.1667,name:null}];
      slots[slot]=track;
    });
  });
  // Complete PNG modules are painter-sorted from rear to foreground. Legacy
  // gateways keep their prior order; matched door sprites insert behind the
  // regular wall posts after native lighting/build tracks are established.
  var added=result.slots.filter(function(s){return bodySlots.indexOf(s.name)>=0;}),nativeSlots=result.slots.filter(function(s){return bodySlots.indexOf(s.name)<0;});
  result.slots=added.concat(nativeSlots);
  if(matched)Door.install(result,r,metadata,options);
  updateBounds(result);
  result.wallKit=clone(metadata);result.wallKit.layout=clone(r);result.wallKit.gateStyle=matched?"matched":"original";result.wallKit.nativeAssembly=2;result.wallKit.volume=false;result.wallKit.reversed=false;return result;
}

function footprint(a,b,depth) {
  var dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy),nx=length?-dy/length*depth/2:depth/2,ny=length?dx/length*depth/2:0;
  return [{x:a.x+nx,y:a.y+ny},{x:b.x+nx,y:b.y+ny},{x:b.x-nx,y:b.y-ny},{x:a.x-nx,y:a.y-ny}];
}
function fixtures(r) {
  var cx=(r.left.x+r.right.x)/2,cy=(r.left.y+r.right.y)/2;
  var root=r.gate?footprint(r.left,r.right,28):footprint({x:cx-12,y:cy+12*K},{x:cx+12,y:cy-12*K},28);
  function along(p,n){return {x:p.x+n,y:p.y-K*n};}
  // Gateposts are permanent obstacles even when either adjoining run is empty.
  // Their colliders stay separate from the leaf barrier opened for allies.
  function stretch(segment){var a=segment.a,b=segment.b,dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy),x=dx/length*18,y=dy/length*18;return footprint({x:a.x-x,y:a.y-y},{x:b.x+x,y:b.y+y},28);}
  function wing(side){var segments=r[side+"Segments"]||[],out=segments.map(stretch);if(!out.length&&r.gate)out.push(footprint(along(r[side],-18),along(r[side],18),28));return out;}
  var left=wing("left"),right=wing("right");
  var start=[];
  var end=r.end==="corner"?footprint(r.rightEnd,{x:r.rightEnd.x+UNIT*.7,y:r.rightEnd.y+UNIT*K*.7},28):[];
  return {root:root,wings:[left[0]||[],right[0]||[],start,end],wingSegments:[left,right,[],end.length?[end]:[]],proximity:r.gate?footprint(along(r.left,-20),along(r.right,20),90):[]};
}
exports.chain=chain;exports.updateBounds=updateBounds;exports.fitOriginalGate=fitOriginalGate;exports.fitGatePart=fitGatePart;exports.validRun=validRun;exports.layout=layout;exports.posts=posts;exports.install=install;exports.source=source;exports.footprint=footprint;exports.fixtures=fixtures;exports.unit=UNIT;exports.axis=Assembly.axis;exports.nativeRun=Assembly.canonical;exports.maxPerSide=Assembly.maxPerSide;exports.skins=SKINS;
