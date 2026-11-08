'use strict';
// Runs against a real browser canvas (Creator's isolated bake renderer).
async function verify(){
 const P=WorldPaint,source=P.canvas(100,100),s=source.getContext('2d');s.fillStyle='#ffffff';s.fillRect(0,0,100,100);
 function erased(hardness,opacity,points){const c=P.canvas(100,100),ctx=c.getContext('2d');ctx.drawImage(source,0,0);ctx.setTransform(1,0,0,-1,50,50);P.brush(ctx,{size:40,shape:'round',hardness,opacity,op:'erase',points:points||[{x:0,y:0}]},{});return ctx;}
 const soft=erased(0,.5,Array(8).fill({x:0,y:0})),alpha=(ctx,x,y)=>ctx.getImageData(x,y,1,1).data[3],center=alpha(soft,50,50),edge=alpha(soft,68,50),outside=alpha(soft,74,50);
 if(center<126||center>132||edge<=center||outside!==255)throw Error('Soft erase or per-stroke opacity failed: '+[center,edge,outside]);
 const hard=erased(1,1);if(alpha(hard,50,50)!==0||alpha(hard,68,50)>2||alpha(hard,74,50)!==255)throw Error('Hardness endpoints failed');
 const img=new Image();await new Promise(resolve=>{img.onload=resolve;img.src=source.toDataURL();});const images={a:{image:img,width:100,height:100,anchor:{x:.5,y:.5}}},object={id:'mask-test',assetId:'a',x:0,y:0,scale:2,angle:20,mask:[{size:40,hardness:0,opacity:.5,op:'erase',shape:'round',points:[{x:0,y:0}]}]},masked=P.objectImage(object,images),m=masked.image.getContext('2d');if(alpha(m,50,50)<126||alpha(m,50,50)>134)throw Error('Image mask opacity failed');if(alpha(s,50,50)!==255)throw Error('Original image was altered');if(P.assetKey(object)!=='masked-mask-test')throw Error('Masked objects must compile as independent atlas variants');
 const map={size:{width:100,height:100},ground:{foundation:{baseAsset:'a',strokes:[]},roads:{strokes:[]},grass:{strokes:[]},order:['foundation','overlay','roads','grass'],custom:[{id:'overlay',transform:{x:0,y:0,scale:1,angle:0},opacity:1,blend:'source-over',images:[object],strokes:[]}]},layers:[]},output=P.canvas(100,100),ctx=output.getContext('2d');ctx.setTransform(1,0,0,-1,50,50);P.ground(ctx,map,images,[1,0,0,-1,50,50]);if(alpha(ctx,50,50)!==255)throw Error('Image erasing must reveal the intact foundation');return {center,edge,outside,originalIntact:true,independentMaskVariant:true,groundLayers:true};
}
module.exports={verify};
