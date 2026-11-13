'use strict';
const Clip=require('../worlds/blockers');
function handles(mask){
 const result=[];for(let r=0;r<mask.length;r++)for(let h=0;h<mask[r].length;h++){
  const ring=mask[r][h];for(let i=0;i<ring.length-1;i++){
   const a=ring[i],b=ring[i+1];result.push({region:r,ring:h,index:i,edge:false,x:a[0],y:a[1]});
   result.push({region:r,ring:h,index:i,edge:true,x:(a[0]+b[0])/2,y:(a[1]+b[1])/2});
  }
 }return result;
}
function move(mask,handle,dx,dy){
 if(!Number.isFinite(dx)||!Number.isFinite(dy))throw Error('Choose a finite polygon position.');
 const next=JSON.parse(JSON.stringify(mask)),ring=next[handle.region][handle.ring],count=ring.length-1;
 for(const i of handle.edge?[handle.index,(handle.index+1)%count]:[handle.index]){ring[i][0]+=dx;ring[i][1]+=dy;}
 ring[count]=ring[0].slice();return next;
}
function finish(mask){
 for(const region of mask)for(const ring of region)Clip.polygonBrush(ring);
 const result=Clip.union([mask]),signature=m=>m.map(r=>r.length).sort((a,b)=>a-b).join(',');
 if(signature(result)!==signature(mask))throw Error('Polygon edges and holes cannot overlap or cross.');
 if(result.flat(2).some(p=>p.some(n=>Math.abs(n)>10000)))throw Error('Polygon coordinates exceed the allowed range.');
 return result;
}
module.exports={handles,move,finish};
