'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const Door=require('../../assets/_script/WallDoor'),Assembly=require('../../assets/_script/WallAssembly');
const clone=value=>JSON.parse(JSON.stringify(value)),close=(a,b)=>assert(Math.abs(a-b)<1e-7,`${a} != ${b}`);
const layout=()=>Assembly.layout({nativeVersion:2,left:1,right:1,gate:true,start:'post',end:'post'});
function metadata(){return {doors:{version:2,tiers:[1,2,3].map(level=>({scale:101.5/720,postInset:6,planeOffset:10,flipX:true,doorHeight:[210,225,240][level-1],heightMax:[38,42,44][level-1],hinges:{left:{x:360,y:800},right:{x:1080,y:320}},states:Object.fromEntries(Door.states.map(state=>[state,{path:`door_${state}_${level}`,width:1536,height:1024,anchorX:720,anchorY:560}]))}))}};}
function fixture(){
 const clips={};for(const key of ['idle','idle_night','open','open_night','shut','shut_night','create','upgrade','destroy','Fade_in'])clips[key]={slots:{native_fx:{color:[{color:'ffffffff'}]}},FutureField:{clip:key}};
 return {skeleton:{spine:'3.8.75'},bones:[{name:'root'},{name:'rts_wall_frame',parent:'root'}],slots:[{name:'native_fx',bone:'root'},{name:'rts_wall_part_0',bone:'rts_wall_frame'}],skins:[{name:'default',attachments:{}},{name:'original',attachments:{},FutureField:{keep:true}},...Door.skins.map(name=>({name,attachments:{}}))],animations:clips,FutureField:{keep:[1,2,3]}};
}
function installed(){return Door.install(fixture(),layout(),metadata());}
function closedMetadata(){const result=metadata();result.doors.closedOnly=true;for(const tier of result.doors.tiers)tier.states={closed:tier.states.closed};return result;}
function partsMetadata(){const result=metadata();for(const [level,tier]of result.doors.tiers.entries())for(const key of ['inward','outward'])tier.states[key]={parts:[{id:'near',path:`door_${key}_near_${level+1}`,width:190,height:350,anchorX:24,anchorY:330,targetX:360,targetY:800},{id:'far',path:`door_${key}_far_${level+1}`,width:340,height:510,anchorX:320,anchorY:485,targetX:1080,targetY:320}]};return result;}
function shown(json,key){return json.animations[key].slots[Door.slot].attachment;}

