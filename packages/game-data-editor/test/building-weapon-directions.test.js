'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const Artwork=require('../preview/building-artwork'),Schema=require('../lib/schema'),Assets=require('../lib/asset-validation');
const Pose=require('../../../assets/_script/BuildingWeaponPose');
const root=path.resolve(__dirname,'../../..'),base=JSON.parse(fs.readFileSync(path.join(root,'assets/KinghtFallConfig/GameJsonCfg.json'))),catalog=JSON.parse(fs.readFileSync(path.join(root,'assets/resources/localization/catalog.json')));
function appearance(){return{sprite:'buildings/towers/sniper-1',width:187,height:230,offsetY:-38,weapon:{sprite:'buildings/towers/sniper-1-weapon',width:110,height:73,pivotX:.45,pivotY:.5,offsetX:0,offsetY:133,muzzleX:48,muzzleY:27,views:{north:{sprite:'buildings/towers/sniper-1-weapon-north',width:110,height:64,pivotX:.5,pivotY:.5,muzzleX:0,muzzleY:28},south:{sprite:'buildings/towers/sniper-1-weapon-south',width:110,height:64,pivotX:.5,pivotY:.53,muzzleX:0,muzzleY:-28,unknown:{retain:true}}}}};}
test('four directional views stay upright, west mirrors east, and the muzzle follows every firing ray',()=>{
  const value=appearance(),before=JSON.stringify(value),first=Artwork.geometry(value,null);
  for(let degrees=-180;degrees<=180;degrees+=5){
    const data=Artwork.geometry(value,degrees),p=Pose.pose(value.weapon,degrees),w=data.weapon;
    const expected=Math.abs(Math.sin(degrees*Math.PI/180))>Math.abs(Math.cos(degrees*Math.PI/180))+.000001?degrees>0?'north':'south':'side';
    assert.equal(w.view,expected);assert.equal(w.sprite,expected==='side'?value.weapon.sprite:value.weapon.views[expected].sprite);
    assert.equal(w.flipX<0,expected==='side'&&Math.cos(degrees*Math.PI/180)<0);
    if(expected!=='side')assert(Math.abs(w.angle)<=45.000001,'front/rear views never tip toward the ground');
    const dx=w.muzzle.x-w.x,dy=w.muzzle.y-w.y,angle=degrees*Math.PI/180;
    assert(Math.abs(dx*Math.sin(angle)-dy*Math.cos(angle))<1e-6);
    assert(dx*Math.cos(angle)+dy*Math.sin(angle)>0);
    assert.equal(w.width,p.width);assert.deepEqual(data.base,first.base);assert.deepEqual(data.frameBounds,first.frameBounds,'preview framing remains fixed across sprite swaps');
  }
  assert.equal(JSON.stringify(value),before,'aiming never creates a data edit');
});
test('directional draft geometry and resources validate without seeding or repairing data',()=>{
  const docs={A:{data:Schema.clone(base)},catalog:{data:Schema.clone(catalog)}},row=docs.A.data.BuildEnum['2'].levelList[0];
  row.Appearance=appearance();const at=['BuildEnum','2','levelList',0,'Appearance','weapon','views'];
  for(const [key,value]of [['sprite','../outside'],['sprite','tower.png'],['height',0],['pivotX',1.1],['pivotY',-.1],['muzzleX',Infinity],['muzzleY','28']]){
    const original=row.Appearance.weapon.views.south[key];row.Appearance.weapon.views.south[key]=value;const before=JSON.stringify(docs);
    assert(Schema.validate(docs,[{doc:'A',path:at.concat('south',key)}]).some(issue=>issue.severity==='error'&&issue.path.includes('views')),key);
    assert.equal(JSON.stringify(docs),before);row.Appearance.weapon.views.south[key]=original;
  }
  const before=JSON.stringify(docs);assert.equal(Schema.validate(docs,[{doc:'A',path:at}]).filter(issue=>issue.path.includes('views')).length,0);assert.equal(JSON.stringify(docs),before);
  row.Appearance.weapon.views.south.sprite='missing/directional-weapon';
  assert(Assets.validate(root,docs,[{doc:'A',path:at.concat('south','sprite')}]).some(issue=>issue.path.includes('views')));
  assert.deepEqual(Assets.validate(root,docs,[{doc:'A',path:['BuildEnum','2','levelList',0,'Data',0]}]),[]);
});

