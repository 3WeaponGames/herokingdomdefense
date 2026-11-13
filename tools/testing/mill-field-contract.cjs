'use strict';
const assert=require('node:assert/strict'),crypto=require('node:crypto'),fixture=require('./mill-field-defense.fixture.json');
function canonical(v){if(Array.isArray(v))return v.map(canonical);if(v&&typeof v==='object')return Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])]));return v;}
const hash=v=>sha(JSON.stringify(canonical(v))),sha=v=>crypto.createHash('sha256').update(v).digest('hex');
function withoutDefense(rig,json){
 const spec=fixture.rigs[rig];if(!spec)return json;
 for(const change of spec.changes){const actual=json[change.field].find(v=>v.name===change.name);assert.equal(hash(actual),change.current,'changed approved skins / attachment transform: reviewed mill defense '+rig+'/'+change.name);}
 for(const change of spec.changes){const at=json[change.field].findIndex(v=>v.name===change.name);if(change.original)json[change.field][at]=JSON.parse(JSON.stringify(change.original));else json[change.field].splice(at,1);}
 return json;
}
function metadata(rig,json){if(rig!=='td')return;for(const texture of fixture.rigs.td.extraTextures.slice().reverse())assert.equal(json.textures.pop(),texture,'exact mill defense/ruin atlas binding');}
function atlas(rig,text){if(rig!=='td')return text;const at=text.indexOf('\ntd-defenses.png\n');assert(at>=0);assert.equal(sha(text.slice(at).trim()),fixture.rigs.td.atlasAppend,'reviewed separate mill defense regions');return text.slice(0,at);}
module.exports={withoutDefense,metadata,atlas};
