'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const {setup, Node, authored} = require('./backend-gameplay-harness.cjs');
const schema = require('../../packages/game-data-editor/lib/schema');

function queue(rows) {
  const data = JSON.parse(JSON.stringify(authored));
  data.LevelCfg[0].WaveCfg[0].RefreshSoldierKind = rows;
  const issues = schema.validate({A:data}, [{doc:'A',path:['LevelCfg',0,'WaveCfg',0,'RefreshSoldierKind']}]);
  assert.deepEqual(issues.filter(i => i.path.slice(0,5).join('/') === 'LevelCfg/0/WaveCfg/0/RefreshSoldierKind'), []);
  return Object.fromEntries(rows.map(row => { const r = schema.parseSpawn(row); return [r.lane,r.groups.map(g => ({id:g.unit,num:g.count}))]; }));
}
function prefab(id) { return () => { const node = new Node(); node.getComponent = () => ({uuid:String(id),node,initData(){},onUpdate(){}}); return node; }; }
function consume(h) { h.d.onUpdata(.51); }

test('editor-valid trailing delays finish after their original tick count when the last enemy dies early', () => {
  const h = setup(); h.d.packInterval = .5; h.d.enemyQueue = queue(['1#90001,1;-1,2']);
  consume(h); h.pending[0](prefab(1)); h.d.delEnemy(h.d.enemyList[0]);
  assert.equal(h.events.length,0); assert.equal(h.d.enemyQueue[1][0].num,2);
  h.d.onUpdata(.5); assert.equal(h.d.enemyQueue[1][0].num,2, 'preserve strict authored interval boundary');
  h.d.onUpdata(.01); assert.equal(h.d.enemyQueue[1][0].num,1); assert.equal(h.events.length,0);
  consume(h); assert.deepEqual(h.events,[['RoundEnd']]);
  for(let i=0;i<10;i++) consume(h);
  h.d.tryEndGame(); assert.deepEqual(h.events,[['RoundEnd']], 'completion is one-shot');
});

test('mixed lanes and consecutive waits retain independent order and do not finish a zero-enemy gap early', () => {
  const h=setup(); h.d.packInterval=.5;
  h.d.enemyQueue=queue(['1#90001,1;-1,1;-1,2','2#-1,2;90002,1;-1,1']);
  consume(h); h.pending[0](prefab(1)); h.d.delEnemy(h.d.enemyList[0]);
  consume(h); assert.equal(h.events.length,0); assert.equal(h.d.enemyQueue[1][0].num,2);
  assert.equal(h.d.enemyQueue[2][0].id,90002);
  consume(h); assert.equal(h.d.pendingEnemySpawns,1); assert.equal(h.events.length,0);
  h.pending[1](prefab(2)); h.d.delEnemy(h.d.enemyList[0]); assert.equal(h.events.length,0);
  consume(h); assert.deepEqual(h.events,[['RoundEnd']]);
  assert(Object.values(h.d.enemyQueue).every(lane=>lane.length===0));
});

test('draining the final delay still waits for an asynchronous enemy and emits final victory once', () => {
  const h=setup(); h.d.packInterval=.5; h.d.round=2; h.d.enemyQueue=queue(['1#90001,1;-1,2']);
  consume(h); consume(h); consume(h);
  assert.equal(h.d.enemyList.length,0); assert.equal(h.d.enemyQueue[1].length,0);
  assert.equal(h.d.pendingEnemySpawns,1); assert.equal(h.events.length,0);
  h.pending[0](prefab(1)); consume(h); assert.equal(h.events.length,0);
  h.d.delEnemy(h.d.enemyList[0]); consume(h); h.d.tryEndGame();
  assert.deepEqual(h.events,[['GameOver',true]]);
});

function actualUI() {
  function Base(){}
  const cc={_decorator:{ccclass:x=>x,property:()=>()=>{}},v2:()=>({x:0,y:0}),
    Camera:{main:{getWorldToScreenPoint:p=>p}},Sprite:function(){},Label:function(){}};
  const guideBindings=[];
  const context={cc,exports:{},require:name=>name==='EnemyGuide'?{bind(_ui,record){guideBindings.push({id:record.id,ids:Array.from(record._guideIds||[]),live:record._guideLive});}}:{default:Base},__extends:(C,B)=>{C.prototype=Object.create(B.prototype);C.prototype.constructor=C;},__decorate:(_ds,t)=>t};
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname,'../../assets/_script/KinghtFallUIGame.js'),'utf8'),context);
  const ui=Object.create(context.exports.default.prototype),label={string:''};
  const item={active:true,getChildByName:()=>({getComponent:()=>label})};
  Object.assign(ui,{speed:1,isPauset:false,_updateTestControls(){},_enemyIndicatorObstacles:()=>[],_placeEnemyIndicator(){},_placeUpcomingEnemyIndicators(){},
    ctrUI:{upGuide(){},node:{convertToNodeSpaceAR:p=>p}},ctrGame:{onUpdate(){},ndPath:{convertToWorldSpaceAR:p=>p},gameData:{baseBuild:{getLevel:()=>1},enemyQueue:{}}},
    enemyIconInfo:{1:{id:90001,tag:true,tagNode:{getPosition:()=>({x:0,y:0})},ndItem:item}}});
  return {ui,item,label,guideBindings};
}
test('the actual queue HUD hides a lone or consecutive wait and still shows the next real group without changing data', () => {
  const {ui,item,label,guideBindings}=actualUI();
  for(const rows of [[{id:-1,num:2}],[{id:-1,num:1},{id:-1,num:2}],[]]) {
    ui.ctrGame.gameData.enemyQueue={1:rows}; const before=JSON.stringify(rows);
    ui.update(.1); assert.equal(item.active,false); assert.equal(JSON.stringify(rows),before);
    assert.equal(guideBindings.length,0,'Wait-only lanes have no inspectable monster');
  }
  ui.ctrGame.gameData.enemyQueue={1:[{id:-1,num:2},{id:90001,num:3}]};
  ui.update(.1); assert.equal(item.active,true); assert.equal(label.string,'3');
  assert.deepEqual(guideBindings,[{id:90001,ids:[90001],live:false}]);
  assert.equal(JSON.stringify(ui.ctrGame.gameData.enemyQueue[1]),JSON.stringify([{id:-1,num:2},{id:90001,num:3}]));
});
