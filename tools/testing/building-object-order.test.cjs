'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { Node, Vec2 } = require('../navigation/runtime-harness.cjs');
const file = path.resolve(__dirname, '../../assets/_script/KinghtFallDepthView.js');
function load(extra = {}) {
  class Sprite {} class Skeleton {}
  const cc = { Sprite, Director: { EVENT_BEFORE_DRAW: 'draw' }, v2: (x, y) => new Vec2(x, y), isValid: value => !!value && !value.destroyed, ...extra };
  const context = { exports: {}, cc, sp: { Skeleton } };
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), context, { filename: file });
  return { ...context.exports, cc, Skeleton, Sprite };
}

test('building priority keeps rocks behind structures while preserving every unit/building ground crossing', () => {
  const { DepthView } = load();
  const rock = { y: -1000, _depthScenery: true }, tower = { y: 100, _depthBuilding: true }, gate = { y: -100, _depthBuilding: true };
  const rear = { y: 100.01, _combatActor: true }, between = { y: 0, _combatActor: true }, front = { y: -100.01, _combatActor: true }, hero = { y: 100 };
  const main = { children: [front, rock, gate, between, tower, hero, rear], sortAllChildren() { this.children.sort((a, b) => a.zIndex - b.zIndex); } };
  const view = { main, game: { ctrPlay: { node: hero } } };
  DepthView.prototype.sort.call(view);
  assert(rock.zIndex < tower.zIndex && rock.zIndex < gate.zIndex, 'even a foreground rock must stay behind both structures');
  assert(rear.zIndex < rock.zIndex, 'units behind every building retain their original scenery depth');
  assert(rear.zIndex < tower.zIndex && rear.zIndex < gate.zIndex);
  assert(tower.zIndex < between.zIndex && between.zIndex < gate.zIndex);
  assert(gate.zIndex < front.zIndex);
  assert(tower.zIndex < hero.zIndex, 'same-height units retain the actor-in-front tie break');
  between.y = 100.02; DepthView.prototype.sort.call(view);
  assert(between.zIndex < tower.zIndex, 'moving behind a structure immediately restores the rear depth');
  between.y = -100.02; DepthView.prototype.sort.call(view);
  assert(gate.zIndex < between.zIndex, 'moving in front immediately restores the complete unit');
  tower.activeInHierarchy = gate.activeInHierarchy = false; DepthView.prototype.sort.call(view);
  assert(front.zIndex < rock.zIndex, 'invisible structures do not leave a sticky foreground band on actors');
  rock._depthMapForeground = true; rock.y = 10000; tower.activeInHierarchy = gate.activeInHierarchy = true; DepthView.prototype.sort.call(view);
  assert(rock.zIndex < tower.zIndex && rock.zIndex < gate.zIndex, 'Default covers every object layer');tower._depthBuildingOrder=gate._depthBuildingOrder=0;DepthView.prototype.sort.call(view);assert(rock.zIndex>tower.zIndex&&rock.zIndex>gate.zIndex,'assigning buildings below object layers moves the entire structure behind scenery');
});

