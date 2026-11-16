'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),test=require('node:test');
const {environment,Node}=require('../navigation/runtime-harness.cjs');
const root=path.resolve(__dirname,'../..'),source=fs.readFileSync(path.join(root,'assets/_script/KinghtFallDepthView.js'),'utf8');
function fixture(slots){
    const e=environment(),exports={},main=new Node('main'),node=new Node('art',main);
    vm.runInNewContext(source,{exports,cc:e.cc,sp:{}});
    const skeleton={drawOrder:slots,bones:slots.map(s=>s.bone),updateWorldTransform(){}},renderer={node,_skeleton:skeleton,skeletonData:{skeletonJson:{}}};
    return {...exports,main,node,renderer,skeleton};
}
function bone(x=0,y=0){return{a:1,b:0,c:0,d:1,worldX:x,worldY:y,active:true,data:{name:'body'}};}
function region(width=20,height=40,alpha=1){return{getOffset:()=>[0,0,0,height,width,height,width,0],getColor:()=>({a:alpha})};}
function slot(name,attachment,alpha=1,y=0){return{data:{name},bone:bone(0,y),color:{a:alpha},deform:[],getDeform(){return this.deform;},getAttachment:()=>attachment};}
const plain=value=>JSON.parse(JSON.stringify(value));

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
