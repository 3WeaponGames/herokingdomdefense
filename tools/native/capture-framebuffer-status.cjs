'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const specs = require('./framebuffer-status-reuse-specs.json');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');

function withFragments(definition) {
    const changes = definition.changes.map(({before,after,afterFragment})=>{
        if (!afterFragment) return {before,after};
        const source=fs.readFileSync(path.join(__dirname,afterFragment),'utf8').replace(/\r\n/g,'\n');
        if(sha(source)!==specs.fragments[afterFragment]) throw Error('Unexpected framebuffer status fragment: '+afterFragment);
        return {before,after:source+'\n'+before};
    });
    return {...definition,changes};
}
function definitions(withRegionBounds = false) {
    const spine = withRegionBounds ? 'both' : 'inventory';
    return [...specs.units,specs.spine[spine]].map(withFragments);
}
function patchSource(before, patch) {
    if(sha(before)!==patch.beforeSha256) throw Error('Unsupported framebuffer status source hash: '+patch.file);
    const original=before.toString('utf8');
    let text=original.replace(/\r\n/g,'\n');
    for(const change of patch.changes){
        if(text.split(change.before).length!==2) throw Error('Unsupported framebuffer status patch anchor: '+patch.file);
        text=text.replace(change.before,()=>change.after);
    }
    const result=Buffer.from(original.includes('\r\n')?text.replace(/\n/g,'\r\n'):text);
    if(sha(result)!==patch.afterSha256) throw Error('Unexpected framebuffer status patch output: '+patch.file);
    return result;
}
module.exports={definitions,patchSource};