test('authored building roots, detached wings, offers and ordinary decoration receive only render classifications', () => {
  const { DepthView, Sprite, Skeleton, cc } = load({ director: { off() {} } });
  const main = new Node('ndMain'), down = new Node('ndDown'), hero = new Node('Hero', main, 0, 80);
  const tower = new Node('Tower', main, 10, 100), wing = new Node('Wall wing', main, 20, 90), ground = new Node('Ground shadow', down);
  const model = tower.addComponent(Skeleton), detached = wing.addComponent(Skeleton), shadow = ground.addComponent(Skeleton);
  const rock = new Node('Rock', main, 0, -500), decoration = new Node('Decoration without collider', main, 0, -600), shop = new Node('Offer', main, 0, -200);
  const shopArt = shop.addComponent(Skeleton); rock.addComponent(Sprite);
  const soldier = new Node('Pooled ally', main); soldier._combatActor = {};
  const mapOnly = new Node('Already classified scenery', main); mapOnly._depthScenery = true;
  const game = { ctrPlay: { node: hero }, gameData: { bulidPointMap: { tower: { node: tower, ndAniMain: model, ndAniDown: shadow, ndAniOther: [detached] } }, obstacles: [{ node: rock }], weaponBusinessPoints: { _offers: [{ node: shop, spAni: shopArt }] } } };
  const nodes = [tower, wing, ground, rock, decoration, shop, soldier, hero];
  const positions = nodes.map(node => [node.x, node.y, node.parent]);
  const world = nodes.map(node => node.convertToWorldSpaceAR(new Vec2(0, 0)));
  const view = { main, game, objects: [], nativeActors: new Map() };
  DepthView.prototype.prepareObjects.call(view);
  assert.equal(tower._depthBuilding, true); assert.equal(wing._depthBuilding, true); assert.equal(shop._depthBuilding, true);
  assert.equal(ground._depthGroundVisual, true, 'ground artwork has its own background classification');
  assert.equal(ground.parent, main, 'ground artwork can sort independently of a building wrapper');
  assert.equal(rock._depthScenery, true); assert.equal(decoration._depthScenery, true);
  assert.equal(hero._depthScenery, undefined); assert.equal(soldier._depthScenery, undefined);
  assert.deepEqual(nodes.map(node => node.convertToWorldSpaceAR(new Vec2(0, 0))), world, 'render layering preserves world placement');
  assert.equal(game.gameData.bulidPointMap.tower.ndAniDown, shadow, 'gameplay keeps its original renderer reference');
  DepthView.prototype.destroy.call(view);
  assert.equal(tower._depthBuilding, undefined); assert.equal(wing._depthBuilding, undefined); assert.equal(shop._depthBuilding, undefined);
  assert.equal(decoration._depthScenery, undefined); assert.equal(mapOnly._depthScenery, true, 'destroy restores classification that existed before this view');
  assert.deepEqual(nodes.map(node => [node.x, node.y, node.parent]), positions, 'leaving the view restores the ground artwork hierarchy');
});

test('new terrain objects keep scenery priority through movement and leave no component-owned flag after removal', () => {
  let type; const cc = { Component: class {}, Class: value => (type = value) };
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../../assets/_script/MapTerrainLayer.js'), 'utf8'), { cc });
  const node = new Node('New map object'), component = { node, ground: new Node('Ground', node), artwork: null };
  type.onLoad.call(component); assert.equal(node._depthMapObject, true);
  assert.equal(node._depthMapForeground, false, 'old terrain components keep the behind-buildings default');
  const { DepthView } = load(), hero = { y: 0 }, tower = { y: 100, _depthBuilding: true };
  const main = new Node('ndMain'); node.setParent(main); main.children.push(hero, tower);
  const view = { main, game: { ctrPlay: { node: hero } } };
  for (const y of [1000, -1000]) { node.y = y; DepthView.prototype.sort.call(view); assert(node.zIndex < tower.zIndex); }
  type.onDestroy.call(component); assert.equal(node._depthMapObject, undefined); assert.equal(node._depthGround, undefined);
  component.frontOfBuildings = true; type.onLoad.call(component); DepthView.prototype.sort.call(view);
  assert.equal(node._depthMapForeground, true); assert(node.zIndex < tower.zIndex, 'Default buildings stay above every object layer');tower._depthBuildingOrder=0;DepthView.prototype.sort.call(view);assert(node.zIndex>tower.zIndex,'a lower building slot allows objects to cover it');
  type.onDestroy.call(component); assert.equal(node._depthMapForeground, undefined);
});

