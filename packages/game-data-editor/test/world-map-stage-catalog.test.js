'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {Service,tree}=require('../worlds/service'),temporary=require('./owned-temp');

function fixture(){
 const root=temporary('hkd-map-stage-catalog-'),artifacts=temporary('hkd-map-stage-artifacts-'),service=new Service(root,{artifacts});
 service.indexData={stages:[
  {id:'A-1',variant:'A',level:1,mapId:'Map01',prefab:'Map01',name:'Frontier Plains',waves:10},
  {id:'B-2',variant:'B',level:2,mapId:'Map02',prefab:'Generated/Stages/B-2',name:'Silent Forest',waves:12},
  {id:'D-3',variant:'D',level:3,mapId:'Map03',prefab:'Map03',name:'Arid Desert',waves:14}
 ]};
 return{root,artifacts,service};
}
function saved(root,id,value){const file=path.join(root,'authoring/worlds/stages',id+'.json');fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify(value));}

test('map usage includes every stage variant and respects authored map choices without opening drafts',()=>{
 const {root,artifacts,service}=fixture();saved(root,'B-2',{id:'B-2',mapId:'Map07',buildings:[],FutureField:{preserve:1}});
 const files=tree(root),version=service.version,source=JSON.stringify(service.indexData),rows=service.stageCatalog();
 assert.deepEqual(rows.map(s=>[s.id,s.mapId,s.dirty]),[['A-1','Map01',false],['B-2','Map07',false],['D-3','Map03',false]]);
 assert.equal(rows[1].prefab,'Generated/Stages/B-2');assert.equal(rows[1].name,'Silent Forest');assert.equal(rows[1].waves,12);
 assert.deepEqual(tree(root),files);assert.equal(service.version,version);assert.deepEqual(Object.keys(service.docs),[]);
 assert.equal(fs.existsSync(service.recovery),false);assert.deepEqual(fs.readdirSync(artifacts),[]);assert.equal(JSON.stringify(service.indexData),source);
 rows[0].mapId='Mutated caller copy';assert.equal(service.stageCatalog()[0].mapId,'Map01');
});

test('shared stage drafts immediately move map usage and retain their dirty state without catalog writes',()=>{
 const {root,service}=fixture();saved(root,'B-2',{id:'B-2',mapId:'Map07'});
 const original={id:'B-2',mapId:'Map07',buildings:[{id:2,x:100,y:200}],FutureField:{keep:true}},data=structuredClone(original);
 data.mapId='Map01';data.buildings[0].x=300;
 service.docs['stage:B-2']={key:'stage:B-2',original,data};
 const files=tree(root),draft=JSON.stringify(service.docs),version=service.version,rows=service.stageCatalog();
 assert.deepEqual(rows.filter(s=>s.mapId==='Map01').map(s=>s.id),['A-1','B-2']);assert.equal(rows.find(s=>s.id==='B-2').dirty,true);
 assert(!rows.some(s=>s.id==='B-2'&&s.mapId==='Map07'));
 assert.equal(JSON.stringify(service.docs),draft);assert.equal(service.version,version);assert.deepEqual(tree(root),files);assert.equal(fs.existsSync(service.recovery),false);
 service.docs['stage:B-2'].data=structuredClone(original);
 assert.equal(service.stageCatalog().find(s=>s.id==='B-2').mapId,'Map07');assert.equal(service.stageCatalog().find(s=>s.id==='B-2').dirty,false);
});
