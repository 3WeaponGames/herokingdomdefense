'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{test}=require('node:test');
const root=path.resolve(__dirname,'../..'),Core=require('../../assets/_script/CharacterPartsCore'),Options=require('../../packages/hkd-characters/lib/character-options');
function fixture(){
 const names=['Rider/Body','Rider/Body/Head','Rider/Body/Head/Eye','Rider/Body/Head/Ani_Eye/Eye_Stun','Rider/Body/Head/Beard','Rider/Body/Head/Hair','Rider/Body/Head/Helmet','Rider/HandRight/Sword','Rider/Body/Head/Eyebrow','Rider/Body/Head/Mouth','Rider/Body/Head/Nose'];
 const slots=names.map(name=>({data:{name},color:{r:1,g:1,b:1,a:.7},attachment:{name},getAttachment(){return this.attachment;},setAttachment(value){this.attachment=value;}}));return{slots,drawOrder:slots.slice(),findSlot:name=>slots.find(slot=>slot.data.name===name)};
}
test('Faceless hides only eye slots, preserving beards, hair, eyebrows, mouth and nose through repeated poses',()=>{
 const s=fixture(),original=s.slots.map(slot=>slot.attachment),state=Core.prepare({},s,[],{},{},{faceless:true});
 for(let frame=0;frame<20;frame++){Core.restore(state);s.slots.forEach((slot,i)=>slot.attachment=original[i]);Core.apply(state);for(let i=0;i<s.slots.length;i++)assert.equal(s.slots[i].attachment,i===2||i===3?null:original[i]);}
 Core.restore(state);assert.deepEqual(s.slots.map(slot=>slot.attachment),original);
});
test('the default skin preset matches the reference peach while custom and non-Maker skin choices keep their values',()=>{
 assert.equal(Core.DEFAULT_SKIN_TINT,'#ffbdab');assert.equal(Options.skinTones[0].value,Core.DEFAULT_SKIN_TINT);assert.equal(Core.skinTint({base:{source:'character-maker/Character'}}),'#ffbdab');
 assert.equal(Core.skinTint({base:{source:'character-maker/Character'},skinTint:'#704a34'}),'#704a34');assert.equal(Core.skinTint({base:{type:'enemy',source:'monster1/Wolf'}}),null);
});
test('skin tint affects only exposed Maker body/head, never compounds and preserves fade alpha and original colors',()=>{
 const s=fixture(),state=Core.prepare({},s,[],{},{},{skinTint:'#cc9966'});for(let frame=0;frame<100;frame++)Core.apply(state);
 for(let i=0;i<s.slots.length;i++){const color=s.slots[i].color;assert.equal(color.r,i<2?.8:1);assert.equal(color.g,i<2?.6:1);assert.equal(color.b,i<2?.4:1);assert.equal(color.a,.7);}
 Core.restore(state);assert(s.slots.every(slot=>slot.color.r===1));s.slots[0].color.r=.5;s.slots[0].color.a=.2;Core.apply(state);assert.equal(s.slots[0].color.r,.4);assert.equal(s.slots[0].color.a,.2);
 assert.equal(Core.skinTint({base:{source:'character-maker/Character'}}),Core.DEFAULT_SKIN_TINT);assert.equal(Core.skinTint({base:{source:'monster1/Wolf'}}),null);assert.equal(Core.skinTint({base:{type:'hero'}}),null);
});
test('character library categories exclude monster pieces while retaining the complete authoring asset index',()=>{
 const Service=require('../../packages/hkd-characters/lib/service').Service,service=new Service(root),all=service.assets().parts,before=JSON.stringify(all),visible=Options.characterParts(all);
 assert(visible.length<all.length);assert(!visible.some(part=>/^Monster Pack/.test(part.category)));assert(visible.some(part=>part.sourcePack==='character-maker'));assert.equal(JSON.stringify(all),before);
 const categories=[...new Set(visible.map(Options.partCategory))];
 assert(!categories.some(category=>category.startsWith('Character Maker/')||/^Hand(?:Left|Right)\//.test(category)||category.includes('assets/')||category.endsWith('/.')));
 for(const category of ['Chest','Helmet','Shield','Sword']){
   const group=visible.filter(part=>Options.partCategory(part)===category);
   assert(group.some(part=>part.sourcePack==='character-maker'),category+' includes Maker equipment');
   assert(group.some(part=>!part.sourcePack),category+' includes existing equipment');
 }
 for(const category of ['Beard','Eye','Hair','Mount','Sub Items'])assert(categories.includes(category),category+' stays available');
 const helpers=all.filter(part=>part.sourcePack==='character-maker'&&/\/Common\/Sprites\/Other\//.test(part.image||''));assert(helpers.length>0);
 for(const helper of helpers){assert(!visible.some(part=>part.id===helper.id));assert(!Options.libraryParts(all).some(part=>part.id===helper.id));}
 assert(!categories.includes('Other'),'helper sprite group is hidden from the equipment library');
 assert.equal(JSON.stringify(all),before,'display groups do not change asset metadata or saved references');
 const sources=[{id:'character-maker/Character',pack:'character-maker'},{id:'monster1/Wolf',pack:'monster1'},{id:'monster2/Ogre',pack:'monster2'}];assert.deepEqual(Options.characterSources(sources).map(source=>source.id),['character-maker/Character']);assert.deepEqual(Options.characterSources(sources,'monster1/Wolf').map(source=>source.id),['character-maker/Character','monster1/Wolf']);
 for(const tone of Options.skinTones)assert.match(tone.value,/^#[a-f0-9]{6}$/);
 const draft=service.load().data,id=Object.keys(draft.profiles).find(id=>draft.profiles[id].base.source?.startsWith('character-maker/'));draft.profiles[id].skinTint='red';assert.throws(()=>service.validate(draft),/skin tint/);
});
test('native baked appearance keeps custom beards with eyes hidden and matches skin tint without recoloring equipment',()=>{
 const Library=require('../../packages/hkd-characters/lib/unit-library'),Bake=require('../../packages/hkd-characters/lib/native-bake'),Placement=require('../../packages/hkd-characters/lib/placement');
 const catalog=require('../../assets/resources/characters/catalog.json'),profile=JSON.parse(JSON.stringify(catalog.profiles['royal-guard'])),library=Library.load(root),assets=new Map(require('../../assets/resources/character-parts/catalog.json').parts.concat(library.parts).map(part=>[part.id,part]));
 const description=Library.describe(root,profile.base.source,true),layer=description.layers[0],beard=[...assets.values()].find(part=>/\/Character\/Beard\//.test(part.image)),socket=layer.json.slots.find(slot=>/\/Beard$/.test(slot.name));assert(beard&&socket);
 profile.parts=profile.parts.filter(part=>part.slot!==socket.name);profile.parts.push({id:'skin-test-beard',sprite:beard.id,layer:layer.uuid,slot:socket.name,bone:socket.bone,opacity:1,order:0,hideSlots:[],forceVisible:true,lockAspect:true,...Placement.intended(beard)});profile.faceless=true;profile.skinTint='#cc9966';
 const contract=require('../../assets/resources/unit-library/runtime/contracts.json').units['ally:90001:default'],out=Bake.bake(root,profile,'test_skin_tone',contract,assets,fs.readFileSync),rig=JSON.parse(out.files.get('assets/resources/unit-library/runtime/test_skin_tone.json'));
 assert.equal(rig.slots.find(slot=>slot.name==='Rider/Body/Head').color,'cc9966ff');assert(Object.keys(rig.skins[0].attachments[socket.name]).length);assert(rig.slots.find(slot=>/\/Helmet$/.test(slot.name)).color.startsWith('ffffff'));
 for(const slot of rig.slots)if(Core.isFacialSlot(slot.name))assert.equal(Object.keys(rig.skins[0].attachments[slot.name]||{}).length,0);
 for(const clip of Object.values(rig.animations))for(const [name,slot]of Object.entries(clip.slots||{}))if(Core.isSkinSlot(name))for(const frame of slot.color||[])assert.equal(frame.color.slice(0,6),'cc9966');
});
