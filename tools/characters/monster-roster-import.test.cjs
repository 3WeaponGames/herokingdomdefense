'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const Import=require('./register-monster-roster.cjs');
const Definitions=require('./monster-roster-definitions.json');
const PNG=require('../../packages/hkd-characters/lib/png-atlas');
const root=path.resolve(__dirname,'../..');
const configPath='assets/KinghtFallConfig/GameJsonCfg.json';
const config=JSON.parse(fs.readFileSync(path.join(root,configPath),'utf8'));
const packs=[...new Set(Definitions.units.map(unit=>unit.source.split('/')[0]))];
const sources=packs.flatMap(pack=>require('../../assets/resources/unit-library/'+pack+'/catalog.json').units);
function fixture(t,mutate=()=>{}){
    const folder=fs.mkdtempSync(path.join(os.tmpdir(),'hkd-monster-import-'));
    t.after(()=>fs.rmSync(folder,{recursive:true,force:true}));
    const cfg=structuredClone(config);mutate(cfg);
    for(const relative of [configPath,'assets/resources/localization/catalog.json',...packs.map(pack=>'assets/resources/unit-library/'+pack+'/catalog.json')]){
        const target=path.join(folder,relative);fs.mkdirSync(path.dirname(target),{recursive:true});
        fs.writeFileSync(target,relative===configPath?JSON.stringify(cfg):fs.readFileSync(path.join(root,relative)));
    }
    return folder;
}
test('stable roster definitions cover all 316 imported variants once, with separate IDs, names, valid roles and portraits',()=>{
    assert.equal(Definitions.units.length,316);
    assert.deepEqual(Definitions.units.map(unit=>unit.source).sort(),sources.map(unit=>unit.id).sort());
    assert.equal(new Set(Definitions.units.map(unit=>unit.id)).size,316);
    assert(Definitions.units.every(unit=>unit.name.trim()));
    assert.deepEqual(Definitions.units.slice(0,150).map(unit=>unit.id),Array.from({length:150},(_,i)=>91001+i));
    for(const definition of Definitions.units){
        const row=config.SoldierCfg[definition.id],key='enemy:'+definition.id+':default';
        assert.equal(row.MonsterSource,definition.source);
        assert.equal(row.BehaviorTemplate,definition.behaviorTemplate);
        assert(config.GameTools.unitTypes[definition.role]);
        assert.equal(config.GameTools.unitTypeAssignments[key],definition.role);
        assert.equal(row.loadIcon,'@icon/'+Import.iconPath(definition.source));
        const iconFile=path.join(root,'assets/resources',Import.iconPath(definition.source)+'.png');
        const icon=PNG.decode(fs.readFileSync(iconFile));
        assert.equal(icon.width,128);assert.equal(icon.height,128);
        assert(icon.rgba.some((value,index)=>index%4===3&&value>0),definition.source);
        const meta=JSON.parse(fs.readFileSync(iconFile+'.meta','utf8'));
        assert.equal(meta.importer,'texture');assert(Object.keys(meta.subMetas).length>0);
    }
});
test('rerunning the import plans no files or data writes',()=>{
    const before=fs.readFileSync(path.join(root,configPath));
    const plan=Import.plan(root);
    assert.equal(plan.imported.length,0);assert.equal(plan.files.size,0);
    assert.deepEqual(fs.readFileSync(path.join(root,configPath)),before);
});
test('an existing author-edited monster and unknown data remain untouched on a repeated import',t=>{
    const folder=fixture(t,cfg=>{
        cfg.SoldierCfg[91001].Health=12345;
        cfg.SoldierCfg[91001].futureAuthorField={keep:'unchanged'};
        cfg.GameTools.visuals['enemy:91001:default']={mirrorX:false,tint:'#8ac092'};
        cfg.GameTools.timings['enemy:91001:default']={attack:.123};
        cfg.GameTools.timingDefaults['enemy:91001:default']={attack:.456};
    });
    const before=fs.readFileSync(path.join(folder,configPath));
    const plan=Import.plan(folder);
    assert.equal(plan.files.size,0);assert.equal(plan.imported.length,0);
    assert.deepEqual(fs.readFileSync(path.join(folder,configPath)),before);
});
test('source identity changes and occupied unit IDs are rejected without writes',t=>{
    const folder=fixture(t),definition=Definitions.units[0];
    assert.throws(()=>Import.plan(folder,{units:[{...definition,id:92001}]}),/Stable source ID changed/);
    const occupied=fixture(t,cfg=>{delete cfg.SoldierCfg[91001].MonsterSource;});
    assert.throws(()=>Import.plan(occupied,{units:[definition]}),/Refusing to replace existing unit/);
    assert(!fs.existsSync(path.join(occupied,'assets/KinghtFallEnemy')));
});
test('unregistered prefab files are protected from replacement during an explicit import',t=>{
    const definition=Definitions.units[0],source=sources.find(unit=>unit.id===definition.source);
    const folder=fixture(t,cfg=>{delete cfg.SoldierCfg[definition.id];});
    const relative='assets/KinghtFallEnemy/'+Import.prefabName(source.id)+'.prefab';
    for(const file of [source.skeleton,source.skeleton+'.meta',source.skeleton.replace(/\.json$/,'.atlas'),'assets/KinghtFallEnemy/'+config.SoldierCfg[definition.behaviorTemplate].prefab+'.prefab',relative]){
        fs.mkdirSync(path.dirname(path.join(folder,file)),{recursive:true});
        fs.copyFileSync(path.join(root,file),path.join(folder,file));
    }
    const bytes=fs.readFileSync(path.join(folder,relative));
    assert.throws(()=>Import.plan(folder,{units:[definition]}),/Refusing to overwrite an unregistered monster asset/);
    assert.deepEqual(fs.readFileSync(path.join(folder,relative)),bytes);
});
