'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const Damage=require('../../assets/_script/FightingTypeDamage');
const {setup,hero,Node,authored}=require('./backend-gameplay-harness.cjs');
const near=(actual,expected)=>assert(Math.abs(actual-expected)<1e-8,`${actual} != ${expected}`);
const expected={fighter:1,guardian:2/3,vanguard:1.15,skirmisher:2,bruiser:1.1,mystic:2.2};

function fixture(){
 const h=setup({BattleSounds:{attack(){},hit(){}},LogMgr:{LogMgr:{getInstance:()=>({info(){}})}},KinghtFallAudioMgr:{KinghtFallAudioMgr:{getInstance:()=>({playEffectFree(){},stopEffectName(){}})}}});
 const p=hero(h),manager=h.e.stubs.KinghtFallDataMgr.KinghtFallDataMgr.getInstance();
 const tools=manager.data.GameTools=structuredClone(authored.GameTools);
 manager.getParamsCfgById=id=>authored.ParameterCfg[id==='RestrainedArms'?'60017':id]?.Value;
 h.g._combatEpoch=1;h.g.gameStatus=h.e.stubs.KinghtFallModle.KinghtFallGameStage.Fight;
 p._relicHero=true;p.state=0;p.node.setParent(h.g.ndMain);p.node.setPosition(10,0);p.node._combatGeneration=1;p.hp=p.hpMax=10000;p.time.NoDie=p.time.NoDieTime=0;
 h.ui.ctrEffect={showDamageNum(){},onMonsterAttack(){}};
 h.e.stubs.GameToolsOverrides=h.load('GameToolsOverrides');h.e.stubs.RelicCombat=h.load('RelicCombat');
 function unit(side,role,id=90001){
  const actor=h.e.actor(side==='ally'?'KinghtFallSoldierBase':'KinghtFallEnemyBase',20,0,h.g.ndMain);
  actor.cfg={...actor.cfg,ID:id,AttackType:1};actor.hp=actor.hpMax=10000;actor.node._combatGeneration=1;
  tools.unitTypeAssignments[`${side}:${id}:default`]=role;
  return actor;
 }
 return {...h,p,tools,manager,unit};
}

test('More is an added percentage; Less is a percentage divisor, with safe read-only legacy fallbacks',()=>{
 for(const [mode,percent,result]of [['more',0,1],['more',10,1.1],['more',100,2],['more',300,4],['more',400,5],['less',100,1],['less',200,.5],['less',300,1/3],['less',400,.25]]){
  const setting={mode,percent,future:{keep:[1,2]}},before=JSON.stringify(setting);
  assert(Damage.valid(setting));near(Damage.multiplier(setting),result);assert.equal(JSON.stringify(setting),before);
 }
 for(const value of [undefined,null,0,[],{},'400',{mode:'more',percent:-1},{mode:'less',percent:99},{mode:'less',percent:0},{mode:'more',percent:'400'},{mode:'more',percent:Infinity},{mode:'more',percent:NaN},{mode:'other',percent:400}]){
  assert.equal(Damage.valid(value),false);assert.equal(Damage.multiplier(value),1);
 }
});

test('the saved global defaults affect all six hero, ally and enemy types, across every attack source and secondary hits',()=>{
 const h=fixture(),before=JSON.stringify(h.tools);
 const sources=[undefined,{cfg:{AttackType:1}},{cfg:{AttackType:2}},{cfg:{AttackType:3}},{buildInfo:{}},h.p];
 for(const [role,multiplier]of Object.entries(expected)){
  h.p.heroStyle=h.d.heroStyle=role;
  const ally=h.unit('ally',role),enemy=h.unit('enemy',role);
  for(const source of sources)for(const secondary of [false,true])for(const actor of [h.p,ally,enemy]){
   const hp=actor.hp;near(actor.onAttacked(10,source,secondary),10*multiplier);near(hp-actor.hp,10*multiplier);
  }
 }
 // Assignment edits above are test inputs; damage must not seed any settings.
 h.tools.unitTypeAssignments['ally:90001:default']=authored.GameTools.unitTypeAssignments['ally:90001:default'];
 h.tools.unitTypeAssignments['enemy:90001:default']=authored.GameTools.unitTypeAssignments['enemy:90001:default'];
 assert.equal(JSON.stringify(h.tools),before);
});

