'use strict';
const fs=require('node:fs'),path=require('node:path');
function inspect(file){
 const data=fs.readFileSync(file),pe=data.readUInt32LE(0x3c);if(data.toString('ascii',pe,pe+4)!=='PE\0\0')throw Error('Not PE: '+file);
 const machine=data.readUInt16LE(pe+4),count=data.readUInt16LE(pe+6),size=data.readUInt16LE(pe+20),optional=pe+24,magic=data.readUInt16LE(optional),directory=optional+(magic===0x10b?96:112),sections=[];
 for(let i=0;i<count;i++){const at=optional+size+i*40;sections.push({rva:data.readUInt32LE(at+12),size:Math.max(data.readUInt32LE(at+8),data.readUInt32LE(at+16)),raw:data.readUInt32LE(at+20)});}
 function offset(rva){if(!rva)return null;for(const s of sections)if(rva>=s.rva&&rva<s.rva+s.size)return s.raw+rva-s.rva;throw Error('Bad RVA: '+file);}
 function string(at){let end=at;while(data[end])end++;return data.toString('ascii',at,end);}
 const imports=[],delayed=[],rva=data.readUInt32LE(directory+8);let at=offset(rva);
 if(at!==null)while(data.readUInt32LE(at)||data.readUInt32LE(at+12)){imports.push(string(offset(data.readUInt32LE(at+12))));at+=20;}
 const delayRVA=data.readUInt32LE(directory+13*8);at=offset(delayRVA);
 if(at!==null)while(data.readUInt32LE(at)||data.readUInt32LE(at+4)){const attributes=data.readUInt32LE(at),name=data.readUInt32LE(at+4);if(!(attributes&1))throw Error('Unsupported delay import VA');delayed.push(string(offset(name)));at+=32;}
 return{file,machine:machine.toString(16),architecture:machine===0x14c?'x86':machine===0x8664?'x64':'other',imports,delayed};
}

function verifyDwordExport(image, symbol, label) {
  function requireThat(condition, reason) {
    if (!condition) throw Error('Invalid ' + label + ' export: ' + reason);
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

if(require.main===module){const folder=process.argv[2],files=fs.statSync(folder).isDirectory()?fs.readdirSync(folder).filter(name=>/\.(dll|exe)$/i.test(name)).map(name=>path.join(folder,name)):[folder];console.log(JSON.stringify(files.map(inspect),null,2));}
module.exports={inspect,verifyDwordExport};
