'use strict';

const {createHash} = require('node:crypto');

const DIRECTORY = 'terrain-geometry-revision';
const FEATURE = 'terrainGeometryRevision';
const CORE = 'simulator/win32/src/cocos2d-jsb.js';
const ADAPTER = 'simulator/win32/jsb-adapter/jsb-engine.js';
const STOCK_CORE_SHA256 = '8ca187b6686665a32943f57af84ddf12448c017e882da738d5511887d527e4f7';
const STOCK_ADAPTER_SHA256 = 'e447b3d0bcfe96b880e017819377deb10df76ca117ea21fb2fb102ff5f0328b2';
const GROUPED_ADAPTER_SHA256 = '6d286a6c247048750ef76df011edd27ef400f294207be178e046bf01a199650c';
const CORE_SHA256 = '10d42aa8d41ab27b5d54a6e0b1042b6d576050e3b382968c68e4c452764033af';
const ADAPTER_SHA256 = 'a7bf91b742b263a7eb140e6d4fcda0ff5e2439fec7fdc3a6e362d489bc3c13ae';
const COMPOSED_ADAPTER_SHA256 = 'fdceca7fcf63e6d6adf78501adbb364615504f8b1653e78ff0eb57c477a96116';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');

const install = `    (function () {
      var listeners = new WeakMap(), noMembership = new WeakMap();
      var api = {
        version: 1,
        track: function (members, ancestors) {
          if (!Array.isArray(members) || !members.length || !Array.isArray(ancestors)) return null;
          var unique = new Set(members);
          for (var node of unique) if (!node || typeof node !== "object" || listeners.has(node)) return null;
          for (var ancestor of ancestors) if (!unique.has(ancestor)) return null;
          var ticket = {value: 0};
          for (var node of unique) listeners.set(node, ticket);
          for (var ancestor of ancestors) noMembership.set(ancestor, ticket);
          return ticket;
        },
        release: function (ticket, members) {
          for (var i = 0; i < members.length; ++i) {
            var member = members[i];
            if (listeners.get(member) === ticket) listeners.delete(member);
            if (noMembership.get(member) === ticket) noMembership.delete(member);
          }
        },
        mark: function (node) {
          var ticket = listeners.get(node);
          if (ticket) ticket.value++;
        },
        markMembership: function (node) {
          var ticket = listeners.get(node);
          if (ticket && noMembership.get(node) !== ticket) ticket.value++;
        }
      };
      Object.defineProperty(cc, "_hkdTerrainGeometry", {value: Object.freeze(api)});
    })();`;

