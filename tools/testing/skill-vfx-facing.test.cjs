'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const Projectile=require('../../assets/_script/HeroSkillProjectile'),Layout=require('../../assets/_script/HeroSkillVFXLayout');
const Settings=require('../../assets/_script/HeroSkillSettings'),Paths=require('../../assets/_script/HeroSkillArrowPaths');
const Catalog=require('../../assets/_script/HeroSkillVFXCatalog');
const Gizmos=require('../../packages/hkd-skills/preview-gizmos');
const near=(a,b,message)=>assert(Math.abs(a-b)<1e-7,(message||'')+` ${a} != ${b}`);
const atAngle=degrees=>({x:Math.cos(degrees*Math.PI/180),y:Math.sin(degrees*Math.PI/180)});
function transformed(at,matrix,p,scale=1){const angle=matrix.angle*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle),x=p.x*matrix.scaleX*scale,y=p.y*matrix.scaleY*scale;return{x:at.x+x*c-y*s,y:at.y+x*s+y*c};}
function artwork(entity,p){return transformed(entity,entity,p,entity.visual.scale*(entity.scale===undefined?1:entity.scale));}
function reflected(right,left,pivot,message){near(left.x,2*pivot.x-right.x,message+' X');near(left.y,right.y,message+' Y');}
function cast(style,visual,direction,origin={x:120,y:70},radius=180){return Layout.entities({entities:[{key:'cast',slot:'cast',phase:'loop',age:.9,style,origin,direction,radius,scale:1,opacity:1}]},visual,{style,hero:{x:0,y:0},facing:direction.x<0?-1:1})[0];}

test('directional VFX use a horizontal reflection with nonuniform scale and authored rotation rather than turning upside down',()=>{
 for(const aim of [-66,-17,0,23,74])for(const rotation of [-62.345520429791684,-27,0,39]){
  const d=atAngle(aim),right=Projectile.facingTransform(d,rotation,1.7,.65),left=Projectile.facingTransform({x:-d.x,y:d.y},rotation,1.7,.65),origin={x:40,y:-90};
  assert.equal(right.mirrored,false);assert.equal(left.mirrored,true);
  for(const p of [{x:0,y:0},{x:40,y:0},{x:0,y:40},{x:-21,y:17},{x:37,y:-29}])reflected(transformed(origin,right,p),transformed(origin,left,p),origin,`aim ${aim}, rotation ${rotation}`);
 }
 const left=Projectile.facingTransform({x:-1,y:0},0,1,1),origin={x:0,y:0};assert(transformed(origin,left,{x:0,y:10}).y>0,'The artwork top remains above its origin');assert(transformed(origin,left,{x:0,y:-10}).y<0,'The artwork bottom remains below its origin');
});

test('melee damage arcs mirror their authored angle while retaining world-space offsets, reach and angular width',()=>{
 const visual={rotation:31,scale:1.35,offsetX:37,offsetY:-23,arcDegrees:83},rightAim=atAngle(22),leftAim={x:-rightAim.x,y:rightAim.y};
 for(const style of ['fighter','bruiser','guardian']){
  const right=Projectile.area(style,{x:120,y:70},visual,rightAim,180),left=Projectile.area(style,{x:-120,y:70},visual,leftAim,180);
  assert.deepEqual(right.origin,{x:157,y:47});assert.deepEqual(left.origin,{x:-83,y:47},'A saved world-space X offset must not silently change sign');near(right.radius,243);near(left.radius,right.radius);near(left.halfAngle,right.halfAngle);near(left.direction.x,-right.direction.x);near(left.direction.y,right.direction.y);
 }
});

