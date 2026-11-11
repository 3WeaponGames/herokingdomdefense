'use strict';

// Exercise the real Creator panel controls without starting a game or audio.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { test } = require('node:test');
const { Store } = require('../lib/store');
const AttackRates = require('../panel/attack-rate');
const project = path.resolve(__dirname, '../../..');
const clone = value => JSON.parse(JSON.stringify(value));

class Element {
    constructor(tag) {
        this.tagName = tag; this.children = []; this.style = {}; this.attributes = {};
        this.value = ''; this._text = ''; this.hidden = false; this.disabled = false;
        this.scrollTop = 0; this.className = '';
        this.classList = {
            add: (...names) => { this.className = [...new Set(this.className.split(' ').concat(names))].join(' ').trim(); },
            remove: (...names) => { this.className = this.className.split(' ').filter(name => !names.includes(name)).join(' '); },
            toggle: (name, force) => {
                const has = this.className.split(' ').includes(name), next = force === undefined ? !has : force;
                if (next) this.classList.add(name); else this.classList.remove(name);
                return next;
            }
        };
    }
    get firstChild() { return this.children[0] || null; }
    get textContent() { return this._text + this.children.map(child => child.textContent).join(''); }
    set textContent(value) { this._text = String(value); this.children = []; }
    appendChild(child) { this.children.push(child); child.parentNode = this; return child; }
    removeChild(child) { this.children.splice(this.children.indexOf(child), 1); child.parentNode = null; return child; }
    remove() { if (this.parentNode) this.parentNode.removeChild(this); }
    setAttribute(name, value) { this.attributes[name] = String(value); }
    getAttribute(name) { return this.attributes[name]; }
    addEventListener(name, action) { this['on' + name] = action; }
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
    querySelectorAll(selector) {
        return all(this, element => element !== this && (selector[0] === '.' ? element.className.split(' ').includes(selector.slice(1)) : element.tagName === selector));
    }
}
function all(root, match) {
    const found = [];
    const visit = element => { if (match(element)) found.push(element); element.children.forEach(visit); };
    visit(root); return found;
}
function fields(root, label) {
    return all(root, element => element.tagName === 'label' && element.children[0] && element.children[0].textContent === label)
        .map(element => all(element, child => ['input', 'select', 'textarea'].includes(child.tagName))[0]);
}
function branchPosition(f, typeID, index) {
    const position=f.store.documents.A.data.BuildEnum[typeID].levelList.findIndex(branch=>branch.index===index);
    assert(position>=0,'Building '+typeID+' branch '+index+' must exist.');
    return position;
}
function fixture() {
    const store = new Store(project), messages = [], previews = [], modules = new Map();
    let previewActions;
    const context = vm.createContext({ document: { createElement: tag => new Element(tag) }, setTimeout, clearTimeout, console });
    const preview = {
        mount(_parent, actions) {
            previewActions = actions;
            return {
                setBuilding(request) { previews.push({ kind: 'building', request }); },
                setUnit(request) { previews.push({ kind: 'unit', request }); },
                destroy() { previews.push({ kind: 'destroy' }); }
            };
        }
    };
    const Editor = {
        Panel: { extend: spec => spec },
        Ipc: {
            sendToMain(message, ...args) {
                const callback = args.pop(), request = args[0]; messages.push({ message, request });
                try {
                    if (message === 'game-data-editor:change') callback(null, store.change(request));
                    else if (message === 'game-data-editor:load') callback(null, store.snapshot());
                    else if (message === 'game-data-editor:asset-index') callback(null, { images: [], animations: [], prefabs: [] });
                    else throw Error('Unexpected panel action: ' + message);
                } catch (error) { callback(error.message); }
            }
        }
    };
    context.Editor = Editor;
    function load(filename) {
        filename = path.resolve(filename);
        if (modules.has(filename)) return modules.get(filename).exports;
        const module = { exports: {} }, local = createRequire(filename); modules.set(filename, module);
        function requireForPanel(name) {
            const resolved = local.resolve(name);
            if (resolved === path.join(project, 'packages/game-data-editor/preview/client.js')) return preview;
            if (resolved.startsWith(path.join(project, 'packages/game-data-editor/buildings') + path.sep)) return load(resolved);
            return local(name);
        }
        const wrapper = vm.runInContext('(function(require,module,exports,__dirname,__filename){\n' + fs.readFileSync(filename, 'utf8') + '\n})', context, { filename });
        wrapper(requireForPanel, module, module.exports, path.dirname(filename), filename);
        return module.exports;
    }
    const panel = Object.assign({}, load(path.join(project, 'packages/game-data-editor/panel/index.js')).create('buildings'));
    Object.keys(panel.$).forEach(name => { panel['$' + name] = new Element('div'); });
    Object.assign(panel, {
        _kind: 'buildings', _selected: '__all__', _level: 0, _wave: 0, _talentLevel: 0,
        _variant: 'A', _language: 'en', _queue: Promise.resolve(), _closed: false,
        _assets: { images: [], prefabs: [], animations: [] }, _snapshot: store.snapshot()
    });
    // The real preview supplies these read-only metrics asynchronously. Keep
    // this DOM fixture deterministic without launching the renderer or adding
    // metadata IPC calls to tests that inspect draft mutations.
    Object.keys(panel._data('A').SoldierCfg || {}).forEach(id => AttackRates.metrics(panel,{type:'enemy',id,level:0,duration:1}));
    for(const id of ['90001','90002','90003','90004'])for(const level of [1,2,3])AttackRates.metrics(panel,{type:'ally',id,level,duration:1});
    function render(key, level) { panel._selected = key; panel._level = level || 0; panel._render(); }
    return { panel, store, messages, previews, render, previewChange: edits => previewActions.onChange(edits) };
}

