'use strict';
// Actual supplied pixels and Creator Spine 3.8 posing; no scene or audio.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../..'),folder=path.join(root,'assets/KinghtFallIconMap/com/Ani/cq/cq1');
const PNG=require('../../packages/hkd-characters/lib/png-atlas'),G=require('./verify-wall-door-geometry.cjs');
const Kit=require('../../assets/_script/WallKit'),Door=require('../../assets/_script/WallDoor'),Facing=require('../../assets/_script/GateFacing');
const review=require('./wall-door-reviewed-geometry.fixture.json'),json=JSON.parse(fs.readFileSync(path.join(folder,'cq1.json')));
const atlasText=fs.readFileSync(path.join(folder,'cq1.atlas'),'utf8'),bytes=fs.readFileSync(path.join(folder,'wall-doors.png')),image=PNG.decode(bytes);
const hash=b=>crypto.createHash('sha256').update(b).digest('hex'),close=(a,b,e=1e-4)=>assert(Math.abs(a-b)<=e,`${a} != ${b}`);
const runtime=path.join(process.env.COCOS_ENGINE_ROOT||'C:/ProgramData/cocos/editors/Creator/2.4.13/resources/engine','extensions/spine/lib/spine.js');
const engine={skip:!fs.existsSync(runtime)?'Creator 2.4.13 is needed for actual Spine posing':false};
function pixels(record){return PNG.crop(image,...record.bounds,false);}
function vertices(slot){const a=slot.getAttachment(),out=[];if(a.worldVerticesLength)a.computeWorldVertices(slot,0,a.worldVerticesLength,out,0,2);else a.computeWorldVertices(slot.bone,out,0,2);return out;}
function pixel(v,source,p){const u=p.x/source.width,w=p.y/source.height;return{x:v[2]+(v[4]-v[2])*u+(v[0]-v[2])*w,y:v[3]+(v[5]-v[3])*u+(v[1]-v[3])*w};}
function parse(spine,value){const atlas=new spine.TextureAtlas(atlasText,name=>{const b=fs.readFileSync(path.join(folder,name));return new spine.FakeTexture({width:b.readUInt32BE(16),height:b.readUInt32BE(20)});});return new spine.SkeletonJson(new spine.AtlasAttachmentLoader(atlas)).readSkeletonData(value);}
function player(spine,data,tier){const skeleton=new spine.Skeleton(data),state=new spine.AnimationState(new spine.AnimationStateData(data));skeleton.setSkinByName('cq-rts-'+tier);skeleton.setToSetupPose();return{pose(name){state.setAnimation(0,name,false);state.update(.2);state.apply(skeleton);skeleton.updateWorldTransform();return skeleton;}};}

test('the supplied sheet contains nine reviewed images, empty deleted regions and a transparent matte',()=>{
 assert.equal(review.version,3);assert.equal(review.complete,true);assert.equal(hash(bytes),review.pageSha256);assert.equal(review.primary.length,9);assert.deepEqual(json.wallKit.doors,review.doors);
 assert.equal(image.width,4096);assert.equal(image.height,1024);assert.equal(image.rgba[3],0);
 const records=review.tiers.flatMap(t=>[t.closed,t.poses.inward,t.poses.outward]);assert.equal(new Set(records.map(r=>r.rgbaSha256)).size,9);
 for(const r of records){const im=pixels(r);assert.equal(hash(im.rgba),r.rgbaSha256,'A changed supplied image requires an explicit pixel review');assert.deepEqual([im.width,im.height],r.size);assert(rgbaCount(im)>1000);}
 for(const r of [[1817,2,260,366],[2081,2,267,366],[2884,2,266,365],[3418,2,266,365],[2,537,260,364],[535,537,260,363]])assert.equal(rgbaCount(PNG.crop(image,...r,false)),0,'Deleted duplicate stays empty');
 for(const tier of json.wallKit.doors.tiers)for(const direction of ['inward','outward']){
  const [near,far]=['near','far'].map(id=>tier.states[direction].parts.find(p=>p.id===id));assert.equal(near.path,far.path);assert.equal(near.mirrorX,undefined);assert.equal(far.mirrorX,true);assert.equal(far.mirrorSlope,2/3);assert(!near.poseOffset&&!far.poseOffset);
 }
 assert(!/rts_door_(?:inward|outward)_(?:near|far)_[123]/.test(atlasText),'Separate near/far open textures are removed');
});
function rgbaCount(im){let n=0;for(let i=3;i<im.rgba.length;i+=4)if(im.rgba[i]>=8)n++;return n;}