test('Stage 10 depth sorting lets a cliff cover walkers behind it', () => {
  const { DepthView, Sprite, Skeleton } = load();
  const main = new Node('ndMain'), hero = new Node('Hero', main, 0, 20);
  const cliff = new Node('Cliff', main, 0, 0), grass = new Node('Grass', main, 0, 40);
  const house = new Node('House', main, 200, 0), wing = new Node('House wing', main, 210, 0);
  function sprite(node, height) {
    node.width = 40;
    node.height = height;
    node.anchorX = .5;
    node.anchorY = 0;
    const art = node.addComponent(Sprite);
    art.enabled = true;
    return art;
  }
  const actor = { node: hero, spAni: sprite(hero, 35) };
  cliff._depthMapObject = true;
  cliff._depthLayerOrder = 5;
  grass._depthMapObject = true;
  grass._depthLayerOrder = 7;
  sprite(cliff, 100);
  sprite(grass, 10);
  const build = { node: house, ndAniMain: house.addComponent(Skeleton), ndAniOther: [wing.addComponent(Skeleton)] };
  const game = { ctrPlay: actor, gameData: { levelCfg: { StageLayoutId: 'A-10' }, bulidPointMap: { one: build },
    obstacles: [{ node: cliff }, { node: grass }] } };
  const view = { main, game, objects: [], _prioritizeCliffs: true };
  DepthView.prototype.prepareObjects.call(view);
  DepthView.prototype.sort.call(view);
  assert(hero.zIndex < cliff.zIndex, 'grass in a higher layer does not expose the unit through the cliff');
  assert(cliff.zIndex < grass.zIndex && grass.zIndex < house.zIndex);
  hero.y = -10;
  DepthView.prototype.sort.call(view);
  assert(cliff.zIndex < hero.zIndex, 'a walker in front of the cliff stays visible');
});

test('every stage keeps living unit HP bars in front without allocating overlap renderers', () => {
  const campaign = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../assets/KinghtFallConfig/GameJsonCfg.json')));
  class SceneNode extends Node {
    destroy() { this.destroyed = true; this.setParent(null); }
  }
  for (const isNative of [false, true]) {
    let draw;
    const { DepthView } = load({
      Node: SceneNode,
      macro: { MAX_ZINDEX: 32767 },
      sys: { isNative },
      director: {
        on(_event, callback, owner) { draw = () => callback.call(owner); },
        off() { draw = null; },
        getScene() { assert.fail('allocated an overlap camera'); },
        getTotalFrames: () => 1
      },
      resources: { load() { assert.fail('loaded an overlap shader'); } }
    });
    for (const levelCfg of [...Object.values(campaign.LevelCfg), {}]) {
      const main = new SceneNode('ndMain', null, 40), overlay = new SceneNode('ndUI');
      function actor(name, barField) {
        const node = new SceneNode(name, main);
        const bar = {
          node: new SceneNode('HP', node),
          moveToBattleLayer(layer) { this.node.setParent(layer); },
          restoreBattleParent() { this.node.setParent(node); },
          syncBattlePosition(_game, _size, _frame, _cadence, projection) {
            this.node.x = projection.x + projection.a * node.x;
          },
          battleReferenceSize: () => ({ width: 64, height: 10 })
        };
        const unit = { node, hp: 100, hpMax: 100, [barField]: bar };
        node._combatActor = unit;
        return unit;
      }
      const hero = actor('Hero', 'ctrHp'), ally = actor('Ally', 'hpctrl'), enemy = actor('Enemy', 'hpctrl');
      const units = [hero, ally, enemy], bars = [hero.ctrHp, ally.hpctrl, enemy.hpctrl];
      const view = new DepthView({ ndMain: main, ndUI: overlay, ctrPlay: hero,
        gameData: { levelCfg, bulidPointMap: {}, getSoldierList: () => [ally], getEnemyList: () => [enemy] } });
      const layer = view._unitHealthLayer;
      assert.equal(layer.parent, overlay);
      assert.equal(layer.zIndex, 32767);
      draw();
      assert.deepEqual(layer.children, bars.map(bar => bar.node));
      assert.equal(enemy.hpctrl.node.x, 40);
      enemy.node.x = 20;
      draw();
      assert.equal(enemy.hpctrl.node.x, 60);
      enemy.hp = 0;
      draw();
      assert.equal(enemy.hpctrl.node.parent, enemy.node);
      view.destroy();
      assert.equal(draw, null);
      assert.equal(layer.destroyed, true);
      bars.forEach((bar, index) => assert.equal(bar.node.parent, units[index].node));
    }
  }
});


