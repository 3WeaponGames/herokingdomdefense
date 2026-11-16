'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),test=require('node:test');
const {environment,Node}=require('../navigation/runtime-harness.cjs');
const root=path.resolve(__dirname,'../..'),source=fs.readFileSync(path.join(root,'assets/_script/KinghtFallDepthView.js'),'utf8');
function fixture(slots,options={}){
    const e=environment(),exports={},main=new Node('main'),node=new Node('art',main);
    if(options.native){e.cc.sys={isNative:true};e.cc.ENGINE_VERSION=options.version||'2.4.13';}
    vm.runInNewContext(source,{exports,cc:e.cc,sp:{},spine:options.nativeSpine});
    const skeleton={drawOrder:slots,bones:slots.map(s=>s.bone),updateWorldTransform(){}},renderer={node,_skeleton:skeleton,skeletonData:{skeletonJson:{}}};
    return {...exports,main,node,renderer,skeleton,cc:e.cc};
}
function bone(x=0,y=0){return{a:1,b:0,c:0,d:1,worldX:x,worldY:y,active:true,data:{name:'body'}};}
function region(width=20,height=40,alpha=1){return{getOffset:()=>[0,0,0,height,width,height,width,0],getColor:()=>({a:alpha})};}
function slot(name,attachment,alpha=1,y=0){return{data:{name},bone:bone(0,y),color:{a:alpha},deform:[],getDeform(){return this.deform;},getAttachment:()=>attachment};}
const plain=value=>JSON.parse(JSON.stringify(value));

function nativeFixture(){
    const body=slot('Body',region()),empty=slot('Unused',null),shadow=slot('Shadow',region(500,500)),slots=[body,empty,shadow],f=fixture(slots,{native:true});
    const reads={vectors:0,drawOrder:0,data:0,bone:0,color:0,attachment:0};
    f.skeleton.getSlots=()=>{reads.vectors++;return slots.slice();};
    Object.defineProperty(f.skeleton,'drawOrder',{get(){reads.drawOrder++;return slots.slice().reverse();}});
    f.renderer._nativeSkeleton={getSkeleton:()=>f.renderer._skeleton};
    for(const s of slots){
        s.attachment=s.getAttachment();s.getAttachment=()=>{reads.attachment++;return s.attachment;};
        s.getData=()=>{reads.data++;return s.data;};s.getBone=()=>{reads.bone++;return s.bone;};s.getColor=()=>{reads.color++;return s.color;};
    }
    return {...f,body,empty,shadow,slots,reads};
}

test('native health anchors ignore hidden hit/death art, shadows, effects and transparent attachments without changing the rig',()=>{
    const slots=[slot('Body',region()),slot('Hit',region(40,500),0),slot('Dead/Ghost',region(50,900)),slot('Shadow',region(400,200)),slot('__fx/aura',region(300,700)),slot('hidden-part',region(20,1000,0)),slot('Collision bounds',{getVertices:()=>[0,0,500,0,500,800,0,800],getWorldVerticesLength:()=>8})];
    const f=fixture(slots),before=slots.map(s=>({bone:{...s.bone},alpha:s.color.a,attachment:s.getAttachment()}));
    assert.deepEqual(plain(f.unitBounds(f.renderer,f.main)),{minX:0,minY:0,maxX:20,maxY:40});
    slots[0].bone.worldY=12;assert.equal(f.unitBounds(f.renderer,f.main).maxY,52,'a changed animated pose was cached');
    slots[0].bone.worldY=0;
    slots.forEach((s,i)=>{assert.deepEqual(s.bone,before[i].bone);assert.equal(s.color.a,before[i].alpha);assert.equal(s.getAttachment(),before[i].attachment);});
    slots[0].bone.active=false;assert.equal(f.unitBounds(f.renderer,f.main),null,'inactive body art supplied a stale anchor');
});

test('native unweighted and weighted meshes support animated deform data in health anchors',()=>{
    const vertices=new Float32Array([0,0,1,10,0,1,0,20,1]),uvs=[0,0,1,0,0,1],triangles=[0,1,2];
    const attachment={getVertices:()=>vertices,getWorldVerticesLength:()=>6,getUVs:()=>uvs,getTriangles:()=>triangles,getName:()=> 'triangle',getColor:()=>({a:1})};
    const body=slot('Body',attachment),f=fixture([body]);
    f.skeleton.skin={name:'default'};f.renderer.skeletonData.skeletonJson={bones:[{name:'body'}],skins:[{name:'default',attachments:{Body:{triangle:{type:'mesh',uvs,triangles,vertices:[1,0,0,0,1,1,0,10,0,1,1,0,0,20,1]}}}}]};
    assert.equal(f.unitBounds(f.renderer,f.main).maxY,20);
    body.deform=[0,0,0,0,0,15];assert.equal(f.unitBounds(f.renderer,f.main).maxY,35);
    attachment.getVertices=()=>[0,0,10,0,0,20];body.deform=[0,0,10,0,0,27];assert.equal(f.unitBounds(f.renderer,f.main).maxY,27);
});

