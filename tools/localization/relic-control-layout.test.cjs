'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const catalog = JSON.parse(fs.readFileSync(path.join(root, 'assets/resources/localization/catalog.json'), 'utf8'));

for (const [key, label] of [
  ['ui.layout.kinghtfalluitreasureinfo.44', 'Locked'],
  ['ui.layout.kinghtfalluitreasureinfo.49', 'Upgrade']
]) {
  test('shared relic ' + label + ' caption reserves a padded single line in Chinese', () => {
    const styles = catalog.labelStyles[key], text = catalog.entries[key].zh;
    assert.equal(text.includes('\n'), false);
    assert.equal(styles.zh.fontSize, styles.en.fontSize, 'locale fitting preserves the established font size');
    assert.equal(styles.zh.lineHeight, styles.en.lineHeight);
    assert.equal(styles.zh.width, styles.en.width, 'both locales use the same reserved control space');
    // A box exactly as wide as its Han glyph advances leaves no room for
    // native-font padding and strokes, which caused the observed 2+1 wrap.
    assert(styles.zh.width >= (Array.from(text).length + .5) * styles.zh.fontSize,
      'the short caption has room for native glyph padding and outlines');
    assert.equal(styles.zh.overflow, 'RESIZE_HEIGHT');
  });
}