test('matched gate states are registered 2D regions with uniform scale and no posts or deformation',()=>{
 const json=fixture(),original=clone(json),meta=metadata(),before=clone(meta);Door.install(json,layout(),meta);
 assert.equal(json.wallDoor.version,2);assert.equal(json.slots.filter(s=>s.name.startsWith('rts_wall_leaf_')).length,1);assert.equal(json.slots.find(s=>s.name===Door.slot).attachment,'rts_door_closed');
 assert(json.slots.findIndex(s=>s.name===Door.slot)<json.slots.findIndex(s=>s.name==='rts_wall_part_0'),'existing pillars mask the hinge joints');
 for(const [index,skinName]of Door.skins.entries())for(const state of Door.states){const a=json.skins.find(s=>s.name===skinName).attachments[Door.slot]['rts_door_'+state],source=meta.doors.tiers[index].states[state];assert(!a.type||a.type==='region');assert(!a.vertices&&!a.uvs&&!a.triangles);assert.equal(a.path,source.path);close(a.width/source.width,a.height/source.height);close(a.width/source.width,meta.doors.tiers[index].scale*2);assert.equal(a.scaleX,-1);assert(!a.rotation);}
 for(const clip of Object.values(json.animations))for(const skin of Object.values(clip.deform||{}))assert(!skin[Door.slot]);
 assert.deepEqual(json.skins.find(s=>s.name==='original'),original.skins.find(s=>s.name==='original'));assert.deepEqual(json.FutureField,original.FutureField);assert.deepEqual(meta,before);
});
test('all closed, inward and outward images retain the exact wall hinge registration',()=>{
 const r=layout(),tiers=Door.resolve(r,metadata());
 for(const tier of tiers)for(const state of Door.states){const image=tier.states[state],left=Door.mapPoint(tier,image,tier.hinges.right),right=Door.mapPoint(tier,image,tier.hinges.left);close(left.x,r.left.x+16);close(left.y,r.left.y+4*(2/3));close(right.x,r.right.x+4);close(right.y,r.right.y+16*(2/3));}
 const reversed=metadata();for(const tier of reversed.doors.tiers){tier.flipX=false;tier.hinges={left:{x:360,y:320},right:{x:1080,y:800}};}
 for(const tier of Door.resolve(r,reversed)){const left=Door.mapPoint(tier,tier.states.closed,tier.hinges.left);close(left.x,r.left.x+16);close(left.y,r.left.y+4*(2/3));}
});
test('occlusion-fitted production source points stay fixed across sprite states, diagonal facings and camera transforms',()=>{
 const raw=production('cq1'),meta=clone(raw.wallKit),r=layout();assert(meta.doors&&meta.doors.version===2);meta.doors.closedOnly=false;
 // Approved artwork may use a baked slope different from the ground grid.
 // Registration preserves those original pixels; it must not shear them onto
 // an invented ideal hinge line when the image state or camera changes.
 for(const tier of meta.doors.tiers){const closed=tier.states.closed;for(const state of ['inward','outward'])tier.states[state]={...clone(closed),path:closed.path+'-'+state};}
 const tiers=Door.resolve(r,meta),Facing=require('../../assets/_script/GateFacing');
 const apply=(matrix,p)=>({x:matrix[0]*p.x+matrix[2]*p.y+matrix[4],y:matrix[1]*p.x+matrix[3]*p.y+matrix[5]});
 for(const face of ['NE','NW','SE','SW'])for(const zoom of [.5,1,2.5])for(const tier of tiers){
  const world=[Facing.mirrorX(face)?-1.2:1.2,0,0,1.2,157,-82],theta=.21,placement=[Math.cos(theta),Math.sin(theta),-Math.sin(theta),Math.cos(theta),75,-25],camera=[zoom,0,0,-zoom,360,540];
  const points=[{x:tier.states.closed.anchorX,y:tier.states.closed.anchorY},{x:40,y:430},{x:475,y:210}];
  for(const point of points){const projected=state=>apply(camera,apply(placement,apply(world,Door.mapPoint(tier,tier.states[state],point)))),closed=projected('closed');for(const state of ['inward','outward']){const p=projected(state);close(p.x,closed.x);close(p.y,closed.y);}}
 }
});
test('open and shut clip aliases switch sprites immediately without intermediate frames',()=>{
 const json=installed();for(const action of ['open','shut'])for(const direction of ['', '_inward','_outward'])for(const night of ['', '_night']){const key=action+direction+night,frame=shown(json,key);assert.equal(frame.length,1);assert.equal(frame[0].time,0);assert.equal(frame[0].name,action==='shut'?'rts_door_closed':direction==='_inward'?'rts_door_inward':'rts_door_outward');assert.equal(json.animations[key].slots[Door.slot].color[0].color,night?'a7a7a7ff':'ffffffff');assert(!json.animations[key].deform);}
 for(const key of ['idle','idle_night','create','upgrade'])assert.deepEqual(shown(json,key),[{time:0,name:'rts_door_closed'}]);
 assert.deepEqual(shown(json,'destroy'),[{time:0,name:'rts_door_closed'},{time:.1667,name:null}]);
 assert(!json.animations.Fade_in.slots[Door.slot].attachment,'the default fade retains the source-compatible color-only timeline');
 for(const direction of ['inward','outward']){const clip=json.animations['Fade_in_open_'+direction];assert.deepEqual(clip.slots[Door.slot].attachment,[{time:0,name:'rts_door_'+direction}]);assert.deepEqual(clip.slots[Door.slot].color,json.animations.Fade_in.slots[Door.slot].color);}
});
test('opposite compass selection swaps inward and outward states while preserving closed art and authored effects',()=>{
 const json=installed(),before=clone(json),reverse=Door.reverse(json);assert.deepEqual(json,before);assert.equal(reverse.wallDoor.reverse,true);
 for(const night of ['', '_night']){assert.equal(shown(reverse,'open'+night)[0].name,'rts_door_inward');assert.equal(shown(reverse,'open_outward'+night)[0].name,'rts_door_inward');assert.equal(shown(reverse,'open_inward'+night)[0].name,'rts_door_outward');assert.equal(shown(reverse,'shut_inward'+night)[0].name,'rts_door_closed');}
 assert.deepEqual(reverse.skins,json.skins);assert.deepEqual(reverse.animations.open.FutureField,json.animations.open.FutureField);assert.deepEqual(reverse.animations.open.slots.native_fx,json.animations.open.slots.native_fx);assert.deepEqual(Door.reverse(reverse),json);
});
test('invalid registration and unsupported opening sizes fail before modifying detached skeletons',()=>{
 for(const change of [m=>m.doors.tiers[0].states.inward.anchorX++,m=>m.doors.tiers[1].states.outward.width++,m=>m.doors.tiers[0].scale=0,m=>m.doors.tiers[2].doorHeight=900,m=>m.doors.tiers[0].hinges.left.x+=20,m=>m.doors.version=1]){const json=fixture(),before=clone(json),m=metadata();change(m);assert.throws(()=>Door.install(json,layout(),m));assert.deepEqual(json,before);}
 const r=layout();r.right.x+=45;r.right.y-=30;assert.throws(()=>Door.install(fixture(),r,metadata()),/without stretching/);
});
test('reinstalling a gate is stable and solid walls contain no door sprites or generated state clips',()=>{
 const json=installed(),before=clone(json);Door.install(json,layout(),metadata());assert.deepEqual(json,before);
 const r=layout();r.gate=false;Door.install(json,r,metadata());assert.equal(json.wallDoor.gate,false);assert(!json.slots.some(s=>s.name.startsWith('rts_wall_leaf_')));for(const skin of json.skins)assert(!skin.attachments[Door.slot]);for(const key of Door.generatedAnimations)assert(!json.animations[key]);
});