test('health anchor coordinates include renderer and parent transforms',()=>{
    const body=slot('Body',region()),f=fixture([body]);f.node.scaleX=-2;f.node.scaleY=.5;f.node.setPosition(30,10);
    assert.deepEqual(plain(f.unitBounds(f.renderer,f.main)),{minX:-10,minY:10,maxX:30,maxY:30});
    f.node.active=false;assert.equal(f.unitBounds(f.renderer,f.main),null);
});

test('native health bounds read each used bone matrix once per exact pose evaluation',()=>{
    const shared=bone(),left=slot('Body',region()),right=slot('Armor',region(30,50));left.bone=right.bone=shared;
    const f=fixture([left,right]);let reads=0;
    for(const field of ['a','b','c','d','worldX','worldY']){
        let value=shared[field];Object.defineProperty(shared,field,{get(){reads++;return value;},set(next){value=next;}});
    }
    Object.defineProperty(f.skeleton,'bones',{get(){throw Error('region bounds copied the entire native bone array');}});
    for(let frame=0;frame<60;frame++){
        shared.worldY=frame;
        assert.deepEqual(plain(f.unitBounds(f.renderer,f.main)),{minX:0,minY:frame,maxX:30,maxY:frame+50});
    }
    assert.equal(reads,60*6,'native getters scaled with vertices instead of the two regions shared bone');
    shared.worldY=100;assert.equal(f.unitBounds(f.renderer,f.main).maxY,150,'two evaluations within one frame reused stale pose values');
});

test('native health bounds skip unused slot metadata and excluded-art bone getters while checking attachments each time',()=>{
    const visible=slot('Body',region()),empty=Array.from({length:40},(_,i)=>slot('Unused/'+i,null));
    const excluded=['Shadow','Dead/Ghost','Body/Shadow','__fx/aura'].map(name=>slot(name,region(200,900)));
    const f=fixture([visible,...empty,...excluded]),reads={attachment:0,data:0,bone:0,color:0};
    let chosen=null,include=false;
    for(const s of empty){
        s.getAttachment=()=>{reads.attachment++;return s===empty[0]?chosen:null;};
        const originalData=s.data,originalBone=s.bone,originalColor=s.color;
        for(const [field,value]of [['data',originalData],['bone',originalBone],['color',originalColor]]){
            Object.defineProperty(s,field,{get(){if(s!==empty[0]||!include)throw Error('empty slot read native '+field);reads[field]++;return value;}});
        }
    }
    for(const s of excluded)for(const field of ['bone','color'])Object.defineProperty(s,field,{get(){throw Error('excluded art read native '+field);}});
    for(let frame=0;frame<60;frame++)assert.equal(f.unitBounds(f.renderer,f.main).maxY,40);
    assert.equal(reads.attachment,40*60,'empty attachments must still be queried to catch newly equipped parts');
    assert.equal(reads.data,0);assert.equal(reads.bone,0);assert.equal(reads.color,0);
    include=true;chosen=region(20,70);assert.equal(f.unitBounds(f.renderer,f.main).maxY,70,'newly visible equipment was skipped');
    assert.equal(reads.data,1);assert.equal(reads.bone,1);assert.equal(reads.color,1);
    include=false;chosen=null;assert.equal(f.unitBounds(f.renderer,f.main).maxY,40,'removed equipment retained its old bounds');
});

test('verified native health bounds retain immutable slot handles while all current visibility and pose values stay live',()=>{
    const f=nativeFixture();
    for(let i=0;i<60;i++){f.body.bone.worldY=i;assert.equal(f.unitBounds(f.renderer,f.main).maxY,i+40);}
    assert.equal(f.reads.vectors,1);assert.equal(f.reads.drawOrder,0,'verified native slots copied the entire animated drawOrder each pose');
    assert.equal(f.reads.data,2,'only the first visible and excluded slot need immutable metadata');assert.equal(f.reads.bone,1);assert.equal(f.reads.color,1);
    assert.equal(f.reads.attachment,60*3,'attachment changes must be detected every evaluation');
    f.body.color.a=0;assert.equal(f.unitBounds(f.renderer,f.main),null);f.body.color.a=1;
    f.body.bone.active=false;assert.equal(f.unitBounds(f.renderer,f.main),null);f.body.bone.active=true;
    f.body.attachment=null;assert.equal(f.unitBounds(f.renderer,f.main),null);
    f.empty.attachment=region(20,150);assert.equal(f.unitBounds(f.renderer,f.main).maxY,150);assert.equal(f.reads.bone,2);
    f.empty.attachment.getOffset=()=>[0,0,0,180,20,180,20,0];assert.equal(f.unitBounds(f.renderer,f.main).maxY,180,'attachment geometry was cached');
    f.empty.attachment.getColor=()=>({a:0});assert.equal(f.unitBounds(f.renderer,f.main),null,'attachment alpha was cached');
});

