'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),test=require('node:test');
const Schema=require('../lib/schema'),Assets=require('../lib/asset-validation');
const root=path.resolve(__dirname,'../../..');
const base=JSON.parse(fs.readFileSync(path.join(root,'assets/KinghtFallConfig/GameJsonCfg.json'),'utf8'));
const catalog=JSON.parse(fs.readFileSync(path.join(root,'assets/resources/localization/catalog.json'),'utf8'));
const at=['BuildEnum','2','levelList',0,'Appearance','destroyed'];
function fixture(){
    const docs={A:{data:Schema.clone(base)},catalog:{data:Schema.clone(catalog)}};
    const row=docs.A.data.BuildEnum['2'].levelList[0];
    row.Appearance={sprite:'buildings/towers/cannon-1',destroyed:{sprite:'buildings/towers/cannon-1-destroyed',width:187,height:187,offsetY:-38,unknown:{retain:true}}};
    return{docs,row};
}
test('destroyed artwork validates without seeding defaults or changing legacy rows',()=>{
    const {docs,row}=fixture(),before=JSON.stringify(docs),changes=[{doc:'A',path:at}];
    assert.equal(Schema.validate(docs,changes).filter(issue=>issue.path.includes('destroyed')).length,0);
    assert.equal(JSON.stringify(docs),before);
    row.Appearance.destroyed={sprite:'buildings/towers/cannon-1-destroyed'};
    assert.equal(Schema.validate(docs,changes).filter(issue=>issue.path.includes('destroyed')).length,0);
    delete row.Appearance.destroyed;
    assert.equal(Schema.validate(docs,changes).filter(issue=>issue.path.includes('destroyed')).length,0);
});
test('destroyed artwork rejects unsafe resources and invalid transforms without repairing drafts',()=>{
    for(const [key,value]of [['sprite','../outside'],['sprite','tower.png'],['sprite',''],['width',0],['height',-1],['width','187'],['offsetX',Infinity],['offsetY',NaN]]){
        const {docs,row}=fixture();row.Appearance.destroyed[key]=value;const before=JSON.stringify(docs);
        assert(Schema.validate(docs,[{doc:'A',path:at.concat(key)}]).some(issue=>issue.severity==='error'&&issue.path.includes('destroyed')),key+':'+value);
        assert.equal(JSON.stringify(docs),before);
    }
});
test('destroyed sprites resolve in Resources and missing references block only related saves',()=>{
    const {docs,row}=fixture();
    assert.deepEqual(Assets.validate(root,docs,[{doc:'A',path:at}]),[]);
    row.Appearance.destroyed.sprite='buildings/towers/not-imported-destroyed';
    assert(Assets.validate(root,docs,[{doc:'A',path:at}]).some(issue=>issue.path.includes('destroyed')));
    assert.deepEqual(Assets.validate(root,docs,[{doc:'A',path:['BuildEnum','2','levelList',0,'Data',0]}]),[]);
});
