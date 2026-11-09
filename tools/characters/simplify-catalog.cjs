'use strict';
// Explicit, backed-up migration for the single-character authoring workflow.
// Merely opening the panel never runs this cleanup or publishes assets.
const path=require('node:path'),{Service}=require('../../packages/hkd-characters/lib/service'),{prepare}=require('../../packages/hkd-characters/lib/catalog-cleanup');
function run(root,apply){const service=new Service(root),result=prepare(root,service.snapshot().data);service.change({version:service.version,data:result.data});const saved=apply?service.save({version:service.version}):null;return{removed:result.removed,standardized:result.changed,...(saved?{result:saved.result}:{dryRun:true})};}
module.exports={run};
if(require.main===module)console.log(JSON.stringify(run(path.resolve(__dirname,'../..'),process.argv.includes('--apply')),null,2));