test('native health slot plans retire on skeleton, native handle, data, JSON and version changes',()=>{
    for(const change of ['skeleton','native','data','json','version','identity']){
        const f=nativeFixture();f.unitBounds(f.renderer,f.main);const original=f.reads.vectors;
        if(change==='skeleton'){const next=slot('New body',region(30,125));for(const name of ['Data','Bone','Color'])next['get'+name]=()=>next[name.toLowerCase()];f.renderer._skeleton={drawOrder:[next],getSlots:()=>[next],updateWorldTransform(){}};}
        if(change==='native')f.renderer._nativeSkeleton={getSkeleton:()=>f.renderer._skeleton};
        if(change==='data')f.renderer.skeletonData={skeletonJson:{}};
        if(change==='json')f.renderer.skeletonData.skeletonJson={};
        if(change==='version')f.cc.ENGINE_VERSION='2.4.14';
        if(change==='identity')f.renderer._nativeSkeleton.getSkeleton=()=>({});
        assert.equal(f.unitBounds(f.renderer,f.main).maxY,change==='skeleton'?125:40,change);
        if(['native','data','json'].includes(change))assert.equal(f.reads.vectors,original+1,change+' retained stale slot handles');
        if(['version','identity'].includes(change))assert(f.reads.drawOrder>0,change+' used an unverified native plan');
    }
});

test('unknown native health APIs and browser arrays keep dynamic public slot traversal',()=>{
    for(const change of ['getSlots','getBone','getColor','getData','version','web']){
        const f=nativeFixture();
        if(change==='getSlots')f.skeleton.getSlots=()=>null;
        if(['getBone','getColor','getData'].includes(change))f.body[change]=null;
        if(change==='version')f.cc.ENGINE_VERSION='2.4.12';
        if(change==='web')f.cc.sys.isNative=false;
        assert.equal(f.unitBounds(f.renderer,f.main).maxY,40,change);
        f.body.bone=bone(0,30);assert.equal(f.unitBounds(f.renderer,f.main).maxY,70,change+' cached a mutable browser/unsupported bone');
        assert(f.reads.drawOrder>=2,change+' omitted its public fallback');
    }
});

test('verified native attachment colors retain handles while alpha, attachments and rig lifetimes stay current',()=>{
    let colorReads=0;
    class Color{constructor(a=1){this.a=a;}}
    class RegionAttachment{
        constructor(){this.value=new Color();}
        getColor(){colorReads++;return this.value;}
        getOffset(){return[0,0,0,50,20,50,20,0];}
    }
    class MeshAttachment{
        constructor(){this.value=new Color();}
        getColor(){colorReads++;return this.value;}
        getVertices(){return[0,0,20,0,0,70];}
        getTriangles(){return[0,1,2];}
        getWorldVerticesLength(){return 6;}
    }
    const nativeSpine={Color,RegionAttachment,MeshAttachment},body=slot('Body',null),f=fixture([body],{native:true,nativeSpine});
    body.attachment=new RegionAttachment();body.getAttachment=()=>body.attachment;
    body.getData=()=>body.data;body.getBone=()=>body.bone;body.getColor=()=>body.color;
    f.skeleton.getSlots=()=>[body];f.renderer._nativeSkeleton={getSkeleton:()=>f.renderer._skeleton};
    for(let i=0;i<60;i++)assert.equal(f.unitBounds(f.renderer,f.main).maxY,50);assert.equal(colorReads,1);
    body.attachment.value.a=0;assert.equal(f.unitBounds(f.renderer,f.main),null);assert.equal(colorReads,1,'alpha reads should use the live native Color handle');
    body.attachment.value.a=1;body.attachment=new MeshAttachment();assert.equal(f.unitBounds(f.renderer,f.main).maxY,70);assert.equal(colorReads,2);
    body.attachment.value.a=0;assert.equal(f.unitBounds(f.renderer,f.main),null);assert.equal(colorReads,2);
    body.attachment.value.a=1;f.renderer.skeletonData={skeletonJson:{}};assert.equal(f.unitBounds(f.renderer,f.main).maxY,70);assert.equal(colorReads,3,'replaced data retained the previous plan Color handle');
    f.renderer._nativeSkeleton={getSkeleton:()=>f.renderer._skeleton};assert.equal(f.unitBounds(f.renderer,f.main).maxY,70);assert.equal(colorReads,4,'replaced native handle retained the previous plan Color handle');
    let alpha=0;body.attachment.getColor=()=>{colorReads++;return new Color(alpha);};
    assert.equal(f.unitBounds(f.renderer,f.main),null);alpha=1;assert.equal(f.unitBounds(f.renderer,f.main).maxY,70);assert.equal(colorReads,6,'custom native getter was cached');
    body.attachment={getColor:()=>new Color(alpha),getOffset:()=>[0,0,0,80,20,80,20,0]};
    alpha=0;assert.equal(f.unitBounds(f.renderer,f.main),null);alpha=1;assert.equal(f.unitBounds(f.renderer,f.main).maxY,80,'unknown attachment getter did not stay dynamic');
    body.attachment=new RegionAttachment();f.renderer._nativeSkeleton.getSkeleton=()=>({});
    const beforeFallback=colorReads;f.unitBounds(f.renderer,f.main);f.unitBounds(f.renderer,f.main);assert.equal(colorReads,beforeFallback+2,'unknown native identity used cached attachment Color');
});

