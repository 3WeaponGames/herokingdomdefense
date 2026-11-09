'use strict';
const assert=require('node:assert/strict'),{test}=require('node:test'),Placement=require('../../packages/hkd-characters/lib/placement'),Scrub=require('../../packages/hkd-characters/lib/label-scrub');
test('headgear fits the active head skin rather than the hero mount; Maker slots keep natural scale',()=>{
  const head={name:'wqyl_lead_tou',uuid:'head',skin:'lv2',json:{slots:[{name:'humanr_headgear_1',bone:'b'},{name:'humanr_headgear_2',bone:'b'}],skins:[{name:'lv2',attachments:{humanr_headgear_2:{}}}]}},horse={name:'wqyl_lead_ma',uuid:'horse'},helmet={id:'Helmet/Gold',width:100,height:50};
  assert.equal(Placement.layerFor({layers:[horse,head]},helmet),head);assert.equal(Placement.socket(head,helmet).name,'humanr_headgear_2');assert.equal(Placement.fitAspect(200,100,100,100),.5);assert.deepEqual(Placement.intended({...helmet,pixelsPerUnit:200,pivot:{x:.25,y:.75}}),{x:12.5,y:-6.25,rotation:0,scaleX:.5,scaleY:.5});
  assert.equal(Placement.role({id:'HandRight/Crossbow/Wood_Down'}),'Crossbow_Down');
});

test('mounted Maker equipment always targets rider sockets even when the horse is first and the default layer',()=>{
  const horse={name:'Original cavalry horse',uuid:'horse',mount:true,json:{slots:[{name:'horse-body',bone:'horse'}]}},rider={name:'Character',uuid:'rider',json:{slots:[{name:'Rider/Body/Head/Helmet',bone:'head'},{name:'Rider/Body/Chest',bone:'body'},{name:'Rider/HandLeft/Shield',bone:'left'},{name:'Rider/HandRight/Sword',bone:'right'}]}};
  const rig={layers:[horse,rider],defaultLayer:'horse'};
  for(const [category,slot]of [['Helmet','Rider/Body/Head/Helmet'],['Chest','Rider/Body/Chest'],['HandLeft/Shield','Rider/HandLeft/Shield'],['HandRight/Sword','Rider/HandRight/Sword']]){
    const asset={id:category+'/Equipment',category};assert.equal(Placement.layerFor(rig,asset),rider);assert.equal(Placement.socket(Placement.layerFor(rig,asset),asset).name,slot);
  }
  assert.equal(Placement.layerFor(rig,{id:'Character Maker/Beard/Test',category:'Character Maker/Beard'}),rider);
});

test('the character backend rejects equipment on a horse layer without accepting a changed draft',()=>{
  const root=require('node:path').resolve(__dirname,'../..'),{Service}=require('../../packages/hkd-characters/lib/service'),service=new Service(root),before=service.snapshot(),data=structuredClone(before.data),profile=data.profiles.cavalry,horse=service.describe(profile.base,true).layers.find(layer=>layer.mount),part=profile.parts[0];
  part.layer=horse.uuid;part.slot=horse.json.slots[0].name;part.bone=horse.json.slots[0].bone;part.hideSlots=[];
  assert.throws(()=>service.change({version:service.version,data}),/equipment belongs to the rider/);assert.deepEqual(service.snapshot(),before);
});
test('drag labels update continuously, support fine control, cancel cleanly and commit once on release',()=>{
  const values=[],commits=[],classes=new Set();let capture=null;
  const label={classList:{add:n=>classes.add(n),remove:n=>classes.delete(n)},focus(){},setPointerCapture:id=>capture=id,hasPointerCapture:id=>capture===id,releasePointerCapture:()=>{capture=null;}},input={value:'1',disabled:false};
  Scrub.install(label,input,{step:.05,min:.01,max:20,scale:true,preview:n=>values.push(n),commit:()=>commits.push(input.value)});
  const event=(x,extra={})=>({pointerId:2,button:0,clientX:x,preventDefault(){},...extra});
  label.onpointerdown(event(100));label.onpointermove(event(120));assert.equal(Number(input.value),2);assert.equal(commits.length,0);label.onpointermove(event(120,{shiftKey:true}));assert.equal(Number(input.value),1.1);label.onpointerup();assert.equal(commits.length,1);
  label.onpointerdown(event(100));label.onpointermove(event(140));label.onkeydown({key:'Escape',preventDefault(){}});assert.equal(Number(input.value),1.1);assert.equal(commits.length,1);assert.equal(capture,null);assert(values.length>=3);
});

test('history can finish a label drag once before replacing the inspector',()=>{
  let commits=0,cancels=0,capture=null;
  const label={classList:{add(){},remove(){}},focus(){},setPointerCapture:id=>capture=id,hasPointerCapture:id=>capture===id,releasePointerCapture:()=>{capture=null;}},input={value:'1',disabled:false};
  const cancel=Scrub.install(label,input,{step:1,min:-100,max:100,preview(){},commit(){commits++;},cancel(){cancels++;}});
  label.onpointerdown({button:0,pointerId:3,clientX:10,preventDefault(){}});
  label.onpointermove({pointerId:3,clientX:20});cancel.commit();
  assert.equal(input.value,'11');assert.equal(commits,1);assert.equal(capture,null);
  label.onpointerup();label.onlostpointercapture();cancel();cancel.commit();
  assert.equal(commits,1);assert.equal(cancels,0,'late capture events must not undo a restored draft');
});
