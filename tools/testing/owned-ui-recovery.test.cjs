'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { fixture } = require('./backend-ui-harness.cjs');

function scene() {
  const h = fixture();
  h.ui.setConf({
    active: { bundleName: 'ui', prefab: 'active', name: 'Active', zIndex: 10 },
    choice: { bundleName: 'ui', prefab: 'choice', name: 'Choice', zIndex: 10 },
    other: { bundleName: 'ui', prefab: 'other', name: 'Other', zIndex: 1 }
  });
  const Base = h.load('BaseUI').default;
  h.parent = new Base();
  h.parent.node = new h.cc.Node('Battle');
  return h;
}

function transitions(h) {
  let pending;
  h.touch.ndMask = new h.cc.Node('Mask');
  h.touch.ndMask.getComponent = () => ({ spriteFrame: { getOriginalSize: () => ({ width: 64, height: 64 }) } });
  h.cc.Tween.stopAllByTarget = target => {
    if (pending && pending.target === target) pending = null;
  };
  h.cc.tween = target => {
    const tween = {
      target,
      set() { return this; },
      to() { return this; },
      call(callback) { this.callback = callback; return this; },
      start() { pending = this; }
    };
    return tween;
  };
  return () => { const next = pending; pending = null; if (next) next.callback(); };
}

test('retired prefab success and an obsolete transition handle preserve the next transition', () => {
  const h = scene(), complete = transitions(h);
  let completions = 0, cancellations = 0;
  h.touch.onShowTransition(true, () => {});
  const firstTransition = h.ui.captureOpenTransition();
  const request = h.ui.openUIWithOwner('choice', 'battle', { onCancel() { cancellations++; } });
  request.cancel();
  h.touch.onShowTransition(false, () => { completions++; });
  assert.equal(h.ui.cancelOpenTransition(firstTransition), false);
  h.requests[0].done(null, h.asset);
  assert.equal(h.touch._inputOwners.has('transition'), true);
  complete();
  assert.equal(completions, 1);
  assert.equal(cancellations, 1);
  assert.equal(h.instantiated(), 0);
  assert.equal(h.touch._inputOwners.has('transition'), false);
});

test('cancelling an older resource recovery preserves a newer transition', () => {
  const h = scene(), complete = transitions(h);
  let entered = 0;
  h.touch.onShowTransition(true, () => {});
  h.ui.openUIWithOwner('choice', 'battle', {});
  h.requests[0].done(Error('offline'));
  h.touch.onShowTransition(true, () => { entered++; });
  h.resources.resolveRuntimeRecovery(false);
  complete();
  assert.equal(entered, 1);
});

test('a duplicate queued popup cancels only the declined owner once', () => {
  const h = scene();
  let shown = 0, declined = 0;
  h.ui.openUI('active', 'battle');
  h.requests[0].done(null, h.asset);
  const retained = h.ui.openUIWithOwner('choice', 'battle', { onOpened() { shown++; } });
  const duplicate = h.ui.openUIWithOwner('choice', 'battle', { onCancel() { declined++; } });
  assert.equal(duplicate.finished, true);
  duplicate.cancel();
  assert.equal(declined, 1);
  assert.equal(h.ui.popStatck[0].owner, retained);
  h.ui.closeById('active');
  h.requests[1].done(null, h.asset);
  assert.equal(shown, 1);
  assert.equal(retained.finished, true);
});

test('failed prefab still offers recovery when the input release listener throws', () => {
  const h = scene();
  let cancelled = 0;
  h.ui.openUIWithOwner('choice', 'battle', { onCancel() { cancelled++; } });
  h.ui.openUI('other', 'battle');
  const bus = h.modules.EventMgr.EventMgr.getInstance();
  const emit = bus.emit;
  h.modules.EventMgr.EventMgr.getInstance = () => bus;
  bus.emit = (...args) => {
    emit(...args);
    if (args[0] === 'block' && args[1] === true) throw Error('controlled listener failure');
  };
  assert.throws(() => h.requests[0].done(Error('failed prefab')), /controlled listener failure/);
  assert.equal(h.ui.isopening, false);
  assert.ok(h.resources.runtimeRecoveryNode);
  bus.emit = emit;
  h.resources.resolveRuntimeRecovery(false);
  assert.equal(cancelled, 1);
  assert.equal(h.requests.length, 2);
  h.requests[1].done(null, h.asset);
  assert.ok(h.ui.uistatck.get('other'));
});

