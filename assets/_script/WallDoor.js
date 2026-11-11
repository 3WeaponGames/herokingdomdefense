"use strict";

// Registered 2D door images. Opening changes the displayed sprite at time zero.
// Shared leaves use a fixed quad reflection in the isometric door plane;
// no animated deformation, tween or scale animation is generated here.
var PREFIX="rts_wall_leaf_", SLOT=PREFIX+"pair", PARTS=["near","far"], PART_SLOTS={near:PREFIX+"near",far:PREFIX+"far"}, SKINS=["cq-rts-1","cq-rts-2","cq-rts-3"], STATES=["closed","inward","outward"], K=2/3;
var GENERATED=[];
["inward","outward"].forEach(function(direction){["open","shut"].forEach(function(action){GENERATED.push(action+"_"+direction,action+"_"+direction+"_night");});});
GENERATED.push("Fade_in_open_inward","Fade_in_open_outward");
var OPEN_FADES=["Fade_in_open_inward","Fade_in_open_outward"];
function clone(value){return JSON.parse(JSON.stringify(value));}
function finite(value){return typeof value==="number"&&isFinite(value);}
function option(value,fallback){return value===undefined?fallback:value;}
function named(state,part){return "rts_door_"+state+(part?"_"+part:"");}
function mapped(tier,image,point){
  var anchor=image.targetX===undefined?tier.anchor:mapped(tier,tier.states.closed,{x:image.targetX,y:image.targetY});
  var dx=point.x-image.anchorX,dy=image.anchorY-point.y;
  // Reflect the material's horizontal axis while retaining upright edges. A
  // screen-space flip would turn the open leaf back along the closed wall.
  if(image.mirrorX){dy+=2*image.mirrorSlope*dx;dx=-dx;}
  var result={x:anchor.x+(tier.flipX?-1:1)*dx*tier.scale,y:anchor.y+dy*tier.scale};
  // This is an explicit visual pose adjustment in wall-frame model units.
  // Keep the source hinge/closed target intact and report the shifted position.
  if(image.poseOffset){result.x+=image.poseOffset.x;result.y+=image.poseOffset.y;}
  return result;
}
function validPoseOffset(value){return value&&typeof value==="object"&&!Array.isArray(value)&&finite(value.x)&&finite(value.y);}
function validImage(image){return image&&typeof image.path==="string"&&image.path&&[image.width,image.height,image.anchorX,image.anchorY].every(finite)&&image.width>0&&image.height>0&&image.anchorX>=0&&image.anchorX<=image.width&&image.anchorY>=0&&image.anchorY<=image.height&&(image.mirrorX===undefined||typeof image.mirrorX==="boolean")&&(!image.mirrorX||finite(image.mirrorSlope));}
function owns(object,key){return Object.prototype.hasOwnProperty.call(object,key);}
function restoreDrawOrder(json){
  var saved=json.wallDoor&&json.wallDoor.depthOrderSource;if(!saved)return json;
  Object.keys(saved).forEach(function(key){var clip=json.animations&&json.animations[key];if(!clip)return;delete clip.drawOrder;delete clip.draworder;["drawOrder","draworder"].forEach(function(field){if(owns(saved[key],field))clip[field]=clone(saved[key][field]);});});
  return json;
}
function rememberDrawOrder(json){
  var state=json.wallDoor,saved=state.depthOrderSource||(state.depthOrderSource={});
  Object.keys(json.animations).forEach(function(key){if(GENERATED.indexOf(key)>=0||owns(saved,key))return;var clip=json.animations[key],entry=saved[key]={};["drawOrder","draworder"].forEach(function(field){if(owns(clip,field))entry[field]=clone(clip[field]);});});
}
function gatewayDepth(json,layout){
  var pieces=require("./WallAssembly").pieces(layout),gateways=[];
  pieces.forEach(function(piece,index){if(piece.gateway)gateways.push({name:"rts_wall_part_"+index,y:piece.y});});
  gateways.sort(function(a,b){return b.y-a.y;});
  if(gateways.length!==2||gateways[0].y<=gateways[1].y||gateways.some(function(part){return !json.slots.some(function(slot){return slot.name===part.name;});}))throw Error("State-aware gate depth needs both native gateway body slots.");
  return {far:gateways[0].name,near:gateways[1].name};
}
function authoredOrder(names,frame){
  if(!frame.offsets)return names.slice();
  var result=Array(names.length),unchanged=[],cursor=0;
  frame.offsets.forEach(function(entry){
    var index=names.indexOf(entry.slot),offset=entry.offset===undefined?0:entry.offset;
    if(index<cursor||!Number.isInteger(offset)||index+offset<0||index+offset>=names.length||result[index+offset]!==undefined)throw Error("Invalid authored gate draw-order timeline.");
    while(cursor<index)unchanged.push(names[cursor++]);result[index+offset]=names[cursor++];
  });
  while(cursor<names.length)unchanged.push(names[cursor++]);
  for(var i=result.length-1;i>=0;i--)if(result[i]===undefined)result[i]=unchanged.pop();
  return result;
}
function depthTracks(json,clip,selected){
  var state=json.wallDoor,names=json.slots.map(function(slot){return slot.name;}),frames=clip.drawOrder||clip.draworder||[];
  if(!Array.isArray(frames))throw Error("Invalid authored gate draw-order timeline.");
  frames=clone(frames);if(!frames.length||(frames[0].time||0)>0)frames.unshift({time:0});
  clip.drawOrder=frames.map(function(frame){
    var order=authoredOrder(names,frame);
    if(selected==="inward"&&state.parts){var from=order.indexOf(PART_SLOTS.far);order.splice(from,1);order.splice(order.indexOf(state.depthSlots.far),0,PART_SLOTS.far);}
    var positions={};order.forEach(function(name,index){positions[name]=index;});
    var offsets=[];names.forEach(function(name,index){var offset=positions[name]-index;if(offset)offsets.push({slot:name,offset:offset});});
    frame.offsets=offsets;return frame;
  });
  delete clip.draworder;
}
function resolve(layout,metadata){
  var doors=metadata&&metadata.doors;
  if(!doors||doors.version!==2||!Array.isArray(doors.tiers)||doors.tiers.length!==3)throw Error("Three registered 2D door tiers are required.");
  if(doors.closedOnly!==undefined&&typeof doors.closedOnly!=="boolean")throw Error("Closed-only door support must be explicit.");
  var required=doors.closedOnly?["closed"]:STATES;
  if(!layout||!layout.left||!layout.right||![layout.left.x,layout.left.y,layout.right.x,layout.right.y].every(finite))throw Error("Registered doors need finite wall anchors.");
  var center={x:(layout.left.x+layout.right.x)/2,y:(layout.left.y+layout.right.y)/2};
  var tiers=doors.tiers.map(function(spec,index){
    if(!spec||!spec.states)throw Error(doors.closedOnly?"A closed sprite is required for every door tier.":"Closed, inward and outward sprites are required for every door tier.");
    var states={};
    required.forEach(function(key){
      var image=spec.states[key];
      if(image&&image.poseOffset!==undefined)throw Error("Only open door leaf parts may declare a poseOffset.");
      if(image&&image.parts){
        if(key==="closed"||!Array.isArray(image.parts)||image.parts.length!==2||PARTS.some(function(id){return image.parts.filter(function(part){return part&&part.id===id;}).length!==1;}))throw Error("An open door state needs one near and one far leaf; closed artwork stays a single registered sprite.");
        image.parts.forEach(function(part){if(!validImage(part)||![part.targetX,part.targetY].every(finite))throw Error("A cropped door leaf needs its source hinge anchor and closed-art hinge target: tier "+(index+1)+" "+key);if(part.poseOffset!==undefined&&!validPoseOffset(part.poseOffset))throw Error("An open leaf poseOffset needs finite signed x and y model coordinates.");});
      }else if(!validImage(image))throw Error("A door sprite needs valid dimensions and its registered anchor: tier "+(index+1)+" "+key);
      states[key]=clone(image);
    });
    var reference=states.closed;
    required.forEach(function(key){var image=states[key];if(image.parts){image.parts.forEach(function(part){if(part.targetX<0||part.targetX>reference.width||part.targetY<0||part.targetY>reference.height)throw Error("A cropped leaf must target a hinge inside its approved closed sprite.");});}else if(["width","height","anchorX","anchorY"].some(function(field){return image[field]!==reference[field];}))throw Error("All door states must retain one common crop and registration; do not trim or recenter states independently.");});
    var scale=spec.scale,plane=option(spec.planeOffset,10),offsetX=option(spec.offsetX,0),offsetY=option(spec.offsetY,0),inset=option(spec.postInset,6);
    if(![scale,plane,offsetX,offsetY,inset].every(finite)||scale<=0||inset<0)throw Error("A door tier needs one positive uniform sprite scale and valid hinge offsets.");
    var flipX=option(spec.flipX,true);if(typeof flipX!=="boolean")throw Error("Door sprite mirroring must be explicit.");
    var tier={level:index+1,states:states,scale:scale,flipX:flipX,anchor:{x:center.x+plane+offsetX,y:center.y+K*plane+offsetY},planeOffset:plane,offsetX:offsetX,offsetY:offsetY,postInset:inset};
    if(spec.hinges){
      if(!spec.hinges.left||!spec.hinges.right||![spec.hinges.left.x,spec.hinges.left.y,spec.hinges.right.x,spec.hinges.right.y].every(finite))throw Error("A registered door needs finite hinge positions.");
      tier.hinges=clone(spec.hinges);
      var expected={left:{x:layout.left.x+plane+inset+offsetX,y:layout.left.y+K*plane-K*inset+offsetY},right:{x:layout.right.x+plane-inset+offsetX,y:layout.right.y+K*plane+K*inset+offsetY}};
      ["left","right"].forEach(function(side){var point=mapped(tier,reference,spec.hinges[side]),target=expected[flipX?(side==="left"?"right":"left"):side];if(Math.abs(point.x-target.x)>.01||Math.abs(point.y-target.y)>.01)throw Error("This opening does not fit the registered door sprite without stretching. Use its native gate span.");});
      required.forEach(function(key){var image=states[key];if(image.hinges&&JSON.stringify(image.hinges)!==JSON.stringify(spec.hinges))throw Error("Door states must retain identical hinge registration.");});
    }
    if(spec.doorHeight!==undefined&&(!finite(spec.doorHeight)||spec.doorHeight<=0||spec.heightMax!==undefined&&(!finite(spec.heightMax)||spec.heightMax<=0||spec.doorHeight*scale>spec.heightMax+.01)))throw Error("Door artwork must remain below its wall pillar caps at the approved uniform scale.");
    return tier;
  });
  required.forEach(function(key){var parts=!!tiers[0].states[key].parts;if(tiers.some(function(tier){return !!tier.states[key].parts!==parts;}))throw Error("Each door state must use the same leaf layout across all three tiers.");});
  return tiers;
}
function region(tier,key,id){
  var state=tier.states[key],image=id&&state.parts?state.parts.find(function(part){return part.id===id;}):state;
  if(!validImage(image))throw Error("Choose a registered door image or leaf part.");
  var center=mapped(tier,image,{x:image.width/2,y:image.height/2});
  var result={path:image.path,x:2*center.x,y:2*center.y,width:image.width*tier.scale*2,height:image.height*tier.scale*2,scaleX:tier.flipX?-1:1};
  if(image.mirrorX){
    result.type="mesh";result.uvs=[0,1,0,0,1,0,1,1];result.triangles=[0,1,2,2,3,0];result.hull=4;
    result.vertices=[];[[0,image.height],[0,0],[image.width,0],[image.width,image.height]].forEach(function(p){var v=mapped(tier,image,{x:p[0],y:p[1]});result.vertices.push(v.x*2,v.y*2);});
  }
  return result;
}
function clear(json){
  restoreDrawOrder(json);
  json.slots=json.slots.filter(function(slot){return slot.name.indexOf(PREFIX)!==0;});
  json.skins.forEach(function(skin){Object.keys(skin.attachments||{}).forEach(function(slot){if(slot.indexOf(PREFIX)===0)delete skin.attachments[slot];});});
  Object.keys(json.animations).forEach(function(key){
    if(GENERATED.indexOf(key)>=0){delete json.animations[key];return;}
    var clip=json.animations[key];
    if(clip.slots)Object.keys(clip.slots).forEach(function(slot){if(slot.indexOf(PREFIX)===0)delete clip.slots[slot];});
    if(clip.deform)Object.keys(clip.deform).forEach(function(skin){Object.keys(clip.deform[skin]).forEach(function(slot){if(slot.indexOf(PREFIX)===0)delete clip.deform[skin][slot];});});
  });
}
function target(key,reverse){
  if(key.indexOf("open")!==0&&key.indexOf("Fade_in_open_")!==0)return "closed";
  var inward=key.indexOf("inward")>=0;
  if(reverse)inward=!inward;
  return inward?"inward":"outward";
}
function tracks(json){
  var state=json.wallDoor;if(!state||!state.gate)return json;
  if(state.depthOrder){restoreDrawOrder(json);rememberDrawOrder(json);}
  (state.closedOnly?OPEN_FADES:GENERATED).forEach(function(key){var base=key.indexOf("Fade_in_open_")===0?"Fade_in":key.indexOf("shut")===0?"shut":"open";if(key.indexOf("night")>=0)base+="_night";json.animations[key]=clone(json.animations[base]||{});});
  Object.keys(json.animations).forEach(function(key){
    var clip=json.animations[key],slots=clip.slots||(clip.slots={}),night=key.indexOf("night")>=0;
    var selected=target(key,state.reverse),image=state.tiers[0].states[selected],parts=!!(image&&image.parts),visible=!(state.closedOnly&&selected!=="closed");
    [SLOT].concat(state.parts?PARTS.map(function(id){return PART_SLOTS[id];}):[]).forEach(function(slot){
      var id=slot===SLOT?null:slot.slice(PREFIX.length),name=visible&&(id?parts:!parts)?named(selected,id):null;
      var track={color:[{color:night?"a7a7a7ff":"ffffffff"}],attachment:[{time:0,name:name}]};
      if(key==="Fade_in"||key.indexOf("Fade_in_open_")===0){track.color=[{color:"ffffffff",curve:.25,c3:.75},{time:.5,color:"a7a7a7ff"}];if(key==="Fade_in")delete track.attachment;}
      if(key==="destroy")track.attachment.push({time:.1667,name:null});
      slots[slot]=track;
    });
    if(state.depthOrder)depthTracks(json,clip,selected);
  });
  return json;
}
function install(json,layout,metadata,options){
  if(!json||!Array.isArray(json.slots)||!Array.isArray(json.skins)||!json.animations||!Array.isArray(json.bones)||!json.bones.some(function(b){return b.name==="rts_wall_frame";}))throw Error("A detached Spine skeleton with the wall frame is required.");
  if(!layout||typeof layout.gate!=="boolean")throw Error("A valid wall layout is required for door sprites.");
  var enabled=layout.gate,tiers=enabled?resolve(layout,metadata):[],depth=metadata&&metadata.doors&&metadata.doors.depthOrder;
  if(depth!==undefined&&depth!=="state-aware")throw Error("Unsupported gate depthOrder; use state-aware or omit the setting.");
  if(depth&&enabled&&!(metadata.doors.closedOnly)&&tiers.some(function(tier){return !tier.states.inward.parts||!tier.states.outward.parts;}))throw Error("State-aware gate depth needs separate open leaf parts.");
  var depthSlots=depth&&enabled?gatewayDepth(json,layout):null;
  clear(json);json.wallDoor={version:2,gate:enabled,closedOnly:!!(metadata&&metadata.doors&&metadata.doors.closedOnly),reverse:false,mirrorX:!!(options&&options.mirrorX),tiers:tiers};
  if(!enabled)return json;
  if(depthSlots){json.wallDoor.depthOrder=depth;json.wallDoor.depthSlots=depthSlots;}
  var parts=tiers.some(function(tier){return Object.keys(tier.states).some(function(key){return !!tier.states[key].parts;});});if(parts)json.wallDoor.parts=true;
  var at=json.slots.findIndex(function(slot){return depthSlots?slot.name===depthSlots.near:slot.name.indexOf("rts_wall_part_")===0;});if(at<0)at=json.slots.length;
  // Regular wall posts mask the hinge joints; this slot adds no support posts.
  json.slots.splice(at,0,{name:SLOT,bone:"rts_wall_frame",attachment:named("closed")});
  if(parts)PARTS.forEach(function(id,index){json.slots.splice(at+index+1,0,{name:PART_SLOTS[id],bone:"rts_wall_frame"});});
  tiers.forEach(function(tier,index){
    var skin=json.skins.find(function(s){return s.name===SKINS[index];});
    if(!skin){skin={name:SKINS[index],attachments:{}};json.skins.push(skin);}
    skin.attachments[SLOT]={};if(parts)PARTS.forEach(function(id){skin.attachments[PART_SLOTS[id]]={};});
    Object.keys(tier.states).forEach(function(key){if(tier.states[key].parts)PARTS.forEach(function(id){skin.attachments[PART_SLOTS[id]][named(key,id)]=region(tier,key,id);});else skin.attachments[SLOT][named(key)]=region(tier,key);});
  });
  return tracks(json);
}
function reverse(json){
  if(!json||!json.wallDoor)return json;
  var Adjust=require("./WallAdjustments"),previous=json.wallAdjustments,result=clone(Adjust.restore(json));result.wallDoor.reverse=!result.wallDoor.reverse;result=tracks(result);
  if(!result.wallKit||!result.wallKit.layout)return result;
  // Fitting already selected the authored tier/facing. An untouched instance
  // must not acquire tier-1 saved overrides merely because its view reverses.
  return previous?Adjust.apply(result,result.wallKit.layout,{data:previous.data,tier:previous.tier,face:previous.explicitFace,forceSplitClosed:previous.forceSplitClosed}):result;
}
exports.install=install;exports.reverse=reverse;exports.resolve=resolve;exports.region=region;exports.mapPoint=mapped;exports.target=target;exports.generatedAnimations=GENERATED;exports.skins=SKINS;exports.slot=SLOT;exports.partSlots=PART_SLOTS;exports.states=STATES;exports.restoreDrawOrder=restoreDrawOrder;
