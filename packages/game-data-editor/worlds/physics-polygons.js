'use strict';
// Cocos 2.4.13: CCPhysicsTypes.PTM_RATIO=32 and Box2D b2_linearSlop=.008.
// PolygonShape.Set welds vertices closer than half that slop. Project only
// generated physics fixtures to that precision; keep authored masks intact.
const Blockers=require('./blockers');
const PTM_RATIO=32,LINEAR_SLOP=.008,WELD_DISTANCE=PTM_RATIO*LINEAR_SLOP*.5;
const MIN_AREA=1.1920928955078125e-7*PTM_RATIO*PTM_RATIO;
const cross=(a,b,c)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const area=points=>Blockers.area(points.map(p=>[p.x,p.y]));
function representable(points){
 return points.length>=3&&Math.abs(area(points))>MIN_AREA&&points.every((p,i)=>distance(p,points[(i+1)%points.length])>=WELD_DISTANCE);
}
function fail(){
 const error=Error('A blocker contour is smaller than the physics precision (0.128 world units). Increase its detail spacing before saving.');
 error.code='BLOCKER_PHYSICS_PRECISION';
 throw error;
}
// Erasing almost all of a painted region can leave a disconnected speck.
// Ignore it only when its entire bounds fit inside the native weld distance.
function belowPrecision(points){
 let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
 for(const {x,y} of points){
  minX=Math.min(minX,x);minY=Math.min(minY,y);
  maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);
 }
 return Math.hypot(maxX-minX,maxY-minY)<WELD_DISTANCE;
}
function triangulate(points){
 const remaining=area(points)>0?points.slice():points.slice().reverse(),result=[];
 while(remaining.length>3){
  let ear=-1;
  for(let i=0;i<remaining.length;i++){
   const a=remaining[(i+remaining.length-1)%remaining.length],b=remaining[i],c=remaining[(i+1)%remaining.length];
   if(cross(a,b,c)<=MIN_AREA*2)continue;
   if(remaining.some(p=>p!==a&&p!==b&&p!==c&&cross(a,b,p)>=-1e-8&&cross(b,c,p)>=-1e-8&&cross(c,a,p)>=-1e-8))continue;
   const triangle=[a,b,c];if(!representable(triangle))continue;
   ear=i;result.push(triangle);break;
  }
  if(ear<0)fail();
  remaining.splice(ear,1);
 }
 if(!representable(remaining))fail();
 result.push(remaining);
 if(Math.abs(result.reduce((sum,p)=>sum+Math.abs(area(p)),0)-Math.abs(area(points)))>Math.max(1e-6,Math.abs(area(points))*1e-10))fail();
 return result;
}
function fixtures(points){
 if(!Array.isArray(points)||points.length<3||points.some(p=>!p||!Number.isFinite(p.x)||!Number.isFinite(p.y)))throw Error('Blocker physics needs a finite polygon with at least three points.');
 const original=points.map(p=>({x:p.x,y:p.y})),welded=[];
 for(const p of original)if(!welded.length||distance(welded[welded.length-1],p)>=WELD_DISTANCE)welded.push(p);
 if(welded.length>1&&distance(welded[0],welded[welded.length-1])<WELD_DISTANCE)welded.pop();
 if(welded.length===original.length){if(!representable(original))fail();return[original];}
 const clean=Blockers.clean(welded).map(p=>({x:p[0],y:p[1]}));
 if(!representable(clean))fail();
 // The native Bayazit separator can throw on an otherwise valid, tiny tooth.
 // Triangles bypass that recursive split after the bounded vertex weld.
 return triangulate(clean);
}
module.exports={fixtures,belowPrecision,WELD_DISTANCE,MIN_AREA};
