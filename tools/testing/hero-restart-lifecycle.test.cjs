'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {setup,hero}=require('./backend-gameplay-harness.cjs');
const engine=process.env.COCOS_ENGINE_DIR||'C:/ProgramData/cocos/editors/Creator/2.4.13/resources/engine';
const supported=fs.existsSync(path.join(engine,'cocos2d/core/utils/base-node.js'));
test('restart preserves the new life status after real HP hiding reenters through SDK activation', {skip:!supported},()=>{
 const {activeNode,hp}=require('./backend-sdk-lifecycle.cjs'),h=setup(),p=hero(h);p.node._combatGeneration=1;h.g._combatEpoch=1;let nested=0;
 const bar=activeNode(h.e.cc,()=>{nested++;p.onRestart(false);p.addBuff(h.e.load('KinghtFallInterface').KinghtFallEnemyBuffType.MoveSpeed,{time:5,subNum:.25});});
 p.ctrHp=hp(bar);p.onRestart(false);assert.equal(nested,1);assert.equal(p.node._combatGeneration,3);assert.equal(p.debuffInfo.length,1);assert.equal(p.debuffInfo[0].data.subNum,.25);
});
test('ordinary restart still restores authored HP and clears old statuses once',()=>{
 const h=setup(),p=hero(h);p.node._combatGeneration=1;let shown=0;p.ctrHp.setHp=value=>{shown++;assert.equal(value,p.hpMax);};p.addBuff(h.e.load('KinghtFallInterface').KinghtFallEnemyBuffType.MoveSpeed,{time:5,subNum:.25});p.hp=1;p.onRestart(false);assert.equal(shown,1);assert.equal(p.node._combatGeneration,2);assert.equal(p.hp,p.hpMax);assert.equal(p.debuffInfo.length,0);
});