test('native weighted bounds reuse only matrix snapshots and still read current deform, attachment and rig data',()=>{
    const vertices=new Float32Array([0,0,1,10,0,1,0,20,1]),uvs=[0,0,1,0,0,1],triangles=[0,1,2];
    const attachment={getVertices:()=>vertices,getWorldVerticesLength:()=>6,getUVs:()=>uvs,getTriangles:()=>triangles,getBones:()=>[1,0,1,0,1,0],getColor:()=>({a:1})};
    let chosen=attachment;const body=slot('Body',attachment),f=fixture([body]);body.getAttachment=()=>chosen;
    let reads=0;
    for(const field of ['a','b','c','d','worldX','worldY']){
        let value=body.bone[field];Object.defineProperty(body.bone,field,{get(){reads++;return value;},set(next){value=next;}});
    }
    assert.equal(f.unitBounds(f.renderer,f.main).maxY,20);assert.equal(reads,6);
    body.deform=[0,0,0,0,0,15];assert.equal(f.unitBounds(f.renderer,f.main).maxY,35);assert.equal(reads,12);
    body.color.a=0;assert.equal(f.unitBounds(f.renderer,f.main),null);assert.equal(reads,12,'hidden art read native matrices');
    body.color.a=1;chosen=region(10,60);assert.equal(f.unitBounds(f.renderer,f.main).maxY,60);
    chosen=null;assert.equal(f.unitBounds(f.renderer,f.main),null,'removed attachment retained its old bounds');
    chosen=region(10,25);body.bone=bone(0,80);f.renderer._skeleton={drawOrder:[body],bones:[body.bone],updateWorldTransform(){}};
    assert.equal(f.unitBounds(f.renderer,f.main).maxY,105,'replacement native rig reused a previous bone handle');
});

test('native weighted health bounds isolate two transformed bones and refresh their current pose',()=>{
    const first=Object.assign(bone(10,20),{a:0,b:-2,c:1,d:0}),second=Object.assign(bone(-5,3),{a:-1,b:.5,c:.25,d:2});
    const sourceVertices=[2,1,.75,4,-2,.25,6,3,.4,-2,5,.6,-1,7,.2,8,2,.8],vertices=new Float64Array(sourceVertices);
    const attachment={getVertices:()=>vertices,getWorldVerticesLength:()=>6,getUVs:()=>[0,0,1,0,0,1],getTriangles:()=>[0,1,2],getBones:()=>[2,0,1,2,0,1,2,0,1],getColor:()=>({a:1})};
    const body=slot('Body',attachment);body.bone=first;body.deform=[1,-1,-2,1,0,2,3,-2,-1,0,0,4];
    const originalDeform=[...body.deform],f=fixture([body]);f.skeleton.bones=[first,second];let reads=0;
    for(const current of [first,second])for(const field of ['a','b','c','d','worldX','worldY']){
        let value=current[field];Object.defineProperty(current,field,{get(){reads++;return value;},set(next){value=next;}});
    }
    const rounded=box=>Object.fromEntries(Object.entries(box).map(([key,value])=>[key,Number(value.toFixed(6))]));
    // The independent weighted triangle points are (5.625,17.625),
    // (-2.7,15.95) and (-8.8,17.2), including both bones' deforms.
    assert.deepEqual(rounded(f.unitBounds(f.renderer,f.main)),{minX:-8.8,minY:15.95,maxX:5.625,maxY:17.625});
    assert.equal(reads,12,'each of the two native matrices should be read once, rather than once per influence');
    second.worldY=13;
    assert.deepEqual(rounded(f.unitBounds(f.renderer,f.main)),{minX:-8.8,minY:20.125,maxX:5.625,maxY:25.2});
    assert.equal(reads,24,'a second evaluation must resample both bone matrices');
    assert.deepEqual(Array.from(vertices),sourceVertices);assert.deepEqual(body.deform,originalDeform);
});