// Commit before the stock callback can reenter a read of a partly updated node.
const writers = [
  ['            this._is3DNode = v;\n            this._update3DFunction();', 'this'],
  ['              anchorPoint.x = value;\n              this._eventMask & ANCHOR_ON', 'this'],
  ['              anchorPoint.y = value;\n              this._eventMask & ANCHOR_ON', 'this'],
  ['              this._contentSize.width = value;\n              if (this._eventMask & SIZE_ON)', 'this'],
  ['              this._contentSize.height = value;\n              if (this._eventMask & SIZE_ON)', 'this'],
  ['          locContentSize.width = size.width;\n          locContentSize.height = size.height;', 'this'],
  ['          locContentSize.height = size.height;\n        } else {', 'this'],
  ['          locContentSize.height = height;\n        }', 'this'],
  ['          locAnchorPoint.x = point.x;\n          locAnchorPoint.y = point.y;', 'this'],
  ['          locAnchorPoint.y = point.y;\n        } else {', 'this'],
  ['          locAnchorPoint.y = y;\n        }', 'this'],
  ['            this._spriteFrame = value;\n            this._applySpriteFrame(lastSprite);', 'this'],
  ['              this._isTrimmedMode = value;\n              this._type !== SpriteType.SIMPLE', 'this'],
  ['              this._type = value;\n              this.setVertsDirty();\n              this._resetAssembler();', 'this'],
  ['              this._enabled = value;\n              if (this.node._activeInHierarchy)', 'this'],
  ['        this.node._renderComponent = this;\n        this.node._renderFlag |= RenderFlow.FLAG_OPACITY_COLOR;', 'this.node'],
  ['        this.node._renderComponent = null;\n        this.disableRender();', 'this.node'],
  ['        node._activeInHierarchy = true;\n        var originCount', 'node'],
  ['        node._activeInHierarchy = false;\n        var originCount', 'node'],
  ['        this._components.push(component);\n        (false, false) && cc.engine', 'this'],
  ['            this._components.splice(i, 1);\n            (false, false) && cc.engine', 'this'],
  ['        this._objFlags |= Destroying;\n        var parent = this._parent;', 'this']
];
const commit = (indent, owner, method = 'mark') => indent+'cc._hkdTerrainGeometry.'+method+'('+owner+');';
const insertAfterLine = (before, ...lines) => ({
  before, after: [before.slice(0,before.indexOf('\n')), ...lines, before.slice(before.indexOf('\n')+1)].join('\n')
});
const engineVersion = '    _global["CocosEngine"] = cc.ENGINE_VERSION = engineVersion;';
const coreChanges = [
  {before: engineVersion, after: engineVersion+'\n'+install},
  ...writers.map(([before,owner])=>insertAfterLine(before,commit(before.match(/^ +/)[0],owner))),
  {before:'        this._super() && this._enabled && this.node._activeInHierarchy && cc.director._compScheduler.disableComp(this);',
    after: commit('        ','this')+'\n        this._super() && this._enabled && this.node._activeInHierarchy && cc.director._compScheduler.disableComp(this);'},
  insertAfterLine('        this._parent = value || null;\n        this._onSetParent(value);',
    commit('        ','this'),commit('        ','oldParent','markMembership'),commit('        ','value','markMembership')),
  insertAfterLine('          value._children.push(this);\n          value.emit && value.emit(CHILD_ADDED, this);',
    commit('          ','value','markMembership')),
  insertAfterLine('            oldParent._children.splice(removeAt, 1);\n            oldParent.emit && oldParent.emit(CHILD_REMOVED, this);',
    commit('            ','oldParent','markMembership')),
  insertAfterLine('          parent._children.splice(childIndex, 1);\n          parent.emit && parent.emit("child-removed", this);',
    commit('          ','parent','markMembership')),
  insertAfterLine('          index < siblings.length ? siblings.splice(index, 0, this) : siblings.push(this);\n          this._onSiblingIndexChanged && this._onSiblingIndexChanged(index);',
    commit('          ','this'),commit('          ','this._parent','markMembership'))
];
const localDirty = 'cc.Node.prototype.setLocalDirty = function (flag) {\n  this._localMatDirty |= flag;';
const adapterChanges = [{before: localDirty, after: localDirty+'\n'+commit('  ','this')}];
const PATCHES = [
  {file: CORE,beforeSha256: STOCK_CORE_SHA256,afterSha256: CORE_SHA256,changes: coreChanges},
  {file: ADAPTER,beforeSha256: STOCK_ADAPTER_SHA256,afterSha256: ADAPTER_SHA256,changes: adapterChanges}
];

function apply(bytes, changes, file) {
  const original = bytes.toString('utf8');
  let source = original.replace(/\r\n/g,'\n');
  for (const {before,after} of changes) {
    if (source.split(before).length !== 2) throw Error('Unsupported terrain geometry revision anchor: '+file);
    source = source.replace(before,()=>after);
  }
  return Buffer.from(original.includes('\r\n') ? source.replace(/\n/g,'\r\n') : source);
}

function patchSource(bytes, patch) {
  if (sha(bytes) !== patch.beforeSha256) throw Error('Unsupported terrain geometry revision source: '+patch.file);
  const result = apply(bytes,patch.changes,patch.file);
  if (sha(result) !== patch.afterSha256) throw Error('Unexpected terrain geometry revision result: '+patch.file);
  return result;
}

function patchGroupedAdapter(bytes) {
  return patchSource(bytes,{...PATCHES[1],beforeSha256: GROUPED_ADAPTER_SHA256,afterSha256: COMPOSED_ADAPTER_SHA256});
}

module.exports = {DIRECTORY,FEATURE,CORE,ADAPTER,PATCHES,patchSource,patchGroupedAdapter};