test('closed-only metadata uses only approved closed artwork and clears the passage when the game opens it',()=>{
 const meta=closedMetadata(),before=clone(meta),json=Door.install(fixture(),layout(),meta);assert.equal(json.wallDoor.closedOnly,true);assert.deepEqual(meta,before);
 for(const skinName of Door.skins)assert.deepEqual(Object.keys(json.skins.find(s=>s.name===skinName).attachments[Door.slot]),['rts_door_closed']);
 for(const key of ['open','open_night','Fade_in_open_inward','Fade_in_open_outward'])assert.deepEqual(shown(json,key),[{time:0,name:null}]);
 for(const key of ['idle','idle_night','create','upgrade','shut','shut_night'])assert.deepEqual(shown(json,key),[{time:0,name:'rts_door_closed'}]);
 for(const direction of ['inward','outward'])for(const action of ['open','shut'])for(const night of ['', '_night'])assert(!json.animations[action+'_'+direction+night],'no unapproved directional sprite is exposed as an animation');
 for(const key of ['Fade_in_open_inward','Fade_in_open_outward'])assert.equal(json.animations[key].slots[Door.slot].color.at(-1).time,.5);
 const reversed=Door.reverse(json);for(const key of ['open','open_night','Fade_in_open_inward','Fade_in_open_outward'])assert.deepEqual(shown(reversed,key),[{time:0,name:null}]);assert.deepEqual(reversed.skins,json.skins);assert.deepEqual(Door.reverse(reversed),json);
 const invalid=closedMetadata();invalid.doors.closedOnly='true';assert.throws(()=>Door.install(fixture(),layout(),invalid),/explicit/);
});

