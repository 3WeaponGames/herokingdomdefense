(function(root,factory){if(typeof module==='object')module.exports=factory();else root.MapObjectShadowPolicy=factory();}(this,function(){
"use strict";
// A layer grants one shadow to each object. An object's saved choice remains
// dormant while its layer controls the light, and resumes if that layer opts out.
function source(layer,object){return layer&&layer.globalShadow===true?"layer":object&&object.globalShadow===true?"object":null;}
function enabled(layer,object){return !!source(layer,object);}
return{source:source,enabled:enabled};
}));
