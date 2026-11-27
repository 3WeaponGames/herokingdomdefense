'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),{test}=require('node:test');
const root=path.resolve(__dirname,'../..');
function load(name,dependencies,extra={}){
 function Base(){}const context={exports:{},require:id=>dependencies[id]||{},cc:{Label:function(){},Node:{EventType:{TOUCH_END:'end'}},_decorator:{ccclass:x=>x,property:()=>()=>{}}},__extends(C,B){C.prototype=Object.create(B.prototype);},__decorate:(_decorators,value)=>value,__spreadArrays:(...arrays)=>[].concat(...arrays),...extra};
 vm.runInNewContext(fs.readFileSync(path.join(root,'assets/_script',name+'.js'),'utf8'),context);return context.exports.default;
}
test('the header never displays a timer while energy recovery and full/overflow balances retain their behavior',()=>{
 const now=1750000000000;let power=26,updated=now-32000,grants=[];const user={maxPower:30,powerRecoveryTime:300000,getPowerNum:()=>power,getPowerUpdateTime:()=>updated,addPowerNum(amount,elapsed){grants.push([amount,elapsed]);power=Math.min(30,power+amount);updated+=elapsed;}};
 const label={string:''},timer={active:true,removeFromParent(){},destroy(){}},Top=load('KinghtFallUITop',{BaseUI:{default:function(){}},KinghtFallModle:{default:{getInstance:()=>({numberFomat:String})}}},{Date:{now:()=>now}}),top=new Top();top.userData=user;top.ndPower={getChildByName:name=>name==='labTime'?timer:{getComponent:()=>label}};
 top.onRefreshPower();assert.equal(timer.active,false);assert.equal(label.string,'26/30');assert.equal(grants.length,0);
 updated=now-610000;timer.active=true;top.onRefreshPower();assert.equal(label.string,'28/30');assert.equal(timer.active,false);assert.deepEqual(grants,[[2,600000]]);
 power=35;updated=now-900000;top.onRefreshPower();assert.equal(label.string,'35/30');assert.equal(grants.length,1);assert.equal(timer.active,false);
 user.maxPower=40;power=40;top.onRefreshPower();assert.equal(label.string,'40/40');assert.equal(grants.length,1,'opening the header never clamps or recovers an at-cap balance');
});
test('clicking the energy counter opens the energy panel that owns the countdown',()=>{
 const ids={UIAddStrength:'energy',UIAddCurrency:'currency'},Top=load('KinghtFallUITop',{BaseUI:{default:function(){}},KinghtFallConfig:{KinghtFallUIID:ids},KinghtFallEnum:{KinghtFallEnumGoodsCfg:{Coin:1,Diamond:2}}}),top=new Top(),handlers={};
 for(const key of ['ndPower','ndGold','ndDiamond'])top[key]={on:(event,callback)=>{assert.equal(event,'end');handlers[key]=callback;}};
 const opened=[];top.openUI=(...args)=>opened.push(args);top.initBtnListener();handlers.ndPower();assert.deepEqual(opened,[['energy']]);
});
test('authored currency spacing, tower placement, click bounds and localized caption left edges stay consistent',()=>{
 const top=JSON.parse(fs.readFileSync(path.join(root,'assets/KinghtFallPrefabs/home/KinghtFallUITop.prefab'))),home=JSON.parse(fs.readFileSync(path.join(root,'assets/KinghtFallPrefabs/home/homectrl/KinghtFallHomeBattleCtrl.prefab'))),catalog=require('../../assets/resources/localization/catalog.json');
 const tops=['ndPower','ndGold','ndDiam'].map(name=>{const node=top.find(n=>n._name===name);return top[node._components.find(r=>top[r.__id__].__type__==='cc.Widget').__id__]._top;});assert(tops.every(value=>value>55&&value<56));assert(!top.some(n=>n._name==='labTime'));assert.equal(home[336]._active,false);
 const button=home[292],icon=home[334],mask=home[293],background=home[291];assert.equal(icon._trs.array[1],mask._trs.array[1]);assert(icon._trs.array[1]>24);assert(button._contentSize.width>=background._contentSize.width);
 const topGap=background._contentSize.height-button._trs.array[1]-icon._trs.array[1]-icon._contentSize.height/2;assert(topGap>0&&topGap<32);
 for(const locale of ['en','zh']){const a=catalog.labelStyles['ui.layout.kinghtfallhomebattlectrl.297'][locale],b=catalog.labelStyles['ui.layout.kinghtfallhomebattlectrl.302'][locale];assert.equal(a.horizontalAlign,0);assert.equal(b.horizontalAlign,0);assert.equal(a.x-a.width*.25,b.x-b.width*.25);assert.equal(a.wrap,false);assert.equal(b.wrap,false);}
});
