'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'../..'),config=require('../../assets/KinghtFallConfig/GameJsonCfg.json');
function method(file,name,globals){const text=fs.readFileSync(path.join(root,'assets/_script',file+'.js'),'utf8').replace(/\r\n/g,'\n'),start=text.indexOf('_ctor.prototype.'+name+' = function ');return vm.runInNewContext('('+text.slice(text.indexOf('function ',start),text.indexOf('\n  };',start)+4)+')',globals);}
test('stage previews read current monster prefab assets, and stale stage loads cannot replace the selected monster',()=>{
 const jobs=[],renderer={setSkin(value){this.skin=value;},setAnimation(_track,name){this.animation=name;}},node={x:88,y:-31,getComponent:()=>renderer};
 const data={data:config,getSoldierCfgById:id=>config.SoldierCfg[id]};
 const load=method('KinghtFallHomeBattleCtrl','loadStageMonster',{$z1KinghtFallDataMgr:{KinghtFallDataMgr:{getInstance:()=>data}},$z1KinghtFallConfig:{KinghtFallBundelName:{Enemy:'monsters'}},sp:{Skeleton:function(){}},cc:{isValid:()=>true,color:x=>x,Color:{WHITE:'white'}}});
 const home={ndLevelInfo:{getChildByName:()=>node},loadPrefab:(bundle,name,done)=>jobs.push({bundle,name,done})};
 const source=id=>({data:{getComponentInChildren:()=>({defaultSkin:'default',skeletonData:{id,skeletonJson:{skeleton:{height:180}}}})}});
 load.call(home,{EnemyAni:'wqyl_bb'});load.call(home,{EnemyAni:'wqyl_zbb'});
 assert.equal(node.active,false);assert.deepEqual(jobs.map(j=>j.name),['ItemEnemy01','ItemEnemy02']);
 jobs[0].done(source('wolf'));assert.equal(renderer.skeletonData,undefined);
 jobs[1].done(source('bear'));assert.equal(renderer.skeletonData.id,'bear');assert.equal(renderer.skin,'default');assert.equal(renderer.animation,'idle');assert.equal(node.active,true);assert.equal(node.scaleY,.5);
 for(const stage of config.LevelCfg)assert(['wqyl_bb','wqyl_zbb','wqyl_gb','wqyl_qb'].includes(stage.EnemyAni));
});
test('the currency prefab has no energy countdown node or text renderer',()=>{
 const data=JSON.parse(fs.readFileSync(path.join(root,'assets/KinghtFallPrefabs/home/KinghtFallUITop.prefab'),'utf8'));
 assert(!data.some(n=>n._name==='labTime'));assert(!data.some(n=>n.__type__==='cc.Label'&&/^\d\d:\d\d$/.test(n._string||n['_N$string']||'')));
 const timer={active:true,removeFromParent(){this.removed=true;},destroy(){this.destroyed=true;}};const number={};
 const refresh=method('KinghtFallUITop','onRefreshPower',{cc:{Label:function(){}},$z1KinghtFallModle:{default:{getInstance:()=>({numberFomat:String})}}});
 refresh.call({userData:{getPowerNum:()=>15,maxPower:30,getPowerUpdateTime:()=>Date.now(),powerRecoveryTime:300000},ndPower:{getChildByName:name=>name==='labTime'?timer:{getComponent:()=>number}}});
 assert(timer.removed&&timer.destroyed);assert.equal(timer.active,false);assert.equal(number.string,'15');
});
