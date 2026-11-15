"use strict";

// Keep each gate paint layer and blend. Native quads can share texture pairs;
// unsupported quads use the uniform shader or the original image stencil.
var owners=new WeakMap();
var FrameType=cc.SpriteFrame,frameProto=FrameType&&FrameType.prototype;
var rectGetter=frameProto&&frameProto.getRect,sizeGetter=frameProto&&frameProto.getOriginalSize,offsetGetter=frameProto&&frameProto.getOffset;
function standardFrame(frame){try{return !!(cc.sys&&cc.sys.isNative&&cc.ENGINE_VERSION==="2.4.13"&&FrameType&&cc.SpriteFrame===FrameType&&frame instanceof FrameType&&frame.constructor===FrameType&&frame.getRect===rectGetter&&frame.getOriginalSize===sizeGetter&&frame.getOffset===offsetGetter&&frame._rect&&frame._originalSize&&frame._offset);}catch(ignored){return false;}}

function valid(value){return !!value&&cc.isValid(value);}
function supported(view){return !!(view&&view.nativeCapture&&cc.sys&&cc.sys.isNative&&cc.ENGINE_VERSION==="2.4.13"&&cc.Material&&cc.EffectAsset&&cc.resources&&cc.resources.load);}
function uv(frame,out){
  var p=frame&&frame.uv;if(!p||p.length!==8)return null;
  for(var i=0;i<8;i++)if(!Number.isFinite(p[i]))return null;
  if(p[0]!==p[4]||p[2]!==p[6]||p[1]!==p[3]||p[5]!==p[7]||p[0]===p[2]||p[1]===p[5])return null;
  out=out||{};out.l=p[0];out.b=p[1];out.r=p[2];out.t=p[5];return out;
}
function opacity(node,chain){
  chain=chain||[];var count=0,value=255;for(var n=node;n;n=n.parent)chain[count++]=n;
  for(var i=count-1;i>=0;i--)value=Math.fround(Math.fround(value*chain[i].opacity)/255);
  return Math.max(0,Math.min(255,Math.floor(value)))/255;
}
function mapping(mask,paint,mu,pu,out){
  var x=(mu.r-mu.l)*paint.width/mask.width/(pu.r-pu.l),y=(mu.t-mu.b)*paint.height/mask.height/(pu.t-pu.b);
  out=out||[0,0,0,0];out[0]=x;out[1]=y;out[2]=mu.l+(paint.x-paint.width/2+mask.width/2)/mask.width*(mu.r-mu.l)-pu.l*x;out[3]=mu.b+(paint.y-paint.height/2+mask.height/2)/mask.height*(mu.t-mu.b)-pu.b*y;return out;
}
function plain(node){return node.anchorX===.5&&node.anchorY===.5&&!node.angle&&node.scaleX===1&&node.scaleY===1&&!node.skewX&&!node.skewY;}
function fullFrame(frame){
  var direct=frame&&standardFrame(frame),r=direct?frame._rect:frame&&frame.getRect&&frame.getRect(),s=direct?frame._originalSize:frame&&frame.getOriginalSize&&frame.getOriginalSize(),o=direct?frame._offset:frame&&frame.getOffset&&frame.getOffset();
  return !!r&&!!s&&!!o&&r.width===s.width&&r.height===s.height&&!o.x&&!o.y;
}
function set(state,name,value,vector){
  var old=state.values[name],same=old===value;
  if(vector){same=!!old&&old.length===value.length;for(var i=0;same&&i<value.length;i++)if(old[i]!==value[i])same=false;}
  if(same)return;
  state.material.setProperty(name,vector?new cc.Vec4(value[0],value[1],value[2],value[3]):value);
  if(vector){var saved=old;if(!saved||saved===value||saved.length!==value.length)saved=[0,0,0,0];for(i=0;i<value.length;i++)saved[i]=value[i];state.values[name]=saved;}
  else state.values[name]=value;
}
function clear(state,name){state.values[name]=null;if(valid(state.material)&&state.material._owner===state.sprite)state.material.setProperty(name,null);}
function releaseOwned(material,sprite){
  if(!material||material._owner!==sprite)return;
  // Variants of this controller-local base must never enter the global pool.
  material._owner=null;if(material.destroy)material.destroy();
}
function retire(state){
  if(!state||state.retired)return;state.retired=true;
  var mask=state.mask,sprite=state.sprite,material=state.material,original=state.original,controller=state.controller;
  if(state.quad)try{state.quad.dispose();}catch(ignored){}
  try{clear(state,"maskTexture");}catch(ignored){}
  try{clear(state,"texture");}catch(ignored){}
  if(valid(sprite)&&sprite.node===state.spriteNode&&sprite.getMaterial(0)===material){
    try{sprite.setMaterial(0,original);}catch(ignored){}
    if(sprite.getMaterial(0)!==material)releaseOwned(material,sprite);
  }else if(!valid(sprite)||sprite.getMaterial(0)!==material)releaseOwned(material,sprite);
  try{if(valid(mask)&&mask.node===state.maskNode&&(!state.maskNode._renderComponent||state.maskNode._renderComponent===mask))mask.enabled=state.enabled;}catch(ignored){}
  if(owners.get(mask)===state)owners.delete(mask);if(owners.get(sprite)===state)owners.delete(sprite);
  controller.states.delete(state);if(controller.overlays.get(state.overlay)===state)controller.overlays.delete(state.overlay);
  state.mask=state.sprite=state.maskNode=state.spriteNode=state.material=state.original=state.quad=state.overlay=state.controller=null;state.values={};
}
function load(controller,batch){
  var token={},tokenKey=batch?"batchToken":"token",baseKey=batch?"batchBase":"base",effectKey=batch?"batchEffect":"effect",retainedKey=batch?"batchRetained":"effectRetained",failedKey=batch?"batchFailed":"failed";
  controller[tokenKey]=token;
  function loaded(error,effect){
    if(controller.disposed||controller[tokenKey]!==token||!controller.view||controller.view._destroyed)return;
    controller[tokenKey]=null;if(error||!effect){controller[failedKey]=true;return;}
    var retained=false,base=null;
    try{
      if(effect.addRef){effect.addRef();retained=true;}base=cc.Material.create(effect);base.define("USE_TEXTURE",true);
      if(controller.disposed||!controller.view||controller.view._destroyed){base.destroy();if(retained&&effect.decRef)effect.decRef();return;}
      controller[effectKey]=effect;controller[retainedKey]=retained;controller[baseKey]=base;
    }catch(issue){controller[failedKey]=true;if(base)base.destroy();if(retained&&effect.decRef)effect.decRef();}
  }
  try{cc.resources.load(batch?"GateOverlayBatch":"GateOverlayClip",cc.EffectAsset,loaded);}catch(error){loaded(error);}
}
function Controller(view){
  this.view=view;this.states=new Set();this.overlays=new WeakMap();this.scratch=new WeakMap();this.effect=this.base=this.batchEffect=this.batchBase=null;
  this.effectRetained=this.batchRetained=this.disposed=this.failed=this.batchFailed=false;this.token=this.batchToken=null;this.quadApi=null;this.batchRejected=new WeakSet();
  try{var api=require("NativeGateQuad");if(api&&typeof api.create==="function")this.quadApi=api;}catch(ignored){}
  load(this,false);if(this.quadApi&&!this.disposed)load(this,true);
}
function scratch(){
  var s={mu:{l:0,b:0,r:0,t:0},pu:{l:0,b:0,r:0,t:0},map:[0,0,0,0],rect:[0,0,0,0],paint:[0,0,0,0,0,0,0,0],mask:[0,0,0,0,0,0,0,0],clip:[0,0,0,0,0,0,0,0],chain:[],pair:{wall:null,body:null,role:false},data:{},d:{},busy:false};s.d.scratch=s;return s;
}
function describe(overlay,old,s){
  var mask=overlay&&overlay.mask,sprite=overlay&&overlay.sprite;
  if(!valid(mask)||!valid(sprite)||!valid(mask.node)||!valid(sprite.node))return null;
  var mn=mask.node,pn=sprite.node,mf=mask.spriteFrame,pf=sprite.spriteFrame,mu=uv(mf,s.mu),pu=uv(pf,s.pu),alpha=opacity(mn,s.chain);
  if(!mu||!pu||!fullFrame(mf)||!fullFrame(pf)||!old&&!mask.enabled||mask.inverted||mn.width<=0||mn.height<=0||pn.parent!==mn||!plain(mn)||!plain(pn)||!isFinite(alpha))return null;
  var d=s.d;d.mask=mask;d.sprite=sprite;d.mn=mn;d.pn=pn;d.mf=mf;d.pf=pf;d.mu=mu;d.pu=pu;d.alpha=alpha;return d;
}
function canonical(d,info){
  if(!info||!info.wall||!info.body)return null;
  var wall=info.wall.frame,body=info.body.frame,role=!!info.paintIsActor;
  if(!wall||!body||d.mf!==(role?wall:body)||d.pf!==(role?body:wall))return null;
  var wt=wall.getTexture(),bt=body.getTexture();if(!valid(wt)||!valid(bt))return null;
  var pair=d.scratch.pair;pair.wall=wt;pair.body=bt;pair.role=role;return pair;
}
function vertices(d,pair){
  var s=d.scratch,map=mapping(d.mn,d.pn,d.mu,d.pu,s.map),paint=s.paint,mask=s.mask,clip=s.clip;
  paint[0]=paint[4]=d.pu.l;paint[2]=paint[6]=d.pu.r;paint[1]=paint[3]=d.pu.b;paint[5]=paint[7]=d.pu.t;
  for(var i=0;i<4;i++){
    var j=i*2,u=paint[j],v=paint[j+1],x=i%2,y=i>1?1:0;
    mask[j]=u*map[0]+map[2];mask[j+1]=v*map[1]+map[3];
    clip[j]=(d.pn.x+(x-.5)*d.pn.width)/d.mn.width+.5;clip[j+1]=(d.pn.y+(y-.5)*d.pn.height)/d.mn.height+.5;
  }
  var data=s.data;data.wallUV=pair.role?mask:paint;data.actorUV=pair.role?paint:mask;data.clipXY=clip;data.maskOpacity=d.alpha;data.alphaThreshold=d.mask.alphaThreshold;data.paintIsActor=pair.role?1:0;return data;
}
function apply(controller,overlay,d,state,pair){
  var batch=!!pair,sprite=d.sprite,quad=null,original=null;
  try{
    if(!state){
      original=sprite.getMaterial(0);
      if(batch){quad=controller.quadApi.create(sprite);if(!quad){controller.batchRejected.add(sprite);return false;}}
      var material;
      try{material=sprite.setMaterial(0,batch?controller.batchBase:controller.base);}catch(issue){
        var partial=sprite.getMaterial(0);if(partial!==original){try{sprite.setMaterial(0,original);}catch(ignored){}if(sprite.getMaterial(0)!==partial)releaseOwned(partial,sprite);}throw issue;
      }
      state={controller:controller,overlay:overlay,mask:d.mask,sprite:sprite,maskNode:d.mn,spriteNode:d.pn,original:original,material:material,quad:quad,batch:batch,enabled:d.mask.enabled,values:{},retired:false};
      controller.states.add(state);controller.overlays.set(overlay,state);owners.set(d.mask,state);owners.set(sprite,state);d.mask.enabled=false;
    }
    if(batch){
      set(state,"texture",pair.wall);set(state,"maskTexture",pair.body);
      if(!state.quad.update(vertices(d,pair))){controller.batchRejected.add(sprite);retire(state);return false;}
    }else{
      set(state,"texture",d.pf.getTexture());set(state,"maskTexture",d.mf.getTexture());set(state,"maskMap",mapping(d.mn,d.pn,d.mu,d.pu,d.scratch.map),true);
      var rectangle=d.scratch.rect;rectangle[0]=Math.min(d.mu.l,d.mu.r);rectangle[1]=Math.min(d.mu.b,d.mu.t);rectangle[2]=Math.max(d.mu.l,d.mu.r);rectangle[3]=Math.max(d.mu.b,d.mu.t);set(state,"maskRect",rectangle,true);
      set(state,"maskOpacity",d.alpha);set(state,"alphaThreshold",d.mask.alphaThreshold);
    }
    return true;
  }catch(error){
    if(state)retire(state);else if(quad)try{quad.dispose();}catch(ignored){}
    controller[batch?"batchFailed":"failed"]=true;controller.states.forEach(function(other){if(other.batch===batch)retire(other);});return false;
  }
}
Controller.prototype.sync=function(overlay,info){
  var old=this.overlays.get(overlay),mask=overlay&&overlay.mask,sprite=overlay&&overlay.sprite;
  if(old&&(old.mask!==mask||old.sprite!==sprite||old.maskNode!==mask.node||old.spriteNode!==sprite.node||sprite.getMaterial(0)!==old.material||old.quad&&!old.quad.owns())){retire(old);old=null;}
  if(this.disposed){if(old)retire(old);return false;}
  if(!overlay||(typeof overlay!=="object"&&typeof overlay!=="function"))return false;
  var s=this.scratch.get(overlay);if(!s){s=scratch();this.scratch.set(overlay,s);}if(s.busy)s=scratch();s.busy=true;
  try{
    var d=describe(overlay,old,s);if(!d){if(old)retire(old);return false;}
    var pair=this.batchBase&&!this.batchFailed&&this.quadApi&&!this.batchRejected.has(sprite)?canonical(d,info):null;
    if(pair){if(old&&!old.batch){retire(old);old=null;}if(apply(this,overlay,d,old,pair))return true;old=null;}
    else if(old&&old.batch){retire(old);old=null;}
    if(this.failed||!this.base){if(old)retire(old);return false;}
    return apply(this,overlay,d,old,null);
  }finally{
    s.d.mask=s.d.sprite=s.d.mn=s.d.pn=s.d.mf=s.d.pf=null;s.pair.wall=s.pair.body=null;for(var i=0;i<s.chain.length;i++)s.chain[i]=null;s.busy=false;
  }
};
Controller.prototype.prune=function(){this.states.forEach(function(state){if(!valid(state.mask)||!valid(state.maskNode)||!valid(state.sprite)||!valid(state.spriteNode)||state.overlay.mask!==state.mask||state.overlay.sprite!==state.sprite||state.mask.node!==state.maskNode||state.sprite.node!==state.spriteNode||state.quad&&!state.quad.owns())retire(state);});};
Controller.prototype.dispose=function(){
  if(this.disposed)return;this.disposed=true;this.token=this.batchToken=null;this.states.forEach(retire);
  if(this.base)this.base.destroy();if(this.batchBase)this.batchBase.destroy();
  if(this.effectRetained&&this.effect&&this.effect.decRef)this.effect.decRef();if(this.batchRetained&&this.batchEffect&&this.batchEffect.decRef)this.batchEffect.decRef();
  this.effectRetained=this.batchRetained=false;this.base=this.effect=this.batchBase=this.batchEffect=this.quadApi=this.view=this.scratch=null;
};
exports.create=function(view){return supported(view)?new Controller(view):null;};
exports.unbind=function(renderer){
  var state=renderer&&owners.get(renderer);if(!state||state.retired)return;
  // A rejected helper keeps its stable uniform fallback until the paint source
  // changes. Avoid rebuilding both variants on every unsupported render frame.
  if(renderer===state.sprite)state.controller.batchRejected.delete(renderer);
  try{if(state.batch||renderer===state.mask)clear(state,"maskTexture");if(state.batch||renderer===state.sprite)clear(state,"texture");}catch(error){retire(state);}
};
exports.park=function(overlay){
  // Retain owned variants/quad scalars, detaching every current and dormant
  // component-owned sampler before source frame/texture retirement.
  var state=overlay&&owners.get(overlay.mask),mask=overlay&&overlay.mask,sprite=overlay&&overlay.sprite;
  if(state&&!state.retired){clear(state,"maskTexture");clear(state,"texture");if(valid(state.original)&&state.original._owner===state.sprite)state.original.setProperty("texture",null);}
  [mask,sprite].forEach(function(renderer){var material=renderer&&renderer._materials&&renderer._materials[0];if(valid(material)&&material._owner===renderer&&(!state||material!==state.material))material.setProperty("texture",null);});
};
exports.retire=function(renderer){retire(renderer&&owners.get(renderer));};
