'use strict';

// Exercise the real Creator panel controls without starting a game or audio.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { test } = require('node:test');
const { Store } = require('../lib/store');
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
    function render(key, level) { panel._selected = key; panel._level = level || 0; panel._render(); }
    return { panel, store, messages, previews, render, previewChange: edits => previewActions.onChange(edits) };
}

test('building catalog includes every configured building and browsing every branch creates no drafts', () => {
    const f = fixture(), before = clone(f.store.draftState());
    const rows = f.panel._rows(), ids = Object.keys(before.A.BuildEnum).filter(id => id !== '0');
    assert(rows.some(row => row.key === '__all__' && row.overview));
    assert.deepEqual(clone(rows.filter(row => !row.overview).map(row => row.key).sort()), ids.sort());
    f.render('__all__');
    const branchCount = ids.reduce((count, id) => count + before.A.BuildEnum[id].levelList.length, 0);
    assert.equal(all(f.panel.$detail, element => element.className === 'bld-card').length, ids.length);
    assert.equal(all(f.panel.$detail, element => element.tagName === 'tr').length, branchCount + 1);
    for (const id of ids) {
        before.A.BuildEnum[id].levelList.forEach((_branch, index) => f.render(id, index));
    }
    assert.deepEqual(f.store.draftState(), before);
    assert.equal(f.store.changes().length, 0);
    assert.equal(f.messages.filter(item => /:(?:change|save)$/.test(item.message)).length, 0);
    assert(f.previews.some(item => item.kind === 'building'));
});

test('barracks roster controls edit the selected branch only and retain supported unit choices', async () => {
    const f = fixture(); f.render('3', 4);
    const original = clone(f.store.documents.A.data.BuildEnum['3'].levelList);
    const capacity = fields(f.panel.$detail, 'Soldier capacity')[0];
    const unit = fields(f.panel.$detail, 'Soldier type')[0];
    const respawn = fields(f.panel.$detail, 'Respawn time (seconds)')[0];
    assert(capacity && unit && respawn, 'Named barracks controls must be available.');
    assert.equal(capacity.value, String(original[4].Data[0]));
    assert.equal(unit.value, String(original[4].Data[1]));
    assert.equal(respawn.value, String(original[4].Data[2]));
    assert.deepEqual(unit.children.map(option => Number(option.value)).sort(), [90001, 90002, 90003, 90004]);
    const next = original[4].Data[0] + 3;
    capacity.value = String(next); capacity.onchange(); await f.panel._queue;
    assert.equal(f.store.documents.A.data.BuildEnum['3'].levelList[4].Data[0], next);
    assert.deepEqual(clone(f.messages[0].request.edits), [{ doc: 'A', path: ['BuildEnum', '3', 'levelList', 4, 'Data', 0], value: next }]);
    assert.deepEqual(f.store.documents.A.data.BuildEnum['3'].levelList[0], original[0]);
    assert.equal(f.messages.some(item => item.message === 'game-data-editor:save'), false);
});

test('inline barracks unit statistics edit only the allied record and preserve the matching enemy', async () => {
    const f = fixture(); f.render('3', 0);
    const branch = f.store.documents.A.data.BuildEnum['3'].levelList[0], id = String(branch.Data[1]);
    const originalBuildingHp = branch.Hp, enemy=clone(f.store.documents.A.data.SoldierCfg[id]), next = f.store.documents.A.data.AllyCfg[id].Health + 17;
    const summary = all(f.panel.$detail, element => element.tagName === 'summary' && element.textContent.startsWith('Assigned unit ·'))[0];
    assert(summary, 'Assigned unit section must be available.');
    const unitHp = fields(summary.parentNode, 'HP')[0];
    assert(unitHp, 'Assigned unit HP must be editable in the Buildings panel.');
    assert.match(f.panel.$detail.textContent, /shared/i);
    unitHp.value = String(next); unitHp.onchange(); await f.panel._queue;
    assert.equal(f.store.documents.A.data.AllyCfg[id].Health, next);
    assert.deepEqual(f.store.documents.A.data.SoldierCfg[id],enemy);
    assert.deepEqual(clone(f.messages[0].request.edits), [{ doc: 'A', path: ['AllyCfg', id, 'Health'], value: next }]);
    assert.equal(f.store.documents.A.data.BuildEnum['3'].levelList[0].Hp, originalBuildingHp);
    assert.equal(f.messages.some(item => item.message === 'game-data-editor:save'), false);
});

test('changing building or upgrade branch selection does not change game data', () => {
    const f = fixture(); f.render('3', 0);
    const before = clone(f.store.draftState());
    const branchButton = all(f.panel.$detail, element => element.tagName === 'button' && /#2\b/.test(element.textContent))[0];
    const branchRow = all(f.panel.$detail, element => element.tagName === 'tr' && typeof element.onclick === 'function')[1];
    assert(branchButton || branchRow, 'Upgrade branches must be navigable.');
    (branchButton || branchRow).onclick();
    assert(f.panel._level > 0);
    assert.deepEqual(f.store.draftState(), before);
    assert.equal(f.messages.length, 0);
});

test('assigned unit preview forwards only ally timing edits and preserves saved defaults', async () => {
    const f = fixture(); f.render('3', 4);
    const id = String(f.store.documents.A.data.BuildEnum['3'].levelList[4].Data[1]), key = 'ally:' + id + ':default';
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
    const f = fixture(); f.render('3');
    const capacity = fields(f.panel.$detail, 'Soldier capacity')[0];
    capacity.onchange();
    assert.equal(f.messages.length, 0);
    assert.equal(f.store.changes().length, 0);
});