test('the calibrated Skirmisher VFX emitter and actual source mesh vertices reflect around the saved cast pivot',()=>{
 const visual={...Settings.defaults('skirmisher').visual,castScale:.23,castScaleX:1.4,castScaleY:.7,castRotation:Paths.defaultRotation+27,castOffsetX:37,castOffsetY:-23},direction=atAngle(29),origin={x:120,y:70},pivot={x:157,y:47};
 const right=cast('skirmisher',visual,direction,origin,0),left=cast('skirmisher',visual,{x:-direction.x,y:direction.y},origin,0);
 near(Layout.clipFor(visual.castResource).originX,Paths.sourceOrigin.x);near(Layout.clipFor(visual.castResource).originY,Paths.sourceOrigin.y);reflected(artwork(right,Paths.sourceOrigin),artwork(left,Paths.sourceOrigin),pivot,'Calibrated emitter');near(artwork(right,Paths.sourceOrigin).x,pivot.x);near(artwork(left,Paths.sourceOrigin).y,pivot.y);
 const source=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../../assets/resources/vfx/hero-skills/skirmisher-triple-volley/skirmisher-triple-volley.json'),'utf8'));let vertices=0;
 for(const attachments of Object.values(source.skins[0].attachments))for(const mesh of Object.values(attachments)){if(!Array.isArray(mesh.vertices))continue;assert.equal(mesh.vertices.length,mesh.uvs.length,'Only the imported unweighted meshes are accepted');for(let i=0;i<mesh.vertices.length;i+=2){const p={x:mesh.vertices[i],y:mesh.vertices[i+1]};reflected(artwork(right,p),artwork(left,p),pivot,'Actual authored mesh vertex');vertices++;}}
 assert(vertices>30,'Exercise real Spine source vertices, not a symmetric placeholder rectangle');
});

test('the final three source arrows reflect while the independently authored volley fan preserves mirrored contact membership',()=>{
 const settings=Settings.defaults('skirmisher'),visual={...settings.visual,castScale:.21,castScaleX:1.3,castScaleY:.8,castRotation:Paths.defaultRotation+19,castOffsetX:37,castOffsetY:-23,offsetX:37,offsetY:-23,rotation:19,arcDegrees:42},direction=atAngle(24),origin={x:120,y:70},pivot={x:157,y:47},leftDirection={x:-direction.x,y:direction.y},rightArt=cast('skirmisher',visual,direction,origin,0),leftArt=cast('skirmisher',visual,leftDirection,origin,0);
 const sources=Paths.trajectories.filter(source=>source.volley===2);assert.equal(sources.length,3);
 for(const source of sources)for(const point of source.points)reflected(artwork(rightArt,point),artwork(leftArt,point),pivot,'Original final-arrow artwork');
 const right=Projectile.volleyArea(origin,direction,{volleyRange:320},visual),left=Projectile.volleyArea(origin,leftDirection,{volleyRange:320},visual);assert.equal(right.radius,320);assert.equal(left.radius,320);near(left.direction.x,-right.direction.x);near(left.direction.y,right.direction.y);
 for(const degrees of [-22,-21,-20,0,20,21,22])for(const radius of [100,320,320.01]){const angle=Math.atan2(right.direction.y,right.direction.x)+degrees*Math.PI/180,target={x:pivot.x+Math.cos(angle)*radius,y:pivot.y+Math.sin(angle)*radius},reflectedTarget={x:2*pivot.x-target.x,y:target.y},hit=Projectile.containsArea(right,target);assert.equal(Projectile.containsArea(left,reflectedTarget),hit);assert.equal(hit,(radius===100||Math.abs(degrees)<=21)&&radius<=320,'The wide rear edge admits nearby side contacts while the outer arc keeps its angle and range');}
});

