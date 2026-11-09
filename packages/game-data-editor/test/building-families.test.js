'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),test=require('node:test');
const Model=require('../buildings/model');
const project=path.resolve(__dirname,'../../..');
const base=JSON.parse(fs.readFileSync(path.join(project,'assets/KinghtFallConfig/GameJsonCfg.json'),'utf8'));
const translations=JSON.parse(fs.readFileSync(path.join(project,'assets/resources/localization/catalog.json'),'utf8'));
function freeze(value,seen=new Set()){
  if(value&&typeof value==='object'&&!seen.has(value)){
    seen.add(value);Object.values(value).forEach(child=>freeze(child,seen));Object.freeze(value);
  }
  return value;
}
function branch(index,level,Name,next){
  const record={index,level,Name,Icon:'icon-'+index,Data:[1,90001,5],Hp:100,future:{untouched:true}};
  if(next!==undefined)record.BranchBuild=next;
  return record;
}
function fixture(levelList,InitialChoices,typeID='2'){
  const record={name:typeID==='3'?'Barracks':'Tower',enumKey:'AuthoredType',levelList,unknown:{retained:[1,2]}};
  if(InitialChoices!==undefined)record.InitialChoices=InitialChoices;
  return {BuildEnum:{[typeID]:record}};
}

test('current construction exposes eleven families, four separate barracks and three tower types',()=>{
  const rows=Model.families(base,translations,'en');
  assert.equal(rows.length,11);
  assert.deepEqual(rows.filter(r=>r.typeID==='3').map(r=>[r.key,r.label,r.constructionOrder]),[
    ['3:11','Royal Guard Barracks',0],['3:14','Heavy Infantry Barracks',1],
    ['3:17','Crossbowmen Barracks',2],['3:20','Vanguard Barracks',3]
  ]);
  assert.deepEqual(rows.filter(r=>r.typeID==='2').map(r=>[r.key,r.label]),[
    ['2:1','Arrow Tower'],['2:4','Cannon Tower'],['2:7','Sniper Tower']
  ]);
  assert.deepEqual(rows.diagnostics,[]);
  for(const row of rows){
    assert.equal(Object.prototype.hasOwnProperty.call(row,'legacy'),false);
    assert.equal(row.record,base.BuildEnum[row.typeID]);
    assert.equal(row.root.record,row.record.levelList[row.rootPosition]);
    assert.equal(row.rootIndex,row.root.index);assert.equal(row.icon,row.root.record.Icon);
    assert.deepEqual(row.path,['BuildEnum',row.typeID]);
    for(const entry of row.branches){
      assert.equal(entry.record,row.record.levelList[entry.position]);
      assert.deepEqual(entry.path,['BuildEnum',row.typeID,'levelList',entry.position]);
    }
  }
});

test('both configuration copies and translation sources contain only the current building system',()=>{
  const fallback=JSON.parse(fs.readFileSync(path.join(project,'assets/configs/GameJsonCfg.json'),'utf8'));
  assert.deepEqual(fallback.BuildEnum,base.BuildEnum,'Packaged configuration must offer the same current buildings');
  assert.deepEqual(base.BuildEnum[3].levelList.map(row=>row.index),Array.from({length:12},(_,i)=>i+11));
  const seed=JSON.parse(fs.readFileSync(path.join(project,'tools/localization/text-entries.json'),'utf8'));
  for(const source of [translations,seed])assert(!Object.keys(source.entries).some(key=>/^data\.buildenum\.3\.levellist\.(?:[1-9]|10)\./.test(key)),'Removed branch translations cannot return when rebuilding the catalog');
});

test('logical level groups retain every reachable authored alternative',()=>{
  const rows=Model.families(base,translations,'en');
  const arrow=rows.find(r=>r.key==='2:1');
  assert.deepEqual(arrow.levels.map(group=>[group.level,group.branches.map(b=>b.index)]),[[1,[1]],[2,[2,3]]]);
  for(const typeID of ['4','5','6']){
    assert.deepEqual(rows.find(r=>r.typeID===typeID).levels.map(group=>group.branches.map(b=>b.index)),[[1],[2,3]]);
  }
});

