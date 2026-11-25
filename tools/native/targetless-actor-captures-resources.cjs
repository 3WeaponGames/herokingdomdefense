'use strict';

const { createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const CORE_INPUT = '10d42aa8d41ab27b5d54a6e0b1042b6d576050e3b382968c68e4c452764033af';
const ADAPTER_INPUT = 'fdceca7fcf63e6d6adf78501adbb364615504f8b1653e78ff0eb57c477a96116';
const CORE_OUTPUT = 'b705e82dae43badaf4e6ccbfd59aaeba254fff2dba5a19413ee73e3cb8d7ea72';
const ADAPTER_OUTPUT = '2a3b5cdabc20c2ffae722da77b70f74e3c13fd1c1c01a6898fea4ca37d2b17d8';
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const adapterCode = fs.readFileSync(path.join(__dirname, 'targetless-actor-captures-adapter.inc'), 'utf8')
    .replace(/\r\n/g, '\n').trimEnd();

function once(source, anchor, replacement) {
    if (source.split(anchor).length !== 2) throw Error('Unknown Creator targetless capture resource anchor: ' + anchor);
    return source.replace(anchor, () => replacement);
}

function patchResource(input, expectedInput, expectedOutput, transform) {
    if (!Buffer.isBuffer(input) || sha256(input) !== expectedInput) {
        throw Error('Targetless actor captures require verified Creator 2.4.13 terrain and grouped mask resources');
    }
    const original = input.toString('utf8');
    const output = transform(original.replace(/\r\n/g, '\n'));
    const bytes = Buffer.from(original.includes('\r\n') ? output.replace(/\n/g, '\r\n') : output);
    if (sha256(bytes) !== expectedOutput) throw Error('Unexpected Creator targetless capture resource output');
    return bytes;
}

function patchCore(input) {
    return patchResource(input, CORE_INPUT, CORE_OUTPUT, source => {
        const validation = '        renderComp.enabledInHierarchy ? renderComp._validateRender() : renderComp.disableRender();';
        return once(source, validation,
            '        if (RenderFlow._hkdTargetlessRequest && RenderFlow._hkdTargetlessRequest.validating) {\n' +
            '          RenderFlow._hkdTargetlessAdapter.beforeValidation(RenderFlow._hkdTargetlessRequest, renderComp);\n' +
            '        }\n' + validation);
    });
}

function patchAdapter(input) {
    return patchResource(input, ADAPTER_INPUT, ADAPTER_OUTPUT, source => {
        const render = 'var director = cc.director;\nRenderFlow.render = function (scene, dt) {';
        source = once(source, render,
            'var director = cc.director;\n' + adapterCode + '\n' +
            'var hkdTargetlessRender = RenderFlow.render = function (scene, dt) {');
        const camera = 'RenderFlow.renderCamera = function (camera, scene) {';
        source = once(source, camera, 'var hkdTargetlessRenderCamera = ' + camera);
        const ready = "    require('./jsb-skin-mesh.js');\n  });";
        source = once(source, ready,
            "    require('./jsb-skin-mesh.js');\n    cc.RenderFlow._hkdTargetlessAdapter.initialize();\n  });");
        const validate = '  _rendering = true;\n  RenderFlow.validateRenderers();';
        source = once(source, validate, `  _rendering = true;
  var targetlessRequest = hkdTargetlessEnter(this, scene, dt, camera);
  try {
    RenderFlow.validateRenderers();
  } finally {
    if (targetlessRequest) targetlessRequest.validating = false;
  }`);

        // Retain both original execution sites in the grouped dirty queue.
        for (const [dispatch, kind] of [
            ['assembler._updateRenderData && assembler._updateRenderData();', 'data'],
            ['comp._updateColor && comp._updateColor();', 'color']
        ]) {
            const anchor = new RegExp(`^([ \\t]*)${dispatch.replace(/[.*+?^$\{\}()|[\]\\]/g, '\\$&')}$`, 'gm');
            if ([...source.matchAll(anchor)].length !== 2) throw Error('Unknown Creator targetless dirty ' + kind + ' dispatch');
            source = source.replace(anchor, (_, indent) =>
                indent + `if (targetlessRequest) hkdTargetlessBeforeDirty(targetlessRequest, comp, assembler, "${kind}");\n` +
                indent + dispatch);
        }
        const native = '  this._nativeFlow.render(scene._proxy, dt, camera);';
        return once(source, native,
            '  if (targetlessRequest) hkdTargetlessDispatch(targetlessRequest, this, scene, dt, camera);\n' +
            '  else this._nativeFlow.render(scene._proxy, dt, camera);');
    });
}

module.exports = { patchCore, patchAdapter, CORE_INPUT, ADAPTER_INPUT, CORE_OUTPUT, ADAPTER_OUTPUT };
