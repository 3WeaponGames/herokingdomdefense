'use strict';
// The actual managed-session module with inert owned windows and file readers.
// No editor, browser, audio output, network, or player storage is used.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{createRequire}=require('node:module');
const root=path.resolve(__dirname,'../..'),file=path.join(root,'packages/game-data-editor/testing/session.js');
function fixture(options={}){
  const state={destroyed:false,muted:false,reads:0},local=createRequire(file),config={GoodsCfg:{},TreasureCfg:[],EquipCfg:[],TalentLevelCfg:[],LevelCfg:[]};
  const context={module:{exports:{}},exports:{},setTimeout,clearTimeout,require:id=>id==='fs'?{readFileSync(name){state.reads++;if(options.invalid)throw SyntaxError('Invalid current catalog');return JSON.stringify(String(name).includes('localization')?{entries:{}}:config);}}:local(id)};
  vm.createContext(context);vm.runInContext(fs.readFileSync(file,'utf8'),context,{filename:file});const api=context.module.exports;
  const entry={target:{profile:'owned-test-profile',managed:true},window:{isDestroyed:()=>state.destroyed,webContents:{setAudioMuted(value){state.muted=value;if(options.muteError)throw Error('contents disposed');}},destroy(){if(options.destroyError)throw Error('window busy');state.destroyed=true;if(options.onClose)options.onClose(api);}}};
  api._sessions.set(root,entry);return {api,state,entry,close:()=>api.handle({},root,{action:'close'})};
}
test('managed Close destroys its owned window even when configuration cannot be read',async()=>{
  const f=fixture({invalid:true}),result=await f.close();assert(f.state.destroyed);assert(f.state.muted);assert(!f.api._sessions.has(root));assert.equal(result.running,false);assert.equal(result.ready,false);assert.equal(result.catalog,null);assert.equal(result.target.profile,'owned-test-profile');
  await f.close();assert(!f.api._sessions.has(root),'repeated Close remains safe');
});
test('successful managed Close retains normal catalog and capability reply fields',async()=>{
  const f=fixture(),result=await f.close();assert(f.state.destroyed);assert(result.catalog&&Array.isArray(result.catalog.equipment));assert.equal(result.capabilities.reset,true);assert.equal(f.state.reads,2);
});
test('disposed contents cannot prevent destruction, while a failed destroy keeps ownership for retry',async()=>{
  const disposed=fixture({muteError:true});await disposed.close();assert(disposed.state.destroyed);assert(!disposed.api._sessions.has(root));
  const options={destroyError:true},busy=fixture(options);await assert.rejects(busy.close(),/window busy/);assert.equal(busy.api._sessions.get(root),busy.entry);assert(!busy.state.destroyed);options.destroyError=false;await busy.close();assert(busy.state.destroyed);assert(!busy.api._sessions.has(root));
});
test('closing an old managed window cannot remove a replacement created by its close callback',async()=>{
  const replacement={target:{profile:'replacement'},window:{isDestroyed:()=>false}},f=fixture({onClose:api=>api._sessions.set(root,replacement)});await f.close();assert.equal(f.api._sessions.get(root),replacement);
});
