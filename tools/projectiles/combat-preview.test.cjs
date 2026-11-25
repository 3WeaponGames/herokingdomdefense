'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const Combat=require('../../packages/hkd-projectiles/combat-preview');
function fixture(describe){
  const calls=[];
  const api={
    ipc:async(name,request)=>{calls.push(['ipc',name,request]);return describe(request.key);},
    runtime:()=>({}),renderer:{
      createLayers:async(runtime,layers)=>layers.map(description=>({description,data:{animations:Object.entries(description.json.animations).map(([name,duration])=>({name,duration})),findAnimation(name){return this.animations.find(animation=>animation.name===name);}},skeleton:{color:{set(){}}}})),
      seek(runtime,layers,name,time,loop){calls.push(['seek',name,time,loop]);},
      bounds(){return{minX:-25,minY:0,maxX:25,maxY:100,width:50,height:100};},
      drawWorld(){calls.push(['draw']);}
    }
  };
  const ctx={save(){},restore(){},translate(){},scale(){},rotate(){},drawImage(){}};
  return{api,calls,ctx};
}
const layer={name:'body',json:{animations:{attack:1,idle:1.5,hit:.3}},x:0,y:0,scaleX:1,scaleY:1};
test('combat actors retain raw animation time and frozen saved playback without running gameplay',async()=>{
  const {api,calls,ctx}=fixture(()=>({type:'hero',layers:[layer],profile:{animationSpeed:0},visuals:{mirrorX:true}})),preview=Combat.create(api),actor=await preview.load('hero');
  assert.equal(await preview.load('hero'),actor);assert.equal(calls.filter(call=>call[0]==='ipc').length,1);
  assert.equal(actor.animationSpeed,0);assert.equal(actor.attackAnimation,'attack');assert.equal(actor.hitAnimation,'hit');
  const pose=preview.draw(ctx,actor,{x:100,groundY:200,width:100,height:100,time:.7,animation:'attack',loop:false});
  assert.equal(pose.facing,-1);assert.deepEqual(calls.filter(call=>call[0]==='seek').at(-1),['seek','attack',.7,false]);
  assert.equal(Combat.duration(actor,'hit'),.3);assert.deepEqual(Combat.animations(actor),['attack','idle','hit']);
  preview.destroy();const count=calls.length;preview.draw(ctx,actor,{time:1});assert.equal(calls.length,count);
});
test('closing preview ignores pending unit descriptions before loading any textures',async()=>{
  let resolve;const pending=new Promise(ready=>resolve=ready),{api,calls}=fixture(()=>pending),preview=Combat.create(api),actor=preview.load('hero');
  preview.destroy();resolve({type:'hero',layers:[layer]});assert.equal(await actor,null);assert.equal(calls.some(call=>call[0]==='seek'),false);
});
test('baseline impact uses real finite authored clips alongside the target reaction',async()=>{
  const hitLayer={...layer,json:{animations:{jian_lv1:.4,xb_gj:.3}}},{api,calls,ctx}=fixture(()=>({type:'effect',animation:'jian_lv1',layers:[hitLayer]})),preview=Combat.create(api);
  await preview.load('preview-hit');assert.equal(preview.defaultHit(ctx,250,160,0,50),false);await Promise.resolve();
  assert.equal(preview.defaultHit(ctx,250,160,.1,50),true);assert.deepEqual(calls.filter(call=>call[0]==='seek').at(-1),['seek','jian_lv1',.1,false]);
  for(const type of ['enemy','ally']){assert.equal(preview.defaultHit(ctx,250,160,.1,50,{description:{type}}),true);assert.deepEqual(calls.filter(call=>call[0]==='seek').at(-1),['seek','jian_lv1',.1,false],type+' ranged impact matches the live ranged controller');}
  assert.equal(preview.defaultHit(ctx,250,160,.1,50,{description:{type:'enemy',defaultHitAnimation:'xb_gj'}}),true);assert.deepEqual(calls.filter(call=>call[0]==='seek').at(-1),['seek','xb_gj',.1,false]);
  assert.equal(preview.defaultHit(ctx,250,160,.3,50,{description:{type:'enemy',defaultHitAnimation:'xb_gj'}}),false);
  assert.equal(preview.defaultHit(ctx,250,160,-.1,50),false);preview.destroy();
});
test('fixed actor viewport contains the complete attack and hit pose ranges',()=>{
  assert.deepEqual(Combat.union([{minX:-2,minY:0,maxX:3,maxY:5},{minX:-4,minY:-1,maxX:2,maxY:7}]),{minX:-4,minY:-1,maxX:3,maxY:7,width:7,height:8});
});
test('native-only fireball impacts omit generic hits and cannon blasts retain their finite authored graphics',()=>{
  const {api,calls,ctx}=fixture(()=>{throw Error('No generic hit should load');}),preview=Combat.create(api);
  assert.equal(preview.defaultHit(ctx,100,80,.1,70,{description:{defaultHitAnimation:false}}),false);assert.equal(calls.length,0);
  const commands=[],graphics={...ctx,globalAlpha:1,scale(x,y){commands.push(['scale',x,y]);},beginPath(){},arc(x,y,radius){commands.push(['radius',radius]);},fill(){commands.push(['fill',this.fillStyle,this.globalAlpha]);},stroke(){},moveTo(){},lineTo(){commands.push(['ray']);}},source={description:{defaultHitAnimation:false,defaultHit:{kind:'cannon',splashRadius:90}}};
  assert.equal(preview.defaultHit(graphics,100,80,.12,70,source),true);assert.equal(commands[0][0],'scale');assert(Math.abs(commands[0][1]-.65)<1e-12&&Math.abs(commands[0][2]-.65)<1e-12);assert.deepEqual(commands[1],['radius',90]);assert.equal(commands.filter(command=>command[0]==='ray').length,8);assert.equal(commands.find(command=>command[0]==='fill')[2],110/255);
  const length=commands.length;assert.equal(preview.defaultHit(graphics,100,80,.24,70,source),false);assert.equal(commands.length,length);assert.equal(calls.length,0);preview.destroy();
});
test('reload invalidates actors, retries unavailable models and rejects pending old descriptions',async()=>{
  let resolve,attempt=0;const oldDescription=new Promise(ready=>resolve=ready),{api,calls}=fixture(()=>{attempt++;if(attempt===1)return oldDescription;if(attempt===2)throw Error('Temporary missing asset');return{type:'hero',layers:[layer],profile:{animationSpeed:1.4}};}),errors=[],preview=Combat.create(api,{onError:error=>errors.push(error.message)});
  const stale=preview.load('hero');preview.invalidate('hero');assert.equal(await preview.load('hero'),null);assert.deepEqual(errors,['Temporary missing asset']);
  preview.invalidate();const fresh=await preview.load('hero');assert.equal(fresh.animationSpeed,1.4);resolve({type:'hero',layers:[layer],profile:{animationSpeed:.4}});assert.equal(await stale,null);
  assert.equal(await preview.load('hero'),fresh);assert.equal(calls.filter(call=>call[0]==='ipc').length,3);preview.destroy();
});
test('building muzzle matches the drawn barrel at authored scale with facing and reflection',async()=>{
  const savedImage=global.Image;global.Image=class{set src(value){this.source=value;queueMicrotask(()=>this.onload());}};
  try{
    const bounds={minX:-50,minY:-10,maxX:150,maxY:190,width:200,height:200},artwork={base:{x:0,y:0,width:100,height:100},weapon:{x:40,y:80,width:40,height:20,pivotX:.5,pivotY:.5,flipX:1,angle:0,view:'side',muzzle:{x:60,y:80}},frameBounds:bounds},
      {api}=fixture(()=>({type:'building',layers:[],image:'base.png',weaponImage:'weapon.png',artwork})),preview=Combat.create(api),actor=await preview.load('tower:2:4');
    function recordingContext(){
      let matrix=[1,0,0,1,0,0],stack=[],barrel=null;
      function multiply(value){const [a,b,c,d,e,f]=matrix,[u,v,w,x,y,z]=value;matrix=[a*u+c*v,b*u+d*v,a*w+c*x,b*w+d*x,a*y+c*z+e,b*y+d*z+f];}
      return{save(){stack.push(matrix.slice());},restore(){matrix=stack.pop();},translate(x,y){multiply([1,0,0,1,x,y]);},scale(x,y){multiply([x,0,0,y,0,0]);},rotate(angle){const c=Math.cos(angle),s=Math.sin(angle);multiply([c,s,-s,c,0,0]);},drawImage(image,x,y,width,height){if(image.source==='weapon.png'){const px=x+width,py=y+height/2;barrel={x:matrix[0]*px+matrix[2]*py+matrix[4],y:matrix[1]*px+matrix[3]*py+matrix[5]};}},barrel(){return barrel;}};
    }
    for(const [facing,mirrorX]of [[1,false],[-1,false],[1,true]]){
      actor.mirrorX=mirrorX;const settings={x:300,groundY:400,width:100,height:200,facing},ctx=recordingContext();preview.draw(ctx,actor,settings);
      assert.deepEqual(preview.muzzle(actor,settings),ctx.barrel(),'release originates at the rendered weapon image’s right-edge muzzle');
      assert.equal(preview.muzzle(actor,settings).y,320);
    }
    assert.equal(preview.muzzle({bounds,layers:[]},{}),null);assert.equal(preview.muzzle(null,{}),null);preview.destroy();
  }finally{global.Image=savedImage;}
});

