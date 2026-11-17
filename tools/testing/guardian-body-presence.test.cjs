'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const Pose=require('../../assets/_script/HeroSkillPose'),Settings=require('../../assets/_script/HeroSkillSettings'),Core=require('../../assets/_script/HeroStyleSkills'),Layout=require('../../assets/_script/HeroSkillVFXLayout');
const {setup,Node}=require('./backend-gameplay-harness.cjs');
const close=(a,b)=>assert(Math.abs(a-b)<1e-7,`${a} != ${b}`);

test('semantic torso selection prefers the actual character chest over mounted horse body bones and never retains native wrappers',()=>{
  const json={bones:[{name:'layer0/Body'},{name:'layer0/humanr_body'},{name:'layer1/Rider/Body'},{name:'layer1/Rider/Body/Chest'},{name:'layer1/Rider/Body/Head'}]},before=JSON.stringify(json);assert.equal(Pose.bodyBoneName(json),'layer1/Rider/Body/Chest');assert.equal(Pose.bodyBoneName(json),'layer1/Rider/Body/Chest');assert.equal(JSON.stringify(json),before);
  let point={x:10,y:20},calls=0,old=null;const renderer={skeletonData:{skeletonJson:json},findBone(name){assert.equal(name,Pose.bodyBoneName(this.skeletonData.skeletonJson));calls++;const current={getWorldX:()=>point.x,getWorldY:()=>point.y};if(old){old.getWorldX=()=>{throw Error('Retained old Bone wrapper');};old.getWorldY=old.getWorldX;}old=current;return current;}};
  assert.deepEqual(Pose.bodyPoint(renderer),{x:10,y:20});point={x:12,y:27};assert.deepEqual(Pose.bodyPoint(renderer),{x:12,y:27});renderer.skeletonData={skeletonJson:{bones:[{name:'Rider/Body'},{name:'Rider/Body/Chest'}]}};point={x:-4,y:9};assert.deepEqual(Pose.bodyPoint(renderer),{x:-4,y:9});assert.equal(calls,3);
  assert.equal(Pose.bodyBoneName({bones:[{name:'Head'},{name:'Body'}]}),'Body');assert.equal(Pose.bodyPoint({findBone:()=>null},{bones:[{name:'Rider/Body/Chest'}]}),null);assert.equal(Pose.bodyPoint({findBone:()=>({worldX:NaN,worldY:1})},{bones:[{name:'Body'}]}),null);
});

test('protected ally VFX anchors to its animated torso through native transforms while preserving authored offsets and ground range',()=>{
  for(const native of [false,true])for(const mounted of [false,true]){
    const h=setup(),P=h.load('HeroSkillPresentation'),main=h.g.ndMain,hero={node:new Node('hero',main,0,0),hp:1000,hpMax:1000};hero.node._combatGeneration=1;
    const actor={node:new Node('ally',main,30,20),hp:1000,isDead:()=>false},model=new Node('model',actor.node,3,7),bar=new Node('hp',actor.node,0,180),name=mounted?'layer1/Rider/Body/Chest':'Rider/Body/Chest',point={x:8,y:32};actor.node._combatGeneration=2;actor.ndHp=bar;actor.node.angle=23;actor.node.scaleX=.8;actor.node.scaleY=1.1;model.angle=-11;model.scaleX=-.45;model.scaleY=.45;
    const renderer={node:model,skeletonData:{skeletonJson:{bones:[{name:mounted?'layer0/Body':'Rider/Body'},{name}]}},findBone:selected=>selected===name?native?{getWorldX:()=>point.x,getWorldY:()=>point.y}:{worldX:point.x,worldY:point.y}:null};actor.spAni=renderer;actor.getSpAni=()=>renderer;
    const settings=Settings.defaults('guardian');Object.assign(settings.visual,{presenceOffsetX:7,presenceOffsetY:-3,targetX:900,targetY:900});const rt={hero,state:Core.createState('guardian',settings),settings,projectiles:[],effects:[],game:{ndMain:main,gameData:{getSoldierList:()=>[actor]},_combatEpoch:1},available:()=>true};rt.state.tuning.allyRadius=40;
    let frame=P.advanceVFX(rt),context=rt._presentation.vfxContext,target=context.presenceTargets[0],expected=main.convertToNodeSpaceAR(model.convertToWorldSpaceAR(h.e.cc.v2(point.x,point.y)));assert(target);close(target.x,expected.x);close(target.y,expected.y);const overhead=main.convertToNodeSpaceAR(bar.convertToWorldSpaceAR(h.e.cc.v2(0,0)));assert(Math.abs(target.y-overhead.y)>50,'The HP/overhead marker is not the torso');let entity=Layout.entities(frame,settings.visual,context).find(row=>row.slot==='presence');assert(entity);close(entity.x,expected.x+7);close(entity.y,expected.y-3);
    point.x+=5;point.y+=9;rt.state.time=.1;frame=P.advanceVFX(rt);context=rt._presentation.vfxContext;expected=main.convertToNodeSpaceAR(model.convertToWorldSpaceAR(h.e.cc.v2(point.x,point.y)));close(context.presenceTargets[0].x,expected.x);close(context.presenceTargets[0].y,expected.y);bar.y+=1000;rt.state.time=.2;P.advanceVFX(rt);close(rt._presentation.vfxContext.presenceTargets[0].y,expected.y,'Changing an overhead UI does not move body art');
    actor.node.x=40.01;actor.node.y=0;rt.state.time=.3;P.advanceVFX(rt);assert.equal(rt._presentation.vfxContext.presenceTargets.length,0,'Protection still checks its authored ground radius, independently of the visual torso');
  }
});

