'use strict';

const fs = require('fs');
const path = require('path');
const Model = require('./model');
const Settings = require('./settings');
const Schema = require('../lib/schema');
const UnitLevelStats = require('../../../assets/_script/UnitLevelStats');
const BuildingCost = require('../../../assets/_script/BuildingCost');
const own = (record, key) => Object.prototype.hasOwnProperty.call(record || {}, key);
function node(tag, text, className) {
    const element = document.createElement(tag);
    if (text !== undefined) element.textContent = text;
    if (className) element.className = className;
    return element;
}
function button(text, action, className) {
    const element = node('button', text, className);
    element.type = 'button'; element.onclick = action; return element;
}
function catalog(panel) { return Model.catalog(panel._data('A'), panel._data('catalog'), panel._language); }
function typeID(row) { return String(row.typeID || row.key); }
function families(panel) { return Model.families(panel._data('A'), panel._data('catalog'), panel._language); }
function rows(panel) {
    const buildings = catalog(panel), current = families(panel);
    const result = [{key:'__all__', label:'All buildings', subtitle:current.length+' construction families · '+buildings.length+' building categories', overview:true, record:{}, path:[], doc:'A'}];
    buildings.forEach(building => {
        const active = current.filter(row => row.typeID === building.key);
        if (building.key!=='2'&&building.key!=='3'&&active.length === 1) result.push(Object.assign({}, active[0], {key:building.key, family:true}));
        else {
            result.push(Object.assign({}, building, {typeID:building.key, category:true, subtitle:active.length+' construction choices'}));
            active.forEach(row => result.push(Object.assign({}, row, {family:true, indented:true})));
        }
    });
    return result;
}
function select(panel, key, position) {
    panel._selected = key; panel._level = position || 0; panel.$detail.scrollTop = 0; panel._render();
}
function artwork(panel, parent, icon, className) {
    const asset = panel._image(icon);
    if (!asset) return;
    const image = node('img', undefined, className); image.src = asset.url; image.alt = ''; parent.appendChild(image);
}
function familyCards(panel, list) {
    const grid = node('div', undefined, 'bld-catalog'); panel.$detail.appendChild(grid);
    list.forEach(row => {
        const card = button('', () => select(panel, row.key, row.rootPosition), 'bld-card');
        card.setAttribute('data-building-family', row.key);
        artwork(panel, card, row.icon, 'bld-card-art');
        card.appendChild(node('strong', row.label));
        card.appendChild(node('small', row.subtitle));
        const first = row.root || row.branches[0];
        card.appendChild(node('span', first ? first.summary : 'No levels', 'bld-card-summary'));
        grid.appendChild(card);
    });
}
function overview(panel) {
    const list = rows(panel).filter(row => row.family);
    familyCards(panel, list);
    panel._note('Choose a construction family, then use its level tabs to edit costs, health, artwork and gameplay. Barracks unit stats use the same levels as Units and Characters.');
    const section = panel._section('All current building levels', undefined, true); section.className = 'bld-table-wrap';
    const table = node('table', undefined, 'gt-grid-table');
    const head = node('tr'); ['Building / branch', 'Level', 'Gameplay', 'Next'].forEach(text => head.appendChild(node('th', text))); table.appendChild(head);
    list.forEach(row => row.branches.forEach(branch => {
        const tr = node('tr'); tr.setAttribute('data-click', 'true');
        tr.onclick = () => select(panel, row.key, branch.position);
        [row.label+' · #'+branch.index+' '+branch.label, branch.level, branch.summary, branch.next.length ? branch.next.map(value => '#'+value).join(', ') : 'Final'].forEach(text => tr.appendChild(node('td', text)));
        table.appendChild(tr);
    })); section.appendChild(table);
}
function selectedBranch(panel, row) {
    const branches = row.branches || [];
    if (!branches.some(branch => branch.position === panel._level)) panel._level = row.rootPosition == null ? branches[0] && branches[0].position : row.rootPosition;
    return branches.find(branch => branch.position === panel._level);
}
function levelTabs(panel, row) {
    if (!row.family) return;
    const selected = selectedBranch(panel, row), tabs = node('div', undefined, 'bld-level-tabs');
    tabs.setAttribute('role','tablist'); tabs.setAttribute('aria-label','Building levels');
    (row.levels || []).forEach(group => {
        const active = selected && group.level === selected.level;
        const tab = button('Lvl '+group.level, () => {if(!active)panel._level=group.branches[0].position;panel._render();}, active ? 'active' : '');
        tab.setAttribute('role','tab'); tab.setAttribute('data-building-level',group.level); tab.setAttribute('aria-selected',String(!!active));
        tabs.appendChild(tab);
    });
    panel.$detail.appendChild(tabs);
}
function mechanics(panel, row, level, at, context) {
    const type = Number(typeID(row)), values = level.Data;
    const title = type === 3 ? 'Barracks roster' : type === 1 || type === 2 ? 'Building attack' : type === 4 || type === 5 ? 'Silver production' : 'Wall properties';
    const section = panel._section(title);
    if (Array.isArray(values) && values.length) {
        values.forEach((value, index) => {
            const metadata = Schema.dataDescriptor(context, index);
            if (type === 3 && index === 1) metadata.options = Model.alliedUnits(panel._data('A'), panel._data('catalog'), panel._language);
            panel._field(section, metadata.label, value, next => panel._set('A', at.concat('Data', index), next), metadata);
        });
    } else panel._note(type === 6 ? 'Walls use their health and authored gate geometry. No attack, troop or income properties are configured.' : 'This branch has no special properties.', false, section);
    if (type === 3) {
        panel._note('Capacity and unit assignment apply to this branch. Buffs and earned bonus soldiers are added during battle. Respawn time is the delay between replacements.', false, section);
        const data=panel._data('A'), table=data.AllyCfg?'AllyCfg':'SoldierCfg', id = values && values[1], unit = (data[table] || {})[id];
        if (unit) {
            const stats = panel._section('Assigned unit · '+panel._text(unit.Name)+' · '+id);
            const unitRow={record:unit,path:[table,String(id)],unitType:'ally',unitID:String(id)}, value=Number(level.level), settings=panel._data('overrides');
            const effective=UnitLevelStats.resolve(unit,settings,value), custom=(settings.unitLevels||{})[UnitLevelStats.key(id,value)]||{};
            panel._note('Level '+value+' stats are shared with Units → '+panel._text(unit.Name)+' → Level '+value+' and its Characters appearance. Unchanged fields use the shared base stats. To change the roster, use Soldier type above.', false, stats);
            UnitLevelStats.FIELDS.filter(key=>own(unit,key)).forEach(key=>{
                const meta=Schema.descriptor(key,{table:'SoldierCfg',side:'ally'}), overridden=own(custom,key);
                const input=key==='AttackInterval'?panel._attackRateField(stats,unitRow,value,next=>panel._unitLevelEdit(unitRow,value,key,next),{help:overridden?'Custom cooldown for this level.':'Uses the shared base cooldown.'}):panel._field(stats,meta.label,effective[key],next=>panel._unitLevelEdit(unitRow,value,key,next).catch(()=>{}),Object.assign({},meta,{help:overridden?'Custom for Level '+value+'.':'Shared base: '+unit[key]}));
                input.setAttribute('aria-label','Level '+value+' '+meta.label);
                if(overridden)input.parentNode.appendChild(button('Use base',()=>panel._unitLevelEdit(unitRow,value,key).catch(()=>{}),'gt-mini'));
            });
            const actions=node('div',undefined,'bld-actions'); stats.appendChild(actions);
            const reset=button('Reset Level '+value+' unit stats',()=>panel._unitLevelEdit(unitRow,value,null).catch(()=>{}),'gt-mini');reset.disabled=!UnitLevelStats.FIELDS.some(key=>own(custom,key));actions.appendChild(reset);
            actions.appendChild(button('Edit Level '+value+' appearance in Characters',()=>Editor.Ipc.sendToMain('game-data-editor:open-characters',{type:'ally',id:String(id),level:value},error=>{if(error)panel._status(String(error),true);}),'gt-mini'));
            const advanced = panel._section('Shared unit properties · all levels', undefined, true);
            panel._properties(advanced, 'A', [table, String(id)], unit, {table:'SoldierCfg', id,side:'ally'}, UnitLevelStats.FIELDS.concat('Suppressed'));
        } else panel._note('The assigned unit is missing. Choose an implemented allied unit above before saving.', true, section);
    }
}
function initialChoices(panel, row, branches) {
    const building=row.record, choices=building.InitialChoices, at=row.path.concat('InitialChoices');
    const section=panel._section('Construction menu · advanced',undefined,true);
    section.classList.add('bld-construction-fields');
    panel._note('These branches are offered before an empty plot is purchased. Order controls the cards. Existing buildings and saved branch IDs are unchanged.',false,section);
    const roots=branches.filter(branch=>branch.level===1);
    if (!Array.isArray(choices)) {
        panel._note('Choose the level-one buildings offered when purchasing an empty plot.',false,section);
        if(roots.length)section.appendChild(button('Configure construction choices',()=>panel._set('A',at,roots.slice(0,4).map(branch=>branch.index)),'gt-mini'));
        return;
    }
    choices.forEach((value,index)=>{
        const line=node('div',undefined,'gt-array-row');section.appendChild(line);
        panel._field(line,'Construction choice '+(index+1),value,next=>panel._set('A',at.concat(index),next),{options:roots.map(branch=>({value:branch.index,label:'#'+branch.index+' · '+branch.label}))});
        const remove=button('Remove',()=>panel._set('A',at,choices.filter((_item,i)=>i!==index)),'gt-mini');remove.disabled=choices.length<=1;line.appendChild(remove);
        if(index)line.appendChild(button('Move earlier',()=>{const next=choices.slice(),previous=next[index-1];next[index-1]=next[index];next[index]=previous;return panel._set('A',at,next);},'gt-mini'));
    });
    if(choices.length<4)section.appendChild(button('Add construction choice',()=>{
        const next=roots.find(branch=>choices.indexOf(branch.index)<0);
        if(next)return panel._set('A',at,choices.concat(next.index));
    },'gt-mini'));
}
function towerSettings(panel, row, level, at) {
    if(Number(typeID(row))!==2)return;
    const section=panel._section('Tower attack & targeting');
    panel._note('Attack type, targeting and projectile settings apply to this tower level. Editing a field changes only this level’s draft.',false,section);
    Settings.towerFields(level.Tower).forEach(field=>panel._field(section,field.label,field.value,next=>level.Tower&&typeof level.Tower==='object'&&!Array.isArray(level.Tower)?panel._set('A',at.concat('Tower',field.key),next):panel._set('A',at.concat('Tower'),{[field.key]:next}),field));
}
function render(panel, row, api) {
    if (row.overview) { overview(panel); return; }
    const building = row.record, at = row.path, id = typeID(row);
    const allBranches = Model.branches(building, id, panel._data('A'), panel._data('catalog'), panel._language);
    if (row.category) {
        const list=rows(panel).filter(item=>item.typeID===id&&item.family);
        panel._note(Number(id)===3?'An empty Barracks plot offers these squad types. Each has its own building and level progression.':'An empty Tower plot offers these tower types. Each has its own attack settings and level progression.');
        familyCards(panel,list);
        if(!list.length)panel._note('No valid construction choices are configured. Review the construction menu below.',true);
        initialChoices(panel,row,allBranches);
        return;
    }
    const branches=row.branches||allBranches, branch=selectedBranch(panel,row);
    if (!branch) { panel._note('No building levels are configured for this family.', true); return; }
    (row.diagnostics||[]).forEach(issue=>panel._note(typeof issue==='string'?issue:issue.message||JSON.stringify(issue),true));
    const level = branch.record, keys = at.concat('levelList', branch.position);
    const context = {table:'BuildEnum', id, building, levelIndex:branch.position};
    {
        const group=(row.levels||[]).find(group=>group.level===branch.level);
        if(group&&group.branches.length>1){
            const section=panel._section('Level '+branch.level+' variants'), label='Level '+branch.level+' variant';
            const input=panel._field(section,label,panel._level,position=>{panel._level=position;panel._render();},{options:group.branches.map(item=>({value:item.position,label:item.label+' · #'+item.index}))});
            input.setAttribute('aria-label',label);
        }
    }
    const selected = node('div', undefined, 'bld-selected'); artwork(panel, selected, level.Icon, 'bld-selected-art');
    const text = node('div'); text.appendChild(node('h3', 'Level '+branch.level+' · '+panel._text(level.Name))); text.appendChild(node('span', branch.summary)); selected.appendChild(text); panel.$detail.appendChild(selected);
    const section = panel._section('All levels in this family', undefined, true); section.className = 'bld-table-wrap';
    const table = node('table', undefined, 'gt-grid-table'); const head = node('tr');
    ['Branch / name','Level','Gameplay','Next'].forEach(text => head.appendChild(node('th', text))); table.appendChild(head);
    branches.forEach(item => {
        const tr = node('tr', undefined, item.position === panel._level ? 'selected' : ''); tr.setAttribute('data-click', 'true');
        tr.onclick = () => { panel._level = item.position; panel._render(); };
        ['#'+item.index+' · '+item.label, item.level, item.summary, item.next.length ? item.next.map(value => '#'+value).join(', ') : 'Final'].forEach(text => tr.appendChild(node('td', text)));
        table.appendChild(tr);
    }); section.appendChild(table);
    if (Number(id) === 3) {
        const tabs = node('div', undefined, 'gt-switch');
        [['building','Building artwork'],['unit','Assigned unit & attack timing']].forEach(([value, label]) => tabs.appendChild(button(label, () => { panel._buildingPreview = value; panel._render(); }, (panel._buildingPreview || 'building') === value ? 'active' : '')));
        panel.$detail.appendChild(tabs);
    }
    mechanics(panel, row, level, keys, context);
    towerSettings(panel,row,level,keys);
    const blocker=panel._section('Blocker, shadow & scale');
    const blockerKey=id+':'+level.index;
    if(panel._blockerStateKey!==blockerKey){panel._blockerStateKey=blockerKey;panel._blockerState={};}
    panel._blockerClient=require('./blocker-client').mount(blocker,{ipc:api.ipc,request:{id,levelIndex:branch.position},state:panel._blockerState,onChange:(value,layer)=>panel._change([{doc:'A',path:keys.concat(layer==='scale'?'WorldScale':layer==='shadow'?'Shadow':'Blocker'),value}])});
    const costs = panel._section('Health, level & costs');
    ['Hp','level'].filter(key => own(level, key)).forEach(key => {
        if(id==='6'&&key==='level')panel._field(costs,'Unlock level',level.level,next=>panel._set('A',keys.concat('level'),next),{integer:true,min:1,help:'Wall tabs show artwork tiers. This level controls castle unlocks; existing upgrade paths are preserved.'});
        else panel._value(costs, 'A', keys.concat(key), level[key], key, context, level);
    });
    const price=BuildingCost.preview(building,level);
    panel._field(costs,'Build / upgrade cost (silver)',price.value===undefined?'':price.value,next=>panel._set('A',keys.concat('BuildCost'),next),{integer:true,min:0,help:price.varied?'Existing paths have different prices. Set one price for this building level.':'Price to build this level or upgrade into it.'});
    if(own(level,'VedioCount'))panel._value(costs,'A',keys.concat('VedioCount'),level.VedioCount,'VedioCount',context,level);
    const appearance = panel._section('Name, description & appearance');
    const visualKeys = ['Name','Describe','LevelUpDescribe','Icon','Skin'];
    visualKeys.filter(key => own(level, key)).forEach(key => panel._value(appearance, 'A', keys.concat(key), level[key], key, context, level));
    const pad=node('div',undefined,'gt-field wide');pad.appendChild(node('span','Build / upgrade ground pad'));appearance.appendChild(pad);
    const padKey=id+':'+row.rootIndex;if(panel._padStateKey!==padKey){panel._padStateKey=padKey;panel._padState={};}
    panel._purchaseClient=require('./purchase-client').mount(pad,{ipc:api.ipc,request:{id,levelIndex:branch.position},category:building,row:level,state:panel._padState,onCommit:(value,variant)=>panel._change(()=>{
        const current=panel._data('A').BuildEnum[id].levelList[branch.position];if(!current||current.index!==level.index)throw Error('This building level changed. Reload before editing its ground pad.');
        const previous=current.PurchaseField||{},variants=require('../../../assets/_script/BuildingPurchaseField').variants(building);
        const next=variants.length?Object.assign({},previous,{variants:Object.assign({},previous.variants,{[variant]:Object.assign({},previous.variants&&previous.variants[variant],value)})}):Object.assign({},previous,value);
        return [{doc:'A',path:keys.concat('PurchaseField'),value:next}];
    })});
    const popup=panel._section('Upgrade popup icon · advanced',appearance,true);
    ['Zoom','Excursion'].filter(key=>own(level,key)).forEach(key=>panel._value(popup,'A',keys.concat(key),level[key],key,context,level));
    const connections = panel._section('Next upgrade branches · advanced',undefined,true);
    if (own(level, 'BranchBuild')) panel._value(connections, 'A', keys.concat('BranchBuild'), level.BranchBuild, 'BranchBuild', context, level);
    else {
        panel._note('This is a final branch.', false, connections);
        connections.appendChild(button('Add an upgrade connection', () => {
            const next = building.levelList.find(value => value.index !== level.index);
            if (next) panel._set('A', keys.concat('BranchBuild'), [next.index]);
        }, 'gt-mini'));
    }
    if(Number(id)===2||Number(id)===3)panel.$detail.appendChild(button('Manage '+(Number(id)===3?'Barracks':'Tower')+' construction choices',()=>select(panel,id),'gt-mini'));
}
function preview(panel, row, api) {
    if (row.overview || row.category || !selectedBranch(panel,row)) {
        if (panel._previewClient) { panel._previewClient.destroy(); panel._previewClient = null; }
        while (panel.$preview.firstChild) panel.$preview.removeChild(panel.$preview.firstChild);
        return;
    }
    if (!panel._previewClient) {
        while (panel.$preview.firstChild) panel.$preview.removeChild(panel.$preview.firstChild);
        panel._previewClient = require('../preview/client').mount(panel.$preview, {ipc:api.ipc, onChange:edits => panel._previewChange(edits),onAttackMetrics:value=>panel._attackRateMetrics(value)});
    }
    const input = {documents:panel._snapshot.documents, version:panel._snapshot.version};
    const level = (row.record.levelList || [])[panel._level || 0];
    const id = level && level.Data && level.Data[1], data=panel._data('A'), unit = (data.AllyCfg || data.SoldierCfg || {})[id];
    if (typeID(row) === '3' && panel._buildingPreview === 'unit' && unit) panel._previewClient.setUnit(Object.assign(input, {type:'ally', id:String(id), level:Number(level.level), record:UnitLevelStats.resolve(unit,panel._data('overrides'),Number(level.level))}));
    else panel._previewClient.setBuilding(Object.assign(input, {id:typeID(row), record:row.record, levelIndex:panel._level}));
}
module.exports = {rows, levelTabs, render, preview, style:fs.readFileSync(path.join(__dirname, 'style.css'), 'utf8')};
