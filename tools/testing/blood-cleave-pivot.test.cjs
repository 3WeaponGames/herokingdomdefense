'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const Settings=require('../../assets/_script/HeroSkillSettings'),Authoring=require('../../assets/_script/HeroSkillAuthoring'),Layout=require('../../assets/_script/HeroSkillVFXLayout'),Projectile=require('../../assets/_script/HeroSkillProjectile');
const Gizmos=require('../../packages/hkd-skills/preview-gizmos'),{SkillService,FILES}=require('../../packages/hkd-skills/service');
const Prepare=require('../skills-vfx/prepare-sp162.cjs'),PNG=require('../../packages/hkd-characters/lib/png-atlas');
const clone=value=>JSON.parse(JSON.stringify(value)),near=(a,b)=>assert(Math.abs(a-b)<1e-7,`${a} != ${b}`);
const slots=['cast','castSecondary'],origin={x:17,y:83};
function customVisual(){
 const visual=Settings.defaults('bruiser').visual;
 for(const [i,slot] of slots.entries())Settings.applyClip(visual,slot+'Resource',Layout.clipFor(['guardian-sp162-gold-shield','mystic-charged-burst'][i]));
 return visual;
}
function place(visual,slot,direction){
  return Layout.entities({entities:[{key:slot,slot,style:'bruiser',phase:'once',age:.3,scale:1,opacity:1,origin,direction,radius:175}]},visual,{style:'bruiser',hero:{x:0,y:0}})[0];
}
function basis(entity){const a=entity.angle*Math.PI/180,s=entity.visual.scale*entity.scale;return{x:{x:Math.cos(a)*s*entity.scaleX,y:Math.sin(a)*s*entity.scaleX},y:{x:-Math.sin(a)*s*entity.scaleY,y:Math.cos(a)*s*entity.scaleY}};}
function point(entity,p){const b=basis(entity);return{x:entity.x+b.x.x*p.x+b.y.x*p.y,y:entity.y+b.x.y*p.x+b.y.y*p.y};}
const sourcePoints=new Map();let spine;
function meshPoints(clip){
  if(sourcePoints.has(clip.id))return sourcePoints.get(clip.id);spine=spine||Prepare.runtime();
  const file=path.resolve(__dirname,'../../assets/resources',clip.resource+'.json'),source=JSON.parse(fs.readFileSync(file,'utf8')),atlas=new spine.TextureAtlas(fs.readFileSync(file.replace(/\.json$/,'.atlas'),'utf8'),name=>new spine.FakeTexture(PNG.decode(fs.readFileSync(path.join(path.dirname(file),name))))),data=new spine.SkeletonJson(new spine.AtlasAttachmentLoader(atlas)).readSkeletonData(source),points=[];
  for(const time of [.2,.4,.6])for(const piece of Prepare.pose(spine,data,clip.animation,time))if(piece.color.a>0)for(let i=0;i<piece.vertices.length;i+=2)points.push({x:piece.vertices[i],y:piece.vertices[i+1]});
  assert(points.length>4,'Exercise real imported Spine vertices');sourcePoints.set(clip.id,points);return points;
}

