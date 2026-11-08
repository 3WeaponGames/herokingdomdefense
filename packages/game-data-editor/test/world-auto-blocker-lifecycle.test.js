'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),vm=require('vm');
function renderer(options){
 options=options||{};let window,deadline;const calls=[],filename=path.resolve(__dirname,'../worlds/auto-blockers.js');
 class Window{
  constructor(){window=this;this.closed=false;this.webContents={setAudioMuted(value){calls.push(['mute',value]);if(options.muteError)throw Error('mute failed');},executeJavaScript(){calls.push(['execute']);return options.execute?options.execute():Promise.resolve({mask:[]});}};}
  loadURL(){calls.push(['load']);return options.load?options.load():Promise.resolve();}
  isDestroyed(){return this.closed;}
  destroy(){calls.push(['destroy']);this.closed=true;}
 }
 const scope={module:{exports:{}},__dirname:path.dirname(filename),setTimeout(callback,ms){deadline={callback,ms,cleared:false};return deadline;},clearTimeout(timer){if(timer)timer.cleared=true;},require(name){if(name==='electron')return {BrowserWindow:Window};if(name==='fs')return {readFileSync:()=>'',mkdirSync(){},writeFileSync(){}};return require(require.resolve(name,{paths:[path.dirname(filename)]}));}};
 vm.runInNewContext(fs.readFileSync(filename,'utf8'),scope,{filename});
 return {run:()=>scope.module.exports.renderElectron({layers:[]},path.join(require('os').tmpdir(),'hkd-auto-native-lifecycle')),calls,state:()=>({window,deadline})};
}
test('native automatic tracing mutes before load and releases its window and timer after success',async()=>{
 const r=renderer(),value=await r.run();assert.deepEqual(value,{mask:[]});assert.deepEqual(r.calls,[['mute',true],['load'],['execute'],['destroy']]);assert(r.state().deadline.cleared);assert(r.state().window.closed);
});
test('native automatic tracing applies one deadline to a stalled initial load',async()=>{
 const r=renderer({load:()=>new Promise(()=>{})}),pending=r.run(),rejected=assert.rejects(pending,/took too long/);assert.equal(r.state().deadline.ms,120000);r.state().deadline.callback();await rejected;
 assert(r.state().window.closed);assert(r.state().deadline.cleared);assert.deepEqual(r.calls,[['mute',true],['load'],['destroy']]);
});
test('native automatic tracing releases its window for rejected loads and synchronous mute failures',async()=>{
 for(const options of [{load:()=>Promise.reject(Error('load failed'))},{load:()=>{throw Error('load failed');}},{muteError:true}]){
  const r=renderer(options);await assert.rejects(r.run(),/failed/);assert(r.state().window.closed);assert.equal(r.calls.filter(c=>c[0]==='destroy').length,1);assert(!r.calls.some(c=>c[0]==='execute'));
 }
});
test('native automatic tracing still bounds a stalled or rejected trace after startup',async()=>{
 const r=renderer({execute:()=>new Promise(()=>{})}),pending=r.run(),rejected=assert.rejects(pending,/took too long/);await Promise.resolve();r.state().deadline.callback();await rejected;assert(r.state().window.closed);assert(r.calls.some(c=>c[0]==='execute'));
 const failed=renderer({execute:()=>Promise.reject(Error('trace failed'))});await assert.rejects(failed.run(),/trace failed/);assert(failed.state().window.closed);assert(failed.state().deadline.cleared);
});
