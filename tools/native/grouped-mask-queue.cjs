'use strict';

const { createHash } = require('node:crypto');

const STOCK_SHA256 = 'e447b3d0bcfe96b880e017819377deb10df76ca117ea21fb2fb102ff5f0328b2';
const PATCHED_SHA256 = '6d286a6c247048750ef76df011edd27ef400f294207be178e046bf01a199650c';
const sha256 = input => createHash('sha256').update(input).digest('hex');

const queueDeclaration = `var _dirtyWaiting = [];
var hkdCurrentRuns = 0, hkdWaitingRuns = 0;
function HkdMaskRun(owner) {
  this.owner = owner;
  this.members = [];
  this.poisoned = false;
}
var hkdMaskQueue = RenderFlow._hkdMaskQueue = {
  scope: null,
  invalidate: function (node) {
    if (node && node._hkdMaskRun) node._hkdMaskRun.poisoned = true;
  }
};
function forgetHkdMaskRuns(queue) {
  for (var i = 0; i < queue.length; ++i) {
    var run = queue[i];
    if (!(run instanceof HkdMaskRun)) continue;
    for (var j = 0; j < run.members.length; ++j) {
      var node = run.members[j];
      if (node._hkdMaskRun === run) node._hkdMaskRun = null;
    }
  }
}`;

const groupedDispatch = `  var owner = hkdMaskQueue.enabled !== false && hkdMaskQueue.scope;
  var branch = owner && camera && owner.camera && owner.camera._camera === camera && owner.branch;
  if (!branch && !hkdCurrentRuns) {
/* ORIGINAL LOOP */
  } else {
    var members = null, memberIndex = 0;
    for (var position = 0, length = _dirtyTargets.length; position < length || members;) {
      var node;
      if (members) {
        node = members[memberIndex++];
        node._hkdMaskRun = null;
        if (memberIndex === members.length) members = null;
      } else {
        node = _dirtyTargets[position++];
        if (node instanceof HkdMaskRun) {
          if (branch && hkdMaskQueue.scope === owner && hkdMaskQueue.enabled !== false &&
              node.owner === owner && !node.poisoned && branch._hkdMaskRun !== node) {
            _dirtyWaiting.push(node);
            ++hkdWaitingRuns;
            continue;
          }
          members = node.members;
          memberIndex = 0;
          continue;
        }
      }
      if (branch && hkdMaskQueue.scope === owner && hkdMaskQueue.enabled !== false) {
        var component = node._renderComponent;
        var maskAssembler = component && component._assembler;
        var update = maskAssembler && maskAssembler._updateRenderData;
        var dirty = update && update._hkdCarryDirtyMask && node._dirtyPtr;
        var flags = dirty ? dirty[0] : 0;
        if ((flags & RenderFlow.FLAG_UPDATE_RENDER_DATA) && !(flags & RenderFlow.FLAG_COLOR) &&
            update._hkdCarryDirtyMask()) {
          // The original generated mask update requeues at this position.
          // Keep its pending bit and merge only adjacent members.
          var tail = _dirtyWaiting[_dirtyWaiting.length - 1];
          if (!(tail instanceof HkdMaskRun) || tail.owner !== owner || tail.poisoned) {
            tail = new HkdMaskRun(owner);
            _dirtyWaiting.push(tail);
            ++hkdWaitingRuns;
          }
          tail.members.push(node);
          node._hkdMaskRun = tail;
          continue;
        }
      }
/* ORIGINAL DISPATCH */
    }
  }
`;

function replaceOnce(source, anchor, replacement) {
    if (source.split(anchor).length !== 2) throw new Error('Unexpected foreground mask adapter structure: ' + anchor);
    return source.replace(anchor, () => replacement);
}

function patch(input) {
    const before = Buffer.isBuffer(input) ? input : typeof input === 'string' ? Buffer.from(input) : null;
    if (!before || sha256(before) !== STOCK_SHA256) {
        throw new Error('Grouped foreground masks require the verified Creator 2.4.13 native adapter');
    }
    const original = before.toString('utf8');
    let source = original.replace(/\r\n/g, '\n');
    const parentUpdate = '  updateParent: function updateParent() {\n    var parent = this._owner._parent;';
    source = replaceOnce(source, parentUpdate, '  updateParent: function updateParent() {\n' +
        '    if (this._owner._hkdMaskRun) RenderFlow._hkdMaskQueue.invalidate(this._owner);\n' +
        '    var parent = this._owner._parent;');

    const flagSetter = '}, function (flag) {\n  this._dirtyPtr[0] = flag;';
    source = replaceOnce(source, flagSetter, '}, function (flag) {\n' +
        '  if (this._hkdMaskRun) RenderFlow._hkdMaskQueue.invalidate(this);\n' +
        '  this._dirtyPtr[0] = flag;');

    const registration = 'RenderFlow.register = function (target) {\n  if (target._inJsbDirtyList) return;';
    source = replaceOnce(source, registration, 'RenderFlow.register = function (target) {\n' +
        '  if (target._hkdMaskRun) hkdMaskQueue.invalidate(target);\n' +
        '  if (target._inJsbDirtyList) return;');

    source = replaceOnce(source, 'var _dirtyWaiting = [];', queueDeclaration);
    const handoff = '  _dirtyTargets = _dirtyWaiting.slice(0);';
    source = replaceOnce(source, handoff, '  if (hkdCurrentRuns) forgetHkdMaskRuns(_dirtyTargets);\n' +
        handoff + '\n  hkdCurrentRuns = hkdWaitingRuns;\n  hkdWaitingRuns = 0;');
    const reset = '  _dirtyTargets.length = 0;\n  dt = dt || 0;';
    source = replaceOnce(source, reset, '  _dirtyTargets.length = 0;\n  hkdCurrentRuns = 0;\n  dt = dt || 0;');

    const loop = '  for (var i = 0, l = _dirtyTargets.length; i < l; i++) {\n    var node = _dirtyTargets[i];\n';
    const from = source.indexOf(loop);
    const to = source.indexOf('  _dirtyTargets.length = 0;', from);
    if (from < 0 || to <= from || source.indexOf(loop, from + loop.length) !== -1) {
        throw new Error('Could not locate the stock Creator dirty queue loop');
    }
    const stockLoop = source.slice(from, to);
    if (!stockLoop.endsWith('  }\n')) throw new Error('Unexpected Creator dirty queue dispatch body');
    const stockBody = stockLoop.slice(loop.length, -4);
    const dispatch = groupedDispatch.replace('/* ORIGINAL LOOP */', stockLoop.trimEnd())
        .replace('/* ORIGINAL DISPATCH */', stockBody.trimEnd());
    source = source.slice(0, from) + dispatch + source.slice(to);
    const result = Buffer.from(original.includes('\r\n') ? source.replace(/\n/g, '\r\n') : source);
    if (sha256(result) !== PATCHED_SHA256) throw new Error('Unexpected grouped foreground mask adapter result');
    return result;
}

module.exports = { patch, STOCK_SHA256, PATCHED_SHA256 };
