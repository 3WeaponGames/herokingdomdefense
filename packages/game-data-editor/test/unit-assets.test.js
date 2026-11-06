'use strict';
const assert=require('assert'),fs=require('fs'),path=require('path'),url=require('url');
const Assets=require('../lib/unit-assets'),Renderer=require('../preview/spine-renderer'),Projectile=require('../preview/projectile');
const root=path.resolve(__dirname,'../../..'),spine=require(Assets.enginePath()),cfg=JSON.parse(fs.readFileSync(path.join(root,'assets/KinghtFallConfig/GameJsonCfg.json'),'utf8'));
let count=0;
function layersFor(description){return description.layers.map(d=>{const atlas=new spine.TextureAtlas(d.atlas,name=>{const png=fs.readFileSync(url.fileURLToPath(d.pages[name]));return new spine.FakeTexture({width:png.readUInt32BE(16),height:png.readUInt32BE(20)});});const data=new spine.SkeletonJson(new spine.AtlasAttachmentLoader(atlas)).readSkeletonData(d.json),skeleton=new spine.Skeleton(data);assert(data.findSkin(d.skin),'skin '+d.skin);skeleton.setSkinByName(d.skin);return{description:d,data,skeleton,atlas};});}
function coordinates(layers){return layers.map(l=>Renderer.geometry(spine,l).map(g=>Array.from(g.vertices)));}
for(const type of ['enemy','ally','hero'])for(const id of type==='hero'?['hero']:Object.keys(cfg.SoldierCfg).filter(id=>type==='enemy'||Number(id)<=90004)){
    const description=Assets.describe(root,{type,id}),layers=layersFor(description);assert(layers.length>0);
    Renderer.seek(spine,layers,'attack',0,false);const zero=coordinates(layers);assert(zero.some(layer=>layer.length>0));
    Renderer.seek(spine,layers,'attack',.5,false);const hit=coordinates(layers);assert.notDeepStrictEqual(hit,zero,'attack pose changes '+type+id);
    Renderer.seek(spine,layers,'attack',0,false);assert.deepStrictEqual(coordinates(layers),zero,'backward seek is deterministic '+type+id);
    const box=Renderer.bounds(spine,layers);assert(box.width>0&&box.height>0&&isFinite(box.width));
    if(type==='hero')assert.equal(layers.length,7);
    console.log('PASS model/skin/attack/backward seek '+type+' '+id);count++;
}
const enemy=Assets.describe(root,{type:'enemy',id:90001}),ally=Assets.describe(root,{type:'ally',id:90001});assert.equal(enemy.layers[0].source,ally.layers[0].source);assert.notEqual(enemy.layers[0].skin,ally.layers[0].skin);assert(enemy.shared.length>0);
const boss=[90010,90011,90012].map(id=>Assets.describe(root,{type:'enemy',id}));assert.equal(new Set(boss.map(d=>d.key)).size,3);assert.equal(new Set(boss.map(d=>d.layers[0].source)).size,3);
const hero=Assets.describe(root,{type:'hero',id:'hero',heroLevels:{1:5}});assert.equal(hero.equipment.find(x=>x.id===1).level,5);
assert.throws(()=>Assets.describe(root,{type:'enemy',id:90001,record:{prefab:'../../outside'}}),/Invalid/);
for(const id of [90003,90005,90008]){const description=Assets.describe(root,{type:'enemy',id});const a=Projectile.simulate(description.projectile,250,60),b=Projectile.simulate(description.projectile,500,60);assert(a.time>0&&b.time>a.time);assert.deepStrictEqual(a,Projectile.simulate(description.projectile,250,60));}
console.log(count+' unit render cases plus shared-asset, boss, equipment, path and projectile checks passed.');
