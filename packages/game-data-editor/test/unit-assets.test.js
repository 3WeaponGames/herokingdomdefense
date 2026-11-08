'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),url=require('node:url'),vm=require('node:vm'),test=require('node:test');
const Assets=require('../lib/unit-assets'),Renderer=require('../preview/spine-renderer'),Projectile=require('../preview/projectile');
const root=path.resolve(__dirname,'../../..'),cfg=JSON.parse(fs.readFileSync(path.join(root,'assets/KinghtFallConfig/GameJsonCfg.json'),'utf8'));
let spine,runtime,engineUnavailable;
try { runtime=Assets.enginePath(); }
catch(error) { if(process.env.COCOS_ENGINE_ROOT)throw error;engineUnavailable=error.message; }
if(runtime)spine=require(runtime);
const describe=request=>Assets.describe(root,Object.assign({noRuntime:true},request));

test('static building previews resolve every authored icon without the Creator runtime',()=>{
    const previous=process.env.COCOS_ENGINE_ROOT;
    process.env.COCOS_ENGINE_ROOT=path.join(root,'missing-creator-runtime');
    try {
        for(const [id,building] of Object.entries(cfg.BuildEnum))for(let levelIndex=0;levelIndex<(building.levelList||[]).length;levelIndex++){
            const result=Assets.describe(root,{type:'building',id,levelIndex});
            assert.equal(result.runtimePath,null);
            assert.deepEqual(result.layers,[]);
            assert(result.image,'building '+id+' branch '+(levelIndex+1));
            assert(fs.existsSync(url.fileURLToPath(result.image)));
            assert.equal(result.label,building.levelList[levelIndex].Icon);
        }
    } finally {
        if(previous===undefined)delete process.env.COCOS_ENGINE_ROOT;else process.env.COCOS_ENGINE_ROOT=previous;
    }
});
test('building draft previews resolve nested runtime icon references and preserve missing-icon fallback',()=>{
    const temporary=require('./owned-temp'),fixtureRoot=temporary('hkd-building-preview-');
    function sprite(relative){const file=path.join(fixtureRoot,'assets',relative);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,'fixture');fs.writeFileSync(file+'.meta',JSON.stringify({subMetas:{fixture:{importer:'sprite-frame'}}}));return file;}
    const expected={
        'nested/tower':sprite('KinghtFallIconBuild/nested/tower.png'),
        '@icon/buildings/tower':sprite('resources/buildings/tower.webp'),
        '@sprite/custom/nested/tower':sprite('custom/nested/tower.jpg')
    };
    fs.writeFileSync(path.join(fixtureRoot,'assets/custom.meta'),JSON.stringify({isBundle:true}));
    function preview(icon){return Assets.describe(fixtureRoot,{type:'building',id:'2',documents:{A:{data:{}}},record:{levelList:[{Icon:icon}]}});}
    for(const [reference,file]of Object.entries(expected)){
        const result=preview(reference);
        assert.equal(result.image,url.pathToFileURL(file).href);
        assert.equal(result.runtimePath,null);
        assert.equal(result.label,reference);
    }
    for(const reference of ['missing','../outside','@sprite/custom/../outside'])assert.equal(preview(reference).image,null);
    Assets.invalidate();
});

test('new tower previews use map sprite artwork and carry authored transforms without loading gameplay',()=>{
    const temporary=require('./owned-temp'),fixtureRoot=temporary('hkd-tower-artwork-preview-');
    const file=path.join(fixtureRoot,'assets/resources/buildings/towers/cannon-1.png');
    fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,'fixture');
    fs.writeFileSync(file+'.meta',JSON.stringify({subMetas:{fixture:{importer:'sprite-frame'}}}));
    const appearance={sprite:'buildings/towers/cannon-1',width:160,height:200,offsetX:-10,offsetY:4,muzzleX:3,muzzleY:100};
    const record={levelList:[{Icon:'old-icon',Appearance:appearance}]},before=JSON.stringify(record);
    const result=Assets.describe(fixtureRoot,{type:'building',id:'2',documents:{A:{data:{}}},record});
    assert.equal(result.image,url.pathToFileURL(file).href);assert.deepEqual(result.appearance,appearance);
    assert.equal(result.runtimePath,null);assert.deepEqual(result.layers,[]);assert.equal(JSON.stringify(record),before);
    record.levelList[0].Appearance.sprite='missing';
    assert.equal(Assets.describe(fixtureRoot,{type:'building',id:'2',documents:{A:{data:{}}},record}).image,null,'invalid map artwork never pretends the old icon is the runtime sprite');
    Assets.invalidate();
});

