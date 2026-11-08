'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {createRequire}=require('node:module'),assert=require('node:assert/strict'),{test}=require('node:test');
test('fresh asset requests discover newly installed icon folders without loading or saving game data',async()=>{
  const filename=path.resolve(__dirname,'../../packages/game-data-editor/main.js'),local=createRequire(filename);
  let scans=0,storeConstructions=0;
  const context={module:{exports:{}},__dirname:path.dirname(filename),setTimeout,clearTimeout,
    Editor:{Project:{path:path.resolve(__dirname,'../..')}},
    require(name){if(name==='./lib/assets')return{index(){scans++;return{images:[{reference:'@icon/Stats Icons/health',scan:scans}]};}};
      if(name==='./lib/store')return{Store:class{constructor(){storeConstructions++;throw Error('Asset indexing must not touch drafts');}}};
      return local(name);}};
  vm.runInNewContext(fs.readFileSync(filename,'utf8'),context,{filename});
  const get=request=>new Promise((resolve,reject)=>context.module.exports.messages['asset-index']({reply:(error,value)=>error?reject(Error(error)):resolve(value)},request));
  const first=await get();assert.equal(first.images[0].scan,1);
  assert.equal((await get()).images[0].scan,1,'ordinary callers retain the cached index');
  assert.equal((await get({refresh:true})).images[0].scan,2,'opening or refreshing a panel includes new imported icons');
  assert.equal((await get()).images[0].scan,2);assert.equal(storeConstructions,0);
});
