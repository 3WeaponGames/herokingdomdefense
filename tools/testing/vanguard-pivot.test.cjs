'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const P=require('../../assets/_script/HeroSkillProjectile'),Layout=require('../../assets/_script/HeroSkillVFXLayout'),Settings=require('../../assets/_script/HeroSkillSettings'),Gizmos=require('../../packages/hkd-skills/preview-gizmos');
const near=(a,b)=>assert(Math.abs(a-b)<1e-7,`${a} != ${b}`),aim=angle=>({x:Math.cos(angle*Math.PI/180),y:Math.sin(angle*Math.PI/180)});
function point(entity,p){const r=entity.angle*Math.PI/180,scale=entity.visual.scale*entity.scale,x=p.x*scale*entity.scaleX,y=p.y*scale*entity.scaleY;return{x:entity.x+x*Math.cos(r)-y*Math.sin(r),y:entity.y+x*Math.sin(r)+y*Math.cos(r)};}
function cast(v,origin,direction,radius){return Layout.entities({entities:[{key:'cast',slot:'cast',style:'vanguard',phase:'once',age:.55,origin,direction,radius,scale:1,opacity:1}]},v,{style:'vanguard',hero:{x:0,y:0}})[0];}
test('the native yellow flash and rear-center arc stay on the spear pivot through every direction and nonuniform art fit',()=>{
 const clip=Layout.clipFor('vanguard-spear-barrage'),rig=require('../../assets/resources/vfx/hero-skills/vanguard-spear-barrage/vanguard-spear-barrage.json'),vertices=Object.values(rig.skins[0].attachments[clip.pivotSource])[0].vertices;
 near(clip.sourcePivotX,(vertices[0]+vertices[2]+vertices[4]+vertices[6])/4);near(clip.sourcePivotY,(vertices[1]+vertices[3]+vertices[5]+vertices[7])/4);
 const flash={x:clip.sourcePivotX,y:clip.sourcePivotY};
 for(const degrees of [0,45,90,135,180,225,270,315])for(const scale of [.25,1,2.7]){
  const v={...Settings.defaults('vanguard').visual,scale,castScale:.63,castScaleX:1.05,castScaleY:.81};
  Settings.applyClip(v,'castResource',clip);
  const tip={x:83,y:79},area=P.area('vanguard',tip,v,aim(degrees),155),art=cast(v,area.origin,area.direction,area.radius),pivot=point(art,flash),forward=point(art,{x:flash.x+clip.forwardX*100,y:flash.y+clip.forwardY*100});
  near(pivot.x,tip.x);near(pivot.y,tip.y);near(art.pivotX,area.origin.x);near(art.pivotY,area.origin.y);const length=Math.hypot(forward.x-pivot.x,forward.y-pivot.y);near((forward.x-pivot.x)/length,area.direction.x);near((forward.y-pivot.y)/length,area.direction.y);
  const guide=Gizmos.buildBehavior({kind:'arc',origin:area.origin,direction:area.direction,radius:area.radius,halfAngle:area.halfAngle,startWidth:area.startWidth},p=>p),first=guide.worldOutline[0],last=guide.worldOutline.at(-1);near((first.x+last.x)/2,tip.x);near((first.y+last.y)/2,tip.y);
 }
});
test('the default thrust sprite anchors on the spearhead and points out along each cast direction',()=>{
 const visual=Settings.defaults('vanguard').visual,tip={x:83,y:79};
 const clip=Layout.clipFor(visual.castResource);
 assert.equal(clip.id,'vanguard-spear-thrust');
 assert.equal(clip.kind,'flipbook');
 const original=Layout.clipFor("vanguard-spear-barrage");
 assert.equal(clip.frames,original.frames);
 assert.equal(clip.fps,original.fps);
 near(Layout.visibleDuration(clip,"vanguard","cast"),original.duration);
 for(const degrees of [0,45,90,135,180,225,270,315]){
  const direction=aim(degrees),art=cast(visual,tip,direction,155),pivot=point(art,{x:0,y:0});
  const forward=point(art,{x:clip.alphaBounds[2]-art.anchorX*clip.cell,y:0}),length=Math.hypot(forward.x-pivot.x,forward.y-pivot.y);
  near(pivot.x,tip.x);near(pivot.y,tip.y);
  assert(length>0&&length<175);
  near((forward.x-pivot.x)/length,direction.x);near((forward.y-pivot.y)/length,direction.y);
 }
});
test('Vanguard local offsets and asymmetric source art mirror together around the spear instead of retaining screen offsets',()=>{
 const v={...Settings.defaults('vanguard').visual,offsetX:37,offsetY:-23,rotation:19,castOffsetX:13,castOffsetY:17,castRotation:21,castScale:.63,castScaleX:1.3,castScaleY:.7};
 for(const degrees of [-75,-22,0,34,80]){const d=aim(degrees),right=P.area('vanguard',{x:83,y:79},v,d,155),left=P.area('vanguard',{x:-83,y:79},v,{x:-d.x,y:d.y},155),a=cast(v,right.origin,right.direction,right.radius),b=cast(v,left.origin,left.direction,left.radius);near(left.origin.x,-right.origin.x);near(left.origin.y,right.origin.y);
  for(const p of [{x:17,y:49},{x:-23,y:11},{x:301,y:178}]){const r=point(a,p),l=point(b,p);near(l.x,-r.x);near(l.y,r.y);}
 }
});
test('dragging a Vanguard pivot converts screen travel into the same rotating and mirrored offset axes',()=>{
 for(const degrees of [0,45,90,135,180,225,270,315]){const d=aim(degrees),basis=P.facingTransform(d,0,1,1),r=basis.angle*Math.PI/180,axes={x:{x:Math.cos(r),y:Math.sin(r)},y:{x:-Math.sin(r)*basis.scaleY,y:Math.cos(r)*basis.scaleY}},spec={id:'cast',origin:{x:0,y:0},offsetAxes:axes,paths:{x:'visual.castOffsetX',y:'visual.castOffsetY'},values:{visual:{castOffsetX:0,castOffsetY:0}}},drag=Gizmos.begin(spec,'move',{x:0,y:0}),delta=P.facingOffset(d,{x:23,y:-11}),result=Gizmos.update(drag,delta);near(result.patches['visual.castOffsetX'],23);near(result.patches['visual.castOffsetY'],-11);}
});
test('both Momentum loops use the horse ground pivot and stay behind the hero in either facing',()=>{
 const visual=Settings.defaults('vanguard').visual;visual.buffOffsetX=4;visual.buffOffsetY=-2;
 const context={style:'vanguard',hero:{x:10,y:15},mountGround:{x:24,y:32},heroBody:{x:50,y:120}};
 for(const variant of ['incomplete','full'])for(const facing of [-1,1]){
  const entities=Layout.entities({entities:[{key:variant,slot:'buff',phase:'loop',variant,age:.4,scale:1,opacity:1}]},visual,{...context,facing});
  assert.equal(entities.length,1);
  const [loop]=entities;
  assert.equal(loop.clip.id,'vanguard-'+variant+'-buff');assert.equal(loop.behind,true);assert.equal(loop.scaleX,facing);
  assert.deepEqual({x:loop.x,y:loop.y},{x:28,y:30});
 }
});