test('cropped open leaves register independently to approved closed hinges without stretching or new posts',()=>{
 const meta=partsMetadata(),before=clone(meta),r=layout(),json=Door.install(fixture(),r,meta);assert.deepEqual(meta,before);assert.equal(json.wallDoor.parts,true);
 assert.deepEqual(json.slots.filter(s=>s.name.startsWith('rts_wall_leaf_')).map(s=>s.name),[Door.slot,Door.partSlots.near,Door.partSlots.far]);
 for(const tier of json.wallDoor.tiers)for(const key of ['inward','outward'])for(const part of tier.states[key].parts){const actual=Door.mapPoint(tier,part,{x:part.anchorX,y:part.anchorY}),expected=Door.mapPoint(tier,tier.states.closed,{x:part.targetX,y:part.targetY});close(actual.x,expected.x);close(actual.y,expected.y);const region=Door.region(tier,key,part.id);close(region.width/part.width,tier.scale*2);close(region.height/part.height,tier.scale*2);assert.equal(region.path,part.path);assert.equal(region.scaleX,-1);assert(json.slots.findIndex(s=>s.name===Door.partSlots[part.id])<json.slots.findIndex(s=>s.name==='rts_wall_part_0'));}
 for(const version of [json,Door.reverse(json)])for(const key of ['open','open_night','open_inward','open_outward_night','Fade_in_open_inward','Fade_in_open_outward']){const selected=Door.target(key,version.wallDoor.reverse);assert.deepEqual(shown(version,key),[{time:0,name:null}]);for(const id of ['near','far']){const track=version.animations[key].slots[Door.partSlots[id]];assert.deepEqual(track.attachment,[{time:0,name:`rts_door_${selected}_${id}`}]);assert(!track.deform);}}
 for(const key of ['idle','shut','shut_night','create','upgrade']){assert.deepEqual(shown(json,key),[{time:0,name:'rts_door_closed'}]);for(const slot of Object.values(Door.partSlots))assert.deepEqual(json.animations[key].slots[slot].attachment,[{time:0,name:null}]);}
 const stable=clone(json);Door.install(json,r,meta);assert.deepEqual(json,stable);Door.install(json,r,closedMetadata());assert(!json.wallDoor.parts);assert(!json.slots.some(s=>Object.values(Door.partSlots).includes(s.name)));for(const skin of json.skins)for(const slot of Object.values(Door.partSlots))assert(!skin.attachments[slot]);
});

test('invalid cropped leaf metadata is rejected before altering the detached skeleton',()=>{
 for(const change of [m=>m.doors.tiers[0].states.inward.parts.pop(),m=>m.doors.tiers[0].states.inward.parts[1].id='near',m=>m.doors.tiers[0].states.inward.parts[0].targetX=NaN,m=>m.doors.tiers[0].states.inward.parts[0].targetY=2000,m=>m.doors.tiers[0].states.inward.parts[0].anchorX=-1,m=>m.doors.tiers[0].states.closed=m.doors.tiers[0].states.inward,m=>m.doors.tiers[0].states.inward=metadata().doors.tiers[0].states.inward]){const json=fixture(),before=clone(json),meta=partsMetadata();change(meta);assert.throws(()=>Door.install(json,layout(),meta));assert.deepEqual(json,before);}
});

