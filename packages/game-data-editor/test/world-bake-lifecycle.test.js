'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),Module=require('module'),{EventEmitter}=require('events'),temporary=require('./owned-temp');
function fixture(mode){
 const windows=[];
 class Window extends EventEmitter{
  constructor(){super();this.destroyed=false;this.muted=false;this.webContents=new EventEmitter();this.webContents.setAudioMuted=v=>{if(mode==='mute-error')throw Error('mute failed');this.muted=v;};this.webContents.executeJavaScript=()=>mode==='stalled-render'||mode==='crash'?new Promise(()=>{}):Promise.resolve({files:[],ground:[],assets:{}});windows.push(this);}
  isDestroyed(){return this.destroyed;}destroy(){this.destroyed=true;this.emit('closed');}
  loadURL(){assert(this.muted,'mute precedes renderer navigation');if(mode==='load-error')return Promise.reject(Error('navigation failed'));return mode==='stalled-load'?new Promise(()=>{}):Promise.resolve();}
 }
 const file=path.resolve(__dirname,'../worlds/baker.js'),unit=new Module(file,module);unit.filename=file;unit.paths=Module._nodeModulePaths(path.dirname(file));unit.require=name=>name==='electron'?{BrowserWindow:Window}:Module.prototype.require.call(unit,name);unit._compile(fs.readFileSync(file,'utf8'),file);
 const render=()=>unit.exports.renderElectron({map:{},images:{}},temporary('hkd-bake-lifecycle-'));
 return {render,windows};
}
test('world bake backend: navigation failure rejects cleanly and destroys the muted renderer',async()=>{
 const f=fixture('load-error');await assert.rejects(f.render(),/navigation failed/);assert.equal(f.windows[0].destroyed,true);
});
test('world bake backend: a mute failure destroys the window before any navigation',async()=>{
 const f=fixture('mute-error');await assert.rejects(f.render(),/mute failed/);assert.equal(f.windows[0].destroyed,true);
});
test('world bake backend: a stalled renderer load has a deadline and releases its window',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});try{const f=fixture('stalled-load'),pending=f.render(),rejected=assert.rejects(pending,/startup timed out/);t.mock.timers.tick(15001);await rejected;assert.equal(f.windows[0].destroyed,true);}finally{t.mock.timers.reset();}
});
test('world bake backend: a stalled bake execution has a deadline and releases its window',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});try{const f=fixture('stalled-render'),pending=f.render(),rejected=assert.rejects(pending,/Map baking timed out/);await new Promise(resolve=>setImmediate(resolve));t.mock.timers.tick(180001);await rejected;assert.equal(f.windows[0].destroyed,true);}finally{t.mock.timers.reset();}
});
test('world bake backend: renderer crashes fail immediately rather than stranding a save',async()=>{
 const f=fixture('crash'),pending=f.render(),rejected=assert.rejects(pending,/stopped unexpectedly/);await new Promise(resolve=>setImmediate(resolve));f.windows[0].webContents.emit('render-process-gone');await rejected;assert.equal(f.windows[0].destroyed,true);
});
test('world bake backend: successful renders return their data and release the window',async()=>{
 const f=fixture('success');assert.deepEqual(await f.render(),{files:[],ground:[],assets:{}});assert.equal(f.windows[0].destroyed,true);
});
