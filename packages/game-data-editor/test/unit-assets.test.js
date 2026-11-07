'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),url=require('node:url'),vm=require('node:vm'),test=require('node:test');
const Assets=require('../lib/unit-assets'),Renderer=require('../preview/spine-renderer'),Projectile=require('../preview/projectile');
const root=path.resolve(__dirname,'../../..'),cfg=JSON.parse(fs.readFileSync(path.join(root,'assets/KinghtFallConfig/GameJsonCfg.json'),'utf8'));
let spine,runtime,engineUnavailable;
try { runtime=Assets.enginePath(); }
catch(error) { if(process.env.COCOS_ENGINE_ROOT)throw error;engineUnavailable=error.message; }
if(runtime)spine=require(runtime);
const describe=request=>Assets.describe(root,Object.assign({noRuntime:true},request));

test('actual Creator model/skin/attack/backward-seek integration for every reachable unit',{skip:engineUnavailable||false},()=>{
    function layersFor(description){return description.layers.map(d=>{const atlas=new spine.TextureAtlas(d.atlas,name=>{const png=fs.readFileSync(url.fileURLToPath(d.pages[name]));return new spine.FakeTexture({width:png.readUInt32BE(16),height:png.readUInt32BE(20)});});const data=new spine.SkeletonJson(new spine.AtlasAttachmentLoader(atlas)).readSkeletonData(d.json),skeleton=new spine.Skeleton(data);assert(data.findSkin(d.skin),'skin '+d.skin);skeleton.setSkinByName(d.skin);return{description:d,data,skeleton,atlas};});}
    function coordinates(layers){return layers.map(l=>Renderer.geometry(spine,l).map(g=>Array.from(g.vertices)));}
    for(const type of ['enemy','ally','hero'])for(const id of type==='hero'?['hero']:Object.keys(cfg.SoldierCfg).filter(id=>type==='enemy'||Number(id)<=90004)){
        const description=describe({type,id}),layers=layersFor(description);assert(layers.length>0);
        Renderer.seek(spine,layers,'attack',0,false);const zero=coordinates(layers);assert(zero.some(layer=>layer.length>0));
        Renderer.seek(spine,layers,'attack',.5,false);assert.notDeepEqual(coordinates(layers),zero,'attack pose changes '+type+id);
        Renderer.seek(spine,layers,'attack',0,false);assert.deepEqual(coordinates(layers),zero,'backward seek is deterministic '+type+id);
        const box=Renderer.bounds(spine,layers);assert(box.width>0&&box.height>0&&isFinite(box.width));
        if(type==='hero')assert.equal(layers.length,7);
    }
});
test('unit metadata, shared assets, boss forms, equipment and path checks do not require Creator',()=>{
    const enemy=describe({type:'enemy',id:90001}),ally=describe({type:'ally',id:90001});
    assert.equal(enemy.layers[0].source,ally.layers[0].source);assert.notEqual(enemy.layers[0].skin,ally.layers[0].skin);assert(enemy.shared.length>0);
    const boss=[90010,90011,90012].map(id=>describe({type:'enemy',id}));assert.equal(new Set(boss.map(d=>d.key)).size,3);assert.equal(new Set(boss.map(d=>d.layers[0].source)).size,3);
    const hero=describe({type:'hero',id:'hero',heroLevels:{1:5}});assert.equal(hero.equipment.find(x=>x.id===1).level,5);assert.equal(hero.runtimePath,null);
    assert.throws(()=>describe({type:'enemy',id:90001,record:{prefab:'../../outside'}}),/Invalid/);
    for(const id of [90003,90005,90008]){const description=describe({type:'enemy',id});const a=Projectile.simulate(description.projectile,250,60),b=Projectile.simulate(description.projectile,500,60);assert(a.time>0&&b.time>a.time);assert.deepEqual(a,Projectile.simulate(description.projectile,250,60));}
});
test('Enemy08 projectile diagnostic follows actual dt movement and target capping at different frame rates',()=>{
    const source=fs.readFileSync(path.join(root,'assets/_script/KinghtFallBulletEnemy8.js'),'utf8'),start=source.indexOf('_ctor.prototype.onUpdate = function'),end=source.indexOf('\n  };',start);
    assert(start>=0&&end>start);const body=source.slice(source.indexOf('function',start),end+4).trim().replace(/;$/,'');
    function vec(){return{x:0,y:0,len(){return Math.hypot(this.x,this.y);}};}
    const cc={isValid:()=>true,Vec2:{RIGHT:{signAngle:()=>0},subtract(o,a,b){o.x=a.x-b.x;o.y=a.y-b.y;},normalize(o,a){const d=Math.hypot(a.x,a.y);o.x=a.x/d;o.y=a.y/d;},multiplyScalar(o,a,k){o.x=a.x*k;o.y=a.y*k;},add(o,a,b){o.x=a.x+b.x;o.y=a.y+b.y;}}};
    const update=vm.runInNewContext('('+body+')',{cc,isFinite}),settings=describe({type:'enemy',id:90008}).projectile;
    assert.equal(settings.directHoming,true);
    for(const fps of [5,30,60,120]){
        const actor={state:0,speed:settings.speed,tagNode:{getPosition(o){o.x=600;o.y=0;}},tagPos:vec(),vec2_1:vec(),vec2_2:vec(),_dir:vec(),targetIsLive:()=>true,onDie(){this.state=1;},node:{x:0,y:0,getPosition(o){o.x=this.x;o.y=this.y;},setPosition(p){this.x=p.x;this.y=p.y;}}};
        let frames=0;while(actor.state===0&&frames<3600){update.call(actor,1/fps);frames++;}
        const preview=Projectile.simulate(settings,600,fps);assert.notEqual(preview.time,null);assert.equal(actor.state,1);
        assert(Math.abs(preview.time-frames/fps)<=1/fps+1e-9,'actual impact agrees within one update at '+fps+'fps');
        assert(preview.points.every(p=>p.x<=600+1e-9),'direct movement cannot overshoot target');
    }
});