function eight(){const value=appearance();value.weapon.views.southeast={sprite:'buildings/towers/sniper-1-weapon-southeast',width:110,height:74,pivotX:.45,pivotY:.56,muzzleX:46,muzzleY:-25};return value;}
test('four source images cover eight directions; both diagonal views mirror and idle stays northeast',()=>{
  const value=eight(),before=JSON.stringify(value),first=Artwork.geometry(value,null);
  for(const [angle,view,flip,facing]of [[0,'side',1,'east'],[45,'side',1,'northeast'],[90,'north',1,'north'],[135,'side',-1,'northwest'],[180,'side',-1,'west'],[-135,'southeast',-1,'southwest'],[-90,'south',1,'south'],[-45,'southeast',1,'southeast']]){
    const p=Pose.pose(value.weapon,angle),g=Artwork.geometry(value,angle);
    assert.equal(p.view,view);assert.equal(p.flipX,flip);assert.equal(p.facing,facing);assert.equal(g.weapon.sprite,p.sprite);
    assert(Math.abs(p.angle)<33,'use nearby perspectives rather than turning side art vertically');
    assert.deepEqual(g.frameBounds,first.frameBounds);assert.deepEqual(g.base,first.base);
  }
  const idle=Pose.pose(value.weapon,null);assert.equal(idle.sprite,value.weapon.sprite);assert.equal(idle.angle,0);assert.equal(idle.flipX,1);assert.equal(idle.facing,'northeast');
  for(let angle=-180;angle<=180;angle+=.5){
    const p=Pose.pose(value.weapon,angle),g=Artwork.geometry(value,angle),r=angle*Math.PI/180,dx=g.weapon.muzzle.x-g.weapon.x,dy=g.weapon.muzzle.y-g.weapon.y;
    assert(Math.abs(dx*Math.sin(r)-dy*Math.cos(r))<1e-6);assert(dx*Math.cos(r)+dy*Math.sin(r)>0);
    assert(Math.abs(p.angle)<40,'no flattened upside-down weapon between the eight headings');
  }
  assert.equal(Pose.pose(value.weapon,67.49).view,'side');assert.equal(Pose.pose(value.weapon,67.5).view,'north');
  assert.equal(Pose.pose(value.weapon,112.51).view,'side');assert.equal(Pose.pose(value.weapon,-67.49).view,'southeast');
  assert.equal(Pose.pose(value.weapon,-67.5).view,'south');assert.equal(Pose.pose(value.weapon,-112.51).view,'southeast');
  assert.equal(JSON.stringify(value),before);
});
test('southeast transforms and resources receive the same save validation as north and south',()=>{
  const docs={A:{data:Schema.clone(base)},catalog:{data:Schema.clone(catalog)}},row=docs.A.data.BuildEnum['2'].levelList[0];row.Appearance=eight();
  const at=['BuildEnum','2','levelList',0,'Appearance','weapon','views','southeast'];
  for(const [key,value]of [['sprite','../outside'],['width',0],['pivotY',1.1],['muzzleY',NaN]]){
    const original=row.Appearance.weapon.views.southeast[key];row.Appearance.weapon.views.southeast[key]=value;const before=JSON.stringify(docs);
    assert(Schema.validate(docs,[{doc:'A',path:at.concat(key)}]).some(issue=>issue.path.includes('southeast')));
    assert.equal(JSON.stringify(docs),before);row.Appearance.weapon.views.southeast[key]=original;
  }
  row.Appearance.weapon.views.southeast.sprite='missing/southeast';assert(Assets.validate(root,docs,[{doc:'A',path:at.concat('sprite')}]).some(issue=>issue.path.includes('southeast')));
});

function five(){const value=eight(),w=value.weapon;w.referenceAngle=0;w.views.northeast={...w.views.southeast,sprite:'northeast',referenceAngle:45};w.views.north.referenceAngle=90;w.views.south.referenceAngle=-90;w.views.southeast.referenceAngle=-45;w.emptySprite='side-empty';Object.values(w.views).forEach(v=>v.emptySprite=v.sprite+'-empty');return value;}
test('five source textures select eight fixed facings without rotating any sprite',()=>{
 const value=five(),before=JSON.stringify(value),idle=Pose.pose(value.weapon,null);
 assert.equal(idle.view,'northeast');assert.equal(idle.angle,0);assert.equal(idle.facing,'northeast');
 for(const [angle,view,flip]of [[0,'side',1],[45,'northeast',1],[90,'north',1],[135,'northeast',-1],[180,'side',-1],[-135,'southeast',-1],[-90,'south',1],[-45,'southeast',1]]){const p=Pose.pose(value.weapon,angle);assert.equal(p.view,view);assert.equal(p.flipX,flip);assert.equal(p.angle,0);assert(p.emptySprite);}
 for(let degrees=-180;degrees<=180;degrees+=.25){const p=Pose.pose(value.weapon,degrees),x=p.aimX*p.flipX,y=p.aimY,target=degrees*Math.PI/180;assert.equal(p.angle,0,'authored textures never receive a rotation correction');assert(x*Math.cos(target)+y*Math.sin(target)>=Math.cos(Math.PI/8)-1e-8,'choose the nearest fixed heading');}
 assert.equal(JSON.stringify(value),before,'read-only previews retain their authored geometry');
});
test('new directional reload textures and spring settings validate drafts without repairing them',()=>{
 const docs={A:{data:Schema.clone(base)},catalog:{data:Schema.clone(catalog)}},row=docs.A.data.BuildEnum[2].levelList[0];row.Appearance=five();row.Appearance.weapon.motion={type:'spring',distance:15,speed:20,damping:5,reloadTime:1};
 const at=['BuildEnum','2','levelList',0,'Appearance','weapon'],checks=[['referenceAngle',181],['emptySprite','../escape'],['views.northeast.referenceAngle',NaN],['views.northeast.emptySprite','missing.png'],['motion.damping',0],['motion.reloadTime',-1],['motion.speed',Infinity]];
 for(const [key,value]of checks){const parts=key.split('.'),parent=parts.slice(0,-1).reduce((p,k)=>p[k],row.Appearance.weapon),last=parts.at(-1),old=parent[last];parent[last]=value;const before=JSON.stringify(docs);assert(Schema.validate(docs,[{doc:'A',path:at.concat(parts)}]).some(i=>i.path.includes(last)));assert.equal(JSON.stringify(docs),before);parent[last]=old;}
 row.Appearance.weapon.views.northeast.emptySprite='missing/unloaded';assert(Assets.validate(root,docs,[{doc:'A',path:at.concat('views','northeast','emptySprite')}]).some(i=>i.path.includes('emptySprite')));
});
