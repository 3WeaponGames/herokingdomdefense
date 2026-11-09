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
  for (const row of rows) for (const layer of [row.Appearance, ...Object.values(views(row.Appearance.weapon))]) {
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
  assert.equal(count, 30);
});

test('all six night windows have valid panes and glows, including both faces of Sniper level 3', () => {
  for (const { Appearance: art } of rows) {
    const twoFaces = art.sprite === 'buildings/towers/sniper-3';
    assert.equal(art.nightTint, '#A7A7A7');
    assert.equal(art.lighting.length, twoFaces ? 3 : 2, art.sprite);
    assert.equal(art.lighting.filter(light => light.glow).length, twoFaces ? 2 : 1, art.sprite);
    for (const light of art.lighting) {
      assert(light.points.length >= 3);
      let area = 0;
      light.points.forEach((point, i) => {
        assert(Number.isFinite(point.x) && Number.isFinite(point.y));
        assert(Math.abs(point.x) < art.width / 2 && point.y > 0 && point.y < art.height);
        const next = light.points[(i + 1) % light.points.length];
        area += point.x * next.y - next.x * point.y;
      });
      assert(Math.abs(area) > 1, 'window cannot have a degenerate aperture');
    }
    for (const { glow } of art.lighting.filter(light => light.glow)) assert(glow.width > 0 && glow.height > 0 && glow.opacity > 0 && glow.opacity <= 100);
    if (twoFaces) assert(art.lighting.some(light => light.glow && light.points.every(point => point.x < 0)), 'the left-face window needs its own lit aperture and glow');
  }
  assert(fs.existsSync(path.join(root, 'assets/resources/ui/stage-stars/glow.png')));
});