test('building models and wings share authored object-layer slots while ground art stays below units',()=>{
 const {DepthView,Skeleton}=load(),main=new Node('ndMain'),down=new Node('ndDown'),hero=new Node('Hero',main,0,1000),owner=new Node('Building',main,0,50),wing=new Node('Door wing',main,10,-90),shadow=new Node('Shadow',down,0,50),fieldParent=new Node('Purchase fields',down,0,-50),field=new Node('Level 0',fieldParent),tree=new Node('Trees',main,0,-500),cliff=new Node('Cliffs',main,0,500);
 tree._depthLayerOrder=3;cliff._depthLayerOrder=1;const model=owner.addComponent(Skeleton),side=wing.addComponent(Skeleton),ground=shadow.addComponent(Skeleton),build={node:owner,ndAniMain:model,ndAniDown:ground,ndAniOther:[side],ndLockList:[field],renderLayerOrder:-1},game={ndDown:down,ctrPlay:{node:hero},gameData:{bulidPointMap:{one:build}}},view={main,game,objects:[]};
 const originals=[owner,wing,shadow,fieldParent].map(node=>node.convertToWorldSpaceAR(new Vec2(0,0)));DepthView.prototype.prepareObjects.call(view);DepthView.prototype.sort.call(view);
 assert.equal(wing.zIndex,owner.zIndex,'solid building parts retain one authored Z index');for(const node of [shadow,fieldParent])assert(node.zIndex<hero.zIndex,'ground artwork stays beneath units');assert(owner.zIndex>tree.zIndex&&owner.zIndex>cliff.zIndex,'Default is in front of the last object layer');[owner,wing,shadow,fieldParent].forEach((node,i)=>assert.deepEqual(node.convertToWorldSpaceAR(new Vec2(0,0)),originals[i],'grouping retains world placement'));
 build.renderLayerOrder=2;DepthView.prototype.prepareObjects.call(view);DepthView.prototype.sort.call(view);assert(cliff.zIndex<owner.zIndex&&owner.zIndex<tree.zIndex,'assigning after Cliffs puts the solid building before Trees');assert.equal(wing.zIndex,owner.zIndex);for(const node of [shadow,fieldParent])assert(node.zIndex<hero.zIndex);
 build.renderLayerOrder=0;DepthView.prototype.prepareObjects.call(view);DepthView.prototype.sort.call(view);assert(owner.zIndex<cliff.zIndex&&owner.zIndex<tree.zIndex,'ground-only slot places the whole building behind all objects');
});

test('unit depth follows the building footprint at the center and corners', () => {
  const { DepthView, Sprite } = load();
  const main = new Node('ndMain'), building = new Node('Barracks', main), scenery = new Node('Rock', main, 0, -20);
  building._depthBuilding = true;
  building._depthBuildingOrder = 7;
  scenery._depthScenery = true;
  scenery._depthLayerOrder = 1;
  function render(node, width, height, anchorY) {
    Object.assign(node, { width, height, anchorY });
    const sprite = node.addComponent(Sprite);
    sprite.enabled = true;
    return sprite;
  }
  const facade = render(building, 220, 240, .25);
  render(scenery, 220, 180, 0);
  const actor = name => {
    const node = new Node(name, main), unit = { node, spAni: render(node, 30, 70, 0), hp: 100 };
    node._combatActor = unit;
    return unit;
  };
  const hero = actor('Hero'), ally = actor('Ally'), enemy = actor('Enemy');
  const units = [hero, ally, enemy];
  const polygon = [new Vec2(-90, 25), new Vec2(0, -45), new Vec2(90, 25), new Vec2(0, 95)];
  const owner = { node: building, getWposPhyCol2: () => [{ points: polygon }] };
  const object = { node: building, sources: [facade], baseSources: [facade],
    buildings: [{ owner, base: null, weapon: null, ruins: null }] };
  const game = { ctrPlay: hero, gameData: { getSoldierList: () => [ally], getEnemyList: () => [enemy] } };
  const view = Object.assign(Object.create(DepthView.prototype), { main, game, objects: [object] });
  units.forEach(unit => unit.node.setPosition(0, -10));
  view.sort();
  assert(scenery.zIndex < building.zIndex);
  assert(units.every(unit => unit.node.zIndex > building.zIndex), 'lower scenery cannot pull a foreground unit behind the building');

  units.forEach((unit, index) => unit.node.setPosition(index === 1 ? 94 : -94, 22));
  view.sort();
  assert(units.every(unit => unit.node.zIndex > building.zIndex), 'units just outside either corner stay in full color');

  hero.node.setPosition(0, 100);
  view.sort();
  assert(hero.node.zIndex < building.zIndex);
  hero.node.setPosition(94, 25);
  view.sort();
  assert(hero.node.zIndex > building.zIndex);
});
