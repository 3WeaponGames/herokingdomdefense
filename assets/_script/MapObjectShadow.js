"use strict";
// Added once per opted-in authored object, after resolving layer inheritance.
module.exports=cc.Class({
 extends:cc.Component,
 properties:{sources:{default:[],type:[cc.Node]},mapMain:cc.Node,shadowParent:cc.Node,mapBackground:cc.Node,shadowKey:"",groundOnly:false},
 onEnable:function(){require("MapObjectShadowRuntime").attach(this);},
 onDisable:function(){require("MapObjectShadowRuntime").detach(this);},
 onDestroy:function(){require("MapObjectShadowRuntime").detach(this);}
});
