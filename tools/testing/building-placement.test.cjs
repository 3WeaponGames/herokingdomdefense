'use strict';
// Pure production motion versus the Archer's authored Spine tracks. No engine,
// scene, game, audio, timing callbacks or player data is loaded.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'../..'),Placement=require('../../assets/_script/BuildingPlacement');
const source=JSON.parse(fs.readFileSync(path.join(root,'assets/KinghtFallIconMap/com/Ani/jt/jt.json'),'utf8'));
const close=(actual,expected,label)=>assert(Math.abs(actual-expected)<1e-6,(label||'value')+': '+actual+' != '+expected);
const rest={x:0,y:0,scaleX:1,scaleY:1};
function sourceDuration(kind){let end=0;function visit(value){if(!value||typeof value!=='object')return;if(typeof value.time==='number')end=Math.max(end,value.time);for(const child of Object.values(value))visit(child);}visit(source.animations[kind]);return end;}
// Independent De Casteljau interpolation and bisection of the source curve's X.
function authoredEase(frame,progress){
  if(frame.curve==='stepped')return 0;if(typeof frame.curve!=='number')return progress;
  const points=[[0,0],[frame.curve,frame.c2===undefined?0:frame.c2],[frame.c3===undefined?1:frame.c3,frame.c4===undefined?1:frame.c4],[1,1]];
  function curve(t){let work=points.map(p=>p.slice());while(work.length>1)work=work.slice(1).map((p,index)=>[work[index][0]*(1-t)+p[0]*t,work[index][1]*(1-t)+p[1]*t]);return work[0];}
  let low=0,high=1;for(let i=0;i<50;i++){const middle=(low+high)/2;if(curve(middle)[0]<progress)low=middle;else high=middle;}return curve((low+high)/2)[1];
}
function authoredValue(track,property,seconds,fallback){
  if(seconds<(track[0].time||0))return fallback;
  for(let i=1;i<track.length;i++){const after=track[i],before=track[i-1],start=before.time||0,end=after.time||0;if(seconds<end){const a=before[property]===undefined?fallback:before[property],b=after[property]===undefined?fallback:after[property];return a+(b-a)*authoredEase(before,(seconds-start)/(end-start));}}
  const last=track.at(-1);return last[property]===undefined?fallback:last[property];
}
function authoredPose(kind,seconds){
  const name=kind==='create'?'bone3':'jianzhu',tracks=source.animations[kind].bones[name],create=kind==='create',bone=source.bones.find(b=>b.name==='bone3'),parent=source.bones.find(b=>b.name==='jianzhu');
  const sx=authoredValue(tracks.scale,'x',seconds,1),sy=authoredValue(tracks.scale,'y',seconds,1),translation=authoredValue(tracks.translate,'y',seconds,0),px=create?bone.x*parent.scaleX:0,py=create?bone.y*parent.scaleY:0;
  return{x:px*(1-sx)||0,y:py*(1-sy)+translation*(create?parent.scaleY:1)||0,scaleX:sx,scaleY:sy};
}
function poseClose(actual,expected,label){for(const property of ['x','y','scaleX','scaleY'])close(actual[property],expected[property],label+' '+property);}

test('placement durations include the Archer create dust and upgrade lights until their final authored frame',()=>{
  assert.equal(Placement.duration('create'),1.2);assert.equal(Placement.duration('upgrade'),.6667);
  for(const kind of ['create','upgrade'])assert.equal(Placement.duration(kind),sourceDuration(kind));
  assert.equal(source.bones.find(b=>b.name==='bone3').x*source.bones.find(b=>b.name==='jianzhu').scaleX,-2.6);
  assert.equal(source.bones.find(b=>b.name==='bone3').y*source.bones.find(b=>b.name==='jianzhu').scaleY,78.265);
});

