"use strict";
// Presentation-only light transforms. Missing overrides preserve the shipped pose.
function clone(v) { return JSON.parse(JSON.stringify(v)); }
function value(row, id) {
  var v = row && row.Nightlight && row.Nightlight.lights && row.Nightlight.lights[id] || {};
  return {x:v.x || 0,y:v.y || 0,scaleX:v.scaleX === undefined ? 1 : v.scaleX,scaleY:v.scaleY === undefined ? 1 : v.scaleY,angle:v.angle || 0,flipX:!!v.flipX,flipY:!!v.flipY};
}
function identity(v) { return !v.x && !v.y && v.scaleX === 1 && v.scaleY === 1 && !v.angle && !v.flipX && !v.flipY; }
function matrix(v, center) {
  var a=v.angle*Math.PI/180,c=Math.cos(a),s=Math.sin(a),x=v.scaleX*(v.flipX?-1:1),y=v.scaleY*(v.flipY?-1:1);
  var m=[c*x,s*x,-s*y,c*y,0,0];m[4]=center.x+v.x-m[0]*center.x-m[2]*center.y;m[5]=center.y+v.y-m[1]*center.x-m[3]*center.y;return m;
}
function point(m,x,y,vector) { return [m[0]*x+m[2]*y+(vector?0:m[4]),m[1]*x+m[3]*y+(vector?0:m[5])]; }
function meshes(source, skinName) {
  var skin=Array.isArray(source.skins)?source.skins.find(function(s){return s.name===skinName;}):null;
  var attachments=skin?skin.attachments:source.skins && source.skins[skinName],result=[];
  ["building_aperture_rays","building_aperture_cores"].forEach(function(slot){
    var a=attachments && attachments[slot] && attachments[slot][slot];
    if(!a || !a.vertices || a.vertices.length!==a.uvs.length)return;
    var count=slot==="building_aperture_rays"?14:a.vertices.length;
    for(var start=0;start<a.vertices.length;start+=count){
      var vertices=a.vertices.slice(start,start+count),xs=[],ys=[];for(var i=0;i<vertices.length;i+=2){xs.push(vertices[i]);ys.push(vertices[i+1]);}
      result.push({id:"mesh:"+slot+":"+(start/count),slot:slot,name:slot,start:start,count:count,vertices:vertices,
        center:{x:(Math.min.apply(Math,xs)+Math.max.apply(Math,xs))/2,y:(Math.min.apply(Math,ys)+Math.max.apply(Math,ys))/2}});
    }
  });return result;
}
function json(source,row) {
  var list=meshes(source,row && row.Skin).filter(function(e){return !identity(value(row,e.id));});if(!list.length)return source;
  var result=clone(source),skin=Array.isArray(result.skins)?result.skins.find(function(s){return s.name===row.Skin;}).attachments:result.skins[row.Skin];
  list.forEach(function(e){
    var m=matrix(value(row,e.id),e.center),vertices=skin[e.slot][e.name].vertices;
    for(var i=e.start;i<e.start+e.count;i+=2){var p=point(m,vertices[i],vertices[i+1]);vertices[i]=p[0];vertices[i+1]=p[1];}
  });
  // Deformation frames contain offsets, so rotate/scale their vectors without
  // translating them. Preserve the original timings and interpolation curves.
  Object.keys(result.animations || {}).forEach(function(name){
    var deform=result.animations[name].deform,skinDeform=deform && deform[row.Skin];if(!skinDeform)return;
    var groups={};list.forEach(function(e){(groups[e.slot] || (groups[e.slot]=[])).push(e);});
    Object.keys(groups).forEach(function(slot){var frames=skinDeform[slot] && skinDeform[slot][slot];if(!frames)return;
      frames.forEach(function(frame){if(!frame.vertices || !frame.vertices.length)return;var full=new Array(skin[slot][slot].vertices.length).fill(0),offset=frame.offset || 0;frame.vertices.forEach(function(v,i){full[offset+i]=v;});
        groups[slot].forEach(function(e){var m=matrix(value(row,e.id),e.center);for(var i=e.start;i<e.start+e.count;i+=2){var p=point(m,full[i],full[i+1],true);full[i]=p[0];full[i+1]=p[1];}});frame.vertices=full;delete frame.offset;
      });
    });
  });return result;
}
function issues(v) {
  if(!v || v.version!==1 || !v.lights || typeof v.lights!=="object" || Array.isArray(v.lights))return ["Nightlight must contain a version 1 light transform map."];
  var errors=[];if(Object.keys(v.lights).length>128)errors.push("Too many night lights.");
  Object.keys(v.lights).forEach(function(id){var t=v.lights[id];if(!/^(mesh:building_aperture_(rays|cores):\d+|sprite:\d+:\d+)$/.test(id)||!t||typeof t!=="object"||Array.isArray(t)){errors.push("Invalid night-light transform.");return;}
    ["x","y","scaleX","scaleY","angle"].forEach(function(k){if(t[k]!==undefined&&(typeof t[k]!=="number"||!isFinite(t[k])||Math.abs(t[k])>(k.indexOf("scale")===0?20:10000)||k.indexOf("scale")===0&&t[k]<.02))errors.push("Invalid night-light "+k+".");});
    ["flipX","flipY"].forEach(function(k){if(t[k]!==undefined&&typeof t[k]!=="boolean")errors.push("Invalid night-light "+k+".");});
  });return errors;
}
function glowMatrix(g,v){
  var a=(g.angle+v.angle)*Math.PI/180,c=Math.cos(a),s=Math.sin(a),sx=v.scaleX*(v.flipX?-1:1),sy=v.scaleY*(v.flipY?-1:1),x=Math.tan(g.shearX*Math.PI/180),y=Math.tan(g.shearY*Math.PI/180);
  var aa=c*sx,b=s*sx,cc=-s*sy,d=c*sy;
  return [aa+cc*y,b+d*y,cc+aa*x,d+b*x,g.x+v.x,g.y+v.y];
}
exports.value=value;exports.identity=identity;exports.matrix=matrix;exports.point=point;exports.meshes=meshes;exports.json=json;exports.issues=issues;
exports.glowMatrix=glowMatrix;
