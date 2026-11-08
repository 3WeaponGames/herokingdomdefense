'use strict';

const fs = require('fs');
const path = require('path');
const Model = require('./model');
const Settings = require('./settings');
const Schema = require('../lib/schema');
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
function rows(panel) {
    const buildings = catalog(panel), count = buildings.reduce((sum, row) => sum + (row.record.levelList || []).length, 0);
    return [{key:'__all__', label:'All buildings', subtitle:buildings.length+' building types · '+count+' upgrade branches', overview:true, record:{}, path:[], doc:'A'}].concat(buildings);
}
function select(panel, key, position) {
    panel._selected = key; panel._level = position || 0; panel.$detail.scrollTop = 0; panel._render();
}
function artwork(panel, parent, icon, className) {
    const asset = panel._image(icon);
    if (!asset) return;
    const image = node('img', undefined, className); image.src = asset.url; image.alt = ''; parent.appendChild(image);
}
function overview(panel) {
    const grid = node('div', undefined, 'bld-catalog'); panel.$detail.appendChild(grid);
    catalog(panel).forEach(row => {
        const card = button('', () => select(panel, row.key), 'bld-card');
        artwork(panel, card, row.icon, 'bld-card-art');
        card.appendChild(node('strong', row.label));
        card.appendChild(node('small', row.subtitle));
        const branches = Model.branches(row.record, row.key, panel._data('A'), panel._data('catalog'), panel._language);
        card.appendChild(node('span', branches[0] ? branches[0].summary : 'No branches', 'bld-card-summary'));
        grid.appendChild(card);
    });
    panel._note('Choose a building to edit every authored upgrade branch, its costs, health, appearance and gameplay settings. Barracks also links directly to the assigned unit’s stats.');
    const section = panel._section('All upgrade branches'); section.className = 'bld-table-wrap';
    const table = node('table', undefined, 'gt-grid-table');
    const head = node('tr'); ['Building / branch', 'Level', 'Gameplay', 'Next'].forEach(text => head.appendChild(node('th', text))); table.appendChild(head);
    catalog(panel).forEach(row => Model.branches(row.record, row.key, panel._data('A'), panel._data('catalog'), panel._language).forEach(branch => {
        const tr = node('tr'); tr.setAttribute('data-click', 'true');
        tr.onclick = () => select(panel, row.key, branch.position);
        [row.label+' · #'+branch.index+' '+branch.label, branch.level, branch.summary, branch.next.length ? branch.next.map(value => '#'+value).join(', ') : 'Final'].forEach(text => tr.appendChild(node('td', text)));
        table.appendChild(tr);
    })); section.appendChild(table);
}
function mechanics(panel, row, level, at, context) {
    const type = Number(row.key), values = level.Data;
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
            panel._note('Allied unit record: these stats affect barracks branches using this ally. Enemy records are independent. To change this branch’s roster, use Soldier type above.', false, stats);
            const primary = ['Health','AttackDamage','AttackInterval','AttackRange','SearchRange','Speed','BuildingCross','CounterType','DeathAni'];
            primary.filter(key => own(unit, key)).forEach(key => panel._value(stats, 'A', [table, String(id), key], unit[key], key, {table:'SoldierCfg', id,side:'ally'}, unit));
            const advanced = panel._section('Unit name, artwork & additional properties', undefined, true);
            panel._properties(advanced, 'A', [table, String(id)], unit, {table:'SoldierCfg', id,side:'ally'}, primary.concat('Suppressed'));
        } else panel._note('The assigned unit is missing. Choose an implemented allied unit above before saving.', true, section);
    }
}
function construction(panel) {
    const section = panel._section('Construction timing · shared by all buildings', undefined, true);
    const parameters = panel._data('overrides').parameters || {}, custom = own(parameters, 'buildStandTime');
    panel._field(section, 'Standing time (seconds)', custom ? parameters.buildStandTime : 1.5,
        value => panel._set('overrides', ['parameters', 'buildStandTime'], value),
        {min:0.001, help:'How long the hero stands at a building to purchase or upgrade it. Original behavior: 1.5 seconds.'});
    if (custom) section.appendChild(button('Reset to original timing', () => panel._change([{doc:'overrides', path:['parameters','buildStandTime'], remove:true}]).catch(() => {}), 'gt-mini'));
}
function initialChoices(panel, row, branches) {
    const building=row.record, choices=building.InitialChoices, at=row.path.concat('InitialChoices');
    const section=panel._section('Construction choices');
    panel._note('These branches are offered before an empty plot is purchased. Order controls the cards. Existing buildings and saved branch IDs are unchanged.',false,section);
    if (!Array.isArray(choices)) {
        panel._note('Original construction: the first branch is built directly.',false,section);
        section.appendChild(button('Offer a choice when building',()=>panel._set('A',at,[branches[0].index]),'gt-mini'));
        return;
    }
    choices.forEach((value,index)=>{
        const line=node('div',undefined,'gt-array-row');section.appendChild(line);
        panel._field(line,'Construction choice '+(index+1),value,next=>panel._set('A',at.concat(index),next),{options:branches.map(branch=>({value:branch.index,label:'#'+branch.index+' · Level '+branch.level+' · '+branch.label}))});
        line.appendChild(button('Remove',()=>panel._set('A',at,choices.filter((_item,i)=>i!==index)),'gt-mini'));
        if(index)line.appendChild(button('Move earlier',()=>{const next=choices.slice(),previous=next[index-1];next[index-1]=next[index];next[index]=previous;return panel._set('A',at,next);},'gt-mini'));
    });
    if(choices.length<4)section.appendChild(button('Add construction choice',()=>{
        const next=branches.find(branch=>choices.indexOf(branch.index)<0);
        if(next)return panel._set('A',at,choices.concat(next.index));
    },'gt-mini'));
    section.appendChild(button('Restore original direct construction',()=>panel._change([{doc:'A',path:at,remove:true}]).catch(()=>{}),'gt-mini'));
}
function towerSettings(panel, row, level, at) {
    if(Number(row.key)!==2)return;
    const section=panel._section('Tower attack & targeting');
    panel._note('Without a saved Tower override, this branch keeps the original arrow behavior. Editing a field creates a draft for this branch only.',false,section);
    Settings.towerFields(level.Tower).forEach(field=>panel._field(section,field.label,field.value,next=>level.Tower&&typeof level.Tower==='object'&&!Array.isArray(level.Tower)?panel._set('A',at.concat('Tower',field.key),next):panel._set('A',at.concat('Tower'),{[field.key]:next}),field));
    if(own(level,'Tower'))section.appendChild(button('Restore original tower attack',()=>panel._change([{doc:'A',path:at.concat('Tower'),remove:true}]).catch(()=>{}),'gt-mini'));
}
function appearanceSettings(panel, row, level, at) {
    const section=panel._section('Map artwork & footprint',undefined,!level.Appearance);
    panel._field(section,'Collision footprint branch',own(level,'ColliderIndex')?level.ColliderIndex:level.index,next=>panel._set('A',at.concat('ColliderIndex'),next),{integer:true,min:1,help:'Reuses an existing map collider tag. The saved branch index stays fixed.'});
    if(own(level,'ColliderIndex'))section.appendChild(button('Use branch’s original footprint',()=>panel._change([{doc:'A',path:at.concat('ColliderIndex'),remove:true}]).catch(()=>{}),'gt-mini'));
    const value=level.Appearance;
    if(!value||typeof value!=='object'||Array.isArray(value)) {
        panel._note('This branch uses its original animated building model.',false,section);
        section.appendChild(button('Use Resources sprite artwork',()=>panel._set('A',at.concat('Appearance'),{sprite:'',width:160,height:200,offsetX:0,offsetY:0}),'gt-mini'));
        return;
    }
    panel._field(section,'Map sprite resource path',value.sprite||'',next=>panel._set('A',at.concat('Appearance','sprite'),next),{wide:true,help:'Extension-free path inside assets/resources, for example buildings/towers/cannon-1.'});
    const images=(panel._assets.images||[]).filter(asset=>asset.resource&&asset.reference&&asset.resource.startsWith('buildings/'));
    if(images.length)panel._field(section,'Choose Resources artwork',value.sprite||'',next=>panel._set('A',at.concat('Appearance','sprite'),next),{options:[{value:value.sprite||'',label:value.sprite||'Choose imported artwork'}].concat(images.filter(asset=>asset.resource!==value.sprite).map(asset=>({value:asset.resource,label:asset.resource}))),wide:true,help:'Imported resources/buildings artwork. Other Resources paths can be entered above.'});
    Settings.APPEARANCE_FIELDS.filter(field=>!/^muzzle/.test(field.key)||Number(row.key)===2&&!value.weapon).forEach(field=>panel._field(section,field.label,own(value,field.key)?value[field.key]:field.value,next=>panel._set('A',at.concat('Appearance',field.key),next),field));
    panel._note('The image is anchored at its bottom center. Width and height include transparent margins. Offsets and muzzle position use building-local world units.',false,section);
    if(Number(row.key)===2||own(value,'weapon'))weaponSettings(panel,section,value,at.concat('Appearance'),images);
    section.appendChild(button('Restore original animated artwork',()=>panel._change([{doc:'A',path:at.concat('Appearance'),remove:true}]).catch(()=>{}),'gt-mini'));
}
function weaponSettings(panel,parent,appearance,at,images){
    const section=panel._section('Aiming weapon layer',parent,!appearance.weapon),value=appearance.weapon;
    if(!value||typeof value!=='object'||Array.isArray(value)){
        panel._note('This artwork is static. Add a separate transparent weapon sprite to aim without rotating the building base.',false,section);
        section.appendChild(button('Add aiming weapon layer',()=>panel._set('A',at.concat('weapon'),{sprite:'',width:120,height:80,pivotX:.5,pivotY:.5,offsetX:0,offsetY:150,muzzleX:90,muzzleY:0}),'gt-mini'));
        return;
    }
    panel._field(section,'Weapon sprite resource path',value.sprite||'',next=>panel._set('A',at.concat('weapon','sprite'),next),{wide:true,help:'Transparent weapon cutout inside assets/resources. The base artwork remains fixed.'});
    if(images.length)panel._field(section,'Choose weapon artwork',value.sprite||'',next=>panel._set('A',at.concat('weapon','sprite'),next),{wide:true,options:[{value:value.sprite||'',label:value.sprite||'Choose imported weapon artwork'}].concat(images.filter(asset=>asset.resource!==value.sprite).map(asset=>({value:asset.resource,label:asset.resource})))});
    Settings.WEAPON_FIELDS.forEach(field=>panel._field(section,field.label,own(value,field.key)?value[field.key]:field.value,next=>panel._set('A',at.concat('weapon',field.key),next),field));
    panel._note('Pivot position is in building-local world units, independently of the base image offset. Muzzle offsets start at that pivot in the unrotated weapon pose. The preview aim control is temporary and never changes the saved draft.',false,section);
    section.appendChild(button('Remove aiming weapon layer',()=>panel._change([{doc:'A',path:at.concat('weapon'),remove:true}]).catch(()=>{}),'gt-mini'));
}
function render(panel, row) {
    if (row.overview) { overview(panel); return; }
    const building = row.record, at = row.path;
    const branches = Model.branches(building, row.key, panel._data('A'), panel._data('catalog'), panel._language);
    panel._properties(panel._section('Building type', undefined, true), 'A', at, building, {table:'BuildEnum', id:row.key}, ['levelList','InitialChoices']);
    if (!branches.length) { panel._note('No upgrade branches are configured for this building.', true); return; }
    if(Number(row.key)===2||Number(row.key)===3||own(building,'InitialChoices'))initialChoices(panel,row,branches);
    panel._level = Math.max(0, Math.min(panel._level || 0, branches.length - 1));
    const branch = branches[panel._level], level = branch.record, keys = at.concat('levelList', branch.position);
    const context = {table:'BuildEnum', id:row.key, building, levelIndex:branch.position};
    const selector = panel._section('Upgrade branch');
    panel._field(selector, 'Edit branch', panel._level, position => { panel._level = position; panel._render(); },
        {options:branches.map(item => ({value:item.position, label:'#'+item.index+' · Level '+item.level+' · '+item.label}))});
    const section = panel._section('Every upgrade branch', undefined, true); section.className = 'bld-table-wrap';
    const table = node('table', undefined, 'gt-grid-table'); const head = node('tr');
    ['Branch / name','Level','Gameplay','Next'].forEach(text => head.appendChild(node('th', text))); table.appendChild(head);
    branches.forEach(item => {
        const tr = node('tr', undefined, item.position === panel._level ? 'selected' : ''); tr.setAttribute('data-click', 'true');
        tr.onclick = () => { panel._level = item.position; panel._render(); };
        ['#'+item.index+' · '+item.label, item.level, item.summary, item.next.length ? item.next.map(value => '#'+value).join(', ') : 'Final'].forEach(text => tr.appendChild(node('td', text)));
        table.appendChild(tr);
    }); section.appendChild(table);
    const selected = node('div', undefined, 'bld-selected'); artwork(panel, selected, level.Icon, 'bld-selected-art');
    const text = node('div'); text.appendChild(node('h3', 'Branch #'+level.index+' · '+panel._text(level.Name))); text.appendChild(node('span', branch.summary)); selected.appendChild(text); panel.$detail.appendChild(selected);
    if (Number(row.key) === 3) {
        const tabs = node('div', undefined, 'gt-switch');
        [['building','Building artwork'],['unit','Assigned unit & attack timing']].forEach(([value, label]) => tabs.appendChild(button(label, () => { panel._buildingPreview = value; panel._render(); }, (panel._buildingPreview || 'building') === value ? 'active' : '')));
        panel.$detail.appendChild(tabs);
    }
    mechanics(panel, row, level, keys, context);
    towerSettings(panel,row,level,keys);
    const costs = panel._section('Health, level & costs');
    ['Hp','level','BuildSliverCost','VedioCount'].filter(key => own(level, key)).forEach(key => panel._value(costs, 'A', keys.concat(key), level[key], key, context, level));
    if (!own(level, 'BuildSliverCost')) costs.appendChild(button('Add next purchase cost (silver)', () => panel._set('A', keys.concat('BuildSliverCost'), 1), 'gt-mini'));
    panel._note('Unlock cost constructs the selected starting branch. The current branch’s silver cost controls the next purchase; upgrade choice dialogs also read the destination branch’s cost to choose silver or reward-ad presentation.', false, costs);
    const appearance = panel._section('Name, description & appearance');
    const visualKeys = ['Name','Describe','LevelUpDescribe','Icon','Skin','Zoom','Excursion'];
    visualKeys.filter(key => own(level, key)).forEach(key => panel._value(appearance, 'A', keys.concat(key), level[key], key, context, level));
    appearanceSettings(panel,row,level,keys);
    const connections = panel._section('Next upgrade branches');
    if (own(level, 'BranchBuild')) panel._value(connections, 'A', keys.concat('BranchBuild'), level.BranchBuild, 'BranchBuild', context, level);
    else {
        panel._note('This is a final branch.', false, connections);
        connections.appendChild(button('Add an upgrade connection', () => {
            const next = building.levelList.find(value => value.index !== level.index);
            if (next) panel._set('A', keys.concat('BranchBuild'), [next.index]);
        }, 'gt-mini'));
    }
    const other = panel._section('Identifiers & additional authored properties', undefined, true);
    panel._properties(other, 'A', keys, level, context, visualKeys.concat(['Data','Hp','level','BuildSliverCost','VedioCount','BranchBuild','Tower','Appearance','ColliderIndex']));
    construction(panel);
    panel._note('Branch IDs stay fixed so map unlocks and saved progress keep their references. All changes remain drafts until Save changes.');
}
function preview(panel, row, api) {
    if (row.overview) {
        if (panel._previewClient) { panel._previewClient.destroy(); panel._previewClient = null; }
        while (panel.$preview.firstChild) panel.$preview.removeChild(panel.$preview.firstChild);
        return;
    }
    if (!panel._previewClient) {
        while (panel.$preview.firstChild) panel.$preview.removeChild(panel.$preview.firstChild);
        panel._previewClient = require('../preview/client').mount(panel.$preview, {ipc:api.ipc, onChange:edits => panel._change(edits)});
    }
    const input = {documents:panel._snapshot.documents, version:panel._snapshot.version};
    const level = (row.record.levelList || [])[panel._level || 0];
    const id = level && level.Data && level.Data[1], data=panel._data('A'), unit = (data.AllyCfg || data.SoldierCfg || {})[id];
    if (row.key === '3' && panel._buildingPreview === 'unit' && unit) panel._previewClient.setUnit(Object.assign(input, {type:'ally', id:String(id), record:unit}));
    else panel._previewClient.setBuilding(Object.assign(input, {id:row.key, record:row.record, levelIndex:panel._level}));
}
module.exports = {rows, render, preview, style:fs.readFileSync(path.join(__dirname, 'style.css'), 'utf8')};
