'use strict';
// Source-alpha selection and fast drag sweeps in a real isolated native Canvas.
const Picking=require('../worlds/picking'),M=require('../worlds/model'),Paint=require('../worlds/paint');
async function verify(){
 const checks=[],assert=(ok,name)=>{if(!ok)throw Error(name);checks.push(name);},load=async canvas=>{const image=new Image();await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=reject;image.src=canvas.toDataURL();});return image;};
 const picture=Paint.canvas(64,64),g=picture.getContext('2d');g.fillStyle='#f00';g.fillRect(0,0,64,64);g.clearRect(16,16,32,32);
 const img=await load(picture),asset={id:'art',width:64,height:64,anchor:{x:.5,y:.5}},assets={art:asset},images={art:Object.assign({},asset,{image:img})},layer={transform:{x:0,y:0,scale:1,angle:0}},object={id:'one',assetId:'art',x:0,y:0,scale:1,angle:0,flipX:false},picking=Picking.create(),sourceBefore=picture.toDataURL(),before=JSON.stringify({object,layer,asset});
 try{
  assert(picking.hit(object,layer,{x:-25,y:25},assets,images),'visible source pixels can be selected');
  assert(!picking.hit(object,layer,{x:0,y:0},assets,images),'transparent source holes are not selected');
  assert(!picking.hit(object,layer,{x:100,y:100},assets,images),'points outside artwork are rejected before sampling');
  assert(picking.hit(object,layer,{x:-32,y:32},assets,images),'opaque top-left image boundary remains selectable');
  assert(picking.segment(object,layer,{x:-50,y:25},{x:50,y:25},assets,images),'fast drag sweeps intersect opaque art between pointer events');
  assert(!picking.segment(object,layer,{x:-5,y:0},{x:5,y:0},assets,images),'a sweep through a transparent hole does not select the object');
  assert(!picking.segment(object,layer,{x:-50,y:100},{x:50,y:100},assets,images),'sweeps outside artwork do not create false hits');
  const transformed=M.clone(object),rotated={transform:{x:80,y:-30,scale:1.7,angle:20}};Object.assign(transformed,{x:14,y:9,scale:2,angle:35,flipX:true});
  const world=p=>M.toWorld(rotated.transform,M.toWorld(transformed,{x:-p.x,y:p.y}));
  assert(picking.hit(transformed,rotated,world({x:-25,y:25}),assets,images),'layer transforms, object rotation, scaling and reflection retain alpha picking');
  assert(!picking.hit(transformed,rotated,world({x:0,y:0}),assets,images),'transformed transparent holes remain pass-through');
  assert(picking.segment(transformed,rotated,world({x:-45,y:25}),world({x:45,y:25}),assets,images),'transformed long sweeps use the same source footprint');
  for(const state of [{hidden:true},{locked:true}])assert(!picking.hit(object,Object.assign({},layer,state),{x:-25,y:25},assets,images),'hidden or locked layers are never canvas-picked: '+Object.keys(state)[0]);
  assert(!picking.hit(Object.assign({},object,{opacity:0}),layer,{x:-25,y:25},assets,images),'zero-opacity objects do not hide objects behind them');
  assert(!picking.hit(object,layer,{x:-25,y:25},assets,{}),'missing source art does not create an invisible hit');
  assert(!picking.hit(object,layer,{x:-25,y:25},assets,{art:{image:new Image()}}),'unloaded source art does not create an invisible hit');
  assert(!picking.hit(object,{transform:{scale:0}}, {x:0,y:0},assets,images),'invalid zero-scale layers cannot crash picking');
  const atlas=Paint.canvas(128,128),ag=atlas.getContext('2d');ag.fillStyle='#fff';ag.fillRect(0,0,128,128);ag.clearRect(32,40,64,64);ag.drawImage(picture,32,40);const atlasImage=await load(atlas);
  const sprite={frame:'frame',width:64,height:64,anchor:{x:.5,y:.5},active:true,matrix:[-1,.2,.4,2,100,-10]},legacy=Object.assign({},transformed,{legacy:{origin:{x:100,y:-10},sprites:[sprite]}}),legacyImages={frame:{image:atlasImage,x:32,y:40,width:64,height:64}};
  const legacyWorld=p=>{const q=M.point(sprite.matrix,p),offset={x:q.x-100,y:q.y+10};return M.toWorld(rotated.transform,M.toWorld(legacy,{x:-offset.x,y:offset.y}));};
  assert(picking.hit(legacy,rotated,legacyWorld({x:-25,y:25}),{},legacyImages),'legacy frame picking inverts internal skew and reflection matrices');
  assert(!picking.hit(legacy,rotated,legacyWorld({x:0,y:0}),{},legacyImages),'legacy atlas crops retain transparent holes');
  assert(picking.segment(legacy,rotated,legacyWorld({x:-45,y:25}),legacyWorld({x:45,y:25}),{},legacyImages),'legacy transformed sweeps hit opaque frame pixels');
  assert(!picking.segment(legacy,rotated,legacyWorld({x:-5,y:0}),legacyWorld({x:5,y:0}),{},legacyImages),'opaque atlas pixels outside a cropped frame cannot be hit');
  sprite.active=false;assert(!picking.hit(legacy,rotated,legacyWorld({x:-25,y:25}),{},legacyImages),'inactive legacy sprites are ignored');sprite.active=true;sprite.color={a:0};assert(!picking.hit(legacy,rotated,legacyWorld({x:-25,y:25}),{},legacyImages),'transparent legacy sprite colors are ignored');delete sprite.color;
  const solid=Paint.canvas(64,64),sg=solid.getContext('2d');sg.fillStyle='#fff';sg.fillRect(0,0,64,64);const solidImage=await load(solid),solidImages={art:Object.assign({},asset,{image:solidImage})},masked=Object.assign({},object,{mask:[{size:20,shape:'round',hardness:1,opacity:1,op:'erase',points:[{x:0,y:0}]}]});
  assert(!picking.hit(masked,layer,{x:0,y:0},assets,solidImages),'fully erased masks pass selection through to underlying objects');
  assert(picking.hit(masked,layer,{x:25,y:0},assets,solidImages),'un-erased portions of masked images remain selectable');
  masked.mask[0].opacity=.5;assert(picking.hit(masked,layer,{x:0,y:0},assets,solidImages),'partially erased visible pixels remain selectable');
  masked.mask[0].opacity=1;masked.mask[0].size=1000;assert(!picking.segment(masked,layer,{x:-50,y:0},{x:50,y:0},assets,solidImages),'fully erased images do not intercept delete sweeps');
  const thin=Paint.canvas(128,128),tg=thin.getContext('2d');tg.fillStyle='#fff';tg.fillRect(63,0,1,128);const thinAsset={id:'thin',width:128,height:128,anchor:{x:.5,y:.5}},thinObject=Object.assign({},object,{assetId:'thin'}),thinImages={thin:Object.assign({},thinAsset,{image:await load(thin)})};
  assert(!picking.hit(thinObject,layer,{x:-60,y:0},{thin:thinAsset},thinImages)&&!picking.hit(thinObject,layer,{x:60,y:0},{thin:thinAsset},thinImages),'sweep endpoints can both be transparent');
  assert(picking.segment(thinObject,layer,{x:-60,y:0},{x:60,y:0},{thin:thinAsset},thinImages),'sub-event one-pixel scenery is hit along a fast sweep');
  const long=Paint.canvas(2048,1024),lg=long.getContext('2d');lg.fillStyle='#fff';lg.fillRect(2046,511,1,2);const longAsset={id:'long',width:2048,height:1024,anchor:{x:.5,y:.5}},longObject=Object.assign({},object,{assetId:'long'}),longImages={long:Object.assign({},longAsset,{image:await load(long)})},created=[],canvas=Paint.canvas,bounded=Picking.create();
  Paint.canvas=(w,h)=>{created.push([w,h]);return canvas(w,h);};
  try{assert(bounded.segment(longObject,layer,{x:-1023,y:0},{x:1023,y:0},{long:longAsset},longImages),'long alpha sweeps find a distant one-pixel feature across scratch chunks');assert(created.every(([w,h])=>w===1&&h<=2049),'picking scratch allocation stays narrow and bounded for large images');}
  finally{Paint.canvas=canvas;bounded.clear();}
  const reads=picking.stats().readbacks;for(let i=0;i<100;i++)picking.hit(object,layer,{x:-25,y:25},assets,images);assert(picking.stats().readbacks===reads,'repeated small-image picking reuses its bounded alpha-only cache');
  const limited=Picking.create(),retained=[];try{for(let i=0;i<70;i++){const c=Paint.canvas(2,2),g=c.getContext('2d');g.fillStyle='#fff';g.fillRect(0,0,2,2);retained.push(c);const a={id:'tiny',width:2,height:2,anchor:{x:0,y:0}};limited.hit(Object.assign({},object,{assetId:'tiny'}),layer,{x:1,y:1},{tiny:a},{tiny:Object.assign({},a,{image:c})});}assert(limited.stats().alphaEntries<=64,'alpha cache source count stays bounded across different images');
   limited.clear();for(let i=0;i<10;i++){const c=Paint.canvas(1024,1024),g=c.getContext('2d');g.fillStyle='#fff';g.fillRect(0,0,1024,1024);retained.push(c);const a={id:'large',width:1024,height:1024,anchor:{x:0,y:0}};limited.hit(Object.assign({},object,{assetId:'large'}),layer,{x:1,y:1},{large:a},{large:Object.assign({},a,{image:c})});}assert(limited.stats().alphaBytes<=8*1024*1024&&limited.stats().alphaEntries<=8,'alpha cache retains at most eight MiB of source alpha');
   limited.clear();assert(limited.stats().alphaBytes===0&&limited.stats().alphaEntries===0,'closing the picker releases cached alpha');assert(retained[retained.length-1].width===1024,'cache cleanup never resizes source artwork');
  }finally{limited.clear();}
  const refreshing=Picking.create();try{assert(!refreshing.hit(object,layer,{x:0,y:0},assets,images),'fresh alpha cache reads the original transparent source');
   await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=reject;img.src=solid.toDataURL();});assert(refreshing.hit(object,layer,{x:0,y:0},assets,images),'changing a loaded image URL invalidates its cached alpha');
   await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=reject;img.src=picture.toDataURL();});assert(!refreshing.hit(object,layer,{x:0,y:0},assets,images),'reloading the prior image restores its current source alpha');
  }finally{refreshing.clear();}
  assert(JSON.stringify({object,layer,asset})===before&&picture.toDataURL()===sourceBefore,'picking does not mutate authored objects, transforms or source artwork');
  return {checks};
 }finally{picking.clear();Paint.clearMasks();}
}
module.exports={verify};