test('narrow panels extend the preview viewport without rescaling small units or bosses',()=>{
  const small={bounds:{minX:-10,minY:0,maxX:10,maxY:35,width:20,height:35}};
  const boss={bounds:{minX:-170,minY:-30,maxX:200,maxY:460,width:370,height:490}};
  const narrow=Combat.stage(220,boss,small),wide=Combat.stage(1000,boss,small);
  assert(narrow.width>220);
  assert(narrow.shooter.groundY>460);
  assert(narrow.height>490);
  for(const frame of [narrow,wide]){
    assert.equal(Combat.placement(boss,frame.shooter).scale,1);
    assert.equal(Combat.placement(small,frame.target).scale,1);
    assert(frame.shooter.x+boss.bounds.minX>=0);
    assert(frame.target.x+small.bounds.maxX<=frame.width);
  }
});

test('the preview mirrors the complete launch around the shooter and keeps the adjusted point in view',()=>{
  const shooter={bounds:{minX:-16,minY:0,maxX:31,maxY:50,width:47,height:50}};
  const target={bounds:{minX:-23,minY:0,maxX:12,maxY:38,width:35,height:38}};
  for(const launch of [{x:24,y:-54},{x:-420,y:330},{x:420,y:-440}]){
    const right=Combat.stage(320,shooter,target,24,{facing:1,launch});
    const left=Combat.stage(320,shooter,target,24,{facing:-1,launch});
    assert.equal(left.shooter.x+right.shooter.x,right.width);
    assert.equal(left.target.x+right.target.x,right.width);
    assert.equal(left.launch.x-left.shooter.x,-launch.x);
    assert.equal(right.launch.x-right.shooter.x,launch.x);
    assert.equal(left.launch.y,right.launch.y);
    assert.equal(right.launch.y-right.shooter.groundY,launch.y);
    assert(right.launch.x>=24&&right.launch.x<=right.width-24&&right.launch.y>=24&&right.launch.y<=right.height-24);
  }
});