for(const kind of ['create','upgrade'])test(kind+' matches every authored translation and scale key including its exact rest pose',()=>{
  const tracks=source.animations[kind].bones[kind==='create'?'bone3':'jianzhu'],times=new Set([0,Placement.duration(kind)]);
  for(const track of [tracks.translate,tracks.scale])for(const frame of track)times.add(frame.time||0);
  for(const seconds of times)poseClose(Placement.sample(kind,seconds),authoredPose(kind,seconds),kind+' at '+seconds);
  assert.deepEqual(Placement.sample(kind,Placement.duration(kind)),rest);
  assert.deepEqual(Placement.sample(kind,Placement.duration(kind)+100),rest);
});

test('intermediate samples follow authored Beziers and preserve the create hold before its asymmetric fall',()=>{
  for(const kind of ['create','upgrade'])for(const seconds of [.031,.103,.219,.371,.432,.514,.58335,.612,.713,.912,1.05])poseClose(Placement.sample(kind,seconds),authoredPose(kind,seconds),kind+' between keys at '+seconds);
  const pivotY=78.265;
  for(const seconds of [.3333,.4,.4999]){const pose=Placement.sample('create',seconds);close((pose.y-pivotY*(1-pose.scaleY))*2,547.23,'the pre-fall translation holds');}
  const halfway=Placement.sample('create',(.5+.6667)/2),translation=(halfway.y-pivotY*(1-halfway.scaleY))*2;
  assert(translation>(547.23-70.79)/2+100,'the asymmetric falling Bezier must not become linear interpolation');
  assert(Placement.sample('create',.125).scaleX<.25,'the initial scale uses the smooth Bezier rather than linear time');
  assert.deepEqual(Placement.sample('create',1.1),rest,'the create pose settles while its dust finishes');
  assert.deepEqual(Placement.sample('upgrade',.6),rest,'the upgrade pose settles while its light finishes');
});

test('dense samples agree with the source and remain finite, bounded and independent of previous samples',()=>{
  for(const kind of ['create','upgrade'])for(let frame=0;frame<=180;frame++){
    const seconds=Placement.duration(kind)*frame/180,pose=Placement.sample(kind,seconds);poseClose(pose,authoredPose(kind,seconds),kind+' sample '+frame);
    for(const value of Object.values(pose))assert(Number.isFinite(value));assert(pose.scaleX>=0&&pose.scaleX<=1.2);assert(pose.scaleY>=0&&pose.scaleY<=1.2);assert(Math.abs(pose.x)<3&&Math.abs(pose.y)<400);
    const unchanged=Placement.sample(kind,seconds);pose.x=999;pose.scaleY=-100;assert.deepEqual(Placement.sample(kind,seconds),unchanged,'samples must never expose shared mutable pose state');
  }
});

test('invalid kinds and invalid or out-of-range times produce fresh bounded poses',()=>{
  for(const kind of [undefined,null,'','idle','CREATE',0,{},'toString']){assert.equal(Placement.duration(kind),0);assert.deepEqual(Placement.sample(kind,.4),rest);assert.notEqual(Placement.sample(kind,.4),Placement.sample(kind,.4));}
  for(const kind of ['create','upgrade']){
    const start=Placement.sample(kind,0);for(const seconds of [undefined,null,'0.5',NaN,Infinity,-Infinity,-1,-1e100])assert.deepEqual(Placement.sample(kind,seconds),start);
    assert.deepEqual(Placement.sample(kind,Number.MAX_VALUE),rest);
  }
});

test('the sampler loads with no engine or host APIs and has normal web/native Cocos script metadata',()=>{
  const exports={},context={exports};vm.runInNewContext(fs.readFileSync(path.join(root,'assets/_script/BuildingPlacement.js'),'utf8'),context);
  poseClose(exports.sample('create',.58335),Placement.sample('create',.58335),'engine-free sample');assert.equal(exports.duration('upgrade'),.6667);
  const meta=JSON.parse(fs.readFileSync(path.join(root,'assets/_script/BuildingPlacement.js.meta'),'utf8'));assert.equal(meta.importer,'javascript');assert.equal(meta.isPlugin,false);assert.equal(meta.loadPluginInWeb,true);assert.equal(meta.loadPluginInNative,true);assert.equal(meta.loadPluginInEditor,false);assert.match(meta.uuid,/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
});
