'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const Visuals=require('../../packages/hkd-projectiles/projectile-visuals');
test('authored oscillation keys keep their cubic easing and clip wrap',()=>{
  const keys=[{frame:0,value:-6,curve:'cubicInOut'},{frame:1,value:6}];
  assert.equal(Visuals.curve(keys,0,0),-6);assert.equal(Visuals.curve(keys,.25,0),-5.25);assert.equal(Visuals.curve(keys,.5,0),0);
  const asset={visualAnimations:[{duration:1,paths:{motion:{props:{x:keys}}}}]},layer={path:'motion',x:50,y:10};
  assert.deepEqual(Visuals.animated(asset,layer,1.25),{path:'motion',x:-5.25,y:10});assert.equal(layer.x,50);
});
test('particle frames retain authored emission, finite lifetime, alpha and size progression',()=>{
  const layer={emissionRate:10,life:1,startSize:20,endSize:0,angle:270,speed:100,startColor:{r:255,g:100,b:0,a:200},endColor:{r:0,g:50,b:255,a:0}};
  assert.equal(Visuals.particle(layer,1,0),null);assert.equal(Visuals.particle(layer,0,1),null);
  const frame=Visuals.particle(layer,0,.5);assert.equal(frame.size,10);assert(Math.abs(frame.x)<.0001);assert.equal(frame.y,-50);assert.equal(frame.color.a,100);
  assert.deepEqual(Visuals.particle(layer,0,.5),frame,'the pose is deterministic when a preview is restarted');
  assert.equal(Visuals.particle({...layer,endSize:-1},0,.5).size,20,'the Cocos equal-size sentinel is preserved');
});
test('disabled and finished emitters stop producing particles while authored acceleration variance stays deterministic',()=>{
  const layer={emissionRate:10,life:1,startSize:20,endSize:10,angle:0,speed:100,radialAccel:0,tangentialAccel:0};
  assert.equal(Visuals.particle({...layer,emissionRate:0},0,.5),null);
  assert.equal(Visuals.particle({...layer,duration:.2},3,.5),null,'an emitter cannot create new particles after its duration');
  assert(Visuals.particle({...layer,duration:.2},1,.5),'particles born before stopping finish their own lifetime');
  const varied={...layer,radialAccelVar:50,tangentialAccelVar:30},point=Visuals.particle(varied,0,.5);
  assert.deepEqual(Visuals.particle(varied,0,.5),point);assert.notDeepEqual(point,Visuals.particle(layer,0,.5));
});
test('full original projectile draws particles and textured streaks; turning trails off retains its flight art',()=>{
  const savedImage=global.Image,savedDocument=global.document;let draws=0;
  const context=()=>({save(){},restore(){},translate(){},rotate(){},scale(){},drawImage(){draws++;},getImageData(){return{data:new Uint8ClampedArray(16*16*4).fill(255)};},putImageData(){}});
  global.Image=class{constructor(){this.complete=true;this.naturalWidth=this.width=this.height=16;}};
  global.document={createElement(){return{width:16,height:16,getContext:context};}};
  try{
    const renderer=Visuals.create({image:source=>source}),asset=require('../../assets/resources/projectiles/catalog.json').assets.find(asset=>asset.id==='wall:1');
    assert(asset.visualLayers.some(layer=>layer.kind==='particles'));assert(asset.visualLayers.some(layer=>layer.kind==='trail'));
    assert.equal(renderer.draw(context(),asset,{time:1,x:100,y:100,size:48,speed:160}),true);const complete=draws;draws=0;
    renderer.draw(context(),asset,{time:1,x:100,y:100,size:48,speed:160,trail:false});assert(draws>1,'both sprite and particles remain');assert(draws<complete,'trail texture strips are omitted');
    assert.equal(renderer.draw(context(),{kind:'sprite'},{}),false);renderer.destroy();assert.equal(renderer.draw(context(),asset,{}),false);
  }finally{global.Image=savedImage;global.document=savedDocument;}
});
test('free wall particles retain their emission point while relative and grouped particles follow the projectile',()=>{
  const savedImage=global.Image;
  global.Image=class{constructor(){this.complete=true;this.naturalWidth=this.width=this.height=16;}};
  function recordingContext(){
    let matrix=[1,0,0,1,0,0],stack=[],centers=[];
    function multiply(value){const [a,b,c,d,e,f]=matrix,[u,v,w,x,y,z]=value;matrix=[a*u+c*v,b*u+d*v,a*w+c*x,b*w+d*x,a*y+c*z+e,b*y+d*z+f];}
    return{save(){stack.push(matrix.slice());},restore(){matrix=stack.pop();},translate(x,y){multiply([1,0,0,1,x,y]);},scale(x,y){multiply([x,0,0,y,0,0]);},rotate(angle){const c=Math.cos(angle),s=Math.sin(angle);multiply([c,s,-s,c,0,0]);},drawImage(...args){const [x,y,width,height]=args.length===9?args.slice(5):args.slice(1),px=x+width/2,py=y+height/2;centers.push({x:matrix[0]*px+matrix[2]*py+matrix[4],y:matrix[1]*px+matrix[3]*py+matrix[5]});},centers};
  }
  try{
    const renderer=Visuals.create({image:source=>source}),emitter={kind:'particles',image:'particle.png',path:'emitter',x:0,y:0,scaleX:1,scaleY:1,totalParticles:1,emissionRate:1,life:2,startSize:10,endSize:10,angle:0,speed:0},asset={size:48,visualPrefab:{width:48,rotation:-90},visualLayers:[emitter]};
    for(const positionType of [undefined,0,1,2]){
      emitter.positionType=positionType;
      for(const time of [.25,.5]){
        const context=recordingContext();renderer.draw(context,asset,{x:100+100*time,y:100,time,size:48,speed:100});
        assert.equal(context.centers.length,1);assert(Math.abs(context.centers[0].x-(positionType===undefined||positionType===0?100:100+100*time))<1e-8,'free particles retain birth position; relative/grouped particles move with parent');assert(Math.abs(context.centers[0].y-100)<1e-8);
      }
    }
    emitter.positionType=0;emitter.rotation=90;emitter.scaleX=2;emitter.scaleY=.5;
    const transformed=recordingContext();renderer.draw(transformed,asset,{x:150,y:100,time:.5,size:48,speed:100});assert(Math.abs(transformed.centers[0].x-100)<1e-8,'motion compensation survives a rotated, nonuniformly scaled emitter');
    const stationary=recordingContext();renderer.draw(stationary,asset,{x:100,y:100,time:.5,size:48,speed:0});assert(Math.abs(stationary.centers[0].x-100)<1e-8,'Play flight remains stationary');
    for(const heading of [0,35,-120])for(const rotation of [30,-45]){
      const angle=heading*Math.PI/180,time=.5,context=recordingContext();renderer.draw(context,asset,{x:100+Math.cos(angle)*100*time,y:100+Math.sin(angle)*100*time,time,size:48,speed:100,heading,rotation});
      assert(Math.abs(context.centers[0].x-100)<1e-8);assert(Math.abs(context.centers[0].y-100)<1e-8,'authored artwork rotation does not rotate the world-space particle history away from flight');
    }
    asset.visualLayers=[{kind:'trail',path:'trail',image:'trail.png',color:'#ffffff',width:2,lifetime:1}];
    for(const heading of [0,35,-120]){
      const angle=heading*Math.PI/180,context=recordingContext();renderer.draw(context,asset,{x:200,y:200,time:.5,size:48,speed:100,heading,rotation:30});assert(context.centers.length>0);
      for(const point of context.centers)assert(Math.abs((point.x-200)*Math.sin(angle)-(point.y-200)*Math.cos(angle))<1e-8,'rotating the projectile art does not bend its straight world-space trail');
    }
    renderer.destroy();
  }finally{global.Image=savedImage;}
});
test('Reload retries repaired component textures and ignores obsolete image failures',()=>{
  const savedImage=global.Image,requests=[],errors=[];
  global.Image=class{constructor(){this.complete=false;this.naturalWidth=0;requests.push(this);}set src(value){this.source=value;}};
  try{
    let draws=0;const ctx={save(){},restore(){},translate(){},rotate(){},scale(){},drawImage(){draws++;}},renderer=Visuals.create({image:source=>source},{onError:error=>errors.push(error.message)}),asset={visualLayers:[{kind:'sprite',image:'repaired.png',width:16,height:16}]};
    renderer.draw(ctx,asset,{});assert.equal(requests.length,1);requests[0].onerror();assert.equal(errors.length,1);renderer.draw(ctx,asset,{});assert.equal(requests.length,1,'ordinary frames do not repeatedly request a missing file');
    renderer.invalidate();renderer.draw(ctx,asset,{});assert.equal(requests.length,2,'explicit Reload retries the repaired source');requests[0].onerror();assert.equal(errors.length,1,'old request errors cannot replace the new preview status');
    Object.assign(requests[1],{complete:true,naturalWidth:16,width:16,height:16});renderer.draw(ctx,asset,{});assert.equal(draws,1,'repaired artwork renders from the fresh image');
    renderer.destroy();requests[1].onerror();assert.equal(errors.length,1,'closed previews ignore pending image failures');
  }finally{global.Image=savedImage;}
});