test('wall and campaign baseline impacts use independent authored actors and finite animation clocks',async()=>{
  const {api,calls,ctx}=fixture(key=>({type:'effect',animation:key==='preview-wall-hit'?'jian_1':'jian_lv1',layers:[{...layer,json:{animations:key==='preview-wall-hit'?{jian_1:.2}:{jian_lv1:.4}}}]})),preview=Combat.create(api),wall={description:{defaultHitKey:'preview-wall-hit',defaultHitAnimation:'jian_1'}};
  await preview.load('preview-hit');await preview.load('preview-wall-hit');assert.equal(preview.defaultHit(ctx,100,80,.1,70),false);assert.equal(preview.defaultHit(ctx,100,80,.1,70,wall),false);await Promise.resolve();
  assert.equal(preview.defaultHit(ctx,100,80,.1,70,wall),true);assert.equal(calls.filter(call=>call[0]==='seek').at(-1)[1],'jian_1');
  assert.equal(preview.defaultHit(ctx,100,80,.3,70,wall),false);assert.equal(preview.defaultHit(ctx,100,80,.3,70),true);assert.equal(calls.filter(call=>call[0]==='seek').at(-1)[1],'jian_lv1');
  assert.deepEqual(calls.filter(call=>call[0]==='ipc').map(call=>call[2].key),['preview-hit','preview-wall-hit']);preview.destroy();
});
