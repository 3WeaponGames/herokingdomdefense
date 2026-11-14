'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { fixture } = require('./backend-ui-harness.cjs');

for (const screenWidth of [360, 750]) test(`recovery labels retain visible text and touch bounds after Cocos Label activation at width ${screenWidth}`, () => {
  const h = fixture(), addComponent = h.cc.Node.prototype.addComponent;
  h.cc.winSize.width = screenWidth;
  h.cc.Node.prototype.addComponent = function (Type) {
    const component = addComponent.call(this, Type);
    if (Type === h.cc.Label) {
      // Creator 2.4.13 CCLabel.onEnable immediately rasterizes the default
      // empty string with Overflow.NONE, resetting any preexisting width to 0.
      // The native renderer then gives zero-width labels a 1x1 blank texture.
      component.overflow = 0;
      this.setContentSize(0, 40);
      this.label = component;
    }
    return component;
  };
  let retries = 0;
  h.resources.showRuntimeRecovery(Error('controlled asset failure'), () => { retries++; }, () => {});
  assert.equal(h.paused(), true);
  const prompt = h.resources.runtimeRecoveryNode, width = Math.min(620, screenWidth - 64);
  for (const name of ['Message', 'Retry', 'Cancel']) {
    const node = prompt.getChildByName(name);
    assert.equal(node.width, width, name + ' needs nonzero text and input bounds');
    assert(node.label.string.length > 0);
    assert(node.height > 0);
  }
  // This fixture leaves sibling reordering deferred, as the native proxy does
  // until EVENT_AFTER_UPDATE. Recovery must already have a usable draw order.
  for (const name of ['Retry', 'Cancel']) {
    const surface = prompt.getChildByName(name + 'Background'), text = prompt.getChildByName(name);
    assert(surface.getSiblingIndex() < text.getSiblingIndex(), name + ' text must draw above its background while paused');
  }
  const retry = prompt.getChildByName('Retry');
  assert.equal(retry.height, 72);
  retry.handlers.end({ stopPropagation() {} });
  assert.equal(retries, 1);
  assert.equal(h.paused(), false);
});