test('building catalog includes every configured building and browsing every branch creates no drafts', () => {
    const f = fixture(), before = clone(f.store.draftState());
    const rows = f.panel._rows(), ids = Object.keys(before.A.BuildEnum).filter(id => id !== '0');
    assert(rows.some(row => row.key === '__all__' && row.overview));
    assert.deepEqual([...new Set(rows.filter(row => !row.overview).map(row => row.typeID))].sort(), ids.sort());
    f.render('__all__');
    assert.equal(all(f.panel.$detail, element => element.className.split(' ').includes('bld-card')).length, 11);
    for (const id of ids) {
        const reachable = new Set();
        rows.filter(row => row.typeID === id && row.family).forEach(row => row.branches.forEach(branch => {
            f.render(row.key, branch.position); reachable.add(f.panel._level);
        }));
        assert.deepEqual([...reachable].sort((a,b) => a-b), before.A.BuildEnum[id].levelList.map((_branch, index) => index), 'Every stored branch remains reachable for building '+id);
    }
    assert.deepEqual(f.store.draftState(), before);
    assert.equal(f.store.changes().length, 0);
    assert.equal(f.messages.filter(item => /:(?:change|save)$/.test(item.message)).length, 0);
    assert(f.previews.some(item => item.kind === 'building'));
});

test('barracks roster controls edit the selected branch only and retain supported unit choices', async () => {
    const f = fixture(), position=branchPosition(f,'3',15); f.render('3:14', position);
    const original = clone(f.store.documents.A.data.BuildEnum['3'].levelList);
    const capacity = fields(f.panel.$detail, 'Soldier capacity')[0];
    const unit = fields(f.panel.$detail, 'Soldier type')[0];
    const respawn = fields(f.panel.$detail, 'Respawn time (seconds)')[0];
    assert(capacity && unit && respawn, 'Named barracks controls must be available.');
    assert.equal(capacity.value, String(original[position].Data[0]));
    assert.equal(unit.value, String(original[position].Data[1]));
    assert.equal(respawn.value, String(original[position].Data[2]));
    assert.deepEqual(unit.children.map(option => Number(option.value)).sort(), [90001, 90002, 90003, 90004]);
    const next = original[position].Data[0] + 3;
    capacity.value = String(next); capacity.onchange(); await f.panel._queue;
    assert.equal(f.store.documents.A.data.BuildEnum['3'].levelList[position].Data[0], next);
    assert.deepEqual(clone(f.messages[0].request.edits), [{ doc: 'A', path: ['BuildEnum', '3', 'levelList', position, 'Data', 0], value: next }]);
    assert.deepEqual(f.store.documents.A.data.BuildEnum['3'].levelList[0], original[0]);
    assert.equal(f.messages.some(item => item.message === 'game-data-editor:save'), false);
});