test('both cleaves expose independent pivot/flip fields and use neutral transforms by default',()=>{
  const settings=Settings.defaults('bruiser'),fields=Authoring.fields('bruiser','active',Settings.fields('bruiser'),settings).visual;
  for(const slot of slots){
    for(const suffix of ['PivotX','PivotY','FlipX','FlipY']){
      const field=fields.find(row=>row.path==='visual.'+slot+suffix);assert(field);assert.equal(field.type,suffix.startsWith('Pivot')?'number':'boolean');assert.equal(Settings.valid(field,suffix.startsWith('Pivot')?12:true),true);assert.equal(Settings.valid(field,suffix.startsWith('Pivot')?Infinity:1),false);
    }
    assert.equal(settings.visual[slot+'PivotX'],0);assert.equal(settings.visual[slot+'PivotY'],0);assert.equal(settings.visual[slot+'FlipX'],false);assert.equal(settings.visual[slot+'FlipY'],false);
    for(const id of ['', '12345678-1234-4234-8234-123456789012']){
      const saved={HeroSkills:{bruiser:{visual:{[slot+'Resource']:id}}}},before=JSON.stringify(saved);
      assert.equal(Settings.effective('bruiser',saved).visual[slot+'FlipX'],false);assert.equal(JSON.stringify(saved),before);
      saved.HeroSkills.bruiser.visual[slot+'FlipX']=true;assert.equal(Settings.effective('bruiser',saved).visual[slot+'FlipX'],true);
    }
    assert.equal(Settings.effective('bruiser',{HeroSkills:{bruiser:{visual:{[slot+'FlipX']:false}}}}).visual[slot+'FlipX'],false);
  }
  for(const style of Settings.styles.filter(row=>row.id!=='bruiser'))assert(!Settings.fields(style.id).visual.some(field=>/(Pivot|Flip)[XY]$/.test(field.key)));
});

test('the chosen source pivot stays on the captured hit origin at every aim angle with independent flips and anisotropic scales',()=>{
  const visual=customVisual();
  Object.assign(visual,{castPivotX:37,castPivotY:-22,castScale:.8,castScaleX:1.4,castScaleY:.65,castRotation:31,castOffsetX:7,castOffsetY:-3,castSecondaryPivotX:-48,castSecondaryPivotY:23,castSecondaryScale:1.2,castSecondaryScaleX:.7,castSecondaryScaleY:1.5,castSecondaryRotation:-17});
  const gameplay=Projectile.area('bruiser',origin,visual,{x:1,y:0},175);
  for(const degrees of [-180,-135,-90,-45,0,45,90,135])for(const flipX of [false,true])for(const flipY of [false,true])for(const slot of slots){
    visual[slot+'FlipX']=flipX;visual[slot+'FlipY']=flipY;
    const a=degrees*Math.PI/180,entity=place(visual,slot,{x:Math.cos(a),y:Math.sin(a)}),pivot=point(entity,{x:(entity.clip.sourceCenterX||0)+visual[slot+'PivotX'],y:(entity.clip.sourceCenterY||0)+visual[slot+'PivotY']});
    near(pivot.x,origin.x+visual[slot+'OffsetX']);near(pivot.y,origin.y+visual[slot+'OffsetY']);near(entity.pivotX,pivot.x);near(entity.pivotY,pivot.y);
  }
  assert.deepEqual(Projectile.area('bruiser',origin,visual,{x:1,y:0},175),gameplay,'Artwork pivots/flips never change the hit indicator or collision geometry');
});

test('pivot dragging keeps every imported mesh vertex stationary and leaves the other layer untouched',()=>{
  for(const slot of slots)for(const degrees of [-143,-43,47,137])for(const flipX of [false,true])for(const flipY of [false,true]){
    const settings=Settings.defaults('bruiser');settings.visual=customVisual();Object.assign(settings.visual,{[slot+'Scale']:.73,[slot+'ScaleX']:1.37,[slot+'ScaleY']:.62,[slot+'Rotation']:23,[slot+'FlipX']:flipX,[slot+'FlipY']:flipY});
    const a=degrees*Math.PI/180,direction={x:Math.cos(a),y:Math.sin(a)},before=place(settings.visual,slot,direction),other=slots.find(value=>value!==slot),otherBefore=place(settings.visual,other,direction),mapping=Authoring.transform('bruiser','active',slot,settings.visual),paths={...mapping};delete paths.id;delete paths.label;
    const spec={origin:{x:before.pivotX,y:before.pivotY},paths,values:settings,limits:Object.fromEntries(Settings.descriptors('bruiser').map(field=>[field.path,field])),pivotBasis:basis(before)},drag=Gizmos.update(Gizmos.begin(spec,'pivot',spec.origin),{x:spec.origin.x+27,y:spec.origin.y-19});
    assert.equal(Object.keys(drag.patches).length,4);
    for(const [key,value]of Object.entries(drag.patches))Settings.set(settings,key,value);
    const after=place(settings.visual,slot,direction);
    for(const p of meshPoints(before.clip)){const first=point(before,p),next=point(after,p);near(first.x,next.x);near(first.y,next.y);}
    assert.deepEqual(place(settings.visual,other,direction),otherBefore);
    assert(Math.hypot(after.pivotX-before.pivotX,after.pivotY-before.pivotY)>30);
  }
});

