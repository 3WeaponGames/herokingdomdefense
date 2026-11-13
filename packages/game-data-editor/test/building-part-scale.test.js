'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const Parts=require('../../../assets/_script/BuildingPartScale'),Pose=require('../../../assets/_script/BuildingWeaponPose'),Group=require('../buildings/scale-group'),Data=require('../buildings/scale-data'),Preview=require('../worlds/building-preview'),{Store}=require('../lib/store'),{Service}=require('../worlds/service');
const root=path.resolve(__dirname,'../../..'),clone=x=>JSON.parse(JSON.stringify(x));
function fixture(){const store=new Store(root),service=new Service(root,{previewConfig:()=>store.documents.A.data});return{store,service,config:store.documents.A.data};}
test('separate object size controls discover current layers without seeding drafts or changing original sizes',()=>{
 const f=fixture(),before=f.store.draftState();
 for(const [id,index,keys]of [['2',4,['weapon']],['2',7,['weapon']],['5',2,['farmBeds','scarecrows']],['5',5,['farmBeds','bombs']]]){
  const position=f.config.BuildEnum[id].levelList.findIndex(r=>r.index===index),data=Data.describe(f.service,{id,levelIndex:position});
  assert.deepEqual(data.tiers.find(t=>t.position===position).parts.map(p=>p.key),keys);assert(data.tiers.every(t=>t.parts.every(p=>p.value===1)));
 }
 assert.deepEqual(f.store.draftState(),before);assert.equal(f.store.changes().length,0);assert(f.store.save({version:f.store.version}).result.noChanges);
});
test('part scale edits keep unknown fields, reject stale selections and remain one undoable draft transaction',()=>{
 const f=fixture(),request={id:'2',levelIndex:3,familyRoot:4},family=Group.family(f.config,request),b=family.branches[0];b.record.PartScale={future:{keep:true}};const before=f.store.draftState();
 const values=[{position:b.position,index:b.index,key:'weapon',from:1,value:.7}],edits=Group.partEdits(f.config,request,values);f.store.change({version:f.store.version,edits});
 assert.deepEqual(f.config.BuildEnum[2].levelList[b.position].PartScale,{future:{keep:true}}); // Store replaces its document, never the supplied source.
 const after=f.store.documents.A.data.BuildEnum[2].levelList[b.position];assert.deepEqual(after.PartScale,{future:{keep:true},weapon:.7});assert.equal(after.WorldScale,b.record.WorldScale);
 assert.throws(()=>Group.partEdits(f.store.documents.A.data,request,values),/elsewhere/);assert.throws(()=>Group.partEdits(f.config,request,[{...values[0],key:'farmBeds'}]),/part changed/);assert.throws(()=>Group.partEdits(f.config,request,[values[0],values[0]]),/part changed/);
 assert.deepEqual(Group.partEdits(f.config,request,[{...values[0],value:1}]),[]);f.store.undo({version:f.store.version});assert.deepEqual(f.store.draftState(),before);
});
test('weapon scales uniformly around the authored mount with the muzzle following every aiming direction',()=>{
 const f=fixture();for(const row of f.config.BuildEnum[2].levelList.filter(r=>r.Appearance.weapon))for(const angle of [null,0,45,90,135,180,225,270,315]){
  const a=Pose.pose(row.Appearance.weapon,angle),b=Pose.pose(row.Appearance.weapon,angle,.65);assert.equal(b.width,a.width*.65);assert.equal(b.height,a.height*.65);assert.equal(b.muzzleX,a.muzzleX*.65);assert.equal(b.muzzleY,a.muzzleY*.65);
  for(const k of ['x','y','pivotX','pivotY','flipX','angle','view','sprite'])assert.equal(b[k],a[k]);
 }
});
test('stage previews resize only the selected top mount and retain the body, blockers, pads and other tiers',()=>{
 const f=fixture(),template=f.service.buildingCatalog().find(b=>b.kind===2),building={...template,x:0,y:0,scale:1,angle:0,previewBranch:4},stage={variant:'A',buildings:[building]},before=Preview.describe(f.service,stage).buildings[building.id].levels[1];
 f.config.BuildEnum[2].levelList.find(r=>r.index===4).PartScale={weapon:.6};const after=Preview.describe(f.service,stage).buildings[building.id].levels[1];
 assert.deepEqual(after.sprites.slice(0,-1),before.sprites.slice(0,-1));assert.deepEqual(after.blockers,before.blockers);assert.deepEqual(after.step,before.step);assert.deepEqual(after.sprites.at(-1).matrix,before.sprites.at(-1).matrix);assert.equal(after.sprites.at(-1).width,before.sprites.at(-1).width*.6);
});
test('farm sizes use instance attachments, survive native setup/animation resets and restore without changing shared textures or bones',()=>{
 const engine=require('../lib/unit-assets').enginePath(),spine=require(engine),dir=path.join(root,'assets/KinghtFallIconMap/com/Ani/td'),json=JSON.parse(fs.readFileSync(dir+'/td.json')),before=clone(json),atlas=new spine.TextureAtlas(fs.readFileSync(dir+'/td.atlas','utf8'),name=>{const b=fs.readFileSync(dir+'/'+name);return{setFilters(){},setWraps(){},getImage:()=>({width:b.readUInt32BE(16),height:b.readUInt32BE(20)})};}),data=new spine.SkeletonJson(new spine.AtlasAttachmentLoader(atlas)).readSkeletonData(json),a=new spine.Skeleton(data),b=new spine.Skeleton(data);
 a.setSkinByName('mf-2-1');b.setSkinByName('mf-2-1');a.setToSetupPose();b.setToSetupPose();const component={_skeleton:a},slot=a.slots.find(s=>/^td__/.test(s.data.name)&&s.getAttachment()),addon=a.slots.find(s=>/^mill_addon_td__/.test(s.data.name)&&s.getAttachment()),base=slot.getAttachment(),original=clone(base.offset),extra=addon.getAttachment(),feet=extra.y-extra.height*extra.scaleY/2,row={PartScale:{farmBeds:.7,scarecrows:1.5}};
 for(let i=0;i<3;i++){a.setToSetupPose();Parts.apply(component,row);assert.equal(slot.getAttachment().scaleX,base.scaleX*.7);assert.equal(addon.getAttachment().scaleY,extra.scaleY*1.5);assert.equal(addon.getAttachment().y-addon.getAttachment().height*addon.getAttachment().scaleY/2,feet);assert.equal(b.findSlot(slot.data.name).getAttachment(),base);assert.deepEqual(Array.from(base.offset),Object.values(original));}
 Parts.apply(component,{});assert.equal(slot.getAttachment(),base);assert.equal(addon.getAttachment(),extra);assert.deepEqual(json,before);assert.deepEqual(Parts.json(json,row).bones,json.bones);assert.deepEqual(json,before);
});
