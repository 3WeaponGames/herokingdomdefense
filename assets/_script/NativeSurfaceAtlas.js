"use strict";
// Reuse exact-resolution wall captures in bounded native GPU atlas pages.
// Source captures remain owned by their records; output frames use leases.
var LIMIT=2048,PAD=2,DEFAULT_BYTES=32*1024*1024;
function valid(value){return !!value&&cc.isValid(value,true);}
function supported(){return !!(typeof cc!=="undefined"&&cc.sys&&cc.sys.isNative&&cc.ENGINE_VERSION==="2.4.13"&&cc.Node&&cc.Camera&&cc.Camera.prototype&&cc.Camera.prototype.render&&cc.Sprite&&cc.SpriteFrame&&cc.RenderTexture&&cc.macro&&cc.macro.BlendFactor&&cc.RenderFlow&&cc.director);}
function same(a,b){if(a===b)return true;if(!Array.isArray(a)||!Array.isArray(b)||a.length!==b.length)return false;for(var i=0;i<a.length;i++)if(a[i]!==b[i])return false;return true;}
function stamp(value){return Array.isArray(value)?value.slice():value;}
function materialClear(sprite){
  if(!sprite)return;
  sprite.spriteFrame=null;
  var materials=sprite._materials||[];
  for(var i=0;i<materials.length;i++){var material=materials[i];if(material&&material._owner===sprite&&typeof material.setProperty==="function")material.setProperty("texture",null);}
}
function destroyFrames(generation){generation.frames.forEach(function(frame){if(valid(frame))frame.destroy();});generation.frames.clear();generation.states.clear();generation.pages.forEach(function(page){page.tiles=[];});generation.retired=true;}
function destroyGeneration(generation){destroyFrames(generation);generation.pages.forEach(function(page){if(valid(page.texture))page.texture.destroy();});generation.pages=[];generation.states.clear();}
function shelf(plans,width){
  var tiles=[],x=0,y=0,row=0,used=0;
  for(var i=0;i<plans.length;i++){
    var plan=plans[i],w=plan.width+PAD*2,h=plan.height+PAD*2;
    if(w>width)break;
    if(x+w>width){x=0;y+=row;row=0;}
    if(y+h>LIMIT)break;
    tiles.push({record:plan.record,plan:plan,x:x+PAD,y:y+PAD,width:plan.width,height:plan.height});
    x+=w;row=Math.max(row,h);used=Math.max(used,x);
  }
  return{tiles:tiles,width:used,height:y+row};
}
function pack(plans){
  var rest=plans.slice().sort(function(a,b){return b.height-a.height||b.width-a.width||a.id-b.id;}),pages=[];
  while(rest.length){
    var widths=new Set([LIMIT]),sum=0,best=null;
    for(var i=0;i<rest.length;i++){sum+=rest[i].width+PAD*2;if(sum>LIMIT)break;widths.add(sum);}
    for(var width=128;width<LIMIT;width+=128)widths.add(width);
    widths.forEach(function(w){var page=shelf(rest,w);if(page.tiles.length&&(!best||page.tiles.length>best.tiles.length||page.tiles.length===best.tiles.length&&page.width*page.height<best.width*best.height))best=page;});
    if(!best)return null;
    pages.push(best);rest.splice(0,best.tiles.length);
  }
  return pages;
}
function generation(){return{pages:[],frames:new Map(),states:new Map(),retired:true,serial:0};}
function Atlas(options){
  options=options||{};this.scene=options.scene||cc.director.getScene();this.maxBytes=options.maxBytesPerGeneration||DEFAULT_BYTES;this.maxPages=options.maxPages||8;
  this.generations=[generation(),generation()];this.current=-1;this.serial=0;this.ids=new WeakMap();this.nextId=1;this.pool=[];this.root=null;this.cameraNode=null;this.camera=null;this.disposed=false;this.drawing=false;this.copies=0;this.cacheHits=0;this.lastError=null;
}
Atlas.prototype.setup=function(){
  if(this.root)return;
  var root=this.root=new cc.Node("NativeSurfaceAtlas"),cameraNode=this.cameraNode=new cc.Node("NativeSurfaceAtlasCamera");
  root.parent=this.scene;root.setPosition(100000,100000);root.active=false;
  cameraNode.parent=this.scene;cameraNode.setPosition(100000,100000);cameraNode.active=false;
  var camera=this.camera=cameraNode.addComponent(cc.Camera);camera.enabled=false;camera.alignWithScreen=false;camera.ortho=true;camera.nearClip=-1000;camera.farClip=1000;
  camera.backgroundColor=cc.color(0,0,0,0);camera.clearFlags=cc.Camera.ClearFlags.COLOR|cc.Camera.ClearFlags.DEPTH|cc.Camera.ClearFlags.STENCIL;
};
Atlas.prototype.describe=function(record){
  if(!record||typeof record!=="object"||!valid(record.frame)||typeof record.frame.getTexture!=="function"||record.frame.isRotated&&record.frame.isRotated())return null;
  var frame=record.frame,texture=frame.getTexture(),rect=frame.getRect(),width=rect.width,height=rect.height;
  if(!valid(texture)||record.texture&&record.texture!==texture||!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width+PAD*2>LIMIT||height+PAD*2>LIMIT)return null;
  var uv=Array.prototype.slice.call(frame.uv||[]);if(uv.length!==8||uv.some(function(v){return !Number.isFinite(v);}))return null;
  var id=this.ids.get(record);if(!id){id=this.nextId++;this.ids.set(record,id);}
  var prior=this.current>=0&&this.generations[this.current].states.get(record),sourceFrame=frame,sourceTexture=texture,sourceUV=uv;
  // Accept our current crop as a stable alias while callers retain leaf identity.
  // If content changes they must supply its newly captured original frame.
  if(prior&&frame===prior.output&&same(record.signature,prior.signature)){
    sourceFrame=prior.sourceFrame;sourceTexture=prior.sourceTexture;sourceUV=prior.sourceUV;
  }
  return{record:record,id:id,frame:frame,texture:texture,width:width,height:height,signature:stamp(record.signature),sourceFrame:sourceFrame,sourceTexture:sourceTexture,sourceUV:sourceUV.slice(),cacheable:record.signature!==undefined};
};
Atlas.prototype.unchanged=function(plans){
  if(this.current<0)return false;
  var states=this.generations[this.current].states;if(states.size!==plans.length)return false;
  for(var i=0;i<plans.length;i++){
    var p=plans[i],old=states.get(p.record);
    if(!p.cacheable||!old||old.sourceFrame!==p.sourceFrame||old.sourceTexture!==p.sourceTexture||old.width!==p.width||old.height!==p.height||!same(old.signature,p.signature)||!same(old.sourceUV,p.sourceUV))return false;
  }
  return true;
};
Atlas.prototype.sprite=function(index){
  var sprite=this.pool[index];if(sprite)return sprite;
  var node=new cc.Node("SurfaceCopy"+index);node.parent=this.root;node.active=false;node.color=cc.color(255,255,255);node.opacity=255;
  sprite=node.addComponent(cc.Sprite);sprite.sizeMode=cc.Sprite.SizeMode.CUSTOM;sprite.trim=true;
  sprite.srcBlendFactor=cc.macro.BlendFactor.ONE;sprite.dstBlendFactor=cc.macro.BlendFactor.ZERO;this.pool.push(sprite);return sprite;
};
Atlas.prototype.drawPage=function(layout,page){
  var texture=page.texture,camera=this.camera,newTexture=null;
  try{
    if(!valid(texture)||texture.width!==layout.width||texture.height!==layout.height){
      newTexture=new cc.RenderTexture();newTexture.initWithSize(layout.width,layout.height,cc.gfx.RB_FMT_S8);newTexture.packable=false;texture=newTexture;
    }
    for(var i=0;i<layout.tiles.length;i++){
      var tile=layout.tiles[i],sprite=this.sprite(i),node=sprite.node;
      sprite.spriteFrame=tile.plan.frame;node.setContentSize(tile.width,tile.height);node.setPosition(tile.x+tile.width/2,tile.y+tile.height/2);node.active=true;
    }
    for(var unused=layout.tiles.length;unused<this.pool.length;unused++)this.pool[unused].node.active=false;
    this.root.active=true;this.cameraNode.active=true;
    camera.orthoSize=layout.height/2;this.cameraNode.setPosition(100000+layout.width/2,100000+layout.height/2);camera.targetTexture=texture;
    camera.render(this.root);this.copies++;
    if(this.disposed||cc.director.getScene()!==this.scene)throw new Error("Atlas scene retired during capture");
    if(newTexture){if(valid(page.texture))page.texture.destroy();page.texture=newTexture;newTexture=null;}
    page.width=layout.width;page.height=layout.height;
  }finally{
    // SpriteFrame=null alone leaves the builtin Sprite material's last sampler.
    for(var j=0;j<this.pool.length;j++){this.pool[j].node.active=false;materialClear(this.pool[j]);}
    if(valid(camera))camera.targetTexture=null;
    if(valid(this.root))this.root.active=false;if(valid(this.cameraNode))this.cameraNode.active=false;
    var scene=cc.director.getScene(),flow=cc.RenderFlow;if(valid(scene))scene._renderFlag|=flow.FLAG_WORLD_TRANSFORM|flow.FLAG_OPACITY;
    if(newTexture&&valid(newTexture))newTexture.destroy();
  }
};
Atlas.prototype.result=function(changed,previous){
  var self=this,index=this.current,current=this.generations[index],previousSerial=previous>=0?this.generations[previous].serial:-1;
  return{frames:current.frames,pages:current.pages,changed:changed,serial:current.serial,releasePrevious:function(){
    if(previous<0||previous===self.current)return;
    var old=self.generations[previous];if(old.serial===previousSerial&&!old.retired)destroyFrames(old);
  }};
};
Atlas.prototype.prepare=function(records){
  if(this.disposed||this.drawing||!valid(this.scene)||cc.director.getScene()!==this.scene||!Array.isArray(records)){this.lastError="Invalid scene or request";return null;}
  var plans=[],seen=new Set();
  for(var i=0;i<records.length;i++){if(seen.has(records[i]))continue;seen.add(records[i]);var plan=this.describe(records[i]);if(!plan){this.lastError="Unsupported source frame";return null;}plans.push(plan);}
  if(this.unchanged(plans)){this.cacheHits++;return this.result(false,1-this.current);}
  var previous=this.current,next=previous<0?0:1-previous,target=this.generations[next];
  if(!target.retired){this.lastError="Previous generation still leased; detach old consumers then releasePrevious";return null;}
  var layouts=pack(plans),bytes=0;
  if(!layouts){this.lastError="Packing failed";return null;}
  for(var n=0;n<layouts.length;n++)bytes+=layouts[n].width*layouts[n].height*4;
  if(layouts.length>this.maxPages||bytes>this.maxBytes){this.lastError="Exact capture exceeds bounded page budget";return null;}
  // An existing spare texture may never also be a source of this GPU copy.
  var sourceTextures=new Set(plans.map(function(p){return p.texture;}));
  if(target.pages.some(function(page){return sourceTextures.has(page.texture);})){this.lastError="Source/target feedback rejected";return null;}
  var filter=cc.Texture2D&&cc.Texture2D.Filter,filters=[],failure=null,filtersValid=!!(filter&&Number.isFinite(filter.NEAREST)&&Number.isFinite(filter.LINEAR));
  sourceTextures.forEach(function(texture){
    var min=texture._minFilter,mag=texture._magFilter;
    if(!(texture instanceof cc.RenderTexture)||typeof texture.setFilters!=="function"||!filter||min!==filter.LINEAR&&min!==filter.NEAREST||mag!==filter.LINEAR&&mag!==filter.NEAREST)filtersValid=false;
    filters.push({texture:texture,min:min,mag:mag,changed:false});
  });
  if(!filtersValid){this.lastError="Unsupported native source texture filter ABI";return null;}
  this.drawing=true;target.states.clear();
  try{
    this.setup();
    // LINEAR interpolation at float32 projected texel centers can round a few
    // RGBA channels by one byte. NEAREST makes this 1:1 copy exact; preserve the
    // original source sampler for every later gameplay draw, synchronously.
    filters.forEach(function(saved){saved.changed=true;saved.texture.setFilters(filter.NEAREST,filter.NEAREST);});
    for(var j=0;j<layouts.length;j++){
      var layout=layouts[j],page=target.pages[j]||{texture:null,width:0,height:0,tiles:[]};target.pages[j]=page;this.drawPage(layout,page);page.tiles=[];
      for(var t=0;t<layout.tiles.length;t++){
        var tile=layout.tiles[t],p=tile.plan,frame=new cc.SpriteFrame(page.texture,cc.rect(tile.x,tile.y,tile.width,tile.height),false,cc.v2(0,0),cc.size(tile.width,tile.height));frame.setFlipY(true);
        target.frames.set(p.record,frame);target.states.set(p.record,{sourceFrame:p.sourceFrame,sourceTexture:p.sourceTexture,sourceUV:p.sourceUV,signature:p.signature,width:p.width,height:p.height,output:frame});
        page.tiles.push({record:p.record,x:tile.x,y:tile.y,width:tile.width,height:tile.height,frame:frame});
      }
    }
    while(target.pages.length>layouts.length){var extra=target.pages.pop();if(valid(extra.texture))extra.texture.destroy();}
  }catch(error){failure=error;
  }finally{
    // Attempt every restoration independently; a failed source must not strand
    // another source in NEAREST mode. No output is published until this ends.
    for(var f=filters.length-1;f>=0;f--){var saved=filters[f];if(!saved.changed||!valid(saved.texture))continue;try{saved.texture.setFilters(saved.min,saved.mag);}catch(error){try{saved.texture.setFilters(saved.min,saved.mag);}catch(retry){if(!failure)failure=retry;}}}
    this.drawing=false;
  }
  if(failure||this.disposed){destroyFrames(target);if(this.disposed)this.cleanup();this.lastError=failure&&(failure.message||String(failure))||"Atlas disposed during capture";return null;}
  target.retired=false;target.serial=++this.serial;this.current=next;this.lastError=null;return this.result(true,previous);
};
// Caller must first remove every output frame from all consumers. The retained
// textures can be reused; this cancels all frame leases after a fallback switch.
Atlas.prototype.retire=function(){for(var i=0;i<this.generations.length;i++){destroyFrames(this.generations[i]);this.generations[i].states.clear();}this.current=-1;};
Atlas.prototype.cleanup=function(){
  if(this.drawing)return;
  for(var i=0;i<this.pool.length;i++)materialClear(this.pool[i]);this.pool=[];
  if(valid(this.camera))this.camera.targetTexture=null;
  if(valid(this.root)){this.root.active=false;this.root.destroy();}if(valid(this.cameraNode)){this.cameraNode.active=false;this.cameraNode.destroy();}
  this.root=this.cameraNode=this.camera=null;this.generations.forEach(destroyGeneration);this.current=-1;
};
Atlas.prototype.dispose=function(){this.disposed=true;this.cleanup();};
Atlas.prototype.stats=function(){var bytes=0,pages=0,leasedFrames=0;this.generations.forEach(function(g){g.pages.forEach(function(p){if(valid(p.texture)){bytes+=p.texture.width*p.texture.height*4;pages++;}});leasedFrames+=g.frames.size;});return{pages:pages,bytes:bytes,leasedFrames:leasedFrames,copies:this.copies,cacheHits:this.cacheHits,current:this.current,lastError:this.lastError,disposed:this.disposed};};
exports.create=function(options){return supported()?new Atlas(options):null;};
