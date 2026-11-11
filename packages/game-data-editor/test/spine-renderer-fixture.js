'use strict';
// Minimal render-only attachment fixtures. No gameplay or editor data is loaded.
class RegionAttachment {
 constructor(image,vertices,uvs){this.vertices=vertices;this.uvs=uvs||[0,1,0,0,1,0,1,1];this.region={texture:{getImage:()=>image}};this.color={r:1,g:1,b:1,a:1};}
 computeWorldVertices(_bone,result){for(let i=0;i<this.vertices.length;i++)result[i]=this.vertices[i];}
}
class MeshAttachment {
 constructor(image,vertices,uvs){Object.assign(this,new RegionAttachment(image,vertices,uvs));this.worldVerticesLength=vertices.length;this.triangles=[0,1,2,2,3,0];}
 computeWorldVertices(_slot,_start,_length,result){for(let i=0;i<this.vertices.length;i++)result[i]=this.vertices[i];}
}
class ClippingAttachment {}
class SkeletonClipping {
 constructor(){this.active=false;this.clippedVertices=[];this.clippedTriangles=[];}
 clipStart(){this.active=true;}
 isClipping(){return this.active;}
 clipEndWithSlot(){}
 clipEnd(){this.active=false;}
 clipTriangles(vertices,_count,triangles,_length,uvs){this.clippedVertices=[];for(let i=0;i<vertices.length;i+=2)this.clippedVertices.push(vertices[i],vertices[i+1],1,1,1,1,uvs[i],uvs[i+1]);this.clippedTriangles=Array.from(triangles);}
}
const spine={RegionAttachment,MeshAttachment,ClippingAttachment,SkeletonClipping};
function layer(attachment,{clip=false,color={r:1,g:1,b:1,a:1},opacity=1,blend=0}={}){
 const slot=a=>({getAttachment:()=>a,bone:{active:true},color,data:{name:'fixture',blendMode:blend}});
 return{description:{json:{},x:0,y:0,scaleX:1,scaleY:1,opacity},skeleton:{color:{r:1,g:1,b:1,a:1},drawOrder:(clip?[slot(new ClippingAttachment())]:[]).concat(slot(attachment))}};
}
module.exports={spine,layer};
