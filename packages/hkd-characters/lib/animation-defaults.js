'use strict';

// The game already uses these package playback defaults. Prepare an independent
// preview copy before Spine parses it, so 100% means the model's normal pace.
// Authored assets, native bakes and saved attack/hit timing stay untouched.
function rate(pack){return pack==='fantasy-bosses'?.25:pack==='fantasy-monsters'?.35:1;}
function retime(value,scale){
  if(!value||typeof value!=='object')return;
  if(typeof value.time==='number'&&Number.isFinite(value.time))value.time/=scale;
  for(const child of Object.values(value))retime(child,scale);
}
function prepare(description){
  return {...description,layers:description.layers.map(layer=>{
    const scale=rate(layer.json&&layer.json._fantasy&&layer.json._fantasy.pack);
    if(scale===1||layer.previewAnimationRate!==undefined)return layer;
    const json=JSON.parse(JSON.stringify(layer.json));
    retime(json.animations,scale);
    return {...layer,json,previewAnimationRate:scale};
  })};
}
module.exports={rate,prepare};
