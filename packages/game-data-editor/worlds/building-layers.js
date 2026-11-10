'use strict';
// Store stable layer IDs, never the current numeric position in the list.
function rank(map,after){const layers=map&&map.layers||[];if(!after||after==='top')return layers.length*2+3;if(after==='ground')return 0;const at=layers.findIndex(layer=>layer.id===after);return at<0?layers.length*2+3:at*2+2;}
function choices(map,after){const layers=map&&map.layers||[],result=[{value:'top',label:'Default (in front)'},{value:'ground',label:'Above ground'}].concat(layers.map(layer=>({value:layer.id,label:'In front of '+(layer.name||layer.id)})));if(after&&!result.some(item=>item.value===after))result.push({value:after,label:'Missing layer: '+after+' (using Default)'});return result;}
module.exports={rank,choices};
