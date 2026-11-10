"use strict";

// Pure wall authoring and Spine fitting. Coordinates use the existing isometric
// ground plane; only generated gate surfaces are projected, never the PNG walls.
var K = Math.tan(Math.PI / 6), UNIT = 60, SCALE = 1.5;
var SKINS = ["cq-rts-1", "cq-rts-2", "cq-rts-3"];
var POST = [[61,77],[60.5,91],[60.5,93]];
var TOP = [[68.5,77],[64.5,91],[66,93]];
var CORNER = [[68,77],[64,91],[67,93]];
var CONNECTORS = [
  {planeOffset:13.688466520526791,inset:11.854559745628984,postDepth:19.875},
  {planeOffset:13.746479222419008,inset:11.904800219209818,postDepth:20.25},
  {planeOffset:10.974364905389034,inset:9.504078798467312,postDepth:20.625}
];
function clone(value) { return JSON.parse(JSON.stringify(value)); }
function isAdded(name) { return typeof name === "string" && name.indexOf("rts_wall_") === 0; }
function validRun(value) {
  return !!value && typeof value === "object" && !Array.isArray(value) &&
    Number.isInteger(value.left) && value.left >= 0 && value.left <= 32 &&
    Number.isInteger(value.right) && value.right >= 0 && value.right <= 32 &&
    value.left + value.right <= 48 && typeof value.gate === "boolean" &&
    (value.spacing===undefined||Number.isInteger(value.spacing)&&value.spacing>=1&&value.spacing<=4) &&
    (value.gate || value.left + value.right > 0) &&
    ["post", "shared"].indexOf(value.start) >= 0 && ["post", "corner"].indexOf(value.end) >= 0 &&
    (!value.gate||value.left>0||value.start==="post") && (!value.gate||value.right>0||value.end==="post") && validHandles(value);
}
function validHandles(run) {
  if(run.sockets!==undefined&&(!run.sockets||["left","right","depth"].some(function(k){return typeof run.sockets[k]!=="number"||!isFinite(run.sockets[k])||Math.abs(run.sockets[k])>20;})))return false;
  if(run.handles===undefined)return true;
  var h=run.handles;if(!h||!Array.isArray(h.left)||!Array.isArray(h.right)||h.left.length!==run.left+1||h.right.length!==run.right+1)return false;
  var okay=[h.left,h.right].every(function(a){return a.every(function(x,i){return typeof x==="number"&&isFinite(x)&&Math.abs(x)<=10000&&(!i||x-a[i-1]>=24);});});
  return okay&&(run.gate?h.right[0]-h.left[h.left.length-1]>=80:Math.abs(h.right[0]-h.left[h.left.length-1])<1e-6);
}
function rest() { return {left:{x:-49,y:23.5},right:{x:64.5,y:23.5-113.5*K},gate:true,start:"post",end:"post"}; }
function layout(run, endpoints) {
  var r = rest();
  if (run !== undefined && run !== null) {
    if (!validRun(run)) throw Error("Invalid wall run: choose 0–32 sections per side, at most 48 total, valid end joins, and a gate or at least one section.");
    r.gate=run.gate;r.start=run.start;r.end=run.end;
    if (!run.gate) { var cx=(r.left.x+r.right.x)/2,cy=(r.left.y+r.right.y)/2;r.left={x:cx,y:cy};r.right={x:cx,y:cy}; }
    r.leftCount=run.left;r.rightCount=run.right;var unit=UNIT*(run.spacing||1);
    r.leftEnd={x:r.left.x-unit*run.left,y:r.left.y+K*unit*run.left};
    r.rightEnd={x:r.right.x+unit*run.right,y:r.right.y-K*unit*run.right};
    if(run.handles){
      var intercept=r.left.y+K*r.left.x;
      r.leftPoints=run.handles.left.map(function(x){return {x:x,y:intercept-K*x};});r.rightPoints=run.handles.right.map(function(x){return {x:x,y:intercept-K*x};});
      r.left=r.leftPoints[r.leftPoints.length-1];r.leftEnd=r.leftPoints[0];r.right=r.rightPoints[0];r.rightEnd=r.rightPoints[r.rightPoints.length-1];
    }
    if(run.sockets)r.sockets=clone(run.sockets);
  } else {
    var points=(endpoints||[]).filter(function(p){return p&&isFinite(p.x)&&isFinite(p.y);});
    var min=points.length?Math.min.apply(null,points.map(function(p){return p.x;})):-162.33;
    var max=points.length?Math.max.apply(null,points.map(function(p){return p.x;})):177.67;
    min=Math.min(min,r.left.x);max=Math.max(max,r.right.x);
    r.leftEnd={x:min,y:r.left.y-(min-r.left.x)*K};
    r.rightEnd={x:max,y:r.right.y-(max-r.right.x)*K};
    r.leftCount=Math.max(0,Math.round((r.left.x-min)/UNIT));r.rightCount=Math.max(0,Math.round((max-r.right.x)/UNIT));
  }
  return r;
}
function chain(a,b,count) {
  if(!count)return [{x:a.x,y:a.y}];
  var result=[];for(var i=0;i<=count;i++)result.push({x:a.x+(b.x-a.x)*i/count,y:a.y+(b.y-a.y)*i/count});return result;
}
function posts(r) {
  var left=r.leftPoints||chain(r.leftEnd,r.left,r.leftCount),right=r.rightPoints||chain(r.right,r.rightEnd,r.rightCount),all=[];
  left.forEach(function(p,i){if(i===0&&r.start==="shared")return;all.push({x:p.x,y:p.y,distance:i?p.x-left[i-1].x:null,part:i===0?"post":"top"});});
  right.forEach(function(p,i){if(!r.gate&&i===0)return;all.push({x:p.x,y:p.y,distance:i?p.x-right[i-1].x:null,part:i===0?"post":i===right.length-1&&r.end==="corner"?"corner":"top"});});
  if(all.length&&r.rightCount===0&&r.end==="corner")all[all.length-1].part="corner";
  return all;
}
function source(json) {
  var result=clone(json);
  if(result.wallKit&&result.wallKit.originalHeader)result.skeleton=clone(result.wallKit.originalHeader);
  result.bones=result.bones.filter(function(b){return !isAdded(b.name);});
  result.slots=result.slots.filter(function(s){return !isAdded(s.name);});
  result.skins=result.skins.filter(function(s){return SKINS.indexOf(s.name)<0;});
  Object.keys(result.animations).forEach(function(name){
    var a=result.animations[name];
    if(a.slots){Object.keys(a.slots).forEach(function(s){if(isAdded(s))delete a.slots[s];});if(!Object.keys(a.slots).length)delete a.slots;}
    if(a.deform){SKINS.forEach(function(s){delete a.deform[s];});if(!Object.keys(a.deform).length)delete a.deform;}
  });
  delete result.wallKit;return result;
}
function region(name,size,anchor,point,level) {
  if(point.distance!==null&&point.distance!==undefined&&point.part!=="post"){
    // Change only the connecting timber span. The entire post stays at native
    // proportions; vertical material edges remain vertical at every run length.
    var cut=[42,38,39][level-1],end=[17,13,12][level-1],extra=(point.distance-UNIT+14)*2,vertices=[],uvs=[];
    [0,size[1]].forEach(function(y){[0,cut,size[0]].forEach(function(x){var shift=x<cut?extra*(cut-x)/(cut-end):0;vertices.push(point.x*2+(x-anchor[0])*SCALE-shift,point.y*2+(anchor[1]-y)*SCALE+K*shift);uvs.push(x/size[0],y/size[1]);});});
    return {path:name,type:"mesh",hull:6,vertices:vertices,uvs:uvs,triangles:[0,3,4,0,4,1,1,4,5,1,5,2]};
  }
  return {path:name,x:point.x*2+(size[0]/2-anchor[0])*SCALE,y:point.y*2+(anchor[1]-size[1]/2)*SCALE,width:size[0]*SCALE,height:size[1]*SCALE};
}
function hinges(r,fit) {
  fit=fit||CONNECTORS[0];var s=r.sockets||{left:0,right:0,depth:0},b=fit.inset+s.depth;
  return {left:{x:r.left.x+b+s.left,y:r.left.y+K*b-K*s.left},right:{x:r.right.x+b-fit.postDepth+s.right,y:r.right.y+K*b+K*fit.postDepth-K*s.right}};
}
function mesh(r,side,height,angle,reverse,fit) {
  var left=side==="left",h=hinges(r,fit),hinge=h[side];
  var cx=(h.left.x+h.right.x)/2,dx=cx-hinge.x,dy=-K*dx,n=Math.abs(dx),c=Math.cos(angle),s=Math.sin(angle)*(reverse?-1:1);
  var free={x:hinge.x+dx*c-n*s,y:hinge.y+dy*c-K*n*s};
  var v=left?[free.x,free.y+height,free.x,free.y,hinge.x,hinge.y,hinge.x,hinge.y+height]:[hinge.x,hinge.y+height,hinge.x,hinge.y,free.x,free.y,free.x,free.y+height];
  return {type:"mesh",hull:4,uvs:left?[.49,.025,.49,.975,.025,.975,.025,.025]:[.975,.025,.975,.975,.51,.975,.51,.025],triangles:[0,1,2,0,2,3],vertices:v.map(function(n){return n*2;})};
}
function gateSlots(enabled) {
  var result=[];if(enabled)["left","right"].forEach(function(side){["shadow","back","front","end","top"].forEach(function(face){result.push("rts_wall_leaf_"+side+(face==="front"?"":"_"+face));});});return result;
}
function gatePart(slot) { var m=/^rts_wall_leaf_(left|right)(?:_(back|end|top|shadow))?$/.exec(slot);return {side:m[1],face:m[2]||"front",name:m[1]==="left"?"men1_3":"men1_2"}; }
function volume(r,side,height,depth,angle,reverse,fit) {
  var front=mesh(r,side,height,angle,reverse,fit),left=side==="left",c=Math.cos(angle),s=Math.sin(angle)*(reverse?-1:1);
  var bx=depth*(c+(left?s:-s))*2,by=K*depth*(c+(left?-s:s))*2;
  var back=clone(front);back.vertices=front.vertices.map(function(v,i){return v+(i%2?by:bx);});
  var ht=left?6:0,ft=left?0:6,fb=left?2:4,uH=left?.025:.975,uF=left?.49:.51;
  function quad(points,uvs,color){return {type:"mesh",hull:4,triangles:[0,1,2,0,2,3],vertices:points,uvs:uvs,color:color};}
  var v=front.vertices;
  var top=quad([v[ht],v[ht+1],v[ft],v[ft+1],v[ft]+bx,v[ft+1]+by,v[ht]+bx,v[ht+1]+by],[uH,.025,uF,.025,uF,.07,uH,.07],"ffffffff");
  var edge=quad([v[ft],v[ft+1],v[fb],v[fb+1],v[fb]+bx,v[fb+1]+by,v[ft]+bx,v[ft+1]+by],[uF-.006,.025,uF-.006,.975,uF+.006,.975,uF+.006,.025],"b4a596ff");
  var shadow=clone(front);shadow.color="00000045";
  shadow.vertices=front.vertices.map(function(value,i){var vertex=Math.floor(i/2),top=vertex===0||vertex===3;return top?value+(i%2?-height*2+height*.64:-height*1.1):value;});
  return {front:front,back:back,top:top,end:edge,shadow:shadow};
}
function visible(part,angle,reverse) {
  if(part.face==="top"||part.face==="shadow")return true;
  var c=Math.cos(angle),s=Math.sin(angle)*(reverse?-1:1),front=part.side==="left"?c-s>=-1e-8:c+s>=-1e-8;
  if(part.face==="front")return front;if(part.face==="back")return !front;
  if(angle<1e-7)return false;
  return part.side==="left"?c+s>1e-8:s-c>1e-8;
}
function configureVolumes(json,r,metadata,reverse) {
  var slots=gateSlots(r.gate);
  slots.forEach(function(slot){var p=gatePart(slot);if(!json.slots.some(function(s){return s.name===slot;})){var s={name:slot,bone:"rts_wall_frame"};if(visible(p,0,reverse))s.attachment=p.name;json.slots.push(s);}});
  for(var level=1;level<=3;level++){
    var skin=json.skins.find(function(s){return s.name===SKINS[level-1];}),height=[44,54,60][level-1],depth=[4,5,6][level-1],fit=(metadata.connectors||CONNECTORS)[level-1];
    slots.forEach(function(slot){var p=gatePart(slot),a=volume(r,p.side,height,depth,0,reverse,fit)[p.face];a.path="rts_gate_"+((p.face==="back")!==reverse?"nw":"sw")+"_"+level;skin.attachments[slot]={};skin.attachments[slot][p.name]=a;});
    ["open","open_night","shut","shut_night"].forEach(function(name){
      if(!json.animations[name]||!r.gate)return;var a=json.animations[name],deform=a.deform||(a.deform={}),tracks=deform[skin.name]||(deform[skin.name]={}),duration=metadata.durations[name];
      slots.forEach(function(slot){var p=gatePart(slot),rest=skin.attachments[slot][p.name],frames=[];
        for(var step=0;step<=20;step++){var time=duration*step/20,t=step/20;if(name.indexOf("shut")===0)t=1-t;var angle=t*t*(3-2*t)*Math.PI/2,v=volume(r,p.side,height,depth,angle,reverse,fit)[p.face].vertices;frames.push({time:time,vertices:v.map(function(n,i){return n-rest.vertices[i];})});}
        tracks[slot]={};tracks[slot][p.name]=frames;
      });
    });
  }
  Object.keys(json.animations).forEach(function(name){var a=json.animations[name],tracks=a.slots||(a.slots={}),night=name.indexOf("night")>=0,moving=/^(open|shut)/.test(name);
    slots.forEach(function(slot){var p=gatePart(slot),track={color:[{color:night?"a7a7a7ff":"ffffffff"}]};
      if(name==="Fade_in")track.color=[{color:"ffffffff",curve:.25,c3:.75},{time:.5,color:"a7a7a7ff"}];
      if(name==="destroy")track.attachment=[{time:.1667,name:null}];
      else if(moving){var frames=[],prior=null;for(var step=0;step<=20;step++){var t=step/20;if(name.indexOf("shut")===0)t=1-t;var state=visible(p,t*t*(3-2*t)*Math.PI/2,reverse),key=state?p.name:null;if(step===0||key!==prior)frames.push({time:metadata.durations[name]*step/20,name:key});prior=key;}track.attachment=frames;}
      else if(name!=="Fade_in")track.attachment=[{name:visible(p,0,reverse)?p.name:null}];
      tracks[slot]=track;
    });
  });
}
function updateBounds(result) {
  var xs=[],ys=[];
  result.skins.filter(function(s){return SKINS.indexOf(s.name)>=0;}).forEach(function(s){
    Object.keys(s.attachments).forEach(function(slot){Object.keys(s.attachments[slot]).forEach(function(name){
      var a=s.attachments[slot][name];
      if(a.type==="mesh"){
        for(var i=0;i<a.vertices.length;i+=2){xs.push(a.vertices[i]/2);ys.push(a.vertices[i+1]/2);}
        Object.keys(result.animations).forEach(function(key){var frames=result.animations[key].deform&&result.animations[key].deform[s.name]&&result.animations[key].deform[s.name][slot]&&result.animations[key].deform[s.name][slot][name]||[];frames.forEach(function(f){for(var k=0;k<a.vertices.length;k+=2){xs.push((a.vertices[k]+(f.vertices&&f.vertices[k]||0))/2);ys.push((a.vertices[k+1]+(f.vertices&&f.vertices[k+1]||0))/2);}});});
      }else{xs.push((a.x-a.width/2)/2,(a.x+a.width/2)/2);ys.push((a.y-a.height/2)/2,(a.y+a.height/2)/2);}
    });});
  });
  result.skeleton.x=Math.min.apply(null,xs);result.skeleton.y=Math.min.apply(null,ys);
  result.skeleton.width=Math.max.apply(null,xs)-result.skeleton.x;result.skeleton.height=Math.max.apply(null,ys)-result.skeleton.y;
}
function reverseVolumes(json) {
  if(!json.wallKit||!json.wallKit.volume)return json;
  var reverse=!json.wallKit.reversed;configureVolumes(json,json.wallKit.layout,json.wallKit,reverse);json.wallKit.reversed=reverse;updateBounds(json);return json;
}
function install(json, r, metadata) {
  metadata=metadata||json.wallKit;if(!metadata||!metadata.sizes)throw Error("Missing native wall kit textures.");
  var result=source(json),parts=posts(r),bone="rts_wall_frame";
  // Cancel the authored bone3 setup offset, while inheriting its entire spawn motion.
  result.bones.push({name:bone,parent:"bone3",x:5.2,y:-156.53});
  var bodySlots=parts.map(function(_,i){return "rts_wall_part_"+i;}),leafSlots=gateSlots(r.gate);
  bodySlots.forEach(function(name){result.slots.push({name:name,bone:bone,attachment:name});});
  for(var level=1;level<=3;level++){
    var attachments={},skin=SKINS[level-1],height=[44,54,60][level-1];
    // Tail overlaps sit behind the preceding post, concealing their cropped ends.
    parts.forEach(function(p,i){var name=bodySlots[i],part=p.part,anchor=part==="top"?TOP[level-1]:part==="corner"?CORNER[level-1]:POST[level-1],path="rts_wall_"+part+"_"+level;attachments[name]={};attachments[name][name]=region(path,metadata.sizes[path],anchor,p,level);});
    result.skins.push({name:skin,attachments:attachments});
  }
  configureVolumes(result,r,metadata,false);
  Object.keys(result.animations).forEach(function(name){
    var a=result.animations[name],slots=a.slots||(a.slots={}),night=name.indexOf("night")>=0;
    bodySlots.forEach(function(slot){
      var track={color:[{color:night?"a7a7a7ff":"ffffffff"}]};
      if(name==="Fade_in")track.color=[{color:"ffffffff",curve:.25,c3:.75},{time:.5,color:"a7a7a7ff"}];
      if(name==="destroy")track.attachment=[{time:.1667,name:null}];
      slots[slot]=track;
    });
  });
  // The rear post is behind the gate; the foreground post covers its hinge.
  // Painter order also keeps grass and shadows at the ground, not on a leaf.
  var added=result.slots.filter(function(s){return bodySlots.indexOf(s.name)>=0;}),leaves=result.slots.filter(function(s){return leafSlots.indexOf(s.name)>=0;});
  var behind=added.filter(function(s){return parts[bodySlots.indexOf(s.name)].x<=r.left.x;}),front=added.filter(function(s){return parts[bodySlots.indexOf(s.name)].x>r.left.x;}),shadows=leaves.filter(function(s){return /_shadow$/.test(s.name);});
  result.slots=result.slots.filter(function(s){return bodySlots.indexOf(s.name)<0&&leafSlots.indexOf(s.name)<0;}).concat(shadows,behind,leaves.filter(function(s){return !/_shadow$/.test(s.name);}),front);
  updateBounds(result);
  result.wallKit=clone(metadata);result.wallKit.layout=clone(r);result.wallKit.volume=true;result.wallKit.reversed=false;return result;
}

