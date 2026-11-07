'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),test=require('node:test');
const Model=require('../buildings/model'),Schema=require('../lib/schema');
const root=path.resolve(__dirname,'../../..');
const base=JSON.parse(fs.readFileSync(path.join(root,'assets/KinghtFallConfig/GameJsonCfg.json'),'utf8'));
const catalog=JSON.parse(fs.readFileSync(path.join(root,'assets/resources/localization/catalog.json'),'utf8'));
const docs=()=>({A:{data:Schema.clone(base)},catalog:{data:Schema.clone(catalog)}});
const buildingIssues=(d,changes)=>Schema.validate(d,changes).filter(i=>i.path[0]==='BuildEnum');

test('building catalog shows every authored type and branch without modifying source data',()=>{
  const before=JSON.stringify(base),rows=Model.catalog(base,catalog,'en');
  assert.deepEqual(rows.map(r=>r.key),['1','2','3','4','5','6']);
  for(const row of rows){
    assert(row.label&&!row.label.includes('[[loc:'));assert(row.subtitle.includes('ID '+row.key));
    assert.deepEqual(row.path,['BuildEnum',row.key]);assert.equal(row.record,base.BuildEnum[row.key]);
    const branches=Model.branches(row.record,row.key,base,catalog,'en');
    assert.equal(branches.length,row.record.levelList.length);
    branches.forEach((b,i)=>{assert.equal(b.position,i);assert.equal(b.index,i+1);assert.equal(b.record,row.record.levelList[i]);assert(b.summary);assert(b.label&&!b.label.includes('[[loc:'));if(b.next.length)b.next.push(999);});
  }
  assert.equal(JSON.stringify(base),before,'view models never seed, normalize, or mutate branches');
  assert.equal(buildingIssues(docs()).length,0,'existing optional fields and terminal branches remain valid');
});
test('barracks roster options match implemented allies and branch summaries expose assignments',()=>{
  assert.deepEqual(Model.alliedUnits(base,catalog,'en').map(o=>o.value),[90001,90002,90003,90004]);
  const d=Schema.clone(base);delete d.SoldierCfg['90002'].prefab;
  assert(!Model.alliedUnits(d,catalog,'en').some(o=>o.value===90002));
  assert(Model.branches(base.BuildEnum['3'],'3',base,catalog,'en').every(b=>b.unit&&/respawn/.test(b.summary)));
  assert(/silver/.test(Model.branchSummary(4,base.BuildEnum['4'].levelList[0],base,catalog,'en')));
  assert(!/silver/.test(Model.branchSummary(6,base.BuildEnum['6'].levelList[0],base,catalog,'en')));
});
test('building field metadata uses runtime units and keeps reserved wall data read-only',()=>{
  const at=(id,i)=>Schema.dataDescriptor({table:'BuildEnum',id},i);
  assert.equal(at(3,0).integer,true);assert.equal(at(3,0).min,0);
  assert(at(3,2).min>0);assert(at(1,1).min>0);assert(at(2,1).min>0);
  assert(at(6,0).readOnly);assert(!/silver/i.test(at(6,0).label));
  const level=Schema.descriptor('level',{table:'BuildEnum'});assert.equal(level.integer,true);assert.equal(level.min,1);
  for(const [id,max]of [[1,3],[2,2],[3,3],[4,2],[5,2],[6,2]])assert.equal(Schema.descriptor('level',{table:'BuildEnum',id}).max,max);
  assert.equal(Schema.descriptor('level',{table:'BuildEnum',id:99}).max,undefined,'unknown types retain their own authoring contract');
});
test('unsafe roster, rate, level and upgrade connection drafts are rejected without repair',()=>{
  for(const [id,key,value] of [
    ['3',['Data',0],1.5],['3',['Data',2],0],['3',['Data',1],90005],
    ['3',['Data'],null],['2',['Data',1],0],['1',['level'],0],['1',['level'],1.5],
    ['1',['level'],4],['2',['level'],3],['3',['level'],4],['4',['level'],3],['5',['level'],3],['6',['level'],3],
    ['2',['BranchBuild'],[2,2]],['2',['BranchBuild'],[]],['2',['BranchBuild'],{}],
    ['2',['BranchBuild'],[999]],['2',['BranchBuild'],[1]]
  ]){
    const d=docs(),level=d.A.data.BuildEnum[id].levelList[0];let parent=level;
    for(const k of key.slice(0,-1))parent=parent[k];parent[key[key.length-1]]=value;
    const before=JSON.stringify(d),issues=buildingIssues(d,[{doc:'A',path:['BuildEnum',id,'levelList',0].concat(key)}]);
    assert(issues.some(i=>i.severity==='error'),id+':'+key.join('.')+'='+JSON.stringify(value));
    assert.equal(JSON.stringify(d),before,'invalid drafts are reported, never repaired');
  }
  const d=docs();delete d.A.data.SoldierCfg['90001'].prefab;
  assert(buildingIssues(d,[{doc:'A',path:['SoldierCfg','90001','prefab']}]).some(i=>i.severity==='error'&&/Barracks unit/.test(i.message)));
});
test('unrelated legacy building problems remain advisory and valid roster edits preserve unknown fields',()=>{
  const d=docs();d.A.data.BuildEnum['2'].levelList[0].level=-1;
  d.A.data.BuildEnum['3'].levelList[0].Data[0]=0;
  d.A.data.BuildEnum['3'].levelList[0].legacy={untouched:[1,'unknown']};
  const issues=buildingIssues(d,[{doc:'A',path:['BuildEnum','3','levelList',0,'Data',0]}]);
  assert(issues.length&&issues.every(i=>i.severity==='warning'));
  assert.deepEqual(d.A.data.BuildEnum['3'].levelList[0].legacy,{untouched:[1,'unknown']});
});
test('a new connection on a formerly final branch needs its own next purchase cost',()=>{
  const d=docs(),level=d.A.data.BuildEnum['3'].levelList[3],at=['BuildEnum','3','levelList',3,'BranchBuild'];
  assert(!Object.prototype.hasOwnProperty.call(level,'BuildSliverCost'));
  level.BranchBuild=[3];
  assert(buildingIssues(d,[{doc:'A',path:at}]).some(i=>i.severity==='error'&&/next purchase cost/.test(i.message)));
  assert.equal(Object.prototype.hasOwnProperty.call(level,'BuildSliverCost'),false,'validation never inserts a default cost');
  level.BuildSliverCost=0;
  assert.equal(buildingIssues(d,[{doc:'A',path:at},{doc:'A',path:at.slice(0,-1).concat('BuildSliverCost')}]).length,0,'an explicit zero cost is supported');
});
