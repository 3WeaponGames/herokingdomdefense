'use strict';
const M=require('./model'),Policy=require('../../../assets/_script/MapObjectShadowPolicy');
function assign(map,request){
 if(!request||typeof request.enabled!=='boolean')throw Error('Choose whether to use the global shadow.');
 const layer=(map.layers||[]).find(l=>l.id===request.layerId);if(!layer)throw Error('The object layer changed. Refresh and retry.');M.assertEditable(layer);
 const object=request.objectId===undefined?null:(layer.objects||[]).find(o=>o.id===request.objectId);if(request.objectId!==undefined&&!object)throw Error('The object moved or was removed. Refresh and retry.');
 if(object&&layer.globalShadow===true)throw Error('This shadow is controlled by its layer. Turn off the layer shadow to edit individual shadows.');
 const target=object||layer;if((target.globalShadow===true)===request.enabled)return map;
 const next=M.clone(map),copy=next.layers.find(l=>l.id===layer.id),value=object?copy.objects.find(o=>o.id===object.id):copy;
 if(request.enabled)value.globalShadow=true;else delete value.globalShadow;return next;
}
function casters(map){const result=[];for(const layer of map.layers||[])if(!layer.hidden)for(const object of layer.objects||[])if(Policy.enabled(layer,object))result.push({layer,object,source:Policy.source(layer,object)});return result;}
module.exports={assign,casters,source:Policy.source,enabled:Policy.enabled};
