'use strict';
// Validate the shipped layered assets and their Cocos import geometry together.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const config = require('../../assets/KinghtFallConfig/GameJsonCfg.json');
const views = require('../../assets/_script/BuildingWeaponPose').views;
const rows = config.BuildEnum[2].levelList.filter(row => /buildings\/towers\/(cannon|sniper)-[123]$/.test(row.Appearance?.sprite));

test('all six tower levels ship native-sized RGBA layers with matching Cocos metadata', () => {
  assert.equal(rows.length, 6);
  let count = 0;
  for (const row of rows) for (const layer of [row.Appearance, ...Object.values(views(row.Appearance.weapon))].flatMap(layer=>layer.emptySprite?[layer,{...layer,sprite:layer.emptySprite}]:[layer])) {
    const file = path.join(root, 'assets/resources', layer.sprite + '.png');
    const png = fs.readFileSync(file), meta = JSON.parse(fs.readFileSync(file + '.meta', 'utf8'));
    assert.equal(png.toString('hex', 0, 8), '89504e470d0a1a0a');
    const width = png.readUInt32BE(16), height = png.readUInt32BE(20);
    assert.equal(png[25], 6, layer.sprite + ' requires a transparent RGBA cutout');
    assert.equal(width, Math.round(layer.width), layer.sprite + ' width');
    assert.equal(height, Math.round(layer.height), layer.sprite + ' height');
    assert.equal(meta.width, width); assert.equal(meta.height, height);
    const frame = Object.values(meta.subMetas)[0];
    assert(frame.uuid && meta.uuid && frame.rawTextureUuid === meta.uuid);
    assert.equal(frame.trimType, 'none', 'canvas must retain aiming pivots and mounting offsets');
    assert.deepEqual([frame.width, frame.height, frame.rawWidth, frame.rawHeight], [width, height, width, height]);
    assert.deepEqual([frame.trimX, frame.trimY, frame.offsetX, frame.offsetY], [0, 0, 0, 0]);
    count++;
  }
  assert.equal(count, 51);
});

test('original tower windows and night tint remain with the replacement weapons', () => {
  for (const { Appearance: art } of rows) {
    assert.equal(art.nightTint, '#A7A7A7');
    const twoFaces=art.sprite==='buildings/towers/sniper-3';
    assert.equal(art.lighting.length,twoFaces?3:2,art.sprite);assert.equal(art.lighting.filter(light=>light.glow).length,twoFaces?2:1);
    for(const light of art.lighting){assert(light.points.length>=3);assert(light.points.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)&&Math.abs(p.x)<art.width/2&&p.y>0&&p.y<art.height));}
    if(twoFaces)assert(art.lighting.some(light=>light.glow&&light.points.every(p=>p.x<0)),'left-face window retains its own glow');
  }
});