test('custom types, stage-local profiles, boss phases and live type changes resolve the recipient rather than the attacker',()=>{
 const h=fixture(),overrides=h.load('GameToolsOverrides');
 h.tools.unitTypes.custom={name:'Custom',damageTaken:{mode:'less',percent:400},future:true};
 const enemy=h.unit('enemy','fighter');enemy.cfg.FightingType='custom';
 near(enemy.onAttacked(100,{heroStyle:'mystic'},true),25);
 enemy.cfg={ID:1000000000,ProfileBaseID:90003};near(enemy.onAttacked(100),200);
 for(const [id,phase]of [[90010,0],[90011,1],[90012,2]]){
  enemy.cfg={ID:id};enemy.spIdx=phase;h.tools.unitTypeAssignments[`enemy:${id}:${phase+1}`]='custom';near(enemy.onAttacked(100),25);
 }
 enemy.cfg={ID:1000000001,ProfileBaseID:90011,FightingType:'mystic'};near(enemy.onAttacked(100),220);
 enemy.cfg={ID:123456};delete enemy.spIdx;near(enemy.onAttacked(100),100);
 const ally=h.unit('ally','fighter');near(ally.onAttacked(100),100);
 h.tools.unitTypeAssignments['ally:90001:default']='custom';near(ally.onAttacked(100),25);
 h.p.heroStyle='custom';near(h.p.onAttacked(100),25);
 delete h.tools.unitTypes.custom.damageTaken;near(h.p.onAttacked(100),100);
 delete h.manager.data.GameTools;near(h.p.onAttacked(100),100);
 assert.equal(overrides.damageTaken(null,'enemy',100),100);
 assert.equal(overrides.damageTaken(h.p,'hero',0),0);
 assert.equal(overrides.damageTaken(h.p,'hero',-10),-10);
});

test('type defense stacks with existing hero reductions, finite shields, ally auras and talents without scaling HP or healing',()=>{
 const h=fixture(),Skills=h.load('HeroStyleSkills');h.p.heroStyle=h.d.heroStyle='guardian';
 const state=Skills.createState('guardian');state.shield=70;state.shieldRemaining=6;
 h.p._styleRuntime={state,bonus:()=>({damageReduction:.2,allyDamageReduction:.25})};
 const hit=100*(2/3)*.8;
 near(h.p.onAttacked(100),0);near(state.shield,70-hit);near(h.p.hp,10000);
 state.shield=0;near(h.p.onAttacked(100),hit);near(h.p.hp,10000-hit);
 const ally=h.unit('ally','skirmisher');
 const talent=h.e.stubs.KinghtFallEnum.KinghtFallEnumTalentCfg.TalenType04;h.d.talentAdd[talent]=[[.1]];
 near(ally.onAttacked(100),135);near(ally.hp,9865);
 h.p.time.NoDie=1;const hp=h.p.hp;assert.equal(h.p.onAttacked(100),undefined);near(h.p.hp,hp);
 h.p.addHpPro(.001);near(h.p.hp,hp+10);near(h.p.hpMax,10000);near(ally.hpMax,10000);
});

test('legacy unit counters still stack with global defense when their fighting type has no counter',()=>{
 const h=fixture(),enemy=h.unit('enemy','fighter');h.p.heroStyle=h.d.heroStyle='guardian';
 delete h.tools.unitTypes.fighter.counterType;
 enemy.node.setPosition(0,0);enemy.cfg.AttackRange=200;enemy.cfg.CounterType='guardian';enemy.getAttack=()=>100;
 h.manager.getParamsCfgById=()=>1.2;
 enemy.doAttack();near(h.p.hp,10000-80);
 enemy.cfg.CounterType='mystic';enemy.doAttack();near(h.p.hp,10000-80-100*(2/3));
});

test('fighter counters the skirmisher hero while late-game HP leaves the base defense gap intact',()=>{
 const h=fixture(),enemy=h.unit('enemy','fighter');
 enemy.node.setPosition(0,0);enemy.cfg.AttackRange=200;enemy.cfg.CounterType='guardian';enemy.getAttack=()=>100;
 h.p.heroStyle=h.d.heroStyle='skirmisher';h.p.hp=h.p.hpMax=2025;
 enemy.doAttack();near(h.p.hp,2025-250);near(h.p.hpMax,2025);
 h.p.heroStyle=h.d.heroStyle='guardian';h.p.hp=h.p.hpMax=2050;
 enemy.doAttack();near(h.p.hp,2050-100*(2/3));near(h.p.hpMax,2050);
 enemy.cfg.FightingType='vanguard';
 for(const [role,hp,multiplier]of [['skirmisher',2025,2],['guardian',2050,2/3]]){
  h.p.heroStyle=h.d.heroStyle=role;h.p.hp=h.p.hpMax=hp;
  enemy.doAttack();near(h.p.hp,hp-100*multiplier);
 }
});

test('all six hero matchups take precedence over per-unit counters and apply only to the direct victim',()=>{
 const h=fixture(),Combat=h.load('RelicCombat'),target=h.unit('enemy','fighter');
 const cycle={fighter:'skirmisher',skirmisher:'vanguard',vanguard:'mystic',mystic:'guardian',guardian:'bruiser',bruiser:'fighter'};
 for(const [attacker,countered]of Object.entries(cycle)){
  h.p.heroStyle=h.d.heroStyle=attacker;
  for(const [defender,defense]of Object.entries(expected)){
   target.cfg.FightingType=defender;
   const context=Combat.primaryContext(h.p,target,100,false);
   const outgoing=defender===countered?125:100;
   near(Combat.previewHeroHit(h.p,target,100),outgoing);
   near(target.onAttacked(100,h.p,false,context),outgoing*defense);
   near(context.nonCritical,100);
   near(target.onAttacked(100,h.p,true),100*defense);
  }
 }
});

