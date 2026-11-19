'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { prepareRelease, retargetAtlas } = require('../native/prepare-android-release.cjs');

test('Android staging follows dynamic paths, Cocos frames and Spine pages', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'hkd-android-release-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const source = path.join(directory, 'source');
  const output = path.join(directory, 'android');
  const rig = 'resources/unit-library/fantasy-monsters/Units/quest';
  const map = 'KinghtFallIconMap/Generated/Maps/quest';
  const frame = 'e8ef74c7-7697-4ec7-93ac-b2fae22cac8a';
  const texture = '125d21f8-b2f3-4504-ad18-76a61d92fa9e';
  const kept = [rig + '.json', rig + '.atlas', 'resources/unit-library/fantasy-monsters/Units/rig.png',
    map + '/atlas.plist', map + '/atlas.png', 'resources/unit-library/mount-icons/hero-horse-blue.png'];
  const excluded = ['resources/unit-library/fantasy-monsters/Atlases/rig.png',
    'KinghtFallIconMap/Generated/Maps/draft/atlas.png', 'resources/character-parts/Thumbnail/part.png'];
  function write(file, content) {
    const absolute = path.join(source, file);
    fs.mkdirSync(path.dirname(absolute), { recursive: true });
    fs.writeFileSync(absolute, typeof content === 'string' ? content : JSON.stringify(content));
  }
  write('project.json', { version: '2.4.13' });
  write('assets/_script/loader.js', 'cc.resources.load("unit-library/fantasy-monsters/Units/quest");');
  write('assets/KinghtFallIconMap/Generated/Stages/A-1.prefab', [{ __uuid__: frame }]);
  write('assets/' + rig + '.json', {});
  write('assets/' + rig + '.json.meta', { importer: 'spine' });
  write('assets/' + rig + '.atlas', 'rig.png\nsize: 20, 20\n');
  write('assets/' + map + '/atlas.plist.meta', { rawTextureUuid: texture, subMetas: { frame: { uuid: frame } } });
  write('assets/' + map + '/atlas.png.meta', { uuid: texture });
  write('assets/' + map + '.meta', { importer: 'folder' });
  for (const file of kept.slice(2).concat(excluded)) write('assets/' + file, 'data');
  write('assets/resources/character-parts/catalog.json', { parts: [{ thumbnail: 'assets/' + excluded[2] }] });

  const result = prepareRelease(fs.realpathSync(source), output);
  for (const file of kept) assert.ok(fs.existsSync(path.join(output, 'assets', file)), file);
  assert.ok(fs.existsSync(path.join(output, 'assets', map + '.meta')));
  for (const file of excluded) {
    assert.ok(fs.existsSync(path.join(source, 'assets', file)), file);
    assert.ok(!fs.existsSync(path.join(output, 'assets', file)), file);
  }
  assert.equal(result.removedFiles, excluded.length);
  assert.throws(() => prepareRelease(fs.realpathSync(source), path.join(source, 'android')), /outside the source project/);
});

test('WebP conversion updates atlas page names while retaining frame names', () => {
  const conversions = new Map([['test/page.png', 'test/page.webp']]);
  const spine = 'page.png\nsize: 90, 40\nformat: RGBA8888\npage.png\n  rotate: false\n';
  const plist = '<key>page.png</key>\n<key>textureFileName</key> <string>page.png</string>';
  assert.equal(retargetAtlas(spine, 'test/skeleton.atlas', conversions), spine.replace('page.png', 'page.webp'));
  assert.equal(retargetAtlas(plist, 'test/atlas.plist', conversions), plist.replace('string>page.png', 'string>page.webp'));
});