function footprint(a,b,depth) {
  var dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy),nx=length?-dy/length*depth/2:depth/2,ny=length?dx/length*depth/2:0;
  return [{x:a.x+nx,y:a.y+ny},{x:b.x+nx,y:b.y+ny},{x:b.x-nx,y:b.y-ny},{x:a.x-nx,y:a.y-ny}];
}
function fixtures(r) {
  var cx=(r.left.x+r.right.x)/2,cy=(r.left.y+r.right.y)/2;
  var root=r.gate?footprint(r.left,r.right,28):footprint({x:cx-12,y:cy+12*K},{x:cx+12,y:cy-12*K},28);
  var left=r.leftCount?footprint(r.leftEnd,r.left,28):[],right=r.rightCount?footprint(r.right,r.rightEnd,28):[];
  var start=r.start==="corner"?footprint(r.leftEnd,{x:r.leftEnd.x+UNIT*.7,y:r.leftEnd.y+UNIT*K*.7},28):[];
  var end=r.end==="corner"?footprint(r.rightEnd,{x:r.rightEnd.x+UNIT*.7,y:r.rightEnd.y+UNIT*K*.7},28):[];
  return {root:root,wings:[left,right,start,end]};
}
exports.hinges=hinges;exports.connectors=CONNECTORS;exports.chain=chain;exports.reverseVolumes=reverseVolumes;exports.validRun=validRun;exports.layout=layout;exports.posts=posts;exports.install=install;exports.source=source;exports.footprint=footprint;exports.fixtures=fixtures;exports.unit=UNIT;exports.skins=SKINS;
