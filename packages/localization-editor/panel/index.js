'use strict';
const fs = require('fs');
const path = require('path');
const Catalog = require('../lib/catalog');
const JSONDocument = require('../../game-data-editor/lib/json-document');
function ipc(message) {
    const args = Array.prototype.slice.call(arguments, 1);
    return new Promise((resolve, reject) => Editor.Ipc.sendToMain.apply(Editor.Ipc,
        ['localization-editor:' + message].concat(args, [(err, data) => err ? reject(new Error(String(err))) : resolve(data)])));
}
function element(tag, text, className) {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    return node;
}
function filename(root, extension) {
    return path.join(root, 'local', 'translations.' + extension);
}
function saveDialog(options) {
    const dialog = require('electron').remote.dialog;
    if (dialog.showSaveDialogSync) return Promise.resolve(dialog.showSaveDialogSync(options));
    return new Promise(resolve => dialog.showSaveDialog(options, resolve));
}
Editor.Panel.extend({
    template: fs.readFileSync(path.join(__dirname, 'panel.html'), 'utf8'),
    style: fs.readFileSync(path.join(__dirname, 'panel.css'), 'utf8'),
    $: {
        root: '#root', status: '#status', subtitle: '#subtitle', save: '#save', reload: '#reload',
        search: '#search', missing: '#missing', target: '#target', defaultLanguage: '#defaultLanguage',
        entriesTab: '#entriesTab', imagesTab: '#imagesTab', entries: '#entries', images: '#images',
        table: '#table', pagination: '#pagination', previous: '#previous', next: '#next',
        addKey: '#addKey', keyName: '#keyName', addLanguage: '#addLanguage', languageCode: '#languageCode',
        languageName: '#languageName', importCSV: '#importCSV', importFile: '#importFile', exportCSV: '#exportCSV',
        validate: '#validate', issues: '#issues', issueCount: '#issueCount', imageList: '#imageList',
        imageKey: '#imageKey', imageUuid: '#imageUuid', imageMode: '#imageMode', imageFont: '#imageFont',
        imageColor: '#imageColor', imageBackground: '#imageBackground', imageOutline: '#imageOutline',
        imageOutlineWidth: '#imageOutlineWidth', imageRect: '#imageRect', imageArtwork: '#imageArtwork',
        imageJson: '#imageJson', imageApply: '#imageApply', imageAdd: '#imageAdd', imageNewUuid: '#imageNewUuid',
        imageHelp: '#imageHelp', draftInfo: '#draftInfo', restoreDraft: '#restoreDraft', discardDraft: '#discardDraft'
        , templatesTab: '#templatesTab', templates: '#templates', templateList: '#templateList', templateTitle: '#templateTitle',
        templateJson: '#templateJson', templateApply: '#templateApply', buildArtwork: '#buildArtwork'
        , layoutsTab: '#layoutsTab', layouts: '#layouts', layoutList: '#layoutList', layoutTitle: '#layoutTitle',
        layoutContext: '#layoutContext', layoutJson: '#layoutJson', layoutApply: '#layoutApply', layoutAdd: '#layoutAdd'
    },
    ready() {
        this._closed = false;
        this._page = 0; this._dirty = false; this._image = ''; this._mode = 'entries';
        this.$save.onclick = () => this._save();
        this.$reload.onclick = () => {
            if (!this._dirty || window.confirm('Discard unsaved panel changes and reload the catalog from disk?')) this._load();
        };
        this.$search.oninput = () => { this._page = 0; this._render(); };
        this.$missing.onchange = this.$target.onchange = () => { this._page = 0; this._render(); };
        this.$defaultLanguage.onchange = () => { this._catalog.defaultLanguage = this.$defaultLanguage.value; this._changed(); };
        this.$entriesTab.onclick = () => this._tab('entries');
        this.$imagesTab.onclick = () => this._tab('images');
        this.$templatesTab.onclick = () => this._tab('templates');
        this.$layoutsTab.onclick = () => this._tab('layouts');
        this.$layoutList.onchange = () => { this._layout = this.$layoutList.value; this._renderLayout(); };
        this.$layoutApply.onclick = () => this._applyLayout();
        this.$layoutAdd.onclick = () => this._addLayout();
        this.$templateList.onchange = () => { this._template = this.$templateList.value; this._renderTemplate(); };
        this.$templateApply.onclick = () => this._applyTemplate();
        this.$buildArtwork.onclick = () => this._buildArtwork();
        this.$previous.onclick = () => { this._page--; this._render(); };
        this.$next.onclick = () => { this._page++; this._render(); };
        this.$addKey.onclick = () => this._addKey();
        this.$addLanguage.onclick = () => this._addLanguage();
        this.$validate.onclick = () => this._validate(true);
        this.$exportCSV.onclick = () => this._export();
        this.$importCSV.onclick = () => this.$importFile.click();
        this.$importFile.onchange = () => this._import();
        this.$imageList.onchange = () => { this._image = this.$imageList.value; this._renderImage(); };
        this.$imageApply.onclick = () => this._applyImage();
        this.$imageAdd.onclick = () => this._addImage();
        this.$restoreDraft.onclick = () => this._restoreDraft();
        this.$discardDraft.onclick = () => { localStorage.removeItem(this._draftKey); this.$draftInfo.hidden = true; };
        this._load();
    },
    close() {
        this._closed = true;
        this._loadGeneration = (this._loadGeneration || 0) + 1;
        this._sessionGeneration = (this._sessionGeneration || 0) + 1;
        if (this._dirty) this._writeDraft();
        this._pendingSave = null;
        if (this._draftTimer) clearTimeout(this._draftTimer);
    },
    _status(message, error) {
        this.$status.textContent = message;
        this.$status.className = error ? 'status error' : 'status';
    },
    async _load() {
        if (this._closed) return;
        const generation = this._loadGeneration = (this._loadGeneration || 0) + 1;
        const editRevision = this._editRevision || 0;
        const revisionEpoch = this._revisionEpoch || 0;
        this.$save.disabled = true;
        try {
            const result = await ipc('load');
            if (this._closed || generation !== this._loadGeneration || revisionEpoch !== (this._revisionEpoch || 0)) return;
            if (editRevision !== (this._editRevision || 0)) {
                this.$save.disabled = !this._dirty || !!this._pendingSave;
                this._status('Reload skipped because the draft changed while loading. Your edits are retained.');
                return;
            }
            this._catalog = result.catalog; this._revision = result.revision; this._file = result.file;
            this._revisionEpoch = revisionEpoch + 1;
            this._revisionSnapshot = JSON.stringify(result.catalog);
            this._pendingSave = null;
            this._draftKey = 'localization-editor-draft:' + result.file;
            this._dirty = false; this._page = 0; this._image = ''; this._populateLocales();
            this._render(); this._validate(false);
            this.$draftInfo.hidden = !localStorage.getItem(this._draftKey);
            this._status('Loaded translation catalog. Edit cells, then Save tables.');
        } catch (err) {
            if (this._closed || generation !== this._loadGeneration || revisionEpoch !== (this._revisionEpoch || 0)) return;
            this.$save.disabled = !this._dirty || !!this._pendingSave;
            this._status(err.message, true);
        }
    },
    _populateLocales() {
        const previous = this.$target.value;
        this.$target.innerHTML = ''; this.$defaultLanguage.innerHTML = '';
        this.$target.appendChild(element('option', 'All languages')); this.$target.firstChild.value = '';
        this._catalog.languages.forEach(language => {
            [this.$target, this.$defaultLanguage].forEach(select => {
                const option = element('option', language.code); option.value = language.code; select.appendChild(option);
            });
        });
        this.$target.value = previous;
        this.$defaultLanguage.value = this._catalog.defaultLanguage;
    },
    _changed() {
        this._editRevision = (this._editRevision || 0) + 1;
        this._dirty = true; this.$save.disabled = !!this._pendingSave;
        this._status('Unsaved changes — Save tables to update the game.');
        this._subtitle();
        clearTimeout(this._draftTimer);
        this._draftTimer = setTimeout(() => this._writeDraft(), 500);
    },
    _writeDraft() {
        if (!this._catalog || !this._draftKey || !this._dirty) return;
        try {
            const draft = { catalog: this._catalog, revision: this._revision };
            // Import acknowledgement may arrive after this panel closes. Keep
            // one submitted snapshot so reopening can identify that exact save.
            if (this._pendingSave) draft.pendingSave = {
                revision: this._pendingSave.revision,
                catalog: JSON.parse(this._pendingSave.snapshot)
            };
            localStorage.setItem(this._draftKey, JSON.stringify(draft));
        }
        catch (err) { this._status('Could not keep a recovery draft. Save your changes before closing. ' + err.message, true); }
    },
    _restoreDraft() {
        try {
            const draft = JSON.parse(localStorage.getItem(this._draftKey));
            const pending = draft.pendingSave;
            const savedWhileClosed = pending && pending.revision === draft.revision && this._revisionSnapshot &&
                JSONDocument.equal(pending.catalog, JSON.parse(this._revisionSnapshot));
            if (draft.revision !== this._revision && !savedWhileClosed) throw new Error('This recovery draft belongs to an older disk revision. Export it from local storage or discard it; it cannot safely replace current edits.');
            this._catalog = Catalog.structure(draft.catalog); this._populateLocales(); this._render(); this._changed();
            this.$draftInfo.hidden = true;
        } catch (err) { this._status(err.message, true); }
    },
    _subtitle() {
        this.$subtitle.textContent = Object.keys(this._catalog.entries).length + ' entries · ' + this._catalog.languages.length +
            ' languages · ' + Object.keys(this._catalog.images || {}).length + ' artwork bindings' + (this._dirty ? ' · Unsaved' : '');
    },
    _tab(mode) {
        this._mode = mode;
        this.$entries.hidden = mode !== 'entries'; this.$images.hidden = mode !== 'images';
        this.$templates.hidden = mode !== 'templates';
        this.$layouts.hidden = mode !== 'layouts';
        this.$entriesTab.className = mode === 'entries' ? 'tab selected' : 'tab';
        this.$imagesTab.className = mode === 'images' ? 'tab selected' : 'tab';
        this.$templatesTab.className = mode === 'templates' ? 'tab selected' : 'tab';
        this.$layoutsTab.className = mode === 'layouts' ? 'tab selected' : 'tab';
        this._render();
    },
    _render() {
        if (!this._catalog) return;
        this._subtitle();
        if (this._mode === 'images') { this._renderImageList(); return; }
        if (this._mode === 'templates') { this._renderTemplateList(); return; }
        if (this._mode === 'layouts') { this._renderLayoutList(); return; }
        const query = this.$search.value.toLowerCase();
        const codes = this.$target.value ? [this.$target.value] : this._catalog.languages.map(l => l.code);
        const keys = Object.keys(this._catalog.entries).sort().filter(key => {
            const entry = this._catalog.entries[key];
            if (this.$missing.checked && !codes.some(code => !(entry[code] || '').trim())) return false;
            return !query || [key, entry.context || ''].concat(this._catalog.languages.map(l => entry[l.code] || '')).some(value => value.toLowerCase().indexOf(query) >= 0);
        });
        const pageSize = 40, pages = Math.max(1, Math.ceil(keys.length / pageSize));
        this._page = Math.min(Math.max(this._page, 0), pages - 1);
        this.$pagination.textContent = keys.length + ' results · Page ' + (this._page + 1) + ' of ' + pages;
        this.$previous.disabled = this._page === 0; this.$next.disabled = this._page + 1 >= pages;
        this.$table.innerHTML = '';
        const head = element('thead'), header = element('tr');
        header.appendChild(element('th', 'Key / context'));
        codes.forEach(code => header.appendChild(element('th', code)));
        head.appendChild(header); this.$table.appendChild(head);
        const body = element('tbody');
        keys.slice(this._page * pageSize, (this._page + 1) * pageSize).forEach(key => {
            const entry = this._catalog.entries[key], row = element('tr'), identity = element('td');
            identity.appendChild(element('div', key, 'entry-key'));
            const context = element('textarea'); context.className = 'context'; context.rows = 2;
            context.value = entry.context || ''; context.placeholder = 'Context / source location';
            context.setAttribute('aria-label', key + ' context');
            context.oninput = () => { entry.context = context.value; this._changed(); };
            identity.appendChild(context); row.appendChild(identity);
            codes.forEach(code => {
                const cell = element('td'), input = element('textarea');
                input.rows = 3; input.value = entry[code] || ''; input.spellcheck = false;
                input.setAttribute('aria-label', key + ' ' + code);
                input.className = input.value.trim() ? '' : 'missing-cell';
                input.oninput = () => { entry[code] = input.value; input.className = input.value.trim() ? '' : 'missing-cell'; this._changed(); };
                cell.appendChild(input); row.appendChild(cell);
            });
            body.appendChild(row);
        });
        this.$table.appendChild(body);
    },
    _addKey() {
        if (!this._catalog) return;
        const key = this.$keyName.value.trim();
        if (!Catalog.safeKey(key)) { this._status('Use a stable key such as settings.language or hero.archer.description.', true); return; }
        if (Object.prototype.hasOwnProperty.call(this._catalog.entries, key)) { this._status('That key already exists.', true); return; }
        const entry = { context: '' };
        this._catalog.languages.forEach(l => { entry[l.code] = ''; });
        this._catalog.entries[key] = entry; this.$search.value = key; this.$keyName.value = ''; this.$missing.checked = false;
        this._page = 0; this._tab('entries'); this._changed();
    },
    _addLanguage() {
        if (!this._catalog) return;
        const code = this.$languageCode.value.trim(), name = this.$languageName.value.trim();
        if (!Catalog.safeKey(code) || !name) { this._status('Enter a locale code (for example fr) and its native name (Français).', true); return; }
        if (this._catalog.languages.some(l => l.code === code)) { this._status('That language already exists.', true); return; }
        const nameKey = 'language.' + code;
        if (this._catalog.entries[nameKey]) { this._status('The language name key ' + nameKey + ' already exists; use a different code or edit the catalog.', true); return; }
        const keys = Object.keys(this._catalog.entries);
        const collision = keys.find(key => Object.prototype.hasOwnProperty.call(this._catalog.entries[key], code) && typeof this._catalog.entries[key][code] !== 'string');
        if (collision !== undefined) { this._status('Cannot add ' + code + ': ' + collision + ' already uses that field for non-text metadata. The draft is unchanged.', true); return; }
        this._catalog.languages.push({ code, nameKey });
        keys.forEach(key => { if (!Object.prototype.hasOwnProperty.call(this._catalog.entries[key], code)) this._catalog.entries[key][code] = ''; });
        const names = { context: 'Native name shown in the language selector' };
        this._catalog.languages.forEach(l => { names[l.code] = name; });
        this._catalog.entries[nameKey] = names;
        this.$languageCode.value = ''; this.$languageName.value = ''; this._populateLocales(); this.$target.value = code;
        this._render(); this._changed(); this._validate(false);
    },
    _validate(expand) {
        if (!this._catalog) return;
        try {
            const issues = Catalog.validate(this._catalog);
            this.$issueCount.textContent = issues.length ? issues.length + ' issues' : 'All translations valid';
            this.$issueCount.className = issues.length ? 'badge warn' : 'badge good';
            this.$issues.innerHTML = ''; this.$issues.hidden = !expand;
            if (!issues.length) this.$issues.appendChild(element('p', 'All languages have text. Placeholder and rich text tokens match their source.'));
            issues.slice(0, 250).forEach(issue => {
                const button = element('button', issue.key + ' [' + (issue.language || 'artwork') + '] — ' + issue.message, 'issue');
                button.onclick = () => {
                    this.$search.value = issue.key; this.$target.value = issue.language || ''; this.$missing.checked = false;
                    this._page = 0; this._tab('entries');
                };
                this.$issues.appendChild(button);
            });
            if (issues.length > 250) this.$issues.appendChild(element('p', 'Showing the first 250 issues. Filter missing entries to review the rest.'));
            return issues;
        } catch (err) { this._status(err.message, true); throw err; }
    },
    async _save() {
        if (!this._catalog || !this._dirty || this._closed || this._pendingSave) return;
        // Only an adopted Load/Save result changes this epoch. A failed Reload
        // must not invalidate a Save that has already committed to disk.
        const revisionEpoch = this._revisionEpoch || 0;
        const sessionGeneration = this._sessionGeneration || 0;
        const current = () => !this._closed && sessionGeneration === (this._sessionGeneration || 0) && revisionEpoch === (this._revisionEpoch || 0);
        let request;
        try {
            const issues = this._validate(false);
            if (issues.length && !window.confirm(issues.length + ' translation issues remain. Save this work in progress? Untranslated text will use the runtime fallback.')) return;
            this.$save.disabled = true;
            this._status('Saving tables and rebuilding localized artwork…');
            // IPC takes a snapshot so edits made during the save are not marked saved accidentally.
            const snapshot = JSON.stringify(this._catalog);
            request = this._pendingSave = { revision: this._revision, snapshot };
            const result = await ipc('save', JSON.parse(snapshot), this._revision);
            if (!current()) return;
            this._revision = result.revision;
            this._revisionEpoch = revisionEpoch + 1;
            this._revisionSnapshot = snapshot;
            this._pendingSave = null;
            this._dirty = JSON.stringify(this._catalog) !== snapshot;
            this.$save.disabled = !this._dirty;
            clearTimeout(this._draftTimer);
            if (this._dirty) this._writeDraft(); else localStorage.removeItem(this._draftKey);
            this.$draftInfo.hidden = true;
            this._subtitle();
            this._status(result.warning || ('Saved. Built ' + (result.artwork && result.artwork.count || 0) + ' artwork files. Restart browser preview to load changes. Backup: ' + result.backup), !!result.warning);
        } catch (err) {
            if (!current()) return;
            if (this._pendingSave === request) this._pendingSave = null;
            this._writeDraft();
            this.$save.disabled = false; this._status(err.message, true);
        }
    },
    async _export() {
        if (!this._catalog) return;
        try {
            const file = await saveDialog({ title: 'Export translation table', defaultPath: filename(path.dirname(path.dirname(path.dirname(path.dirname(this._file)))), 'csv'), filters: [{ name: 'CSV table', extensions: ['csv'] }] });
            const selected = typeof file === 'string' ? file : file && file.filePath;
            if (!selected) return;
            fs.writeFileSync(selected, Catalog.toCSV(this._catalog), 'utf8');
            this._status('Exported current panel contents to ' + selected);
        } catch (err) { this._status(err.message, true); }
    },
    _import() {
        const file = this.$importFile.files[0]; this.$importFile.value = '';
        if (!file || !this._catalog) return;
        try {
            const result = Catalog.mergeCSV(this._catalog, fs.readFileSync(file.path, 'utf8'));
            if (JSONDocument.equal(result.catalog, this._catalog)) {
                this._status('The imported rows match the current table.');
                return;
            }
            this._catalog = result.catalog; this._render(); this._changed(); this._validate(true);
            this._status('Imported ' + result.count + ' rows into the panel. Review and Save tables to apply.');
        } catch (err) { this._status(err.message, true); }
    },
    _renderImageList() {
        const query = this.$search.value.toLowerCase(); this.$imageList.innerHTML = '';
        const images = this._catalog.images || {};
        const keys = Object.keys(images).filter(uuid => (uuid + ' ' + images[uuid].key).toLowerCase().indexOf(query) >= 0).sort();
        keys.forEach(uuid => { const option = element('option', images[uuid].key + ' · ' + uuid); option.value = uuid; this.$imageList.appendChild(option); });
        if (keys.indexOf(this._image) < 0) this._image = keys[0] || '';
        this.$imageList.value = this._image; this._renderImage();
    },
    _renderImage() {
        const record = (this._catalog.images || {})[this._image];
        this.$imageApply.disabled = !record;
        this.$imageUuid.textContent = this._image || 'Select an artwork binding';
        this.$imageHelp.textContent = record ? 'Edit text, placement, or optional artwork per locale. Apply binding stages these fields; Save tables updates the game.' : 'No matching artwork bindings.';
        this.$imageKey.value = record && record.key || '';
        this.$imageMode.value = record && record.mode || 'replace';
        this.$imageFont.value = record && record.fontSize !== undefined ? record.fontSize : '';
        this.$imageColor.value = record && record.color || '';
        this.$imageBackground.value = record && record.background || '';
        this.$imageOutline.value = record && record.outlineColor || '';
        this.$imageOutlineWidth.value = record && record.outlineWidth !== undefined ? record.outlineWidth : '';
        this.$imageRect.value = record && record.rect ? JSON.stringify(record.rect) : '';
        this.$imageJson.value = record ? JSON.stringify(record, null, 2) : '';
        this.$imageArtwork.innerHTML = '';
        if (record) this._catalog.languages.forEach(language => {
            const row = element('label', language.code + ' artwork UUID'), input = element('input');
            input.value = record.artwork && record.artwork[language.code] || ''; input.dataset.locale = language.code;
            input.placeholder = 'Optional SpriteFrame UUID'; row.appendChild(input); this.$imageArtwork.appendChild(row);
        });
        // Preserve omitted defaults and explicit empty values when Apply is a no-op.
        this._imageFieldValues = {};
        ['imageKey', 'imageMode', 'imageFont', 'imageColor', 'imageBackground', 'imageOutline', 'imageOutlineWidth', 'imageRect'].forEach(name => {
            this._imageFieldValues[name] = String(this['$' + name].value);
        });
        this._imageArtworkValues = {};
        Array.prototype.forEach.call(this.$imageArtwork.querySelectorAll('input'), input => {
            this._imageArtworkValues[input.dataset.locale] = String(input.value);
        });
    },
    _applyImage() {
        if (!this._image) return;
        try {
            // JSON preserves extension metadata; only edited controls override it.
            const record = JSON.parse(this.$imageJson.value || '{}');
            const changed = name => String(this['$' + name].value) !== this._imageFieldValues[name];
            if (changed('imageKey')) record.key = this.$imageKey.value.trim();
            if (changed('imageMode')) record.mode = this.$imageMode.value;
            [['fontSize', 'imageFont'], ['outlineWidth', 'imageOutlineWidth']].forEach(pair => {
                if (!changed(pair[1])) return;
                const value = String(this['$' + pair[1]].value).trim();
                if (!value) delete record[pair[0]]; else record[pair[0]] = Number(value);
            });
            [['color', 'imageColor'], ['background', 'imageBackground'], ['outlineColor', 'imageOutline']].forEach(pair => {
                if (!changed(pair[1])) return;
                const value = this['$' + pair[1]].value.trim();
                if (!value) delete record[pair[0]]; else record[pair[0]] = value;
            });
            if (changed('imageRect')) {
                if (this.$imageRect.value.trim()) record.rect = JSON.parse(this.$imageRect.value); else delete record.rect;
            }
            Array.prototype.forEach.call(this.$imageArtwork.querySelectorAll('input'), input => {
                if (String(input.value) === this._imageArtworkValues[input.dataset.locale]) return;
                record.artwork = record.artwork || {};
                if (input.value.trim()) record.artwork[input.dataset.locale] = input.value.trim(); else delete record.artwork[input.dataset.locale];
            });
            const test = Catalog.clone(this._catalog); test.images[this._image] = record; Catalog.structure(test);
            if (JSONDocument.equal(record, this._catalog.images[this._image])) return;
            this._catalog.images[this._image] = record; this._renderImageList(); this._changed();
        } catch (err) { this._status('Artwork binding: ' + err.message, true); }
    },
    _addImage() {
        if (!this._catalog) return;
        const uuid = this.$imageNewUuid.value.trim(), key = this.$keyName.value.trim();
        if (!Catalog.safeKey(uuid) || !Catalog.safeKey(key)) { this._status('Enter a SpriteFrame UUID and a translation key in the New key field above.', true); return; }
        if (this._catalog.images && Object.prototype.hasOwnProperty.call(this._catalog.images, uuid)) { this._status('That SpriteFrame already has a binding.', true); return; }
        if (!Object.prototype.hasOwnProperty.call(this._catalog.entries, key)) { this._status('Add and translate the key first, then create its artwork binding.', true); return; }
        this._catalog.images = this._catalog.images || {};
        this._catalog.images[uuid] = { key, mode: 'replace', artwork: {} };
        this._image = uuid; this.$imageNewUuid.value = ''; this.$search.value = ''; this._render(); this._changed();
    },
    _renderTemplateList() {
        const query = this.$search.value.toLowerCase(); this.$templateList.innerHTML = '';
        const templates = this._catalog.artTemplates || {};
        const keys = Object.keys(templates).filter(id => (id + ' ' + JSON.stringify(templates[id])).toLowerCase().indexOf(query) >= 0).sort();
        keys.forEach(id => { const option = element('option', id); option.value = id; this.$templateList.appendChild(option); });
        if (keys.indexOf(this._template) < 0) this._template = keys[0] || '';
        this.$templateList.value = this._template; this._renderTemplate();
    },
    _renderTemplate() {
        const record = (this._catalog.artTemplates || {})[this._template];
        this.$templateTitle.textContent = record ? this._template + ' · ' + record.width + ' × ' + record.height + ' pixels' : 'No matching templates';
        this.$templateJson.value = record ? JSON.stringify(record, null, 2) : '';
        this.$templateApply.disabled = !record;
    },
    _applyTemplate() {
        if (!this._template) return;
        try {
            const record = JSON.parse(this.$templateJson.value);
            if (JSONDocument.equal(record, this._catalog.artTemplates[this._template])) return;
            const candidate = Catalog.clone(this._catalog); candidate.artTemplates[this._template] = record;
            const root = path.dirname(path.dirname(path.dirname(path.dirname(this._file))));
            require('../lib/art-compiler').prepare(candidate, root);
            this._catalog.artTemplates[this._template] = record; this._renderTemplate(); this._changed();
        } catch (err) { this._status('Artwork template: ' + err.message, true); }
    },
    async _buildArtwork() {
        if (this._dirty) { this._status('Save tables first. Saving also rebuilds artwork from your latest translations.', true); return; }
        this.$buildArtwork.disabled = true; this._status('Rebuilding saved artwork…');
        try { const result = await ipc('compile'); this._status('Built ' + result.count + ' artwork files. Reload browser preview to see them.'); }
        catch (err) { this._status(err.message, true); }
        finally { this.$buildArtwork.disabled = false; }
    },
    _renderLayoutList() {
        const query = this.$search.value.toLowerCase(); this.$layoutList.innerHTML = '';
        const layouts = this._catalog.labelStyles || {};
        // Index each binding table once per search. Rebuild from the current
        // draft so applied/imported bindings need no persistent cache invalidation.
        const tables = query ? ['nodeStyles','nodePathStyles'].map(section => {
            const table = new Map();
            Object.entries(this._catalog[section] || {}).forEach(([id, key]) => {
                if (!table.has(key)) table.set(key, []);
                table.get(key).push(id);
            });
            return table;
        }) : [];
        const keys = Object.keys(layouts).filter(key => {
            if (!query) return true;
            const entry = this._catalog.entries[key] || {};
            const bindings = tables.map(table => (table.get(key) || []).join(' ')).join(' ');
            return (key + ' ' + JSON.stringify(entry) + ' ' + bindings).toLowerCase().indexOf(query) >= 0;
        }).sort();
        keys.forEach(key => { const option = element('option', key); option.value = key; this.$layoutList.appendChild(option); });
        if (keys.indexOf(this._layout) < 0) this._layout = keys[0] || '';
        this.$layoutList.value = this._layout; this._renderLayout();
    },
    _renderLayout() {
        const record = (this._catalog.labelStyles || {})[this._layout];
        const entry = this._catalog.entries[this._layout] || {};
        this.$layoutTitle.textContent = this._layout || 'No matching layouts';
        this.$layoutContext.textContent = entry.context || '';
        const value = { labelStyles: record || {} };
        ['nodeStyles','nodePathStyles'].forEach(section => { value[section] = Object.keys(this._catalog[section] || {}).filter(id => this._catalog[section][id] === this._layout); });
        this.$layoutJson.value = record ? JSON.stringify(value, null, 2) : '';
        this.$layoutApply.disabled = !record;
    },
    _applyLayout() {
        if (!this._layout) return;
        try {
            const input = JSON.parse(this.$layoutJson.value), next = Catalog.clone(this._catalog);
            next.labelStyles[this._layout] = input.labelStyles;
            ['nodeStyles','nodePathStyles'].forEach(section => {
                if (!Array.isArray(input[section]) || input[section].some(id => typeof id !== 'string' || !id || ['__proto__','constructor','prototype'].indexOf(id) >= 0)) throw new Error(section + ' must be an array of node identifiers.');
                const existing = Object.keys(next[section] || {}).filter(id => next[section][id] === this._layout);
                const requested = Array.from(new Set(input[section]));
                if (existing.length === requested.length && requested.every(id => existing.indexOf(id) >= 0)) return;
                next[section] = next[section] || {};
                Object.keys(next[section]).forEach(id => { if (next[section][id] === this._layout) delete next[section][id]; });
                input[section].forEach(id => {
                    if (next[section][id] && next[section][id] !== this._layout) throw new Error('Binding already belongs to ' + next[section][id] + ': ' + id);
                    next[section][id] = this._layout;
                });
            });
            Catalog.structure(next);
            if (JSONDocument.equal(next, this._catalog)) return;
            this._catalog = next; this._renderLayout(); this._changed();
        } catch (err) { this._status('Label layout: ' + err.message, true); }
    },
    _addLayout() {
        if (!this._catalog) return;
        const key = this.$keyName.value.trim();
        if (!Catalog.safeKey(key) || !Object.prototype.hasOwnProperty.call(this._catalog.entries, key)) { this._status('Enter an existing translation key in the New key field above.', true); return; }
        this._catalog.labelStyles = this._catalog.labelStyles || {};
        const exists = Object.prototype.hasOwnProperty.call(this._catalog.labelStyles, key);
        if (!exists) this._catalog.labelStyles[key] = {};
        this._layout = key; this.$search.value = ''; this._renderLayoutList();
        if (!exists) this._changed();
    }
});
