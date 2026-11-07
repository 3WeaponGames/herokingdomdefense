'use strict';
const fs = require('fs');
const path = require('path');
const url = require('url');
const crypto = require('crypto');
const Catalog = require('./catalog');
const JSONDocument = require('../../game-data-editor/lib/json-document');
function localAsset(root, relative, extensions) {
    if (typeof relative !== 'string' || !/^assets[\\/]/.test(relative)) throw new Error('Artwork sources must be project assets: ' + relative);
    const assets = fs.realpathSync(path.join(root, 'assets'));
    const file = fs.realpathSync(path.resolve(root, relative));
    const relation = path.relative(assets, file);
    if (relation.startsWith('..') || path.isAbsolute(relation) || extensions.indexOf(path.extname(file).toLowerCase()) < 0) throw new Error('Unsupported artwork source: ' + relative);
    return file;
}
function dataURL(file, bytes) {
    const types = { '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.webp':'image/webp', '.ttf':'font/ttf', '.otf':'font/otf', '.woff':'font/woff', '.woff2':'font/woff2' };
    return 'data:' + types[path.extname(file).toLowerCase()] + ';base64,' + (bytes || fs.readFileSync(file)).toString('base64');
}
function prepare(catalog, root, readAsset) {
    Catalog.structure(catalog);
    const asset = (relative, extensions) => {
        const file = localAsset(root, relative, extensions);
        return readAsset ? readAsset(file, relative, extensions) : dataURL(file);
    };
    const templates = Catalog.clone(catalog.artTemplates || {}), fonts = {}, pending = [];
    Object.keys(templates).forEach(id => {
        if (templates[id].pending !== undefined && typeof templates[id].pending !== 'boolean') throw new Error(id + ': pending must be true or false.');
        if (templates[id].pending) { pending.push(id); delete templates[id]; }
    });
    Object.keys(templates).forEach(id => {
        if (!Catalog.safeKey(id)) throw new Error('Invalid artwork template ID: ' + id);
        const template = templates[id];
        ['width','height'].forEach(field => {
            if (!Number.isInteger(template[field]) || template[field] < 1 || template[field] > 8192) throw new Error(id + ': ' + field + ' must be 1–8192 pixels.');
        });
        if (!Array.isArray(template.regions)) throw new Error(id + ': regions must be an array.');
        if (template.languages && (!Array.isArray(template.languages) || template.languages.some(code => !catalog.languages.some(language => language.code === code)))) throw new Error(id + ': unknown template language.');
        if (template.source) template.sourceData = asset(template.source, ['.png','.jpg','.jpeg','.webp']);
        template.regions.forEach(region => {
            if (!region || !Catalog.safeKey(region.key) || !catalog.entries[region.key]) throw new Error(id + ': unknown text key.');
            if (!region.rect || ['x','y','width','height'].some(field => !Number.isFinite(region.rect[field])) || region.rect.width <= 0 || region.rect.height <= 0) throw new Error(id + ': invalid text rectangle.');
            if (region.rect.width > 8192 || region.rect.height > 8192) throw new Error(id + ': text rectangle is too large.');
            if (region.quad && (!Array.isArray(region.quad) || region.quad.length !== 4 || region.quad.some(point => !Number.isFinite(point.x) || !Number.isFinite(point.y)))) throw new Error(id + ': quad needs four {x,y} points, clockwise from top left.');
            if (region.clip && (!Array.isArray(region.clip) || region.clip.length < 3 || region.clip.some(point => !Number.isFinite(point.x) || !Number.isFinite(point.y)))) throw new Error(id + ': clip needs at least three {x,y} points.');
            [region].concat(Object.keys(region.locales || {}).map(code => region.locales[code])).forEach(style => {
                if (style.font && !fonts[style.font]) fonts[style.font] = asset(style.font, ['.ttf','.otf','.woff','.woff2']);
                ['fontSize','minFontSize','outlineWidth','padding','lineHeightRatio'].forEach(field => {
                    if (style[field] !== undefined && (!Number.isFinite(style[field]) || style[field] < 0)) throw new Error(id + ': ' + field + ' must be a finite non-negative number.');
                });
            });
        });
    });
    return { catalog, templates, fonts, pending };
}
const read = file => fs.existsSync(file) ? fs.readFileSync(file) : null;
const same = (a, b) => a === null || b === null ? a === b : a.equals(b);
function outputPath(root, locale, template) {
    const assets = fs.realpathSync(path.join(root, 'assets'));
    const target = path.join(assets, 'resources/localization/generated', locale, template + '.png');
    // A symlink in an output directory must not redirect project writes.
    let existing = target;
    while (!fs.existsSync(existing)) existing = path.dirname(existing);
    const relative = path.relative(assets, fs.realpathSync(existing));
    if (relative.startsWith('..') || path.isAbsolute(relative)) throw Error('Artwork output is outside project assets.');
    return target;
}
function commitOutputs(root, outputs, verify) {
    const changed = outputs.filter(output => output.changed);
    verify();
    if (!changed.length) return;
    const stamp = new Date().toISOString().replace(/[:.]/g, '-') + '-' + crypto.randomBytes(6).toString('hex');
    const backup = path.join(root, 'local/localization-backups/artwork', stamp);
    const hash = bytes => bytes === null ? null : crypto.createHash('sha256').update(bytes).digest('hex');
    const journal = { status: 'prepared', files: changed.map(output => ({ path: path.relative(root, output.path), before: hash(output.before), after: hash(output.bytes) })) };
    const committed = [], temporary = [];
    fs.mkdirSync(backup, { recursive: true });
    const journalFile = path.join(backup, 'transaction.json');
    try {
        for (const output of changed) {
            if (output.before !== null) {
                const original = path.join(backup, path.relative(root, output.path));
                fs.mkdirSync(path.dirname(original), { recursive: true });
                fs.writeFileSync(original, output.before, { flag: 'wx' });
            }
            fs.mkdirSync(path.dirname(output.path), { recursive: true });
            output.temporary = output.path + '.localization-art-' + stamp + '.tmp';
            temporary.push(output.temporary);
            fs.writeFileSync(output.temporary, output.bytes, { flag: 'wx' });
        }
        fs.writeFileSync(journalFile, JSON.stringify(journal, null, 2) + '\n', { flag: 'wx' });
        verify();
        for (const output of changed) {
            verify(committed);
            fs.renameSync(output.temporary, output.path);
            committed.push(output);
        }
        verify(committed);
        journal.status = 'committed';
        fs.writeFileSync(journalFile, JSON.stringify(journal, null, 2) + '\n');
    } catch (error) {
        const failures = [];
        for (const output of committed.reverse()) {
            try {
                outputPath(root, output.locale, output.template);
                if (!same(read(output.path), output.bytes)) throw Error('Output changed after this transaction wrote it: ' + output.path);
                if (output.before === null) fs.unlinkSync(output.path);
                else {
                    const restore = output.path + '.localization-art-' + stamp + '.restore';
                    temporary.push(restore);
                    fs.writeFileSync(restore, output.before, { flag: 'wx' });
                    if (!same(read(output.path), output.bytes)) throw Error('Output changed during rollback: ' + output.path);
                    fs.renameSync(restore, output.path);
                }
            } catch (rollback) { failures.push(rollback.message); }
        }
        journal.status = failures.length ? 'recovery-required' : 'rolled-back';
        journal.error = error.message;
        journal.recoveryErrors = failures;
        try { fs.writeFileSync(journalFile, JSON.stringify(journal, null, 2) + '\n'); } catch (journalError) { failures.push(journalError.message); }
        throw Error(error.message + ' Artwork backups: ' + backup + (failures.length ? ' (recovery required: ' + failures.join('; ') + ')' : ''));
    } finally {
        for (const file of temporary) if (fs.existsSync(file)) fs.unlinkSync(file);
    }
}
async function compile(catalog, root) {
    root = fs.realpathSync(path.resolve(root));
    catalog = Catalog.clone(catalog);
    const inputs = new Map(), sources = [];
    const request = prepare(catalog, root, (file, relative, extensions) => {
        const bytes = inputs.has(file) ? inputs.get(file) : fs.readFileSync(file);
        inputs.set(file, bytes);
        sources.push({ file, relative, extensions });
        return dataURL(file, bytes);
    });
    if (!Object.keys(request.templates).length) return { count: 0, outputs: [], metrics: [], pending: request.pending };
    const catalogFile = path.join(root, 'assets/resources/localization/catalog.json'), catalogBytes = fs.readFileSync(catalogFile);
    if (!JSONDocument.equal(JSON.parse(catalogBytes.toString('utf8').replace(/^\uFEFF/, '')), catalog)) throw Error('The catalog changed before artwork compilation. Reload and rebuild it.');
    inputs.set(catalogFile, catalogBytes);
    const expected = new Map();
    Object.keys(request.templates).forEach(template => {
        const definition = request.templates[template];
        (definition.languages || catalog.languages.map(language => language.code)).forEach(locale => {
            const key = locale + '/' + template;
            if (expected.has(key)) throw Error('Duplicate artwork output: ' + key);
            const target = outputPath(root, locale, template);
            expected.set(key, { template, locale, path: target, before: read(target), width: definition.width, height: definition.height });
        });
    });
    function verify(committed = []) {
        for (const [file, bytes] of inputs) if (!same(read(file), bytes)) throw Error('Artwork input changed while rendering: ' + file);
        for (const source of sources) if (localAsset(root, source.relative, source.extensions) !== source.file) throw Error('Artwork source changed while rendering: ' + source.relative);
        for (const output of expected.values()) {
            outputPath(root, output.locale, output.template);
            const written = committed.find(item => item.path === output.path);
            if (!same(read(output.path), written ? written.bytes : output.before)) throw Error('Artwork output changed while rendering: ' + output.path);
        }
    }
    const BrowserWindow = require('electron').BrowserWindow;
    const window = new BrowserWindow({ show: false, width: 64, height: 64, webPreferences: { nodeIntegration: false, contextIsolation: true, webSecurity: true } });
    let timer;
    try {
        window.webContents.setAudioMuted(true);
        await new Promise((resolve, reject) => {
            timer = setTimeout(() => reject(new Error('Artwork renderer did not finish loading.')), 30000);
            window.webContents.once('did-finish-load', resolve);
            window.webContents.once('did-fail-load', (_, code, message) => reject(new Error('Artwork renderer load failed: ' + code + ' ' + message)));
            window.loadURL(url.pathToFileURL(path.join(__dirname, 'art-renderer.html')).href);
        });
        clearTimeout(timer);
        const script = 'window.LocalizationArtRenderer.compile(' + JSON.stringify(request).replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029') + ')';
        const result = await window.webContents.executeJavaScript(script);
        if (!result || !Array.isArray(result.outputs)) throw Error('Artwork renderer returned no outputs.');
        const seen = new Set();
        const outputs = result.outputs.map(output => {
            const key = output.locale + '/' + output.template, saved = expected.get(key);
            if (!saved || seen.has(key)) throw Error('Unexpected or duplicate renderer output: ' + key);
            seen.add(key);
            const bytes = Buffer.from(output.data, 'base64');
            if (bytes.length < 24 || bytes.slice(0,8).toString('hex') !== '89504e470d0a1a0a' || bytes.toString('ascii',12,16) !== 'IHDR' ||
                bytes.readUInt32BE(16) !== saved.width || bytes.readUInt32BE(20) !== saved.height || output.width !== saved.width || output.height !== saved.height) throw Error('Renderer output has invalid PNG dimensions.');
            return Object.assign({}, saved, { bytes, changed: !same(saved.before, bytes), resource: 'localization/generated/' + output.locale + '/' + output.template });
        });
        if (seen.size !== expected.size) throw Error('Artwork renderer omitted expected outputs.');
        commitOutputs(root, outputs, verify);
        return { count: outputs.length, outputs: outputs.map(output => ({ template: output.template, locale: output.locale, path: output.path, resource: output.resource, width: output.width, height: output.height, changed: output.changed })), metrics: result.metrics, pending: request.pending };
    } finally { clearTimeout(timer); if (!window.isDestroyed()) window.destroy(); }
}
module.exports = { prepare, compile };
