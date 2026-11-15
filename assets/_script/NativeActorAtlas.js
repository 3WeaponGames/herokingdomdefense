"use strict";

// Pack native NPC occlusion captures into bounded, tightly sized GPU pages.
// Only render-only child nodes move, synchronously, between capture/restore.
// Actors, physics, animation clocks and source hierarchy are never changed.
var LIMIT=2048,PAD=2,MIN_ACTORS=3,MASK=1<<30;
function valid(value){return !!value&&cc.isValid(value,true);}
function supported(view){return !!(view&&view.nativeCapture&&cc.sys&&cc.sys.isNative&&cc.ENGINE_VERSION==="2.4.13"&&cc.Node&&cc.Node._LocalDirtyFlag&&cc.RenderTexture&&cc.SpriteFrame);}
function point(node,main,x,y){return main.convertToNodeSpaceAR(node.convertToWorldSpaceAR(cc.v2(x||0,y||0)));}
function eligible(item,main){
  var actor=item.actor,source=item.sources&&item.sources.length===1&&item.sources[0],node=source&&source.node;
  if(!actor||actor.spAni!==source||!valid(source)||!valid(node)||node===actor.node||node.parent!==actor.node||!node.activeInHierarchy||source.enabled===false)return false;
  if(!(source instanceof sp.Skeleton)||typeof source.isAnimationCached!=="function"||source.isAnimationCached()||node.childrenCount||node._renderComponent!==source)return false;
  if(!Array.isArray(node._components)||node._components.length!==1||node._components[0]!==source||node.is3DNode||actor.node.is3DNode||node.skewX||node.skewY)return false;
  if(cc.PrivateNode&&node instanceof cc.PrivateNode||!node._proxy||!node._proxy._cullingMaskPtr||node._proxy._cullingMaskPtr.length!==1||!node._dirtyPtr||node._dirtyPtr.length!==1||!node._trs||node._trs.length!==10)return false;
  var parent=node.parent;
  for(;parent&&parent!==main;parent=parent.parent)if(parent._renderComponent instanceof cc.Mask)return false;
  return parent===main;
}
function availableMask(main){
  var pending=[main];
  while(pending.length){var node=pending.pop();if(node._cullingMask&MASK)return false;for(var i=0;i<node.children.length;i++)pending.push(node.children[i]);}
  return true;
}
function nativeRenderer(scope,source){try{return !!scope.resolve(source);}catch(error){return false;}}
function plan(item){
  var record=item.record,box=item.bounds,width=Math.max(record.size?record.size.width:0,Math.ceil((box.maxX-box.minX+4)/32)*32),height=Math.max(record.size?record.size.height:0,Math.ceil((box.maxY-box.minY+4)/32)*32);
  var resolution=Math.min(4,512/Math.max(width,height)),tw=Math.max(2,Math.ceil(width*resolution)),th=Math.max(2,Math.ceil(height*resolution));
  return {item:item,source:item.sources[0],record:record,center:{x:(box.minX+box.maxX)/2,y:(box.minY+box.maxY)/2},size:{width:width,height:height},tw:tw,th:th,scale:th/height};
}
function shelf(plans,width){
  var placed=[],x=0,y=0,row=0,used=0;
  for(var i=0;i<plans.length;i++){
    var p=plans[i],w=p.tw+PAD*2,h=p.th+PAD*2;if(w>width)break;
    if(x+w>width){x=0;y+=row;row=0;}if(y+h>LIMIT)break;
    placed.push({plan:p,x:x+PAD,y:y+PAD});x+=w;row=Math.max(row,h);used=Math.max(used,x);
  }
  return {tiles:placed,width:used,height:y+row};
}
function pack(plans){
  // Try exact row widths as well as regular widths. NPOT clamp textures need
  // no power-of-two padding; 33 medium NPCs must not allocate a 4096² target.
  var remaining=plans.slice().sort(function(a,b){return b.th-a.th||b.tw-a.tw;}),pages=[];
  while(remaining.length){
    var widths=new Set([LIMIT]),sum=0;
    for(var i=0;i<remaining.length;i++){sum+=remaining[i].tw+PAD*2;if(sum>LIMIT)break;widths.add(sum);}
    for(var w=128;w<LIMIT;w+=128)widths.add(w);
    var best=null;
    widths.forEach(function(width){var value=shelf(remaining,width);if(value.tiles.length&&(!best||value.tiles.length>best.tiles.length||value.tiles.length===best.tiles.length&&value.width*value.height<best.width*best.height))best=value;});
    if(!best)return [];
    pages.push(best);remaining.splice(0,best.tiles.length);
  }
  return pages;
}
function dirty(node){node._localMatDirty|=cc.Node._LocalDirtyFlag.POSITION|cc.Node._LocalDirtyFlag.SCALE;node._worldMatDirty=true;node._dirtyPtr[0]|=cc.RenderFlow.FLAG_TRANSFORM|cc.RenderFlow.FLAG_WORLD_TRANSFORM|cc.RenderFlow.FLAG_OPACITY;}
function culling(node,mask){node._cullingMask=mask;node._proxy._cullingMaskPtr[0]=mask;}
function Atlas(view,release){this.view=view;this.releaseRecord=release;this.pages=[];this.disabled=false;this.captures=0;this.actorCaptures=0;this.epoch=0;this.drawing=0;this.disposePending=false;}
Atlas.prototype.forget=function(record){
  var page=record._nativeActorAtlasPage;
  if(page&&page.owner===this){page.records.delete(record);delete record._nativeActorAtlasPage;delete record._nativeActorAtlasRect;}
};
Atlas.prototype.releasePage=function(page){
  var self=this;
  page.records.forEach(function(record){if(record._nativeActorAtlasPage===page){self.releaseRecord(record);delete record.draw;delete record._nativeActorAtlasPage;delete record._nativeActorAtlasRect;}});
  page.records.clear();if(page.texture)page.texture.destroy();page.texture=null;
};
Atlas.prototype.dispose=function(){this.epoch++;if(this.drawing){this.disposePending=true;return;}this.disposePending=false;var self=this;this.pages.forEach(function(page){self.releasePage(page);});this.pages=[];};
Atlas.prototype.drawPage=function(layout,page,scope){
  var view=this.view,main=view.main,camera=view.camera,origin=main.convertToWorldSpaceAR(cc.v2(0,0)),axis=main.convertToWorldSpaceAR(cc.v2(1,0)),scale=axis.x-origin.x;
  var texture=page.texture,replace=!texture||texture.width<layout.width||texture.height<layout.height||layout.width*layout.height<texture.width*texture.height*.5;
  var saved={mask:camera.cullingMask,target:camera.targetTexture,ortho:camera.orthoSize,clear:camera.clearFlags,x:view.cameraNode.x,y:view.cameraNode.y,z:view.cameraNode.z},moved=[],failure=null,epoch=this.epoch;
  this.drawing++;
  try{
    if(replace){texture=new cc.RenderTexture();texture.initWithSize(layout.width,layout.height,cc.gfx.RB_FMT_S8);}
    layout.tiles.forEach(function(tile){
      var p=tile.plan,node=p.source.node,old=point(node,main),goal={x:tile.x+p.tw/2+(old.x-p.center.x)*p.scale,y:tile.y+p.th/2+(old.y-p.center.y)*p.scale};
      var local=node.parent.convertToNodeSpaceAR(main.convertToWorldSpaceAR(cc.v2(goal.x,goal.y)));
      moved.push({node:node,x:node._trs[0],y:node._trs[1],sx:node._trs[7],sy:node._trs[8],mask:node._cullingMask});
      // Shared native TRS is a renderer-leaf-only, version-checked fast path.
      // Public position/scale setters emit events and may sync physics bodies.
      node._trs[0]=local.x;node._trs[1]=local.y;node._trs[7]*=p.scale;node._trs[8]*=p.scale;dirty(node);culling(node,MASK);
    });
    camera.cullingMask=MASK;camera.targetTexture=texture;camera.orthoSize=texture.height*scale/2;
    var center=main.convertToWorldSpaceAR(cc.v2(texture.width/2,texture.height/2));view.cameraNode.setPosition(center.x,center.y,0);
    camera.clearFlags=cc.Camera.ClearFlags.COLOR|cc.Camera.ClearFlags.DEPTH|cc.Camera.ClearFlags.STENCIL;view._nativeRendered=true;
    scope.capture(main,function(){camera.render(main);},layout.tiles.map(function(tile){return tile.plan.source;}));
  }catch(error){failure=error;
  }finally{
    function restore(action){try{action();}catch(error){if(!failure)failure=error;try{action();}catch(ignored){}}}
    for(var i=moved.length-1;i>=0;i--){var m=moved[i],node=m.node;if(!valid(node)||!node._proxy)continue;restore(function(){node._trs[0]=m.x;node._trs[1]=m.y;node._trs[7]=m.sx;node._trs[8]=m.sy;dirty(node);culling(node,m.mask);});}
    if(valid(camera)){restore(function(){camera.cullingMask=saved.mask;});restore(function(){camera.targetTexture=saved.target;});restore(function(){camera.orthoSize=saved.ortho;});restore(function(){camera.clearFlags=saved.clear;});}
    if(valid(view.cameraNode))restore(function(){view.cameraNode.setPosition(saved.x,saved.y,saved.z);});
    restore(function(){var scene=cc.director.getScene();if(valid(scene))scene._renderFlag|=cc.RenderFlow.FLAG_WORLD_TRANSFORM|cc.RenderFlow.FLAG_OPACITY;});
    this.drawing--;
  }
  if(failure||this.epoch!==epoch||view._destroyed){if(replace&&texture)texture.destroy();if(this.disposePending||view._destroyed)this.dispose();if(failure)throw failure;return false;}
  if(replace){this.releasePage(page);page.texture=texture;}
  this.captures++;return true;
};
Atlas.prototype.capture=function(items,draw){
  var view=this.view,main=view.main,scope=view._nativeCaptureScope,self=this;
  if(this.disabled||view._destroyed||!scope||!scope.enabled||!scope.first||scope.finished||typeof scope.resolve!=="function"){this.dispose();return 0;}
  var candidates=items.filter(function(item){return item.record.draw!==draw&&eligible(item,main)&&nativeRenderer(scope,item.sources[0]);});
  if(candidates.length<MIN_ACTORS||!availableMask(main)){this.dispose();return 0;}
  var origin=main.convertToWorldSpaceAR(cc.v2(0,0)),x=main.convertToWorldSpaceAR(cc.v2(1,0)),y=main.convertToWorldSpaceAR(cc.v2(0,1)),sx=x.x-origin.x,sy=y.y-origin.y;
  if(!(sx>0)||Math.abs(sx-sy)>.00001||Math.abs(x.y-origin.y)>.00001||Math.abs(y.x-origin.x)>.00001){this.dispose();return 0;}
  var layouts=pack(candidates.map(plan)),count=0,used=new Set(),epoch=this.epoch;
  try{
    for(var index=0;index<layouts.length;index++){
      var layout=layouts[index];
      var page=self.pages[index];if(!page)page=self.pages[index]={owner:self,records:new Set(),texture:null};
      if(!self.drawPage(layout,page,scope))break;
      layout.tiles.forEach(function(tile){
        var p=tile.plan,record=p.record,key=[tile.x,tile.y,p.tw,p.th].join(":");
        if(record._nativeActorAtlasPage!==page||record._nativeActorAtlasRect!==key||!record.frame||record.frame.getTexture()!==page.texture){
          self.forget(record);self.releaseRecord(record);
          // Creator otherwise takes originalSize from the entire atlas. Masks
          // use untrimmed Sprite geometry, so that default shrinks their quad.
          record.frame=new cc.SpriteFrame(page.texture,cc.rect(tile.x,tile.y,p.tw,p.th),false,cc.v2(0,0),{width:p.tw,height:p.th});
          record.frame.setFlipY(true);record._nativeActorAtlasPage=page;record._nativeActorAtlasRect=key;page.records.add(record);
        }
        record.center=p.center;record.size=p.size;record.draw=draw;used.add(record);count++;
      });
    }
  }catch(error){
    // Restore paths run before falling back. Stop retrying an incompatible
    // host/renderer every frame; ordinary individual captures remain available.
    this.disabled=true;if(cc.warn)cc.warn("Native actor atlas unavailable",error.message||error);
  }
  if(this.epoch!==epoch){count=0;used.clear();}
  this.pages.forEach(function(page){page.records.forEach(function(record){if(!used.has(record)){self.forget(record);self.releaseRecord(record);}});});
  while(this.pages.length>layouts.length)this.releasePage(this.pages.pop());
  this.actorCaptures+=count;return count;
};
Atlas.prototype.stats=function(){var bytes=0;this.pages.forEach(function(page){if(page.texture)bytes+=page.texture.width*page.texture.height*4;});return {pages:this.pages.length,bytes:bytes,captures:this.captures,actors:this.actorCaptures,disabled:this.disabled};};
exports.create=function(view,release){return supported(view)?new Atlas(view,release):null;};
