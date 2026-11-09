'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const temporary = require('./owned-temp');
const Assets = require('../lib/unit-assets');

function withRoots(engine, spine, run) {
    const names = ['COCOS_ENGINE_ROOT', 'COCOS_SPINE_ROOT'];
    const before = names.map(name => process.env[name]);
    try {
        for (const [index, value] of [engine, spine].entries()) {
            if (value === undefined) delete process.env[names[index]];
            else process.env[names[index]] = value;
        }
        return run();
    } finally {
        names.forEach((name, index) => {
            if (before[index] === undefined) delete process.env[name];
            else process.env[name] = before[index];
        });
    }
}
function runtime(root) {
    const file = path.join(root, 'extensions/spine/lib/spine.js');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, 'module.exports = { fixture: true };');
    return file;
}

test('standalone Spine dependencies resolve without configuring a full Creator installation', () => {
    const root = temporary('hkd-standalone-spine-'), file = runtime(root);
    withRoots(undefined, root, () => {
        assert.equal(Assets.enginePath(), file);
        assert.equal(process.env.COCOS_ENGINE_ROOT, undefined);
    });
});
test('a configured full Creator installation takes precedence over a standalone Spine dependency', () => {
    const engine = temporary('hkd-creator-engine-'), spine = temporary('hkd-standalone-spine-');
    const expected = runtime(engine); runtime(spine);
    withRoots(engine, spine, () => assert.equal(Assets.enginePath(), expected));
});
test('a missing explicitly configured Creator runtime cannot silently fall back to standalone files', () => {
    const engine = temporary('hkd-missing-engine-'), spine = temporary('hkd-standalone-spine-'); runtime(spine);
    withRoots(engine, spine, () => assert.throws(() => Assets.enginePath(), /Configured COCOS_ENGINE_ROOT has no Creator Spine runtime/));
});
test('missing or directory-only standalone runtimes fail instead of using a machine-specific Creator install', () => {
    const root = temporary('hkd-missing-spine-');
    withRoots(undefined, root, () => assert.throws(() => Assets.enginePath(), /Configured COCOS_SPINE_ROOT has no Creator Spine runtime/));
    fs.mkdirSync(path.join(root, 'extensions/spine/lib/spine.js'), { recursive: true });
    withRoots(undefined, root, () => assert.throws(() => Assets.enginePath(), /Configured COCOS_SPINE_ROOT has no Creator Spine runtime/));
});
