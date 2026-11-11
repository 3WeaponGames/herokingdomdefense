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
    branches.forEach((b,i)=>{assert.equal(b.position,i);assert.equal(b.index,row.record.levelList[i].index);assert.equal(b.record,row.record.levelList[i]);assert(b.summary);assert(b.label&&!b.label.includes('[[loc:'));if(b.next.length)b.next.push(999);});
  }
  assert.equal(JSON.stringify(base),before,'view models never seed, normalize, or mutate branches');
  assert.equal(buildingIssues(docs()).length,0,'existing optional fields and terminal branches remain valid');
});
test('barracks roster options match implemented allies and branch summaries expose assignments',()=>{
  assert.deepEqual(Model.alliedUnits(base,catalog,'en').map(o=>o.value),[90001,90002,90003,90004]);
  const d=Schema.clone(base);delete (d.AllyCfg||d.SoldierCfg)['90002'].prefab;
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
  const d=docs();delete d.A.data.AllyCfg['90001'].prefab;
  assert(buildingIssues(d,[{doc:'A',path:['AllyCfg','90001','prefab']}]).some(i=>i.severity==='error'&&/Barracks unit/.test(i.message)));
});
test('unrelated existing building problems remain advisory and valid roster edits preserve unknown fields',()=>{
  const d=docs();d.A.data.BuildEnum['2'].levelList[0].level=-1;
  d.A.data.BuildEnum['3'].levelList[0].Data[0]=0;
  d.A.data.BuildEnum['3'].levelList[0].futureAuthored={untouched:[1,'unknown']};
  const issues=buildingIssues(d,[{doc:'A',path:['BuildEnum','3','levelList',0,'Data',0]}]);
  assert(issues.length&&issues.every(i=>i.severity==='warning'));
  assert.deepEqual(d.A.data.BuildEnum['3'].levelList[0].futureAuthored,{untouched:[1,'unknown']});
});
test('a new connection needs a priced destination or a retained legacy source price',()=>{
  const d=docs(),building=d.A.data.BuildEnum['3'],position=building.levelList.findIndex(level=>level.index===13);
  const level=building.levelList[position],at=['BuildEnum','3','levelList',position,'BranchBuild'];
  assert(!Object.prototype.hasOwnProperty.call(level,'BuildSliverCost'));
  level.BranchBuild=[16];
  assert(buildingIssues(d,[{doc:'A',path:at}]).some(i=>i.severity==='error'&&/destination building level/.test(i.message)));
  assert.equal(Object.prototype.hasOwnProperty.call(level,'BuildSliverCost'),false,'validation never inserts a default cost');
  building.levelList.find(row=>row.index===16).BuildCost=0;
  assert.equal(buildingIssues(d,[{doc:'A',path:at}]).length,0,'An explicit destination cost works without a legacy next-purchase field');
  delete building.levelList.find(row=>row.index===16).BuildCost;
  level.BuildSliverCost=0;
  assert.equal(buildingIssues(d,[{doc:'A',path:at},{doc:'A',path:at.slice(0,-1).concat('BuildSliverCost')}]).length,0,'an explicit zero cost is supported');
});

test('construction choices retain current branch IDs and reject missing, duplicated, upgraded or oversized cards',()=>{
  const d=docs(),building=d.A.data.BuildEnum['3'],at=['BuildEnum','3','InitialChoices'];
  building.InitialChoices=[11,14,17,20];
  const before=JSON.stringify(d);
  assert.equal(buildingIssues(d,[{doc:'A',path:at}]).length,0);
  assert.equal(JSON.stringify(d),before);
  for(const value of [null,[],{},[1],[11,11],[11,999],[11,14,17,20,12],[11,'14'],[12],[11,15]]){
    building.InitialChoices=value;
    assert(buildingIssues(d,[{doc:'A',path:at}]).some(issue=>issue.severity==='error'&&issue.path.includes('InitialChoices')),JSON.stringify(value));
  }
  delete building.InitialChoices;
  assert.equal(buildingIssues(d,[{doc:'A',path:at}]).length,0,'removing the optional list uses the first authored construction branch');
});

test('compacted current barracks keep stable IDs and authored map tags without obsolete branch records',()=>{
  const d=docs(),building=d.A.data.BuildEnum['3'],at=['BuildEnum','3'];
  assert.deepEqual(building.levelList.map(level=>level.index),Array.from({length:12},(_value,i)=>i+11));
  assert.deepEqual(building.InitialChoices,[11,14,17,20]);
  assert(building.levelList.every(level=>!building.levelList.some(other=>other.index===level.ColliderIndex)),
    'map collider tags remain valid independently of removed branch IDs 1–10');
  building.levelList.reverse();
  const before=JSON.stringify(d);
  assert.equal(buildingIssues(d,[{doc:'A',path:at}]).length,0,'branch references follow authored IDs rather than array offsets');
  assert.equal(JSON.stringify(d),before,'validation does not reorder or renumber source records');
});

