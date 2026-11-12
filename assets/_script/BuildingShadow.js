"use strict";
// Shared alpha-mask geometry for the building editor, stage preview and game.
// The map editor's shadow-brush texture is black with alpha 26/255.
var Geometry = require("./BuildingBlocker");
var OPACITY = 26 / 255;
function transform(mask, matrix) {
  return mask.map(function (region) { return region.map(function (ring) { return ring.map(function (p) {
    return [matrix[0]*p[0]+matrix[2]*p[1]+matrix[4],matrix[1]*p[0]+matrix[3]*p[1]+matrix[5]];
  }); }); });
}
function regions(value, layout) {
  if (!value) return [];
  if (value.body) return value.body.mask || [];
  if (!layout) return [];
  var copies = Geometry.instances(layout, value.gateSpan), result = [];
  Object.keys(copies).forEach(function (key) {
    copies[key].forEach(function (matrix) {
      result.push.apply(result, transform(value[key] && value[key].mask || [], matrix));
    });
  });
  return result;
}
// Union the covered scanline intervals before applying opacity. Overlapping
// connection masks therefore have the same alpha, without dark seams. Rings
// use even/odd coverage, preserving polygon-eraser holes on every backend.
function raster(mask, opacity, maxEdge) {
  var points = [];
  mask.forEach(function (region) { region.forEach(function (ring) { points.push.apply(points, ring); }); });
  if (!points.length) return null;
  var minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
  points.forEach(function (p) { minX=Math.min(minX,p[0]);minY=Math.min(minY,p[1]);maxX=Math.max(maxX,p[0]);maxY=Math.max(maxY,p[1]); });
  var scale=Math.min(1,Math.max(1,(maxEdge||2048)-4)/Math.max(1,maxX-minX,maxY-minY));
  minX=Math.floor(minX*scale)-1;minY=Math.floor(minY*scale)-1;maxX=Math.ceil(maxX*scale)+1;maxY=Math.ceil(maxY*scale)+1;
  var width=Math.max(1,maxX-minX),height=Math.max(1,maxY-minY),pixels=new Uint8Array(width*height*4),alpha=Math.round(255*(opacity===undefined?OPACITY:Math.max(0,Math.min(1,opacity))));
  var scaled=mask.map(function (region) { return region.map(function (ring) { return ring.map(function (p) { return [p[0]*scale-minX,p[1]*scale-minY]; }); }); });
  for (var row=0;row<height;row++) {
    var coverage=new Float32Array(width);
    for (var sample=0;sample<4;sample++) {
      var y=height-row-(sample+.5)/4,intervals=[];
      scaled.forEach(function (region) {
        var cuts=[];
        region.forEach(function (ring) { for(var i=1;i<ring.length;i++) {
          var a=ring[i-1],b=ring[i];
          if ((a[1]>y)!==(b[1]>y)) cuts.push(a[0]+(y-a[1])*(b[0]-a[0])/(b[1]-a[1]));
        } });
        cuts.sort(function (a,b) { return a-b; });
        for(var j=1;j<cuts.length;j+=2)intervals.push([cuts[j-1],cuts[j]]);
      });
      intervals.sort(function (a,b) { return a[0]-b[0]; });
      var merged=[];
      intervals.forEach(function (span) { var last=merged[merged.length-1];if(last&&span[0]<=last[1])last[1]=Math.max(last[1],span[1]);else merged.push(span.slice()); });
      merged.forEach(function (span) { for(var x=Math.max(0,Math.floor(span[0])),end=Math.min(width,Math.ceil(span[1]));x<end;x++)coverage[x]+=Math.max(0,Math.min(x+1,span[1])-Math.max(x,span[0]))/4; });
    }
    for(var x=0;x<width;x++)pixels[(row*width+x)*4+3]=Math.round(alpha*Math.min(1,coverage[x]));
  }
  return {pixels:pixels,pixelWidth:width,pixelHeight:height,x:minX/scale,y:minY/scale,width:width/scale,height:height/scale};
}
exports.opacity=OPACITY;exports.transform=transform;exports.regions=regions;exports.raster=raster;