test('optional open-part pose offsets report an explicit rigid visual displacement without changing calibration or pixels',()=>{
 const meta=partsMetadata(),plain=Door.resolve(layout(),meta);for(const tier of meta.doors.tiers.slice(1))tier.states.outward.parts.find(p=>p.id==='near').poseOffset={x:2,y:0,FutureField:{keep:true}};
 const before=clone(meta),tiers=Door.resolve(layout(),meta),json=Door.install(fixture(),layout(),meta);
 assert.deepEqual(meta,before);assert.deepEqual(Door.reverse(Door.reverse(json)),json);
 for(let i=0;i<3;i++)for(const state of Door.states){if(state==='closed'){assert.deepEqual(tiers[i].states.closed,plain[i].states.closed);continue;}for(const part of tiers[i].states[state].parts){
  const original=plain[i].states[state].parts.find(p=>p.id===part.id),offset=i>0&&state==='outward'&&part.id==='near'?{x:2,y:0}:{x:0,y:0},calibration=clone(part);delete calibration.poseOffset;assert.deepEqual(calibration,original);
  for(const p of[{x:part.anchorX,y:part.anchorY},{x:0,y:0},{x:part.width,y:part.height}]){const a=Door.mapPoint(tiers[i],part,p),b=Door.mapPoint(plain[i],original,p);close(a.x-b.x,offset.x);close(a.y-b.y,offset.y);}
  const displayed=Door.mapPoint(tiers[i],part,{x:part.anchorX,y:part.anchorY}),target=Door.mapPoint(tiers[i],tiers[i].states.closed,{x:part.targetX,y:part.targetY});close(displayed.x-target.x,offset.x);close(displayed.y-target.y,offset.y);
  const a=Door.region(tiers[i],state,part.id),b=Door.region(plain[i],state,part.id);close(a.x-b.x,offset.x*2);close(a.y-b.y,offset.y*2);const shape=clone(a);shape.x=b.x;shape.y=b.y;assert.deepEqual(shape,b,'UV path, dimensions, angle and scale remain unchanged');
  if(offset.x)assert.deepEqual(part.poseOffset.FutureField,{keep:true});else assert(!Object.hasOwn(part,'poseOffset'),'Absent offsets stay absent');
 }}
 const signed=partsMetadata();signed.doors.tiers[1].states.outward.parts[0].poseOffset={x:-1.25,y:.75};assert.deepEqual(Door.resolve(layout(),signed)[1].states.outward.parts[0].poseOffset,{x:-1.25,y:.75});
});

test('invalid or misplaced visual pose offsets reject before changing source skeletons',()=>{
 for(const invalid of[null,[],2,'2',{x:2},{x:NaN,y:0},{x:Infinity,y:0},{x:0,y:-Infinity},{x:'2',y:0},{x:0,y:false}]){const meta=partsMetadata(),json=fixture(),before=clone(json);meta.doors.tiers[1].states.outward.parts[0].poseOffset=invalid;assert.throws(()=>Door.install(json,layout(),meta),/poseOffset/);assert.deepEqual(json,before);}
 for(const state of Door.states){const meta=metadata(),json=fixture(),before=clone(json);meta.doors.tiers[1].states[state].poseOffset={x:2,y:0};assert.throws(()=>Door.install(json,layout(),meta),/Only open door leaf parts/);assert.deepEqual(json,before);}
});

const engine=process.env.COCOS_ENGINE_ROOT||'C:/ProgramData/cocos/editors/Creator/2.4.13/resources/engine',runtime=path.join(engine,'extensions/spine/lib/spine.js');
function parse(spine,json,states=Door.states){
 const names=[];for(const level of [1,2,3])for(const state of states)names.push(`door_${state}_${level}`);const columns=states.length,width=columns*1536;
 const atlasText='doors.png\nsize: '+width+',3072\nformat: RGBA8888\nfilter: Linear,Linear\nrepeat: none\n'+names.map((name,i)=>name+'\n  rotate: false\n  xy: '+(i%columns*1536)+','+(Math.floor(i/columns)*1024)+'\n  size: 1536,1024\n  orig: 1536,1024\n  offset: 0,0\n  index: -1\n').join('');
 const atlas=new spine.TextureAtlas(atlasText,()=>({setFilters(){},setWraps(){},getImage:()=>({width,height:3072})}));return new spine.SkeletonJson(new spine.AtlasAttachmentLoader(atlas)).readSkeletonData(json);
}
function parseParts(spine,json){
 const images=json.wallDoor.tiers.flatMap(tier=>Object.values(tier.states).flatMap(state=>state.parts||[state])),width=1536,height=images.length*1024;
 const atlasText='doors.png\nsize: '+width+','+height+'\nformat: RGBA8888\nfilter: Linear,Linear\nrepeat: none\n'+images.map((image,i)=>image.path+'\n  rotate: false\n  xy: 0,'+(i*1024)+'\n  size: '+image.width+','+image.height+'\n  orig: '+image.width+','+image.height+'\n  offset: 0,0\n  index: -1\n').join('');
 const atlas=new spine.TextureAtlas(atlasText,()=>({setFilters(){},setWraps(){},getImage:()=>({width,height})}));return new spine.SkeletonJson(new spine.AtlasAttachmentLoader(atlas)).readSkeletonData(json);
}
test('actual Spine state changes are instant, retain open sprites through night fading and close without deformation',{skip:!fs.existsSync(runtime)?'Install Creator 2.4.13 for Spine integration':false},()=>{
 const spine=require(runtime),json=installed(),data=parse(spine,json);
 for(const skinName of Door.skins){const skeleton=new spine.Skeleton(data);skeleton.setSkinByName(skinName);skeleton.setSlotsToSetupPose();const state=new spine.AnimationState(new spine.AnimationStateData(data)),slot=skeleton.findSlot(Door.slot);
  state.setAnimation(0,'open_inward',false);state.apply(skeleton);assert.equal(slot.getAttachment().name,'rts_door_inward');
  state.setAnimation(0,'Fade_in_open_inward',false);state.update(.25);state.apply(skeleton);assert.equal(slot.getAttachment().name,'rts_door_inward');
  state.setAnimation(0,'open_outward_night',false);state.apply(skeleton);assert.equal(slot.getAttachment().name,'rts_door_outward');
  state.setAnimation(0,'shut_outward_night',false);state.apply(skeleton);assert.equal(slot.getAttachment().name,'rts_door_closed');assert(!slot.deform.length);
 }
});