test('inline barracks unit statistics edit only the assigned allied level and preserve shared and enemy records', async () => {
    const f = fixture();
    for (const version of ['original','data']) {
        delete f.store.documents.overrides[version].unitLevels;
        if (f.store.documents.A[version].GameTools) delete f.store.documents.A[version].GameTools.unitLevels;
    }
    const position=branchPosition(f,'3',12);
    f.panel._snapshot=f.store.snapshot(); f.render('3:11', position);
    const branch = f.store.documents.A.data.BuildEnum['3'].levelList[position], id = String(branch.Data[1]), name='ally:'+id+':level:2';
    const originalBuildingHp = branch.Hp, enemy=clone(f.store.documents.A.data.SoldierCfg[id]), ally=clone(f.store.documents.A.data.AllyCfg[id]), next = ally.Health + 17;
    const summary = all(f.panel.$detail, element => element.tagName === 'summary' && element.textContent.startsWith('Assigned unit ·'))[0];
    assert(summary, 'Assigned unit section must be available.');
    const unitHp = fields(summary.parentNode, 'HP')[0];
    assert(unitHp, 'Assigned unit HP must be editable in the Buildings panel.');
    assert.match(f.panel.$detail.textContent, /shared/i);
    unitHp.value = String(next); unitHp.onchange(); await f.panel._queue;
    assert.equal(f.store.documents.overrides.data.unitLevels[name].Health, next);
    assert.deepEqual(f.store.documents.A.data.AllyCfg[id],ally);
    assert.deepEqual(f.store.documents.A.data.SoldierCfg[id],enemy);
    assert(f.store.changes().every(change=>change.doc==='overrides'&&change.path[0]==='unitLevels'));
    assert.equal(f.store.documents.A.data.BuildEnum['3'].levelList[position].Hp, originalBuildingHp);
    assert.equal(f.messages.some(item => item.message === 'game-data-editor:save'), false);
});

test('changing building level selection does not change game data', () => {
    const f = fixture(); f.render('3:11', branchPosition(f,'3',11));
    const before = clone(f.store.draftState());
    const levelButton = all(f.panel.$detail, element => element.tagName === 'button' && element.getAttribute('data-building-level')==='2')[0];
    assert(levelButton, 'Building levels must be navigable.');
    levelButton.onclick();
    assert.equal(f.panel._level,branchPosition(f,'3',12));
    assert.deepEqual(f.store.draftState(), before);
    assert.equal(f.messages.length, 0);
});

test('assigned unit preview forwards only ally timing edits and preserves saved defaults', async () => {
    const f = fixture(), position=branchPosition(f,'3',15); f.render('3:14', position);
    const id = String(f.store.documents.A.data.BuildEnum['3'].levelList[position].Data[1]), key = 'ally:' + id + ':default';
    const defaults = clone(f.store.documents.overrides.data.timingDefaults || {});
    const toggle = all(f.panel.$detail, element => element.tagName === 'button' && element.textContent === 'Assigned unit & attack timing')[0];
    assert(toggle); toggle.onclick();
    const preview = f.previews.at(-1);
    assert.equal(preview.kind, 'unit');
    assert.equal(preview.request.type, 'ally'); assert.equal(preview.request.id, id);
    assert.equal(f.messages.length, 0);
    await f.previewChange([{ doc: 'overrides', path: ['timings', key], value: { attack: .37 } }]);
    assert.equal(f.store.documents.overrides.data.timings[key].attack, .37);
    assert.deepEqual(f.store.documents.overrides.data.timingDefaults || {}, defaults);
    assert.equal(f.messages.some(item => item.message === 'game-data-editor:save'), false);
});

test('committing an unchanged building value emits no draft mutation', () => {
    const f = fixture(); f.render('3:11');
    const capacity = fields(f.panel.$detail, 'Soldier capacity')[0];
    capacity.onchange();
    assert.equal(f.messages.length, 0);
    assert.equal(f.store.changes().length, 0);
});

test('construction cards can be reordered and edited without changing upgrades or unit stats',async()=>{
    const f=fixture(),building=f.store.documents.A.data.BuildEnum['3'];
    building.InitialChoices=[11,14,17];f.panel._snapshot=f.store.snapshot();f.render('3');
    const original=clone(building.levelList),units=clone(f.store.documents.A.data.AllyCfg);
    const choice=fields(f.panel.$detail,'Construction choice 1')[0];assert(choice);
    choice.value='20';choice.onchange();await f.panel._queue;
    assert.deepEqual(clone(f.messages[0].request.edits),[{doc:'A',path:['BuildEnum','3','InitialChoices',0],value:20}]);
    assert.deepEqual(f.store.documents.A.data.BuildEnum['3'].levelList,original);
    assert.deepEqual(f.store.documents.A.data.AllyCfg,units);
    const earlier=all(f.panel.$detail,element=>element.tagName==='button'&&element.textContent==='Move earlier')[0];
    assert(earlier);earlier.onclick();await f.panel._queue;
    assert.deepEqual(f.store.documents.A.data.BuildEnum['3'].InitialChoices,[14,20,17]);
    assert.equal(f.messages.some(item=>item.message==='game-data-editor:save'),false);
});

