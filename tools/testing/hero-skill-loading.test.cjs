'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),vm=require('vm'),path=require('path');
const root=path.resolve(__dirname,'../..');
function fixture(){
 const events=[],pending=[],scene={valid:true},data={unknown:{keep:true}},instances={};
 const singleton=(name,value)=>{instances[name]=value;return{getInstance:()=>value};};
 const ResourceMgr={loadBundle(name,done){events.push('bundle:'+name);done();}},configs={KinghtFallUICF:{},KinghtFallAudioCF:{},KinghtFallAudioId:{button_click:1},KinghtFallBundelName:{EnemyAni:'ani',IconMap:'map'}};
 const modules={Appcfg:{BaseEventName:{Loading:'loading'},LoadingProcess:{ResCfg:1,AudioCfg:2,OtherCfg:3,EndLoading:4}},KinghtFallConfig:configs,EventMgr:{EventMgr:singleton('events',{emit(name,value){events.push(name+':'+value);}})},UIMgr:{UIMgr:singleton('ui',{addUICnf(){}})},AudioMgr:{AudioMgr:singleton('audio',{addAdConf(){},setButtonNomalAudio(){}})},ResourceMgr:{ResourceMgr:singleton('resources',ResourceMgr)},KinghtFallDataMgr:{KinghtFallDataMgr:singleton('config',{preload(done){done();}})},KinghtFallPlayerMgr:{KinghtFallPlayerMgr:singleton('player',{data,preload(done){done();}})},CharacterAppearance:{preload(done){events.push('characters');done();}},BuildingAssetWarmup:{preload(done){events.push('buildings');done();}},HeroSkillAssetWarmup:{preload(done,current){events.push('vfx');pending.push({done,current});}}};
 const cc={_decorator:{ccclass:x=>x,property(){}},Enum:x=>x,v2:(x,y)=>({x,y}),isValid:value=>!!value&&value.valid!==false,director:{getScene:()=>scene,getPhysicsManager:()=>({}),getCollisionManager:()=>({})}},exports={};
 vm.runInNewContext(fs.readFileSync(path.join(root,'assets/_script/KinghtFallModle.js'),'utf8'),{exports,cc,console,__decorate:(_d,type)=>type,__spreadArrays:(...arrays)=>[].concat(...arrays),require:name=>modules[name]||{}},{filename:'KinghtFallModle.js'});
 return{model:new exports.default(),events,pending,scene,data};
}
test('the existing loading chain cannot enter Main before hero VFX texture/GPU readiness and does not write player records',()=>{
 const f=fixture(),before=JSON.stringify(f.data);let complete=0;f.model.preload(()=>complete++);assert.deepEqual(f.events,['loading:1','loading:2','characters','buildings','vfx']);assert.equal(complete,0);assert.equal(f.model.isLoad,false);assert(f.pending[0].current());f.pending[0].done(null);assert.equal(complete,1);assert.equal(f.model.isLoad,true);assert.equal(f.events.at(-1),'loading:4');assert.equal(JSON.stringify(f.data),before);f.model.preload(()=>complete++);assert.equal(complete,2);assert.equal(f.pending.length,1);
});
test('the VFX loading continuation is fenced to the scene that requested startup',()=>{const f=fixture();f.model.preload(()=>{throw Error('Retired loading owner resumed');});f.scene.valid=false;assert.equal(f.pending[0].current(),false);assert.equal(f.model.isLoad,false);assert(!f.events.includes('loading:4'));});