test('actual cropped Spine leaves retain fixed hinges through reversal, night fade and shut',{skip:!fs.existsSync(runtime)?'Install Creator 2.4.13 for Spine integration':false},()=>{
 const spine=require(runtime),base=Door.install(fixture(),layout(),partsMetadata());
 const pixel=(p,image,point)=>{
  const u=point.x/image.width,v=point.y/image.height;
  return {x:p[2]+(p[4]-p[2])*u+(p[0]-p[2])*v,y:p[3]+(p[5]-p[3])*u+(p[1]-p[3])*v};
 };
 const vertices=slot=>{const p=new Float32Array(8);slot.getAttachment().computeWorldVertices(slot.bone,p,0,2);return p;};
 for(const json of [base,Door.reverse(base)])for(const [tier,index]of json.wallDoor.tiers.map((tier,i)=>[tier,i])){
  const data=parseParts(spine,json),skeleton=new spine.Skeleton(data);
  skeleton.setSkinByName(Door.skins[index]);skeleton.setSlotsToSetupPose();skeleton.updateWorldTransform();
  const state=new spine.AnimationState(new spine.AnimationStateData(data)),closedPoints=vertices(skeleton.findSlot(Door.slot));
  for(const key of ['open_inward','Fade_in_open_inward','open_inward_night','open_outward','Fade_in_open_outward','open_outward_night'])for(const time of [0,.333]){
   state.setAnimation(0,key,false);state.update(time);state.apply(skeleton);skeleton.updateWorldTransform();
   assert.equal(skeleton.findSlot(Door.slot).getAttachment(),null);
   const selected=Door.target(key,json.wallDoor.reverse);
   for(const part of tier.states[selected].parts){
    const slot=skeleton.findSlot(Door.partSlots[part.id]);assert.equal(slot.getAttachment().path,part.path);
    const actual=pixel(vertices(slot),part,{x:part.anchorX,y:part.anchorY});
    const expected=pixel(closedPoints,tier.states.closed,{x:part.targetX,y:part.targetY});
    assert(Math.abs(actual.x-expected.x)<.001);assert(Math.abs(actual.y-expected.y)<.001);assert.equal(slot.deform.length,0);
   }
  }
  state.setAnimation(0,'shut_night',false);state.apply(skeleton);
  assert.equal(skeleton.findSlot(Door.slot).getAttachment().name,'rts_door_closed');
  for(const slot of Object.values(Door.partSlots))assert.equal(skeleton.findSlot(slot).getAttachment(),null);
 }
});

