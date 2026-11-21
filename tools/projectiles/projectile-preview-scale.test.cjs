'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Units = require('../../packages/game-data-editor/lib/unit-assets');
const Maps = require('../../packages/game-data-editor/lib/map-assets');
const { catalogSpriteFrames, describeLauncher } = require('../../packages/hkd-projectiles/battle-artwork');
const { projectileLook } = require('../../packages/hkd-projectiles/combat-preview');
const Looks = require('../../assets/_script/ProjectileLooks');
const config = require('../../assets/KinghtFallConfig/GameJsonCfg.json');
const { assets } = require('../../assets/resources/projectiles/catalog.json');
const root = path.resolve(__dirname, '../..');
const gamePrefab = 'assets/KinghtFallPrefabs/game/KinghtFallUIGame.prefab';
const prefab = file => JSON.parse(fs.readFileSync(path.join(root,file),'utf8').replace(/^\uFEFF/,''));
const near = (a,b) => assert(Math.abs(a-b)<1e-8, `${a} != ${b}`);

test('combat preview uses the real hero rig scale and the scale of the projectile controller that carries assigned artwork',()=>{
  const hero=Units.describe(root,{type:'hero',heroStyle:'skirmisher',noRuntime:true,noShared:true,noAppearance:true,battleSpace:true});
  const scene=prefab(gamePrefab),model=Maps.model(scene);
  const controller=scene.find(row=>row&&row.ctrArr&&row.ctrPlayAni);
  const arrow=scene[controller.ctrArr.__id__];
  const shot=describeLauncher(root,{type:'hero'},hero,assets,new Map());
  assert.equal(shot.scaleX,scene[arrow.node.__id__]._trs.array[7]);
  assert.equal(shot.scaleY,scene[arrow.node.__id__]._trs.array[8]);
  for(const layer of hero.layers){
    const node=model.nodes.find(item=>item.name===layer.name&&item.components.some(c=>c.value.__type__==='sp.Skeleton'));
    near(layer.scaleX,Math.hypot(node.world[0],node.world[1]));
    near(layer.scaleY,Math.hypot(node.world[2],node.world[3]));
  }
});

test('the default arrow and fireball keep their native renderer dimensions instead of using the library preset',()=>{
  const frames=new Map();
  for(const [id,defaultFlight] of [[90003,'original:arrow'],[90005,'original:stone'],[90008,'original:fireball']]){
    const unit=Units.describe(root,{type:'enemy',id,battleSpace:true,noRuntime:true,noShared:true});
    const data=prefab(unit.source),controller=data.find(row=>row&&row.ctrArr),bullet=data[controller.ctrArr.__id__];
    const source=data[bullet.bullet.__id__],native=describeLauncher(root,{type:'enemy',defaultFlight},unit,assets,frames);
    const nativeMatrix=native.sprite?.matrix||native.layers[0].matrix;
    near(Math.hypot(nativeMatrix[0],nativeMatrix[1]),Math.abs(source._trs.array[7]));
    near(Math.hypot(nativeMatrix[2],nativeMatrix[3]),Math.abs(source._trs.array[8]));
    if(native.sprite){
      assert.equal(native.sprite.width,source._contentSize.width);
      assert.equal(native.sprite.height,source._contentSize.height);
    }
    const untouched=projectileLook(assets,{type:'enemy',defaultFlight,scaleFallback:defaultFlight},{},{description:unit,launcher:native});
    assert.equal(untouched.flight,null,'a library card cannot replace the authored default during browse');
  }
});

test('battle space applies unit size overrides to the prefab scale and keeps published ally looks at their baked size',()=>{
  const id=90003,key='enemy:'+id+':default';
  const describe=state=>Units.describe(root,{type:'enemy',id,noRuntime:true,noShared:true,battleSpace:true,documents:{A:{data:state}}}).layers[0];
  const baseVisual={mirrorX:false,scaleX:1,scaleY:1},base={...config,GameTools:{...config.GameTools,visuals:{[key]:baseVisual}}};
  const draft={...base,GameTools:{...base.GameTools,visuals:{[key]:{...baseVisual,scaleX:1.25,scaleY:.75}}}};
  const before=describe(base).matrix,after=describe(draft).matrix;
  near(Math.hypot(after[0],after[1]),Math.hypot(before[0],before[1])*1.25);
  near(Math.hypot(after[2],after[3]),Math.hypot(before[2],before[3])*.75);
  const ally=Units.describe(root,{type:'ally',id:90003,level:1,noRuntime:true,noShared:true,battleSpace:true,documents:{A:{data:{...config,GameTools:{...config.GameTools,visuals:{}}}}}});
  const allyData=prefab(ally.source),node=allyData.find(row=>row&&row._name===ally.layers[0].name);
  near(Math.hypot(ally.layers[0].matrix[2],ally.layers[0].matrix[3]),node._trs.array[8]);
});

test('assigned art shares the runtime size reference and applies the multiplier to flight only',()=>{
  const flight={id:'flight',kind:'sprite',size:40,visualScale:1.25},launch={id:'launch',kind:'flipbook',size:98};
  const look=projectileLook([flight,launch],{type:'ally',scaleFallback:'flight'},{flight:'flight',launch:'launch',size:60,scale:.4});
  assert.equal(look.options.size,60);
  const frame={width:20,height:100};
  const multiplier=Looks.visualScale(look.options);
  near(frame.height*Looks.artworkScale(flight,look.options.size*multiplier,frame),30);
  near(frame.width*Looks.artworkScale(flight,look.options.size*multiplier,frame),6);
  assert.equal(Looks.artworkScale(launch,look.options.size,{width:64,height:64}),60/64);
  assert.equal(Looks.artworkScale({kind:'spine',width:80},look.options.size*multiplier),.3);
  assert.equal(Looks.artworkScale({visualPrefab:{width:120}},look.options.size*multiplier),.2);
  assert.equal(projectileLook([flight],{type:'ally',scaleFallback:'flight'},{scale:1}).flight,flight,'explicit scale uses the same fallback as gameplay');
});

test('assigned sprites draw the imported crop at the size of the original frame',()=>{
  const arrow=assets.find(asset=>asset.id==='original:arrow');
  const frames=catalogSpriteFrames(root,[arrow,assets.find(asset=>asset.kind==='flipbook')]);
  assert.deepEqual(frames,{'original:arrow':{x:1,y:1,width:22,height:64,originalWidth:24,originalHeight:66}});
});

test('wall-defense uses its authored arrow size when no projectile is assigned',()=>{
  const wall={type:'wall',scaleFallback:'original:wall-arrow'};
  const launcher=describeLauncher(root,wall,null,assets,new Map());
  assert.equal(launcher.sprite.width,35);
  assert.equal(launcher.sprite.height,119);
  assert.equal(projectileLook(assets,wall,{},null).flight,null);
});
