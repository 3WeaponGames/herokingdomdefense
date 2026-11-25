'use strict';

const {createHash} = require('node:crypto');

const symbol = 'NvOptimusEnablement';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const PATCH = {
  file: 'tools/simulator/frameworks/runtime-src/proj.win32/main.cpp',
  beforeSha256: '1ea667fb72dfbc28138896281e8c9af0f0e16cce7563b30de1c2922711043a42',
  afterSha256: '8be355cc4af49651f64f767f42133f5bdc847f7b251fc3a8d8a1b68235d7665f',
  changes: [{
    before: '#include <shellapi.h>',
    after: '#include <shellapi.h>\n\nextern "C" {\n__declspec(dllexport) DWORD NvOptimusEnablement = 0x00000001;\n}'
  }]
};

function patchSource(before, patch = PATCH) {
  if (!Buffer.isBuffer(before) || sha(before) !== patch.beforeSha256) {
    throw Error('Unexpected NVIDIA Optimus source hash: ' + patch.file);
  }
  let source = before.toString('utf8');
  for (const change of patch.changes) {
    if (source.split(change.before).length !== 2) throw Error('Unexpected NVIDIA Optimus patch anchor: ' + patch.file);
    source = source.replace(change.before, () => change.after);
  }
  const after = Buffer.from(source);
  if (sha(after) !== patch.afterSha256) throw Error('Unexpected NVIDIA Optimus result hash: ' + patch.file);
  return after;
}

function verifyExport(image) {
  function requireThat(condition, reason) {
    if (!condition) throw Error('Invalid NVIDIA Optimus export: ' + reason);
  }
  function fits(offset, bytes) {
    return offset >= 0 && bytes >= 0 && offset <= image.length - bytes;
  }
  requireThat(Buffer.isBuffer(image) && fits(0, 64) && image.readUInt16LE(0) === 0x5a4d, 'invalid DOS header');
  const pe = image.readUInt32LE(0x3c);
  requireThat(pe >= 64 && fits(pe, 24) && image.readUInt32LE(pe) === 0x4550 &&
    image.readUInt16LE(pe + 4) === 0x14c, 'expected an x86 PE image');

  const optional = pe + 24;
  const optionalSize = image.readUInt16LE(pe + 20);
  const sectionStart = optional + optionalSize;
  const sectionCount = image.readUInt16LE(pe + 6);
  requireThat(optionalSize >= 104 && fits(optional, optionalSize) && image.readUInt16LE(optional) === 0x10b &&
    image.readUInt32LE(optional + 92) > 0, 'missing PE32 export directory');
  requireThat(sectionCount > 0 && fits(sectionStart, sectionCount * 40), 'truncated PE section table');

  const sections = [];
  for (let i = 0; i < sectionCount; ++i) {
    const at = sectionStart + i * 40;
    const rawSize = image.readUInt32LE(at + 16);
    const size = Math.min(image.readUInt32LE(at + 8) || rawSize, rawSize);
    const rva = image.readUInt32LE(at + 12);
    const raw = image.readUInt32LE(at + 20);
    requireThat(fits(raw, rawSize) && size <= 0x100000000 - rva, 'invalid section range');
    sections.push({name:image.toString('latin1', at, at + 8).replace(/\0.*$/, ''), rva, raw, size,
      flags:image.readUInt32LE(at + 36)});
  }

  function mapped(rva, size) {
    const matches = sections.filter(section => rva >= section.rva && rva - section.rva <= section.size - size);
    requireThat(rva !== 0 && matches.length === 1, 'unmapped or ambiguous export address');
    const section = matches[0];
    return {at:section.raw + rva - section.rva, section};
  }

  const exportRva = image.readUInt32LE(optional + 96);
  const exportSize = image.readUInt32LE(optional + 100);
  requireThat(exportRva !== 0 && exportSize >= 40, 'missing export directory');
  const {at:directory} = mapped(exportRva, exportSize);
  const addressCount = image.readUInt32LE(directory + 20);
  const nameCount = image.readUInt32LE(directory + 24);
  requireThat(addressCount > 0 && nameCount > 0, 'missing named export');
  const {at:addresses} = mapped(image.readUInt32LE(directory + 28), addressCount * 4);
  const {at:names} = mapped(image.readUInt32LE(directory + 32), nameCount * 4);
  const {at:ordinals} = mapped(image.readUInt32LE(directory + 36), nameCount * 2);

  let result;
  for (let i = 0; i < nameCount; ++i) {
    const {at, section} = mapped(image.readUInt32LE(names + i * 4), 1);
    const end = image.indexOf(0, at);
    requireThat(end >= at && end < section.raw + section.size, 'unterminated export name');
    if (image.toString('latin1', at, end) !== symbol) continue;

    const ordinal = image.readUInt16LE(ordinals + i * 2);
    requireThat(ordinal < addressCount && !result, 'invalid or duplicate export ordinal');
    const rva = image.readUInt32LE(addresses + ordinal * 4);
    requireThat(rva < exportRva || rva - exportRva >= exportSize, 'forwarded export');
    const data = mapped(rva, 4);
    const flags = data.section.flags;
    requireThat((flags & 0x40000040) === 0x40000040 && !(flags & 0x20000020), 'export is not initialized readable data');
    const value = image.readUInt32LE(data.at);
    requireThat(value === 1, 'expected DWORD value 1');
    result = {symbol, value, rva, section:data.section.name};
  }
  requireThat(result, 'missing ' + symbol);
  return result;
}

module.exports = {PATCH, patchSource, verifyExport};