test('actual Spine applies declared pose displacement only to its selected open part through reversal and lifecycle clips',{skip:!fs.existsSync(runtime)?'Install Creator 2.4.13 for Spine integration':false},()=>{
 const spine=require(runtime),meta=partsMetadata(),plain=Door.install(fixture(),layout(),meta);for(const tier of meta.doors.tiers.slice(1))tier.states.outward.parts.find(p=>p.id==='near').poseOffset={x:2,y:0};const shifted=Door.install(fixture(),layout(),meta);
 const vertices=s=>{const a=s.getAttachment();if(!a)return null;const p=[];a.computeWorldVertices(s.bone,p,0,2);return p;};
 const pose=(data,skin,key)=>{const s=new spine.Skeleton(data);s.setSkinByName(skin);s.setSlotsToSetupPose();const a=new spine.AnimationState(new spine.AnimationStateData(data));a.setAnimation(0,key,false);a.update(.25);a.apply(s);s.updateWorldTransform();return s;};
 for(const reverse of[false,true]){const a=reverse?Door.reverse(plain):plain,b=reverse?Door.reverse(shifted):shifted,oldData=parseParts(spine,a),data=parseParts(spine,b);for(let level=0;level<3;level++)for(const key of['idle','idle_night','create','upgrade','open','open_night','open_inward','open_outward','Fade_in_open_inward','Fade_in_open_outward','open_inward_night','open_outward_night','shut','shut_night']){
  const before=pose(oldData,Door.skins[level],key),after=pose(data,Door.skins[level],key),selected=Door.target(key,b.wallDoor.reverse);
  for(const name of[Door.slot,...Object.values(Door.partSlots)]){const x=before.findSlot(name),y=after.findSlot(name),p=vertices(x),q=vertices(y);assert.equal(x.getAttachment()&&x.getAttachment().path,y.getAttachment()&&y.getAttachment().path);assert.deepEqual(y.color,x.color);if(!p){assert.equal(q,null);continue;}const offset=level>0&&selected==='outward'&&name===Door.partSlots.near?{x:2,y:0}:{x:0,y:0};for(let i=0;i<p.length;i+=2){assert(Math.abs(q[i]-p[i]-offset.x*2)<.001);assert(Math.abs(q[i+1]-p[i+1]-offset.y*2)<.001);}}
 }}
});
test('actual closed-only Spine playback opens a clear passage, keeps it clear at night and restores closed artwork', {skip:!fs.existsSync(runtime)?'Install Creator 2.4.13 for Spine integration':false},()=>{
 const spine=require(runtime),base=Door.install(fixture(),layout(),closedMetadata());for(const json of [base,Door.reverse(base)]){const data=parse(spine,json,['closed']);for(const skinName of Door.skins){
  const skeleton=new spine.Skeleton(data);skeleton.setSkinByName(skinName);skeleton.setSlotsToSetupPose();const state=new spine.AnimationState(new spine.AnimationStateData(data)),slot=skeleton.findSlot(Door.slot);assert.equal(slot.getAttachment().name,'rts_door_closed');
  for(const open of ['open','open_night']){state.setAnimation(0,open,false);state.apply(skeleton);assert.equal(slot.getAttachment(),null);for(const fade of ['Fade_in_open_inward','Fade_in_open_outward']){state.setAnimation(0,fade,false);state.update(.25);state.apply(skeleton);assert.equal(slot.getAttachment(),null);}state.setAnimation(0,'shut_night',false);state.apply(skeleton);assert.equal(slot.getAttachment().name,'rts_door_closed');}
  assert.equal(slot.deform.length,0);
 }}
});