test('hero basic melee and arrows get one counter bonus using the role at release',()=>{
 const h=fixture(),fighter=h.unit('enemy','fighter',90001),vanguard=h.unit('enemy','vanguard',90002);
 h.p.getAttack=()=>100;h.p.crit=0;h.p.heroRanged=false;h.p.heroStyle=h.d.heroStyle='bruiser';
 h.g.onPlayAttack(fighter);near(fighter.hp,10000-125);
 h.p.heroRanged=true;h.p.heroStyle=h.d.heroStyle='skirmisher';
 h.g.ndUI=h.g.ndMain;h.p.getAttWpos=()=>h.p.node.getPosition();
 let impact;h.g.takeHeroArrow=()=>({node:new Node(),setTag(_origin,_target,callback){impact=callback;}});
 h.g.onPlayAttack(vanguard);assert(impact);
 h.p.heroStyle='guardian';
 impact();near(vanguard.hp,10000-125*1.15);
});

test('launched enemy and ally projectiles apply the target type exactly once and display the resulting damage after shooter reuse',()=>{
 for(const kind of ['KinghtFallEnemyLong','KinghtFallEnemyItem08','KinghtFallSoldierItem03']){
  const h=fixture(),ally=kind==='KinghtFallSoldierItem03',target=ally?h.unit('enemy','skirmisher'):h.p;
  h.p.heroStyle=h.d.heroStyle='skirmisher';target.node.setPosition(10,0);h.d.enemyList=ally?[target]:[];
  const side=ally?'ally':'enemy';h.tools.unitTypeAssignments[`${side}:90001:default`]='fighter';
  const source=h.e.actor(kind,0,0,h.g.ndMain);source.node._combatGeneration=1;source.cfg={ID:90001,AttackType:2,AttackRange:200,CounterType:''};source.getAttack=()=>100;source.releaseAttackTarget=()=>target;
  let impact;h.g.onShotEnemy=h.g.onShotSoldier=()=>({pos:{x:0,y:0},ctr:{setParent(){},setTag(_p,_n,callback){impact=callback;}}});
  const shown=[];h.ui.ctrEffect.showDamageNum=(_point,amount)=>shown.push(amount);
  source.doAttack();assert(impact,kind);source.node._combatGeneration++;source.cfg.ID=90003;
  impact();near(target.hp,9750);assert.deepEqual(shown,[250]);
 }
});

test('enemy splash checks each victim’s matchup against the attacker’s type',()=>{
 const h=fixture(),primary=h.unit('ally','fighter',90001),guardian=h.unit('ally','guardian',90002);
 const source=h.e.actor('KinghtFallEnemyItem07',0,0,h.g.ndMain);
 source.cfg={...source.cfg,FightingType:'fighter',Data:[100,50,3]};
 source.node._combatGeneration=1;
 primary.uuid='primary';guardian.uuid='guardian';h.p.uuid='skirmisher';
 h.d.soldierList=[primary,guardian];h.p.heroStyle=h.d.heroStyle='skirmisher';
 h.ui.ctrEffect.onAttack=()=>{};
 source.doSplashDamage(primary);
 near(primary.hp,10000);
 near(guardian.hp,10000-100*(2/3));
 near(h.p.hp,9750);
});

test('cannon splash, critical hits and relic secondary hits use each recipient type',()=>{
 const h=fixture(),guardian=h.unit('enemy','fighter',90001),mystic=h.unit('enemy','fighter',90002);
 const shown=[];h.ui.ctrEffect.showDamageNum=(_point,amount)=>shown.push(amount);
 guardian.cfg.FightingType='guardian';mystic.cfg.FightingType='mystic';h.d.enemyList=[guardian,mystic];
 const Tower=h.load('TowerCombat');Tower.damage(h.g,guardian,{x:20,y:0},100,{attackType:'cannon',splashRadius:100,splashFalloff:1},null,{buildInfo:{}});
 near(guardian.hp,10000-100*(2/3));near(mystic.hp,9780);
 h.p.heroStyle=h.d.heroStyle='bruiser';const Combat=h.load('RelicCombat');h.d.treasureAdd[120035]=[.12];
 const context=Combat.primaryContext(h.p,guardian,100,true);
 near(guardian.onAttacked(200,h.p,false,context),200*(2/3));near(mystic.hp,9780-100*.12*2.2);
 assert.equal(shown.length,1);near(shown[0],100*.12*2.2);
});
