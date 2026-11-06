'use strict';
const assert=require('assert'),fs=require('fs'),path=require('path'),vm=require('vm');
const root=path.resolve(__dirname,'../../..'),cfg=JSON.parse(fs.readFileSync(path.join(root,'assets/KinghtFallConfig/GameJsonCfg.json'),'utf8'));
function fixture(file,custom){
    function Base(){};let draws=0;
    const data={BuffCfg:cfg.BuffCfg,GameTools:custom},mgr={data,getBuffCfgList:()=>data.BuffCfg,getTalentLevelCfgById:()=>({kindID:0})};
    const modules={KinghtFallDataMgr:{KinghtFallDataMgr:{getInstance:()=>mgr}},KinghtFallUIGame:{default:{instance:{ctrGame:{gameData:{buffList:[]}}}}},KinghtFallPlayerMgr:{KinghtFallPlayerMgr:{getInstance:()=>({getUserData:()=>({getTalent:()=>[]})})}},Utils:{Utils:{weight_rand:items=>{draws++;return items.filter(i=>i.weight>0)[0];}}}};
    const cc={_decorator:{ccclass:x=>x,property:()=>()=>{}},Label:function(){},Node:function(){}};
    const helperContext={exports:{},require:id=>modules[id],cc};vm.runInNewContext(fs.readFileSync(path.join(root,'assets/_script/GameToolsOverrides.js'),'utf8'),helperContext);modules.GameToolsOverrides=helperContext.exports;
    const context={exports:{},require:id=>modules[id]||{default:Base},cc,sp:{Skeleton:function(){}},__extends(c,b){c.prototype=Object.create((b||Base).prototype);},__decorate:(d,t)=>t,__spreadArrays:(...a)=>[].concat(...a),Math:Object.assign(Object.create(Math),{random:()=>.5})};
    vm.runInNewContext(fs.readFileSync(file,'utf8'),context);const obj=Object.create(context.exports.default.prototype);Object.assign(obj,{canOutBuff:[],selInfo:[],minQua:3});return{obj,data,draws:()=>draws};
}
let count=0;function test(name,fn){fn();console.log('PASS '+name);count++;}
const live=path.join(root,'assets/_script/KinghtFallUIBuff.js'),baseline=path.join(__dirname,'fixtures/legacy-perk.js');
test('no override preserves perk eligibility and RNG call order',()=>{const a=fixture(baseline),b=fixture(live);a.obj.initData();b.obj.initData();assert.deepStrictEqual(JSON.parse(JSON.stringify(b.obj.canOutBuff)),JSON.parse(JSON.stringify(a.obj.canOutBuff)));[false,true].forEach(force=>{a.obj.onRefreshBuff(force);b.obj.onRefreshBuff(force);assert.deepStrictEqual(Array.from(b.obj.selInfo),Array.from(a.obj.selInfo));assert.equal(b.draws(),a.draws());});});
test('explicit disable removes only that perk from eligible pool',()=>{const a=fixture(live),b=fixture(live,{perks:{50001:{enabled:false}}});a.obj.initData();b.obj.initData();assert.deepStrictEqual(Array.from(b.obj.canOutBuff,i=>i.id),Array.from(a.obj.canOutBuff.filter(i=>i.id!==50001),i=>i.id));});
test('custom pool without guaranteed rarity falls back without an invalid choice',()=>{const f=fixture(live,{perks:{50001:{enabled:false}}});f.obj._customPerkPool=true;f.obj.canOutBuff=[{id:1,qua:1,weight:1}];f.obj.onRefreshBuff(true);assert.deepStrictEqual(Array.from(f.obj.selInfo),[1]);});
test('fully exhausted custom pool closes and returns no perks',()=>{const f=fixture(live,{perks:{}});let result,closed=false;f.obj.initData=function(){this._customPerkPool=true;this.canOutBuff=[];};f.obj.scheduleOnce=fn=>fn();f.obj.callBack=ids=>result=ids;f.obj.closeUI=()=>closed=true;f.obj.start();assert.deepStrictEqual(Array.from(result),[]);assert(closed);});
console.log(count+' perk runtime tests passed');
