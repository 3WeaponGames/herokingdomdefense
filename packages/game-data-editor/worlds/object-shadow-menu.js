'use strict';
const Menu=require('./asset-menu'),Data=require('./object-shadow-data');
function create(root,api){return Menu.create(root,{
 busy:api.busy,error:api.error,beforeOpen:api.beforeOpen,label:t=>(t.object?'Object':'Layer')+' shadows for '+(t.object?.name||t.layer.name||t.layer.id),
 items(target){const {layer,object}=target,inherited=!!object&&layer.globalShadow===true,checked=Data.enabled(layer,object);return[{label:inherited?'Global shadow — inherited from '+(layer.name||layer.id):'Use global shadow',checked,disabled:inherited||!!layer.locked||!!layer.hidden,title:inherited?'Controlled by the layer. Each object casts only one shadow.':layer.locked?'Unlock this layer to change its shadows.':layer.hidden?'Show this layer to change its shadows.':'Use the shared building sun direction and ground-shadow settings.',action:()=>api.assign({layerId:layer.id,...(object?{objectId:object.id}:{}),enabled:!checked})}];}
});}
function badge(document,layer,object){const source=Data.source(layer,object);if(!source)return null;const icon=document.createElement('span');icon.className='world-shadow-badge'+(source==='layer'&&object?' inherited':'');icon.textContent='☀';icon.title=object&&source==='layer'?'Global shadow inherited from '+(layer.name||layer.id):'Global shadow';icon.setAttribute('aria-label',icon.title);return icon;}
module.exports={create,badge};