test('required decision remains pending through Cancel and opens once after explicit Retry', () => {
  const h = scene();
  let opened = 0;
  const request = h.parent.openRequiredUI('choice', () => { opened++; });
  h.requests[0].done(Error('missing required prefab'));
  const prompt = h.resources.runtimeRecoveryNode;
  assert.equal(h.resources.runtimeCancelLabel.node.active, false);
  assert.equal(h.resources.runtimeCancelSurface.active, false);
  assert.equal(h.resources.resolveRuntimeRecovery(false), false);
  assert.equal(h.resources.runtimeRecoveryNode, prompt);
  assert.equal(h.paused(), true);
  assert.equal(request.finished, false);
  assert.equal(opened, 0);
  assert.equal(h.requests.length, 1);
  h.resources.resolveRuntimeRecovery(true);
  assert.equal(h.requests.length, 2);
  h.requests[0].done(null, h.asset);
  h.requests[1].done(null, h.asset);
  h.requests[1].done(null, h.asset);
  assert.equal(h.paused(), false);
  assert.equal(opened, 1);
  assert.equal(h.parent._pendingUIOpens.size, 0);
});

for (const exit of ['closeUI', 'onDestroy']) {
  test(`parent ${exit} retires its required recovery and restores optional Cancel`, () => {
    const h = scene();
    let cancelled = 0, opened = 0;
    const required = h.parent.openRequiredUI('choice', () => { opened++; });
    h.requests[0].done(Error('missing choice'));
    h.ui.openUIWithOwner('other', 'battle', { onCancel() { cancelled++; } });
    h.requests[1].done(Error('missing optional popup'));
    assert.equal(h.resources.runtimeFailures.length, 2);
    h.parent[exit]();
    assert.equal(required.cancelled, true);
    assert.equal(h.resources.runtimeFailures.length, 1);
    assert.equal(h.resources.runtimeCancelLabel.node.active, true);
    assert.equal(h.resources.runtimeCancelSurface.active, true);
    h.resources.resolveRuntimeRecovery(false);
    assert.equal(cancelled, 1);
    assert.equal(opened, 0);
    assert.equal(h.paused(), false);
    assert.equal(h.requests.length, 2);
  });
}

test('a required dialog with failed initialization can retry with a fresh instance', () => {
  const h = scene(), instantiate = h.cc.instantiate;
  let opened = 0;
  const request = h.parent.openRequiredUI('choice', () => { opened++; });
  h.cc.instantiate = () => {
    const node = instantiate();
    node.ui.init = () => { throw Error('controlled init failure'); };
    return node;
  };
  assert.throws(() => h.requests[0].done(null, h.asset), /controlled init failure/);
  assert.equal(request.finished, false);
  assert.equal(h.ui.uistatck.has('choice'), false);
  assert.equal(h.resources.resolveRuntimeRecovery(false), false);
  h.cc.instantiate = instantiate;
  h.resources.resolveRuntimeRecovery(true);
  h.requests[1].done(null, h.asset);
  assert.equal(opened, 1);
  assert.equal(request.finished, true);
});

test('required owner expiry allows recovery cleanup without a retry or decision', () => {
  const h = scene();
  let current = true, cancelled = 0;
  const owner = h.ui.openUIWithOwner('choice', 'battle', {
    recoveryCancelAllowed: false,
    isCurrent: () => current,
    onCancel() { cancelled++; }
  });
  h.requests[0].done(Error('failed choice'));
  current = false;
  h.resources.resolveRuntimeRecovery(false);
  assert.equal(owner.finished, true);
  assert.equal(cancelled, 1);
  assert.equal(h.resources.runtimeFailures.length, 0);
  assert.equal(h.resources.runtimeRecoveryNode, null);
  assert.equal(h.requests.length, 1);
});

test('required decision suppresses shared Reload until its own parent leaves', () => {
  const h = scene();
  let restarts = 0, abandoned = 0;
  h.cc.game = { restart() { restarts++; } };
  const owner = h.parent.openRequiredUI('choice');
  h.requests[0].done(Error('missing required decision'));
  h.resources.showRuntimeRecovery(Error('other critical asset'), () => {}, null, () => { abandoned++; });
  assert.equal(h.resources.resolveRuntimeRecovery(false), false);
  assert.equal(restarts, 0);
  assert.equal(abandoned, 0);
  owner.cancel();
  assert.equal(h.resources.runtimeCancelLabel.node.active, true);
  assert.equal(h.resources.runtimeCancelLabel.string, 'loading.reload');
  h.resources.resolveRuntimeRecovery(false);
  assert.equal(restarts, 1);
  assert.equal(abandoned, 1);
});

test('retiring an old recovery preserves the active opening and its FIFO waiting requests', () => {
  const h = scene();
  const owner = h.parent.openRequiredUI('choice');
  h.requests[0].done(Error('missing choice'));
  h.ui.openUI('other', 'battle');
  h.ui.openUI('active', 'battle');
  owner.cancel();
  assert.equal(h.ui.isopening, true);
  assert.equal(h.ui.watingOpen.length, 1);
  assert.equal(h.ui.watingOpen[0].uid, 'active');
  assert.equal(h.requests.length, 2);
  h.requests[1].done(null, h.asset);
  assert.equal(h.requests.length, 3);
  h.requests[2].done(null, h.asset);
  assert.equal(h.ui.isopening, false);
  assert.equal(h.ui.watingOpen.length, 0);
});
