'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const Facing=require('../../assets/_script/GateFacing'),source=fs.readFileSync(path.join(__dirname,'../../assets/_script/KinghtFallBuildWall.js'),'utf8');
const clips={};for(const direction of ['inward','outward'])for(const state of ['open','shut'])for(const night of ['', '_night'])clips[state+'_'+direction+night]={};
clips.Fade_in_open_inward={};clips.Fade_in_open_outward={};
function method(name,globals={}){const start=source.indexOf('_ctor.prototype.'+name+' = function'),end=source.indexOf('\n  };',start);assert(start>=0&&end>start);const context=Object.assign({result:{},require:name=>{assert.equal(name,'GateFacing');return Facing;}},globals);vm.runInNewContext(source.slice(start,end+5).replace('_ctor.prototype.'+name,'result.fn'),context);return context.result.fn;}
function skeleton(json={animations:clips}){const calls=[];return {skeletonData:{skeletonJson:json},animation:'idle',calls,setAnimation(track,name,loop){calls.push(['set',name,loop]);},addAnimation(track,name,loop){calls.push(['add',name,loop]);}};}
function fixture(){const names={fade_in:'Fade_in',idle:'idle',idle_night:'idle_night',open:'open',open_night:'open_night',shut:'shut',shut_night:'shut_night',create:'create',upgrade:'upgrade'},game={gameStatus:'prepare'},globals={cc:{PhysicsPolygonCollider:'polygon'},$z1KinghtFallBuildBase:{KinghtFallBuildAniName:names},$z1KinghtFallEnum:{KinghtFallEnumBuildEnum:{None:0}},$z1KinghtFallUIGame:{default:{instance:{ctrGame:game}}},$z1KinghtFallModle:{KinghtFallGameStage:{Prepare:'prepare'}},BattleSounds:{effect(){}}};
 const owner={wallOpening:'inward',ndAniMain:skeleton(),ndAniDown:skeleton({animations:{open:{},open_night:{},shut:{},shut_night:{}}}),ndAniOther:[skeleton({animations:{open:{},open_night:{}}})],buildCfg:{enumValue:6},index:1,canLock:true,isDestroyed:false,isOpen:true,ndLockList:[],node:{getComponents:()=>[]},_openGateCollider(){this.openContacts=(this.openContacts||0)+1;},hasFriendlyAtGate:()=>true};owner._gateAnimation=method('_gateAnimation');return {owner,game,globals,setLight:method('setLight',globals),doTime:method('doTime',globals)};}
test('directional names select only available clips and preserve every legacy fallback',()=>{
 for(const opening of ['inward','outward']){assert(Facing.validOpening(opening));for(const state of ['open','shut'])for(const night of ['', '_night'])assert.equal(Facing.animation({animations:clips},state+night,opening),state+'_'+opening+night);}
 for(const value of ['',null,0,'inside','INWARD',{}])assert(!Facing.validOpening(value));
 for(const json of [null,{}, {animations:{}}, {animations:{open:{},shut:{},open_night:{},shut_night:{}}}])for(const opening of ['inward','outward',undefined])for(const name of ['open','open_night','shut','shut_night','idle','create','upgrade','destroy'])assert.equal(Facing.animation(json,name,opening),name);
 assert.equal(Facing.animation({animations:clips},'open',undefined),'open_outward');assert.equal(Facing.animation({animations:clips},'open_inward_night','outward'),'open_inward_night');
 for(const opening of ['inward','outward']){assert.equal(Facing.animation({animations:clips},'Fade_in',opening,true),'Fade_in_open_'+opening);assert.equal(Facing.animation({animations:clips},'Fade_in',opening,false),'Fade_in');assert.equal(Facing.animation({animations:{Fade_in:{}}},'Fade_in',opening,true),'Fade_in');}
});
test('day/night presentation maps each gate part independently without changing legacy wing tracks',()=>{
 const f=fixture(),o=f.owner;f.setLight.call(o,true);assert.deepEqual(o.ndAniMain.calls,[['set','Fade_in_open_inward',false],['add','open_inward_night',false]]);assert.deepEqual(o.ndAniDown.calls,[['set','Fade_in',false],['add','open_night',false]]);assert.deepEqual(o.ndAniOther[0].calls,[['set','Fade_in',false],['add','open_night',false]]);
 for(const s of [o.ndAniMain,o.ndAniDown,...o.ndAniOther])s.calls.length=0;o.wallOpening='outward';f.setLight.call(o,false);assert.deepEqual(o.ndAniMain.calls,[['set','open_outward',false]]);assert.deepEqual(o.ndAniDown.calls,[['set','open',false]]);
 o.ndAniMain.calls.length=0;o.isOpen=false;f.setLight.call(o,true);assert.deepEqual(o.ndAniMain.calls,[['set','Fade_in',false],['add','idle_night',true]]);
});
test('automatic opening and closing choose inward tracks including construction queues and night mode',()=>{
 const f=fixture(),o=f.owner;o.isOpen=false;o.ndAniMain.animation='create';f.doTime.call(o);assert.equal(o.isOpen,true);assert.equal(o.openContacts,1);assert.deepEqual(o.ndAniMain.calls,[['add','open_inward',false]]);assert.deepEqual(o.ndAniDown.calls,[['add','open',false]]);
 o.ndAniMain.calls.length=o.ndAniDown.calls.length=0;o.ndAniMain.animation='idle';o.hasFriendlyAtGate=()=>false;f.game.gameStatus='night';f.doTime.call(o);assert.equal(o.isOpen,false);assert.deepEqual(o.ndAniMain.calls,[['set','shut_inward_night',false]]);assert.deepEqual(o.ndAniDown.calls,[['set','shut_night',false]]);
 o.ndAniMain.calls.length=0;o.wallHasGate=false;f.doTime.call(o);assert.equal(o.ndAniMain.calls.length,0);
});
