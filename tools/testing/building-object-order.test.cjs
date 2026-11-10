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
  const positions = [tower, wing, ground, rock, decoration, shop, soldier, hero].map(node => [node.x, node.y, node.parent]);
  const view = { main, game, objects: [], nativeActors: new Map() };
  DepthView.prototype.prepareObjects.call(view);
  assert.equal(tower._depthBuilding, true); assert.equal(wing._depthBuilding, true); assert.equal(shop._depthBuilding, true);
  assert.equal(ground._depthBuilding, undefined, 'ground/shadow layers keep their existing background layer');
  assert.equal(rock._depthScenery, true); assert.equal(decoration._depthScenery, true);
  assert.equal(hero._depthScenery, undefined); assert.equal(soldier._depthScenery, undefined);
  assert.deepEqual([tower, wing, ground, rock, decoration, shop, soldier, hero].map(node => [node.x, node.y, node.parent]), positions, 'sorting metadata changes no transforms or gameplay references');
  DepthView.prototype.destroy.call(view);
  assert.equal(tower._depthBuilding, undefined); assert.equal(wing._depthBuilding, undefined); assert.equal(shop._depthBuilding, undefined);
  assert.equal(decoration._depthScenery, undefined); assert.equal(mapOnly._depthScenery, true, 'destroy restores classification that existed before this view');
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

test('occlusion captures follow actual render order after building priority, without disabling rear silhouettes', () => {
  const { DepthView, Sprite } = load();
  const main = new Node('ndMain'), tower = new Node('Tower', main, 0, 10), rock = new Node('Rock', main, 0, -10), hero = new Node('Hero', main, 0, 0);
  tower._depthBuilding = true; rock._depthScenery = true;
  rock.width = hero.width = 20; rock.height = 100; hero.height = 30; rock.anchorY = hero.anchorY = 0;
  const rockArt = rock.addComponent(Sprite), heroArt = hero.addComponent(Sprite); rockArt.enabled = heroArt.enabled = true;
  const actor = { node: hero, spAni: heroArt, hp: 100 }, object = { node: rock, sources: [rockArt], masks: new Map() };
  const game = { ctrPlay: actor, gameData: { getSoldierList: () => [], getEnemyList: () => [] } };
  let captures = 0;
  const view = { main, game, objects: [object], nativeCapture: true, nativeActors: new Map(),
    sort: DepthView.prototype.sort,
    snapshot(entry) { captures++; entry.center = { x: 0, y: 0 }; entry.size = { width: 20, height: 100 }; entry.frame = {}; },
    makeMask(entry, actor) { const overlay = new Node('Overlay', main); overlay._occlusionMask = true; overlay.setContentSize = size => { overlay.width = size.width; overlay.height = size.height; }; entry.overlay = { node: overlay, mask: {} }; const mask = { node: new Node('Silhouette', overlay) }; entry.masks.set(actor, mask); return mask; },
    syncNativeMask() {}
  };
  DepthView.prototype.update.call(view); assert.equal(captures, 0, 'a visible foreground unit must not trigger a pointless capture through the rock');
  hero.y = 20; DepthView.prototype.update.call(view); assert.equal(captures, 1, 'units genuinely behind scenery still receive the normal silhouette');
  assert.equal(object.overlay.node.active, true);
  hero.y = 0; DepthView.prototype.update.call(view); assert.equal(captures, 1); assert.equal(object.overlay.node.active, false, 'the old silhouette clears when the actor returns in front');
  rock._depthMapForeground = true; hero.y = -20; DepthView.prototype.update.call(view);
  assert.equal(captures, 1); assert.equal(object.overlay.node.active, false, 'a unit in front of the whole building stack needs no stale scenery silhouette');
});


test('every building model, door, wing and purchase field shares one Z order, with selectable object-layer slots',()=>{
 const {DepthView,Skeleton}=load(),main=new Node('ndMain'),down=new Node('ndDown'),hero=new Node('Hero',main,0,1000),owner=new Node('Building',main,0,50),wing=new Node('Door wing',main,10,-90),shadow=new Node('Shadow',down,0,50),fieldParent=new Node('Purchase fields',down,0,-50),field=new Node('Level 0',fieldParent),tree=new Node('Trees',main,0,-500),cliff=new Node('Cliffs',main,0,500);
 tree._depthLayerOrder=3;cliff._depthLayerOrder=1;const model=owner.addComponent(Skeleton),side=wing.addComponent(Skeleton),ground=shadow.addComponent(Skeleton),build={node:owner,ndAniMain:model,ndAniDown:ground,ndAniOther:[side],ndLockList:[field],renderLayerOrder:-1},game={ndDown:down,ctrPlay:{node:hero},gameData:{bulidPointMap:{one:build}}},view={main,game,objects:[]};
 const originals=[owner,wing,shadow,fieldParent].map(node=>node.convertToWorldSpaceAR(new Vec2(0,0)));DepthView.prototype.prepareObjects.call(view);DepthView.prototype.sort.call(view);
 for(const node of [wing,shadow,fieldParent])assert.equal(node.zIndex,owner.zIndex,'all visible building roots share exactly one Z index');assert(owner.zIndex>tree.zIndex&&owner.zIndex>cliff.zIndex,'Default is in front of the last object layer');[owner,wing,shadow,fieldParent].forEach((node,i)=>assert.deepEqual(node.convertToWorldSpaceAR(new Vec2(0,0)),originals[i],'grouping retains world placement'));
 build.renderLayerOrder=2;DepthView.prototype.prepareObjects.call(view);DepthView.prototype.sort.call(view);assert(cliff.zIndex<owner.zIndex&&owner.zIndex<tree.zIndex,'assigning after Cliffs puts the entire building before Trees');for(const node of [wing,shadow,fieldParent])assert.equal(node.zIndex,owner.zIndex);
 build.renderLayerOrder=0;DepthView.prototype.prepareObjects.call(view);DepthView.prototype.sort.call(view);assert(owner.zIndex<cliff.zIndex&&owner.zIndex<tree.zIndex,'ground-only slot places the whole building behind all objects');
});
