"use strict";

// Pack native actor captures, including compound hero parts, into bounded GPU pages.
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
function integerWord(value){return !!value&&value.length===1&&(Object.prototype.toString.call(value)==="[object Int32Array]"||Object.prototype.toString.call(value)==="[object Uint32Array]");}
function nativeOrder(root,sources){
  var proxy=root&&root._proxy,flag=cc.RenderFlow.FLAG_REORDER_CHILDREN,seen=new Set();
  if(!flag||!proxy||!integerWord(proxy._dirtyPtr)||proxy._dirtyPtr!==root._dirtyPtr||root._reorderChildDirty)return null;
  for(var i=0;i<root.children.length;i++){
    var child=root.children[i],p=child&&child._proxy,z=p&&p._zOrderPtr;
    if(!valid(child)||!integerWord(z)||!Number.isInteger(child._localZOrder)||(z[0]|0)!==(child._localZOrder|0)||seen.has(z[0]|0))return null;
    seen.add(z[0]|0);
  }
  return{root:root,sources:sources};
}
function compound(item,main){
  var actor=item.actor,sources=item.sources&&item.sources.filter(function(s){return s&&s.enabled!==false&&s.node&&s.node.activeInHierarchy!==false;});
  if(!actor||actor.spAni||!actor.ctrPlayAni||!sources||!sources.length)return null;
  var root=sources[0].node.parent,children=root&&root.children,seen=new Set(),groups=[],group=[],last=-1;
  if(!root||root._renderComponent||root._reorderChildDirty||!Array.isArray(children))return null;
  var ancestor=root;for(;ancestor&&ancestor!==actor.node&&ancestor!==main;ancestor=ancestor.parent){}if(ancestor!==actor.node)return null;
  for(var i=0;i<sources.length;i++){
    var s=sources[i],n=s.node,index=children.indexOf(n);
    if(seen.has(s)||!valid(s)||!valid(n)||n===actor.node||n.parent!==root||index<0||!(s instanceof sp.Skeleton)||typeof s.isAnimationCached!=="function"||s.isAnimationCached()||n.childrenCount||n._renderComponent!==s)return null;
    if(!Array.isArray(n._components)||n._components.length!==1||n._components[0]!==s||n.is3DNode||n.skewX||n.skewY||cc.PrivateNode&&n instanceof cc.PrivateNode||!n._proxy||!n._proxy._cullingMaskPtr||n._proxy._cullingMaskPtr.length!==1||!n._dirtyPtr||n._dirtyPtr.length!==1||!n._trs||n._trs.length!==10)return null;
    for(var p=n.parent;p&&p!==main;p=p.parent)if(p.is3DNode||p._renderComponent instanceof cc.Mask)return null;
    if(p!==main)return null;
    seen.add(s);if(group.length&&index<last){groups.push(group);group=[];}group.push(s);last=index;
  }
  if(group.length)groups.push(group);var order=groups.length>1&&nativeOrder(root,sources);
  return{sources:sources,groups:order?[sources]:groups,order:order||null};
}
function availableMask(main){
  var pending=[main];
  while(pending.length){var node=pending.pop();if(node._cullingMask&MASK)return false;for(var i=0;i<node.children.length;i++)pending.push(node.children[i]);}
  return true;
}
function nativeRenderer(scope,source){try{return !!scope.resolve(source);}catch(error){return false;}}
function screenGrid(view){
  try{
    var camera=view.game&&view.game.camera,native=camera&&camera._camera,canvas=cc.game&&cc.game.canvas,main=view.main;
    if(!camera||camera.enabled===false||!camera.node||camera.node.is3DNode||camera.targetTexture||!native||typeof native.worldToScreen!=="function"||!canvas||!Number.isInteger(canvas.width)||!Number.isInteger(canvas.height)||canvas.width<=0||canvas.height<=0||!cc.Vec3||typeof main.getWorldPosition!=="function")return null;
    if(typeof camera.beforeDraw!=="function")return null;camera.beforeDraw();
    var position=new cc.Vec3();main.getWorldPosition(position);if(!Number.isFinite(position.z))return null;
    function project(x,y){var p=main.convertToWorldSpaceAR(cc.v2(x,y)),out=new cc.Vec3();native.worldToScreen(out,new cc.Vec3(p.x,p.y,position.z),canvas.width,canvas.height);return out;}
    var origin=project(0,0),x=project(256,0),y=project(0,256),sx=(x.x-origin.x)/256,sy=(y.y-origin.y)/256;
    if(!Number.isFinite(origin.x)||!Number.isFinite(origin.y)||!Number.isFinite(sx)||!Number.isFinite(sy)||sx<=0||sy<=0||Math.abs(sx-sy)>1e-5*Math.max(sx,sy)||Math.abs(x.y-origin.y)>1e-4||Math.abs(y.x-origin.x)>1e-4)return null;
    return{x:origin.x,y:origin.y,scale:(sx+sy)/2,samples:2};
  }catch(ignored){return null;}
}
function plan(item,description,grid,fixedDetail){
  var record=item.record,box=item.bounds,capacity=record._nativeActorAtlasWorldCapacity||record.size,width=Math.max(capacity?capacity.width:0,Math.ceil((box.maxX-box.minX+4)/32)*32),height=Math.max(capacity?capacity.height:0,Math.ceil((box.maxY-box.minY+4)/32)*32);
  var base={width:width,height:height},density=grid&&grid.scale*grid.samples;
  if(grid&&density>0&&density<=4){
    var left=Math.floor((grid.x+box.minX*grid.scale-2*grid.scale)*grid.samples),bottom=Math.floor((grid.y+box.minY*grid.scale-2*grid.scale)*grid.samples);
    var right=Math.ceil((grid.x+box.maxX*grid.scale+2*grid.scale)*grid.samples),top=Math.ceil((grid.y+box.maxY*grid.scale+2*grid.scale)*grid.samples);
    // Keep a spare texel across subpixel scroll. The ceil tolerance absorbs
    // projected Float32 noise only; density/grid phase remain unmodified, and
    // padded source extrema must still fit the resulting pixel dimensions.
    var requiredWidth=Math.ceil(width*density-1e-4),requiredHeight=Math.ceil(height*density-1e-4),pw=Math.min(512,Math.max(2,requiredWidth+1)),ph=Math.min(512,Math.max(2,requiredHeight+1));
    if(requiredWidth<=512&&requiredHeight<=512&&right-left<=pw&&top-bottom<=ph){
      var worldLeft=(left-grid.x*grid.samples)/density,worldBottom=(bottom-grid.y*grid.samples)/density;
      return{item:item,source:description.sources[0],sources:description.sources,groups:description.groups,order:description.order,record:record,center:{x:worldLeft+pw/density/2,y:worldBottom+ph/density/2},size:{width:pw/density,height:ph/density},tw:pw,th:ph,scale:density,capacity:base,screenSamples:grid.samples};
    }
  }
  var resolution=Math.min(fixedDetail===undefined?4:fixedDetail,512/Math.max(width,height)),tw=Math.max(2,Math.ceil(width*resolution)),th=Math.max(2,Math.ceil(height*resolution));
  return {item:item,source:description.sources[0],sources:description.sources,groups:description.groups,order:description.order,capacity:base,record:record,center:{x:(box.minX+box.maxX)/2,y:(box.minY+box.maxY)/2},size:{width:width,height:height},tw:tw,th:th,scale:th/height};
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
  var saved={mask:camera.cullingMask,target:camera.targetTexture,ortho:camera.orthoSize,clear:camera.clearFlags,x:view.cameraNode.x,y:view.cameraNode.y,z:view.cameraNode.z},moved=[],ordered=[],failure=null,epoch=this.epoch;
  this.drawing++;
  try{
    if(replace){texture=new cc.RenderTexture();texture.initWithSize(layout.width,layout.height,cc.gfx.RB_FMT_S8);}
    layout.tiles.forEach(function(tile){
      var p=tile.plan;
      if(p.order){
        p.order.sources.forEach(function(source,index){var node=source.node,proxy=node._proxy,word=proxy._zOrderPtr;ordered.push({node:node,proxy:proxy,word:word,original:word[0],originalJS:node._localZOrder,temporary:index,parent:p.order.root});word[0]=index;});
        p.order.root._proxy._dirtyPtr[0]|=cc.RenderFlow.FLAG_REORDER_CHILDREN;
      }
      p.sources.forEach(function(source){
        var node=source.node,old=point(node,main),goal={x:tile.x+p.tw/2+(old.x-p.center.x)*p.scale,y:tile.y+p.th/2+(old.y-p.center.y)*p.scale};
        var local=node.parent.convertToNodeSpaceAR(main.convertToWorldSpaceAR(cc.v2(goal.x,goal.y)));
        moved.push({node:node,source:source,x:node._trs[0],y:node._trs[1],sx:node._trs[7],sy:node._trs[8],mask:node._cullingMask});
        node._trs[0]=local.x;node._trs[1]=local.y;node._trs[7]*=p.scale;node._trs[8]*=p.scale;dirty(node);
      });
    });
    camera.cullingMask=MASK;camera.targetTexture=texture;camera.orthoSize=texture.height*scale/2;
    var center=main.convertToWorldSpaceAR(cc.v2(texture.width/2,texture.height/2));view.cameraNode.setPosition(center.x,center.y,0);
    var passes=1;layout.tiles.forEach(function(tile){passes=Math.max(passes,tile.plan.groups.length);});
    for(var pass=0;pass<passes;pass++){
      var selected=[];layout.tiles.forEach(function(tile){var group=tile.plan.groups[pass];if(group)Array.prototype.push.apply(selected,group);});
      var selectedSet=new Set(selected);moved.forEach(function(entry){culling(entry.node,selectedSet.has(entry.source)?MASK:entry.mask);});
      camera.clearFlags=cc.Camera.ClearFlags.DEPTH|cc.Camera.ClearFlags.STENCIL|(pass===0?cc.Camera.ClearFlags.COLOR:0);view._nativeRendered=true;
      scope.capture(main,function(){camera.render(main);},selected);
    }
  }catch(error){failure=error;
  }finally{
    function restore(action){try{action();}catch(error){if(!failure)failure=error;try{action();}catch(ignored){}}}
    for(var i=moved.length-1;i>=0;i--){var m=moved[i],node=m.node;if(!valid(node)||!node._proxy)continue;restore(function(){node._trs[0]=m.x;node._trs[1]=m.y;node._trs[7]=m.sx;node._trs[8]=m.sy;dirty(node);culling(node,m.mask);});}
    for(var orderIndex=ordered.length-1;orderIndex>=0;orderIndex--){
      var orderEntry=ordered[orderIndex];
      if(valid(orderEntry.node)&&orderEntry.node._proxy===orderEntry.proxy){
        if(orderEntry.word[0]!==orderEntry.temporary||orderEntry.node._localZOrder!==orderEntry.originalJS){if(!failure)failure=new Error("Renderer child order changed during atlas capture");}
        else restore(function(){orderEntry.word[0]=orderEntry.original;});
      }
      if(valid(orderEntry.parent)&&orderEntry.parent._proxy&&orderEntry.parent._proxy._dirtyPtr)restore(function(){orderEntry.parent._proxy._dirtyPtr[0]|=cc.RenderFlow.FLAG_REORDER_CHILDREN;});
    }
    if(valid(camera)){restore(function(){camera.cullingMask=saved.mask;});restore(function(){camera.targetTexture=saved.target;});restore(function(){camera.orthoSize=saved.ortho;});restore(function(){camera.clearFlags=saved.clear;});}
    if(valid(view.cameraNode))restore(function(){view.cameraNode.setPosition(saved.x,saved.y,saved.z);});
    // Outer Depth.update repairs scene inheritance once before the main draw.
    // Standalone, revoked or foreign scopes retain immediate repair.
    if(!scope||scope._sceneRepairOwner!==view||view._nativeCaptureScope!==scope||scope.finished)
      restore(function(){var scene=cc.director.getScene();if(valid(scene))scene._renderFlag|=cc.RenderFlow.FLAG_WORLD_TRANSFORM|cc.RenderFlow.FLAG_OPACITY;});
    this.drawing--;
  }
  if(failure||this.epoch!==epoch||view._destroyed){if(replace&&texture)texture.destroy();if(this.disposePending||view._destroyed)this.dispose();if(failure)throw failure;return false;}
  if(replace){this.releasePage(page);page.texture=texture;}
  this.captures++;return true;
};
Atlas.prototype.capture=function(items,draw,fixedDetail){
  if(fixedDetail!==undefined&&(!Number.isFinite(fixedDetail)||fixedDetail<=0||fixedDetail>4)){this.dispose();return 0;}
  var view=this.view,main=view.main,scope=view._nativeCaptureScope,self=this;
  if(this.disabled||view._destroyed||!scope||!scope.enabled||!scope.first||scope.finished||typeof scope.resolve!=="function"){this.dispose();return 0;}
  var candidates=[];
  items.forEach(function(item){
    if(item.record.draw===draw)return;
    var description=eligible(item,main)?{sources:[item.sources[0]],groups:[[item.sources[0]]]}:compound(item,main);
    if(description&&description.sources.every(function(source){return nativeRenderer(scope,source);}))candidates.push({item:item,description:description});
  });
  if(candidates.length<MIN_ACTORS||!availableMask(main)){this.dispose();return 0;}
  var origin=main.convertToWorldSpaceAR(cc.v2(0,0)),x=main.convertToWorldSpaceAR(cc.v2(1,0)),y=main.convertToWorldSpaceAR(cc.v2(0,1)),sx=x.x-origin.x,sy=y.y-origin.y;
  if(!(sx>0)||Math.abs(sx-sy)>.00001||Math.abs(x.y-origin.y)>.00001||Math.abs(y.x-origin.x)>.00001){this.dispose();return 0;}
  var grid=fixedDetail===undefined?screenGrid(view):null,layouts=pack(candidates.map(function(row){return plan(row.item,row.description,grid,fixedDetail);})),count=0,used=new Set(),epoch=this.epoch;
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
        record.center=p.center;record.size=p.size;record._nativeActorAtlasWorldCapacity=p.capacity;record.draw=draw;used.add(record);count++;
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
