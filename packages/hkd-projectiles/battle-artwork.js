'use strict';

const fs = require('fs'), path = require('path'), url = require('url');
const Maps = require('../game-data-editor/lib/map-assets');
const Units = require('../game-data-editor/lib/unit-assets');
const read = file => JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
const gamePrefab = 'assets/KinghtFallPrefabs/game/KinghtFallUIGame.prefab';
const wallProjectilePrefab = 'assets/gad_prefabs/_res/Prefab/GAD_UIGame/pbt_bullet.prefab';
const origin = { x: 0, y: 0 };

function importedFrames(file) {
  return fs.existsSync(file + '.meta') ? read(file + '.meta').subMetas || {} : {};
}

function catalogSpriteFrames(root, assets) {
  const frames = {};
  for (const asset of assets) {
    if (asset.kind !== 'sprite' || asset.visualPrefab || !asset.image) continue;
    const file = path.join(root, asset.image);
    const frame = importedFrames(file)[path.basename(file, path.extname(file))];
    if (!frame || frame.importer !== 'sprite-frame' || frame.rotated ||
        !(frame.width > 0 && frame.height > 0 && frame.rawWidth > 0 && frame.rawHeight > 0)) continue;
    frames[asset.id] = { x: frame.trimX, y: frame.trimY, width: frame.width, height: frame.height,
      originalWidth: frame.rawWidth, originalHeight: frame.rawHeight };
  }
  return frames;
}

function frameSource(root, assets, uuid) {
  for (const asset of assets) {
    if (!/^original:/.test(asset.id) || asset.kind !== 'sprite' || !asset.image) continue;
    const file = path.join(root, asset.image);
    const frame = Object.values(importedFrames(file)).find(item => item.uuid === uuid);
    if (frame) return { url: url.pathToFileURL(file).href, x: frame.trimX, y: frame.trimY, ...frame };
  }
  return Maps.assetIndex(root, new Set([uuid]))[uuid];
}

function spriteGeometry(node, component, frame) {
  let width = node.width, height = node.height;
  if (component._sizeMode === undefined || component._sizeMode === 1) { width = frame.width; height = frame.height; }
  if (component._sizeMode === 2) { width = frame.rawWidth; height = frame.rawHeight; }
  width = width || frame.width;
  height = height || frame.height;
  let x = -width * node.anchor.x, y = -height * node.anchor.y;
  if (component._isTrimmedMode === false && frame.rawWidth > 0 && frame.rawHeight > 0) {
    const sx = width / frame.rawWidth, sy = height / frame.rawHeight;
    x += (frame.rawWidth / 2 + (frame.offsetX || 0) - frame.width / 2) * sx;
    y += (frame.rawHeight / 2 + (frame.offsetY || 0) - frame.height / 2) * sy;
    width = frame.width * sx; height = frame.height * sy;
  }
  return { x, y, width, height };
}

function describeLauncher(root, who, unit, assets, frames) {
  const type = who.type, wall = type === 'wall';
  const prefab = read(path.join(root, wall ? wallProjectilePrefab : type === 'hero' || type === 'building' ? gamePrefab : unit.source));
  const actor = prefab.find(row => row && row.ctrArr && (type !== 'hero' || row.ctrPlayAni));
  let source = prefab, component = actor && prefab[actor.ctrArr.__id__];
  if (!wall && (type === 'building' || !component)) {
    if (type !== 'hero' && type !== 'building') source = read(path.join(root, gamePrefab));
    const tower = source.find(row => row && row.buildBullet);
    component = tower && source[tower.buildBullet.__id__];
  }
  if (!wall && (!component || !component.bullet)) return null;
  const model = Maps.model(source), shotNode = model.byId[wall ? model.root : component.node.__id__];
  const nativeNode = wall ? shotNode : model.byId[component.bullet.__id__];
  const launcher = { scaleX: 1, scaleY: 1 };
  const shotTransform = shotNode.source._trs && shotNode.source._trs.array;
  if (shotTransform) { launcher.scaleX = shotTransform[7]; launcher.scaleY = shotTransform[8]; }
  if (type !== 'building' && !wall) {
    const body = actor ? prefab[actor.node.__id__] : prefab[prefab[0].data.__id__];
    const anchor = actor && prefab[prefab[actor.ctrArr.__id__].node.__id__];
    const point = anchor ? Maps.point(Maps.transform(anchor), origin) : { x: 0, y: 20 };
    const basis = Maps.transform(body);
    basis[4] = basis[5] = 0;
    launcher.muzzle = Maps.point(basis, point);
  }
  if (who.builtinFlight) return { ...launcher, builtin: who.builtinFlight };
  if (!nativeNode) return launcher;
  const parentInverse = Maps.inverse(shotNode.matrix);
  const find = id => {
    const node = model.byId[id];
    if (!node || node.source._active === false && id !== nativeNode.id) return null;
    const drawable = node.components.find(({ value }) => value._spriteFrame || value.__type__ === 'sp.Skeleton');
    if (drawable) return { node, component: drawable.value };
    for (const child of node.children) {
      const result = find(child);
      if (result) return result;
    }
    return null;
  };
  const art = find(nativeNode.id);
  if (!art) return launcher;
  const local = Maps.multiply(parentInverse, art.node.matrix);
  // Wall-defense shots travel up the screen. The preview displays a side view.
  const matrix = wall ? Maps.multiply([0,-1,1,0,0,0], local) : local;
  if (art.component.__type__ === 'sp.Skeleton') {
    const layer = Units.layer(root, art.component, source, Units.index(root, true));
    const fireball = who.defaultFlight === 'original:fireball';
    return { ...launcher, layers: [{ ...layer, matrix, skin: type==='hero'?(who.legacyArrowSkin || layer.skin):layer.skin }],
      animation: fireball ? 'hit' : layer.animation, impact: fireball ? 'blast' : null };
  }
  const uuid = art.component._spriteFrame.__uuid__;
  if (!frames.has(uuid)) frames.set(uuid, frameSource(root, assets, uuid));
  const frame = frames.get(uuid);
  if (!frame) throw Error('The original projectile sprite frame is unavailable.');
  return { ...launcher, sprite: { frame: { ...frame }, matrix, ...spriteGeometry(art.node, art.component, frame) } };
}

module.exports = { catalogSpriteFrames, describeLauncher };
