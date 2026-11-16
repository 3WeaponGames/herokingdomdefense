'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),path=require('path');
const Tips=require('../../packages/hkd-characters/lib/opaque-tip'),Pose=require('../../assets/_script/HeroSkillPose');
const near=(a,b)=>assert(Math.abs(a-b)<1e-7,`${a} != ${b}`);
test('staff head is derived from opaque pixels, preserving transparent image padding and unknown fields',()=>{
 const image={width:8,height:10,rgba:Buffer.alloc(8*10*4)};for(const x of [3,4])image.rgba[(2*8+x)*4+3]=255;image.rgba[(0*8)*4+3]=1;
 assert.deepEqual(Tips.tip(image),{u:.5,v:.25});const rig={skins:[{attachments:{'Rider/HandRight/Staff':{staff:{path:'staff',future:17}},other:{hat:{path:'staff'}}}}]},before=Buffer.from(image.rgba);
 Tips.annotate(rig,{staff:image});assert.deepEqual(rig.skins[0].attachments['Rider/HandRight/Staff'].staff,{path:'staff',future:17,_skillTip:{u:.5,v:.25}});assert.equal(rig.skins[0].attachments.other.hat._skillTip,undefined);assert.deepEqual(image.rgba,before);
});
test('runtime and canvas share the visible head through fitted attachment rotations and bone transforms',()=>{
 const bone={worldX:10,worldY:20,a:0,b:-2,c:2,d:0},attachment={name:'staff',offset:[-5,-10,-5,10,5,10,5,-10]},json={skins:[{attachments:{staff:{staff:{_skillTip:{u:.6,v:.25}}}}}]},target={skeletonData:{skeletonJson:json},findBone:()=>bone,findSlot:()=>({getAttachment:()=>attachment})};
 const native=Pose.attachmentTip(target,'staff'),canvas=Pose.attachmentTip({...target,skeletonData:null},'staff',bone,json);near(native.x,0);near(native.y,22);assert.deepEqual(native,canvas);
 const legacy=Pose.attachmentTip({...target,skeletonData:null},'staff');near(legacy.x,-10);near(legacy.y,20);target.skeletonData.skeletonJson.skins[0].attachments.staff.staff._skillTip={u:NaN,v:2};assert.deepEqual(Pose.attachmentTip(target,'staff'),legacy);
});
test('published staff tips retain a no-write migration plan for all five tiers',()=>{
 const root=path.resolve(__dirname,'../..'),plan=require('./opaque-staff-tips.cjs').plan(root);assert.equal(plan.files.size,0);assert.equal([...plan.reads.keys()].filter(file=>/mystic_.+\.json$/.test(file)).length,5);
 for(const [file,bytes]of plan.reads)if(file.endsWith('.json')){const rig=JSON.parse(bytes);for(const skin of rig.skins)for(const a of Object.values(skin.attachments['Rider/HandRight/Staff']||{})){assert(a._skillTip);assert(a._skillTip.u>=0&&a._skillTip.u<=1);assert(a._skillTip.v>0&&a._skillTip.v<.5);}}
});
test('same-named attachments use their current skin metadata before the default fallback',()=>{
 const json={skins:[{name:'default',attachments:{staff:{staff:{_skillTip:{u:.5,v:0}}}}},{name:'royal',attachments:{staff:{staff:{_skillTip:{u:.5,v:.25}}}}}]},bone={worldX:0,worldY:0,a:1,b:0,c:0,d:1},attachment={name:'staff',offset:[-5,-10,-5,10,5,10,5,-10]},target={skeletonData:{skeletonJson:json},findBone:()=>bone,findSlot:()=>({attachment}),_nativeSkeleton:{getSkeleton:()=>({getSkin:()=>({getName:()=> 'royal'})})}};
 near(Pose.attachmentTip(target,'staff').y,5);target._nativeSkeleton=null;target._skeleton={skin:{name:'royal'}};near(Pose.attachmentTip(target,'staff').y,5);target._skeleton.skin.name='missing';near(Pose.attachmentTip(target,'staff').y,10);
});