test('construction order, noncontiguous identifiers and original positions remain independent',()=>{
  const input=fixture([
    branch(42,3,'Azure Tower · Lv3'),branch(17,1,'Ember Tower Level 1',[80]),
    branch(80,2,'Ember Tower Level 2'),branch(9,1,'Azure Tower · Lv1',[63]),
    branch(63,2,'Azure Tower · Lv2',[42]),branch(91,7,'Old Tower')
  ],[9,17]);
  const rows=Model.families(input,{},'en');
  assert.deepEqual(rows.map(r=>r.key),['2:9','2:17']);
  assert.deepEqual(rows[0].branches.map(b=>[b.index,b.position]),[[42,0],[9,3],[63,4]],'graph traversal does not reorder authored storage');
  assert.deepEqual(rows[0].levels.map(group=>[group.level,group.branches.map(b=>b.index)]),[[1,[9]],[2,[63]],[3,[42]]]);
  assert.equal(rows[0].rootPosition,3);assert.equal(rows[0].label,'Azure Tower');
  assert.equal(rows[1].rootPosition,1);assert.equal(rows[1].label,'Ember Tower');
  assert(!rows.some(row=>row.branches.some(branch=>branch.index===91)),'unreachable obsolete branches are omitted');
  assert.deepEqual(rows.diagnostics,[]);
});

test('shared upgrades appear in each reachable family without duplicate entries',()=>{
  const input=fixture([
    branch(21,1,'First Lv1',[51,61]),branch(31,1,'Second Lv1',[61]),
    branch(51,2,'Alternative A',[71]),branch(61,2,'Alternative B',[71]),branch(71,3,'Shared')
  ],[31,21]);
  const rows=Model.families(input,{},'en');
  assert.deepEqual(rows.map(r=>r.branches.map(b=>b.index)),[[31,61,71],[21,51,61,71]]);
  assert.equal(rows[0].branches.at(-1).record,rows[1].branches.at(-1).record);
  assert.deepEqual(rows.diagnostics,[]);
});

test('cycles and unknown children report exact original paths while traversal stays finite',()=>{
  const input=fixture([
    branch(90,1,'Loop Lv1',[50,999]),branch(50,2,'Loop Lv2',[90,50,'90'])
  ],[90]);
  const rows=Model.families(freeze(input),{},'en');
  assert.deepEqual(rows[0].branches.map(b=>b.index),[90,50]);
  assert.equal(rows.diagnostics.filter(d=>d.code==='cycle').length,2);
  assert.equal(rows.diagnostics.filter(d=>d.code==='unknown-child').length,2);
  assert.deepEqual(rows.diagnostics.find(d=>d.index===999).path,['BuildEnum','2','levelList',0,'BranchBuild',1]);
  assert.deepEqual(rows[0].diagnostics,rows.diagnostics);
});

test('explicit invalid construction choices never silently fall back or seed defaults',()=>{
  for(const choices of [[],null,{},[1,1],[1,999],[1,'2']]){
    const input=fixture([branch(1,1,'Original',[2]),branch(2,2,'Upgrade')],choices);
    const before=JSON.stringify(input),rows=Model.families(freeze(input),{},'en');
    assert.equal(rows.length,0,JSON.stringify(choices));
    assert(rows.diagnostics.some(d=>/^invalid-initial-choice/.test(d.code)));
    assert.equal(JSON.stringify(input),before);
    assert.equal(input.BuildEnum['2'].levelList.length,2,'browsing leaves source records untouched');
  }
  const input=fixture([branch(1,1,'Original')]);input.BuildEnum['2'].InitialChoices=undefined;
  assert.equal(Model.families(input,{},'en').length,0,'an explicitly malformed property differs from an absent optional property');
});

