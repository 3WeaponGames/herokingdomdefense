'use strict';

const fs = require('fs');
const path = require('path');
const Model = require('./model');
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
        const id = values && values[1], unit = (panel._data('A').SoldierCfg || {})[id];
        if (unit) {
            const stats = panel._section('Assigned unit · '+panel._text(unit.Name)+' · '+id);
            panel._note('Shared unit record: these stats also affect enemies of this type and every barracks branch using it. To change only this branch’s roster, use Soldier type above.', true, stats);
            const primary = ['Health','AttackDamage','AttackInterval','AttackRange','SearchRange','Speed','BuildingCross','Suppressed','DeathAni'];
            primary.filter(key => own(unit, key)).forEach(key => panel._value(stats, 'A', ['SoldierCfg', String(id), key], unit[key], key, {table:'SoldierCfg', id}, unit));
            const advanced = panel._section('Unit name, artwork & additional properties', undefined, true);
            panel._properties(advanced, 'A', ['SoldierCfg', String(id)], unit, {table:'SoldierCfg', id}, primary);
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
function render(panel, row) {
    if (row.overview) { overview(panel); return; }
    const building = row.record, at = row.path;
    const branches = Model.branches(building, row.key, panel._data('A'), panel._data('catalog'), panel._language);
    panel._properties(panel._section('Building type', undefined, true), 'A', at, building, {table:'BuildEnum', id:row.key}, ['levelList']);
    if (!branches.length) { panel._note('No upgrade branches are configured for this building.', true); return; }
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
    const costs = panel._section('Health, level & costs');
    ['Hp','level','BuildSliverCost','VedioCount'].filter(key => own(level, key)).forEach(key => panel._value(costs, 'A', keys.concat(key), level[key], key, context, level));
    if (!own(level, 'BuildSliverCost')) costs.appendChild(button('Add next purchase cost (silver)', () => panel._set('A', keys.concat('BuildSliverCost'), 1), 'gt-mini'));
    panel._note('Unlock cost constructs the first branch. The current branch’s silver cost controls the next purchase; upgrade choice dialogs also read the destination branch’s cost to choose silver or reward-ad presentation.', false, costs);
    const appearance = panel._section('Name, description & appearance');
    const visualKeys = ['Name','Describe','LevelUpDescribe','Icon','Skin','Zoom','Excursion'];
    visualKeys.filter(key => own(level, key)).forEach(key => panel._value(appearance, 'A', keys.concat(key), level[key], key, context, level));
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
    panel._properties(other, 'A', keys, level, context, visualKeys.concat(['Data','Hp','level','BuildSliverCost','VedioCount','BranchBuild']));
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
    const id = level && level.Data && level.Data[1], unit = (panel._data('A').SoldierCfg || {})[id];
    if (row.key === '3' && panel._buildingPreview === 'unit' && unit) panel._previewClient.setUnit(Object.assign(input, {type:'ally', id:String(id), record:unit}));
    else panel._previewClient.setBuilding(Object.assign(input, {id:row.key, record:row.record, levelIndex:panel._level}));
}
module.exports = {rows, render, preview, style:fs.readFileSync(path.join(__dirname, 'style.css'), 'utf8')};
