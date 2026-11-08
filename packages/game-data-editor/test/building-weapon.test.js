'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),test=require('node:test');
const Artwork=require('../preview/building-artwork'),Schema=require('../lib/schema');
const root=path.resolve(__dirname,'../../..'),base=JSON.parse(fs.readFileSync(path.join(root,'assets/KinghtFallConfig/GameJsonCfg.json'),'utf8')),catalog=JSON.parse(fs.readFileSync(path.join(root,'assets/resources/localization/catalog.json'),'utf8'));
const clone=Schema.clone;
const appearance=()=>({sprite:'buildings/towers/cannon-1-base',width:180,height:220,offsetX:-8,offsetY:4,weapon:{sprite:'buildings/towers/cannon-1-weapon',width:130,height:70,pivotX:.25,pivotY:.6,offsetX:12,offsetY:174,muzzleX:87,muzzleY:23,unknown:{preserve:true}}});
test('all eight preview aim directions leave the base fixed and place the muzzle on the firing ray',()=>{
    const value=appearance(),original=JSON.stringify(value),radius=Math.hypot(87,23),reference=Artwork.geometry(value,null);
    assert.equal(reference.weapon.angle,0);assert.equal(reference.weapon.flipX,1);
    for(const angle of [-180,-135,-90,-45,0,45,90,135]){
        const view=Artwork.geometry(value,angle),w=view.weapon,radians=angle*Math.PI/180;
        assert.deepEqual(view.base,reference.base,'aiming moves only the weapon');
        assert(Math.abs(w.muzzle.x-(12+Math.cos(radians)*radius))<1e-8,angle+' muzzle X');
        assert(Math.abs(w.muzzle.y-(174+Math.sin(radians)*radius))<1e-8,angle+' muzzle Y');
        assert.equal(w.flipX,Math.cos(radians)<0?-1:1,'left-facing weapon is mirrored upright');
        assert.deepEqual(view.frameBounds,reference.frameBounds,'the preview camera stays fixed while aiming');
        assert(view.bounds.width>0&&view.bounds.height>0);
    }
    assert.equal(JSON.stringify(value),original,'preview geometry never edits the draft');
});
test('legacy artwork stays static and nested weapon offsets do not inherit the base image offset',()=>{
    const value=appearance(),view=Artwork.geometry(value,null);assert.equal(view.weapon.x,12);assert.equal(view.weapon.y,174);
    delete value.weapon;const first=Artwork.geometry(value,null),other=Artwork.geometry(value,135);
    assert.equal(first.weapon,null);assert.deepEqual(other,first);assert.equal(first.base.x,-8);assert.equal(first.base.y,4);
});
test('weapon layer validation accepts optional defaults and preserves unknown fields without seeding',()=>{
    const docs={A:{data:clone(base)},catalog:{data:clone(catalog)}},row=docs.A.data.BuildEnum['2'].levelList[0],at=['BuildEnum','2','levelList',0,'Appearance','weapon'];
    row.Appearance=appearance();const before=JSON.stringify(docs);
    assert.equal(Schema.validate(docs,[{doc:'A',path:at}]).filter(issue=>issue.path.includes('weapon')).length,0);
    assert.equal(JSON.stringify(docs),before);
    row.Appearance.weapon={sprite:'buildings/towers/weapon'};
    assert.equal(Schema.validate(docs,[{doc:'A',path:at}]).filter(issue=>issue.path.includes('weapon')).length,0,'omitted transforms retain runtime defaults');
    delete row.Appearance.weapon;
    assert.equal(Schema.validate(docs,[{doc:'A',path:at}]).filter(issue=>issue.path.includes('weapon')).length,0,'removing the layer restores static behavior');
});
test('unsafe weapon resources, non-finite transforms and invalid normalized pivots cannot be saved',()=>{
    for(const [key,value]of [['sprite','../outside'],['sprite','weapon.png'],['sprite',''],['width',0],['height',-1],['pivotX',-0.1],['pivotY',1.1],['pivotX','0.5'],['offsetX',Infinity],['offsetY',NaN],['muzzleX','90'],['muzzleY',null]]){
        const docs={A:{data:clone(base)},catalog:{data:clone(catalog)}},row=docs.A.data.BuildEnum['2'].levelList[0];row.Appearance=appearance();row.Appearance.weapon[key]=value;
        const at=['BuildEnum','2','levelList',0,'Appearance','weapon',key],before=JSON.stringify(docs);
        assert(Schema.validate(docs,[{doc:'A',path:at}]).some(issue=>issue.severity==='error'&&issue.path.includes('weapon')),key+':'+value);
        assert.equal(JSON.stringify(docs),before,'invalid drafts are reported, never repaired');
    }
});