test('ground, body, overhead and Mystic burst effects mirror exactly once while their attachment points stay upright',()=>{
 for(const [style,slots]of [['fighter',['passive','buff']],['vanguard',['passive','buff']],['mystic',['mark','channelHit','cast']],['bruiser',['passive']],['guardian',['buff','taunt','presence','defense','physicalShield']]])for(const slot of slots){
  const visual=Settings.defaults(style).visual;if(style==='guardian'&&!visual[slot+'Resource'])Settings.applyClip(visual,slot+'Resource',Catalog.clips.find(clip=>clip.id===(slot==='buff'?'guardian-runic-shield':'guardian-defense')));Object.assign(visual,{[slot+'Scale']:.9,[slot+'ScaleX']:1.3,[slot+'ScaleY']:.7,[slot+'Rotation']:27,[slot+'OffsetX']:37,[slot+'OffsetY']:-23});
  for(const phase of ['start','loop','end']){
   const entity={key:'phase',slot,phase,age:.4,progress:.5,scale:1,opacity:1,style,origin:{x:120,y:70},target:{x:180,y:130},direction:{x:1,y:0},radius:130},frame={entities:[entity]},context={style,hero:{x:100,y:40},heroBody:{x:100,y:100}},right=Layout.entities(frame,visual,{...context,facing:1}),left=Layout.entities(frame,visual,{...context,facing:-1});assert(right.length&&left.length);assert.equal(left.length,right.length);
   for(let i=0;i<right.length;i++){const r=right[i],l=left[i],pivot={x:r.pivotX===undefined?r.x:r.pivotX,y:r.pivotY===undefined?r.y:r.pivotY};near(l.pivotX===undefined?l.x:l.pivotX,pivot.x,'Attachment X remains world-space');near(l.pivotY===undefined?l.y:l.pivotY,pivot.y,'Attachment Y remains world-space');for(const p of [{x:17,y:29},{x:-23,y:11},{x:0,y:40}])reflected(artwork(r,p),artwork(l,p),pivot,style+' '+slot+' '+phase);}
  }
 }
});

test('Mystic beam bodies and endpoint flares reflect with the beam while vertical travel ignores unrelated horse facing',()=>{
 for(const beamClip of [null,Catalog.clips.find(clip=>clip.id==='mystic-beam-body-loop')]){
 const visual={...Settings.defaults('mystic').visual,beamScale:1.1,beamScaleX:1.3,beamScaleY:.7,beamRotation:27,beamOffsetX:0,beamOffsetY:0},from={x:40,y:80},to={x:240,y:130},leftTo={x:-160,y:130};
 if(beamClip)Settings.applyClip(visual,'beamResource',beamClip);
 for(const phase of ['start','loop','end']){
  const common={key:'beam',slot:'beam',phase,age:.3,progress:.4,scale:1,opacity:1,style:'mystic',from},right=Layout.entities({entities:[{...common,to}]},visual,{style:'mystic',hero:{x:0,y:0},facing:1}),left=Layout.entities({entities:[{...common,to:leftTo}]},visual,{style:'mystic',hero:{x:0,y:0},facing:-1});assert(right.length);assert.equal(right.length,left.length);
  if(beamClip)assert.equal(right.length,3,'The phased resource must exercise source, body and target flares');
  for(let i=0;i<right.length;i++){reflected(right[i],left[i],from,'Beam part attachment');for(const p of [{x:17,y:29},{x:-23,y:11},{x:0,y:40}])reflected(artwork(right[i],p),artwork(left[i],p),from,'Beam artwork');}
 }
 const entity={key:'vertical',slot:'beam',phase:'loop',age:.2,style:'mystic',from,to:{x:from.x,y:from.y+200},scale:1,opacity:1},right=Layout.entities({entities:[entity]},visual,{style:'mystic',facing:1}),left=Layout.entities({entities:[entity]},visual,{style:'mystic',facing:-1});
 for(let i=0;i<right.length;i++)if(!right[i].clip.part||right[i].clip.part==='body'){near(left[i].angle,right[i].angle);near(left[i].scaleX,right[i].scaleX);near(left[i].scaleY,right[i].scaleY);}
 }
});

test('a mirrored preview rotation handle converts pointer rotation back to the authored value in the opposite direction',()=>{
 const origin={x:0,y:0},spec={id:'cast',origin,outline:[{x:-20,y:-30},{x:20,y:-30},{x:20,y:30},{x:-20,y:30}],paths:{rotation:'visual.castRotation'},values:{visual:{castRotation:27}},limits:{'visual.castRotation':{min:-360,max:360,step:.01}}},start={x:100,y:0},end={x:Math.cos(Math.PI/12)*100,y:Math.sin(Math.PI/12)*100};
 const right=Gizmos.update(Gizmos.begin({...spec,rotationFactor:1},'rotate',start),end),left=Gizmos.update(Gizmos.begin({...spec,rotationFactor:-1},'rotate',start),end);near(right.patches['visual.castRotation'],42);near(left.patches['visual.castRotation'],12);
});