test('a pivot drag at an offset limit stays within bounds while preserving the painted position',()=>{
  const paths={pivotX:'px',pivotY:'py',x:'x',y:'y'},spec={origin:{x:4095,y:0},paths,values:{px:0,py:0,x:4095,y:0},limits:{x:{min:-4096,max:4096}},pivotBasis:{x:{x:-2,y:0},y:{x:0,y:.5}}};
  const next=Gizmos.update(Gizmos.begin(spec,'pivot',spec.origin),{x:4105,y:8});assert.equal(next.applied.x,4096);near(next.applied.x+2*next.applied.px,4095);near(next.applied.y-.5*next.applied.py,0);
});

test('pivot and flip edits remain one undoable draft, persist on explicit save and preserve both config mirrors',t=>{
  const folder=fs.mkdtempSync(path.join(os.tmpdir(),'hkd-cleave-pivot-'));t.after(()=>{assert.equal(path.dirname(path.resolve(folder)),path.resolve(os.tmpdir()));assert(path.basename(folder).startsWith('hkd-cleave-pivot-'));fs.rmSync(folder,{recursive:true,force:true});});
  for(const [i,relative]of FILES.entries()){const file=path.join(folder,relative);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify({GameTools:{timings:{keep:i},timingDefaults:{keep:i}},HeroSkills:{bruiser:{visual:{castScaleX:1.7,castSecondaryScaleY:.65,future:{keep:i}}}}}));}
  const bytes=()=>FILES.map(relative=>fs.readFileSync(path.join(folder,relative),'utf8')),before=bytes(),service=new SkillService(folder,{catalogs:{vfx:[],audio:[],projectiles:[]}}),request=extra=>({version:service.version,revision:service.revision,...extra});
  assert.equal(service.save(request()).result.saved,false);assert.deepEqual(bytes(),before);
  const changes=[{path:'visual.castPivotX',value:25},{path:'visual.castPivotY',value:-10},{path:'visual.castOffsetX',value:5},{path:'visual.castOffsetY',value:-2}];service.change(request({style:'bruiser',changes}));assert.deepEqual(bytes(),before);service.undo(request());assert.equal(service.dirty(),false);service.redo(request());assert.equal(service.data.bruiser.visual.castPivotX,25);
  service.change(request({style:'bruiser',changes:[{path:'visual.castSecondaryPivotX',value:-36},{path:'visual.castSecondaryPivotY',value:18}]}));service.change(request({style:'bruiser',path:'visual.castFlipY',value:true}));service.change(request({style:'bruiser',path:'visual.castSecondaryFlipX',value:true}));assert.equal(service.save(request()).result.saved,true);
  for(const [i,text]of bytes().entries()){const saved=JSON.parse(text),old=JSON.parse(before[i]);assert.deepEqual(saved.GameTools,old.GameTools);assert.deepEqual(saved.HeroSkills.bruiser.visual.future,{keep:i});assert.equal(saved.HeroSkills.bruiser.visual.castScaleX,1.7);assert.equal(saved.HeroSkills.bruiser.visual.castSecondaryScaleY,.65);assert.equal(saved.HeroSkills.bruiser.visual.castSecondaryPivotX,-36);assert.equal(saved.HeroSkills.bruiser.visual.castFlipY,true);assert.equal(saved.HeroSkills.bruiser.visual.castSecondaryFlipX,true);}
  const saved=bytes();assert.equal(service.save(request()).result.saved,false);assert.deepEqual(bytes(),saved);
});
