'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),test=require('node:test'),assert=require('node:assert/strict');
const Power=require('../../assets/_script/CombatPower'),Units=require('./unit-combat-power.cjs');

test('shared power combines damage and useful support with the same geometric durability score',()=>{
 const input={health:100,directDps:20,healingHps:4,buffDps:3,splashDps:2,preventedDps:1},before=structuredClone(input),result=Power.calculate(input);
 assert.equal(result.effectiveOutput,30);assert.equal(result.cp,Math.sqrt(3000));assert.equal(result.reason,null);assert.deepEqual(input,before);
 assert.equal(Power.calculate({health:100,directDps:20}).cp,Math.sqrt(2000));
 assert.equal(Power.calculate({health:100,directDps:20,reflectionDps:7}).cp,Math.sqrt(2700));
 assert.equal(Power.calculate({health:200,directDps:40}).cp,2*Math.sqrt(2000));assert.equal(Power.calculate({health:100}).cp,0);
});

test('zero output is valid but malformed stats and arithmetic overflow never become a visible NaN power',()=>{
 for(const input of [null,[],{}, {health:0}, {health:Infinity},{health:100,directDps:-1},{health:100,healingHps:NaN},{health:100,buffDps:null},{health:100,preventedDps:'1'},{health:Number.MAX_VALUE,directDps:2}]){const result=Power.calculate(input);assert.equal(result.cp,null);assert(result.reason);}
 assert(Object.isFrozen(Power.DEFAULTS));assert.equal(Power.DEFAULTS.healingUtilization,1);assert.equal(Power.DEFAULTS.heroHealingUtilization,0);
});

test('unit damage and support adapters use the common calculation without changing established scores',()=>{
 const sources=[{ID:90001,Health:40,AttackDamage:10,AttackInterval:1},{ID:90006,Health:100,AttackInterval:.2,Data:[1.2,3,200,15]},{ID:90009,Health:300,AttackInterval:.3,Data:[.5,300,10]},{ID:90007,Health:500,AttackDamage:20,AttackInterval:1,Data:[20,200,5]},{ID:90012,Health:500,AttackDamage:75,AttackInterval:1.2,Data:[2,5,.5,300,10,5]}];
 const expected=[20,Math.sqrt(2160),Math.sqrt(5400),Math.sqrt(30000),Math.sqrt(52500)];sources.forEach((source,index)=>{const value=Units.calculate(source);assert(Math.abs(value.cp-expected[index])<1e-10);assert.equal(value.cp,Power.calculate({health:source.Health,...value}).cp);});
});

test('the actual shared module runs without Node or Cocos globals for native/browser callers',()=>{
 const context={exports:{}};vm.runInNewContext(fs.readFileSync(path.resolve(__dirname,'../../assets/_script/CombatPower.js'),'utf8'),context);assert.equal(context.exports.calculate({health:100,directDps:20}).cp,Math.sqrt(2000));assert.equal(context.exports.DEFAULTS.heroHealingUtilization,0);
});
