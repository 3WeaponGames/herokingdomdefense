'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.resolve(__dirname, '../../assets/_script/SettingsPictogram.js'), 'utf8');

function fixture() {
  const pending = [];
  class Component {}
  class Sprite {}
  class SpriteFrame {}
  const cc = {
    Component, Sprite, SpriteFrame,
    Class(definition) {
      class Script extends definition.extends {}
      for (const [key, value] of Object.entries(definition)) if (key !== 'extends') Script.prototype[key] = value;
      return Script;
    },
    isValid(value) { return !!value && value.valid !== false; },
    resources: { load(resource, type, done) { pending.push({ resource, type, done }); } }
  };
  const context = { cc, exports: {} };
  vm.runInNewContext(source, context, { filename: 'SettingsPictogram.js' });
  const owner = new context.exports.SettingsPictogram();
  const sprite = { spriteFrame: null };
  owner.node = { getComponent(Type) { assert.equal(Type, Sprite); return sprite; } };
  function frame(name) {
    return {
      name, adds: 0, releases: 0, refs: 0,
      addRef() { this.adds++; this.refs++; return this; },
      decRef() { this.releases++; this.refs--; assert(this.refs >= 0, 'released a frame without owning it'); return this; }
    };
  }
  return { owner, sprite, pending, frame, SpriteFrame };
}

test('a delayed pictogram loads once and owns one frame while repeated layout requests reuse it', () => {
  const f = fixture(), music = f.frame('music');
  f.owner.setResource('icons/Pictograms/Pictoicon_Music');
  f.owner.setResource('icons/Pictograms/Pictoicon_Music');
  assert.equal(f.pending.length, 1);
  assert.equal(f.pending[0].type, f.SpriteFrame);
  assert.equal(f.sprite.spriteFrame, null);
  assert.equal(music.adds, 0);

  f.pending[0].done(null, music);
  assert.equal(f.sprite.spriteFrame, music);
  assert.equal(music.adds, 1);
  assert.equal(music.refs, 1);
  f.owner.setResource('icons/Pictograms/Pictoicon_Music');
  assert.equal(f.pending.length, 1);
  assert.equal(music.adds, 1);
});

test('callbacks for superseded pictograms cannot replace the current icon or acquire stale frames', () => {
  const f = fixture(), stale = f.frame('music'), current = f.frame('sound');
  f.owner.setResource('music');
  f.owner.setResource('sound');
  f.pending[1].done(null, current);
  f.pending[0].done(null, stale);
  assert.equal(f.sprite.spriteFrame, current);
  assert.equal(current.refs, 1);
  assert.equal(stale.adds, 0);
  assert.equal(stale.releases, 0);
  f.owner.setResource('sound');
  assert.equal(f.pending.length, 2);
});

test('replacing a visible pictogram releases its previous frame and destruction releases the replacement', () => {
  const f = fixture(), first = f.frame('music'), second = f.frame('globe');
  f.owner.setResource('music');
  f.pending[0].done(null, first);
  f.owner.setResource('globe');
  assert.equal(f.sprite.spriteFrame, first, 'keep the existing icon while its replacement loads');
  assert.equal(first.refs, 1);
  f.pending[1].done(null, second);
  assert.equal(f.sprite.spriteFrame, second);
  assert.equal(first.refs, 0);
  assert.equal(first.releases, 1);
  assert.equal(second.refs, 1);

  f.owner.onDestroy();
  assert.equal(f.sprite.spriteFrame, null);
  assert.equal(f.owner._frame, null);
  assert.equal(second.refs, 0);
  assert.equal(second.releases, 1);
});

test('destroying a panel before its icon arrives ignores delayed success without retaining a frame', () => {
  const f = fixture(), late = f.frame('joystick');
  f.owner.setResource('joystick');
  f.owner.onDestroy();
  f.owner.setResource('sound');
  assert.equal(f.pending.length, 1, 'disposed controls must not start new requests');
  f.pending[0].done(null, late);
  assert.equal(f.sprite.spriteFrame, null);
  assert.equal(f.owner._frame, null);
  assert.equal(late.adds, 0);
  assert.equal(late.releases, 0);
});

test('destroying a panel during a replacement releases the displayed frame and rejects the new result', () => {
  const f = fixture(), old = f.frame('music'), late = f.frame('sound');
  f.owner.setResource('music');
  f.pending[0].done(null, old);
  f.owner.setResource('sound');
  f.owner.onDestroy();
  f.pending[1].done(null, late);
  assert.equal(f.sprite.spriteFrame, null);
  assert.equal(old.refs, 0);
  assert.equal(old.releases, 1);
  assert.equal(late.adds, 0);
  assert.equal(late.releases, 0);
});

test('invalidated components or nodes ignore load success without acquiring the frame', () => {
  for (const invalid of ['component', 'node']) {
    const f = fixture(), late = f.frame(invalid);
    f.owner.setResource('music');
    (invalid === 'component' ? f.owner : f.owner.node).valid = false;
    f.pending[0].done(null, late);
    assert.equal(f.sprite.spriteFrame, null);
    assert.equal(late.adds, 0);
    assert.equal(late.releases, 0);
  }
});

test('a failed replacement can retry the same resource while retaining the last successful icon', () => {
  const f = fixture(), first = f.frame('music'), second = f.frame('sound');
  f.owner.setResource('music');
  f.pending[0].done(null, first);
  f.owner.setResource('sound');
  f.pending[1].done(new Error('temporary load failure'));
  assert.equal(f.sprite.spriteFrame, first);
  assert.equal(first.refs, 1);

  f.owner.setResource('sound');
  assert.equal(f.pending.length, 3, 'a previous resource frame must not suppress retry');
  f.pending[2].done(null, second);
  assert.equal(f.sprite.spriteFrame, second);
  assert.equal(first.refs, 0);
  assert.equal(second.refs, 1);
  f.owner.onDestroy();
  assert.equal(second.refs, 0);
});
