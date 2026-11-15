"use strict";
// Native gate/wall overlay quads; keep per-overlay data in vertex attributes.
// No material, SpriteFrame, mask, class registry or engine prototype writes.
var leases=new WeakMap(),format=null,Quad=null;
var FrameType=cc.SpriteFrame,frameProto=FrameType&&FrameType.prototype;
var rectGetter=frameProto&&frameProto.getRect,sizeGetter=frameProto&&frameProto.getOriginalSize,offsetGetter=frameProto&&frameProto.getOffset;
function standardFrame(frame){try{return !!(cc.sys&&cc.sys.isNative&&cc.ENGINE_VERSION==="2.4.13"&&FrameType&&cc.SpriteFrame===FrameType&&frame instanceof FrameType&&frame.constructor===FrameType&&frame.getRect===rectGetter&&frame.getOriginalSize===sizeGetter&&frame.getOffset===offsetGetter&&frame._rect&&frame._originalSize&&frame._offset);}catch(ignored){return false;}}

var STRIDE=13,COLOR=7,SCALARS=31;
function valid(value,strict){return !!value&&cc.isValid(value,!!strict);}
function finite(value){return typeof value==="number"&&isFinite(value);}
function supported(){
  var p=cc.Assembler&&cc.Assembler.prototype;
  return !!(cc.sys&&cc.sys.isNative&&cc.ENGINE_VERSION==="2.4.13"&&cc.Sprite&&cc.Sprite.Type&&cc.gfx&&cc.gfx.VertexFormat&&cc.RenderData&&p&&
    typeof p.init==="function"&&typeof p.setVertexFormat==="function"&&typeof p.setRenderDataList==="function"&&typeof p.updateEffect==="function"&&typeof p.setUseModel==="function"&&typeof p.reset==="function");
}
function full(frame){
  if(!valid(frame,true))return false;
  try{
    var direct=standardFrame(frame),r=direct?frame._rect:frame.getRect&&frame.getRect(),s=direct?frame._originalSize:frame.getOriginalSize&&frame.getOriginalSize(),o=direct?frame._offset:frame.getOffset&&frame.getOffset();
    return !!r&&!!s&&!!o&&r.width>0&&r.height>0&&r.width===s.width&&r.height===s.height&&o.x===0&&o.y===0;
  }catch(ignored){return false;}
}
function renderOwner(sprite,node){return node._renderComponent===sprite||!node._renderComponent&&(node.activeInHierarchy===false||sprite.enabled===false);}
function plain(sprite){
  var n=sprite&&sprite.node,p=n&&n._proxy,a=sprite&&sprite._assembler;
  return !!(sprite instanceof cc.Sprite&&valid(sprite,true)&&valid(n,true)&&!n.is3DNode&&sprite.type===cc.Sprite.Type.SIMPLE&&full(sprite.spriteFrame)&&
    p&&typeof p.setAssembler==="function"&&renderOwner(sprite,n)&&a&&a._renderComp===sprite&&typeof sprite.setVertsDirty==="function"&&typeof sprite._updateColor==="function");
}
function owns(state,strict){
  var s=state&&state.sprite,n=state&&state.node,a=state&&state.custom;
  return !!(state&&!state.retired&&valid(s,strict)&&valid(n,strict)&&s.node===n&&n._proxy===state.proxy&&s._assembler===a&&a&&a._renderComp===s&&a._gateQuadToken===state.token&&renderOwner(s,n));
}
function ensure(){
  if(Quad)return;
  format=new cc.gfx.VertexFormat([
    {name:"a_position",type:cc.gfx.ATTR_TYPE_FLOAT32,num:3},
    {name:"a_wallUv",type:cc.gfx.ATTR_TYPE_FLOAT32,num:2},
    {name:"a_actorUv",type:cc.gfx.ATTR_TYPE_FLOAT32,num:2},
    {name:"a_color",type:cc.gfx.ATTR_TYPE_UINT8,num:4,normalize:true},
    {name:"a_clip",type:cc.gfx.ATTR_TYPE_FLOAT32,num:4},
    {name:"a_paintActor",type:cc.gfx.ATTR_TYPE_FLOAT32,num:1}
  ]);
  if(format._bytes!==52||!format._nativeObj)throw Error("Unsupported native gate-quad vertex format");
  Quad=class NativeGateQuadAssembler extends cc.Assembler {
    constructor(){
      super();this._gateQuadToken=null;this._gateQuadData=new Float32Array(SCALARS);this._gateQuadReady=false;
      this._renderData=new cc.RenderData();this._renderData.init(this);this._renderData.createQuadData(0,STRIDE*4,6);
    }
    getVfmt(){return format;}
    init(comp){super.init(comp);this.setUseModel(false);}
    updateColor(comp,color){
      var state=leases.get(comp);if(!state||state.custom!==this||!owns(state,false))return;
      var u=this._renderData.uintVDatas[0];if(!u)return;
      var packed=color===undefined||color===null?comp.node.color._val:color;
      for(var i=0;i<4;i++)u[i*STRIDE+COLOR]=packed;
      this._dirtyPtr[0]|=cc.Assembler.FLAG_VERTICES_OPACITY_CHANGED;
    }
    updateRenderData(comp){
      var state=leases.get(comp);if(!state||state.custom!==this||!owns(state,false)||!this._gateQuadReady)return;
      var d=this._gateQuadData,v=this._renderData.vDatas[0],u=this._renderData.uintVDatas[0],color=comp.node.color._val;
      // d[0..7]=wallUV, [8..15]=actorUV, [16..23]=clipXY,
      // [24..26]=opacity/threshold/role, [27..30]=local L/B/R/T.
      for(var i=0;i<4;i++){
        var k=i*STRIDE,j=i*2;v[k]=(i&1)?d[29]:d[27];v[k+1]=(i&2)?d[30]:d[28];v[k+2]=0;
        v[k+3]=d[j];v[k+4]=d[j+1];v[k+5]=d[8+j];v[k+6]=d[9+j];u[k+7]=color;
        v[k+8]=d[16+j];v[k+9]=d[17+j];v[k+10]=d[24];v[k+11]=d[25];v[k+12]=d[26];
      }
      this._dirtyPtr[0]|=cc.Assembler.FLAG_VERTICES_OPACITY_CHANGED;comp._vertsDirty=false;
    }
  };
}
function retire(state){
  if(!state||state.retired)return false;
  var sprite=state.sprite,node=state.node,proxy=state.proxy,custom=state.custom,original=state.original;
  var stillCustom=!!(sprite&&sprite.node===node&&sprite._assembler===custom&&custom&&custom._renderComp===sprite&&custom._gateQuadToken===state.token);
  state.retired=true;if(leases.get(sprite)===state)leases.delete(sprite);
  var restored=false;
  if(stillCustom&&valid(sprite,false)&&valid(node,false)&&node._proxy===proxy){
    // Pending-destroy components can still be restored before their onDestroy
    // pools the original. Do not steal a newer renderer on the same node.
    if(original&&original._renderComp===sprite){
      sprite._assembler=original;
      if(renderOwner(sprite,node)){proxy.setAssembler(original);sprite._updateColor();sprite.setVertsDirty();}
      restored=true;
    }else if(renderOwner(sprite,node)){
      // An external owner retired the borrowed original. Recreate only this
      // still-owned plain Sprite's normal assembler rather than attach it to a
      // different component's recycled assembler.
      sprite._assembler=null;proxy.setAssembler(null);
      if(typeof sprite._resetAssembler==="function"){sprite._resetAssembler();restored=!!sprite._assembler;}
    }
  }
  // Once a global assembler pool resets/reassigns _renderComp, that pool/new
  // owner owns the instance. Never clear or destroy it through a stale lease.
  if(custom&&custom._renderComp===sprite&&custom._gateQuadToken===state.token){
    custom._gateQuadToken=null;custom._gateQuadReady=false;
    try{custom.reset();}catch(ignored){}
    try{custom.clear();}catch(ignored){}
    try{custom.setRenderDataList(null);}catch(ignored){}
    try{custom.destroy();}catch(ignored){}
    custom._gateQuadData=null;
  }
  state.sprite=state.node=state.proxy=state.custom=state.original=state.token=state.scratch=null;
  return restored;
}
function fillArray(scratch,offset,input){
  if(!input||input.length!==8)return false;
  for(var i=0;i<8;i++){if(!finite(input[i]))return false;scratch[offset+i]=input[i];if(!isFinite(scratch[offset+i]))return false;}
  return true;
}
function rectangular(d,o){return d[o]===d[o+4]&&d[o+2]===d[o+6]&&d[o+1]===d[o+3]&&d[o+5]===d[o+7];}
function intersect(d){
  // Generated Gate coordinates and both texture maps are affine rectangles.
  // Unknown warped input retains its original full-quad interpolation.
  if(!rectangular(d,0)||!rectangular(d,8)||!rectangular(d,16))return;
  var cx=d[16],cy=d[17],dx=d[18]-cx,dy=d[21]-cy,l=0,r=1,b=0,t=1,empty=false;
  if(dx===0){if(cx<0||cx>1)empty=true;}
  else{var xa=-cx/dx,xb=(1-cx)/dx;l=Math.max(0,Math.min(xa,xb));r=Math.min(1,Math.max(xa,xb));}
  if(dy===0){if(cy<0||cy>1)empty=true;}
  else{var ya=-cy/dy,yb=(1-cy)/dy;b=Math.max(0,Math.min(ya,yb));t=Math.min(1,Math.max(ya,yb));}
  if(empty||l>=r||b>=t){d[29]=d[27];d[30]=d[28];return;}
  if(l===0&&r===1&&b===0&&t===1)return;
  var left=d[27],bottom=d[28],right=d[29],top=d[30];
  for(var o=0;o<24;o+=8){
    var x0=d[o],x1=d[o+2],y0=d[o+1],y1=d[o+5];
    d[o]=d[o+4]=x0+(x1-x0)*l;d[o+2]=d[o+6]=x0+(x1-x0)*r;
    d[o+1]=d[o+3]=y0+(y1-y0)*b;d[o+5]=d[o+7]=y0+(y1-y0)*t;
  }
  d[27]=left+(right-left)*l;d[29]=left+(right-left)*r;d[28]=bottom+(top-bottom)*b;d[30]=bottom+(top-bottom)*t;
}
function update(state,values){
  if(!owns(state,true)||!plain(state.sprite)||!values){retire(state);return false;}
  var d=state.scratch,n=state.node;
  if(!fillArray(d,0,values.wallUV)||!fillArray(d,8,values.actorUV)||!fillArray(d,16,values.clipXY)||
      !finite(values.maskOpacity)||values.maskOpacity<0||values.maskOpacity>1||!finite(values.alphaThreshold)||values.alphaThreshold<0||values.alphaThreshold>1||
      values.paintIsActor!==0&&values.paintIsActor!==1||!finite(n.width)||!finite(n.height)||n.width<=0||n.height<=0||!finite(n.anchorX)||!finite(n.anchorY)){
    retire(state);return false;
  }
  d[24]=values.maskOpacity;d[25]=values.alphaThreshold;d[26]=values.paintIsActor;
  d[27]=-n.width*n.anchorX;d[28]=-n.height*n.anchorY;d[29]=n.width*(1-n.anchorX);d[30]=n.height*(1-n.anchorY);
  for(var i=24;i<SCALARS;i++)if(!isFinite(d[i])){retire(state);return false;}
  intersect(d);
  var a=state.custom,changed=!a._gateQuadReady;
  if(!changed)for(i=0;i<SCALARS;i++)if(a._gateQuadData[i]!==d[i]){changed=true;break;}
  if(changed){a._gateQuadData.set(d);a._gateQuadReady=true;state.sprite.setVertsDirty();}
  return true;
}
exports.create=function(sprite){
  if(!supported()||!plain(sprite))return null;
  var prior=leases.get(sprite);if(prior){if(owns(prior,true))return prior;retire(prior);if(!plain(sprite))return null;}
  var simple=cc.Sprite.__assembler__&&cc.Sprite.__assembler__.Simple;
  if(!simple||sprite._assembler.constructor!==simple||typeof sprite._assembler.reset!=="function")return null;
  var state={sprite:sprite,node:sprite.node,proxy:sprite.node._proxy,original:sprite._assembler,custom:null,token:{},scratch:new Float32Array(SCALARS),retired:false};
  state.owns=function(){return owns(state,true);};state.update=function(values){return update(state,values);};state.dispose=function(){return retire(state);};
  try{
    ensure();var custom=state.custom=new Quad();custom._gateQuadToken=state.token;leases.set(sprite,state);
    custom.init(sprite);sprite._assembler=custom;
    if(!custom._dirtyPtr||custom._dirtyPtr.length!==1||!owns(state,true))throw Error("Native gate-quad ownership unavailable");
    // The detached original must not retain historical material/RT samplers.
    // Its geometry stays intact; restoration dirties it and rebuilds effects.
    state.original.reset();state.original._effect=[];
    sprite._updateColor();return state;
  }catch(error){
    // init may have attached native proxy before the component assignment.
    if(state.custom&&sprite._assembler===state.original&&state.custom._renderComp===sprite&&sprite.node===state.node&&state.node._proxy===state.proxy&&renderOwner(sprite,state.node))state.proxy.setAssembler(state.original);
    retire(state);return null;
  }
};