test('reviewed single leaves retain their painted floor, upright edges and physical half-gate span',()=>{
 for(const r of review.tiers)for(const direction of ['inward','outward']){
  const record=r.poses[direction],source=pixels(record),profile=G.alphaProfile(source),columns=profile.columns.filter(p=>p[0]>=40&&p[0]<=200),floor=G.fitLine(columns.map(p=>[p[0],p[2]]));
  assert(Math.abs(floor.slope-2/3)<.02,'The actual painted rail follows the open isometric axis');
  const spec=review.doors.tiers[r.level-1],parts=spec.states[direction].parts;
  close(Math.abs(parts[0].anchorX-parts[1].anchorX),(spec.hinges.right.x-spec.hinges.left.x)/2);
  for(const part of parts){const actualY=floor.slope*part.anchorX+floor.intercept;assert(Math.abs(actualY-part.anchorY)*spec.scale<.4,'The registered floor tracks real painted pixels');}
 }
});

test('actual Spine mirrors shared leaves to the same opening side at every tier, facing and day/night',engine,t=>{
 const spine=require(runtime),before=JSON.stringify(json);let poses=0,pins=0;
 for(const face of ['NE','NW','SE','SW']){
  let fitted=Kit.install(json,json.wallKit.layout,undefined,{mirrorX:Facing.mirrorX(face),adjustmentsData:{version:1,poses:{}}});if(Facing.reverse(face))fitted=Facing.mirrorJson(fitted);
  const data=parse(spine,fitted);
  for(const r of review.tiers){const play=player(spine,data,r.level),spec=fitted.wallDoor.tiers[r.level-1],closed=play.pose('idle'),quad=vertices(closed.findSlot(Door.slot)),feet=review.doors.tiers[r.level-1].hinges;
   const near=pixel(quad,spec.states.closed,feet.left),far=pixel(quad,spec.states.closed,feet.right),wall={x:far.x-near.x,y:far.y-near.y},signs={};
   for(const direction of ['inward','outward'])for(const night of [false,true]){
    const selected=(direction==='inward')!==Facing.reverse(face)?'inward':'outward',record=r.poses[selected],opened=play.pose('open_'+direction+(night?'_night':''));poses++;assert.equal(opened.findSlot(Door.slot).getAttachment(),null);const crosses=[];
    for(const part of spec.states[selected].parts){const slot=opened.findSlot(Door.partSlots[part.id]),attachment=slot.getAttachment(),v=vertices(slot);assert(attachment instanceof (part.mirrorX?spine.MeshAttachment:spine.RegionAttachment));assert.equal(attachment.path,record.path);assert(!slot.deform.length);if(night)close(slot.color.r,167/255);
     const hinge=pixel(v,part,{x:part.anchorX,y:part.anchorY}),target=pixel(quad,spec.states.closed,{x:part.targetX,y:part.targetY});close(hinge.x,target.x);close(hinge.y,target.y);pins++;
     const top=pixel(v,part,{x:part.anchorX,y:part.anchorY-180});close(top.x,hinge.x);close(Math.hypot(top.x-hinge.x,top.y-hinge.y),180*spec.scale);
     const delta=(selected==='inward'?-1:1)*(part.id==='near'?1:-1)*record.physicalWidth,x=part.anchorX+delta,free=pixel(v,part,{x,y:record.baseline.slope*x+record.baseline.intercept}),vector={x:free.x-hinge.x,y:free.y-hinge.y};crosses.push(wall.x*vector.y-wall.y*vector.x);
     // A ground-plane quarter turn has the other isometric slope and retains
     // half the gate's horizontal span; this also detects a screen-only flip.
     close(Math.abs(vector.y/vector.x),2/3);close(Math.abs(vector.x),Math.abs(wall.x)/2);
    }
    assert(crosses[0]*crosses[1]>0,'Both leaves open to the same side');if(!night)signs[direction]=Math.sign(crosses[0]);else assert.equal(Math.sign(crosses[0]),signs[direction]);
   }
   assert.equal(signs.inward,-signs.outward);const shut=play.pose('shut_night');assert.equal(shut.findSlot(Door.slot).getAttachment().path,spec.states.closed.path);for(const slot of Object.values(Door.partSlots))assert.equal(shut.findSlot(slot).getAttachment(),null);
  }
 }
 assert.equal(poses,48);assert.equal(pins,96);assert.equal(JSON.stringify(json),before);t.diagnostic(JSON.stringify({actualSpine:true,faces:4,tiers:3,directions:2,lighting:2,poses,pins,gameLoaded:false,audioStarted:false,projectWrites:0}));
});
