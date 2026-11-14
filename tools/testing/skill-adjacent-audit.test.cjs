'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const Runtime=require('../../assets/_script/RelicRuntime'),Eligibility=require('../../assets/_script/RelicEligibility');
const root=path.resolve(__dirname,'../..');
function moduleValue(name,deps={},globals={}){
 const m={exports:{}};vm.runInNewContext(fs.readFileSync(path.join(root,'assets/_script',name+'.js'),'utf8'),{module:m,exports:m.exports,require:id=>deps[id]||require(id),cc:{isValid:value=>!!value&&!value.destroyed},Math,Number,Set,...globals},{filename:name+'.js'});return m.exports;
}
const Tower=moduleValue('TowerCombat'),Battle=moduleValue('RelicBattle',{RelicRuntime:Runtime,TowerCombat:Tower});
function actor(){return {hp:50,hpMax:100,node:{_combatGeneration:1,activeInHierarchy:true,parent:null,getPosition(){return{x:0,y:0};}},isDead(){return this.hp<=0;},ctrHp:{setHp(){}}};}
function aura(){const hero=actor(),a=actor(),b=actor(),data={heroStyle:'guardian',round:1,_relicGeneration:1,treasureAdd:{120049:[.05]},soldierList:[a,b]};data.ctrPar={gameData:data,ctrPlay:hero,_combatEpoch:1};return{hero,a,b,data};}

test('Guardian aura stops its pulse when an HP callback retires its battle or hero',()=>{
 const mutations={generation:f=>f.data._relicGeneration++,round:f=>f.data.round++,epoch:f=>f.data.ctrPar._combatEpoch++,data:f=>f.data.ctrPar.gameData={},owner:f=>f.data.ctrPar={},hero:f=>f.data.ctrPar.ctrPlay=actor(),heroNode:f=>f.hero.node=actor().node,heroGeneration:f=>f.hero.node._combatGeneration++,heroDeath:f=>f.hero.hp=0,heroDestroyed:f=>f.hero.node.destroyed=true};
 for(const [name,mutate]of Object.entries(mutations)){const f=aura();f.a.ctrHp.setHp=()=>mutate(f);assert.equal(Battle.updateHeroAura(f.data,f.hero,8,false),5,name);assert.equal(f.a.hp,55,name);assert.equal(f.b.hp,50,name);}
});

test('Guardian aura preserves valid simultaneous healing and skips recipients retired by an earlier callback',()=>{
 const f=aura();f.data.soldierList=[f.a,f.a,f.b];assert.equal(Battle.updateHeroAura(f.data,f.hero,8,false),10);assert.equal(f.a.hp,55);assert.equal(f.b.hp,55);
 for(const mutate of [f=>f.b.node._combatGeneration++,f=>f.b.node.destroyed=true,f=>f.b._isPooled=true]){const f=aura();f.a.ctrHp.setHp=()=>mutate(f);assert.equal(Battle.updateHeroAura(f.data,f.hero,8,false),5);assert.equal(f.b.hp,50);}
 const retired=aura();retired.hero.node.destroyed=true;retired.hero.node.getPosition=()=>{throw Error('Retired hero geometry was read');};assert.equal(Battle.updateHeroAura(retired.data,retired.hero,8,false),0);
});

test('tower presentation callbacks cannot damage a recycled, pooled, dead, replaced or destroyed victim',()=>{
 const changes={generation:a=>a.node._combatGeneration++,pooled:a=>a._isPooled=true,dead:a=>a.hp=0,node:a=>a.node=actor().node,destroyed:a=>a.node.destroyed=true};
 for(const [name,change]of Object.entries(changes)){const a=actor(),game={_combatEpoch:1,gameData:{},ndUI:null};let hits=0;a.onAttacked=()=>hits++;Tower.damage(game,a,{x:0,y:0},10,{attackType:'arrow'},()=>change(a));assert.equal(hits,0,name);}
 const a=actor(),game={_combatEpoch:1,gameData:{},ndUI:null};let hits=0;a.onAttacked=n=>{hits++;a.hp-=n;};Tower.damage(game,a,{x:0,y:0},10,{attackType:'arrow'},()=>{});assert.equal(hits,1);assert.equal(a.hp,40);
 a._isPooled=true;assert.equal(Tower.choose([a],{x:0,y:0},100,{targeting:'nearest'}),null);
});

test('nullable optional attack requirements inherit shipped style restrictions while explicit values still constrain',()=>{
 for(const value of [undefined,null,'']){assert.equal(Eligibility.required({RequiredAttackType:value},'guardian'),true);assert.equal(Eligibility.eligible(120030,'guardian',{RequiredAttackType:value}),false);assert.equal(Eligibility.eligible(120030,'mystic',{RequiredAttackType:value}),true);}
 for(const value of [0,3,false])for(const style of Eligibility.ids)assert.equal(Eligibility.required({RequiredAttackType:value},style),false);
 assert.equal(Eligibility.required({RequiredAttackType:'1'},'guardian'),true);assert.equal(Eligibility.required({RequiredAttackType:2},'mystic'),true);assert.equal(Eligibility.required({RequiredAttackType:1},'mystic'),false);
});

test('healing feedback stays in the original actor lifetime while preserving committed HP and scalar callers',()=>{
 let sounds=0;
 const Heal=moduleValue('RelicRuntime',{'./RelicEligibility':Eligibility,BattleSounds:{effect(){sounds++;}}},{cc:{resources:{},isValid:value=>!!value&&!value.destroyed}});
 const changes={generation:a=>a.node._combatGeneration++,node:a=>a.node=actor().node,pooled:a=>a._isPooled=true,destroyedNode:a=>a.node.destroyed=true,destroyedActor:a=>a.destroyed=true};
 for(const [name,change]of Object.entries(changes)){
  const a=actor();let views=0;sounds=0;a.ctrHp.setHp=()=>change(a);a.upHpView=()=>views++;assert.equal(Heal.heal(a,.05),5,name);assert.equal(a.hp,55,name);assert.equal(views,0,name);assert.equal(sounds,0,name);
  const b=actor();sounds=0;b.upHpView=()=>change(b);assert.equal(Heal.heal(b,.05),5,name);assert.equal(b.hp,55,name);assert.equal(sounds,0,name+' after view');
 }
 for(const a of [actor(),{hp:95,hpMax:100}]){let views=0;sounds=0;a.upHpView=()=>views++;assert.equal(Heal.heal(a,.05),5);assert.equal(views,1);assert.equal(sounds,1);}
});

test('already destroyed healing recipients receive no HP writes, view calls or sounds',()=>{
 let calls=0;const Heal=moduleValue('RelicRuntime',{'./RelicEligibility':Eligibility,BattleSounds:{effect(){calls++;}}},{cc:{resources:{},isValid:value=>!!value&&!value.destroyed}});
 for(const change of [a=>a.destroyed=true,a=>a.node.destroyed=true]){const a=actor();change(a);a.ctrHp.setHp=()=>calls++;a.upHpView=()=>calls++;assert.equal(Heal.heal(a,.05),0);assert.equal(a.hp,50);assert.equal(calls,0);}
});
