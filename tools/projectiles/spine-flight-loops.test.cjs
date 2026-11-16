'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),cp=require('node:child_process'),assert=require('node:assert/strict'),{test}=require('node:test');
const root=path.resolve(__dirname,'../..'),bundledPython=path.join(process.env.USERPROFILE||os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe'),python=process.env.PYTHON_EXECUTABLE||process.env.PYTHON||(fs.existsSync(bundledPython)?bundledPython:process.platform==='win32'?'python':'python3');
function generate(t,data,center){
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'hkd-spine-loops-'));t.after(()=>fs.rmSync(temp,{recursive:true,force:true}));
 const input=path.join(temp,'source.json'),output=path.join(temp,'result.json');fs.writeFileSync(input,JSON.stringify({data,center}));
 const script="import sys,json;sys.path.insert(0,sys.argv[1]);from spine_flight_loops import prepare_skeleton,center_skeleton;v=json.load(open(sys.argv[2]));d,c=prepare_skeleton(v['data'],'fixture');d=center_skeleton(d,c,v['center']) if v.get('center') else d;json.dump({'data':d,'clips':c},open(sys.argv[3],'w'))";
 const result=cp.spawnSync(python,['-c',script,__dirname,input,output],{encoding:'utf8',env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'}});assert.equal(result.status,0,result.stderr);return JSON.parse(fs.readFileSync(output));
}
function source(animation){return{bones:[{name:'root'},{name:'body',parent:'root'},{name:'unused',parent:'root',x:50}],slots:[{name:'weapon',bone:'body',attachment:'blade'},{name:'old-variant',bone:'unused',color:'ffffff00'}],skins:[{name:'default',attachments:{weapon:{blade:{type:'mesh',uvs:[0,0,1,0,1,1],vertices:[1,1,0,0,1,1,1,1,0,1,1,1,0,1,1]}}}}],animations:{fly_1:animation}};}
test('derived flight keeps independent image cadence, exact Float32 closure and original source data',t=>{
 const data=source({slots:{weapon:{attachment:[{name:'blade'},{time:1/30,name:'glow'},{time:2/30,name:null}]}},bones:{body:{translate:[{x:0},{time:1/30,x:3},{time:2/30,x:0}]}}}),before=JSON.parse(JSON.stringify(data)),{data:derived,clips}=generate(t,data),clip=clips[0],animation=derived.animations[clip.animation];
 assert.deepEqual(data,before);assert.deepEqual(derived.animations.fly_1,before.animations.fly_1);assert.deepEqual(derived.bones,before.bones);assert.deepEqual(derived.skins,before.skins);assert.equal(clip.loopFrames,6,'3-frame artwork and 2-frame bob use the complete common cycle');assert.equal(clip.duration,Math.fround(6/30));
 const images=animation.slots.weapon.attachment;assert.deepEqual(images.map(k=>k.name),['blade','glow',null,'blade','glow',null,'blade']);assert.equal(images.at(-1).time,clip.duration);assert.deepEqual(animation.slots['old-variant'],{attachment:[{name:null}],color:[{color:'ffffff00'}]});
 for(const bone of derived.bones)for(const property of ['translate','rotate','scale','shear'])assert.equal(animation.bones[bone.name][property][0].time||0,0);assert.deepEqual(animation.drawOrder,[{}]);
});
test('centering adjusts only derived existing-root tracks and preserves weighted attachment bone indices',t=>{
 const data=source({slots:{weapon:{attachment:[{name:'blade'}]}}}),bounds={flight_loop_fly_1:{x:100,y:-30,width:40,height:20}},{data:derived,clips}=generate(t,data,bounds);
 assert.equal(clips[0].duration,1);assert.equal(clips[0].static,true);assert.deepEqual(derived.skins,data.skins);assert.deepEqual(derived.bones,data.bones);assert.deepEqual(derived.animations.fly_1,data.animations.fly_1);assert.deepEqual(derived.animations.flight_loop_fly_1.bones.root.translate,[{x:-120,y:20},{time:1,x:-120,y:20}]);
});
test('steady-state bobbing removes entrance displacement without reversing its authored cycle',t=>{
 const data=source({bones:{body:{translate:[{x:100},{time:2/30,x:7},{time:5/30,x:2},{time:7/30,x:7},{time:10/30,x:2}]}}}),{data:derived,clips}=generate(t,data),track=derived.animations.flight_loop_fly_1.bones.body.translate;
 assert.equal(clips[0].loopFrames,5);assert.equal(track[0].x,2);assert.deepEqual(track.map(k=>k.x),[2,7,2]);assert.equal(clips[0].normalizations[0].operation,'steady-cycle');assert.equal(derived.animations.fly_1.bones.body.translate[0].x,100);
});
test('incommensurate independent layers use bounded integer repeats with documented small cadence changes',t=>{
 const data=source({slots:{weapon:{attachment:[{name:'a'},{time:9/30,name:'b'},{time:19/30,name:'a'}]},'old-variant':{attachment:[{name:'c'},{time:11/30,name:'d'},{time:22/30,name:'c'}]}},bones:{body:{scale:[{x:1,y:1},{time:10/30,x:2,y:2},{time:20/30,x:1,y:1}]}}}),{clips,data:derived}=generate(t,data),clip=clips[0];
 assert(clip.exactCommonFrames>240);assert(clip.loopFrames<=240);assert(clip.trackCycles.every(row=>Math.abs(row.playbackScale-1)<.05));assert(clip.trackCycles.every(row=>Number.isInteger(row.repeats)&&row.repeats>=1));assert.equal(derived.animations[clip.animation].slots.weapon.attachment.at(-1).name,'a');
});
test('a complete single-segment turn remains forward animation even though its end pose matches its start',t=>{
 const data=source({bones:{body:{rotate:[{angle:0},{time:.5,angle:-360}]}}}),{clips,data:derived}=generate(t,data),track=derived.animations.flight_loop_fly_1.bones.body.rotate;
 assert.equal(clips[0].static,false);assert.equal(clips[0].duration,.5);assert.equal(track[0].angle,0);assert.equal(track.at(-1).angle,-360);
});

test('published flight loops close actual visible meshes and do not retain another pooled variant pose',()=>{
 const libraryRoot=process.env.SPINE_PROJECTILE_LIBRARY_ROOT||root,file=path.join(libraryRoot,'assets/resources/projectiles/spine/library.json');assert(fs.existsSync(file),'run the maintained Spine importer before publication validation');
 const library=JSON.parse(fs.readFileSync(file)),assets=library.assets||library,groups=new Map(),spine=require(require('../../packages/game-data-editor/lib/unit-assets').enginePath());
 for(const asset of assets){const key=asset.resource;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(asset);}
 let checked=0;
 function visible(skeleton){const rows=[];for(const slot of skeleton.drawOrder){const a=slot.getAttachment();if(!a||!a.region||!slot.bone.active||a.color.a*slot.color.a<1e-6)continue;let v;if(a instanceof spine.RegionAttachment){v=new Float32Array(8);a.computeWorldVertices(slot.bone,v,0,2);}else if(a instanceof spine.MeshAttachment){v=new Float32Array(a.worldVerticesLength);a.computeWorldVertices(slot,0,v.length,v,0,2);}else continue;rows.push({slot:slot.data.name,attachment:a.name,vertices:[...v],color:[slot.color.r*a.color.r,slot.color.g*a.color.g,slot.color.b*a.color.b,slot.color.a*a.color.a]});}return rows;}
 function same(a,b,label){assert.equal(a.length,b.length,label+' visible attachments');for(let i=0;i<a.length;i++){assert.equal(a[i].slot,b[i].slot,label+' draw order');assert.equal(a[i].attachment,b[i].attachment,label+' image');for(let k=0;k<a[i].vertices.length;k++)assert(Math.abs(a[i].vertices[k]-b[i].vertices[k])<.001,label+' Float32 vertex continuity');for(let k=0;k<4;k++)assert(Math.abs(a[i].color[k]-b[i].color[k])<.00001,label+' opacity/color continuity');}}
 for(const [resource,variants]of groups){const jsonFile=path.join(libraryRoot,'assets',variants[0].bundle||'resources',resource+'.json'),json=JSON.parse(fs.readFileSync(jsonFile)),atlasFile=jsonFile.replace(/\.json$/,'.atlas'),atlas=new spine.TextureAtlas(fs.readFileSync(atlasFile,'utf8'),name=>{const png=fs.readFileSync(path.join(path.dirname(atlasFile),name));return new spine.FakeTexture({width:png.readUInt32BE(16),height:png.readUInt32BE(20)});}),data=new spine.SkeletonJson(new spine.AtlasAttachmentLoader(atlas)).readSkeletonData(json),pooled=new spine.Skeleton(data),state=new spine.AnimationState(new spine.AnimationStateData(data));
  function pose(clip,time){const skeleton=new spine.Skeleton(data);clip.apply(skeleton,0,time,false,null,1,spine.MixBlend.replace,spine.MixDirection.mixIn);skeleton.updateWorldTransform();return visible(skeleton);}
  for(const asset of variants){const clip=data.findAnimation(asset.animation);assert(clip,asset.id);assert.equal(clip.duration,asset.duration,asset.id+' exact native clock');const start=pose(clip,0);assert(start.length>0,asset.id+' nonblank');same(start,pose(clip,clip.duration),asset.id+' loop boundary');state.setAnimation(0,asset.animation,true);state.apply(pooled);pooled.updateWorldTransform();same(start,visible(pooled),asset.id+' pooled initial pose');state.update(clip.duration*2+.017);state.apply(pooled);pooled.updateWorldTransform();same(pose(clip,.017),visible(pooled),asset.id+' two native loops');checked++;}
 }
 assert.equal(checked,67);
});