test('tower targeting edits retain its attack type, unknown properties and every other branch',async()=>{
    const f=fixture(),position=branchPosition(f,'2',4),row=f.store.documents.A.data.BuildEnum['2'].levelList[position];
    row.Tower.customFuture={retain:[7]};row.customFuture={retain:[8]};
    const original=clone(f.store.documents.A.data.BuildEnum['2'].levelList);
    f.panel._snapshot=f.store.snapshot();f.render('2:4',position);
    assert.equal(f.messages.length,0,'Browsing authored tower controls does not create drafts');
    const targeting=fields(f.panel.$detail,'Tower targeting')[0];assert(targeting);
    assert.deepEqual(targeting.children.map(option=>option.value),['nearest','highestHp','lowestHp','farthest']);
    targeting.value='highestHp';targeting.onchange();await f.panel._queue;
    assert.deepEqual(f.store.documents.A.data.BuildEnum['2'].levelList[position].Tower,Object.assign({},original[position].Tower,{targeting:'highestHp'}));
    const next=fields(f.panel.$detail,'Tower targeting')[0];next.value='nearest';next.onchange();await f.panel._queue;
    assert.deepEqual(clone(f.messages.map(message=>message.request.edits)),[
        [{doc:'A',path:['BuildEnum','2','levelList',position,'Tower','targeting'],value:'highestHp'}],
        [{doc:'A',path:['BuildEnum','2','levelList',position,'Tower','targeting'],value:'nearest'}]
    ]);
    assert.deepEqual(f.store.documents.A.data.BuildEnum['2'].levelList,original);
    assert.equal(f.store.documents.A.data.BuildEnum['2'].levelList[position].Tower.attackType,'cannon');
    assert.equal(f.messages.some(item=>item.message==='game-data-editor:save'),false);
});

test('removed Buildings sections and notices stay hidden while every stored property is retained',()=>{
    const f=fixture(),before=f.store.draftState();
    for(const key of ['1','2:4','3:11','4','5','6']){
        f.render(key);
        for(const title of ['Map artwork & footprint','Aiming weapon layer','Identifiers & additional authored properties','Construction timing · shared by all buildings','Shared building category','Branch IDs stay fixed'])assert(!f.panel.$detail.textContent.includes(title),title);
        assert(f.panel.$detail.textContent.includes('Blocker'));
    }
    assert.deepEqual(f.store.draftState(),before);assert.equal(f.messages.length,0);
});

test('each building level displays its incoming price, including terminal levels, and edits only its destination cost',async()=>{
    const f=fixture(),before=f.store.draftState();
    for(const [key,index,expected] of [['1',1,3],['1',3,10],['2:4',4,3],['2:4',5,8],['2:4',6,16],['3:11',13,16],['6',3,7]]){
        const id=key.split(':')[0],position=branchPosition(f,id,index);f.render(key,position);
        const field=fields(f.panel.$detail,'Build / upgrade cost (silver)')[0];assert(field);assert.equal(Number(field.value),expected);
        assert(!f.panel.$detail.textContent.includes('Add next purchase cost'));
        field.onchange();await f.panel._queue;
    }
    assert.deepEqual(f.store.draftState(),before,'Unchanged inferred prices must not create overrides');assert.equal(f.messages.length,0);
    const position=branchPosition(f,'2',6);f.render('2:4',position);const cost=fields(f.panel.$detail,'Build / upgrade cost (silver)')[0];cost.value='21';cost.onchange();await f.panel._queue;
    const expected=clone(before);expected.A.BuildEnum[2].levelList[position].BuildCost=21;
    assert.deepEqual(f.store.draftState(),expected);assert.equal(f.messages.length,1);assert.equal(f.messages[0].message,'game-data-editor:change');
});

test('wall artwork tiers have three tabs without rewriting legacy progression or branch references',()=>{
    const f=fixture(),before=f.store.draftState();f.render('6');
    const tabs=all(f.panel.$detail,e=>e.getAttribute('role')==='tab');assert.deepEqual(tabs.map(tab=>tab.textContent),['Lvl 1','Lvl 2','Lvl 3']);
    tabs[2].onclick();assert.equal(f.panel._level,branchPosition(f,'6',3));assert(f.panel.$detail.textContent.includes('Level 3 ·'));
    assert.equal(f.previews.at(-1).request.record.levelList[f.panel._level].Skin,'cq-rts-3');assert.equal(fields(f.panel.$detail,'Level 2 variant').length,0);
    assert.deepEqual(f.store.draftState(),before);assert.equal(f.messages.length,0);
});
