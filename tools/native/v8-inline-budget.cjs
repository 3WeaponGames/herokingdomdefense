'use strict';

const {createHash} = require('node:crypto');
const {verifyDwordExport} = require('./pe-imports.cjs');

const DIRECTORY = 'v8-inline-budget';
const FEATURE = 'v8InlineBudget';
const SYMBOL = 'HKDV8InlineBudget';
const WINDOWS_X86 = '#if defined(_WIN32) && defined(_M_IX86)';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');

function definitions() {
  const include = '#include <sstream>';
  const initialize = '        bool ok = v8::V8::Initialize();';
  return [{
    file: 'cocos/scripting/js-bindings/jswrapper/v8/ScriptEngine.cpp',
    beforeSha256: '925c47c47fec602212c97503a9f605e34c34c6d4b189e79773e30336aebaf23c',
    afterSha256: '403870af4b2a0f19d875cb4e5bc87f2494163fe193e67d5fc9b24028dbfa90d9',
    changes: [{
      before: include,
      after: [
        include,
        '',
        WINDOWS_X86,
        'extern "C" {',
        '__declspec(dllexport) uint32_t ' + SYMBOL + ' = 1;',
        '}',
        '#endif'
      ].join('\n')
    }, {
      before: initialize,
      after: [
        WINDOWS_X86,
        '        // Increase TurboFan inlining budgets for the Windows x86 battle workload.',
        '        char program[] = "hkd-preview";',
        '        char single[] = "--max-inlined-bytecode-size=750";',
        '        char cumulative[] = "--max-inlined-bytecode-size-cumulative=1500";',
        '        char smallLimitFlag[] = "--max-inlined-bytecode-size-small=50";',
        '        char* args[] = {program, single, cumulative, smallLimitFlag, nullptr};',
        '        int count = 4;',
        '        v8::V8::SetFlagsFromCommandLine(&count, args, true);',
        '        assert(count == 1);',
        '#endif',
        initialize
      ].join('\n')
    }]
  }];
}

function patchSource(before, patch) {
  if (!Buffer.isBuffer(before) || sha(before) !== patch.beforeSha256) {
    throw Error('Unsupported V8 inline budget source hash: ' + patch.file);
  }
  const original = before.toString('utf8');
  let source = original.replace(/\r\n/g, '\n');
  for (const change of patch.changes) {
    if (source.split(change.before).length !== 2) {
      throw Error('Unsupported V8 inline budget patch anchor: ' + patch.file);
    }
    source = source.replace(change.before, () => change.after);
  }
  const after = Buffer.from(original.includes('\r\n') ? source.replace(/\n/g, '\r\n') : source);
  if (sha(after) !== patch.afterSha256) throw Error('Unexpected V8 inline budget result hash: ' + patch.file);
  return after;
}

function verifyExport(image) {
  return verifyDwordExport(image, SYMBOL, 'V8 inline budget');
}

module.exports = {DIRECTORY, FEATURE, definitions, patchSource, verifyExport};
