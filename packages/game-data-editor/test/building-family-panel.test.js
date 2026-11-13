'use strict';

// Real panel controls over an in-memory Store: never Save or launch a game.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {test}=require('node:test'),{createRequire}=require('node:module');
const Stats=require('../../../assets/_script/UnitLevelStats');
const clone=value=>JSON.parse(JSON.stringify(value));
function fixture(){
    const filename=path.join(__dirname,'building-panel.test.js'),prefix=fs.readFileSync(filename,'utf8').split("test('building catalog")[0];
    const context={require:createRequire(filename),__dirname,module:{exports:{}},exports:{},setTimeout,clearTimeout};
    vm.createContext(context);vm.runInContext(prefix+'\nmodule.exports={fixture,fields,all};',context);
    const f={...context.module.exports.fixture(),fields:context.module.exports.fields,all:context.module.exports.all};
    f.tabs=()=>f.all(f.panel.$detail,n=>n.getAttribute&&n.getAttribute('role')==='tab'&&n.getAttribute('data-building-level'));
    f.tab=level=>f.tabs().find(tab=>Number(tab.getAttribute('data-building-level'))===level);
    f.cards=()=>f.all(f.panel.$detail,n=>n.className.split(' ').includes('bld-card'));
    f.field=label=>f.fields(f.panel.$detail,label)[0];
    f.position=(typeID,index)=>{const position=f.store.documents.A.data.BuildEnum[typeID].levelList.findIndex(branch=>branch.index===index);assert(position>=0);return position;};
    f.assigned=()=>f.all(f.panel.$detail,n=>n.tagName==='summary'&&n.textContent.startsWith('Assigned unit ·'))[0].parentNode;
    f.assignedField=label=>f.fields(f.assigned(),label)[0];
    f.unitPreview=()=>f.previews.filter(p=>p.kind==='unit').at(-1).request;
    return f;
}
function seedStats(f,table){
    for(const version of ['original','data']){
        f.store.documents.overrides[version].unitLevels=clone(table);
        if(f.store.documents.A[version].GameTools)f.store.documents.A[version].GameTools.unitLevels=clone(table);
    }
    f.panel._snapshot=f.store.snapshot();
}

test('the current building catalog exposes eleven gameplay families and separate barracks and tower construction cards',()=>{
    const f=fixture(),before=f.store.draftState(),families=f.panel._rows().filter(row=>row.family);
    assert.deepEqual(Array.from(families,row=>row.key).sort(),['1','2:1','2:4','2:7','3:11','3:14','3:17','3:20','4','5','6'].sort());
    f.render('__all__');assert.equal(f.cards().length,11);
    for(const [key,count,roots]of [['3',4,[11,14,17,20]],['2',3,[1,4,7]]]){
        f.render(key);assert.equal(f.cards().length,count);
        assert.equal(f.field('Edit branch'),undefined,'Construction categories show current family cards');
        assert.equal(f.field('Soldier capacity'),undefined);
        const destinations=[];
        for(let i=0;i<count;i++){
            f.render(key);f.cards()[i].onclick();destinations.push(f.panel._level);
            assert(f.panel._rows().find(row=>row.key===f.panel._selected).family);
            assert.equal(f.tab(1).getAttribute('aria-selected'),'true');
        }
        assert.deepEqual(destinations,roots.map(index=>f.position(key,index)),'Cards open the authored construction roots');
    }
    f.render('3:11');assert.match(f.panel.$detail.children[0].textContent,/Guard Barracks/);
    assert.equal(f.panel._level,f.position('3',11),'Royal Guard starts at its construction root');
    assert.deepEqual(f.store.draftState(),before);assert.equal(f.messages.length,0);
});

test('family level tabs browse every original storage position without producing drafts or changing identifiers',()=>{
    const f=fixture(),before=f.store.draftState(),version=f.store.version;
    const families=f.panel._rows().filter(row=>row.family),visited=new Map();
    for(const family of families){
        f.render(family.key,999);
        assert.equal(f.panel._level,family.branches[0].position,'An unrelated old selection resets only to this family root');
        const heading=f.panel.$detail.children[0];assert.equal(heading.className,'bld-sticky-heading');
        assert.equal(heading.children[0].tagName,'h2');
        assert.equal(heading.children[1].getAttribute('role'),'tablist','Pinned level tabs appear immediately below the family name');
        const levels=[...new Set(Array.from(family.branches,branch=>branch.level))].sort((a,b)=>a-b);
        assert.deepEqual(Array.from(f.tabs(),tab=>tab.textContent),levels.map(level=>'Lvl '+level));
        for(const branch of family.branches){
            f.render(family.key,branch.position);
            assert.equal(f.panel._level,branch.position);
            assert.equal(f.tab(branch.level).getAttribute('aria-selected'),'true');
            const preview=f.previews.filter(p=>p.kind==='building').at(-1).request;
            assert.equal(preview.id,family.typeID);assert.equal(preview.levelIndex,branch.position);
            assert.equal(preview.record.levelList[branch.position].index,branch.index);
            visited.set(family.typeID+':'+branch.position,true);
            const hp=f.field('HP');assert(hp);hp.onchange();
        }
    }
    assert.equal(visited.size,46,'Every authored building row is visited, including both mill branches and all three wall variants');
    assert.deepEqual(f.store.draftState(),before);assert.equal(f.store.version,version);assert.equal(f.store.changes().length,0);
    assert(!f.messages.some(message=>/:(?:change|save)$/.test(message.message)));
});

