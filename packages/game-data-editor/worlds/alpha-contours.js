(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.AlphaContours=factory();}(this,function(){
'use strict';
// Exact pixel-edge silhouettes, in raster coordinates (x right, y down).
// A region is [outerRing, ...holeRings]; every ring includes its closing point.
const DEFAULT_MAX_PIXELS=16*1024*1024,DEFAULT_MAX_EDGES=1000000,DEFAULT_MAX_CONTOURS=50000;
function area(ring){let result=0;for(let i=0,j=ring.length-1;i<ring.length;j=i++)result+=ring[j][0]*ring[i][1]-ring[i][0]*ring[j][1];return result/2;}
function contains(ring,x,y){let inside=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[i],b=ring[j];if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])inside=!inside;}return inside;}
function simplify(ring){
 // The walk emits only turns. Its arbitrary first edge can nevertheless start
 // in the middle of a straight run; remove that one redundant closing vertex.
 while(ring.length>3){const a=ring[ring.length-1],b=ring[0],c=ring[1];if((a[0]===b[0]&&b[0]===c[0])||(a[1]===b[1]&&b[1]===c[1]))ring.shift();else break;}
 ring.push(ring[0].slice());return ring;
}
function trace(options){
 options=options||{};const {data,width,height}=options,threshold=options.threshold===undefined?1:options.threshold,maxPixels=options.maxPixels===undefined?DEFAULT_MAX_PIXELS:options.maxPixels,maxEdges=options.maxEdges===undefined?DEFAULT_MAX_EDGES:options.maxEdges,maxContours=options.maxContours===undefined?DEFAULT_MAX_CONTOURS:options.maxContours;
 if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<1||height<1||!Number.isSafeInteger(maxPixels)||maxPixels<1||!Number.isSafeInteger(width*height)||!Number.isSafeInteger((width+1)*(height+1))||width*height>maxPixels)throw Error('Choose a valid alpha raster within the pixel limit.');
 if(!data||!Number.isSafeInteger(data.length)||data.length!==width*height*4)throw Error('Alpha tracing requires one RGBA pixel for every raster position.');
 if(!Number.isInteger(threshold)||threshold<1||threshold>255)throw Error('Alpha threshold must be between 1 and 255.');
 if(!Number.isSafeInteger(maxEdges)||maxEdges<4||!Number.isSafeInteger(maxContours)||maxContours<1)throw Error('Choose valid alpha contour limits.');
 const stride=width+1,edges=new Map();let count=0;
 function add(x,y,direction){const id=y*stride+x,bit=1<<direction,previous=edges.get(id)||0;if(!(previous&bit)){if(++count>maxEdges)throw Error('The artwork has too much edge detail. Select fewer layers or reduce tracing resolution.');edges.set(id,previous|bit);}}
 function solid(x,y){return x>=0&&x<width&&y>=0&&y<height&&data[(y*width+x)*4+3]>=threshold;}
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const alpha=data[(y*width+x)*4+3];if(!Number.isFinite(alpha)||alpha<0||alpha>255)throw Error('RGBA alpha values must be between 0 and 255.');if(alpha<threshold)continue;
  // Keep opaque pixels on the right: clockwise outers and anticlockwise holes.
  if(!solid(x,y-1))add(x,y,0);if(!solid(x+1,y))add(x+1,y,1);if(!solid(x,y+1))add(x+1,y+1,2);if(!solid(x-1,y))add(x,y+1,3);
 }
 if(!count)return [];
 const deltas=[1,stride,-1,-stride],outers=[],holes=[];let consumed=0,contours=0;
 while(edges.size){
  if(++contours>maxContours)throw Error('The artwork has too many separate regions. Select fewer layers or reduce tracing resolution.');
  const start=edges.keys().next().value,startMask=edges.get(start);let first=0;while(!(startMask&(1<<first)))first++;
  const ring=[[start%stride,Math.floor(start/stride)]];let at=start,direction=first,previous=first,steps=0;
  for(;;){
   if(steps){let mask=edges.get(at)||0;if(at===start)mask|=1<<first;let found=-1;for(const turn of [1,0,3,2]){const candidate=(previous+turn)%4;if(mask&(1<<candidate)){found=candidate;break;}}if(found<0)throw Error('The alpha outline could not be closed.');direction=found;if(at===start&&direction===first)break;if(direction!==previous)ring.push([at%stride,Math.floor(at/stride)]);}
   const mask=edges.get(at)||0,remaining=mask&~(1<<direction);if(!(mask&(1<<direction)))throw Error('The alpha outline contains a repeated edge.');if(remaining)edges.set(at,remaining);else edges.delete(at);at+=deltas[direction];previous=direction;
   if(++steps>count||++consumed>count)throw Error('The alpha outline exceeded its edge limit.');
  }
  simplify(ring);const signed=area(ring);if(!signed)throw Error('The alpha outline has no enclosed area.');
  if(signed>0){let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;for(const p of ring){minX=Math.min(minX,p[0]);minY=Math.min(minY,p[1]);maxX=Math.max(maxX,p[0]);maxY=Math.max(maxY,p[1]);}outers.push({ring,area:signed,minX,minY,maxX,maxY,holes:[]});}else holes.push(ring);
 }
 // A spatial index keeps many disconnected islands and transparent gaps from
 // requiring every hole to be tested against every outer boundary.
 const buckets=new Map(),columns=Math.max(1,Math.min(256,Math.ceil(Math.sqrt(outers.length)))),rows=Math.max(1,Math.min(256,Math.ceil(columns*height/width))),cellWidth=width/columns,cellHeight=height/rows;
 if(holes.length)for(const outer of outers){const minX=Math.floor(outer.minX/cellWidth),maxX=Math.min(columns-1,Math.floor(outer.maxX/cellWidth)),minY=Math.floor(outer.minY/cellHeight),maxY=Math.min(rows-1,Math.floor(outer.maxY/cellHeight));for(let y=minY;y<=maxY;y++)for(let x=minX;x<=maxX;x++){const key=y*columns+x,list=buckets.get(key);if(list)list.push(outer);else buckets.set(key,[outer]);}}
 for(const hole of holes){
  // Sample just inside the transparent side of the first directed edge.
  const a=hole[0],b=hole[1],dx=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dx,dy),x=(a[0]+b[0])/2+dy/length*.25,y=(a[1]+b[1])/2-dx/length*.25;let owner=null;
  const candidates=buckets.get(Math.min(rows-1,Math.floor(y/cellHeight))*columns+Math.min(columns-1,Math.floor(x/cellWidth)))||[];
  for(const outer of candidates)if(x>outer.minX&&x<outer.maxX&&y>outer.minY&&y<outer.maxY&&(!owner||outer.area<owner.area)&&contains(outer.ring,x,y))owner=outer;
  if(!owner)throw Error('A transparent hole could not be matched to its outer outline.');owner.holes.push(hole);
 }
 return outers.map(outer=>[outer.ring].concat(outer.holes));
}
return {trace,area,limits:{pixels:DEFAULT_MAX_PIXELS,edges:DEFAULT_MAX_EDGES,contours:DEFAULT_MAX_CONTOURS}};
}));