test('compacted barracks reject obsolete references, missing or duplicate IDs and invalid map footprints',()=>{
  for(const [label,mutate,expected] of [
    ['obsolete construction reference',building=>{building.InitialChoices=[1];},/Construction choice must reference/],
    ['obsolete upgrade reference',building=>{building.levelList[0].BranchBuild=[2];},/Upgrade branch does not exist/],
    ['missing branch index',building=>{delete building.levelList[0].index;},/unique positive indices/],
    ['duplicate branch index',building=>{building.levelList[1].index=building.levelList[0].index;},/unique positive indices/],
    ['missing category owner',building=>{delete building.levelList[0].ID;},/category owner ID/],
    ['incorrect category owner',building=>{building.levelList[0].ID=2;},/category owner ID/],
    ['absent map tag',building=>{building.levelList[0].ColliderIndex=11;},/authored map collider tag/],
    ['fractional map tag',building=>{building.levelList[0].ColliderIndex=1.5;},/whole number/i],
    ['zero map tag',building=>{building.levelList[0].ColliderIndex=0;},/1 or greater/]
  ]){
    const d=docs();mutate(d.A.data.BuildEnum['3']);
    const before=JSON.stringify(d),issues=buildingIssues(d,[{doc:'A',path:['BuildEnum','3']}]);
    assert(issues.some(issue=>issue.severity==='error'&&expected.test(issue.message)),label+': '+issues.map(issue=>issue.message).join('; '));
    assert.equal(JSON.stringify(d),before,label+' is reported without repairing the authored data');
  }
});

test('new level-three towers require authored map footprints without changing the original arrow cap',()=>{
  const d=docs(),building=d.A.data.BuildEnum['2'],position=building.levelList.length;
  const row=Schema.clone(building.levelList[0]);row.index=position+1;row.level=3;row.ColliderIndex=1;delete row.BranchBuild;
  building.levelList.push(row);
  const at=['BuildEnum','2','levelList',position];
  assert.equal(buildingIssues(d,[{doc:'A',path:at}]).length,0);
  assert.equal(Schema.descriptor('level',{table:'BuildEnum',id:'2',building,levelIndex:position}).max,3);
  delete row.ColliderIndex;
  assert(buildingIssues(d,[{doc:'A',path:at}]).some(issue=>issue.path.at(-1)==='level'));
  row.ColliderIndex=position+1;
  assert(buildingIssues(d,[{doc:'A',path:at}]).some(issue=>issue.path.at(-1)==='ColliderIndex'));
});

test('tower combat and sprite authoring validates explicit values while retaining optional and unknown data',()=>{
  const d=docs(),row=d.A.data.BuildEnum['2'].levelList[0],at=['BuildEnum','2','levelList',0];
  row.Tower={attackType:'cannon',targeting:'highestHp',projectileSpeed:300,splashRadius:90,splashFalloff:.5,projectileLook:'',future:{retain:true}};
  row.Appearance={sprite:'buildings/towers/cannon-1',width:160,height:200,offsetX:-20,offsetY:10,muzzleX:-12,muzzleY:120,future:'keep'};
  const before=JSON.stringify(d);
  assert.equal(buildingIssues(d,[{doc:'A',path:at}]).length,0);
  assert.equal(JSON.stringify(d),before);
  row.Tower={projectileSpeed:450};assert.equal(buildingIssues(d,[{doc:'A',path:at}]).length,0,'partial overrides retain runtime defaults');
  for(const [field,value]of [['attackType','laser'],['targeting','unsupported'],['projectileSpeed',0],['projectileSpeed','300'],['splashRadius',-1],['splashFalloff',1.1],['splashFalloff',-1],['projectileLook',42]]){
    row.Tower={[field]:value};assert(buildingIssues(d,[{doc:'A',path:at.concat('Tower',field)}]).some(issue=>issue.severity==='error'&&issue.path.includes('Tower')),field);
  }
  delete row.Tower;
  for(const [field,value]of [['sprite','../outside'],['sprite','/outside'],['sprite','buildings/tower.png'],['width',0],['height',-2],['offsetX','2'],['muzzleY',Infinity]]){
    const original=row.Appearance[field];row.Appearance[field]=value;
    assert(buildingIssues(d,[{doc:'A',path:at.concat('Appearance',field)}]).some(issue=>issue.severity==='error'&&issue.path.includes('Appearance')),field+':'+value);
    row.Appearance[field]=original;
  }
});
