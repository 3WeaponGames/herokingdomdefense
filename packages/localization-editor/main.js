'use strict';
const fs = require('fs');
const path = require('path');
const Catalog = require('./lib/catalog');
const Art = require('./lib/art-compiler');
const relativePath = 'assets/resources/localization/catalog.json';
function projectPath() {
    const root = Editor.Project && Editor.Project.path || Editor.projectPath;
    if (!root) throw new Error('Open a Cocos project first.');
    return root;
}
function read() {
    const file = path.join(projectPath(), relativePath);
    const text = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
    const catalog = Catalog.structure(JSON.parse(text));
    return { catalog, revision: Catalog.revision(text), file, issues: Catalog.validate(catalog) };
}
function backupAndSave(catalog, revision) {
    Catalog.structure(catalog);
    const current = read();
    if (current.revision !== revision) throw new Error('The catalog changed on disk. Reload it before saving to avoid overwriting another edit. Export your edits to CSV first if needed.');
    const root = projectPath();
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupDir = path.join(root, 'local', 'localization-backups');
    fs.mkdirSync(backupDir, { recursive: true });
    const backup = path.join(backupDir, stamp + '-catalog.json');
    fs.copyFileSync(current.file, backup);
    const text = JSON.stringify(catalog, null, 2) + '\n';
    const temporary = current.file + '.tmp';
    try {
        fs.writeFileSync(temporary, text, 'utf8');
        fs.renameSync(temporary, current.file);
    } catch (err) {
        if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
        throw err;
    }
    return { revision: Catalog.revision(text), backup, issues: Catalog.validate(catalog) };
}
function reply(event, operation) {
    try { event.reply(null, operation()); }
    catch (error) { event.reply(error.message || String(error)); }
}
let buildQueue = Promise.resolve();
function compile(catalog) {
    const task = buildQueue.catch(() => {}).then(() => Art.compile(catalog, projectPath()));
    buildQueue = task;
    return task;
}
function refresh(callback) {
    Editor.assetdb.refresh('db://assets/resources/localization', callback);
}
module.exports = {
    load() {}, unload() {},
    messages: {
        open() { Editor.Panel.open('localization-editor'); },
        load(event) { reply(event, read); },
        async save(event, catalog, revision) {
            let result;
            try { result = backupAndSave(catalog, revision); }
            catch (error) { event.reply(error.message || String(error)); return; }
            try { result.artwork = await compile(catalog); }
            catch (error) { result.warning = 'Catalog saved, but artwork could not be rebuilt: ' + error.message; }
            refresh(error => {
                if (error) result.warning = 'File saved, but asset refresh failed: ' + error.message;
                event.reply(null, result);
            });
        },
        async compile(event) {
            try {
                const result = await compile(read().catalog);
                refresh(error => error ? event.reply(error.message || String(error)) : event.reply(null, result));
            } catch (error) { event.reply(error.message || String(error)); }
        },
        validate() {
            try {
                const result = read();
                if (!result.issues.length) Editor.log('[Localization] All ' + Object.keys(result.catalog.entries).length + ' entries pass validation.');
                else {
                    result.issues.slice(0, 100).forEach(issue => Editor.warn('[Localization] ' + issue.key + ' [' + (issue.language || 'artwork') + '] ' + issue.message));
                    Editor.warn('[Localization] ' + result.issues.length + ' issues. Open Localization > Translation Tables to review.');
                }
            } catch (error) { Editor.error('[Localization] ' + error.message); }
        }
    },
    // Exposed for local validation without starting the editor.
    _read: read,
    _backupAndSave: backupAndSave
};
