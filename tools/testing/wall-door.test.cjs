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

const engine=process.env.COCOS_ENGINE_ROOT||'C:/ProgramData/cocos/editors/Creator/2.4.13/resources/engine',runtime=path.join(engine,'extensions/spine/lib/spine.js');
test('actual Spine state changes are instant, retain open sprites through night fading and close without deformation',{skip:!fs.existsSync(runtime)?'Install Creator 2.4.13 for Spine integration':false},()=>{
 const spine=require(runtime),json=installed(),names=[];for(const level of [1,2,3])for(const state of Door.states)names.push(`door_${state}_${level}`);
 const atlasText='doors.png\nsize: 4608,3072\nformat: RGBA8888\nfilter: Linear,Linear\nrepeat: none\n'+names.map((name,i)=>name+'\n  rotate: false\n  xy: '+(i%3*1536)+','+(Math.floor(i/3)*1024)+'\n  size: 1536,1024\n  orig: 1536,1024\n  offset: 0,0\n  index: -1\n').join('');
 const atlas=new spine.TextureAtlas(atlasText,()=>({setFilters(){},setWraps(){},getImage:()=>({width:4608,height:3072})})),data=new spine.SkeletonJson(new spine.AtlasAttachmentLoader(atlas)).readSkeletonData(json);
 for(const skinName of Door.skins){const skeleton=new spine.Skeleton(data);skeleton.setSkinByName(skinName);skeleton.setSlotsToSetupPose();const state=new spine.AnimationState(new spine.AnimationStateData(data)),slot=skeleton.findSlot(Door.slot);
  state.setAnimation(0,'open_inward',false);state.apply(skeleton);assert.equal(slot.getAttachment().name,'rts_door_inward');
  state.setAnimation(0,'Fade_in_open_inward',false);state.update(.25);state.apply(skeleton);assert.equal(slot.getAttachment().name,'rts_door_inward');
  state.setAnimation(0,'open_outward_night',false);state.apply(skeleton);assert.equal(slot.getAttachment().name,'rts_door_outward');
  state.setAnimation(0,'shut_outward_night',false);state.apply(skeleton);assert.equal(slot.getAttachment().name,'rts_door_closed');assert(!slot.deform.length);
 }
});

function production(name){return JSON.parse(fs.readFileSync(path.resolve(__dirname,'../../assets/KinghtFallIconMap/com/Ani/cq',name,name+'.json'),'utf8'));}
test('WallKit installs matched states after native lighting tracks and recovers every original authored source',()=>{
 const Kit=require('../../assets/_script/WallKit'),main=production('cq1'),before=clone(main),r=layout(),meta=clone(main.wallKit);meta.gateStyle='matched';meta.doors=metadata().doors;
 const result=Kit.install(main,r,meta),original=Kit.source(main);assert.deepEqual(main,before);assert.equal(result.wallKit.gateStyle,'matched');assert.equal(result.wallKit.nativeAssembly,2);assert.equal(result.wallKit.volume,false);
 assert(result.slots.findIndex(s=>s.name===Door.slot)<result.slots.findIndex(s=>s.name.startsWith('rts_wall_part_')),'the door remains behind the existing wall pillars');
 for(const skinName of Door.skins){const skin=result.skins.find(s=>s.name===skinName);assert(!Object.keys(skin.attachments).some(slot=>slot.startsWith('men')),'old gateway leaves and pillars never enter matched aliases');assert.equal(Object.keys(skin.attachments[Door.slot]).length,3);for(const attachment of Object.values(skin.attachments[Door.slot])){assert(!attachment.type||attachment.type==='region');close(attachment.width/1536,attachment.height/1024);}}
 for(const direction of ['inward','outward'])for(const clipName of ['open_'+direction,'open_'+direction+'_night','Fade_in_open_'+direction]){const tracks=result.animations[clipName].slots;assert(tracks[Door.slot]);for(const slot of result.slots.filter(s=>s.name.startsWith('rts_wall_part_'))){assert(tracks[slot.name],'explicit clips inherit every existing wall color track');if(clipName.includes('night'))assert.equal(tracks[slot.name].color[0].color,'a7a7a7ff');if(clipName.startsWith('Fade_in'))assert.equal(tracks[slot.name].color.at(-1).time,.5);}}
 assert.deepEqual(Kit.source(result),original);assert(!Kit.source(result).wallDoor);for(const key of Door.generatedAnimations)assert(!Kit.source(result).animations[key]);
 const solid=Kit.layout({nativeVersion:2,left:1,right:1,gate:false,start:'post',end:'post'}),withoutGate=Kit.install(main,solid,meta);assert(!withoutGate.slots.some(s=>s.name===Door.slot));assert.equal(withoutGate.wallDoor.gate,false);assert.deepEqual(Kit.source(withoutGate),original);
 const legacy=clone(meta);delete legacy.doors;legacy.gateStyle='original';const oldStyle=Kit.install(main,r,legacy);assert.equal(oldStyle.wallKit.gateStyle,'original');assert(!oldStyle.wallDoor);assert(oldStyle.skins.find(s=>s.name==='cq-rts-1').attachments.men1_4);assert.deepEqual(Kit.source(oldStyle),original);
});
test('matched companion suppresses old leaves and posts while retaining original CQ2 skins, effects and headers',()=>{
 const Kit=require('../../assets/_script/WallKit'),raw=production('cq2'),source=Kit.source(raw),matched=clone(raw);matched.wallGate=Object.assign({},raw.wallGate,{style:'matched',FutureField:{keep:true}});const before=clone(matched),result=Kit.fitGatePart(matched,layout(),{frameToLocal:[1,0,0,1,20,-4]});
 assert.deepEqual(matched,before);assert.equal(result.wallGate.style,'matched');assert.deepEqual(result.wallGate.FutureField,{keep:true});for(const name of Door.skins)assert.deepEqual(result.skins.find(s=>s.name===name).attachments,{});
 for(const animation of Object.values(result.animations))for(const name of Door.skins)assert(!animation.deform||!animation.deform[name]);assert.deepEqual(Kit.source(result),source);assert.deepEqual(Kit.fitGatePart(result,layout()),result,'refitting never accumulates aliases or changes metadata');
 const old=clone(raw);old.wallGate=Object.assign({},raw.wallGate,{style:'original'});const originalFit=Kit.fitGatePart(old,layout());assert(originalFit.skins.find(s=>s.name==='cq-rts-1').attachments.men1_1,'legacy original companion remains available');assert.deepEqual(Kit.source(originalFit),source);
});