test('Arrow Tower browses all four linear levels without changing sparse branch identifiers or storage positions',()=>{
    const f=fixture(),before=f.store.draftState(),indices=[1,2,3,10],positions=indices.map(index=>f.position('2',index));f.render('2:1',positions[3]);
    assert.deepEqual(Array.from(f.tabs(),tab=>tab.textContent),['Lvl 1','Lvl 2','Lvl 3','Lvl 4']);
    assert.equal(f.panel._level,positions[3]);assert.equal(f.tab(4).getAttribute('aria-selected'),'true');
    assert.equal(f.field('Level 2 variant'),undefined,'The approved linear progression has one branch per level');
    f.panel._render();assert.equal(f.panel._level,positions[3]);
    for(const level of [4,1,2,3,4,3,2,1]){
        f.tab(level).onclick();assert.equal(f.panel._level,positions[level-1]);
        assert.equal(f.tab(level).getAttribute('aria-selected'),'true');
        const preview=f.previews.filter(p=>p.kind==='building').at(-1).request;
        assert.equal(preview.levelIndex,positions[level-1]);assert.equal(preview.record.levelList[preview.levelIndex].index,indices[level-1]);
    }
    assert.deepEqual(f.store.draftState(),before);assert.equal(f.messages.length,0);
});

test('editing a family level keeps roster and upgrade cost drafts on their exact original branch paths',async()=>{
    const f=fixture(),position=f.position('3',12),third=f.position('3',13);f.render('3:11',position);const before=f.store.draftState(),row=before.A.BuildEnum[3].levelList[position];
    const capacity=f.field('Soldier capacity'),cost=f.field('Build / upgrade cost (silver)');assert(capacity&&cost);
    capacity.value=String(row.Data[0]+2);capacity.onchange();await f.panel._queue;
    f.field('Build / upgrade cost (silver)').value='23';f.field('Build / upgrade cost (silver)').onchange();await f.panel._queue;
    assert.deepEqual(clone(f.messages.filter(message=>message.message==='game-data-editor:change').map(message=>message.request.edits)),[
        [{doc:'A',path:['BuildEnum','3','levelList',position,'Data',0],value:row.Data[0]+2}],
        [{doc:'A',path:['BuildEnum','3','levelList',position,'BuildCost'],value:23}]
    ]);
    const expected=clone(before);expected.A.BuildEnum[3].levelList[position].Data[0]+=2;expected.A.BuildEnum[3].levelList[position].BuildCost=23;
    assert.deepEqual(f.store.draftState(),expected);assert.equal(f.panel._level,position);
    f.tab(3).onclick();assert.equal(f.panel._level,third);assert.equal(Number(f.field('Soldier capacity').value),before.A.BuildEnum[3].levelList[third].Data[0]);
    assert(!f.messages.some(message=>message.message==='game-data-editor:save'));
});

test('barracks level stats share Units overrides and matching Characters preview levels',async()=>{
    const f=fixture(),one=Stats.key(90001,1),two=Stats.key(90001,2),other=Stats.key(90002,3);
    seedStats(f,{[one]:{Health:55},[two]:{Health:88,AttackDamage:23,future:{retain:true}},[other]:{Speed:170}});
    f.render('3:11',f.position('3',12));const before=f.store.draftState();
    assert.equal(Number(f.assignedField('HP').value),88);assert.equal(Number(f.assignedField('Attack damage').value),23);
    const toggle=f.all(f.panel.$detail,n=>n.tagName==='button'&&n.textContent==='Assigned unit & attack timing')[0];assert(toggle);toggle.onclick();
    assert.equal(f.unitPreview().type,'ally');assert.equal(f.unitPreview().id,'90001');assert.equal(f.unitPreview().level,2);
    assert.equal(f.unitPreview().record.Health,88);assert.equal(f.unitPreview().record.AttackDamage,23);
    f.assignedField('HP').value='99';f.assignedField('HP').onchange();await f.panel._queue;
    assert.equal(f.store.documents.overrides.data.unitLevels[two].Health,99);assert.equal(f.unitPreview().record.Health,99);
    const unitRow={unitType:'ally',unitID:'90001',record:f.store.documents.A.data.AllyCfg[90001],path:['AllyCfg','90001']};
    await f.panel._unitLevelEdit(unitRow,2,'AttackDamage',27);
    assert.equal(Number(f.assignedField('Attack damage').value),27,'A Units edit immediately appears in Buildings');
    assert.equal(f.unitPreview().record.AttackDamage,27);
    f.tab(1).onclick();assert.equal(f.panel._level,f.position('3',11));assert.equal(Number(f.assignedField('HP').value),55);assert.equal(f.unitPreview().level,1);
    f.tab(3).onclick();assert.equal(f.panel._level,f.position('3',13));assert.equal(Number(f.assignedField('HP').value),before.A.AllyCfg[90001].Health);assert.equal(f.unitPreview().level,3);
    const expected=clone(before);expected.overrides.unitLevels[two].Health=99;expected.overrides.unitLevels[two].AttackDamage=27;
    assert.deepEqual(f.store.draftState(),expected);assert(f.store.changes().every(change=>change.doc==='overrides'&&change.path[0]==='unitLevels'));
    assert(!f.messages.some(message=>message.message==='game-data-editor:save'));
});

