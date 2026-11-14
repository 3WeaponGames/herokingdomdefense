'use strict';
const fs=require('fs'),crypto=require('crypto'),Json=require('./json-document');
const clone=value=>value===undefined?undefined:JSON.parse(JSON.stringify(value)),hash=text=>crypto.createHash('sha256').update(text).digest('hex');
function withoutShadow(value){const result=clone(value);if(result.GameTools){delete result.GameTools.buildingShadows;if(!Object.keys(result.GameTools).length)delete result.GameTools;}return result;}
function documents(store){
 const d=store.documents.A,overrides=store.documents.overrides;if(!d||!overrides)return null;
 const text=fs.readFileSync(store.absolute(d.path),'utf8'),revision=hash(text);if(revision===d.revision)return null;
 const latest=JSON.parse(text.replace(/^\uFEFF/,'')),before=d.original.GameTools&&d.original.GameTools.buildingShadows,after=latest.GameTools&&latest.GameTools.buildingShadows;
 // Reconcile only a disjoint shadow preset restore. Other external changes,
 // byte-only changes and overlapping shadow drafts retain the revision guard.
 if(Json.equal(before,after)||!Json.equal(withoutShadow(d.original),withoutShadow(latest))||!Json.equal(before,d.data.GameTools&&d.data.GameTools.buildingShadows)||!Json.equal(overrides.original.buildingShadows,overrides.data.buildingShadows))return null;
 const result=Object.assign({},store.documents),draft=clone(d.data);if(latest.GameTools)draft.GameTools=clone(latest.GameTools);else delete draft.GameTools;
 result.A=Object.assign({},d,{original:clone(latest),data:draft,text,revision});
 const original=latest.GameTools===undefined?{version:1,timings:{},parameters:{},perks:{}}:clone(latest.GameTools),data=clone(overrides.data);if(after===undefined)delete data.buildingShadows;else data.buildingShadows=clone(after);
 result.overrides=Object.assign({},overrides,{original,data,revision});return result;
}
module.exports={documents};
