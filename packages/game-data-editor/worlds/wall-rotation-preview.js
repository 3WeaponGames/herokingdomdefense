'use strict';
// Lightweight, render-only scrubbing of an already composed wall. The source
// preview marks exactly which artwork/colliders rotate; purchase fields stay put.
function project(record,delta){
 if(!record||!record.rotationPreview||!Number.isFinite(delta)||delta===0)return record;
 const meta=record.rotationPreview,origin=record.origin||{x:0,y:0},a=delta*Math.PI/180,c=Math.cos(a),s=Math.sin(a);
 const point=p=>Object.assign({},p,{x:c*p.x-s*p.y,y:s*p.x+c*p.y});
 const matrix=m=>[c*m[0]-s*m[1],s*m[0]+c*m[1],c*m[2]-s*m[3],s*m[2]+c*m[3],origin.x+c*(m[4]-origin.x)-s*(m[5]-origin.y),origin.y+s*(m[4]-origin.x)+c*(m[5]-origin.y)];
 const artwork=(items,flags)=>(items||[]).map((part,i)=>flags&&flags[i]?Object.assign({},part,{matrix:matrix(part.matrix)}):part);
 const polygons=(items,flags)=>(items||[]).map((shape,i)=>flags&&flags[i]?shape.map(point):shape);
 const result=Object.assign({},record,{sprites:artwork(record.sprites,meta.sprites),skeletons:artwork(record.skeletons,meta.skeletons),blockers:polygons(record.blockers,meta.blockers),rotationPreview:Object.assign({},meta,{angle:meta.angle+delta})});
 if(record.openBlockers)result.openBlockers=polygons(record.openBlockers,meta.openBlockers);
 return result;
}
module.exports={project};
