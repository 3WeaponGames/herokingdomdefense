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
if(require.main===module){const folder=process.argv[2],files=fs.statSync(folder).isDirectory()?fs.readdirSync(folder).filter(name=>/\.(dll|exe)$/i.test(name)).map(name=>path.join(folder,name)):[folder];console.log(JSON.stringify(files.map(inspect),null,2));}
module.exports={inspect};