test('Blood Cleave shares its animated torso origin with cast artwork and hit geometry instead of borrowing the axe tip',()=>{
  const Projectile=require('../../assets/_script/HeroSkillProjectile');
  for(const native of [false,true])for(const facing of [-1,1]){
    const h=setup({HeroMakerRider:{weaponOrigin(){throw Error('Blood Cleave must not use the axe origin');}}}),Runtime=h.load('HeroStyleRuntime').Runtime,main=h.g.ndMain,heroNode=new Node('hero',main,30,20),model=new Node('rider',heroNode,4,8),point={x:10,y:25};heroNode.angle=17;model.angle=-6;model.scaleX=facing*.45;model.scaleY=.45;
    const renderer={node:model,skeletonData:{skeletonJson:{bones:[{name:'Rider/Body/Chest'}]}},findBone:()=>native?{getWorldX:()=>point.x,getWorldY:()=>point.y}:{worldX:point.x,worldY:point.y}},settings=Settings.defaults('bruiser');Object.assign(settings.visual,{offsetX:7,offsetY:-3,castRotation:23,radiusScale:1.2});const rt={hero:{node:heroNode,ctrPlayAni:{spAniBody:renderer}},state:{style:'bruiser'},settings,game:{ndMain:main}},aim={x:facing,y:0},body=main.convertToNodeSpaceAR(model.convertToWorldSpaceAR(h.e.cc.v2(point.x,point.y))),expected=Projectile.area('bruiser',body,settings.visual,aim,150),shape=Runtime.prototype.skillArea.call(rt,aim,150);assert.deepEqual(JSON.parse(JSON.stringify(shape)),expected);assert(Math.abs(shape.origin.y-heroNode.y)>1,'The area follows the actual torso instead of the ground pivot');
    point.y+=12;const moved=Runtime.prototype.skillArea.call(rt,aim,150);assert(Math.abs(moved.origin.y-shape.origin.y)>1,'The live torso pose is sampled after animation changes');
  }
});

test('unsupported legacy ally rigs retain their existing body fallback and ineligible actors cannot acquire a torso attachment',()=>{
  const h=setup(),P=h.load('HeroSkillPresentation'),hero={node:new Node('hero',h.g.ndMain),hp:1000,hpMax:1000},actor={node:new Node('ally',h.g.ndMain,20,10),hp:1000,isDead(){return this.hp<=0;}};actor.ndHp=new Node('hp',actor.node,0,100);const settings=Settings.defaults('guardian'),rt={hero,state:Core.createState('guardian',settings),settings,game:{ndMain:h.g.ndMain,gameData:{getSoldierList:()=>[actor]}},available:()=>true};
  P.advanceVFX(rt);let target=rt._presentation.vfxContext.presenceTargets[0];close(target.x,20);close(target.y,65);actor.hp=0;rt.state.time=.1;P.advanceVFX(rt);assert.equal(rt._presentation.vfxContext.presenceTargets.length,0);actor.hp=1000;actor._isPooled=true;rt.state.time=.2;P.advanceVFX(rt);assert.equal(rt._presentation.vfxContext.presenceTargets.length,0);
});
