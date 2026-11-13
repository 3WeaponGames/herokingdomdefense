"use strict";
// Render-only wall authoring model. Coordinates are selected-face game units;
// no collider, scale, rotation, building state or imported source is modified.
var Assembly=require("./WallAssembly"),Door=require("./WallDoor"),saved=require("./WallAdjustmentData"),FACES=["NW","SW","NE","SE"],STATES=["closed","inward","outward"],SKINS=Door.skins;
function clone(value){return JSON.parse(JSON.stringify(value));}
function object(value){return value&&typeof value==="object"&&!Array.isArray(value);}
function finite(value){return typeof value==="number"&&isFinite(value);}
function key(s){if(!s||[1,2,3].indexOf(Number(s.tier))<0||FACES.indexOf(s.face)<0||STATES.indexOf(s.state)<0)throw Error("Choose a wall tier, compass face and closed/inward/outward pose.");return Number(s.tier)+"/"+s.face+"/"+s.state;}
function validId(id){return typeof id==="string"&&/^(?:door\/(?:near|far)|wall\/(?:gateway\/(?:left|right)|center|(?:left|right)\/[1-9][0-9]*))$/.test(id);}
function knownPose(name){return /^[123]\/(?:NW|SW|NE|SE)\/(?:closed|inward|outward)$/.test(name);}
function authored(p){return object(p)&&((object(p.pieces)&&Object.keys(p.pieces).some(function(id){var v=p.pieces[id];return validId(id)&&object(v)&&((v.x||0)!==0||(v.y||0)!==0);}))||(Array.isArray(p.order)&&p.order.some(validId)));}
function validate(data){
 if(!object(data)||data.version!==1||!object(data.poses))throw Error("Wall adjustments need version 1 and a poses object.");
 Object.keys(data.poses).forEach(function(name){if(!knownPose(name))return;var p=data.poses[name];if(!object(p))throw Error("Invalid wall adjustment pose "+name);
  if(p.pieces!==undefined){if(!object(p.pieces))throw Error("Wall piece adjustments must be an object.");Object.keys(p.pieces).forEach(function(id){if(!validId(id))return;var v=p.pieces[id];if(!object(v)||v.x!==undefined&&!finite(v.x)||v.y!==undefined&&!finite(v.y))throw Error("Wall piece offsets must be finite game coordinates.");});}
  if(p.order!==undefined&&(!Array.isArray(p.order)||p.order.some(function(id,i){return typeof id!=="string"||p.order.indexOf(id)!==i;})))throw Error("Wall layer order must contain unique stable piece IDs.");
 });return true;
}
function getData(){return clone(saved);}
function setData(data){validate(data);saved=clone(data);return getData();}
function revision(data){return JSON.stringify(data===undefined?saved:data);}
function hasData(data){data=data===undefined?saved:data;return !!(data&&data.poses&&Object.keys(data.poses).some(function(k){return knownPose(k)&&authored(data.poses[k]);}));}
function edit(data,selection,operation){
 validate(data);var result=clone(data),name=key(selection),p=result.poses[name]||{},op=operation||{};
 function reset(id){if(!p.pieces||!p.pieces[id])return;delete p.pieces[id].x;delete p.pieces[id].y;if(!Object.keys(p.pieces[id]).length)delete p.pieces[id];}
 if(op.type==="reset-pose"){Object.keys(p.pieces||{}).filter(validId).forEach(reset);if(p.order){p.order=p.order.filter(function(id){return !validId(id);});if(!p.order.length)delete p.order;}}
 else if(op.type==="reset-piece"){if(!validId(op.id))throw Error("Choose a wall piece.");reset(op.id);}
 else if(op.type==="move"){if(!validId(op.id)||!finite(op.x)||!finite(op.y))throw Error("Wall offsets must be finite game coordinates.");p.pieces=p.pieces||{};if(op.x===0&&op.y===0)reset(op.id);else p.pieces[op.id]=Object.assign({},p.pieces[op.id],{x:op.x,y:op.y});}
 else if(op.type==="reorder"){if(!Array.isArray(op.order)||op.order.some(function(id,i){return !validId(id)||op.order.indexOf(id)!==i;}))throw Error("Choose a unique wall layer order.");var unknown=(p.order||[]).filter(function(id){return !validId(id);});if(op.order.length||unknown.length)p.order=op.order.concat(unknown);else delete p.order;}
 else throw Error("Unknown wall adjustment operation.");
 if(p.pieces&&!Object.keys(p.pieces).length)delete p.pieces;if(Object.keys(p).length)result.poses[name]=p;else delete result.poses[name];validate(result);return result;
}
function catalog(layout){
 var pieces=Assembly.pieces(layout),result=pieces.map(function(p,i){var id,label;
  if(p.gateway){id="wall/gateway/"+p.gateway;label=p.gateway==="left"?"Far gateway pillar":"Near gateway pillar";}
  else{var n=p.side==="left"?layout.leftPoints.length-1-p.index:p.index;if(!n){id="wall/center";label="Wall center";}else{id="wall/"+p.side+"/"+n;label=(p.side==="left"?"Far":"Near")+" wall "+n;}}
  return{id:id,label:label,slot:"rts_wall_part_"+i,slots:["rts_wall_part_"+i,"rts_wall_shadow_"+i],kind:"wall",index:i};
 });if(layout.gate)["near","far"].forEach(function(id){result.push({id:"door/"+id,label:id==="near"?"Near gate leaf":"Far gate leaf",slot:Door.partSlots[id],slots:[Door.partSlots[id]],kind:"door",part:id});});return result;
}
function faceOf(json){var d=json.wallDoor||{};return d.reverse?(d.mirrorX?"NW":"NE"):(d.mirrorX?"SE":"SW");}
function logical(name){return name.indexOf("open")===0||name.indexOf("Fade_in_open_")===0?(name.indexOf("inward")>=0?"inward":"outward"):"closed";}
function offset(data,tier,face,state,id){var p=data.poses[tier+"/"+face+"/"+state],v=p&&p.pieces&&p.pieces[id]||{};return{x:v.x||0,y:v.y||0};}
function decode(names,frame){
 if(!frame||!frame.offsets)return names.slice();var order=Array(names.length),unchanged=[],cursor=0;
 frame.offsets.forEach(function(v){var at=names.indexOf(v.slot),by=v.offset===undefined?0:v.offset;if(at<cursor||!Number.isInteger(by)||at+by<0||at+by>=names.length||order[at+by]!==undefined)throw Error("Invalid source wall draw order.");while(cursor<at)unchanged.push(names[cursor++]);order[at+by]=names[cursor++];});
 while(cursor<names.length)unchanged.push(names[cursor++]);for(var i=order.length-1;i>=0;i--)if(order[i]===undefined)order[i]=unchanged.pop();return order;
}
function encode(names,order){var positions={};order.forEach(function(n,i){positions[n]=i;});var result=[];names.forEach(function(n,i){if(positions[n]!==i)result.push({slot:n,offset:positions[n]-i});});return result;}
function capture(json){var clips={};Object.keys(json.animations).forEach(function(n){var a=json.animations[n],v=clips[n]={};["slots","drawOrder","draworder"].forEach(function(k){if(Object.prototype.hasOwnProperty.call(a,k))v[k]=clone(a[k]);});});return{skeleton:clone(json.skeleton),slots:clone(json.slots),skins:json.skins.filter(function(s){return SKINS.indexOf(s.name)>=0;}).map(function(s){return{name:s.name,attachments:clone(s.attachments)};}),clips:clips};}
function restore(json){
 var m=json&&json.wallAdjustments;if(!m)return json;var result=clone(json);result.skeleton=clone(m.before.skeleton);result.slots=clone(m.before.slots);m.before.skins.forEach(function(v){var s=result.skins.find(function(s){return s.name===v.name;});if(s)s.attachments=clone(v.attachments);});
 Object.keys(m.before.clips).forEach(function(n){var a=result.animations[n];if(!a)return;["slots","drawOrder","draworder"].forEach(function(k){delete a[k];if(Object.prototype.hasOwnProperty.call(m.before.clips[n],k))a[k]=clone(m.before.clips[n][k]);});});delete result.wallAdjustments;return result;
}
function active(json,slot,name){var setup=json.slots.find(function(s){return s.name===slot;}),value=setup&&setup.attachment,frames=json.animations[name]&&json.animations[name].slots&&json.animations[name].slots[slot]&&json.animations[name].slots[slot].attachment; (frames||[]).forEach(function(f){if((f.time||0)<=0)value=f.name;});return value;}
function apply(input,layout,options){
 options=options||{};var json=restore(input),data=options.data===undefined?saved:options.data;validate(data);if(!json.wallDoor||!json.wallDoor.gate&&!catalog(layout).length)return json;
 var tier=Number(options.tier)||1,face=options.face||faceOf(json);key({tier:tier,face:face,state:"closed"});
 var relevant=STATES.some(function(s){return authored(data.poses[tier+"/"+face+"/"+s]);});
 if(!relevant&&!options.forceSplitClosed)return json;
 var result=clone(json),before=capture(json),items=catalog(layout),sign=face==="NW"||face==="SE"?-1:1,names=result.slots.map(function(s){return s.name;}),split=!!options.forceSplitClosed;
 var closedPose=data.poses[tier+"/"+face+"/closed"];if(closedPose&&((closedPose.pieces&&["door/near","door/far"].some(function(id){var v=closedPose.pieces[id];return v&&((v.x||0)!==0||(v.y||0)!==0);}))||(closedPose.order&&closedPose.order.some(function(id){return id==="door/near"||id==="door/far";}))))split=true;
 function move(a,v){var dx=v.x*sign*2,dy=v.y*2;a.x=(a.x||0)+dx;a.y=(a.y||0)+dy;if(a.type==="mesh"&&a.vertices&&a.uvs&&a.vertices.length===a.uvs.length){for(var i=0;i<a.vertices.length;i+=2){a.vertices[i]+=dx;a.vertices[i+1]+=dy;}}}
 result.skins.forEach(function(skin){var level=SKINS.indexOf(skin.name)+1;if(!level)return;var spec=result.wallDoor.tiers[level-1];
  items.filter(function(p){return p.kind==="wall";}).forEach(function(p){p.slots.forEach(function(slot){var attachments=skin.attachments[slot];if(!attachments)return;var original=attachments[active(json,slot,"idle")]||attachments[Object.keys(attachments)[0]];STATES.forEach(function(state){var a=clone(original);move(a,offset(data,level,face,state,p.id));attachments[slot+"__wa_"+state]=a;});});});
  if(spec&&layout.gate){["inward","outward"].forEach(function(state){var canonical=(state==="inward")!==!!result.wallDoor.reverse?"inward":"outward";["near","far"].forEach(function(id){var a=skin.attachments[Door.partSlots[id]]&&skin.attachments[Door.partSlots[id]]["rts_door_"+canonical+"_"+id];if(a)move(a,offset(data,level,face,state,"door/"+id));});});
   if(split){var pair=skin.attachments[Door.slot]&&skin.attachments[Door.slot].rts_door_closed,reference=spec.states.closed;if(pair&&reference.width===512){["near","far"].forEach(function(id){var x=id==="near"?0:260,w=id==="near"?260:252,a=clone(pair);a.path="rts_door_closed_"+id+"_"+level;a.width=w*spec.scale*2;a.x=pair.x+(spec.flipX?-1:1)*(x+w/2-reference.width/2)*spec.scale*2;move(a,offset(data,level,face,"closed","door/"+id));skin.attachments[Door.partSlots[id]]=skin.attachments[Door.partSlots[id]]||{};skin.attachments[Door.partSlots[id]]["rts_door_closed_"+id]=a;});}}
  }
 });
 items.filter(function(p){return p.kind==="wall";}).forEach(function(p){p.slots.forEach(function(slot){var s=result.slots.find(function(s){return s.name===slot;});if(s)s.attachment=slot+"__wa_closed";});});
 if(split&&layout.gate){var pairSlot=result.slots.find(function(s){return s.name===Door.slot;});if(pairSlot)pairSlot.attachment=null;["near","far"].forEach(function(id){var s=result.slots.find(function(s){return s.name===Door.partSlots[id];});if(s)s.attachment="rts_door_closed_"+id;});}
 Object.keys(result.animations).forEach(function(name){var clip=result.animations[name],state=logical(name),slots=clip.slots||(clip.slots={});
  function attach(slot,attachment){var track=slots[slot]||(slots[slot]={}),old=track.attachment||[];track.attachment=[{time:0,name:attachment}].concat(old.filter(function(f){return (f.time||0)>0&&f.name===null;}));}
  items.filter(function(p){return p.kind==="wall";}).forEach(function(p){p.slots.forEach(function(slot){if(names.indexOf(slot)>=0)attach(slot,slot+"__wa_"+state);});});
  if(split&&layout.gate&&state==="closed"){attach(Door.slot,null);["near","far"].forEach(function(id){attach(Door.partSlots[id],"rts_door_closed_"+id);});}
  var pose=data.poses[tier+"/"+face+"/"+state];if(!pose||!pose.order||!pose.order.length)return;
  var frames=clone(clip.drawOrder||clip.draworder||[]);if(!frames.length||(frames[0].time||0)>0)frames.unshift({time:0});
  clip.drawOrder=frames.map(function(frame){var order=decode(names,frame),visible=items.filter(function(p){return p.kind==="wall"||state!=="closed"||split;}),bySlot={},byId={};visible.forEach(function(p){bySlot[p.slot]=p.id;byId[p.id]=p.slot;});var defaults=order.filter(function(slot){return !!bySlot[slot];}).map(function(slot){return bySlot[slot];}),ids=pose.order.filter(function(id){return !!byId[id];});var selected={};ids.forEach(function(id){selected[byId[id]]=true;});var cursor=0;order=order.map(function(slot){return selected[slot]?byId[ids[cursor++]]:slot;});frame.offsets=encode(names,order);return frame;});delete clip.draworder;
 });
 result.wallAdjustments={version:1,before:before,data:clone(data),tier:tier,face:face,forceSplitClosed:!!options.forceSplitClosed,closedSplit:split};if(options.face!==undefined)result.wallAdjustments.explicitFace=options.face;require("./WallKit").updateBounds(result);return result;
}
function describe(json,layout,selection){
 selection=selection||{};var tier=Number(selection.tier)||1,face=selection.face||faceOf(json),state=selection.state||"closed",data=selection.data===undefined?(json.wallAdjustments?json.wallAdjustments.data:saved):selection.data;key({tier:tier,face:face,state:state});
 var clip=state==="closed"?"idle":"open_"+state,skin=json.skins.find(function(s){return s.name===SKINS[tier-1];}),items=catalog(layout),names=json.slots.map(function(s){return s.name;}),frames=json.animations[clip]&&(json.animations[clip].drawOrder||json.animations[clip].draworder),order=decode(names,frames&&frames[0]),sign=face==="NW"||face==="SE"?-1:1;
 items=items.map(function(p){var slot=p.slot;if(p.kind==="door"&&state==="closed"&&!(json.wallAdjustments&&json.wallAdjustments.closedSplit))slot=Door.slot;var name=active(json,slot,clip),a=skin&&skin.attachments[slot]&&skin.attachments[slot][name],v=offset(data,tier,face,state,p.id);return Object.assign({},p,{slot:slot,slots:p.kind==="door"?[slot]:p.slots.filter(function(n){return names.indexOf(n)>=0;}),offset:{x:v.x,y:v.y},position:{x:a?(a.x||0)*sign/2:0,y:a?(a.y||0)/2:0}});});
 items.sort(function(a,b){return order.indexOf(a.slot)-order.indexOf(b.slot);});return{tier:tier,face:face,state:state,pieces:items,order:items.map(function(p){return p.id;})};
}
validate(saved);exports.validate=validate;exports.getData=getData;exports.setData=setData;exports.revision=revision;exports.hasData=hasData;exports.edit=edit;exports.catalog=catalog;exports.apply=apply;exports.restore=restore;exports.describe=describe;exports.poseKey=key;