test('only level-one initial choices appear without repairing or exposing omitted choices',()=>{
  const input=fixture([
    branch(4,2,'Upgraded first choice'),branch(7,1,'Starting choice',[9]),branch(9,2,'Next level')
  ],[4,7]);
  const before=JSON.stringify(input),rows=Model.families(freeze(input),{},'en');
  assert.deepEqual(rows.map(row=>[row.key,row.constructionOrder]),[['2:7',1]],'the remaining family retains its authored card order');
  assert.deepEqual(rows[0].branches.map(row=>row.index),[7,9]);
  const issue=rows.diagnostics.find(issue=>issue.code==='invalid-initial-level');
  assert(issue);assert.deepEqual(issue.path,['BuildEnum','2','InitialChoices',0]);assert.equal(issue.index,4);
  assert.equal(JSON.stringify(input),before,'the ignored choice and its original level are never repaired');
  const allUpgraded=fixture([branch(4,2,'Upgraded choice')],[4]);
  const omitted=Model.families(allUpgraded,{},'en');
  assert.equal(omitted.length,0);assert.equal(omitted.diagnostics[0].code,'invalid-initial-level');
});

test('absent choices use the first authored branch rather than assuming index one',()=>{
  for(const typeID of ['1','4','5','6','27']){
    const input=fixture([branch(40,1,'First',[12]),branch(12,2,'Second'),branch(1,1,'Unreachable')],undefined,typeID);
    const rows=Model.families(input,{},'en');
    assert.equal(rows[0].key,typeID+':40');assert.equal(rows[0].typeID,typeID);
    assert.deepEqual(rows[0].branches.map(b=>b.index),[40,12]);
    assert.equal(rows.length,1,'unreachable records are not offered as additional families');
  }
});

test('family names resolve authored localization and remove only trailing level markers',()=>{
  const input=fixture([
    branch(8,1,'[[loc:custom.guard]]',[10]),branch(10,2,'Anything'),
    branch(20,1,'Twilight Barracks · Lvl. 1'),branch(30,1,'Level 1 Defenders')
  ],[8,20,30],'3');
  const catalog={entries:{'custom.guard':{en:'Moon Guard · Lv1',fr:'Garde lunaire · Level 1'}}};
  assert.deepEqual(Model.families(input,catalog,'en').map(r=>r.label),[
    'Moon Guard Barracks','Twilight Barracks','Level 1 Defenders Barracks'
  ]);
  assert.equal(Model.families(input,catalog,'fr')[0].label,'Garde lunaire Barracks');
});

test('malformed branches are diagnosed without exposing unreachable records or changing source',()=>{
  const input=fixture([
    branch(7,1,'First',[22]),null,branch(7,2,'Duplicate'),branch(22,2,'Known'),
    branch(84,0,'Broken level',{}),branch('bad',3,'Broken index')
  ],[7]);
  const before=JSON.stringify(input),rows=Model.families(freeze(input),{},'en');
  assert.deepEqual(rows[0].branches.map(b=>b.position),[0,3]);
  assert.equal(rows.length,1);
  for(const code of ['invalid-branch','duplicate-index','invalid-level','invalid-children','invalid-index']){
    assert(rows.diagnostics.some(d=>d.code===code),code);
  }
  assert.equal(JSON.stringify(input),before);
});

test('browsing frozen game data and mutating view arrays performs no game-data writes',()=>{
  const input=freeze(JSON.parse(JSON.stringify(base))),catalog=freeze(JSON.parse(JSON.stringify(translations)));
  const before=JSON.stringify(input),rows=Model.families(input,catalog,'en');
  for(const row of rows){
    for(const entry of row.branches)entry.next.push(123456);
    row.branches.reverse();row.levels.reverse();row.path.push('view-only');
  }
  rows.reverse();
  assert.equal(JSON.stringify(input),before);
  assert.equal(Model.families(input,catalog,'en').length,11,'browsing is repeatable');
  assert.deepEqual(Model.catalog(input,catalog,'en').map(row=>row.key),['1','2','3','4','5','6'],'the original category API is unchanged');
});
