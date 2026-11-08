'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');

function fixture(lobby) {
    const exports = {}, cc = { Label: { Overflow: { CLAMP: 1 } }, color: value => value };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../../assets/_script/LanguageMgr.js'), 'utf8'), { exports, cc });
    const manager = { ready: true, currentLan: 'en', catalog: { labelStyles: { caption: { en: { width: 90, height: 50, fontSize: 60, x: -20, y: 10 } } } } };
    const node = { width: 270, height: 112, x: 0, y: -26,
        setContentSize(w, h) { this.width = w; this.height = h; }, setPosition(x, y) { this.x = x; this.y = y; } };
    const label = { node, _lobbyCaption: lobby, fontSize: 30, lineHeight: 34, overflow: 2, enableWrapText: false };
    return { manager, label, node, apply: () => exports.LanguageMgr.prototype._applyLabelStyle.call(manager, label, { template: '[[loc:caption]]' }) };
}

test('localized lobby captions retain measured geometry and keep their localized font style key', () => {
    const f = fixture(true); f.apply();
    assert.equal(f.label._localizedStyleKey, 'caption');
    assert.deepEqual([f.node.width, f.node.height, f.node.x, f.node.y, f.label.fontSize], [270, 112, 0, -26, 30]);
    f.manager.currentLan = 'zh'; f.apply();
    assert.equal(f.node.width, 270);
});

test('ordinary localized labels still use their authored style dimensions', () => {
    const f = fixture(false); f.apply();
    assert.deepEqual([f.node.width, f.node.height, f.node.x, f.node.y, f.label.fontSize], [90, 50, -20, 10, 60]);
});

test('responsive settings captions retain panel geometry after changing languages', () => {
    const f = fixture(false); f.label._settingsLayout = true; f.apply();
    assert.equal(f.label._localizedStyleKey, 'caption');
    assert.deepEqual([f.node.width, f.node.height, f.node.x, f.node.y, f.label.fontSize], [270, 112, 0, -26, 30]);
    f.manager.currentLan = 'zh'; f.apply();
    assert.equal(f.node.width, 270);
});
