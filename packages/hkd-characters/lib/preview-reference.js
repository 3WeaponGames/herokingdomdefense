'use strict';
// Preview-only world conversion. Native source rigs are fitted into their
// gameplay contract on Save; the comparison must include that same fit and
// prefab scale rather than fitting each character independently to the canvas.
const identity=()=>({a:1,b:0,c:0,d:1,x:0,y:0});
function compose(outer,inner){inner=inner||identity();return{a:outer.a*inner.a+outer.b*inner.c,b:outer.a*inner.b+outer.b*inner.d,c:outer.c*inner.a+outer.d*inner.c,d:outer.c*inner.b+outer.d*inner.d,x:outer.a*inner.x+outer.b*inner.y+outer.x,y:outer.c*inner.x+outer.d*inner.y+outer.y};}
function point(matrix,point){return{x:matrix.a*point.x+matrix.b*point.y+matrix.x,y:matrix.c*point.x+matrix.d*point.y+matrix.y};}
function inverse(matrix,point){const x=point.x-matrix.x,y=point.y-matrix.y,det=matrix.a*matrix.d-matrix.b*matrix.c;return{x:(matrix.d*x-matrix.b*y)/det,y:(matrix.a*y-matrix.c*x)/det};}
function visualFrame(visual,origin){
  const sx=(visual.scaleX===undefined?1:visual.scaleX)*(visual.mirrorX?-1:1),sy=visual.scaleY===undefined?1:visual.scaleY,angle=(visual.rotation||0)*Math.PI/180,cos=Math.cos(angle),sin=Math.sin(angle),matrix={a:cos*sx,b:-sin*sy,c:sin*sx,d:cos*sy,x:0,y:0},at=point(matrix,origin);
  // Runtime visual overrides scale/rotate the renderer around its own node;
  // its authored prefab position is only translated by the saved x/y offsets.
  matrix.x=origin.x+(visual.x||0)-at.x;matrix.y=origin.y+(visual.y||0)-at.y;return matrix;
}
function world(root,base,description){
  const fs=require('fs'),path=require('path'),Units=require('../../game-data-editor/lib/unit-assets'),Records=require('../../game-data-editor/lib/unit-records'),read=file=>JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));
  const cfg=read(path.join(root,'assets/KinghtFallConfig/GameJsonCfg.json')),key=base.type+':'+base.id+':'+Records.form(base.type,base.id),visual=cfg.GameTools&&cfg.GameTools.visuals&&cfg.GameTools.visuals[key]||{};
  let fit=identity(),origin={x:description.layers[0].x||0,y:description.layers[0].y||0};
  if(base.source&&['ally','enemy'].includes(base.type)){
    const native=Units.describe(root,{type:base.type,id:base.id,noRuntime:true,noShared:true}),layer=native.layers[0],file=path.join(root,'assets/resources/unit-library/runtime/contracts.json'),contracts=fs.existsSync(file)?read(file):null,contract=contracts&&contracts.enabled&&contracts.units[key];
    const factor=(contract&&contract.height||layer.json.skeleton.height||120)/(description.fitHeight||description.layers[0].json.skeleton.height||120);
    fit={a:layer.scaleX*factor,b:0,c:0,d:layer.scaleY*factor,x:layer.x,y:layer.y};
    origin={x:layer.x,y:layer.y};
  }
  return compose(visualFrame(visual,origin),fit);
}
module.exports={identity,compose,point,inverse,visualFrame,world};