test('the building editor contains only the current construction families and no obsolete branch view',()=>{
    const f=fixture(),before=f.store.draftState(),rows=f.panel._rows();
    assert(!rows.some(row=>String(row.key).includes('legacy')));
    assert.deepEqual(Array.from(before.A.BuildEnum[3].levelList,branch=>branch.index),Array.from({length:16},(_value,index)=>index+11));
    for(const key of ['__all__','3','3:11','3:14','3:17','3:20']){
        f.render(key);
        const navigation=f.all(f.panel.$detail,element=>['summary','button'].includes(element.tagName));
        assert(!navigation.some(element=>/legacy|obsolete/i.test(element.textContent)));
        assert.equal(f.field('Edit branch'),undefined);
    }
    assert.deepEqual(f.store.draftState(),before);assert.equal(f.messages.length,0);
});

test('construction menus offer only current family roots and cannot restore direct obsolete construction',()=>{
    const f=fixture(),before=f.store.draftState();
    for(const [key,roots] of [['3',[11,14,17,20]],['2',[1,4,7]]]){
        f.render(key);
        for(let index=0;index<roots.length;index++){
            const choice=f.field('Construction choice '+(index+1));assert(choice);
            assert.deepEqual(Array.from(choice.children,option=>Number(option.value)),roots);
            assert.equal(Number(choice.value),roots[index]);
        }
        const direct=f.all(f.panel.$detail,element=>element.tagName==='button'&&/restore.*direct.*construction/i.test(element.textContent));
        assert.equal(direct.length,0);
    }
    assert.deepEqual(f.store.draftState(),before);assert.equal(f.messages.length,0);
});

test('current buildings expose editable authored settings without reset actions that revive obsolete behavior',()=>{
    const f=fixture(),before=f.store.draftState();
    const obsolete=['Restore original tower attack','Use branch’s original footprint','Restore original animated artwork'];
    for(const [key,index] of [['3:11',11],['3:14',14],['3:17',17],['3:20',20],['2:4',4],['2:4',5],['2:4',6],['2:7',7]]){
        const typeID=key.split(':')[0];f.render(key,f.position(typeID,index));
        const actions=f.all(f.panel.$detail,element=>element.tagName==='button').map(element=>element.textContent);
        for(const label of obsolete)assert(!actions.includes(label),key+' must not offer '+label);
        assert.equal(f.field('Collision footprint branch'),undefined,'The removed footprint fitting panel stays hidden');
        if(typeID==='2'){
            assert(f.field('Tower attack type'),'The authored attack type remains editable');
            assert.equal(f.field('Artwork width'),undefined,'The removed artwork fitting panel stays hidden');
        }else assert(f.field('Soldier capacity'),'The authored roster remains editable');
    }
    assert.deepEqual(f.store.draftState(),before);assert.equal(f.messages.length,0);
});

test('a single tower or barracks family still has a reachable construction menu',()=>{
    const f=fixture();
    for(const [id,root] of [['2',1],['3',11]]){
        const building=f.store.documents.A.data.BuildEnum[id];
        building.InitialChoices=[root];
        const family=f.panel._rows().find(row=>row.key===id+':'+root);
        building.levelList=family.branches.map(branch=>branch.record);
        f.panel._snapshot=f.store.snapshot();
        f.render(id);
        assert(f.panel._rows().find(row=>row.key===id).category);
        assert.equal(f.cards().length,1);
        assert(f.field('Construction choice 1'));
        const remove=f.all(f.panel.$detail,n=>n.tagName==='button'&&n.textContent==='Remove')[0];
        assert(remove&&remove.disabled,'The final construction choice cannot be removed');
        f.cards()[0].onclick();
        const manage=f.all(f.panel.$detail,n=>n.tagName==='button'&&n.textContent.startsWith('Manage '))[0];
        assert(manage);manage.onclick();
        assert.equal(f.panel._selected,id);assert(f.field('Construction choice 1'));
    }
    assert.equal(f.messages.length,0);
});