test('the hero uses the same small gap over its visible head and mount layers',()=>{
    const e=environment(),f=fixture([slot('Body',region())]),exports={},army={None:0,Friend:1,Enemy:2};
    const actor={node:f.main,isDead:()=>false,ctrPlayAni:{spAniBody:f.renderer}};
    const headNode=new Node('head',f.main),head={node:headNode,skeletonData:{},_skeleton:{drawOrder:[slot('Helmet',region(20,60))],updateWorldTransform(){}}};
    actor.ctrPlayAni.spAniHead=head;
    vm.runInNewContext(fs.readFileSync(path.join(root,'assets/_script/KinghtFallItemHp.js'),'utf8'),{
        exports,cc:{...e.cc,Component:function(){},Sprite:function(){},Label:function(){}},sp:{Skeleton:function(){}},
        require:name=>name==='KinghtFallDepthView'?f:name==='KinghtFallModle'?{KinghtFallGameArmy:army}:{default:{instance:{ctrGame:e.game}}},
        __extends(C,B){C.prototype=Object.create(B.prototype);},__decorate:(_d,value,key)=>key===undefined?value:undefined
    });
    const hp=new exports.default();hp.node=new Node('hero bar',f.main);hp.node.width=64;hp.node.height=10;e.game.ctrPlay={ctrHp:hp};
    hp.setType(army.Friend,actor);hp.lateUpdate();assert.equal(hp.node.y-hp.node.height/2-60,4);
    headNode.active=false;hp.lateUpdate();assert.equal(hp.node.y-hp.node.height/2-40,4,'a hidden hero layer kept the old height');
});

let spine,engineIssue;
try{spine=require(require('../../packages/game-data-editor/lib/unit-assets').enginePath());}catch(error){engineIssue=error.message;}
test('the authored turtle has matching visible health bounds in Browser and native-style attachment bindings',{skip:engineIssue||false},()=>{
    const layer=require('../../packages/hkd-characters/lib/unit-library').describe(root,'monster1/Turtle_Alligator',true).layers[0];
    const atlas=new spine.TextureAtlas(layer.atlas,name=>{const bytes=fs.readFileSync(require('node:url').fileURLToPath(layer.pages[name]));return new spine.FakeTexture({width:bytes.readUInt32BE(16),height:bytes.readUInt32BE(20)});});
    const data=new spine.SkeletonJson(new spine.AtlasAttachmentLoader(atlas)).readSkeletonData(layer.json),skeleton=new spine.Skeleton(data);skeleton.setSkinByName(layer.skin);skeleton.setToSetupPose();
    const clip=data.findAnimation('idle');clip.apply(skeleton,0,0,false,null,1,spine.MixBlend.replace,spine.MixDirection.mixIn);skeleton.updateWorldTransform();
    const f=fixture([]);f.renderer._skeleton=skeleton;f.renderer.skeletonData.skeletonJson=layer.json;
    for(const time of [0,.25,.75]){
        clip.apply(skeleton,0,time,true,null,1,spine.MixBlend.replace,spine.MixDirection.mixIn);skeleton.updateWorldTransform();
        const web=f.unitBounds(f.renderer,f.main);
        const nativeSlots=skeleton.drawOrder.map(s=>{const a=s.getAttachment();return{data:s.data,bone:s.bone,color:s.color,getAttachment:()=>a&&({getOffset:()=>a.offset,getColor:()=>a.color})};});
        f.renderer._skeleton={drawOrder:nativeSlots,updateWorldTransform(){}};
        const native=f.unitBounds(f.renderer,f.main);assert.deepEqual(plain(native),plain(web));
        assert(native.maxY>0&&native.maxY<400);
        f.renderer._skeleton=skeleton;
    }
});
