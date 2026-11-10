'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{createRequire}=require('node:module'),Routing=require('../worlds/panel-routing');
function editor(){const calls=[],windows=new Set();return{calls,windows,Panel:{open(id,argv){calls.push({action:'open',id,argv});windows.add(id);},close(id){calls.push({action:'close',id});windows.delete(id);},extend:value=>value}};}
test('Maps, Stages, repeated opens and focused maps always reuse the canonical panel ID',()=>{
 const e=editor();Routing.open(e,'maps');Routing.open(e,'stages');Routing.open(e,'maps',{mapId:'Map07'});Routing.open(e,'stages');
 assert.deepEqual([...e.windows],['hkd-maps']);assert.deepEqual(e.calls.map(x=>x.argv),[{view:'maps'},{view:'stages'},{view:'maps',mapId:'Map07'},{view:'stages'}]);
 assert.throws(()=>Routing.open(e,'units'));assert.throws(()=>Routing.open(e,'maps',{mapId:''}));assert.equal(e.calls.length,4);
});
test('legacy Stages restoration redirects without mounting a second editor or closing other panels',()=>{
 const e=editor();e.windows.add('hkd-stages');e.windows.add('hkd-units');let definition,payload;
 e.Panel.extend=d=>(definition=d);e.Ipc={sendToMain(message,request,reply){assert.equal(message,'game-data-editor:open-world');payload=request;Routing.open(e,request.view,request);reply(null,true);}};
 Routing.createLegacy(e);const panel=Object.assign({$status:{},$retry:{}},definition);panel.ready();assert.deepEqual(payload,{view:'stages',closeLegacy:true});assert.deepEqual([...e.windows].sort(),['hkd-maps','hkd-units']);assert(!panel._worldClient);
 panel.close();panel._redirect();assert.equal(e.calls.length,2);
});
test('a failed legacy redirect preserves a visible retry instead of closing the restored panel',()=>{
 const e=editor();let request; e.Ipc={sendToMain(message,payload,reply){request=reply;}};const panel=Object.assign({$status:{},$retry:{}},Routing.createLegacy(e));panel.ready();request('backend unavailable');assert.equal(panel.$retry.hidden,false);assert.match(panel.$status.textContent,/backend unavailable/);assert.equal(e.calls.length,0);panel.$retry.onclick();assert.equal(panel.$retry.hidden,true);panel.close();request('late error');assert.equal(panel.$retry.hidden,true);
});
test('real menu and IPC entry points pass the requested view through the shared panel lifecycle',()=>{
 const filename=path.join(__dirname,'../main.js'),e=editor(),module={exports:{}};e.Ipc={sendToAll(){throw Error('Opening authoring tools must not mutate or broadcast game data.');}};
 vm.runInNewContext(fs.readFileSync(filename,'utf8'),{module,require:createRequire(filename),Editor:e,setTimeout,clearTimeout},{filename});const api=module.exports.messages,invoke=(name,payload)=>{let answer;api[name]({reply:(error,value)=>{assert.ifError(error);answer=value;}},payload);assert.equal(answer,true);};
 api['open-maps']();api['open-stages']();invoke('open-panel','stages');invoke('world-focus-map',{id:'Map07'});invoke('open-world',{view:'stages',closeLegacy:true});
 assert.deepEqual(e.calls.filter(c=>c.action==='open').map(c=>({id:c.id,view:c.argv.view,mapId:c.argv.mapId})),[{id:'hkd-maps',view:'maps',mapId:undefined},{id:'hkd-maps',view:'stages',mapId:undefined},{id:'hkd-maps',view:'stages',mapId:undefined},{id:'hkd-maps',view:'maps',mapId:'Map07'},{id:'hkd-maps',view:'stages',mapId:undefined}]);assert.equal(e.calls.at(-1).id,'hkd-stages');
});
