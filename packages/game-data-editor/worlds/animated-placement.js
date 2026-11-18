'use strict';
const clone=value=>JSON.parse(JSON.stringify(value));
function attach(map,object,asset){
 const template=asset.animatedObject;if(!template)return;
 if(!map.legacySources)map.legacySources={};
 const previous=map.legacySources[template.sourceId];
 if(previous&&JSON.stringify(previous)!==JSON.stringify(template.source))throw Error('The animation source changed. Refresh before placing it.');
 if(!previous)map.legacySources[template.sourceId]=clone(template.source);
 object.legacy={sourceId:template.sourceId,roots:[template.root],origin:{x:0,y:0},sprites:clone(template.sprites)};
 object.animationPreset=asset.id;
 object.spriteAnimation={period:template.period,times:clone(template.times)};
 // Use the existing prefab-object inspector rather than static image masking.
 delete object.assetId;
}
module.exports={attach};
