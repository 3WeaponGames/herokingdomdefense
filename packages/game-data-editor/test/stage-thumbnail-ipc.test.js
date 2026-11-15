'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{createRequire}=require('node:module');
function fixture(major,cancelled){
 const file=path.resolve(__dirname,'../main.js'),root=path.resolve(__dirname,'../../..'),realRequire=createRequire(file),calls=[],module={exports:{}};
 const dialog={showOpenDialog(...args){calls.push(args);if(major<6){args[1](cancelled?undefined:['chosen.png']);return;}assert.equal(args.length,1);return Promise.resolve({canceled:cancelled,filePaths:cancelled?[]:['chosen.png']});}};
 const customRequire=name=>name==='electron'?{dialog}:name==='./worlds/service'?{Service:class{constructor(){this.root=root;}}}:realRequire(name);
 vm.runInNewContext(fs.readFileSync(file,'utf8'),{module,Editor:{Project:{path:root}},require:customRequire,process:{versions:{electron:major+'.0.0'}}},{filename:file});
 const invoke=()=>new Promise((resolve,reject)=>module.exports.messages['world-stage-thumbnail-pick']({reply:(error,value)=>error?reject(Error(error)):resolve(value)}));return{invoke,calls,root};
}
for(const major of [5,12])for(const cancelled of [false,true])test('thumbnail file dialog supports Electron '+major+' with cancel='+cancelled,async()=>{
 const f=fixture(major,cancelled);assert.equal(await f.invoke(),cancelled?null:'chosen.png');assert.equal(f.calls[0][0].defaultPath,path.join(f.root,'assets/KinghtFallIconMap/Thumbnails'));assert.equal(f.calls[0][0].filters[0].extensions[0],'png');
});
