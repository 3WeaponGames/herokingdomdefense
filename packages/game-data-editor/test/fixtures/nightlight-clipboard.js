'use strict';
module.exports=function(){
 const W=require('../../../../assets/_script/WindowLightWarp'),warp=W.controls(),nodes=W.addNode(warp,[],0,.5);nodes[0].y+=.25;
 return{version:1,future:{source:'keep in source'},nextLightId:12,emitters:[{id:'light:2',future:{emitter:'full'}},{id:'light:7',type:'dim'},{id:'light:10',type:'circle'}],lights:{
  'light:2':{x:31.772,y:39.385,scaleX:1.3,scaleY:.7,angle:23,flipX:true,warp,warpNodes:nodes,future:{transform:'keep'}},
  'light:7':{x:-33.25,y:36.75,scaleX:.9,scaleY:1.1,angle:-4,flipY:true},
  'light:10':{x:15.5,y:-12.25,scaleX:1.2,scaleY:.8,erase:{version:1,strokes:[{op:'erase',radius:4,opacity:.55,softness:.8,flow:true,projection:{matrix:[1.2,0,0,.8],type:'circle'},points:[{x:-18,y:20,strength:.5},{x:-17,y:21,strength:.25}]}]}},
  'mesh:building_aperture_rays:0':{x:123,future:'inactive source'}
 }};
};
