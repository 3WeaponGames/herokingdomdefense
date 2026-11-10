'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const root = path.resolve(__dirname, '../..');
const config = require('../../assets/KinghtFallConfig/GameJsonCfg.json');
const themes = { Map01: 'meadow', Map02: 'forest', Map03: 'desert', Map04: 'snowfield', Map07: 'fire' };
const biomeThemes = { forest: 'meadow', 'deep-forest': 'forest', autumn: 'forest', desert: 'desert', snow: 'snowfield', ice: 'snowfield', fire: 'fire', lava: 'fire' };

function bus(object = {}) {
  const listeners = [];
  return Object.assign(object, {
    on(event, fn, target) { listeners.push({ event, fn, target }); },
    off(event, fn, target) {
      for (let i = listeners.length - 1; i >= 0; i--) {
        const item = listeners[i];
        if (item.event === event && item.fn === fn && item.target === target) listeners.splice(i, 1);
      }
    },
    emit(event) { listeners.slice().filter(item => item.event === event).forEach(item => item.fn.call(item.target)); },
    listenerCount() { return listeners.length; }
  });
}

function fixture() {
  let Background, definition, assignments = 0, frame = null;
  const view = bus(), Sprite = function () {};
  Sprite.SizeMode = { CUSTOM: 0 };
  const cc = { Component: function () {}, Sprite, SpriteFrame: function () {}, view,
    Node: { EventType: { SIZE_CHANGED: 'size-changed' } },
    Class(value) {
      definition = value;
      Background = function () {};
      Object.keys(value).filter(key => typeof value[key] === 'function').forEach(key => Background.prototype[key] = value[key]);
      return Background;
    }
  };
  const api = {};
  vm.runInNewContext(fs.readFileSync(path.join(root, 'assets/_script/LobbyBackground.js'), 'utf8'), { cc, exports: api });
  const sprite = {};
  Object.defineProperty(sprite, 'spriteFrame', { get: () => frame, set(value) { frame = value; assignments++; } });
  const lobby = bus({ width: 750, height: 1334, parent: null });
  const node = { parent: lobby, width: 750, height: 1334,
    setPosition(x, y) { this.x = x; this.y = y; },
    setContentSize(width, height) { this.width = width; this.height = height; },
    getChildByName() { return null; },
    getComponent(type) { return type === Sprite ? sprite : type === Background ? controller : null; }
  };
  const controller = Object.assign(new Background(), { node });
  Object.values(themes).forEach(theme => controller[theme] = { theme, getOriginalSize: () => ({ width: 1024, height: 1536 }) });
  lobby.getChildByName = name => name === 'ndBg' ? node : null;
  const page = { parent: { parent: lobby, getChildByName() { return null; } }, getChildByName() { return null; } };
  controller.onLoad(); controller.onEnable();
  return { api, controller, node, lobby, view, page, sprite, assignments: () => assignments, definition };
}

test('every configured stage selects its map background through the real lobby refresh method', () => {
  const f = fixture();
  const source = fs.readFileSync(path.join(root, 'assets/_script/KinghtFallHomeBattleCtrl.js'), 'utf8').replace(/\r\n/g, '\n');
  const start = source.indexOf('_ctor.prototype.initMapView = function ');
  assert(start >= 0);
  const user = { getMaxStage: () => 1, getMaxOrder: () => 1, getStageInfo: () => 0, getStageReward: () => false };
  const label = {}, spine = { setAnimation() {} }, red = {};
  const init = vm.runInNewContext('(' + source.slice(source.indexOf('function ', start), source.indexOf('\n  };', start) + 4) + ')', {
    require(name) { assert.equal(name, 'LobbyBackground'); return f.api; },
    cc: { Label: function () {}, Sprite: function () {} }, sp: { Skeleton: function () {} },
    $z1KinghtFallPlayerMgr: { KinghtFallPlayerMgr: { getInstance: () => ({ getUserData: () => user }) } },
    $z1KinghtFallTextConfig: { KinghtFallTextConfig: {} },
    $z1KinghtFallConfig: { KinghtFallBundelName: {} },
    $z1KinghtFallEnum: { KinghtFallEnumLevelChalType: { Pass: 1, NoDie: 2, NoAttack: 3 } },
    $z1Utils: { Utils: { StringFormat: () => '' } }
  });
  const home = { node: f.page, cfgList: config.LevelCfg, T: value => value, loadSpriteFrame() {}, loadStageMonster() {}, hideBoxReward() {},
    ndLevelInfo: { getChildByName: () => ({ getComponent: () => label }) },
    ndBoxShow: { getChildByName: () => ({ getChildByName: name => name === 'ndRed' ? red : { getComponent: () => name === 'spAni' ? spine : label } }) }
  };
  for (const stage of [...config.LevelCfg, ...config.LevelCfg.slice().reverse()]) {
    const theme = biomeThemes[stage.EnvironmentBiome] || themes[stage.EnvironmentMapId] || themes[stage.prefab];
    assert(theme, 'configured map needs a background: ' + stage.prefab);
    home.selectStage = stage.Level;
    init.call(home);
    assert.equal(f.sprite.spriteFrame, f.controller[theme]);
  }
  // No deferred loads can overwrite a rapidly selected stage.
  f.api.showForStage(f.page, 'Map02'); f.api.showForStage(f.page, 'Map04');
  assert.equal(f.sprite.spriteFrame.theme, 'snowfield');
  const count = f.assignments(); f.api.showForStage(f.page, 'Map04');
  assert.equal(f.assignments(), count, 'same background does not replace its texture again');
  assert.equal(f.api.showForStage({ parent: null, getChildByName() { return null; } }, 'Map01'), false);
});