test('layered tower previews resolve base and weapon independently and preserve invalid weapon drafts',()=>{
    const temporary=require('./owned-temp'),fixtureRoot=temporary('hkd-tower-layer-preview-');
    function sprite(name){const file=path.join(fixtureRoot,'assets/resources/buildings/towers',name+'.png');fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,'fixture');fs.writeFileSync(file+'.meta',JSON.stringify({subMetas:{fixture:{importer:'sprite-frame'}}}));return file;}
    const northFile=sprite('north'),southeastFile=sprite('southeast'),southFile=sprite('south');
    const baseFile=sprite('base'),weaponFile=sprite('weapon'),appearance={sprite:'buildings/towers/base',width:180,height:220,weapon:{sprite:'buildings/towers/weapon',width:120,height:80,pivotX:.2,pivotY:.6,offsetX:10,offsetY:180,muzzleX:90,muzzleY:15,views:{north:{sprite:'buildings/towers/north'},southeast:{sprite:'buildings/towers/southeast'},south:{sprite:'buildings/towers/south'}}}};
    const record={levelList:[{Icon:'full-tower-icon',Appearance:appearance}]},before=JSON.stringify(record),request={type:'building',id:'2',documents:{A:{data:{}}},record};
    const result=Assets.describe(fixtureRoot,request);
    assert.equal(result.image,url.pathToFileURL(baseFile).href);assert.equal(result.weaponImage,url.pathToFileURL(weaponFile).href);assert.deepEqual(result.appearance,appearance);assert.equal(JSON.stringify(record),before);
    assert.equal(result.weaponImages.north,url.pathToFileURL(northFile).href);assert.equal(result.weaponImages.south,url.pathToFileURL(southFile).href);
    assert.equal(result.weaponImages.southeast,url.pathToFileURL(southeastFile).href);
    appearance.weapon.sprite='missing/weapon';const missing=Assets.describe(fixtureRoot,request);
    assert.equal(missing.image,url.pathToFileURL(baseFile).href);assert.equal(missing.weaponImage,null);assert.equal(appearance.weapon.sprite,'missing/weapon','preview never repairs a missing resource');
    Assets.invalidate();
});

test('actual Creator model/skin/attack/backward-seek integration for every reachable unit',{skip:engineUnavailable||false},()=>{
    function layersFor(description){return description.layers.map(d=>{const atlas=new spine.TextureAtlas(d.atlas,name=>{const png=fs.readFileSync(url.fileURLToPath(d.pages[name]));return new spine.FakeTexture({width:png.readUInt32BE(16),height:png.readUInt32BE(20)});});const data=new spine.SkeletonJson(new spine.AtlasAttachmentLoader(atlas)).readSkeletonData(d.json),skeleton=new spine.Skeleton(data);assert(data.findSkin(d.skin),'skin '+d.skin);skeleton.setSkinByName(d.skin);return{description:d,data,skeleton,atlas};});}
    function coordinates(layers){return layers.map(l=>Renderer.geometry(spine,l).map(g=>Array.from(g.vertices)));}
    for(const type of ['enemy','ally','hero'])for(const id of type==='hero'?['hero']:Object.keys(cfg.SoldierCfg).filter(id=>type==='enemy'||Number(id)<=90004)){
        const description=describe({type,id}),layers=layersFor(description);assert(layers.length>0);
        Renderer.seek(spine,layers,'attack',0,false);const zero=coordinates(layers);assert(zero.some(layer=>layer.length>0));
        const attackDuration=Math.max(...layers.map(layer=>layer.data.findAnimation('attack').duration));
        assert([.25,.5,.75].some(fraction=>{Renderer.seek(spine,layers,'attack',attackDuration*fraction,false);return JSON.stringify(coordinates(layers))!==JSON.stringify(zero);}), 'attack pose changes '+type+id);
        Renderer.seek(spine,layers,'attack',0,false);assert.deepEqual(coordinates(layers),zero,'backward seek is deterministic '+type+id);
        const box=Renderer.bounds(spine,layers);assert(box.width>0&&box.height>0&&isFinite(box.width));
        if(type==='hero')assert.equal(layers.length,7);
    }
});
test('unit metadata, shared assets, boss forms, equipment and path checks do not require Creator',()=>{
    const enemy=describe({type:'enemy',id:90001}),ally=describe({type:'ally',id:90001});
    assert.notEqual(enemy.layers[0].source,ally.layers[0].source,'Monster enemies and modular allies must have independent appearance assets');assert(enemy.layers[0].skins.includes(enemy.layers[0].skin));assert(ally.layers[0].skins.includes(ally.layers[0].skin));assert(!enemy.shared.includes(ally.source));
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