function production(name){return JSON.parse(fs.readFileSync(path.resolve(__dirname,'../../assets/KinghtFallIconMap/com/Ani/cq',name,name+'.json'),'utf8'));}
test('WallKit installs matched states after native lighting tracks and recovers every original authored source',()=>{
 const Kit=require('../../assets/_script/WallKit'),main=production('cq1'),before=clone(main),r=layout(),meta=clone(main.wallKit);meta.gateStyle='matched';meta.doors=metadata().doors;
 const result=Kit.install(main,r,meta,{adjustmentsData:{version:1,poses:{}}}),original=Kit.source(main);assert.deepEqual(main,before);assert.equal(result.wallKit.gateStyle,'matched');assert.equal(result.wallKit.nativeAssembly,2);assert.equal(result.wallKit.volume,false);
 assert(result.slots.findIndex(s=>s.name===Door.slot)<result.slots.findIndex(s=>s.name.startsWith('rts_wall_part_')),'the door remains behind the existing wall pillars');
 for(const skinName of Door.skins){const skin=result.skins.find(s=>s.name===skinName);assert(!Object.keys(skin.attachments).some(slot=>slot.startsWith('men')),'old gateway leaves and pillars never enter matched aliases');assert.equal(Object.keys(skin.attachments[Door.slot]).length,3);for(const attachment of Object.values(skin.attachments[Door.slot])){assert(!attachment.type||attachment.type==='region');close(attachment.width/1536,attachment.height/1024);}}
 for(const direction of ['inward','outward'])for(const clipName of ['open_'+direction,'open_'+direction+'_night','Fade_in_open_'+direction]){const tracks=result.animations[clipName].slots;assert(tracks[Door.slot]);for(const slot of result.slots.filter(s=>s.name.startsWith('rts_wall_part_'))){assert(tracks[slot.name],'explicit clips inherit every existing wall color track');if(clipName.includes('night'))assert.equal(tracks[slot.name].color[0].color,'a7a7a7ff');if(clipName.startsWith('Fade_in'))assert.equal(tracks[slot.name].color.at(-1).time,.5);}}
 assert.deepEqual(Kit.source(result),original);assert(!Kit.source(result).wallDoor);for(const key of Door.generatedAnimations)assert(!Kit.source(result).animations[key]);
 const solid=Kit.layout({nativeVersion:2,left:1,right:1,gate:false,start:'post',end:'post'}),withoutGate=Kit.install(main,solid,meta,{adjustmentsData:{version:1,poses:{}}});assert(!withoutGate.slots.some(s=>s.name===Door.slot));assert.equal(withoutGate.wallDoor.gate,false);assert.deepEqual(Kit.source(withoutGate),original);
 const closedOnly=clone(meta);closedOnly.doors=closedMetadata().doors;const staged=Kit.install(main,r,closedOnly,{adjustmentsData:{version:1,poses:{}}});assert.equal(staged.wallDoor.closedOnly,true);for(const skinName of Door.skins)assert.deepEqual(Object.keys(staged.skins.find(s=>s.name===skinName).attachments[Door.slot]),['rts_door_closed']);assert.deepEqual(shown(staged,'open'),[{time:0,name:null}]);assert.deepEqual(Kit.source(staged),original,'closed-only staging preserves all original authored data');
 const legacy=clone(meta);delete legacy.doors;legacy.gateStyle='original';const oldStyle=Kit.install(main,r,legacy,{adjustmentsData:{version:1,poses:{}}});assert.equal(oldStyle.wallKit.gateStyle,'original');assert(!oldStyle.wallDoor);assert(oldStyle.skins.find(s=>s.name==='cq-rts-1').attachments.men1_4);assert.deepEqual(Kit.source(oldStyle),original);
});
test('matched companion suppresses old leaves and posts while retaining original CQ2 skins, effects and headers',()=>{
 const Kit=require('../../assets/_script/WallKit'),raw=production('cq2'),source=Kit.source(raw),matched=clone(raw);matched.wallGate=Object.assign({},raw.wallGate,{style:'matched',FutureField:{keep:true}});const before=clone(matched),result=Kit.fitGatePart(matched,layout(),{frameToLocal:[1,0,0,1,20,-4]});
 assert.deepEqual(matched,before);assert.equal(result.wallGate.style,'matched');assert.deepEqual(result.wallGate.FutureField,{keep:true});for(const name of Door.skins)assert.deepEqual(result.skins.find(s=>s.name===name).attachments,{});
 for(const animation of Object.values(result.animations))for(const name of Door.skins)assert(!animation.deform||!animation.deform[name]);assert.deepEqual(Kit.source(result),source);assert.deepEqual(Kit.fitGatePart(result,layout()),result,'refitting never accumulates aliases or changes metadata');
 const old=clone(raw);old.wallGate=Object.assign({},raw.wallGate,{style:'original'});const originalFit=Kit.fitGatePart(old,layout());assert(originalFit.skins.find(s=>s.name==='cq-rts-1').attachments.men1_1,'legacy original companion remains available');assert.deepEqual(Kit.source(originalFit),source);
});