test('backgrounds cover portrait, tablet and wide viewports with their original aspect ratio', () => {
  const f = fixture();
  for (const [width, height] of [[375, 812], [750, 1334], [1080, 1920], [1024, 768], [1920, 1080]]) {
    f.lobby.width = width; f.lobby.height = height; f.lobby.emit('size-changed');
    assert(f.node.width >= width && f.node.height >= height);
    assert(Math.abs(f.node.width / f.node.height - 1024 / 1536) < 1e-10);
    assert.equal(f.node.x, 0); assert.equal(f.node.y, 0);
    assert.equal(f.lobby.width, width); assert.equal(f.lobby.height, height);
    f.api.showForStage(f.page, 'Map03');
    f.view.emit('canvas-resize');
    assert(f.node.width >= width && f.node.height >= height);
  }
  for (const values of [[0, 5, 1024, 1536], [5, NaN, 1024, 1536], [5, 8, 0, 1536]]) assert.equal(f.api.coverSize(...values), null);
});

test('background state survives lobby enable cycles and releases resize listeners', () => {
  const f = fixture(); f.api.showForStage(f.page, 'Map02');
  for (let i = 0; i < 5; i++) {
    assert.equal(f.lobby.listenerCount(), 1); assert.equal(f.view.listenerCount(), 1);
    f.controller.onDisable();
    assert.equal(f.lobby.listenerCount(), 0); assert.equal(f.view.listenerCount(), 0);
    f.controller.onEnable(); assert.equal(f.sprite.spriteFrame.theme, 'forest');
  }
  for (const unknown of ['Map99', null, 'constructor', '__proto__']) {
    f.api.showForStage(f.page, unknown); assert.equal(f.sprite.spriteFrame.theme, 'meadow');
  }
  f.controller.onDisable();
});

test('lobby prefab references every production biome backdrop and retires the moving blue pattern', () => {
  const prefab = JSON.parse(fs.readFileSync(path.join(root, 'assets/KinghtFallPrefabs/home/KinghtFallUIHome.prefab')));
  const node = prefab.find(object => object._name === 'ndBg');
  const components = node._components.map(ref => prefab[ref.__id__]);
  const controller = components.find(component => component.meadow && component.forest);
  assert(controller);
  assert.equal(components.find(component => component.__type__ === 'cc.Widget')._enabled, false);
  assert(components.some(component => component.__type__ === 'cc.BlockInputEvents'));
  assert.equal(prefab.find(object => object._name === 'yz_ty_xh')._active, false);
  const ids = new Set();
  for (const theme of Object.values(themes)) {
    const file = path.join(root, 'assets/KinghtFallPrefabs/_res/textures/KinghtFallUIHome/Backgrounds', 'lobby-' + theme + '.png');
    const meta = JSON.parse(fs.readFileSync(file + '.meta'));
    const frame = meta.subMetas['lobby-' + theme];
    assert.equal(controller[theme].__uuid__, frame.uuid);
    assert.equal(frame.rawTextureUuid, meta.uuid);
    assert.equal(meta.packable, false, 'large backdrops stay outside sprite atlases');
    const png = fs.readFileSync(file);
    assert.equal(png.readUInt32BE(16), 1024); assert.equal(png.readUInt32BE(20), 1536);
    ids.add(frame.uuid);
  }
  assert.equal(ids.size, Object.keys(themes).length);
  assert.equal(components.find(component => component.__type__ === 'cc.Sprite')._spriteFrame.__uuid__, controller.meadow.__uuid__);
});
