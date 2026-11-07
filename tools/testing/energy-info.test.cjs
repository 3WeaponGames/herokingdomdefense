'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),{test}=require('node:test');
const root=path.resolve(__dirname,'../..'),catalog=require('../../assets/resources/localization/catalog.json');
function fixture(energy,elapsed,language){
  function Base(){}const timestamp=1750000000000,user=Object.freeze({maxPower:30,powerRecoveryTime:300000,getPowerNum:()=>energy,getPowerUpdateTime:()=>timestamp-elapsed});
  const dependencies={BaseUI:{default:Base},KinghtFallPlayerMgr:{KinghtFallPlayerMgr:{getInstance:()=>({getUserData:()=>user})}},Utils:{Utils:{StringFormat:(text,...values)=>text.replace(/\{(\d+)\}/g,(_,n)=>values[n])}}};
  const context={exports:{},require:id=>dependencies[id]||{},Date:class extends Date{static now(){return timestamp;}},cc:{Label:function(){},Node:function(){},_decorator:{ccclass:x=>x,property:()=>()=>{}}},__extends(C,B){C.prototype=Object.create(B.prototype);},__decorate:(ds,value)=>value};
  vm.runInNewContext(fs.readFileSync(path.join(root,'assets/_script/KinghtFallUIAddStrength.js'),'utf8'),context);const owner=new context.exports.default();owner.T=key=>catalog.entries[key][language||'en'];owner.labEnergyRule={string:''};owner.labEnergyNext={string:''};owner.labEnergyOverflow={string:''};return{owner,user};
}
test('energy popup shows the actual five-minute countdown and fixed recovery cap without granting energy',()=>{
  const f=fixture(22,60000);f.owner.updateEnergyInfo();assert.match(f.owner.labEnergyRule.string,/30.*5 min/);assert.equal(f.owner.labEnergyNext.string,'Energy: 22 / 30 · Next +1: 4:00');assert.match(f.owner.labEnergyOverflow.string,/exceed this cap/);assert.equal(f.user.getPowerNum(),22);
});
test('full and overflow energy pause the countdown without clamping purchased or ad rewards',()=>{
  for(const amount of [30,50]){const f=fixture(amount,900000);f.owner.updateEnergyInfo();assert.equal(f.owner.labEnergyNext.string,'Energy: '+amount+' / 30 · Refills paused');assert.equal(f.user.getPowerNum(),amount);}
});
test('countdown boundaries, Chinese text and closed popup updates remain safe',()=>{
  const due=fixture(5,300001);due.owner.updateEnergyInfo();assert.match(due.owner.labEnergyNext.string,/0:00$/);const clock=fixture(5,-5000);clock.owner.updateEnergyInfo();assert.match(clock.owner.labEnergyNext.string,/5:00$/);
  const zh=fixture(5,240000,'zh');zh.owner.updateEnergyInfo();assert.match(zh.owner.labEnergyRule.string,/30.*5/);assert.match(zh.owner.labEnergyNext.string,/1:00/);const before=zh.owner.labEnergyNext.string;zh.owner.isclose=true;zh.owner.updateEnergyInfo();assert.equal(zh.owner.labEnergyNext.string,before);
});
