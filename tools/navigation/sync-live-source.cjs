'use strict';
// Refresh registered CommonJS gameplay modules in the disposable debug export.
// Preserve Creator registration IDs/dependency mappings and all exported assets.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../..'),exportRoot=process.env.LIVE_GATE_EXPORT?path.resolve(process.env.LIVE_GATE_EXPORT):path.join(root,'local/live-gates/export/web-mobile'),folder=path.join(exportRoot,'assets/main');
const bundle=path.join(folder,fs.readdirSync(folder).find(n=>/^index.*\.js$/.test(n)));
let code=fs.readFileSync(bundle,'utf8'); const report=[];
for(const name of process.argv.slice(2)) {
  if(!/^[A-Za-z0-9_]+$/.test(name))throw Error('Invalid module name');
  const file=path.join(root,'assets/_script',name+'.js'),source=fs.readFileSync(file,'utf8');
  const header='  '+name+': [ function(require, module, exports) {';
  const index=code.indexOf(header);if(index<0)throw Error('Unregistered module '+name);
  const push=code.indexOf('cc._RF.push(',index);
  let start,end;
  if(push>=0&&push<index+300) {
    start=code.indexOf(';',push)+1;end=code.indexOf('cc._RF.pop();',start);
  } else {
    // Plain helper modules do not have Creator component registration IDs.
    // Preserve their existing wrapper and require an empty dependency table.
    start=index+header.length;
    const next=/^  [A-Za-z0-9_]+: \[ function\(require, module, exports\) \{/gm;
    next.lastIndex=start;const match=next.exec(code);
    const section=code.slice(start,match?match.index:code.length);
    const footer=/\n  }, \{\} \],\s*$/.exec(section);
    if(!footer)throw Error('Unexpected plain module wrapper '+name);
    end=start+footer.index;
  }
  if(end<start)throw Error('Unexpected module wrapper '+name);
  code=code.slice(0,start)+'\n'+source+'\n    '+code.slice(end);
  report.push({module:name,sha256:crypto.createHash('sha256').update(source).digest('hex')});
}
fs.writeFileSync(bundle,code);fs.writeFileSync(path.join(root,'local/live-gates/synced-source.json'),JSON.stringify(report,null,2));
console.log('Synced registered source modules:',report.map(r=>r.module).join(', '));
